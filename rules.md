# Ketentuan Materi Belajar PHP

Ketentuan penyusunan materi belajar PHP di folder ini. Berlaku untuk semua bab. Kalau ada ketentuan yang berubah, file ini diperbarui lebih dulu.

## Tujuan

Materi belajar PHP dari dasar, lanjut ke Laravel, sampai pemilihan hosting dan deploy.

## Pembelajar

- Latar belakang bahasa statically typed: Rust dan TypeScript.
- Terbiasa develop memakai Docker. PHP tidak dipasang di mesin asli: di seluruh materi, PHP dan Composer dijalankan di container Docker.
- Tiap konsep dibandingkan dengan padanannya di Rust/TS, termasuk yang tidak ada padanannya di PHP.

## Versi

- Pakai versi stabil terbaru PHP dan Laravel.
- Versi dicek dari sumber resmi sebelum menulis materi, bukan dari ingatan.
- Dicek 2026-11-16 dari php.net dan laravel.com: PHP 8.5 (8.6 masih release candidate) dan Laravel 13 (mendukung PHP 8.3 sampai 8.5).
- Versi yang terpasang saat materi ditulis dan diuji: PHP 8.5.12, Composer 2.11.2, PHPStan 2.3.6, Laravel 13.42.0, Livewire 4.4.8, Larastan 3.15.0, Pint 1.32.3, Vite 8.3.8.

## Type system

PHP mengecek tipe saat runtime, bukan saat compile. Supaya mendekati pengalaman static typing, ketentuan ini berlaku sejak bab pertama:

- `declare(strict_types=1);` di setiap file PHP.
- Type declarations native dipakai penuh: union, intersection, nullable, `never`, enum, `readonly`.
- PHPStan level max. Semua kode contoh harus lulus tanpa error.
- Generics ditulis lewat anotasi PHPStan (`@template`).
- Di Laravel, analisis statis lewat Larastan.

## Kurikulum

1. **Setup dan tooling**: Docker, PHP, Composer, PHPStan, strict types.
2. **Type system**: semua fitur tipe, dibandingkan dengan Rust/TS, termasuk yang tidak ada (generics native, `Result`).
3. **Dasar bahasa**: fokus ke yang berbeda dari Rust/TS, yaitu array sebagai list sekaligus map, value vs reference, `==` vs `===`, `match`, closure.
4. **OOP**: interface, trait, readonly class, property hooks, asymmetric visibility.
5. **Error handling**: exception dan cara memodelkan error secara type-safe.
6. **Ekosistem**: namespace, autoload PSR-4, Composer, testing.
7. **PHP web tanpa framework**: request lifecycle, PDO, session, keamanan dasar (SQL injection, XSS, CSRF).
8. **Laravel dasar**: routing, controller, Blade, Vite, Eloquent, migration, validation.
9. **Laravel lanjut**: Livewire, auth, queue, event, API, testing, Larastan.
10. **Proyek**: satu aplikasi utuh dari nol.
11. **Memilih hosting**: shared, VPS, PaaS, serverless, beserta kriteria memilihnya, dan syarat shared hosting yang layak untuk Laravel (versi PHP, SSH, Composer, cron).
12. **Deploy ke shared hosting**: document root ke `public`, env, migration, build aset Vite, scheduler dan queue lewat cron, CI/CD.

## Format materi

- Bahasa Indonesia untuk prosa.
- **Kode di snippet berbahasa Inggris** (diputuskan 2026-11-16). Semua yang dibaca mesin sebagai nama ditulis dalam bahasa Inggris: function, method, class, interface, enum beserta case-nya, property, variabel, parameter, konstanta, namespace, nama file dan folder, kunci array, nama tabel dan kolom, nama route, nama field form. Yang dibaca manusia sebagai teks tetap bahasa Indonesia: komentar, isi string (pesan, label, teks UI), dan data contoh seperti nama orang. Nama diri seperti `Rupiah` dan `Qris` tidak diterjemahkan.
- Web dokumentasi bergaya dokumentasi Vue.js, dibuat dengan VitePress, disimpan di folder `docs`.
- Satu halaman per bab. Bab yang terlalu panjang (di atas sekitar 1.200 baris) dipecah menjadi folder `docs/NN-nama/` berisi `index.md` dan `02-...md`, `03-...md`, dipotong di judul `##`, dan tampil sebagai grup yang bisa dilipat di sidebar. Saat ini: Bab 6, 7, 9, dan 10. Link ke bab seperti itu ditulis dengan garis miring penutup (`/06-ekosistem/`).
- Dev server berjalan di port 5000.
- Skema warna situs memakai palet teal Tailwind CSS, diatur di `docs/.vitepress/theme/custom.css`. Favicon di `docs/public/favicon.svg` memakai warna yang sama.
- Isi tiap bab: konsep, perbandingan dengan Rust/TS, kode contoh yang bisa dijalankan, dan latihan.

## Konvensi materi

Kesepakatan teknis yang dipakai di semua bab. Bab baru atau revisi harus mengikutinya.

- **Proyek latihan pembaca**: `practice/php-basics` untuk Bab 1 sampai 6 (file tiap bab di `src/Ch0N`, namespace `Learn\Ch0N`), `practice/web-basics` untuk Bab 7, `practice/laravel-basics` untuk Bab 8 dan 9, dan `practice/wallet` untuk Bab 10, yang di-deploy di Bab 12. Nama tampilan aplikasinya tetap "Dompet" karena itu teks UI.
- **PHPStan**: level max ditambah `checkBenevolentUnionTypes: true`, dinyalakan sejak Bab 2 karena level max saja meloloskan hasil pembagian `int`.
- **Formatter**: Pint. Proyek PHP biasa memakai preset `per` dengan dua penyesuaian yang tertulis di Bab 6. Proyek Laravel memakai preset bawaan `laravel`.
- **Testing**: PHPUnit, bukan Pest.
- **Alur kerja baku**: `composer format`, `composer check`, `composer test`.
- **Output di materi adalah output asli** dari eksekusi di container. Bagian yang tidak bisa dijalankan ditandai jelas di babnya.
- **Penanda tersembunyi di Bab 2 sampai 7**: komentar `<!-- file: ... -->` dan `<!-- demo: ... -->` sebelum blok kode dipakai script di folder `tools` untuk mengekstrak dan menguji ulang contoh. Jangan dihapus saat merevisi.

## Cara kerja

- Claude meminta konfirmasi sebelum menulis atau mengubah file.
- Pengecualian: `rules.md` boleh diubah langsung tanpa konfirmasi.

## Sudah diputuskan

- **Frontend di Laravel**: Livewire, dengan Vite untuk aset. Tidak memakai Inertia.
- **Target deploy**: shared hosting, karena lebih murah.
- **Tempo penulisan**: semua bab ditulis sampai bab terakhir tanpa menunggu koreksi per bab (diubah 2026-11-16; sebelumnya bab demi bab). Koreksi dilakukan setelah semuanya selesai.
