import { clsx, type ClassValue } from "clsx";
import { Users } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";
import type { Chat } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path fill="currentColor" d="M4 26V6h6.2l7.2 10.2V6H28v20h-6.2L14.6 15.8V26H4z" />
    </svg>
  );
}

const tones = [
  "bg-primary/25 text-fg",
  "bg-elevated text-fg",
  "bg-bubble-out text-fg",
  "bg-surface-2 text-fg",
  "bg-primary/40 text-fg",
];

export function Avatar({
  chat,
  size = "md",
}: {
  chat: Pick<Chat, "initials" | "isAi" | "isGroup" | "online" | "tone">;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "size-28 text-3xl" : size === "sm" ? "size-11 text-sm" : "size-12 text-base";
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-semibold",
        dim,
        chat.isAi ? "bg-primary text-ink" : tones[chat.tone % tones.length],
      )}
    >
      {chat.isAi ? (
        <Mark className={size === "lg" ? "size-12" : "size-5"} />
      ) : chat.isGroup ? (
        <Users className={size === "lg" ? "size-12" : "size-5"} />
      ) : (
        chat.initials
      )}
      {chat.online && !chat.isGroup ? (
        <span className="absolute right-0 bottom-0 size-3 rounded-full bg-primary ring-2 ring-surface" />
      ) : null}
    </span>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full text-fg transition-transform duration-150 ease-out hover:bg-surface-2 active:scale-[0.96] disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function useWide() {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return wide;
}

export function Wave({ on }: { on: boolean }) {
  const heights = ["h-2", "h-4", "h-3", "h-5", "h-3", "h-4", "h-2", "h-5", "h-3", "h-4", "h-2", "h-5", "h-4", "h-3", "h-5", "h-2"];
  return (
    <span className="flex h-6 items-end gap-0.5" aria-hidden="true">
      {heights.map((height, index) => (
        <span key={index} className={cn("w-0.5 rounded-full bg-current", height, on && "wave-bar wave-on")} />
      ))}
    </span>
  );
}
