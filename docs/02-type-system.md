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

Lanjutkan di proyek `latihan/php-dasar` dari [Bab 1](/01-setup), dan masuk ke shell container seperti sebelumnya. Buat folder `src/Bab02` untuk file-file bab ini.

Setiap file di bab ini diawali baris yang sama:

```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;
```

Baris `namespace` baru muncul di sini. Untuk sekarang anggap seperti `mod` di Rust: ia memberi awalan pada nama fungsi dan class di file itu, sehingga nama yang sama di bab lain tidak bentrok. Detailnya ada di [Bab 6](/06-ekosistem).

Sepanjang bab ada dua macam eksperimen yang memang diharapkan gagal:

- **Tambahan di akhir file**: tempel potongannya, lihat errornya, lalu hapus lagi.
- **File coba-coba** `src/Bab02/coba.php`: timpa isinya setiap kali, dan hapus file itu di akhir bab supaya `composer check` kembali bersih.

## Di mana tipe ditulis

Buat `src/Bab02/dasar.php`:

<!-- file: src/Bab02/dasar.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function luasPersegi(int $sisi): int
{
    return $sisi * $sisi;
}

function rataRata(float $a, float $b): float
{
    return ($a + $b) / 2;
}

function sapaLengkap(string $nama, bool $formal): string
{
    return $formal ? "Selamat datang, {$nama}." : "Halo, {$nama}!";
}

function catat(string $pesan): void
{
    echo "[log] {$pesan}" . PHP_EOL;
}

echo luasPersegi(4) . PHP_EOL;
echo rataRata(3, 4) . PHP_EOL;
echo sapaLengkap('Budi', formal: true) . PHP_EOL;
catat('selesai');
```

```bash
php src/Bab02/dasar.php
```

```text
16
3.5
Selamat datang, Budi.
[log] selesai
```

Tipe native bisa ditulis di empat tempat: parameter, return value, property class, dan konstanta class. Dua yang terakhir dibahas di [Bab 4](/04-oop).

Yang tidak bisa diberi tipe adalah variabel lokal. Tidak ada padanan `let x: i64 = ...` atau `const x: number = ...`. Tipe variabel lokal selalu disimpulkan PHPStan dari nilai yang mengisinya.

Untuk melihat tipe yang disimpulkan, pakai `\PHPStan\dumpType()`. Ini padanan hover di editor. Tempel di akhir `dasar.php`:

<!-- demo: dumptype append: src/Bab02/dasar.php norun -->
```php
$luas = luasPersegi(3);
$teks = 'halo';
$daftar = [1, 2, 3];

\PHPStan\dumpType($luas);
\PHPStan\dumpType($teks);
\PHPStan\dumpType($daftar);
```

```bash
composer check
```

```text
Dumped type: int
Dumped type: 'halo'
Dumped type: array{1, 2, 3}
```

Perhatikan dua baris terakhir: PHPStan menyimpan tipe literal, sama seperti TS memperlakukan `const teks = 'halo'`. Fungsi `dumpType` hanya dikenal PHPStan dan tidak ada saat runtime, jadi hapus lagi baris-baris itu.

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

Tiga perilaku tipe dasar yang paling sering mengejutkan pendatang dari Rust. Buat `src/Bab02/jebakan.php`:

<!-- file: src/Bab02/jebakan.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

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

Operator `/` adalah tempat PHPStan level max masih longgar. Timpa `src/Bab02/coba.php` dengan ini:

<!-- demo: bagi -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function bagiDua(int $n): int
{
    return $n / 2;
}

var_dump(bagiDua(6));
var_dump(bagiDua(7));
```

`composer check` meloloskannya:

```text
 [OK] No errors
```

Padahal saat dijalankan, hasilnya bergantung pada data:

```text
int(3)

Fatal error: Uncaught TypeError: Belajar\Bab02\bagiDua(): Return value must be of type int, float returned
```

`bagiDua(6)` berhasil, `bagiDua(7)` meledak. PHPStan sebenarnya tahu hasil `/` bertipe `float|int`, tetapi menandainya sebagai union yang "dimaklumi" (*benevolent union*, ditulis `(float|int)`) dan secara bawaan tidak melaporkannya. Tutup celah itu dengan satu baris di `phpstan.neon`:

```yaml
parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - src
```

Sekarang `composer check` menolak kodenya:

```text
Function Belajar\Bab02\bagiDua() should return int but returns (float|int).
```

Biarkan opsi itu menyala di proyek ini. Perbaikannya sendiri sederhana: pakai `intdiv($n, 2)`.

## Null dengan `?T`

`?string` adalah singkatan `string|null`, padanan `Option<String>`. Buat `src/Bab02/nullable.php`:

<!-- file: src/Bab02/nullable.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function cariEmail(int $id): ?string
{
    return match ($id) {
        1 => 'Budi@Example.com',
        2 => 'siti@example.com',
        default => null,
    };
}

function emailRapi(int $id): string
{
    $email = cariEmail($id);

    if ($email === null) {
        return '(tidak ada email)';
    }

    // Setelah pengecekan di atas, PHPStan tahu $email bertipe string.
    return strtolower($email);
}

function emailWajib(int $id): string
{
    return cariEmail($id) ?? throw new \RuntimeException("Pengguna {$id} tidak punya email");
}

function tanggalDaftar(int $id): ?\DateTimeImmutable
{
    return $id === 1 ? new \DateTimeImmutable('2026-01-15') : null;
}

echo emailRapi(1) . PHP_EOL;
echo emailRapi(9) . PHP_EOL;
echo (cariEmail(9) ?? '(kosong)') . PHP_EOL;
echo emailWajib(2) . PHP_EOL;
var_dump(tanggalDaftar(1)?->format('Y'));
var_dump(tanggalDaftar(9)?->format('Y'));
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

`int|string` berarti salah satu dari keduanya, sama seperti union di TS. Buat `src/Bab02/union.php`:

<!-- file: src/Bab02/union.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function formatId(int|string $id): string
{
    if (is_int($id)) {
        return sprintf('#%05d', $id);
    }

    // Cabang int sudah keluar, jadi di sini $id pasti string.
    return strtoupper($id);
}

function namaPengguna(string $email): string
{
    $posisi = strpos($email, '@');

    if ($posisi === false) {
        return $email;
    }

    return substr($email, 0, $posisi);
}

echo formatId(42) . PHP_EOL;
echo formatId('ab-7') . PHP_EOL;
echo namaPengguna('budi@example.com') . PHP_EOL;
echo namaPengguna('tanpa-at') . PHP_EOL;
```

```text
#00042
AB-7
budi
tanpa-at
```

### Penyempitan tipe

PHPStan mengikuti alur kontrol seperti TS. Pengecekan dengan `is_int()`, `is_string()`, `is_array()`, `instanceof`, `=== null`, atau `match` mempersempit tipe di cabang yang bersangkutan. Tempel di akhir `union.php`:

<!-- demo: sempit append: src/Bab02/union.php norun -->
```php
function lihatPenyempitan(int|string|null $nilai): void
{
    \PHPStan\dumpType($nilai);

    if ($nilai === null) {
        return;
    }
    \PHPStan\dumpType($nilai);

    if (is_string($nilai)) {
        \PHPStan\dumpType($nilai);

        return;
    }
    \PHPStan\dumpType($nilai);
}
```

```text
Dumped type: int|string|null
Dumped type: int|string
Dumped type: string
Dumped type: int
```

### Warisan lama: `T|false`

Banyak fungsi bawaan PHP lahir sebelum ada exception dan `null` yang rapi, sehingga menandai kegagalan dengan `false`. `strpos()` di atas bertipe `int|false`. PHPStan memperlakukannya seperti `Option`: kamu harus menyingkirkan `false` dulu. Timpa `coba.php`:

<!-- demo: strpos -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function namaSingkat(string $email): string
{
    return substr($email, 0, strpos($email, '@'));
}

echo namaSingkat('tanpa-at') . PHP_EOL;
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
| `array{nama: string, umur: int}` | `struct` | `{ nama: string; umur: number }` |
| `array{int, string}` | `(i64, String)` | `[number, string]` |

Buat `src/Bab02/koleksi.php`:

<!-- file: src/Bab02/koleksi.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

/**
 * @param list<int> $nilai
 */
function jumlah(array $nilai): int
{
    $total = 0;
    foreach ($nilai as $n) {
        $total += $n;
    }

    return $total;
}

/**
 * @param array<string, int> $stok
 * @return list<string>
 */
function barangHabis(array $stok): array
{
    $habis = [];
    foreach ($stok as $nama => $sisa) {
        if ($sisa === 0) {
            $habis[] = $nama;
        }
    }

    return $habis;
}

/**
 * @param array{nama: string, umur: int} $orang
 */
function perkenalan(array $orang): string
{
    return "{$orang['nama']} ({$orang['umur']} tahun)";
}

/**
 * @return array{int, int}
 */
function bagiDenganSisa(int $a, int $b): array
{
    return [intdiv($a, $b), $a % $b];
}

echo jumlah([1, 2, 3]) . PHP_EOL;
echo implode(', ', barangHabis(['apel' => 0, 'jeruk' => 5, 'mangga' => 0])) . PHP_EOL;
echo perkenalan(['nama' => 'Siti', 'umur' => 30]) . PHP_EOL;

[$hasil, $sisa] = bagiDenganSisa(17, 5);
echo "{$hasil} sisa {$sisa}" . PHP_EOL;
```

```text
6
apel, mangga
Siti (30 tahun)
3 sisa 2
```

Sekarang langgar tipe PHPDoc-nya. Tempel di akhir `koleksi.php`:

<!-- demo: koleksi-salah append: src/Bab02/koleksi.php -->
```php
echo perkenalan(['nama' => 'Siti']) . PHP_EOL;
echo jumlah(['a', 'b']) . PHP_EOL;
```

PHPStan menolak keduanya:

```text
Parameter #1 $orang of function Belajar\Bab02\perkenalan expects array{nama: string, umur: int}, array{nama: 'Siti'} given.
Parameter #1 $nilai of function Belajar\Bab02\jumlah expects list<int>, array{'a', 'b'} given.
```

PHP sendiri tidak menolak di batas fungsi, karena yang ia lihat hanya `array`. Kesalahannya baru muncul di dalam, sebagai gejala:

```text
Warning: Undefined array key "umur" in /app/src/Bab02/koleksi.php on line 41
Siti ( tahun)

Fatal error: Uncaught TypeError: Unsupported operand types: int + string
```

Ini konsekuensi dari tipe yang dihapus saat runtime, persis seperti TS. Karena itu data dari luar program harus divalidasi dulu sebelum diberi tipe PHPDoc. Caranya ada di bagian berikut.

## `void`, `never`, dan `mixed`

Buat `src/Bab02/khusus.php`:

<!-- file: src/Bab02/khusus.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function gagal(string $pesan): never
{
    throw new \RuntimeException($pesan);
}

/**
 * @param array<string, int> $harga
 */
function hargaBarang(array $harga, string $nama): int
{
    return $harga[$nama] ?? gagal("Barang {$nama} tidak dikenal");
}

function bacaUmur(string $json): int
{
    $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);

    if (!is_array($data) || !isset($data['umur']) || !is_int($data['umur'])) {
        gagal('JSON harus punya field umur bertipe int');
    }

    return $data['umur'];
}

echo hargaBarang(['apel' => 5000], 'apel') . PHP_EOL;
echo bacaUmur('{"nama": "Budi", "umur": 30}') . PHP_EOL;
```

```text
5000
30
```

- **`void`** berarti fungsi tidak mengembalikan apa pun, seperti `()` di Rust. PHPStan menolak kalau hasilnya dipakai.
- **`never`** berarti fungsi tidak pernah kembali, seperti `!` di Rust. Karena itu `$harga[$nama] ?? gagal(...)` bertipe `int`, dan setelah `gagal(...)` di `bacaUmur` PHPStan tahu kode di bawahnya hanya berjalan kalau semua pengecekan lolos.
- **`mixed`** adalah tipe paling atas: apa pun bisa masuk. `json_decode()` mengembalikan `mixed`, karena isi JSON tidak diketahui sebelum dibaca.

Di level max, `mixed` berperilaku seperti `unknown` di TS: tidak bisa dipakai sebelum dipersempit. Fungsi `bacaUmur` menunjukkan polanya, yaitu periksa bentuknya dulu, baru setelah itu nilainya punya tipe. Tanpa pengecekan, PHPStan menolak. Timpa `coba.php`:

<!-- demo: mixed norun -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function bacaUmurCeroboh(string $json): int
{
    $data = json_decode($json, true);

    return $data['umur'];
}
```

```text
Cannot access offset 'umur' on mixed.
Function Belajar\Bab02\bacaUmurCeroboh() should return int but returns mixed.
```

## Enum

Enum di PHP adalah tipe sungguhan, bukan sekadar konstanta. Buat `src/Bab02/status.php`:

<!-- file: src/Bab02/status.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

enum StatusPesanan: string
{
    case Menunggu = 'menunggu';
    case Dikirim = 'dikirim';
    case Selesai = 'selesai';

    public function label(): string
    {
        return match ($this) {
            self::Menunggu => 'Menunggu pembayaran',
            self::Dikirim => 'Sedang dikirim',
            self::Selesai => 'Selesai',
        };
    }

    public function bolehDibatalkan(): bool
    {
        return $this === self::Menunggu;
    }
}

$status = StatusPesanan::from('dikirim');

echo $status->label() . PHP_EOL;
echo $status->value . PHP_EOL;
var_dump($status->bolehDibatalkan());
var_dump(StatusPesanan::tryFrom('hilang'));
echo count(StatusPesanan::cases()) . PHP_EOL;
```

```text
Sedang dikirim
dikirim
bool(false)
NULL
3
```

- **Backed enum** (`enum StatusPesanan: string`) memberi tiap case nilai `string` atau `int`, berguna untuk disimpan ke database atau JSON. Tanpa `: string`, enum disebut *pure* dan case-nya tidak punya nilai.
- **`from()`** mengubah nilai mentah menjadi enum dan melempar error kalau tidak dikenal. **`tryFrom()`** mengembalikan `null`. Keduanya adalah titik validasi untuk data dari luar.
- **Enum boleh punya method**, seperti `impl` pada enum di Rust.
- **Case dibandingkan dengan `===`.** Tiap case adalah satu objek tunggal.

`match` pada enum diperiksa kelengkapannya oleh PHPStan, seperti `match` di Rust. Timpa `coba.php`:

<!-- demo: match -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

enum Arah
{
    case Utara;
    case Selatan;
    case Timur;
    case Barat;
}

function berlawanan(Arah $arah): Arah
{
    return match ($arah) {
        Arah::Utara => Arah::Selatan,
        Arah::Selatan => Arah::Utara,
        Arah::Timur => Arah::Barat,
    };
}

echo berlawanan(Arah::Barat)->name . PHP_EOL;
```

```text
Match expression does not handle remaining value: Belajar\Bab02\Arah::Barat
```

Saat runtime, `match` yang tidak menemukan cabang melempar error:

```text
Fatal error: Uncaught UnhandledMatchError: Unhandled match case Belajar\Bab02\Arah::Barat
```

Satu perbedaan besar dengan Rust: case enum di PHP tidak bisa membawa data. Tidak ada padanan `enum Bentuk { Lingkaran(f64), Persegi(f64, f64) }`. Untuk itu dipakai beberapa class yang digabung dengan union type, dibahas di [Bab 4](/04-oop) dan [Bab 5](/05-error-handling).

## Tipe yang dipersempit

PHPDoc bisa menyatakan tipe yang lebih sempit daripada tipe native mana pun. Buat `src/Bab02/sempit.php`:

<!-- file: src/Bab02/sempit.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

/**
 * @param 'asc'|'desc' $arah
 * @param int<1, 100> $perHalaman
 */
function susunQuery(string $arah, int $perHalaman): string
{
    return "ORDER BY nama {$arah} LIMIT {$perHalaman}";
}

/**
 * @return int<1, 100>
 */
function batasiPerHalaman(int $n): int
{
    if ($n < 1 || $n > 100) {
        throw new \InvalidArgumentException('perHalaman harus antara 1 dan 100');
    }

    // PHPStan mempersempit $n dari int menjadi int<1, 100>.
    return $n;
}

echo susunQuery('asc', batasiPerHalaman(25)) . PHP_EOL;
```

```text
ORDER BY nama asc LIMIT 25
```

Tempel pemanggilan yang salah di akhir `sempit.php`:

<!-- demo: sempit-salah append: src/Bab02/sempit.php -->
```php
echo susunQuery('naik', 500) . PHP_EOL;
```

```text
Parameter #1 $arah of function Belajar\Bab02\susunQuery expects 'asc'|'desc', 'naik' given.
Parameter #2 $perHalaman of function Belajar\Bab02\susunQuery expects int<1, 100>, 500 given.
```

Kalau dijalankan, PHP tidak keberatan, karena yang ia lihat hanya `string` dan `int`:

```text
ORDER BY nama naik LIMIT 500
```

Itu sebabnya `batasiPerHalaman` ada: nilai dari luar divalidasi saat runtime, lalu PHPStan membawa hasil validasi itu sebagai tipe ke seluruh kode sesudahnya.

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

PHP tidak punya generics di bahasanya. PHPStan menyediakannya lewat PHPDoc. Buat `src/Bab02/generik.php`:

<!-- file: src/Bab02/generik.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

/**
 * @template T
 * @param list<T> $daftar
 * @return T|null
 */
function pertama(array $daftar): mixed
{
    return $daftar[0] ?? null;
}

/**
 * @template T
 * @template U
 * @param list<T> $daftar
 * @param callable(T): U $fn
 * @return list<U>
 */
function petakan(array $daftar, callable $fn): array
{
    $hasil = [];
    foreach ($daftar as $item) {
        $hasil[] = $fn($item);
    }

    return $hasil;
}

/**
 * @template T of int|float
 * @param non-empty-list<T> $angka
 * @return T
 */
function terbesar(array $angka): int|float
{
    return max($angka);
}

/**
 * @return list<string>
 */
function namaBuah(): array
{
    return ['apel', 'jeruk', 'mangga'];
}

echo (pertama(namaBuah()) ?? '(kosong)') . PHP_EOL;
echo implode(', ', petakan(namaBuah(), fn (string $nama): int => strlen($nama))) . PHP_EOL;
echo terbesar([3, 9, 4]) . PHP_EOL;
```

```text
apel
4, 5, 6
9
```

- **`@template T`** mendeklarasikan parameter tipe, padanan `<T>`.
- **`@template T of int|float`** memberi batas, padanan `T: Trait` di Rust atau `T extends ...` di TS.
- **`callable(T): U`** adalah tipe fungsi. `fn (string $nama): int => ...` adalah arrow function, dibahas di [Bab 3](/03-dasar-bahasa).
- **Tipe native-nya tetap longgar.** Yang dilihat PHP hanya `array`, `callable`, dan `mixed`.

Tempel di akhir `generik.php` untuk melihat tipe yang disimpulkan:

<!-- demo: generik-dump append: src/Bab02/generik.php norun -->
```php
\PHPStan\dumpType(pertama(namaBuah()));
\PHPStan\dumpType(petakan(namaBuah(), fn (string $nama): int => strlen($nama)));
\PHPStan\dumpType(terbesar([1.5, 2.5]));
```

```text
Dumped type: string|null
Dumped type: list<int<0, max>>
Dumped type: 1.5|2.5
```

Baris kedua menunjukkan seberapa teliti inferensinya: PHPStan tahu `strlen()` tidak pernah negatif, sehingga `U` menjadi `int<0, max>`, bukan sekadar `int`.

Dan batas `of int|float` benar-benar dijaga:

<!-- demo: generik-salah append: src/Bab02/generik.php norun -->
```php
echo terbesar(['a', 'b']) . PHP_EOL;
```

```text
Parameter #1 $angka of function Belajar\Bab02\terbesar expects non-empty-list<float|int>, array{'a', 'b'} given.
Unable to resolve the template type T in call to function Belajar\Bab02\terbesar
```

Di Rust, generics dimonomorfisasi menjadi kode nyata. Di TS, generics dihapus saat kompilasi. Di PHP, generics bahkan tidak pernah ada di kodenya, hanya di komentar yang dibaca PHPStan. Generics pada class dibahas di [Bab 4](/04-oop).

## Konversi tipe

Cast di PHP tidak pernah gagal. Buat `src/Bab02/konversi.php`:

<!-- file: src/Bab02/konversi.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function keInt(string $teks): ?int
{
    $hasil = filter_var($teks, FILTER_VALIDATE_INT);

    return $hasil === false ? null : $hasil;
}

var_dump((int) '42');
var_dump((int) '42abc');
var_dump((int) 'abc');
var_dump(keInt('42'));
var_dump(keInt('42abc'));
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

Kerjakan tiap soal di file tersendiri di `src/Bab02`, dan pastikan `composer check` lulus.

### 1. Rata-rata yang bisa kosong

Tulis `rataRataNilai()` yang menerima list berisi `int` atau `float` dan mengembalikan rata-ratanya, atau `null` kalau list kosong.

::: details Jawaban
<!-- file: src/Bab02/latihan1.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

/**
 * @param list<int|float> $nilai
 */
function rataRataNilai(array $nilai): ?float
{
    if ($nilai === []) {
        return null;
    }

    return array_sum($nilai) / count($nilai);
}

var_dump(rataRataNilai([80, 90, 100]));
var_dump(rataRataNilai([]));
```

```text
float(90)
NULL
```

Setelah pengecekan `$nilai === []`, PHPStan tahu list-nya tidak kosong, sehingga `count($nilai)` tidak mungkin nol. Hasil pembagiannya `int` (270 / 3), dan PHP melebarkannya ke `float` saat dikembalikan.
:::

### 2. `false` yang terlupa

Fungsi ini ditolak PHPStan. Jelaskan kenapa, lalu perbaiki supaya mengembalikan `null` untuk nama file tanpa ekstensi.

<!-- demo: ekstensi -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function ekstensiCeroboh(string $namaFile): string
{
    return substr($namaFile, strrpos($namaFile, '.'));
}

echo ekstensiCeroboh('laporan.pdf') . PHP_EOL;
echo ekstensiCeroboh('README') . PHP_EOL;
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

<!-- file: src/Bab02/latihan2.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

function ekstensi(string $namaFile): ?string
{
    $posisi = strrpos($namaFile, '.');

    if ($posisi === false) {
        return null;
    }

    return substr($namaFile, $posisi + 1);
}

var_dump(ekstensi('laporan.pdf'));
var_dump(ekstensi('README'));
```

```text
string(3) "pdf"
NULL
```
:::

### 3. Enum dengan `match` lengkap

Buat enum `Hari` berbasis `int` (Senin = 1 sampai Minggu = 7) dengan method `akhirPekan(): bool`. Jangan pakai cabang `default`.

::: details Jawaban
<!-- file: src/Bab02/latihan3.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

enum Hari: int
{
    case Senin = 1;
    case Selasa = 2;
    case Rabu = 3;
    case Kamis = 4;
    case Jumat = 5;
    case Sabtu = 6;
    case Minggu = 7;

    public function akhirPekan(): bool
    {
        return match ($this) {
            self::Sabtu, self::Minggu => true,
            self::Senin, self::Selasa, self::Rabu, self::Kamis, self::Jumat => false,
        };
    }
}

var_dump(Hari::from(6)->akhirPekan());
var_dump(Hari::tryFrom(8));
```

```text
bool(true)
NULL
```

Alasannya sama dengan menghindari `_ =>` di Rust: tanpa `default`, PHPStan akan menandai `match` ini begitu ada case baru yang belum ditangani.
:::

### 4. Generics

Tulis `terakhir()`, pasangan dari `pertama()`: menerima list berisi tipe apa pun dan mengembalikan elemen terakhirnya, atau `null` kalau kosong.

::: details Jawaban
<!-- file: src/Bab02/latihan4.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab02;

/**
 * @template T
 * @param list<T> $daftar
 * @return T|null
 */
function terakhir(array $daftar): mixed
{
    return $daftar[count($daftar) - 1] ?? null;
}

var_dump(terakhir([10, 20, 30]));
var_dump(terakhir([]));
```

```text
int(30)
NULL
```
:::
