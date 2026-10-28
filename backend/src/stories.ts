import { signMediaUrl } from "./media";
import { addNotification, pushTo } from "./push";
import { Ctx, HttpError, json, now, rateLimit, readJson, User } from "./util";

const STORY_TTL = 24 * 3600_000;

const VISIBLE = `(s.user_id = ?1 OR s.user_id IN (
  SELECT pm.user_id FROM chat_members cm
  JOIN chat_members pm ON pm.chat_id = cm.chat_id AND pm.user_id != cm.user_id
  WHERE cm.user_id = ?1))`;

export async function createStory(c: Ctx) {
  const me = c.user!;
  await rateLimit(c.env, `story:${me.id}`, 30, 86400);
  const body = await readJson(c.req);
  const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 300) : "";
  let mediaKey: string | null = null;
  if (body.mediaKey) {
    mediaKey = String(body.mediaKey).slice(0, 100);
    if (!mediaKey.startsWith(`${me.id}.`)) throw new HttpError(400, "Invalid media.");
    if (!(await c.env.MEDIA.head(mediaKey))) throw new HttpError(400, "Upload not found.");
  }
  if (!mediaKey && !caption) throw new HttpError(400, "Add a photo or some text.");
  const id = crypto.randomUUID();
  const t = now();
  await c.env.DB.prepare(
    "INSERT INTO stories (id, user_id, media_key, caption, created_at, expires_at) VALUES (?,?,?,?,?,?)",
  )
    .bind(id, me.id, mediaKey, caption, t, t + STORY_TTL)
    .run();
  const peers = await c.env.DB.prepare(
    `SELECT DISTINCT pm.user_id AS id FROM chat_members cm
     JOIN chat_members pm ON pm.chat_id = cm.chat_id AND pm.user_id != cm.user_id WHERE cm.user_id = ?`,
  )
    .bind(me.id)
    .all<{ id: string }>();
  await pushTo(c.env, peers.results.map((p) => p.id), { t: "story", userId: me.id });
  return json({ ok: true, id });
}

export async function listStories(c: Ctx) {
  const me = c.user!;
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.user_id, s.media_key, s.caption, s.created_at, u.username, u.name,
       EXISTS(SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = ?1) AS seen,
       (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS views
     FROM stories s JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > ?2 AND ${VISIBLE}
     ORDER BY s.created_at ASC`,
  )
    .bind(me.id, now())
    .all<{
      id: string;
      user_id: string;
      media_key: string | null;
      caption: string;
      created_at: number;
      username: string;
      name: string;
      seen: number;
      views: number;
    }>();

  const groups = new Map<
    string,
    { userId: string; username: string; name: string; mine: boolean; slides: unknown[]; allSeen: boolean }
  >();
  for (const r of rows.results) {
    const g = groups.get(r.user_id) ?? {
      userId: r.user_id,
      username: r.username,
      name: r.name,
      mine: r.user_id === me.id,
      slides: [],
      allSeen: true,
    };
    g.slides.push({
      id: r.id,
      image: r.media_key ? await signMediaUrl(c.env, c.url.origin, r.media_key) : undefined,
      caption: r.caption,
      time: r.created_at,
      seen: Boolean(r.seen),
      views: r.user_id === me.id ? r.views : undefined,
    });
    if (!r.seen) g.allSeen = false;
    groups.set(r.user_id, g);
  }
  return json({ stories: [...groups.values()] });
}

export async function viewStory(c: Ctx) {
  const me = c.user!;
  const row = await c.env.DB.prepare(
    `SELECT s.id, s.user_id FROM stories s WHERE s.id = ?2 AND s.expires_at > ?3 AND ${VISIBLE}`,
  )
    .bind(me.id, c.params.id!, now())
    .first<{ id: string; user_id: string }>();
  if (!row) throw new HttpError(404, "Story not found.");
  if (row.user_id === me.id) return json({ ok: true });
  const res = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO story_views (story_id, viewer_id, viewed_at) VALUES (?,?,?)",
  )
    .bind(row.id, me.id, now())
    .run();
  if (res.meta.changes > 0) {
    await addNotification(c.env, row.user_id, "story_view", {
      storyId: row.id,
      viewerId: me.id,
      viewerName: me.name,
    });
  }
  return json({ ok: true });
}

export async function storyViews(c: Ctx) {
  const owned = await c.env.DB.prepare("SELECT id FROM stories WHERE id = ? AND user_id = ?")
    .bind(c.params.id!, c.user!.id)
    .first();
  if (!owned) throw new HttpError(404, "Story not found.");
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.name, v.viewed_at FROM story_views v
     JOIN users u ON u.id = v.viewer_id WHERE v.story_id = ? ORDER BY v.viewed_at DESC`,
  )
    .bind(c.params.id!)
    .all<{ id: string; username: string; name: string; viewed_at: number }>();
  return json({
    viewers: rows.results.map((r) => ({ id: r.id, username: r.username, name: r.name, viewedAt: r.viewed_at })),
  });
}

export async function deleteStory(c: Ctx) {
  const row = await c.env.DB.prepare("SELECT media_key FROM stories WHERE id = ? AND user_id = ?")
    .bind(c.params.id!, c.user!.id)
    .first<{ media_key: string | null }>();
  if (!row) throw new HttpError(404, "Story not found.");
  await c.env.DB.prepare("DELETE FROM stories WHERE id = ?").bind(c.params.id!).run();
  if (row.media_key) await c.env.MEDIA.delete(row.media_key);
  return json({ ok: true });
}

export async function listNotifications(c: Ctx) {
  const rows = await c.env.DB.prepare(
    `SELECT id, type, data, created_at, read_at FROM notifications
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(c.user!.id)
    .all<{ id: string; type: string; data: string; created_at: number; read_at: number | null }>();
  const unread = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
  )
    .bind(c.user!.id)
    .first<{ n: number }>();
  return json({
    unread: unread?.n ?? 0,
    notifications: rows.results.map((r) => ({
      id: r.id,
      type: r.type,
      data: JSON.parse(r.data),
      createdAt: r.created_at,
      readAt: r.read_at,
    })),
  });
}

export async function readNotifications(c: Ctx) {
  const body = await readJson(c.req);
  if (Array.isArray(body.ids) && body.ids.length) {
    const ids = body.ids.filter((x): x is string => typeof x === "string").slice(0, 100);
    await c.env.DB.batch(
      ids.map((id) =>
        c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").bind(now(), id, c.user!.id),
      ),
    );
  } else {
    await c.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
      .bind(now(), c.user!.id)
      .run();
  }
  return json({ ok: true });
}

export type { User };
