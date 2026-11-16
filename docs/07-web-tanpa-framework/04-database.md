# Database dan sandi

## Database dengan PDO

PDO (*PHP Data Objects*) adalah antarmuka database bawaan PHP. API-nya sama untuk SQLite, MySQL, dan PostgreSQL; yang berbeda hanya string koneksinya. Bab ini memakai SQLite karena tidak membutuhkan server: database-nya satu file.

### Pembungkus koneksi

Buat `src/Database.php`:

<!-- file: src/Database.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use Closure;
use PDO;
use PDOStatement;
use RuntimeException;
use Throwable;

final readonly class Database
{
    private function __construct(private PDO $pdo) {}

    public static function open(string $file): self
    {
        return new self(new PDO("sqlite:{$file}", options: [
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]));
    }

    /**
     * @param array<string, int|string> $parameter
     */
    public function run(string $sql, array $parameter = []): PDOStatement
    {
        $statement = $this->pdo->prepare($sql);

        // prepare() bertipe PDOStatement|false, walaupun dalam mode exception false tidak pernah muncul.
        if ($statement === false) {
            throw new RuntimeException('Query gagal disiapkan');
        }

        $statement->execute($parameter);

        return $statement;
    }

    /**
     * @template T
     *
     * @param Closure(): T $action
     * @return T
     */
    public function transaction(Closure $action): mixed
    {
        $this->pdo->beginTransaction();

        try {
            $result = $action();
            $this->pdo->commit();

            return $result;
        } catch (Throwable $error) {
            $this->pdo->rollBack();

            throw $error;
        }
    }
}
```

Yang perlu diperhatikan:

- **`"sqlite:{$file}"`** adalah DSN, string koneksi PDO. Untuk MySQL bentuknya `mysql:host=...;dbname=...`, ditambah nama pengguna dan sandi sebagai argumen berikutnya.
- **`FETCH_ASSOC`** membuat setiap baris hasil query berupa array dengan nama kolom sebagai kunci.
- **Kegagalan query melempar `PDOException`.** Itu mode bawaan sejak PHP 8.
- **`run()` selalu memakai prepared statement.** Alasannya ada di bagian SQL injection di bawah.
- **`transaction()`** memakai generics dari [Bab 2](/02-type-system): apa pun yang dikembalikan closure menjadi tipe kembaliannya.

Pengecekan `=== false` adalah contoh warisan lama dari [Bab 5](/05-error-handling). Tanpa pengecekan itu PHPStan menolak:

```text
  32     Cannot call method execute() on PDOStatement|false.
         🪪  method.nonObject
  34     Method App\Database::run() should return PDOStatement but returns
         (PDOStatement|false).
         🪪  return.type
```

### Dari baris ke objek

Hasil query adalah array yang isinya ditentukan database, bukan oleh kodemu. Bagi PHPStan itu `mixed`, sama seperti superglobal. Polanya juga sama: ubah menjadi objek bertipe di satu tempat. Buat `src/Message.php`:

<!-- file: src/Message.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use DateTimeImmutable;
use UnexpectedValueException;

final readonly class Message
{
    public function __construct(
        public int $id,
        public string $name,
        public string $body,
        public DateTimeImmutable $createdAt,
    ) {}

    public static function fromRow(mixed $row): self
    {
        $row = is_array($row) ? $row : [];
        $id = $row['id'] ?? null;
        $name = $row['name'] ?? null;
        $body = $row['body'] ?? null;
        $createdAt = $row['created_at'] ?? null;

        if (!is_int($id) || !is_string($name) || !is_string($body) || !is_string($createdAt)) {
            throw new UnexpectedValueException('Baris tabel messages tidak sesuai bentuk yang diharapkan');
        }

        return new self($id, $name, $body, new DateTimeImmutable($createdAt));
    }
}
```

Ini padanan `serde` atau schema zod yang ditulis tangan: kalau bentuk baris tidak sesuai, program berhenti di batas ini, bukan jauh di dalam templat.

Buat `src/MessageRepository.php`:

<!-- file: src/MessageRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class MessageRepository
{
    public function __construct(private Database $db) {}

    /**
     * @return list<Message>
     */
    public function all(): array
    {
        $rows = $this->db->run('SELECT id, name, body, created_at FROM messages ORDER BY id DESC')->fetchAll();

        return array_values(array_map(Message::fromRow(...), $rows));
    }

    public function add(string $name, string $body): void
    {
        $this->db->run('INSERT INTO messages (name, body, created_at) VALUES (:name, :body, :created_at)', [
            'name' => $name,
            'body' => $body,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    public function delete(int $id): void
    {
        $this->db->run('DELETE FROM messages WHERE id = :id', ['id' => $id]);
    }
}
```

`:name`, `:body`, dan `:created_at` adalah *placeholder*. Nilainya dikirim terpisah dari teks SQL lewat array di argumen kedua.

## Menyimpan sandi

Sandi tidak pernah disimpan apa adanya, dan tidak di-hash dengan fungsi hash umum seperti SHA-256 yang terlalu cepat untuk keperluan ini. PHP punya dua fungsi khusus. Buat `bin/try-password.php`:

```php
<?php

declare(strict_types=1);

$hash = password_hash('rahasia123', PASSWORD_DEFAULT);

echo $hash . PHP_EOL;
var_dump(password_verify('rahasia123', $hash));
var_dump(password_verify('salah', $hash));
var_dump(password_needs_rehash($hash, PASSWORD_DEFAULT));
```

```bash
php bin/try-password.php
```

```text
$2y$12$US/jsKzcRl27Yy8JE5yNhu9rVJpFkgz1clJgZPPBQLbbO1bUtSaXy
bool(true)
bool(false)
bool(false)
```

String hasilnya memuat semua yang dibutuhkan untuk verifikasi: algoritma (`2y`, yaitu bcrypt), ongkos (`12`), salt acak, dan hash-nya. Karena salt-nya acak, hash di tempatmu akan berbeda walaupun sandinya sama.

- **`password_hash()`** dengan `PASSWORD_DEFAULT` memilih algoritma yang direkomendasikan versi PHP yang dipakai.
- **`password_verify()`** membandingkan sandi dengan hash, dengan waktu yang tidak bergantung pada posisi karakter yang salah.
- **`password_needs_rehash()`** mengembalikan `true` kalau hash lama dibuat dengan pengaturan yang sudah ketinggalan, supaya bisa diperbarui saat pengguna login.

Hapus file coba-coba itu, lalu buat `src/UserRepository.php`:

<!-- file: src/UserRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class UserRepository
{
    public function __construct(private Database $db) {}

    public function add(string $name, string $password): void
    {
        $this->db->run('INSERT INTO users (name, password_hash) VALUES (:name, :hash)', [
            'name' => $name,
            'hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    }

    /**
     * Mengembalikan id pengguna kalau nama dan sandinya cocok.
     */
    public function authenticate(string $name, string $password): ?int
    {
        $row = $this->db->run('SELECT id, password_hash FROM users WHERE name = :name', ['name' => $name])->fetch();
        $row = is_array($row) ? $row : [];
        $id = $row['id'] ?? null;
        $hash = $row['password_hash'] ?? null;

        if (!is_int($id) || !is_string($hash) || !password_verify($password, $hash)) {
            return null;
        }

        return $id;
    }
}
```

`authenticate()` mengembalikan `null` baik saat nama tidak dikenal maupun saat sandinya salah. Pemanggil sengaja tidak diberi tahu yang mana, supaya halaman login tidak bisa dipakai untuk menebak nama pengguna yang terdaftar.

## Membuat database

Buat `bin/setup.php`:

<!-- file: bin/setup.php -->
```php
<?php

declare(strict_types=1);

use App\Database;
use App\UserRepository;

require __DIR__ . '/../vendor/autoload.php';

$folder = __DIR__ . '/../var';
$file = $folder . '/guestbook.sqlite';

if (!is_dir($folder)) {
    mkdir($folder);
}

if (is_file($file)) {
    unlink($file);
}

$db = Database::open($file);

$db->transaction(static function () use ($db): void {
    $db->run('CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    )');

    $db->run('CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
    )');

    new UserRepository($db)->add('admin', 'rahasia123');
});

echo 'Database siap: ' . realpath($file) . PHP_EOL;
```

```bash
php bin/setup.php
```

```text
Database siap: /app/var/guestbook.sqlite
```

Script ini menghapus database lama dan membuat yang baru, jadi aman dijalankan ulang kapan pun kamu ingin mulai dari kosong. Sandi admin ditulis langsung di script karena ini latihan. Di aplikasi sungguhan, sandi awal tidak pernah ada di kode.

### SQL injection

Sekarang ada data untuk dicoba. Buat `bin/try-injection.php`, yang menjalankan pencarian yang sama dengan dua cara:

```php
<?php

declare(strict_types=1);

use App\Database;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::open(__DIR__ . '/../var/guestbook.sqlite');

$name = "bukan-siapa-siapa' OR '1'='1";

$vulnerable = $db->run("SELECT name FROM users WHERE name = '{$name}'")->fetchAll();
$safe = $db->run('SELECT name FROM users WHERE name = :name', ['name' => $name])->fetchAll();

echo 'Ditempel ke SQL : ' . count($vulnerable) . ' baris' . PHP_EOL;
echo 'Prepared        : ' . count($safe) . ' baris' . PHP_EOL;
```

```bash
php bin/try-injection.php
```

```text
Ditempel ke SQL : 1 baris
Prepared        : 0 baris
```

Tidak ada pengguna bernama `bukan-siapa-siapa' OR '1'='1`, tetapi cara pertama tetap mengembalikan baris admin. Tanda kutip di dalam input menutup string SQL lebih awal, dan sisanya dibaca database sebagai perintah: `WHERE name = 'bukan-siapa-siapa' OR '1'='1'`, yang benar untuk semua baris.

Pada cara kedua, teks SQL dan nilainya dikirim terpisah. Database menerima input itu sebagai satu nilai string utuh, apa pun isinya. Aturannya sederhana dan tidak punya pengecualian: **nilai dari luar tidak pernah ditempel ke teks SQL**.

PHPStan tidak menangkap ini. Bagi sistem tipe, kedua query sama-sama `string`. Di Rust, `sqlx::query!` memeriksa query saat compile; di PHP penjaganya adalah kebiasaan, dan nanti query builder Laravel yang selalu memakai placeholder.

### Transaksi

Buat `bin/try-transaction.php`. Dua operasi dijalankan dalam satu transaksi, dan yang kedua pasti gagal karena nama `admin` sudah ada:

```php
<?php

declare(strict_types=1);

use App\Database;
use App\MessageRepository;
use App\UserRepository;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::open(__DIR__ . '/../var/guestbook.sqlite');
$messages = new MessageRepository($db);
$users = new UserRepository($db);

$before = count($messages->all());

try {
    $db->transaction(static function () use ($messages, $users): void {
        $messages->add('Sistem', 'Admin kedua dibuat.');
        $users->add('admin', 'sandi-lain');
    });
} catch (PDOException $error) {
    echo 'Gagal: ' . $error->getMessage() . PHP_EOL;
}

echo "Jumlah pesan: {$before} -> " . count($messages->all()) . PHP_EOL;
```

```bash
php bin/try-transaction.php
```

```text
Gagal: SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: users.name
Jumlah pesan: 0 -> 0
```

Pesan yang sudah sempat ditambahkan ikut dibatalkan. Bentuk `transaction(fn)` ini sama dengan `DB::transaction()` di Laravel. Hapus kedua file `try-*.php`.
