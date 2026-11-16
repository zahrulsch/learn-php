# 3. Dasar bahasa

Sintaks PHP akan terasa akrab: kurung kurawal, titik koma, `if`, `for`, `function`. Bab ini melewati yang sama dan langsung ke bagian yang perilakunya berbeda dari Rust dan TS, karena di situlah bug pendatang baru biasanya lahir.

Lanjutkan di proyek `latihan/php-dasar`. Buat folder `src/Bab03`, dan awali setiap file dengan `namespace Belajar\Bab03;`.

## Variabel dan scope

Buat `src/Bab03/variabel.php`:

<!-- file: src/Bab03/variabel.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

const PAJAK = 0.11;

function hargaAkhir(int $harga): float
{
    return $harga * (1 + PAJAK);
}

$harga = 20000;
$harga = $harga + 5000;

echo hargaAkhir($harga) . PHP_EOL;

for ($i = 1; $i <= 3; $i++) {
    $kuadrat = $i * $i;
}

// $i dan $kuadrat dibuat di dalam for, tetapi masih hidup di sini.
echo "i = {$i}, kuadrat = {$kuadrat}" . PHP_EOL;
```

```text
27750
i = 4, kuadrat = 9
```

Empat hal berbeda dari yang kamu kenal:

- **Tidak ada kata kunci deklarasi.** Tidak ada `let` atau `const` untuk variabel lokal. Variabel lahir saat pertama kali diisi.
- **Semua variabel lokal bisa diubah.** Tidak ada padanan `let` tanpa `mut`. Yang tidak bisa diubah hanya konstanta (`const PAJAK`) dan property `readonly` di [Bab 4](/04-oop).
- **Scope per fungsi, bukan per blok.** Variabel yang dibuat di dalam `if` atau `for` tetap hidup sampai fungsi selesai.
- **Tidak ada shadowing.** Mengisi `$harga` lagi berarti menimpa variabel yang sama.

### Fungsi tidak melihat variabel di luarnya

Ini kebalikan dari JS. Timpa `src/Bab03/coba.php`:

<!-- demo: scope-fungsi -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

$diskon = 5000;

function hargaDiskon(int $harga): int
{
    return $harga - $diskon;
}

echo hargaDiskon(20000) . PHP_EOL;
```

```text
Binary operation "-" between int and mixed results in an error.
Function Belajar\Bab03\hargaDiskon() should return int but returns (float|int).
Undefined variable: $diskon
```

Baris ketiga adalah akar masalahnya; dua lainnya akibatnya. Kalau tetap dijalankan, PHP hanya memberi peringatan lalu menghitung dengan `null`:

```text
Warning: Undefined variable $diskon in /app/src/Bab03/coba.php on line 11
20000
```

Badan fungsi adalah scope tersendiri yang hanya berisi parameternya. Nilai dari luar harus masuk lewat parameter. Konstanta dan fungsi lain tetap terlihat, seperti `PAJAK` di atas.

### Variabel yang mungkin belum ada

Karena scope-nya per fungsi, variabel yang hanya diisi di satu cabang bisa belum ada di cabang lain:

<!-- demo: mungkin -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

function labelStok(int $stok): string
{
    if ($stok === 0) {
        $label = 'habis';
    }

    return $label;
}

echo labelStok(0) . PHP_EOL;
echo labelStok(5) . PHP_EOL;
```

```text
Variable $label might not be defined.
```

```text
habis

Warning: Undefined variable $label in /app/src/Bab03/coba.php on line 13

Fatal error: Uncaught TypeError: Belajar\Bab03\labelStok(): Return value must be of type string, null returned
```

Rust menolak ini saat kompilasi. Di PHP, penjaganya PHPStan.

## Nilai dan handle

Aturan terpenting di bab ini: **array adalah nilai, objek adalah handle**. Buat `src/Bab03/nilai.php`:

<!-- file: src/Bab03/nilai.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @param list<int> $daftar
 * @return list<int>
 */
function denganNol(array $daftar): array
{
    $daftar[] = 0;

    return $daftar;
}

// Array adalah nilai: assignment menyalin.
$a = [1, 2, 3];
$b = $a;
$b[] = 4;
echo count($a) . ' dan ' . count($b) . PHP_EOL;

// Parameter juga salinan: array milik pemanggil tidak berubah.
$asli = [1, 2];
$baru = denganNol($asli);
echo count($asli) . ' dan ' . count($baru) . PHP_EOL;

// Objek adalah handle: assignment menyalin handle-nya, bukan objeknya.
$tanggal = new \DateTime('2026-01-01');
$sama = $tanggal;
$sama->modify('+1 day');
echo $tanggal->format('Y-m-d') . PHP_EOL;

// clone membuat objek baru.
$salinan = clone $tanggal;
$salinan->modify('+1 month');
echo $tanggal->format('Y-m-d') . ' dan ' . $salinan->format('Y-m-d') . PHP_EOL;

// Sebagian fungsi bawaan mengubah array di tempat.
$angka = [3, 1, 2];
sort($angka);
echo implode(', ', $angka) . PHP_EOL;
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

PHP hanya punya satu struktur data bawaan untuk `Vec`, `HashMap`, tuple, dan struct sekaligus: `array`, sebuah map yang mengingat urutan penyisipan. Buat `src/Bab03/larik.php`:

<!-- file: src/Bab03/larik.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

$buah = ['apel', 'jeruk'];
$stok = ['mangga' => 5, 'apel' => 0];
$stok['jeruk'] = 12;

// List menjadi array JSON, map menjadi objek JSON. Urutannya urutan penyisipan.
echo json_encode($buah, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode($stok, JSON_THROW_ON_ERROR) . PHP_EOL;

// Kunci hanya int atau string, dan string berisi bilangan bulat diubah menjadi int.
$kunci = ['1' => 'a', '01' => 'b', '1.5' => 'c'];
var_dump(array_keys($kunci));

// Menghapus elemen meninggalkan lubang: array itu bukan list lagi.
$nilai = [10, 20, 30];
unset($nilai[1]);
echo json_encode($nilai, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode(array_values($nilai), JSON_THROW_ON_ERROR) . PHP_EOL;

// Destructuring untuk list dan untuk kunci string.
[$pertama, $kedua] = $buah;
['mangga' => $jumlahMangga] = $stok;
echo "{$pertama}, {$kedua}, {$jumlahMangga}" . PHP_EOL;

// Spread menggabungkan array.
$semua = [...$buah, 'mangga', ...['pisang']];
echo implode(', ', $semua) . PHP_EOL;
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

Buat `src/Bab03/fungsi-larik.php`:

<!-- file: src/Bab03/fungsi-larik.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @return list<int>
 */
function daftarNilai(): array
{
    return [72, 95, 58, 88];
}

$nilai = daftarNilai();

// map
$bonus = array_map(fn (int $n): int => $n + 5, $nilai);
echo implode(', ', $bonus) . PHP_EOL;

// filter: kunci lama dipertahankan, jadi hasilnya bukan list
$lulus = array_filter($nilai, fn (int $n): bool => $n >= 70);
echo json_encode($lulus, JSON_THROW_ON_ERROR) . PHP_EOL;
echo json_encode(array_values($lulus), JSON_THROW_ON_ERROR) . PHP_EOL;

// reduce
$total = array_reduce($nilai, fn (int $jumlah, int $n): int => $jumlah + $n, 0);
echo $total . PHP_EOL;

// find, any, all (PHP 8.4)
var_dump(array_find($nilai, fn (int $n): bool => $n > 90));
var_dump(array_any($nilai, fn (int $n): bool => $n < 60));
var_dump(array_all($nilai, fn (int $n): bool => $n >= 50));

// first, last (PHP 8.5)
var_dump(array_first($nilai), array_last($nilai));

// urutkan salinannya, dari besar ke kecil
$urut = $nilai;
usort($urut, fn (int $a, int $b): int => $b <=> $a);
echo implode(', ', $urut) . PHP_EOL;

// argumen ketiga membuat in_array membandingkan secara ketat
var_dump(in_array(95, $nilai, true));
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

- **Urutan argumen tidak konsisten.** `array_map($fn, $array)` menaruh fungsi di depan, sedangkan `array_filter($array, $fn)` dan `array_reduce($array, $fn, $awal)` di belakang.
- **`array_filter()` mempertahankan kunci.** Hasilnya bukan list. PHPStan tahu soal ini:

<!-- demo: filter-list norun -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @param list<int> $nilai
 * @return list<int>
 */
function yangLulus(array $nilai): array
{
    return array_filter($nilai, fn (int $n): bool => $n >= 70);
}
```

```text
Function Belajar\Bab03\yangLulus() should return list<int> but returns array<int<0, max>, int<70, max>>.
```

Perbaikannya membungkus dengan `array_values()`. Ini contoh bagus kenapa `list<T>` dan `array<int, T>` dibedakan: bedanya nyata begitu datanya menjadi JSON.

## String

Buat `src/Bab03/teks.php`:

<!-- file: src/Bab03/teks.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

function namaBerkas(): string
{
    return 'laporan.pdf';
}

$nama = 'Siti';
$item = ['produk' => 'Kopi', 'harga' => 18000];

// Kutip ganda melakukan interpolasi, kutip tunggal tidak.
echo "Halo, {$nama}!" . PHP_EOL;
echo 'Halo, {$nama}!' . PHP_EOL;
echo "{$item['produk']} seharga Rp " . number_format($item['harga'], 0, ',', '.') . PHP_EOL;

// sprintf untuk format yang lebih rumit
echo sprintf('%s membeli %d %s (%.1f%%)', $nama, 2, 'kopi', 12.5) . PHP_EOL;

// Heredoc: string banyak baris dengan interpolasi
$struk = <<<TEKS
    Pembeli: {$nama}
    Produk:  {$item['produk']}
    TEKS;
echo $struk . PHP_EOL;

// Fungsi string yang paling sering dipakai
$berkas = namaBerkas();
var_dump(str_contains($berkas, '.pdf'));
var_dump(str_starts_with($berkas, 'lap'));
echo strtoupper(trim('  rapi  ')) . PHP_EOL;
echo implode(' | ', explode(',', 'a,b,c')) . PHP_EOL;
echo str_replace(' ', '-', 'satu dua tiga') . PHP_EOL;

// Fungsi tanpa awalan mb_ hanya mengenal ASCII
echo strtoupper('é') . ' ' . mb_strtoupper('é') . PHP_EOL;
```

```text
Halo, Siti!
Halo, {$nama}!
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
- **Heredoc** membuang indentasi sebanyak indentasi penutupnya (`TEKS;`). Varian tanpa interpolasi disebut nowdoc, ditulis `<<<'TEKS'`.
- **Tidak ada method pada string.** Semuanya fungsi global: `strtoupper($s)`, bukan `s.to_uppercase()`. Karena itu pipe operator di bawah terasa berguna.

## Perbandingan: selalu `===`

`==` membandingkan setelah mengonversi tipe, dengan aturan yang sulit ditebak. Timpa `coba.php`:

<!-- demo: banding -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

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

PHPStan ikut menegur `coba.php` barusan, baris demi baris:

```text
Loose comparison using == between '1' and '01' will always evaluate to true.
Strict comparison using === between '1' and '01' will always evaluate to false.
```

### Truthiness

Di kondisi `if`, nilai apa pun dikonversi ke `bool`. Yang dianggap salah: `false`, `0`, `0.0`, `''`, `'0'`, `[]`, dan `null`. Perhatikan `'0'`: string berisi angka nol dianggap salah, sehingga `if ($input)` gagal untuk input `"0"`. Tulis kondisinya secara eksplisit: `$teks !== ''`, `$daftar !== []`, `$nilai !== null`.

## Alur kontrol

`if`, `while`, `for`, dan `foreach` bekerja seperti yang kamu duga. Yang layak dibahas adalah `match` dan operator untuk `null`. Buat `src/Bab03/alur.php`:

<!-- file: src/Bab03/alur.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

function nilaiHuruf(int $skor): string
{
    return match (true) {
        $skor >= 85 => 'A',
        $skor >= 70 => 'B',
        $skor >= 55 => 'C',
        default => 'D',
    };
}

function jenisHari(int $nomor): string
{
    return match ($nomor) {
        1, 7 => 'akhir pekan',
        2, 3, 4, 5, 6 => 'hari kerja',
        default => throw new \InvalidArgumentException("Nomor hari {$nomor} tidak valid"),
    };
}

/**
 * @param array<string, int> $hitungan
 * @return array<string, int>
 */
function catatKata(array $hitungan, string $kata): array
{
    $hitungan[$kata] ??= 0;
    $hitungan[$kata]++;

    return $hitungan;
}

echo nilaiHuruf(91) . nilaiHuruf(60) . nilaiHuruf(10) . PHP_EOL;
echo jenisHari(7) . ', ' . jenisHari(3) . PHP_EOL;

$hitungan = [];
foreach (['kopi', 'teh', 'kopi'] as $kata) {
    $hitungan = catatKata($hitungan, $kata);
}

foreach ($hitungan as $kata => $jumlah) {
    echo "{$kata}: {$jumlah}" . PHP_EOL;
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

Buat `src/Bab03/fungsi.php`:

<!-- file: src/Bab03/fungsi.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

function buatSlug(string $judul, string $pemisah = '-', bool $hurufKecil = true): string
{
    $slug = str_replace(' ', $pemisah, trim($judul));

    return $hurufKecil ? strtolower($slug) : $slug;
}

function jumlahkan(int ...$angka): int
{
    return array_sum($angka);
}

/**
 * @param \Closure(int): int $fn
 */
function duaKali(\Closure $fn, int $nilai): int
{
    return $fn($fn($nilai));
}

/**
 * @return \Generator<int, int>
 */
function rentang(int $awal, int $akhir): \Generator
{
    for ($i = $awal; $i <= $akhir; $i++) {
        yield $i;
    }
}

// Named argument: lewati parameter yang punya nilai bawaan.
echo buatSlug('Belajar PHP Modern') . PHP_EOL;
echo buatSlug('Belajar PHP Modern', hurufKecil: false) . PHP_EOL;

// Variadic dan spread.
echo jumlahkan(1, 2, 3) . PHP_EOL;
echo jumlahkan(...[10, 20]) . PHP_EOL;

// Closure menangkap variabel luar lewat use, dan yang ditangkap adalah salinannya.
$faktor = 3;
$kali = function (int $n) use ($faktor): int {
    return $n * $faktor;
};
$faktor = 100;
echo $kali(5) . PHP_EOL;

// Arrow function menangkap otomatis, juga sebagai salinan.
$tambah = fn (int $n): int => $n + $faktor;
echo $tambah(5) . PHP_EOL;

echo duaKali($kali, 2) . PHP_EOL;

// Fungsi yang sudah ada dijadikan closure dengan (...).
$panjang = strlen(...);
echo $panjang('halo') . PHP_EOL;

// Pipe operator (PHP 8.5): nilai di kiri menjadi argumen fungsi di kanan.
$slug = '  Halo Dunia  '
    |> trim(...)
    |> strtolower(...)
    |> (fn (string $s): string => str_replace(' ', '-', $s));
echo $slug . PHP_EOL;

// Generator menghasilkan nilai satu per satu, tanpa membangun array.
foreach (rentang(1, 3) as $n) {
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

Baris `echo $kali(5)` mencetak 15, bukan 500, walaupun `$faktor` sudah diubah menjadi 100. Inilah beda terbesar dengan JS:

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

Fungsi yang memakai `yield` mengembalikan `\Generator`, iterator malas seperti `impl Iterator` di Rust atau `function*` di JS. Tipe isinya ditulis `\Generator<Kunci, Nilai>`.

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

<!-- file: src/Bab03/latihan1.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

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

Tulis `kelompokkanPanjang()` yang menerima list kata dan mengembalikan map dari panjang kata ke list kata dengan panjang itu.

::: details Jawaban
<!-- file: src/Bab03/latihan2.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @param list<string> $kata
 * @return array<int, list<string>>
 */
function kelompokkanPanjang(array $kata): array
{
    $kelompok = [];
    foreach ($kata as $k) {
        $kelompok[strlen($k)][] = $k;
    }

    return $kelompok;
}

echo json_encode(kelompokkanPanjang(['api', 'air', 'tanah', 'udara']), JSON_THROW_ON_ERROR) . PHP_EOL;
```

```text
{"3":["api","air"],"5":["tanah","udara"]}
```

`$kelompok[strlen($k)][] = $k` membuat list di dalamnya secara otomatis kalau kuncinya belum ada. Di Rust ini padanan `entry(k).or_default().push(v)`.
:::

### 3. Rata-rata yang lulus

Tulis `rataRataLulus()` yang menerima `list<int>` dan mengembalikan rata-rata dari nilai yang minimal 70, atau `null` kalau tidak ada yang lulus.

::: details Jawaban
<!-- file: src/Bab03/latihan3.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @param list<int> $nilai
 */
function rataRataLulus(array $nilai): ?float
{
    $lulus = array_values(array_filter($nilai, fn (int $n): bool => $n >= 70));

    if ($lulus === []) {
        return null;
    }

    return array_sum($lulus) / count($lulus);
}

var_dump(rataRataLulus([72, 95, 58, 88]));
var_dump(rataRataLulus([10, 20]));
```

```text
float(85)
NULL
```
:::

### 4. Penghitung

Tulis `buatPenghitung()` yang mengembalikan closure. Setiap kali dipanggil, closure itu mengembalikan angka berikutnya: 1, 2, 3. Ingat bahwa closure menangkap salinan.

::: details Jawaban
<!-- file: src/Bab03/latihan4.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab03;

/**
 * @return \Closure(): int
 */
function buatPenghitung(): \Closure
{
    $n = 0;

    return function () use (&$n): int {
        $n++;

        return $n;
    };
}

$hitung = buatPenghitung();
echo $hitung() . $hitung() . $hitung() . PHP_EOL;
```

```text
123
```

`use (&$n)` menangkap referensi ke `$n`, bukan salinannya, sehingga closure bisa mengubahnya di antara pemanggilan. Tanpa `&`, setiap pemanggilan mulai lagi dari salinan bernilai 0 dan hasilnya `111`. Ini satu dari sedikit tempat referensi masih wajar dipakai. Alternatif yang lebih umum adalah objek dengan property, dibahas di [Bab 4](/04-oop).
:::
