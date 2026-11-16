# 9. Laravel lanjut

Aplikasi tugas dari [Bab 8](/08-laravel-dasar) masih bisa dibuka siapa saja, dan setiap klik memuat ulang seluruh halaman. Di bab ini aplikasi itu mendapat akun pengguna, daftar yang interaktif dengan Livewire, email yang dikirim di latar belakang lewat queue, API bertoken, dan test otomatis. Bab ditutup dengan melihat lebih dalam cara Larastan menjaga tipe di tengah semua itu.

Lanjutkan di proyek `latihan/laravel-dasar`. Semua perintah `php artisan` dan `composer` tetap dijalankan dari shell container (`docker compose exec app bash`).

## Autentikasi

Laravel punya *starter kit* yang menghasilkan halaman login siap pakai. Kita menulisnya sendiri, karena hanya butuh dua controller dan hasilnya seluruhnya kode yang kamu pahami dan yang lulus PHPStan level max.

Tabel `users` dan model `User` sudah ada di skeleton. Yang perlu dibuat adalah tiga alur: daftar, masuk, keluar.

### Validasi

Buat dua Form Request:

```bash
php artisan make:request RegisterRequest
php artisan make:request LoginRequest
```

`app/Http/Requests/RegisterRequest.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique(User::class)],
            'password' => ['required', 'confirmed', Password::defaults()],
        ];
    }
}
```

`confirmed` mewajibkan field `password_confirmation` berisi nilai yang sama. `Password::defaults()` menerapkan aturan kata sandi bawaan Laravel, yaitu minimal 8 karakter.

`app/Http/Requests/LoginRequest.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ];
    }
}
```

### Controller

```bash
php artisan make:controller RegisterController
php artisan make:controller LoginController
```

`app/Http/Controllers/RegisterController.php`:

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

        return to_route('tasks.index');
    }
}
```

Kata sandi tidak di-hash secara eksplisit di sini. Model `User` bawaan skeleton punya cast `'password' => 'hashed'`, sehingga nilai yang masuk otomatis di-hash dengan bcrypt, algoritma yang sama dengan `password_hash` di [Bab 7](/07-web-tanpa-framework). Tujuh karakter pertama kolom `password` setelah mendaftar:

```text
$2y$12$
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

        return redirect()->intended(route('tasks.index'));
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

Yang terjadi di tiap bagian:

- **`Auth::attempt()`** mencari pengguna berdasarkan email, lalu mencocokkan kata sandi dengan hash-nya. Kalau cocok, pengguna dicatat di session.
- **Pesan errornya sengaja samar.** "Email atau kata sandi salah" tidak membocorkan apakah sebuah email terdaftar.
- **`session()->regenerate()`** mengganti ID session, pertahanan terhadap session fixation yang kamu tulis manual di [Bab 7](/07-web-tanpa-framework).
- **`redirect()->intended()`** mengembalikan pengguna ke halaman yang tadi ia coba buka sebelum diminta login.
- **Saat keluar**, session dibuang dan token CSRF diganti.

### Route dan middleware

`routes/web.php` menjadi:

```php
<?php

declare(strict_types=1);

use App\Http\Controllers\LoginController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/tasks');

Route::middleware('guest')->group(function (): void {
    Route::get('/register', [RegisterController::class, 'create'])->name('register');
    Route::post('/register', [RegisterController::class, 'store']);
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store'])->middleware('throttle:5,1');
});

Route::middleware('auth')->group(function (): void {
    Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');
    Route::resource('tasks', TaskController::class)->except('show');
});
```

Tiga middleware bekerja di sini:

| Middleware | Fungsi |
|---|---|
| `auth` | Hanya pengguna yang sudah login. Tamu dialihkan ke route bernama `login`. |
| `guest` | Hanya tamu. Pengguna yang sudah login dialihkan keluar dari halaman login. |
| `throttle:5,1` | Paling banyak 5 percobaan per menit, pertahanan terhadap tebak-tebakan kata sandi. |

### View

Layout mendapat bilah navigasi berisi nama pengguna dan tombol keluar. `resources/views/components/layout.blade.php` menjadi:

```blade
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} - Tugas</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="bg-gray-50 text-gray-900">
    @auth
        <nav class="flex items-center justify-end gap-4 border-b bg-white p-3 text-sm">
            <span>{{ auth()->user()->name }}</span>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button type="submit" class="underline">Keluar</button>
            </form>
        </nav>
    @endauth

    <main class="mx-auto max-w-2xl p-6">
        <h1 class="mb-6 text-2xl font-semibold">{{ $title }}</h1>

        @if (session('status'))
            <p role="status" class="mb-4 rounded bg-green-100 p-3 text-green-800">{{ session('status') }}</p>
        @endif

        {{ $slot }}
    </main>
</body>
</html>
```

Keluar memakai form POST, bukan tautan. Tautan GET bisa dipicu situs lain lewat gambar atau prefetch; POST dilindungi token CSRF.

`resources/views/auth/login.blade.php`:

```blade
<x-layout title="Masuk">
    <form method="POST" action="{{ route('login') }}" class="space-y-4">
        @csrf

        <div>
            <label for="email" class="block font-medium">Email</label>
            <input id="email" name="email" type="email" value="{{ old('email') }}" required autofocus
                autocomplete="username" class="mt-1 w-full rounded border p-2">
            @error('email')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="password" class="block font-medium">Kata sandi</label>
            <input id="password" name="password" type="password" required autocomplete="current-password"
                class="mt-1 w-full rounded border p-2">
            @error('password')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <label class="flex items-center gap-2">
            <input type="checkbox" name="remember" value="1">
            Ingat saya
        </label>

        <div class="flex items-center gap-4">
            <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Masuk</button>
            <a href="{{ route('register') }}" class="underline">Belum punya akun?</a>
        </div>
    </form>
</x-layout>
```

`resources/views/auth/register.blade.php`:

```blade
<x-layout title="Daftar">
    <form method="POST" action="{{ route('register') }}" class="space-y-4">
        @csrf

        <div>
            <label for="name" class="block font-medium">Nama</label>
            <input id="name" name="name" type="text" value="{{ old('name') }}" required autofocus autocomplete="name"
                class="mt-1 w-full rounded border p-2">
            @error('name')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="email" class="block font-medium">Email</label>
            <input id="email" name="email" type="email" value="{{ old('email') }}" required autocomplete="username"
                class="mt-1 w-full rounded border p-2">
            @error('email')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="password" class="block font-medium">Kata sandi</label>
            <input id="password" name="password" type="password" required autocomplete="new-password"
                class="mt-1 w-full rounded border p-2">
            @error('password')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <div>
            <label for="password_confirmation" class="block font-medium">Ulangi kata sandi</label>
            <input id="password_confirmation" name="password_confirmation" type="password" required
                autocomplete="new-password" class="mt-1 w-full rounded border p-2">
        </div>

        <div class="flex items-center gap-4">
            <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Daftar</button>
            <a href="{{ route('login') }}" class="underline">Sudah punya akun?</a>
        </div>
    </form>
</x-layout>
```

Jangan dicoba dulu. Tugas belum punya pemilik, dan itu diurus di bagian berikutnya.

## Relasi dan kepemilikan

Setiap tugas harus dimiliki satu pengguna. Di database, itu berarti kolom `user_id` di tabel `tasks`.

### Migration baru

Migration yang sudah dijalankan tidak diubah lagi; perubahan skema selalu ditulis sebagai migration baru:

```bash
php artisan make:migration add_user_id_to_tasks_table
```

Isinya:

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
        Schema::table('tasks', function (Blueprint $table): void {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
```

`constrained()` membuat foreign key ke tabel `users`, dan `cascadeOnDelete()` menghapus tugas saat pemiliknya dihapus. Tugas lama dari [Bab 8](/08-laravel-dasar) tidak punya pemilik, jadi bangun ulang database:

```bash
php artisan migrate:fresh
```

### Relasi di model

Tambahkan method `tasks()` ke `app/Models/User.php`, beserta `use`-nya:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;

    /**
     * @return HasMany<Task, $this>
     */
    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }
```

Lalu `app/Models/Task.php` menjadi:

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Priority;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['title', 'priority', 'due_date', 'is_done'])]
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory;

    /**
     * Nilai awal untuk model baru yang belum disimpan.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'priority' => 'medium',
        'is_done' => false,
    ];

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
            'priority' => Priority::class,
            'due_date' => 'immutable_date',
            'is_done' => 'boolean',
        ];
    }
}
```

Trait `HasFactory` merujuk class `TaskFactory`, yang baru dipakai di bagian testing. Buat sekarang supaya `composer check` tetap lulus:

```bash
php artisan make:factory TaskFactory --model=Task
```

Isi `database/factories/TaskFactory.php`:

```php
<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\Priority;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    /**
     * @return array<model-property<Task>, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(3),
            'priority' => fake()->randomElement(Priority::cases()),
            'due_date' => null,
            'is_done' => false,
        ];
    }
}
```

PHPDoc `@return HasMany<Task, $this>` di model adalah generics dari [Bab 2](/02-type-system). Tanpa itu, level max menolak:

```text
  23     Method App\Models\User::tasks() return type with generic class
         Illuminate\Database\Eloquent\Relations\HasMany does not specify its
         types: TRelatedModel, TDeclaringModel
         🪪  missingType.generics
```

Dengan generics, Larastan tahu persis isi relasinya:

| Ekspresi | Tipe menurut Larastan |
|---|---|
| `$user->tasks` | `Collection<int, App\Models\Task>` |
| `$user->tasks()->findOrFail(1)` | `App\Models\Task` |
| `$task->user` | `App\Models\User\|null` |

`user_id` sengaja tidak masuk `#[Fillable]`. Pemilik tugas tidak boleh ditentukan oleh input form; ia ditetapkan lewat relasi, seperti di bawah.

### Pengguna yang sedang login

Ada beberapa cara mendapatkan pengguna yang login, dan tipenya menurut Larastan berbeda:

| Ekspresi | Tipe |
|---|---|
| `Auth::user()` | `App\Models\User\|null` |
| `$request->user()` | `App\Models\User\|null` |
| Parameter `#[CurrentUser] User $user` | `App\Models\User` |

Dua yang pertama mungkin `null` karena bisa dipanggil di halaman tamu. Memanggil method langsung di atasnya ditolak level max:

```text
  28     Cannot call method tasks() on App\Models\User|null.
```

Cara ketiga memakai attribute ([Bab 4](/04-oop)) pada parameter: Laravel menyuntikkan pengguna yang login, dan tipenya `User` tanpa `null`. Di belakang middleware `auth`, pengguna itu dijamin ada.

### Policy

Middleware `auth` hanya memastikan pengguna sudah login. Ia tidak mencegah Budi membuka `/tasks/7/edit` milik Cici. Aturan "siapa boleh apa terhadap model ini" ditulis di *policy*:

```bash
php artisan make:policy TaskPolicy --model=Task
```

Isi `app/Policies/TaskPolicy.php`:

```php
<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

class TaskPolicy
{
    public function update(User $user, Task $task): bool
    {
        return $task->user_id === $user->id;
    }

    public function delete(User $user, Task $task): bool
    {
        return $task->user_id === $user->id;
    }
}
```

Laravel menemukan policy ini lewat konvensi nama: model `Task`, policy `TaskPolicy`.

### Controller

`app/Http/Controllers/TaskController.php` menjadi:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\Priority;
use App\Http\Requests\TaskRequest;
use App\Models\Task;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\View;

class TaskController extends Controller
{
    public function index(#[CurrentUser] User $user): View
    {
        $tasks = $user->tasks()
            ->orderBy('is_done')
            ->orderBy('due_date')
            ->get();

        return view('tasks.index', ['tasks' => $tasks]);
    }

    public function create(): View
    {
        return view('tasks.create', ['task' => new Task, 'priorities' => Priority::cases()]);
    }

    public function store(TaskRequest $request, #[CurrentUser] User $user): RedirectResponse
    {
        $user->tasks()->create($request->validated());

        return to_route('tasks.index')->with('status', 'Tugas ditambahkan.');
    }

    public function edit(Task $task): View
    {
        Gate::authorize('update', $task);

        return view('tasks.edit', ['task' => $task, 'priorities' => Priority::cases()]);
    }

    public function update(TaskRequest $request, Task $task): RedirectResponse
    {
        Gate::authorize('update', $task);

        $task->update($request->validated());

        return to_route('tasks.index')->with('status', 'Tugas diperbarui.');
    }

    public function destroy(Task $task): RedirectResponse
    {
        Gate::authorize('delete', $task);

        $task->delete();

        return to_route('tasks.index')->with('status', 'Tugas dihapus.');
    }
}
```

Dua pola menjaga kepemilikan:

- **Lewat relasi.** `$user->tasks()` adalah query yang sudah dibatasi ke tugas milik pengguna itu, dan `->create()` di atasnya mengisi `user_id` secara otomatis.
- **Lewat policy.** `Gate::authorize('update', $task)` memanggil `TaskPolicy::update()`. Kalau hasilnya `false`, request dihentikan dengan 403.

### Coba

Rapikan, periksa, lalu coba di browser:

```bash
composer format
composer check
```

Alurnya, diamati dengan `curl` pada dua akun, Budi dan Cici:

| Aksi | Hasil |
|---|---|
| Tamu membuka `/tasks` | `302` ke `/login` |
| Daftar dengan kata sandi `123` | Ditolak: `The password field must be at least 8 characters.` |
| Daftar dengan data benar | `302` ke `/tasks`, langsung login |
| Membuka `/login` saat sudah login | `302` keluar dari halaman login |
| Masuk dengan kata sandi salah | Ditolak: `Email atau kata sandi salah.` |
| Cici membuka `/tasks` | Tidak melihat tugas Budi |
| Cici membuka `/tasks/1/edit` milik Budi | `403` |
| Cici mengirim DELETE ke `/tasks/1` | `403`, tugas Budi tetap ada |
| Percobaan login keenam dalam semenit | `429` |

## Livewire

Livewire membuat halaman interaktif tanpa kamu menulis JavaScript. Komponen ditulis sebagai class PHP dan template Blade; Livewire yang mengurus komunikasi dengan browser.

Posisinya di antara pilihan yang kamu kenal:

| Pendekatan | State hidup di | Yang kamu tulis |
|---|---|---|
| SPA (React) + API | Browser | Dua aplikasi: frontend dan API |
| Livewire | Server, dititipkan ke browser di antara request | Satu aplikasi PHP |
| HTML biasa (Bab 8) | Tidak ada | Satu aplikasi, tiap aksi memuat ulang halaman |

Yang paling mirip di luar PHP adalah Phoenix LiveView dan HTMX.

### Pasang

```bash
composer require livewire/livewire
```

Yang terpasang saat bab ini ditulis adalah Livewire 4.4. Jangan lupa menyegarkan `vendor/` untuk editor: `docker compose cp app:/app/vendor .` dari PowerShell.

### Kenapa class-based

Bawaan Livewire 4 adalah *single-file component*: class PHP anonim yang ditulis di dalam file Blade. Bentuk itu ringkas, tetapi file Blade berada di luar jangkauan PHPStan. Kita memakai bentuk *class-based*: class di `app/Livewire`, template di file terpisah. Dengan begitu logikanya ikut diperiksa di level max.

```bash
php artisan make:livewire TaskList --class
```

```text
   INFO  Livewire component [app/Livewire/TaskList.php] created successfully.
```

### Komponen

Isi `app/Livewire/TaskList.php`:

```php
<?php

declare(strict_types=1);

namespace App\Livewire;

use App\Enums\Priority;
use App\Events\TaskCompleted;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Validate;
use Livewire\Component;

class TaskList extends Component
{
    #[Validate('required|string|max:255')]
    public string $title = '';

    public Priority $priority = Priority::Medium;

    public bool $onlyOpen = false;

    public function add(): void
    {
        $this->validate();

        $this->user()->tasks()->create([
            'title' => $this->title,
            'priority' => $this->priority,
        ]);

        $this->reset('title', 'priority');
    }

    public function toggle(int $id): void
    {
        $task = $this->user()->tasks()->findOrFail($id);
        $task->update(['is_done' => ! $task->is_done]);

        if ($task->is_done) {
            TaskCompleted::dispatch($task);
        }
    }

    public function delete(int $id): void
    {
        $this->user()->tasks()->findOrFail($id)->delete();
    }

    public function render(): View
    {
        $query = $this->user()->tasks()->orderBy('is_done')->orderBy('due_date');

        if ($this->onlyOpen) {
            $query->where('is_done', false);
        }

        return view('livewire.task-list', [
            'tasks' => $query->get(),
            'priorities' => Priority::cases(),
        ]);
    }

    private function user(): User
    {
        return Auth::user() ?? abort(401);
    }
}
```

Cara membacanya:

- **Property `public`** adalah state komponen. Tipenya tipe PHP biasa, termasuk enum `Priority`.
- **Method `public`** adalah aksi yang bisa dipanggil dari browser.
- **`#[Validate]`** menempelkan aturan validasi pada property; `$this->validate()` menjalankannya.
- **`render()`** dipanggil setiap kali state berubah.
- **`user()`** mempersempit `User|null` menjadi `User`. `abort()` bertipe `never` ([Bab 2](/02-type-system)), jadi PHPStan tahu sisi kanan `??` tidak pernah menghasilkan nilai.

Class `TaskCompleted` dibuat di bagian queue. Supaya `composer check` tidak gagal sementara itu, buat sekarang:

```bash
php artisan make:event TaskCompleted
```

Isi `app/Events/TaskCompleted.php`:

```php
<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Task;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TaskCompleted
{
    use Dispatchable, SerializesModels;

    public function __construct(public Task $task) {}
}
```

### Template

Isi `resources/views/livewire/task-list.blade.php`:

```blade
<div>
    <form wire:submit="add" class="flex flex-wrap items-start gap-2">
        <div class="grow">
            <label for="new-title" class="sr-only">Judul tugas baru</label>
            <input id="new-title" type="text" wire:model="title" placeholder="Tugas baru"
                class="w-full rounded border p-2">
            @error('title')
                <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
            @enderror
        </div>

        <label for="new-priority" class="sr-only">Prioritas</label>
        <select id="new-priority" wire:model="priority" class="rounded border p-2">
            @foreach ($priorities as $option)
                <option value="{{ $option->value }}">{{ $option->label() }}</option>
            @endforeach
        </select>

        <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Tambah</button>
    </form>

    <label class="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" wire:model.live="onlyOpen">
        Hanya yang belum selesai
    </label>

    <ul class="mt-4 divide-y rounded border bg-white">
        @forelse ($tasks as $task)
            <li wire:key="task-{{ $task->id }}" class="flex items-center justify-between gap-4 p-3">
                <label class="flex items-center gap-3">
                    <input type="checkbox" wire:click="toggle({{ $task->id }})" @checked($task->is_done)>
                    <span>
                        <span @class(['font-medium', 'text-gray-400 line-through' => $task->is_done])>{{ $task->title }}</span>
                        <span class="block text-sm text-gray-500">
                            Prioritas {{ $task->priority->label() }}
                            @if ($task->due_date)
                                · tenggat {{ $task->due_date->format('d-m-Y') }}
                            @endif
                        </span>
                    </span>
                </label>
                <div class="flex gap-3 text-sm">
                    <a href="{{ route('tasks.edit', $task) }}" class="text-blue-700 underline">Ubah</a>
                    <button type="button" wire:click="delete({{ $task->id }})" wire:confirm="Hapus tugas ini?"
                        class="text-red-700 underline">Hapus</button>
                </div>
            </li>
        @empty
            <li class="p-3 text-gray-500">Belum ada tugas.</li>
        @endforelse
    </ul>
</div>
```

Attribute `wire:` menghubungkan HTML dengan class:

| Attribute | Fungsi |
|---|---|
| `wire:model="title"` | Mengikat input ke property `$title`. Nilainya dikirim bersama aksi berikutnya. |
| `wire:model.live="onlyOpen"` | Sama, tetapi langsung dikirim setiap kali berubah. |
| `wire:submit="add"` | Memanggil method `add()` saat form dikirim. |
| `wire:click="toggle(5)"` | Memanggil `toggle(5)` saat diklik. |
| `wire:confirm="..."` | Meminta konfirmasi sebelum aksi dijalankan. |
| `wire:key` | Identitas tiap baris, supaya pembaruan DOM tepat sasaran. Sama dengan `key` di React. |

Template komponen Livewire harus punya tepat satu elemen akar, di sini `<div>`.

Pasang komponennya di halaman. `resources/views/tasks/index.blade.php` menjadi:

```blade
<x-layout title="Daftar tugas">
    <livewire:task-list />

    <p class="mt-6 text-sm">
        <a href="{{ route('tasks.create') }}" class="underline">Tambah tugas dengan tenggat</a>
    </p>
</x-layout>
```

Dan method `index` di `TaskController` cukup merender halaman itu:

```php
    public function index(): View
    {
        return view('tasks.index');
    }
```

Buka `/tasks`. Menambah, mencentang, menyaring, dan menghapus tugas sekarang terjadi tanpa memuat ulang halaman.

### Apa yang sebenarnya terjadi

Tidak ada sihir di sisi jaringan. Saat kamu menekan Tambah, JavaScript Livewire mengirim satu request POST:

```text
POST http://localhost:8000/livewire-72f46623/update
kirim: [{"path":"","method":"add","params":[]}] updates={"title":"Dari browser","priority":"high"}
HTTP 200
state: {"title":"","priority":["medium",{"class":"App\\Enums\\Priority","s":"enm"}],"onlyOpen":false}
kunci snapshot: data, memo, checksum
kunci effects: returns, html
```

Output itu berasal dari script uji yang meniru request Livewire. Alamatnya memuat hash yang berbeda di tiap aplikasi. Urutannya:

1. **Halaman pertama** dirender di server seperti Blade biasa. Di dalam HTML-nya terselip *snapshot*: state komponen dalam bentuk JSON.
2. **Saat ada aksi**, browser mengirim snapshot itu kembali, ditambah perubahan input (`updates`) dan method yang dipanggil (`calls`).
3. **Server membangun ulang** objek komponen dari snapshot, menerapkan perubahan, menjalankan method, lalu merender ulang.
4. **Response** berisi snapshot baru dan HTML baru. JavaScript Livewire menambal bagian DOM yang berubah.

Model shared-nothing tetap berlaku: objek `TaskList` tidak hidup di memori server di antara request. State-nya dititipkan ke browser.

### Keamanan komponen

Karena state dititipkan ke browser, anggap semuanya input pengguna:

- **Snapshot ditandatangani** dengan `checksum`, jadi tidak bisa diubah diam-diam. Tetapi isinya terbaca. Jangan menaruh rahasia di property `public`.
- **`updates` adalah input**, sama seperti field form. Itu sebabnya `add()` memanggil `validate()`.
- **Parameter aksi adalah input.** Siapa pun bisa mengirim `toggle(999)`. Karena itu tugas selalu dicari lewat `$this->user()->tasks()`, bukan `Task::query()`.

Hasil memanggil `toggle` dengan id milik orang lain:

```text
HTTP 404
    "message": "No query results for model [App\\Models\\Task] 999",
```

## Event dan queue

Saat tugas ditandai selesai, aplikasi mengirim email. Mengirim email bisa makan waktu beberapa detik, dan pengguna tidak perlu menunggunya. Pekerjaan seperti itu ditaruh di *queue* dan dikerjakan proses lain.

Tiga potong yang terlibat:

| Potongan | Peran |
|---|---|
| Event `TaskCompleted` | Pengumuman bahwa sesuatu terjadi. Sudah dibuat di atas. |
| Listener `SendTaskCompletedMail` | Reaksi terhadap event itu, dijalankan lewat queue. |
| Mailable `TaskCompletedMail` | Isi emailnya. |

Event memisahkan "apa yang terjadi" dari "apa akibatnya". Komponen `TaskList` hanya mengumumkan; ia tidak tahu soal email.

### Listener

```bash
php artisan make:listener SendTaskCompletedMail --event=TaskCompleted --queued
```

Isi `app/Listeners/SendTaskCompletedMail.php`:

```php
<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\TaskCompleted;
use App\Mail\TaskCompletedMail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Mail;

class SendTaskCompletedMail implements ShouldQueue
{
    public function handle(TaskCompleted $event): void
    {
        Mail::to($event->task->user)->send(new TaskCompletedMail($event->task));
    }
}
```

Dua hal bekerja lewat tipe:

- **Tipe parameter `handle()`** menentukan event yang didengarkan. Laravel memindai folder `app/Listeners` dan mendaftarkannya sendiri.
- **Interface `ShouldQueue`** adalah penanda: listener ini tidak dijalankan langsung, melainkan dimasukkan ke queue.

### Email

```bash
php artisan make:mail TaskCompletedMail --markdown=mail.task-completed
```

Isi `app/Mail/TaskCompletedMail.php`:

```php
<?php

declare(strict_types=1);

namespace App\Mail;

use App\Models\Task;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TaskCompletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Task $task) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "Tugas selesai: {$this->task->title}");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.task-completed');
    }
}
```

Property `public` otomatis tersedia di template. Isi `resources/views/mail/task-completed.blade.php`:

```blade
<x-mail::message>
# Tugas selesai

Tugas **{{ $task->title }}** sudah kamu tandai selesai.

<x-mail::button :url="route('tasks.index')">
Lihat daftar tugas
</x-mail::button>
</x-mail::message>
```

### Menjalankan worker

Di `.env`, `QUEUE_CONNECTION=database` sudah menjadi nilai bawaan: antrean disimpan di tabel `jobs`. Centang satu tugas di browser, lalu lihat tabel itu:

```text
1 job, queue: default
```

Job itu menunggu sampai ada *worker* yang mengambilnya. Jalankan worker di shell container kedua:

```bash
php artisan queue:work --stop-when-empty
```

```text
  2026-11-16 08:08:02 App\Listeners\SendTaskCompletedMail ............ RUNNING
  2026-11-16 08:08:04 App\Listeners\SendTaskCompletedMail ............ 2s DONE
  2026-11-16 08:08:07 Worker STOPPED Queue empty
```

Di development, `MAIL_MAILER=log` membuat email ditulis ke `storage/logs/laravel.log`, tidak benar-benar dikirim:

```text
To: Budi <budi@example.com>
Subject: Tugas selesai: Dari browser
```

Dua cara menjalankan worker:

| Perintah | Perilaku |
|---|---|
| `php artisan queue:work` | Berjalan terus, menunggu job baru. Perlu dijalankan ulang setelah kode berubah. |
| `php artisan queue:work --stop-when-empty` | Mengerjakan semua job yang ada, lalu berhenti. |

Bentuk kedua penting untuk [Bab 12](/12-deploy): shared hosting tidak mengizinkan proses yang berjalan terus, jadi worker dijalankan berkala lewat cron.

Padanannya di dunia lain adalah BullMQ di Node atau Sidekiq di Ruby. Bedanya, Laravel bisa memakai database biasa sebagai antrean, tanpa Redis.

## API

Aplikasi yang sama bisa melayani JSON untuk klien lain. Laravel memisahkan route API dari route halaman, dan memakai paket Sanctum untuk autentikasi bertoken:

```bash
php artisan install:api --no-interaction
```

```text
   INFO  Published API routes file.
   INFO  Running migrations.
  2026_11_16_080103_create_personal_access_tokens_table ......... 71.50ms DONE
   INFO  API scaffolding installed. Please add the [Laravel\Sanctum\HasApiTokens] trait to your User model.
```

Output di atas dipotong. Ikuti petunjuk terakhirnya: di `app/Models/User.php`, tambahkan trait `HasApiTokens`.

```php
use Laravel\Sanctum\HasApiTokens;

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;
```

### Resource

Model tidak dikirim mentah-mentah sebagai JSON. *API Resource* menentukan bentuk keluarannya, sehingga perubahan kolom di database tidak diam-diam mengubah API:

```bash
php artisan make:resource TaskResource
```

Isi `app/Http/Resources/TaskResource.php`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'priority' => $this->priority->value,
            'due_date' => $this->due_date?->toDateString(),
            'is_done' => $this->is_done,
        ];
    }
}
```

`$this->title` di sini bukan property `TaskResource`; aksesnya diteruskan ke model yang dibungkus. PHPDoc `@mixin Task` memberi tahu PHPStan soal penerusan itu, sehingga `$this->priority` tetap bertipe `Priority`.

### Route

Ganti isi `routes/api.php`:

```php
<?php

declare(strict_types=1);

use App\Http\Resources\TaskResource;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/tasks', function (#[CurrentUser] User $user): AnonymousResourceCollection {
        return TaskResource::collection($user->tasks()->orderBy('id')->get());
    });
});
```

Semua route di file ini otomatis berawalan `/api`. Bedanya dengan `web.php`: tidak ada session, tidak ada CSRF. Identitas ditentukan token di setiap request.

### Mencoba

Tanpa token:

```bash
curl -s http://localhost:8000/api/tasks -H 'Accept: application/json'
```

```text
{"message":"Unauthenticated."}
```

Statusnya `401`. Buat token untuk pengguna pertama lewat tinker:

```text
> App\Models\User::query()->firstOrFail()->createToken('cli')->plainTextToken;
```

Token ditampilkan sekali saja, dalam bentuk `1|...` sepanjang 50 karakter. Yang disimpan di tabel `personal_access_tokens` adalah hash-nya, 64 karakter, sama seperti kata sandi yang tidak pernah disimpan apa adanya. Kirim token itu sebagai header:

```bash
curl -s http://localhost:8000/api/tasks -H 'Accept: application/json' -H "Authorization: Bearer $TOKEN"
```

```json
{"data":[{"id":1,"title":"Dari browser","priority":"high","due_date":null,"is_done":true}]}
```

## Testing

Laravel memakai PHPUnit dari [Bab 6](/06-ekosistem), ditambah alat untuk menguji aplikasi web: mengirim request palsu, login sebagai pengguna tertentu, dan memeriksa isi database.

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
