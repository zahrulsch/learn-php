# Tips & trik testing Laravel

Lanjutan dari bagian testing di [Bab 9](/09-laravel-lanjut/05-testing). Bab itu sudah mengajarkan request palsu, `actingAs()`, factory, `Event::fake()`, `Mail::fake()`, dan `Queue::fake()`; halaman ini berisi yang belum. Contohnya memakai model `Task` dan `User` dari Bab 9.

Setiap potongan kode dijalankan di Laravel 13 dengan PHPUnit 12, serta lolos Larastan level max dan Pint. Output yang tampil berasal dari eksekusi.

## Jalankan sebagian test

`php artisan test` meneruskan opsi ke PHPUnit. Tiga yang paling sering berguna saat suite mulai besar:

```bash
# Hanya class atau method yang namanya cocok (regex)
php artisan test --filter=TaskReminder
php artisan test --filter=test_recycle_reuses_one_owner

# Berhenti di kegagalan pertama, tanpa menunggu sisa suite
php artisan test --stop-on-failure

# Daftar test paling lambat di akhir output
php artisan test --profile
```

```text
$ php artisan test --filter=TaskReminder

   PASS  Tests\Feature\TaskReminderTest
  ✓ reminds open tasks due tomorrow                                      4.43s
  ✓ nothing is due tomorrow after a day passes                           0.13s
  ✓ failed message is reported and others still sent                     0.19s

  Tests:    3 passed (5 assertions)
```

```text
$ php artisan test --profile
  ...
  Top 10 slowest tests:
  Tests\Feature\ContextTest > request id is added to context             3.52s
  Tests\Feature\RemindTasksCommandTest > command reports number of remin 2.29s
  Tests\Feature\HolidayCheckerTest > reads holiday flag from api         0.54s
  Tests\Feature\TaskReminderTest > failed message is reported and others 0.19s
  ...
```

Test pertama di setiap proses selalu terlihat lambat karena ia yang membayar booting aplikasi dan migration pertama. Yang perlu dicurigai adalah test yang lambat di tengah daftar. `--filter` mirip `cargo test nama` atau `vitest -t nama`.

## State factory: beri nama pada kondisi data

Test yang menulis `['is_done' => true]` di sepuluh tempat akan rusak di sepuluh tempat kalau arti "selesai" berubah. State factory memberi nama pada kondisi itu. Tambahkan dua method ini di `TaskFactory`:

```php [database/factories/TaskFactory.php]
    public function done(): static
    {
        return $this->state(['is_done' => true]);
    }

    public function dueTomorrow(): static
    {
        return $this->state(fn (): array => ['due_date' => today()->addDay()]);
    }
```

`dueTomorrow()` memakai closure supaya `today()` dihitung saat model dibuat, bukan saat method dipanggil. Bedanya terasa kalau test menggeser waktu, seperti di tip waktu di bawah. Tipe kembalian `static` membuat state bisa dirangkai dan tetap bertipe `TaskFactory`.

Dua alat lain untuk data yang lebih dari satu baris:

- **`sequence()`** membagikan nilai bergiliran ke tiap model.
- **`recycle()`** memakai ulang model yang sudah ada untuk relasi. Tanpanya, `'user_id' => User::factory()` di `definition()` membuat pengguna baru untuk setiap tugas.

```php:line-numbers [tests/Feature/TaskFactoryTest.php]
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Priority;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskFactoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_state_sets_named_condition(): void
    {
        $task = Task::factory()->done()->create();

        $this->assertTrue($task->is_done);
    }

    public function test_sequence_alternates_values(): void
    {
        $tasks = Task::factory()
            ->count(4)
            ->sequence(['priority' => Priority::Low], ['priority' => Priority::High])
            ->create();

        $this->assertSame(['low', 'high', 'low', 'high'], $tasks->map(fn (Task $task): string => $task->priority->value)->all());
    }

    public function test_recycle_reuses_one_owner(): void
    {
        $user = User::factory()->create();

        Task::factory()->count(3)->recycle($user)->create();

        $this->assertDatabaseCount('users', 1);
        $this->assertSame(3, $user->tasks()->count());
    }
}
```

Di TypeScript, pola ini biasa ditulis sebagai *test data builder* buatan sendiri. Di Laravel builder-nya sudah jadi, dan Larastan tahu `Task::factory()->done()->create()` menghasilkan `Task`.

## Ganti dependency dengan fake lewat container

Layanan yang memanggil dunia luar, seperti gateway WhatsApp, tidak boleh benar-benar dipanggil saat test. Untuk HTTP client ada `Http::fake()` (lihat [Tips Laravel](/tips/laravel#larang-request-http-sungguhan-di-test)). Untuk layanan buatanmu sendiri, caranya: sembunyikan di balik interface, lalu tukar implementasinya di test. Persis seperti menerima `impl Trait` di Rust atau menyuntikkan interface di TypeScript.

Interface-nya. Atribut `#[Bind]` memberi tahu container implementasi mana yang dipakai kalau ada yang meminta `Messenger`, tanpa perlu menulis apa pun di service provider:

```php:line-numbers [app/Services/Messaging/Messenger.php]
<?php

declare(strict_types=1);

namespace App\Services\Messaging;

use App\Models\User;
use Illuminate\Container\Attributes\Bind;

// Pengirim pesan ke pengguna, misalnya lewat gateway WhatsApp
#[Bind(LogMessenger::class)]
interface Messenger
{
    /**
     * @throws MessengerException
     */
    public function send(User $user, string $message): void;
}
```

```php:line-numbers [app/Services/Messaging/MessengerException.php]
<?php

declare(strict_types=1);

namespace App\Services\Messaging;

use RuntimeException;

final class MessengerException extends RuntimeException {}
```

```php:line-numbers [app/Services/Messaging/LogMessenger.php]
<?php

declare(strict_types=1);

namespace App\Services\Messaging;

use App\Models\User;
use Illuminate\Support\Facades\Log;

// Implementasi sementara: pesan hanya ditulis ke log
final class LogMessenger implements Messenger
{
    public function send(User $user, string $message): void
    {
        Log::info("Pesan ke {$user->email}: {$message}");
    }
}
```

Layanan yang memakainya hanya mengenal interface:

```php:line-numbers [app/Services/TaskReminder.php]
<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Task;
use App\Services\Messaging\Messenger;
use App\Services\Messaging\MessengerException;
use LogicException;

final readonly class TaskReminder
{
    public function __construct(private Messenger $messenger) {}

    /**
     * Kirim pengingat untuk tugas yang belum selesai dan jatuh tempo besok.
     *
     * @return int jumlah pengingat yang terkirim
     */
    public function remindDueTomorrow(): int
    {
        $tasks = Task::query()
            ->open()
            ->whereDate('due_date', today()->addDay())
            ->with('user')
            ->get();

        $sent = 0;

        foreach ($tasks as $task) {
            // Kolom user_id tidak boleh null, tetapi Larastan mengetik relasinya User|null
            $owner = $task->user ?? throw new LogicException("Tugas {$task->id} tidak punya pemilik");

            try {
                $this->messenger->send($owner, "Besok tenggat: {$task->title}");
                $sent++;
            } catch (MessengerException $e) {
                // Satu pengiriman gagal tidak boleh menghentikan pengingat untuk pengguna lain
                report($e);
            }
        }

        return $sent;
    }
}
```

Tanpa baris `$owner`, Larastan menolak pemanggilan `send()`:

```text
  32     Parameter #1 $user of method App\Services\Messaging\Messenger::send()
         expects App\Models\User, App\Models\User|null given.
         🪪  argument.type
```

`?? throw` mempersempit tipenya ke `User` dalam satu baris, dan kalau suatu hari datanya memang rusak, kamu mendapat exception yang jelas, bukan `TypeError` di dalam `send()`. Scope `open()` berasal dari [Tips Laravel](/tips/laravel#scope-query-dengan-scope).

Fake-nya disimpan di `tests/Fakes`. Ia mencatat pesan yang "terkirim" dan bisa disuruh gagal untuk email tertentu:

```php:line-numbers [tests/Fakes/FakeMessenger.php]
<?php

declare(strict_types=1);

namespace Tests\Fakes;

use App\Models\User;
use App\Services\Messaging\Messenger;
use App\Services\Messaging\MessengerException;

final class FakeMessenger implements Messenger
{
    /** @var list<array{email: string, message: string}> */
    public array $sent = [];

    /** @var list<string> email yang pengirimannya dibuat gagal */
    public array $failFor = [];

    public function send(User $user, string $message): void
    {
        if (in_array($user->email, $this->failFor, true)) {
            throw new MessengerException("Gagal mengirim ke {$user->email}");
        }

        $this->sent[] = ['email' => $user->email, 'message' => $message];
    }
}
```

Di test, `$this->instance()` mendaftarkan fake itu ke container. Semua yang meminta `Messenger` setelahnya, termasuk constructor `TaskReminder`, menerima fake ini. Method itu dianotasi `@template`, jadi kembaliannya bertipe `FakeMessenger`, bukan `mixed`, dan bisa langsung disimpan di property bertipe:

```php:line-numbers [tests/Feature/TaskReminderTest.php]
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use App\Services\Messaging\Messenger;
use App\Services\Messaging\MessengerException;
use App\Services\TaskReminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Exceptions;
use Tests\Fakes\FakeMessenger;
use Tests\TestCase;

class TaskReminderTest extends TestCase
{
    use RefreshDatabase;

    private FakeMessenger $messenger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->freezeTime();
        $this->messenger = $this->instance(Messenger::class, new FakeMessenger);
    }

    public function test_reminds_open_tasks_due_tomorrow(): void
    {
        $user = User::factory()->create(['email' => 'siti@example.com']);
        Task::factory()->for($user)->dueTomorrow()->create(['title' => 'Bayar listrik']);
        Task::factory()->for($user)->dueTomorrow()->done()->create();
        Task::factory()->for($user)->create(['due_date' => today()->addDays(2)]);

        $sent = app(TaskReminder::class)->remindDueTomorrow();

        $this->assertSame(1, $sent);
        $this->assertSame(
            [['email' => 'siti@example.com', 'message' => 'Besok tenggat: Bayar listrik']],
            $this->messenger->sent,
        );
    }

    public function test_nothing_is_due_tomorrow_after_a_day_passes(): void
    {
        Task::factory()->dueTomorrow()->create();

        $this->travel(1)->day();

        $this->assertSame(0, app(TaskReminder::class)->remindDueTomorrow());
    }

    public function test_failed_message_is_reported_and_others_still_sent(): void
    {
        Exceptions::fake();
        $this->messenger->failFor = ['gagal@example.com'];

        Task::factory()->for(User::factory()->create(['email' => 'gagal@example.com']))->dueTomorrow()->create();
        Task::factory()->dueTomorrow()->create();

        $this->assertSame(1, app(TaskReminder::class)->remindDueTomorrow());

        Exceptions::assertReported(
            fn (MessengerException $e): bool => $e->getMessage() === 'Gagal mengirim ke gagal@example.com',
        );
    }
}
```

Test pertama memeriksa hasil, bukan cara kerja: tugas yang selesai dan yang tenggatnya lusa tidak mendapat pesan. Kalau gagal, PHPUnit menunjukkan selisih array-nya:

```text
   FAILED  Tests\Feature\TaskReminderTest > reminds open tasks due tomorrow
  Failed asserting that two arrays are identical.
   Array &0 [
       0 => Array &1 [
           'email' => 'siti@example.com',
  -        'message' => 'Besok tenggat: Bayar air',
  +        'message' => 'Besok tenggat: Bayar listrik',
       ],
   ]
```

## Fake buatan sendiri lawan Mockery

Laravel juga menyediakan Mockery lewat `$this->mock()`. Masalahnya, nama method di Mockery hanyalah string. Salah ketik berikut lolos Larastan level max tanpa satu pesan pun:

```php
        $this->mock(Messenger::class, function (MockInterface $mock): void {
            $mock->shouldReceive('sned')->once();
        });
```

Kesalahannya baru terlihat saat test dijalankan, dan pesannya menunjuk ke kode aplikasi, bukan ke salah ketiknya:

```text
1) Tests\Demo\MockDemoTest::test_with_mockery
Mockery\Exception\BadMethodCallException: Received Mockery_2_App_Services_Messaging_Messenger::send(), but no expectations were specified

/app/app/Services/TaskReminder.php:36
```

Salah ketik yang sama di fake yang mengimplementasikan interface langsung ditolak PHPStan, sebelum test dijalankan:

```text
  10     Non-abstract class Tests\Demo\TypoFake contains abstract method
         send() from interface App\Services\Messaging\Messenger.
         🪪  method.abstract (non-ignorable)
```

Fake juga ikut rusak saat interface berubah, misalnya parameter baru di `send()`, sehingga kamu dipaksa memperbaruinya. Mockery masih berguna untuk class pihak ketiga yang tidak punya interface, tetapi untuk kode milikmu sendiri, interface ditambah fake memberi pengecekan yang sama dengan Rust: kontraknya diperiksa compiler, bukan oleh nasib.

## Bekukan dan geser waktu

[Bab 10](/10-proyek/05-test) memakai `travelTo()` dengan tanggal tertentu. Kalau tanggalnya tidak penting, cukup bekukan waktu sekarang:

- **`$this->freezeTime()`** menghentikan jam di saat itu. `now()` dan `today()` mengembalikan nilai yang sama sampai test selesai, jadi test tidak bisa gagal hanya karena berjalan melewati tengah malam.
- **`$this->travel(1)->day()`** menggeser jam yang sudah beku. Tersedia juga `->hours()`, `->minutes()`, dan `->weeks()`, serta `$this->travelBack()` untuk kembali ke waktu nyata.

`TaskReminderTest` di atas memakai keduanya. Di `test_nothing_is_due_tomorrow_after_a_day_passes`, tugas yang tadinya jatuh tempo besok menjadi jatuh tempo hari ini setelah `travel(1)->day()`, sehingga tidak ada pengingat yang dikirim. Waktu kembali normal otomatis di akhir setiap test.

## Exception yang dilaporkan, bukan dilempar

`TaskReminder` menangkap `MessengerException` lalu memanggil `report($e)`, supaya satu pengiriman gagal tidak menghentikan pengingat untuk pengguna lain. Dari luar, method itu tidak melempar apa pun, jadi `expectException()` tidak bisa dipakai. Yang perlu dibuktikan adalah exception-nya **dilaporkan** ke log atau layanan pemantau error.

`Exceptions::fake()` mencatat semua yang masuk ke `report()`, dan `Exceptions::assertReported()` memeriksanya. Parameter closure-nya sekaligus menentukan class yang dicari: closure dengan parameter `MessengerException` hanya dicocokkan dengan exception class itu. Lihat test ketiga di `TaskReminderTest`.

Tanpa `Exceptions::fake()`, exception yang dilaporkan tetap ditulis ke log seperti biasa dan test tidak punya cara memeriksanya. Pasangannya, `Exceptions::assertNothingReported()`, berguna untuk membuktikan alur normal tidak diam-diam menelan error.

## Uji command Artisan dengan `$this->artisan()`

Command untuk menjalankan pengingat, misalnya dari scheduler setiap pagi:

```php:line-numbers [app/Console/Commands/RemindTasks.php]
<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\TaskReminder;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('tasks:remind')]
#[Description('Kirim pengingat untuk tugas yang jatuh tempo besok')]
class RemindTasks extends Command
{
    public function handle(TaskReminder $reminder): int
    {
        $sent = $reminder->remindDueTomorrow();

        $this->info("{$sent} pengingat terkirim.");

        return self::SUCCESS;
    }
}
```

Bab 10 menguji command lewat `Artisan::call()` lalu membaca `Artisan::output()`. `$this->artisan()` lebih ringkas karena harapan output dan exit code ditulis berantai. Tetapi tipe kembaliannya `PendingCommand|int`, sehingga rantai langsung `$this->artisan('tasks:remind')->expectsOutput(...)` ditolak di level max:

```text
  23     Cannot call method expectsOutput() on
         Illuminate\Testing\PendingCommand|int.
         🪪  method.nonObject
```

`int` hanya muncul kalau mocking output dimatikan dengan `withoutMockingConsoleOutput()`. `assertInstanceOf()` mempersempit tipenya, sama seperti `assertIsString()` di Bab 10:

```php:line-numbers [tests/Feature/RemindTasksCommandTest.php]
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Task;
use App\Services\Messaging\Messenger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\PendingCommand;
use Tests\Fakes\FakeMessenger;
use Tests\TestCase;

class RemindTasksCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_reports_number_of_reminders(): void
    {
        $this->instance(Messenger::class, new FakeMessenger);
        Task::factory()->count(2)->dueTomorrow()->create();

        $command = $this->artisan('tasks:remind');
        $this->assertInstanceOf(PendingCommand::class, $command);

        $command->expectsOutput('2 pengingat terkirim.')->assertSuccessful();
    }
}
```

Command-nya baru benar-benar dijalankan saat objek `PendingCommand` dibuang di akhir method, jadi semua harapan harus ditulis sebelum itu. Untuk command yang bertanya, tersedia juga `expectsQuestion()` dan `expectsConfirmation()`.

## Hasil semua test di halaman ini

```text
   PASS  Tests\Feature\RemindTasksCommandTest
  ✓ command reports number of reminders                                  5.23s

   PASS  Tests\Feature\TaskFactoryTest
  ✓ state sets named condition                                           0.15s
  ✓ sequence alternates values                                           0.15s
  ✓ recycle reuses one owner                                             0.17s

   PASS  Tests\Feature\TaskReminderTest
  ✓ reminds open tasks due tomorrow                                      0.15s
  ✓ nothing is due tomorrow after a day passes                           0.14s
  ✓ failed message is reported and others still sent                     0.22s

  Tests:    7 passed (12 assertions)
  Duration: 11.40s
```
