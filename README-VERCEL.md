# WAPALA — deployment tambahan untuk testing Vercel

Kode aplikasi yang sama digunakan kembali; tidak ditulis ulang. Checkout lokal
`Dev_Website/Vercel` memakai branch `vercel`. Tidak ada koneksi Git yang diperlukan
untuk mengunggah atau memperbarui deployment ini.

## Target dan batas isolasi

- Akun/workspace: `hulwanulazkap`.
- Proyek: `wapala-testing` (bukan `wapala_dev`, SLA, atau VPS).
- Database cloud: schema khusus `wapala_vercel_testing` di Neon, dengan role
  runtime `wapala_vercel_app`. Data VPS tidak disalin. Tabel/schema lama tidak dihapus.
- Password, sesi, kunci keamanan, dan inisialisasi Super User testing terpisah.
- `wapala.my.id`, DNS, main, dan layanan VPS tidak berubah.
- File `.env*`, `.local`, `.git`, hasil build, serta generated Prisma tidak
  diunggah. Prisma Client dibuat ulang saat cloud build, bukan disimpan ke Git.

## Upload langsung dari folder ini

```powershell
npx --yes vercel@64.0.2 login
npx --yes vercel@64.0.2 link --yes --scope hulwanulazkap --project wapala-testing
npx --yes vercel@64.0.2 project inspect --non-interactive --scope hulwanulazkap
npx --yes vercel@64.0.2 deploy --dry --json --scope hulwanulazkap
npx --yes vercel@64.0.2 deploy --target preview --scope hulwanulazkap --project wapala-testing
```

Pastikan owner/project sesuai sebelum deploy. Proyek baru dapat menjadikan
deployment pertamanya sebagai production di proyek testing tersebut; label itu
tidak menunjuk VPS. Gunakan URL testing yang ditetapkan pada `APP_URL` untuk
login/form agar pemeriksaan Origin/CSRF tetap konsisten. Setelah deployment baru
lulus verifikasi, arahkan alias testing ke URL deployment itu jika diperlukan:

```powershell
npx --yes vercel@64.0.2 alias set <deployment-url> wapala-testing-hulwanulazkap.vercel.app --scope hulwanulazkap
```

Build Vercel: `npm run db:generate && npm run build`. Migrasi database adalah
langkah operator terpisah pada schema testing yang telah diverifikasi, bukan
reset/seed otomatis setiap deployment. Jangan arahkan `DATABASE_URL` ke VPS.

## Batas testing saat ini

- Build/deployment dan database dapat diuji; ini belum migrasi penuh seluruh
  layanan VPS ke Vercel.
- Upload media masih menggunakan private filesystem dan executable ClamAV lokal.
  Belum ada object storage atau scanner remote untuk proyek ini. Jangan menganggap
  upload/penyimpanan file sudah berfungsi di Vercel; keamanan tidak dibypass.
- Email dinonaktifkan. Akun testing tidak memakai password/email pemulihan VPS.
- Deployment protection Vercel tidak dinonaktifkan. Pemilik dapat login Vercel;
  operator dapat memeriksa preview menggunakan `vercel curl`.
- Token setup testing hanya berada di `.local/VERCEL-SETUP-TOKEN.txt`, tidak di Git,
  berlaku 30 menit dan sekali pakai. Tentukan password testing baru melalui UI.

Verifikasi build/health bukan bukti semua alur fitur (khususnya upload) telah QA.
