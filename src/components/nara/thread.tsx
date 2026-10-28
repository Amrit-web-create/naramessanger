import { remoteEnabled } from "@/lib/api";
import { notifyTyping, stopTyping } from "@/lib/realtime";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Lock,
  Mic,
  MoreVertical,
  Paperclip,
  Pause,
  Phone,
  Play,
  Send,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Avatar, cn, IconButton, Wave } from "@/components/nara/ui";
import { clock, dayLabel, durationLabel, sameDay } from "@/lib/format";
import { shrinkImage } from "@/lib/media";
import { playSrc, playTone, stopSound } from "@/lib/sound";
import { useNara } from "@/lib/store";
import type { Message } from "@/lib/types";

export function ThreadPane() {
  const chat = useNara((s) => s.chats.find((item) => item.id === s.activeChatId) ?? null);
  const profile = useNara((s) => s.profile);
  const typingChatId = useNara((s) => s.typingChatId);
  const aiPending = useNara((s) => s.aiPending);
  const replyToId = useNara((s) => s.replyToId);
  const setReply = useNara((s) => s.setReply);
  const sendMessage = useNara((s) => s.sendMessage);
  const backToList = useNara((s) => s.backToList);
  const setSheet = useNara((s) => s.setSheet);
  const openMedia = useNara((s) => s.openMedia);
  const startCall = useNara((s) => s.startCall);
  const toggleMute = useNara((s) => s.toggleMute);
  const togglePin = useNara((s) => s.togglePin);
  const markRead = useNara((s) => s.markRead);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [hint, setHint] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const secRef = useRef(0);
  const wideMark = useRef("");

  useEffect(() => {
    if (!chat) return;
    if (wideMark.current === chat.id) return;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    if (wide) markRead(chat.id);
    wideMark.current = chat.id;
  }, [chat, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, typingChatId, chat?.id]);

  useEffect(() => {
    if (!recording) return;
    secRef.current = 0;
    setSeconds(0);
    const id = window.setInterval(() => {
      secRef.current += 1;
      setSeconds(secRef.current);
      if (secRef.current >= 20) recRef.current?.stop();
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  if (!chat || !profile) {
    return (
      <section className="wallpaper flex h-full min-w-0 flex-1 flex-col items-center justify-center px-8">
        <img src="/media/coffee.jpg" alt="" className="h-56 w-44 rounded-3xl object-cover shadow-sheet" />
        <h1 className="wordmark mt-6 text-3xl">NARA</h1>
        <p className="mt-2 max-w-sm text-center text-muted">
          Pick a conversation, open a status, or lock a note in the vault.
        </p>
        <button type="button" onClick={backToList} className="mt-6 h-11 rounded-full bg-primary px-5 font-semibold text-ink md:hidden">
          Back to chats
        </button>
      </section>
    );
  }

  const quoted = chat.messages.find((m) => m.id === replyToId);
  const typing = typingChatId === chat.id;

  function send(payload: { text: string; media?: Message["media"] }) {
    sendMessage(chat!.id, { ...payload, replyTo: replyToId ?? undefined });
    setDraft("");
    setHint("");
    if (remoteEnabled) stopTyping();
  }

  async function onPick(file: File) {
    if (file.type.startsWith("image/")) {
      try {
        const src = await shrinkImage(file);
        send({ text: draft, media: { kind: "image", src } });
      } catch {
        setHint("Choose a smaller photo.");
      }
      return;
    }
    if (file.size > 8_000_000) {
      setHint("That file is too large to attach.");
      return;
    }
    send({ text: draft, media: { kind: "file", name: file.name } });
  }

  async function toggleRec() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const src = typeof reader.result === "string" ? reader.result : undefined;
          send({ text: "", media: { kind: "voice", src, durationMs: Math.max(1, secRef.current) * 1000 } });
        };
        reader.readAsDataURL(blob);
        setRecording(false);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setHint("");
    } catch {
      setHint("Microphone is blocked. You can still type.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (!profile?.enterToSend) return;
    event.preventDefault();
    if (draft.trim()) send({ text: draft });
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <IconButton label="Back to chats" className="md:hidden" onClick={backToList}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-1 py-1 text-left" onClick={() => setSheet("secure")}>
          <Avatar chat={chat} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{chat.name}</span>
            <span className="flex items-center gap-1 truncate text-xs text-primary">
              <Lock className="size-3" />
              {typing
                ? "typing…"
                : chat.isAi
                  ? "Guide · on request"
                  : remoteEnabled
                    ? chat.lastSeen
                    : "End-to-end · simulated"}
            </span>
          </span>
        </button>
        <IconButton label="Voice call" onClick={() => startCall(chat.id, "voice")}>
          <Phone className="size-5" />
        </IconButton>
        <IconButton label="Video call" onClick={() => startCall(chat.id, "video")}>
          <Video className="size-5" />
        </IconButton>
        <div className="relative">
          <IconButton label="Chat menu" onClick={() => setMenu((open) => !open)}>
            <MoreVertical className="size-5" />
          </IconButton>
          {menu ? (
            <div className="absolute top-12 right-0 z-20 w-56 rounded-2xl border border-line bg-elevated p-1 shadow-sheet">
              <MenuItem label="Encryption details" onClick={() => { setMenu(false); setSheet("secure"); }} />
              <MenuItem label={chat.pinned ? "Unpin chat" : "Pin chat"} onClick={() => { togglePin(chat.id); setMenu(false); }} />
              <MenuItem label={chat.muted ? "Unmute" : "Mute"} onClick={() => { toggleMute(chat.id); setMenu(false); }} />
              <MenuItem label="Preview incoming call" onClick={() => { setMenu(false); startCall(chat.id, "voice", true); }} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4" onClick={() => setMenu(false)}>
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          <p className="mx-auto mb-2 max-w-sm rounded-2xl bg-elevated/90 px-3 py-2 text-center text-xs text-muted">
            <Lock className="mr-1 inline size-3 text-primary" />
            {chat.isAi
              ? "Messages to Nara Guide are sent so a reply can be written. Other chats stay in this browser."
              : "Simulated end-to-end lock. This chat is stored only in this browser."}
          </p>
          {chat.messages.map((message, index) => {
            const prev = chat.messages[index - 1];
            const showDay = !prev || !sameDay(prev.time, message.time);
            return (
              <div key={message.id}>
                {showDay ? (
                  <p className="mx-auto my-2 w-fit rounded-full bg-elevated px-3 py-1 text-xs text-muted">
                    {dayLabel(message.time)}
                  </p>
                ) : null}
                <Bubble
                  message={message}
                  mine={message.from === "me"}
                  chat={chat}
                  onReply={() => setReply(message.id)}
                  onOpen={() => {
                    if (message.media?.kind === "image" && message.media.src) {
                      openMedia({ src: message.media.src, caption: message.text });
                    }
                  }}
                />
              </div>
            );
          })}
          {typing ? (
            <div className="flex w-fit items-center gap-2 rounded-full bg-bubble-in px-3 py-2 text-sm text-muted">
              <span className="flex gap-1" aria-hidden="true">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
              typing
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </div>

      <footer className="safe-bottom border-t border-line bg-surface px-3 pt-2">
        {quoted ? (
          <div className="mb-2 flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted">
              Replying to {quoted.author || (quoted.from === "me" ? profile.name : chat.name)}: {quoted.text || quoted.media?.kind || "message"}
            </span>
            <IconButton label="Cancel reply" onClick={() => setReply(null)}>
              <X className="size-4" />
            </IconButton>
          </div>
        ) : null}
        {hint ? <p className="pb-1 text-sm text-danger">{hint}</p> : null}
        {recording ? (
          <div className="flex items-center gap-3 pb-2">
            <span className="size-2 rounded-full bg-danger" />
            <span className="nums flex-1 text-sm">Recording {durationLabel(seconds * 1000)}</span>
            <button
              type="button"
              onClick={() => void toggleRec()}
              className="h-11 rounded-full bg-primary px-4 font-semibold text-ink"
            >
              Send note
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-1 pb-2">
            <IconButton label="Attach" onClick={() => fileRef.current?.click()}>
              <Paperclip className="size-5" />
            </IconButton>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onPick(file);
              }}
            />
            <textarea
              value={draft}
              rows={1}
              onChange={(event) => {
                setDraft(event.target.value);
                if (remoteEnabled && !chat.isAi && event.target.value) notifyTyping(chat.id);
              }}
              onKeyDown={onKeyDown}
              placeholder={chat.isAi ? "Message Nara Guide" : `Message ${chat.name}`}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-line bg-canvas px-4 py-2.5 text-base outline-none focus:border-primary"
            />
            {draft.trim() ? (
              <IconButton
                label="Send"
                className="bg-primary text-ink hover:bg-primary"
                disabled={chat.isAi && aiPending}
                onClick={() => send({ text: draft })}
              >
                <Send className="size-5" />
              </IconButton>
            ) : (
              <IconButton label="Voice note" onClick={() => void toggleRec()} disabled={chat.isAi && aiPending}>
                <Mic className="size-5" />
              </IconButton>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 w-full items-center rounded-xl px-3 text-left text-sm hover:bg-surface-2">
      {label}
    </button>
  );
}

function Bubble({
  message,
  mine,
  onReply,
  onOpen,
}: {
  message: Message;
  mine: boolean;
  chat: { name: string };
  onReply: () => void;
  onOpen: () => void;
}) {
  const quoted = useNara((s) => {
    const thread = s.chats.find((item) => item.id === message.chatId);
    return thread?.messages.find((item) => item.id === message.replyTo);
  });
  if (message.system) {
    return <p className="mx-auto my-1 max-w-sm text-center text-sm text-danger">{message.text}</p>;
  }
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-md",
          mine ? "rounded-br-md bg-bubble-out" : "rounded-bl-md bg-bubble-in",
        )}
      >
        {message.author ? <p className="text-xs font-semibold text-primary">{message.author}</p> : null}
        {quoted ? (
          <p className="mb-1 truncate rounded-xl bg-canvas/40 px-2 py-1 text-xs text-muted">
            {quoted.text || quoted.media?.kind || "Message"}
          </p>
        ) : null}
        {message.media?.kind === "image" && message.media.src ? (
          <button type="button" onClick={onOpen} className="block">
            <img src={message.media.src} alt={message.text || "Shared photo"} className="max-h-72 w-full rounded-xl object-cover" />
          </button>
        ) : null}
        {message.media?.kind === "image" && !message.media.src ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <ImageIcon className="size-4" /> Photo from this session is no longer stored.
          </p>
        ) : null}
        {message.media?.kind === "file" ? (
          <p className="flex items-center gap-2 rounded-xl bg-canvas/40 px-2 py-2 text-sm">
            <FileText className="size-4 text-primary" />
            {message.media.name || "File"}
          </p>
        ) : null}
        {message.media?.kind === "voice" ? <VoiceNote src={message.media.src} durationMs={message.media.durationMs ?? 2000} /> : null}
        {message.text ? <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p> : null}
        <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">
          <button type="button" onClick={onReply} className="mr-auto text-xs text-faint hover:text-fg">
            Reply
          </button>
          <span className="nums">{clock(message.time)}</span>
          {mine ? <Ticks status={message.status} /> : null}
        </p>
      </div>
    </div>
  );
}

function Ticks({ status }: { status: Message["status"] }) {
  if (status === "sent") return <Check className="size-3.5 text-faint" />;
  return <CheckCheck className={cn("size-3.5", status === "read" ? "text-primary" : "text-faint")} />;
}

function VoiceNote({ src, durationMs }: { src?: string; durationMs: number }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => stopSound(), []);
  async function toggle() {
    if (playing) {
      stopSound();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      if (src) await playSrc(src);
      else playTone(durationMs);
    } catch {
      setPlaying(false);
      return;
    }
    window.setTimeout(() => setPlaying(false), durationMs);
  }
  return (
    <button type="button" onClick={() => void toggle()} className="mb-1 flex items-center gap-2 text-fg">
      {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      <Wave on={playing} />
      <span className="nums text-xs text-muted">{durationLabel(durationMs)}</span>
    </button>
  );
}
