"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "../ui";
import { Logo } from "../shell";
import { authContext, authPost, type AuthContext } from "./client-api";
export function PortalLogin() {
  const [context, setContext] = useState<AuthContext | null>(null),
    [email, setEmail] = useState("superuser@wapala.org"),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [token, setToken] = useState(""),
    [recovery, setRecovery] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    authContext(abort.signal)
      .then(setContext)
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Layanan login belum siap.",
          );
      });
    return () => abort.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!context || busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (recovery) {
        const result = await authPost("recovery", { email }, context.csrfToken);
        setMessage(result.message || "Permintaan diterima.");
      } else if (context.setupRequired) {
        if (password !== confirmation)
          throw new Error("Konfirmasi password belum sesuai.");
        const result = await authPost(
          "bootstrap",
          { token, password },
          context.csrfToken,
        );
        setPassword("");
        setConfirmation("");
        setToken("");
        setContext(await authContext());
        setMessage(result.message || "Akun dibuat. Silakan login.");
      } else {
        const result = await authPost(
          "login",
          { email, password },
          context.csrfToken,
        );
        window.location.assign(result.redirectTo || "/admin/foundation");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-visual">
        <span className="login-visual-art" aria-hidden="true" />
        <div>
          <h1>
            Setiap perjalanan
            <br />
            berawal dari
            <br />
            persiapan.
          </h1>
          <p>Portal pengelolaan Wahana Pencinta Alam Telkom University.</p>
        </div>
      </section>
      <section className="login-form">
        <div>
          <Logo />
          <h2>
            {recovery
              ? "Pulihkan akses."
              : context?.setupRequired
                ? "Siapkan akun pertama."
                : "Masuk ke portal."}
          </h2>
          <p>
            {context?.setupRequired && !recovery
              ? "Gunakan token instalasi dari pengelola server untuk membuat Super User."
              : "Gunakan identitas akun yang diberikan pengelola WAPALA."}
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            <Field
              label="Email login"
              type="email"
              autoComplete="username"
              required
              value={email}
              disabled={context?.setupRequired && !recovery}
              onChange={(e) => setEmail(e.target.value)}
            />
            {context?.setupRequired && !recovery && (
              <Field
                label="Token instalasi"
                autoComplete="off"
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            )}
            {!recovery && (
              <Field
                label="Password"
                type="password"
                autoComplete={
                  context?.setupRequired ? "new-password" : "current-password"
                }
                minLength={context?.setupRequired ? 12 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
            {context?.setupRequired && !recovery && (
              <Field
                label="Ulangi password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {message && <Notice>{message}</Notice>}
            <button className="btn primary" disabled={!context || busy}>
              {busy
                ? "Memproses…"
                : !context
                  ? "Menyiapkan login…"
                  : recovery
                    ? "Kirim petunjuk pemulihan"
                    : context.setupRequired
                      ? "Buat Super User"
                      : "Masuk"}
            </button>
          </form>
          <div className="button-row">
            {context &&
              !context.setupRequired &&
              context.emailRecoveryEnabled !== false && (
                <button
                  type="button"
                  className="text-link auth-text-button"
                  disabled={busy}
                  onClick={() => {
                    setRecovery(!recovery);
                    setError("");
                    setMessage("");
                    setPassword("");
                  }}
                >
                  {recovery ? "Kembali ke login" : "Lupa password?"}
                </button>
              )}
            <Link className="text-link" href="/">
              Kembali ke website
            </Link>
          </div>
          {context?.emailRecoveryEnabled === false && (
            <Notice>
              Email dinonaktifkan. Jika lupa password, hubungi pengelola. Super
              User dipulihkan melalui SSH; akun lainnya direset oleh Super User.
            </Notice>
          )}
        </div>
      </section>
    </main>
  );
}
