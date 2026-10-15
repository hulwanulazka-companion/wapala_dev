# Website WAPALA

Website resmi WAPALA — unit kegiatan mahasiswa Wahana Pencinta Alam Telkom University dengan empat divisi: Gunung & Hutan, Rock Climbing, Caving, dan Rafting.

**`main` adalah source deployment production.** Server production menjalankan hasil `npm run build`, bukan `npm run dev`. Clone repository tidak otomatis menyiapkan database, akun, data, sertifikat atau layanan server. Situs yang sudah dideploy: [wapala.my.id](https://wapala.my.id).

## Branch dan isi repository

| Branch    | Kegunaan                                                       |
| --------- | -------------------------------------------------------------- |
| `main`    | Source aplikasi dan panduan deployment production              |
| `staging` | Integrasi/pengujian dan paket import publik Album/Angkatan     |
| `Agents`  | Instruksi AI, catatan perubahan dan panduan pendukung operator |

Jangan merge keseluruhan `staging`/`Agents` ke `main`; promosikan hanya perubahan kode yang disetujui. Database, media pengguna dan secret tidak disimpan di `main`. Clone baru tidak otomatis mempunyai album/angkatan atau akun dari server aktif.

Script `dev`, `devDependencies` dan tes boleh tetap ada: TypeScript, Prisma CLI dan `tsx` diperlukan untuk build/operasi tertentu. Jangan menjalankan `npm prune --omit=dev` tanpa menyediakan pengganti CLI operasional. Versi paket `0.1.0` bukan penentu mode runtime.

## Fitur dan teknologi

- Situs publik: profil/angkatan, divisi, berita/pengumuman, galeri, pembaca PDF/EPUB dan kontak.
- Peminjaman alat: katalog database, pengajuan, pelacakan, invoice, persetujuan dan verifikasi pengembalian.
- Open Recruitment: periode tahunan, pendaftaran, foto, revisi dan ekspor.
- Donasi: beberapa kampanye, rekening penerima, poster, QRIS dan verifikasi bukti transfer.
- Event: pembuat formulir dinamis, pendaftaran, unggahan dan ekspor Excel.
- Reset Anggota/Inventaris khusus Super User: arsipkan data aktif atau hapus permanen termasuk arsip. Tersedia pada toolbar modul masing-masing; wajib pemeriksaan jumlah, teks konfirmasi, dan password Super User. Arsip bisa dipulihkan melalui menu Arsip; identitas/kode arsip tetap terpakai. Hapus anggota terkait akun/koreksi tetap ditolak. Inventaris dari peminjaman yang sudah dikembalikan/ditolak boleh dihapus: detail item disalin secara atomik ke riwayat pinjaman agar tabel, pelacakan, dan invoice tetap lengkap. Peminjaman yang belum selesai/ditolak memblokir arsip maupun hapus seluruh batch. Akun, foto tersimpan, Album/Angkatan dan riwayat peminjaman tidak ikut dihapus. Buat backup sebelum reset; setelah memakai snapshot riwayat, jangan menurunkan versi ke kode lama yang belum membaca snapshot.
- Admin: anggota, angkatan, inventaris, konten, pengguna/peran, pengaturan, arsip, audit dan reset kepengurusan sesuai izin.

Stack: Next.js 16.4, React 19, TypeScript, PostgreSQL + Prisma 7, Zod, Argon2, cookie sesi HttpOnly, CSRF, throttling, media privat dan ClamAV. Login melalui `/wapala`; tidak ada password bawaan.

## Deployment production

### Prasyarat server

Target native yang sudah digunakan: **Ubuntu 22.04 x64, Node.js 24, PostgreSQL 14+, Nginx/TLS dan systemd**, tanpa Docker di VPS. Artifact GitHub Actions dibuat untuk Linux x64, bukan semua arsitektur.

Siapkan sebelum aktivasi:

1. SSH/sudo untuk provisioning dan service user non-login `wapala`.
2. Database kosong, role migration terpisah dari runtime non-superuser. Runtime tidak boleh DDL/truncate; audit hanya select/insert.
3. Domain/DNS, forwarding bila NAT, dan sertifikat HTTPS valid.
4. ClamAV dengan signature resmi lengkap, socket lokal grup `clamav`, serta [wrapper scanner](deploy/clamdscan-wapala.sh) di `/usr/local/libexec/clamdscan-wapala`.
5. `/srv/wapala/releases`, `/etc/wapala`, dan media privat `/var/lib/wapala/media` (owner `wapala`, mode `0700`).

Build langsung berhasil di VPS 2 GB setelah instalasi dibuat serial dan heap dibatasi. **Ini bukan jaminan kapasitas semua VPS/beban.** Instalasi/build sebelumnya gagal pada 1 GB. Aplikasi, PostgreSQL dan scanner berbagi RAM; ukur kapasitas server tujuan. Jangan menambah swap bila dilarang provider atau menonaktifkan keamanan unggahan agar muat.

### 1. Clone, verifikasi dan build

Gunakan direktori checkout/release **baru**, bukan menimpa release aktif:

```sh
git clone --branch main --single-branch https://github.com/hulwanulazka-companion/wapala_dev.git wapala-release
cd wapala-release
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run test:backend
npm run build
```

Tes integrasi: `npm run test:backend:integration` dengan database terisolasi berakhiran `_test` pada `TEST_DATABASE_URL`. Jangan memuat environment produksi untuk menjalankan tes integrasi.

Jika instalasi pada VPS kecil mengalami lonjakan memori, berikut alternatif instalasi/build yang digunakan saat deployment. Tetap lakukan pemeriksaan kode/tes di atas dan jangan menjalankan kedua build bersamaan:

```sh
export UV_THREADPOOLSIZE=1
export MALLOC_ARENA_MAX=2
export npm_config_maxsockets=1
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS=--max-old-space-size=512
task_cache=$(mktemp -d /var/tmp/wapala-npm-cache.XXXXXX)
npm ci --cache "$task_cache" --no-audit --no-fund
npm run db:generate
NODE_OPTIONS=--max-old-space-size=768 npm run build
```

Cache baru membatasi lonjakan ekstraksi cache lama; RAM/jaringan tetap harus mencukupi. `Killed`/exit nonzero berarti gagal. Build sukses harus menghasilkan `.next/BUILD_ID` dan `.next/standalone/server.js`.

Alternatif: jalankan workflow manual **Linux runtime release** pada `main`. Lihat [panduan artifact Linux](docs/linux-runtime-build.md). Artifact tidak otomatis dideploy. Docker/GitHub Actions tidak diperlukan untuk build langsung di VPS.

### 2. Environment privat dan email

Isi [.env.production.example](.env.production.example) pada `/etc/wapala/production.env` melalui terminal privat. File root-owned, mode `0600`; jangan commit secret, memasukkannya ke artifact, atau membagikannya ke chat/log.

| Variabel           | Ketentuan                                                             |
| ------------------ | --------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                                                          |
| `WAPALA_MODE`      | `backend`, bukan `preview`                                            |
| `APP_URL`          | Origin HTTPS canonical, contoh `https://wapala.my.id`                 |
| `DATABASE_URL`     | PostgreSQL localhost dengan role runtime terbatas                     |
| `SECURITY_KEY`     | 32 byte acak dalam base64; backup privat, jangan rotasi sembarangan   |
| `TRUST_PROXY`      | `true` hanya dengan app loopback di belakang proxy tepercaya          |
| `EMAIL_MODE`       | `disabled` untuk VPS WAPALA saat ini; `smtp` bila SMTP nyata tersedia |
| `MEDIA_ROOT`       | `/var/lib/wapala/media`                                               |
| `MEDIA_SCANNER`    | `/usr/local/libexec/clamdscan-wapala`                                 |
| `HOSTNAME`, `PORT` | `127.0.0.1`, `3000`                                                   |

Provider WAPALA memblokir SMTP. Dengan **`EMAIL_MODE=disabled`**, notifikasi tidak diantrekan dan pemulihan email web tidak tersedia. **Jangan menjalankan timer email.** Super User dipulihkan melalui SSH; akun lain direset Super User lewat panel. `sink` hanya untuk development dan ditolak di production.

Untuk mode `smtp`, isi seluruh `SMTP_*`, siapkan worker/timer dan verifikasi delivery nyata. Jangan memasang konfigurasi palsu agar pemeriksaan terlihat lulus.

### 3. Migration, assets dan layanan

Ambil backup database/media sebelum migration pada instalasi berisi data. Jalankan `npm run db:migrate` dengan environment migration yang dimuat privat oleh runner operator, bukan dengan role runtime. **Jangan menjalankan seed/demo/import otomatis pada database production.**

Setelah build, siapkan static/public untuk standalone:

```sh
mkdir -p .next/standalone/.next
cp -a .next/static .next/standalone/.next/
cp -a public .next/standalone/
```

Tempatkan release pada `/srv/wapala/releases/ID_RELEASE`, lalu arahkan `/srv/wapala/current` secara atomik ke release siap pakai. Pertahankan release sebelumnya. Berikan service user hak baca/traverse kode/generated/assets dan hak eksekusi binary native yang diperlukan; hanya media/cache yang perlu writable. Secret environment tetap privat.

Pasang [unit aplikasi](deploy/wapala.service) ke `/etc/systemd/system/wapala.service`; sesuaikan path Node bila perlu:

```sh
sudo systemctl daemon-reload
sudo systemctl start wapala.service
sudo systemctl status wapala.service --no-pager
```

Entrypoint: `node .next/standalone/server.js`, **bukan `npm run dev`**. Unit memerlukan daemon scanner. Node/PostgreSQL hanya localhost; jangan forward port 3000/5432 ke publik.

`start` tidak mengaktifkan auto-start. Auto-start aplikasi VPS WAPALA masih ditunda sesuai keputusan operator; `systemctl enable` hanya jika disetujui. Timer overdue/cleanup perlu aktivasi terpisah; timer email hanya untuk SMTP.

### 4. Nginx, DNS dan VPS NAT

VPS publik biasa: sesuaikan domain/certificate pada [template Nginx](deploy/nginx-wapala.conf). **VPS NAT WAPALA memakai listener berbeda:**

| Jalur publik             | Tujuan internal          |
| ------------------------ | ------------------------ |
| SSH TCP `33333`          | `10.88.0.51:22`          |
| HTTP `wapala.my.id:80`   | Nginx `10.88.0.51:33335` |
| HTTPS `wapala.my.id:443` | Nginx `10.88.0.51:33336` |

DNS A domain mengarah ke IP publik NAT provider. HTTP/HTTPS forwarding memakai domain pada Source Domain. IP internal/port di atas khusus server ini; sesuaikan di provider lain.

Nginx listen `33335` dan `33336 ssl`, proxy ke `http://127.0.0.1:3000`, mempertahankan Host asli dan menimpa forwarded headers dari proxy tepercaya. **Jangan menyalin listener 80/443 template mentah-mentah atau menghentikan Apache provider pada port 80.**

Sediakan lokasi HTTP `/.well-known/acme-challenge/`; webroot server ini `/var/www/wapala-acme`. Terbitkan sertifikat di VPS menggunakan Certbot webroot sebelum mengaktifkan TLS block. Kemudian arahkan HTTP biasa ke HTTPS, pasang renewal/reload hook, jalankan `nginx -t`, lalu reload. Domain forwarding tidak otomatis membuat DNS atau sertifikat.

### 5. Bootstrap dan pemulihan

Dengan environment produksi dimuat privat, jalankan `npm run auth:bootstrap-token` dari release aktif. Token sekali pakai berlaku 30 menit; buat Super User di `https://DOMAIN/wapala`. Setup yang sudah selesai tidak perlu diulang.

Pada VPS WAPALA yang telah diprovision, jalankan melalui SSH:

```sh
sudo sh -c 'set -a; . /etc/wapala/production.env; set +a; cd /srv/wapala/current; npm run auth:bootstrap-token'
```

Perintah tersebut hanya untuk environment **root-owned, tepercaya dan berformat assignment shell-compatible** yang dibuat operator. Jangan source file tak tepercaya. Untuk pemulihan, ganti subcommand dengan `npm run auth:recover-superuser`; password dimasukkan melalui prompt tersembunyi, bukan argumen. Sesi lama dicabut.

Pada server yang sudah dipasang wrapper/sudo terbatas, tersedia:

```sh
sudo /usr/local/sbin/wapala-service status
sudo /usr/local/sbin/wapala-service start
sudo /usr/local/sbin/wapala-service stop
sudo /usr/local/sbin/wapala-service restart
```

Clone baru tidak memasang wrapper/sudo policy otomatis. **`sudo gitupdate main` belum diinstal.** `git pull` pada source tidak mengganti release aktif: update memerlukan build, backup/migration bila perlu, promote dan restart.

## Pemeriksaan dan batas panduan lama

Periksa HTTPS, halaman publik/login, `/api/health`, izin/CSRF, alur bisnis, upload/media, backup/restore dan kapasitas server sebelum menyatakan production acceptance lengkap. Build sukses bukan jaminan semua flow bebas bug.

`deploy/release-readiness.sh` saat ini masih mewajibkan timer email dan memeriksa profil SMTP. **Belum sesuai untuk mode disabled/NAT tanpa penyesuaian**; jangan mengaktifkan email palsu agar script hijau. Gunakan pemeriksaan per komponen yang sesuai.

Rincian: [deployment Ubuntu](docs/deployment-ubuntu.md), [operasional VPS](docs/vps-operations.md), [paket Linux/mode email](docs/linux-runtime-build.md), dan [alur branch](docs/branch-workflow.md). Bagian SMTP wajib/port publik biasa pada panduan lama bukan instruksi mengganti konfigurasi NAT/tanpa-email di README ini.

## Data dan import

Repository bukan backup website. Snapshot Album/Angkatan berada di `staging`, folder `import-packages/wapala-public-site`, beserta manifest/checksum dan instruksi import. Lakukan dry-run, backup, lalu apply yang disetujui. Jangan memasukkan data ke `main` atau mengimpor ulang setiap restart/build. Data Anggota/Inventaris tidak ikut paket tersebut.

## Pengembangan lokal — bukan production

Gunakan database development terpisah dan ikuti [setup backend lokal](docs/backend-local-setup.md):

```sh
npm ci
cp .env.example .env
# Isi environment lokal privat, termasuk DATABASE_URL, TEST_DATABASE_URL dan SECURITY_KEY.
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Email lokal boleh `sink`. Jangan memakai database produksi untuk development/tes. Script `db:local` khusus provisioning PostgreSQL development Windows, bukan installer database VPS.
