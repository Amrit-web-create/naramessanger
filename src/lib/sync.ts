import {
  api,
  getToken,
  remoteEnabled,
  setUnauthorizedHandler,
  toChat,
  toMessage,
  type ServerChat,
  type ServerMessage,
} from "@/lib/api";
import { startRealtime, stopRealtime, type RealtimeEvent } from "@/lib/realtime";
import { refreshChats, refreshStories, useNara } from "@/lib/store";

let running = false;
let unsub: (() => void) | null = null;
let typingTimer: number | undefined;
const viewed = new Set<string>();

function meId() {
  return useNara.getState().profile?.userId ?? "";
}

function isViewing(chatId: string) {
  const s = useNara.getState();
  if (s.section !== "chats" || s.activeChatId !== chatId) return false;
  if (document.visibilityState !== "visible") return false;
  if (window.matchMedia("(min-width: 768px)").matches) return true;
  return s.pane === "main";
}

export function notificationsSupported() {
  return typeof Notification !== "undefined";
}

export async function enableNotifications() {
  if (!notificationsSupported()) return "unsupported" as const;
  return Notification.requestPermission();
}

function notify(title: string, body: string, chatId?: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag: chatId ?? title, icon: "/__grok/icon-180.png" });
    n.onclick = () => {
      window.focus();
      if (chatId) useNara.getState().openChat(chatId);
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

function previewOf(m: ServerMessage) {
  if (m.text) return m.text.slice(0, 120);
  if (m.media?.kind === "image") return "Photo";
  if (m.media?.kind === "voice") return "Voice note";
  return "Attachment";
}

function onEvent(e: RealtimeEvent) {
  const store = useNara.getState();
  const me = meId();
  switch (e.t) {
    case "open":
      void refreshChats().catch(() => undefined);
      void refreshStories().catch(() => undefined);
      break;
    case "presence_snapshot":
      store.setPresenceSnapshot((e.online as string[]) ?? []);
      break;
    case "presence":
      store.setPresence(e.userId as string, Boolean(e.online), Number(e.lastSeen) || 0);
      break;
    case "typing": {
      const chatId = e.chatId as string;
      store.setTyping(e.typing ? chatId : null);
      window.clearTimeout(typingTimer);
      if (e.typing) {
        typingTimer = window.setTimeout(() => useNara.getState().setTyping(null), 5000);
      }
      break;
    }
    case "message": {
      const sm = e.message as ServerMessage;
      const chatId = e.chatId as string;
      const known = store.chats.some((c) => c.id === chatId);
      if (!known) {
        void refreshChats().catch(() => undefined);
        break;
      }
      store.receiveMessage(chatId, toMessage(sm, me));
      if (sm.senderId !== me) {
        const chat = store.chats.find((c) => c.id === chatId);
        if (isViewing(chatId)) {
          void api.markRead(chatId).catch(() => undefined);
        } else if (chat && !chat.muted) {
          notify(chat.name, previewOf(sm), chatId);
        }
      }
      break;
    }
    case "msg_status":
      store.setMessageStatus(e.chatId as string, e.ids as string[], e.status as "delivered" | "read");
      break;
    case "chat": {
      const chat = toChat(e.chat as ServerChat, me);
      store.upsertRemoteChat(chat);
      break;
    }
    case "story":
      void refreshStories().catch(() => undefined);
      break;
    case "notification": {
      const n = e.notification as { type: string; data: { viewerName?: string } };
      if (n.type === "story_view") notify("Status viewed", `${n.data.viewerName ?? "Someone"} viewed your status`);
      break;
    }
  }
}

export function startSync() {
  if (!remoteEnabled || running || !getToken()) return;
  running = true;
  setUnauthorizedHandler(() => {
    useNara.getState().signOut();
  });
  startRealtime(onEvent);
  void refreshChats().catch(() => undefined);
  void refreshStories().catch(() => undefined);
  void api
    .me()
    .then(({ user }) => {
      if (user.id === meId()) useNara.getState().loginRemote(user);
    })
    .catch(() => undefined);

  let prev = useNara.getState();
  let patchTimer: number | undefined;
  unsub = useNara.subscribe((state) => {
    // 1) mark story slides as viewed when opened
    if (state.story && state.story !== prev.story) {
      const story = state.stories.find((s) => s.id === state.story!.id);
      const slide = story?.slides[state.story.slide];
      if (story && !story.mine && slide && !viewed.has(slide.id)) {
        viewed.add(slide.id);
        void api.viewStory(slide.id).catch(() => viewed.delete(slide.id));
      }
    }
    // 2) push profile edits (debounced)
    const a = prev.profile;
    const b = state.profile;
    if (a && b && (a.name !== b.name || a.about !== b.about || a.readReceipts !== b.readReceipts)) {
      window.clearTimeout(patchTimer);
      patchTimer = window.setTimeout(() => {
        const p = useNara.getState().profile;
        if (p && p.name.trim()) {
          void api.updateMe({ name: p.name.trim(), about: p.about, readReceipts: p.readReceipts }).catch(() => undefined);
        }
      }, 800);
    }
    // 3) signed out
    if (a && !b) stopSync();
    prev = state;
  });
}

export function stopSync() {
  if (!running) return;
  running = false;
  stopRealtime();
  setUnauthorizedHandler(null);
  unsub?.();
  unsub = null;
  window.clearTimeout(typingTimer);
  viewed.clear();
}
