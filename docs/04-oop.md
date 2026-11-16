# 4. OOP

Model objek PHP berbasis class, mirip TS dan Java. Kalau kamu datang dari Rust, petanya begini: class adalah `struct` beserta `impl`-nya, interface adalah `trait`, dan tidak ada ownership. Bab ini fokus ke fitur modern yang membuat class PHP ketat dan immutable, sampai PHP 8.5.

Lanjutkan di proyek `latihan/php-dasar`. Buat folder `src/Bab04`, dan awali setiap file dengan `namespace Belajar\Bab04;`.

## Class, property, dan constructor

Buat `src/Bab04/produk.php`:

<!-- file: src/Bab04/produk.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final class Produk
{
    public function __construct(
        public readonly string $nama,
        public readonly int $harga,
        private int $stok = 0,
    ) {
    }

    public function stok(): int
    {
        return $this->stok;
    }

    public function kurangiStok(int $jumlah): void
    {
        if ($jumlah > $this->stok) {
            throw new \DomainException("Stok {$this->nama} tidak cukup");
        }

        $this->stok -= $jumlah;
    }
}

$kopi = new Produk('Kopi', 18000, stok: 10);
$kopi->kurangiStok(3);

echo "{$kopi->nama}: Rp {$kopi->harga}, stok {$kopi->stok()}" . PHP_EOL;
```

```text
Kopi: Rp 18000, stok 7
```

- **Constructor promotion.** Parameter constructor yang diberi visibility (`public`, `private`) otomatis menjadi property dan langsung diisi. Ini sama dengan parameter property di TS.
- **`$this->` wajib.** Property dan method sendiri tidak pernah diakses tanpa `$this->`.
- **`readonly`** berarti property hanya bisa diisi satu kali, di dalam class. Ini padanan field tanpa `mut` di Rust dan `readonly` di TS, tetapi dijaga saat runtime.
- **`final`** melarang class diturunkan. Jadikan ini kebiasaan bawaan; lepaskan hanya kalau memang dirancang untuk diturunkan.
- **Visibility bawaan adalah `public`.** Selalu tulis secara eksplisit. Pilihannya `public`, `protected` (class itu dan turunannya), dan `private`. Tidak ada padanan `pub(crate)`.

Sekarang langgar aturannya. Tempel di akhir `produk.php`:

<!-- demo: produk-salah append: src/Bab04/produk.php -->
```php
$kopi->harga = 20000;
echo $kopi->stok . PHP_EOL;
```

```text
Assign to protected(set) property Belajar\Bab04\Produk::$harga.
Access to private property Belajar\Bab04\Produk::$stok.
```

```text
Fatal error: Uncaught Error: Cannot modify readonly property Belajar\Bab04\Produk::$harga
```

PHPStan menyebut `$harga` sebagai `protected(set)` karena begitulah PHP memperlakukan property `readonly`: boleh dibaca dari luar, tetapi hanya boleh diisi dari dalam class dan turunannya. Istilah itu dijelaskan di bagian property hooks di bawah.

## Interface dan nominal typing

Interface di PHP adalah padanan `trait` di Rust: daftar method yang harus dipenuhi. Buat `src/Bab04/diskon.php`:

<!-- file: src/Bab04/diskon.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

interface Diskon
{
    public function hitung(int $subtotal): int;
}

final readonly class DiskonPersen implements Diskon
{
    public function __construct(private int $persen)
    {
    }

    #[\Override]
    public function hitung(int $subtotal): int
    {
        return intdiv($subtotal * $this->persen, 100);
    }
}

final readonly class DiskonTetap implements Diskon
{
    public function __construct(private int $potongan)
    {
    }

    #[\Override]
    public function hitung(int $subtotal): int
    {
        return min($this->potongan, $subtotal);
    }
}

function totalBayar(int $subtotal, Diskon $diskon): int
{
    return $subtotal - $diskon->hitung($subtotal);
}

echo totalBayar(100000, new DiskonPersen(10)) . PHP_EOL;
echo totalBayar(100000, new DiskonTetap(25000)) . PHP_EOL;
```

```text
90000
75000
```

- **`readonly class`** membuat semua property-nya `readonly` sekaligus.
- **`#[\Override]`** adalah attribute, padanan kata kunci `override` di TS. PHP dan PHPStan menolak kalau method itu ternyata tidak menimpa atau mengimplementasikan apa pun, misalnya karena salah ketik nama.

### Bentuk yang sama tidak cukup

Di TS, objek apa pun yang punya method `hitung` dengan bentuk yang cocok bisa dipakai sebagai `Diskon`. Di PHP tidak. Tempel di akhir `diskon.php`:

<!-- demo: struktural append: src/Bab04/diskon.php -->
```php
final readonly class DiskonPalsu
{
    public function hitung(int $subtotal): int
    {
        return 0;
    }
}

echo totalBayar(100000, new DiskonPalsu()) . PHP_EOL;
```

```text
Parameter #2 $diskon of function Belajar\Bab04\totalBayar expects Belajar\Bab04\Diskon, Belajar\Bab04\DiskonPalsu given.
```

```text
Fatal error: Uncaught TypeError: Belajar\Bab04\totalBayar(): Argument #2 ($diskon) must be of type Belajar\Bab04\Diskon, Belajar\Bab04\DiskonPalsu given
```

PHP memakai *nominal typing*, seperti Rust: sebuah class memenuhi interface hanya kalau menyatakannya lewat `implements`, sama seperti `impl Trait for Type` yang harus ditulis.

## Inheritance dan tipe gabungan

Buat `src/Bab04/bentuk.php`:

<!-- file: src/Bab04/bentuk.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

abstract readonly class Bentuk
{
    abstract public function luas(): float;

    public function ringkasan(): string
    {
        return sprintf('%s dengan luas %.2f', static::class, $this->luas());
    }
}

final readonly class Lingkaran extends Bentuk
{
    public function __construct(public float $jariJari)
    {
    }

    #[\Override]
    public function luas(): float
    {
        return M_PI * $this->jariJari ** 2;
    }
}

final readonly class PersegiPanjang extends Bentuk
{
    public function __construct(
        public float $lebar,
        public float $tinggi,
    ) {
    }

    #[\Override]
    public function luas(): float
    {
        return $this->lebar * $this->tinggi;
    }
}

function deskripsi(Lingkaran|PersegiPanjang $bentuk): string
{
    return match (true) {
        $bentuk instanceof Lingkaran => "lingkaran berjari-jari {$bentuk->jariJari}",
        $bentuk instanceof PersegiPanjang => "persegi panjang {$bentuk->lebar} x {$bentuk->tinggi}",
    };
}

$daftar = [new Lingkaran(1.5), new PersegiPanjang(2, 3.5)];

foreach ($daftar as $bentuk) {
    echo deskripsi($bentuk) . PHP_EOL;
    echo $bentuk->ringkasan() . PHP_EOL;
}
```

```text
lingkaran berjari-jari 1.5
Belajar\Bab04\Lingkaran dengan luas 7.07
persegi panjang 2 x 3.5
Belajar\Bab04\PersegiPanjang dengan luas 7.00
```

- **`abstract class`** tidak bisa dibuat objeknya dan boleh punya method tanpa badan. Bedanya dengan interface: ia boleh membawa implementasi dan property.
- **`extends`** hanya boleh satu. Tidak ada multiple inheritance.
- **`static::class`** adalah nama class objek yang sebenarnya saat runtime. `self` selalu menunjuk class tempat kodenya ditulis, sedangkan `static` mengikuti class turunan.

### Pengganti enum pembawa data

[Bab 2](/02-type-system) menyebut enum PHP tidak bisa membawa data. Fungsi `deskripsi()` di atas menunjukkan penggantinya: beberapa class `final`, digabung dengan union type, lalu dipilah dengan `match (true)` dan `instanceof`. Di dalam tiap cabang, PHPStan mempersempit tipenya sehingga `$bentuk->jariJari` hanya bisa diakses di cabang `Lingkaran`.

Kelengkapannya juga diperiksa. Tempel di akhir `bentuk.php`:

<!-- demo: bentuk-kurang append: src/Bab04/bentuk.php norun -->
```php
function namaBentuk(Lingkaran|PersegiPanjang $bentuk): string
{
    return match (true) {
        $bentuk instanceof Lingkaran => 'lingkaran',
    };
}
```

```text
Match expression does not handle remaining value: true
```

Pesannya tidak sejelas Rust, tetapi jaminannya sama: menambah anggota baru ke union akan memunculkan error di setiap `match` yang belum menanganinya.

## Trait bukan trait Rust

Nama yang sama, konsep berbeda. Trait di PHP adalah sekumpulan method yang disalin ke dalam class yang memakainya. Buat `src/Bab04/trait.php`:

<!-- file: src/Bab04/trait.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

trait PunyaSlug
{
    abstract public function judul(): string;

    public function slug(): string
    {
        return strtolower(str_replace(' ', '-', trim($this->judul())));
    }
}

final readonly class Artikel
{
    use PunyaSlug;

    public function __construct(private string $judul)
    {
    }

    public function judul(): string
    {
        return $this->judul;
    }
}

final readonly class Kategori
{
    use PunyaSlug;

    public function __construct(private string $nama)
    {
    }

    public function judul(): string
    {
        return $this->nama;
    }
}

echo new Artikel('Belajar PHP Modern')->slug() . PHP_EOL;
echo new Kategori('Tips dan Trik')->slug() . PHP_EOL;
```

```text
belajar-php-modern
tips-dan-trik
```

| Kebutuhan | Rust | PHP |
|---|---|---|
| Kontrak yang bisa dijadikan tipe | `trait` | `interface` |
| Implementasi bawaan yang dibagi | Method bawaan di `trait` | `trait`, atau abstract class |
| Dipakai sebagai tipe parameter | Bisa | Trait tidak bisa, interface bisa |

Trait bukan tipe: kamu tidak bisa menulis `function f(PunyaSlug $x)`. Pakai seperlunya. Kamu akan sering melihatnya di Laravel, misalnya `use HasFactory;` pada model.

## Value object

Class kecil yang immutable dan menjaga aturannya sendiri adalah padanan *newtype* di Rust. Buat `src/Bab04/uang.php`:

<!-- file: src/Bab04/uang.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final readonly class Uang implements \Stringable
{
    public const int MAKSIMUM = 1_000_000_000;

    private function __construct(public int $rupiah)
    {
    }

    public static function rupiah(int $jumlah): self
    {
        if ($jumlah < 0 || $jumlah > self::MAKSIMUM) {
            throw new \InvalidArgumentException("Jumlah {$jumlah} di luar batas");
        }

        return new self($jumlah);
    }

    public function tambah(self $lain): self
    {
        return self::rupiah($this->rupiah + $lain->rupiah);
    }

    public function sama(self $lain): bool
    {
        return $this->rupiah === $lain->rupiah;
    }

    #[\Override]
    public function __toString(): string
    {
        return 'Rp ' . number_format($this->rupiah, 0, ',', '.');
    }
}

$harga = Uang::rupiah(18000);
$total = $harga->tambah(Uang::rupiah(7000));

echo $total . PHP_EOL;
echo "Total: {$total}" . PHP_EOL;
var_dump($total->sama(Uang::rupiah(25000)));
var_dump($total == Uang::rupiah(25000));
var_dump($total === Uang::rupiah(25000));
echo Uang::MAKSIMUM . PHP_EOL;
```

```text
Rp 25.000
Total: Rp 25.000
bool(true)
bool(true)
bool(false)
1000000000
```

- **Constructor `private` dan method `static`** membentuk *named constructor*: satu-satunya jalan membuat `Uang` adalah `Uang::rupiah()`, yang memvalidasi. Siapa pun yang memegang objek `Uang` tahu isinya sah.
- **`::`** mengakses anggota milik class: method `static` dan konstanta. `->` mengakses anggota milik objek.
- **`const int`** adalah konstanta class bertipe (PHP 8.3).
- **`\Stringable` dan `__toString()`** membuat objek bisa dipakai sebagai string, padanan `impl Display`.
- **Tidak ada method yang mengubah isi.** `tambah()` mengembalikan objek baru.

### Membandingkan objek

Tiga baris `var_dump` di atas menunjukkan tiga arti "sama":

- **`===`** benar hanya untuk objek yang identik, yaitu handle ke objek yang sama.
- **`==`** benar kalau class-nya sama dan semua property-nya sama. Ini satu-satunya tempat `==` masih masuk akal, tetapi perbandingan property-nya ikut longgar.
- **Method sendiri** seperti `sama()` adalah cara yang paling jelas. PHP tidak punya padanan `PartialEq` yang bisa diimplementasikan.

## Property hooks dan asymmetric visibility

PHP 8.4 menambahkan dua fitur yang menghapus kebutuhan getter dan setter. Buat `src/Bab04/pengguna.php`:

<!-- file: src/Bab04/pengguna.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final class Pengguna
{
    public private(set) string $email;

    public string $nama {
        set(string $nilai) {
            $this->nama = trim($nilai);
        }
    }

    public string $inisial {
        get => strtoupper(substr($this->nama, 0, 1));
    }

    public function __construct(string $nama, string $email)
    {
        $this->nama = $nama;
        $this->gantiEmail($email);
    }

    public function gantiEmail(string $email): void
    {
        if (!str_contains($email, '@')) {
            throw new \InvalidArgumentException("Email {$email} tidak valid");
        }

        $this->email = strtolower($email);
    }
}

$pengguna = new Pengguna('  Siti Rahma ', 'Siti@Example.com');

echo "[{$pengguna->nama}] {$pengguna->email} ({$pengguna->inisial})" . PHP_EOL;

$pengguna->nama = ' Siti R. ';
$pengguna->gantiEmail('siti.r@example.com');

echo "[{$pengguna->nama}] {$pengguna->email} ({$pengguna->inisial})" . PHP_EOL;
```

```text
[Siti Rahma] siti@example.com (S)
[Siti R.] siti.r@example.com (S)
```

- **`public private(set)`** adalah asymmetric visibility: property bisa dibaca dari mana saja, tetapi hanya bisa diisi dari dalam class.
- **Hook `set`** berjalan setiap kali property diisi. Di sini ia merapikan spasi.
- **Hook `get`** tanpa penyimpanan membuat property virtual: `$inisial` dihitung setiap kali dibaca, seperti getter di TS.

Mengisi `$email` dari luar ditolak. Tempel di akhir `pengguna.php`:

<!-- demo: email-luar append: src/Bab04/pengguna.php -->
```php
$pengguna->email = 'bebas@example.com';
```

```text
Assign to private(set) property Belajar\Bab04\Pengguna::$email.
```

```text
Fatal error: Uncaught Error: Cannot modify private(set) property Belajar\Bab04\Pengguna::$email from global scope
```

Kapan memakai yang mana:

| Kebutuhan | Pakai |
|---|---|
| Nilai yang tidak pernah berubah setelah dibuat | `readonly` |
| Boleh berubah, tetapi hanya lewat method class itu | `private(set)` |
| Validasi atau perapian setiap kali diisi | Hook `set` |
| Nilai turunan dari property lain | Hook `get` |

## Mengubah objek immutable dengan `clone`

Objek `readonly` tidak bisa diubah, jadi "mengubah" berarti membuat salinan dengan satu bagian berbeda. PHP 8.5 menyediakan `clone` dengan daftar perubahan. Buat `src/Bab04/alamat.php`:

<!-- file: src/Bab04/alamat.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final readonly class Alamat
{
    public function __construct(
        public string $jalan,
        public string $kota,
    ) {
    }

    public function pindahKe(string $kota): self
    {
        return clone($this, ['kota' => $kota]);
    }
}

$lama = new Alamat('Jl. Merdeka 1', 'Bandung');
$baru = $lama->pindahKe('Jakarta');

echo "{$lama->jalan}, {$lama->kota}" . PHP_EOL;
echo "{$baru->jalan}, {$baru->kota}" . PHP_EOL;
```

```text
Jl. Merdeka 1, Bandung
Jl. Merdeka 1, Jakarta
```

Ini padanan `Alamat { kota, ..lama }` di Rust dan `{ ...lama, kota }` di TS.

## Generics pada class

`@template` dari [Bab 2](/02-type-system) juga berlaku untuk class. Buat `src/Bab04/koleksi.php`:

<!-- file: src/Bab04/koleksi.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

/**
 * @template T
 */
final readonly class Koleksi
{
    /**
     * @param list<T> $item
     */
    public function __construct(private array $item)
    {
    }

    /**
     * @template U
     * @param \Closure(T): U $fn
     * @return self<U>
     */
    public function petakan(\Closure $fn): self
    {
        return new self(array_map($fn, $this->item));
    }

    /**
     * @param \Closure(T): bool $fn
     * @return self<T>
     */
    public function saring(\Closure $fn): self
    {
        return new self(array_values(array_filter($this->item, $fn)));
    }

    /**
     * @return list<T>
     */
    public function semua(): array
    {
        return $this->item;
    }
}

$label = new Koleksi([18000, 25000, 9000])
    ->saring(fn (int $harga): bool => $harga >= 10000)
    ->petakan(fn (int $harga): string => 'Rp ' . number_format($harga, 0, ',', '.'));

echo implode(', ', $label->semua()) . PHP_EOL;
```

```text
Rp 18.000, Rp 25.000
```

`T` disimpulkan dari argumen constructor, dan `petakan()` mengubah `Koleksi<int>` menjadi `Koleksi<string>`. Tempel di akhir `koleksi.php`:

<!-- demo: koleksi-salah append: src/Bab04/koleksi.php norun -->
```php
\PHPStan\dumpType($label);
$label->petakan(fn (int $harga): int => $harga * 2);
```

```text
Dumped type: Belajar\Bab04\Koleksi<non-falsy-string>
Parameter #1 $fn of method Belajar\Bab04\Koleksi<string>::petakan() expects Closure(non-falsy-string): int, Closure(int): int given.
```

`non-falsy-string` adalah `string` yang dipersempit: PHPStan tahu hasil gabungan `'Rp '` dengan teks lain tidak mungkin kosong.

Class ini miniatur `Collection` milik Laravel, yang kamu pakai mulai [Bab 8](/08-laravel-dasar). Interface juga bisa generic: tulis `@template T` di interface-nya, lalu `@implements Repositori<Produk>` di class yang mengimplementasikannya.

### Type alias

Array shape yang dipakai berulang bisa diberi nama dengan `@phpstan-type`. Buat `src/Bab04/alias.php`:

<!-- file: src/Bab04/alias.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

/**
 * @phpstan-type BarisProduk array{nama: string, harga: int, stok?: int}
 */
final readonly class ProdukRingkas
{
    private function __construct(
        public string $nama,
        public int $harga,
        public int $stok,
    ) {
    }

    /**
     * @param BarisProduk $baris
     */
    public static function dariArray(array $baris): self
    {
        return new self($baris['nama'], $baris['harga'], $baris['stok'] ?? 0);
    }
}

$teh = ProdukRingkas::dariArray(['nama' => 'Teh', 'harga' => 12000]);

echo "{$teh->nama}: {$teh->harga}, stok {$teh->stok}" . PHP_EOL;
```

```text
Teh: 12000, stok 0
```

Alias ini milik class tempat ia ditulis. Class lain mengimpornya dengan `@phpstan-import-type BarisProduk from ProdukRingkas`.

## Dependency injection

Class yang membutuhkan class lain menerimanya lewat constructor, dengan tipe interface. Buat `src/Bab04/layanan.php`:

<!-- file: src/Bab04/layanan.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

interface Pencatat
{
    public function catat(string $pesan): void;
}

final class PencatatLayar implements Pencatat
{
    #[\Override]
    public function catat(string $pesan): void
    {
        echo "[log] {$pesan}" . PHP_EOL;
    }
}

final class PencatatMemori implements Pencatat
{
    /** @var list<string> */
    public private(set) array $pesan = [];

    #[\Override]
    public function catat(string $pesan): void
    {
        $this->pesan[] = $pesan;
    }
}

final readonly class LayananPesanan
{
    public function __construct(private Pencatat $pencatat)
    {
    }

    public function buat(string $produk, int $jumlah): string
    {
        $nomor = sprintf('ORD-%s-%03d', strtoupper($produk), $jumlah);
        $this->pencatat->catat("Pesanan {$nomor}: {$jumlah} x {$produk}");

        return $nomor;
    }
}

$layanan = new LayananPesanan(new PencatatLayar());
$layanan->buat('Kopi', 2);

$memori = new PencatatMemori();
new LayananPesanan($memori)->buat('Teh', 1);
echo count($memori->pesan) . ' pesan tercatat' . PHP_EOL;
```

```text
[log] Pesanan ORD-KOPI-002: 2 x Kopi
1 pesan tercatat
```

`LayananPesanan` tidak tahu ke mana catatannya pergi. Di aplikasi ia diberi `PencatatLayar`, di test diberi `PencatatMemori` yang isinya bisa diperiksa. Polanya sama dengan menerima `impl Trait` atau `Box<dyn Trait>` di Rust.

Ini penting untuk bab-bab Laravel: framework itu membaca tipe parameter constructor, lalu membuatkan dan menyuntikkan objeknya secara otomatis. Mekanisme itu disebut *service container*, dan seluruhnya bertumpu pada pola di atas.

## Attribute

`#[\Override]` yang dipakai sejak tadi adalah *attribute*: metadata terstruktur yang ditempel pada class, method, property, atau parameter. Padanannya `#[derive(...)]` dan attribute lain di Rust, atau decorator di TS. Bedanya, attribute PHP tidak mengubah kode; ia hanya data yang dibaca PHP, PHPStan, atau framework.

| Attribute bawaan | Guna |
|---|---|
| `#[\Override]` | Method ini harus menimpa atau mengimplementasikan sesuatu |
| `#[\Deprecated]` | Pemakaian fungsi atau method ini memicu peringatan |
| `#[\NoDiscard]` | Nilai kembalian tidak boleh diabaikan, dibahas di [Bab 5](/05-error-handling) |
| `#[\SensitiveParameter]` | Nilai parameter disembunyikan dari stack trace |

Framework mendefinisikan attribute sendiri. Kamu akan memakainya di PHPUnit ([Bab 6](/06-ekosistem)) dan Livewire ([Bab 9](/09-laravel-lanjut)).

## Yang sebaiknya dihindari

PHP punya *magic method* seperti `__get()` dan `__call()`, yang dijalankan ketika kode mengakses property atau method yang tidak ada. Dengan itu sebuah class bisa menjawab nama apa pun saat runtime, dan justru karena itu PHPStan tidak bisa memeriksanya. Jangan menulisnya di kode sendiri.

Kamu tetap perlu tahu keberadaannya, karena Eloquent di Laravel dibangun di atasnya: `$user->email` pada sebuah model sebenarnya lewat `__get()`. Itulah alasan Larastan ada, dibahas di [Bab 9](/09-laravel-lanjut).

## Ringkasan

- **Class modern PHP**: `final`, constructor promotion, tipe di setiap property, visibility eksplisit.
- **Nominal typing**: class harus menulis `implements`. Interface adalah padanan `trait` Rust, sedangkan `trait` PHP hanyalah method yang disalin.
- **Immutability**: `readonly` untuk value object, `clone` dengan daftar perubahan untuk membuat versi baru.
- **Mutasi terkendali**: `private(set)` dan property hooks menggantikan getter dan setter.
- **Union dari class `final` dengan `match (true)`** menggantikan enum pembawa data, lengkap dengan pengecekan kelengkapan.
- **Generics pada class** lewat `@template`, dan `@phpstan-type` untuk alias.
- **Dependency lewat constructor bertipe interface**, pola yang dipakai service container Laravel.

## Latihan

### 1. Value object `Email`

Buat class `Email` yang immutable. Satu-satunya cara membuatnya adalah `Email::dari(string)`, yang merapikan spasi dan huruf besar lalu menolak teks yang bukan email. Tambahkan method `domain()` dan buat objeknya bisa dipakai sebagai string.

::: details Jawaban
<!-- file: src/Bab04/latihan1.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final readonly class Email implements \Stringable
{
    private function __construct(public string $alamat)
    {
    }

    public static function dari(string $teks): self
    {
        $rapi = strtolower(trim($teks));

        if (filter_var($rapi, FILTER_VALIDATE_EMAIL) === false) {
            throw new \InvalidArgumentException("Email {$teks} tidak valid");
        }

        return new self($rapi);
    }

    public function domain(): string
    {
        $posisi = strrpos($this->alamat, '@');

        return $posisi === false ? '' : substr($this->alamat, $posisi + 1);
    }

    #[\Override]
    public function __toString(): string
    {
        return $this->alamat;
    }
}

$email = Email::dari('  Budi@Example.COM ');

echo "{$email} di {$email->domain()}" . PHP_EOL;
```

```text
budi@example.com di example.com
```

Fungsi mana pun yang menerima parameter bertipe `Email` tidak perlu memvalidasi lagi: tipenya sudah menjadi bukti.
:::

### 2. Tipe gabungan untuk pembayaran

Modelkan tiga cara bayar: tunai (jumlah yang diterima), transfer (nama bank dan nomor rekening), dan QRIS (id transaksi). Tulis `ringkasBayar()` yang menerima salah satunya dan mengembalikan deskripsi, dengan `match` yang lengkap.

::: details Jawaban
<!-- file: src/Bab04/latihan2.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final readonly class Tunai
{
    public function __construct(public int $diterima)
    {
    }
}

final readonly class Transfer
{
    public function __construct(
        public string $bank,
        public string $nomorRekening,
    ) {
    }
}

final readonly class Qris
{
    public function __construct(public string $idTransaksi)
    {
    }
}

function ringkasBayar(Tunai|Transfer|Qris $bayar): string
{
    return match (true) {
        $bayar instanceof Tunai => "tunai, diterima {$bayar->diterima}",
        $bayar instanceof Transfer => "transfer {$bayar->bank} ke {$bayar->nomorRekening}",
        $bayar instanceof Qris => "QRIS {$bayar->idTransaksi}",
    };
}

echo ringkasBayar(new Tunai(50000)) . PHP_EOL;
echo ringkasBayar(new Transfer('Bank Kota', '1234567890')) . PHP_EOL;
echo ringkasBayar(new Qris('TRX-99')) . PHP_EOL;
```

```text
tunai, diterima 50000
transfer Bank Kota ke 1234567890
QRIS TRX-99
```

Ini padanan `enum Bayar { Tunai(i64), Transfer { bank, nomor }, Qris(String) }` di Rust.
:::

### 3. Property virtual

Buat class `Suhu` yang menyimpan `celsius`. Tambahkan property `fahrenheit` yang tidak disimpan: membacanya menghitung dari `celsius`, mengisinya mengubah `celsius`.

::: details Jawaban
<!-- file: src/Bab04/latihan3.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

final class Suhu
{
    public float $fahrenheit {
        get => $this->celsius * 9 / 5 + 32;
        set(float $nilai) {
            $this->celsius = ($nilai - 32) * 5 / 9;
        }
    }

    public function __construct(public float $celsius)
    {
    }
}

$suhu = new Suhu(100);
echo $suhu->fahrenheit . PHP_EOL;

$suhu->fahrenheit = 32;
echo $suhu->celsius . PHP_EOL;
```

```text
212
0
```
:::

### 4. Class generic

Buat class `Pasangan` dengan dua parameter tipe, dan method `tukar()` yang mengembalikan pasangan dengan urutan terbalik.

::: details Jawaban
<!-- file: src/Bab04/latihan4.php -->
```php
<?php

declare(strict_types=1);

namespace Belajar\Bab04;

/**
 * @template K
 * @template V
 */
final readonly class Pasangan
{
    /**
     * @param K $kiri
     * @param V $kanan
     */
    public function __construct(
        public mixed $kiri,
        public mixed $kanan,
    ) {
    }

    /**
     * @return self<V, K>
     */
    public function tukar(): self
    {
        return new self($this->kanan, $this->kiri);
    }
}

$pasangan = new Pasangan('umur', 30)->tukar();

echo ($pasangan->kiri + 1) . ' ' . strtoupper($pasangan->kanan) . PHP_EOL;
```

```text
31 UMUR
```

Baris terakhir hanya lulus PHPStan karena tipenya ikut tertukar: `$pasangan->kiri` sekarang `int` dan `$pasangan->kanan` sekarang `string`.
:::
