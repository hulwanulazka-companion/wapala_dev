"use client";
import { useState } from "react";
import type { listGenerations } from "@/server/domains/generations";
import { Empty, Field, Modal, Notice, Textarea, Upload } from "../ui";
import { backendApi, uploadMedia } from "./api";
import { MediaPreview } from "./media-preview";
type Row = Awaited<ReturnType<typeof listGenerations>>[number];
type Draft = Omit<Row, "version"> & { version?: number };
export function BackendGenerations({
  initialGenerations,
  csrfToken,
}: {
  initialGenerations: Row[];
  csrfToken: string;
}) {
  const [rows, setRows] = useState(initialGenerations),
    [draft, setDraft] = useState<Draft | null>(null),
    [query, setQuery] = useState(""),
    [archive, setArchive] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setRows(
      (
        await backendApi<{ generations: Row[] }>(
          "/api/admin/generations",
          csrfToken,
        )
      ).generations,
    );
  }
  async function save(value: Draft) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await backendApi("/api/admin/generations", csrfToken, value);
      await refresh();
      setDraft(null);
      setArchive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-toolbar">
        <Field
          label="Cari angkatan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setDraft({
              number: Math.max(0, ...rows.map((r) => r.number)) + 1,
              name: "",
              label: "",
              year: null,
              description: "",
              photo: "",
              archived: false,
            });
          }}
        >
          Tambah angkatan
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="generation-grid">
        {rows
          .filter((r) =>
            (r.name + " " + r.number + " " + r.label)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((row) => (
            <article className="panel" key={row.number}>
              {row.photo && (
                <img
                  src={row.photo}
                  alt={"Foto angkatan " + row.name}
                  loading="lazy"
                  width={400}
                  height={280}
                  style={{
                    width: "100%",
                    height: 180,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              )}
              <h2>
                {row.number}. {row.name}
              </h2>
              <p>
                {row.label}
                {row.year ? " · " + row.year : ""}
              </p>
              {row.archived && <p>Diarsipkan</p>}
              <div className="button-row">
                <button
                  className="btn secondary"
                  onClick={() => {
                    setError("");
                    setDraft(row);
                  }}
                >
                  Edit
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setError("");
                    setArchive(row);
                  }}
                >
                  {row.archived ? "Pulihkan" : "Arsipkan"}
                </button>
              </div>
            </article>
          ))}
      </div>
      {!rows.length && (
        <Empty
          title="Belum ada angkatan"
          description="Tambahkan angkatan atau jalankan import paket sumber."
        />
      )}
      <Modal
        open={!!draft}
        title={draft?.version ? "Edit angkatan" : "Tambah angkatan"}
        onClose={() => {
          if (!busy) setDraft(null);
        }}
      >
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(draft);
            }}
          >
            <div className="form-grid">
              <Field
                label="Nomor angkatan"
                type="number"
                min={1}
                max={5000}
                required
                disabled={!!draft.version}
                value={draft.number}
                onChange={(e) =>
                  setDraft({ ...draft, number: Number(e.target.value) })
                }
              />
              <Field
                label="Nama angkatan"
                required
                maxLength={300}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <Field
                label="Label angkatan"
                maxLength={300}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
              <Field
                label="Tahun (opsional)"
                type="number"
                min={1900}
                max={2200}
                value={draft.year ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    year: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <Textarea
              label="Keterangan"
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
            />
            <Upload
              label="Foto angkatan"
              kind="photo"
              setError={setError}
              onFiles={async (files) => {
                if (!files[0] || busy) return;
                setBusy(true);
                setError("");
                try {
                  const photo = await uploadMedia(
                    files[0],
                    "generation-photo",
                    csrfToken,
                  );
                  setDraft((old) => (old ? { ...old, photo } : old));
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Upload gagal.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <MediaPreview src={draft.photo} label="Foto angkatan" />
            {draft.photo && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setDraft({ ...draft, photo: "" })}
              >
                Hapus foto
              </button>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan angkatan"}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!archive}
        title={archive?.archived ? "Pulihkan angkatan?" : "Arsipkan angkatan?"}
        onClose={() => {
          if (!busy) setArchive(null);
        }}
      >
        {archive && (
          <>
            <p>
              {archive.name}. Data dan foto tetap disimpan; angkatan yang
              diarsipkan tidak tampil di website publik.
            </p>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void save({ ...archive, archived: !archive.archived })
                }
              >
                {archive.archived ? "Pulihkan" : "Arsipkan"}
              </button>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setArchive(null)}
              >
                Batal
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
