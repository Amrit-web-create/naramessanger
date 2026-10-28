import { Mark } from "@/components/nara/ui";

export function Splash() {
  return (
    <main className="grid h-dvh place-items-center bg-canvas text-fg">
      <div className="flex flex-col items-center gap-4">
        <span className="grid size-14 place-items-center rounded-2xl bg-surface text-primary">
          <Mark className="size-7" />
        </span>
        <p className="wordmark text-2xl">NARA</p>
        <p className="text-sm text-muted">Opening your chats</p>
      </div>
    </main>
  );
}
