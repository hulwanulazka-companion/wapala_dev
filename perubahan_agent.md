# Catatan perubahan agent — invoice peminjaman

Tanggal: 14 Oktober 2026.

Catatan ini mendokumentasikan perubahan yang saya lakukan pada sesi perbaikan invoice. Catatan agent sebelumnya tetap berada di `perubahan_agents2.md`; file tersebut sudah dibaca dan perubahannya dipertahankan.

## Diagnosis

- `WPLD443Q.pdf` memakai generator server sederhana di `src/app/api/public/forms/invoice/route.ts`. Header, watermark teks, daftar alat, dan penataan isinya berbeda dari template yang disepakati.
- `output/pdf/Invoice-WPL4N8Q2-A4-dua-salinan.pdf` memakai `buildInvoiceDocument()` di `src/lib/invoice-document.ts`: A4 landscape dengan dua salinan ukuran A5, logo, watermark gambar, QR, tabel alat, ketentuan, dan tanda tangan.
- Template tersebut masih memiliki footer `Pratinjau frontend - data contoh`.
- Panel admin backend belum memiliki tombol unduh invoice pada detail peminjaman. Tombol di komponen admin lama tidak digunakan oleh modul backend aktif.

## Perubahan implementasi

### Generator invoice server bersama

File baru: `src/server/invoices/loan-invoice.ts`.

- Menambahkan `findInvoiceLoan()` untuk membaca peminjaman beserta nama dan kode alat dari database.
- Menambahkan `renderLoanInvoice()` yang memetakan data database ke format generator `buildInvoiceDocument()` yang sudah ada.
- Membuat QR menuju halaman pelacakan kode peminjaman.
- Membaca logo dari `SiteSettings.config.logoUrl` dan `telULogoUrl`, melalui penyimpanan media internal. Tidak mengambil logo statis dari folder `public/images` pada jalur server ini.
- Memasok jenis gambar dan rasio dimensinya ke generator PDF.
- Bila referensi logo kosong atau gagal dibaca, invoice tetap dibuat tanpa gambar tersebut.

### Unduhan publik

File: `src/app/api/public/forms/invoice/route.ts`.

- Mengganti generator PDF sederhana dengan `renderLoanInvoice()`.
- Mempertahankan pemeriksaan cookie pemilik formulir, capability peminjaman, CSRF/origin, dan batas status invoice.
- Invoice publik hanya tersedia untuk peminjaman nonarsip yang telah disetujui, dengan jumlah alat disetujui lebih dari nol.
- Respons tetap PDF attachment dengan cache privat/no-store.

### Unduhan admin

File baru: `src/app/api/admin/loans/[id]/invoice/route.ts`.

- Menambahkan GET invoice berdasarkan ID peminjaman.
- Memerlukan sesi admin dan izin `loans:write`.
- Memeriksa UUID, keberadaan peminjaman, status arsip, dan adanya alat disetujui.
- Memakai generator server yang sama dengan unduhan publik.

File: `src/components/backend/loans.tsx`.

- Menambahkan tombol `Unduh invoice PDF` pada modal detail peminjaman.
- Tombol tampil bila status bukan diajukan/ditolak dan sedikitnya satu alat sudah disetujui.

### Template dan header resmi

File: `src/lib/invoice-document.ts`.

- Mempertahankan format A4 landscape, dua salinan, garis potong tengah, tabel alat, QR, ketentuan, tanda tangan, serta penanganan daftar alat panjang dan lampiran keterangan.
- Mengganti kepala surat menjadi teks terpusat pada setiap salinan:

  ```text
  FORM PEMINJAMAN ALAT LOGISTIK
  WAHANA PENCINTA ALAM (WAPALA)
  TELKOM UNIVERSITY PURWOKERTO
  Jl. D.I. Panjaitan No. 128 Purwokerto Gedung DSP TUP
  Email: wapalaittelkom@gmail.com
  ```

- Alamat dan email kepala surat saat ini merupakan teks eksplisit sesuai revisi user; tidak mengikuti alamat/email umum Pengaturan.
- Mengganti footer preview dengan `Dokumen peminjaman resmi`.
- Menambahkan opsi format dan rasio gambar untuk logo WAPALA, watermark, dan logo Tel-U; mengatur posisi serta ukuran header.
- Menggeser bagian awal formulir untuk menyesuaikan tinggi kepala surat.

File: `src/server/media/storage.ts`.

- Hasil `readMedia()` kini menyertakan `width` dan `height` dari metadata database agar generator invoice mengetahui rasio logo.
- Pemeriksaan akses dan checksum media tetap digunakan.

## Perubahan pengujian

- `tests/invoice.test.ts`: memperbarui asersi kepala surat, mempertahankan pemeriksaan dua salinan A4 landscape dan pagination, serta memastikan footer preview tidak muncul.
- `tests/backend/integration/public-forms.test.ts`: menambahkan pemeriksaan teks template resmi pada PDF hasil endpoint publik, termasuk label salinan dan footer.

## Hasil verifikasi yang benar-benar tercatat

- `npm test`: 89/89 lulus sebelum penyesuaian terakhir rasio gambar.
- `npm run test:backend`: 37/37 lulus sebelum penyesuaian terakhir rasio gambar.
- Setelah penyesuaian terakhir rasio gambar: tes invoice 3/3 lulus, `npm run typecheck` lulus, dan `npm run build` lulus.
- `npm run lint`: 0 error, 8 warning lama terkait import `Notice` dan parameter `_obsoleteVerifier` yang tidak digunakan.
- `git diff --check`: tidak melaporkan kesalahan whitespace; terdapat pemberitahuan normalisasi LF/CRLF Git.
- Tes integrasi penuh sempat dijalankan pada database uji terisolasi. Output yang tertangkap menunjukkan kegagalan pada `Event HTTP flow publishes form registers participant and exports session-only Excel`. Hasil akhir lengkap dan diagnosis kegagalan belum tertangkap; tidak boleh dianggap seluruh suite integrasi lulus.
- Percobaan menjalankan satu file integrasi secara langsung gagal karena konfigurasi environment belum dimuat. Runner resmi `scripts/backend-integration.ts` digunakan pada percobaan berikutnya.

## Hal yang belum diverifikasi / tindak lanjut

- Kedua PDF sumber sudah dirender dan dibandingkan secara visual. PDF baru setelah perubahan kepala surat dan rasio logo belum dirender untuk pemeriksaan visual akhir.
- Alur unduh admin dengan sesi login nyata dan gambar logo dari Pengaturan belum diuji sampai hasil unduh akhir.
- Lebar logo Tel-U saat ini dibatasi 25 mm dengan tinggi 9 mm. Jika rasio gambar lebih lebar daripada batas tersebut, perhitungan tinggi perlu disesuaikan lagi agar rasio benar-benar terjaga.
- Header lampiran keterangan masih memakai teks lama `WAPALA TELKOM UNIVERSITY`; belum disamakan dengan lima baris kepala surat utama.
- Endpoint admin memeriksa jumlah alat disetujui, tetapi belum menolak status `requested`/`rejected` secara eksplisit seperti endpoint publik. UI sudah menyembunyikan tombol untuk kedua status tersebut.
- Jalur ekspor lama `src/lib/exports.ts` masih memakai logo statis; jalur unduhan backend baru tidak memanggilnya.
- Perubahan ini belum dikomit, dipush, dideploy, atau dimasukkan ke ZIP baru oleh saya.
- Direktori `tmp/pdfs` berisi render pembanding sementara. Upaya pembersihan ditolak oleh pemeriksaan otomatis sehingga belum dihapus.

## Batas kepemilikan perubahan

- Saya tidak mengubah isi dokumen catatan agent lain, CSS divisi, komponen halaman divisi, atau aset `public/images/tel-u.png` pada sesi ini. File-file tersebut terlihat berubah di working tree dan tidak boleh diklaim sebagai hasil perubahan saya.
- `next-env.d.ts` dapat diperbarui otomatis oleh proses Next.js saat build/integration test.
- Penelusuran generator dan pemanggil awal memakai CodeGraph CLI, kemudian diverifikasi melalui pembacaan source dan diff aktual.

## Pemisahan branch — 14 Oktober 2026

Permintaan pengguna: simpan instruksi/catatan AI pada `Agents`, buat `staging`,
dan rename branch aplikasi menjadi `main` untuk checkout VPS.

- Branch lokal `master` di-rename menjadi `main`.
- Branch `Agents` mempertahankan snapshot kode beserta file AI dan versi terbaru
  `perubahan_agents2.md` yang sebelumnya belum dikomit.
- Dari `main`, file AI berikut dipindahkan keluar dari tracked tree: `AGENTS.md`,
  `agent_readme.md`, `codegraph.json`, kedua catatan perubahan agent,
  `scripts/codegraph.ps1`, peta CodeGraph, ledger/review/rencana desain historis,
  folder Superpowers, serta skrip/aset/checkpoint/QA kerja Figma.
- File tersebut dapat dipulihkan dari `Agents`; riwayat Git tidak dihapus.
- Panduan deployment/setup/Event, kode aplikasi, migrasi, pengujian, dan skrip
  operasional tetap berada di branch aplikasi.
- `.gitignore` branch aplikasi mengabaikan file AI yang dibuat ulang alat lokal.
- README dan `docs/branch-workflow.md` mendokumentasikan fungsi tiap branch dan
  larangan merge keseluruhan `Agents` ke branch aplikasi.
- Allowlist packaging diganti dari laporan kerja agent menjadi panduan branch.
- Tes packaging: 4/4 lulus. Tidak ada perubahan logika runtime aplikasi.
- Perubahan lokal CSS divisi, komponen divisi, logo statis Tel-U, dan
  `next-env.d.ts` tetap dipertahankan tanpa ikut commit pemisahan.
- API rename branch GitHub menolak dengan HTTP 403 (izin admin repo tidak
  tersedia). Branch baru dapat dipush melalui izin collaborator. Pemilik repo
  perlu mengatur `main` sebagai default branch; `master` remote dipertahankan
  sampai pengaturan tersebut diganti.

## Perbaikan temuan UAT 1–4 — 14 Oktober 2026

Status: implementasi dan verifikasi lokal selesai; belum commit/push. Checkout
aplikasi sekarang berada di `staging`. Perubahan pengguna/agent lain yang sudah
ada pada CSS divisi, halaman divisi, dan logo Tel-U statis dipertahankan.

### 1. Upload bukti donasi ditolak 403

- `src/app/api/public/forms/context/route.ts`: gunakan kembali cookie preauth
  yang valid, sama seperti auth context, bukan mengganti token pada setiap GET.
- `src/components/public-transport.tsx`: segarkan konteks sebelum setiap POST
  (termasuk multipart) agar token yang dikirim sesuai cookie terbaru. Lock
  permintaan, pemilik berkas, CSRF, origin, throttle, dan scanning tetap aktif.
- Pesan error upload ditampilkan; teks instruksi verifikasi pihak ketiga yang
  sudah tidak berlaku dihapus. Form peminjaman/tracking/revisi OR juga mendapat
  pesan error yang terlihat.
- Uji HTTP/database dengan ClamAV asli: beberapa refresh context, upload proof
  201, submit donation 200, media bisa dibaca admin berizin dan ditolak anonim.

### 2. Berita dan Announcement gagal validasi

- `src/lib/content-slug.ts`: normalisasi slug menjadi lowercase dan tanda
  hubung, dengan batas 160 karakter.
- `src/components/backend/records.tsx`: saat menyimpan konten, normalisasi slug
  yang diisi atau buat dari judul bila kosong; judul wajib dan placeholder slug
  menjelaskan pengisian otomatis.
- `src/server/http/auth-handler.ts`: kegagalan validasi field menyebut nama
  field yang perlu diperiksa, tanpa mengirim balik nilai pribadi.
- Uji kedua tipe konten lengkap berhasil tersimpan dan tampil sebagai publik.

### 3. Gambar pada view/detail admin

- `src/components/backend/media-preview.tsx`: komponen gambar internal dengan
  ukuran proporsional, tautan ukuran penuh, dan fallback buka berkas jika bukan
  gambar/preview gagal. Tidak mengubah akses privat media.
- OR: foto pada modal detail; label field lebih mudah dibaca.
- Inventaris: thumbnail lazy-load pada daftar dan preview foto pada editor.
  Tiga tombol aksi Edit/Tersedia/Arsipkan tetap dipertahankan.
- Donasi: bukti transfer pada tinjauan memakai preview bersama; sampul/poster/
  QRIS editor yang sebelumnya sudah ada tetap digunakan.
- Event: sampul/poster pada daftar dan editor; respons peserta dengan field
  upload menampilkan gambar, dengan tautan untuk PDF/berkas yang tak bisa
  ditampilkan sebagai gambar.

### 4. PDF OR tabel dan foto

- `src/server/domains/applicant-pdf.ts`: PDF A4 portrait, setiap pendaftar
  mempunyai tabel data lengkap dan pas foto yang mempertahankan rasio asli.
  Teks panjang dilanjutkan tanpa dipotong; halaman lanjutan punya header dan
  nomor halaman. Foto kosong diberi keterangan, data pendaftar tetap disertakan.
- `src/server/domains/operational-export.ts`: ambil foto melalui readMedia
  dengan principal admin; thumbnail PNG dibatasi 180×240 agar ekspor hemat
  memori. Excel tetap memakai data/format sebelumnya. PDF maksimum 200 halaman
  dan 200 pendaftar; ekspor besar ditolak dengan pesan, tidak diekspor sebagian.
- `src/lib/recruitment-fields.ts`: label OR bersama untuk UI dan PDF.
- PDF QA `output/pdf/OR-2026-tabel-foto-QA.pdf` dibuat dari data sintetis dan
  gambar blok warna uji, dirender ke PNG serta diperiksa visual. Bukan data user
  dan bukan foto pendaftar asli.
- Uji integrasi OR memakai foto sungguhan dari upload scanner pada database
  test, lalu membuktikan PDF mengandung embedded image dan tabel.

### Verifikasi

- `npm test`: 90/90 lulus.
- `npm run test:backend`: 39/39 lulus.
- `WAPALA_TEST_NATIVE_SCANNER=1 npm run test:backend:integration`: 81/81 lulus,
  0 skip; schema/database uji terisolasi. `scripts/backend-integration.ts` kini
  memuat konfigurasi scanner lokal tanpa mencetak konfigurasi tersebut.
- Typecheck dan production build lulus. Lint: 0 error, 7 warning parameter
  `_obsoleteVerifier` lama. Diff check tidak menemukan error whitespace.
- Tes Event HTTP lama masih mengharapkan challenge dan status upload 400;
  diperbarui sesuai pencabutan provider dan kontrak FORM_CHANGED (409), dengan
  asersi code error. Tidak ada pelonggaran pemeriksaan keamanan untuk meluluskan
  tes. Tes idempotency mengonfirmasi adapter verifier lama tidak dipanggil.
- Log hasil akhir ada di `.local/flow-fixes-integration-final.log` (ignored).
- Tidak ada reset akun/data development, pengiriman SMTP nyata, operasi VPS,
  commit, atau push dalam pekerjaan ini. Pengujian visual flow user berikutnya
  tetap diperlukan untuk approval hasil UI.

## 2026-10-14 — Paket sumber publik dan tambahan menu Angkatan (dalam pengerjaan)

- Koleksi publik dari wapalatelkomuniversity.org disimpan di
  `import-packages/wapala-public-site/` pada worktree Agents: 21 angkatan,
  22 album, 129 foto album, total 150 berkas gambar. Menyertakan kategori,
  keterangan foto, tahun album, snapshot HTML, dan checksum SHA-256.
- Tidak menebak tanggal kegiatan/lokasi/tahun angkatan yang tidak tersedia.
  Tidak mengambil dokumen Src atau CSV anggota privat dalam paket ini.
- Migration `202610140003_public_source_generations` sudah diterapkan lokal,
  membuat tabel Generation tanpa menghapus data yang sudah ada. Data publik
  Angkatan disiapkan untuk membaca database, bukan array statis.
- CLI `scripts/import-public-site.ts` disiapkan: default dry-run, validasi
  checksum/coverage, antivirus sebelum apply, normalisasi WebP, transaksi,
  provenance, dan deduplikasi tanpa menimpa pengeditan manual.
- Dry-run paket menghasilkan 21 angkatan baru, 22 album baru, 150 media baru.
  **Apply ke database lokal belum dilakukan; QA importer belum selesai.**
- README dan wrapper `import.mjs --app APP_FOLDER` tersedia dalam paket.
  Importer aplikasi berada di `src/server/domains/public-site-import.ts`
  supaya tidak terbuang oleh pengecualian folder imports pada paket release.
- Tambahan permintaan: menu Angkatan bisa dikelola Super User, Multimedia,
  dan POH. Tambahkan peran Anggota yang hanya melihat anggota WAPALA serta
  meminta perbaikan data, dengan persetujuan ketiga peran admin tersebut.
  **Belum diimplementasikan**: batas data yang terlihat dan apakah permintaan
  koreksi hanya boleh untuk profil pemilik akun perlu dipastikan terlebih dulu.
- Menggunakan discovery CodeGraph CLI; sumber diperiksa kembali karena indeks
  belum mencerminkan perubahan importer yang baru.
- Belum commit/push. Menunggu instruksi pengguna sebelum push paket/data.

## 2026-10-14 — Selesai: Angkatan, akses anggota, koreksi, dan import lokal

Bagian ini memperbarui status catatan dalam pengerjaan di atas. Pengguna
mengonfirmasi anggota boleh melihat direktori, tetapi hanya meminta koreksi
profil sendiri; kemudian memberi instruksi untuk mencatat dan push.

### Perubahan aplikasi (staging, commit a55f86d)

- Menu Angkatan untuk Super User, Multimedia, dan POH: tambah/edit nomor,
  nama, label, tahun opsional, keterangan, foto, serta arsip/pulihkan.
  Halaman profil publik membaca angkatan aktif dari database. Foto manual
  memakai purpose generation-photo dengan hak upload khusus ketiga peran,
  bukan memberikan POH izin konten lain.
- Peran ANGGOTA baru, dibuat Super User dari menu Pengguna dan ditautkan
  satu-ke-satu ke profil anggota aktif. Tidak ada self-signup, pembuatan akun
  massal, reset password lama, atau penautan otomatis berdasarkan NIM/email.
- Anggota hanya mendapatkan menu Anggota; direktori tidak mengungkap
  NIM/kontak anggota lain. Koreksi nama, NIM, prodi, angkatan, jenis kelamin,
  dan kontak hanya untuk profil akun sendiri. NIA/status/foto/nomor tetap
  dikelola editor admin. Permintaan tidak langsung mengubah data.
- Super User, Multimedia, dan POH meninjau dari menu Koreksi data anggota.
  Persetujuan/penolakan dicatat dengan catatan dan audit. Fresh-session,
  CSRF, schema ketat, row lock, version check, dan indeks satu pending per
  profil mengamankan akses serta mencegah overwrite data terbaru.
- Review menemukan dua kasus tepi dan keduanya diperbaiki: akun tetap dapat
  dinonaktifkan ketika profilnya diarsipkan; antrean pending memakai urutan
  paling lama dan cursor pagination, sehingga tidak tenggelam di riwayat.
- Migration 003 dan 004 diterapkan lokal tanpa menghapus data. Panduan
  `docs/member-access.md` ikut allowlist paket release. Tidak merombak CSS,
  tema, logo, atau modul lain.

### Paket publik (Agents)

- Folder `import-packages/wapala-public-site/` menyimpan collector, wrapper,
  README, manifest/checksum, gambar asli dan snapshot halaman sumber.
- Import lokal selesai: 21 angkatan, 22 album, 129 foto album, 150 media
  unik. Caption/kategori/tahun sumber dipertahankan; tanggal/lokasi yang
  tidak disediakan tidak dibuat-buat. Gambar masuk lewat antivirus native
  dan normalisasi WebP, tanpa melewati pemeriksaan keamanan.
- Import ulang dengan --apply menambahkan 0 angkatan, 0 album, 0 media.
  Data manual/pengeditan/arsip tetap dipertahankan.
- Manifest SHA-256:
  `cd3d9a9b6df5527afde373aa2afd05f2ff31334bee256d69b0910a652a2ebb12`.
  `.gitattributes` mempertahankan byte manifest/checksum lintas OS.
- Kode importer ada di staging a55f86d; checkout Agents bukan aplikasi deploy.
  Jangan merge seluruh Agents ke main. Paket baru digunakan pada server
  setelah revision aplikasi ini dan migration-nya tersedia di branch deploy.

### Verifikasi dan batas hasil

- npm test: 90/90; test:backend: 41/41; integrasi native scanner: 86/86,
  0 skip (217 tes total), termasuk penolakan koreksi profil lain, persetujuan
  ketiga peran, konflik versi, review ulang, deaktivasi, dan import idempotent.
- Typecheck dan production build lulus; lint 0 error, 7 warning parameter
  obsoleteVerifier lama. Diff check lulus. Review read-only menyatakan dua
  temuannya selesai; pengecekan React mempertahankan komponen/pola lama.
- Count database lokal mengonfirmasi 21 angkatan, 22 album import dan 129
  foto album. HTTP /profil dan /galeri 200 serta memuat data import.
- PostgreSQL lokal sempat ikut berhenti saat reload proses dev, dipulihkan
  tanpa reset data; tes integrasi kemudian diulang sampai seluruhnya lulus.
- Discovery menggunakan CodeGraph CLI lebih dulu; karena indeks stale/
  worktree berbeda, detail implementasi diverifikasi dari source langsung.
- Perubahan lama yang tidak terkait pada tel-u.png, globals.css, bagian
  Divisions di public-pages.tsx, dan next-env.d.ts tidak ikut commit.
- Push diarahkan ke staging (kode) dan Agents (paket/catatan), bukan main.
  Tidak melakukan deployment VPS atau uji batas RAM 2 GB di server; tidak
  mengklaim seluruh website bebas bug atau sudah melewati UAT visual baru.

- Push terverifikasi: staging `a55f86d`, paket Agents `cf49750`. Snapshot HTML
  asli ditandai binary di Git agar byte sumber/CRLF tidak diubah dan bukan
  dianggap diff kode aplikasi. Main tetap `244b723`.

## 2026-10-14 — Paket publik tersedia di staging; anggota/inventaris exclude

- Sesuai instruksi terbaru pengguna, folder `import-packages/wapala-public-site/`
  juga dimasukkan ke staging (`a61f1eb`). Isinya hanya data publik album dan
  angkatan: 21 angkatan, 22 album, 129 foto album, 150 gambar unik serta script
  dan panduan import. Data anggota/CSV dan inventaris tidak dimasukkan.
- Semua 150 asset diverifikasi kembali ukuran dan SHA-256. Checksum manifest
  cocok; syntax collector/wrapper lulus. Wrapper dry-run dari folder staging
  lulus dan melewati data yang sudah diimport lokal, tanpa mutation database.
- README diperbarui agar perintah import langsung memakai folder di checkout
  staging. Salinan Agents tetap sebagai arsip; paket ZIP source masih memakai
  allowlist terpisah dan tidak otomatis ditambah data ini.
- Commit hanya memuat 166 file paket publik. Perubahan lain yang sebelumnya
  belum di-commit tidak ikut. Tidak mengubah kode aplikasi, main, atau VPS;
  belum membuat perintah `gitupdate`.
- CodeGraph CLI tidak menemukan simbol importer baru pada indeks lama;
  pemeriksaan dilakukan langsung pada manifest, asset, script dan tree Git.

## 2026-10-14 — Koneksi NAT VPS dan status deployment awal

- Checkout VPS `/home/codex/wapala-repo` berada di main `4e27a22`;
  source aplikasi sudah di-clone, tetapi build VPS belum berhasil dijalankan.
- SSH alias lokal menggunakan key dan proxy TCP Node, tetap memvalidasi host
  key. Sudo tanpa password dibatasi pada empat aksi wrapper wapala-service;
  sudo umum tetap memerlukan password. Tidak menyimpan credential di repo.
- RAM VPS terukur sekitar 1 GB, tanpa swap. Uji scan ClamAV sebelumnya
  timeout; kapasitas antivirus bersama aplikasi belum tervalidasi.
- `npm ci` pertama gagal ECONNRESET; dua percobaan berikutnya dihentikan
  sistem (Killed), termasuk dengan heap Node 256 MB. Log kernel guest belum
  membuktikan penyebab kill; tidak mengklaim OOM sebagai diagnosis pasti.
- Nginx sebelumnya gagal bind port 80 karena Apache sudah mendengarkan di
  sana. Apache tidak dihentikan. Symlink konfigurasi Nginx default dipindah
  ke backup root; konfigurasi awal khusus port 33335 lolos `nginx -t`.
- Pengguna menambahkan TCP forwarding publik 33335 ke VPS 33335. Nginx
  aktif dan tes eksternal `/deployment-health` menghasilkan HTTP 200.
  Halaman utama sengaja HTTP 503 dengan pesan deployment belum selesai;
  belum menayangkan aplikasi, login, maupun formulir.
- PostgreSQL tetap localhost 5432; tidak mengekspos port database/Node.
  WAPALA app auto-start belum diterapkan sesuai instruksi pengguna.
- Production readiness belum tercapai: dependensi/build, konfigurasi database
  aplikasi/email, HTTPS, dan resource preflight masih harus dituntaskan.
- CodeGraph CLI diperiksa lebih dulu, tetapi indeks menunjuk working tree
  lain dan stale; konfigurasi deploy divalidasi langsung dari source.

## 2026-10-14 — Percobaan build lanjutan dan domain wapala.my.id

- Pengguna meminta mencoba build lagi dan menetapkan domain `wapala.my.id`.
  Provider melarang swap; tidak membuat atau mengaktifkan swap.
- Uji isolasi `npm ci --ignore-scripts --no-audit --no-fund` memakai heap
  Node 256 MB dan satu socket npm. Proses kembali dihentikan dengan Killed
  ketika ekstraksi dependensi, sebelum Prisma generation atau Next build.
  Tidak mengklaim build telah dijalankan atau berhasil.
- Cgroup guest v1 melaporkan limit dan historical peak 1.048.576.000 byte.
  Saat instalasi, pemakaian teramati 1.047.171.072 byte. Ini menunjukkan
  tekanan memori container, tetapi kernel guest tidak menyediakan bukti
  OOM kill individual. `memory.failcnt` tetap 600 selama uji ini.
- DNS A melalui resolver publik 1.1.1.1 mengembalikan NXDOMAIN untuk domain;
  resolusi pada VPS juga belum menghasilkan alamat. Belum mengubah DNS,
  domain forwarding, sertifikat, source aplikasi, atau mode keamanannya.
- Nginx HTTP awal tetap tersedia; aplikasi production belum diaktifkan.

## 2026-10-14 — Domain dan HTTPS NAT diaktifkan, Apache dipertahankan

- DNS `wapala.my.id` sudah ter-resolve ke 185.205.222.202. Pengguna mengubah
  forwarding HTTP publik 80 ke internal 33335 dan HTTPS publik 443 ke
  internal 33336. Apache provider tetap aktif pada internal port 80.
- Proses setup lama dibatalkan sebelum konfigurasi domain/stop Apache.
  Helper lama dinonaktifkan agar tidak bisa menghentikan Apache kemudian.
- Nginx memakai 33335 untuk ACME HTTP-01 dan redirect HTTP ke HTTPS;
  listener TLS 33336 memakai sertifikat Let's Encrypt untuk wapala.my.id.
- Certbot webroot berhasil menerbitkan sertifikat, expiry 2027-01-12.
  Scheduled renewal bawaan Certbot disertai deploy hook nginx config-test
  dan reload; dry-run renewal belum dilakukan. App auto-start tetap belum
  diaktifkan sesuai instruksi pengguna.
- Tes eksternal dengan hostname/SNI yang benar dan validasi TLS aktif:
  HTTP root 301 ke https://wapala.my.id/, HTTPS deployment-health 200,
  HTTPS root 503 pesan deployment aplikasi belum selesai. Tidak memakai
  sertifikat self-signed atau mematikan certificate verification.
- `nginx -t` lulus; Apache dan Nginx keduanya terverifikasi aktif.
  Source aplikasi/build/database aplikasi/email dan capacity preflight masih
  belum selesai; HTTPS aktif bukan klaim website production sudah berjalan.

## 2026-10-14 — GitHub Actions Linux runtime dan tanpa email

- Pengguna menyetujui build GitHub Actions dan pengiriman hasilnya ke VPS.
  Main `6bc975b` menambahkan workflow manual Ubuntu 22.04 x64/Node 24.21.0:
  npm ci, Prisma generation, tes unit/backend/integration PostgreSQL disposable,
  typecheck, lint, Next build, runtime tar.gz/checksum/commit metadata.
  Actions dipin SHA, tidak membawa SSH key/secret server, dan tidak auto-deploy.
- Run 38572300643 berhasil; artifact 377.390.817 byte diunduh dan digest SHA-256
  GitHub diverifikasi. Dependency operator Linux ikut agar VPS tidak npm ci.
  Data staging/CSV/database/environment tidak masuk paket. Source ZIP allowlist
  ikut membawa workflow dan panduan Linux; tests memakai real filesystem.
- Provider memblokir SMTP dan pengguna memilih operasi awal tanpa email.
  Main `b67e08b` menambahkan EMAIL_MODE=disabled: tidak mengantrekan notifikasi,
  tidak mengklaim delivery, dan menutup recovery/reset email web tanpa mint
  token. Context/UI menjelaskan SSH untuk Super User dan reset admin oleh SU.
  Production tetap wajib HTTPS; sink/preview tidak dibolehkan.
- QA lokal: 97 unit dan 42 backend lulus; integrasi 88 test, 84 lulus/4 native
  scanner dilewati. Typecheck lulus; lint 0 error/7 warning lama. Assertion sesi
  baru diperbaiki sesuai kontrak resolveSession (revoked mengembalikan null).
- Build final run 38574949788 sedang dikemas setelah seluruh test/build Linux
  lulus. Checkout source VPS diperbarui ke b67e08b tanpa npm ci/build di VPS.
- Preflight ClamAV dengan signature lengkap dan guard sementara 800 MB kembali
  timeout exit 124 setelah 120 detik. Daemon dihentikan, guard dipulihkan;
  swap tidak dibuat dan antivirus tidak dibypass. Runtime bersama scanner
  belum lolos pada RAM 1 GB; WAPALA service/app auto-start belum diaktifkan.
- Apache provider dan Nginx tetap aktif. File next-env.d.ts generated yang
  sebelumnya dirty tidak ikut commit. CodeGraph CLI menemukan createSourceZip;
  indeks stale/worktree mismatch, detail diverifikasi langsung dari source.
- Checklist React mempertahankan hook order, cancellation dan Notice yang
  aksesibel; perubahan UI hanya petunjuk pemulihan sesuai mode email.

### Permintaan lanjutan: build langsung di VPS

- Pengguna mengalihkan fokus kembali ke build VPS dan meminta tidak menjalankan
  pemeriksaan scanner lagi. Tidak menjalankan scan tambahan setelah instruksi.
- Prisma generation langsung gagal `prisma: not found`: dependency hasil
  instalasi sebelumnya tidak lengkap. Instalasi npm ci berikutnya dengan heap
  192 MB, MALLOC_ARENA_MAX=2 dan satu socket tetap dihentikan (`Killed`).
  UV_THREADPOOL_SIZE yang tercantum pada percobaan adalah nama variabel yang
  tidak dikenali Node (yang benar UV_THREADPOOLSIZE); tidak mengklaim thread
  pool benar-benar dibatasi. Log npm tidak menyediakan alasan kernel kill.
- Build Next di VPS belum bisa dimulai karena install prerequisite gagal.
  Tidak mengaktifkan aplikasi, tidak menambah swap, dan tidak mengklaim sukses.

## Checkpoint deployment berhasil — 14 Oktober 2026

- Instalasi serial dengan cache baru, heap 512 MB, UV_THREADPOOLSIZE=1 dan
  MALLOC_ARENA_MAX=2 berhasil; Exim hanya dipause sementara dan dipulihkan.
- VPS kemudian melaporkan RAM 2 GB dan limit cgroup 2.097.152.000 byte.
  Build langsung di VPS dengan heap 768 MB berhasil, build ID
  `3_9yMpZYETfwZFzkpghWx`, release main b67e08b.
- Database produksi kosong dibuat dengan role migration terpisah dari runtime.
  Runtime bukan superuser, tidak boleh DDL/truncate, AuditLog hanya select/insert.
  Secret environment dibuat privat di VPS, bukan di repository.
- Release `/srv/wapala/releases/b67e08b` diaktifkan melalui current symlink.
  Systemd app berjalan nonroot, loopback 3000; Nginx NAT HTTPS proxy aktif.
  Apache provider dipertahankan, email disabled, app auto-start tetap deferred.
- Tes eksternal TLS valid: /, /profil, /galeri, /event, /donasi, /peminjaman,
  /wapala, /api/health dan /api/auth/context semuanya 200. Cookie auth Secure
  dan HttpOnly. Pengguna kemudian mengonfirmasi setup/login sudah berhasil.
- `docs/vps-ssh-commands.md` mencatat perintah layanan, bootstrap/recovery,
  layout release dan panduan import; tidak mengklaim gitupdate sudah terpasang.
- Pengguna meminta migrasi hanya Album/Angkatan. Anggota/Inventaris tetap exclude.
  GitHub DNS pada VPS gagal sementara, jadi snapshot paket origin/staging
  8e584423fdbdc5b58b1d88a003604aa109437994 dikirim melalui SCP.

## Import produksi Album/Angkatan selesai

- Snapshot tar staging yang dikirim cocok SHA-256 lokal/VPS:
  8c8eacff02fa2097beff7a5b2da945b77afb35346937c2f0159f3dace2c5ef28.
- Dry-run produksi lulus: 21 angkatan, 22 album, 129 foto album, 150 media.
  Izin eksekusi binary esbuild release diperbaiki menjadi 0755 untuk service
  user wapala; tidak mengubah password atau ownership data pengguna.
- Backup pg_dump dan media disimpan privat di root sebelum apply. Apply
  dijalankan sebagai wapala dengan runtime DB role, signature/checksum checks,
  dan transaksi importer; hasil 21/22 records dan 150 media ditambahkan.
  Data manual, akun yang sudah dibuat dan pengaturan tidak ditimpa.
- Website sempat 502 selama penghentian writer untuk backup/import; layanan
  dipulihkan dan tes eksternal /, /galeri, /profil, /wapala, /api/health semua
  200. Referensi foto publik tampil; sampel gambar WebP menghasilkan 200.
- Tidak mengimpor Anggota/Inventaris. Tidak memperbarui main dengan paket data.
- Panduan SSH dan catatan dipush ke branch bernama `Agents` (bukan `Agent`).
- Dry-run sesudah apply: angkatan add 0/skip 21, album add 0/skip 22, media
  add 0; import ulang tidak membuat duplikat. Tes semua 159 referensi gambar
  publik (termasuk gambar yang sudah ada sebelumnya) menghasilkan HTTP 200
  dan content-type image, tanpa kegagalan. Halaman galeri tetap HTTP 200.

## 2026-10-15 — README main berorientasi production

- Mempertahankan penyebutan organisasi yang diperbarui pengguna pada 380cf29.
- Main 48aea2e hanya mengubah README: production/build/standalone/systemd
  menjadi acuan utama, development terpisah, mode email disabled/SSH recovery,
  NAT 33335/33336 tanpa mematikan Apache, batas kapasitas, migration/backup,
  pemisahan paket staging dan auto-start yang masih ditunda.
- Menjelaskan batas readiness script lama (profil SMTP), template Nginx yang
  belum NAT-specific dan gitupdate yang belum terpasang; tidak mengklaim
  installer otomatis atau siap pada semua VPS tanpa konfigurasi.
- Tautan lokal dan nama npm scripts tervalidasi tanpa referensi hilang;
  Prettier dan diff check lulus. Tidak mengubah kode runtime, secret atau
  layanan VPS; next-env.d.ts generated yang sudah dirty tidak ikut commit.
