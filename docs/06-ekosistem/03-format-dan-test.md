# Formatter dan testing

## Formatter: Pint

Pint adalah formatter kode buatan tim Laravel, padanan `rustfmt` atau Prettier. Ia bisa dipakai di proyek PHP apa pun.

```bash
composer require --dev laravel/pint
```

Buat `pint.json` di folder proyek:

```json:line-numbers [pint.json]
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

Untuk melihat kerjanya, buat file yang sengaja berantakan, `src/Ch06/Messy.php`:

```php:line-numbers [src/Ch06/Messy.php]
<?php
namespace Learn\Ch06;
use InvalidArgumentException;
use Learn\Ch06\Money\Rupiah;
class Messy {
    function discount(Rupiah $price,int $percent) : Rupiah
    {
        if($percent<0||$percent>100){ throw new InvalidArgumentException("Persen tidak valid"); }
        return new Rupiah(intdiv($price->amount*(100-$percent),100));
    }
}
```

`--test` memeriksa tanpa mengubah file, dan `-v` menampilkan perbedaannya:

```bash
vendor/bin/pint --test -v src/Ch06/Messy.php
```

```text
  ⨯ src/Ch06/Messy.php modifier_keywords, class_definition, single_space_aroun
  @@ -1,11 +1,19 @@
   <?php
  +
  +declare(strict_types=1);
  +
   namespace Learn\Ch06;
  +
   use InvalidArgumentException;
   use Learn\Ch06\Money\Rupiah;
  -class Messy {
  -    function discount(Rupiah $price,int $percent) : Rupiah
  +
  +class Messy
  +{
  +    public function discount(Rupiah $price, int $percent): Rupiah
       {
  -        if($percent<0||$percent>100){ throw new InvalidArgumentException("Persen tidak valid"); }
  -        return new Rupiah(intdiv($price->amount*(100-$percent),100));
  +        if ($percent < 0 || $percent > 100) {
  +            throw new InvalidArgumentException("Persen tidak valid");
  +        }
  +        return new Rupiah(intdiv($price->amount * (100 - $percent), 100));
       }
   }
```

Selain merapikan spasi dan kurung, Pint menambahkan `declare(strict_types=1);` dan menulis `public` yang sebelumnya tersirat. Hapus file itu, lalu daftarkan Pint sebagai script di `composer.json`:

```json:line-numbers [composer.json]
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
Tanpa `pint.json`, Pint memakai preset `laravel`, yang seleranya sedikit berbeda. Inilah yang diubahnya di `shopping.php`:

```text
-$cart = new Cart();
+$cart = new Cart;
...
-echo $cart->total()->format() . PHP_EOL;
+echo $cart->total()->format().PHP_EOL;
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
        "Learn\\Tests\\": "tests/"
    }
}
```

Tambahkan juga script `test`. Seluruh `composer.json` sekarang seperti ini:

```json [composer.json]
{
    "name": "learn/php-basics",
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
            "Learn\\": "src/"
        },
        "files": [
            "src/Ch06/functions.php"
        ]
    },
    "autoload-dev": {
        "psr-4": {
            "Learn\\Tests\\": "tests/"
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

```xml:line-numbers [phpunit.xml]
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

Buat `tests/Ch06/RupiahTest.php`:

<!-- file: tests/Ch06/RupiahTest.php -->
```php:line-numbers [tests/Ch06/RupiahTest.php]
<?php

declare(strict_types=1);

namespace Learn\Tests\Ch06;

use InvalidArgumentException;
use Learn\Ch06\Money\Rupiah;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RupiahTest extends TestCase
{
    public function test_add_returns_new_object(): void
    {
        $a = new Rupiah(10_000);
        $b = new Rupiah(2_500);

        $result = $a->add($b);

        self::assertSame(12_500, $result->amount);
        self::assertSame(10_000, $a->amount);
    }

    #[DataProvider('formatExamples')]
    public function test_format(int $amount, string $expected): void
    {
        self::assertSame($expected, new Rupiah($amount)->format());
    }

    /** @return iterable<string, array{int, string}> */
    public static function formatExamples(): iterable
    {
        yield 'nol' => [0, 'Rp0'];
        yield 'ribuan' => [18_000, 'Rp18.000'];
        yield 'jutaan' => [1_250_000, 'Rp1.250.000'];
    }

    public function test_negative_amount_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('tidak boleh negatif');

        new Rupiah(-1);
    }
}
```

Buat `tests/Ch06/CartTest.php`:

<!-- file: tests/Ch06/CartTest.php -->
```php:line-numbers [tests/Ch06/CartTest.php]
<?php

declare(strict_types=1);

namespace Learn\Tests\Ch06;

use Learn\Ch06\Cart\Cart;
use Learn\Ch06\Cart\InvalidQuantity;
use Learn\Ch06\Cart\Item;
use PHPUnit\Framework\TestCase;

use function Learn\Ch06\rupiah;

final class CartTest extends TestCase
{
    public function test_empty_cart_total_is_zero(): void
    {
        self::assertSame(0, new Cart()->total()->amount);
    }

    public function test_total_sums_subtotal_of_each_item(): void
    {
        $cart = new Cart();
        $cart->add(new Item('Kopi', rupiah(18_000), 2));
        $cart->add(new Item('Roti', rupiah(12_500), 1));

        self::assertSame(48_500, $cart->total()->amount);
        self::assertSame(2, $cart->itemCount());
    }

    public function test_zero_quantity_is_rejected(): void
    {
        $this->expectException(InvalidQuantity::class);

        new Item('Kopi', rupiah(18_000), 0);
    }
}
```

File kedua berada di namespace `Learn\Tests\Ch06`, jadi fungsi `rupiah()` harus diimpor dengan `use function`.

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
Cart (Learn\Tests\Ch06\Cart)
 ✔ Empty cart total is zero
 ✔ Total sums subtotal of each item
 ✔ Zero quantity is rejected

Rupiah (Learn\Tests\Ch06\Rupiah)
 ✔ Add returns new object
 ✔ Format with nol
 ✔ Format with ribuan
 ✔ Format with jutaan
 ✔ Negative amount is rejected
```

### Dibanding Rust dan TS

| | Rust | TS (Vitest) | PHP (PHPUnit) |
|---|---|---|---|
| Lokasi test | Modul `#[cfg(test)]` di file yang sama, atau `tests/` | File `*.test.ts` | Folder `tests/`, class `*Test` |
| Satu test | Fungsi ber-`#[test]` | `test('...', () => {})` | Method berawalan `test` di turunan `TestCase` |
| Assertion | `assert_eq!(a, b)` | `expect(a).toBe(b)` | `self::assertSame($expected, $result)` |
| Banyak kasus | Loop, atau crate `rstest` | `test.each` | `#[DataProvider]` |
| Mengharapkan error | `#[should_panic]`, atau memeriksa `Err` | `expect(() => ...).toThrow()` | `$this->expectException(...)` |
| Menjalankan | `cargo test` | `vitest` | `composer test` |

Empat hal dari contoh di atas yang perlu diperhatikan:

- **Urutan argumen assertion**: nilai yang diharapkan dulu, baru nilai hasil.
- **Data provider** adalah method `public static` yang menghasilkan daftar argumen. Kuncinya (`'nol'`, `'ribuan'`) menjadi nama kasus di output.
- **`expectException` ditulis sebelum** kode yang melempar, bukan sesudahnya.
- **`new Rupiah($amount)->format()`** tanpa kurung tambahan di sekeliling `new` adalah sintaks PHP 8.4 ke atas.

### `assertSame` lawan `assertEquals`

Dua assertion ini berbeda persis seperti `===` dan `==` di [Bab 3](/03-dasar-bahasa). Empat test berikut memperlihatkannya:

```php
public function test_assert_equals_is_loose(): void
{
    self::assertEquals('18000', 18_000);
}

public function test_assert_same_is_strict(): void
{
    self::assertSame('18000', 18_000);
}

public function test_assert_equals_value_objects(): void
{
    self::assertEquals(new Rupiah(100), new Rupiah(100));
}

public function test_assert_same_value_objects(): void
{
    self::assertSame(new Rupiah(100), new Rupiah(100));
}
```

```text
There were 2 failures:

1) Learn\Tests\Ch06\TmpCompareTest::test_assert_same_is_strict
Failed asserting that 18000 is identical to '18000'.

2) Learn\Tests\Ch06\TmpCompareTest::test_assert_same_value_objects
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

1) Learn\Tests\Ch06\RupiahTest::test_format@ribuan with data (18000, 'Rp18,000')
Failed asserting that two strings are identical.
--- Expected
+++ Actual
@@ @@
-'Rp18,000'
+'Rp18.000'

/app/tests/Ch06/RupiahTest.php:28

FAILURES!
Tests: 8, Assertions: 11, Failures: 1.
```

Outputnya menyebut nama kasus dari data provider, argumen yang dipakai, selisih antara harapan dan hasil, serta baris assertion-nya. Kembalikan harapannya ke `'Rp18.000'`.

### PHPStan juga memeriksa test

Kode test adalah kode juga. Tambahkan `tests` ke `phpstan.neon`:

```yaml [phpstan.neon]
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

Di level max, data provider pun harus bertipe lengkap. Tanpa PHPDoc `@return` di `formatExamples()`:

```text
  32     Method Learn\Tests\Ch06\RupiahTest::formatExamples() return type has
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
