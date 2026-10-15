# WAPALA Vercel: satu deployment production setelah persiapan akun

Status: rancangan untuk persetujuan, belum implementasi. Melengkapi rancangan
impor 2026-10-16; tidak mengklaim upload/import/auto-setup sudah berfungsi.

## Hasil yang diminta

Isi branch vercel dapat dipindahkan ke repository GitHub milik WAPALA, sebagai
branch main. Setelah resource/secret akun tujuan disiapkan, import repository ke
Vercel dan satu deployment production menyiapkan aplikasi/database/paket impor.
Pemilik lalu mengambil token instalasi melalui Browse Data database (bukan file
website publik), membuka /wapala, dan menentukan password Super User sendiri.
Tidak menulis ulang aplikasi atau mengubah VPS/main repository lama.

## Batas otomatisasi

- Kode tidak membawa izin GitHub, Neon, Blob, token service, atau secret akun lama.
  Pemilik akun tujuan mengotorisasi GitHub serta menghubungkan database/Private
  Blob ke project Production sebelum build. Detail ini dijelaskan di README.
- Tidak hardcode username/workspace/project/store ID, folder Windows, hostname
  database, password, atau domain testing. Repository root langsung aplikasi;
  tidak perlu folder Vercel di dalam repository GitHub tujuan.
- Secret URL database runtime/migrator dan SECURITY_KEY berada pada environment
  server Vercel; Blob memakai kredensial project yang terhubung. README memberi
  daftar key, format, pemisahan akses migrator/runtime, dan validasi origin.
- APP_URL menunjuk domain production yang dipilih pemilik. Preview tidak diberi
  database atau pipeline migrasi/impor production secara otomatis.

## Pipeline deployment

1. Preflight memvalidasi environment, schema tujuan, kredensial storage/scanner,
   dan paket impor. Kesalahan berhenti dengan pesan aman tanpa nilai secret.
2. Generate Prisma, migrasi additive dengan koneksi migrator, dan penerapan izin
   runtime yang dibatasi ke schema aplikasi. Tidak menjalankan reset atau db push.
3. Foundation/settings dibuat bila belum ada. Setup token diterbitkan hanya bila
   belum ada Super User/setup selesai. Deploy ulang tidak mengubah password,
   sesi, settings hasil edit, atau membuka ulang setup yang sudah selesai.
4. Import paket diproses sekali berdasar manifest/checksum, dalam urutan relasi,
   dengan lock dan catatan hasil untuk retry tanpa duplikasi. Perubahan manual
   tidak diam-diam ditimpa. Kegagalan tidak dipromosikan sebagai aplikasi siap.
5. Build Next.js; uji deployment production pada project Vercel tujuan dan route
   media sebelum menyatakan siap. Produksi VPS/domain lama tidak dipindahkan.

## Token instalasi yang dapat diambil operator dari Browse Data

- Token ini hanya token setup Super User, bukan token Blob/Vercel/database.
- Nilai acak kuat disimpan sementara pada record instalasi khusus agar operator
  berizin database dapat membacanya. Hash token tetap menjadi pembanding otoritas.
  Ini merupakan kompromi yang disengaja: pembaca record itu dapat melakukan setup
  selama token berlaku; akses Browse Data harus dibatasi kepada pemilik/operator.
- Tidak ada endpoint publik/halaman file publik/log/build artifact yang
  mengembalikan token. App publik hanya menerima token dari operator pada form.
- Berlaku 30 menit dan satu kali pakai; password wajib ditentukan operator dan
  di-hash seperti alur yang ada. Penggunaan token dan penutupan instalasi atomik.
- Setelah berhasil, hapus nilai terbaca dan hash; setup tertutup permanen pada
  database tersebut. Token kedaluwarsa tidak berlaku meskipun record belum
  dibersihkan; redeploy saat setup belum selesai boleh menerbitkan ulang token
  kedaluwarsa, tetapi tidak membatalkan token yang masih berlaku.
- Tidak otomatis membuat password default atau menyalin credential VPS.

## Data dan media

- Paket publik staging (21 angkatan, 22 album, 129 foto/150 gambar) dapat
  disertakan sebagai paket impor Git yang tervalidasi, tanpa mengambil ulang web.
- Paket operasional tambahan dari VPS, jika mencakup data pendaftar/donatur/
  riwayat, tetap artefak privat di Blob yang disiapkan sebelum deployment akun
  tujuan. Tidak memasukkan data pribadi atau credential dalam GitHub.
- Kecualikan anggota/inventaris dan media khusus keduanya. Akun, password,
  session, token, throttle, outbox, dan receipt browser VPS tidak disalin.
- Blob Private dilayani lewat /api/media/UUID dengan otorisasi dan checksum
  seperti rancangan impor. Tidak mengubah file privat menjadi URL publik.
- Blob bukan scanner. Layanan scanning yang dapat dijangkau Vercel harus tersedia
  sebelum upload baru dinyatakan production-ready. Tidak bypass scanner; tanpa
  layanan ini, hanya impor/pembacaan berkas terverifikasi yang dapat diselesaikan,
  bukan seluruh alur upload production. Pilihan scanner harus disepakati sebelum
  rencana implementasi mengklaim semua fitur lengkap.

## README dan penerimaan

README pada branch vercel menjadi panduan Vercel generik yang kelak dapat
dijadikan README main repository WAPALA: persiapan akun/resource/secret, setup
SQL/izin, import Git main, satu deployment, lokasi record token di Browse Data,
inisialisasi admin, impor paket privat, domain/origin, redeploy, backup/restore,
troubleshooting, dan batas fitur. Tidak merujuk file .local komputer ini.

Uji pada database baru: setup sekali, race deploy, token berlaku/kedaluwarsa/
bekas pakai, tidak bocor lewat API/log, redeploy tidak reset, rollback/retry impor,
jumlah data/ref media, private media tanpa login, serta anggota/inventaris kosong.
Build dan QA flow bukan hanya status Ready. Semua perubahan tetap di branch
vercel; promosi Vercel hanya setelah syarat dan pemeriksaan terpenuhi.
