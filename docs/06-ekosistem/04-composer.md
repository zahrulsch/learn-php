# Composer, ekstensi, dan PSR

## Composer lebih dalam

Kamu sudah memakai Composer untuk tiga hal: memasang paket, membuat autoloader, dan menjalankan script. Bagian ini melengkapi gambarannya.

### Padanan perintah

| Keperluan | Cargo | npm | Composer |
|---|---|---|---|
| Membuat manifest | `cargo init` | `npm init` | `composer init` |
| Menambah dependency | `cargo add serde` | `npm install zod` | `composer require vendor/package` |
| Menambah dependency dev | `cargo add --dev x` | `npm install -D x` | `composer require --dev vendor/package` |
| Menghapus dependency | `cargo remove x` | `npm uninstall x` | `composer remove vendor/package` |
| Memasang sesuai lockfile | `cargo build --locked` | `npm ci` | `composer install` |
| Menaikkan versi dalam batas constraint | `cargo update` | `npm update` | `composer update` |
| Melihat yang terpasang | `cargo tree` | `npm ls` | `composer show` |
| Mencari versi yang lebih baru | plugin `cargo-outdated` | `npm outdated` | `composer outdated` |
| Memeriksa celah keamanan | plugin `cargo-audit` | `npm audit` | `composer audit` |
| Kenapa paket ini terpasang | `cargo tree -i x` | `npm why x` | `composer why vendor/package` |
| Menjalankan script | tidak ada bawaan | `npm run x` | `composer x` |

Nama paket di Composer selalu dua bagian, `vendor/package`, seperti scope di npm tetapi wajib. Registry-nya adalah packagist.org.

### Constraint versi

| Constraint | Versi yang diizinkan |
|---|---|
| `^2.3` | 2.3.0 ke atas, di bawah 3.0.0 |
| `^0.3` | 0.3.0 ke atas, di bawah 0.4.0 |
| `~2.3` | 2.3.0 ke atas, di bawah 3.0.0 |
| `~2.3.1` | 2.3.1 ke atas, di bawah 2.4.0 |
| `2.3.*` | 2.3.0 ke atas, di bawah 2.4.0 |
| `2.3.6` | Tepat versi itu |

Arti caret sama dengan di Cargo dan npm. `composer require` menuliskan caret untukmu, seperti `"phpstan/phpstan": "^2.3"` di [Bab 1](/01-setup).

### `composer.lock`, `install`, dan `update`

`composer.json` berisi rentang versi yang kamu izinkan. `composer.lock` berisi versi persis yang terpilih, untuk semua paket termasuk dependency dari dependency. Dua perintah memperlakukannya berbeda:

- **`composer install`** memasang persis isi lockfile. Dipakai setelah clone, dan di server.
- **`composer update`** menghitung ulang versi terbaru yang masih masuk constraint, lalu menulis ulang lockfile. Dipakai saat kamu memang ingin naik versi.

```bash
composer install
```

```text
Installing dependencies from lock file (including require-dev)
Verifying lock file contents can be installed on current platform.
Nothing to install, update or remove
Generating autoload files
```

Sama seperti `Cargo.lock` pada aplikasi, `composer.lock` ikut di-commit. Folder `vendor/` tidak.

### `require` dan `require-dev`

Paket di `require-dev` hanya dibutuhkan saat development: PHPStan, PHPUnit, Pint. Di server, paket itu tidak dipasang, lewat opsi `--no-dev`. Opsi `--dry-run` memperlihatkan apa yang akan terjadi tanpa benar-benar melakukannya:

```bash
composer install --no-dev --dry-run
```

```text
Installing dependencies from lock file
Verifying lock file contents can be installed on current platform.
Package operations: 0 installs, 0 updates, 28 removals
  - Removing staabm/side-effects-detector (1.0.5)
  - Removing sebastian/version (7.1.0)
  ...
```

Tiga paket dev yang kamu minta membawa 28 paket secara keseluruhan. Tidak satu pun ikut ke production, karena proyek ini memang belum punya dependency runtime.

### Script

Tiga script di `composer.json` sekarang menjadi tiga perintah: `composer check`, `composer test`, dan `composer format`. Dua hal yang perlu diketahui:

- **`vendor/bin` otomatis masuk PATH** selama script berjalan, jadi cukup tulis `phpstan`, bukan `vendor/bin/phpstan`.
- **Nama script menjadi nama perintah.** Hindari nama yang sudah dipakai Composer sendiri, seperti `install` atau `update`.

### Syarat platform

`"php": "^8.5"` di `composer.json` bukan paket, melainkan syarat terhadap lingkungan. Ekstensi PHP bisa disyaratkan dengan cara yang sama, memakai awalan `ext-`. Composer menolak bekerja kalau syaratnya tidak terpenuhi:

```bash
composer require "ext-pdo_mysql:*"
```

```text
...
Your requirements could not be resolved to an installable set of packages.

  Problem 1
    - Root composer.json requires PHP extension ext-pdo_mysql * but it is missing from your system. Install or enable
PHP's pdo_mysql extension.
...
Installation failed, reverting ./composer.json and ./composer.lock to their original content.
```

Untuk memeriksa apakah lingkungan saat ini memenuhi syarat semua paket yang terpasang:

```bash
composer check-platform-reqs
```

```text
Checking platform requirements for packages in the vendor dir
ext-dom       20031129   success
ext-filter    8.5.12     success
ext-json      8.5.12     success
ext-libxml    8.5.12     success
ext-mbstring  8.5.12     success
ext-phar      8.5.12     success
ext-tokenizer 8.5.12     success
ext-xml       8.5.12     success
ext-xmlwriter 8.5.12     success
php           8.5.12     success
```

Ini akan penting saat deploy: versi PHP dan ekstensi di hosting harus memenuhi syarat yang sama dengan container tempat kamu mengembangkan.

### Memeriksa dependency

```bash
composer show --direct
```

```text
laravel/pint    1.32.3 An opinionated code formatter for PHP.
phpstan/phpstan 2.3.6  PHPStan - PHP Static Analysis Tool
phpunit/phpunit 13.4.7 The PHP Unit Testing framework.
```

```bash
composer outdated --direct
```

```text
All your direct dependencies are up to date
```

```bash
composer audit
```

```text
No security vulnerability advisories found.
```

```bash
composer why sebastian/diff
```

```text
phpunit/phpunit      13.4.7 requires sebastian/diff (^9.0.1)
sebastian/comparator 8.4.0  requires sebastian/diff (^9.0)
```

## Ekstensi PHP

Sebagian kemampuan PHP tidak ditulis dalam PHP, melainkan dalam C sebagai ekstensi yang dimuat interpreter. Perannya mirip native addon di Node atau crate `-sys` di Rust. Daftar yang aktif bisa dilihat dengan `php -m`:

```bash
php -m
```

```text
[PHP Modules]
Core ctype curl date dom fileinfo filter hash iconv json lexbor libxml
mbstring mysqlnd openssl pcre PDO pdo_sqlite Phar posix random readline
Reflection session SimpleXML sodium SPL sqlite3 standard tokenizer uri xml
xmlreader xmlwriter Zend OPcache zlib
```

Daftar di atas adalah bawaan image `php:8.5-cli`, dirapatkan supaya ringkas. Fungsi seperti `mb_strlen()` berasal dari `mbstring`, dan akses database lewat `PDO` dipakai di [Bab 7](/07-web-tanpa-framework/).

Ekstensi yang belum ada ditambahkan saat membangun image. Image resmi PHP menyediakan perintah `docker-php-ext-install` untuk itu. Contohnya driver MySQL:

```dockerfile
RUN docker-php-ext-install pdo_mysql
```

Setelah image dibangun ulang, `pdo_mysql` muncul di `php -m`, dan syarat `ext-pdo_mysql` yang tadi ditolak Composer menjadi terpenuhi. Kamu akan memakai cara ini lagi saat proyek membutuhkan database selain SQLite.

## Peta PSR

PSR (PHP Standards Recommendation) adalah standar yang disepakati antarproyek PHP. Sebagian besar berupa interface bersama, mirip crate di Rust yang isinya hanya trait supaya library yang berbeda bisa saling dipasang.

| Standar | Isinya | Kamu bertemu di mana |
|---|---|---|
| PSR-4 | Autoload: namespace ke path file | Bab ini |
| PSR-12, lalu PER Coding Style | Gaya penulisan kode | Preset Pint di bab ini |
| PSR-3 | Interface logger | Logging di Laravel |
| PSR-7, 15, 17, 18 | Pesan HTTP, middleware, HTTP client | Library HTTP |
| PSR-11 | Interface container dependency injection | Service container Laravel |
| PSR-6, PSR-16 | Interface cache | Cache di Laravel |
| PSR-14 | Event dispatcher | Library event |
| PSR-20 | Interface jam | Kode yang perlu diuji terhadap waktu |

Kamu tidak perlu menghafal nomornya. Cukup tahu bahwa ketika sebuah library menyebut "PSR-3 compatible", artinya ia bisa dipasang ke logger apa pun yang mengikuti interface yang sama.

## Alur kerja lengkap

Mulai bab ini ada tiga perintah yang dijalankan sebelum sebuah perubahan dianggap selesai:

1. `composer format` untuk merapikan kode.
2. `composer check` untuk memeriksa tipe.
3. `composer test` untuk memeriksa perilaku.

Padanannya di Rust adalah `cargo fmt`, `cargo check`, dan `cargo test`.

## Ringkasan

- **Namespace hanyalah awalan nama.** Ia tidak memuat file dan tidak memberi privasi. `use` hanya membuat alias.
- **Fungsi dan konstanta jatuh ke namespace global, class tidak.** Class bawaan PHP perlu `use` atau backslash di depan.
- **Autoload memuat class saat pertama kali dipakai.** PSR-4 memetakan awalan namespace ke folder, dan Composer membuat autoloader-nya.
- **Fungsi tidak bisa di-autoload** dan harus didaftarkan di entri `files`.
- **`composer install` mengikuti lockfile, `composer update` menulis ulang lockfile.** `require-dev` tidak ikut ke production.
- **Syarat `php` dan `ext-*`** membuat Composer menolak lingkungan yang tidak cocok.
- **Pint, PHPStan, dan PHPUnit** adalah padanan `cargo fmt`, `cargo check`, dan `cargo test`.

## Latihan

### 1. Menyelesaikan nama

Tanpa menjalankannya, tentukan output lima baris `echo` di file ini. Baris mana yang dilaporkan PHPStan?

```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart as Trolley;

echo Money\Rupiah::class . PHP_EOL;
echo Trolley::class . PHP_EOL;
echo \Exception::class . PHP_EOL;
echo Exception::class . PHP_EOL;
echo strtoupper('halo') . PHP_EOL;
```

::: details Jawaban
```text
Learn\Ch06\Money\Rupiah
Learn\Ch06\Cart\Cart
Exception
Learn\Ch06\Exception
HALO
```

- **Baris 1**: nama qualified, relatif terhadap namespace file.
- **Baris 2**: alias dari `use ... as`.
- **Baris 3**: backslash di depan berarti namespace global.
- **Baris 4**: tanpa `use`, nama class dianggap milik namespace file. Class itu tidak ada, tetapi `::class` tidak memuat class, jadi PHP tidak mengeluh. PHPStan melaporkannya: `Class Learn\Ch06\Exception not found.`
- **Baris 5**: fungsi jatuh ke namespace global.
:::

### 2. Class baru beserta test-nya

Buat class `Discount` di namespace `Learn\Ch06\Money`:

- Constructor menerima `int $percent` dan menolak nilai di luar 0 sampai 100 dengan `InvalidArgumentException`.
- Method `apply(Rupiah $price): Rupiah` mengembalikan harga setelah diskon, dibulatkan ke bawah.

Tulis test-nya dengan data provider untuk kasus 0%, 10%, 100%, dan satu kasus pembulatan. `composer format`, `composer check`, dan `composer test` harus lulus.

::: details Jawaban
`src/Ch06/Money/Discount.php`:

<!-- file: src/Ch06/Money/Discount.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06\Money;

use InvalidArgumentException;

final readonly class Discount
{
    public function __construct(public int $percent)
    {
        if ($percent < 0 || $percent > 100) {
            throw new InvalidArgumentException("Persen harus 0 sampai 100, diberikan {$percent}");
        }
    }

    public function apply(Rupiah $price): Rupiah
    {
        return new Rupiah(intdiv($price->amount * (100 - $this->percent), 100));
    }
}
```

`tests/Ch06/DiscountTest.php`:

<!-- file: tests/Ch06/DiscountTest.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Tests\Ch06;

use InvalidArgumentException;
use Learn\Ch06\Money\Discount;
use Learn\Ch06\Money\Rupiah;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DiscountTest extends TestCase
{
    #[DataProvider('discountExamples')]
    public function test_apply(int $percent, int $price, int $expected): void
    {
        self::assertSame($expected, new Discount($percent)->apply(new Rupiah($price))->amount);
    }

    /** @return iterable<string, array{int, int, int}> */
    public static function discountExamples(): iterable
    {
        yield 'tanpa diskon' => [0, 20_000, 20_000];
        yield 'sepuluh persen' => [10, 20_000, 18_000];
        yield 'gratis' => [100, 20_000, 0];
        yield 'dibulatkan ke bawah' => [15, 999, 849];
    }

    public function test_percent_out_of_range_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new Discount(101);
    }
}
```

`intdiv` menjaga hasilnya tetap `int`. Operator `/` bisa menghasilkan `float`, yang ditolak constructor `Rupiah`.

Nama file harus `Discount.php` dengan D besar. Dengan `discount.php`, semuanya tetap lulus di container tetapi gagal di server Linux, seperti dijelaskan di bagian PSR-4.
:::

### 3. `install` atau `update`

Untuk tiap situasi, perintah mana yang dipakai, dan kenapa?

1. Kamu baru meng-clone proyek ini di laptop lain.
2. `composer audit` melaporkan celah di PHPUnit, dan versi perbaikannya masih di dalam `^13.4`.
3. Server production menarik kode terbaru.

::: details Jawaban
1. **`composer install`**. Lockfile sudah ada, dan kamu ingin versi yang persis sama dengan yang sudah teruji.
2. **`composer update phpunit/phpunit`**. Kamu memang ingin versi baru, dan menyebut nama paketnya membatasi perubahan ke paket itu. Setelah itu jalankan `composer test`, lalu commit lockfile yang baru.
3. **`composer install --no-dev`**. Server tidak boleh memilih versi sendiri, dan tidak membutuhkan alat development.
:::
