# 3. Dasar bahasa

Sintaks PHP akan terasa akrab: kurung kurawal, titik koma, `if`, `for`, `function`. Bab ini melewati yang sama dan langsung ke bagian yang perilakunya berbeda dari Rust dan TS, karena di situlah bug pendatang baru biasanya lahir.

Lanjutkan di proyek `practice/php-basics`. Buat folder `src/Ch03`, dan awali setiap file dengan `namespace Learn\Ch03;`.

## Variabel dan scope

Buat `src/Ch03/variables.php`:

<!-- file: src/Ch03/variables.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

const TAX = 0.11;

function finalPrice(int $price): float
{
    return $price * (1 + TAX);
}

$price = 20000;
$price = $price + 5000;

echo finalPrice($price) . PHP_EOL;

for ($i = 1; $i <= 3; $i++) {
    $square = $i * $i;
}

// $i dan $square dibuat di dalam for, tetapi masih hidup di sini.
echo "i = {$i}, kuadrat = {$square}" . PHP_EOL;
```

```text
27750
i = 4, kuadrat = 9
```

Empat hal berbeda dari yang kamu kenal:

- **Tidak ada kata kunci deklarasi.** Tidak ada `let` atau `const` untuk variabel lokal. Variabel lahir saat pertama kali diisi.
- **Semua variabel lokal bisa diubah.** Tidak ada padanan `let` tanpa `mut`. Yang tidak bisa diubah hanya konstanta (`const TAX`) dan property `readonly` di [Bab 4](/04-oop).
- **Scope per fungsi, bukan per blok.** Variabel yang dibuat di dalam `if` atau `for` tetap hidup sampai fungsi selesai.
- **Tidak ada shadowing.** Mengisi `$price` lagi berarti menimpa variabel yang sama.

### Fungsi tidak melihat variabel di luarnya

Ini kebalikan dari JS. Timpa `src/Ch03/scratch.php`:

<!-- demo: function-scope -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

$discount = 5000;

function discountedPrice(int $price): int
{
    return $price - $discount;
}

echo discountedPrice(20000) . PHP_EOL;
```

```text
Binary operation "-" between int and mixed results in an error.
Function Learn\Ch03\discountedPrice() should return int but returns (float|int).
Undefined variable: $discount
```

Baris ketiga adalah akar masalahnya; dua lainnya akibatnya. Kalau tetap dijalankan, PHP hanya memberi peringatan lalu menghitung dengan `null`:

```text
Warning: Undefined variable $discount in /app/src/Ch03/scratch.php on line 11
20000
```

Badan fungsi adalah scope tersendiri yang hanya berisi parameternya. Nilai dari luar harus masuk lewat parameter. Konstanta dan fungsi lain tetap terlihat, seperti `TAX` di atas.

### Variabel yang mungkin belum ada

Karena scope-nya per fungsi, variabel yang hanya diisi di satu cabang bisa belum ada di cabang lain:

<!-- demo: maybe-undefined -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

function stockLabel(int $stock): string
{
    if ($stock === 0) {
        $label = 'habis';
    }

    return $label;
}

echo stockLabel(0) . PHP_EOL;
echo stockLabel(5) . PHP_EOL;
```

```text
Variable $label might not be defined.
```

```text
habis

Warning: Undefined variable $label in /app/src/Ch03/scratch.php on line 13

Fatal error: Uncaught TypeError: Learn\Ch03\stockLabel(): Return value must be of type string, null returned
```

Rust menolak ini saat kompilasi. Di PHP, penjaganya PHPStan.

## Nilai dan handle

Aturan terpenting di bab ini: **array adalah nilai, objek adalah handle**. Buat `src/Ch03/values.php`:

<!-- file: src/Ch03/values.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @param list<int> $items
 * @return list<int>
 */
function withZero(array $items): array
{
    $items[] = 0;

    return $items;
}

// Array adalah nilai: assignment menyalin.
$a = [1, 2, 3];
$b = $a;
$b[] = 4;
echo count($a) . ' dan ' . count($b) . PHP_EOL;

// Parameter juga salinan: array milik pemanggil tidak berubah.
$original = [1, 2];
$updated = withZero($original);
echo count($original) . ' dan ' . count($updated) . PHP_EOL;

// Objek adalah handle: assignment menyalin handle-nya, bukan objeknya.
$date = new \DateTime('2026-01-01');
$same = $date;
$same->modify('+1 day');
echo $date->format('Y-m-d') . PHP_EOL;

// clone membuat objek baru.
$copy = clone $date;
$copy->modify('+1 month');
echo $date->format('Y-m-d') . ' dan ' . $copy->format('Y-m-d') . PHP_EOL;

// Sebagian fungsi bawaan mengubah array di tempat.
$numbers = [3, 1, 2];
sort($numbers);
echo implode(', ', $numbers) . PHP_EOL;
```

```text
3 dan 4
2 dan 3
2026-01-02
2026-01-02 dan 2026-02-02
1, 2, 3
```

| `b = a` untuk... | Rust | TypeScript | PHP |
|---|---|---|---|
| Array | `a` berpindah ke `b` | Keduanya menunjuk array yang sama | `b` adalah salinan |
| Objek | `a` berpindah ke `b` | Keduanya menunjuk objek yang sama | Keduanya menunjuk objek yang sama |
| String, angka | Disalin atau berpindah | Disalin | Disalin |

Untuk array, PHP berperilaku seperti `let b = a.clone()` di Rust, tanpa perlu ditulis. Salinannya murah karena *copy-on-write*: data baru benar-benar digandakan ketika salah satu sisi diubah.

Konsekuensinya menyenangkan: fungsi yang menerima array tidak mungkin merusak array pemanggilnya. Untuk objek, perilakunya sama dengan JS, sehingga objek yang bisa berubah seperti `\DateTime` perlu diwaspadai. Karena itu kode PHP modern memakai `\DateTimeImmutable` dan class `readonly`.

::: warning Fungsi yang mengubah di tempat
`sort()`, `usort()`, `shuffle()`, `array_push()`, `array_pop()`, dan `array_shift()` menerima array lewat referensi dan mengubahnya langsung. Nilai kembaliannya bukan array yang sudah diurutkan. Fungsi seperti `array_map()` dan `array_filter()` sebaliknya: mengembalikan array baru.
:::

PHP juga punya referensi eksplisit dengan `&`, misalnya `function f(array &$x)`. Hindari di kode sendiri: ia mematikan semua jaminan di atas, dan hampir selalu bisa diganti dengan mengembalikan nilai baru.

## Array: list dan map sekaligus

PHP hanya punya satu struktur data bawaan untuk `Vec`, `HashMap`, tuple, dan struct sekaligus: `array`, sebuah map yang mengingat urutan penyisipan. Buat `src/Ch03/arrays.php`:

<!-- file: src/Ch03/arrays.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

$fruits = ['apel', 'jeruk'];
$stock = ['mangga' => 5, 'apel' => 0];
$stock['jeruk'] = 12;

// List menjadi array JSON, map menjadi objek JSON. Urutannya urutan penyisipan.
echo json_encode($fruits, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode($stock, JSON_THROW_ON_ERROR) . PHP_EOL;

// Kunci hanya int atau string, dan string berisi bilangan bulat diubah menjadi int.
$keys = ['1' => 'a', '01' => 'b', '1.5' => 'c'];
var_dump(array_keys($keys));

// Menghapus elemen meninggalkan lubang: array itu bukan list lagi.
$values = [10, 20, 30];
unset($values[1]);
echo json_encode($values, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode(array_values($values), JSON_THROW_ON_ERROR) . PHP_EOL;

// Destructuring untuk list dan untuk kunci string.
[$first, $second] = $fruits;
['mangga' => $mangoCount] = $stock;
echo "{$first}, {$second}, {$mangoCount}" . PHP_EOL;

// Spread menggabungkan array.
$all = [...$fruits, 'mangga', ...['pisang']];
echo implode(', ', $all) . PHP_EOL;
```

```text
["apel","jeruk"]
{"mangga":5,"apel":0,"jeruk":12}
array(3) {
  [0]=>
  int(1)
  [1]=>
  string(2) "01"
  [2]=>
  string(3) "1.5"
}
{"0":10,"2":30}
[10,30]
apel, jeruk, 5
apel, jeruk, mangga, pisang
```

- **List hanyalah array dengan kunci 0, 1, 2, dan seterusnya, berurutan.** Itulah arti `list<T>` di PHPDoc, dan bisa dicek dengan `array_is_list()`.
- **Kunci `'1'` menjadi `int` 1.** Kunci string yang berbentuk bilangan bulat selalu dikonversi. Tidak ada cara mematikannya.
- **`unset()` tidak menggeser elemen.** Hasilnya array berlubang yang di-encode sebagai objek JSON. `array_values()` menomori ulang.

### Fungsi array

Buat `src/Ch03/array-functions.php`:

<!-- file: src/Ch03/array-functions.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @return list<int>
 */
function scoreList(): array
{
    return [72, 95, 58, 88];
}

$scores = scoreList();

// map
$bonus = array_map(fn (int $n): int => $n + 5, $scores);
echo implode(', ', $bonus) . PHP_EOL;

// filter: kunci lama dipertahankan, jadi hasilnya bukan list
$passed = array_filter($scores, fn (int $n): bool => $n >= 70);
echo json_encode($passed, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode(array_values($passed), JSON_THROW_ON_ERROR) . PHP_EOL;

// reduce
$total = array_reduce($scores, fn (int $sum, int $n): int => $sum + $n, 0);
echo $total . PHP_EOL;

// find, any, all (PHP 8.4)
var_dump(array_find($scores, fn (int $n): bool => $n > 90));
var_dump(array_any($scores, fn (int $n): bool => $n < 60));
var_dump(array_all($scores, fn (int $n): bool => $n >= 50));

// first, last (PHP 8.5)
var_dump(array_first($scores), array_last($scores));

// urutkan salinannya, dari besar ke kecil
$sorted = $scores;
usort($sorted, fn (int $a, int $b): int => $b <=> $a);
echo implode(', ', $sorted) . PHP_EOL;

// argumen ketiga membuat in_array membandingkan secara ketat
var_dump(in_array(95, $scores, true));
```

```text
77, 100, 63, 93
{"0":72,"1":95,"3":88}
[72,95,88]
313
int(95)
bool(true)
bool(true)
int(72)
int(88)
95, 88, 72, 58
bool(true)
```

Dua kejanggalan warisan yang perlu dihafal:

- **Urutan argumen tidak konsisten.** `array_map($fn, $array)` menaruh fungsi di depan, sedangkan `array_filter($array, $fn)` dan `array_reduce($array, $fn, $initial)` di belakang.
- **`array_filter()` mempertahankan kunci.** Hasilnya bukan list. PHPStan tahu soal ini:

<!-- demo: filter-list norun -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @param list<int> $scores
 * @return list<int>
 */
function passingScores(array $scores): array
{
    return array_filter($scores, fn (int $n): bool => $n >= 70);
}
```

```text
Function Learn\Ch03\passingScores() should return list<int> but returns array<int<0, max>, int<70, max>>.
```

Perbaikannya membungkus dengan `array_values()`. Ini contoh bagus kenapa `list<T>` dan `array<int, T>` dibedakan: bedanya nyata begitu datanya menjadi JSON.

## String

Buat `src/Ch03/text.php`:

<!-- file: src/Ch03/text.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

function fileName(): string
{
    return 'laporan.pdf';
}

$name = 'Siti';
$item = ['product' => 'Kopi', 'price' => 18000];

// Kutip ganda melakukan interpolasi, kutip tunggal tidak.
echo "Halo, {$name}!" . PHP_EOL;
echo 'Halo, {$name}!' . PHP_EOL;
echo "{$item['product']} seharga Rp " . number_format($item['price'], 0, ',', '.') . PHP_EOL;

// sprintf untuk format yang lebih rumit
echo sprintf('%s membeli %d %s (%.1f%%)', $name, 2, 'kopi', 12.5) . PHP_EOL;

// Heredoc: string banyak baris dengan interpolasi
$receipt = <<<TEXT
    Pembeli: {$name}
    Produk:  {$item['product']}
    TEXT;
echo $receipt . PHP_EOL;

// Fungsi string yang paling sering dipakai
$file = fileName();
var_dump(str_contains($file, '.pdf'));
var_dump(str_starts_with($file, 'lap'));
echo strtoupper(trim('  rapi  ')) . PHP_EOL;
echo implode(' | ', explode(',', 'a,b,c')) . PHP_EOL;
echo str_replace(' ', '-', 'satu dua tiga') . PHP_EOL;

// Fungsi tanpa awalan mb_ hanya mengenal ASCII
echo strtoupper('é') . ' ' . mb_strtoupper('é') . PHP_EOL;
```

```text
Halo, Siti!
Halo, {$name}!
Kopi seharga Rp 18.000
Siti membeli 2 kopi (12.5%)
Pembeli: Siti
Produk:  Kopi
bool(true)
bool(true)
RAPI
a | b | c
satu-dua-tiga
é É
```

- **String adalah nilai**, seperti array: disalin saat di-assign, dan dibandingkan isinya dengan `===`.
- **Heredoc** membuang indentasi sebanyak indentasi penutupnya (`TEXT;`). Varian tanpa interpolasi disebut nowdoc, ditulis `<<<'TEXT'`.
- **Tidak ada method pada string.** Semuanya fungsi global: `strtoupper($s)`, bukan `s.to_uppercase()`. Karena itu pipe operator di bawah terasa berguna.

## Perbandingan: selalu `===`

`==` membandingkan setelah mengonversi tipe, dengan aturan yang sulit ditebak. Timpa `scratch.php`:

<!-- demo: comparison -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

var_dump('1' == '01');
var_dump('10' == '1e1');
var_dump(100 == '1e2');
var_dump(null == false);
var_dump([] == false);
var_dump('abc' == 0);

var_dump('1' === '01');
var_dump(100 === '1e2');
```

```text
bool(true)
bool(true)
bool(true)
bool(true)
bool(true)
bool(false)
bool(false)
bool(false)
```

Dua string berbeda dianggap sama karena keduanya "terlihat seperti angka". Aturannya di materi ini sederhana:

- **Selalu pakai `===` dan `!==`.** Keduanya membandingkan tipe dan nilai, tanpa konversi.
- **`match` membandingkan secara ketat**, sedangkan `switch` memakai `==`. Karena itu materi ini tidak memakai `switch`.
- **`<=>`** mengembalikan -1, 0, atau 1, dipakai untuk pengurutan seperti di `usort()` tadi.

PHPStan ikut menegur `scratch.php` barusan, baris demi baris:

```text
Loose comparison using == between '1' and '01' will always evaluate to true.
Strict comparison using === between '1' and '01' will always evaluate to false.
```

### Truthiness

Di kondisi `if`, nilai apa pun dikonversi ke `bool`. Yang dianggap salah: `false`, `0`, `0.0`, `''`, `'0'`, `[]`, dan `null`. Perhatikan `'0'`: string berisi angka nol dianggap salah, sehingga `if ($input)` gagal untuk input `"0"`. Tulis kondisinya secara eksplisit: `$text !== ''`, `$items !== []`, `$value !== null`.

## Alur kontrol

`if`, `while`, `for`, dan `foreach` bekerja seperti yang kamu duga. Yang layak dibahas adalah `match` dan operator untuk `null`. Buat `src/Ch03/control-flow.php`:

<!-- file: src/Ch03/control-flow.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

function letterGrade(int $score): string
{
    return match (true) {
        $score >= 85 => 'A',
        $score >= 70 => 'B',
        $score >= 55 => 'C',
        default => 'D',
    };
}

function dayType(int $number): string
{
    return match ($number) {
        1, 7 => 'akhir pekan',
        2, 3, 4, 5, 6 => 'hari kerja',
        default => throw new \InvalidArgumentException("Nomor hari {$number} tidak valid"),
    };
}

/**
 * @param array<string, int> $counts
 * @return array<string, int>
 */
function recordWord(array $counts, string $word): array
{
    $counts[$word] ??= 0;
    $counts[$word]++;

    return $counts;
}

echo letterGrade(91) . letterGrade(60) . letterGrade(10) . PHP_EOL;
echo dayType(7) . ', ' . dayType(3) . PHP_EOL;

$counts = [];
foreach (['kopi', 'teh', 'kopi'] as $word) {
    $counts = recordWord($counts, $word);
}

foreach ($counts as $word => $count) {
    echo "{$word}: {$count}" . PHP_EOL;
}

var_dump((bool) '0', (bool) '0.0', (bool) [], (bool) 'false');
```

```text
ACD
akhir pekan, hari kerja
kopi: 2
teh: 1
bool(false)
bool(true)
bool(false)
bool(true)
```

- **`match` adalah ekspresi**: menghasilkan nilai, tidak ada fallthrough, dan satu cabang boleh berisi beberapa nilai.
- **`match (true)`** adalah idiom untuk rentang: cabang pertama yang kondisinya benar yang dipakai.
- **`throw` juga ekspresi**, sehingga bisa menjadi isi cabang atau sisi kanan `??`.
- **`??=`** mengisi hanya kalau sisi kirinya belum ada atau `null`.

Dibanding Rust, `match` di PHP jauh lebih sederhana: ia hanya membandingkan nilai. Tidak ada pattern, destructuring, atau guard. Dan `if` bukan ekspresi; untuk itu pakai operator ternary `$a ? $b : $c` atau `match`.

## Fungsi dan closure

Buat `src/Ch03/functions.php`:

<!-- file: src/Ch03/functions.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

function makeSlug(string $title, string $separator = '-', bool $lowercase = true): string
{
    $slug = str_replace(' ', $separator, trim($title));

    return $lowercase ? strtolower($slug) : $slug;
}

function sum(int ...$numbers): int
{
    return array_sum($numbers);
}

/**
 * @param \Closure(int): int $fn
 */
function twice(\Closure $fn, int $value): int
{
    return $fn($fn($value));
}

/**
 * @return \Generator<int, int>
 */
function intRange(int $start, int $end): \Generator
{
    for ($i = $start; $i <= $end; $i++) {
        yield $i;
    }
}

// Named argument: lewati parameter yang punya nilai bawaan.
echo makeSlug('Belajar PHP Modern') . PHP_EOL;
echo makeSlug('Belajar PHP Modern', lowercase: false) . PHP_EOL;

// Variadic dan spread.
echo sum(1, 2, 3) . PHP_EOL;
echo sum(...[10, 20]) . PHP_EOL;

// Closure menangkap variabel luar lewat use, dan yang ditangkap adalah salinannya.
$factor = 3;
$multiply = function (int $n) use ($factor): int {
    return $n * $factor;
};
$factor = 100;
echo $multiply(5) . PHP_EOL;

// Arrow function menangkap otomatis, juga sebagai salinan.
$add = fn (int $n): int => $n + $factor;
echo $add(5) . PHP_EOL;

echo twice($multiply, 2) . PHP_EOL;

// Fungsi yang sudah ada dijadikan closure dengan (...).
$length = strlen(...);
echo $length('halo') . PHP_EOL;

// Pipe operator (PHP 8.5): nilai di kiri menjadi argumen fungsi di kanan.
$slug = '  Halo Dunia  '
    |> trim(...)
    |> strtolower(...)
    |> (fn (string $s): string => str_replace(' ', '-', $s));
echo $slug . PHP_EOL;

// Generator menghasilkan nilai satu per satu, tanpa membangun array.
foreach (intRange(1, 3) as $n) {
    echo $n . ' ';
}
echo PHP_EOL;
```

```text
belajar-php-modern
Belajar-PHP-Modern
6
30
15
105
18
4
halo-dunia
1 2 3 
```

### Closure menangkap salinan

Baris `echo $multiply(5)` mencetak 15, bukan 500, walaupun `$factor` sudah diubah menjadi 100. Inilah beda terbesar dengan JS:

| | Yang ditangkap | Cara menulis |
|---|---|---|
| JS | Variabelnya sendiri, perubahan terlihat dari dua sisi | Otomatis |
| Rust | Pinjaman, atau kepemilikan dengan `move` | Otomatis, atau `move` |
| PHP `function () use ($x)` | Salinan nilai saat closure dibuat | Eksplisit lewat `use` |
| PHP `fn () => ...` | Salinan nilai saat closure dibuat | Otomatis |

Closure PHP berperilaku seperti closure `move` di Rust atas nilai yang sudah di-`clone`. Closure tidak bisa mengubah variabel di luarnya, kecuali variabel itu ditangkap dengan referensi (`use (&$x)`), yang dicoba di latihan.

### Tipe untuk fungsi

- **`\Closure`** adalah tipe native untuk closure. Bentuk parameternya ditulis di PHPDoc: `\Closure(int): int`.
- **`callable`** lebih longgar: ia juga menerima string nama fungsi seperti `'strlen'`. Pakai `\Closure` untuk kode baru.
- **`strlen(...)`** mengubah fungsi atau method yang sudah ada menjadi `\Closure`.

### Pipe operator

`$x |> f(...)` sama dengan `f($x)`. Gunanya membaca rangkaian transformasi dari kiri ke kanan, pengganti method chaining yang tidak dimiliki string dan array. Sisi kanannya harus fungsi dengan satu parameter, dan arrow function harus diberi kurung.

### Generator

Fungsi yang memakai `yield` mengembalikan `\Generator`, iterator malas seperti `impl Iterator` di Rust atau `function*` di JS. Tipe isinya ditulis `\Generator<Key, Value>`.

## Ringkasan

- **Scope per fungsi**, tanpa deklarasi, tanpa shadowing, dan fungsi tidak melihat variabel di luarnya.
- **Array dan string adalah nilai** yang disalin saat di-assign atau dikirim ke fungsi. **Objek adalah handle.**
- **`array` adalah map berurutan.** List hanyalah array berkunci 0, 1, 2, dan seterusnya, dan `array_filter()` serta `unset()` merusak sifat itu.
- **Selalu `===`**, tulis kondisi secara eksplisit, dan pakai `match` alih-alih `switch`.
- **Closure menangkap salinan**, secara eksplisit lewat `use` atau otomatis lewat `fn`.
- **Pipe operator** menggantikan method chaining untuk fungsi global.

## Latihan

### 1. Nilai atau handle

Tebak outputnya sebelum menjalankan.

<!-- file: src/Ch03/exercise1.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

$a = ['x' => 1];
$b = $a;
$b['x'] = 2;

$o1 = new \ArrayObject(['x' => 1]);
$o2 = $o1;
$o2['x'] = 2;

echo $a['x'] . ' ' . $o1['x'] . PHP_EOL;
```

::: details Jawaban
```text
1 2
```

`$b` adalah salinan array `$a`, jadi `$a` tidak berubah. `$o1` dan `$o2` adalah dua handle ke objek `\ArrayObject` yang sama, jadi perubahan lewat `$o2` terlihat dari `$o1`.
:::

### 2. Mengelompokkan

Tulis `groupByLength()` yang menerima list kata dan mengembalikan map dari panjang kata ke list kata dengan panjang itu.

::: details Jawaban
<!-- file: src/Ch03/exercise2.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @param list<string> $words
 * @return array<int, list<string>>
 */
function groupByLength(array $words): array
{
    $groups = [];
    foreach ($words as $word) {
        $groups[strlen($word)][] = $word;
    }

    return $groups;
}

echo json_encode(groupByLength(['api', 'air', 'tanah', 'udara']), JSON_THROW_ON_ERROR) . PHP_EOL;
```

```text
{"3":["api","air"],"5":["tanah","udara"]}
```

`$groups[strlen($word)][] = $word` membuat list di dalamnya secara otomatis kalau kuncinya belum ada. Di Rust ini padanan `entry(k).or_default().push(v)`.
:::

### 3. Rata-rata yang lulus

Tulis `passingAverage()` yang menerima `list<int>` dan mengembalikan rata-rata dari nilai yang minimal 70, atau `null` kalau tidak ada yang lulus.

::: details Jawaban
<!-- file: src/Ch03/exercise3.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @param list<int> $scores
 */
function passingAverage(array $scores): ?float
{
    $passed = array_values(array_filter($scores, fn (int $n): bool => $n >= 70));

    if ($passed === []) {
        return null;
    }

    return array_sum($passed) / count($passed);
}

var_dump(passingAverage([72, 95, 58, 88]));
var_dump(passingAverage([10, 20]));
```

```text
float(85)
NULL
```
:::

### 4. Penghitung

Tulis `makeCounter()` yang mengembalikan closure. Setiap kali dipanggil, closure itu mengembalikan angka berikutnya: 1, 2, 3. Ingat bahwa closure menangkap salinan.

::: details Jawaban
<!-- file: src/Ch03/exercise4.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch03;

/**
 * @return \Closure(): int
 */
function makeCounter(): \Closure
{
    $n = 0;

    return function () use (&$n): int {
        $n++;

        return $n;
    };
}

$counter = makeCounter();
echo $counter() . $counter() . $counter() . PHP_EOL;
```

```text
123
```

`use (&$n)` menangkap referensi ke `$n`, bukan salinannya, sehingga closure bisa mengubahnya di antara pemanggilan. Tanpa `&`, setiap pemanggilan mulai lagi dari salinan bernilai 0 dan hasilnya `111`. Ini satu dari sedikit tempat referensi masih wajar dipakai. Alternatif yang lebih umum adalah objek dengan property, dibahas di [Bab 4](/04-oop).
:::
