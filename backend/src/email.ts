import { Env, HttpError, PHONE_RE } from "./util";

export async function sendEmail(env: Env, to: string, subject: string, text: string, html?: string) {
  if (!env.RESEND_API_KEY) throw new HttpError(503, "Email is not configured on the server.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    console.error("resend failed", res.status, await res.text());
    throw new HttpError(502, "Could not send the email. Try again.");
  }
}

export async function sendOtpEmail(env: Env, to: string, code: string) {
  const app = env.APP_NAME || "Nara";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto">
<h2>${app}</h2><p>Your verification code:</p>
<p style="font-size:34px;letter-spacing:8px;font-weight:700">${code}</p>
<p style="color:#666">It expires in 10 minutes. If you did not request it, ignore this email.</p></div>`;
  await sendEmail(env, to, `${code} is your ${app} code`, `Your ${app} code is ${code}. It expires in 10 minutes.`, html);
}

export async function sendSms(env: Env, to: string, body: string) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) {
    throw new HttpError(503, "SMS is not configured on the server.");
  }
  if (!PHONE_RE.test(to)) throw new HttpError(400, "Phone must be in +countrycode format.");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
    },
  );
  if (!res.ok) {
    console.error("twilio failed", res.status, await res.text());
    throw new HttpError(502, "Could not send the SMS. Try again.");
  }
}
