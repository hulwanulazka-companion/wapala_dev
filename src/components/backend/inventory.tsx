"use client";
import { useState } from "react";
import type { listEquipment } from "@/server/domains/inventory";
import { Badge, Empty, Field, Modal, Notice, Upload } from "../ui";
import { BackendImport } from "./import";
import { backendApi, uploadMedia } from "./api";
import { MediaPreview } from "./media-preview";
import { DataReset } from "./data-reset";
type Equipment = Awaited<ReturnType<typeof listEquipment>>[number];
type Draft = Omit<Equipment, "id" | "version" | "archived"> & {
  id?: string;
  version?: number;
  archived?: boolean;
};
const blank = (): Draft => ({
  code: "",
  name: "",
  category: "",
  brand: "",
  typeColor: "",
  source: "",
  yearEntered: "",
  photo: "",
  total: 0,
  fit: 0,
  condition: "Baik",
  location: "",
  available: false,
  maxDays: 7,
  maxQuantity: 1,
  notes: "",
});
const fields = [
  ["code", "Kode inventaris"],
  ["name", "Nama alat"],
  ["category", "Kategori"],
  ["brand", "Merek"],
  ["typeColor", "Tipe / warna"],
  ["source", "Sumber"],
  ["yearEntered", "Tahun masuk"],
  ["total", "Jumlah total"],
  ["fit", "Jumlah layak"],
  ["location", "Lokasi penyimpanan"],
  ["maxDays", "Maksimal hari peminjaman"],
  ["maxQuantity", "Maksimal jumlah per pengajuan"],
  ["notes", "Catatan"],
] as const;
export function BackendInventory({
  initialEquipment,
  csrfToken,
  canReset = false,
}: {
  initialEquipment: Equipment[];
  csrfToken: string;
  canReset?: boolean;
}) {
  const [equipment, setEquipment] = useState(initialEquipment),
    [draft, setDraft] = useState<Draft | null>(null),
    [archive, setArchive] = useState<Equipment | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = equipment.filter(
    (e) =>
      !e.archived &&
      (e.code + " " + e.name + " " + e.category)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function refresh() {
    const data = await backendApi<{ equipment: Equipment[] }>(
      "/api/admin/inventory",
      csrfToken,
    );
    setEquipment(data.equipment);
  }
  async function save(value: Draft) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await backendApi("/api/admin/inventory", csrfToken, value);
      await refresh();
      setDraft(null);
      setArchive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Alat belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }
  async function toggleAvailability(row: Equipment) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await backendApi<Equipment>(
        "/api/admin/inventory",
        csrfToken,
        {
          id: row.id,
          version: row.version,
          available: !row.available,
        },
        "PATCH",
      );
      setEquipment((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Ketersediaan belum dapat diubah.",
      );
      // Refresh stale versions so a rejected concurrent change can be retried.
      try {
        await refresh();
      } catch {
        /* Preserve the original failure. */
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="admin-toolbar">
        {canReset && (
          <DataReset
            target="inventory"
            csrfToken={csrfToken}
            onReset={refresh}
          />
        )}
        <a
          download
          className="btn secondary"
          href="/api/admin/export/inventory?format=xlsx"
        >
          Ekspor Excel
        </a>
        <a
          download
          className="btn secondary"
          href="/api/admin/export/inventory?format=pdf"
        >
          Ekspor PDF
        </a>
        <input
          aria-label="Cari alat"
          placeholder="Kode, nama, atau kategori"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <BackendImport
          kind="inventaris"
          csrfToken={csrfToken}
          onImported={refresh}
        />
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setError("");
            setDraft(blank());
          }}
        >
          Tambah alat
        </button>
      </div>
      {error && !draft && !archive && <Notice tone="error">{error}</Notice>}
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kode / nama</th>
                <th>Kategori / lokasi</th>
                <th>Total / layak</th>
                <th>Ketersediaan publik</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.code}</strong>
                    {row.photo && (
                      <img
                        src={row.photo}
                        alt={"Foto " + row.name}
                        width={64}
                        height={64}
                        loading="lazy"
                        style={{
                          display: "block",
                          objectFit: "contain",
                          marginTop: 8,
                        }}
                      />
                    )}
                    <br />
                    {row.name}
                  </td>
                  <td>
                    {row.category}
                    <br />
                    {row.location}
                  </td>
                  <td>
                    {row.total} / {row.fit}
                  </td>
                  <td>
                    <Badge>
                      {row.available ? "Tersedia" : "Tidak tersedia"}
                    </Badge>
                  </td>
                  <td>
                    <div className="inventory-actions">
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setDraft(structuredClone(row));
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inventory-availability"
                        aria-pressed={row.available}
                        aria-label={`Ubah ${row.name} menjadi ${row.available ? "tidak tersedia" : "tersedia"}`}
                        disabled={busy}
                        onClick={() => void toggleAvailability(row)}
                      >
                        <span
                          className="inventory-availability-track"
                          aria-hidden="true"
                        >
                          <span />
                        </span>
                        {row.available ? "Tersedia" : "Tidak tersedia"}
                      </button>
                      <button
                        className="text-link"
                        disabled={busy}
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
          title="Belum ada alat pada filter ini"
          description="Impor inventaris organisasi atau tambahkan alat. Angka stok hanya terlihat oleh admin berizin."
        />
      )}
      <Modal
        open={!!draft}
        title={draft?.id ? "Edit alat" : "Tambah alat"}
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
              {fields.map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type={typeof draft[key] === "number" ? "number" : "text"}
                  min={key === "maxDays" || key === "maxQuantity" ? 1 : 0}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]:
                        typeof draft[key] === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              ))}
              <label>
                Kondisi
                <select
                  value={draft.condition}
                  onChange={(e) =>
                    setDraft({ ...draft, condition: e.target.value })
                  }
                >
                  {[
                    "Baik",
                    "Kotor",
                    "Rusak Ringan",
                    "Rusak Berat",
                    "Hilang",
                    "Rusak",
                    "Sebagian rusak",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            {!draft.id && (
              <p className="inventory-availability-hint">
                Alat baru disimpan sebagai tidak tersedia. Aktifkan melalui
                toggle pada kolom Aksi setelah disimpan.
              </p>
            )}
            <Upload
              label="Foto alat"
              names={draft.photo ? ["Foto tersimpan"] : []}
              setError={setError}
              onFiles={async (files) => {
                if (!files[0] || busy) return;
                setBusy(true);
                setError("");
                try {
                  const photo = await uploadMedia(
                    files[0],
                    "inventory",
                    csrfToken,
                  );
                  setDraft((current) =>
                    current ? { ...current, photo } : current,
                  );
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Upload gagal.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <MediaPreview
              key={draft.photo}
              src={draft.photo}
              label="Foto alat"
            />
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                {busy ? "Memproses…" : "Simpan alat"}
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
        title="Arsipkan alat?"
        onClose={() => {
          if (!busy) setArchive(null);
        }}
      >
        <Notice>
          Alat yang masih terikat peminjaman tidak dapat diarsipkan. Tidak ada
          stok yang dibebaskan oleh tindakan ini.
        </Notice>
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
