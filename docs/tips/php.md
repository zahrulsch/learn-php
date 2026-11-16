# Tips & trik PHP

Kumpulan trik kecil yang belum dibahas di bab-bab utama. Bisa dibaca dalam urutan apa pun setelah [Bab 6](/06-ekosistem/), karena semua contohnya memakai proyek `practice/php-basics` dengan file di `src/Tips` dan namespace `Learn\Tips`. Setiap potongan kode di sini lolos PHPStan level max dan sudah dijalankan di PHP 8.5.

## Penjaga tipe buatan sendiri dengan `@phpstan-assert`

PHPStan mempersempit tipe setelah `instanceof` atau `is_string()`, tetapi tidak tahu apa yang dicek fungsi validasimu sendiri. Anotasi `@phpstan-assert` memberitahunya: setelah fungsi ini selesai tanpa exception, tipenya sudah pasti.

<!-- file: src/Tips/assert.php -->
```php:line-numbers [src/Tips/assert.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use InvalidArgumentException;

/**
 * @phpstan-assert non-empty-string $value
 */
function assertFilled(string $value, string $field): void
{
    if ($value === '') {
        throw new InvalidArgumentException("{$field} wajib diisi");
    }
}

/**
 * @phpstan-assert-if-true positive-int $value
 */
function isPositive(int $value): bool
{
    return $value > 0;
}

/**
 * @param non-empty-string $name
 * @param positive-int $quantity
 */
function orderLine(string $name, int $quantity): string
{
    return "{$quantity} x {$name}";
}

function handle(string $name, int $quantity): string
{
    assertFilled($name, 'Nama');
    if (!isPositive($quantity)) {
        return 'jumlah harus lebih dari 0';
    }

    return orderLine($name, $quantity);
}

echo handle('Kopi', 2) . PHP_EOL;
echo handle('Teh', 0) . PHP_EOL;
```

```text
2 x Kopi
jumlah harus lebih dari 0
```

Tanpa kedua penjaga itu, PHPStan menolak pemanggilan `orderLine()`:

<!-- demo: assert-missing append: src/Tips/assert.php norun -->
```php
function handleUnchecked(string $name, int $quantity): string
{
    return orderLine($name, $quantity);
}
```

```text
Parameter #1 $name of function Learn\Tips\orderLine expects non-empty-string, string given.
Parameter #2 $quantity of function Learn\Tips\orderLine expects int<1, max>, int given.
```

`@phpstan-assert-if-true` berlaku untuk fungsi yang mengembalikan `bool`: tipenya menyempit di cabang `true`. Padanannya di TS adalah *type predicate* `value is T` dan `asserts value is T`.

## Factory bertipe dengan `class-string<T>`

Fungsi yang menerima nama class lalu membuat objeknya biasanya mengembalikan `object`, sehingga PHPStan tidak tahu method apa yang tersedia. Gabungkan `@template` dengan `class-string<T>`, dan tipe kembaliannya mengikuti argumen.

<!-- file: src/Tips/container.php -->
```php:line-numbers [src/Tips/container.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use LogicException;

final class Container
{
    /** @var array<class-string, object> */
    private array $instances = [];

    /**
     * @template T of object
     *
     * @param class-string<T> $class
     *
     * @return T
     */
    public function get(string $class): object
    {
        $instance = $this->instances[$class] ??= new $class();
        if (!$instance instanceof $class) {
            throw new LogicException("Isi cache untuk {$class} tidak sesuai");
        }

        return $instance;
    }
}

final class Calendar
{
    public function today(): string
    {
        return '2026-11-16';
    }
}

$container = new Container();
echo $container->get(Calendar::class)->today() . PHP_EOL;
var_dump($container->get(Calendar::class) === $container->get(Calendar::class));
```

```text
2026-11-16
bool(true)
```

Salah ketik nama method langsung tertangkap, karena PHPStan tahu hasilnya `Calendar`:

<!-- demo: container-typo append: src/Tips/container.php norun -->
```php
$container->get(Calendar::class)->tomorrow();
```

```text
Call to an undefined method Learn\Tips\Calendar::tomorrow().
```

Padanannya di TS: `get<T>(ctor: new () => T): T`.

## Class yang bisa dipanggil seperti fungsi

Method `__invoke()` membuat objek bisa dipakai di mana pun `callable` diterima, termasuk `array_map()`. Bedanya dengan closure, objek itu bisa membawa konfigurasi lewat constructor, dan tanda tangannya tetap diperiksa PHPStan lewat tipe `callable(int): string`.

<!-- file: src/Tips/invokable.php -->
```php:line-numbers [src/Tips/invokable.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

final readonly class MoneyFormat
{
    public function __construct(private string $prefix)
    {
    }

    public function __invoke(int $amount): string
    {
        return $this->prefix . number_format($amount, 0, ',', '.');
    }
}

/**
 * @param list<int> $amounts
 * @param callable(int): string $format
 *
 * @return list<string>
 */
function formatAll(array $amounts, callable $format): array
{
    return array_map($format, $amounts);
}

echo implode(' | ', formatAll([15000, 250000], new MoneyFormat('Rp '))) . PHP_EOL;
```

```text
Rp 15.000 | Rp 250.000
```

Fungsi dengan tanda tangan berbeda ditolak:

<!-- demo: invokable-wrong append: src/Tips/invokable.php norun -->
```php
formatAll([1, 2], strtoupper(...));
```

```text
Parameter #2 $format of function Learn\Tips\formatAll expects callable(int): string, Closure(string): uppercase-string given.
```

Di Rust, ini mirip struct yang mengimplementasikan trait `Fn`.

## Enum yang mengimplementasikan interface

Enum bisa mengimplementasikan interface, punya konstanta, dan punya method static. Fungsi yang menerima interface itu lalu bisa menerima enum maupun class biasa.

<!-- file: src/Tips/enum-interface.php -->
```php:line-numbers [src/Tips/enum-interface.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

interface HasLabel
{
    public function label(): string;
}

enum PostStatus: string implements HasLabel
{
    case Draft = 'draft';
    case Published = 'published';

    // konstanta di enum bisa menunjuk ke salah satu case
    public const DEFAULT = self::Draft;

    #[\Override]
    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Konsep',
            self::Published => 'Terbit',
        };
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $status): string => $status->value, self::cases());
    }
}

function badge(HasLabel $item): string
{
    return "[{$item->label()}]";
}

echo badge(PostStatus::DEFAULT) . PHP_EOL;
echo implode(', ', PostStatus::values()) . PHP_EOL;
```

```text
[Konsep]
draft, published
```

`values()` berguna untuk aturan validasi atau kolom `enum` di migration, supaya daftar nilainya tidak ditulis dua kali.

## `readonly` hanya sedalam satu lapis

`readonly` mencegah property diganti, bukan mencegah objek di dalamnya berubah. Property bertipe `DateTime` tetap bisa digeser lewat method-nya sendiri.

<!-- file: src/Tips/readonly-shallow.php -->
```php:line-numbers [src/Tips/readonly-shallow.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use DateTime;
use DateTimeImmutable;

final readonly class Meeting
{
    public function __construct(public DateTime $at)
    {
    }
}

final readonly class SafeMeeting
{
    public function __construct(public DateTimeImmutable $at)
    {
    }
}

$meeting = new Meeting(new DateTime('2026-11-16 09:00'));
$meeting->at->modify('+1 day');
echo $meeting->at->format('Y-m-d H:i') . PHP_EOL;

$safe = new SafeMeeting(new DateTimeImmutable('2026-11-16 09:00'));
echo $safe->at->modify('+1 day')->format('Y-m-d H:i') . PHP_EOL;
echo $safe->at->format('Y-m-d H:i') . PHP_EOL;
```

```text
2026-11-17 09:00
2026-11-17 09:00
2026-11-16 09:00
```

Pakai `DateTimeImmutable` untuk property `readonly`. Bonusnya, PHPStan tahu `modify()` di sana tidak mengubah apa pun, jadi lupa memakai hasilnya tertangkap:

<!-- demo: readonly-discard append: src/Tips/readonly-shallow.php norun -->
```php
$safe->at->modify('+1 day');
```

```text
Call to method DateTimeImmutable::modify() on a separate line discards return value.
Call to method DateTimeImmutable::modify() on a separate line has no effect.
```

Di Rust, `&T` melarang perubahan sampai ke dalam. `readonly` di PHP lebih mirip `const` di TS: hanya ikatannya yang terkunci.

## Objek sebagai nilai bawaan parameter

Sejak PHP 8.1, nilai bawaan parameter boleh berupa `new`. Ini cara ringan untuk dependency yang biasanya sama, tetapi perlu diganti di test.

<!-- file: src/Tips/default-object.php -->
```php:line-numbers [src/Tips/default-object.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

interface Clock
{
    public function today(): string;
}

final class SystemClock implements Clock
{
    #[\Override]
    public function today(): string
    {
        return date('Y-m-d');
    }
}

final readonly class FixedClock implements Clock
{
    public function __construct(private string $date)
    {
    }

    #[\Override]
    public function today(): string
    {
        return $this->date;
    }
}

final readonly class Greeter
{
    public function __construct(private Clock $clock = new SystemClock())
    {
    }

    public function greet(): string
    {
        return "Halo, hari ini {$this->clock->today()}";
    }
}

// di aplikasi: new Greeter(); di test, jam dipatok
echo new Greeter(new FixedClock('2026-11-16'))->greet() . PHP_EOL;
```

```text
Halo, hari ini 2026-11-16
```

Sebelum PHP 8.1 polanya `?Clock $clock = null` lalu `$this->clock = $clock ?? new SystemClock()`. Padanannya di TS adalah parameter bawaan `clock: Clock = new SystemClock()`.

## Mengurutkan dengan beberapa kunci sekaligus

`<=>` juga bisa membandingkan array, elemen demi elemen. Jadi pengurutan "kategori naik, lalu harga turun" cukup satu baris: tukar `$a` dan `$b` di posisi yang ingin dibalik. Destructuring di `foreach` membuat pemakaiannya rapi.

<!-- file: src/Tips/sort-keys.php -->
```php:line-numbers [src/Tips/sort-keys.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

/** @var list<array{name: string, category: string, price: int}> $products */
$products = [
    ['name' => 'Teh', 'category' => 'minuman', 'price' => 12000],
    ['name' => 'Roti', 'category' => 'makanan', 'price' => 15000],
    ['name' => 'Kopi', 'category' => 'minuman', 'price' => 18000],
    ['name' => 'Kue', 'category' => 'makanan', 'price' => 9000],
];

usort(
    $products,
    fn (array $a, array $b): int => [$a['category'], $b['price']] <=> [$b['category'], $a['price']],
);

foreach ($products as ['name' => $name, 'category' => $category, 'price' => $price]) {
    echo "{$category}: {$name} {$price}" . PHP_EOL;
}
```

```text
makanan: Roti 15000
makanan: Kue 9000
minuman: Kopi 18000
minuman: Teh 12000
```

Padanannya di Rust: `sort_by_key(|p| (p.category.clone(), Reverse(p.price)))`.

## `yield from` dan kunci yang bertabrakan

`iterator_to_array()` memakai kunci dari generator. Setiap `yield from` mulai lagi dari kunci 0, sehingga hasil generator kedua menimpa yang pertama tanpa peringatan.

<!-- file: src/Tips/yield-keys.php -->
```php:line-numbers [src/Tips/yield-keys.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use Generator;

/** @return Generator<int, string> */
function fruits(): Generator
{
    yield 'apel';
    yield 'jeruk';
}

/** @return Generator<int, string> */
function vegetables(): Generator
{
    yield 'bayam';
    yield 'wortel';
}

/** @return Generator<int, string> */
function groceries(): Generator
{
    yield from fruits();
    yield from vegetables();
}

echo json_encode(iterator_to_array(groceries()), JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode(iterator_to_array(groceries(), preserve_keys: false), JSON_THROW_ON_ERROR) . PHP_EOL;
```

```text
["bayam","wortel"]
["apel","jeruk","bayam","wortel"]
```

Kalau kuncinya tidak penting, selalu pakai `preserve_keys: false`. `foreach` langsung atas generator tidak terkena masalah ini, karena tidak ada array yang dibangun.

## Cache per objek dengan `WeakMap`

Cache yang dikunci objek, misalnya `array` dengan kunci `spl_object_id()`, menahan memori selamanya. `WeakMap` melepas entrinya begitu objek kuncinya tidak dipakai lagi.

<!-- file: src/Tips/weak-map.php -->
```php:line-numbers [src/Tips/weak-map.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use WeakMap;

final readonly class Invoice
{
    public function __construct(public int $total)
    {
    }
}

final class TaxCalculator
{
    /** @var WeakMap<Invoice, int> */
    private WeakMap $cache;

    public function __construct()
    {
        $this->cache = new WeakMap();
    }

    public function tax(Invoice $invoice): int
    {
        return $this->cache[$invoice] ??= intdiv($invoice->total * 11, 100);
    }

    public function cached(): int
    {
        return count($this->cache);
    }
}

$calculator = new TaxCalculator();
$invoice = new Invoice(100000);

echo $calculator->tax($invoice) . PHP_EOL;
echo $calculator->cached() . PHP_EOL;

unset($invoice);
echo $calculator->cached() . PHP_EOL;
```

```text
11000
1
0
```

Sama dengan `WeakMap` di JavaScript.

## URL yang divalidasi dengan ekstensi URI

`parse_url()` tidak memvalidasi apa pun: alamat dengan spasi tetap dipecah seolah sah. PHP 8.5 membawa ekstensi URI dengan dua parser. `Uri\Rfc3986\Uri` mengikuti RFC 3986: alamat yang tidak sah ditolak, yang sah dinormalkan. `Uri\WhatWg\Url` berperilaku seperti browser dan memperbaiki apa yang bisa diperbaiki.

<!-- file: src/Tips/uri.php -->
```php:line-numbers [src/Tips/uri.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use Uri\Rfc3986\Uri;
use Uri\WhatWg\Url;

var_dump(parse_url('https://contoh.com/a b'));
var_dump(Uri::parse('https://contoh.com/a b'));

$uri = Uri::parse('https://Contoh.com:8080/a/./b/../c?q=1');
if ($uri !== null) {
    echo $uri->getHost() . PHP_EOL;
    echo $uri->getPath() . PHP_EOL;
    echo $uri->withPath('/baru')->toString() . PHP_EOL;
}

// parser WHATWG memperbaiki seperti browser: spasi di-encode
echo Url::parse('https://contoh.com/a b')?->toAsciiString() . PHP_EOL;
```

```text
array(3) {
  ["scheme"]=>
  string(5) "https"
  ["host"]=>
  string(10) "contoh.com"
  ["path"]=>
  string(4) "/a b"
}
NULL
contoh.com
/a/c
https://contoh.com:8080/baru?q=1
https://contoh.com/a%20b
```

Objeknya immutable: `withPath()` mengembalikan objek baru. Padanannya `new URL()` di JavaScript dan crate `url` di Rust.

## Menyembunyikan sandi dari stack trace

Stack trace mencatat argumen setiap pemanggilan, termasuk sandi atau token, lalu ikut masuk log. Tandai parameter seperti itu dengan `#[\SensitiveParameter]`.

<!-- file: src/Tips/sensitive.php -->
```php:line-numbers [src/Tips/sensitive.php]
<?php

declare(strict_types=1);

namespace Learn\Tips;

use RuntimeException;

function loginLeaky(string $user, string $password): never
{
    throw new RuntimeException('Login gagal');
}

function login(string $user, #[\SensitiveParameter] string $password): never
{
    throw new RuntimeException('Login gagal');
}

foreach ([loginLeaky(...), login(...)] as $attempt) {
    try {
        $attempt('budi', 'rahasia123');
    } catch (RuntimeException $e) {
        echo $e->getTraceAsString() . PHP_EOL;
    }
}
```

```text
#0 /app/src/Tips/sensitive.php(21): Learn\Tips\loginLeaky('budi', 'rahasia123')
#1 {main}
#0 /app/src/Tips/sensitive.php(21): Learn\Tips\login('budi', Object(SensitiveParameterValue))
#1 {main}
```

Di production, `php.ini` bawaan menyetel `zend.exception_ignore_args=On` sehingga argumen tidak dicatat sama sekali. Attribute ini tetap perlu: ia berlaku di mana pun, termasuk di server yang setelannya tidak kamu kendalikan.
