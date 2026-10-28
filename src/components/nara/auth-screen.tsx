import { Mail } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { RemoteAuthScreen } from "@/components/nara/auth-remote";
import { Mark } from "@/components/nara/ui";
import { remoteEnabled } from "@/lib/api";
import { useNara } from "@/lib/store";

type Step = "email" | "code" | "name";

function makeCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

export function AuthScreen() {
  const completeLogin = useNara((s) => s.completeLogin);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [expected, setExpected] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [sending, setSending] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [inbox, setInbox] = useState(false);

  useEffect(() => {
    if (!shake) return;
    const id = window.setTimeout(() => setShake(false), 300);
    return () => window.clearTimeout(id);
  }, [shake]);

  function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setError("Enter a real email address.");
      return;
    }
    setEmail(next);
    setError("");
    setSending(true);
    setInbox(false);
    window.setTimeout(() => {
      const fresh = makeCode();
      setExpected(fresh);
      setCode("");
      setAttempts(0);
      setSending(false);
      setInbox(true);
      setStep("code");
      setName(next.split("@")[0]?.replace(/[._-]+/g, " ") ?? "");
    }, 700);
  }

  function verify(next = code) {
    if (attempts >= 5) {
      setError("Request a new code.");
      return;
    }
    if (next.length !== 6) {
      setError("Enter all six digits.");
      return;
    }
    if (next !== expected) {
      setAttempts((n) => n + 1);
      setError("That code doesn't match.");
      setShake(true);
      setCode("");
      return;
    }
    setError("");
    setStep("name");
  }

  function finish(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("Add the name people should see.");
      return;
    }
    completeLogin(email, trimmed);
  }

  if (remoteEnabled) return <RemoteAuthScreen />;

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
              A quiet messenger. Chats stay on this device, status fades into the day, notes lock
              behind a PIN.
            </p>
          </div>
          <p className="text-sm text-on-scrim/80">End-to-end badges here are a simulation.</p>
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

          {step === "email" ? (
            <form onSubmit={sendCode} className="rise">
              <h1 className="font-display text-4xl text-fg">Sign in</h1>
              <p className="mt-2 text-muted">We'll stage a one-time code in a demo inbox. No email is sent.</p>
              <label className="mt-8 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@domain.com"
                className="mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-primary"
              />
              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={sending}
                className="mt-6 h-12 w-full rounded-full bg-primary font-semibold text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
              >
                {sending ? "Sending code…" : "Send code"}
              </button>
            </form>
          ) : null}

          {step === "code" ? (
            <form
              className={shake ? "shake" : undefined}
              onSubmit={(event) => {
                event.preventDefault();
                verify();
              }}
            >
              <h1 className="font-display text-4xl">Check the code</h1>
              <p className="mt-2 text-muted">
                Staged for <span className="text-fg">{email}</span>
              </p>
              <label className="mt-8 block text-sm font-medium" htmlFor="otp">
                Six-digit code
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                  setError("");
                  if (next.length === 6) verify(next);
                }}
                className="otp-input mt-2 h-14 w-full rounded-2xl border border-line bg-surface text-center text-2xl outline-none focus:border-primary"
              />
              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              {inbox ? (
                <article className="rise mt-5 rounded-2xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Mail className="size-4 text-primary" />
                    Demo inbox
                  </div>
                  <p className="mt-3 text-sm">From Nara · verify@nara.app</p>
                  <p className="mt-3 text-sm text-muted">Your sign-in code</p>
                  <p className="mt-1 font-display text-4xl tracking-widest text-fg">{expected}</p>
                  <p className="mt-3 text-sm text-muted">
                    Nothing was emailed. The code stays on this screen so you can finish signing in.
                  </p>
                  <button
                    type="button"
                    onClick={() => verify(expected)}
                    className="mt-4 h-11 rounded-full bg-primary px-4 text-sm font-semibold text-ink transition-transform duration-150 active:scale-[0.96]"
                  >
                    Use this code
                  </button>
                </article>
              ) : null}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setInbox(false);
                    setError("");
                  }}
                  className="h-11 flex-1 rounded-full bg-surface-2 font-medium"
                >
                  Change email
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  className="h-11 flex-1 rounded-full bg-surface-2 font-medium"
                >
                  Resend
                </button>
              </div>
            </form>
          ) : null}

          {step === "name" ? (
            <form onSubmit={finish} className="rise">
              <h1 className="font-display text-4xl">What should people call you?</h1>
              <p className="mt-2 text-muted">This name stays in this browser with your chats.</p>
              <label className="mt-8 block text-sm font-medium" htmlFor="name">
                Display name
              </label>
              <input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                className="mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-primary"
              />
              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="mt-6 h-12 w-full rounded-full bg-primary font-semibold text-ink transition-transform duration-150 active:scale-[0.96]"
              >
                Enter Nara
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
