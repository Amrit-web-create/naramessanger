import { sendOtpEmail, sendSms } from "./email";
import {
  Ctx,
  EMAIL_RE,
  Env,
  HttpError,
  PHONE_RE,
  USERNAME_RE,
  User,
  json,
  now,
  randomCode,
  randomToken,
  rateLimit,
  readJson,
  safeEqual,
  selfUser,
  sha256,
  str,
  uuid,
} from "./util";

const OTP_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 24 * 3600_000;
const MAX_OTP_ATTEMPTS = 5;

/* ---------- session auth ---------- */

export async function authenticate(
  req: Request,
  env: Env,
  tokenOverride?: string,
): Promise<{ user: User; sessionId: string } | null> {
  let token = tokenOverride;
  if (!token) {
    const header = req.headers.get("authorization") ?? "";
    if (header.startsWith("Bearer ")) token = header.slice(7).trim();
  }
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.last_used, u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, now())
    .first<User & { session_id: string; last_used: number }>();
  if (!row) return null;
  if (now() - row.last_used > 10 * 60_000) {
    await env.DB.prepare("UPDATE sessions SET last_used = ? WHERE id = ?")
      .bind(now(), row.session_id)
      .run();
  }
  const { session_id, last_used: _lu, ...user } = row;
  void _lu;
  return { user: user as User, sessionId: session_id };
}

async function createSession(env: Env, userId: string, ua: string | null): Promise<string> {
  const token = randomToken(32);
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (id, user_id, token_hash, user_agent, created_at, last_used, expires_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(uuid(), userId, await sha256(token), (ua ?? "").slice(0, 200), t, t, t + SESSION_TTL),
    // keep at most 10 sessions per user
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ? AND id NOT IN
       (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_used DESC LIMIT 10)`,
    ).bind(userId, userId),
  ]);
  return token;
}

/* ---------- OTP ---------- */

const otpHash = (env: Env, code: string, target: string, purpose: string) =>
  sha256(`${code}:${target}:${purpose}:${env.OTP_PEPPER}`);

async function issueOtp(env: Env, target: string, purpose: string, ip: string): Promise<string> {
  await rateLimit(env, `otp:t:${target}`, 5, 3600);
  await rateLimit(env, `otp:ip:${ip}`, 20, 3600);
  const code = randomCode();
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE otps SET used = 1 WHERE target = ? AND purpose = ? AND used = 0").bind(
      target,
      purpose,
    ),
    env.DB.prepare(
      "INSERT INTO otps (id, target, purpose, code_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)",
    ).bind(uuid(), target, purpose, await otpHash(env, code, target, purpose), t + OTP_TTL, t),
  ]);
  return code;
}

async function checkOtp(env: Env, target: string, purpose: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the 6-digit code.");
  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts FROM otps
     WHERE target = ? AND purpose = ? AND used = 0 AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(target, purpose, now())
    .first<{ id: string; code_hash: string; attempts: number }>();
  if (!row) throw new HttpError(400, "Invalid or expired code.");
  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    throw new HttpError(429, "Too many wrong attempts. Request a new code.");
  }
  await env.DB.prepare("UPDATE otps SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
  if (!safeEqual(row.code_hash, await otpHash(env, code, target, purpose))) {
    throw new HttpError(400, "That code doesn't match.");
  }
  await env.DB.prepare("UPDATE otps SET used = 1 WHERE id = ?").bind(row.id).run();
}

const devEcho = (env: Env, code: string) => (env.DEV_ECHO_OTP === "true" ? { devCode: code } : {});

async function findByIdentifier(env: Env, identifier: string): Promise<User | null> {
  const id = identifier.trim().replace(/^@/, "");
  return env.DB.prepare("SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1")
    .bind(id, id)
    .first<User>();
}

/* ---------- handlers ---------- */

export async function checkUsername(c: Ctx) {
  await rateLimit(c.env, `uname:${c.ip}`, 120, 3600);
  const username = c.url.searchParams.get("username") ?? "";
  if (!USERNAME_RE.test(username)) return json({ available: false, reason: "invalid" });
  const row = await c.env.DB.prepare("SELECT 1 AS x FROM users WHERE username = ?")
    .bind(username)
    .first();
  return json({ available: !row });
}

export async function register(c: Ctx) {
  const body = await readJson(c.req);
  const username = str(body.username, 24, 3);
  const email = str(body.email, 320, 5).toLowerCase();
  const name = str(body.name, 40, 1);
  const phone = body.phone ? str(body.phone, 20) : null;
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, "Username: 3-24 letters, numbers, _ or .");
  }
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a real email address.");
  if (phone && !PHONE_RE.test(phone)) throw new HttpError(400, "Phone must look like +919876543210.");

  const env = c.env;
  const byEmail = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
  if (byEmail && byEmail.email_verified) {
    throw new HttpError(409, "This email is already registered. Sign in instead.");
  }
  const byName = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
  if (byName && byName.id !== byEmail?.id) throw new HttpError(409, "That username is taken.");
  if (phone) {
    const byPhone = await env.DB.prepare("SELECT id FROM users WHERE phone = ?")
      .bind(phone)
      .first<{ id: string }>();
    if (byPhone && byPhone.id !== byEmail?.id) throw new HttpError(409, "That phone is already in use.");
  }

  if (byEmail) {
    await env.DB.prepare("UPDATE users SET username = ?, name = ?, phone = ? WHERE id = ?")
      .bind(username, name, phone, byEmail.id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO users (id, username, email, name, phone, created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(uuid(), username, email, name, phone, now())
      .run();
  }
  const code = await issueOtp(env, email, "verify", c.ip);
  if (env.DEV_ECHO_OTP !== "true") await sendOtpEmail(env, email, code);
  return json({ ok: true, ...devEcho(env, code) });
}

export async function login(c: Ctx) {
  const body = await readJson(c.req);
  const identifier = str(body.identifier, 320, 3);
  const user = await findByIdentifier(c.env, identifier);
  if (user && user.email_verified) {
    const code = await issueOtp(c.env, user.email, "login", c.ip);
    if (c.env.DEV_ECHO_OTP !== "true") await sendOtpEmail(c.env, user.email, code);
    return json({ ok: true, ...devEcho(c.env, code) });
  }
  // Same response either way so accounts cannot be enumerated.
  await rateLimit(c.env, `otp:ip:${c.ip}`, 20, 3600);
  return json({ ok: true });
}

export async function verify(c: Ctx) {
  await rateLimit(c.env, `verify:${c.ip}`, 40, 3600);
  const body = await readJson(c.req);
  const identifier = str(body.identifier, 320, 3);
  const code = str(body.code, 6, 6);
  const purpose = body.purpose === "verify" ? "verify" : "login";
  const user = await findByIdentifier(c.env, identifier);
  if (!user) throw new HttpError(400, "Invalid or expired code.");
  await checkOtp(c.env, user.email, purpose, code);
  if (!user.email_verified) {
    await c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(user.id).run();
    user.email_verified = 1;
  }
  const token = await createSession(c.env, user.id, c.req.headers.get("user-agent"));
  return json({ token, user: selfUser(user) });
}

export async function logout(c: Ctx) {
  await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(c.sessionId!).run();
  return json({ ok: true });
}

export async function me(c: Ctx) {
  return json({ user: selfUser(c.user!) });
}

export async function updateMe(c: Ctx) {
  const body = await readJson(c.req);
  const u = c.user!;
  const name = body.name !== undefined ? str(body.name, 40, 1) : u.name;
  const about = body.about !== undefined ? str(body.about, 140) : u.about;
  const receipts =
    typeof body.readReceipts === "boolean" ? (body.readReceipts ? 1 : 0) : u.read_receipts;
  await c.env.DB.prepare("UPDATE users SET name = ?, about = ?, read_receipts = ? WHERE id = ?")
    .bind(name, about, receipts, u.id)
    .run();
  return json({ user: selfUser({ ...u, name, about, read_receipts: receipts }) });
}

export async function listSessions(c: Ctx) {
  const rows = await c.env.DB.prepare(
    "SELECT id, user_agent, created_at, last_used FROM sessions WHERE user_id = ? ORDER BY last_used DESC",
  )
    .bind(c.user!.id)
    .all<{ id: string; user_agent: string; created_at: number; last_used: number }>();
  return json({
    sessions: rows.results.map((r) => ({
      id: r.id,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      lastUsed: r.last_used,
      current: r.id === c.sessionId,
    })),
  });
}

export async function deleteSession(c: Ctx) {
  await c.env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?")
    .bind(c.params.id!, c.user!.id)
    .run();
  return json({ ok: true });
}

/* ---------- phone verification (optional, needs Twilio secrets) ---------- */

export async function phoneSend(c: Ctx) {
  const body = await readJson(c.req);
  const phone = str(body.phone, 20);
  if (!PHONE_RE.test(phone)) throw new HttpError(400, "Phone must look like +919876543210.");
  const taken = await c.env.DB.prepare("SELECT id FROM users WHERE phone = ? AND id != ?")
    .bind(phone, c.user!.id)
    .first();
  if (taken) throw new HttpError(409, "That phone is already in use.");
  await c.env.DB.prepare("UPDATE users SET phone = ?, phone_verified = 0 WHERE id = ?")
    .bind(phone, c.user!.id)
    .run();
  const code = await issueOtp(c.env, `phone:${phone}`, "phone", c.ip);
  if (c.env.DEV_ECHO_OTP !== "true") {
    await sendSms(c.env, phone, `${c.env.APP_NAME || "Nara"} code: ${code}`);
  }
  return json({ ok: true, ...devEcho(c.env, code) });
}

export async function phoneVerify(c: Ctx) {
  const body = await readJson(c.req);
  const code = str(body.code, 6, 6);
  const phone = c.user!.phone;
  if (!phone) throw new HttpError(400, "Add a phone number first.");
  await checkOtp(c.env, `phone:${phone}`, "phone", code);
  await c.env.DB.prepare("UPDATE users SET phone_verified = 1 WHERE id = ?").bind(c.user!.id).run();
  return json({ ok: true });
}
