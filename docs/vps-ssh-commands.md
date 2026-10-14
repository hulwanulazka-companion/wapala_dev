# Perintah SSH VPS WAPALA

Host: `185.205.222.202`, port `33333`, user `codex`.
Website: `https://wapala.my.id`. Jangan menyimpan password/private key/token
di Git atau mengirimkannya ke chat.

```sh
ssh -p 33333 codex@185.205.222.202
```

Pada komputer pengembangan yang sudah mempunyai alias/key/proxy TCP Node:
`ssh wapala-vps`. Alias berada pada konfigurasi SSH lokal; private key tidak
masuk repository. Termius bisa memakai host/port/user di atas.

## Layanan aplikasi

Empat perintah berikut memakai sudo terbatas tanpa password:

```sh
sudo /usr/local/sbin/wapala-service status
sudo /usr/local/sbin/wapala-service start
sudo /usr/local/sbin/wapala-service stop
sudo /usr/local/sbin/wapala-service restart
```

Sudo umum tetap meminta password. Apache provider tetap aktif; Nginx memakai
33335 (HTTP) dan 33336 (HTTPS), diteruskan provider dari port publik 80/443.
Node/PostgreSQL hanya localhost 3000/5432. Auto-start aplikasi belum di-enable
sesuai keputusan pengguna; jika VPS restart gunakan perintah start di atas.

## Akun pertama dan pemulihan

Jalankan dalam SSH VPS, bukan terminal proyek Windows:

```sh
sudo sh -c 'set -a; . /etc/wapala/production.env; set +a; cd /srv/wapala/current; npm run auth:bootstrap-token'
```

Hanya untuk setup pertama yang masih terbuka. Token sekali pakai berlaku
30 menit, ditampilkan di terminal pribadi; gunakan pada `/wapala` untuk
menentukan password Super User. Setelah bootstrap selesai tidak membuat akun
contoh/default atau membuka ulang setup.

Pemulihan Super User melalui terminal interaktif:

```sh
sudo sh -c 'set -a; . /etc/wapala/production.env; set +a; cd /srv/wapala/current; npm run auth:recover-superuser'
```

Masukkan password baru lewat prompt tersembunyi, bukan argumen command.
Sesi lama dicabut. Akun admin lain direset oleh Super User melalui panel.
EMAIL_MODE=disabled karena SMTP diblokir provider; tidak menjalankan timer email.

## Source, release dan paket data

- Source main: `/home/codex/wapala-repo`.
- Release berjalan: `/srv/wapala/current` menuju `/srv/wapala/releases/b67e08b`.
- Environment privat: `/etc/wapala/production.env`, root-only; tidak di Git.
- Media privat: `/var/lib/wapala/media`.
- Paket publik Album/Angkatan berasal dari staging, bukan data Anggota/Inventaris.

`git pull` pada source tidak otomatis mengganti release aktif. Perintah
`sudo gitupdate BRANCH` belum dipasang; jangan menganggapnya sudah tersedia.
Update harus build release baru, migration yang disetujui, lalu promote dan
restart. Jangan menimpa release aktif atau secret environment.

## Import publik setelah deployment

Paket diletakkan pada `/srv/wapala/import-packages/wapala-public-site`.
Gunakan dry-run dahulu dan backup database/media sebelum apply. Contoh operator:

```sh
sudo sh -c 'set -a; . /etc/wapala/production.env; set +a; cd /srv/wapala/current; node node_modules/tsx/dist/cli.mjs --conditions=react-server scripts/import-public-site.ts /srv/wapala/import-packages/wapala-public-site'
```

Apply menambahkan `--apply --allow-production`. Import aktual dijalankan sebagai
service user wapala agar ownership media benar; environment disediakan runner
root secara privat. Jangan menjalankan apply sebagai root begitu saja dan
meninggalkan media root-owned. Import mempertahankan data manual, menolak
konflik, memverifikasi checksum, dan tetap memakai pemeriksaan media aplikasi.
