# 4. OOP

Model objek PHP berbasis class, mirip TS dan Java. Kalau kamu datang dari Rust, petanya begini: class adalah `struct` beserta `impl`-nya, interface adalah `trait`, dan tidak ada ownership. Bab ini fokus ke fitur modern yang membuat class PHP ketat dan immutable, sampai PHP 8.5.

Lanjutkan di proyek `practice/php-basics`. Buat folder `src/Ch04`, dan awali setiap file dengan `namespace Learn\Ch04;`.

## Class, property, dan constructor

Buat `src/Ch04/product.php`:

<!-- file: src/Ch04/product.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final class Product
{
    public function __construct(
        public readonly string $name,
        public readonly int $price,
        private int $stock = 0,
    ) {
    }

    public function stock(): int
    {
        return $this->stock;
    }

    public function reduceStock(int $quantity): void
    {
        if ($quantity > $this->stock) {
            throw new \DomainException("Stok {$this->name} tidak cukup");
        }

        $this->stock -= $quantity;
    }
}

$coffee = new Product('Kopi', 18000, stock: 10);
$coffee->reduceStock(3);

echo "{$coffee->name}: Rp {$coffee->price}, stok {$coffee->stock()}" . PHP_EOL;
```

```text
Kopi: Rp 18000, stok 7
```

- **Constructor promotion.** Parameter constructor yang diberi visibility (`public`, `private`) otomatis menjadi property dan langsung diisi. Ini sama dengan parameter property di TS.
- **`$this->` wajib.** Property dan method sendiri tidak pernah diakses tanpa `$this->`.
- **`readonly`** berarti property hanya bisa diisi satu kali, di dalam class. Ini padanan field tanpa `mut` di Rust dan `readonly` di TS, tetapi dijaga saat runtime.
- **`final`** melarang class diturunkan. Jadikan ini kebiasaan bawaan; lepaskan hanya kalau memang dirancang untuk diturunkan.
- **Visibility bawaan adalah `public`.** Selalu tulis secara eksplisit. Pilihannya `public`, `protected` (class itu dan turunannya), dan `private`. Tidak ada padanan `pub(crate)`.

Sekarang langgar aturannya. Tempel di akhir `product.php`:

<!-- demo: product-wrong append: src/Ch04/product.php -->
```php
$coffee->price = 20000;
echo $coffee->stock . PHP_EOL;
```

```text
Assign to protected(set) property Learn\Ch04\Product::$price.
Access to private property Learn\Ch04\Product::$stock.
```

```text
Fatal error: Uncaught Error: Cannot modify readonly property Learn\Ch04\Product::$price
```

PHPStan menyebut `$price` sebagai `protected(set)` karena begitulah PHP memperlakukan property `readonly`: boleh dibaca dari luar, tetapi hanya boleh diisi dari dalam class dan turunannya. Istilah itu dijelaskan di bagian property hooks di bawah.

## Interface dan nominal typing

Interface di PHP adalah padanan `trait` di Rust: daftar method yang harus dipenuhi. Buat `src/Ch04/discount.php`:

<!-- file: src/Ch04/discount.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

interface Discount
{
    public function calculate(int $subtotal): int;
}

final readonly class PercentDiscount implements Discount
{
    public function __construct(private int $percent)
    {
    }

    #[\Override]
    public function calculate(int $subtotal): int
    {
        return intdiv($subtotal * $this->percent, 100);
    }
}

final readonly class FixedDiscount implements Discount
{
    public function __construct(private int $amount)
    {
    }

    #[\Override]
    public function calculate(int $subtotal): int
    {
        return min($this->amount, $subtotal);
    }
}

function totalPayment(int $subtotal, Discount $discount): int
{
    return $subtotal - $discount->calculate($subtotal);
}

echo totalPayment(100000, new PercentDiscount(10)) . PHP_EOL;
echo totalPayment(100000, new FixedDiscount(25000)) . PHP_EOL;
```

```text
90000
75000
```

- **`readonly class`** membuat semua property-nya `readonly` sekaligus.
- **`#[\Override]`** adalah attribute, padanan kata kunci `override` di TS. PHP dan PHPStan menolak kalau method itu ternyata tidak menimpa atau mengimplementasikan apa pun, misalnya karena salah ketik nama.

### Bentuk yang sama tidak cukup

Di TS, objek apa pun yang punya method `calculate` dengan bentuk yang cocok bisa dipakai sebagai `Discount`. Di PHP tidak. Tempel di akhir `discount.php`:

<!-- demo: structural append: src/Ch04/discount.php -->
```php
final readonly class FakeDiscount
{
    public function calculate(int $subtotal): int
    {
        return 0;
    }
}

echo totalPayment(100000, new FakeDiscount()) . PHP_EOL;
```

```text
Parameter #2 $discount of function Learn\Ch04\totalPayment expects Learn\Ch04\Discount, Learn\Ch04\FakeDiscount given.
```

```text
Fatal error: Uncaught TypeError: Learn\Ch04\totalPayment(): Argument #2 ($discount) must be of type Learn\Ch04\Discount, Learn\Ch04\FakeDiscount given
```

PHP memakai *nominal typing*, seperti Rust: sebuah class memenuhi interface hanya kalau menyatakannya lewat `implements`, sama seperti `impl Trait for Type` yang harus ditulis.

## Inheritance dan tipe gabungan

Buat `src/Ch04/shape.php`:

<!-- file: src/Ch04/shape.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

abstract readonly class Shape
{
    abstract public function area(): float;

    public function summary(): string
    {
        return sprintf('%s dengan luas %.2f', static::class, $this->area());
    }
}

final readonly class Circle extends Shape
{
    public function __construct(public float $radius)
    {
    }

    #[\Override]
    public function area(): float
    {
        return M_PI * $this->radius ** 2;
    }
}

final readonly class Rectangle extends Shape
{
    public function __construct(
        public float $width,
        public float $height,
    ) {
    }

    #[\Override]
    public function area(): float
    {
        return $this->width * $this->height;
    }
}

function describe(Circle|Rectangle $shape): string
{
    return match (true) {
        $shape instanceof Circle => "lingkaran berjari-jari {$shape->radius}",
        $shape instanceof Rectangle => "persegi panjang {$shape->width} x {$shape->height}",
    };
}

$shapes = [new Circle(1.5), new Rectangle(2, 3.5)];

foreach ($shapes as $shape) {
    echo describe($shape) . PHP_EOL;
    echo $shape->summary() . PHP_EOL;
}
```

```text
lingkaran berjari-jari 1.5
Learn\Ch04\Circle dengan luas 7.07
persegi panjang 2 x 3.5
Learn\Ch04\Rectangle dengan luas 7.00
```

- **`abstract class`** tidak bisa dibuat objeknya dan boleh punya method tanpa badan. Bedanya dengan interface: ia boleh membawa implementasi dan property.
- **`extends`** hanya boleh satu. Tidak ada multiple inheritance.
- **`static::class`** adalah nama class objek yang sebenarnya saat runtime. `self` selalu menunjuk class tempat kodenya ditulis, sedangkan `static` mengikuti class turunan.

### Pengganti enum pembawa data

[Bab 2](/02-type-system) menyebut enum PHP tidak bisa membawa data. Fungsi `describe()` di atas menunjukkan penggantinya: beberapa class `final`, digabung dengan union type, lalu dipilah dengan `match (true)` dan `instanceof`. Di dalam tiap cabang, PHPStan mempersempit tipenya sehingga `$shape->radius` hanya bisa diakses di cabang `Circle`.

Kelengkapannya juga diperiksa. Tempel di akhir `shape.php`:

<!-- demo: shape-incomplete append: src/Ch04/shape.php norun -->
```php
function shapeName(Circle|Rectangle $shape): string
{
    return match (true) {
        $shape instanceof Circle => 'lingkaran',
    };
}
```

```text
Match expression does not handle remaining value: true
```

Pesannya tidak sejelas Rust, tetapi jaminannya sama: menambah anggota baru ke union akan memunculkan error di setiap `match` yang belum menanganinya.

## Trait bukan trait Rust

Nama yang sama, konsep berbeda. Trait di PHP adalah sekumpulan method yang disalin ke dalam class yang memakainya. Buat `src/Ch04/trait.php`:

<!-- file: src/Ch04/trait.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

trait HasSlug
{
    abstract public function title(): string;

    public function slug(): string
    {
        return strtolower(str_replace(' ', '-', trim($this->title())));
    }
}

final readonly class Article
{
    use HasSlug;

    public function __construct(private string $title)
    {
    }

    public function title(): string
    {
        return $this->title;
    }
}

final readonly class Category
{
    use HasSlug;

    public function __construct(private string $name)
    {
    }

    public function title(): string
    {
        return $this->name;
    }
}

echo new Article('Belajar PHP Modern')->slug() . PHP_EOL;
echo new Category('Tips dan Trik')->slug() . PHP_EOL;
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

Trait bukan tipe: kamu tidak bisa menulis `function f(HasSlug $x)`. Pakai seperlunya. Kamu akan sering melihatnya di Laravel, misalnya `use HasFactory;` pada model.

## Value object

Class kecil yang immutable dan menjaga aturannya sendiri adalah padanan *newtype* di Rust. Buat `src/Ch04/money.php`:

<!-- file: src/Ch04/money.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final readonly class Money implements \Stringable
{
    public const int MAXIMUM = 1_000_000_000;

    private function __construct(public int $rupiah)
    {
    }

    public static function rupiah(int $amount): self
    {
        if ($amount < 0 || $amount > self::MAXIMUM) {
            throw new \InvalidArgumentException("Jumlah {$amount} di luar batas");
        }

        return new self($amount);
    }

    public function add(self $other): self
    {
        return self::rupiah($this->rupiah + $other->rupiah);
    }

    public function equals(self $other): bool
    {
        return $this->rupiah === $other->rupiah;
    }

    #[\Override]
    public function __toString(): string
    {
        return 'Rp ' . number_format($this->rupiah, 0, ',', '.');
    }
}

$price = Money::rupiah(18000);
$total = $price->add(Money::rupiah(7000));

echo $total . PHP_EOL;
echo "Total: {$total}" . PHP_EOL;
var_dump($total->equals(Money::rupiah(25000)));
var_dump($total == Money::rupiah(25000));
var_dump($total === Money::rupiah(25000));
echo Money::MAXIMUM . PHP_EOL;
```

```text
Rp 25.000
Total: Rp 25.000
bool(true)
bool(true)
bool(false)
1000000000
```

- **Constructor `private` dan method `static`** membentuk *named constructor*: satu-satunya jalan membuat `Money` adalah `Money::rupiah()`, yang memvalidasi. Siapa pun yang memegang objek `Money` tahu isinya sah.
- **`::`** mengakses anggota milik class: method `static` dan konstanta. `->` mengakses anggota milik objek.
- **`const int`** adalah konstanta class bertipe (PHP 8.3).
- **`\Stringable` dan `__toString()`** membuat objek bisa dipakai sebagai string, padanan `impl Display`.
- **Tidak ada method yang mengubah isi.** `add()` mengembalikan objek baru.

### Membandingkan objek

Tiga baris `var_dump` di atas menunjukkan tiga arti "sama":

- **`===`** benar hanya untuk objek yang identik, yaitu handle ke objek yang sama.
- **`==`** benar kalau class-nya sama dan semua property-nya sama. Ini satu-satunya tempat `==` masih masuk akal, tetapi perbandingan property-nya ikut longgar.
- **Method sendiri** seperti `equals()` adalah cara yang paling jelas. PHP tidak punya padanan `PartialEq` yang bisa diimplementasikan.

## Property hooks dan asymmetric visibility

PHP 8.4 menambahkan dua fitur yang menghapus kebutuhan getter dan setter. Buat `src/Ch04/user.php`:

<!-- file: src/Ch04/user.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final class User
{
    public private(set) string $email;

    public string $name {
        set(string $value) {
            $this->name = trim($value);
        }
    }

    public string $initial {
        get => strtoupper(substr($this->name, 0, 1));
    }

    public function __construct(string $name, string $email)
    {
        $this->name = $name;
        $this->changeEmail($email);
    }

    public function changeEmail(string $email): void
    {
        if (!str_contains($email, '@')) {
            throw new \InvalidArgumentException("Email {$email} tidak valid");
        }

        $this->email = strtolower($email);
    }
}

$user = new User('  Siti Rahma ', 'Siti@Example.com');

echo "[{$user->name}] {$user->email} ({$user->initial})" . PHP_EOL;

$user->name = ' Siti R. ';
$user->changeEmail('siti.r@example.com');

echo "[{$user->name}] {$user->email} ({$user->initial})" . PHP_EOL;
```

```text
[Siti Rahma] siti@example.com (S)
[Siti R.] siti.r@example.com (S)
```

- **`public private(set)`** adalah asymmetric visibility: property bisa dibaca dari mana saja, tetapi hanya bisa diisi dari dalam class.
- **Hook `set`** berjalan setiap kali property diisi. Di sini ia merapikan spasi.
- **Hook `get`** tanpa penyimpanan membuat property virtual: `$initial` dihitung setiap kali dibaca, seperti getter di TS.

Mengisi `$email` dari luar ditolak. Tempel di akhir `user.php`:

<!-- demo: email-outside append: src/Ch04/user.php -->
```php
$user->email = 'bebas@example.com';
```

```text
Assign to private(set) property Learn\Ch04\User::$email.
```

```text
Fatal error: Uncaught Error: Cannot modify private(set) property Learn\Ch04\User::$email from global scope
```

Kapan memakai yang mana:

| Kebutuhan | Pakai |
|---|---|
| Nilai yang tidak pernah berubah setelah dibuat | `readonly` |
| Boleh berubah, tetapi hanya lewat method class itu | `private(set)` |
| Validasi atau perapian setiap kali diisi | Hook `set` |
| Nilai turunan dari property lain | Hook `get` |

## Mengubah objek immutable dengan `clone`

Objek `readonly` tidak bisa diubah, jadi "mengubah" berarti membuat salinan dengan satu bagian berbeda. PHP 8.5 menyediakan `clone` dengan daftar perubahan. Buat `src/Ch04/address.php`:

<!-- file: src/Ch04/address.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final readonly class Address
{
    public function __construct(
        public string $street,
        public string $city,
    ) {
    }

    public function moveTo(string $city): self
    {
        return clone($this, ['city' => $city]);
    }
}

$old = new Address('Jl. Merdeka 1', 'Bandung');
$new = $old->moveTo('Jakarta');

echo "{$old->street}, {$old->city}" . PHP_EOL;
echo "{$new->street}, {$new->city}" . PHP_EOL;
```

```text
Jl. Merdeka 1, Bandung
Jl. Merdeka 1, Jakarta
```

Ini padanan `Address { city, ..old }` di Rust dan `{ ...old, city }` di TS.

## Generics pada class

`@template` dari [Bab 2](/02-type-system) juga berlaku untuk class. Buat `src/Ch04/collection.php`:

<!-- file: src/Ch04/collection.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

/**
 * @template T
 */
final readonly class Collection
{
    /**
     * @param list<T> $items
     */
    public function __construct(private array $items)
    {
    }

    /**
     * @template U
     * @param \Closure(T): U $fn
     * @return self<U>
     */
    public function map(\Closure $fn): self
    {
        return new self(array_map($fn, $this->items));
    }

    /**
     * @param \Closure(T): bool $fn
     * @return self<T>
     */
    public function filter(\Closure $fn): self
    {
        return new self(array_values(array_filter($this->items, $fn)));
    }

    /**
     * @return list<T>
     */
    public function all(): array
    {
        return $this->items;
    }
}

$label = new Collection([18000, 25000, 9000])
    ->filter(fn (int $price): bool => $price >= 10000)
    ->map(fn (int $price): string => 'Rp ' . number_format($price, 0, ',', '.'));

echo implode(', ', $label->all()) . PHP_EOL;
```

```text
Rp 18.000, Rp 25.000
```

`T` disimpulkan dari argumen constructor, dan `map()` mengubah `Collection<int>` menjadi `Collection<string>`. Tempel di akhir `collection.php`:

<!-- demo: collection-wrong append: src/Ch04/collection.php norun -->
```php
\PHPStan\dumpType($label);
$label->map(fn (int $price): int => $price * 2);
```

```text
Dumped type: Learn\Ch04\Collection<non-falsy-string>
Parameter #1 $fn of method Learn\Ch04\Collection<string>::map() expects Closure(non-falsy-string): int, Closure(int): int given.
```

`non-falsy-string` adalah `string` yang dipersempit: PHPStan tahu hasil gabungan `'Rp '` dengan teks lain tidak mungkin kosong.

Class ini miniatur `Collection` milik Laravel, yang kamu pakai mulai [Bab 8](/08-laravel-dasar). Interface juga bisa generic: tulis `@template T` di interface-nya, lalu `@implements Repository<Product>` di class yang mengimplementasikannya.

### Type alias

Array shape yang dipakai berulang bisa diberi nama dengan `@phpstan-type`. Buat `src/Ch04/alias.php`:

<!-- file: src/Ch04/alias.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

/**
 * @phpstan-type ProductRow array{name: string, price: int, stock?: int}
 */
final readonly class ProductSummary
{
    private function __construct(
        public string $name,
        public int $price,
        public int $stock,
    ) {
    }

    /**
     * @param ProductRow $row
     */
    public static function fromArray(array $row): self
    {
        return new self($row['name'], $row['price'], $row['stock'] ?? 0);
    }
}

$tea = ProductSummary::fromArray(['name' => 'Teh', 'price' => 12000]);

echo "{$tea->name}: {$tea->price}, stok {$tea->stock}" . PHP_EOL;
```

```text
Teh: 12000, stok 0
```

Alias ini milik class tempat ia ditulis. Class lain mengimpornya dengan `@phpstan-import-type ProductRow from ProductSummary`.

## Dependency injection

Class yang membutuhkan class lain menerimanya lewat constructor, dengan tipe interface. Buat `src/Ch04/service.php`:

<!-- file: src/Ch04/service.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

interface Logger
{
    public function log(string $message): void;
}

final class ScreenLogger implements Logger
{
    #[\Override]
    public function log(string $message): void
    {
        echo "[log] {$message}" . PHP_EOL;
    }
}

final class MemoryLogger implements Logger
{
    /** @var list<string> */
    public private(set) array $messages = [];

    #[\Override]
    public function log(string $message): void
    {
        $this->messages[] = $message;
    }
}

final readonly class OrderService
{
    public function __construct(private Logger $logger)
    {
    }

    public function create(string $product, int $quantity): string
    {
        $number = sprintf('ORD-%s-%03d', strtoupper($product), $quantity);
        $this->logger->log("Pesanan {$number}: {$quantity} x {$product}");

        return $number;
    }
}

$service = new OrderService(new ScreenLogger());
$service->create('Kopi', 2);

$memory = new MemoryLogger();
new OrderService($memory)->create('Teh', 1);
echo count($memory->messages) . ' pesan tercatat' . PHP_EOL;
```

```text
[log] Pesanan ORD-KOPI-002: 2 x Kopi
1 pesan tercatat
```

`OrderService` tidak tahu ke mana catatannya pergi. Di aplikasi ia diberi `ScreenLogger`, di test diberi `MemoryLogger` yang isinya bisa diperiksa. Polanya sama dengan menerima `impl Trait` atau `Box<dyn Trait>` di Rust.

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

Buat class `Email` yang immutable. Satu-satunya cara membuatnya adalah `Email::from(string)`, yang merapikan spasi dan huruf besar lalu menolak teks yang bukan email. Tambahkan method `domain()` dan buat objeknya bisa dipakai sebagai string.

::: details Jawaban
<!-- file: src/Ch04/exercise1.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final readonly class Email implements \Stringable
{
    private function __construct(public string $address)
    {
    }

    public static function from(string $text): self
    {
        $clean = strtolower(trim($text));

        if (filter_var($clean, FILTER_VALIDATE_EMAIL) === false) {
            throw new \InvalidArgumentException("Email {$text} tidak valid");
        }

        return new self($clean);
    }

    public function domain(): string
    {
        $position = strrpos($this->address, '@');

        return $position === false ? '' : substr($this->address, $position + 1);
    }

    #[\Override]
    public function __toString(): string
    {
        return $this->address;
    }
}

$email = Email::from('  Budi@Example.COM ');

echo "{$email} di {$email->domain()}" . PHP_EOL;
```

```text
budi@example.com di example.com
```

Fungsi mana pun yang menerima parameter bertipe `Email` tidak perlu memvalidasi lagi: tipenya sudah menjadi bukti.
:::

### 2. Tipe gabungan untuk pembayaran

Modelkan tiga cara bayar: tunai (jumlah yang diterima), transfer (nama bank dan nomor rekening), dan QRIS (id transaksi). Tulis `summarizePayment()` yang menerima salah satunya dan mengembalikan deskripsi, dengan `match` yang lengkap.

::: details Jawaban
<!-- file: src/Ch04/exercise2.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final readonly class Cash
{
    public function __construct(public int $received)
    {
    }
}

final readonly class Transfer
{
    public function __construct(
        public string $bank,
        public string $accountNumber,
    ) {
    }
}

final readonly class Qris
{
    public function __construct(public string $transactionId)
    {
    }
}

function summarizePayment(Cash|Transfer|Qris $payment): string
{
    return match (true) {
        $payment instanceof Cash => "tunai, diterima {$payment->received}",
        $payment instanceof Transfer => "transfer {$payment->bank} ke {$payment->accountNumber}",
        $payment instanceof Qris => "QRIS {$payment->transactionId}",
    };
}

echo summarizePayment(new Cash(50000)) . PHP_EOL;
echo summarizePayment(new Transfer('Bank Kota', '1234567890')) . PHP_EOL;
echo summarizePayment(new Qris('TRX-99')) . PHP_EOL;
```

```text
tunai, diterima 50000
transfer Bank Kota ke 1234567890
QRIS TRX-99
```

Ini padanan `enum Payment { Cash(i64), Transfer { bank, number }, Qris(String) }` di Rust.
:::

### 3. Property virtual

Buat class `Temperature` yang menyimpan `celsius`. Tambahkan property `fahrenheit` yang tidak disimpan: membacanya menghitung dari `celsius`, mengisinya mengubah `celsius`.

::: details Jawaban
<!-- file: src/Ch04/exercise3.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

final class Temperature
{
    public float $fahrenheit {
        get => $this->celsius * 9 / 5 + 32;
        set(float $value) {
            $this->celsius = ($value - 32) * 5 / 9;
        }
    }

    public function __construct(public float $celsius)
    {
    }
}

$temperature = new Temperature(100);
echo $temperature->fahrenheit . PHP_EOL;

$temperature->fahrenheit = 32;
echo $temperature->celsius . PHP_EOL;
```

```text
212
0
```
:::

### 4. Class generic

Buat class `Pair` dengan dua parameter tipe, dan method `swap()` yang mengembalikan pasangan dengan urutan terbalik.

::: details Jawaban
<!-- file: src/Ch04/exercise4.php -->
```php
<?php

declare(strict_types=1);

namespace Learn\Ch04;

/**
 * @template K
 * @template V
 */
final readonly class Pair
{
    /**
     * @param K $left
     * @param V $right
     */
    public function __construct(
        public mixed $left,
        public mixed $right,
    ) {
    }

    /**
     * @return self<V, K>
     */
    public function swap(): self
    {
        return new self($this->right, $this->left);
    }
}

$pair = new Pair('umur', 30)->swap();

echo ($pair->left + 1) . ' ' . strtoupper($pair->right) . PHP_EOL;
```

```text
31 UMUR
```

Baris terakhir hanya lulus PHPStan karena tipenya ikut tertukar: `$pair->left` sekarang `int` dan `$pair->right` sekarang `string`.
:::
