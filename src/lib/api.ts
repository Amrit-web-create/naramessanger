import { format, isToday, isYesterday } from "date-fns";
import type { Chat, Message, Story } from "@/lib/types";

const RAW = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
export const API_URL = RAW.replace(/\/+$/, "");
/** true when the app is wired to the Cloudflare Worker backend */
export const remoteEnabled = API_URL.length > 0;

const TOKEN_KEY = "nara-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? "Something went wrong.");
  }
  return data as T;
}

const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });

/* ---------- server shapes ---------- */

export type ServerUser = {
  id: string;
  username: string;
  name: string;
  about: string;
  lastSeen: number;
  email?: string;
  phone?: string | null;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  readReceipts?: boolean;
};

export type ServerMessage = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  time: number;
  status: "sent" | "delivered" | "read";
  replyTo?: string;
  media?: { kind: "image" | "voice" | "file"; src: string; name?: string; durationMs?: number };
};

export type ServerChat = {
  id: string;
  peer: ServerUser & { online: boolean };
  pinned: boolean;
  muted: boolean;
  lastReadAt: number;
  messages: ServerMessage[];
};

export type ServerStoryGroup = {
  userId: string;
  username: string;
  name: string;
  mine: boolean;
  allSeen: boolean;
  slides: { id: string; image?: string; caption: string; time: number; seen: boolean; views?: number }[];
};

export type ServerNotification = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: number;
  readAt: number | null;
};

/* ---------- endpoints ---------- */

export const api = {
  checkUsername: (username: string) =>
    request<{ available: boolean }>(`/users/check?username=${encodeURIComponent(username)}`),
  register: (b: { username: string; email: string; name: string; phone?: string }) =>
    post<{ ok: true; devCode?: string }>("/auth/register", b),
  login: (identifier: string) => post<{ ok: true; devCode?: string }>("/auth/login", { identifier }),
  verify: (identifier: string, code: string, purpose: "verify" | "login") =>
    post<{ token: string; user: ServerUser }>("/auth/verify", { identifier, code, purpose }),
  logout: () => post<{ ok: true }>("/auth/logout"),
  me: () => request<{ user: ServerUser }>("/me"),
  updateMe: (b: { name?: string; about?: string; readReceipts?: boolean }) =>
    request<{ user: ServerUser }>("/me", { method: "PATCH", body: JSON.stringify(b) }),
  phoneSend: (phone: string) => post<{ ok: true; devCode?: string }>("/auth/phone/send", { phone }),
  phoneVerify: (code: string) => post<{ ok: true }>("/auth/phone/verify", { code }),
  searchUsers: (q: string) => request<{ users: ServerUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  chats: () => request<{ chats: ServerChat[] }>("/chats"),
  openChat: (userId: string) => post<{ chat: ServerChat }>("/chats", { userId }),
  updateChat: (id: string, b: { pinned?: boolean; muted?: boolean }) =>
    request<{ ok: true }>(`/chats/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  sendMessage: (
    chatId: string,
    b: {
      text: string;
      mediaKey?: string;
      mediaKind?: string;
      mediaName?: string;
      durationMs?: number;
      replyTo?: string;
    },
  ) => post<{ message: ServerMessage }>(`/chats/${chatId}/messages`, b),
  markRead: (chatId: string) => post<{ ok: true }>(`/chats/${chatId}/read`),
  upload: async (blob: Blob, name?: string) => {
    return request<{ key: string; url: string }>("/media", {
      method: "POST",
      body: blob,
      headers: { "content-type": blob.type || "application/octet-stream", "x-filename": name ?? "" },
    });
  },
  stories: () => request<{ stories: ServerStoryGroup[] }>("/stories"),
  createStory: (b: { caption: string; mediaKey?: string }) => post<{ ok: true }>("/stories", b),
  viewStory: (id: string) => post<{ ok: true }>(`/stories/${id}/view`),
  notifications: () => request<{ unread: number; notifications: ServerNotification[] }>("/notifications"),
  readNotifications: () => post<{ ok: true }>("/notifications/read"),
};

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ""] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "application/octet-stream";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------- mapping server data to UI types ---------- */

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "") : name.slice(0, 2);
  return (letters || "?").toUpperCase();
}

function toneOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 1 + (h % 4);
}

export function lastSeenText(ts: number) {
  if (!ts) return "offline";
  const d = new Date(ts);
  if (isToday(d)) return `last seen today at ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `last seen yesterday at ${format(d, "HH:mm")}`;
  return `last seen ${format(d, "d MMM")}`;
}

export function toMessage(m: ServerMessage, meId: string): Message {
  return {
    id: m.id,
    chatId: m.chatId,
    from: m.senderId === meId ? "me" : "them",
    text: m.text,
    time: m.time,
    status: m.status,
    replyTo: m.replyTo,
    media: m.media,
  };
}

export function toChat(c: ServerChat, meId: string): Chat {
  return {
    id: c.id,
    name: c.peer.name,
    about: c.peer.about,
    initials: initialsOf(c.peer.name),
    tone: toneOf(c.peer.id),
    online: c.peer.online,
    lastSeen: c.peer.online ? "online" : lastSeenText(c.peer.lastSeen),
    pinned: c.pinned,
    muted: c.muted,
    isAi: false,
    isGroup: false,
    lastReadAt: c.lastReadAt,
    messages: c.messages.map((m) => toMessage(m, meId)),
    peerId: c.peer.id,
    username: c.peer.username,
  };
}

export function toStories(groups: ServerStoryGroup[], chats: Chat[]): Story[] {
  const out: Story[] = groups
    .filter((g) => !g.mine)
    .map((g) => ({
      id: g.userId,
      authorId: chats.find((c) => c.peerId === g.userId)?.id ?? g.userId,
      name: g.name.split(" ")[0] ?? g.name,
      initials: initialsOf(g.name),
      tone: toneOf(g.userId),
      seen: g.allSeen,
      slides: g.slides.map((s) => ({ id: s.id, image: s.image, caption: s.caption, time: s.time })),
    }));
  const mine = groups.find((g) => g.mine);
  out.unshift({
    id: "me",
    authorId: "me",
    name: "You",
    initials: "Y",
    tone: 0,
    mine: true,
    seen: true,
    slides: (mine?.slides ?? []).map((s) => ({ id: s.id, image: s.image, caption: s.caption, time: s.time })),
  });
  return out;
}
