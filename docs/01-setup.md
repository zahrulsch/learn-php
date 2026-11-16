# 1. Setup dan tooling

Di akhir bab ini kamu punya PHP 8.5 dan Composer yang berjalan di container Docker, tanpa memasang PHP di mesinmu, serta satu proyek kecil yang diperiksa PHPStan level max. Alur kerjanya akan terasa akrab: periksa tipe dulu, baru jalankan, seperti `cargo check` sebelum `cargo run`.

## Peta tooling

Hampir semua alat yang kamu kenal punya padanan langsung di PHP.

| Kebutuhan | Rust | TypeScript | PHP |
|---|---|---|---|
| Menjalankan kode | `cargo run` | `node`, `tsx` | `php file.php` |
| Package manager | Cargo | npm | Composer |
| Manifest | `Cargo.toml` | `package.json` | `composer.json` |
| Lockfile | `Cargo.lock` | `package-lock.json` | `composer.lock` |
| Registry | crates.io | npmjs.com | packagist.org |
| Folder dependency | `~/.cargo/registry` | `node_modules/` | `vendor/` |
| Cek tipe | `cargo check` | `tsc --noEmit` | `phpstan analyse` |

Yang tidak punya padanan adalah langkah build: PHP tidak menghasilkan binary atau bundle.

## Bagaimana PHP dijalankan

Saat kamu menjalankan `php file.php`, interpreter membaca source, mengompilasinya menjadi opcode di memori, lalu langsung mengeksekusinya. Tidak ada artefak yang disimpan, dan proses itu berulang setiap kali script dijalankan.

Konsekuensinya penting untuk yang terbiasa dengan compiler:

- **Tipe dicek saat runtime.** PHP memeriksa tipe parameter dan return value tepat ketika fungsi dipanggil, bukan sebelumnya.
- **Error tipe bisa bersembunyi.** Kode yang salah tipe tetap lolos sampai baris itu benar-benar dieksekusi.

Dua alat menutup celah itu. `strict_types` membuat pengecekan runtime tidak berkompromi, dan PHPStan memindahkan pengecekan ke sebelum kode dijalankan.

## Siapkan container

PHP tidak perlu dipasang di mesinmu. PHP dan Composer berjalan di dalam container, sedangkan folder proyek di-mount ke dalamnya, jadi file tetap kamu edit di VS Code seperti biasa.

Buat folder proyek di luar folder `docs`:

```powershell
mkdir practice/php-basics/src
cd practice/php-basics
```

Buat `Dockerfile`:

```dockerfile
FROM php:8.5-cli

# Composer butuh unzip untuk membuka paket yang diunduhnya
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
```

Tiga hal di sini spesifik PHP:

- **`php:8.5-cli`** adalah image resmi PHP varian command line, dan dipakai di seluruh materi ini. Varian `fpm` dan `apache` ditujukan untuk server production; bedanya dijelaskan di [Bab 7](/07-web-tanpa-framework).
- **`COPY --from=composer:2`** menyalin binary Composer dari image resminya, karena image PHP tidak menyertakan Composer.
- **`unzip`** dipakai Composer untuk membuka paket yang diunduhnya.

Buat `compose.yaml`:

```yaml
services:
  php:
    build: .
    volumes:
      - .:/app
```

Masuk ke shell di dalam container:

```powershell
docker compose run --rm php bash
```

Yang pertama kali memakan waktu, karena image diunduh dan di-build. Setelah masuk, pastikan PHP dan Composer tersedia:

```bash
php -v
composer -V
```

```text
PHP 8.5.12 (cli) (built: Nov  5 2026 07:20:51) (NTS)
Composer version 2.11.2 2026-11-10 10:09:37
```

Nomor patch di tempatmu bisa lebih baru.

::: warning Semua perintah dijalankan di dalam container
Mulai dari sini, setiap perintah `php`, `composer`, dan `vendor/bin/...` di materi ini dijalankan dari shell container tadi, bukan dari PowerShell. Kalau shell-nya kamu tutup, masuk lagi dengan `docker compose run --rm php bash`.
:::

::: info Kenapa 8.5, bukan 8.6
Saat bab ini ditulis (November 2026), PHP 8.5 adalah versi stabil terbaru. PHP 8.6 masih berstatus release candidate.
:::

## Siapkan VS Code

Pasang extension **PHP Intelephense** untuk autocomplete, go to definition, dan informasi tipe saat hover. Extension ini tidak membutuhkan PHP di mesinmu.

VS Code juga punya validasi PHP bawaan yang mencari executable `php` di mesin, lalu mengeluh karena tidak menemukannya. Matikan lewat settings:

```json
"php.validate.enable": false
```

## Proyek pertama

Buat `composer.json` di folder proyek. Ini padanan `Cargo.toml` atau `package.json`:

```json
{
    "name": "learn/php-basics",
    "type": "project",
    "require": {
        "php": "^8.5"
    }
}
```

`"php": "^8.5"` menyatakan versi PHP yang dibutuhkan proyek. Aturan caret-nya sama dengan Cargo dan npm: 8.5 ke atas, di bawah 9.0. Bedanya dengan field `engines` di `package.json`, Composer menolak memasang dependency kalau versi PHP-nya tidak cocok.

Lalu buat `src/hello.php`:

```php
<?php

declare(strict_types=1);

function greet(string $name): string
{
    return "Halo, {$name}!";
}

echo greet('dunia') . PHP_EOL;
```

Jalankan dari shell container:

```bash
php src/hello.php
```

```text
Halo, dunia!
```

Yang langsung terlihat berbeda dari Rust dan TS:

- **`<?php`** mengawali setiap file PHP. Tag penutup `?>` tidak ditulis di file yang isinya hanya PHP.
- **`$`** mengawali setiap nama variabel.
- **Tanda kutip ganda** melakukan interpolasi (`"Halo, {$name}!"`), tanda kutip tunggal tidak. Mirip beda template literal dan string biasa di TS.
- **`.`** adalah operator penggabung string, bukan `+`.
- **`PHP_EOL`** adalah konstanta newline sesuai sistem operasi.

## `strict_types`

Baris `declare(strict_types=1);` mematikan konversi tipe otomatis saat memanggil fungsi. Untuk melihat pengaruhnya, tambahkan satu baris di akhir `src/hello.php`:

```php
echo greet(42) . PHP_EOL;
```

Jalankan lagi:

```text
Halo, dunia!

Fatal error: Uncaught TypeError: greet(): Argument #1 ($name) must be of type string, int given, called in /app/src/hello.php on line 11 and defined in /app/src/hello.php:5
```

Sekarang hapus baris `declare(strict_types=1);` dan jalankan lagi:

```text
Halo, dunia!
Halo, 42!
```

Tanpa strict types, PHP diam-diam mengubah `42` menjadi `"42"`. Ini mode bawaan PHP, disebut *coercive mode*. Kembalikan baris `declare` itu sebelum lanjut.

Aturan mainnya:

- **Berlaku per file.** Tidak ada pengaturan global seperti `"strict": true` di `tsconfig.json`. Karena itu, di materi ini setiap file PHP diawali `declare(strict_types=1);`.
- **Harus jadi pernyataan pertama** setelah `<?php`. Kalau tidak, PHP berhenti dengan fatal error.
- **File pemanggil yang menentukan.** Sebuah pemanggilan fungsi diperiksa ketat kalau file tempat pemanggilan itu ditulis memakai strict types, di mana pun fungsinya didefinisikan.
- **Hanya menyangkut tipe skalar**: `int`, `float`, `string`, `bool`.
- **Satu pengecualian**: `int` tetap boleh masuk ke parameter `float`.

Rust tidak punya konversi implisit sama sekali, dan PHP dengan `strict_types=1` mendekati itu. Tetapi perhatikan output di atas: error muncul **setelah** `Halo, dunia!` tercetak. Pengecekannya tetap terjadi saat runtime, baris demi baris.

## PHPStan

PHPStan adalah static analyzer: ia membaca kodemu tanpa menjalankannya, lalu melaporkan error tipe. Perannya sama dengan `cargo check` atau `tsc --noEmit`.

### Pasang

```bash
composer require --dev phpstan/phpstan
```

`--dev` sama dengan `devDependencies` di npm atau `[dev-dependencies]` di Cargo. Perintah ini menghasilkan tiga hal:

- Bagian `require-dev` di `composer.json`, berisi `"phpstan/phpstan": "^2.3"`.
- File `composer.lock`, berisi versi persis yang terpasang.
- Folder `vendor/`, berisi kode dependency dan executable-nya di `vendor/bin`.

### Konfigurasi

Buat `phpstan.neon` di folder proyek:

```yaml
parameters:
    level: max
    paths:
        - src
```

### Jalankan

Baris `greet(42)` yang salah tadi masih ada di `src/hello.php`. Kali ini jangan jalankan kodenya, analisis saja:

```bash
vendor/bin/phpstan analyse
```

```text
Note: Using configuration file /app/phpstan.neon.
 ------ -----------------------------------------------------------------
  Line   hello.php
 ------ -----------------------------------------------------------------
  11     Parameter #1 $name of function greet expects string, int given.
         🪪  argument.type
 ------ -----------------------------------------------------------------

 [ERROR] Found 1 error
```

PHPStan menemukan error itu tanpa mengeksekusi satu baris pun. Bedanya terasa ketika baris yang salah berada di dalam fungsi yang jarang dipanggil: PHP baru mengeluh saat fungsi itu akhirnya dijalankan, mungkin di production, sedangkan PHPStan memeriksa semua jalur kode setiap kali.

Hapus baris `greet(42)`, lalu jalankan lagi:

```text
Note: Using configuration file /app/phpstan.neon.

 [OK] No errors
```

### Level

PHPStan punya 11 level, dari 0 (paling longgar) sampai 10 (paling ketat). Tiap level mencakup semua level di bawahnya.

| Level | Yang ditambahkan |
|---|---|
| 0 | Pemeriksaan dasar: class dan fungsi tak dikenal, jumlah argumen salah |
| 1 | Variabel yang mungkin belum didefinisikan |
| 2 | Method tak dikenal pada semua ekspresi, validasi PHPDoc |
| 3 | Tipe return dan tipe yang di-assign ke property |
| 4 | Dead code dasar: pengecekan tipe yang selalu salah, kode tak terjangkau |
| 5 | Tipe argumen yang dikirim ke fungsi dan method |
| 6 | Deklarasi tipe yang tidak ditulis |
| 7 | Union type yang hanya sebagian cocok |
| 8 | Pemanggilan method dan akses property pada tipe nullable |
| 9 | `mixed` eksplisit hanya boleh diteruskan ke `mixed` lain |
| 10 | `mixed` implisit (tipe yang tidak ditulis) diperlakukan sama ketatnya |

`max` adalah alias untuk level tertinggi. Pemetaan kasarnya ke TypeScript:

- **Level 6** kira-kira `noImplicitAny`: tipe wajib ditulis.
- **Level 8** kira-kira `strictNullChecks`: nilai yang mungkin `null` harus ditangani dulu.
- **Level 9 dan 10** membuat `mixed` berperilaku seperti `unknown`. Di bawah level itu, `mixed` berperilaku seperti `any`.

### Jadikan satu perintah

Tambahkan bagian `scripts` ke `composer.json`, sejajar dengan `require`:

```json
"scripts": {
    "check": "phpstan analyse"
}
```

Composer menambahkan `vendor/bin` ke PATH saat menjalankan script, jadi cukup tulis `phpstan`. Sekarang pengecekan tipe cukup dengan:

```bash
composer check
```

## Alur kerja

Mulai bab ini, urutan kerjanya selalu sama:

1. Tulis kode.
2. Jalankan `composer check` sampai hasilnya `[OK] No errors`.
3. Baru jalankan kodenya dengan `php`.

## Ringkasan

- **PHP berjalan di container.** Tidak ada yang dipasang di mesinmu selain Docker.
- **PHP tidak punya langkah compile.** Tipe dicek saat runtime, ketika baris itu dieksekusi.
- **`declare(strict_types=1);`** di setiap file mematikan konversi tipe skalar otomatis.
- **PHPStan level max** menangkap error tipe sebelum kode dijalankan, termasuk di jalur kode yang jarang dilewati.
- **Composer** adalah Cargo-nya PHP: `composer.json`, `composer.lock`, dan folder `vendor/`.

## Latihan

Kerjakan di `src/hello.php`. Tebak dulu hasilnya, baru jalankan.

### 1. Pengecualian `int` ke `float`

Tambahkan kode ini. Apakah `composer check` dan `php src/hello.php` melaporkan error?

```php
function half(float $x): float
{
    return $x / 2;
}

echo half(10) . PHP_EOL;
```

::: details Jawaban
Tidak ada error di keduanya, dan outputnya `5`. `int` ke `float` adalah satu-satunya konversi yang tetap diizinkan dalam strict mode.
:::

### 2. Nilai yang mungkin `null`

`?string` berarti `string` atau `null`, padanan `Option<String>` di Rust dan `string | null` di TS. Tambahkan kode ini, lalu jalankan `composer check`:

```php
function findName(int $id): ?string
{
    return $id === 1 ? 'Budi' : null;
}

echo strtoupper(findName(2)) . PHP_EOL;
```

Apa yang dilaporkan PHPStan, dan bagaimana memperbaikinya?

::: details Jawaban
PHPStan melaporkan bahwa `strtoupper` mengharapkan `string`, tetapi menerima `string|null`:

```text
Parameter #1 $string of function strtoupper expects string, string|null given.
```

Kalau tetap dijalankan, PHP melempar `TypeError` saat baris itu dieksekusi. Tangani kasus `null` sebelum memakai nilainya, misalnya dengan operator `??` yang memberi nilai pengganti:

```php
echo strtoupper(findName(2) ?? 'tidak ditemukan') . PHP_EOL;
```

Sekarang `composer check` lulus dan outputnya `TIDAK DITEMUKAN`.

Sama seperti di Rust, kamu tidak bisa memakai isi `Option` tanpa menangani `None` lebih dulu. Bedanya, di PHP yang memaksa adalah PHPStan, bukan bahasanya.
:::

### 3. Posisi `declare`

Pindahkan baris `declare(strict_types=1);` ke bawah fungsi `greet`, lalu jalankan `php src/hello.php`. Apa yang terjadi?

::: details Jawaban
PHP berhenti sebelum menjalankan apa pun:

```text
Fatal error: strict_types declaration must be the very first statement in the script
```

Kembalikan baris itu ke posisi semula.
:::
