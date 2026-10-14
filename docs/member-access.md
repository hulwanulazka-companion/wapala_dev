# Angkatan dan akun anggota

Menu Angkatan (`/admin/angkatan`) dikelola Super User, POH, dan Multimedia.
Nomor angkatan unik; edit mempertahankan identitas sumber import. Arsip tidak
menghapus foto/data, tetapi menyembunyikan angkatan dari halaman publik.

Super User membuat akun **Anggota** melalui menu Pengguna dengan memilih profil
anggota aktif. Satu profil hanya dapat ditautkan ke satu akun. Tidak ada
pendaftaran akun publik atau pencocokan profil berdasarkan email/NIM otomatis.
Password sementara mengikuti mekanisme akun yang sudah ada dan wajib diganti.

Anggota hanya mendapatkan menu Anggota. Direktori menampilkan nama, NIA,
program studi, angkatan, dan status; tidak menampilkan NIM/kontak orang lain.
Profil sendiri dapat mengajukan koreksi nama, NIM, program studi, angkatan,
jenis kelamin, dan kontak. NIA, status, foto, dan nomor administrasi tetap
dikelola admin melalui editor yang sudah ada. Permintaan bukan perubahan
langsung: Super User, Multimedia, atau POH meninjaunya di menu Koreksi data
anggota, lalu menyetujui atau menolak dengan catatan.

Hanya satu permintaan pending per profil. Persetujuan mengecek versi profil;
jika admin sudah mengubah profil sejak permintaan dibuat, persetujuan ditolak
agar tidak menimpa data terbaru. Permintaan lama perlu ditolak dan diajukan
ulang. Antrean pending diurutkan paling lama lebih dahulu dengan tombol
muat lainnya. Keputusan dicatat dalam database dan audit.

Migrasi `202610140004_generation_member_portal` menambahkan role, hubungan
akun–anggota, tabel koreksi, dan version angkatan. Backup seperti biasa sebelum
menjalankan `npm run db:migrate`. Migration bersifat tambahan; tidak membuat
akun, mereset password, atau menghapus data lama.
