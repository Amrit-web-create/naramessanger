export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  HUB: DurableObjectNamespace;
  APP_NAME: string;
  ALLOWED_ORIGINS: string;
  FROM_EMAIL: string;
  DEV_ECHO_OTP?: string;
  NOTIFY_EMAIL?: string;
  // secrets (wrangler secret put ...)
  OTP_PEPPER: string;
  MEDIA_SECRET: string;
  RESEND_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const now = () => Date.now();
export const uuid = () => crypto.randomUUID();

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomCode(): string {
  // Uniform 6 digit code (rejection sampling to avoid modulo bias).
  const max = 4_294_000_000 - (4_294_000_000 % 1_000_000);
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]!;
    if (n < max) return String(n % 1_000_000).padStart(6, "0");
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (text.length > 100_000) throw new HttpError(413, "Body too large");
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object") throw new Error();
    return value as T;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function str(value: unknown, max: number, min = 0): string {
  if (typeof value !== "string") throw new HttpError(400, "Invalid input");
  const v = value.trim();
  if (v.length < min || v.length > max) throw new HttpError(400, "Invalid input");
  return v;
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;
export const PHONE_RE = /^\+[1-9]\d{7,14}$/;

/** Fixed-window rate limiter backed by D1. Throws 429 when exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number) {
  const t = now();
  const row = await env.DB.prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; reset_at: number }>();
  if (!row || row.reset_at <= t) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at",
    )
      .bind(key, t + windowSec * 1000)
      .run();
    return;
  }
  if (row.count >= limit) {
    throw new HttpError(429, "Too many requests. Try again later.");
  }
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
}

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-filename",
    "access-control-max-age": "86400",
    vary: "origin",
  };
  if (origin && allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  about: string;
  phone: string | null;
  phone_verified: number;
  email_verified: number;
  read_receipts: number;
  last_seen: number;
  created_at: number;
}

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  ip: string;
  ec: ExecutionContext;
  user?: User;
  sessionId?: string;
}

export const publicUser = (u: User) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  about: u.about,
  lastSeen: u.last_seen,
});

export const selfUser = (u: User) => ({
  ...publicUser(u),
  email: u.email,
  phone: u.phone,
  phoneVerified: Boolean(u.phone_verified),
  emailVerified: Boolean(u.email_verified),
  readReceipts: Boolean(u.read_receipts),
});
