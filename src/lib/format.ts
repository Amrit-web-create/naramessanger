import { format, isSameDay, isToday, isYesterday } from "date-fns";
import type { Chat, Story } from "@/lib/types";

export function uid() {
  return crypto.randomUUID();
}

export function clock(ts: number) {
  return format(new Date(ts), "HH:mm");
}

export function dayLabel(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

export function listTime(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

export function sameDay(a: number, b: number) {
  return isSameDay(new Date(a), new Date(b));
}

export function storyAge(ts: number) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function durationLabel(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function unreadCount(chat: Chat) {
  return chat.messages.reduce(
    (n, m) => n + (m.from === "them" && !m.system && m.time > chat.lastReadAt ? 1 : 0),
    0,
  );
}

export function previewLine(chat: Chat) {
  const last = chat.messages[chat.messages.length - 1];
  if (!last) return chat.about;
  let body = last.text.trim();
  if (last.media?.kind === "image") body = body ? `Photo · ${body}` : "Photo";
  else if (last.media?.kind === "voice") body = "Voice note";
  else if (last.media?.kind === "file") body = last.media.name || "File";
  if (!body) body = "Message";
  if (last.from === "me") return `You: ${body}`;
  if (last.author) return `${last.author}: ${body}`;
  return body;
}

export function orderedStories(stories: Story[]) {
  return [...stories].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    return Number(a.seen) - Number(b.seen);
  });
}

export function sortChats(chats: Chat[]) {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ta = a.messages[a.messages.length - 1]?.time ?? 0;
    const tb = b.messages[b.messages.length - 1]?.time ?? 0;
    return tb - ta;
  });
}
