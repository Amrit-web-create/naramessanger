import { Ctx, Env, HttpError, hmac, json, now, randomToken, rateLimit, safeEqual } from "./util";

const MAX_BYTES = 8 * 1024 * 1024;
const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
]);
const SIGN_TTL = 6 * 3600_000;

export async function signMediaUrl(env: Env, origin: string, key: string): Promise<string> {
  const exp = now() + SIGN_TTL;
  const sig = await hmac(env.MEDIA_SECRET, `${key}.${exp}`);
  return `${origin}/media/${key}?e=${exp}&s=${sig}`;
}

/** POST /media  (raw body, Content-Type = file type, optional X-Filename) */
export async function uploadMedia(c: Ctx) {
  const user = c.user!;
  await rateLimit(c.env, `upload:${user.id}`, 30, 60);
  const len = Number(c.req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BYTES) throw new HttpError(413, "File must be under 8 MB.");
  const type = (c.req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) throw new HttpError(413, "File must be under 8 MB.");
  const contentType = INLINE_TYPES.has(type) ? type : "application/octet-stream";
  const key = `${user.id}.${randomToken(18)}`;
  await c.env.MEDIA.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { owner: user.id, name: (c.req.headers.get("x-filename") ?? "").slice(0, 120) },
  });
  return json({ key, url: await signMediaUrl(c.env, c.url.origin, key) });
}

/** GET /media/:key?e=..&s=..  (signed URL, no Authorization header needed for <img>/<audio>) */
export async function getMedia(c: Ctx) {
  const key = c.params.key!;
  const exp = Number(c.url.searchParams.get("e"));
  const sig = c.url.searchParams.get("s") ?? "";
  if (!exp || exp < now() || !safeEqual(sig, await hmac(c.env.MEDIA_SECRET, `${key}.${exp}`))) {
    throw new HttpError(403, "Link expired.");
  }
  const obj = await c.env.MEDIA.get(key, { range: c.req.headers });
  if (!obj) throw new HttpError(404, "Not found.");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-resource-policy", "cross-origin");
  const type = headers.get("content-type") ?? "";
  if (!INLINE_TYPES.has(type)) {
    const name = (obj.customMetadata?.name || "file").replace(/[^\w.\- ]/g, "_");
    headers.set("content-disposition", `attachment; filename="${name}"`);
  }
  let status = 200;
  const range = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && c.req.headers.has("range")) {
    let start: number;
    let end: number;
    if (range.suffix !== undefined) {
      start = Math.max(0, obj.size - range.suffix);
      end = obj.size - 1;
    } else {
      start = range.offset ?? 0;
      end = range.length !== undefined ? start + range.length - 1 : obj.size - 1;
    }
    headers.set("content-range", `bytes ${start}-${end}/${obj.size}`);
    headers.set("content-length", String(end - start + 1));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
}
