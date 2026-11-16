# Logika murni dan akun

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

Alur daftar, masuk, dan keluar sama dengan [Bab 9](/09-laravel-lanjut/#autentikasi). Salin empat file ini dari `practice/laravel-basics` tanpa perubahan:

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
