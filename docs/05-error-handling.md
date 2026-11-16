# 5. Error handling

Rust memisahkan dua hal dengan tegas: `panic!` untuk bug, `Result` untuk kegagalan yang wajar. PHP secara bawaan hanya punya exception, seperti TS. Bab ini menunjukkan cara kerja exception di PHP, sisa-sisa mekanisme lama yang masih ada, lalu cara membuat kegagalan terlihat di tipe supaya PHPStan bisa memaksanya ditangani.

Lanjutkan di proyek `practice/php-basics`. Buat folder `src/Ch05`, dan awali setiap file dengan `namespace Learn\Ch05;`.

## Exception

Buat `src/Ch05/basics.php`:

<!-- file: src/Ch05/basics.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

final class InsufficientBalance extends \RuntimeException
{
    public function __construct(
        public readonly int $balance,
        public readonly int $requested,
    ) {
        parent::__construct("Saldo {$balance} tidak cukup untuk menarik {$requested}");
    }
}

final class LimitExceeded extends \RuntimeException
{
}

const WITHDRAWAL_LIMIT = 1000;

/**
 * @throws InsufficientBalance
 * @throws LimitExceeded
 */
function withdraw(int $balance, int $amount): int
{
    if ($amount <= 0) {
        throw new \InvalidArgumentException('Jumlah penarikan harus positif');
    }

    if ($amount > WITHDRAWAL_LIMIT) {
        throw new LimitExceeded('Maksimal ' . WITHDRAWAL_LIMIT . ' per penarikan');
    }

    if ($amount > $balance) {
        throw new InsufficientBalance($balance, $amount);
    }

    return $balance - $amount;
}

function tryWithdraw(int $balance, int $amount): string
{
    try {
        $remaining = withdraw($balance, $amount);

        return "berhasil, sisa {$remaining}";
    } catch (InsufficientBalance $e) {
        return 'ditolak, kurang ' . ($e->requested - $e->balance);
    } catch (LimitExceeded $e) {
        return "ditolak: {$e->getMessage()}";
    } finally {
        echo "[audit] percobaan tarik {$amount}" . PHP_EOL;
    }
}

echo tryWithdraw(100, 30) . PHP_EOL;
echo tryWithdraw(100, 500) . PHP_EOL;
echo tryWithdraw(5000, 2000) . PHP_EOL;
```

```text
[audit] percobaan tarik 30
berhasil, sisa 70
[audit] percobaan tarik 500
ditolak, kurang 400
[audit] percobaan tarik 2000
ditolak: Maksimal 1000 per penarikan
```

- **Exception adalah objek** dari class yang menurunkan `\Exception`. Class buatan sendiri boleh membawa data, seperti `$balance` dan `$requested`, sehingga penangkapnya tidak perlu membedah teks pesan.
- **`catch` memilih berdasarkan tipe**, dari atas ke bawah. Beberapa tipe bisa digabung: `catch (A|B $e)`.
- **`finally`** selalu berjalan, baik blok `try` selesai normal, mengembalikan nilai, maupun melempar.
- **Tidak ada padanan `Drop`** yang bisa diandalkan untuk membereskan resource. Pakai `finally`.
- **`\InvalidArgumentException` sengaja tidak ditangkap.** Jumlah nol atau negatif adalah bug di kode pemanggil, bukan keadaan yang perlu ditangani. Pembedaannya dijelaskan di bagian hierarki.

Exception yang tidak ditangkap siapa pun menghentikan program. Tempel di akhir `basics.php`:

<!-- demo: uncaught append: src/Ch05/basics.php -->
```php
echo withdraw(100, 500) . PHP_EOL;
```

```text
Fatal error: Uncaught Learn\Ch05\InsufficientBalance: Saldo 100 tidak cukup untuk menarik 500 in /app/src/Ch05/basics.php:38
Stack trace:
#0 /app/src/Ch05/basics.php(63): Learn\Ch05\withdraw(100, 500)
#1 {main}
  thrown in /app/src/Ch05/basics.php on line 38
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

Buat `src/Ch05/hierarchy.php` untuk melihat beberapa di antaranya:

<!-- file: src/Ch05/hierarchy.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

enum Color: string
{
    case Red = 'red';
    case Blue = 'blue';
}

function zero(): int
{
    return 0;
}

/**
 * @param \Closure(): mixed $action
 */
function errorType(\Closure $action): string
{
    try {
        $action();

        return 'tidak ada error';
    } catch (\Throwable $e) {
        return $e::class . ': ' . $e->getMessage();
    }
}

echo errorType(fn (): int => intdiv(10, zero())) . PHP_EOL;
echo errorType(fn (): int => 10 % zero()) . PHP_EOL;
echo errorType(fn (): mixed => json_decode('{rusak', flags: JSON_THROW_ON_ERROR)) . PHP_EOL;
echo errorType(fn (): Color => Color::from('green')) . PHP_EOL;
echo errorType(fn (): int => strlen('aman')) . PHP_EOL;
```

```text
DivisionByZeroError: Division by zero
DivisionByZeroError: Modulo by zero
JsonException: Syntax error
ValueError: "green" is not a valid backing value for enum Learn\Ch05\Color
tidak ada error
```

Pemetaannya ke Rust:

| Rust | PHP | Sikap |
|---|---|---|
| `panic!` | `\Error` dan `\LogicException` | Jangan ditangkap. Perbaiki kodenya |
| `Err(e)` yang diteruskan dengan `?` | `\RuntimeException` dan turunannya | Biarkan merambat, tangkap di tempat yang bisa berbuat sesuatu |
| `Err(e)` yang ditangani pemanggil langsung | Nilai kembalian, lihat di bawah | Wajib ditangani |

`catch (\Throwable $e)` seperti di `errorType()` menangkap semuanya, termasuk bug. Tempatnya hanya di batas terluar program, misalnya untuk mencatat error lalu menampilkan halaman 500. Laravel sudah menyediakan batas itu.

## Warisan lama: warning dan `false`

Fungsi bawaan yang lebih tua dari exception tidak melempar apa pun. Ia mencetak *warning* lalu mengembalikan `false`. Buat `src/Ch05/legacy.php`:

<!-- file: src/Ch05/legacy.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

/**
 * @throws \RuntimeException
 */
function readTextFile(string $path): string
{
    if (!is_file($path)) {
        throw new \RuntimeException("Berkas {$path} tidak ditemukan");
    }

    $contents = file_get_contents($path);

    if ($contents === false) {
        throw new \RuntimeException("Berkas {$path} gagal dibaca");
    }

    return $contents;
}

try {
    echo readTextFile('/tidak/ada.txt') . PHP_EOL;
} catch (\RuntimeException $e) {
    echo $e->getMessage() . PHP_EOL;
}

// Mengubah setiap warning menjadi exception.
set_error_handler(function (int $level, string $message, string $file, int $line): never {
    throw new \ErrorException($message, 0, $level, $file, $line);
});

try {
    $contents = file_get_contents('/tidak/ada.txt');
    echo ($contents === false ? 'gagal tanpa exception' : 'terbaca') . PHP_EOL;
} catch (\ErrorException $e) {
    echo 'Tertangkap: ' . $e->getMessage() . PHP_EOL;
}
```

```text
Berkas /tidak/ada.txt tidak ditemukan
Tertangkap: file_get_contents(/tidak/ada.txt): Failed to open stream: No such file or directory
```

Ada dua cara menghadapi fungsi seperti ini:

- **Bungkus sekali**, seperti `readTextFile()`: periksa `false`, ubah menjadi exception, dan kembalikan tipe yang bersih. PHPStan memaksa pengecekan `false` itu, seperti yang kamu lihat di [Bab 2](/02-type-system).
- **Ubah semua warning menjadi exception** dengan `set_error_handler()`. Laravel melakukannya untukmu, sehingga di aplikasi Laravel sebuah warning langsung menghentikan request.

Beberapa fungsi punya saklar sendiri. Yang paling sering dipakai adalah `JSON_THROW_ON_ERROR` pada `json_decode()` dan `json_encode()`, yang sudah dipakai sejak [Bab 2](/02-type-system).

## Membuat exception terlihat

Kelemahan exception adalah tidak tampak di signature. Dari `function withdraw(int $balance, int $amount): int` kamu tidak tahu ia bisa gagal. Konvensinya adalah tag `@throws`, seperti pada `withdraw()` dan `readTextFile()` di atas.

PHPStan sudah memanfaatkan tag itu tanpa pengaturan apa pun: daftar `@throws` dianggap lengkap, sehingga menangkap exception yang tidak tercantum dilaporkan. Timpa `src/Ch05/scratch.php`:

<!-- demo: dead-catch norun -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

/**
 * @throws \RuntimeException
 */
function loadText(string $path): string
{
    if (!is_file($path)) {
        throw new \RuntimeException("Berkas {$path} tidak ada");
    }

    return 'isi berkas';
}

try {
    echo loadText('/tidak/ada.txt') . PHP_EOL;
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

Dengan konfigurasi ini, setiap exception dianggap *checked* kecuali `LogicException`, `Error`, dan turunannya. Fungsi yang bisa melempar exception checked wajib menuliskannya di `@throws`, atau menangkapnya. Buat `src/Ch05/throws.php`:

<!-- file: src/Ch05/throws.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

final class ConfigMissing extends \RuntimeException
{
}

/**
 * @return array<string, string>
 *
 * @throws ConfigMissing
 */
function loadConfig(string $path): array
{
    if (!is_file($path)) {
        throw new ConfigMissing("Berkas konfigurasi {$path} tidak ada");
    }

    return ['mode' => 'production'];
}

/**
 * @throws ConfigMissing
 */
function appMode(string $path): string
{
    return loadConfig($path)['mode'] ?? 'development';
}

function modeOrDefault(string $path): string
{
    try {
        return appMode($path);
    } catch (ConfigMissing) {
        return 'development';
    }
}

echo modeOrDefault('/tidak/ada.ini') . PHP_EOL;
```

```text
development
```

Periksa folder bab ini dengan konfigurasi tadi:

```bash
vendor/bin/phpstan analyse -c phpstan-throws.neon src/Ch05
```

```text
 [OK] No errors
```

`appMode()` hanya meneruskan exception, jadi ia wajib menuliskannya. `modeOrDefault()` menangkapnya, jadi tidak perlu. Sekarang hapus `@throws` dari salah satunya. Timpa `src/Ch05/scratch.php`:

<!-- demo: throws-missing norun -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

final class OutOfStock extends \RuntimeException
{
}

function takeOne(int $stock): int
{
    if ($stock === 0) {
        throw new OutOfStock('Stok habis');
    }

    return $stock - 1;
}
```

```text
Function Learn\Ch05\takeOne() throws checked exception Learn\Ch05\OutOfStock but it's missing from the PHPDoc @throws tag.
```

Ini padanan terdekat dari `Result` di signature: kegagalan menjadi bagian dari kontrak fungsi, dan lupa menuliskannya adalah error.

::: info Kenapa di berkas terpisah
Aturan ini berlaku untuk seluruh kode yang dianalisis, termasuk contoh-contoh bab sebelumnya yang belum menulis `@throws`. Di materi ini ia hanya dipakai untuk `src/Ch05`. Di proyek baru milikmu sendiri, taruh langsung di `phpstan.neon`.
:::

## Kegagalan sebagai nilai

Untuk kegagalan yang wajar dan harus langsung ditangani pemanggil, seperti input yang tidak valid, exception terasa berlebihan. Alternatifnya mengembalikan kegagalan itu sebagai nilai, lewat union type. Buat `src/Ch05/union.php`:

<!-- file: src/Ch05/union.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

enum AgeError
{
    case NotANumber;
    case Negative;
    case TooLarge;

    public function message(): string
    {
        return match ($this) {
            self::NotANumber => 'bukan bilangan bulat',
            self::Negative => 'tidak boleh negatif',
            self::TooLarge => 'terlalu besar',
        };
    }
}

function parseAge(string $text): int|AgeError
{
    $number = filter_var($text, FILTER_VALIDATE_INT);

    return match (true) {
        $number === false => AgeError::NotANumber,
        $number < 0 => AgeError::Negative,
        $number > 150 => AgeError::TooLarge,
        default => $number,
    };
}

foreach (['42', 'abc', '-5', '999'] as $input) {
    $result = parseAge($input);

    echo $input . ' -> ' . ($result instanceof AgeError ? $result->message() : "umur {$result}") . PHP_EOL;
}
```

```text
42 -> umur 42
abc -> bukan bilangan bulat
-5 -> tidak boleh negatif
999 -> terlalu besar
```

`int|AgeError` adalah `Result<i64, AgeError>` versi ringan. Pemanggil tidak bisa memakai hasilnya sebagai `int` sebelum menyingkirkan `AgeError`. Tempel di akhir `union.php`:

<!-- demo: union-wrong append: src/Ch05/union.php -->
```php
echo (parseAge('abc') + 1) . PHP_EOL;
```

```text
Binary operation "+" between int|Learn\Ch05\AgeError and 1 results in an error.
Binary operation "." between mixed and "\n"|"\r\n" results in an error.
```

```text
Fatal error: Uncaught TypeError: Unsupported operand types: Learn\Ch05\AgeError + int
```

Untuk kasus tanpa alasan kegagalan, `?T` sudah cukup: itu `Option`.

### `Ok` dan `Err`

Union langsung seperti di atas tidak bisa dipakai kalau nilai sukses dan nilai gagal bertipe sama, dan tidak punya bentuk yang seragam. Kalau kamu ingin `Result` yang sesungguhnya, dua class generic kecil sudah cukup. Buat `src/Ch05/result.php`:

<!-- file: src/Ch05/result.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

/**
 * @template-covariant T
 */
final readonly class Ok
{
    /**
     * @param T $value
     */
    public function __construct(public mixed $value)
    {
    }
}

/**
 * @template-covariant E
 */
final readonly class Err
{
    /**
     * @param E $error
     */
    public function __construct(public mixed $error)
    {
    }
}

enum StockError
{
    case InvalidQuantity;
    case InsufficientStock;
}

/**
 * @return Ok<int>|Err<StockError>
 */
#[\NoDiscard]
function reduceStock(int $stock, int $quantity): Ok|Err
{
    if ($quantity <= 0) {
        return new Err(StockError::InvalidQuantity);
    }

    if ($quantity > $stock) {
        return new Err(StockError::InsufficientStock);
    }

    return new Ok($stock - $quantity);
}

/**
 * @return Ok<int>|Err<StockError>
 */
#[\NoDiscard]
function sellTwice(int $stock, int $first, int $second): Ok|Err
{
    $result = reduceStock($stock, $first);

    if ($result instanceof Err) {
        return $result;
    }

    return reduceStock($result->value, $second);
}

/**
 * @param Ok<int>|Err<StockError> $result
 */
function report(Ok|Err $result): string
{
    return match (true) {
        $result instanceof Ok => "sisa stok {$result->value}",
        $result instanceof Err => "gagal: {$result->error->name}",
    };
}

echo report(sellTwice(10, 3, 4)) . PHP_EOL;
echo report(sellTwice(10, 3, 9)) . PHP_EOL;
echo report(sellTwice(10, 0, 1)) . PHP_EOL;
```

```text
sisa stok 3
gagal: InsufficientStock
gagal: InvalidQuantity
```

- **`@template-covariant`** membuat `Err<StockError::InsufficientStock>` diterima sebagai `Err<StockError>`. Itu aman karena class-nya `readonly`: isinya hanya bisa dibaca.
- **Tidak ada operator `?`.** Tiga baris `if ($result instanceof Err) { return $result; }` di `sellTwice()` adalah penggantinya, ditulis tangan di setiap langkah.
- **`#[\NoDiscard]`** (PHP 8.5) adalah padanan `#[must_use]`: hasil fungsi tidak boleh dibuang begitu saja.

Tanpa `#[\NoDiscard]`, kegagalan yang dikembalikan sebagai nilai bisa hilang tanpa jejak. Tempel di akhir `result.php`:

<!-- demo: discarded append: src/Ch05/result.php -->
```php
reduceStock(5, 10);
(void) reduceStock(5, 10);
```

```text
Call to function Learn\Ch05\reduceStock() on a separate line discards return value.
Call to function Learn\Ch05\reduceStock() on a separate line has no effect.
```

```text
Warning: The return value of function Learn\Ch05\reduceStock() should either be used or intentionally ignored by casting it as (void)
```

Kedua pesan itu untuk baris pertama. Baris kedua, dengan cast `(void)`, tidak dilaporkan: itu cara menyatakan bahwa hasilnya memang sengaja diabaikan.

## Memilih pendekatan

| Situasi | Pendekatan |
|---|---|
| Bug: argumen mustahil, keadaan yang seharusnya tidak terjadi | Lempar `\LogicException` atau biarkan `\Error`. Jangan ditangkap |
| Kegagalan lingkungan: berkas, jaringan, database | Exception turunan `\RuntimeException`, dengan `@throws`, dibiarkan merambat |
| Tidak ditemukan, tanpa perlu alasan | `?T` |
| Kegagalan wajar yang harus ditangani pemanggil langsung: validasi, parsing | Union `T\|Error`, atau `Ok\|Err` |

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

Tulis `loadSettings()` yang menerima teks JSON dan mengembalikan array. Kalau JSON-nya rusak atau isinya bukan objek, lempar exception buatanmu sendiri, `SettingsCorrupted`. Exception asli dari `json_decode()` tidak boleh hilang.

::: details Jawaban
<!-- file: src/Ch05/exercise1.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

final class SettingsCorrupted extends \RuntimeException
{
}

/**
 * @return array<mixed>
 *
 * @throws SettingsCorrupted
 */
function loadSettings(string $json): array
{
    try {
        $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
    } catch (\JsonException $e) {
        throw new SettingsCorrupted('Pengaturan bukan JSON yang sah', previous: $e);
    }

    if (!is_array($data)) {
        throw new SettingsCorrupted('Pengaturan harus berupa objek JSON');
    }

    return $data;
}

try {
    loadSettings('{rusak');
} catch (SettingsCorrupted $e) {
    echo $e->getMessage() . PHP_EOL;
    echo 'Penyebab: ' . ($e->getPrevious()?->getMessage() ?? '(tidak ada)') . PHP_EOL;
}
```

```text
Pengaturan bukan JSON yang sah
Penyebab: Syntax error
```

Argumen `previous` menyimpan exception asal, seperti `source()` pada error di Rust. Pemanggil hanya perlu mengenal `SettingsCorrupted`, sedangkan detail teknisnya tetap tersedia untuk log.
:::

### 2. Dari exception ke nilai

Tulis `parsePrice()` yang menerima teks seperti `'18.000'` dan mengembalikan harga sebagai `int`, atau alasan kegagalannya: kosong, bukan angka, atau tidak positif. Jangan melempar exception.

::: details Jawaban
<!-- file: src/Ch05/exercise2.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

enum PriceError
{
    case Blank;
    case NotANumber;
    case NotPositive;
}

function parsePrice(string $text): int|PriceError
{
    $clean = str_replace('.', '', trim($text));

    if ($clean === '') {
        return PriceError::Blank;
    }

    $number = filter_var($clean, FILTER_VALIDATE_INT);

    if ($number === false) {
        return PriceError::NotANumber;
    }

    return $number > 0 ? $number : PriceError::NotPositive;
}

foreach (['18.000', '', 'gratis', '0'] as $input) {
    $result = parsePrice($input);

    echo "'{$input}' -> " . ($result instanceof PriceError ? $result->name : $result) . PHP_EOL;
}
```

```text
'18.000' -> 18000
'' -> Blank
'gratis' -> NotANumber
'0' -> NotPositive
```
:::

### 3. Urutan `finally`

Tebak outputnya sebelum menjalankan.

<!-- file: src/Ch05/exercise3.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch05;

function sequence(): string
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

echo sequence() . PHP_EOL;
```

::: details Jawaban
```text
ABDC
```

`return 'C'` sudah menentukan nilai kembaliannya, tetapi `finally` tetap berjalan sebelum fungsi benar-benar kembali. Karena itu `D` tercetak lebih dulu daripada `C`.
:::
