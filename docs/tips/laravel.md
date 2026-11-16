# Tips & trik Laravel

Kumpulan trik yang tidak muat di Bab 8 sampai 10. Baca dalam urutan apa pun setelah [Bab 9](/09-laravel-lanjut/), karena semuanya memakai model `Task` dan `User` dari bab itu. Setiap potongan kode dijalankan di Laravel 13 dan lolos Larastan level max.

Contoh tinker di halaman ini memakai satu pengguna bernama Siti dengan tiga tugas buatan factory. Outputnya dipotong ke baris yang penting.

## Nyalakan mode ketat Eloquent

Secara bawaan Eloquent memaafkan tiga kesalahan tanpa kabar: relasi yang dimuat satu per satu di dalam loop (masalah N+1), kolom yang tidak ikut di-`select` (hasilnya `null`), dan kolom di luar `#[Fillable]` yang dibuang begitu saja. Satu baris di `AppServiceProvider` mengubah ketiganya menjadi exception:

```php [app/Providers/AppServiceProvider.php]
use Illuminate\Database\Eloquent\Model;

    public function boot(): void
    {
        // Ketat di development dan test, longgar di production supaya pengguna tidak melihat error
        Model::shouldBeStrict(! $this->app->isProduction());
    }
```

```text
> $tasks = App\Models\Task::query()->get();

> $tasks->first()->user->name;

   Illuminate\Database\LazyLoadingViolationException  Attempted to lazy load [user] on model [App\Models\Task] but lazy loading is disabled.

> App\Models\Task::query()->select('id', 'title')->first()->is_done;

   Illuminate\Database\Eloquent\MissingAttributeException  The attribute [is_done] either does not exist or was not retrieved for model [App\Models\Task].

> App\Models\Task::create(['title' => 'Rapat', 'user_id' => $user->id]);

   Illuminate\Database\Eloquent\MassAssignmentException  Add fillable property [user_id] to allow mass assignment on [App\Models\Task].
```

- **Lazy loading hanya dilarang untuk model yang diambil bersama model lain**, karena di situlah N+1 terjadi. `Task::query()->first()->user->name` tetap jalan. Perbaikannya ada di tip berikutnya.
- **`user_id` sengaja tidak ada di `#[Fillable]`.** Isi lewat relasi, `$user->tasks()->create([...])`, seperti di [Bab 9](/09-laravel-lanjut/02-relasi).

Rasanya mirip `"strict": true` di `tsconfig.json`: kesalahan yang tadinya lolos diam-diam sekarang berhenti di tempat.

## Ambil relasi sekaligus dengan `with()`

Lazy loading yang ditolak tadi diperbaiki dengan memuat relasi di awal. Berapa pun jumlah tugasnya, query-nya tetap dua: satu untuk `tasks`, satu untuk semua `users` yang terkait.

```php
$tasks = Task::query()->with('user')->latest()->get();
```

`DB::enableQueryLog()` mencatat setiap query, jadi jumlahnya bisa dihitung:

```text
> DB::enableQueryLog();

= null

> App\Models\Task::query()->with('user')->get()->map(fn ($task) => $task->user->name);

= Illuminate\Support\Collection {#8207
    all: [
      "Siti",
      "Siti",
      "Siti",
    ],
  }

> count(DB::getQueryLog());

= 2
```

Kalau modelnya sudah ada di tangan, `$task->loadMissing('user')` memuat relasi hanya kalau belum dimuat. Padanannya di Prisma adalah `include`.

## Hitung relasi tanpa memuatnya

Untuk menampilkan "Siti: 3 tugas", memuat semua tugas hanya untuk dihitung adalah pemborosan. `withCount()` menambahkan subquery `count(*)`, dan hasilnya tersedia sebagai `tasks_count`:

```php
$users = User::query()->withCount('tasks')->get();

foreach ($users as $user) {
    echo "{$user->name}: {$user->tasks_count} tugas".PHP_EOL;
}
```

```text
> App\Models\User::query()->withCount('tasks')->get()->pluck('tasks_count', 'name');

= Illuminate\Support\Collection {#7428
    all: [
      "Siti" => 3,
      "Budi" => 0,
    ],
  }

> App\Models\User::query()->withExists('tasks')->get()->pluck('tasks_exists', 'name');

= Illuminate\Support\Collection {#8244
    all: [
      "Siti" => true,
      "Budi" => false,
    ],
  }
```

Larastan mengenali `tasks_count` sebagai `int<0, max>`. Pasangannya, `withExists()`, belum dikenali: `$user->tasks_exists` ditolak dengan pesan berikut. Kalau butuh tipe yang pasti, pakai `$user->tasks_count > 0`.

```text
Access to an undefined property App\Models\User::$tasks_exists.
```

## `whereBelongsTo()` dan `whereRelation()`

Menulis `where('user_id', $user->id)` berarti mengulang nama foreign key yang sudah ada di relasi. `whereBelongsTo()` membacanya dari relasi `user()`:

```php
// sebelum
$tasks = Task::query()->where('user_id', $user->id)->get();

// sesudah
$tasks = Task::query()->whereBelongsTo($user)->get();
```

`whereRelation()` menyaring berdasarkan kolom di tabel relasinya. SQL yang dihasilkan keduanya:

```text
> App\Models\Task::query()->whereBelongsTo($user)->toRawSql();

= "select * from \"tasks\" where \"tasks\".\"user_id\" in (1)"

> App\Models\Task::query()->whereRelation('user', 'name', 'Siti')->toRawSql();

= "select * from \"tasks\" where exists (select * from \"users\" where \"tasks\".\"user_id\" = \"users\".\"id\" and \"name\" = 'Siti')"
```

Tanda kutip ganda di sekitar nama tabel berasal dari SQLite; di MySQL hasilnya memakai backtick.

## `sole()`: tepat satu baris, atau gagal

`first()` mengembalikan `Task|null` dan diam saja kalau ternyata ada dua baris yang cocok. `sole()` menuntut tepat satu:

```php
$task = Task::query()->where('title', $title)->sole();
```

| Ekspresi | Tipe menurut Larastan |
|---|---|
| `Task::query()->where(...)->first()` | `App\Models\Task\|null` |
| `Task::query()->where(...)->sole()` | `App\Models\Task` |

```text
> App\Models\Task::query()->where('title', 'Tidak ada')->sole();

   Illuminate\Database\Eloquent\ModelNotFoundException  No query results for model [App\Models\Task].

> App\Models\Task::query()->where('user_id', 1)->sole();

   Illuminate\Database\MultipleRecordsFoundException  2 records were found.
```

Siti punya tiga tugas, tetapi pesannya menyebut dua: `sole()` hanya mengambil dua baris, cukup untuk tahu bahwa hasilnya tidak tunggal. `ModelNotFoundException` otomatis menjadi respons 404, sama seperti `firstOrFail()`. Padanannya di Rust adalah `exactly_one()` dari crate itertools.

## Ubah data massal dengan `chunkById()`, bukan `chunk()`

`chunk()` membagi hasil per halaman dengan `offset`. Kalau di dalamnya kamu mengubah kolom yang dipakai di `where`, baris yang sudah diubah keluar dari hasil, halaman berikutnya bergeser, dan sebagian baris terlewat. Dengan enam tugas yang belum selesai:

```text
> App\Models\Task::query()->where('is_done', false)->count();

= 6

> App\Models\Task::query()->where('is_done', false)->chunk(2, fn ($tasks) => $tasks->each->update(['is_done' => true]));

= true

> App\Models\Task::query()->where('is_done', false)->count();

= 2

> App\Models\Task::query()->update(['is_done' => false]);

= 6

> App\Models\Task::query()->where('is_done', false)->chunkById(2, fn ($tasks) => $tasks->each->update(['is_done' => true]));

= true

> App\Models\Task::query()->where('is_done', false)->count();

= 0
```

Tidak ada error sama sekali; dua tugas hanya tidak tersentuh. `chunkById()` melanjutkan dari `id` terakhir, bukan dari offset, sehingga tidak ada yang terlewat:

```php
Task::query()
    ->where('priority', '!=', Priority::High)
    ->whereDate('due_date', '<', today())
    ->chunkById(100, function (Collection $tasks): void {
        foreach ($tasks as $task) {
            $task->update(['priority' => Priority::High]);
        }
    });
```

Jebakan yang sama berlaku untuk `lazy()` yang dipakai di [Bab 10](/10-proyek/04-laporan-api): pasangannya yang aman adalah `lazyById()`. Kalau tidak butuh event model untuk tiap baris, satu `update()` di query builder lebih cepat dari keduanya, karena hanya menjalankan satu query.

## Scope query dengan `#[Scope]`

Syarat yang sering diulang, seperti "tugas yang belum selesai", bisa diberi nama. Tambahkan ke `app/Models/Task.php`, beserta `use Illuminate\Database\Eloquent\Attributes\Scope;` dan `use Illuminate\Database\Eloquent\Builder;`:

```php [app/Models/Task.php]
    /**
     * Tugas yang belum selesai.
     *
     * @param  Builder<Task>  $query
     */
    #[Scope]
    protected function open(Builder $query): void
    {
        $query->where('is_done', false);
    }
```

Method itu sekarang bisa dirangkai di query mana pun:

```php
$tasks = Task::query()->open()->get();
```

```text
> App\Models\Task::query()->open()->toRawSql();

= "select * from \"tasks\" where \"is_done\" = 0"

> App\Models\Task::query()->open()->count();

= 3
```

Larastan mengikuti scope ini: tipe `Task::query()->open()->get()` tetap `Collection<int, App\Models\Task>`. Tutorial lama menulis method bernama `scopeOpen()` untuk hal yang sama; attribute `#[Scope]` membuat maksudnya terlihat tanpa perlu hafal konvensi nama.

## Lihat isi model dengan `model:show`

Kolom, cast, dan relasi sebuah model tersebar di migration dan class model. `model:show` merangkumnya dari database yang sedang berjalan:

```bash
php artisan model:show Task
```

```text
  App\Models\Task ............................................................
  Database ............................................................ sqlite
  Table ................................................................ tasks

  Attributes ..................................................... type / cast
  id increments, unique ........................................ integer / int
  title fillable ..................................................... varchar
  priority fillable ............................. varchar / App\Enums\Priority
  due_date nullable, fillable .......................... date / immutable_date
  is_done fillable ...................................... tinyint(1) / boolean
  created_at nullable .................................... datetime / datetime
  updated_at nullable .................................... datetime / datetime
  user_id ............................................................ integer

  Relations ..................................................................
  user BelongsTo ............................................. App\Models\User

  Events .....................................................................

  Observers ..................................................................
```

Berguna untuk memeriksa apakah sebuah kolom sudah fillable atau cast-nya sudah benar, tanpa membuka tiga file.

## Larang request HTTP sungguhan di test

Test yang lupa memalsukan HTTP client akan diam-diam memanggil API sungguhan: lambat, bergantung pada internet, dan bisa mengirim data ke layanan nyata. `Http::preventStrayRequests()` di `TestCase` membuatnya gagal di tempat.

Contoh layanannya:

```php:line-numbers [app/Services/HolidayChecker.php]
<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Http;

final class HolidayChecker
{
    public function isHoliday(string $date): bool
    {
        return Http::get('https://libur.example.com/api', ['date' => $date])
            ->throw()
            ->json('holiday') === true;
    }
}
```

```php:line-numbers [tests/TestCase.php]
<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Request HTTP yang tidak dipalsukan langsung gagal, bukan diam-diam ke internet
        Http::preventStrayRequests();
    }
}
```

Kalau [Bab 9](/09-laravel-lanjut/05-testing) sudah memberi `setUp()` berisi `withoutVite()`, cukup tambahkan barisnya di sana. Test yang memanggil `isHoliday()` tanpa `Http::fake()` sekarang gagal dengan pesan yang jelas:

```text
   FAILED  Tests\Feature\StrayTest > forgot to fake     StrayRequestException
  Attempted request to [https://libur.example.com/api?date=2026-12-25] without a matching fake.
```

Test yang benar memalsukan responsnya, lalu memeriksa request yang dikirim:

```php:line-numbers [tests/Feature/HolidayCheckerTest.php]
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\HolidayChecker;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HolidayCheckerTest extends TestCase
{
    public function test_reads_holiday_flag_from_api(): void
    {
        Http::fake([
            'libur.example.com/*' => Http::response(['holiday' => true]),
        ]);

        $this->assertTrue(new HolidayChecker()->isHoliday('2026-12-25'));

        Http::assertSent(fn (Request $request): bool => $request['date'] === '2026-12-25');
    }
}
```

```text
   PASS  Tests\Feature\HolidayCheckerTest
  ✓ reads holiday flag from api                                          4.47s

  Tests:    1 passed (2 assertions)
```

## Context untuk log

Saat ada error di production, baris log seperti "Tugas dibuat" tidak banyak membantu kalau tidak jelas request mana dan pengguna siapa. Facade `Context` menempelkan data ke **setiap** baris log berikutnya, tanpa harus mengopernya ke tiap pemanggilan `Log`:

```text
> Illuminate\Support\Facades\Context::add('request_id', 'req-7f3a');

> Illuminate\Support\Facades\Log::info('Tugas dibuat', ['task_id' => 4]);
```

```text
[2026-11-16 14:18:14] local.INFO: Tugas dibuat {"task_id":4} {"request_id":"req-7f3a"}
```

Objek JSON pertama adalah data milik baris itu, yang kedua adalah context. Tempat yang wajar untuk mengisinya adalah middleware, supaya setiap request mendapat ID sendiri:

```php:line-numbers [app/Http/Middleware/AddRequestContext.php]
<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AddRequestContext
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        Context::add('request_id', (string) Str::uuid());
        Context::add('user_id', $request->user()?->id);

        return $next($request);
    }
}
```

Daftarkan di `bootstrap/app.php`, beserta `use App\Http\Middleware\AddRequestContext;`:

```php [bootstrap/app.php]
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(AddRequestContext::class);
    })
```

Setelah itu setiap baris log membawa `request_id` dan `user_id`, sehingga semua baris dari satu request bisa dicari bersama.
