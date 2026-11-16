# 2. Type system

Bab ini inti materi untuk kamu yang datang dari Rust dan TS. Di akhir bab kamu tahu apa saja yang bisa diekspresikan lewat tipe di PHP, bagian mana yang dijaga PHP saat runtime, dan bagian mana yang hanya dijaga PHPStan.

## Dua lapis tipe

PHP punya dua tempat menulis tipe, dan keduanya dipakai bersamaan.

| | Tipe native | Tipe PHPDoc |
|---|---|---|
| Ditulis di | Kode: `function f(int $x): string` | Komentar `/** ... */` di atas kode |
| Diperiksa oleh | PHP saat runtime, dan PHPStan | PHPStan saja |
| Saat runtime | Melempar `TypeError` kalau dilanggar | Dihapus, tidak berpengaruh apa pun |
| Daya ekspresi | Terbatas: `int`, `?string`, `A\|B`, nama class | Kaya: `list<int>`, `array{id: int}`, generics |

Untuk yang terbiasa dengan TS, analoginya begini:

- **Tipe PHPDoc sama dengan tipe TS.** Diperiksa secara statis, lalu hilang saat program berjalan.
- **Tipe native seperti validasi runtime bawaan** di setiap batas fungsi, kira-kira seperti schema zod yang terpasang otomatis.

Aturan praktisnya: tulis tipe native seketat yang dimungkinkan bahasa, lalu perhalus dengan PHPDoc ketika tipe native tidak cukup ekspresif.

## Persiapan

Lanjutkan di proyek `practice/php-basics` dari [Bab 1](/01-setup), dan masuk ke shell container seperti sebelumnya. Buat folder `src/Ch02` untuk file-file bab ini.

Setiap file di bab ini diawali baris yang sama:

```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;
```

Baris `namespace` baru muncul di sini. Untuk sekarang anggap seperti `mod` di Rust: ia memberi awalan pada nama fungsi dan class di file itu, sehingga nama yang sama di bab lain tidak bentrok. Detailnya ada di [Bab 6](/06-ekosistem).

Sepanjang bab ada dua macam eksperimen yang memang diharapkan gagal:

- **Tambahan di akhir file**: tempel potongannya, lihat errornya, lalu hapus lagi.
- **File coba-coba** `src/Ch02/scratch.php`: timpa isinya setiap kali, dan hapus file itu di akhir bab supaya `composer check` kembali bersih.

## Di mana tipe ditulis

Buat `src/Ch02/basics.php`:

<!-- file: src/Ch02/basics.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function squareArea(int $side): int
{
    return $side * $side;
}

function average(float $a, float $b): float
{
    return ($a + $b) / 2;
}

function greetFull(string $name, bool $formal): string
{
    return $formal ? "Selamat datang, {$name}." : "Halo, {$name}!";
}

function logMessage(string $message): void
{
    echo "[log] {$message}" . PHP_EOL;
}

echo squareArea(4) . PHP_EOL;
echo average(3, 4) . PHP_EOL;
echo greetFull('Budi', formal: true) . PHP_EOL;
logMessage('selesai');
```

```bash
php src/Ch02/basics.php
```

```text
16
3.5
Selamat datang, Budi.
[log] selesai
```

Tipe native bisa ditulis di empat tempat: parameter, return value, property class, dan konstanta class. Dua yang terakhir dibahas di [Bab 4](/04-oop).

Yang tidak bisa diberi tipe adalah variabel lokal. Tidak ada padanan `let x: i64 = ...` atau `const x: number = ...`. Tipe variabel lokal selalu disimpulkan PHPStan dari nilai yang mengisinya.

Untuk melihat tipe yang disimpulkan, pakai `\PHPStan\dumpType()`. Ini padanan hover di editor. Tempel di akhir `basics.php`:

<!-- demo: dumptype append: src/Ch02/basics.php norun -->
```php
$area = squareArea(3);
$text = 'halo';
$items = [1, 2, 3];

\PHPStan\dumpType($area);
\PHPStan\dumpType($text);
\PHPStan\dumpType($items);
```

```bash
composer check
```

```text
Dumped type: int
Dumped type: 'halo'
Dumped type: array{1, 2, 3}
```

Perhatikan dua baris terakhir: PHPStan menyimpan tipe literal, sama seperti TS memperlakukan `const text = 'halo'`. Fungsi `dumpType` hanya dikenal PHPStan dan tidak ada saat runtime, jadi hapus lagi baris-baris itu.

## Tipe dasar dan padanannya

| Rust | TypeScript | PHP | Catatan |
|---|---|---|---|
| `i64` | `number` | `int` | 64-bit bertanda. Tidak ada ukuran lain, tidak ada unsigned |
| `f64` | `number` | `float` | |
| `bool` | `boolean` | `bool` | |
| `String`, `&str` | `string` | `string` | Deretan byte, bukan karakter Unicode |
| `()` | `void` | `void` | |
| `!` | `never` | `never` | |
| `Option<T>` | `T \| null` | `?T` | |
| tidak ada | `unknown` | `mixed` | |
| `Vec<T>` | `T[]` | `array` | Isinya ditulis lewat PHPDoc `list<T>` |
| `HashMap<K, V>` | `Record<K, V>` | `array` | Isinya ditulis lewat PHPDoc `array<K, V>` |
| `struct` | `interface`, `type` | class | Atau PHPDoc array shape |
| `enum` tanpa data | union literal | `enum` | |
| `<T>` | `<T>` | tidak ada | Lewat PHPDoc `@template` |
| `Result<T, E>` | tidak ada | tidak ada | Lihat [Bab 5](/05-error-handling) |

Tiga perilaku tipe dasar yang paling sering mengejutkan pendatang dari Rust. Buat `src/Ch02/pitfalls.php`:

<!-- file: src/Ch02/pitfalls.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

// int yang meluap berubah menjadi float, tanpa error
var_dump(PHP_INT_MAX);
var_dump(PHP_INT_MAX + 1);

// "/" bisa menghasilkan float, intdiv selalu int
var_dump(7 / 2);
var_dump(6 / 2);
var_dump(intdiv(7, 2));

// string adalah deretan byte
var_dump(strlen('é'));
var_dump(mb_strlen('é'));
```

```text
int(9223372036854775807)
float(9.223372036854776E+18)
float(3.5)
int(3)
int(3)
int(2)
int(1)
```

- **Overflow tidak panic dan tidak wrap.** `int` yang meluap diam-diam menjadi `float` dan kehilangan presisi.
- **Operator `/` bertipe `int|float`**, tergantung apakah hasilnya bulat. Untuk pembagian bulat pakai `intdiv()`.
- **`strlen()` menghitung byte.** Untuk jumlah karakter pakai fungsi berawalan `mb_`.

### Celah di level max: hasil pembagian

Operator `/` adalah tempat PHPStan level max masih longgar. Timpa `src/Ch02/scratch.php` dengan ini:

<!-- demo: divide -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function divideByTwo(int $n): int
{
    return $n / 2;
}

var_dump(divideByTwo(6));
var_dump(divideByTwo(7));
```

`composer check` meloloskannya:

```text
 [OK] No errors
```

Padahal saat dijalankan, hasilnya bergantung pada data:

```text
int(3)

Fatal error: Uncaught TypeError: Learn\Ch02\divideByTwo(): Return value must be of type int, float returned
```

`divideByTwo(6)` berhasil, `divideByTwo(7)` meledak. PHPStan sebenarnya tahu hasil `/` bertipe `float|int`, tetapi menandainya sebagai union yang "dimaklumi" (*benevolent union*, ditulis `(float|int)`) dan secara bawaan tidak melaporkannya. Tutup celah itu dengan satu baris di `phpstan.neon`:

```yaml
parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - src
```

Sekarang `composer check` menolak kodenya:

```text
Function Learn\Ch02\divideByTwo() should return int but returns (float|int).
```

Biarkan opsi itu menyala di proyek ini. Perbaikannya sendiri sederhana: pakai `intdiv($n, 2)`.

## Null dengan `?T`

`?string` adalah singkatan `string|null`, padanan `Option<String>`. Buat `src/Ch02/nullable.php`:

<!-- file: src/Ch02/nullable.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function findEmail(int $id): ?string
{
    return match ($id) {
        1 => 'Budi@Example.com',
        2 => 'siti@example.com',
        default => null,
    };
}

function tidyEmail(int $id): string
{
    $email = findEmail($id);

    if ($email === null) {
        return '(tidak ada email)';
    }

    // Setelah pengecekan di atas, PHPStan tahu $email bertipe string.
    return strtolower($email);
}

function requireEmail(int $id): string
{
    return findEmail($id) ?? throw new \RuntimeException("Pengguna {$id} tidak punya email");
}

function registrationDate(int $id): ?\DateTimeImmutable
{
    return $id === 1 ? new \DateTimeImmutable('2026-01-15') : null;
}

echo tidyEmail(1) . PHP_EOL;
echo tidyEmail(9) . PHP_EOL;
echo (findEmail(9) ?? '(kosong)') . PHP_EOL;
echo requireEmail(2) . PHP_EOL;
var_dump(registrationDate(1)?->format('Y'));
var_dump(registrationDate(9)?->format('Y'));
```

```text
budi@example.com
(tidak ada email)
(kosong)
siti@example.com
string(4) "2026"
NULL
```

Awalan `\` pada `\RuntimeException` dan `\DateTimeImmutable` berarti nama itu ada di namespace global, tempat semua class bawaan PHP berada.

Hampir semua operasi `Option` punya padanan:

| Rust | PHP | Arti |
|---|---|---|
| `if let Some(x) = opt` | `if ($x !== null)` | Persempit tipenya dulu |
| `opt.unwrap_or(d)` | `$x ?? $d` | Nilai pengganti kalau `null` |
| `opt.map(\|v\| v.f())` | `$x?->f()` | Panggil method kalau tidak `null` |
| `opt.expect("...")` | `$x ?? throw new ...` | Gagal dengan pesan kalau `null` |

Yang tidak ada adalah paksaan dari bahasa. PHP sendiri membiarkanmu memanggil `strtolower()` pada nilai yang mungkin `null`, dan baru melempar `TypeError` saat nilainya benar-benar `null`. Yang memaksa penanganan adalah PHPStan, seperti yang kamu lihat di latihan [Bab 1](/01-setup).

## Union type

`int|string` berarti salah satu dari keduanya, sama seperti union di TS. Buat `src/Ch02/union.php`:

<!-- file: src/Ch02/union.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function formatId(int|string $id): string
{
    if (is_int($id)) {
        return sprintf('#%05d', $id);
    }

    // Cabang int sudah keluar, jadi di sini $id pasti string.
    return strtoupper($id);
}

function username(string $email): string
{
    $position = strpos($email, '@');

    if ($position === false) {
        return $email;
    }

    return substr($email, 0, $position);
}

echo formatId(42) . PHP_EOL;
echo formatId('ab-7') . PHP_EOL;
echo username('budi@example.com') . PHP_EOL;
echo username('tanpa-at') . PHP_EOL;
```

```text
#00042
AB-7
budi
tanpa-at
```

### Penyempitan tipe

PHPStan mengikuti alur kontrol seperti TS. Pengecekan dengan `is_int()`, `is_string()`, `is_array()`, `instanceof`, `=== null`, atau `match` mempersempit tipe di cabang yang bersangkutan. Tempel di akhir `union.php`:

<!-- demo: narrow append: src/Ch02/union.php norun -->
```php
function showNarrowing(int|string|null $value): void
{
    \PHPStan\dumpType($value);

    if ($value === null) {
        return;
    }
    \PHPStan\dumpType($value);

    if (is_string($value)) {
        \PHPStan\dumpType($value);

        return;
    }
    \PHPStan\dumpType($value);
}
```

```text
Dumped type: int|string|null
Dumped type: int|string
Dumped type: string
Dumped type: int
```

### Warisan lama: `T|false`

Banyak fungsi bawaan PHP lahir sebelum ada exception dan `null` yang rapi, sehingga menandai kegagalan dengan `false`. `strpos()` di atas bertipe `int|false`. PHPStan memperlakukannya seperti `Option`: kamu harus menyingkirkan `false` dulu. Timpa `scratch.php`:

<!-- demo: strpos -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function shortName(string $email): string
{
    return substr($email, 0, strpos($email, '@'));
}

echo shortName('tanpa-at') . PHP_EOL;
```

```text
Parameter #3 $length of function substr expects int|null, int<0, max>|false given.
```

Selalu bandingkan dengan `=== false`. Menulis `if (strpos($a, $b))` adalah bug klasik, karena posisi `0` juga dianggap salah.

## Array bertipe

Tipe native `array` tidak mengatakan apa pun tentang isinya. Isinya ditulis lewat PHPDoc:

| PHPDoc | Rust | TypeScript |
|---|---|---|
| `list<int>` | `Vec<i64>` | `number[]` |
| `array<string, int>` | `HashMap<String, i64>` | `Record<string, number>` |
| `array{name: string, age: int}` | `struct` | `{ name: string; age: number }` |
| `array{int, string}` | `(i64, String)` | `[number, string]` |

Buat `src/Ch02/collections.php`:

<!-- file: src/Ch02/collections.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

/**
 * @param list<int> $values
 */
function sum(array $values): int
{
    $total = 0;
    foreach ($values as $n) {
        $total += $n;
    }

    return $total;
}

/**
 * @param array<string, int> $stock
 * @return list<string>
 */
function outOfStockItems(array $stock): array
{
    $outOfStock = [];
    foreach ($stock as $name => $remaining) {
        if ($remaining === 0) {
            $outOfStock[] = $name;
        }
    }

    return $outOfStock;
}

/**
 * @param array{name: string, age: int} $person
 */
function introduce(array $person): string
{
    return "{$person['name']} ({$person['age']} tahun)";
}

/**
 * @return array{int, int}
 */
function divideWithRemainder(int $a, int $b): array
{
    return [intdiv($a, $b), $a % $b];
}

echo sum([1, 2, 3]) . PHP_EOL;
echo implode(', ', outOfStockItems(['apel' => 0, 'jeruk' => 5, 'mangga' => 0])) . PHP_EOL;
echo introduce(['name' => 'Siti', 'age' => 30]) . PHP_EOL;

[$quotient, $remainder] = divideWithRemainder(17, 5);
echo "{$quotient} sisa {$remainder}" . PHP_EOL;
```

```text
6
apel, mangga
Siti (30 tahun)
3 sisa 2
```

Sekarang langgar tipe PHPDoc-nya. Tempel di akhir `collections.php`:

<!-- demo: collections-wrong append: src/Ch02/collections.php -->
```php
echo introduce(['name' => 'Siti']) . PHP_EOL;
echo sum(['a', 'b']) . PHP_EOL;
```

PHPStan menolak keduanya:

```text
Parameter #1 $person of function Learn\Ch02\introduce expects array{name: string, age: int}, array{name: 'Siti'} given.
Parameter #1 $values of function Learn\Ch02\sum expects list<int>, array{'a', 'b'} given.
```

PHP sendiri tidak menolak di batas fungsi, karena yang ia lihat hanya `array`. Kesalahannya baru muncul di dalam, sebagai gejala:

```text
Warning: Undefined array key "age" in /app/src/Ch02/collections.php on line 41
Siti ( tahun)

Fatal error: Uncaught TypeError: Unsupported operand types: int + string
```

Ini konsekuensi dari tipe yang dihapus saat runtime, persis seperti TS. Karena itu data dari luar program harus divalidasi dulu sebelum diberi tipe PHPDoc. Caranya ada di bagian berikut.

## `void`, `never`, dan `mixed`

Buat `src/Ch02/special.php`:

<!-- file: src/Ch02/special.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function fail(string $message): never
{
    throw new \RuntimeException($message);
}

/**
 * @param array<string, int> $prices
 */
function itemPrice(array $prices, string $name): int
{
    return $prices[$name] ?? fail("Barang {$name} tidak dikenal");
}

function readAge(string $json): int
{
    $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);

    if (!is_array($data) || !isset($data['age']) || !is_int($data['age'])) {
        fail('JSON harus punya field age bertipe int');
    }

    return $data['age'];
}

echo itemPrice(['apel' => 5000], 'apel') . PHP_EOL;
echo readAge('{"name": "Budi", "age": 30}') . PHP_EOL;
```

```text
5000
30
```

- **`void`** berarti fungsi tidak mengembalikan apa pun, seperti `()` di Rust. PHPStan menolak kalau hasilnya dipakai.
- **`never`** berarti fungsi tidak pernah kembali, seperti `!` di Rust. Karena itu `$prices[$name] ?? fail(...)` bertipe `int`, dan setelah `fail(...)` di `readAge` PHPStan tahu kode di bawahnya hanya berjalan kalau semua pengecekan lolos.
- **`mixed`** adalah tipe paling atas: apa pun bisa masuk. `json_decode()` mengembalikan `mixed`, karena isi JSON tidak diketahui sebelum dibaca.

Di level max, `mixed` berperilaku seperti `unknown` di TS: tidak bisa dipakai sebelum dipersempit. Fungsi `readAge` menunjukkan polanya, yaitu periksa bentuknya dulu, baru setelah itu nilainya punya tipe. Tanpa pengecekan, PHPStan menolak. Timpa `scratch.php`:

<!-- demo: mixed norun -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function readAgeUnchecked(string $json): int
{
    $data = json_decode($json, true);

    return $data['age'];
}
```

```text
Cannot access offset 'age' on mixed.
Function Learn\Ch02\readAgeUnchecked() should return int but returns mixed.
```

## Enum

Enum di PHP adalah tipe sungguhan, bukan sekadar konstanta. Buat `src/Ch02/status.php`:

<!-- file: src/Ch02/status.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

enum OrderStatus: string
{
    case Pending = 'pending';
    case Shipped = 'shipped';
    case Completed = 'completed';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Menunggu pembayaran',
            self::Shipped => 'Sedang dikirim',
            self::Completed => 'Selesai',
        };
    }

    public function canBeCancelled(): bool
    {
        return $this === self::Pending;
    }
}

$status = OrderStatus::from('shipped');

echo $status->label() . PHP_EOL;
echo $status->value . PHP_EOL;
var_dump($status->canBeCancelled());
var_dump(OrderStatus::tryFrom('lost'));
echo count(OrderStatus::cases()) . PHP_EOL;
```

```text
Sedang dikirim
shipped
bool(false)
NULL
3
```

- **Backed enum** (`enum OrderStatus: string`) memberi tiap case nilai `string` atau `int`, berguna untuk disimpan ke database atau JSON. Tanpa `: string`, enum disebut *pure* dan case-nya tidak punya nilai.
- **`from()`** mengubah nilai mentah menjadi enum dan melempar error kalau tidak dikenal. **`tryFrom()`** mengembalikan `null`. Keduanya adalah titik validasi untuk data dari luar.
- **Enum boleh punya method**, seperti `impl` pada enum di Rust.
- **Case dibandingkan dengan `===`.** Tiap case adalah satu objek tunggal.

`match` pada enum diperiksa kelengkapannya oleh PHPStan, seperti `match` di Rust. Timpa `scratch.php`:

<!-- demo: match -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

enum Direction
{
    case North;
    case South;
    case East;
    case West;
}

function opposite(Direction $direction): Direction
{
    return match ($direction) {
        Direction::North => Direction::South,
        Direction::South => Direction::North,
        Direction::East => Direction::West,
    };
}

echo opposite(Direction::West)->name . PHP_EOL;
```

```text
Match expression does not handle remaining value: Learn\Ch02\Direction::West
```

Saat runtime, `match` yang tidak menemukan cabang melempar error:

```text
Fatal error: Uncaught UnhandledMatchError: Unhandled match case Learn\Ch02\Direction::West
```

Satu perbedaan besar dengan Rust: case enum di PHP tidak bisa membawa data. Tidak ada padanan `enum Shape { Circle(f64), Rectangle(f64, f64) }`. Untuk itu dipakai beberapa class yang digabung dengan union type, dibahas di [Bab 4](/04-oop) dan [Bab 5](/05-error-handling).

## Tipe yang dipersempit

PHPDoc bisa menyatakan tipe yang lebih sempit daripada tipe native mana pun. Buat `src/Ch02/narrow.php`:

<!-- file: src/Ch02/narrow.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

/**
 * @param 'asc'|'desc' $direction
 * @param int<1, 100> $perPage
 */
function buildQuery(string $direction, int $perPage): string
{
    return "ORDER BY name {$direction} LIMIT {$perPage}";
}

/**
 * @return int<1, 100>
 */
function validatePerPage(int $n): int
{
    if ($n < 1 || $n > 100) {
        throw new \InvalidArgumentException('perPage harus antara 1 dan 100');
    }

    // PHPStan mempersempit $n dari int menjadi int<1, 100>.
    return $n;
}

echo buildQuery('asc', validatePerPage(25)) . PHP_EOL;
```

```text
ORDER BY name asc LIMIT 25
```

Tempel pemanggilan yang salah di akhir `narrow.php`:

<!-- demo: narrow-wrong append: src/Ch02/narrow.php -->
```php
echo buildQuery('naik', 500) . PHP_EOL;
```

```text
Parameter #1 $direction of function Learn\Ch02\buildQuery expects 'asc'|'desc', 'naik' given.
Parameter #2 $perPage of function Learn\Ch02\buildQuery expects int<1, 100>, 500 given.
```

Kalau dijalankan, PHP tidak keberatan, karena yang ia lihat hanya `string` dan `int`:

```text
ORDER BY name naik LIMIT 500
```

Itu sebabnya `validatePerPage` ada: nilai dari luar divalidasi saat runtime, lalu PHPStan membawa hasil validasi itu sebagai tipe ke seluruh kode sesudahnya.

Tipe sempit yang sering dipakai:

| Tipe PHPDoc | Arti |
|---|---|
| `'asc'\|'desc'` | Salah satu literal. Untuk nilai domain, lebih baik pakai enum |
| `int<1, 100>` | Rentang bilangan bulat |
| `positive-int` | Bilangan bulat di atas nol |
| `non-empty-string` | String yang tidak kosong |
| `non-empty-list<T>` | List dengan minimal satu elemen |
| `numeric-string` | String yang berisi angka |

## Generics lewat `@template`

PHP tidak punya generics di bahasanya. PHPStan menyediakannya lewat PHPDoc. Buat `src/Ch02/generics.php`:

<!-- file: src/Ch02/generics.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

/**
 * @template T
 * @param list<T> $items
 * @return T|null
 */
function first(array $items): mixed
{
    return $items[0] ?? null;
}

/**
 * @template T
 * @template U
 * @param list<T> $items
 * @param callable(T): U $fn
 * @return list<U>
 */
function map(array $items, callable $fn): array
{
    $result = [];
    foreach ($items as $item) {
        $result[] = $fn($item);
    }

    return $result;
}

/**
 * @template T of int|float
 * @param non-empty-list<T> $numbers
 * @return T
 */
function largest(array $numbers): int|float
{
    return max($numbers);
}

/**
 * @return list<string>
 */
function fruitNames(): array
{
    return ['apel', 'jeruk', 'mangga'];
}

echo (first(fruitNames()) ?? '(kosong)') . PHP_EOL;
echo implode(', ', map(fruitNames(), fn (string $name): int => strlen($name))) . PHP_EOL;
echo largest([3, 9, 4]) . PHP_EOL;
```

```text
apel
4, 5, 6
9
```

- **`@template T`** mendeklarasikan parameter tipe, padanan `<T>`.
- **`@template T of int|float`** memberi batas, padanan `T: Trait` di Rust atau `T extends ...` di TS.
- **`callable(T): U`** adalah tipe fungsi. `fn (string $name): int => ...` adalah arrow function, dibahas di [Bab 3](/03-dasar-bahasa).
- **Tipe native-nya tetap longgar.** Yang dilihat PHP hanya `array`, `callable`, dan `mixed`.

Tempel di akhir `generics.php` untuk melihat tipe yang disimpulkan:

<!-- demo: generics-dump append: src/Ch02/generics.php norun -->
```php
\PHPStan\dumpType(first(fruitNames()));
\PHPStan\dumpType(map(fruitNames(), fn (string $name): int => strlen($name)));
\PHPStan\dumpType(largest([1.5, 2.5]));
```

```text
Dumped type: string|null
Dumped type: list<int<0, max>>
Dumped type: 1.5|2.5
```

Baris kedua menunjukkan seberapa teliti inferensinya: PHPStan tahu `strlen()` tidak pernah negatif, sehingga `U` menjadi `int<0, max>`, bukan sekadar `int`.

Dan batas `of int|float` benar-benar dijaga:

<!-- demo: generics-wrong append: src/Ch02/generics.php norun -->
```php
echo largest(['a', 'b']) . PHP_EOL;
```

```text
Parameter #1 $numbers of function Learn\Ch02\largest expects non-empty-list<float|int>, array{'a', 'b'} given.
Unable to resolve the template type T in call to function Learn\Ch02\largest
```

Di Rust, generics dimonomorfisasi menjadi kode nyata. Di TS, generics dihapus saat kompilasi. Di PHP, generics bahkan tidak pernah ada di kodenya, hanya di komentar yang dibaca PHPStan. Generics pada class dibahas di [Bab 4](/04-oop).

## Konversi tipe

Cast di PHP tidak pernah gagal. Buat `src/Ch02/conversion.php`:

<!-- file: src/Ch02/conversion.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function toInt(string $text): ?int
{
    $result = filter_var($text, FILTER_VALIDATE_INT);

    return $result === false ? null : $result;
}

var_dump((int) '42');
var_dump((int) '42abc');
var_dump((int) 'abc');
var_dump(toInt('42'));
var_dump(toInt('42abc'));
var_dump((string) 42);
var_dump((float) '3.14');
```

```text
int(42)
int(42)
int(0)
int(42)
NULL
string(2) "42"
float(3.14)
```

`(int) 'abc'` menghasilkan `0` tanpa peringatan. Cast berperilaku seperti `as` di Rust, bukan seperti `parse()`. Untuk input dari luar pakai `filter_var()`, yang bertipe `int|false` dan karenanya memaksa penanganan kegagalan, seperti `"42".parse::<i64>()` yang mengembalikan `Result`.

## Yang tidak ada di PHP

Supaya ekspektasinya tepat, ini yang tidak akan kamu temukan:

- **Tipe untuk variabel lokal.** Selalu disimpulkan.
- **Generics dan type alias di bahasanya.** Hanya lewat PHPDoc.
- **Tuple dan struct ringan.** Pakai array shape di PHPDoc, atau class.
- **Enum pembawa data.** Pakai beberapa class dan union type.
- **`Result` dan `Option`.** `?T` menggantikan `Option`; untuk `Result` lihat [Bab 5](/05-error-handling).
- **Structural typing.** PHP nominal seperti Rust: sebuah class harus menyatakan interface yang ia penuhi. Lihat [Bab 4](/04-oop).
- **Jaminan compile-time.** Semua jaminan statis datang dari PHPStan, sehingga `composer check` yang tidak dijalankan sama dengan tidak punya type checker.

## Ringkasan

- **Dua lapis tipe**: native dijaga PHP saat runtime, PHPDoc hanya dijaga PHPStan dan dihapus saat runtime.
- **Tulis native seketat mungkin**, lalu perhalus dengan PHPDoc: `list<T>`, `array<K, V>`, array shape, literal, rentang, dan `@template`.
- **`?T`, union, dan `T|false`** dipersempit lewat alur kontrol, dan PHPStan memaksa penanganannya.
- **`mixed` di level max adalah `unknown`**: periksa bentuk datanya dulu, baru pakai.
- **Enum** adalah tipe sungguhan dengan `match` yang diperiksa kelengkapannya, tetapi case-nya tidak membawa data.
- **Data dari luar divalidasi saat runtime**, karena tipe PHPDoc tidak menjaga apa pun ketika program berjalan.

## Latihan

Kerjakan tiap soal di file tersendiri di `src/Ch02`, dan pastikan `composer check` lulus.

### 1. Rata-rata yang bisa kosong

Tulis `averageScore()` yang menerima list berisi `int` atau `float` dan mengembalikan rata-ratanya, atau `null` kalau list kosong.

::: details Jawaban
<!-- file: src/Ch02/exercise1.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

/**
 * @param list<int|float> $scores
 */
function averageScore(array $scores): ?float
{
    if ($scores === []) {
        return null;
    }

    return array_sum($scores) / count($scores);
}

var_dump(averageScore([80, 90, 100]));
var_dump(averageScore([]));
```

```text
float(90)
NULL
```

Setelah pengecekan `$scores === []`, PHPStan tahu list-nya tidak kosong, sehingga `count($scores)` tidak mungkin nol. Hasil pembagiannya `int` (270 / 3), dan PHP melebarkannya ke `float` saat dikembalikan.
:::

### 2. `false` yang terlupa

Fungsi ini ditolak PHPStan. Jelaskan kenapa, lalu perbaiki supaya mengembalikan `null` untuk nama file tanpa ekstensi.

<!-- demo: extension -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function extensionUnchecked(string $fileName): string
{
    return substr($fileName, strrpos($fileName, '.'));
}

echo extensionUnchecked('laporan.pdf') . PHP_EOL;
echo extensionUnchecked('README') . PHP_EOL;
```

::: details Jawaban
`strrpos()` bertipe `int|false`, sedangkan parameter kedua `substr()` meminta `int`:

```text
Parameter #2 $offset of function substr expects int, int|false given.
```

Saat dijalankan, input pertama lolos dan input kedua meledak:

```text
.pdf

Fatal error: Uncaught TypeError: substr(): Argument #2 ($offset) must be of type int, false given
```

Perbaikannya menyingkirkan `false` lebih dulu:

<!-- file: src/Ch02/exercise2.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

function extension(string $fileName): ?string
{
    $position = strrpos($fileName, '.');

    if ($position === false) {
        return null;
    }

    return substr($fileName, $position + 1);
}

var_dump(extension('laporan.pdf'));
var_dump(extension('README'));
```

```text
string(3) "pdf"
NULL
```
:::

### 3. Enum dengan `match` lengkap

Buat enum `Day` berbasis `int` (Monday = 1 sampai Sunday = 7) dengan method `isWeekend(): bool`. Jangan pakai cabang `default`.

::: details Jawaban
<!-- file: src/Ch02/exercise3.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

enum Day: int
{
    case Monday = 1;
    case Tuesday = 2;
    case Wednesday = 3;
    case Thursday = 4;
    case Friday = 5;
    case Saturday = 6;
    case Sunday = 7;

    public function isWeekend(): bool
    {
        return match ($this) {
            self::Saturday, self::Sunday => true,
            self::Monday, self::Tuesday, self::Wednesday, self::Thursday, self::Friday => false,
        };
    }
}

var_dump(Day::from(6)->isWeekend());
var_dump(Day::tryFrom(8));
```

```text
bool(true)
NULL
```

Alasannya sama dengan menghindari `_ =>` di Rust: tanpa `default`, PHPStan akan menandai `match` ini begitu ada case baru yang belum ditangani.
:::

### 4. Generics

Tulis `last()`, pasangan dari `first()`: menerima list berisi tipe apa pun dan mengembalikan elemen terakhirnya, atau `null` kalau kosong.

::: details Jawaban
<!-- file: src/Ch02/exercise4.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch02;

/**
 * @template T
 * @param list<T> $items
 * @return T|null
 */
function last(array $items): mixed
{
    return $items[count($items) - 1] ?? null;
}

var_dump(last([10, 20, 30]));
var_dump(last([]));
```

```text
int(30)
NULL
```
:::
