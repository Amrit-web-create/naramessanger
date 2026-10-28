import { Lock, X } from "lucide-react";
import { RemoteSettings } from "@/components/nara/profile-remote";
import { cn, IconButton } from "@/components/nara/ui";
import { remoteEnabled } from "@/lib/api";
import { useNara } from "@/lib/store";
import type { ThemeName } from "@/lib/types";

export function ProfileSheet() {
  const open = useNara((s) => s.sheet === "profile");
  const profile = useNara((s) => s.profile);
  const updateProfile = useNara((s) => s.updateProfile);
  const signOut = useNara((s) => s.signOut);
  const setSheet = useNara((s) => s.setSheet);
  if (!profile) return null;
  return (
    <div className={cn("fixed inset-0 z-30 flex justify-end", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <button
        type="button"
        aria-label="Close profile"
        className={cn("absolute inset-0 bg-scrim/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        onClick={() => setSheet(null)}
      />
      <aside
        role="dialog"
        aria-modal={open}
        aria-label="Profile"
        inert={!open}
        className={cn(
          "relative flex h-full w-full max-w-md flex-col bg-surface shadow-sheet transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-2 px-3 py-3">
          <IconButton label="Close" onClick={() => setSheet(null)}>
            <X className="size-5" />
          </IconButton>
          <h2 className="font-display text-2xl">Profile</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
          <div className="grid size-20 place-items-center rounded-full bg-primary text-2xl font-semibold text-ink">
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
          <label className="mt-6 block text-sm font-medium" htmlFor="profile-name">
            Name
          </label>
          <input
            id="profile-name"
            value={profile.name}
            maxLength={40}
            onChange={(event) => updateProfile({ name: event.target.value })}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-primary"
          />
          <label className="mt-4 block text-sm font-medium" htmlFor="profile-about">
            About
          </label>
          <input
            id="profile-about"
            value={profile.about}
            maxLength={80}
            onChange={(event) => updateProfile({ about: event.target.value })}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas px-4 outline-none focus:border-primary"
          />
          <p className="mt-4 text-sm text-muted">{profile.email}</p>
          {remoteEnabled ? <RemoteSettings /> : null}

          <p className="mt-8 text-sm font-medium">Theme</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ThemeChoice name="dusk" current={profile.theme} label="Dusk" />
            <ThemeChoice name="paper" current={profile.theme} label="Paper" />
          </div>

          <Toggle
            label="Enter sends"
            checked={profile.enterToSend}
            onChange={(enterToSend) => updateProfile({ enterToSend })}
          />
          <Toggle
            label="Read receipts"
            checked={profile.readReceipts}
            onChange={(readReceipts) => updateProfile({ readReceipts })}
          />

          <button
            type="button"
            onClick={signOut}
            className="mt-8 h-12 w-full rounded-full bg-surface-2 font-semibold text-danger"
          >
            Sign out
          </button>
          <p className="mt-2 text-center text-sm text-muted">
            {remoteEnabled ? "Notes stay in this browser. Chats sync through your account." : "Chats and notes stay in this browser."}
          </p>
        </div>
      </aside>
    </div>
  );
}

function ThemeChoice({ name, current, label }: { name: ThemeName; current: ThemeName; label: string }) {
  const updateProfile = useNara((s) => s.updateProfile);
  const on = current === name;
  return (
    <button
      type="button"
      onClick={() => updateProfile({ theme: name })}
      className={cn(
        "h-11 rounded-full border font-medium",
        on ? "border-primary bg-primary text-ink" : "border-line bg-canvas",
      )}
    >
      {label}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="mt-4 flex h-12 w-full items-center justify-between rounded-2xl bg-canvas px-4"
    >
      <span>{label}</span>
      <span className={cn("grid h-7 w-12 place-items-center rounded-full p-1", checked ? "bg-primary" : "bg-line")}>
        <span className={cn("size-5 rounded-full bg-elevated transition-transform", checked ? "translate-x-2.5" : "-translate-x-2.5")} />
      </span>
    </button>
  );
}

export function SecureSheet() {
  const open = useNara((s) => s.sheet === "secure");
  const chat = useNara((s) => s.chats.find((item) => item.id === s.activeChatId) ?? null);
  const setSheet = useNara((s) => s.setSheet);
  const toggleMute = useNara((s) => s.toggleMute);
  if (!chat) return null;
  return (
    <div className={cn("fixed inset-0 z-30 grid place-items-end sm:place-items-center", open ? "" : "pointer-events-none")}>
      <button
        type="button"
        aria-label="Close"
        className={cn("absolute inset-0 bg-scrim/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        onClick={() => setSheet(null)}
      />
      <section
        role="dialog"
        aria-modal={open}
        aria-label="Encryption"
        inert={!open}
        className={cn(
          "relative w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-sheet transition-all duration-200 sm:rounded-3xl",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-primary/20 text-primary">
            <Lock className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-2xl">Simulated encryption</h2>
            <p className="text-sm text-muted">{chat.name}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed">
          The lock is a badge, not a cryptographic session. Messages in this chat stay in your browser.
          {chat.isAi
            ? " Nara Guide is the exception: what you send there is processed so a reply can be written."
            : " Nothing in this thread is uploaded."}
        </p>
        <p className="mt-3 text-sm text-muted">{chat.isGroup ? chat.members : chat.about}</p>
        <button
          type="button"
          onClick={() => toggleMute(chat.id)}
          className="mt-5 h-11 w-full rounded-full bg-surface-2 font-medium"
        >
          {chat.muted ? "Unmute chat" : "Mute chat"}
        </button>
        <button
          type="button"
          onClick={() => setSheet(null)}
          className="mt-2 h-11 w-full rounded-full bg-primary font-semibold text-ink"
        >
          Done
        </button>
      </section>
    </div>
  );
}
