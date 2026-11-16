# Autoload

## Memuat file

Namespace mengatur nama, tetapi belum ada yang memuat file. Bagian ini melewati tiga tahap, dari yang paling manual sampai yang dipakai semua proyek PHP modern.

### `require` dengan tangan

Buat `src/Ch06/manual.php`:

<!-- file: src/Ch06/manual.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart;
use Learn\Ch06\Cart\Item;
use Learn\Ch06\Money\Rupiah;

require_once __DIR__ . '/Money/Rupiah.php';
require_once __DIR__ . '/Cart/Item.php';
require_once __DIR__ . '/Cart/Cart.php';

$cart = new Cart();
$cart->add(new Item('Kopi', new Rupiah(18_000), 2));
$cart->add(new Item('Roti', new Rupiah(12_500), 1));

echo $cart->total()->format() . PHP_EOL;
```

```bash
php src/Ch06/manual.php
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

Script di atas jalan, tetapi ada satu file yang lupa dimuat: `InvalidQuantity.php`. Kesalahannya baru terlihat ketika jalur error dilewati. Ganti jumlah `Kopi` menjadi `0`:

```text
Fatal error: Uncaught Error: Class "Learn\Ch06\Cart\InvalidQuantity" not found in /app/src/Ch06/Cart/Item.php:17
```

Yang seharusnya muncul adalah exception `InvalidQuantity` dengan pesan yang jelas. Yang muncul malah error bahwa class exception-nya sendiri tidak ditemukan. Inilah masalah `require` manual: daftar file harus dijaga dengan tangan, dan yang terlupa baru ketahuan saat runtime. Kembalikan jumlahnya ke `2`.

### Autoload buatan sendiri

PHP menyediakan jalan keluar: daftarkan sebuah fungsi yang dipanggil setiap kali PHP bertemu class yang belum dikenalnya. Fungsi itu yang bertugas memuat filenya.

Buat `src/Ch06/custom-autoload.php`:

<!-- file: src/Ch06/custom-autoload.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart;
use Learn\Ch06\Cart\Item;
use Learn\Ch06\Money\Rupiah;

spl_autoload_register(static function (string $class): void {
    $prefix = 'Learn\\';

    if (!str_starts_with($class, $prefix)) {
        return;
    }

    // Learn\Ch06\Money\Rupiah menjadi src/Ch06/Money/Rupiah.php
    $file = __DIR__ . '/../' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';

    echo "  [autoload] {$class}" . PHP_EOL;

    if (is_file($file)) {
        require $file;
    }
});

echo 'Mulai' . PHP_EOL;
$cart = new Cart();

echo 'Keranjang dibuat' . PHP_EOL;
$cart->add(new Item('Kopi', new Rupiah(18_000), 2));

echo $cart->total()->format() . PHP_EOL;
```

```bash
php src/Ch06/custom-autoload.php
```

```text
Mulai
  [autoload] Learn\Ch06\Cart\Cart
Keranjang dibuat
  [autoload] Learn\Ch06\Cart\Item
  [autoload] Learn\Ch06\Money\Rupiah
Rp36.000
```

Dua hal terlihat dari outputnya:

- **Tidak ada lagi daftar `require`.** Nama class diterjemahkan menjadi path file lewat satu aturan.
- **Pemuatannya malas.** `Item.php` baru dibaca saat `new Item` dieksekusi, bukan di awal. `InvalidQuantity.php` tidak dibaca sama sekali karena tidak pernah dibutuhkan.

Sifat malas itu cocok dengan cara PHP dijalankan: setiap request hanya membayar biaya file yang benar-benar dipakainya.

### PSR-4 lewat Composer

Aturan penerjemahan di atas (awalan namespace dipetakan ke folder, sisanya menjadi path) sudah dibakukan dengan nama **PSR-4**, dan Composer bisa membuatkan autoloader-nya. Tambahkan bagian `autoload` ke `composer.json`:

```json
"autoload": {
    "psr-4": {
        "Learn\\": "src/"
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
    'Learn\\' => array($baseDir . '/src'),
);
```

Sekarang cukup satu `require` di titik masuk program. Buat `src/Ch06/shopping.php`:

```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart;
use Learn\Ch06\Cart\Item;
use Learn\Ch06\Money\Rupiah;

require __DIR__ . '/../../vendor/autoload.php';

$cart = new Cart();
$cart->add(new Item('Kopi', new Rupiah(18_000), 2));
$cart->add(new Item('Roti', new Rupiah(12_500), 1));

echo $cart->total()->format() . PHP_EOL;
```

```bash
php src/Ch06/shopping.php
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
Folder proyekmu berada di Windows dan di-mount ke container, sehingga sistem file di dalam container ikut tidak membedakan huruf besar-kecil. Class `Discount` yang disimpan di file `discount.php` tetap ditemukan di mesinmu. Di server Linux, file itu tidak ditemukan.

Composer bisa memeriksanya tanpa bergantung pada sistem file:

```bash
composer dump-autoload --optimize --strict-psr
```

```text
Generating optimized autoload files
Class Learn\Ch06\Money\Discount located in ./src/Ch06/Money/discount.php does not comply with psr-4 autoloading standard
(rule: Learn\ => ./src). Skipping.
```

Perintah itu berakhir dengan exit code 1 kalau ada pelanggaran. Di proyek latihan ini, file bab sebelumnya yang menaruh class di file bernama lain akan ikut disebut. Jalankan `composer dump-autoload` biasa sesudahnya untuk kembali ke autoloader normal.
:::

### Fungsi tidak ikut di-autoload

Autoload hanya berlaku untuk class, interface, trait, dan enum. PHP tidak punya mekanisme serupa untuk fungsi.

Buat `src/Ch06/functions.php`, berisi satu fungsi pembantu supaya membuat `Rupiah` lebih ringkas:

<!-- file: src/Ch06/functions.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Money\Rupiah;

function rupiah(int $amount): Rupiah
{
    return new Rupiah($amount);
}
```

Ubah `shopping.php` supaya memakainya. Baris `use Learn\Ch06\Money\Rupiah;` tidak lagi dibutuhkan:

<!-- file: src/Ch06/shopping.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart;
use Learn\Ch06\Cart\Item;

require __DIR__ . '/../../vendor/autoload.php';

$cart = new Cart();
$cart->add(new Item('Kopi', rupiah(18_000), 2));
$cart->add(new Item('Roti', rupiah(12_500), 1));

echo $cart->total()->format() . PHP_EOL;
```

```text
Fatal error: Uncaught Error: Call to undefined function Learn\Ch06\rupiah() in /app/src/Ch06/shopping.php:13
```

File berisi fungsi harus didaftarkan satu per satu di entri `files`. Composer memuat semua file di daftar itu setiap kali `vendor/autoload.php` dijalankan:

```json
"autoload": {
    "psr-4": {
        "Learn\\": "src/"
    },
    "files": [
        "src/Ch06/functions.php"
    ]
}
```

```bash
composer dump-autoload
php src/Ch06/shopping.php
```

```text
Rp48.500
```

Karena file di `files` selalu dimuat, dipakai atau tidak, isinya sebaiknya sedikit. Ini salah satu alasan kode PHP modern lebih banyak memakai method di class daripada fungsi lepas. Laravel memakai entri `files` yang sama untuk fungsi pembantunya seperti `config()` dan `route()`.
