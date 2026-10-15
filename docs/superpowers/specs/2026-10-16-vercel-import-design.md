# Impor WAPALA ke deployment testing Vercel

## Tujuan

Gunakan kode yang sudah ada pada `Dev_Website/Vercel`, branch `vercel`, dan
lengkapi data deployment `hulwanulazkap/wapala-testing`. Tidak menulis ulang UI,
tidak memindahkan domain, tidak mengubah database atau service VPS, dan tidak
memasukkan master anggota maupun inventaris.

## Sumber dan cakupan

1. Paket staging `import-packages/wapala-public-site`: 21 angkatan, 22 album,
   129 foto album, 150 gambar total. Verifikasi manifest/SHA-256, gunakan paket
   yang ada tanpa mengambil ulang situs lama. Pertahankan ID/sourceKey agar
   impor ulang tidak menggandakan atau menimpa suntingan yang sudah ada.
2. Data tambahan terbaru hanya dari VPS: pengaturan/branding, berita dan
   pengumuman, buku, kampanye/rekening/QRIS/poster, event dan revisi form,
   periode/pendaftar OR beserta revisinya, donasi, serta riwayat peminjaman yang
   sudah terlepas dari inventaris. Impor ulang tidak menimpa suntingan Vercel
   tanpa konflik yang dilaporkan untuk ditinjau.
3. Foto/dokumen yang dirujuk data tersebut ikut disalin. Media khusus anggota
   dan inventaris serta berkas tak dirujuk dikecualikan. Jangan mengunggah semua
   isi direktori media secara membabi buta.
4. Tidak menyalin User/password, Session, PasswordResetToken, BootstrapState,
   throttle, email outbox, receipt/capability browser, atau kredensial VPS.
   Audit operasional impor dibuat baru; audit keamanan VPS tidak diimpor.
   Akun dan kunci keamanan testing tetap terpisah.
5. Relasi yang membutuhkan akun sumber dipetakan sebagai metadata historis,
   bukan akun login baru. Lookup berbasis HMAC telepon dihitung ulang dengan
   kunci testing untuk data yang diimpor; token/akses anonim lama tidak berlaku.
   Pinjaman dengan relasi inventaris aktif harus dilaporkan dan dilewati, bukan
   diam-diam membuat master inventaris. Snapshot pinjaman selesai tetap dipakai.

## Penyimpanan dan perubahan kode

- Store yang sudah dibuat: `blob-storage`, `store_Gld3uOKXd1CIp4bc`, Private,
  region sin1, terhubung hanya ke proyek testing. Tidak membuat store baru.
- Tambahkan backend pembacaan Blob melalui reader media yang sudah ada. URL
  aplikasi tetap `/api/media/<UUID>`, checksum tetap diperiksa, dan otorisasi
  private/public pada database tetap dijalankan sebelum mengirim berkas.
  Jangan mengubah berkas privat menjadi URL publik permanen.
- Simpan objek pada prefix khusus WAPALA testing berdasarkan UUID/extension
  tervalidasi. Manifest impor memetakan sumber, ID, checksum, dan pathname.
- OIDC terhubung digunakan tanpa mencetak token. Preview/Production sudah
  tersedia; akses operator lokal memerlukan izin Blob Development yang saat
  ini masih ditolak. Jangan membuat token long-lived untuk mengakali batas itu.
- Perubahan hanya pada branch vercel. Filesystem/scanner VPS tidak diubah.
  Impor menggunakan berkas yang diverifikasi dan hasil scan yang masih dapat
  dibuktikan, atau scan ulang menggunakan scanner yang sudah ada di VPS tanpa
  mengubah layanan. Pemeriksaan checksum bukan pengganti antivirus.
- Cakupan ini memindahkan berkas yang sudah ada untuk dibaca Vercel. Upload
  baru dari formulir tetap pekerjaan berikutnya sampai scanner cloud/remote
  disepakati; jangan bypass scanning atau mengklaim upload sudah berfungsi.

## Pelaksanaan dan verifikasi

1. Pastikan scope/project/store/schema tujuan, akses Blob operator, dan status
   inisialisasi admin testing. Ambil backup database tujuan serta manifest.
2. Ekspor sumber read-only dalam snapshot konsisten. Tampilkan hitungan dan
   konflik saja, bukan nama/kontak, jawaban formulir, atau kredensial.
3. Dry-run memastikan tidak ada anggota/inventaris/akun/token serta semua
   referensi media dan relasi yang diikutkan tersedia.
4. Unggah objek baru tanpa overwrite; jika checksum cocok, gunakan ulang.
   Terapkan data yang telah lolos pemeriksaan dalam transaksi. Kegagalan tidak
   boleh menampilkan data setengah jadi. Objek yatim tercatat pada manifest
   untuk pemulihan; jangan menghapus otomatis objek lama atau data sumber.
5. Uji reader Blob berhasil/404/gagal/checksum salah; akses anonim terhadap
   media privat ditolak; data publik boleh tampil melalui route yang sama.
6. Build Vercel, cocokkan jumlah data dan berkas, periksa album/angkatan/
   branding serta download dokumen, pastikan master anggota/inventaris tetap
   kosong. Jalankan dry-run kedua untuk membuktikan tidak ada duplikasi.
7. Rilis preview dan alias testing hanya setelah pemeriksaan lulus. Catat
   batas pengujian serta perubahan di perubahan_agent.md; main/VPS tetap utuh.

## Batas dan persetujuan

Dokumen ini adalah rancangan untuk ditinjau sebelum penulisan rencana teknis
dan implementasi reader/importer. Belum ada data sumber yang diimpor ke Neon
atau berkas yang diunggah ke Blob pada tahap pemeriksaan koneksi ini.
