# Nara – WhatsApp-style messenger

Frontend: React + TanStack Start (deploy on Vercel from GitHub).
Backend: Cloudflare Worker in [`backend/`](backend/README.md) (D1 + R2 + Durable Objects).

## Features (with backend)
Email OTP sign-up/sign-in with username, optional phone verification, find people by username,
live messages, typing indicator, online / last seen, sent-delivered-read ticks, photos / voice
notes / files, 24h status stories with view tracking, browser + email notifications,
notes vault (PIN, local), AI Nara Guide (optional), light/dark theme.

## Setup
1. Deploy the backend first: see `backend/README.md`.
2. Push this repo to GitHub, import it in Vercel.
3. Vercel env vars: `VITE_API_URL` (your Worker URL), optional `XAI_API_KEY` (Nara Guide).
4. Deploy.

Without `VITE_API_URL` the app runs in an offline demo mode (data stays in the browser).

## Local
```bash
npm install
echo "VITE_API_URL=http://localhost:8787" > .env.local   # backend: cd backend && npm run dev
npm run dev          # http://localhost:8080
```
Scripts: `npm run typecheck` · `npm test` · `npm run lint` · `npm run build`
