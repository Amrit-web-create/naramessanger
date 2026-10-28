import { sendEmail } from "./email";
import { signMediaUrl } from "./media";
import { addNotification, hubStub, pushTo } from "./push";
import {
  Ctx,
  Env,
  HttpError,
  json,
  now,
  publicUser,
  rateLimit,
  readJson,
  str,
  User,
  uuid,
} from "./util";

type MsgRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  media_key: string | null;
  media_kind: string | null;
  media_name: string | null;
  duration_ms: number | null;
  reply_to: string | null;
  created_at: number;
  delivered_at: number | null;
  read_at: number | null;
};

export async function mapMessage(env: Env, origin: string, m: MsgRow, meId: string) {
  let status: "sent" | "delivered" | "read" = "read";
  if (m.sender_id === meId) status = m.read_at ? "read" : m.delivered_at ? "delivered" : "sent";
  return {
    id: m.id,
    chatId: m.chat_id,
    senderId: m.sender_id,
    text: m.text,
    time: m.created_at,
    status,
    replyTo: m.reply_to ?? undefined,
    media: m.media_key
      ? {
          kind: m.media_kind ?? "file",
          src: await signMediaUrl(env, origin, m.media_key),
          name: m.media_name ?? undefined,
          durationMs: m.duration_ms ?? undefined,
        }
      : undefined,
  };
}

async function memberOf(env: Env, chatId: string, userId: string) {
  const rows = await env.DB.prepare("SELECT user_id FROM chat_members WHERE chat_id = ?")
    .bind(chatId)
    .all<{ user_id: string }>();
  const ids = rows.results.map((r) => r.user_id);
  if (!ids.includes(userId)) throw new HttpError(404, "Chat not found.");
  return ids;
}

type ChatRow = {
  id: string;
  pinned: number;
  muted: number;
  last_read_at: number;
  peer_id: string;
  username: string;
  name: string;
  about: string;
  last_seen: number;
};

async function buildChats(env: Env, origin: string, userId: string, onlyChat?: string) {
  const rows = await env.DB.prepare(
    `SELECT c.id, cm.pinned, cm.muted, cm.last_read_at,
            u.id AS peer_id, u.username, u.name, u.about, u.last_seen
     FROM chat_members cm
     JOIN chats c ON c.id = cm.chat_id
     JOIN chat_members pm ON pm.chat_id = c.id AND pm.user_id != cm.user_id
     JOIN users u ON u.id = pm.user_id
     WHERE cm.user_id = ? ${onlyChat ? "AND c.id = ?" : ""}`,
  )
    .bind(...(onlyChat ? [userId, onlyChat] : [userId]))
    .all<ChatRow>();
  if (!rows.results.length) return [];
  const msgs = await env.DB.batch<MsgRow>(
    rows.results.map((r) =>
      env.DB.prepare(
        `SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 40)
         ORDER BY created_at ASC`,
      ).bind(r.id),
    ),
  );
  const online = await onlineSet(env, rows.results.map((r) => r.peer_id));
  const out = [];
  for (let i = 0; i < rows.results.length; i++) {
    const r = rows.results[i]!;
    out.push({
      id: r.id,
      peer: { ...publicUser({ id: r.peer_id, username: r.username, name: r.name, about: r.about, last_seen: r.last_seen } as User), online: online.has(r.peer_id) },
      pinned: Boolean(r.pinned),
      muted: Boolean(r.muted),
      lastReadAt: r.last_read_at,
      messages: await Promise.all(msgs[i]!.results.map((m) => mapMessage(env, origin, m, userId))),
    });
  }
  return out;
}

async function onlineSet(env: Env, ids: string[]): Promise<Set<string>> {
  try {
    const res = await hubStub(env).fetch("https://hub/online", {
      method: "POST",
      body: JSON.stringify({ userIds: ids }),
    });
    return new Set(((await res.json()) as { online: string[] }).online);
  } catch {
    return new Set();
  }
}

export async function searchUsers(c: Ctx) {
  await rateLimit(c.env, `search:${c.user!.id}`, 100, 600);
  const q = (c.url.searchParams.get("q") ?? "").trim().replace(/^@/, "");
  if (q.length < 2) return json({ users: [] });
  const like = `${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM users WHERE email_verified = 1 AND id != ?
     AND (username LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\') ORDER BY username LIMIT 20`,
  )
    .bind(c.user!.id, like, like)
    .all<User>();
  return json({ users: rows.results.map(publicUser) });
}

export async function listChats(c: Ctx) {
  return json({ chats: await buildChats(c.env, c.url.origin, c.user!.id) });
}

export async function openChat(c: Ctx) {
  const body = await readJson(c.req);
  const me = c.user!;
  const peer = body.userId
    ? await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND email_verified = 1")
        .bind(str(body.userId, 64))
        .first<User>()
    : await c.env.DB.prepare("SELECT * FROM users WHERE username = ? AND email_verified = 1")
        .bind(str(body.username, 24, 3).replace(/^@/, ""))
        .first<User>();
  if (!peer) throw new HttpError(404, "User not found.");
  if (peer.id === me.id) throw new HttpError(400, "You cannot chat with yourself.");

  const dmKey = [me.id, peer.id].sort().join(":");
  let chat = await c.env.DB.prepare("SELECT id FROM chats WHERE dm_key = ?")
    .bind(dmKey)
    .first<{ id: string }>();
  let created = false;
  if (!chat) {
    const id = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO chats (id, dm_key, created_at) VALUES (?,?,?)").bind(id, dmKey, now()),
      c.env.DB.prepare("INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)").bind(id, me.id),
      c.env.DB.prepare("INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)").bind(id, peer.id),
    ]);
    chat = { id };
    created = true;
  }
  const [mine] = await buildChats(c.env, c.url.origin, me.id, chat.id);
  if (created) {
    const [theirs] = await buildChats(c.env, c.url.origin, peer.id, chat.id);
    await pushTo(c.env, [peer.id], { t: "chat", chat: theirs });
  }
  return json({ chat: mine });
}

export async function updateChat(c: Ctx) {
  const body = await readJson(c.req);
  const chatId = c.params.id!;
  await memberOf(c.env, chatId, c.user!.id);
  if (typeof body.pinned === "boolean") {
    await c.env.DB.prepare("UPDATE chat_members SET pinned = ? WHERE chat_id = ? AND user_id = ?")
      .bind(body.pinned ? 1 : 0, chatId, c.user!.id)
      .run();
  }
  if (typeof body.muted === "boolean") {
    await c.env.DB.prepare("UPDATE chat_members SET muted = ? WHERE chat_id = ? AND user_id = ?")
      .bind(body.muted ? 1 : 0, chatId, c.user!.id)
      .run();
  }
  return json({ ok: true });
}

export async function listMessages(c: Ctx) {
  const chatId = c.params.id!;
  await memberOf(c.env, chatId, c.user!.id);
  const before = Number(c.url.searchParams.get("before")) || now() + 1;
  const limit = Math.min(Number(c.url.searchParams.get("limit")) || 40, 100);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? AND created_at < ?
     ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC`,
  )
    .bind(chatId, before, limit)
    .all<MsgRow>();
  return json({
    messages: await Promise.all(rows.results.map((m) => mapMessage(c.env, c.url.origin, m, c.user!.id))),
  });
}

export async function sendMessage(c: Ctx) {
  const me = c.user!;
  const chatId = c.params.id!;
  await rateLimit(c.env, `msg:${me.id}`, 60, 60);
  const members = await memberOf(c.env, chatId, me.id);
  const peerId = members.find((id) => id !== me.id)!;
  const body = await readJson(c.req);

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length > 4000) throw new HttpError(400, "Message is too long.");
  let mediaKey: string | null = null;
  let mediaKind: string | null = null;
  let mediaName: string | null = null;
  let durationMs: number | null = null;
  if (body.mediaKey) {
    mediaKey = str(body.mediaKey, 100);
    if (!mediaKey.startsWith(`${me.id}.`)) throw new HttpError(400, "Invalid media.");
    if (!(await c.env.MEDIA.head(mediaKey))) throw new HttpError(400, "Upload not found.");
    mediaKind = ["image", "voice", "file"].includes(String(body.mediaKind)) ? String(body.mediaKind) : "file";
    mediaName = typeof body.mediaName === "string" ? body.mediaName.slice(0, 120) : null;
    durationMs = Number.isFinite(body.durationMs) ? Math.min(Number(body.durationMs), 3_600_000) : null;
  }
  if (!text && !mediaKey) throw new HttpError(400, "Message is empty.");

  let replyTo: string | null = null;
  if (typeof body.replyTo === "string") {
    const r = await c.env.DB.prepare("SELECT id FROM messages WHERE id = ? AND chat_id = ?")
      .bind(body.replyTo, chatId)
      .first<{ id: string }>();
    replyTo = r?.id ?? null;
  }

  const id = uuid();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO messages (id, chat_id, sender_id, text, media_key, media_kind, media_name, duration_ms, reply_to, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(id, chatId, me.id, text, mediaKey, mediaKind, mediaName, durationMs, replyTo, t)
    .run();

  const row: MsgRow = {
    id,
    chat_id: chatId,
    sender_id: me.id,
    text,
    media_key: mediaKey,
    media_kind: mediaKind,
    media_name: mediaName,
    duration_ms: durationMs,
    reply_to: replyTo,
    created_at: t,
    delivered_at: null,
    read_at: null,
  };

  const delivered = await pushTo(c.env, [peerId], {
    t: "message",
    chatId,
    message: await mapMessage(c.env, c.url.origin, row, peerId),
    from: { id: me.id, name: me.name, username: me.username },
  });
  if (delivered.includes(peerId)) {
    row.delivered_at = now();
    await c.env.DB.prepare("UPDATE messages SET delivered_at = ? WHERE id = ?").bind(row.delivered_at, id).run();
  } else {
    c.ec.waitUntil(notifyOffline(c.env, peerId, me, chatId, text || "Sent an attachment").catch((e) => console.error(e)));
  }
  // keep the sender's other devices in sync
  await pushTo(c.env, [me.id], {
    t: "message",
    chatId,
    message: await mapMessage(c.env, c.url.origin, row, me.id),
    echo: true,
  });
  return json({ message: await mapMessage(c.env, c.url.origin, row, me.id) });
}

async function notifyOffline(env: Env, peerId: string, from: User, chatId: string, preview: string) {
  const muted = await env.DB.prepare("SELECT muted FROM chat_members WHERE chat_id = ? AND user_id = ?")
    .bind(chatId, peerId)
    .first<{ muted: number }>();
  if (muted?.muted) return;
  await addNotification(env, peerId, "message", {
    chatId,
    fromId: from.id,
    fromName: from.name,
    preview: preview.slice(0, 120),
  });
  if (env.NOTIFY_EMAIL !== "true") return;
  try {
    await rateLimit(env, `notifymail:${peerId}`, 1, 3600);
  } catch {
    return; // already emailed this hour
  }
  const peer = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(peerId).first<{ email: string }>();
  if (!peer) return;
  const app = env.APP_NAME || "Nara";
  await sendEmail(
    env,
    peer.email,
    `New message from ${from.name}`,
    `${from.name} sent you a message on ${app}. Open the app to read it.`,
  );
}

export async function markRead(c: Ctx) {
  const me = c.user!;
  const chatId = c.params.id!;
  const members = await memberOf(c.env, chatId, me.id);
  const t = now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").bind(t, chatId, me.id),
    c.env.DB.prepare(
      `UPDATE notifications SET read_at = ? WHERE user_id = ? AND type = 'message'
       AND read_at IS NULL AND json_extract(data, '$.chatId') = ?`,
    ).bind(t, me.id, chatId),
  ]);
  if (me.read_receipts) {
    const rows = await c.env.DB.prepare(
      `UPDATE messages SET read_at = ?, delivered_at = COALESCE(delivered_at, ?)
       WHERE chat_id = ? AND sender_id != ? AND read_at IS NULL RETURNING id`,
    )
      .bind(t, t, chatId, me.id)
      .all<{ id: string }>();
    if (rows.results.length) {
      await pushTo(
        c.env,
        members.filter((id) => id !== me.id),
        { t: "msg_status", chatId, ids: rows.results.map((r) => r.id), status: "read" },
      );
    }
  }
  return json({ ok: true });
}
