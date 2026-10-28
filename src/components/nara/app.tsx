import { useEffect } from "react";
import { AuthScreen } from "@/components/nara/auth-screen";
import { CallOverlay } from "@/components/nara/call-overlay";
import { NotesMain } from "@/components/nara/notes-vault";
import { ProfileSheet, SecureSheet } from "@/components/nara/profile-sheet";
import { Sidebar } from "@/components/nara/sidebar";
import { MediaLightbox, StatusComposer, StoryViewer } from "@/components/nara/story-viewer";
import { ThreadPane } from "@/components/nara/thread";
import { useWide } from "@/components/nara/ui";
import { getToken, remoteEnabled } from "@/lib/api";
import { unreadCount } from "@/lib/format";
import { useNara } from "@/lib/store";
import { startSync, stopSync } from "@/lib/sync";

export function NaraApp() {
  const profile = useNara((s) => s.profile);
  const theme = profile?.theme ?? "dusk";

  useEffect(() => {
    document.documentElement.dataset.theme = profile ? theme : "dusk";
    document.documentElement.style.colorScheme = profile && theme === "paper" ? "light" : "dark";
  }, [profile, theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useNara.getState();
      if (event.key === "Escape") {
        if (state.media) return state.closeMedia();
        if (state.composing) return state.setComposing(false);
        if (state.story) return state.closeStory();
        if (state.call) return state.endCall();
        if (state.sheet) return state.setSheet(null);
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        event.preventDefault();
        document.getElementById("chat-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unread = useNara((s) => s.chats.reduce((sum, chat) => sum + unreadCount(chat), 0));
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Nara` : "Nara";
  }, [unread]);

  const signedIn = Boolean(profile);
  useEffect(() => {
    if (!remoteEnabled) return;
    if (signedIn && (!getToken() || !useNara.getState().profile?.userId)) {
      useNara.getState().signOut();
      return;
    }
    if (signedIn) startSync();
    else stopSync();
  }, [signedIn]);

  if (!profile) return <AuthScreen />;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-fg">
      <Columns />
      <ProfileSheet />
      <SecureSheet />
      <StoryViewer />
      <StatusComposer />
      <CallOverlay />
      <MediaLightbox />
    </div>
  );
}

function Columns() {
  const wide = useWide();
  const pane = useNara((s) => s.pane);
  const section = useNara((s) => s.section);
  const showList = wide || pane === "list";
  const showMain = wide || pane === "main";
  return (
    <>
      {showList ? <Sidebar /> : null}
      {showMain ? (section === "vault" ? <NotesMain /> : <ThreadPane />) : null}
    </>
  );
}
