# 6. Ekosistem

Sampai [Bab 5](/05-error-handling) kamu menulis file-file lepas yang dijalankan satu per satu. Bab ini merangkainya menjadi proyek sungguhan: nama diatur dengan namespace, file dimuat otomatis lewat autoload, kode dirapikan formatter, perilakunya dijaga test, dan dependency dikelola Composer.

Di Rust hampir semua itu diurus Cargo. Di PHP perannya terbagi ke beberapa alat, dengan Composer sebagai pusatnya.

## Persiapan

Lanjutkan di proyek `practice/php-basics` dan masuk ke shell container seperti biasa. Contoh bab ini adalah keranjang belanja kecil yang terdiri dari empat class, masing-masing di file sendiri:

```text
src/Ch06/
├── Money/
│   └── Rupiah.php
└── Cart/
    ├── Cart.php
    ├── InvalidQuantity.php
    └── Item.php
```

Buat `src/Ch06/Money/Rupiah.php`:

<!-- file: src/Ch06/Money/Rupiah.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06\Money;

use InvalidArgumentException;

final readonly class Rupiah
{
    public function __construct(public int $amount)
    {
        if ($amount < 0) {
            throw new InvalidArgumentException("Jumlah tidak boleh negatif: {$amount}");
        }
    }

    public function add(self $other): self
    {
        return new self($this->amount + $other->amount);
    }

    public function multiply(int $multiplier): self
    {
        return new self($this->amount * $multiplier);
    }

    public function format(): string
    {
        return 'Rp' . number_format($this->amount, 0, ',', '.');
    }
}
```

Buat `src/Ch06/Cart/InvalidQuantity.php`:

<!-- file: src/Ch06/Cart/InvalidQuantity.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06\Cart;

use InvalidArgumentException;

final class InvalidQuantity extends InvalidArgumentException
{
}
```

Buat `src/Ch06/Cart/Item.php`:

<!-- file: src/Ch06/Cart/Item.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06\Cart;

use Learn\Ch06\Money\Rupiah;

final readonly class Item
{
    public function __construct(
        public string $name,
        public Rupiah $price,
        public int $quantity,
    ) {
        if ($quantity < 1) {
            throw new InvalidQuantity("Jumlah {$name} minimal 1, diberikan {$quantity}");
        }
    }

    public function subtotal(): Rupiah
    {
        return $this->price->multiply($this->quantity);
    }
}
```

Buat `src/Ch06/Cart/Cart.php`:

<!-- file: src/Ch06/Cart/Cart.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch06\Cart;

use Learn\Ch06\Money\Rupiah;

final class Cart
{
    /** @var list<Item> */
    private array $items = [];

    public function add(Item $item): void
    {
        $this->items[] = $item;
    }

    public function total(): Rupiah
    {
        return array_reduce(
            $this->items,
            static fn (Rupiah $total, Item $item): Rupiah => $total->add($item->subtotal()),
            new Rupiah(0),
        );
    }

    public function itemCount(): int
    {
        return count($this->items);
    }
}
```

Nama folder dan nama file sengaja dibuat sama persis dengan nama namespace dan nama class, termasuk huruf besar-kecilnya. Alasannya muncul di bagian autoload.

## Namespace

### Namespace hanyalah awalan nama

Baris `namespace Learn\Ch06\Money;` membuat nama lengkap class di file itu menjadi `Learn\Ch06\Money\Rupiah`. Hanya itu yang dilakukannya. Namespace tidak memuat file, tidak mengatur siapa boleh mengakses apa, dan tidak terikat ke folder.

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

| Bentuk | Contoh di file ber-namespace `Learn\Ch06` | Diartikan sebagai |
|---|---|---|
| Fully qualified | `\Learn\Ch06\Money\Rupiah` | Persis nama itu |
| Qualified | `Money\Rupiah` | Relatif terhadap namespace file: `Learn\Ch06\Money\Rupiah` |
| Unqualified | `Rupiah` | Alias dari `use` kalau ada. Kalau tidak ada: `Learn\Ch06\Rupiah` |

`use` mendaftarkan alias supaya nama pendek bisa dipakai. Bentuk-bentuknya:

```php
use Learn\Ch06\Money\Rupiah;         // class
use Learn\Ch06\Cart\Cart as Trolley; // dengan nama lain
use Learn\Ch06\Cart\{Cart, Item};    // beberapa sekaligus

use function Learn\Ch06\rupiah;      // fungsi
```

Untuk konstanta ada `use const`. Class yang berada di namespace yang sama tidak perlu `use`: itu sebabnya `Item.php` bisa menulis `InvalidQuantity` begitu saja.

Buat file coba-coba `src/Ch06/scratch.php` untuk melihat hasil penyelesaian nama. `::class` mengembalikan nama lengkap sebuah class sebagai string:

```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

use Learn\Ch06\Cart\Cart as Trolley;
use Learn\Ch06\Money\Rupiah;

echo Rupiah::class . PHP_EOL;
echo Trolley::class . PHP_EOL;
echo __NAMESPACE__ . PHP_EOL;
echo \strlen('abc') . PHP_EOL;
```

```bash
php src/Ch06/scratch.php
```

```text
Learn\Ch06\Money\Rupiah
Learn\Ch06\Cart\Cart
Learn\Ch06
3
```

Script ini jalan walaupun file `Rupiah.php` dan `Cart.php` belum dimuat sama sekali. `::class` diselesaikan dari teks kode, tanpa menyentuh class-nya. Kamu akan sering melihatnya di Laravel, misalnya `User::class`, sebagai cara menyebut class tanpa menulis string dengan tangan.

### Jebakan: class bawaan PHP

Semua class bawaan PHP ada di namespace global. Timpa `scratch.php`:

```php
<?php

declare(strict_types=1);

namespace Learn\Ch06;

echo strlen('halo') . PHP_EOL;
echo PHP_VERSION . PHP_EOL;

$date = new DateTimeImmutable('2026-11-16');
echo $date->format('Y-m-d') . PHP_EOL;
```

```text
4
8.5.12

Fatal error: Uncaught Error: Class "Learn\Ch06\DateTimeImmutable" not found in /app/src/Ch06/scratch.php:10
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
  Line   Ch06/scratch.php
 ------ ----------------------------------------------------------------------
  10     Instantiated class Learn\Ch06\DateTimeImmutable not found.
         🪪  class.notFound
         💡  Learn more at https://phpstan.org/user-guide/discovering-symbols
  11     Binary operation "." between mixed and "\n"|"\r\n" results in an
         error.
         🪪  binaryOp.invalid
  11     Call to method format() on an unknown class
         Learn\Ch06\DateTimeImmutable.
         🪪  class.notFound
         💡  Learn more at https://phpstan.org/user-guide/discovering-symbols
 ------ ----------------------------------------------------------------------

 [ERROR] Found 3 errors
```

Hapus `scratch.php` sebelum lanjut.

### Tidak ada privasi tingkat modul

PHP tidak punya padanan `pub(crate)` atau nama yang tidak di-`export`. Setiap class dan fungsi bisa dipakai dari file mana pun, selama nama lengkapnya diketahui. Yang bisa disembunyikan hanya isi class, lewat `private` dan `protected`.

Konvensinya adalah menandai sesuatu dengan `@internal` di PHPDoc:

```php
/** @internal */
final class Rounder
{
    // ...
}
```

Yang kamu dapat dari tanda itu terbatas:

- **Bagi PHP**: tidak ada. Itu hanya komentar.
- **Bagi PHPStan dengan konfigurasi bawaan**: juga tidak ada. Pemakaian `Rounder` dari namespace mana pun lolos.
- **Bagi PHPStan dengan bleeding edge**: pemakaian dari luar *root namespace* dilaporkan. Root namespace adalah segmen pertama nama, di sini `Learn`.

Bleeding edge adalah kumpulan aturan PHPStan versi berikutnya, yang dinyalakan dengan menambahkan `includes` ke `phpstan.neon`:

```yaml
includes:
    - phar://phpstan.phar/conf/bleedingEdge.neon
```

Dengan itu, kode di namespace `Shop\Cashier` yang memakai `Rounder` dilaporkan begini:

```text
  9      Instantiation of internal class Learn\Ch06\Money\Rounder.
         🪪  new.internalClass
  10     Call to internal method Learn\Ch06\Money\Rounder::toHundreds() from
         outside its root namespace Learn.
         🪪  method.internal
```

Jadi `@internal` melindungi batas antar paket, bukan batas antar modul di dalam satu aplikasi. Di materi ini bleeding edge tidak dinyalakan.
