# Livewire

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

```php:line-numbers [app/Livewire/TaskList.php]
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

```php:line-numbers [app/Events/TaskCompleted.php]
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

```blade:line-numbers [resources/views/livewire/task-list.blade.php]
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

```blade:line-numbers [resources/views/tasks/index.blade.php]
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
