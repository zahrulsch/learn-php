# 9. Laravel lanjut

Aplikasi tugas dari [Bab 8](/08-laravel-dasar) masih bisa dibuka siapa saja, dan setiap klik memuat ulang seluruh halaman. Di bab ini aplikasi itu mendapat akun pengguna, daftar yang interaktif dengan Livewire, email yang dikirim di latar belakang lewat queue, API bertoken, dan test otomatis. Bab ditutup dengan melihat lebih dalam cara Larastan menjaga tipe di tengah semua itu.

Lanjutkan di proyek `practice/laravel-basics`. Semua perintah `php artisan` dan `composer` tetap dijalankan dari shell container (`docker compose exec app bash`).

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

Kata sandi tidak di-hash secara eksplisit di sini. Model `User` bawaan skeleton punya cast `'password' => 'hashed'`, sehingga nilai yang masuk otomatis di-hash dengan bcrypt, algoritma yang sama dengan `password_hash` di [Bab 7](/07-web-tanpa-framework/). Tujuh karakter pertama kolom `password` setelah mendaftar:

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
- **`session()->regenerate()`** mengganti ID session, pertahanan terhadap session fixation yang kamu tulis manual di [Bab 7](/07-web-tanpa-framework/).
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
