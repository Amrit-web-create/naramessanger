import {
  authenticate,
  checkUsername,
  deleteSession,
  listSessions,
  login,
  logout,
  me,
  phoneSend,
  phoneVerify,
  register,
  updateMe,
  verify,
} from "./auth";
import { listChats, listMessages, markRead, openChat, searchUsers, sendMessage, updateChat } from "./chat";
import { getMedia, uploadMedia } from "./media";
import {
  createStory,
  deleteStory,
  listNotifications,
  listStories,
  readNotifications,
  storyViews,
  viewStory,
} from "./stories";
import { hubStub } from "./push";
import { Ctx, Env, HttpError, corsHeaders, json, now } from "./util";

export { Hub } from "./hub";

type Handler = (c: Ctx) => Promise<Response>;
type Route = { method: string; parts: string[]; handler: Handler; auth: boolean };

const routes: Route[] = [];
function add(method: string, path: string, auth: boolean, handler: Handler) {
  routes.push({ method, parts: path.split("/").filter(Boolean), handler, auth });
}

// public
add("GET", "/health", false, async () => json({ ok: true, time: now() }));
add("GET", "/users/check", false, checkUsername);
add("POST", "/auth/register", false, register);
add("POST", "/auth/login", false, login);
add("POST", "/auth/verify", false, verify);
add("GET", "/media/:key", false, getMedia);
// authenticated
add("POST", "/auth/logout", true, logout);
add("GET", "/me", true, me);
add("PATCH", "/me", true, updateMe);
add("GET", "/sessions", true, listSessions);
add("DELETE", "/sessions/:id", true, deleteSession);
add("POST", "/auth/phone/send", true, phoneSend);
add("POST", "/auth/phone/verify", true, phoneVerify);
add("GET", "/users/search", true, searchUsers);
add("GET", "/chats", true, listChats);
add("POST", "/chats", true, openChat);
add("PATCH", "/chats/:id", true, updateChat);
add("GET", "/chats/:id/messages", true, listMessages);
add("POST", "/chats/:id/messages", true, sendMessage);
add("POST", "/chats/:id/read", true, markRead);
add("POST", "/media", true, uploadMedia);
add("GET", "/stories", true, listStories);
add("POST", "/stories", true, createStory);
add("POST", "/stories/:id/view", true, viewStory);
add("GET", "/stories/:id/views", true, storyViews);
add("DELETE", "/stories/:id", true, deleteStory);
add("GET", "/notifications", true, listNotifications);
add("POST", "/notifications/read", true, readNotifications);

function match(method: string, pathname: string) {
  const segs = pathname.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const p = r.parts[i]!;
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]!);
      else if (p !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

async function handleWebSocket(req: Request, env: Env): Promise<Response> {
  if (req.headers.get("upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
  // Token travels in the Sec-WebSocket-Protocol header (never in the URL).
  const protocols = (req.headers.get("sec-websocket-protocol") ?? "").split(",").map((s) => s.trim());
  const token = protocols.find((p) => p && p !== "nara.v1");
  const auth = await authenticate(req, env, token);
  if (!auth) return new Response("Unauthorized", { status: 401 });
  // Forward the original upgrade request; x-user-id is always overwritten by us.
  const forwarded = new Request(req);
  forwarded.headers.set("x-user-id", auth.user.id);
  return hubStub(env).fetch(forwarded);
}

export default {
  async fetch(req: Request, env: Env, ec: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === "/ws") return await handleWebSocket(req, env);

      const found = match(req.method, url.pathname);
      if (!found) throw new HttpError(404, "Not found.");
      const ctx: Ctx = {
        req,
        env,
        url,
        params: found.params,
        ip: req.headers.get("cf-connecting-ip") ?? "unknown",
        ec,
      };
      if (found.route.auth) {
        const auth = await authenticate(req, env);
        if (!auth) throw new HttpError(401, "Please sign in again.");
        ctx.user = auth.user;
        ctx.sessionId = auth.sessionId;
      }
      const res = await found.route.handler(ctx);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      out.headers.set("x-content-type-options", "nosniff");
      return out;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error("unhandled", e);
      return json({ error: e instanceof HttpError ? e.message : "Something went wrong." }, status, cors);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ec: ExecutionContext) {
    ec.waitUntil(cleanup(env));
  },
};

async function cleanup(env: Env) {
  const t = now();
  const expired = await env.DB.prepare("SELECT id, media_key FROM stories WHERE expires_at <= ?")
    .bind(t)
    .all<{ id: string; media_key: string | null }>();
  const keys = expired.results.map((s) => s.media_key).filter((k): k is string => Boolean(k));
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM stories WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM otps WHERE created_at < ?").bind(t - 24 * 3600_000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM rate_limits WHERE reset_at <= ?").bind(t),
    env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(t - 30 * 24 * 3600_000),
  ]);
}
