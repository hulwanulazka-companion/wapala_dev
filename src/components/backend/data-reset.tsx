"use client";
import { useState } from "react";
import { Field, Modal, Notice } from "../ui";
import { backendApi } from "./api";
type Preview = {
  count: number;
  blocked: number;
  snapshot: string;
  confirmation: string;
};
export function DataReset({
  target,
  csrfToken,
  onReset,
}: {
  target: "members" | "inventory";
  csrfToken: string;
  onReset: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"archive" | "delete">("archive");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const label = target === "members" ? "anggota" : "inventaris";
  function close() {
    if (busy) return;
    setOpen(false);
    setPreview(null);
    setPassword("");
    setConfirmation("");
    setError("");
  }
  async function inspect() {
    setBusy(true);
    setError("");
    setPreview(null);
    setPassword("");
    setConfirmation("");
    try {
      setPreview(
        await backendApi<Preview>("/api/admin/data-reset", csrfToken, {
          target,
          mode,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pemeriksaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await backendApi<{ affected: number }>(
        "/api/admin/data-reset",
        csrfToken,
        { target, mode, snapshot: preview.snapshot, confirmation, password },
        "DELETE",
      );
      // Once committed, never offer the same destructive request again on refresh failure.
      setOpen(false);
      setPreview(null);
      setConfirmation("");
      setPassword("");
      setSuccess(
        `${result.affected} data ${label} ${mode === "archive" ? "diarsipkan" : "dihapus permanen"}.`,
      );
      try {
        await onReset();
      } catch {
        setSuccess(
          "Reset selesai. Muat ulang halaman untuk memperbarui daftar.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset gagal.");
      setPassword("");
      setPreview(null);
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="btn secondary"
        type="button"
        onClick={() => {
          setSuccess("");
          setMode("archive");
          setOpen(true);
        }}
      >
        Reset {label}
      </button>
      {success && <Notice>{success}</Notice>}
      <Modal open={open} title={`Reset ${label}`} onClose={close}>
        <Notice tone="error">
          Tindakan massal khusus Super User. Ekspor/backup data sebelum
          melanjutkan. Akun login, foto tersimpan, dan riwayat peminjaman tidak
          ikut dihapus.
        </Notice>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (preview) void submit();
            else void inspect();
          }}
        >
          <label className="field">
            Pilihan reset
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value as "archive" | "delete");
                setPreview(null);
                setPassword("");
                setConfirmation("");
                setError("");
              }}
            >
              <option value="archive">
                Arsipkan semua data aktif (bisa dipulihkan)
              </option>
              <option value="delete">
                Hapus permanen semua data, termasuk arsip
              </option>
            </select>
          </label>
          <p>
            {mode === "archive"
              ? "Data aktif disembunyikan dan tetap ada di menu Arsip. Identitas/kode tetap digunakan oleh data arsip."
              : "Tidak bisa dibatalkan dari aplikasi. Seluruh proses ditolak jika ada data yang masih terkait akun, koreksi anggota, atau riwayat peminjaman."}
          </p>
          {preview && (
            <>
              <Notice>
                {preview.count} data terdampak; {preview.blocked} data
                menghalangi reset.{" "}
                {target === "inventory" &&
                  mode === "archive" &&
                  "Peminjaman yang belum selesai/ditolak harus diselesaikan dahulu."}
              </Notice>
              <Field
                label={`Ketik: ${preview.confirmation}`}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                disabled={busy}
              />
              <Field
                label="Password Super User saat ini"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="button-row">
            <button
              className="btn primary"
              disabled={
                busy ||
                (!!preview &&
                  (preview.blocked > 0 ||
                    preview.count === 0 ||
                    confirmation !== preview.confirmation ||
                    !password))
              }
            >
              {busy
                ? "Memproses…"
                : preview
                  ? mode === "archive"
                    ? "Arsipkan semua"
                    : "Hapus permanen"
                  : "Periksa data terdampak"}
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Batal
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
