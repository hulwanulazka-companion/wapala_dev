# Operasional VPS WAPALA — main hanya kode

Kode deployment berasal dari branch `main`. Paket album dan angkatan hanya
di `staging`, pada `import-packages/wapala-public-site/`. Data anggota dan
inventaris belum disertakan. Jangan merge seluruh staging/Agents ke main
untuk mengambil paket; ambil foldernya terpisah seperti perintah di bawah.

## Jika website/service berhenti

### Akses operasional codex

SSH key sudah diuji. Pada mesin Windows pengelola, alias `ssh wapala-vps`
menggunakan key lokal dan relay TCP Node, dengan verifikasi host key tetap
aktif. Tidak ada password/private key di repo. Perubahan password akun Linux
tidak menghapus authorized_keys; jangan menonaktifkan akses key saat mengganti
password jika key masih ingin dipakai.

Wrapper root-owned `/usr/local/sbin/wapala-service` dan aturan
`/etc/sudoers.d/wapala-codex` memberi codex akses tanpa password hanya untuk:

```sh
sudo /usr/local/sbin/wapala-service status
sudo /usr/local/sbin/wapala-service start
sudo /usr/local/sbin/wapala-service stop
sudo /usr/local/sbin/wapala-service restart
```

Argumen lain, unit lain, shell, dan environment override tidak diizinkan.
Sudo umum tetap meminta password; tidak ada NOPASSWD: ALL. Aturan luas lama
dicadangkan privat di root sebelum diganti, dan visudo memvalidasi aturan
pengganti. Template audit tersedia di deploy/wapala-service.sh dan
deploy/wapala-codex-sudo.conf. File executable/kebijakan pada VPS harus tetap
root-owned, bukan writable oleh codex. `gitupdate` belum diberikan akses
tanpa password: runner deployment perlu diselesaikan dan ditinjau terpisah,
bukan mengeksekusi git/npm/source aplikasi sebagai root.

Wrapper tidak memasang service. Selama wapala.service belum dibuat,
status akan mengembalikan unit-not-found walaupun autentikasi sudo berhasil.
Auto-start belum diaktifkan, sesuai instruksi pengguna.

Perintah ini untuk VPS yang **sudah selesai dipasang** mengikuti
`docs/deployment-ubuntu.md`: user wapala, release `/srv/wapala/current`,
environment `/etc/wapala/production.env`, database, scanner dan unit systemd
sudah ada. Jika `LoadState=not-found`, jangan menganggap restart sebagai
deployment pertama; instalasi host/release harus diselesaikan dahulu.

```sh
sudo systemctl show wapala.service -p LoadState -p ActiveState -p Result
sudo systemctl status wapala.service --no-pager
sudo journalctl -u wapala.service -n 100 --no-pager
```

Periksa error dulu: database/scanner mati, environment hilang, build tidak
ada, permission, atau OOM. Jangan mencetak environment/password atau membagikan
log berisi data pribadi. Jangan menghapus database/media untuk memulihkan service.

Jika dependency terpasang tetapi berhenti:

```sh
sudo systemctl start postgresql.service clamav-daemon.service
sudo systemctl reset-failed wapala.service
sudo systemctl restart wapala.service
sudo nginx -t
sudo systemctl start nginx.service
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
sudo systemctl is-active wapala.service nginx.service
```

PostgreSQL pada Ubuntu bisa memakai meta-unit; cek juga cluster sebenarnya
dengan `pg_lsclusters`. Jika OOM, periksa `free -h` dan `sudo journalctl -k`
sebelum retry. Jangan mematikan antivirus untuk mengatasi kekurangan RAM.

## Auto-start setelah reboot

Setelah instalasi, environment dan build benar, serta readiness lulus:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql.service clamav-daemon.service clamav-freshclam.service nginx.service
sudo systemctl enable --now wapala.service
sudo systemctl enable --now wapala-email.timer
sudo systemctl is-enabled wapala.service nginx.service postgresql.service clamav-daemon.service wapala-email.timer
sudo systemctl is-active wapala.service
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

`deploy/wapala.service` sudah memiliki `WantedBy=multi-user.target` dan
`Restart=on-failure`: boot otomatis memerlukan `enable`, sedangkan crash
process otomatis direstart. `systemctl stop` yang disengaja tidak dilawan
oleh restart policy. Tidak perlu menjalankan `npm run dev` pada VPS.
Timer peminjaman lewat jatuh tempo tetap mengikuti approval/gate terpisah
di panduan deployment, bukan otomatis diaktifkan oleh panduan ini.

Jangan reboot VPS yang sedang digunakan hanya untuk mencoba auto-start;
lakukan pada maintenance window setelah persetujuan. Sesudah reboot yang
direncanakan, ulangi `is-active`, `is-enabled`, dan health check di atas.

## Update kode main

`sudo gitupdate main` **belum merupakan perintah yang diinstal**. Jangan
menganggap `git pull` saja cukup atau menjalankan build sebagai root.
Deployment runner harus: fetch origin/main, buat release baru, pasang locked
dependencies, generate Prisma, test/build, backup, jalankan migration yang
disetujui, salin static/public ke standalone, promote release, restart service,
dan cek kesehatan. Pertahankan database, media, environment dan SECURITY_KEY
di luar folder release; update kode tidak boleh mereset data/import otomatis.
Detail build, promotion dan rollback ada di `docs/deployment-ubuntu.md`.

## Import album/angkatan dari staging (sekali, bukan setiap restart)

Dari checkout Git kode `main` yang memiliki origin terpercaya:

```sh
git fetch origin staging
paket_dir=$(mktemp -d /tmp/wapala-public-import.XXXXXX)
git archive origin/staging import-packages/wapala-public-site | tar -x -C "$paket_dir"
chmod -R a+rX "$paket_dir"
```

Folder sementara berisi data publik saja. Perintah tidak mengganti branch
checkout dan tidak memasukkan data ke main. Periksa snapshot/README dan backup
database/media sebelum apply. Jalankan sebagai service user dengan environment
production dari systemd (tidak menampilkan secret), bukan memakai env developer:

```sh
sudo systemd-run --wait --pipe --collect \
  --uid=wapala --gid=wapala \
  --property=SupplementaryGroups=clamav \
  --property=WorkingDirectory=/srv/wapala/current \
  --property=EnvironmentFile=/etc/wapala/production.env \
  /usr/bin/node --import tsx --conditions=react-server \
  /srv/wapala/current/scripts/import-public-site.ts \
  "$paket_dir/import-packages/wapala-public-site"
```

Setelah dry-run ditinjau dan backup siap, ulangi perintah tersebut dengan
`--apply --allow-production` di akhir. Import membutuhkan source script/tsx,
bukan hanya standalone hasil build. Antivirus wajib berjalan; import idempotent
dan tidak menimpa edit/arsip yang sudah ada. Folder import tidak perlu tersedia
untuk runtime setelah selesai. Tidak ada import anggota/inventaris dalam paket.

## NAT HostData: port 33335

Informasi pengguna: source port 33335 diteruskan ke destination port 33335.
Rentang source port yang diperbolehkan provider adalah 30000–60000; public
80/443 tidak termasuk. SSH 33333 dan web 33335 berada dalam rentang tersebut.
Nginx harus listen pada 33335; Node tetap 127.0.0.1:3000 dan PostgreSQL tetap
localhost:5432. Jangan membuka kedua port backend/database ke publik.

Aturan SSH yang dilaporkan sudah dibuat adalah TCP, source port 33333 ke
destination 10.88.0.51 port 22. Untuk web, tambahkan aturan TCP terpisah:
source port 33335 ke destination 10.88.0.51 port 33335. Jangan mengubah
aturan SSH yang sudah berhasil. Protocol TCP sesuai ketika Nginx pada VPS
yang menangani HTTP/TLS sendiri; pilihan HTTP/HTTPS pada panel provider
perlu diperiksa apakah merupakan layanan reverse proxy/terminasi TLS.
Ini port forwarding, bukan pengadaan domain atau pengaturan DNS.

Alamat SSH dikonfirmasi pengguna melalui Termius: 185.205.222.202 port
33333, user codex. Penyebutan 185.202.222.202 sebelumnya adalah perbedaan
alamat yang tidak dipakai sebagai acuan. OpenSSH langsung dari mesin development
timeout, tetapi koneksi SSH berhasil melalui relay TCP Node lokal dengan host-key
verification tetap aktif. Pemeriksaan read-only menunjukkan Ubuntu 22.04.5,
RAM sekitar 1 GB (bukan 2 GB seperti rencana), tanpa swap; Node/PostgreSQL/Nginx
tersedia, PostgreSQL active, Nginx failed, ClamAV daemon inactive, dan
wapala.service belum terpasang. Akun codex memerlukan password untuk sudo.
Belum ada perubahan firewall, environment, database atau service pada VPS.
Auto-start ditunda sesuai
instruksi terakhir pengguna; bagian enable di atas adalah panduan nanti.

Akses `http://IP_PUBLIK:33335` mungkin untuk pemeriksaan sementara,
tetapi bukan endpoint login/form produksi: konfigurasi production mensyaratkan
HTTPS dan cookie Secure. Jangan mematikan Secure atau memakai mode development
untuk menjadikannya produksi. Sertifikat tepercaya harus siap sebelum TLS
diaktifkan. Pastikan forwarding provider benar-benar aktif, bukan hanya diizinkan.

HTTPS tidak mutlak memerlukan domain: Let's Encrypt sudah mendukung sertifikat
IP berumur pendek, tetapi validasi ACME IP memerlukan akses pada public port
80 (HTTP-01) atau 443 (TLS-ALPN-01), bukan 33335. Pada NAT/shared IP yang hanya
memberikan port tinggi, kita belum membuktikan kontrol IP dan jalur validasi
tersebut. Minta provider layanan domain/terminasi HTTPS atau gunakan domain yang dikontrol
dengan validasi DNS-01. Sertifikat self-signed bukan HTTPS tepercaya bagi publik.

Sumber resmi: [sertifikat IP](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability),
[challenge types](https://letsencrypt.org/docs/challenge-types/),
[ACME IP validation](https://www.rfc-editor.org/rfc/rfc8738.html).

Ketika menggunakan HTTPS di port nonstandar, APP_URL harus mencantumkan port
tersebut (misalnya `https://DOMAIN:33335`). Nginx harus meneruskan Host lengkap
termasuk port (`proxy_set_header Host $http_host;` dan
`proxy_set_header X-Forwarded-Host $http_host;`) serta X-Forwarded-Proto/For
yang ditetapkan ulang oleh proxy terpercaya. Jangan aktifkan file TLS yang
masih menunjuk ke sertifikat belum ada.
