# Laporan bulanan dan API

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

Di [Bab 9](/09-laravel-lanjut/) kamu memakai listener yang masuk queue. Job adalah bentuk langsungnya: class dengan data di constructor dan pekerjaan di `handle()`. Pengguna yang tidak mencatat apa pun bulan itu tidak dikirimi email kosong.

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

Baris kedua adalah jawaban untuk batasan shared hosting dari [Bab 9](/09-laravel-lanjut/): tidak ada worker yang berjalan terus. Sebagai gantinya, worker dijalankan tiap menit, mengerjakan apa yang ada, lalu berhenti. `--max-time=50` memastikan ia selesai sebelum menit berikutnya, dan `withoutOverlapping()` mencegah dua worker berjalan bersamaan.

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
