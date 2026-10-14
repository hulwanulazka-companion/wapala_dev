"use client";
import { useState } from "react";
import type {
  memberPortal,
  listCorrections,
} from "@/server/domains/member-portal";
import { Field, Notice, Empty, Modal, Textarea } from "../ui";
import { backendApi } from "./api";
type Portal = Awaited<ReturnType<typeof memberPortal>>;
type Requests = Awaited<ReturnType<typeof listCorrections>>;
const labels = {
  nama: "Nama lengkap",
  nim: "NIM",
  prodi: "Program studi",
  angkatan: "Angkatan",
  jenis_kelamin: "Jenis kelamin",
  kontak: "Kontak",
} as const;
export function BackendMemberPortal({
  initial,
  csrfToken,
}: {
  initial: Portal;
  csrfToken: string;
}) {
  const [data, setData] = useState(initial),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState(false),
    [fields, setFields] = useState(initial.profile?.fields),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function send() {
    if (!data.profile || !fields || busy) return;
    setBusy(true);
    setError("");
    try {
      const changes = Object.fromEntries(
        Object.keys(labels)
          .filter(
            (k) =>
              fields[k as keyof typeof labels] !==
              data.profile!.fields[k as keyof typeof labels],
          )
          .map((k) => [k, fields[k as keyof typeof labels]]),
      );
      await backendApi("/api/admin/member-portal", csrfToken, {
        version: data.profile.version,
        changes,
      });
      const latest = await backendApi<Portal>(
        "/api/admin/member-portal",
        csrfToken,
      );
      setData(latest);
      setFields(latest.profile?.fields);
      setEdit(false);
      setMessage("Permintaan dikirim. Data berubah setelah disetujui admin.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengajukan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>Profil saya</h2>
        {data.profile ? (
          <>
            <p>
              {data.profile.fields.nama} · NIA {data.profile.fields.nia}
            </p>
            <button
              className="btn secondary"
              disabled={data.requests.some((r) => r.status === "pending")}
              onClick={() => {
                setError("");
                setEdit(true);
              }}
            >
              Ajukan perbaikan data
            </button>
          </>
        ) : (
          <Notice>
            Akun belum ditautkan ke profil aktif. Hubungi Super User.
          </Notice>
        )}
        {message && <Notice>{message}</Notice>}
        {data.requests.map((r) => (
          <p key={r.id}>
            {r.status === "pending"
              ? "Menunggu persetujuan"
              : r.status === "approved"
                ? "Disetujui"
                : "Ditolak"}
            {r.note ? " · " + r.note : ""}
          </p>
        ))}
      </section>
      <Field
        label="Cari anggota WAPALA"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama / NIA</th>
              <th>Program studi</th>
              <th>Angkatan</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.directory
              .filter((r) =>
                (r.nama + " " + r.nia + " " + r.angkatan)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.nama}
                    <br />
                    {r.nia}
                  </td>
                  <td>{r.prodi}</td>
                  <td>{r.angkatan}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={edit}
        title="Ajukan koreksi profil saya"
        onClose={() => {
          if (!busy) setEdit(false);
        }}
      >
        {fields && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Notice>
              Perubahan ini akan ditinjau Super User, Multimedia, atau POH. NIA
              dan status keanggotaan dikelola admin.
            </Notice>
            <div className="form-grid">
              {Object.entries(labels).map(([key, label]) =>
                key === "jenis_kelamin" ? (
                  <div className="field" key={key}>
                    <label htmlFor="correction-gender">{label}</label>
                    <select
                      id="correction-gender"
                      value={fields.jenis_kelamin}
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          jenis_kelamin: e.target.value as
                            "Laki-laki" | "Perempuan",
                        })
                      }
                    >
                      <option>Laki-laki</option>
                      <option>Perempuan</option>
                    </select>
                  </div>
                ) : (
                  <Field
                    key={key}
                    label={label}
                    value={fields[key as keyof typeof labels]}
                    maxLength={key === "nim" ? 40 : 300}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  />
                ),
              )}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                Kirim permintaan
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setEdit(false)}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
export function BackendMemberCorrections({
  initialRequests,
  csrfToken,
}: {
  initialRequests: Requests;
  csrfToken: string;
}) {
  const [rows, setRows] = useState(initialRequests),
    [more, setMore] = useState(initialRequests.length === 100),
    [selected, setSelected] = useState<Requests[number] | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review(decision: "approved" | "rejected") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await backendApi("/api/admin/member-corrections", csrfToken, {
        id: selected.id,
        decision,
        note,
      });
      const refreshed = await backendApi<{ requests: Requests }>(
        "/api/admin/member-corrections",
        csrfToken,
      );
      setRows(refreshed.requests);
      setMore(refreshed.requests.length === 100);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal meninjau.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Permintaan menunggu ditampilkan dari yang paling lama. Riwayat keputusan
        tetap disimpan.
      </p>
      {!rows.length ? (
        <Empty
          title="Belum ada permintaan koreksi"
          description="Permintaan anggota akan tampil di sini."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.current.nama}
                    <br />
                    NIA {r.current.nia}
                  </td>
                  <td>
                    {r.status === "pending"
                      ? "Menunggu"
                      : r.status === "approved"
                        ? "Disetujui"
                        : "Ditolak"}
                  </td>
                  <td>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setSelected(r);
                        setNote(r.note);
                        setError("");
                      }}
                    >
                      Lihat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const next = await backendApi<{ requests: Requests }>(
                "/api/admin/member-corrections?cursor=" +
                  encodeURIComponent(rows[rows.length - 1].id),
                csrfToken,
              );
              setRows((old) => [...old, ...next.requests]);
              setMore(next.requests.length === 100);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Gagal memuat.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Muat permintaan lainnya
        </button>
      )}
      {error && !selected && <Notice tone="error">{error}</Notice>}
      <Modal
        open={!!selected}
        title="Tinjau koreksi anggota"
        onClose={() => {
          if (!busy) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Data saat ini</th>
                    <th>Usulan anggota</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(labels).map(([k, label]) => (
                    <tr key={k}>
                      <td>{label}</td>
                      <td>
                        {selected.current[k as keyof typeof labels] || "—"}
                      </td>
                      <td>
                        {selected.proposed[k as keyof typeof labels] || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Textarea
              label="Catatan keputusan"
              value={note}
              onChange={setNote}
            />
            {error && <Notice tone="error">{error}</Notice>}
            {selected.status === "pending" && (
              <div className="button-row">
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void review("approved")}
                >
                  Setujui perbaikan
                </button>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => void review("rejected")}
                >
                  Tolak
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
