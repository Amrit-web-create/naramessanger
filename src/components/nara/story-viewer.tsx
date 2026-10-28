import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cn, IconButton } from "@/components/nara/ui";
import { shrinkImage } from "@/lib/media";
import { storyAge } from "@/lib/format";
import { useNara } from "@/lib/store";

export function StoryViewer() {
  const storyState = useNara((s) => s.story);
  const stories = useNara((s) => s.stories);
  const closeStory = useNara((s) => s.closeStory);
  const stepStory = useNara((s) => s.stepStory);
  const sendMessage = useNara((s) => s.sendMessage);
  const openChat = useNara((s) => s.openChat);
  const story = stories.find((item) => item.id === storyState?.id);
  const slide = story && storyState ? story.slides[storyState.slide] : undefined;
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    lock.current = false;
    setProgress(0);
    setReply("");
  }, [storyState?.id, storyState?.slide]);

  useEffect(() => {
    if (!slide || paused) return;
    const id = window.setInterval(() => {
      setProgress((value) => {
        if (lock.current) return value;
        const next = value + 0.02;
        if (next >= 1) {
          lock.current = true;
          stepStory(1);
          return 1;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [slide, paused, storyState?.id, storyState?.slide, stepStory]);

  if (!story || !slide || !storyState) return null;

  function sendReply(event: FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (!text || !story || story.mine) return;
    sendMessage(story.authorId, { text: `About your status — ${text}` });
    closeStory();
    openChat(story.authorId);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim" role="dialog" aria-modal="true" aria-label={`${story.name} status`}>
      <div
        className="relative h-full w-full max-w-lg overflow-hidden bg-scrim sm:h-[92%] sm:rounded-3xl"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {slide.image ? (
          <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-primary p-10 text-center text-ink">
            <p className="font-display text-4xl">{slide.caption || "Status"}</p>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-28 bg-scrim/60" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-scrim/75" />
        <div className="relative flex gap-1 px-3 pt-3">
          {story.slides.map((item, index) => (
            <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-on-scrim/30">
              <span
                className="block h-full bg-on-scrim"
                style={{
                  width:
                    index < storyState.slide ? "100%" : index === storyState.slide ? `${Math.min(100, progress * 100)}%` : "0%",
                }}
              />
            </span>
          ))}
        </div>
        <div className="relative flex items-center gap-2 px-3 pt-3 text-on-scrim">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-xs font-semibold text-ink">
            {story.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{story.mine ? "Your status" : story.name}</span>
            <span className="text-xs text-on-scrim/80">{storyAge(slide.time)}</span>
          </span>
          <IconButton label="Close status" className="text-on-scrim hover:bg-on-scrim/10" onClick={closeStory}>
            <X className="size-5" />
          </IconButton>
        </div>
        <button type="button" aria-label="Previous" className="absolute top-24 bottom-28 left-0 w-1/3" onClick={() => stepStory(-1)} />
        <button type="button" aria-label="Next" className="absolute top-24 right-0 bottom-28 w-1/3" onClick={() => stepStory(1)} />
        <div className="absolute inset-x-0 bottom-0 px-3 pb-4">
          {slide.image && slide.caption ? (
            <p className="mb-3 text-center text-sm text-on-scrim">{slide.caption}</p>
          ) : null}
          {story.mine ? null : (
            <form onSubmit={sendReply} className="flex gap-2" onClick={(event) => event.stopPropagation()}>
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder={`Reply to ${story.name}`}
                className="h-11 flex-1 rounded-full border border-on-scrim/30 bg-scrim/40 px-4 text-sm text-on-scrim outline-none placeholder:text-on-scrim/70"
              />
              <button type="submit" className="h-11 rounded-full bg-primary px-4 text-sm font-semibold text-ink">
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusComposer() {
  const open = useNara((s) => s.composing);
  const setComposing = useNara((s) => s.setComposing);
  const postStatus = useNara((s) => s.postStatus);
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setCaption("");
      setImage(undefined);
      setError("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-scrim/60 sm:place-items-center" role="dialog" aria-modal="true" aria-label="New status">
      <form
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 shadow-sheet sm:rounded-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!caption.trim() && !image) {
            setError("Add a line or a photo.");
            return;
          }
          postStatus(caption, image);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">New status</h2>
          <IconButton label="Close" onClick={() => setComposing(false)}>
            <X className="size-5" />
          </IconButton>
        </div>
        {image ? <img src={image} alt="" className="mt-3 h-52 w-full rounded-2xl object-cover" /> : null}
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="Say something quiet"
          rows={3}
          className="mt-3 w-full resize-none rounded-2xl border border-line bg-canvas px-3 py-3 text-base outline-none focus:border-primary"
        />
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-medium">
            <Plus className="size-4" />
            Photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void shrinkImage(file)
                  .then((src) => {
                    setImage(src);
                    setError("");
                  })
                  .catch(() => setError("Choose a smaller photo."));
              }}
            />
          </label>
          <button type="submit" className={cn("h-11 flex-1 rounded-full bg-primary font-semibold text-ink")}>
            Post
          </button>
        </div>
      </form>
    </div>
  );
}

export function MediaLightbox() {
  const media = useNara((s) => s.media);
  const closeMedia = useNara((s) => s.closeMedia);
  if (!media) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/92 p-4" role="dialog" aria-modal="true" aria-label="Photo">
      <IconButton label="Close photo" className="absolute top-3 right-3 text-on-scrim hover:bg-on-scrim/10" onClick={closeMedia}>
        <X className="size-5" />
      </IconButton>
      <figure className="max-h-full max-w-3xl">
        <img src={media.src} alt={media.caption || "Shared photo"} className="max-h-[80dvh] w-full rounded-2xl object-contain" />
        {media.caption ? <figcaption className="mt-3 text-center text-sm text-on-scrim">{media.caption}</figcaption> : null}
      </figure>
    </div>
  );
}
