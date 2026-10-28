import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useNara } from "@/lib/store";
import { enableNotifications, notificationsSupported } from "@/lib/sync";

const input =
  "h-11 w-full rounded-2xl border border-line bg-canvas px-4 text-sm outline-none focus:border-primary";
const btn = "h-11 shrink-0 rounded-full bg-surface-2 px-4 text-sm font-semibold disabled:opacity-60";

export function RemoteSettings() {
  const profile = useNara((s) => s.profile);
  const loginRemote = useNara((s) => s.loginRemote);
  const [perm, setPerm] = useState<string>(notificationsSupported() ? Notification.permission : "unsupported");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote("");
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm text-muted">@{profile.username}</p>

      <div>
        <p className="text-sm font-medium">Notifications</p>
        {perm === "granted" ? (
          <p className="mt-1 text-sm text-muted">On. You'll be notified of new messages while the app is in the background.</p>
        ) : perm === "unsupported" ? (
          <p className="mt-1 text-sm text-muted">This browser does not support notifications.</p>
        ) : perm === "denied" ? (
          <p className="mt-1 text-sm text-muted">Blocked. Allow notifications in your browser's site settings.</p>
        ) : (
          <button type="button" className={`${btn} mt-2`} onClick={() => void enableNotifications().then((p) => setPerm(String(p)))}>
            Enable notifications
          </button>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">
          Phone {profile.phoneVerified ? <span className="text-primary">· verified</span> : null}
        </p>
        {!profile.phoneVerified ? (
          <>
            <div className="mt-2 flex gap-2">
              <input
                className={input}
                type="tel"
                value={phone}
                placeholder="+919876543210"
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
              />
              <button
                type="button"
                disabled={busy || phone.length < 8}
                className={btn}
                onClick={() =>
                  void run(async () => {
                    const r = await api.phoneSend(phone);
                    setSent(true);
                    if (r.devCode) setNote(`Dev mode code: ${r.devCode}`);
                  })
                }
              >
                Send
              </button>
            </div>
            {sent ? (
              <div className="mt-2 flex gap-2">
                <input
                  className={input}
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  placeholder="6-digit code"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  type="button"
                  disabled={busy || code.length !== 6}
                  className={btn}
                  onClick={() =>
                    void run(async () => {
                      await api.phoneVerify(code);
                      const { user } = await api.me();
                      loginRemote(user);
                      setSent(false);
                      setCode("");
                    })
                  }
                >
                  Verify
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">{profile.phone}</p>
        )}
        {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
