# Testing dan Larastan

## Testing

Laravel memakai PHPUnit dari [Bab 6](/06-ekosistem/), ditambah alat untuk menguji aplikasi web: mengirim request palsu, login sebagai pengguna tertentu, dan memeriksa isi database.

### Persiapan

Tiga hal disiapkan dulu. Pertama, hapus `tests/Feature/ExampleTest.php`; test itu menguji halaman `/` yang sekarang berupa redirect.

Kedua, `tests/TestCase.php` menjadi:

```php
<?php

declare(strict_types=1);

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Test tidak bergantung pada hasil build aset
        $this->withoutVite();
    }
}
```

Ketiga, factory. `TaskFactory` yang kamu tulis di bagian relasi membuat model berisi data acak yang masuk akal, supaya tiap test cukup menyebut field yang penting baginya. Baris `'user_id' => User::factory()` di dalamnya berarti setiap tugas buatan factory otomatis mendapat pemilik baru, kecuali test menentukan lain.

Test tidak menyentuh MySQL. File `phpunit.xml` bawaan skeleton mengarahkannya ke SQLite di memori, dan trait `RefreshDatabase` membangun skema dari migration untuk tiap test class. Database development-mu aman.

### Menguji halaman

Buat `tests/Feature/AuthTest.php`:

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
        $this->get('/tasks')->assertRedirect('/login');
    }

    public function test_user_can_register(): void
    {
        $response = $this->post('/register', [
            'name' => 'Budi',
            'email' => 'budi@example.com',
            'password' => 'rahasia-sekali',
            'password_confirmation' => 'rahasia-sekali',
        ]);

        $response->assertRedirect('/tasks');
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

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect('/tasks');
        $this->assertAuthenticatedAs($user);

        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
    }
}
```

`$this->get()` dan `$this->post()` tidak membuka koneksi jaringan. Request dibuat di memori dan dilewatkan ke aplikasi, lengkap dengan middleware, lalu response-nya bisa diperiksa. Middleware CSRF otomatis dilewati saat test berjalan.

Buat `tests/Feature/TaskTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_creates_task_for_current_user(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/tasks', [
            'title' => 'Belajar testing',
            'priority' => 'high',
            'due_date' => '2030-01-31',
            'is_done' => '0',
        ]);

        $response->assertRedirect('/tasks');
        $this->assertDatabaseHas('tasks', ['user_id' => $user->id, 'title' => 'Belajar testing', 'priority' => 'high']);
    }

    public function test_store_rejects_invalid_priority(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/tasks', ['title' => 'x', 'priority' => 'urgent', 'is_done' => '0']);

        $response->assertSessionHasErrors('priority');
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_user_cannot_update_task_of_another_user(): void
    {
        $task = Task::factory()->create(['title' => 'Milik orang lain']);
        $intruder = User::factory()->create();

        $response = $this->actingAs($intruder)->put("/tasks/{$task->id}", [
            'title' => 'Dibajak',
            'priority' => 'low',
            'is_done' => '1',
        ]);

        $response->assertForbidden();
        $this->assertSame('Milik orang lain', $task->refresh()->title);
    }
}
```

`actingAs($user)` membuat request berikutnya dianggap datang dari pengguna itu. Test terakhir adalah yang paling berharga: ia membuktikan policy benar-benar menolak, dan akan gagal kalau suatu hari `Gate::authorize` terhapus.

### Menguji komponen Livewire

Buat `tests/Feature/TaskListTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Enums\Priority;
use App\Events\TaskCompleted;
use App\Livewire\TaskList;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Livewire\Livewire;
use Tests\TestCase;

class TaskListTest extends TestCase
{
    use RefreshDatabase;

    public function test_page_shows_only_own_tasks(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['title' => 'Punyaku']);
        Task::factory()->create(['title' => 'Punya orang']);

        $this->actingAs($user)->get('/tasks')
            ->assertOk()
            ->assertSee('Punyaku')
            ->assertDontSee('Punya orang');
    }

    public function test_add_creates_task_and_resets_form(): void
    {
        $user = User::factory()->create();

        $component = Livewire::actingAs($user)->test(TaskList::class);
        $component->set('title', 'Dari Livewire')->set('priority', Priority::High)->call('add');

        $component->assertHasNoErrors();
        $component->assertSet('title', '');
        $component->assertSee('Dari Livewire');
        $this->assertDatabaseHas('tasks', ['user_id' => $user->id, 'title' => 'Dari Livewire', 'priority' => 'high']);
    }

    public function test_add_requires_title(): void
    {
        $component = Livewire::actingAs(User::factory()->create())->test(TaskList::class);
        $component->call('add');

        $component->assertHasErrors('title');
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_toggle_marks_done_and_dispatches_event(): void
    {
        Event::fake([TaskCompleted::class]);
        $task = Task::factory()->create();

        Livewire::actingAs($task->user()->firstOrFail())->test(TaskList::class)->call('toggle', $task->id);

        $this->assertTrue($task->refresh()->is_done);
        Event::assertDispatched(TaskCompleted::class, fn (TaskCompleted $event): bool => $event->task->is($task));
    }

    public function test_cannot_toggle_task_of_another_user(): void
    {
        $task = Task::factory()->create();

        $component = Livewire::actingAs(User::factory()->create())->test(TaskList::class);
        $component->call('toggle', $task->id);

        $component->assertStatus(404);
        $this->assertFalse($task->refresh()->is_done);
    }
}
```

`Livewire::test()` menjalankan komponen tanpa browser: `set()` mengisi property, `call()` memanggil aksi. `Event::fake()` mencegah event benar-benar diproses, sambil mencatatnya supaya bisa diperiksa.

Assertion Livewire sengaja dipanggil satu per satu. Dokumentasinya merangkai semuanya dalam satu rantai, tetapi method assertion Livewire tidak mendeklarasikan tipe kembalian, jadi di level max hasilnya `mixed`:

```text
  44     Cannot call method assertSet() on mixed.
         🪪  method.nonObject
```

Ini akibat yang wajar dari level max: library yang tidak menulis tipe membuatmu menulis kode yang sedikit lebih panjang.

### Menguji listener dan API

Buat `tests/Feature/TaskCompletedTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Events\TaskCompleted;
use App\Listeners\SendTaskCompletedMail;
use App\Mail\TaskCompletedMail;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class TaskCompletedTest extends TestCase
{
    use RefreshDatabase;

    public function test_listener_sends_mail_to_task_owner(): void
    {
        Mail::fake();
        $task = Task::factory()->create();
        $owner = $task->user()->firstOrFail();

        (new SendTaskCompletedMail)->handle(new TaskCompleted($task));

        Mail::assertSent(
            TaskCompletedMail::class,
            fn (TaskCompletedMail $mail): bool => $mail->hasTo($owner->email) && $mail->task->is($task),
        );
    }
}
```

Dan `tests/Feature/TaskApiTest.php`:

```php
<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TaskApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_requires_token(): void
    {
        $this->getJson('/api/tasks')->assertUnauthorized();
    }

    public function test_api_returns_only_own_tasks(): void
    {
        $user = User::factory()->create();
        Task::factory()->for($user)->create(['title' => 'Punyaku', 'priority' => 'high']);
        Task::factory()->create(['title' => 'Punya orang']);

        Sanctum::actingAs($user);

        $this->getJson('/api/tasks')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Punyaku')
            ->assertJsonPath('data.0.priority', 'high')
            ->assertJsonPath('data.0.is_done', false);
    }
}
```

### Jalankan

```bash
composer format
composer check
composer test
```

```text
   PASS  Tests\Feature\AuthTest
  ✓ guest is redirected to login                                         0.36s
  ✓ user can register                                                    0.13s
  ✓ login fails with wrong password                                      0.32s
  ✓ user can login and logout                                            0.10s

   PASS  Tests\Feature\TaskApiTest
  ✓ api requires token                                                   0.11s
  ✓ api returns only own tasks                                           0.13s

   PASS  Tests\Feature\TaskCompletedTest
  ✓ listener sends mail to task owner                                    0.11s

   PASS  Tests\Feature\TaskListTest
  ✓ page shows only own tasks                                            0.45s
  ✓ add creates task and resets form                                     0.24s
  ✓ add requires title                                                   0.20s
  ✓ toggle marks done and dispatches event                               0.14s
  ✓ cannot toggle task of another user                                   0.20s

   PASS  Tests\Feature\TaskTest
  ✓ store creates task for current user                                  0.14s
  ✓ store rejects invalid priority                                       0.13s
  ✓ user cannot update task of another user                              0.16s

  Tests:    15 passed (47 assertions)
  Duration: 3.11s
```

Ketiga langkah alur kerja sekarang lengkap di proyek Laravel: format, check, test. `composer test` menjalankan `php artisan test`, pembungkus PHPUnit dengan tampilan yang lebih mudah dibaca.

## Larastan lebih dalam

Sepanjang bab ini Larastan beberapa kali menolak kode. Polanya layak dirangkum, karena akan terus berulang.

### Yang dipahami Larastan

| Sihir Laravel | Yang dilakukan Larastan |
|---|---|
| Property model dari kolom tabel | Membaca migration dan `casts()` |
| Relasi sebagai property (`$user->tasks`) | Membaca generics di method relasi |
| Facade (`Auth::user()`, `Route::get()`) | Memetakan ke class aslinya |
| Helper (`view()`, `auth()`, `abort()`) | Memberi tipe kembalian yang tepat, termasuk `never` |
| `Auth::user()` | Menghasilkan `User\|null` sesuai konfigurasi auth, bukan interface umum |
| Nama kolom di `where()` | Memeriksanya terhadap model (`checkModelProperties`) |

### Yang harus kamu bantu

| Situasi | Yang kamu tulis |
|---|---|
| Method relasi | `@return HasMany<Task, $this>` |
| Trait generik | `/** @use HasFactory<TaskFactory> */` |
| Factory | `@extends Factory<Task>` dan `array<model-property<Task>, mixed>` |
| API Resource | `@mixin Task` |
| Nilai yang mungkin `null` | Persempit dengan `??`, `?->`, atau `#[CurrentUser]` |
| File hasil `artisan make:` | Tambahkan tipe kembalian yang belum ada, misalnya `render(): View` |

### Yang tetap `mixed`

Beberapa hal memang tidak bisa diketahui secara statis, dan level max memaksamu menanganinya:

- **`config('app.name')`** bertipe `mixed`, karena isi konfigurasi baru diketahui saat runtime.
- **`$request->validated()`** bertipe `array<string, mixed>`.
- **Library tanpa tipe**, seperti method assertion Livewire.

Dan yang sama sekali tidak diperiksa: template Blade. Di situlah test mengambil alih.

::: tip Kalau terpaksa mengabaikan
PHPStan punya komentar `@phpstan-ignore` dan file *baseline* untuk membungkam error. Keduanya berguna saat memigrasikan proyek lama, tetapi di proyek baru keduanya menyembunyikan masalah yang semestinya diperbaiki. Materi ini tidak memakai satu pun.
:::

## Ringkasan

- **Autentikasi** hanya butuh `Auth::attempt()`, regenerasi session, dan middleware `auth`, `guest`, serta `throttle`.
- **Kepemilikan** dijaga dua cara: query lewat relasi (`$user->tasks()`) dan policy (`Gate::authorize`).
- **Livewire** adalah class PHP yang state-nya dititipkan ke browser. Property dan parameter aksi adalah input pengguna.
- **Event** mengumumkan, **listener** bereaksi, dan `ShouldQueue` memindahkan reaksinya ke **queue** yang dikerjakan worker.
- **API** memakai Sanctum untuk token dan Resource untuk bentuk JSON.
- **Test** berjalan di SQLite dalam memori, dengan factory untuk data dan `actingAs` untuk login.
- **Larastan** memahami sebagian besar sihir Laravel; sisanya kamu bantu dengan generics di PHPDoc.

## Latihan

### 1. Hapus semua yang selesai

Tambahkan tombol "Hapus yang selesai" ke komponen `TaskList`. Tulis juga test yang membuktikan tugas selesai milik pengguna lain tidak ikut terhapus.

::: details Jawaban
Method baru di `TaskList`:

```php
    public function clearDone(): void
    {
        $this->user()->tasks()->where('is_done', true)->delete();
    }
```

Tombolnya di template:

```blade
<button type="button" wire:click="clearDone" wire:confirm="Hapus semua tugas yang selesai?"
    class="mt-4 text-sm text-red-700 underline">Hapus yang selesai</button>
```

Test-nya, di `TaskListTest`:

```php
    public function test_clear_done_removes_only_own_finished_tasks(): void
    {
        $user = User::factory()->create();
        $done = Task::factory()->for($user)->create(['is_done' => true]);
        $open = Task::factory()->for($user)->create();
        $foreign = Task::factory()->create(['is_done' => true]);

        Livewire::actingAs($user)->test(TaskList::class)->call('clearDone');

        $this->assertModelMissing($done);
        $this->assertModelExists($open);
        $this->assertModelExists($foreign);
    }
```

Kuncinya tetap sama: mulai dari `$this->user()->tasks()`, bukan `Task::query()`.
:::

### 2. Test untuk hapus lewat controller

Route `DELETE /tasks/{task}` masih ada dan dijaga policy. Tulis dua test: pemilik bisa menghapus, pengguna lain mendapat 403.

::: details Jawaban
Di `TaskTest`:

```php
    public function test_owner_can_delete_task(): void
    {
        $task = Task::factory()->create();

        $this->actingAs($task->user()->firstOrFail())->delete("/tasks/{$task->id}")->assertRedirect('/tasks');

        $this->assertModelMissing($task);
    }

    public function test_other_user_cannot_delete_task(): void
    {
        $task = Task::factory()->create();

        $this->actingAs(User::factory()->create())->delete("/tasks/{$task->id}")->assertForbidden();

        $this->assertModelExists($task);
    }
```

`$task->user()->firstOrFail()` dipakai, bukan `$task->user`, karena tipe property relasi itu `User|null` dan `actingAs()` tidak menerima `null`.
:::

### 3. Job yang gagal

Buat listener `SendTaskCompletedMail` melempar exception di baris pertama `handle()`. Centang satu tugas, jalankan `php artisan queue:work --stop-when-empty --tries=1`, lalu cari tahu ke mana job itu pergi dan bagaimana menjalankannya lagi setelah listener diperbaiki.

::: details Jawaban
Worker mencatat job itu gagal:

```text
  2026-11-16 08:09:13 App\Listeners\SendTaskCompletedMail ............ RUNNING
  2026-11-16 08:09:13 App\Listeners\SendTaskCompletedMail ....... 23.27ms FAIL
```

Job yang gagal dipindahkan ke tabel `failed_jobs`, tidak hilang:

```bash
php artisan queue:failed
```

```text
  2026-11-16 08:09:13 4d78fed6-0aca-4b78-95b8-0dd0fa16939f  database@default App\Listeners\SendTaskCompletedMail
```

Setelah listener diperbaiki, kembalikan ke antrean dan jalankan worker lagi:

```bash
php artisan queue:retry all
php artisan queue:work --stop-when-empty
```

```text
  2026-11-16 08:09:17 App\Listeners\SendTaskCompletedMail ............ RUNNING
  2026-11-16 08:09:17 App\Listeners\SendTaskCompletedMail ...... 248.59ms DONE
```

Inilah nilai tambah queue dibanding mengirim email langsung di dalam request: kegagalan sementara, seperti server email yang mati, bisa diulang tanpa pengguna terlibat.
:::
