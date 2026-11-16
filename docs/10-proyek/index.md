# 10. Proyek: Dompet

Bab ini merangkai semua yang sudah kamu pelajari menjadi satu aplikasi utuh, dibangun dari folder kosong: **Dompet**, pencatat pengeluaran pribadi. Tidak ada konsep baru yang besar di sini. Yang dilatih adalah menyusun potongan dari Bab 2 sampai 9 menjadi sesuatu yang siap dipasang di server.

Yang dibangun:

- **Akun**: daftar, masuk, keluar.
- **Pengeluaran**: catat, ubah, dan hapus lewat satu halaman interaktif, dengan ringkasan per bulan dan per kategori.
- **Laporan bulanan**: setiap tanggal 1, tiap pengguna menerima email ringkasan bulan sebelumnya, dikirim lewat queue.
- **API**: dua endpoint JSON baca-saja, dilindungi token yang dibuat pengguna sendiri.
- **Test**: 32 test yang menjaga semua hal di atas.

Semua kode lulus `composer check` di level max, dan urutan kerjanya tetap format, check, test.

## Rancangan

Beberapa keputusan diambil sebelum menulis kode:

| Keputusan | Alasan |
|---|---|
| Uang disimpan sebagai `int` rupiah | `float` tidak bisa menyimpan pecahan desimal dengan tepat. Masalahnya sama dengan `f64` di Rust dan `number` di JS. |
| Kategori berupa enum | Daftar nilainya tetap, dan `match` atasnya diperiksa PHPStan. |
| Zona waktu aplikasi `Asia/Jakarta` | "Hari ini" dan jadwal laporan mengikuti jam pengguna, bukan UTC. |
| Livewire hanya di halaman pengeluaran | Login dan token cukup dengan form biasa. Livewire dipakai di tempat yang butuh interaksi. |
| Kepemilikan dijaga lewat relasi | Semua query berangkat dari `$user->expenses()`, sehingga data orang lain tidak pernah terjangkau. |
| Logika hitung dipisah dari framework | Format rupiah dan ringkasan bulanan adalah class PHP biasa yang bisa diuji tanpa database. |

File yang akan kamu tulis:

```text
app/
├── Console/Commands/SendMonthlyReports.php   perintah pengantre laporan
├── Enums/Category.php
├── Http/
│   ├── Controllers/                          Login, Register, Token, Api
│   ├── Requests/                             LoginRequest, RegisterRequest
│   └── Resources/ExpenseResource.php
├── Jobs/SendMonthlyReport.php
├── Livewire/ExpenseManager.php               halaman pengeluaran
├── Mail/MonthlyReportMail.php
├── Models/                                   User, Expense
└── Support/                                  Rupiah, Month, MonthlySummary
```

## 1. Siapkan proyek

Langkahnya sama dengan [Bab 8](/08-laravel-dasar). Dari PowerShell, di folder `practice`:

```powershell
docker run --rm -v "${PWD}:/app" -w /app composer:2 create-project laravel/laravel wallet
cd wallet
```

Salin `Dockerfile` dari `practice/laravel-basics` tanpa perubahan. `compose.yaml` hanya berbeda di nama database:

```yaml
services:
  app:
    build: .
    volumes:
      - .:/app
      - vendor:/app/vendor
    ports:
      - "8000:8000"
    command: php artisan serve --host=0.0.0.0 --port=8000
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: wallet
      MYSQL_USER: wallet
      MYSQL_PASSWORD: secret
      MYSQL_ROOT_PASSWORD: secret
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      # 127.0.0.1 memaksa TCP, supaya baru dianggap sehat setelah inisialisasi selesai
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
      interval: 5s
      retries: 20

volumes:
  mysql-data:
  vendor:
```

::: warning Matikan dulu proyek [Bab 8](/08-laravel-dasar)
Kedua proyek memakai port 8000. Jalankan `docker compose down` di `practice/laravel-basics` sebelum menyalakan Dompet.
:::

### Konfigurasi

Ubah baris-baris ini di `.env`, dan lakukan perubahan yang sama di `.env.example`:

```ini
APP_NAME=Dompet
APP_LOCALE=id

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=wallet
DB_USERNAME=wallet
DB_PASSWORD=secret
```

`.env.example` adalah cetakan yang ikut disimpan di Git; `.env` tidak. Server production di [Bab 12](/12-deploy) membuat `.env`-nya dari cetakan itu. `APP_LOCALE=id` membuat nama bulan tampil dalam bahasa Indonesia.

Lalu di `config/app.php`, ganti zona waktu:

```php
    'timezone' => 'Asia/Jakarta',
```

Nilai ini ditulis langsung di file konfigurasi, bukan lewat `.env`, karena merupakan sifat aplikasinya dan tidak berbeda antara development dan production.

### Dependency

```powershell
docker compose run --rm app composer install
docker compose up -d
docker compose exec app bash
```

Di dalam container:

```bash
composer require livewire/livewire
composer require --dev larastan/larastan
php artisan install:api --no-interaction
```

Versi yang terpasang saat bab ini ditulis:

| Paket | Versi |
|---|---|
| `laravel/framework` | 13.42.0 |
| `livewire/livewire` | 4.4.8 |
| `laravel/sanctum` | 4.4.0 |
| `larastan/larastan` | 3.15.0 |
| `phpstan/phpstan` | 2.3.6 |
| `phpunit/phpunit` | 12.5.44 |
| `laravel/pint` | 1.32.3 |

Di PowerShell, segarkan `vendor/` untuk editor dan pasang dependency frontend. `npm install` membuat `package-lock.json`, padanan `composer.lock` untuk npm:

```powershell
docker compose cp app:/app/vendor .
npm install
```

### Alat penjaga

Enam hal dari [Bab 8](/08-laravel-dasar) dan 9, diulang cepat:

1. Buat `pint.json` dan `phpstan.neon`, isinya sama persis dengan [Bab 8](/08-laravel-dasar#menjaga-tipe-pint-dan-larastan).
2. Tambahkan dua script ke `composer.json`:

    ```json
    "format": "pint",
    "check": "phpstan analyse --memory-limit=1G",
    ```

3. Hapus `tests/Unit/ExampleTest.php` dan `tests/Feature/ExampleTest.php`.
4. Di `database/factories/UserFactory.php`, ganti PHPDoc `definition()` menjadi `@return array<model-property<User>, mixed>`.
5. Ganti isi `tests/TestCase.php` dengan versi [Bab 9](/09-laravel-lanjut/05-testing#persiapan), yang memanggil `withoutVite()`.
6. Hapus `AGENTS.md` dan `CLAUDE.md` bawaan skeleton.

Pastikan titik awalnya bersih:

```bash
composer format
composer check
```

```text
 [OK] No errors
```

## 2. Data

Satu tabel baru, `expenses`. Buat model beserta migration dan factory-nya:

```bash
php artisan make:model Expense -mf
```

Isi file migration `create_expenses_table`:

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('amount');
            $table->string('category', 20);
            $table->date('spent_on');
            $table->string('note')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'spent_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
```

Index pada `user_id` dan `spent_on` mengikuti query yang paling sering dijalankan: pengeluaran satu pengguna dalam satu bulan.

Buat `app/Enums/Category.php`:

```php
<?php

declare(strict_types=1);

namespace App\Enums;

enum Category: string
{
    case Food = 'food';
    case Transport = 'transport';
    case Bills = 'bills';
    case Shopping = 'shopping';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Food => 'Makan',
            self::Transport => 'Transportasi',
            self::Bills => 'Tagihan',
            self::Shopping => 'Belanja',
            self::Other => 'Lainnya',
        };
    }
}
```

Isi `app/Models/Expense.php`:

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Category;
use Database\Factories\ExpenseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['amount', 'category', 'spent_on', 'note'])]
class Expense extends Model
{
    /** @use HasFactory<ExpenseFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'integer',
            'category' => Category::class,
            'spent_on' => 'immutable_date',
        ];
    }
}
```

`app/Models/User.php` menjadi:

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * @return HasMany<Expense, $this>
     */
    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    /**
     * Pengeluaran pada bulan tempat tanggal $month berada.
     *
     * @return HasMany<Expense, $this>
     */
    public function expensesIn(CarbonImmutable $month): HasMany
    {
        $start = $month->startOfMonth();

        // Rentang setengah terbuka: dari tanggal 1 sampai sebelum tanggal 1 bulan berikutnya
        return $this->expenses()
            ->where('spent_on', '>=', $start->toDateString())
            ->where('spent_on', '<', $start->addMonth()->toDateString());
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
```

`expensesIn()` adalah satu-satunya tempat aturan "pengeluaran dalam satu bulan" ditulis. Halaman, API, dan laporan email semuanya memanggilnya. `CarbonImmutable` aman dioper ke mana-mana karena `startOfMonth()` dan `addMonth()` mengembalikan objek baru, tidak mengubah yang lama.

Terakhir, `database/factories/ExpenseFactory.php`:

```php
<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Category;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Expense>
 */
class ExpenseFactory extends Factory
{
    /**
     * @return array<model-property<Expense>, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'amount' => fake()->numberBetween(1, 500) * 1000,
            'category' => fake()->randomElement(Category::cases()),
            'spent_on' => now()->toDateString(),
            'note' => null,
        ];
    }
}
```

Buat tabelnya:

```bash
php artisan migrate
```
