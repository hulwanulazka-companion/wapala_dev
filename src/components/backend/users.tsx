"use client";
import Link from "next/link";
import { useState } from "react";
import type { listUsers } from "@/server/auth/users";
import type { Role } from "@/server/auth/policy";
import { Badge, Empty, Field, Modal, Notice } from "../ui";
import { backendApi } from "./api";

type User = Awaited<ReturnType<typeof listUsers>>[number];
const roles: Record<Role, string> = {
  ANGGOTA: "Anggota",
  SUPER_USER: "Super User",
  POH: "POH",
  INVENTARIS: "Logistik",
  MULTIMEDIA: "Kerjasama / Multimedia",
};
const presets = [
  { email: "POH@wapala.org", name: "Admin POH", role: "POH" as Role },
  {
    email: "Logistik@wapala.org",
    name: "Admin Logistik",
    role: "INVENTARIS" as Role,
  },
  {
    email: "Kerjasama@wapala.org",
    name: "Admin Kerjasama",
    role: "MULTIMEDIA" as Role,
  },
];
export function BackendUsers({
  initialUsers,
  currentUserId,
  csrfToken,
  members,
}: {
  initialUsers: User[];
  currentUserId: string;
  csrfToken: string;
  members: Array<{ id: string; name: string; nia: string }>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [draft, setDraft] = useState<{
    email: string;
    name: string;
    role: Role;
    memberId?: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    user: User;
    action: "reset" | "toggle" | "unlock";
  } | null>(null);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    const data = await backendApi<{ users: User[] }>(
      "/api/admin/users",
      csrfToken,
    );
    setUsers(data.users);
  }
  async function create() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await backendApi<{ user: User; temporaryPassword: string }>(
        "/api/admin/users",
        csrfToken,
        {
          ...draft,
          ...(draft.role !== "ANGGOTA" ? { memberId: undefined } : {}),
        },
      );
      setDraft(null);
      setCredential({
        email: data.user.email,
        password: data.temporaryPassword,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Akun belum dapat dibuat.");
    } finally {
      setBusy(false);
    }
  }
  async function change() {
    if (!confirm || busy) return;
    const { user, action } = confirm;
    setBusy(true);
    setError("");
    try {
      if (action === "reset") {
        const data = await backendApi<{ temporaryPassword: string }>(
          "/api/admin/users/" + user.id,
          csrfToken,
          { action: "reset-password" },
        );
        setCredential({ email: user.email, password: data.temporaryPassword });
      } else
        await backendApi(
          "/api/admin/users/" + user.id,
          csrfToken,
          action === "unlock" ? { unlock: true } : { active: !user.active },
          "PATCH",
        );
      setConfirm(null);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Perubahan akun belum tersimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(user: User, action: "reset" | "toggle" | "unlock") {
    setError("");
    setConfirm({ user, action });
  }
  const visible = users.filter((u) => !u.archivedAt);
  return (
    <>
      <div className="admin-toolbar">
        <p>
          Akun dan izin berasal dari database. Password sementara wajib diganti
          saat login.
        </p>
        <button
          className="btn primary"
          onClick={() => {
            setError("");
            setDraft({ email: "", name: "", role: "POH" });
          }}
        >
          Tambah pengguna
        </button>
      </div>
      <div className="button-row">
        {presets
          .filter(
            (p) =>
              !users.some(
                (u) => u.email.toLowerCase() === p.email.toLowerCase(),
              ),
          )
          .map((p) => (
            <button
              key={p.email}
              className="btn secondary"
              onClick={() => {
                setError("");
                setDraft({ ...p });
              }}
            >
              Buat akun {p.name.replace("Admin ", "")}
            </button>
          ))}
      </div>
      {error && !draft && !confirm && <Notice tone="error">{error}</Notice>}
      {visible.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama / email</th>
                <th>Peran</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <br />
                    {user.email}
                  </td>
                  <td>{roles[user.role]}</td>
                  <td>
                    <Badge>{user.active ? "Aktif" : "Nonaktif"}</Badge>
                    {user.mustChangePassword && <p>Wajib ganti password</p>}
                    {user.requiresUnlock && <p>Login terkunci</p>}
                  </td>
                  <td>
                    <div className="button-row">
                      {user.role !== "SUPER_USER" && user.active && (
                        <button
                          className="btn secondary"
                          onClick={() => choose(user, "reset")}
                        >
                          Reset password
                        </button>
                      )}
                      {user.id !== currentUserId && (
                        <button
                          className="text-link"
                          onClick={() => choose(user, "toggle")}
                        >
                          {user.active ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      )}
                      {user.requiresUnlock && (
                        <button
                          className="text-link"
                          onClick={() => choose(user, "unlock")}
                        >
                          Buka kunci
                        </button>
                      )}
                      {user.id === currentUserId && (
                        <Link className="text-link" href="/wapala/password">
                          Ganti password saya
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Belum ada akun"
          description="Buat akun admin sesuai tanggung jawabnya."
        />
      )}
      <Modal
        open={!!draft}
        title="Tambah pengguna"
        onClose={() => {
          if (!busy) setDraft(null);
        }}
      >
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="form-grid">
              <Field
                label="Nama"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <Field
                label="Email login"
                type="email"
                required
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
              <label>
                Peran
                <select
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({ ...draft, role: e.target.value as Role })
                  }
                >
                  {Object.entries(roles).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.role === "ANGGOTA" && (
                <div className="field">
                  <label htmlFor="account-member">
                    Profil anggota pemilik akun
                  </label>
                  <select
                    id="account-member"
                    required
                    value={draft.memberId || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, memberId: e.target.value })
                    }
                  >
                    <option value="">Pilih anggota</option>
                    {members
                      .filter((m) => !users.some((u) => u.memberId === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.nia}
                        </option>
                      ))}
                  </select>
                  <p className="field-hint">
                    Satu akun untuk satu profil. Anggota hanya dapat meminta
                    koreksi profil ini.
                  </p>
                </div>
              )}
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                {busy ? "Membuat…" : "Buat akun"}
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
        open={!!confirm}
        title={
          confirm?.action === "reset"
            ? "Reset password admin?"
            : confirm?.action === "unlock"
              ? "Buka kunci login?"
              : "Ubah akses akun?"
        }
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      >
        {confirm && (
          <>
            <p>{confirm.user.email}</p>
            <Notice>
              {confirm.action === "reset"
                ? "Password lama tidak berlaku dan semua sesi login dicabut. Password sementara hanya ditampilkan sekali."
                : confirm.action === "unlock"
                  ? "Admin dapat mencoba login kembali dengan password yang sudah dimiliki."
                  : "Menonaktifkan akun langsung mencabut semua sesi login. Riwayat organisasi tetap tersimpan."}
            </Notice>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void change()}
              >
                {busy ? "Memproses…" : "Konfirmasi"}
              </button>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Batal
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!credential}
        title="Password sementara"
        onClose={() => setCredential(null)}
      >
        {credential && (
          <>
            <Notice>
              Salin sekarang dan sampaikan melalui jalur privat. Setelah
              ditutup, password ini tidak dapat dilihat kembali.
            </Notice>
            <p>{credential.email}</p>
            <Field
              label="Password sementara"
              readOnly
              value={credential.password}
              autoComplete="off"
            />
            <button className="btn primary" onClick={() => setCredential(null)}>
              Sudah disimpan
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
