import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mark } from "@/components/nara/ui";
import { api, ApiError, setToken } from "@/lib/api";
import { useNara } from "@/lib/store";

type Mode = "login" | "signup";

const field =
  "mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-primary";
const primary =
  "mt-6 h-12 w-full rounded-full bg-primary font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60";

export function RemoteAuthScreen() {
  const loginRemote = useNara((s) => s.loginRemote);
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<"form" | "code">("form");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const checkId = useRef(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    if (mode !== "signup" || !/^[a-zA-Z0-9_.]{3,24}$/.test(username)) {
      setAvailable(null);
      return;
    }
    const n = ++checkId.current;
    const id = window.setTimeout(() => {
      api
        .checkUsername(username)
        .then((r) => {
          if (checkId.current === n) setAvailable(r.available);
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(id);
  }, [username, mode]);

  const target = mode === "login" ? identifier.trim() : email.trim().toLowerCase();

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(identifier.trim())
          : await api.register({
              username: username.trim(),
              email: email.trim().toLowerCase(),
              name: name.trim(),
              phone: phone.trim() || undefined,
            });
      setDevCode(res.devCode ?? "");
      setCode("");
      setCooldown(30);
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.verify(target, value, mode === "signup" ? "verify" : "login");
      setToken(res.token);
      loginRemote(res.user);
    } catch (e) {
      setCode("");
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-canvas text-fg lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1fr)]">
      <section className="relative hidden overflow-hidden lg:block">
        <img src="/media/tea.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-scrim/55" />
        <div className="relative flex h-full flex-col justify-between p-10 text-on-scrim">
          <span className="grid size-12 place-items-center rounded-2xl bg-scrim text-primary">
            <Mark className="size-6" />
          </span>
          <div className="max-w-md">
            <p className="wordmark rise text-5xl">NARA</p>
            <p className="rise rise-2 mt-4 max-w-sm text-lg text-on-scrim">
              Message people by username. Live typing, online status, status updates and notifications.
            </p>
          </div>
          <p className="text-sm text-on-scrim/80">Sign in with a one-time code sent to your email.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-surface text-primary">
              <Mark className="size-5" />
            </span>
            <p className="wordmark text-2xl">NARA</p>
          </div>

          {step === "form" ? (
            <form onSubmit={sendCode} className="rise">
              <h1 className="font-display text-4xl">{mode === "login" ? "Sign in" : "Create account"}</h1>
              <p className="mt-2 text-muted">We'll email you a six-digit code. No password needed.</p>

              {mode === "login" ? (
                <>
                  <label className="mt-8 block text-sm font-medium" htmlFor="identifier">
                    Email or username
                  </label>
                  <input
                    id="identifier"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@domain.com or @username"
                    className={field}
                  />
                </>
              ) : (
                <>
                  <label className="mt-8 block text-sm font-medium" htmlFor="name">
                    Name
                  </label>
                  <input id="name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={field} />
                  <label className="mt-4 block text-sm font-medium" htmlFor="username">
                    Username
                  </label>
                  <input
                    id="username"
                    autoCapitalize="none"
                    value={username}
                    maxLength={24}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))}
                    placeholder="letters, numbers, _ or ."
                    className={field}
                  />
                  {available !== null ? (
                    <p className={`mt-1 text-sm ${available ? "text-primary" : "text-danger"}`}>
                      {available ? "Username is available" : "Username is taken"}
                    </p>
                  ) : null}
                  <label className="mt-4 block text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className={field}
                  />
                  <label className="mt-4 block text-sm font-medium" htmlFor="phone">
                    Phone <span className="text-muted">(optional, verify later)</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                    placeholder="+919876543210"
                    className={field}
                  />
                </>
              )}

              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className={primary}>
                {busy ? "Sending code…" : "Send code"}
              </button>
              <button
                type="button"
                className="mt-4 w-full text-center text-sm text-muted"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError("");
                }}
              >
                {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 6) void verify(code);
              }}
            >
              <h1 className="font-display text-4xl">Check your email</h1>
              <p className="mt-2 text-muted">
                We sent a code to <span className="text-fg">{mode === "login" ? "your account email" : target}</span>
              </p>
              <label className="mt-8 block text-sm font-medium" htmlFor="otp">
                Six-digit code
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                  setError("");
                  if (next.length === 6) void verify(next);
                }}
                className="otp-input mt-2 h-14 w-full rounded-2xl border border-line bg-surface text-center text-2xl outline-none focus:border-primary"
              />
              {devCode ? <p className="mt-3 text-sm text-muted">Dev mode code: {devCode}</p> : null}
              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy || code.length !== 6} className={primary}>
                {busy ? "Checking…" : "Verify"}
              </button>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("form");
                    setError("");
                  }}
                  className="h-11 flex-1 rounded-full bg-surface-2 font-medium"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={() => void sendCode()}
                  className="h-11 flex-1 rounded-full bg-surface-2 font-medium disabled:opacity-60"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
