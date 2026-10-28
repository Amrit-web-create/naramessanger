import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, cn } from "@/components/nara/ui";
import { durationLabel } from "@/lib/format";
import { startRing, stopRing } from "@/lib/sound";
import { useNara } from "@/lib/store";

export function CallOverlay() {
  const call = useNara((s) => s.call);
  const chat = useNara((s) => s.chats.find((item) => item.id === s.call?.chatId) ?? null);
  const acceptCall = useNara((s) => s.acceptCall);
  const endCall = useNara((s) => s.endCall);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [camError, setCamError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!call || call.phase !== "ringing") {
      stopRing();
      return;
    }
    startRing();
    return () => stopRing();
  }, [call]);

  useEffect(() => {
    if (!call || call.incoming || call.phase !== "ringing") return;
    const id = window.setTimeout(() => acceptCall(), 1600);
    return () => window.clearTimeout(id);
  }, [call, acceptCall]);

  useEffect(() => {
    if (!call || call.phase !== "live" || !call.startedAt) return;
    const id = window.setInterval(() => setElapsed(Date.now() - (call.startedAt ?? Date.now())), 500);
    return () => window.clearInterval(id);
  }, [call]);

  useEffect(() => {
    const liveVideo = call?.phase === "live" && call.mode === "video" && cameraOn;
    if (!liveVideo) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCamError("");
      })
      .catch(() => setCamError("Camera stayed off."));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [call?.phase, call?.mode, cameraOn]);

  if (!call || !chat) return null;
  const showVideo = call.phase === "live" && call.mode === "video" && cameraOn && !camError;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-scrim text-on-scrim" role="dialog" aria-modal="true" aria-label="Call">
      {showVideo ? <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className={cn("relative flex flex-1 flex-col items-center justify-center px-6", showVideo && "bg-scrim/25")}>
        {!showVideo ? (
          <div className="relative grid place-items-center">
            <span className="pulse-ring absolute size-40 rounded-full border border-primary" />
            <span className="pulse-ring pulse-ring-delay absolute size-40 rounded-full border border-primary" />
            <Avatar chat={chat} size="lg" />
          </div>
        ) : null}
        <h2 className="mt-6 font-display text-4xl">{chat.name}</h2>
        <p className="nums mt-2 text-sm text-on-scrim/80">
          {call.phase === "ringing"
            ? call.incoming
              ? "Incoming voice call"
              : "Ringing…"
            : durationLabel(elapsed)}
        </p>
        {camError ? <p className="mt-2 text-sm text-on-scrim/80">{camError}</p> : null}
        <p className="mt-3 text-xs text-on-scrim/70">Simulated call. Nothing is connected to a network.</p>
      </div>
      <div className="safe-bottom relative flex items-center justify-center gap-4 px-6 pb-8">
        {call.phase === "ringing" && call.incoming ? (
          <>
            <Round label="Decline" danger onClick={endCall}>
              <PhoneOff className="size-6" />
            </Round>
            <Round label="Accept" onClick={acceptCall} className="bg-primary text-ink">
              <Phone className="size-6" />
            </Round>
          </>
        ) : (
          <>
            <Round label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((value) => !value)}>
              {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </Round>
            {call.mode === "video" ? (
              <Round label={cameraOn ? "Turn camera off" : "Turn camera on"} onClick={() => setCameraOn((value) => !value)}>
                {cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
              </Round>
            ) : null}
            <Round label="End call" danger onClick={endCall}>
              <PhoneOff className="size-6" />
            </Round>
          </>
        )}
      </div>
    </div>
  );
}

function Round({
  label,
  children,
  onClick,
  danger,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-16 place-items-center rounded-full transition-transform duration-150 active:scale-[0.96]",
        danger ? "bg-danger text-on-scrim" : "bg-elevated text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
