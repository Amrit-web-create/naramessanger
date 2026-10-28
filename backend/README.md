# Nara API – Cloudflare Worker backend

Everything runs on Cloudflare: **Workers** (API), **D1** (database), **R2** (images / voice notes /
status media), **Durable Objects** (WebSocket realtime: online status, typing, live messages).

| Feature | How |
|---|---|
| Sign up / sign in | Email one-time code (OTP), username + email + name, optional phone |
| Sessions | Opaque random session token (stored hashed in D1, revocable, 30 days). No JWT. |
| Email OTP | Resend API (`RESEND_API_KEY`). 6 digits, 10 min expiry, 5 attempts, rate limited |
| Phone verification | Optional, Twilio SMS (`TWILIO_*`). Without it `/auth/phone/*` returns 503 |
| Chats | 1-to-1, find people by username, pin / mute, sent → delivered → read receipts |
| Realtime | WebSocket `/ws`: live messages, typing, online / last seen, status updates |
| Stories (status) | 24 h photos/text, view tracking + "viewed by" notification, auto-cleanup (cron) |
| Notifications | Stored in D1 + pushed live; offline users get an email (throttled 1/hour) |
| Media | Upload to R2 (max 8 MB), served via short-lived signed URLs with Range support |

## Deploy (once)

```bash
cd backend
npm install
npx wrangler login

npx wrangler d1 create nara            # copy the database_id into wrangler.toml
npx wrangler r2 bucket create nara-media
npx wrangler d1 migrations apply nara --remote

# secrets (use random 32+ char values)
npx wrangler secret put OTP_PEPPER
npx wrangler secret put MEDIA_SECRET
npx wrangler secret put RESEND_API_KEY      # https://resend.com (verify your sending domain)
# optional phone OTP:
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM
```

Edit `wrangler.toml`:
- `ALLOWED_ORIGINS` → your Vercel URL(s), comma separated
- `FROM_EMAIL` → a sender on your verified Resend domain
- keep `DEV_ECHO_OTP = "false"` in production

```bash
npm run deploy      # prints https://nara-api.<you>.workers.dev
```

Then in **Vercel → Project → Settings → Environment Variables** add
`VITE_API_URL = https://nara-api.<you>.workers.dev` and redeploy the frontend.

## Local development

```bash
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev          # http://localhost:8787
```
In the frontend root create `.env.local` with `VITE_API_URL=http://localhost:8787`.
`DEV_ECHO_OTP=true` (in `.dev.vars`) returns the OTP in the API response so you can test without email.

## API summary

Auth header: `Authorization: Bearer <token>` (token is returned by `/auth/verify`).

```
GET  /health
GET  /users/check?username=
POST /auth/register   {username,email,name,phone?}     -> emails OTP
POST /auth/login      {identifier}                     -> emails OTP (email or username)
POST /auth/verify     {identifier,code,purpose}        -> {token,user}
POST /auth/logout
POST /auth/phone/send {phone}   POST /auth/phone/verify {code}
GET|PATCH /me          GET /sessions    DELETE /sessions/:id
GET  /users/search?q=
GET|POST /chats        PATCH /chats/:id {pinned,muted}
GET|POST /chats/:id/messages     POST /chats/:id/read
POST /media (raw body)           GET /media/:key?e=&s=   (signed)
GET|POST /stories   POST /stories/:id/view   GET /stories/:id/views   DELETE /stories/:id
GET /notifications   POST /notifications/read
WS   /ws   (subprotocols: "nara.v1", "<token>")
```

## Known limits / next steps
- One global Durable Object handles all sockets. Fine for thousands of concurrent users;
  shard by user-id range if you outgrow it.
- Chats are 1-to-1 (no groups yet). Calls are UI only (no WebRTC signalling yet).
- Notifications are in-app + browser notifications while the tab is open, plus email when offline.
  True background push (Web Push / service worker) is not included.
- Messages are protected in transit (HTTPS/WSS) and at rest by Cloudflare, but are **not**
  end-to-end encrypted.
