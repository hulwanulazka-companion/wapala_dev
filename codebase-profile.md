# Profil Codebase — Dev_Website

Tanggal: 19 Oktober 2026. Alat: pygount (summary).
Sumber pengukuran: konten production `main` @ `ecd1936` (rilis Perubahan 20–21).

## Metodologi

- Exclude: `node_modules`, `.next`, `.next-http-test`, `.local` (worktrees),
  `Vercel`, `tmp`, `output`, `src/generated` (Prisma client), `backups`,
  `import-packages`, `.codegraph`, `dist`, `build`, `.git`.
- Binary/aset dan file duplikat dihitung sebagai pseudo-kategori, bukan kode.

## Ringkasan

| Bahasa | File | Kode | Peran |
|---|---|---|---|
| TSX | 60 | 12.872 | UI (komponen publik + admin) |
| TypeScript | 179 | 10.596 | Server/domain logic, API, test |
| CSS | 11 | 5.564 | Tema & layout |
| Bash | 6 | 1.140 | Deploy kit (`host/`) |
| SQL (migrasi) | 18 | 379 | Prisma migrations |
| JS/YAML/JSON/systemd/dll | 15 | 441 | CI, config, unit systemd |
| Markdown | 11 | — (577 baris docs) | README, runbook |
| Binary/aset | 105 | — | Gambar, media |

**Total ±31.000 baris kode** (78,1% code density, komentar 2,4%).
TypeScript + TSX = ±23.500 baris (~76%) — Next.js App Router + Prisma,
backend-heavy (179 file TS > 60 file TSX): logika server/auth/media dominan.

## Aturan repo yang berlaku (divalidasi 2026-10-19)

### Kepemilikan akun & branch

- **Akun WapalaTUP (`WapalaTUP/website_wapala`) murni untuk development:**
  TIDAK ada satu pun konten/file untuk AI di akun ini. Branch: `main`
  (production) + `staging` (kerja) saja.
- **Akun companion (`hulwanulazka-companion/wapala_dev`)** memegang semua
  konten non-development: branch `Agents` (dokumen AI + snapshot kode),
  `import-packages` (arsip paket publik), `vercel`, `host` (arsip), dan
  `main` (mirror production).
- **Semua dokumen yang berhubungan dengan AI → branch `Agents` @ companion**
  (nama branch `Agents`, dengan "s" — bukan `Agent`). Pesan commit di branch
  ini berpola `docs: ...`.
- Di branch aplikasi, file AI dikeluarkan dari tracked tree dan ditutup
  `.gitignore` (`AGENTS.md`, `perubahan_agent*.md`); terverifikasi `HEAD`
  aplikasi tidak men-track satu pun.

### Alur commit kode

1. Perubahan kode → push `staging` (WapalaTUP saja).
2. Deploy uji VPS → diuji → ACC user.
3. Merge `staging` → `main` (fast-forward) → deploy production.
4. Mirror `main` + `host` (arsip) ke companion.
5. Dilarang merge seluruh `Agents` ke branch aplikasi.

### Gerbang sebelum commit

- `typecheck`, `lint --max-warnings=0`, `format:check`, test sesuai konteks
  (unit/backend/integration), `bash -n` untuk script.
- CI GitHub menegakkan typecheck + lint + format:check + build.
- Pesan commit: Conventional Commits `type(scope): deskripsi`.
- Larangan: `next-env.d.ts` generated tidak ikut commit; secret/env di luar
  repo; migration wajib additive (staging & main berbagi DB — rollback kode
  ≠ rollback DB); setiap perubahan agent dicatat di `perubahan_agents2.md`.
