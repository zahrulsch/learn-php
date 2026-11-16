# 7. PHP web tanpa framework

Bab ini membangun aplikasi web kecil, sebuah buku tamu, hanya dengan PHP dan tanpa framework. Tujuannya bukan mengajakmu menulis aplikasi seperti ini seterusnya, melainkan supaya kamu tahu persis apa yang dikerjakan Laravel untukmu mulai [Bab 8](/08-laravel-dasar): routing, request, validasi, templat, database, session, dan pengamanannya.

## Model eksekusi: satu request, satu kehidupan

Di Node atau axum, aplikasimu adalah satu proses yang hidup lama. Proses itu membuka port, lalu melayani ribuan request dengan state yang sama di memori.

PHP bekerja terbalik. Yang hidup lama hanya web server. Untuk setiap request, web server menjalankan script PHP dari baris pertama sampai terakhir, mengirim outputnya sebagai response, lalu membuang seluruh state script itu. Model ini dijuluki *shared-nothing*.

| | Node (Express), Rust (axum) | PHP |
|---|---|---|
| Yang hidup lama | Proses aplikasimu | Web server saja, bukan kode aplikasimu |
| State di memori antar request | Ada: variabel global, cache, pool koneksi | Tidak ada. Semua variabel dibuang di akhir request |
| Konkurensi | Event loop atau task async di satu proses | Satu proses pekerja per request, dengan kode sinkron biasa |
| Kebocoran memori | Menumpuk selama proses hidup | Hilang sendiri di akhir request |
| Setelah mengubah kode | Restart atau compile ulang | Tidak perlu. Request berikutnya membaca file terbaru |
| Pekerjaan latar belakang | Task di proses yang sama | Proses terpisah: queue worker dan cron |

Konsekuensinya menjelaskan banyak hal tentang bentuk aplikasi PHP:

- **State harus disimpan di luar proses**: database, file session, atau cache.
- **Tidak ada `async`/`await`.** Kode yang menunggu database cukup ditulis berurutan, karena request lain dilayani proses lain.
- **Semua persiapan diulang di setiap request**: memuat autoloader, membaca konfigurasi, membuka koneksi database. Framework dirancang supaya persiapan itu murah.

## Siapkan proyek

Bab ini memakai proyek baru, terpisah dari `php-basics`. Dari PowerShell:

```powershell
mkdir practice/web-basics
cd practice/web-basics
mkdir bin, public, src, templates
```

`Dockerfile`-nya sama persis dengan [Bab 1](/01-setup):

```dockerfile
FROM php:8.5-cli

# Composer butuh unzip untuk membuka paket yang diunduhnya
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
```

`compose.yaml` mendapat dua tambahan, yaitu port dan perintah yang dijalankan container:

```yaml [compose.yaml]
services:
  php:
    build: .
    volumes:
      - .:/app
    ports:
      - "8000:8000"
    command: php -S 0.0.0.0:8000 -t public
```

`php -S` menyalakan web server bawaan PHP. Dua bagiannya penting:

- **`0.0.0.0:8000`**: server harus mendengarkan di semua alamat supaya port yang dipublikasikan Docker sampai kepadanya. Dengan `localhost`, server hanya bisa dicapai dari dalam container.
- **`-t public`**: folder `public` menjadi *document root*, satu-satunya folder yang isinya bisa diminta lewat URL.

Buat `public/index.php` sementara:

```php:line-numbers [public/index.php]
<?php

declare(strict_types=1);

echo 'PHP ' . PHP_VERSION . ' lewat SAPI ' . PHP_SAPI . PHP_EOL;
```

Nyalakan container:

```powershell
docker compose up
```

```text
php-1  | [Mon Nov 16 07:53:32 2026] PHP 8.5.12 Development Server (http://0.0.0.0:8000) started
```

Terminal itu sekarang menampilkan log server. Biarkan terbuka, lalu buka terminal kedua dan masuk ke container yang sedang berjalan:

```powershell
docker compose exec php bash
```

Semua perintah berikutnya dijalankan dari shell ini. Image PHP sudah menyertakan `curl`, jadi request bisa dicoba dari sini selain dari browser di `http://localhost:8000`:

```bash
curl http://localhost:8000/
```

```text
PHP 8.5.12 lewat SAPI cli-server
```

Jalankan file yang sama langsung dari command line:

```bash
php public/index.php
```

```text
PHP 8.5.12 lewat SAPI cli
```

### SAPI

Yang berbeda di dua output itu adalah SAPI (*Server API*), yaitu cara interpreter PHP dihubungkan dengan dunia luar. Interpreternya sama, pintu masuknya yang berbeda.

| SAPI | Dipakai untuk |
|---|---|
| `cli` | Command line: script, Composer, PHPStan, PHPUnit |
| `cli-server` | Web server bawaan `php -S`. Hanya untuk development: satu proses, satu request dalam satu waktu |
| `fpm-fcgi` | PHP-FPM: sekumpulan proses pekerja di belakang Nginx atau Apache. Susunan paling umum di VPS |
| `apache2handler` | PHP sebagai modul di dalam Apache |
| `litespeed` | PHP di belakang web server LiteSpeed, banyak dipakai shared hosting |

Kodemu tidak berubah di antara SAPI web itu. Yang berbeda adalah siapa yang menjalankan PHP dan bagaimana ia dikonfigurasi. Itu urusan [Bab 11](/11-memilih-hosting) dan [Bab 12](/12-deploy).

Beberapa pengaturan bergantung pada SAPI. Contohnya batas waktu eksekusi `max_execution_time`: 0 (tanpa batas) di `cli`, 30 detik di `cli-server`.

### Pasang PHPStan

Buat `composer.json`:

```json:line-numbers [composer.json]
{
    "name": "learn/web-basics",
    "type": "project",
    "require": {
        "php": "^8.5",
        "ext-pdo_sqlite": "*"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    },
    "scripts": {
        "check": "phpstan analyse"
    }
}
```

Dua hal dari [Bab 6](/06-ekosistem/) dipakai di sini: autoload PSR-4 dengan awalan `App\`, dan syarat platform `ext-pdo_sqlite` untuk database nanti.

Buat `phpstan.neon`:

```yaml:line-numbers [phpstan.neon]
parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - bin
        - public
        - src
        - templates
```

```bash
composer require --dev phpstan/phpstan
```

## Membuktikan shared-nothing

Buat `public/counter.php`:

```php:line-numbers [public/counter.php]
<?php

declare(strict_types=1);

$count = 0;
$count++;

echo "Request ke-{$count}" . PHP_EOL;
```

Panggil tiga kali:

```bash
curl http://localhost:8000/counter.php
curl http://localhost:8000/counter.php
curl http://localhost:8000/counter.php
```

```text
Request ke-1
Request ke-1
Request ke-1
```

Di Node, kode yang setara akan terus bertambah, karena variabelnya hidup di proses server:

```ts
import { createServer } from 'node:http'

let count = 0

createServer((req, res) => {
  count++
  res.end(`Request ke-${count}\n`)
}).listen(8000)
```

Di PHP tidak ada tempat untuk menaruh `let count` itu. Setiap request memulai dari file yang sama dengan memori kosong. Kamu juga tidak me-restart apa pun setelah membuat `counter.php`: file itu langsung bisa dipanggil, karena memang dibaca ulang di setiap request.

## Input: superglobal bertipe `mixed`

PHP menyerahkan data request lewat beberapa array global yang selalu tersedia, disebut *superglobal*:

| Superglobal | Isinya |
|---|---|
| `$_GET` | Parameter query string |
| `$_POST` | Isi form yang dikirim dengan POST |
| `$_SERVER` | Metode, URL, header, dan info server |
| `$_COOKIE` | Cookie yang dikirim browser |
| `$_FILES` | File yang diunggah |
| `$_SESSION` | Data session, setelah `session_start()` |

Semua isinya berasal dari luar, jadi PHPStan menganggapnya `mixed`. Buat `public/greet.php`:

```php:line-numbers [public/greet.php]
<?php

declare(strict_types=1);

echo 'Halo, ' . strtoupper($_GET['name']) . PHP_EOL;
```

```bash
composer check
```

```text
 ------ -------------------------------------------------------------------
  Line   public/greet.php
 ------ -------------------------------------------------------------------
  5      Parameter #1 $string of function strtoupper expects string, mixed
         given.
         🪪  argument.type
 ------ -------------------------------------------------------------------

 [ERROR] Found 1 error
```

Keluhan PHPStan itu bukan formalitas. Dengan input yang wajar, script ini jalan:

```bash
curl "http://localhost:8000/greet.php?name=budi"
```

```text
Halo, BUDI
```

Tanpa parameter, ia gagal:

```bash
curl "http://localhost:8000/greet.php"
```

```text
<br />
<b>Warning</b>:  Undefined array key "name" in <b>/app/public/greet.php</b> on line <b>5</b><br />
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, null given in /app/public/greet.php:5
```

Dan pengirim bisa membuat nilainya menjadi array, cukup dengan menambahkan `[]` pada nama parameter:

```bash
curl -g "http://localhost:8000/greet.php?name[]=budi"
```

```text
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, array given in /app/public/greet.php:5
```

Itulah sebabnya tipenya `mixed`: sebuah parameter bisa tidak ada, bisa string, dan bisa array bersarang. Ada masalah ketiga, yaitu input dicetak mentah-mentah ke halaman:

```bash
curl -g "http://localhost:8000/greet.php?name=<script>alert(1)</script>"
```

```text
Halo, <SCRIPT>ALERT(1)</SCRIPT>
```

Browser akan menjalankan tag itu sebagai JavaScript. Ini celah XSS, yang dibahas di bagian templat.

Perbaikannya mengikuti pola yang sama dengan `mixed` di [Bab 2](/02-type-system): periksa bentuknya di pintu masuk, dan setelah itu bekerja dengan tipe yang pasti. Timpa `greet.php`:

```php:line-numbers [public/greet.php]
<?php

declare(strict_types=1);

$name = $_GET['name'] ?? null;

if (!is_string($name) || $name === '') {
    http_response_code(400);
    echo 'Parameter name wajib diisi.' . PHP_EOL;

    return;
}

echo 'Halo, ' . htmlspecialchars(strtoupper($name)) . PHP_EOL;
```

Sekarang `composer check` lulus, dan ketiga kasus tadi tertangani:

```text
$ curl -g "http://localhost:8000/greet.php?name[]=budi"
Parameter name wajib diisi.

$ curl -g "http://localhost:8000/greet.php?name=<script>alert(1)</script>"
Halo, &lt;SCRIPT&gt;ALERT(1)&lt;/SCRIPT&gt;
```

::: warning Pesan error tadi tampil ke pengunjung
Dua output error di atas dikirim ke browser lengkap dengan path file di server, dan dengan status 200. Image `php:8.5-cli` berjalan tanpa `php.ini`, sehingga `display_errors` menyala. Itu membantu saat development, tetapi di production harus dimatikan dan error dicatat ke log. Pengaturannya dibahas di [Bab 12](/12-deploy).
:::

Hapus `public/counter.php` dan `public/greet.php`. Mulai dari sini kita membangun aplikasinya.
