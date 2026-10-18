# Catatan Perubahan — untuk Agent Utama

File ini mencatat SEMUA perubahan yang dibuat agent (opencode) pada repo `Dev_Website`.
Format: tanggal, status (diagnosis/perbaikan), file yang disentuh, dan alasannya.

---

## 2026-10-14

### Perubahan 1 — Template environment: cabut sisa Turnstile
- File: `.env.example`, `.env.production.example`
- Menghapus blok `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` + komentarnya.
- Alasan: perintah user (2) — cabut Cloudflare Turnstile TOTAL, termasuk konfigurasi.

### Perubahan 2 — Hapus dead code Turnstile
- File dihapus: `src/server/security/public-challenge.ts` (widget/Siteverify helper, tidak dipanggil di mana pun — diverifikasi `rg`).
- File: `scripts/backend-dev.ts` — menghapus path dotenv `.local/turnstile.env`.
- Alasan: perintah user (2); kode mati dengan fail-closed 503 berpotensi disalahkan sebagai penyebab gagal submit.

### Perubahan 3 — Dokumentasi disinkronkan
- `docs/backend-local-setup.md`, `docs/deployment-ubuntu.md`: paragraf "Turnstile wajib / fail closed" diganti penjelasan proteksi aktif (CSRF same-origin, cookie form-owner HttpOnly, throttle persisten).
- `docs/release-execution-ledger.md` baris 8: menghapus klaim "Turnstile verification", menambah catatan pencabutan total.
- Sisa referensi Turnstile di repo: hanya asersi negatif `tests/backend/security.test.ts:7` (penjaga agar tidak kembali) dan catatan historis ledger.

### Verifikasi setelah perubahan
- `npm run typecheck` — lulus (exit 0).
- `npm run lint` — lulus (0 error, 8 warning `_obsoleteVerifier` yang sudah ada sebelumnya).
- `npm test` — 89/89 lulus; `npm run test:backend` — 37/37 lulus.

### Infrastruktur Git (perintah user: upload ke GitHub)
- Dibuat repo git BARU di dalam `Dev_Website` (`git init -b master`) — terpisah dari repo induk `WAPALA` yang memuat `Src/` dokumen privat (tidak boleh ke GitHub).
- `.gitignore` sudah menutup `.env*` (kecuali example), `.local/`, `node_modules/`, `.next/`, `src/generated/`, `output/`.
- Scan secret: tidak ada secret hardcoded di `src/`; template env hanya placeholder.
- Remote: `https://github.com/hulwanulazka-companion/wapala_dev.git` (repo kosong, terverifikasi `git ls-remote`).
- Commit pertama `715342c` — 454 file, terverifikasi 0 `node_modules`, 0 `.env` asli.
- Push awal gagal 403 (kredensial tersimpan milik akun `HulwanulAzkaP`, repo milik `hulwanulazka-companion`); SSH key lokal juga belum terdaftar di GitHub.
- User mengundang `HulwanulAzkaP` sebagai collaborator → push ulang SUKSES: `master` → `origin/master` (tracking aktif).
- Isi commit: kode sumber audited + konfigurasi + migrasi Prisma + docs + deploy; TANPA node_modules (user clone lalu `npm ci` + `db:generate` + `db:migrate` + `build`).

### Perubahan 4 — README ditulis ulang (perintah user)
- `README.md` lama adalah catatan checkpoint UI yang sudah kedaluwarsa ("backend belum dimulai") — dipindahkan apa adanya ke `agent_readme.md` baru, diberi header arsip riwayat agent + peringatan info basi.
- `README.md` baru ditulis sebagai dokumentasi proyek: fitur situs publik & portal admin (divisi alam: Gunung & Hutan, Rock Climbing, Caving, Rafting), tabel teknologi, quickstart development, bootstrap Super User, perintah verifikasi, deployment (pointer ke `docs/` + `deploy/`), ringkasan keamanan formulir publik (tanpa verifikasi pihak ketiga), dan struktur folder.
- Fakta diambil dari kode (navigasi `shell.tsx`, divisi `lib/content.ts`, skrip `package.json`); teks profil/vision tidak di-hard-code karena tersimpan di database.

### Perubahan 10 — Foto divisi di `/divisi` zoom (tindak lanjut Perubahan 9)
**Penyebab zoom:** aturan dasar `.division-photo` memakai `background-size: 400% auto` (didesain untuk sprite 4 panel `placeholder.svg`). Strip beranda menimpanya dengan `.division-strip .division-photo.has-image { background-size: cover }`, tetapi kartu `/divisi` dan grid profil tidak — foto admin tampil 4x lebar kontainer.
**Perbaikan:** `globals.css` — `.division-photo.has-image` kini global `background-size: cover`; `400%` hanya berlaku untuk fallback sprite (tanpa foto). Efek: `/divisi`, `/divisi/[slug]`, dan grid `/profil#divisi` tampil sama seperti beranda.
**Verifikasi:** CSS tersaji dari dev server memuat aturan baru (diverifikasi via HTTP); typecheck 0. UAT visual oleh user.

### Perubahan 9 — Foto divisi di `/divisi` dan `/divisi/[slug]` (permintaan user)
**Penyebab:** komponen `Divisions` (`/divisi` + `/divisi/[slug]`) merender `.division-photo` TANPA background image — hanya `backgroundPosition` — sehingga tidak memakai foto yang diunggah admin (`divisionImageUrl1-4`), beda dengan strip beranda & halaman profil yang sudah benar.
**Perbaikan:** `src/components/public-pages.tsx` — `Divisions` kini membaca `settings` dari `useDemo()` dan memakai `divisionImage(settings, divisions.indexOf(d))` + kelas `has-image` + inline `backgroundImage`, persis pola strip beranda. Pemetaan indeks terverifikasi sama dengan label admin (1=Gunung Hutan, 2=Rock Climbing, 3=Caving, 4=Rafting).
**Verifikasi:** typecheck 0; lint 0; test lulus; HTTP `/divisi` dan `/divisi/rafting` 200 dengan `division-photo has-image` + URL foto dari DB (`10b43a32…` dkk.) hadir di HTML.

### Perubahan 8 — DB mati membuat /wapala 500 → fail-soft logo + DB dinyalakan ulang
**Insiden:** user melaporkan `PrismaClientKnownRequestError: Can't reach database server at 127.0.0.1:54329` di `/wapala` (`brandLogoUrl` → `PortalLayout`). Penyebab: PostgreSQL portable (.local/postgres, port 54329) MATI — bukan bug kode; DB harus dinyalakan manual via `npm run db:local` setelah mesin/prosesnya berhenti.
**Tindakan:**
1. DB dinyalakan ulang (`pg_ctl start` port 54329) — verifikasi query OK, `/wapala` dan `/` kembali 200.
2. `src/server/public-data.ts` — `brandLogoUrl()` kini fail-soft (try/catch → `""`): bila DB tidak terjangkau, halaman login tetap terbuka dengan logo fallback "W". Logo = branding non-kritis, tidak boleh menutup akses login. Halaman publik TETAP bergantung DB untuk datanya (perilaku lama, tidak diubah).
**Verifikasi:** typecheck 0; lint 0; test lulus.

### Perubahan 7 — Visual login + alur data peminjam (permintaan user, 14 Okt)
**1. Background halaman `/wapala` (panel kiri) memakai foto booth WAPALA:**
- Foto sumber: `Src/IMG_20230912_064038_230.jpg` (path diberikan user; hardcode diizinkan).
- Disalin ke `public/assets/login-stand.jpg` dan dioptimasi dengan sharp: resize 1600px + JPEG quality 78 → 3.5 MB menjadi 297 KB.
- `globals.css` — `.login-visual-art` diganti: foto `cover` + gradient overlay gelap (#102419) agar teks putih "Setiap perjalanan berawal dari persiapan…" tetap terbaca; watermark `::after` "WAPALA" dihapus (bentrok dengan foto).

**2. `/peminjaman` — step "Data peminjam" jadi satu kontainer (klik "Lanjut" → data peminjam berada DI BAWAH kontainer info):**
- `src/components/forms.tsx` — restrukturisasi render `LoanForm`: variabel bersama `stepsNav`, `asideInfo`, `actions`; saat `step === 1` satu `<form>` tunggal berisi: indikator langkah → blok info "Sebelum berangkat / Jumlah akhir… / Pengembalian… / Lacak pengajuan / N jenis alat dipilih" (`.form-aside.aside-inline`) → form data peminjam → tombol aksi. Step 0 dan 2 tetap layout dua kolom seperti semula.
- `globals.css` — `.form-aside.aside-inline` (non-sticky) dan `.form-section > .form-main:only-child` (maks 780px, tengah).
- Perilaku submit tidak berubah (input controlled, `onSubmit` sama, idempotency tetap).

**Verifikasi:** typecheck 0 error; lint 0 error (8 warning lama); `npm test` + `npm run test:backend` lulus; HTTP: `/assets/login-stand.jpg` 200, `/peminjaman` 200, CSS tersaji memuat background foto + `aside-inline`.
**Catatan UAT:** perubahan visual perlu konfirmasi user di browser (desktop + mobile).

### Perubahan 6 — Logo konsisten di `/wapala` dan `/admin` (permintaan user)
**Penyebab inkonsistensi:** komponen `Logo` (satu komponen sama untuk semua halaman) membaca `settings.logoUrl` dari `DataProvider`. Layout publik membungkus halaman dengan `publicState()` (memuat `logoUrl`), tetapi `/wapala` (login) dan `/admin` TIDAK punya provider → `Logo` menerima state kosong → jatuh ke placeholder "W".

**Perbaikan (pola sama dengan layout publik):**
- `src/server/public-data.ts` — helper baru `brandLogoUrl()`: baca `config.logoUrl` dari `SiteSettings` id=1 (sumber sama persis dengan website publik).
- `src/app/wapala/layout.tsx` (baru) dan `src/app/admin/layout.tsx` (baru) — layout server yang membungkus children dengan `DataProvider` berisi `settings.logoUrl`.
- `src/components/backend/administration.tsx` — `BackendSettings` kini memanggil `router.refresh()` setelah simpan, supaya logo baru langsung terlihat di sidebar admin tanpa reload manual.

**Perbaikan tooling typecheck (muncul saat verifikasi):**
- `next-env.d.ts` — menghapus dua import basi ke `.next-http-test/dev/types/` (sisa build uji integrasi jam 5:28) yang mendeklarasikan global `LayoutProps` dengan batasan `"/"` (pralayout), membuat `tsc` gagal di `.next/dev/types/validator.ts(30)`.
- Menghapus `.next/types/` basi (hasil build pralayout, constraint sama) — dibuat ulang otomatis oleh `next build`.
- Catatan: bila `test:backend:integration` dijalankan, Next dapat menulis ulang `next-env.d.ts` mengarah ke `.next-http-test`; tipe itu diregenerasi per-run sehingga tetap konsisten.

**Verifikasi:**
- typecheck 0 error; lint 0 error (8 warning lama); `npm test` lulus; `npm run test:backend` lulus.
- SSR HTTP: `/wapala` dan `/` sama-sama memuat logo DB `fcf404c3-43b9-4c18-b7e8-97f1a5da458a` (sumber identik); `/admin` tanpa sesi tetap 307 ke login.
- Catatan verifikasi visual `/admin` (setelah login) menjadi konfirmasi UAT user.

### Status diagnosis bug submit peminjaman (SELESAI — akar masalah ditemukan & diperbaiki)

**Akar masalah:** migrasi `202610140002_public_forms` (membuat tabel `PublicFormReceipt` + `ApplicantRevision`) belum diterapkan ke database dev lokal. DB hanya sampai `202610130009_event_replay_fences`. Setiap submit memanggil `publicFormReceipt.findUnique` di transaksi awal → Prisma error "relation does not exist" → bukan `DomainError` → catch-all `route()` → **500 INTERNAL ~13ms** (12x di log). Admin/katalog/context tidak menyentuh tabel itu sehingga tampak normal; test lulus karena memakai schema per-run yang selalu di-migrate.

**Tindakan:**
1. Terapkan migrasi: `npm run db:migrate` → `202610140002_public_forms` sukses (murni additive, data aman).
2. Verifikasi end-to-end via HTTP (persis jalur browser: cookie preauth + form-owner + header CSRF + Origin): `POST /api/public/forms/submit` → **200**, kode `WPL6P54L`, status `requested`; baris terkonfirmasi di DB (Loan + PublicFormReceipt).
   - Catatan: uji pertama sempat 400 INVALID_INPUT — artefak alat uji (BOM UTF-8 PowerShell membuat JSON.parse gagal), BUKAN bug produk.
   - Record uji sengaja dibiarkan: loan `WPL6P54L` institution "UJI KONEKSI (hapus)" — bukti di `/admin/peminjaman`, silakan dihapus/ditolak dari admin.
3. Perubahan 5: `src/server/http/auth-handler.ts` — log INTERNAL kini menyertakan `message` + ringkasan `stack` (sebelumnya error asli ditelan, penyebab diagnosis kemarin lambat). Typecheck + lint lulus.

**Belum berubah (fitur):** tidak ada perubahan logika fitur pada jalur submit.

---

## 2026-10-16

### Konteks sesi: branch deployment `host` + deployment produksi baru di InterServer
User meminta branch khusus deployment, pembersihan repo, README tutorial, deploy
otomatis, dan akhirnya deployment nyata. Hasil: branch `host` (kini development)
di dua remote, `main` di WapalaTUP menjadi production, dan situs live di
`https://wapala-test.my.id` (VPS InterServer KVM Slice 1, Ubuntu 24.04, 2 GB).

### Perubahan 1 — Branch `host`: pembersihan fokus deployment
- Dibuat dari `main` (4e73976). Dihapus: `tests/`, `docs/`, `.env.example`,
  `prisma/seed.ts`, script dev (`backend-dev`, `local-postgres`, `backend-integration`,
  `generate-invoice-preview`, `import-public-site`, `sync-*`, `release-linux/package`),
  unit infra lama (`deploy/wapala.service`, email/loans timer, codex-sudo, service.sh,
  release-readiness/memory-check).
- `package.json`: script dev/test/di:local/db:seed dihapus; tambah `backup`,
  `backup:restore-stage`. `prisma.config.ts`: seed + fallback `.local` dihapus.
- `.gitattributes` baru (LF utk .sh/.yml/.conf). Folder `host/` dibuat.
- Alasan: arahan user — branch hanya berisi kode deployment, tanpa hal gajelas.

### Perubahan 2 — Deployment kit baru di `host/`
- `host-provision.sh`: provisioning sekali idempoten — paket + Node 24 (NodeSource),
  PostgreSQL dua role (`wapala` owner migrate, `wapala_app` runtime tanpa DDL),
  user layanan `wapala` + user build non-root `builder`, env template 0600,
  unit systemd, Nginx HTTP → certbot → HTTPS, timer maintenance; mode
  `WAPALA_NAT_MODE=1` (port khusus provider, redirect publik 443 bersih) vs dedicated 80/443.
- `host-deploy.sh`: clone release baru → npm ci + build (heap 512/768, serial) →
  migrate (role owner) → grant ulang role runtime → symlink atomik → restart →
  health check → rollback otomatis; prune release gagal sebelum build.
- `wapala-host.service`: sandbox systemd penuh (ProtectSystem strict, kernel/devices/
  syscalls dibatasi), release root-owned, writable hanya `.next/cache` + media.
- `nginx-wapala.conf` / `nginx-wapala-nat.conf`: limit_req `/api/auth` + `/api/public`,
  `client_max_body_size 60m`, `server_tokens off`, http2.
- `clamdscan-wapala.sh` dipindah dari `deploy/`.

### Perubahan 3 — GitHub Actions + Vercel
- `.github/workflows/deploy-host.yml`: deploy SSH manual (workflow_dispatch), pinned
  SHA checkout, `permissions: contents: read`, arg %q, fallback ssh-keyscan (TOFU) dihapus.
- `.github/workflows/ci.yml`: gate typecheck + lint + `format:check` + build, trigger
  push/PR ke `main` dan `host`.
- `vercel.json`: `"git": {"deploymentEnabled": false}` — deploy git Vercel dimatikan
  (repo terhubung Vercel tanpa env, selalu gagal; branch ini target VPS).
- `linux-runtime.yml` dihapus (merujuk script yang tak ada di branch ini).

### Perubahan 4 — Keamanan auth (commit 2c4ccff di `host`)
- `security/throttle.ts`: helper lock login berkunci `login-lock:{email}:{ipDigest}`
  (raw key agar bisa dihapus terpilih saat unlock).
- `auth/login.ts`: 6× password salah → lock per (email, IP) 24 jam (423), TANPA
  `requiresUnlock` permanen (kolom legacy tetap dibaca); sukses menghapus bucket.
  Alasan: siapa pun yang tahu email admin tak bisa lagi mengunci akun permanen.
- `auth/users.ts` (unlock/reset), `auth/recovery.ts` (completeRecovery/recoverSuperuser),
  `sessions.ts` (changePassword): membersihkan lock via prefix.
- `auth/sessions.ts`: `resolveSessionRecord` — select tanpa `passwordHash` + satu
  query utk CSRF di `auth-handler.ts` (query ganda dihapus); `assertFreshRead`
  tanpa `FOR UPDATE` untuk jalur baca (pool `max:5` tidak lagi antre di row lock).
- `security/request-context.ts`: warn sekali per proses saat IP fallback `unknown`.

### Perubahan 5 — Media & memori (commit e1ebf4f di `host`)
- `api/media/[id]/route.ts` + `media/storage.ts`: serving via `createReadStream`
  + ETag/304 (tanpa memuat file penuh / sha256 per request); `readMedia` bytes
  + checksum tetap utk export; meta+auth via `readMediaMeta` (assertFreshRead).
- `registerMedia`: scan file MENTAH di karantina SEBELUM decode sharp/pdfjs.
- `mediaSlot` → semaphore per kelas (admin 2, public 1, antrean ala password.ts):
  upload publik tak bisa lagi menahan upload admin.
- `http/multipart.ts`: satu buffer tumbuh terbatas (puncak ~1x file, sebelumnya
  chunk array + Buffer.concat ~3-4x).

### Perubahan 6 — Maintenance & hardening (commit b6e258a di `host`)
- `scripts/maintenance-prune.ts` + `npm run maintenance:prune`: bersihkan
  SecurityThrottle, Session expired/revoked, PasswordResetToken — berdiri sendiri
  (cleanup lama numpang `deliverOutbox` dan TIDAK PERNAH jalan saat `EMAIL_MODE=disabled`,
  default provisioning).
- `host/wapala-maintenance.service` + `.timer` (03:17 harian).
- `host-deploy.sh` rewrite: build/migrate sebagai `builder` non-root (install script
  deps tak pernah jalan sebagai root), parser env baris tanpa shell-eval (nilai `& $ '`
  aman), `psql` via `PGPASSWORD` (password tidak di argv), prune awal, warning
  expand/contract saat rollback, `npm_config_update_notifier=false`.

### Perubahan 7 — Kebersihan (commit b0f7c8b di `host`)
- `lib/media-url.ts`: `MEDIA_URL_PATTERN` UUID ketat + `parseMediaUrl` +
  `mediaUrlSchema` — menggantikan 13 regex duplikat longgar `[a-f0-9-]{36}`.
- Kode mati dihapus: `auth/preview-mode.ts` (0 importer), parameter
  `_obsoleteVerifier` (public-form-handlers, event-public-handlers, public-forms).
- Prettier: `.prettierrc`, `.prettierignore`, script `format`/`format:check`,
  repo diformat sekali, `format:check` masuk CI. `tsconfig`/eslint: exclude
  folder lokal `Vercel`, `tmp`, `output`, `.local`.

### Perubahan 8 — Dokumentasi
- `README.md` ditulis ulang: tutorial deploy (arsitektur, NAT vs dedicated,
  penerjemahan panel provider → parameter, DNS, secrets, operasional, kapasitas,
  keamanan, troubleshooting). Kini menyatakan `main` = production, `host` = development.
- `host/deploy-walkthrough.md` (4e478da): walkthrough end-to-end deployment nyata
  InterServer + hostdata/DirectAdmin — fix sudo non-root, keputusan nameserver,
  A record DirectAdmin (nama lengkap, bukan `@`), provisioning idempoten + fix
  APP_URL, ClamAV (mkdir libexec, StreamMaxLength 60M, uji EICAR), verifikasi SSL,
  tabel jebakan nyata.
- `npm_config_update_notifier=false` di deploy + CI (eadd6c9) — notice npm bersih.

### Perubahan 9 — Remote & merge
- Remote baru `wapala` = `https://github.com/WapalaTUP/website_wapala.git`; branch
  `host` di-push ke dua remote (`wapala` + `origin`), README diarahkan ke WapalaTUP.
- Merge `host` → `main` di WapalaTUP (d20a746): merge commit dua orang tua (main lama
  era Vercel 502f889 + host), pohon akhir = pohon `host` (`read-tree --reset`) agar
  warisan Vercel (README-VERCEL, .vercelignore, src/tests lama) tidak lolos; lanjutan
  df7f738: badge/clone → `main`, `WAPALA_BRANCH` default `main`, CI dua branch.
- `origin/main` (hulwanulazka-companion) tidak disentuh sesuai arahan user.

### Perubahan 10 — Deployment produksi nyata (terverifikasi live)
- VPS InterServer KVM Slice 1 (1 vCPU, 1.9 GB + 1 GB swap, Ubuntu 24.04), user non-root
  `codex` (diberi sudo via usermod).
- Domain `wapala-test.my.id` (hostdata/DirectAdmin): A record + CNAME www; delegasi
  NS tetap hostdata (ns21-24); certbot Let's Encrypt sukses.
- Deploy pertama sukses: `{"status":"ok"}` di `/api/health`; bootstrap Super User.
- ClamAV dipasang: StreamMaxLength 60M, wrapper `/usr/local/libexec/clamdscan-wapala`,
  `SupplementaryGroups=clamav`, uji EICAR exit=1, upload buku 50 MB via panel SUKSES.
- RAM: available ~518 Mi dengan clamd jalan — ketat tapi sehat, tanpa OOM.

### Verifikasi selama sesi
- `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run format:check`,
  `bash -n` semua script — lulus di tiap commit.
- CATATAN JUJUR: branch ini TIDAK punya test suite (dihapus dari `host`); verifikasi
  runtime berupa smoke test manual di `wapala-test.my.id` (login, upload buku, health)
  — disarankan uji alur kritis lain (lock/unlock, export, recovery) sebelum dipakai
  produksi penuh. CI GitHub (typecheck+lint+format+build) berjalan per push.

### Perubahan 11 — Fix beruntun deployment live (feedback dari VPS nyata)
- `import-album.sh`: definisi helper `ask`/`confirm`/`run` yang dipakai tapi
  tidak didefinisikan (3 crash beruntun saat menu import); variabel warna
  `C_MAGENTA` hilang di bawah `set -u`; `chmod a+rX` dari FOLDER INDUK mktemp
  (0700 root) agar user wapala bisa traverse (EACCES realpath).
- Backup otomatis: menu 5 + step backup import kini stop app →
  `release-backup.mjs` dengan `WAPALA_WRITERS_STOPPED=yes` → start → health
  check; backup memakai ROLE OWNER (`MIGRATE_DATABASE_URL`) karena pg_dump
  membaca semua tabel termasuk `_prisma_migrations` yang di-REVOKE dari role
  runtime (penyebab "pg_dump failed (details suppressed)"); folder tujuan
  TIDAK di-pre-create (script menolak folder existing, `mkdir` non-rekursif
  butuh parent siap); default backup ke `<checkout>/backups` (gitignored).
- `wapala.sh`: menu `u) Update kode repo (git pull)` sebagai pemilik checkout
  (menghindari dubious ownership root), `git fetch` saja tidak memperbarui
  working tree — pelajaran dari run pertama import.
- SMTP di installer (672cf72): pertanyaan SMTP lengkap (host/port/user/
  password tersembunyi/from) + `WAPALA_EMAIL_MODE`/`WAPALA_SMTP_*` di
  provision; env template menulis nilai operator via `printf %s` (password
  berisi karakter khusus tidak diekspansikan shell); unit `wapala-email`
  service+timer 5 menit dipasang otomatis bila smtp (tanpa worker, outbox
  tidak pernah terkirim); ClamAV ditanyakan tepat setelah preflight.
- `host-provision.sh`: `WAPALA_FORCE_APP_URL` (fix re-provision), 
  `StreamMaxLength 60M` otomatis saat ClamAV, email worker timer.
- Push tiap fix: `host` ke DUA remote, `main` hanya WapalaTUP (urutan yang
  diminta user).

### Perubahan 12 — Dukungan Cloudflare CDN (temuan user, domain testing)
- User memasang Cloudflare di depan `wapala-test.my.id` (InterServer LA):
  TCP connect 232 ms → 68 ms ke edge; CSS immutable MISS→HIT terverifikasi.
  Dokumen diagnosis lengkap ada di luar repo (WAPALA_CLOUDFLARE_DNS_LATENCY_DIAGNOSIS.md).
- **Regresi yang diperbaiki:** di belakang proxy, `$remote_addr` origin = IP
  edge CF → XFF berisi IP edge → semua pengunjung berbagi satu bucket
  throttle. Fix: template Nginx memulihkan IP klien asli via
  `real_ip_header CF-Connecting-IP` + `set_real_ip_from` rentang resmi CF
  (IPv4+IPv6; aman bila CF tak dipakai).
- `wapala.sh`: `is_cf_ip()` — DNS yang mengarah ke edge CF tidak dianggap
  "DNS salah" oleh installer (sertifikat origin tetap diterbitkan; ACME
  HTTP-01 diteruskan CF).
- Dokumen: README bagian Cloudflare (setup dashboard, Full strict, larangan
  Cache Everything utk HTML/auth/API, hardening opsional lock origin ke IP
  CF), walkthrough callout, troubleshooting.
- Cakupan push (permintaan user): `host` (kedua akun), `main` WapalaTUP,
  `main` akun companion (kini sinkron dengan production tree 13cf8c1),
  `staging` (blok realip ditambahkan ke `deploy/nginx-wapala.conf` lama via
  worktree temp, dd4866b).
- Batasan dari dokumen diagnosis yang DIPEGANG: jangan ubah
  `wapala.my.id` production, jangan cache HTML/auth/API, jangan melemahkan
  CSP nonce, jangan klaim hijack ISP tanpa bukti paket, verifikasi DoH
  end-to-end masih pending user.

### Perubahan 13 — Restrukturisasi model branch (keputusan user, akhir sesi)
- **Repo utama mulai sekarang: WapalaTUP/website_wapala.** Alur baru:
  perubahan masuk `staging` (WapalaTUP) → deploy uji ke VPS InterServer →
  diuji → **di-ACC user** → merge `staging` → `main` → deploy production →
  mirror `main` ke akun companion.
- **`host` DI-WAPALATUP DIRENAME menjadi `staging`** — branch `host` dihapus
  dari WapalaTUP; sekarang hanya 2 branch: `main` + `staging`. "Host" di akun
  WapalaTUP = staging. Di akun companion, `host` TETAP ADA sebagai arsip
  (mirror terakhir 13cf8c1).
- **`staging` HANYA di WapalaTUP** (koreksi user) — `staging` lama di companion
  DIHAPUS (isinya identik dengan arsip `import-packages` yang dibuat lebih
  dulu, dd4866b); companion kini memegang: `main` (mirror produksi) + `host`
  (arsip) + `import-packages` (arsip paket publik) + `Agents` + `vercel`.
- Branch `import-packages` (companion, dd4866b) dibuat SEBELUM menimpa
  staging lama — arsip paket situs publik (21 angkatan/22 album/129 foto)
  agar tidak hilang; `import-album.sh` default branch diubah
  `staging` → `import-packages` (+ header comment selaras).
- **Script deploy dibenahi tuntas (bukan setengah-setengah):**
  - `host-deploy.sh`: tiap release dicap `.deploy-branch` (branch asal).
  - `wapala.sh`: menu Deploy ulang menanyakan branch (`main — production` /
    `staging — build uji`); Status & Rollback menampilkan marker branch asal
    per release — build uji dari staging mudah dibedakan dari production.
- README: bagian Model branch ditulis ulang (tabel peran branch + alur ACC).
- Commit: `573e839` + `d9f739b` di `staging` (WapalaTUP saja); branch `host`
  WapalaTUP dihapus; `staging` companion dihapus (arsip aman di
  `import-packages`).
- **Lampiran Perubahan 12 (koreksi cakupan):** revisi Cloudflare (dd4866b)
  adalah push TERAKHIR ke staging lama sebelum ia diarsipkan sebagai
  `import-packages`; staging baru tidak membawa pohon lama itu.
- **Bekal sesi berikutnya:**
  1. Server testing: `cd ~/wapala-setup && git fetch origin && git checkout -B staging origin/staging`
     (origin = WapalaTUP)
  2. Uji: `sudo bash host/wapala.sh` → Deploy ulang → *staging — build uji* →
     verifikasi marker branch (`2) Status`) + realip Cloudflare
     (`nginx -T | grep real_ip_header`)
  3. Setelah ACC: merge `staging` → `main` (WapalaTUP), deploy production
     (menu → main), mirror `main` ke companion.
- `bash -n` semua script + template; typecheck; format:check (index LF);
  deteksi non-TTY teruji; deploy ulang live di VPS sukses (HEAD 0b9f2da);
  import album sukses (21 angkatan/22 album/150 media/129 foto) + backup
  owner-role sukses setelah fix; commit berurutan: 569f2e2, a49bc0a,
  d06d578, 222fd66, 672cf72, d2eafda, 13cf8c1, dd4866b (staging).

### Perubahan 14 — Dokumentasi disiplin database & migration saat deploy
- `README.md` (branch `staging` WapalaTUP): section baru **"Database &
  migration saat deploy"** setelah Runbook — tabel efek tiap tahap deploy
  ke database + dua disiplin wajib:
  1. **Rollback ≠ rollback DB** — deploy membawa migration baru lalu health
     check gagal → kode kembali, skema tetap versi baru; wajib disiplin
     expand/contract (migration additive dulu, DROP/RENAME menyusul setelah
     kode lama pasti tidak dipakai).
  2. **Staging dan main memakai database yang sama** — deploy uji staging
     yang membawa migration langsung menerapkannya ke DB produksi; wajib
     additive-safe atau merge segera setelah uji lulus.
- Saran: migration besar/berisiko → menu 5 (Backup) dulu sebelum deploy.
- Sumber: penjelasan lisan ke user saat sesi (pertanyaan "kalau deploy ulang
  databasenya gimana?") — dianggap dokumen operator yang wajib tertulis.
- Commit di `staging` (WapalaTUP); `main` menyusul setelah ACC sesuai alur
  baru Perubahan 13.

### Perubahan 16 — Manajemen tag + tag dinamis (permintaan user)
- Sebelumnya tag hardcoded 6 nilai (enum di `lib/content-tags.ts`, zod
  `z.enum(CONTENT_TAGS)`, chip filter iterasi konstanta).
- **Registry tag di database**: model `Tag` (name/slug unique) + migration
  additive `202610170001_content_tags` yang backfill tag dari
  `ContentRecord.fields.tags` existing + kosakata bawaan. Isi tag konten
  tetap di `fields.tags` (Json) — kompatibel penuh dengan data import.
- Domain `server/domains/tags.ts`: list + usage count (jsonb), create,
  rename (propagasi ke fields.tags + draftFields SEMUA konten, audited),
  delete (lepas dari semua konten, audited) — gated `content:write`,
  advisory lock konsisten dengan saveContent.
- API: `/api/admin/tags` (GET/POST), `/api/admin/tags/[id]` (PATCH/DELETE).
- UI: `backend/tag-picker.tsx` — `TagPicker` (checkbox dinamis + buat tag
  inline) dan `TagManager` (tabel usage, rename, delete); dipakai editor
  artikel + editor album; mode member = read-only tanpa create.
- Public: chip filter Kabar/Announcement/Galeri kini dari daftar tag
  terkelola (via `DemoState.contentTags` diisi `publicState` dari tabel
  Tag; fallback `DEFAULT_CONTENT_TAGS` untuk mode demo).
- `parseContentTags` dinamis (string apa pun ≤60 char, maks 12); zod konten
  menerima tag terkelola apa pun.
- Cakupan push: `staging` (WapalaTUP) saja — `main` menunggu ACC (alur
  Perubahan 13).

### Perubahan 17 — Perbaikan UI publik (laporan user + screenshot)
- **Halaman divisi**: baris "Bahan pengenalan: <diktat>" dihapus (permintaan
  eksplisit user); struktur topics tetap.
- **Hero beranda**: rail preview tampil seperti potongan foto rusak —
  kolom 44px full-height + sisa aturan flexbox lama. Redesign: kolom
  thumbnail 88px (64px ≤1100px) dengan tinggi sama (grid rows), foto aktif
  span penuh, penempatan grid ≥761px agar layout mobile ≤760px tak rusak.
- **Pembaca buku**: reader.css hardcode warna terang — kini theme-aware
  (variabel desain untuk navigation/thumbnail + stage gelap di dark mode);
  canvas halaman tetap putih (kertas).
- Verifikasi: typecheck, `lint --max-warnings=0`, prettier (commit-an
  terverifikasi clean; alarm awal = artefak CRLF/encoding pengujian).
- Commit: `db1f592` (tag management) + `0b111e3` (UI polish) di `staging`
  (WapalaTUP); `main` menunggu ACC.
- Deploy uji: menu Deploy ulang → *staging — build uji*; migration additive
  `202610170001_content_tags` akan ter-apply otomatis (expand-safe).

### Perubahan 20 — Perluasan video + ClamAV on-demand (keputusan user)
- **User request:** perluas ekstensi/codec video (50 MB/1080p tetap ok,
  4K tak akan tersentuh); ClamAV hemat RAM — pilihan user: **Opsi A
  clamscan on-demand** (tanpa daemon 24/7) + pesan error spesifik TANPA
  hint UI.
- **Video validation** (`server/media/validation.ts`):
  - Container: `video/mp4`, `video/quicktime` (.mov iPhone), `video/webm`,
    `video/x-matroska` (.mkv). Framing kondisional — ISO BMFF box walk
    (mp4/mov) vs magic EBML `1A45DFA3` (webm/mkv); ffprobe tetap hakim.
  - Codec: h264, hevc, **vp9, av1**. Catatan playback: H.264 paling aman.
  - `mediaPath`/storage/extension union + `mov/webm/mkv`; media tersimpan
    dengan container ASLI (bukan dipaksakan mp4).
  - **Pesan error spesifik per kriteria** (container/struktur/durasi/
    stream/codec/resolusi) — catch lama menelan DomainError spesifik,
    kini di-rethrow.
  - Batas tetap: 50 MB, ≤20 menit, ≤4K, 1 video stream.
  - `album-editor.tsx`: accept attr + daftar MIME + 50 MB semua video.
- **ClamAV on-demand** (provision + wapala.sh clamav_flow + scanner.ts):
  - Pasang `clamav` + `clamav-freshclam` TANPA daemon; env
    `MEDIA_SCANNER=clamscan` (default aplikasi); tanpa wrapper clamd +
    tanpa SupplementaryGroups (tidak ada socket clamd).
  - scanner.ts timeout: 45s → **120s** per file, 180s → **300s**
    recursive (clamscan memuat DB per panggilan).
  - RAM: idle lega (0 daemon); spike ~1-1.5 GB hanya saat scan unggahan
    (jarang, swap menampung). Tetap fail-closed. freshclam timer tetap.
  - Migrasi server existing (InterServer, masih clamd): matikan
    `clamav-daemon`, ubah `MEDIA_SCANNER=clamscan`, restart — tertulis
    juga di `clamav_flow` (deteksi clamdscan → tampilkan langkah).
- **Insiden proses (dibenahi):** commit salah landas di branch lokal
  `main-merge` (checkout staging ternyata dieksekusi di worktree Agents,
  mengunci branch staging di sana) — dipindah ke `staging` (ff), worktree
  Agents dikembalikan ke branch `Agents`, `main-merge` di-reset ke
  remote. TIDAK ada push ke main (per alur ACC).
- Verifikasi: typecheck, lint --max-warnings=0, bash -n, prettier-clean.
- Commit `ecd1936` di `staging` (WapalaTUP); `main` menunggu ACC.
- Uji di VPS: upload .mov/.webm → validasi baru; RAM idle tanpa clamd
  (`free -h`); scan EICAR via clamscan; unggahan tetap ditolak bila
  scanner tidak tersedia (fail-closed).

### Perubahan 18 — Resource management deploy (kerja agents, di-commit agent utama)
- Agents menambah upgrade besar di `host-deploy.sh` untuk VPS 2 GB
  (uncommitted di working tree; di-review lalu di-commit `d1c43fb`):
  - **Pause layanan latar saat build** (clamav-daemon/freshclam, timer
    email+maintenance) — membebaskan ~1.5 GB RAM saat build; snapshot
    unit DITULIS dulu ke state file sebelum stop agar pulih setelah
    OOM/SIGKILL/reboot.
  - **Restore di semua jalur keluar** (sukses, skip-restart, trap
    EXIT/INT/TERM/HUP) urutan terbalik; guard state tertinggal menolak
    deploy baru; `flock` mencegah deploy paralel.
  - **Gate MemAvailable** (`WAPALA_MIN_BUILD_AVAILABLE_MB`, default 1024)
    sebelum npm ci dan next build.
  - Env baru: `WAPALA_PAUSE_BACKGROUND` (default 1),
    `WAPALA_MIN_BUILD_AVAILABLE_MB`.
  - `docs/deploy-memory.md` + harness terisolasi
    `host/test-deploy-resources.sh` (bash murni, tidak dijalankan lokal —
    sesuai arahan user bahwa pengujian lokal tidak 1:1).
- Review: wiring benar (pause → gate → build → restore di semua jalur),
  snapshot-sebelum-stop + daftar gagal persisten = pola pemulihan solid.
- Sertakan: `eslint.config.mjs` ignore `^_` (untuk destructure cohort
  agents + placeholder masa depan), `album-video.test.ts` ffprobe 4.4
  side-data, walkthrough +2.
- Verifikasi: `bash -n` (deploy + harness), lint --max-warnings=0.
  Pengujian unit lokal TIDAK dijalankan lebih lanjut (arahan user: env
  lokal tidak 1:1 dengan server). Test suite agents (6 file, 38 pass/
  1 fail lokal) divalidasi di server testing.
- Commit `d1c43fb` di `staging` (WapalaTUP); `main` menunggu ACC.

### Perubahan 19 — ACC: staging di-merge ke main + mirror (keputusan user)
- User memberi ACC → merge `staging` → `main` (fast-forward) di WapalaTUP,
  lalu mirror `main` ke akun companion. Kedua `main` kini di `d1c43fb`.
- Isi rilis produksi baru: manajemen tag + tag dinamis, polish UI publik
  (divisi/hero/reader), cohort member (migration additive), resource
  management deploy (pause layanan saat build + gate RAM + flock),
  perbaikan data-reset/throttle, dukungan video album.
- Migration produksi yang akan ter-apply saat deploy berikutnya (semua
  additive, terverifikasi): `202610170001_content_tags`,
  `202610170001_editorial_workflow`, `202610180001_loan_equipment_identity`,
  `202610180002_member_wapala_cohort`.
- Deploy production berikutnya: server → `sudo bash host/wapala.sh` →
  Deploy ulang → *main — production* (deploy script clone main + migrate).

### Perubahan 16 — Review commit eksternal di `staging` (push langsung oleh user)
- Dua commit baru di `staging` WapalaTUP oleh user (hulwanul.azkap@hashmicro.id),
  di-review agent:
  - `3f6f42e` — dirty baseline editor artikel: `useRef(JSON.stringify(...))`
    → `useState(() => JSON.stringify(...))` (lazy init; versi lama
    mengevaluasi stringify tiap render). Semantik dirty-check identik,
    lebih efisien — **disetujui**.
  - `d12112c` — `backups` masuk `.prettierignore` + eslint ignores: di
    server, checkout memuat folder `backups/` berisi pg_dump/tar binary;
    mencegah format/lint menyapunya — **disetujui** (selaras .gitignore).
- Verifikasi: typecheck + lint lulus pada HEAD `d12112c`.
- Catatan: commit ini dibuat/di-push user langsung (sesi lain); agent hanya
  me-review dan mencatat, tanpa mengubah kode.
- HEAD `staging` WapalaTUP = `d12112c` = HEAD lokal (sinkron).

### Perubahan 15 — AllowScripts allowlist untuk install script npm 12.x
- User melaporkan warning `npm warn install-scripts` saat `npm ci` di npm
  12.x: 7 paket punya install script yang TIDAK dieksekusi karena belum
  di-approve (gate keamanan baru npm, ala pnpm).
- **Assessment:** npm di server deploy (11.19.1) TIDAK menegakkan gate ini —
  deploy berjalan normal (argon2/esbuild/prisma bekerja, terbukti dari sesi
  live). Warning berasal dari npm 12.x di mesin lain. Tetap perlu dibereskan
  agar upgrade npm ke depan/CI/mesin lain tidak menghasilkan build rusak
  (Cannot find module argon2.node / Prisma engine missing).
- **Fix (b69f621, branch `staging`):** `package.json` + `"allowScripts"` —
  approve tepat 5 paket yang script-nya wajib: `@prisma/engines` + `prisma`
  (engine), `argon2` (binding native node-gyp-build), `esbuild` (binary),
  `unrs-resolver` (postinstall resolver). `core-js`/`es5-ext` sengaja TIDAK
  di-approve (postinstall kosmetik).
- Catatan: schema `allowScripts` diambil dari instruksi output npm 12.x
  ("package.json/.npmrc"); belum bisa divalidasi runtime lokal (npm lokal
  11.12.1 belum mendukung subcommand `install-scripts`) — verifikasi ulang
  bila npm di mana pun menegakkan gate-nya.
- Commit di `staging` (WapalaTUP); `main` menyusul setelah ACC.


