import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { askGuide } from "@/lib/ai.functions";
import {
  api,
  dataUrlToBlob,
  lastSeenText,
  remoteEnabled,
  setToken,
  toChat,
  toStories,
  type ServerUser,
} from "@/lib/api";
import { orderedStories, uid } from "@/lib/format";
import { replyFor, seedChats, seedNotes, seedStories } from "@/lib/seed";
import type {
  CallMode,
  Chat,
  ChatMedia,
  Message,
  Note,
  Profile,
  SectionName,
  SheetName,
  Story,
} from "@/lib/types";

type MediaView = { src: string; caption: string } | null;

type NaraData = {
  profile: Profile | null;
  chats: Chat[];
  stories: Story[];
  notes: Note[];
  vaultPin: string | null;
  vaultUnlocked: boolean;
  section: SectionName;
  pane: "list" | "main";
  activeChatId: string | null;
  activeNoteId: string | null;
  query: string;
  noteQuery: string;
  replyToId: string | null;
  typingChatId: string | null;
  aiPending: boolean;
  sheet: SheetName;
  call: null | {
    chatId: string;
    mode: CallMode;
    incoming: boolean;
    phase: "ringing" | "live";
    startedAt: number | null;
  };
  media: MediaView;
  story: null | { id: string; slide: number };
  composing: boolean;
  epoch: number;
};

type SendPayload = { text: string; media?: ChatMedia; replyTo?: string };

type Actions = {
  completeLogin: (email: string, name: string) => void;
  signOut: () => void;
  updateProfile: (partial: Partial<Profile>) => void;
  setSection: (section: SectionName) => void;
  setPane: (pane: "list" | "main") => void;
  setQuery: (query: string) => void;
  setNoteQuery: (noteQuery: string) => void;
  openChat: (id: string) => void;
  markRead: (id: string) => void;
  backToList: () => void;
  sendMessage: (chatId: string, payload: SendPayload) => void;
  setReply: (id: string | null) => void;
  togglePin: (id: string) => void;
  toggleMute: (id: string) => void;
  setSheet: (sheet: SheetName) => void;
  openMedia: (media: MediaView) => void;
  closeMedia: () => void;
  openStory: (id: string) => void;
  closeStory: () => void;
  stepStory: (dir: 1 | -1) => void;
  setComposing: (composing: boolean) => void;
  postStatus: (caption: string, image?: string) => void;
  selectNote: (id: string) => void;
  saveNote: (id: string, partial: Partial<Pick<Note, "title" | "body">>) => void;
  createNote: () => void;
  deleteNote: (id: string) => void;
  toggleNotePin: (id: string) => void;
  setVaultPin: (pin: string) => void;
  unlockVault: (pin: string) => boolean;
  lockVault: () => void;
  resetVaultPin: () => void;
  startCall: (chatId: string, mode: CallMode, incoming?: boolean) => void;
  acceptCall: () => void;
  endCall: () => void;
  // --- remote (Cloudflare backend) ---
  loginRemote: (user: ServerUser) => void;
  setRemoteChats: (chats: Chat[]) => void;
  upsertRemoteChat: (chat: Chat) => void;
  setRemoteStories: (stories: Story[]) => void;
  receiveMessage: (chatId: string, message: Message) => void;
  setMessageStatus: (chatId: string, ids: string[], status: Message["status"]) => void;
  setPresence: (userId: string, online: boolean, lastSeen: number) => void;
  setPresenceSnapshot: (onlineIds: string[]) => void;
  setTyping: (chatId: string | null) => void;
};

export type NaraStore = NaraData & Actions;

function mapChat(chats: Chat[], id: string, fn: (chat: Chat) => Chat) {
  return chats.map((chat) => (chat.id === id ? fn(chat) : chat));
}

function viewing(get: () => NaraStore, chatId: string) {
  const s = get();
  if (s.section !== "chats" || s.activeChatId !== chatId) return false;
  if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) return true;
  return s.pane === "main";
}

function turnText(m: Message) {
  const bits = [m.text.trim()];
  if (m.media?.kind === "image") bits.push("(photo)");
  if (m.media?.kind === "voice") bits.push("(voice note)");
  if (m.media?.kind === "file") bits.push(`(file ${m.media.name ?? ""})`.trim());
  return bits.filter(Boolean).join(" ").slice(0, 2000);
}

function slimChats(chats: Chat[]): Chat[] {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.slice(-80).map((m) => {
      if (!m.media?.src) return m;
      if (m.media.kind === "voice" || m.media.src.length > 140_000) {
        return { ...m, media: { ...m.media, src: undefined } };
      }
      return m;
    }),
  }));
}

const storage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    const memory = new Map<string, string>();
    return {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
  }
  return {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        try {
          const parsed = JSON.parse(value) as { state?: { chats?: Chat[] } };
          if (parsed.state?.chats) {
            parsed.state.chats = parsed.state.chats.map((chat) => ({
              ...chat,
              messages: chat.messages.map((m) =>
                m.media?.src ? { ...m, media: { ...m.media, src: undefined } } : m,
              ),
            }));
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch {
          /* keep the in-memory session */
        }
      }
    },
    removeItem: (key: string) => localStorage.removeItem(key),
  };
});

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const p = value as Profile;
  return typeof p.email === "string" && typeof p.name === "string";
}

const initialChats = remoteEnabled ? seedChats.filter((c) => c.isAi) : seedChats;
const initialStories = remoteEnabled ? seedStories.filter((st) => st.mine) : seedStories;
const STATUS_RANK = { sent: 0, delivered: 1, read: 2 } as const;

export const useNara = create<NaraStore>()(
  persist(
    (set, get) => ({
      profile: null,
      chats: initialChats,
      stories: initialStories,
      notes: seedNotes,
      vaultPin: null,
      vaultUnlocked: false,
      section: "chats",
      pane: "list",
      activeChatId: null,
      activeNoteId: seedNotes[0]?.id ?? null,
      query: "",
      noteQuery: "",
      replyToId: null,
      typingChatId: null,
      aiPending: false,
      sheet: null,
      call: null,
      media: null,
      story: null,
      composing: false,
      epoch: 0,

      completeLogin: (email, name) =>
        set({
          profile: {
            email,
            name: name.trim().slice(0, 40) || "You",
            about: "Available",
            theme: "dusk",
            enterToSend: true,
            readReceipts: true,
          },
          section: "chats",
          pane: "list",
        }),

      signOut: () => {
        if (remoteEnabled) {
          void api
            .logout()
            .catch(() => undefined)
            .finally(() => setToken(null));
        }
        set((s) => ({
          chats: remoteEnabled ? s.chats.filter((c) => c.isAi) : s.chats,
          stories: remoteEnabled ? initialStories : s.stories,
          profile: null,
          vaultUnlocked: false,
          sheet: null,
          call: null,
          media: null,
          story: null,
          composing: false,
          section: "chats",
          pane: "list",
          replyToId: null,
          typingChatId: null,
          aiPending: false,
          epoch: s.epoch + 1,
        }));
      },

      updateProfile: (partial) =>
        set((s) => ({ profile: s.profile ? { ...s.profile, ...partial } : s.profile })),

      setSection: (section) =>
        set({
          section,
          pane: section === "vault" ? "main" : "list",
          sheet: null,
        }),

      setPane: (pane) => set({ pane }),
      setQuery: (query) => set({ query }),
      setNoteQuery: (noteQuery) => set({ noteQuery }),

      openChat: (id) => {
        if (remoteEnabled && id !== "guide" && get().chats.some((c) => c.id === id && !c.isAi)) {
          void api.markRead(id).catch(() => undefined);
        }
        set((s) => ({
          section: "chats",
          pane: "main",
          activeChatId: id,
          replyToId: null,
          sheet: null,
          chats: mapChat(s.chats, id, (c) => ({ ...c, lastReadAt: Date.now() })),
        }));
      },

      markRead: (id) => {
        const chat = get().chats.find((c) => c.id === id);
        const last = chat?.lastReadAt ?? 0;
        const unread = Boolean(chat?.messages.some((m) => m.from === "them" && m.time > last));
        if (remoteEnabled && chat && !chat.isAi && unread) void api.markRead(id).catch(() => undefined);
        set((s) => ({
          chats: mapChat(s.chats, id, (c) => ({ ...c, lastReadAt: Date.now() })),
        }));
      },

      backToList: () => set({ pane: "list", replyToId: null }),

      setReply: (id) => set({ replyToId: id }),

      togglePin: (id) => {
        const chat = get().chats.find((c) => c.id === id);
        if (remoteEnabled && chat && !chat.isAi) {
          void api.updateChat(id, { pinned: !chat.pinned }).catch(() => undefined);
        }
        set((s) => ({
          chats: mapChat(s.chats, id, (c) => ({ ...c, pinned: !c.pinned })),
        }));
      },

      toggleMute: (id) => {
        const chat = get().chats.find((c) => c.id === id);
        if (remoteEnabled && chat && !chat.isAi) {
          void api.updateChat(id, { muted: !chat.muted }).catch(() => undefined);
        }
        set((s) => ({
          chats: mapChat(s.chats, id, (c) => ({ ...c, muted: !c.muted })),
        }));
      },

      setSheet: (sheet) => set({ sheet }),
      openMedia: (media) => set({ media }),
      closeMedia: () => set({ media: null }),
      setComposing: (composing) => set({ composing }),

      openStory: (id) => {
        const story = get().stories.find((item) => item.id === id);
        if (!story || story.slides.length === 0) {
          set({ composing: true });
          return;
        }
        set((s) => ({
          story: { id, slide: 0 },
          stories: s.stories.map((item) =>
            item.id === id && !item.mine ? { ...item, seen: true } : item,
          ),
        }));
      },

      closeStory: () => set({ story: null }),

      stepStory: (dir) => {
        const current = get().story;
        if (!current) return;
        const stories = orderedStories(get().stories).filter((item) => item.slides.length > 0);
        const index = stories.findIndex((item) => item.id === current.id);
        const story = stories[index];
        if (!story) return set({ story: null });
        const slide = current.slide + dir;
        if (slide >= 0 && slide < story.slides.length) {
          set({ story: { id: story.id, slide } });
          return;
        }
        const nextIndex = index + dir;
        const next = stories[nextIndex];
        if (!next) return set({ story: null });
        set((s) => ({
          story: { id: next.id, slide: dir === 1 ? 0 : next.slides.length - 1 },
          stories: s.stories.map((item) =>
            item.id === next.id && !item.mine ? { ...item, seen: true } : item,
          ),
        }));
      },

      postStatus: (caption, image) => {
        if (remoteEnabled) {
          set({ composing: false });
          void postRemoteStory(caption.trim(), image);
          return;
        }
        set((s) => ({
          composing: false,
          stories: s.stories.map((story) =>
            story.mine
              ? {
                  ...story,
                  slides: [
                    ...story.slides,
                    { id: uid(), image, caption: caption.trim(), time: Date.now() },
                  ],
                }
              : story,
          ),
        }));
      },

      selectNote: (id) => set({ activeNoteId: id, pane: "main", section: "vault" }),

      saveNote: (id, partial) =>
        set((s) => ({
          notes: s.notes.map((note) =>
            note.id === id ? { ...note, ...partial, updated: Date.now() } : note,
          ),
        })),

      createNote: () => {
        const note: Note = {
          id: uid(),
          title: "",
          body: "",
          updated: Date.now(),
          pinned: false,
        };
        set((s) => ({
          notes: [note, ...s.notes],
          activeNoteId: note.id,
          pane: "main",
          section: "vault",
        }));
      },

      deleteNote: (id) =>
        set((s) => {
          const notes = s.notes.filter((note) => note.id !== id);
          return {
            notes,
            activeNoteId: s.activeNoteId === id ? (notes[0]?.id ?? null) : s.activeNoteId,
          };
        }),

      toggleNotePin: (id) =>
        set((s) => ({
          notes: s.notes.map((note) => (note.id === id ? { ...note, pinned: !note.pinned } : note)),
        })),

      setVaultPin: (pin) => set({ vaultPin: pin, vaultUnlocked: true }),

      unlockVault: (pin) => {
        if (get().vaultPin !== pin) return false;
        set({ vaultUnlocked: true, pane: "main" });
        return true;
      },

      lockVault: () => set({ vaultUnlocked: false }),
      resetVaultPin: () => set({ vaultPin: null, vaultUnlocked: false }),

      startCall: (chatId, mode, incoming = false) =>
        set({
          call: { chatId, mode, incoming, phase: "ringing", startedAt: null },
          story: null,
          sheet: null,
          media: null,
          composing: false,
        }),

      acceptCall: () =>
        set((s) =>
          s.call ? { call: { ...s.call, phase: "live", incoming: false, startedAt: Date.now() } } : s,
        ),

      endCall: () => set({ call: null }),

      sendMessage: (chatId, payload) => {
        const text = payload.text.trim();
        if (!text && !payload.media) return;
        const chat = get().chats.find((item) => item.id === chatId);
        if (!chat) return;
        const receipts = get().profile?.readReceipts !== false;
        const remoteChat = remoteEnabled && !chat.isAi;
        const message: Message = {
          id: remoteChat ? `tmp-${uid()}` : uid(),
          chatId,
          from: "me",
          text,
          time: Date.now(),
          status: "sent",
          media: payload.media,
          replyTo: payload.replyTo,
        };
        const epoch = get().epoch;
        set((s) => ({
          replyToId: null,
          chats: mapChat(s.chats, chatId, (c) => ({ ...c, messages: [...c.messages, message] })),
        }));
        if (remoteChat) {
          void sendRemote(chatId, message, payload);
          return;
        }
        window.setTimeout(() => {
          if (get().epoch !== epoch) return;
          set((s) => ({
            chats: mapChat(s.chats, chatId, (c) => ({
              ...c,
              messages: c.messages.map((item) =>
                item.id === message.id ? { ...item, status: "delivered" } : item,
              ),
            })),
          }));
        }, 420);

        if (chat.isAi) {
          void completeAi(chatId, epoch);
          return;
        }

        const wait = 1000 + (text.length % 7) * 140;
        set({ typingChatId: chatId });
        window.setTimeout(() => {
          if (get().epoch !== epoch) return;
          const replyBody = replyFor(chat, text, Boolean(payload.media));
          const open = viewing(get, chatId);
          const reply: Message = {
            id: uid(),
            chatId,
            from: "them",
            author: replyBody.author,
            text: replyBody.text,
            time: Date.now(),
            status: "read",
          };
          set((s) => ({
            typingChatId: s.typingChatId === chatId ? null : s.typingChatId,
            chats: mapChat(s.chats, chatId, (c) => ({
              ...c,
              lastReadAt: open ? Date.now() : c.lastReadAt,
              messages: [
                ...c.messages.map((item) => {
                  if (item.id !== message.id) return item;
                  const status: Message["status"] = open && receipts ? "read" : "delivered";
                  return { ...item, status };
                }),
                reply,
              ],
            })),
          }));
        }, wait);
      },

      loginRemote: (user) =>
        set((s) => ({
          profile: {
            email: user.email ?? "",
            name: user.name,
            about: user.about || "Available",
            theme: s.profile?.theme ?? "dusk",
            enterToSend: true,
            readReceipts: user.readReceipts !== false,
            username: user.username,
            userId: user.id,
            phone: user.phone ?? null,
            phoneVerified: Boolean(user.phoneVerified),
          },
          section: "chats",
          pane: "list",
        })),

      setRemoteChats: (chats) => set((s) => ({ chats: [...s.chats.filter((c) => c.isAi), ...chats] })),

      upsertRemoteChat: (chat) =>
        set((s) =>
          s.chats.some((c) => c.id === chat.id)
            ? { chats: s.chats.map((c) => (c.id === chat.id ? { ...chat, messages: c.messages.length ? c.messages : chat.messages } : c)) }
            : { chats: [...s.chats, chat] },
        ),

      setRemoteStories: (stories) => set({ stories }),

      receiveMessage: (chatId, m) =>
        set((s) => {
          const chat = s.chats.find((c) => c.id === chatId);
          if (!chat || chat.messages.some((x) => x.id === m.id)) return s;
          // echo of a message this device is still sending
          if (m.from === "me" && chat.messages.some((x) => x.id.startsWith("tmp-") && x.text === m.text)) return s;
          const open =
            m.from === "them" && viewing(get, chatId) && document.visibilityState === "visible";
          return {
            typingChatId: s.typingChatId === chatId ? null : s.typingChatId,
            chats: mapChat(s.chats, chatId, (c) => ({
              ...c,
              lastReadAt: open ? Date.now() : c.lastReadAt,
              messages: [...c.messages, m],
            })),
          };
        }),

      setMessageStatus: (chatId, ids, status) =>
        set((s) => ({
          chats: mapChat(s.chats, chatId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              ids.includes(m.id) && STATUS_RANK[status] > STATUS_RANK[m.status] ? { ...m, status } : m,
            ),
          })),
        })),

      setPresence: (userId, online, lastSeen) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.peerId === userId
              ? { ...c, online, lastSeen: online ? "online" : lastSeenText(lastSeen) }
              : c,
          ),
        })),

      setPresenceSnapshot: (onlineIds) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.peerId
              ? { ...c, online: onlineIds.includes(c.peerId), lastSeen: onlineIds.includes(c.peerId) ? "online" : c.lastSeen }
              : c,
          ),
        })),

      setTyping: (chatId) => set({ typingChatId: chatId }),
    }),
    {
      name: "nara-v1",
      storage,
      partialize: (state) => ({
        profile: state.profile,
        chats: slimChats(state.chats),
        stories: state.stories.map((story) => ({
          ...story,
          slides: story.slides.map((slide) =>
            slide.image && slide.image.startsWith("data:") && slide.image.length > 140_000
              ? { ...slide, image: undefined }
              : slide,
          ),
        })),
        notes: state.notes,
        vaultPin: state.vaultPin,
        section: state.section,
        activeChatId: state.activeChatId,
        activeNoteId: state.activeNoteId,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NaraData>;
        const profile: Profile | null = isProfile(saved.profile) && (!remoteEnabled || saved.profile.userId)
          ? {
              email: saved.profile.email,
              name: saved.profile.name,
              about: saved.profile.about || "Available",
              theme: saved.profile.theme === "paper" ? "paper" : "dusk",
              enterToSend: saved.profile.enterToSend !== false,
              readReceipts: saved.profile.readReceipts !== false,
              username: saved.profile.username,
              userId: saved.profile.userId,
              phone: saved.profile.phone ?? null,
              phoneVerified: Boolean(saved.profile.phoneVerified),
            }
          : null;
        const savedChats = Array.isArray(saved.chats)
          ? remoteEnabled
            ? saved.chats.filter((c) => c.isAi || c.peerId)
            : saved.chats
          : [];
        return {
          ...current,
          profile,
          chats: savedChats.length ? savedChats : current.chats,
          stories:
            !remoteEnabled && Array.isArray(saved.stories) && saved.stories.length
              ? saved.stories
              : current.stories,
          notes: Array.isArray(saved.notes) ? saved.notes : current.notes,
          vaultPin: typeof saved.vaultPin === "string" ? saved.vaultPin : null,
          vaultUnlocked: false,
          section: saved.section === "vault" ? "vault" : "chats",
          pane: "list",
          activeChatId: typeof saved.activeChatId === "string" ? saved.activeChatId : null,
          activeNoteId: typeof saved.activeNoteId === "string" ? saved.activeNoteId : current.activeNoteId,
          sheet: null,
          call: null,
          story: null,
          media: null,
          composing: false,
          typingChatId: null,
          aiPending: false,
          replyToId: null,
          query: "",
          noteQuery: "",
        };
      },
    },
  ),
);

async function completeAi(chatId: string, epoch: number) {
  const store = useNara.getState();
  if (store.aiPending) return;
  const history = store.chats.find((chat) => chat.id === chatId)?.messages ?? [];
  const messages = history
    .filter((m) => !m.system)
    .map((m) => ({
      role: m.from === "me" ? ("user" as const) : ("assistant" as const),
      content: turnText(m),
    }))
    .filter((m) => m.content)
    .slice(-12);
  if (!messages.length || messages[messages.length - 1]?.role !== "user") return;
  useNara.setState({ aiPending: true, typingChatId: chatId });
  let text = "";
  let ok = false;
  try {
    const result = await askGuide({ data: { messages } });
    ok = result.ok;
    text = result.ok ? result.text : result.error;
  } catch {
    text = "Nara Guide could not be reached.";
  }
  if (useNara.getState().epoch !== epoch) return;
  const open = viewing(useNara.getState, chatId);
  const message: Message = {
    id: uid(),
    chatId,
    from: "them",
    text: text.trim().slice(0, 4000) || "I don't have a reply for that.",
    time: Date.now(),
    status: "read",
    system: !ok,
  };
  useNara.setState((s) => ({
    aiPending: false,
    typingChatId: s.typingChatId === chatId ? null : s.typingChatId,
    chats: mapChat(s.chats, chatId, (c) => ({
      ...c,
      lastReadAt: open ? Date.now() : c.lastReadAt,
      messages: [...c.messages, message],
    })),
  }));
}

/* ---------- remote (Cloudflare backend) helpers ---------- */

export async function refreshChats() {
  const me = useNara.getState().profile?.userId;
  if (!me) return;
  const { chats } = await api.chats();
  useNara.getState().setRemoteChats(chats.map((c) => toChat(c, me)));
}

export async function refreshStories() {
  if (!useNara.getState().profile?.userId) return;
  const { stories } = await api.stories();
  useNara.getState().setRemoteStories(toStories(stories, useNara.getState().chats));
}

async function postRemoteStory(caption: string, image?: string) {
  try {
    let mediaKey: string | undefined;
    if (image?.startsWith("data:")) mediaKey = (await api.upload(dataUrlToBlob(image))).key;
    await api.createStory({ caption, mediaKey });
    await refreshStories();
  } catch {
    /* the composer already closed; the status simply does not appear */
  }
}

async function sendRemote(chatId: string, temp: Message, payload: SendPayload) {
  try {
    let mediaKey: string | undefined;
    const media = payload.media;
    if (media?.src?.startsWith("data:")) {
      mediaKey = (await api.upload(dataUrlToBlob(media.src), media.name)).key;
    }
    const { message } = await api.sendMessage(chatId, {
      text: temp.text,
      mediaKey,
      mediaKind: media?.kind,
      mediaName: media?.name,
      durationMs: media?.durationMs,
      replyTo: payload.replyTo && !payload.replyTo.startsWith("tmp-") ? payload.replyTo : undefined,
    });
    const real: Message = {
      id: message.id,
      chatId,
      from: "me",
      text: message.text,
      time: message.time,
      status: message.status,
      replyTo: message.replyTo,
      media: message.media ?? temp.media,
    };
    useNara.setState((s) => ({
      chats: mapChat(s.chats, chatId, (c) => {
        const without = c.messages.filter((m) => m.id !== temp.id);
        const known = without.some((m) => m.id === real.id);
        return { ...c, messages: known ? without : [...without, real].sort((a, b) => a.time - b.time) };
      }),
    }));
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Message not sent.";
    useNara.setState((s) => ({
      chats: mapChat(s.chats, chatId, (c) => ({
        ...c,
        messages: [
          ...c.messages.filter((m) => m.id !== temp.id),
          {
            id: `err-${temp.id}`,
            chatId,
            from: "them" as const,
            text: `Not sent: ${reason}`,
            time: Date.now(),
            status: "read" as const,
            system: true,
          },
        ],
      })),
    }));
  }
}
