"use client";
import { useState } from "react";
import { Empty, Field, Modal, Notice, Textarea, Upload } from "../ui";
import { backendApi, uploadMedia } from "./api";
import { BackendImport } from "./import";
import { contentSlug } from "@/lib/content-slug";
import { DataReset } from "./data-reset";
export type BackendRecord = {
  id: string;
  version: number;
  fields: Record<string, string | string[]>;
  archived: boolean;
};
type Kind = "anggota" | "konten" | "galeri" | "buku";
export const recordFields: Record<Kind, Array<[string, string, string[]?]>> = {
  anggota: [
    ["nomor", "Nomor"],
    ["nama", "Nama"],
    ["nim", "NIM"],
    ["prodi", "Program studi"],
    ["angkatan", "Angkatan"],
    ["jenis_kelamin", "Jenis kelamin", ["Laki-laki", "Perempuan"]],
    ["nia", "NIA"],
    ["status", "Status", ["Aktif", "AB", "AM", "ALB", "AK"]],
    ["kontak", "Kontak"],
  ],
  konten: [
    ["judul", "Judul"],
    ["slug", "Slug"],
    ["tipe", "Tipe", ["Berita", "Announcement"]],
    ["kategori", "Kategori"],
    ["penulis", "Penulis"],
    ["tanggal", "Tanggal terbit"],
    ["status", "Status", ["Draft", "Publik"]],
    ["ringkasan", "Ringkasan"],
    ["isi", "Isi artikel"],
  ],
  galeri: [
    ["judul", "Judul album"],
    ["kategori", "Kategori"],
    ["lokasi", "Lokasi"],
    ["tanggal", "Tanggal kegiatan"],
    ["tanggal_upload", "Tanggal unggah"],
    ["deskripsi", "Deskripsi"],
    ["highlight", "Highlight beranda", ["Tidak", "Ya"]],
    ["status", "Status", ["Draft", "Publik"]],
  ],
  buku: [
    ["judul", "Judul buku"],
    ["kategori", "Kategori"],
    ["deskripsi", "Deskripsi"],
    ["status", "Status", ["Draft", "Publik"]],
  ],
};
export function BackendRecords({
  kind,
  initialRecords,
  csrfToken,
  canReset = false,
}: {
  kind: Kind;
  initialRecords: BackendRecord[];
  csrfToken: string;
  canReset?: boolean;
}) {
  const [records, setRecords] = useState(initialRecords),
    [draft, setDraft] = useState<
      (Partial<BackendRecord> & { fields: BackendRecord["fields"] }) | null
    >(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [archive, setArchive] = useState<BackendRecord | null>(null);
  const rows = records.filter(
    (r) =>
      !r.archived &&
      Object.values(r.fields)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function refresh() {
    const data = await backendApi<{ records: BackendRecord[] }>(
      "/api/admin/records/" + kind,
      csrfToken,
    );
    setRecords(data.records);
  }
  async function save(
    value: Partial<BackendRecord> & { fields: BackendRecord["fields"] },
  ) {
    setBusy(true);
    setError("");
    try {
      const fields =
        kind === "konten"
          ? {
              ...value.fields,
              slug: contentSlug(
                String(value.fields.slug || value.fields.judul || ""),
              ),
            }
          : value.fields;
      await backendApi("/api/admin/records/" + kind, csrfToken, {
        ...value,
        fields,
      });
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
        {kind === "anggota" && canReset && (
          <DataReset target="members" csrfToken={csrfToken} onReset={refresh} />
        )}
        {kind === "anggota" && (
          <>
            <a
              download
              className="btn secondary"
              href="/api/admin/export/members?format=xlsx"
            >
              Ekspor Excel
            </a>
            <a
              download
              className="btn secondary"
              href="/api/admin/export/members?format=pdf"
            >
              Ekspor PDF
            </a>
          </>
        )}
        <input
          aria-label="Cari record"
          placeholder="Cari nama atau judul"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setDraft({
              fields: Object.fromEntries(
                recordFields[kind].map(([key, , options]) => [
                  key,
                  options?.[0] || "",
                ]),
              ),
            });
          }}
        >
          Tambah{" "}
          {kind === "anggota"
            ? "anggota"
            : kind === "galeri"
              ? "album"
              : kind === "buku"
                ? "buku"
                : "konten"}
        </button>
        {kind === "anggota" && (
          <BackendImport
            kind="anggota"
            csrfToken={csrfToken}
            onImported={refresh}
          />
        )}
      </div>
      {error && !draft && !archive && <Notice tone="error">{error}</Notice>}
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {recordFields[kind].slice(0, 4).map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {recordFields[kind].slice(0, 4).map(([key]) => (
                    <td key={key}>{row.fields[key] || "—"}</td>
                  ))}
                  <td>
                    <div className="button-row">
                      <button
                        className="btn secondary"
                        onClick={() => {
                          setError("");
                          setDraft(structuredClone(row));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-link"
                        onClick={() => {
                          setError("");
                          setArchive(row);
                        }}
                      >
                        Arsipkan
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Belum ada data pada filter ini"
          description="Tambahkan data atau gunakan impor untuk memindahkan sumber organisasi."
        />
      )}
      <Modal
        open={!!draft}
        title={draft?.id ? "Edit data" : "Tambah data"}
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
              {recordFields[kind].map(([key, label, options]) =>
                options ? (
                  <label key={key}>
                    {label}
                    <select
                      value={String(draft.fields[key] || options[0])}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          fields: { ...draft.fields, [key]: e.target.value },
                        })
                      }
                    >
                      {options.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ) : ["isi", "ringkasan", "deskripsi"].includes(key) ? (
                  <Textarea
                    key={key}
                    label={label}
                    value={String(draft.fields[key] || "")}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        fields: { ...draft.fields, [key]: value },
                      })
                    }
                  />
                ) : (
                  <Field
                    key={key}
                    label={label}
                    type={key.startsWith("tanggal") ? "date" : "text"}
                    required={key === "judul"}
                    placeholder={
                      key === "slug"
                        ? "Otomatis dari judul bila kosong"
                        : undefined
                    }
                    value={String(draft.fields[key] || "")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        fields: { ...draft.fields, [key]: e.target.value },
                      })
                    }
                  />
                ),
              )}
            </div>
            <Upload
              label={
                kind === "anggota"
                  ? "Foto anggota (opsional, privat)"
                  : kind === "buku"
                    ? "Berkas buku"
                    : "Foto sampul"
              }
              kind={kind === "buku" ? "book" : "photo"}
              names={
                draft.fields[
                  kind === "anggota"
                    ? "foto"
                    : kind === "buku"
                      ? "file"
                      : "sampul"
                ]
                  ? ["Berkas tersimpan"]
                  : []
              }
              setError={setError}
              onFiles={async (files) => {
                if (!files[0] || busy) return;
                setBusy(true);
                setError("");
                try {
                  const url = await uploadMedia(
                    files[0],
                    kind === "anggota"
                      ? "member-photo"
                      : kind === "buku"
                        ? "book"
                        : "content",
                    csrfToken,
                  );
                  const key =
                    kind === "anggota"
                      ? "foto"
                      : kind === "buku"
                        ? "file"
                        : "sampul";
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          fields: { ...current.fields, [key]: url },
                        }
                      : current,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Upload gagal.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            {kind === "galeri" && (
              <>
                <Upload
                  label="Foto-foto album"
                  multiple
                  names={
                    Array.isArray(draft.fields.gambar)
                      ? draft.fields.gambar.map(
                          (_, index) => "Foto " + (index + 1),
                        )
                      : []
                  }
                  setError={setError}
                  onFiles={async (files) => {
                    if (busy) return;
                    setBusy(true);
                    setError("");
                    try {
                      for (const file of files) {
                        const url = await uploadMedia(
                          file,
                          "content",
                          csrfToken,
                        );
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                fields: {
                                  ...current.fields,
                                  gambar: [
                                    ...(Array.isArray(current.fields.gambar)
                                      ? current.fields.gambar
                                      : []),
                                    url,
                                  ],
                                },
                              }
                            : current,
                        );
                      }
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Upload gagal.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
                <Notice>
                  Tanggal boleh kosong bila sumber tidak menyediakannya. Waktu
                  impor tidak dianggap tanggal kegiatan.
                </Notice>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                {busy ? "Memproses…" : "Simpan"}
              </button>
              <button
                className="btn secondary"
                type="button"
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
        title="Arsipkan data?"
        onClose={() => {
          if (!busy) setArchive(null);
        }}
      >
        <p>Data disimpan dalam arsip, bukan dihapus permanen.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="button-row">
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              if (archive) void save({ ...archive, archived: true });
            }}
          >
            Arsipkan
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => setArchive(null)}
          >
            Batal
          </button>
        </div>
      </Modal>
    </>
  );
}
