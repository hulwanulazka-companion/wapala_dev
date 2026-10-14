"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu, LogOut } from "lucide-react";
import type { Role } from "@/server/auth/policy";
import { Logo, ThemeButton } from "../shell";
import { Notice } from "../ui";
import { authPost } from "../auth/client-api";
const modules = {
  anggota: "Anggota",
  angkatan: "Angkatan",
  koreksi: "Koreksi data anggota",
  konten: "Konten",
  galeri: "Galeri",
  buku: "Buku",
  or: "Open Recruitment",
  inventaris: "Inventaris",
  peminjaman: "Peminjaman",
  donasi: "Kampanye & donasi",
  event: "Event",
  pengguna: "Pengguna",
  pengaturan: "Pengaturan",
  arsip: "Arsip",
  audit: "Audit",
  kepengurusan: "Reset kepengurusan",
};
const permissions: Record<Role, Array<keyof typeof modules>> = {
  SUPER_USER: Object.keys(modules) as Array<keyof typeof modules>,
  POH: ["anggota", "angkatan", "koreksi", "or"],
  MULTIMEDIA: [
    "angkatan",
    "koreksi",
    "konten",
    "galeri",
    "buku",
    "or",
    "donasi",
    "event",
  ],
  INVENTARIS: ["inventaris", "peminjaman", "or"],
  ANGGOTA: ["anggota"],
};
export { modules as backendModules, permissions as backendRoleModules };
export function BackendAdminShell({
  role,
  name,
  module,
  csrfToken,
  children,
}: {
  role: Role;
  name: string;
  module: string;
  csrfToken: string;
  children?: ReactNode;
}) {
  const [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="admin-layout">
      <aside className={"admin-sidebar" + (menu ? " open" : "")}>
        <Logo />
        <nav aria-label="Modul admin">
          <Link href="/admin" className={module === "" ? "active" : ""}>
            Beranda admin
          </Link>
          {permissions[role].map((key) => (
            <Link
              key={key}
              href={"/admin/" + key}
              className={module === key ? "active" : ""}
              onClick={() => setMenu(false)}
            >
              {modules[key]}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            {name}
            <br />
            {role === "SUPER_USER"
              ? "Super User"
              : role === "INVENTARIS"
                ? "Inventaris"
                : role === "MULTIMEDIA"
                  ? "Multimedia"
                  : role === "ANGGOTA"
                    ? "Anggota"
                    : "POH"}
          </p>
          <Link className="text-link" href="/">
            Lihat website
          </Link>
          <Link className="text-link" href="/wapala/password">
            Ganti password
          </Link>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await authPost("logout", {}, csrfToken);
                window.location.assign(result.redirectTo || "/wapala");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Logout gagal.");
                setBusy(false);
              }
            }}
          >
            <LogOut size={15} />
            {busy ? "Keluar…" : "Keluar"}
          </button>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <div>
            <button
              className="icon-btn admin-mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Buka navigasi admin"
              aria-expanded={menu}
            >
              <Menu />
            </button>
            <span className="breadcrumb">
              Portal organisasi /{" "}
              {modules[module as keyof typeof modules] || "Beranda"}
            </span>
          </div>
          <ThemeButton />
        </header>
        <main className="admin-main" id="main">
          <div className="admin-page-header">
            <h1>
              {modules[module as keyof typeof modules] || "Portal WAPALA"}
            </h1>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {children}
        </main>
      </div>
    </div>
  );
}
