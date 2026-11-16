# 6. Ekosistem

Sampai [Bab 5](/05-error-handling) kamu menulis file-file lepas yang dijalankan satu per satu. Bab ini merangkainya menjadi proyek sungguhan: nama diatur dengan namespace, file dimuat otomatis lewat autoload, kode dirapikan formatter, perilakunya dijaga test, dan dependency dikelola Composer.

Di Rust hampir semua itu diurus Cargo. Di PHP perannya terbagi ke beberapa alat, dengan Composer sebagai pusatnya.

## Persiapan

Lanjutkan di proyek `latihan/php-dasar` dan masuk ke shell container seperti biasa. Contoh bab ini adalah keranjang belanja kecil yang terdiri dari empat class, masing-masing di file sendiri:

```text
src/Bab06/
├── Uang/
│   └── Rupiah.php
└── Keranjang/
    ├── Item.php
    ├── JumlahTidakValid.php
    └── Keranjang.php
```

Buat `src/Bab06/Uang/Rupiah.php`:

<!-- file: src/Bab06/Uang/Rupiah.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06\Uang;

use InvalidArgumentException;

final readonly class Rupiah
{
    public function __construct(public int $jumlah)
    {
        if ($jumlah < 0) {
            throw new InvalidArgumentException("Jumlah tidak boleh negatif: {$jumlah}");
        }
    }

    public function tambah(self $lain): self
    {
        return new self($this->jumlah + $lain->jumlah);
    }

    public function kali(int $pengali): self
    {
        return new self($this->jumlah * $pengali);
    }

    public function format(): string
    {
        return 'Rp' . number_format($this->jumlah, 0, ',', '.');
    }
}
```

Buat `src/Bab06/Keranjang/JumlahTidakValid.php`:

<!-- file: src/Bab06/Keranjang/JumlahTidakValid.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06\Keranjang;

use InvalidArgumentException;

final class JumlahTidakValid extends InvalidArgumentException
{
}
```

Buat `src/Bab06/Keranjang/Item.php`:

<!-- file: src/Bab06/Keranjang/Item.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06\Keranjang;

use Belajar\Bab06\Uang\Rupiah;

final readonly class Item
{
    public function __construct(
        public string $nama,
        public Rupiah $harga,
        public int $jumlah,
    ) {
        if ($jumlah < 1) {
            throw new JumlahTidakValid("Jumlah {$nama} minimal 1, diberikan {$jumlah}");
        }
    }

    public function subtotal(): Rupiah
    {
        return $this->harga->kali($this->jumlah);
    }
}
```

Buat `src/Bab06/Keranjang/Keranjang.php`:

<!-- file: src/Bab06/Keranjang/Keranjang.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06\Keranjang;

use Belajar\Bab06\Uang\Rupiah;

final class Keranjang
{
    /** @var list<Item> */
    private array $item = [];

    public function tambah(Item $item): void
    {
        $this->item[] = $item;
    }

    public function total(): Rupiah
    {
        return array_reduce(
            $this->item,
            static fn (Rupiah $total, Item $item): Rupiah => $total->tambah($item->subtotal()),
            new Rupiah(0),
        );
    }

    public function jumlahItem(): int
    {
        return count($this->item);
    }
}
```

Nama folder dan nama file sengaja dibuat sama persis dengan nama namespace dan nama class, termasuk huruf besar-kecilnya. Alasannya muncul di bagian autoload.

## Namespace

### Namespace hanyalah awalan nama

Baris `namespace Belajar\Bab06\Uang;` membuat nama lengkap class di file itu menjadi `Belajar\Bab06\Uang\Rupiah`. Hanya itu yang dilakukannya. Namespace tidak memuat file, tidak mengatur siapa boleh mengakses apa, dan tidak terikat ke folder.

| | Rust | TypeScript | PHP |
|---|---|---|---|
| Satuannya | Modul (`mod`) | File | Awalan nama |
| Terikat ke file | Ya, oleh compiler | Ya, satu file satu modul | Tidak. Yang mengikatnya hanya konvensi PSR-4 |
| Visibilitas | `pub`, `pub(crate)`, privat | `export` atau tidak | Tidak ada. Semua nama publik |
| Arti `use` / `import` | Alias nama | Memuat file lalu mengikat nama | Alias nama saja, tidak memuat apa pun |

Aturan penulisannya:

- **Satu file, satu `namespace`**, ditulis tepat setelah `declare(strict_types=1);`.
- **Pemisahnya backslash**, bukan `::` atau `/`.
- **Yang diberi awalan** adalah class, interface, trait, enum, fungsi, dan konstanta. Variabel tidak.

### Menyebut nama dari tempat lain

Ada tiga cara menulis nama, dan PHP mengartikannya berbeda:

| Bentuk | Contoh di file ber-namespace `Belajar\Bab06` | Diartikan sebagai |
|---|---|---|
| Fully qualified | `\Belajar\Bab06\Uang\Rupiah` | Persis nama itu |
| Qualified | `Uang\Rupiah` | Relatif terhadap namespace file: `Belajar\Bab06\Uang\Rupiah` |
| Unqualified | `Rupiah` | Alias dari `use` kalau ada. Kalau tidak ada: `Belajar\Bab06\Rupiah` |

`use` mendaftarkan alias supaya nama pendek bisa dipakai. Bentuk-bentuknya:

```php
use Belajar\Bab06\Uang\Rupiah;                  // class
use Belajar\Bab06\Keranjang\Keranjang as Troli; // dengan nama lain
use Belajar\Bab06\Keranjang\{Item, Keranjang};  // beberapa sekaligus

use function Belajar\Bab06\rupiah;              // fungsi
```

Untuk konstanta ada `use const`. Class yang berada di namespace yang sama tidak perlu `use`: itu sebabnya `Item.php` bisa menulis `JumlahTidakValid` begitu saja.

Buat file coba-coba `src/Bab06/coba.php` untuk melihat hasil penyelesaian nama. `::class` mengembalikan nama lengkap sebuah class sebagai string:

```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Keranjang as Troli;
use Belajar\Bab06\Uang\Rupiah;

echo Rupiah::class . PHP_EOL;
echo Troli::class . PHP_EOL;
echo __NAMESPACE__ . PHP_EOL;
echo \strlen('abc') . PHP_EOL;
```

```bash
php src/Bab06/coba.php
```

```text
Belajar\Bab06\Uang\Rupiah
Belajar\Bab06\Keranjang\Keranjang
Belajar\Bab06
3
```

Script ini jalan walaupun file `Rupiah.php` dan `Keranjang.php` belum dimuat sama sekali. `::class` diselesaikan dari teks kode, tanpa menyentuh class-nya. Kamu akan sering melihatnya di Laravel, misalnya `User::class`, sebagai cara menyebut class tanpa menulis string dengan tangan.

### Jebakan: class bawaan PHP

Semua class bawaan PHP ada di namespace global. Timpa `coba.php`:

```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

echo strlen('halo') . PHP_EOL;
echo PHP_VERSION . PHP_EOL;

$tanggal = new DateTimeImmutable('2026-11-16');
echo $tanggal->format('Y-m-d') . PHP_EOL;
```

```text
4
8.5.12

Fatal error: Uncaught Error: Class "Belajar\Bab06\DateTimeImmutable" not found in /app/src/Bab06/coba.php:10
```

Fungsi `strlen` dan konstanta `PHP_VERSION` ditemukan, tetapi class `DateTimeImmutable` tidak. Aturannya asimetris:

- **Fungsi dan konstanta**: kalau tidak ada di namespace saat ini, PHP mencarinya di namespace global.
- **Class**: tidak ada pencarian ke global. Nama tanpa `use` selalu dianggap milik namespace saat ini.

Karena itu `Rupiah.php` menulis `use InvalidArgumentException;`. Pilihan lainnya adalah menulis `\InvalidArgumentException` dengan backslash di depan, seperti yang kamu lihat sejak [Bab 2](/02-type-system).

PHPStan menangkap kesalahan ini tanpa menjalankan kodenya:

```bash
composer check
```

```text
 ------ ----------------------------------------------------------------------
  Line   src/Bab06/coba.php
 ------ ----------------------------------------------------------------------
  10     Instantiated class Belajar\Bab06\DateTimeImmutable not found.
         🪪  class.notFound
         💡  Learn more at https://phpstan.org/user-guide/discovering-symbols
  11     Binary operation "." between mixed and "\n"|"\r\n" results in an
         error.
         🪪  binaryOp.invalid
  11     Call to method format() on an unknown class
         Belajar\Bab06\DateTimeImmutable.
         🪪  class.notFound
         💡  Learn more at https://phpstan.org/user-guide/discovering-symbols
 ------ ----------------------------------------------------------------------

 [ERROR] Found 3 errors
```

Hapus `coba.php` sebelum lanjut.

### Tidak ada privasi tingkat modul

PHP tidak punya padanan `pub(crate)` atau nama yang tidak di-`export`. Setiap class dan fungsi bisa dipakai dari file mana pun, selama nama lengkapnya diketahui. Yang bisa disembunyikan hanya isi class, lewat `private` dan `protected`.

Konvensinya adalah menandai sesuatu dengan `@internal` di PHPDoc:

```php
/** @internal */
final class Pembulat
{
    // ...
}
```

Yang kamu dapat dari tanda itu terbatas:

- **Bagi PHP**: tidak ada. Itu hanya komentar.
- **Bagi PHPStan dengan konfigurasi bawaan**: juga tidak ada. Pemakaian `Pembulat` dari namespace mana pun lolos.
- **Bagi PHPStan dengan bleeding edge**: pemakaian dari luar *root namespace* dilaporkan. Root namespace adalah segmen pertama nama, di sini `Belajar`.

Bleeding edge adalah kumpulan aturan PHPStan versi berikutnya, yang dinyalakan dengan menambahkan `includes` ke `phpstan.neon`:

```yaml
includes:
    - phar://phpstan.phar/conf/bleedingEdge.neon
```

Dengan itu, kode di namespace `Toko\Kasir` yang memakai `Pembulat` dilaporkan begini:

```text
  9      Instantiation of internal class Belajar\Bab06\Uang\Pembulat.
         🪪  new.internalClass
  10     Call to internal method Belajar\Bab06\Uang\Pembulat::keRatusan() from
         outside its root namespace Belajar.
         🪪  method.internal
```

Jadi `@internal` melindungi batas antar paket, bukan batas antar modul di dalam satu aplikasi. Di materi ini bleeding edge tidak dinyalakan.

## Memuat file

Namespace mengatur nama, tetapi belum ada yang memuat file. Bagian ini melewati tiga tahap, dari yang paling manual sampai yang dipakai semua proyek PHP modern.

### `require` dengan tangan

Buat `src/Bab06/manual.php`:

<!-- file: src/Bab06/manual.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Item;
use Belajar\Bab06\Keranjang\Keranjang;
use Belajar\Bab06\Uang\Rupiah;

require_once __DIR__ . '/Uang/Rupiah.php';
require_once __DIR__ . '/Keranjang/Item.php';
require_once __DIR__ . '/Keranjang/Keranjang.php';

$keranjang = new Keranjang();
$keranjang->tambah(new Item('Kopi', new Rupiah(18_000), 2));
$keranjang->tambah(new Item('Roti', new Rupiah(12_500), 1));

echo $keranjang->total()->format() . PHP_EOL;
```

```bash
php src/Bab06/manual.php
```

```text
Rp48.500
```

`require` menjalankan isi file lain di tempat itu, mirip `#include` di C. Ada empat variannya:

| | Kalau file tidak ada | Kalau sudah pernah dimuat |
|---|---|---|
| `require` | Fatal error | Dimuat lagi |
| `require_once` | Fatal error | Dilewati |
| `include` | Warning, lalu lanjut | Dimuat lagi |
| `include_once` | Warning, lalu lanjut | Dilewati |

Script di atas jalan, tetapi ada satu file yang lupa dimuat: `JumlahTidakValid.php`. Kesalahannya baru terlihat ketika jalur error dilewati. Ganti jumlah `Kopi` menjadi `0`:

```text
Fatal error: Uncaught Error: Class "Belajar\Bab06\Keranjang\JumlahTidakValid" not found in /app/src/Bab06/Keranjang/Item.php:17
```

Yang seharusnya muncul adalah exception `JumlahTidakValid` dengan pesan yang jelas. Yang muncul malah error bahwa class exception-nya sendiri tidak ditemukan. Inilah masalah `require` manual: daftar file harus dijaga dengan tangan, dan yang terlupa baru ketahuan saat runtime. Kembalikan jumlahnya ke `2`.

### Autoload buatan sendiri

PHP menyediakan jalan keluar: daftarkan sebuah fungsi yang dipanggil setiap kali PHP bertemu class yang belum dikenalnya. Fungsi itu yang bertugas memuat filenya.

Buat `src/Bab06/autoload-sendiri.php`:

<!-- file: src/Bab06/autoload-sendiri.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Item;
use Belajar\Bab06\Keranjang\Keranjang;
use Belajar\Bab06\Uang\Rupiah;

spl_autoload_register(static function (string $kelas): void {
    $awalan = 'Belajar\\';

    if (!str_starts_with($kelas, $awalan)) {
        return;
    }

    // Belajar\Bab06\Uang\Rupiah menjadi src/Bab06/Uang/Rupiah.php
    $file = __DIR__ . '/../' . str_replace('\\', '/', substr($kelas, strlen($awalan))) . '.php';

    echo "  [autoload] {$kelas}" . PHP_EOL;

    if (is_file($file)) {
        require $file;
    }
});

echo 'Mulai' . PHP_EOL;
$keranjang = new Keranjang();

echo 'Keranjang dibuat' . PHP_EOL;
$keranjang->tambah(new Item('Kopi', new Rupiah(18_000), 2));

echo $keranjang->total()->format() . PHP_EOL;
```

```bash
php src/Bab06/autoload-sendiri.php
```

```text
Mulai
  [autoload] Belajar\Bab06\Keranjang\Keranjang
Keranjang dibuat
  [autoload] Belajar\Bab06\Keranjang\Item
  [autoload] Belajar\Bab06\Uang\Rupiah
Rp36.000
```

Dua hal terlihat dari outputnya:

- **Tidak ada lagi daftar `require`.** Nama class diterjemahkan menjadi path file lewat satu aturan.
- **Pemuatannya malas.** `Item.php` baru dibaca saat `new Item` dieksekusi, bukan di awal. `JumlahTidakValid.php` tidak dibaca sama sekali karena tidak pernah dibutuhkan.

Sifat malas itu cocok dengan cara PHP dijalankan: setiap request hanya membayar biaya file yang benar-benar dipakainya.

### PSR-4 lewat Composer

Aturan penerjemahan di atas (awalan namespace dipetakan ke folder, sisanya menjadi path) sudah dibakukan dengan nama **PSR-4**, dan Composer bisa membuatkan autoloader-nya. Tambahkan bagian `autoload` ke `composer.json`:

```json
"autoload": {
    "psr-4": {
        "Belajar\\": "src/"
    }
}
```

Lalu minta Composer membuat ulang autoloader:

```bash
composer dump-autoload
```

```text
Generating autoload files
Generated autoload files
```

Hasilnya ada di `vendor/composer/`. Isi `autoload_psr4.php` persis pemetaan yang kamu tulis:

```php
return array(
    'Belajar\\' => array($baseDir . '/src'),
);
```

Sekarang cukup satu `require` di titik masuk program. Buat `src/Bab06/belanja.php`:

```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Item;
use Belajar\Bab06\Keranjang\Keranjang;
use Belajar\Bab06\Uang\Rupiah;

require __DIR__ . '/../../vendor/autoload.php';

$keranjang = new Keranjang();
$keranjang->tambah(new Item('Kopi', new Rupiah(18_000), 2));
$keranjang->tambah(new Item('Roti', new Rupiah(12_500), 1));

echo $keranjang->total()->format() . PHP_EOL;
```

```bash
php src/Bab06/belanja.php
```

```text
Rp48.500
```

`vendor/autoload.php` juga memuat semua paket yang dipasang Composer. Jadi satu baris itu membuka akses ke kodemu sendiri dan ke seluruh dependency.

Supaya PSR-4 bekerja, tiga aturan harus dipatuhi:

- **Satu class per file.**
- **Nama file sama dengan nama class**, ditambah `.php`.
- **Folder mengikuti sisa namespace** setelah awalan yang dipetakan.

File-file dari Bab 2 sampai 5 tidak mengikuti aturan itu, dan tidak apa-apa. File itu dijalankan langsung, tidak pernah dimuat lewat autoload.

::: warning Huruf besar-kecil: jalan di container, gagal di server
Folder proyekmu berada di Windows dan di-mount ke container, sehingga sistem file di dalam container ikut tidak membedakan huruf besar-kecil. Class `Diskon` yang disimpan di file `diskon.php` tetap ditemukan di mesinmu. Di server Linux, file itu tidak ditemukan.

Composer bisa memeriksanya tanpa bergantung pada sistem file:

```bash
composer dump-autoload --optimize --strict-psr
```

```text
Generating optimized autoload files
Class Belajar\Bab06\Uang\Diskon located in ./src/Bab06/Uang/diskon.php does not comply with psr-4 autoloading standard
(rule: Belajar\ => ./src). Skipping.
```

Perintah itu berakhir dengan exit code 1 kalau ada pelanggaran. Di proyek latihan ini, file bab sebelumnya yang menaruh class di file bernama lain akan ikut disebut. Jalankan `composer dump-autoload` biasa sesudahnya untuk kembali ke autoloader normal.
:::

### Fungsi tidak ikut di-autoload

Autoload hanya berlaku untuk class, interface, trait, dan enum. PHP tidak punya mekanisme serupa untuk fungsi.

Buat `src/Bab06/fungsi.php`, berisi satu fungsi pembantu supaya membuat `Rupiah` lebih ringkas:

<!-- file: src/Bab06/fungsi.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Uang\Rupiah;

function rupiah(int $jumlah): Rupiah
{
    return new Rupiah($jumlah);
}
```

Ubah `belanja.php` supaya memakainya. Baris `use Belajar\Bab06\Uang\Rupiah;` tidak lagi dibutuhkan:

<!-- file: src/Bab06/belanja.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Item;
use Belajar\Bab06\Keranjang\Keranjang;

require __DIR__ . '/../../vendor/autoload.php';

$keranjang = new Keranjang();
$keranjang->tambah(new Item('Kopi', rupiah(18_000), 2));
$keranjang->tambah(new Item('Roti', rupiah(12_500), 1));

echo $keranjang->total()->format() . PHP_EOL;
```

```text
Fatal error: Uncaught Error: Call to undefined function Belajar\Bab06\rupiah() in /app/src/Bab06/belanja.php:13
```

File berisi fungsi harus didaftarkan satu per satu di entri `files`. Composer memuat semua file di daftar itu setiap kali `vendor/autoload.php` dijalankan:

```json
"autoload": {
    "psr-4": {
        "Belajar\\": "src/"
    },
    "files": [
        "src/Bab06/fungsi.php"
    ]
}
```

```bash
composer dump-autoload
php src/Bab06/belanja.php
```

```text
Rp48.500
```

Karena file di `files` selalu dimuat, dipakai atau tidak, isinya sebaiknya sedikit. Ini salah satu alasan kode PHP modern lebih banyak memakai method di class daripada fungsi lepas. Laravel memakai entri `files` yang sama untuk fungsi pembantunya seperti `config()` dan `route()`.

## Formatter: Pint

Pint adalah formatter kode buatan tim Laravel, padanan `rustfmt` atau Prettier. Ia bisa dipakai di proyek PHP apa pun.

```bash
composer require --dev laravel/pint
```

Buat `pint.json` di folder proyek:

```json
{
    "preset": "per",
    "rules": {
        "declare_strict_types": true,
        "function_declaration": {
            "closure_fn_spacing": "one"
        },
        "single_line_empty_body": false
    }
}
```

Pilihan di file itu:

- **`"preset": "per"`** memakai PER Coding Style, standar gaya dari komunitas PHP, yang sesuai dengan gaya kode di materi ini.
- **`"declare_strict_types": true`** membuat Pint menambahkan `declare(strict_types=1);` ke file yang belum punya. Ketentuan yang selama ini kamu jaga dengan tangan sekarang dijaga alat.
- **Dua aturan terakhir** menyimpang dari PER di dua tempat, supaya sama dengan gaya yang dipakai sejak [Bab 1](/01-setup) dan dengan gaya Laravel: `fn (` ditulis dengan spasi, dan badan class atau method yang kosong tidak dipadatkan menjadi `{}`.

Untuk melihat kerjanya, buat file yang sengaja berantakan, `src/Bab06/Berantakan.php`:

```php
<?php
namespace Belajar\Bab06;
use InvalidArgumentException;
use Belajar\Bab06\Uang\Rupiah;
class Berantakan {
    function diskon(Rupiah $harga,int $persen) : Rupiah
    {
        if($persen<0||$persen>100){ throw new InvalidArgumentException("Persen tidak valid"); }
        return new Rupiah(intdiv($harga->jumlah*(100-$persen),100));
    }
}
```

`--test` memeriksa tanpa mengubah file, dan `-v` menampilkan perbedaannya:

```bash
vendor/bin/pint --test -v src/Bab06/Berantakan.php
```

```text
  ⨯ src/Bab06/Berantakan.php modifier_keywords, class_definition, single_space
  @@ -1,11 +1,19 @@
   <?php
  +
  +declare(strict_types=1);
  +
   namespace Belajar\Bab06;
  +
   use InvalidArgumentException;
   use Belajar\Bab06\Uang\Rupiah;
  -class Berantakan {
  -    function diskon(Rupiah $harga,int $persen) : Rupiah
  +
  +class Berantakan
  +{
  +    public function diskon(Rupiah $harga, int $persen): Rupiah
       {
  -        if($persen<0||$persen>100){ throw new InvalidArgumentException("Persen tidak valid"); }
  -        return new Rupiah(intdiv($harga->jumlah*(100-$persen),100));
  +        if ($persen < 0 || $persen > 100) {
  +            throw new InvalidArgumentException("Persen tidak valid");
  +        }
  +        return new Rupiah(intdiv($harga->jumlah * (100 - $persen), 100));
       }
   }
```

Selain merapikan spasi dan kurung, Pint menambahkan `declare(strict_types=1);` dan menulis `public` yang sebelumnya tersirat. Hapus file itu, lalu daftarkan Pint sebagai script di `composer.json`:

```json
"scripts": {
    "check": "phpstan analyse",
    "format": "pint"
}
```

```bash
composer format
```

Tanpa argumen, Pint merapikan seluruh proyek. Kalau file dari bab sebelumnya kamu ketik persis seperti di materi, tidak ada yang berubah, karena `pint.json` di atas disetel mengikuti gaya itu. Kalau ada yang berubah, perubahannya hanya gaya, bukan perilaku.

::: info Preset `laravel`
Tanpa `pint.json`, Pint memakai preset `laravel`, yang seleranya sedikit berbeda. Inilah yang diubahnya di `belanja.php`:

```text
-$keranjang = new Keranjang();
+$keranjang = new Keranjang;
...
-echo $keranjang->total()->format() . PHP_EOL;
+echo $keranjang->total()->format().PHP_EOL;
```

Di proyek Laravel, ikuti preset bawaan itu supaya kodemu seragam dengan kode framework.
:::

## Testing dengan PHPUnit

### Pasang dan atur

```bash
composer require --dev phpunit/phpunit
```

Test ditaruh di folder `tests/`, terpisah dari `src/`. Supaya class test ikut di-autoload, tambahkan `autoload-dev` ke `composer.json`. Bedanya dengan `autoload` hanya satu: pemetaan ini tidak dipakai saat paket development tidak dipasang.

```json
"autoload-dev": {
    "psr-4": {
        "Belajar\\Tests\\": "tests/"
    }
}
```

Tambahkan juga script `test`. Seluruh `composer.json` sekarang seperti ini:

```json
{
    "name": "belajar/php-dasar",
    "type": "project",
    "require": {
        "php": "^8.5"
    },
    "require-dev": {
        "phpstan/phpstan": "^2.3",
        "phpunit/phpunit": "^13.4",
        "laravel/pint": "^1.32"
    },
    "autoload": {
        "psr-4": {
            "Belajar\\": "src/"
        },
        "files": [
            "src/Bab06/fungsi.php"
        ]
    },
    "autoload-dev": {
        "psr-4": {
            "Belajar\\Tests\\": "tests/"
        }
    },
    "scripts": {
        "check": "phpstan analyse",
        "test": "phpunit",
        "format": "pint"
    }
}
```

```bash
composer dump-autoload
```

PHPUnit sendiri diatur lewat `phpunit.xml` di folder proyek:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <testsuites>
        <testsuite name="default">
            <directory>tests</directory>
        </testsuite>
    </testsuites>
</phpunit>
```

`bootstrap` menunjuk autoloader Composer, dan `<directory>` menunjuk folder yang dicari. PHPUnit mengambil setiap file berakhiran `Test.php` di dalamnya.

### Test pertama

Buat `tests/Bab06/RupiahTest.php`:

<!-- file: tests/Bab06/RupiahTest.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Tests\Bab06;

use Belajar\Bab06\Uang\Rupiah;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RupiahTest extends TestCase
{
    public function test_tambah_menghasilkan_objek_baru(): void
    {
        $a = new Rupiah(10_000);
        $b = new Rupiah(2_500);

        $hasil = $a->tambah($b);

        self::assertSame(12_500, $hasil->jumlah);
        self::assertSame(10_000, $a->jumlah);
    }

    #[DataProvider('contohFormat')]
    public function test_format(int $jumlah, string $harapan): void
    {
        self::assertSame($harapan, new Rupiah($jumlah)->format());
    }

    /** @return iterable<string, array{int, string}> */
    public static function contohFormat(): iterable
    {
        yield 'nol' => [0, 'Rp0'];
        yield 'ribuan' => [18_000, 'Rp18.000'];
        yield 'jutaan' => [1_250_000, 'Rp1.250.000'];
    }

    public function test_jumlah_negatif_ditolak(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('tidak boleh negatif');

        new Rupiah(-1);
    }
}
```

Buat `tests/Bab06/KeranjangTest.php`:

<!-- file: tests/Bab06/KeranjangTest.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Tests\Bab06;

use Belajar\Bab06\Keranjang\Item;
use Belajar\Bab06\Keranjang\JumlahTidakValid;
use Belajar\Bab06\Keranjang\Keranjang;
use PHPUnit\Framework\TestCase;

use function Belajar\Bab06\rupiah;

final class KeranjangTest extends TestCase
{
    public function test_keranjang_kosong_totalnya_nol(): void
    {
        self::assertSame(0, new Keranjang()->total()->jumlah);
    }

    public function test_total_menjumlahkan_subtotal_tiap_item(): void
    {
        $keranjang = new Keranjang();
        $keranjang->tambah(new Item('Kopi', rupiah(18_000), 2));
        $keranjang->tambah(new Item('Roti', rupiah(12_500), 1));

        self::assertSame(48_500, $keranjang->total()->jumlah);
        self::assertSame(2, $keranjang->jumlahItem());
    }

    public function test_jumlah_nol_ditolak(): void
    {
        $this->expectException(JumlahTidakValid::class);

        new Item('Kopi', rupiah(18_000), 0);
    }
}
```

File kedua berada di namespace `Belajar\Tests\Bab06`, jadi fungsi `rupiah()` harus diimpor dengan `use function`.

```bash
composer test
```

```text
PHPUnit 13.4.7 by Sebastian Bergmann and contributors.

Runtime:       PHP 8.5.12
Configuration: /app/phpunit.xml

........                                                            8 / 8 (100%)

Time: 00:00.056, Memory: 20.00 MB

OK (8 tests, 11 assertions)
```

Opsi `--testdox` mengubah nama method menjadi kalimat, enak dibaca sebagai spesifikasi:

```bash
vendor/bin/phpunit --testdox
```

```text
Keranjang (Belajar\Tests\Bab06\Keranjang)
 ✔ Keranjang kosong totalnya nol
 ✔ Total menjumlahkan subtotal tiap item
 ✔ Jumlah nol ditolak

Rupiah (Belajar\Tests\Bab06\Rupiah)
 ✔ Tambah menghasilkan objek baru
 ✔ Format with nol
 ✔ Format with ribuan
 ✔ Format with jutaan
 ✔ Jumlah negatif ditolak
```

### Dibanding Rust dan TS

| | Rust | TS (Vitest) | PHP (PHPUnit) |
|---|---|---|---|
| Lokasi test | Modul `#[cfg(test)]` di file yang sama, atau `tests/` | File `*.test.ts` | Folder `tests/`, class `*Test` |
| Satu test | Fungsi ber-`#[test]` | `test('...', () => {})` | Method berawalan `test` di turunan `TestCase` |
| Assertion | `assert_eq!(a, b)` | `expect(a).toBe(b)` | `self::assertSame($harapan, $hasil)` |
| Banyak kasus | Loop, atau crate `rstest` | `test.each` | `#[DataProvider]` |
| Mengharapkan error | `#[should_panic]`, atau memeriksa `Err` | `expect(() => ...).toThrow()` | `$this->expectException(...)` |
| Menjalankan | `cargo test` | `vitest` | `composer test` |

Empat hal dari contoh di atas yang perlu diperhatikan:

- **Urutan argumen assertion**: nilai yang diharapkan dulu, baru nilai hasil.
- **Data provider** adalah method `public static` yang menghasilkan daftar argumen. Kuncinya (`'nol'`, `'ribuan'`) menjadi nama kasus di output.
- **`expectException` ditulis sebelum** kode yang melempar, bukan sesudahnya.
- **`new Rupiah($jumlah)->format()`** tanpa kurung tambahan di sekeliling `new` adalah sintaks PHP 8.4 ke atas.

### `assertSame` lawan `assertEquals`

Dua assertion ini berbeda persis seperti `===` dan `==` di [Bab 3](/03-dasar-bahasa). Empat test berikut memperlihatkannya:

```php
public function test_assert_equals_longgar(): void
{
    self::assertEquals('18000', 18_000);
}

public function test_assert_same_ketat(): void
{
    self::assertSame('18000', 18_000);
}

public function test_assert_equals_objek_nilai(): void
{
    self::assertEquals(new Rupiah(100), new Rupiah(100));
}

public function test_assert_same_objek_nilai(): void
{
    self::assertSame(new Rupiah(100), new Rupiah(100));
}
```

```text
There were 2 failures:

1) Belajar\Tests\Bab06\TmpBandingTest::test_assert_same_ketat
Failed asserting that 18000 is identical to '18000'.

2) Belajar\Tests\Bab06\TmpBandingTest::test_assert_same_objek_nilai
Failed asserting that two variables reference the same object.

FAILURES!
Tests: 4, Assertions: 4, Failures: 2.
```

Aturan pakainya:

- **Untuk skalar, selalu `assertSame`.** `assertEquals` menganggap string `'18000'` sama dengan integer `18000`, sehingga test bisa lolos padahal tipenya salah.
- **Untuk objek, `assertSame` membandingkan identitas**: lulus hanya kalau keduanya objek yang sama. Untuk membandingkan isi dua objek nilai, pakai `assertEquals`, atau bandingkan property-nya dengan `assertSame` seperti di `RupiahTest`.

Padanannya di Vitest: `assertSame` adalah `toBe`, dan `assertEquals` mendekati `toEqual`.

### Membaca test yang gagal

Ubah harapan kasus `'ribuan'` menjadi `'Rp18,000'`, lalu jalankan lagi:

```text
There was 1 failure:

1) Belajar\Tests\Bab06\RupiahTest::test_format@ribuan with data (18000, 'Rp18,000')
Failed asserting that two strings are identical.
--- Expected
+++ Actual
@@ @@
-'Rp18,000'
+'Rp18.000'

/app/tests/Bab06/RupiahTest.php:28

FAILURES!
Tests: 8, Assertions: 11, Failures: 1.
```

Outputnya menyebut nama kasus dari data provider, argumen yang dipakai, selisih antara harapan dan hasil, serta baris assertion-nya. Kembalikan harapannya ke `'Rp18.000'`.

### PHPStan juga memeriksa test

Kode test adalah kode juga. Tambahkan `tests` ke `phpstan.neon`:

```yaml
parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - src
        - tests
```

```bash
composer check
```

```text
 [OK] No errors
```

Analisis pertama setelah `tests` ditambahkan terasa lama, sekitar setengah menit di mesin tempat materi ini diuji, karena PHPStan harus membaca kode PHPUnit lewat folder yang di-mount. Analisis berikutnya dalam sesi shell yang sama hanya beberapa detik.

Di level max, data provider pun harus bertipe lengkap. Tanpa PHPDoc `@return` di `contohFormat()`:

```text
  32     Method Belajar\Tests\Bab06\RupiahTest::contohFormat() return type has
         no value type specified in iterable type iterable.
         🪪  missingType.iterableValue
```

Dan kalau isi sebuah kasus tidak cocok dengan tipe yang dijanjikan, misalnya `['0', 'Rp0']`:

```text
  34     Generator expects value type array{int, string}, array{'0', 'Rp0'}
         given.
         🪪  generator.valueType
         💡  Offset 0 (int) does not accept type string.
```

Kesalahan data test tertangkap sebelum test dijalankan.

## Composer lebih dalam

Kamu sudah memakai Composer untuk tiga hal: memasang paket, membuat autoloader, dan menjalankan script. Bagian ini melengkapi gambarannya.

### Padanan perintah

| Keperluan | Cargo | npm | Composer |
|---|---|---|---|
| Membuat manifest | `cargo init` | `npm init` | `composer init` |
| Menambah dependency | `cargo add serde` | `npm install zod` | `composer require vendor/paket` |
| Menambah dependency dev | `cargo add --dev x` | `npm install -D x` | `composer require --dev vendor/paket` |
| Menghapus dependency | `cargo remove x` | `npm uninstall x` | `composer remove vendor/paket` |
| Memasang sesuai lockfile | `cargo build --locked` | `npm ci` | `composer install` |
| Menaikkan versi dalam batas constraint | `cargo update` | `npm update` | `composer update` |
| Melihat yang terpasang | `cargo tree` | `npm ls` | `composer show` |
| Mencari versi yang lebih baru | plugin `cargo-outdated` | `npm outdated` | `composer outdated` |
| Memeriksa celah keamanan | plugin `cargo-audit` | `npm audit` | `composer audit` |
| Kenapa paket ini terpasang | `cargo tree -i x` | `npm why x` | `composer why vendor/paket` |
| Menjalankan script | tidak ada bawaan | `npm run x` | `composer x` |

Nama paket di Composer selalu dua bagian, `vendor/paket`, seperti scope di npm tetapi wajib. Registry-nya adalah packagist.org.

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

Daftar di atas adalah bawaan image `php:8.5-cli`, dirapatkan supaya ringkas. Fungsi seperti `mb_strlen()` berasal dari `mbstring`, dan akses database lewat `PDO` dipakai di [Bab 7](/07-web-tanpa-framework).

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

namespace Belajar\Bab06;

use Belajar\Bab06\Keranjang\Keranjang as Troli;

echo Uang\Rupiah::class . PHP_EOL;
echo Troli::class . PHP_EOL;
echo \Exception::class . PHP_EOL;
echo Exception::class . PHP_EOL;
echo strtoupper('halo') . PHP_EOL;
```

::: details Jawaban
```text
Belajar\Bab06\Uang\Rupiah
Belajar\Bab06\Keranjang\Keranjang
Exception
Belajar\Bab06\Exception
HALO
```

- **Baris 1**: nama qualified, relatif terhadap namespace file.
- **Baris 2**: alias dari `use ... as`.
- **Baris 3**: backslash di depan berarti namespace global.
- **Baris 4**: tanpa `use`, nama class dianggap milik namespace file. Class itu tidak ada, tetapi `::class` tidak memuat class, jadi PHP tidak mengeluh. PHPStan melaporkannya: `Class Belajar\Bab06\Exception not found.`
- **Baris 5**: fungsi jatuh ke namespace global.
:::

### 2. Class baru beserta test-nya

Buat class `Diskon` di namespace `Belajar\Bab06\Uang`:

- Constructor menerima `int $persen` dan menolak nilai di luar 0 sampai 100 dengan `InvalidArgumentException`.
- Method `terapkan(Rupiah $harga): Rupiah` mengembalikan harga setelah diskon, dibulatkan ke bawah.

Tulis test-nya dengan data provider untuk kasus 0%, 10%, 100%, dan satu kasus pembulatan. `composer format`, `composer check`, dan `composer test` harus lulus.

::: details Jawaban
`src/Bab06/Uang/Diskon.php`:

<!-- file: src/Bab06/Uang/Diskon.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab06\Uang;

use InvalidArgumentException;

final readonly class Diskon
{
    public function __construct(public int $persen)
    {
        if ($persen < 0 || $persen > 100) {
            throw new InvalidArgumentException("Persen harus 0 sampai 100, diberikan {$persen}");
        }
    }

    public function terapkan(Rupiah $harga): Rupiah
    {
        return new Rupiah(intdiv($harga->jumlah * (100 - $this->persen), 100));
    }
}
```

`tests/Bab06/DiskonTest.php`:

<!-- file: tests/Bab06/DiskonTest.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Tests\Bab06;

use Belajar\Bab06\Uang\Diskon;
use Belajar\Bab06\Uang\Rupiah;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class DiskonTest extends TestCase
{
    #[DataProvider('contohDiskon')]
    public function test_terapkan(int $persen, int $harga, int $harapan): void
    {
        self::assertSame($harapan, new Diskon($persen)->terapkan(new Rupiah($harga))->jumlah);
    }

    /** @return iterable<string, array{int, int, int}> */
    public static function contohDiskon(): iterable
    {
        yield 'tanpa diskon' => [0, 20_000, 20_000];
        yield 'sepuluh persen' => [10, 20_000, 18_000];
        yield 'gratis' => [100, 20_000, 0];
        yield 'dibulatkan ke bawah' => [15, 999, 849];
    }

    public function test_persen_di_luar_rentang_ditolak(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new Diskon(101);
    }
}
```

`intdiv` menjaga hasilnya tetap `int`. Operator `/` bisa menghasilkan `float`, yang ditolak constructor `Rupiah`.

Nama file harus `Diskon.php` dengan D besar. Dengan `diskon.php`, semuanya tetap lulus di container tetapi gagal di server Linux, seperti dijelaskan di bagian PSR-4.
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
