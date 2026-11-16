# 5. Error handling

Rust memisahkan dua hal dengan tegas: `panic!` untuk bug, `Result` untuk kegagalan yang wajar. PHP secara bawaan hanya punya exception, seperti TS. Bab ini menunjukkan cara kerja exception di PHP, sisa-sisa mekanisme lama yang masih ada, lalu cara membuat kegagalan terlihat di tipe supaya PHPStan bisa memaksanya ditangani.

Lanjutkan di proyek `latihan/php-dasar`. Buat folder `src/Bab05`, dan awali setiap file dengan `namespace Belajar\Bab05;`.

## Exception

Buat `src/Bab05/dasar.php`:

<!-- file: src/Bab05/dasar.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

final class SaldoTidakCukup extends \RuntimeException
{
    public function __construct(
        public readonly int $saldo,
        public readonly int $diminta,
    ) {
        parent::__construct("Saldo {$saldo} tidak cukup untuk menarik {$diminta}");
    }
}

final class BatasTerlampaui extends \RuntimeException
{
}

const BATAS_SEKALI_TARIK = 1000;

/**
 * @throws SaldoTidakCukup
 * @throws BatasTerlampaui
 */
function tarik(int $saldo, int $jumlah): int
{
    if ($jumlah <= 0) {
        throw new \InvalidArgumentException('Jumlah penarikan harus positif');
    }

    if ($jumlah > BATAS_SEKALI_TARIK) {
        throw new BatasTerlampaui('Maksimal ' . BATAS_SEKALI_TARIK . ' per penarikan');
    }

    if ($jumlah > $saldo) {
        throw new SaldoTidakCukup($saldo, $jumlah);
    }

    return $saldo - $jumlah;
}

function cobaTarik(int $saldo, int $jumlah): string
{
    try {
        $sisa = tarik($saldo, $jumlah);

        return "berhasil, sisa {$sisa}";
    } catch (SaldoTidakCukup $e) {
        return 'ditolak, kurang ' . ($e->diminta - $e->saldo);
    } catch (BatasTerlampaui $e) {
        return "ditolak: {$e->getMessage()}";
    } finally {
        echo "[audit] percobaan tarik {$jumlah}" . PHP_EOL;
    }
}

echo cobaTarik(100, 30) . PHP_EOL;
echo cobaTarik(100, 500) . PHP_EOL;
echo cobaTarik(5000, 2000) . PHP_EOL;
```

```text
[audit] percobaan tarik 30
berhasil, sisa 70
[audit] percobaan tarik 500
ditolak, kurang 400
[audit] percobaan tarik 2000
ditolak: Maksimal 1000 per penarikan
```

- **Exception adalah objek** dari class yang menurunkan `\Exception`. Class buatan sendiri boleh membawa data, seperti `$saldo` dan `$diminta`, sehingga penangkapnya tidak perlu membedah teks pesan.
- **`catch` memilih berdasarkan tipe**, dari atas ke bawah. Beberapa tipe bisa digabung: `catch (A|B $e)`.
- **`finally`** selalu berjalan, baik blok `try` selesai normal, mengembalikan nilai, maupun melempar.
- **Tidak ada padanan `Drop`** yang bisa diandalkan untuk membereskan resource. Pakai `finally`.
- **`\InvalidArgumentException` sengaja tidak ditangkap.** Jumlah nol atau negatif adalah bug di kode pemanggil, bukan keadaan yang perlu ditangani. Pembedaannya dijelaskan di bagian hierarki.

Exception yang tidak ditangkap siapa pun menghentikan program. Tempel di akhir `dasar.php`:

<!-- demo: tak-tertangkap append: src/Bab05/dasar.php -->
```php
echo tarik(100, 500) . PHP_EOL;
```

```text
Fatal error: Uncaught Belajar\Bab05\SaldoTidakCukup: Saldo 100 tidak cukup untuk menarik 500 in /app/src/Bab05/dasar.php:38
Stack trace:
#0 /app/src/Bab05/dasar.php(63): Belajar\Bab05\tarik(100, 500)
#1 {main}
  thrown in /app/src/Bab05/dasar.php on line 38
```

PHPStan tidak mengeluh soal baris itu. Seperti di TS, tidak ada yang memaksa pemanggil menangani exception. Bagian "Membuat exception terlihat" di bawah memperbaikinya.

## Hierarki `Throwable`

Semua yang bisa dilempar mengimplementasikan `\Throwable`, dan terbagi dua cabang:

```text
Throwable
├── Error                       dilempar PHP sendiri, hampir selalu berarti bug
│   ├── TypeError
│   ├── ValueError
│   ├── ArithmeticError
│   │   └── DivisionByZeroError
│   └── UnhandledMatchError
└── Exception                   dilempar kode aplikasi dan library
    ├── LogicException          kesalahan pemakaian: bug di kode pemanggil
    │   ├── InvalidArgumentException
    │   └── DomainException
    ├── RuntimeException        kegagalan yang baru diketahui saat berjalan
    └── JsonException
```

Buat `src/Bab05/hierarki.php` untuk melihat beberapa di antaranya:

<!-- file: src/Bab05/hierarki.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

enum Warna: string
{
    case Merah = 'merah';
    case Biru = 'biru';
}

function nol(): int
{
    return 0;
}

/**
 * @param \Closure(): mixed $aksi
 */
function jenisError(\Closure $aksi): string
{
    try {
        $aksi();

        return 'tidak ada error';
    } catch (\Throwable $e) {
        return $e::class . ': ' . $e->getMessage();
    }
}

echo jenisError(fn (): int => intdiv(10, nol())) . PHP_EOL;
echo jenisError(fn (): int => 10 % nol()) . PHP_EOL;
echo jenisError(fn (): mixed => json_decode('{rusak', flags: JSON_THROW_ON_ERROR)) . PHP_EOL;
echo jenisError(fn (): Warna => Warna::from('hijau')) . PHP_EOL;
echo jenisError(fn (): int => strlen('aman')) . PHP_EOL;
```

```text
DivisionByZeroError: Division by zero
DivisionByZeroError: Modulo by zero
JsonException: Syntax error
ValueError: "hijau" is not a valid backing value for enum Belajar\Bab05\Warna
tidak ada error
```

Pemetaannya ke Rust:

| Rust | PHP | Sikap |
|---|---|---|
| `panic!` | `\Error` dan `\LogicException` | Jangan ditangkap. Perbaiki kodenya |
| `Err(e)` yang diteruskan dengan `?` | `\RuntimeException` dan turunannya | Biarkan merambat, tangkap di tempat yang bisa berbuat sesuatu |
| `Err(e)` yang ditangani pemanggil langsung | Nilai kembalian, lihat di bawah | Wajib ditangani |

`catch (\Throwable $e)` seperti di `jenisError()` menangkap semuanya, termasuk bug. Tempatnya hanya di batas terluar program, misalnya untuk mencatat error lalu menampilkan halaman 500. Laravel sudah menyediakan batas itu.

## Warisan lama: warning dan `false`

Fungsi bawaan yang lebih tua dari exception tidak melempar apa pun. Ia mencetak *warning* lalu mengembalikan `false`. Buat `src/Bab05/warisan.php`:

<!-- file: src/Bab05/warisan.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

/**
 * @throws \RuntimeException
 */
function bacaBerkas(string $jalur): string
{
    if (!is_file($jalur)) {
        throw new \RuntimeException("Berkas {$jalur} tidak ditemukan");
    }

    $isi = file_get_contents($jalur);

    if ($isi === false) {
        throw new \RuntimeException("Berkas {$jalur} gagal dibaca");
    }

    return $isi;
}

try {
    echo bacaBerkas('/tidak/ada.txt') . PHP_EOL;
} catch (\RuntimeException $e) {
    echo $e->getMessage() . PHP_EOL;
}

// Mengubah setiap warning menjadi exception.
set_error_handler(function (int $tingkat, string $pesan, string $berkas, int $baris): never {
    throw new \ErrorException($pesan, 0, $tingkat, $berkas, $baris);
});

try {
    $isi = file_get_contents('/tidak/ada.txt');
    echo ($isi === false ? 'gagal tanpa exception' : 'terbaca') . PHP_EOL;
} catch (\ErrorException $e) {
    echo 'Tertangkap: ' . $e->getMessage() . PHP_EOL;
}
```

```text
Berkas /tidak/ada.txt tidak ditemukan
Tertangkap: file_get_contents(/tidak/ada.txt): Failed to open stream: No such file or directory
```

Ada dua cara menghadapi fungsi seperti ini:

- **Bungkus sekali**, seperti `bacaBerkas()`: periksa `false`, ubah menjadi exception, dan kembalikan tipe yang bersih. PHPStan memaksa pengecekan `false` itu, seperti yang kamu lihat di [Bab 2](/02-type-system).
- **Ubah semua warning menjadi exception** dengan `set_error_handler()`. Laravel melakukannya untukmu, sehingga di aplikasi Laravel sebuah warning langsung menghentikan request.

Beberapa fungsi punya saklar sendiri. Yang paling sering dipakai adalah `JSON_THROW_ON_ERROR` pada `json_decode()` dan `json_encode()`, yang sudah dipakai sejak [Bab 2](/02-type-system).

## Membuat exception terlihat

Kelemahan exception adalah tidak tampak di signature. Dari `function tarik(int $saldo, int $jumlah): int` kamu tidak tahu ia bisa gagal. Konvensinya adalah tag `@throws`, seperti pada `tarik()` dan `bacaBerkas()` di atas.

PHPStan sudah memanfaatkan tag itu tanpa pengaturan apa pun: daftar `@throws` dianggap lengkap, sehingga menangkap exception yang tidak tercantum dilaporkan. Timpa `src/Bab05/coba.php`:

<!-- demo: dead-catch norun -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

/**
 * @throws \RuntimeException
 */
function muatTeks(string $jalur): string
{
    if (!is_file($jalur)) {
        throw new \RuntimeException("Berkas {$jalur} tidak ada");
    }

    return 'isi berkas';
}

try {
    echo muatTeks('/tidak/ada.txt') . PHP_EOL;
} catch (\InvalidArgumentException $e) {
    echo 'argumen salah' . PHP_EOL;
}
```

```text
Dead catch - InvalidArgumentException is never thrown in the try block.
```

Yang belum diperiksa adalah arah sebaliknya: fungsi yang melempar tanpa menuliskannya. PHPStan bisa mengubah konvensi itu menjadi aturan. Buat berkas konfigurasi kedua, `phpstan-throws.neon`, di samping `phpstan.neon`:

```yaml
includes:
    - phpstan.neon

parameters:
    exceptions:
        check:
            missingCheckedExceptionInThrows: true
            tooWideThrowType: true
        uncheckedExceptionClasses:
            - LogicException
            - Error
```

Dengan konfigurasi ini, setiap exception dianggap *checked* kecuali `LogicException`, `Error`, dan turunannya. Fungsi yang bisa melempar exception checked wajib menuliskannya di `@throws`, atau menangkapnya. Buat `src/Bab05/throws.php`:

<!-- file: src/Bab05/throws.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

final class KonfigurasiTidakAda extends \RuntimeException
{
}

/**
 * @return array<string, string>
 *
 * @throws KonfigurasiTidakAda
 */
function muatKonfigurasi(string $jalur): array
{
    if (!is_file($jalur)) {
        throw new KonfigurasiTidakAda("Berkas konfigurasi {$jalur} tidak ada");
    }

    return ['mode' => 'produksi'];
}

/**
 * @throws KonfigurasiTidakAda
 */
function modeAplikasi(string $jalur): string
{
    return muatKonfigurasi($jalur)['mode'] ?? 'pengembangan';
}

function modeAtauBawaan(string $jalur): string
{
    try {
        return modeAplikasi($jalur);
    } catch (KonfigurasiTidakAda) {
        return 'pengembangan';
    }
}

echo modeAtauBawaan('/tidak/ada.ini') . PHP_EOL;
```

```text
pengembangan
```

Periksa folder bab ini dengan konfigurasi tadi:

```bash
vendor/bin/phpstan analyse -c phpstan-throws.neon src/Bab05
```

```text
 [OK] No errors
```

`modeAplikasi()` hanya meneruskan exception, jadi ia wajib menuliskannya. `modeAtauBawaan()` menangkapnya, jadi tidak perlu. Sekarang hapus `@throws` dari salah satunya. Timpa `src/Bab05/coba.php`:

<!-- demo: throws-kurang norun -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

final class StokHabis extends \RuntimeException
{
}

function ambilSatu(int $stok): int
{
    if ($stok === 0) {
        throw new StokHabis('Stok habis');
    }

    return $stok - 1;
}
```

```text
Function Belajar\Bab05\ambilSatu() throws checked exception Belajar\Bab05\StokHabis but it's missing from the PHPDoc @throws tag.
```

Ini padanan terdekat dari `Result` di signature: kegagalan menjadi bagian dari kontrak fungsi, dan lupa menuliskannya adalah error.

::: info Kenapa di berkas terpisah
Aturan ini berlaku untuk seluruh kode yang dianalisis, termasuk contoh-contoh bab sebelumnya yang belum menulis `@throws`. Di materi ini ia hanya dipakai untuk `src/Bab05`. Di proyek baru milikmu sendiri, taruh langsung di `phpstan.neon`.
:::

## Kegagalan sebagai nilai

Untuk kegagalan yang wajar dan harus langsung ditangani pemanggil, seperti input yang tidak valid, exception terasa berlebihan. Alternatifnya mengembalikan kegagalan itu sebagai nilai, lewat union type. Buat `src/Bab05/union.php`:

<!-- file: src/Bab05/union.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

enum GalatUmur
{
    case BukanAngka;
    case Negatif;
    case TerlaluBesar;

    public function pesan(): string
    {
        return match ($this) {
            self::BukanAngka => 'bukan bilangan bulat',
            self::Negatif => 'tidak boleh negatif',
            self::TerlaluBesar => 'terlalu besar',
        };
    }
}

function parseUmur(string $teks): int|GalatUmur
{
    $angka = filter_var($teks, FILTER_VALIDATE_INT);

    return match (true) {
        $angka === false => GalatUmur::BukanAngka,
        $angka < 0 => GalatUmur::Negatif,
        $angka > 150 => GalatUmur::TerlaluBesar,
        default => $angka,
    };
}

foreach (['42', 'abc', '-5', '999'] as $masukan) {
    $hasil = parseUmur($masukan);

    echo $masukan . ' -> ' . ($hasil instanceof GalatUmur ? $hasil->pesan() : "umur {$hasil}") . PHP_EOL;
}
```

```text
42 -> umur 42
abc -> bukan bilangan bulat
-5 -> tidak boleh negatif
999 -> terlalu besar
```

`int|GalatUmur` adalah `Result<i64, GalatUmur>` versi ringan. Pemanggil tidak bisa memakai hasilnya sebagai `int` sebelum menyingkirkan `GalatUmur`. Tempel di akhir `union.php`:

<!-- demo: union-salah append: src/Bab05/union.php -->
```php
echo (parseUmur('abc') + 1) . PHP_EOL;
```

```text
Binary operation "+" between Belajar\Bab05\GalatUmur|int and 1 results in an error.
Binary operation "." between mixed and "\n"|"\r\n" results in an error.
```

```text
Fatal error: Uncaught TypeError: Unsupported operand types: Belajar\Bab05\GalatUmur + int
```

Untuk kasus tanpa alasan kegagalan, `?T` sudah cukup: itu `Option`.

### `Ok` dan `Err`

Union langsung seperti di atas tidak bisa dipakai kalau nilai sukses dan nilai gagal bertipe sama, dan tidak punya bentuk yang seragam. Kalau kamu ingin `Result` yang sesungguhnya, dua class generic kecil sudah cukup. Buat `src/Bab05/result.php`:

<!-- file: src/Bab05/result.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

/**
 * @template-covariant T
 */
final readonly class Ok
{
    /**
     * @param T $nilai
     */
    public function __construct(public mixed $nilai)
    {
    }
}

/**
 * @template-covariant E
 */
final readonly class Err
{
    /**
     * @param E $galat
     */
    public function __construct(public mixed $galat)
    {
    }
}

enum GalatStok
{
    case JumlahTidakValid;
    case StokKurang;
}

/**
 * @return Ok<int>|Err<GalatStok>
 */
#[\NoDiscard]
function kurangiStok(int $stok, int $jumlah): Ok|Err
{
    if ($jumlah <= 0) {
        return new Err(GalatStok::JumlahTidakValid);
    }

    if ($jumlah > $stok) {
        return new Err(GalatStok::StokKurang);
    }

    return new Ok($stok - $jumlah);
}

/**
 * @return Ok<int>|Err<GalatStok>
 */
#[\NoDiscard]
function jualDuaKali(int $stok, int $pertama, int $kedua): Ok|Err
{
    $hasil = kurangiStok($stok, $pertama);

    if ($hasil instanceof Err) {
        return $hasil;
    }

    return kurangiStok($hasil->nilai, $kedua);
}

/**
 * @param Ok<int>|Err<GalatStok> $hasil
 */
function laporan(Ok|Err $hasil): string
{
    return match (true) {
        $hasil instanceof Ok => "sisa stok {$hasil->nilai}",
        $hasil instanceof Err => "gagal: {$hasil->galat->name}",
    };
}

echo laporan(jualDuaKali(10, 3, 4)) . PHP_EOL;
echo laporan(jualDuaKali(10, 3, 9)) . PHP_EOL;
echo laporan(jualDuaKali(10, 0, 1)) . PHP_EOL;
```

```text
sisa stok 3
gagal: StokKurang
gagal: JumlahTidakValid
```

- **`@template-covariant`** membuat `Err<GalatStok::StokKurang>` diterima sebagai `Err<GalatStok>`. Itu aman karena class-nya `readonly`: isinya hanya bisa dibaca.
- **Tidak ada operator `?`.** Tiga baris `if ($hasil instanceof Err) { return $hasil; }` di `jualDuaKali()` adalah penggantinya, ditulis tangan di setiap langkah.
- **`#[\NoDiscard]`** (PHP 8.5) adalah padanan `#[must_use]`: hasil fungsi tidak boleh dibuang begitu saja.

Tanpa `#[\NoDiscard]`, kegagalan yang dikembalikan sebagai nilai bisa hilang tanpa jejak. Tempel di akhir `result.php`:

<!-- demo: dibuang append: src/Bab05/result.php -->
```php
kurangiStok(5, 10);
(void) kurangiStok(5, 10);
```

```text
Call to function Belajar\Bab05\kurangiStok() on a separate line discards return value.
Call to function Belajar\Bab05\kurangiStok() on a separate line has no effect.
```

```text
Warning: The return value of function Belajar\Bab05\kurangiStok() should either be used or intentionally ignored by casting it as (void)
```

Kedua pesan itu untuk baris pertama. Baris kedua, dengan cast `(void)`, tidak dilaporkan: itu cara menyatakan bahwa hasilnya memang sengaja diabaikan.

## Memilih pendekatan

| Situasi | Pendekatan |
|---|---|
| Bug: argumen mustahil, keadaan yang seharusnya tidak terjadi | Lempar `\LogicException` atau biarkan `\Error`. Jangan ditangkap |
| Kegagalan lingkungan: berkas, jaringan, database | Exception turunan `\RuntimeException`, dengan `@throws`, dibiarkan merambat |
| Tidak ditemukan, tanpa perlu alasan | `?T` |
| Kegagalan wajar yang harus ditangani pemanggil langsung: validasi, parsing | Union `T\|Galat`, atau `Ok\|Err` |

Dua catatan supaya ekspektasinya tepat:

- **Exception lebih idiomatis di PHP.** Tanpa operator `?`, meneruskan `Err` lewat banyak lapisan terasa berat, sedangkan exception merambat sendiri. Pakai nilai kembalian di tepi, tempat kegagalan langsung ditangani.
- **Laravel memakai exception di mana-mana.** Validasi yang gagal melempar `ValidationException`, data yang tidak ditemukan melempar `ModelNotFoundException`, dan framework mengubahnya menjadi respons HTTP yang sesuai. Kamu akan melihatnya di [Bab 8](/08-laravel-dasar).

## Ringkasan

- **Exception adalah mekanisme utama**, dengan `try`, `catch` berdasarkan tipe, dan `finally`.
- **`\Error` dan `\LogicException` berarti bug**, padanan `panic!`. `\RuntimeException` adalah kegagalan yang bisa ditangani.
- **Fungsi lama memberi warning dan `false`.** Bungkus, atau ubah warning menjadi exception.
- **`@throws` ditambah pengecekan PHPStan** membuat exception menjadi bagian dari kontrak fungsi.
- **Union type dan `Ok|Err`** menjadikan kegagalan sebagai nilai yang wajib ditangani, dengan `#[\NoDiscard]` supaya tidak terbuang.

## Latihan

### 1. Membungkus exception

Tulis `muatPengaturan()` yang menerima teks JSON dan mengembalikan array. Kalau JSON-nya rusak atau isinya bukan objek, lempar exception buatanmu sendiri, `PengaturanRusak`. Exception asli dari `json_decode()` tidak boleh hilang.

::: details Jawaban
<!-- file: src/Bab05/latihan1.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

final class PengaturanRusak extends \RuntimeException
{
}

/**
 * @return array<mixed>
 *
 * @throws PengaturanRusak
 */
function muatPengaturan(string $json): array
{
    try {
        $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
    } catch (\JsonException $e) {
        throw new PengaturanRusak('Pengaturan bukan JSON yang sah', previous: $e);
    }

    if (!is_array($data)) {
        throw new PengaturanRusak('Pengaturan harus berupa objek JSON');
    }

    return $data;
}

try {
    muatPengaturan('{rusak');
} catch (PengaturanRusak $e) {
    echo $e->getMessage() . PHP_EOL;
    echo 'Penyebab: ' . ($e->getPrevious()?->getMessage() ?? '(tidak ada)') . PHP_EOL;
}
```

```text
Pengaturan bukan JSON yang sah
Penyebab: Syntax error
```

Argumen `previous` menyimpan exception asal, seperti `source()` pada error di Rust. Pemanggil hanya perlu mengenal `PengaturanRusak`, sedangkan detail teknisnya tetap tersedia untuk log.
:::

### 2. Dari exception ke nilai

Tulis `parseHarga()` yang menerima teks seperti `'18.000'` dan mengembalikan harga sebagai `int`, atau alasan kegagalannya: kosong, bukan angka, atau tidak positif. Jangan melempar exception.

::: details Jawaban
<!-- file: src/Bab05/latihan2.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

enum GalatHarga
{
    case Kosong;
    case BukanAngka;
    case TidakPositif;
}

function parseHarga(string $teks): int|GalatHarga
{
    $rapi = str_replace('.', '', trim($teks));

    if ($rapi === '') {
        return GalatHarga::Kosong;
    }

    $angka = filter_var($rapi, FILTER_VALIDATE_INT);

    if ($angka === false) {
        return GalatHarga::BukanAngka;
    }

    return $angka > 0 ? $angka : GalatHarga::TidakPositif;
}

foreach (['18.000', '', 'gratis', '0'] as $masukan) {
    $hasil = parseHarga($masukan);

    echo "'{$masukan}' -> " . ($hasil instanceof GalatHarga ? $hasil->name : $hasil) . PHP_EOL;
}
```

```text
'18.000' -> 18000
'' -> Kosong
'gratis' -> BukanAngka
'0' -> TidakPositif
```
:::

### 3. Urutan `finally`

Tebak outputnya sebelum menjalankan.

<!-- file: src/Bab05/latihan3.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab05;

function urutan(): string
{
    try {
        echo 'A';

        throw new \RuntimeException('B');
    } catch (\RuntimeException $e) {
        echo $e->getMessage();

        return 'C';
    } finally {
        echo 'D';
    }
}

echo urutan() . PHP_EOL;
```

::: details Jawaban
```text
ABDC
```

`return 'C'` sudah menentukan nilai kembaliannya, tetapi `finally` tetap berjalan sebelum fungsi benar-benar kembali. Karena itu `D` tercetak lebih dulu daripada `C`.
:::
