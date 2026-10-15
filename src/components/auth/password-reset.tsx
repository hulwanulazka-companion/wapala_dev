"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Field, Notice } from "../ui";
import { authContext, authPost, type AuthContext } from "./client-api";
export function PasswordReset() {
  const [token, setToken] = useState(() =>
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
    ),
    [context, setContext] = useState<AuthContext | null>(null),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", "/wapala/reset");
    const controller = new AbortController();
    authContext(controller.signal)
      .then(setContext)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Layanan belum siap.");
      });
    return () => controller.abort();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !context) return;
    setBusy(true);
    setError("");
    try {
      if (password !== confirmation)
        throw new Error("Konfirmasi password belum sesuai.");
      await authPost(
        "reset",
        { token, newPassword: password },
        context.csrfToken,
      );
      setToken("");
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Tautan tidak valid atau sudah kedaluwarsa.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="container section auth-panel">
      <h1>Reset password.</h1>
      {context?.emailRecoveryEnabled === false ? (
        <Notice>
          Email dinonaktifkan. Hubungi pengelola untuk pemulihan akun melalui
          SSH atau reset oleh Super User.
        </Notice>
      ) : done ? (
        <>
          <Notice>Password diperbarui. Semua sesi lama sudah dicabut.</Notice>
          <Link className="btn primary" href="/wapala">
            Login kembali
          </Link>
        </>
      ) : (
        <form onSubmit={submit} aria-busy={busy}>
          <p>Tautan hanya dapat dipakai satu kali, dalam 30 menit.</p>
          <Field
            label="Password baru"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Ulangi password baru"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn primary" disabled={busy || !context || !token}>
            {busy ? "Memperbarui…" : "Reset password"}
          </button>
        </form>
      )}
    </main>
  );
}
