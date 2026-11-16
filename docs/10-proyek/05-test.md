# Test dan persiapan deploy

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
