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
5. Ganti isi `tests/TestCase.php` dengan versi [Bab 9](/09-laravel-lanjut#persiapan), yang memanggil `withoutVite()`.
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

## 3. Logika murni

Tiga class kecil di `app/Support` tidak bergantung pada request, session, atau database. Karena itu ketiganya paling mudah diuji, dan kita menulis test-nya sekarang juga.

### Format rupiah

`app/Support/Rupiah.php`:

```php
<?php

declare(strict_types=1);

namespace App\Support;

final class Rupiah
{
    public static function format(int $amount): string
    {
        return 'Rp '.number_format($amount, 0, ',', '.');
    }
}
```

### Membaca bulan

Bulan datang dari luar dalam bentuk teks seperti `2026-11`: dari input di halaman, dan dari parameter API. `app/Support/Month.php` mengubahnya menjadi tanggal, atau `null` kalau bentuknya salah:

```php
<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

final class Month
{
    /**
     * Mengubah teks seperti "2026-11" menjadi tanggal 1 bulan itu, atau null kalau bentuknya salah.
     */
    public static function parse(string $value): ?CarbonImmutable
    {
        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $value) !== 1) {
            return null;
        }

        return CarbonImmutable::parse($value.'-01');
    }
}
```

Ini pola dari [Bab 5](/05-error-handling): input mentah diubah sekali menjadi nilai bertipe di tepi aplikasi, dan kegagalannya terlihat di tipe kembalian. `?CarbonImmutable` berperan seperti `Option<NaiveDate>` di Rust. Pemanggil dipaksa PHPStan memutuskan apa yang terjadi saat hasilnya `null`.

### Ringkasan bulanan

`app/Support/MonthlySummary.php`:

```php
<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Expense;
use Carbon\CarbonImmutable;

final readonly class MonthlySummary
{
    /**
     * @param  array<string, int>  $byCategory  total per kategori, dengan kunci nilai enum Category
     */
    public function __construct(
        public CarbonImmutable $month,
        public int $total,
        public int $count,
        public array $byCategory,
    ) {}

    /**
     * @param  iterable<Expense>  $expenses
     */
    public static function of(CarbonImmutable $month, iterable $expenses): self
    {
        $total = 0;
        $count = 0;
        $byCategory = [];

        foreach ($expenses as $expense) {
            $key = $expense->category->value;

            $total += $expense->amount;
            $count++;
            $byCategory[$key] = ($byCategory[$key] ?? 0) + $expense->amount;
        }

        arsort($byCategory);

        return new self($month->startOfMonth(), $total, $count, $byCategory);
    }
}
```

Class `readonly` ([Bab 4](/04-oop)) ini adalah nilai yang tidak berubah setelah dibuat, padanan struct tanpa `mut`. Penjumlahannya ditulis sebagai loop biasa dengan sengaja: `$expense->amount` bertipe `int`, jadi `$total` terbukti `int` tanpa satu pun `mixed`.

### Test

`tests/Unit/RupiahTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Rupiah;
use PHPUnit\Framework\TestCase;

class RupiahTest extends TestCase
{
    public function test_formats_with_dot_as_thousand_separator(): void
    {
        $this->assertSame('Rp 0', Rupiah::format(0));
        $this->assertSame('Rp 25.000', Rupiah::format(25_000));
        $this->assertSame('Rp 1.250.000', Rupiah::format(1_250_000));
    }
}
```

`tests/Unit/MonthTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Month;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class MonthTest extends TestCase
{
    public function test_parses_valid_month_to_first_day(): void
    {
        $this->assertSame('2026-11-01', Month::parse('2026-11')?->toDateString());
    }

    #[DataProvider('invalidValues')]
    public function test_returns_null_for_invalid_value(string $value): void
    {
        $this->assertNull(Month::parse($value));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidValues(): array
    {
        return [
            'kosong' => [''],
            'bulan 13' => ['2026-13'],
            'bulan 00' => ['2026-00'],
            'tanggal lengkap' => ['2026-11-16'],
            'bukan angka' => ['bulan ini'],
            'sisipan sql' => ["2026-11' OR 1=1"],
        ];
    }
}
```

Kedua test ini memakai `TestCase` milik PHPUnit, bukan milik Laravel. Tidak ada aplikasi yang perlu dinyalakan, jadi keduanya selesai dalam sepersekian detik.

Titik periksa pertama:

```bash
composer format
composer check
composer test
```

```text
   PASS  Tests\Unit\MonthTest
   PASS  Tests\Unit\RupiahTest
  Tests:    8 passed (10 assertions)
```

Output di atas dipotong.

## 4. Akun

Alur daftar, masuk, dan keluar sama dengan [Bab 9](/09-laravel-lanjut#autentikasi). Salin empat file ini dari `practice/laravel-basics` tanpa perubahan:

- `app/Http/Requests/RegisterRequest.php`
- `app/Http/Requests/LoginRequest.php`
- `resources/views/auth/register.blade.php`
- `resources/views/auth/login.blade.php`

Dua controller-nya berbeda di satu hal: tujuan setelah login adalah route `expenses`. `app/Http/Controllers/RegisterController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

class RegisterController extends Controller
{
    public function create(): View
    {
        return view('auth.register');
    }

    public function store(RegisterRequest $request): RedirectResponse
    {
        $user = User::create($request->validated());

        Auth::login($user);
        $request->session()->regenerate();

        return to_route('expenses');
    }
}
```

`app/Http/Controllers/LoginController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class LoginController extends Controller
{
    public function create(): View
    {
        return view('auth.login');
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        if (! Auth::attempt($request->validated(), $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => 'Email atau kata sandi salah.']);
        }

        // Session ID baru setelah login, mencegah session fixation
        $request->session()->regenerate();

        return redirect()->intended(route('expenses'));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return to_route('login');
    }
}
```

## 5. Halaman pengeluaran

Inti aplikasi adalah satu komponen Livewire yang menampilkan ringkasan, form, dan daftar sekaligus.

```bash
php artisan make:livewire ExpenseManager --class
```

### Komponen

Isi `app/Livewire/ExpenseManager.php`:

```php
<?php

declare(strict_types=1);

namespace App\Livewire;

use App\Enums\Category;
use App\Models\User;
use App\Support\Month;
use App\Support\MonthlySummary;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Locked;
use Livewire\Component;

class ExpenseManager extends Component
{
    public string $month = '';

    public string $amount = '';

    public Category $category = Category::Food;

    public string $spentOn = '';

    public string $note = '';

    #[Locked]
    public ?int $editingId = null;

    public function mount(): void
    {
        $this->month = now()->format('Y-m');
        $this->spentOn = now()->toDateString();
    }

    public function save(): void
    {
        $this->validate();

        $data = [
            'amount' => (int) $this->amount,
            'category' => $this->category,
            'spent_on' => $this->spentOn,
            'note' => $this->note === '' ? null : $this->note,
        ];

        if ($this->editingId === null) {
            $this->user()->expenses()->create($data);
        } else {
            $this->user()->expenses()->findOrFail($this->editingId)->update($data);
        }

        $this->cancel();
    }

    public function edit(int $id): void
    {
        $expense = $this->user()->expenses()->findOrFail($id);

        $this->editingId = $expense->id;
        $this->amount = (string) $expense->amount;
        $this->category = $expense->category;
        $this->spentOn = $expense->spent_on->toDateString();
        $this->note = $expense->note ?? '';
    }

    public function cancel(): void
    {
        $this->reset('amount', 'category', 'note', 'editingId');
        $this->spentOn = now()->toDateString();
        $this->resetValidation();
    }

    public function delete(int $id): void
    {
        $this->user()->expenses()->findOrFail($id)->delete();
    }

    public function render(): View
    {
        // $month dikirim browser; kalau bentuknya rusak, pakai bulan ini
        $month = Month::parse($this->month) ?? CarbonImmutable::now()->startOfMonth();

        $expenses = $this->user()->expensesIn($month)
            ->orderByDesc('spent_on')
            ->orderByDesc('id')
            ->get();

        return view('livewire.expense-manager', [
            'expenses' => $expenses,
            'summary' => MonthlySummary::of($month, $expenses),
            'categories' => Category::cases(),
        ]);
    }

    /**
     * @return array<string, list<string>>
     */
    protected function rules(): array
    {
        return [
            'amount' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'spentOn' => ['required', 'date_format:Y-m-d'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    private function user(): User
    {
        return Auth::user() ?? abort(401);
    }
}
```

Beberapa keputusan di dalamnya:

- **`$amount` bertipe `string`.** Isi input HTML selalu teks, dan pengguna bisa mengosongkannya. Aturan `integer` memvalidasinya, dan baru setelah itu `(int)` mengubahnya. Property bertipe `int` tidak punya cara mewakili input yang masih kosong.
- **`mount()`** dijalankan sekali saat komponen pertama dibuat, tempat mengisi nilai awal yang bergantung pada waktu.
- **`rules()`** dipakai menggantikan `#[Validate]` karena aturannya lebih dari satu baris. Hasilnya sama.
- **`#[Locked]`** membuat `$editingId` tidak bisa diubah dari browser. Ini lapis kedua; lapis pertama tetap `$this->user()->expenses()->findOrFail()`.
- **Satu query untuk dua kebutuhan.** Daftar dan ringkasan dihitung dari koleksi yang sama.
- **`Month::parse(...) ?? ...`** menangani `null` di tempat: bulan yang rusak diganti bulan ini.

### Template

Isi `resources/views/livewire/expense-manager.blade.php`:

```blade
<div>
    @use('App\Enums\Category')
    @use('App\Support\Rupiah')

    <div class="flex flex-wrap items-center justify-between gap-4">
        <label class="flex items-center gap-2">
            <span class="font-medium">Bulan</span>
            <input type="month" wire:model.live="month" class="rounded border p-2">
        </label>
        <p class="text-lg">Total <strong>{{ Rupiah::format($summary->total) }}</strong></p>
    </div>

    @if ($summary->byCategory !== [])
        <ul class="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            @foreach ($summary->byCategory as $key => $total)
                <li class="rounded border bg-white p-2">
                    <span class="block text-gray-500">{{ Category::from($key)->label() }}</span>
                    {{ Rupiah::format($total) }}
                </li>
            @endforeach
        </ul>
    @endif

    <form wire:submit="save" class="mt-6 grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
        <h2 class="font-semibold sm:col-span-2">{{ $editingId === null ? 'Catat pengeluaran' : 'Ubah pengeluaran' }}</h2>

        <div>
            <label for="amount" class="block text-sm font-medium">Jumlah (Rp)</label>
            <input id="amount" type="number" min="1" step="1" inputmode="numeric" wire:model="amount"
                class="mt-1 w-full rounded border p-2">
            @error('amount')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="category" class="block text-sm font-medium">Kategori</label>
            <select id="category" wire:model="category" class="mt-1 w-full rounded border p-2">
                @foreach ($categories as $option)
                    <option value="{{ $option->value }}">{{ $option->label() }}</option>
                @endforeach
            </select>
        </div>

        <div>
            <label for="spentOn" class="block text-sm font-medium">Tanggal</label>
            <input id="spentOn" type="date" wire:model="spentOn" class="mt-1 w-full rounded border p-2">
            @error('spentOn')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="note" class="block text-sm font-medium">Catatan</label>
            <input id="note" type="text" wire:model="note" class="mt-1 w-full rounded border p-2">
            @error('note')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div class="flex items-center gap-4 sm:col-span-2">
            <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Simpan</button>
            @if ($editingId !== null)
                <button type="button" wire:click="cancel" class="underline">Batal</button>
            @endif
        </div>
    </form>

    <table class="mt-6 w-full text-left text-sm">
        <caption class="sr-only">Daftar pengeluaran pada bulan yang dipilih</caption>
        <thead>
            <tr class="text-gray-500">
                <th scope="col" class="p-2 font-medium">Tanggal</th>
                <th scope="col" class="p-2 font-medium">Kategori</th>
                <th scope="col" class="p-2 font-medium">Catatan</th>
                <th scope="col" class="p-2 text-right font-medium">Jumlah</th>
                <th scope="col" class="p-2"><span class="sr-only">Aksi</span></th>
            </tr>
        </thead>
        <tbody>
            @forelse ($expenses as $expense)
                <tr wire:key="expense-{{ $expense->id }}" class="border-t bg-white">
                    <td class="p-2">{{ $expense->spent_on->format('d-m-Y') }}</td>
                    <td class="p-2">{{ $expense->category->label() }}</td>
                    <td class="p-2">{{ $expense->note }}</td>
                    <td class="p-2 text-right">{{ Rupiah::format($expense->amount) }}</td>
                    <td class="space-x-2 p-2 text-right">
                        <button type="button" wire:click="edit({{ $expense->id }})" class="text-blue-700 underline">Ubah</button>
                        <button type="button" wire:click="delete({{ $expense->id }})" wire:confirm="Hapus pengeluaran ini?"
                            class="text-red-700 underline">Hapus</button>
                    </td>
                </tr>
            @empty
                <tr class="border-t">
                    <td colspan="5" class="p-3 text-gray-500">Belum ada pengeluaran di bulan ini.</td>
                </tr>
            @endforelse
        </tbody>
    </table>
</div>
```

`@use` di baris atas adalah padanan `use` di file PHP, supaya `Rupiah::format()` bisa ditulis pendek. Letaknya di dalam `<div>` karena komponen Livewire harus punya tepat satu elemen akar.

Halaman yang memuat komponen itu, `resources/views/expenses.blade.php`:

```blade
<x-layout title="Pengeluaran">
    <livewire:expense-manager />
</x-layout>
```

## 6. Halaman token

Supaya API di langkah 9 bisa dipakai, pengguna perlu cara membuat dan mencabut token. Halaman ini cukup dengan form biasa.

```bash
php artisan make:controller TokenController
```

Isi `app/Http/Controllers/TokenController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class TokenController extends Controller
{
    public function index(#[CurrentUser] User $user): View
    {
        return view('tokens', ['tokens' => $user->tokens()->latest()->get()]);
    }

    public function store(Request $request, #[CurrentUser] User $user): RedirectResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:50']]);

        $token = $user->createToken($request->string('name')->toString());

        // Teks token hanya ada sekarang; yang disimpan di database adalah hash-nya
        return to_route('tokens.index')->with('token', $token->plainTextToken);
    }

    public function destroy(#[CurrentUser] User $user, int $token): RedirectResponse
    {
        $user->tokens()->whereKey($token)->delete();

        return to_route('tokens.index')->with('status', 'Token dicabut.');
    }
}
```

Method `destroy` menerima id token dari URL, tetapi menghapusnya lewat `$user->tokens()`. Id milik pengguna lain tidak cocok dengan apa pun, sehingga tidak ada yang terhapus.

Isi `resources/views/tokens.blade.php`:

```blade
<x-layout title="Token API">
    @if (session('token'))
        <div role="status" class="mb-4 rounded bg-yellow-100 p-3">
            <p>Salin token ini sekarang. Token tidak akan ditampilkan lagi.</p>
            <code class="mt-2 block break-all">{{ session('token') }}</code>
        </div>
    @endif

    <form method="POST" action="{{ route('tokens.store') }}" class="flex items-end gap-2">
        @csrf
        <div class="grow">
            <label for="name" class="block font-medium">Nama token</label>
            <input id="name" name="name" type="text" value="{{ old('name') }}" required maxlength="50"
                class="mt-1 w-full rounded border p-2">
            @error('name')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>
        <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Buat token</button>
    </form>

    <ul class="mt-6 divide-y rounded border bg-white">
        @forelse ($tokens as $token)
            <li class="flex items-center justify-between gap-4 p-3">
                <span>
                    {{ $token->name }}
                    <span class="text-sm text-gray-500">dibuat {{ $token->created_at?->format('d-m-Y') }}</span>
                </span>
                <form method="POST" action="{{ route('tokens.destroy', $token->id) }}">
                    @csrf
                    @method('DELETE')
                    <button type="submit" class="text-sm text-red-700 underline">Cabut</button>
                </form>
            </li>
        @empty
            <li class="p-3 text-gray-500">Belum ada token.</li>
        @endforelse
    </ul>
</x-layout>
```

## 7. Layout dan route

Semua halaman sudah ada. Tinggal bingkainya dan alamatnya.

Isi `resources/views/components/layout.blade.php`:

```blade
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} - Dompet</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="bg-gray-50 text-gray-900">
    @auth
        <nav class="flex flex-wrap items-center gap-4 border-b bg-white p-3 text-sm">
            <a href="{{ route('expenses') }}" class="font-semibold">Dompet</a>
            <a href="{{ route('expenses') }}" class="underline">Pengeluaran</a>
            <a href="{{ route('tokens.index') }}" class="underline">Token API</a>
            <span class="ml-auto">{{ auth()->user()->name }}</span>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button type="submit" class="underline">Keluar</button>
            </form>
        </nav>
    @endauth

    <main class="mx-auto max-w-3xl p-6">
        <h1 class="mb-6 text-2xl font-semibold">{{ $title }}</h1>

        @if (session('status'))
            <p role="status" class="mb-4 rounded bg-green-100 p-3 text-green-800">{{ session('status') }}</p>
        @endif

        {{ $slot }}
    </main>
</body>
</html>
```

Ganti isi `routes/web.php`:

```php
<?php

declare(strict_types=1);

use App\Http\Controllers\LoginController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\TokenController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/expenses');

Route::middleware('guest')->group(function (): void {
    Route::get('/register', [RegisterController::class, 'create'])->name('register');
    Route::post('/register', [RegisterController::class, 'store']);
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])->middleware('throttle:5,1');
});

Route::middleware('auth')->group(function (): void {
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');
    Route::view('/expenses', 'expenses')->name('expenses');
    Route::get('/tokens', [TokenController::class, 'index'])->name('tokens.index');
    Route::post('/tokens', [TokenController::class, 'store'])->name('tokens.store');
    Route::delete('/tokens/{token}', [TokenController::class, 'destroy'])->name('tokens.destroy');
});
```

`Route::view` langsung merender sebuah view tanpa controller. Halaman pengeluaran tidak butuh controller, karena semua logikanya ada di komponen Livewire.

Titik periksa kedua:

```bash
composer format
composer check
```

```text
 [OK] No errors
```

Jalankan Vite dari PowerShell (`npm run dev`), lalu buka `http://localhost:8000`. Daftar, catat beberapa pengeluaran, ganti bulan, ubah, dan hapus. Yang terjadi di balik tombol Simpan, diamati dengan script uji seperti di [Bab 9](/09-laravel-lanjut):

```text
kirim: [{"path":"","method":"save","params":[]}] updates={"amount":"25000","category":"transport","spentOn":"2026-11-15","note":"Ojek ke kantor"}
HTTP 200
state: {"month":"2026-11","amount":"","category":["food",{"class":"App\\Enums\\Category","s":"enm"}],"spentOn":"2026-11-16","note":"","editingId":null}
```

Form kembali kosong setelah disimpan, dan enum `Category` ikut dititipkan ke browser beserta nama class-nya. Menghapus id milik orang lain berakhir dengan `404`.

## 8. Laporan bulanan

Setiap tanggal 1, tiap pengguna menerima email ringkasan bulan sebelumnya. Rantainya:

1. **Scheduler** menjalankan sebuah perintah pada waktunya.
2. **Perintah** itu memasukkan satu job per pengguna ke queue.
3. **Worker** mengerjakan job satu per satu.
4. **Job** menghitung ringkasan dan mengirim email.

Satu job per pengguna berarti kegagalan mengirim ke satu alamat tidak menghentikan yang lain, dan job yang gagal bisa diulang sendiri-sendiri.

### Email

```bash
php artisan make:mail MonthlyReportMail --markdown=mail.monthly-report
```

Isi `app/Mail/MonthlyReportMail.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\User;
use App\Support\MonthlySummary;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class MonthlyReportMail extends Mailable
{
    public function __construct(public User $user, public MonthlySummary $summary) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Ringkasan pengeluaran '.$this->summary->month->translatedFormat('F Y'));
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.monthly-report');
    }
}
```

`translatedFormat('F Y')` menghasilkan nama bulan dalam bahasa aplikasi. Karena `APP_LOCALE=id`, hasilnya "Oktober 2026".

Isi `resources/views/mail/monthly-report.blade.php`:

```blade
@use('App\Enums\Category')
@use('App\Support\Rupiah')
<x-mail::message>
# Ringkasan {{ $summary->month->translatedFormat('F Y') }}

Halo {{ $user->name }}, bulan lalu kamu mencatat {{ $summary->count }} pengeluaran dengan total **{{ Rupiah::format($summary->total) }}**.

<x-mail::table>
| Kategori | Total |
|:---------|------:|
@foreach ($summary->byCategory as $key => $total)
| {{ Category::from($key)->label() }} | {{ Rupiah::format($total) }} |
@endforeach
</x-mail::table>

<x-mail::button :url="route('expenses')">
Buka Dompet
</x-mail::button>
</x-mail::message>
```

Jangan beri indentasi pada isi template ini. Email Markdown memperlakukan baris yang menjorok sebagai blok kode.

### Job

```bash
php artisan make:job SendMonthlyReport
```

Isi `app/Jobs/SendMonthlyReport.php`:

```php
<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\MonthlyReportMail;
use App\Models\User;
use App\Support\MonthlySummary;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

class SendMonthlyReport implements ShouldQueue
{
    use Queueable;

    public function __construct(public User $user, public CarbonImmutable $month) {}

    public function handle(): void
    {
        $summary = MonthlySummary::of($this->month, $this->user->expensesIn($this->month)->get());

        if ($summary->count === 0) {
            return;
        }

        Mail::to($this->user)->send(new MonthlyReportMail($this->user, $summary));
    }
}
```

Di [Bab 9](/09-laravel-lanjut) kamu memakai listener yang masuk queue. Job adalah bentuk langsungnya: class dengan data di constructor dan pekerjaan di `handle()`. Pengguna yang tidak mencatat apa pun bulan itu tidak dikirimi email kosong.

### Perintah

```bash
php artisan make:command SendMonthlyReports
```

Isi `app/Console/Commands/SendMonthlyReports.php`:

```php
<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\SendMonthlyReport;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('reports:send')]
#[Description('Masukkan laporan pengeluaran bulan lalu ke antrean, satu job per pengguna')]
class SendMonthlyReports extends Command
{
    public function handle(): int
    {
        $month = CarbonImmutable::now()->subMonthNoOverflow()->startOfMonth();
        $count = 0;

        foreach (User::query()->lazy() as $user) {
            SendMonthlyReport::dispatch($user, $month);
            $count++;
        }

        $this->info("{$count} laporan masuk antrean untuk {$month->format('Y-m')}.");

        return self::SUCCESS;
    }
}
```

Class ini menambah perintah `php artisan reports:send`. Nama dan deskripsinya dinyatakan lewat attribute ([Bab 4](/04-oop)). `lazy()` mengambil pengguna dari database sebagian demi sebagian, sehingga memori tidak membengkak saat penggunanya banyak.

### Jadwal

Ganti isi `routes/console.php`:

```php
<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

// Tanggal 1 setiap bulan: antrekan laporan bulan lalu untuk semua pengguna
Schedule::command('reports:send')->monthlyOn(1, '07:00');

// Setiap menit: kerjakan isi antrean sampai habis atau paling lama 50 detik, lalu berhenti
Schedule::command('queue:work --stop-when-empty --max-time=50')->everyMinute()->withoutOverlapping();
```

Baris kedua adalah jawaban untuk batasan shared hosting dari [Bab 9](/09-laravel-lanjut): tidak ada worker yang berjalan terus. Sebagai gantinya, worker dijalankan tiap menit, mengerjakan apa yang ada, lalu berhenti. `--max-time=50` memastikan ia selesai sebelum menit berikutnya, dan `withoutOverlapping()` mencegah dua worker berjalan bersamaan.

Jam `07:00` mengikuti zona waktu aplikasi, yaitu `Asia/Jakarta` yang kamu atur di langkah 1.

Scheduler sendiri tidak berjalan dengan sendirinya. Di production, satu baris cron memanggil `php artisan schedule:run` setiap menit; itu urusan [Bab 12](/12-deploy). Di development, tirukan cron dengan:

```bash
php artisan schedule:work
```

### Mencoba

Lihat jadwalnya:

```bash
composer format
php artisan schedule:list
```

```text
  0 7 1 * *  php artisan reports:send ....... Next Due: 2 minggu dari sekarang
  * * * * *  php artisan queue:work --stop-when-empty --max-time=50  Next Due: 0 detik dari sekarang
```

Supaya tidak menunggu tanggal 1, catat dua pengeluaran bertanggal bulan lalu lewat halaman, lalu jalankan perintahnya dengan tangan:

```bash
php artisan reports:send
```

```text
1 laporan masuk antrean untuk 2026-10.
```

Job sekarang menunggu di tabel `jobs`. Jalankan scheduler satu kali, seperti yang akan dilakukan cron:

```bash
php artisan schedule:run
```

```text
  2026-11-16 15:23:00 Running ['artisan' queue:work --stop-when-empty --max-time=50]  3dt DONE
```

Email tertulis di `storage/logs/laravel.log`:

```text
To: Budi <budi@example.com>
Subject: Ringkasan pengeluaran Oktober 2026
# Ringkasan Oktober 2026
Halo Budi, bulan lalu kamu mencatat 2 pengeluaran dengan total **Rp 65.000**.
| Kategori | Total |
| Tagihan | Rp 50.000 |
| Makan | Rp 15.000 |
```

Output di atas disaring dari isi log.

## 9. API

Dua endpoint, keduanya hanya membaca data milik pemilik token.

```bash
php artisan make:resource ExpenseResource
php artisan make:controller ApiController
```

Isi `app/Http/Resources/ExpenseResource.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Expense
 */
class ExpenseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'amount' => $this->amount,
            'category' => $this->category->value,
            'spent_on' => $this->spent_on->toDateString(),
            'note' => $this->note,
        ];
    }
}
```

Isi `app/Http/Controllers/ApiController.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\ExpenseResource;
use App\Models\User;
use App\Support\Month;
use App\Support\MonthlySummary;
use Carbon\CarbonImmutable;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ApiController extends Controller
{
    public function summary(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $month = $this->month($request);
        $summary = MonthlySummary::of($month, $user->expensesIn($month)->get());

        return response()->json([
            'month' => $summary->month->format('Y-m'),
            'total' => $summary->total,
            'count' => $summary->count,
            'by_category' => $summary->byCategory,
        ]);
    }

    public function expenses(Request $request, #[CurrentUser] User $user): AnonymousResourceCollection
    {
        $expenses = $user->expensesIn($this->month($request))
            ->orderByDesc('spent_on')
            ->orderByDesc('id')
            ->get();

        return ExpenseResource::collection($expenses);
    }

    private function month(Request $request): CarbonImmutable
    {
        $value = $request->string('month', now()->format('Y-m'))->toString();

        return Month::parse($value) ?? abort(422, 'Parameter month harus berbentuk YYYY-MM.');
    }
}
```

Bandingkan method `month()` di sini dengan `render()` di komponen Livewire. Keduanya memanggil `Month::parse()` yang sama, tetapi menangani `null` secara berbeda: halaman memilih bulan ini, API menolak dengan `422`. Fungsi pembacanya tidak memutuskan; pemanggilnya yang memutuskan, sesuai konteks.

Ganti isi `routes/api.php`:

```php
<?php

declare(strict_types=1);

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/summary', [ApiController::class, 'summary']);
    Route::get('/expenses', [ApiController::class, 'expenses']);
});
```

### Mencoba

Buat token di halaman Token API, salin, lalu dari shell container:

```bash
TOKEN='tempel-token-di-sini'
curl -s "http://localhost:8000/api/summary?month=2026-11" -H 'Accept: application/json' -H "Authorization: Bearer $TOKEN"
```

```json
{"month":"2026-11","total":25000,"count":1,"by_category":{"transport":25000}}
```

```bash
curl -s "http://localhost:8000/api/expenses?month=2026-11" -H 'Accept: application/json' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":1,"amount":25000,"category":"transport","spent_on":"2026-11-15","note":"Ojek ke kantor"}]}
```

Dua kasus gagal:

| Request | Status | Pesan |
|---|---|---|
| Tanpa header `Authorization` | `401` | `Unauthenticated.` |
| `?month=oktober` | `422` | `Parameter month harus berbentuk YYYY-MM.` |

## 10. Test

Lima file test di `tests/Feature` menjaga perilaku aplikasi. Kodenya panjang, jadi tiap file dilipat; buka dan salin satu per satu.

### Akun

::: details tests/Feature/AuthTest.php
```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get('/expenses')->assertRedirect('/login');
        $this->get('/tokens')->assertRedirect('/login');
    }

    public function test_user_can_register(): void
    {
        $response = $this->post('/register', [
            'name' => 'Budi',
            'email' => 'budi@example.com',
            'password' => 'rahasia-sekali',
            'password_confirmation' => 'rahasia-sekali',
        ]);

        $response->assertRedirect('/expenses');
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['email' => 'budi@example.com']);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', ['email' => $user->email, 'password' => 'salah']);

        $response->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_user_can_login_and_logout(): void
    {
        $user = User::factory()->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/expenses');
        $this->assertAuthenticatedAs($user);

        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
    }
}
```
:::

### Halaman pengeluaran

Test ini membekukan waktu dengan `travelTo()`. Tanpa itu, "bulan ini" berubah tergantung kapan test dijalankan, dan test yang lulus hari ini bisa gagal bulan depan.

::: details tests/Feature/ExpenseManagerTest.php
```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Category;
use App\Livewire\ExpenseManager;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class ExpenseManagerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Tanggal tetap, supaya "bulan ini" tidak bergantung pada kapan test dijalankan
        $this->travelTo('2026-11-16 10:00:00');
    }

    public function test_page_renders_for_logged_in_user(): void
    {
        $this->actingAs(User::factory()->create())->get('/expenses')
            ->assertOk()
            ->assertSee('Catat pengeluaran');
    }

    public function test_save_creates_expense_and_resets_form(): void
    {
        $user = User::factory()->create();

        $component = Livewire::actingAs($user)->test(ExpenseManager::class);
        $component->set('amount', '25000')
            ->set('category', Category::Transport)
            ->set('spentOn', '2026-11-15')
            ->set('note', 'Ojek ke kantor')
            ->call('save');

        $component->assertHasNoErrors();
        $component->assertSet('amount', '');
        $component->assertSee('Ojek ke kantor');
        $component->assertSee('Rp 25.000');
        $this->assertDatabaseHas('expenses', [
            'user_id' => $user->id,
            'amount' => 25000,
            'category' => 'transport',
            'note' => 'Ojek ke kantor',
        ]);
    }

    public function test_amount_must_be_a_positive_integer(): void
    {
        $component = Livewire::actingAs(User::factory()->create())->test(ExpenseManager::class);

        $component->set('amount', '')->call('save');
        $component->assertHasErrors('amount');

        $component->set('amount', '0')->call('save');
        $component->assertHasErrors('amount');

        $component->set('amount', '12.5')->call('save');
        $component->assertHasErrors('amount');

        $this->assertDatabaseCount('expenses', 0);
    }

    public function test_shows_only_own_expenses_of_selected_month(): void
    {
        $user = User::factory()->create();
        Expense::factory()->for($user)->create(['note' => 'Bulan ini', 'spent_on' => '2026-11-03', 'amount' => 40_000]);
        Expense::factory()->for($user)->create(['note' => 'Bulan lalu', 'spent_on' => '2026-10-28', 'amount' => 7_000]);
        Expense::factory()->create(['note' => 'Punya orang', 'spent_on' => '2026-11-03']);

        $component = Livewire::actingAs($user)->test(ExpenseManager::class);
        $component->assertSee('Bulan ini');
        $component->assertSee('Rp 40.000');
        $component->assertDontSee('Bulan lalu');
        $component->assertDontSee('Punya orang');

        $component->set('month', '2026-10');
        $component->assertSee('Bulan lalu');
        $component->assertSee('Rp 7.000');
        $component->assertDontSee('Bulan ini');
    }

    public function test_broken_month_falls_back_to_current_month(): void
    {
        $user = User::factory()->create();
        Expense::factory()->for($user)->create(['note' => 'Bulan ini', 'spent_on' => '2026-11-03']);

        $component = Livewire::actingAs($user)->test(ExpenseManager::class);
        $component->set('month', 'rusak');

        $component->assertSee('Bulan ini');
    }

    public function test_edit_then_save_updates_expense(): void
    {
        $expense = Expense::factory()->create(['amount' => 10_000, 'spent_on' => '2026-11-10', 'note' => 'Lama']);

        $component = Livewire::actingAs($expense->user()->firstOrFail())->test(ExpenseManager::class);
        $component->call('edit', $expense->id);
        $component->assertSet('amount', '10000');
        $component->assertSet('note', 'Lama');

        $component->set('amount', '15000')->set('note', 'Baru')->call('save');

        $component->assertSet('editingId', null);
        $expense->refresh();
        $this->assertSame(15_000, $expense->amount);
        $this->assertSame('Baru', $expense->note);
        $this->assertDatabaseCount('expenses', 1);
    }

    public function test_delete_removes_own_expense(): void
    {
        $expense = Expense::factory()->create(['spent_on' => '2026-11-10']);

        Livewire::actingAs($expense->user()->firstOrFail())->test(ExpenseManager::class)->call('delete', $expense->id);

        $this->assertModelMissing($expense);
    }

    public function test_cannot_edit_or_delete_expense_of_another_user(): void
    {
        $expense = Expense::factory()->create(['spent_on' => '2026-11-10']);
        $intruder = User::factory()->create();

        $edit = Livewire::actingAs($intruder)->test(ExpenseManager::class);
        $edit->call('edit', $expense->id);
        $edit->assertStatus(404);

        $delete = Livewire::actingAs($intruder)->test(ExpenseManager::class);
        $delete->call('delete', $expense->id);
        $delete->assertStatus(404);

        $this->assertModelExists($expense);
    }
}
```
:::

### Laporan bulanan

::: details tests/Feature/MonthlyReportTest.php
```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Category;
use App\Jobs\SendMonthlyReport;
use App\Mail\MonthlyReportMail;
use App\Models\Expense;
use App\Models\User;
use App\Support\MonthlySummary;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class MonthlyReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-11-01 07:00:00');
    }

    public function test_summary_totals_per_category_sorted_by_amount(): void
    {
        $user = User::factory()->create();
        Expense::factory()->for($user)->create(['amount' => 10_000, 'category' => Category::Food, 'spent_on' => '2026-10-01']);
        Expense::factory()->for($user)->create(['amount' => 5_000, 'category' => Category::Food, 'spent_on' => '2026-10-31']);
        Expense::factory()->for($user)->create(['amount' => 50_000, 'category' => Category::Bills, 'spent_on' => '2026-10-15']);
        Expense::factory()->for($user)->create(['amount' => 99_000, 'spent_on' => '2026-11-01']);

        $october = CarbonImmutable::parse('2026-10-01');
        $summary = MonthlySummary::of($october, $user->expensesIn($october)->get());

        $this->assertSame(65_000, $summary->total);
        $this->assertSame(3, $summary->count);
        $this->assertSame(['bills' => 50_000, 'food' => 15_000], $summary->byCategory);
    }

    public function test_command_queues_one_job_per_user_for_last_month(): void
    {
        Queue::fake();
        User::factory()->count(2)->create();

        $exitCode = Artisan::call('reports:send');

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('2 laporan masuk antrean untuk 2026-10.', Artisan::output());
        Queue::assertPushed(SendMonthlyReport::class, 2);
        Queue::assertPushed(
            SendMonthlyReport::class,
            fn (SendMonthlyReport $job): bool => $job->month->toDateString() === '2026-10-01',
        );
    }

    public function test_job_mails_summary_to_user(): void
    {
        Mail::fake();
        $user = User::factory()->create();
        Expense::factory()->for($user)->create(['amount' => 40_000, 'spent_on' => '2026-10-10']);

        (new SendMonthlyReport($user, CarbonImmutable::parse('2026-10-01')))->handle();

        Mail::assertSent(
            MonthlyReportMail::class,
            fn (MonthlyReportMail $mail): bool => $mail->hasTo($user->email) && $mail->summary->total === 40_000,
        );
    }

    public function test_job_sends_nothing_when_month_is_empty(): void
    {
        Mail::fake();

        (new SendMonthlyReport(User::factory()->create(), CarbonImmutable::parse('2026-10-01')))->handle();

        Mail::assertNothingSent();
    }

    public function test_mail_shows_month_total_and_categories(): void
    {
        $user = User::factory()->create(['name' => 'Budi']);
        $summary = new MonthlySummary(CarbonImmutable::parse('2026-10-01'), 65_000, 3, ['bills' => 50_000, 'food' => 15_000]);

        $mail = new MonthlyReportMail($user, $summary);

        $mail->assertHasSubject('Ringkasan pengeluaran Oktober 2026');
        $mail->assertSeeInHtml('Halo Budi');
        $mail->assertSeeInHtml('Rp 65.000');
        $mail->assertSeeInOrderInHtml(['Tagihan', 'Rp 50.000', 'Makan', 'Rp 15.000']);
    }
}
```
:::

Test pertama di file itu menangkap bug sungguhan saat materi ini ditulis. Versi awal `expensesIn()` memakai `whereBetween` dari tanggal 1 sampai tanggal terakhir bulan, dan test-nya gagal:

```text
  Failed asserting that 60000 is identical to 65000.
```

Pengeluaran bertanggal 31 Oktober tidak ikut terhitung. Eloquent menyimpan tanggal beserta jam `00:00:00`, dan di SQLite, yang membandingkannya sebagai teks, `2026-10-31 00:00:00` dianggap lebih besar daripada batas `2026-10-31`. MySQL kebetulan tidak terkena, tetapi kode yang benar hanya di satu database adalah kode yang rapuh. Rentang setengah terbuka di `expensesIn()` sekarang benar di keduanya.

### API dan token

::: details tests/Feature/ApiTest.php
```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Category;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_requires_token(): void
    {
        $this->getJson('/api/summary')->assertUnauthorized();
        $this->getJson('/api/expenses')->assertUnauthorized();
    }

    public function test_summary_returns_totals_of_requested_month(): void
    {
        $user = User::factory()->create();
        Expense::factory()->for($user)->create(['amount' => 30_000, 'category' => Category::Food, 'spent_on' => '2026-10-05']);
        Expense::factory()->for($user)->create(['amount' => 12_000, 'category' => Category::Transport, 'spent_on' => '2026-10-06']);
        Expense::factory()->for($user)->create(['amount' => 99_000, 'spent_on' => '2026-11-01']);
        Expense::factory()->create(['amount' => 77_000, 'spent_on' => '2026-10-05']);

        Sanctum::actingAs($user);

        $this->getJson('/api/summary?month=2026-10')
            ->assertOk()
            ->assertExactJson([
                'month' => '2026-10',
                'total' => 42_000,
                'count' => 2,
                'by_category' => ['food' => 30_000, 'transport' => 12_000],
            ]);
    }

    public function test_invalid_month_is_rejected(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/summary?month=oktober')->assertStatus(422);
    }

    public function test_expenses_lists_only_own_rows(): void
    {
        $user = User::factory()->create();
        Expense::factory()->for($user)->create([
            'amount' => 30_000, 'category' => Category::Food, 'spent_on' => '2026-10-05', 'note' => 'Makan siang',
        ]);
        Expense::factory()->create(['spent_on' => '2026-10-05']);

        Sanctum::actingAs($user);

        $this->getJson('/api/expenses?month=2026-10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.amount', 30_000)
            ->assertJsonPath('data.0.category', 'food')
            ->assertJsonPath('data.0.spent_on', '2026-10-05')
            ->assertJsonPath('data.0.note', 'Makan siang');
    }
}
```
:::

::: details tests/Feature/TokenTest.php
```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_create_token_and_sees_it_once(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/tokens', ['name' => 'laptop'])
            ->assertRedirect('/tokens')
            ->assertSessionHas('token');

        $plain = session('token');
        $this->assertIsString($plain);
        $this->assertSame(1, $user->tokens()->count());
        $this->assertDatabaseMissing('personal_access_tokens', ['token' => $plain]);
    }

    public function test_created_token_authenticates_api_request(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('laptop')->plainTextToken;

        $this->getJson('/api/summary', ['Authorization' => "Bearer {$token}"])->assertOk();
    }

    public function test_user_can_revoke_only_own_token(): void
    {
        $user = User::factory()->create();
        $own = $user->createToken('laptop')->accessToken;
        $foreign = User::factory()->create()->createToken('milik orang')->accessToken;

        $this->actingAs($user)->delete("/tokens/{$foreign->id}")->assertRedirect('/tokens');
        $this->assertModelExists($foreign);

        $this->actingAs($user)->delete("/tokens/{$own->id}")->assertRedirect('/tokens');
        $this->assertModelMissing($own);
    }
}
```
:::

`session('token')` bertipe `mixed`. `assertIsString()` adalah assertion sekaligus penyempit tipe: setelah baris itu, PHPStan memperlakukan `$plain` sebagai `string`.

### Jalankan

```bash
composer format
composer check
composer test
```

```text
   PASS  Tests\Unit\MonthTest
  ✓ parses valid month to first day                                      0.02s
  ✓ returns null for invalid value with data set "kosong"
  ✓ returns null for invalid value with data set "bulan 13"
  ✓ returns null for invalid value with data set "bulan 00"
  ✓ returns null for invalid value with data set "tanggal lengkap"
  ✓ returns null for invalid value with data set "bukan angka"
  ✓ returns null for invalid value with data set "sisipan sql"
   PASS  Tests\Unit\RupiahTest
  ✓ formats with dot as thousand separator                               0.01s
   PASS  Tests\Feature\ApiTest
  ✓ api requires token                                                   0.31s
  ✓ summary returns totals of requested month                            0.13s
  ✓ invalid month is rejected                                            0.08s
  ✓ expenses lists only own rows                                         0.08s
   PASS  Tests\Feature\AuthTest
  ✓ guest is redirected to login                                         0.09s
  ✓ user can register                                                    0.11s
  ✓ login fails with wrong password                                      0.30s
  ✓ user can login and logout                                            0.07s
   PASS  Tests\Feature\ExpenseManagerTest
  ✓ page renders for logged in user                                      0.12s
  ✓ save creates expense and resets form                                 0.13s
  ✓ amount must be a positive integer                                    0.13s
  ✓ shows only own expenses of selected month                            0.11s
  ✓ broken month falls back to current month                             0.11s
  ✓ edit then save updates expense                                       0.13s
  ✓ delete removes own expense                                           0.11s
  ✓ cannot edit or delete expense of another user                        0.16s
   PASS  Tests\Feature\MonthlyReportTest
  ✓ summary totals per category sorted by amount                         0.08s
  ✓ command queues one job per user for last month                       0.09s
  ✓ job mails summary to user                                            0.09s
  ✓ job sends nothing when month is empty                                0.08s
  ✓ mail shows month total and categories                                0.26s
   PASS  Tests\Feature\TokenTest
  ✓ user can create token and sees it once                               0.08s
  ✓ created token authenticates api request                              0.08s
  ✓ user can revoke only own token                                       0.08s
  Tests:    32 passed (101 assertions)
  Duration: 3.16s
```

## Siap untuk dideploy

Aplikasinya selesai. Sebelum berpindah ke [Bab 11](/11-memilih-hosting) dan 12, pastikan empat hal ini, karena proses deploy bergantung padanya:

- **Aset bisa di-build.** Jalankan `npm run build` dari PowerShell dan pastikan tidak ada error. Hasilnya di `public/build` tidak disimpan di Git.
- **Tiga file ikut disimpan di Git**: `.env.example`, `composer.lock`, dan `package-lock.json`. Server memasang versi yang persis sama dengan yang kamu uji.
- **`.env` tidak ikut.** `.gitignore` bawaan skeleton sudah mengecualikannya, bersama `vendor/`, `node_modules/`, dan `public/build`.
- **Tidak ada panggilan `env()` di luar folder `config/`.** Dompet memang tidak punya, dan Larastan menolaknya kalau ada. Alasannya dibahas di [Bab 12](/12-deploy).

Yang dibutuhkan Dompet dari server nanti:

| Kebutuhan | Rincian |
|---|---|
| PHP | 8.3 ke atas, dengan ekstensi `pdo_mysql` |
| Database | MySQL |
| Cron | Satu baris yang menjalankan `php artisan schedule:run` setiap menit |
| Email | Server SMTP, diatur lewat `MAIL_*` di `.env` |
| Folder yang bisa ditulisi | `storage/` dan `bootstrap/cache/` |

Dompet tidak menyimpan file unggahan, jadi tidak ada folder publik tambahan yang perlu disiapkan.

## Ringkasan

- **Satu aplikasi, satu bahasa.** Halaman interaktif, API, email terjadwal, dan test semuanya PHP, dan semuanya lulus level max.
- **Logika murni dipisah** ke class tanpa ketergantungan framework (`Rupiah`, `Month`, `MonthlySummary`), sehingga bisa diuji tanpa database dan dipakai ulang oleh halaman, API, dan email.
- **Input diubah sekali di tepi.** `Month::parse()` mengembalikan nilai bertipe atau `null`, dan tiap pemanggil memutuskan sendiri nasib `null` itu.
- **Kepemilikan dijaga lewat relasi**: tidak ada query pengeluaran yang tidak berangkat dari seorang pengguna.
- **Queue dan scheduler dirancang untuk shared hosting**: worker dijalankan tiap menit dan berhenti sendiri.
- **Test menangkap bug yang lolos dari PHPStan**, seperti rentang tanggal yang salah di SQLite.

## Latihan

### 1. Kategori baru

Tambahkan kategori "Kesehatan" ke enum `Category` dengan nilai `health`, tetapi jangan ubah method `label()` dulu. Jalankan `composer check`. Apa yang dilaporkan?

::: details Jawaban
PHPStan menolak `match` yang tidak lagi lengkap:

```text
  18     Match expression does not handle remaining value:
         App\Enums\Category::Health
         🪪  match.unhandled
```

Tambahkan cabangnya di `label()`:

```php
            self::Health => 'Kesehatan',
```

Inilah untungnya enum dibanding string biasa. Menambah satu nilai langsung menunjukkan semua tempat yang harus ikut berubah, sama seperti `match` atas enum di Rust. Tidak ada migration yang diperlukan, karena kolom `category` hanya menyimpan teks.
:::

### 2. Tanggal tidak boleh di masa depan

Tolak pengeluaran yang tanggalnya setelah hari ini. Tulis test-nya lebih dulu, pastikan gagal, baru tambahkan aturannya.

::: details Jawaban
Test baru di `ExpenseManagerTest`. Waktu di class itu sudah dibekukan pada 16 November 2026:

```php
    public function test_expense_date_cannot_be_in_the_future(): void
    {
        $component = Livewire::actingAs(User::factory()->create())->test(ExpenseManager::class);
        $component->set('amount', '10000')->set('spentOn', '2026-11-17')->call('save');

        $component->assertHasErrors('spentOn');
        $this->assertDatabaseCount('expenses', 0);
    }
```

Sebelum aturannya ada, test itu gagal. Lalu tambahkan `before_or_equal:today` di `rules()`:

```php
            'spentOn' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
```

Setelah itu test lulus. Urutan gagal dulu lalu lulus membuktikan test-nya benar-benar menguji aturan itu.
:::

### 3. Laporan untuk bulan tertentu

Buat `php artisan reports:send 2026-09` mengantrekan laporan bulan September, sedangkan tanpa argumen perilakunya tetap seperti semula. Argumen yang bentuknya salah harus ditolak dengan pesan error.

::: details Jawaban
Tambahkan argumen opsional di signature, lalu persempit tipenya. `$this->argument()` mengembalikan tipe gabungan yang lebar, jadi `is_string()` diperlukan sebelum nilainya bisa diberikan ke `Month::parse()`:

```php
use App\Support\Month;

#[Signature('reports:send {month? : Bulan laporan, berbentuk YYYY-MM}')]
#[Description('Masukkan laporan pengeluaran ke antrean, satu job per pengguna')]
class SendMonthlyReports extends Command
{
    public function handle(): int
    {
        $argument = $this->argument('month');

        $month = is_string($argument)
            ? Month::parse($argument)
            : CarbonImmutable::now()->subMonthNoOverflow()->startOfMonth();

        if ($month === null) {
            $this->error('Bulan harus berbentuk YYYY-MM.');

            return self::FAILURE;
        }

        $count = 0;

        foreach (User::query()->lazy() as $user) {
            SendMonthlyReport::dispatch($user, $month);
            $count++;
        }

        $this->info("{$count} laporan masuk antrean untuk {$month->format('Y-m')}.");

        return self::SUCCESS;
    }
}
```

Hasilnya:

```text
$ php artisan reports:send 2026-09
1 laporan masuk antrean untuk 2026-09.

$ php artisan reports:send september
Bulan harus berbentuk YYYY-MM.

$ php artisan reports:send
1 laporan masuk antrean untuk 2026-10.
```

`Month::parse()` sekarang punya tiga pemanggil dengan tiga cara menangani `null`: halaman memakai bulan ini, API menjawab `422`, dan perintah ini keluar dengan kode gagal.
:::
