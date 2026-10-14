# Paket sumber publik WAPALA

Snapshot situs `https://www.wapalatelkomuniversity.org`, dikumpulkan 14 Oktober 2026:

- 21 angkatan, termasuk 21 gambar.
- 22 album dari dua halaman daftar, dengan 129 foto dan keterangan per foto.
- 150 berkas gambar asli, sekitar 150 MB. Manifest menyimpan SHA-256 setiap berkas.
- Kategori dan tahun album disalin dari sumber. Tanggal kegiatan tepat, lokasi, dan tahun angkatan yang tidak disediakan sumber tetap kosong; tidak ditebak.

`source-pages/` berisi snapshot HTML untuk audit; HTML ini tidak dijalankan oleh aplikasi. `assets/` berisi gambar asli; aplikasi menyimpan salinan WebP yang dioptimalkan setelah pemindaian antivirus. Tidak ada data `Src`, CSV anggota, password, token, atau konfigurasi database dalam paket.

## Import setelah deployment

Gunakan source aplikasi yang sudah memuat migration `202610140003_public_source_generations` dan `scripts/import-public-site.ts`. Pasang dependensi aplikasi (`npm ci`), generate Prisma (`npm run db:generate`), lalu jalankan migration (`npm run db:migrate`). Konfigurasi DATABASE_URL, MEDIA_ROOT dan MEDIA_SCANNER harus sama dengan aplikasi yang berjalan. Scanner wajib tersedia; import tidak melewati pemeriksaan malware.

Revision aplikasi terkait: commit `a55f86d` pada staging. Promosikan kode yang
disetujui ke branch deployment terlebih dahulu; branch Agents sendiri bukan
source aplikasi terbaru. Paket berhasil diuji dan diimport lokal, lalu diuji
ulang tanpa duplikat. Konfigurasi environment harus diekspor oleh operator
atau tersedia dalam `.env` aplikasi; wrapper tidak membaca secret service
dari `/etc` secara otomatis. Jangan menyertakan secret pada commit.

Paket publik ini tersedia pada branch **staging** di folder `import-packages/wapala-public-site/`. Data anggota dan inventaris sengaja tidak disertakan. Dari folder aplikasi:

```sh
npx tsx --conditions=react-server scripts/import-public-site.ts import-packages/wapala-public-site
# Periksa ringkasan dry-run dahulu, kemudian:
NODE_ENV=production npx tsx --conditions=react-server scripts/import-public-site.ts import-packages/wapala-public-site --apply --allow-production
```

Alternatif wrapper dari folder paket:

Salinan arsip juga tersedia pada branch **Agents**; bila checkout aplikasi tidak menyertakan paket, gunakan path absolut ke salinan paket dari branch tersebut. Kode aplikasi tetap berasal dari branch deployment, bukan checkout Agents. Paket ZIP source memakai allowlist tersendiri dan tidak otomatis menyertakan folder data ini.

```sh
node import.mjs --app /path/to/aplikasi
NODE_ENV=production node import.mjs --app /path/to/aplikasi --apply --allow-production
```

Default selalu dry-run, tanpa perubahan database/media. Ambil backup database dan folder media sebelum import production. Angkatan/album yang sudah pernah diimpor dilewati, sehingga pengeditan manual dan arsip tidak ditimpa. Nomor angkatan milik sumber lain menyebabkan konflik, bukan overwrite. Import ulang aman tanpa membuat duplikat. Penyimpanan database menggunakan satu transaksi; jika proses terhenti, berkas media identik yang tertinggal bisa dipakai kembali saat retry. Data manual yang sudah ada tetap dipertahankan.

Untuk server RAM 2 GB, jalankan import sendiri ketika beban rendah, bukan bersamaan dengan build; scanner dapat membutuhkan memori besar. Belum ada klaim uji batas memori VPS sampai dilakukan di server tersebut.

## Koleksi ulang

`node collect.mjs` mengambil ulang hanya sumber publik allowlisted. Jangan menjalankan di atas snapshot yang ingin dipertahankan tanpa salinannya. Manifest checksum diperbarui setelah koleksi selesai; importer menolak coverage/foto/checksum yang tidak cocok.
