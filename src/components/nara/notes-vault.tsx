import { ArrowLeft, Delete, Lock, Pin, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, IconButton } from "@/components/nara/ui";
import { listTime } from "@/lib/format";
import { useNara } from "@/lib/store";

export function NotesMain() {
  const unlocked = useNara((s) => s.vaultUnlocked);
  const pin = useNara((s) => s.vaultPin);
  if (!unlocked) return <PinGate mode={pin ? "enter" : "create"} />;
  return <NoteEditor />;
}

function PinGate({ mode }: { mode: "create" | "enter" }) {
  const setVaultPin = useNara((s) => s.setVaultPin);
  const unlockVault = useNara((s) => s.unlockVault);
  const setSection = useNara((s) => s.setSection);
  const [phase, setPhase] = useState<"first" | "confirm" | "enter">(mode === "enter" ? "enter" : "first");
  const [digits, setDigits] = useState("");
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!shake) return;
    const id = window.setTimeout(() => setShake(false), 300);
    return () => window.clearTimeout(id);
  }, [shake]);

  function press(key: string) {
    setError("");
    if (key === "del") {
      setDigits((value) => value.slice(0, -1));
      return;
    }
    const next = (digits + key).slice(0, 4);
    setDigits(next);
    if (next.length < 4) return;
    if (phase === "first") {
      setFirst(next);
      setDigits("");
      setPhase("confirm");
      return;
    }
    if (phase === "confirm") {
      if (next === first) {
        setVaultPin(next);
        return;
      }
      setError("Those PINs didn't match. Start again.");
      setShake(true);
      setDigits("");
      setFirst("");
      setPhase("first");
      return;
    }
    if (!unlockVault(next)) {
      setError("Wrong PIN.");
      setShake(true);
      setDigits("");
    }
  }

  const title = phase === "enter" ? "Unlock vault" : phase === "confirm" ? "Confirm PIN" : "Set a vault PIN";

  return (
    <section className={cn("relative flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-canvas px-6", shake && "shake")}>
      <button type="button" onClick={() => setSection("chats")} className="absolute top-4 left-4 h-11 rounded-full px-3 text-sm text-muted md:hidden">
        Back to chats
      </button>
      <Lock className="size-7 text-primary" />
      <h1 className="mt-4 font-display text-3xl">{title}</h1>
      <p className="mt-2 max-w-sm text-center text-sm text-muted">
        Four digits, stored only in this browser. This is a local lock, not a password manager.
      </p>
      <div className="mt-6 flex gap-3" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={cn("size-3 rounded-full", index < digits.length ? "bg-primary" : "bg-line")} />
        ))}
      </div>
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-4 text-sm text-transparent">.</p>
      )}
      <div className="mt-2 grid w-full max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((key) =>
          key === "" ? (
            <span key="blank" />
          ) : (
            <button
              key={key}
              type="button"
              aria-label={key === "del" ? "Delete digit" : key}
              onClick={() => press(key)}
              className="grid h-14 place-items-center rounded-full bg-surface-2 text-xl transition-transform duration-150 active:scale-[0.96]"
            >
              {key === "del" ? <Delete className="size-5" /> : key}
            </button>
          ),
        )}
      </div>
    </section>
  );
}

function NoteEditor() {
  const notes = useNara((s) => s.notes);
  const activeNoteId = useNara((s) => s.activeNoteId);
  const saveNote = useNara((s) => s.saveNote);
  const deleteNote = useNara((s) => s.deleteNote);
  const toggleNotePin = useNara((s) => s.toggleNotePin);
  const lockVault = useNara((s) => s.lockVault);
  const resetVaultPin = useNara((s) => s.resetVaultPin);
  const backToList = useNara((s) => s.backToList);
  const createNote = useNara((s) => s.createNote);
  const note = notes.find((item) => item.id === activeNoteId) ?? null;
  const [confirm, setConfirm] = useState(false);

  useEffect(() => setConfirm(false), [note?.id]);

  if (!note) {
    return (
      <section className="flex h-full flex-1 flex-col items-center justify-center bg-canvas px-6 text-center">
        <h1 className="font-display text-3xl">Notes vault</h1>
        <p className="mt-2 max-w-sm text-muted">Private notes live beside your chats and never leave this browser.</p>
        <button type="button" onClick={createNote} className="mt-6 h-11 rounded-full bg-primary px-5 font-semibold text-ink">
          New note
        </button>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-canvas">
      <header className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <IconButton label="Back to notes" className="md:hidden" onClick={backToList}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <p className="flex-1 truncate px-2 text-sm text-muted">{listTime(note.updated)}</p>
        <IconButton label={note.pinned ? "Unpin note" : "Pin note"} onClick={() => toggleNotePin(note.id)}>
          <Pin className={cn("size-5", note.pinned && "text-primary")} />
        </IconButton>
        <IconButton label="Lock vault" onClick={lockVault}>
          <Lock className="size-5" />
        </IconButton>
        <IconButton
          label="Delete note"
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            deleteNote(note.id);
          }}
        >
          <Trash2 className="size-5" />
        </IconButton>
      </header>
      {confirm ? <p className="bg-surface px-4 py-2 text-sm text-danger">Tap delete again to remove this note.</p> : null}
      <input
        value={note.title}
        onChange={(event) => saveNote(note.id, { title: event.target.value.slice(0, 80) })}
        placeholder="Title"
        className="bg-transparent px-5 pt-5 font-display text-3xl outline-none"
      />
      <textarea
        value={note.body}
        onChange={(event) => saveNote(note.id, { body: event.target.value })}
        placeholder="Write something only you should see"
        className="min-h-0 w-full flex-1 resize-none bg-transparent px-5 py-4 text-base outline-none"
      />
      <div className="safe-bottom px-5">
        <button type="button" onClick={resetVaultPin} className="mb-3 text-sm text-muted underline-offset-2 hover:underline">
          Reset PIN
        </button>
      </div>
    </section>
  );
}
