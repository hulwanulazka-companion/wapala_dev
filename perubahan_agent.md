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
