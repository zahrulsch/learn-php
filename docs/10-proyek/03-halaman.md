# Halaman dan route

## 5. Halaman pengeluaran

Inti aplikasi adalah satu komponen Livewire yang menampilkan ringkasan, form, dan daftar sekaligus.

```bash
php artisan make:livewire ExpenseManager --class
```

### Komponen

Isi `app/Livewire/ExpenseManager.php`:

```php:line-numbers [app/Livewire/ExpenseManager.php]
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

```blade:line-numbers [resources/views/livewire/expense-manager.blade.php]
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

```blade:line-numbers [resources/views/expenses.blade.php]
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

```php:line-numbers [app/Http/Controllers/TokenController.php]
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

```blade:line-numbers [resources/views/tokens.blade.php]
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

```blade:line-numbers [resources/views/components/layout.blade.php]
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

```php:line-numbers [routes/web.php]
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

Jalankan Vite dari PowerShell (`npm run dev`), lalu buka `http://localhost:8000`. Daftar, catat beberapa pengeluaran, ganti bulan, ubah, dan hapus. Yang terjadi di balik tombol Simpan, diamati dengan script uji seperti di [Bab 9](/09-laravel-lanjut/):

```text
kirim: [{"path":"","method":"save","params":[]}] updates={"amount":"25000","category":"transport","spentOn":"2026-11-15","note":"Ojek ke kantor"}
HTTP 200
state: {"month":"2026-11","amount":"","category":["food",{"class":"App\\Enums\\Category","s":"enm"}],"spentOn":"2026-11-16","note":"","editingId":null}
```

Form kembali kosong setelah disimpan, dan enum `Category` ikut dititipkan ke browser beserta nama class-nya. Menghapus id milik orang lain berakhir dengan `404`.
