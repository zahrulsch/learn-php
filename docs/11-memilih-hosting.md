# 11. Memilih hosting

Aplikasi Dompet dari [Bab 10](/10-proyek/) sudah jalan di laptopmu. Bab ini memilih tempat untuk menjalankannya di internet. Keputusan materi ini adalah shared hosting, karena paling murah. Supaya keputusan itu tidak buta, bab ini menjelaskan apa yang kamu dapat, apa yang kamu korbankan, dan cara memastikan sebuah paket hosting memang sanggup menjalankan Laravel 13 sebelum kamu membayarnya.

## Kenapa PHP bisa di-hosting dengan murah

Di Rust atau Node, aplikasi web adalah **proses**. Kamu menyalakannya, ia membuka port, lalu hidup terus sambil menunggu request. Satu aplikasi berarti satu proses yang memakan memori sepanjang waktu, dan harus ada yang menyalakannya lagi kalau mati.

PHP bekerja sebaliknya, seperti yang kamu lihat di [Bab 7](/07-web-tanpa-framework/): tidak ada proses milik aplikasimu. Web server milik penyedia hosting yang hidup terus. Saat request datang, ia menjalankan file PHP-mu dari awal sampai selesai, lalu membuang semua state. Di antara dua request, aplikasimu hanyalah file di disk.

| | Rust (axum) | Node (Express) | PHP |
|---|---|---|---|
| Yang di-deploy | Satu binary | Source dan `node_modules` | Source dan `vendor` |
| Yang menyalakan proses | Kamu (systemd, Docker) | Kamu (pm2, Docker) | Web server milik host |
| State di memori antar-request | Ada | Ada | Tidak ada |
| Saat tidak ada request | Proses tetap makan memori | Proses tetap makan memori | Tidak memakai apa-apa |
| Setelah deploy | Restart proses | Restart proses | Tidak ada yang di-restart |

Model itulah yang memungkinkan shared hosting: satu server, satu web server, ratusan akun pelanggan yang masing-masing hanya berupa folder berisi file PHP. Biayanya dibagi ratusan, jadi murah. Itu juga sebabnya aplikasi axum atau Express-mu tidak bisa ditaruh di shared hosting biasa: ia butuh proses dan port sendiri, dan itu tidak diberikan.

## Empat jenis hosting

| | Shared hosting | VPS | PaaS | Serverless |
|---|---|---|---|---|
| Yang kamu dapat | Satu akun di server yang dipakai banyak pelanggan | Satu mesin virtual dengan akses root | Platform yang menjalankan aplikasimu dari Git | Kode yang dijalankan per request, tanpa server tetap |
| Yang mengurus server | Penyedia | Kamu | Penyedia | Penyedia |
| Proses yang jalan terus | Tidak bisa | Bisa | Bisa | Lewat layanan pendamping |
| Node di server | Biasanya tidak ada | Bisa dipasang | Tersedia saat build | Tersedia saat build |
| Biaya | Paling murah, tetap per bulan | Tetap, di atas shared | Mengikuti paket atau pemakaian | Mengikuti pemakaian |
| Pekerjaanmu | Mengunggah file, mengatur panel | Memasang dan merawat semuanya | Hampir tidak ada | Hampir tidak ada |

- **Shared hosting.** Kamu mendapat satu akun pengguna Linux tanpa hak root, sebuah panel (cPanel, DirectAdmin, Plesk, atau panel buatan penyedia), database MySQL atau MariaDB, dan email. Web server dan PHP sudah disiapkan dan dipakai bersama pelanggan lain.
- **VPS.** Server kosong milikmu sendiri. Kamu memasang Nginx, PHP-FPM, database, dan process manager, lalu merawatnya: update keamanan, firewall, backup. Kalau tidak mau mengurusnya dengan tangan, [Laravel Forge](https://forge.laravel.com) adalah platform resmi untuk mengelola VPS bagi aplikasi Laravel.
- **PaaS.** Kamu menyerahkan repo, platform yang membangun dan menjalankannya. Untuk Laravel ada [Laravel Cloud](https://cloud.laravel.com), yang oleh dokumentasi resminya disebut platform deploy terkelola dengan compute, database, cache, dan object storage.
- **Serverless.** Aplikasi dijalankan sebagai fungsi yang hidup hanya selama ada request. Untuk Laravel ada [Laravel Vapor](https://vapor.laravel.com), platform serverless di atas AWS.

Cara memilihnya:

- **Aplikasi kecil, pengguna sedikit, tanpa fitur realtime**: shared hosting cukup. Dompet masuk di sini.
- **Butuh proses yang jalan terus atau kontrol penuh**: VPS.
- **Tidak mau mengurus server dan anggarannya ada**: PaaS.
- **Trafik sangat naik-turun**: serverless.

## Yang kamu korbankan di shared hosting

Murahnya shared hosting dibayar dengan batasan. Semuanya berasal dari satu sebab: server itu bukan milikmu sendiri.

- **Tidak ada proses yang jalan terus.** Kamu tidak bisa menyalakan `queue:work` sebagai worker permanen, tidak bisa menjalankan server WebSocket (Laravel Reverb), dan tidak bisa memakai Laravel Octane. Proses yang hidup terlalu lama dimatikan oleh host.
- **Tidak ada hak root.** Kamu tidak bisa memasang paket sistem atau extension PHP sendiri. Yang tersedia hanyalah yang disediakan penyedia lewat panel.
- **Sumber daya dibatasi per akun.** CPU, memori, jumlah proses bersamaan, kecepatan disk, dan jumlah file (inode) punya batas. Kalau terlampaui, pengunjung mendapat halaman error sampai pemakaian turun lagi.
- **Tetangga ikut menentukan.** Kalau situs lain di server yang sama sedang sibuk, situsmu ikut melambat.
- **Biasanya tidak ada Node.** Aset Vite harus di-build di laptop atau di CI, lalu hasilnya diunggah.
- **Cron bisa dibatasi.** Sebagian paket hanya mengizinkan cron tiap 5 atau 15 menit, bukan tiap menit.
- **Biasanya tidak ada Redis.** Cache, session, dan antrean memakai database. Ini sudah bawaan Laravel 13: `.env.example` bawaannya berisi `SESSION_DRIVER=database`, `CACHE_STORE=database`, dan `QUEUE_CONNECTION=database`.

Dompet dirancang supaya muat di batasan itu: tidak memakai WebSocket, antreannya dikuras lewat cron, dan laporan bulanannya dijalankan scheduler. Harga yang dibayar adalah jeda: job yang masuk antrean baru diproses saat cron berikutnya berjalan, paling cepat satu menit kemudian.

Pindahlah ke VPS kalau salah satu ini mulai berlaku:

- Job antrean harus diproses dalam hitungan detik.
- Kamu butuh fitur realtime lewat WebSocket.
- Kamu butuh Redis atau extension PHP yang tidak disediakan host.
- Pengunjung sering mendapat error batas sumber daya.

## Syarat shared hosting untuk Laravel 13

Tidak semua paket shared hosting sanggup menjalankan Laravel dengan benar. Banyak paket termurah dirancang untuk situs seperti WordPress, yang tidak butuh SSH, Composer, atau cron tiap menit. Ini daftar yang harus dipenuhi.

| Syarat | Minimal | Kenapa |
|---|---|---|
| Versi PHP bisa dipilih | Sesuai `"php"` di `composer.json`. Laravel 13 butuh PHP 8.3 ke atas, materi ini memakai 8.5 | Composer menolak memasang dependency kalau versinya kurang |
| PHP di SSH sama dengan PHP di web | Versi yang sama | `artisan`, Composer, dan cron memakai PHP baris perintah, bukan PHP web |
| Extension PHP | Daftar di bawah | Laravel tidak bisa boot tanpanya |
| Akses SSH | Shell sungguhan, bukan hanya SFTP | Untuk menjalankan Composer, `artisan`, dan Git |
| Composer | Tersedia, atau boleh dipasang di folder home | Memasang isi `vendor` |
| Git | Tersedia | Mengambil kode dari repo |
| Cron | Tiap menit (`* * * * *`) | Scheduler Laravel dirancang dipanggil tiap menit |
| Database | MySQL 5.7 ke atas atau MariaDB 10.3 ke atas | Versi minimal yang didukung Laravel 13 |
| Document root | Bisa diarahkan ke folder pilihanmu, atau `public_html` boleh diganti symlink | Hanya folder `public` yang boleh terlihat dari web |
| Symlink | Diizinkan dan diikuti web server | Dipakai untuk berpindah rilis |
| Batas sumber daya | Cukup untuk aplikasimu (lihat di bawah) | Menentukan kapan pengunjung mulai mendapat error |
| SSL | Sertifikat gratis yang diperbarui otomatis | Login dan cookie session harus lewat HTTPS |
| Backup | Otomatis, mencakup database, bisa dipulihkan sendiri | Shared hosting tidak memberi jalan lain untuk menyelamatkan data |

### Extension PHP

Dokumentasi Laravel 13 mewajibkan extension ini: Ctype, cURL, DOM, Fileinfo, Filter, Hash, Mbstring, OpenSSL, PCRE, PDO, Session, Tokenizer, dan XML. Hampir semuanya aktif secara bawaan di PHP mana pun.

Dua tambahan yang perlu kamu cek sendiri:

- **`pdo_mysql`**: driver database. PDO saja tidak cukup untuk bicara dengan MySQL atau MariaDB.
- **`intl`**: tidak ada di daftar wajib, tetapi helper `Number` milik Laravel membutuhkannya. Di server uji untuk bab ini, yang tidak punya `intl`, perintah `php artisan db:show` berhenti dengan pesan ini:

```text
The "intl" PHP extension is required to use the [format] method.
```

Aplikasi yang memformat angka atau mata uang dengan `Number` akan gagal dengan cara yang sama. Di shared hosting, extension dinyalakan lewat menu pemilih extension PHP di panel, bukan dengan memasangnya sendiri.

### Batas sumber daya

Angka-angka ini biasanya tertulis di halaman paket atau di panel:

- **Memori PHP (`memory_limit`).** Batas memori satu request. Composer juga memakainya saat memasang dependency.
- **Jumlah proses bersamaan.** Berapa request PHP yang boleh berjalan pada saat yang sama. Di host berbasis CloudLinux ini disebut *entry processes*.
- **Inode.** Jumlah file dan folder yang boleh kamu simpan. Laravel banyak memakan inode karena folder `vendor`. Di server uji, satu salinan aplikasi Laravel 13 kosong beserta `vendor`-nya berisi 6.678 file dan memakan 49 MB. [Bab 12](/12-deploy) menyimpan tiga rilis sekaligus, jadi kalikan tiga.
- **Ruang disk.** Termasuk database, email, dan backup.

## Cek sebelum membayar

Ada tiga sumber, dari yang paling murah usahanya.

**Halaman bantuan penyedia.** Cari artikel "ganti versi PHP", "akses SSH", dan "cron job" di knowledge base-nya. Halaman bantuan lebih bisa dipercaya daripada halaman penjualan, karena ditulis untuk pelanggan yang sudah membayar. Sebagai contoh cara membacanya: [halaman bantuan Hostinger tentang mengganti versi PHP](https://www.hostinger.com/support/1575755-how-to-change-the-php-version-of-your-hostinger-hosting-plan/), saat dibaca pada 16 November 2026, menyatakan versi yang bisa dipilih adalah PHP 8.2 sampai 8.5. Itu menjawab satu baris di tabel untuk satu penyedia. Ini bukan rekomendasi, dan baris lain seperti SSH dan interval cron tetap harus kamu cek untuk paket yang kamu incar.

**Tanya langsung.** Kirim daftar ini ke layanan pelanggan sebelum membeli. Jawaban tertulis juga berguna sebagai pegangan kalau nanti ternyata berbeda.

```text
Saya ingin menjalankan aplikasi Laravel 13 di paket [nama paket]. Mohon konfirmasi:

1. Apakah PHP 8.5 bisa dipilih, untuk web maupun untuk baris perintah (SSH dan cron)?
2. Apakah paket ini mendapat akses SSH (shell), bukan hanya SFTP?
3. Apakah Composer dan Git tersedia lewat SSH? Kalau tidak, bolehkah saya memasang Composer di folder home?
4. Berapa interval cron terkecil? Apakah bisa tiap menit?
5. Database apa yang dipakai dan versi berapa (MySQL atau MariaDB)?
6. Apakah document root domain bisa saya arahkan ke subfolder, atau bolehkah public_html diganti dengan symlink?
7. Apakah extension PHP pdo_mysql dan intl bisa diaktifkan?
8. Berapa batas memori PHP, jumlah proses bersamaan, dan inode di paket ini?
9. Apakah SSL gratis dan backup otomatis (termasuk database) sudah termasuk?
10. Apakah ada garansi uang kembali, dan berapa hari?
```

**Garansi uang kembali.** Ini cara yang paling pasti: beli, periksa sendiri lewat SSH dengan perintah di bagian berikutnya, dan minta pengembalian dana kalau ada syarat yang tidak terpenuhi.

::: warning Jangan percaya daftar "hosting Laravel terbaik"
Artikel perbandingan hosting hampir selalu ditulis untuk komisi afiliasi, dan versi PHP serta fitur tiap paket berubah dari waktu ke waktu. Materi ini sengaja tidak merekomendasikan penyedia tertentu. Yang bisa dipegang hanya halaman resmi penyedia dan hasil pemeriksaanmu sendiri.
:::

## Cek setelah punya akses SSH

Begitu akun aktif, masuk lewat SSH dan jalankan pemeriksaan ini. Semuanya hanya membaca, tidak mengubah apa pun.

::: info Asal output di bab ini dan [Bab 12](/12-deploy)
Penyedia hosting sungguhan tidak tersedia saat materi ini ditulis. Output di bawah berasal dari server tiruan: sebuah container Docker berisi Apache dan PHP 8.5, dengan akun pengguna biasa bernama `u123` dan folder `public_html`, yang dibuat menyerupai akun shared hosting. Di host-mu, nama pengguna, path, dan sebagian hasilnya akan berbeda.
:::

Siapa kamu dan di mana folder home-mu:

```bash
whoami && pwd
```

```text
u123
/home/u123
```

Versi PHP baris perintah, dan lokasi binary-nya. Catat path ini, karena [Bab 12](/12-deploy) memakainya untuk cron:

```bash
php -v
which php
```

```text
PHP 8.5.12 (cli) (built: Nov  5 2026 07:20:51) (NTS)
Copyright (c) The PHP Group
Built by https://github.com/docker-library/php
Zend Engine v4.5.12, Copyright (c) Zend Technologies
    with Zend OPcache v8.5.12, Copyright (c), by Zend Technologies
/usr/local/bin/php
```

::: warning `php` di SSH belum tentu PHP yang kamu pilih di panel
Di banyak host, pilihan versi di panel hanya berlaku untuk web. Perintah `php` di SSH bisa menunjuk ke versi lain yang lebih tua, dan tiap versi punya path sendiri. Kalau `php -v` menampilkan versi yang salah, cari path PHP 8.5 di dokumentasi host-mu, lalu pakai path lengkap itu di semua perintah [Bab 12](/12-deploy).
:::

Extension yang dibutuhkan, dalam satu perintah:

```bash
php -r 'foreach (["ctype","curl","dom","fileinfo","filter","hash","mbstring","openssl","pcre","pdo","pdo_mysql","session","tokenizer","xml","intl"] as $e) echo str_pad($e, 12), extension_loaded($e) ? "ok" : "TIDAK ADA", PHP_EOL;'
```

```text
ctype       ok
curl        ok
dom         ok
fileinfo    ok
filter      ok
hash        ok
mbstring    ok
openssl     ok
pcre        ok
pdo         ok
pdo_mysql   ok
session     ok
tokenizer   ok
xml         ok
intl        TIDAK ADA
```

Batas memori PHP:

```bash
php -r 'echo ini_get("memory_limit"), PHP_EOL;'
```

```text
128M
```

Composer, Git, dan Node:

```bash
composer --version
git --version
node -v
```

```text
bash: line 1: composer: command not found
git version 2.47.3
bash: line 1: node: command not found
```

Server uji ini sengaja dibuat tanpa Composer dan tanpa Node, seperti kebanyakan shared hosting. Composer bisa dipasang sendiri di folder home, caranya ada di [Bab 12](/12-deploy). Node tidak, dan memang tidak dibutuhkan.

Cron. Pesan ini berarti cron tersedia dan belum ada entri:

```bash
crontab -l
```

```text
no crontab for u123
```

Symlink:

```bash
ln -s public_html tes-symlink && ls -l tes-symlink && rm tes-symlink
```

```text
lrwxrwxrwx 1 u123 u123 11 Nov 16 07:46 tes-symlink -> public_html
```

Jam server. Di server uji ini jamnya UTC, tujuh jam di belakang WIB. Ini bisa menggeser tugas terjadwal, dan dibahas di [Bab 12](/12-deploy):

```bash
date
```

```text
Mon Nov 16 07:47:25 UTC 2026
```

Tiga hal tidak bisa dicek dari SSH dan harus dilihat di panel: interval cron terkecil, pengaturan document root, dan versi database.

## Kalau ada syarat yang tidak terpenuhi

| Yang tidak ada | Akibatnya | Jalan keluar |
|---|---|---|
| PHP 8.5 | Composer menolak memasang dependency | Tidak ada. Cari paket lain |
| Akses SSH | Tidak bisa menjalankan Composer, migrasi, dan `artisan` | Tidak ada yang layak. Cari paket lain |
| Document root dan symlink sama-sama tidak bisa diatur | Seluruh proyek, termasuk `.env`, harus ditaruh di folder yang terlihat dari web | Tidak ada yang aman. Cari paket lain |
| Composer | Tidak bisa memasang `vendor` | Pasang sendiri di folder home (Bab 12) |
| Cron tiap menit | Antrean baru dikuras tiap 5 atau 15 menit, dan jadwal harus disesuaikan | Bisa diterima untuk Dompet, dengan penyesuaian di Bab 12 |
| `intl` | Helper `Number` gagal | Aktifkan di panel, atau jangan pakai `Number` |
| Backup otomatis | Kehilangan data kalau server bermasalah | Buat backup database sendiri lewat cron |

Tiga baris pertama tidak bisa ditawar. Kalau salah satunya gagal, paket itu tidak layak untuk Laravel, semurah apa pun harganya.

## Ringkasan

- **Shared hosting murah karena model PHP.** Aplikasimu hanya file. Proses yang hidup terus adalah web server milik host, yang dibagi ke banyak pelanggan.
- **Harganya adalah batasan.** Tidak ada proses permanen, tidak ada root, tidak ada Node, dan sumber dayanya dibagi.
- **Dompet muat di batasan itu**, karena antreannya dikuras cron dan tidak ada fitur realtime.
- **Tidak semua paket layak.** PHP 8.5, SSH, dan kendali atas document root tidak bisa ditawar.
- **Periksa sendiri.** Halaman bantuan penyedia, jawaban tertulis layanan pelanggan, lalu pemeriksaan lewat SSH selama masa garansi.

## Latihan

### 1. Menilai sebuah paket

Sebuah paket hosting mencantumkan: PHP 7.4 sampai 8.4, akses SSH, Git, cron dengan interval terkecil 15 menit, MariaDB 10.6, dan document root yang bisa diatur per domain. Bisakah Dompet berjalan di sana?

::: details Jawaban
Tidak, dan penyebabnya versi PHP. Dompet ditulis untuk PHP 8.5, sedangkan paket itu berhenti di 8.4, jadi Composer menolak memasang dependency-nya. Itu syarat yang tidak bisa ditawar.

Sisanya memenuhi atau bisa diakali: MariaDB 10.6 di atas batas minimal 10.3, SSH dan Git ada, dan document root bisa diatur. Cron 15 menit bukan penghalang, tetapi job antrean baru diproses paling lama 15 menit setelah masuk.
:::

### 2. Kenapa axum tidak bisa

Temanmu ingin menaruh API axum-nya di shared hosting yang sama dengan aplikasi Laravel-mu, karena "sama-sama aplikasi web". Jelaskan kenapa itu tidak bisa.

::: details Jawaban
Aplikasi axum adalah proses yang harus dinyalakan, membuka port sendiri, dan hidup terus. Shared hosting tidak memberi keduanya: proses yang hidup lama dimatikan, dan port yang terbuka ke internet hanya milik web server host.

Aplikasi Laravel tidak butuh keduanya. Ia tidak punya proses sendiri. Web server milik host yang menjalankan file PHP-nya setiap kali ada request, lalu membuang state-nya.
:::

### 3. Kapan harus pindah

Kamu ingin menambahkan fitur ke Dompet: saldo di layar langsung berubah saat anggota keluarga lain mencatat pengeluaran, tanpa memuat ulang halaman. Jenis hosting apa yang kamu butuhkan?

::: details Jawaban
Minimal VPS, atau PaaS. Pembaruan langsung seperti itu memakai WebSocket, yang butuh server WebSocket (Laravel Reverb) sebagai proses yang jalan terus. Shared hosting tidak mengizinkannya.

Selama masih di shared hosting, yang bisa dilakukan adalah polling: halaman meminta data terbaru ke server tiap beberapa detik. Livewire menyediakannya, dengan harga tambahan request yang ikut memakan jatah sumber daya akunmu.
:::
