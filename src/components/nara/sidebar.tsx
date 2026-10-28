import { Lock, Notebook, Plus, Search, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, cn, IconButton, Mark } from "@/components/nara/ui";
import { api, remoteEnabled, toChat, type ServerUser } from "@/lib/api";
import { listTime, orderedStories, previewLine, sortChats, unreadCount } from "@/lib/format";
import { useNara } from "@/lib/store";
import type { Chat, Note, Story } from "@/lib/types";

export function Sidebar() {
  const profile = useNara((s) => s.profile);
  const section = useNara((s) => s.section);
  const setSection = useNara((s) => s.setSection);
  const setSheet = useNara((s) => s.setSheet);
  const vaultUnlocked = useNara((s) => s.vaultUnlocked);

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 shrink-0 flex-col bg-surface md:w-96 md:border-r md:border-line">
      <header className="flex items-center gap-2 px-3 pt-3">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full transition-transform duration-150 active:scale-[0.96]"
          aria-label="Profile and settings"
          onClick={() => setSheet("profile")}
        >
          <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-ink">
            {profile?.name.slice(0, 1).toUpperCase()}
          </span>
        </button>
        <p className="wordmark flex-1 text-xl">NARA</p>
        <IconButton label="Notes vault" onClick={() => setSection(section === "vault" ? "chats" : "vault")}>
          <Notebook className="size-5" />
        </IconButton>
      </header>

      <div className="mx-3 mt-3 grid grid-cols-2 rounded-full bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setSection("chats")}
          className={cn(
            "h-10 rounded-full text-sm font-semibold transition-colors",
            section === "chats" ? "bg-elevated text-fg" : "text-muted",
          )}
        >
          Chats
        </button>
        <button
          type="button"
          onClick={() => setSection("vault")}
          className={cn(
            "h-10 rounded-full text-sm font-semibold transition-colors",
            section === "vault" ? "bg-elevated text-fg" : "text-muted",
          )}
        >
          Vault
        </button>
      </div>

      {section === "chats" ? <ChatColumn /> : <NoteColumn locked={!vaultUnlocked} />}
    </aside>
  );
}

function ChatColumn() {
  const chats = useNara((s) => s.chats);
  const query = useNara((s) => s.query);
  const setQuery = useNara((s) => s.setQuery);
  const activeChatId = useNara((s) => s.activeChatId);
  const openChat = useNara((s) => s.openChat);
  const stories = useNara((s) => s.stories);
  const openStory = useNara((s) => s.openStory);
  const setComposing = useNara((s) => s.setComposing);
  const q = query.trim().toLowerCase();
  const visible = sortChats(
    chats.filter(
      (chat) =>
        !q ||
        chat.name.toLowerCase().includes(q) ||
        chat.messages.some((m) => m.text.toLowerCase().includes(q)),
    ),
  );
  const pinned = visible.filter((chat) => chat.pinned);
  const rest = visible.filter((chat) => !chat.pinned);

  return (
    <>
      <label className="relative mx-3 mt-3 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          id="chat-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={remoteEnabled ? "Search chats or find @username" : "Search chats"}
          className="h-11 w-full rounded-full border border-transparent bg-surface-2 pr-4 pl-10 text-sm outline-none focus:border-primary"
        />
      </label>
      {remoteEnabled ? <PeopleSearch query={query} onDone={() => setQuery("")} /> : null}
      <div className="scroll-none mt-3 flex gap-3 overflow-x-auto px-3 pb-1">
        {orderedStories(stories).map((story) => (
          <StoryRing
            key={story.id}
            story={story}
            onOpen={() => openStory(story.id)}
            onAdd={() => setComposing(true)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">
            {remoteEnabled ? "No chats yet. Search a username above to start one." : "No chats match that search."}
          </p>
        ) : null}
        {pinned.length ? <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted">PINNED</p> : null}
        {pinned.map((chat) => (
          <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} onOpen={() => openChat(chat.id)} />
        ))}
        {rest.length ? <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted">CHATS</p> : null}
        {rest.map((chat) => (
          <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} onOpen={() => openChat(chat.id)} />
        ))}
      </div>
    </>
  );
}

function StoryRing({ story, onOpen, onAdd }: { story: Story; onOpen: () => void; onAdd: () => void }) {
  const thumb = story.slides[story.slides.length - 1]?.image;
  const unseen = !story.seen && story.slides.length > 0 && !story.mine;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          aria-label={story.mine ? "Your status" : `${story.name}'s status`}
          className={cn("grid size-16 place-items-center rounded-full", unseen ? "bg-primary" : "bg-line")}
        >
          <span className="grid size-14 place-items-center overflow-hidden rounded-full bg-surface text-sm font-semibold">
            {thumb ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : story.mine ? (
              <Plus className="size-5 text-primary" />
            ) : (
              story.initials
            )}
          </span>
        </button>
        {story.mine ? (
          <button
            type="button"
            aria-label="Add a status"
            onClick={onAdd}
            className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-full bg-primary text-ink"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
      <span className="w-full truncate text-center text-xs text-muted">{story.mine ? "You" : story.name}</span>
    </div>
  );
}

function ChatRow({ chat, active, onOpen }: { chat: Chat; active: boolean; onOpen: () => void }) {
  const last = chat.messages[chat.messages.length - 1];
  const unread = unreadCount(chat);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors",
        active ? "bg-surface-2" : "hover:bg-surface-2/70",
      )}
    >
      <Avatar chat={chat} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{chat.name}</span>
          {chat.isAi ? <Mark className="size-3.5 shrink-0 text-primary" /> : null}
          <span className="ml-auto shrink-0 text-xs text-muted">{last ? listTime(last.time) : ""}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-muted">
          <Lock className="size-3 shrink-0 text-primary" />
          <span className="truncate">{previewLine(chat)}</span>
          {unread > 0 && !chat.muted ? (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-ink">
              {unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function NoteColumn({ locked }: { locked: boolean }) {
  const notes = useNara((s) => s.notes);
  const query = useNara((s) => s.noteQuery);
  const setNoteQuery = useNara((s) => s.setNoteQuery);
  const activeNoteId = useNara((s) => s.activeNoteId);
  const selectNote = useNara((s) => s.selectNote);
  const createNote = useNara((s) => s.createNote);
  if (locked) {
    return (
      <div className="flex flex-1 flex-col justify-center px-6 text-center">
        <Lock className="mx-auto size-6 text-primary" />
        <p className="mt-3 font-semibold">Vault is locked</p>
        <p className="mt-1 text-sm text-muted">Notes stay on this device. Enter the PIN to open them.</p>
      </div>
    );
  }
  const q = query.trim().toLowerCase();
  const visible = [...notes]
    .filter((note) => !q || note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated);
  return (
    <>
      <div className="mx-3 mt-3 flex gap-2">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(event) => setNoteQuery(event.target.value)}
            placeholder="Search notes"
            className="h-11 w-full rounded-full bg-surface-2 pr-4 pl-10 text-sm outline-none focus:border-primary"
          />
        </label>
        <IconButton label="New note" onClick={createNote} className="bg-primary text-ink hover:bg-primary">
          <SquarePen className="size-5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted">No notes yet.</p>
        ) : null}
        {visible.map((note) => (
          <NoteRow key={note.id} note={note} active={note.id === activeNoteId} onOpen={() => selectNote(note.id)} />
        ))}
      </div>
    </>
  );
}

function NoteRow({ note, active, onOpen }: { note: Note; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "mb-1 w-full rounded-2xl px-3 py-3 text-left",
        active ? "bg-surface-2" : "hover:bg-surface-2/70",
      )}
    >
      <span className="flex items-center gap-2">
        <span className="truncate font-semibold">{note.title || "Untitled"}</span>
        {note.pinned ? <span className="text-xs text-primary">Pinned</span> : null}
        <span className="ml-auto shrink-0 text-xs text-muted">{listTime(note.updated)}</span>
      </span>
      <span className="mt-1 line-clamp-2 block text-sm text-muted">{note.body || "Empty note"}</span>
    </button>
  );
}

function PeopleSearch({ query, onDone }: { query: string; onDone: () => void }) {
  const [people, setPeople] = useState<ServerUser[]>([]);
  const [error, setError] = useState("");
  const upsert = useNara((s) => s.upsertRemoteChat);
  const openChat = useNara((s) => s.openChat);
  const me = useNara((s) => s.profile?.userId ?? "");
  const q = query.trim().replace(/^@/, "");

  useEffect(() => {
    setError("");
    if (q.length < 2) {
      setPeople([]);
      return;
    }
    let live = true;
    const id = window.setTimeout(() => {
      api
        .searchUsers(q)
        .then((r) => live && setPeople(r.users))
        .catch((e: Error) => live && setError(e.message));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [q]);

  async function start(user: ServerUser) {
    try {
      const { chat } = await api.openChat(user.id);
      upsert(toChat(chat, me));
      onDone();
      openChat(chat.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the chat.");
    }
  }

  if (q.length < 2) return null;
  return (
    <div className="mx-3 mt-3 rounded-2xl bg-surface-2 p-2">
      <p className="px-2 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted">PEOPLE</p>
      {error ? <p className="px-2 py-2 text-sm text-danger">{error}</p> : null}
      {!error && people.length === 0 ? <p className="px-2 py-2 text-sm text-muted">No one found.</p> : null}
      {people.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => void start(u)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-elevated"
        >
          <Avatar chat={{ initials: u.name.slice(0, 2).toUpperCase(), isAi: false, isGroup: false, online: false, tone: 1 }} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{u.name}</span>
            <span className="block truncate text-sm text-muted">@{u.username}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
