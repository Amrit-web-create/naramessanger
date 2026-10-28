import { API_URL, getToken } from "@/lib/api";

export type RealtimeEvent = { t: string; [key: string]: unknown };

let ws: WebSocket | null = null;
let handler: ((e: RealtimeEvent) => void) | null = null;
let stopped = true;
let attempts = 0;
let retryTimer: number | undefined;
let heartbeat: number | undefined;

function connect() {
  const token = getToken();
  if (stopped || !token || ws) return;
  const url = `${API_URL.replace(/^http/, "ws")}/ws`;
  // The session token rides in the subprotocol header, never in the URL.
  const socket = new WebSocket(url, ["nara.v1", token]);
  ws = socket;
  socket.onopen = () => {
    attempts = 0;
    heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("ping");
    }, 25_000);
    handler?.({ t: "open" });
  };
  socket.onmessage = (event) => {
    if (event.data === "pong") return;
    try {
      handler?.(JSON.parse(String(event.data)) as RealtimeEvent);
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onclose = () => {
    window.clearInterval(heartbeat);
    if (ws === socket) ws = null;
    handler?.({ t: "close" });
    if (stopped) return;
    attempts += 1;
    const delay = Math.min(30_000, 800 * 2 ** Math.min(attempts, 6));
    retryTimer = window.setTimeout(connect, delay);
  };
  socket.onerror = () => socket.close();
}

function onVisible() {
  if (!stopped && document.visibilityState === "visible" && !ws) {
    window.clearTimeout(retryTimer);
    connect();
  }
}

export function startRealtime(onEvent: (e: RealtimeEvent) => void) {
  handler = onEvent;
  if (!stopped) return;
  stopped = false;
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);
  connect();
}

export function stopRealtime() {
  stopped = true;
  handler = null;
  window.clearTimeout(retryTimer);
  window.clearInterval(heartbeat);
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("online", onVisible);
  ws?.close();
  ws = null;
}

function sendTypingFrame(chatId: string, typing: boolean) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "typing", chatId, typing }));
}

let typingChat: string | null = null;
let typingSentAt = 0;
let typingStop: number | undefined;

/** Call on every keystroke; throttled to one frame per 3s, auto-stops after 4s idle. */
export function notifyTyping(chatId: string) {
  const t = Date.now();
  if (typingChat !== chatId || t - typingSentAt > 3000) {
    if (typingChat && typingChat !== chatId) sendTypingFrame(typingChat, false);
    sendTypingFrame(chatId, true);
    typingChat = chatId;
    typingSentAt = t;
  }
  window.clearTimeout(typingStop);
  typingStop = window.setTimeout(() => stopTyping(), 4000);
}

export function stopTyping() {
  window.clearTimeout(typingStop);
  if (typingChat) sendTypingFrame(typingChat, false);
  typingChat = null;
  typingSentAt = 0;
}
