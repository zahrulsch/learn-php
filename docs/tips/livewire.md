# Tips & trik Livewire

Kumpulan tip untuk komponen Livewire. Urutannya bebas, asalkan kamu sudah membaca [Bab 9](/09-laravel-lanjut/). Contohnya memakai model `Task` dan `TaskPolicy` dari bab itu.

Setiap potongan kode sudah dijalankan di Livewire 4.4 dan Laravel 13, serta lolos Larastan level max dan Pint. Hasil yang tampil berasal dari test PHPUnit. Untuk perilaku yang hanya terjadi di browser, hasilnya diukur di browser sungguhan yang menghitung request ke server.

## Koleksi model: pakai `#[Computed]`, bukan property `public`

Menaruh hasil query di property `public` terasa wajar, mirip menaruh data di state React. Masalahnya, Livewire tidak mengirim isi model ke browser, hanya id-nya. Setiap request, model di-query ulang berdasarkan id itu, sehingga daftarnya membeku pada id saat `mount()`.

```php [app/Livewire/TaskListNaive.php]
    /** @var Collection<int, Task> */
    public Collection $tasks;

    public function mount(): void
    {
        $user = Auth::user() ?? abort(401);
        $this->tasks = $user->tasks()->get();
    }
```

Isi snapshot yang dititipkan ke browser:

```text
{"tasks":[null,{"keys":[1,2],"class":"Illuminate\\Database\\Eloquent\\Collection","modelClass":"App\\Models\\Task","s":"elcln"}]}
```

Tugas yang dibuat setelah komponen dimuat tidak pernah muncul, walaupun komponennya dirender ulang:

```php [tests/Feature/LivewireTipsTest.php]
        $component = Livewire::actingAs($user)->test(TaskListNaive::class);
        Task::factory()->for($user)->create(['title' => 'Baru']);
        $component->call('$refresh');

        $component->assertSee('Lama');
        $component->assertDontSee('Baru');
```

Gantinya adalah method dengan `#[Computed]`. Hasilnya dihitung ulang setiap request dan tidak ikut masuk snapshot:

```php [app/Livewire/TaskList.php]
    /**
     * @return Collection<int, Task>
     */
    #[Computed]
    public function tasks(): Collection
    {
        $query = $this->user()->tasks()->orderBy('is_done');

        if ($this->search !== '') {
            $query->where('title', 'like', "%{$this->search}%");
        }

        if ($this->onlyOpen) {
            $query->where('is_done', false);
        }

        return $query->get();
    }
```

```blade [resources/views/livewire/task-list.blade.php]
    <ul>
        @foreach ($this->tasks as $task)
            <li wire:key="task-{{ $task->id }}">
                {{ $task->title }}
                <button type="button" wire:click="delete({{ $task->id }})">Hapus</button>
            </li>
        @endforeach
    </ul>

    <p>{{ $this->tasks->count() }} tugas</p>
```

Snapshot-nya tinggal berisi filter:

```text
{"search":"","onlyOpen":false}
```

Di dalam satu request hasilnya disimpan, jadi `$this->tasks` yang dipanggil dua kali di template tetap hanya menjalankan satu query. Padanannya di React adalah `useMemo`. Kalau hasilnya mahal dan boleh agak basi, `#[Computed(persist: true)]` menyimpannya di cache antar-request selama satu jam.

## Buktikan `#[Locked]` dengan test

[Bab 10](/10-proyek/03-halaman) memakai `#[Locked]` untuk `$editingId`. Tanpa attribute itu, siapa pun bisa mengganti nilai property lewat DevTools, karena browser memang mengirim perubahan property bersama setiap request. Daripada percaya begitu saja, kunci perilakunya dengan test.

```php [app/Livewire/EditTask.php]
    #[Locked]
    public int $taskId;

    public string $title = '';

    public function mount(int $taskId): void
    {
        $this->taskId = $this->user()->tasks()->findOrFail($taskId)->id;
    }
```

`set()` di test menempuh jalur yang sama dengan perubahan dari browser:

```php [tests/Feature/LivewireTipsTest.php]
    public function test_locked_task_id_cannot_be_changed_from_browser(): void
    {
        $user = User::factory()->create();
        $task = Task::factory()->for($user)->create();

        $component = Livewire::actingAs($user)->test(EditTask::class, ['taskId' => $task->id]);

        $this->expectException(CannotUpdateLockedPropertyException::class);
        $component->set('taskId', 999);
    }
```

Dengan `#[Locked]`, percobaan itu ditolak dengan pesan `Cannot update locked property: [taskId]`. Kalau attribute-nya dihapus, test ini gagal:

```text
  Failed asserting that exception of type "Livewire\Features\SupportLockedProperties\CannotUpdateLockedPropertyException" is thrown.
```

Ini lapis kedua. Lapis pertama tetap mencari data lewat relasi, seperti `$this->user()->tasks()->findOrFail()` di `save()`.

## Otorisasi aksi dengan `#[Authorize]`

Livewire 4 bisa menjalankan policy sebelum sebuah aksi dijalankan. Parameter aksi yang bertipe model diisi dari id yang dikirim browser, seperti route model binding. `'task'` di attribute merujuk ke parameter itu.

```php [app/Livewire/TaskList.php]
    #[Authorize('delete', 'task')]
    public function delete(Task $task): void
    {
        $task->delete();
    }
```

`TaskPolicy::delete()` dari [Bab 9](/09-laravel-lanjut/02-relasi) dipanggil lebih dulu. Mengirim id tugas milik orang lain menghasilkan HTTP 403, dan id yang tidak ada menghasilkan 404:

```php [tests/Feature/LivewireTipsTest.php]
        $component = Livewire::actingAs(User::factory()->create())->test(TaskList::class);
        $component->call('delete', $task->id);

        $component->assertForbidden();
        $this->assertModelExists($task);
```

Bedanya dengan cara di Bab 9, yang mencari lewat `$this->user()->tasks()->findOrFail($id)`: aturan pemiliknya tinggal di satu tempat, yaitu policy, dan dipakai bersama controller. Harganya, 403 memberi tahu bahwa id itu ada. Kalau keberadaan data pun rahasia, cara Bab 9 yang selalu menjawab 404 lebih tepat.

## Form object untuk form yang besar

Kalau satu komponen punya banyak field, pindahkan field, aturan validasi, dan cara menyimpannya ke class turunan `Livewire\Form`. Komponennya jadi ringkas, dan form yang sama bisa dipakai komponen lain.

```php:line-numbers [app/Livewire/Forms/TaskForm.php]
<?php

declare(strict_types=1);

namespace App\Livewire\Forms;

use App\Enums\Priority;
use App\Models\Task;
use App\Models\User;
use Livewire\Attributes\Validate;
use Livewire\Form;

class TaskForm extends Form
{
    #[Validate('required|string|max:255')]
    public string $title = '';

    #[Validate('required')]
    public Priority $priority = Priority::Medium;

    #[Validate('nullable|date|after_or_equal:today')]
    public ?string $dueDate = null;

    public function store(User $user): Task
    {
        $this->validate();

        $task = $user->tasks()->create([
            'title' => $this->title,
            'priority' => $this->priority,
            'due_date' => $this->dueDate,
        ]);

        $this->reset();

        return $task;
    }
}
```

```php [app/Livewire/CreateTask.php]
    public TaskForm $form;

    public function save(): void
    {
        $this->form->store(Auth::user() ?? abort(401));

        $this->dispatch('task-created');
    }
```

Di template dan di test, field-nya diberi awalan nama property-nya:

```blade [resources/views/livewire/create-task.blade.php]
<form wire:submit="save">
    <input type="text" wire:model="form.title">
    @error('form.title') <p>{{ $message }}</p> @enderror
```

```php [tests/Feature/LivewireTipsTest.php]
        $component = Livewire::actingAs(User::factory()->create())->test(CreateTask::class);
        $component->set('form.title', '')->set('form.dueDate', '2000-01-01')->call('save');

        $component->assertHasErrors(['form.title' => 'required', 'form.dueDate' => 'after_or_equal']);
```

`assertHasErrors()` dengan array juga memeriksa aturan mana yang gagal, bukan hanya field-nya.

## Event antar komponen: `dispatch()` dan `#[On]`

`CreateTask` di atas mengumumkan `task-created`. Komponen lain yang perlu tahu cukup mendengarkannya. Kalau `#[On]` dipasang di class, bukan di method, komponen itu cukup dirender ulang saat event datang. Karena `tasks()` memakai `#[Computed]`, render ulang berarti query ulang.

```php [app/Livewire/TaskList.php]
#[On('task-created')]
class TaskList extends Component
```

```php [tests/Feature/LivewireTipsTest.php]
        $form = Livewire::actingAs($user)->test(CreateTask::class);
        $form->set('form.title', 'Beli kopi')->call('save');
        $form->assertDispatched('task-created');

        $list->dispatch('task-created');
        $list->assertSee('Beli kopi');
        $list->assertSee('1 tugas');
```

Event bisa juga dipicu dari JavaScript lewat `Livewire.dispatch()`, lengkap dengan parameter apa pun. Kalau listener-mu menerima parameter, perlakukan parameter itu seperti parameter aksi: input dari luar yang harus diperiksa.

## Filter di URL dengan `#[Url]`

Filter yang tersimpan di URL bisa dibagikan dan tetap bertahan saat halaman dimuat ulang. Cukup tambahkan attribute di property-nya:

```php [app/Livewire/TaskList.php]
    #[Url(as: 'q', except: '')]
    public string $search = '';

    #[Url]
    public bool $onlyOpen = false;
```

`as` mengganti nama parameter di URL menjadi `?q=`, dan `except` membuatnya tidak ditulis selama nilainya kosong. Di test, parameter URL diisi lewat `Livewire::withQueryParams()`. Di level max, method itu bertipe `mixed` seperti assertion Livewire di Bab 9, jadi panggil terpisah:

```php [tests/Feature/LivewireTipsTest.php]
        Livewire::withQueryParams(['q' => 'kopi', 'onlyOpen' => '1']);
        $component = Livewire::actingAs($user)->test(TaskList::class);

        $component->assertSet('search', 'kopi');
        $component->assertSet('onlyOpen', true);
        $component->assertSee('1 tugas');
```

Ingat bahwa URL adalah input. Livewire mengubah nilainya ke tipe property, tetapi tidak memvalidasinya. Hasil percobaan:

| Property | Query string | Nilai yang diterima |
|---|---|---|
| `bool $onlyOpen` | `?onlyOpen=abc` | `true` |
| `bool $onlyOpen` | `?onlyOpen=` | `false` |
| `int $page` | `?page=-1` | `-1` |
| `int $page` | `?page=2.7` | `2` |
| `int $page` | `?page=abc` | nilai bawaan |

Tipe property menjamin bentuknya, bukan rentangnya. Halaman `-1` tetap harus kamu tolak sendiri, misalnya dengan `max(1, $this->page)` sebelum dipakai.

## Komponen lambat: `#[Lazy]` dan placeholder

Komponen yang menjalankan query berat tidak perlu menahan seluruh halaman. Dengan `#[Lazy]`, halaman dikirim dulu bersama placeholder, lalu komponennya dimuat begitu terlihat di layar.

```php:line-numbers [app/Livewire/TaskStats.php]
<?php

declare(strict_types=1);

namespace App\Livewire;

use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Lazy;
use Livewire\Component;

#[Lazy]
class TaskStats extends Component
{
    public function placeholder(): string
    {
        return '<p>Menghitung statistik...</p>';
    }

    public function render(): View
    {
        $tasks = (Auth::user() ?? abort(401))->tasks();

        return view('livewire.task-stats', [
            'done' => (clone $tasks)->where('is_done', true)->count(),
            'total' => $tasks->count(),
        ]);
    }
}
```

HTML awal halaman hanya berisi placeholder dengan atribut `x-intersect`, yang meminta isi komponen saat elemen itu masuk layar. `clone` diperlukan karena `where()` mengubah query builder di tempat; tanpa itu, `total` ikut tersaring.

Jebakannya ada di test. `Livewire::test()` ikut merender placeholder, jadi test yang memeriksa isi komponen gagal dengan HTML yang hanya berisi `Menghitung statistik...`. Matikan lazy loading untuk test itu:

```php [tests/Feature/LivewireTipsTest.php]
        Livewire::withoutLazyLoading();
        $component = Livewire::actingAs($user)->test(TaskStats::class);

        $component->assertSee('1 dari 2 tugas selesai');
```

Untuk memastikan halaman benar-benar mengirim placeholder dulu, uji lewat HTTP biasa:

```php [tests/Feature/LivewireTipsTest.php]
        $this->actingAs(User::factory()->create())
            ->get('/stats')
            ->assertSee('Menghitung statistik...')
            ->assertDontSee('tugas selesai');
```

## Value object sebagai property: `Wireable`

Property `public` hanya boleh bertipe yang Livewire tahu cara menitipkannya ke browser, misalnya skalar, array, enum, model, koleksi, dan tanggal. Value object buatanmu sendiri ditolak:

```text
Property type not supported in Livewire for property: [{"amount":500000}]
```

Supaya tetap bisa memakai tipe yang tepat, implementasikan `Livewire\Wireable`. Isinya dua method: mengubah objek menjadi array, dan sebaliknya.

```php:line-numbers [app/Support/Money.php]
<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;
use Livewire\Wireable;

final readonly class Money implements Wireable
{
    public function __construct(public int $amount) {}

    public function add(int $amount): self
    {
        return new self($this->amount + $amount);
    }

    public function format(): string
    {
        return 'Rp '.number_format($this->amount, 0, ',', '.');
    }

    /**
     * @return array{amount: int}
     */
    public function toLivewire(): array
    {
        return ['amount' => $this->amount];
    }

    public static function fromLivewire(mixed $value): self
    {
        if (! is_array($value) || ! is_int($value['amount'] ?? null)) {
            throw new InvalidArgumentException('Data Money dari snapshot tidak valid');
        }

        return new self($value['amount']);
    }
}
```

```php [app/Livewire/Budget.php]
    public Money $limit;

    public function mount(): void
    {
        $this->limit = new Money(500_000);
    }

    public function raise(): void
    {
        $this->limit = $this->limit->add(100_000);
    }
```

Dua kali `raise()` menghasilkan `Rp 700.000`. Snapshot sudah ditandatangani, jadi pemeriksaan di `fromLivewire()` bukan pertahanan dari pengguna. Pemeriksaan itu ada untuk PHPStan: `$value` bertipe `mixed`, dan harus dipersempit menjadi `array{amount: int}` sebelum dipakai. Padanannya di Rust adalah mengimplementasikan `Serialize` dan `Deserialize` sendiri.

## `wire:model` di Livewire 4: modifier setelah `.live` menentukan kapan request dikirim

Di Livewire 4, modifier yang ditulis setelah `.live` mengatur kapan request dikirim. Modifier yang ditulis tanpa `.live` hanya berlaku di browser. Ini mudah tertukar kalau kamu pernah memakai Livewire 3.

```blade
<input wire:model.blur="plainBlur">
<input wire:model.live.blur="liveBlur">
<input wire:model.live.debounce.400ms="search">
<p>{{ $plainBlur }}|{{ $liveBlur }}|{{ $search }}</p>
```

Hasil pengukuran di browser: tiap input diketik lalu ditinggalkan, kolom `search` diketik huruf demi huruf, dan teks server adalah isi `<p>` setelah respons terakhir.

```text
wire:model.blur               -> 0 request, teks server "||"
wire:model.live.blur          -> 0 request saat mengetik, 1 setelah blur, teks server "abc|xyz|"
wire:model.live.debounce.400ms -> 1 request untuk 9 huruf, teks server "abc|xyz|kopi susu"
```

- **`wire:model.blur`** hanya menyalin nilai ke state di browser saat input ditinggalkan, tanpa request. Nilai `abc` baru sampai ke server bersama request berikutnya.
- **`wire:model.live.blur`** mengirim request saat input ditinggalkan. Pilihan yang tepat untuk validasi per field.
- **`wire:model.live.debounce.400ms`** menunggu pengguna berhenti mengetik. Tanpa angka, `.live` pada input teks memakai debounce 150 ms.

## Penanda loading: `data-loading` dan `wire:loading`

Selama request berjalan, Livewire 4 memasang atribut `data-loading` pada elemen yang memicunya. Elemen itu bisa diberi gaya langsung dengan CSS, tanpa directive tambahan:

```css
button[data-loading] {
    opacity: 0.5;
}
```

Untuk indikator di tempat lain, `wire:loading` tetap tersedia. Pasangkan dengan `wire:target` supaya indikatornya hanya muncul untuk aksi tertentu:

```blade
<button type="button" wire:click="slow">Lambat</button>
<span wire:loading wire:target="slow">Memproses...</span>
```

Keadaan tombol dan indikator setelah tombol diklik, diukur di browser. Aksi `slow()` sengaja dibuat lambat dengan `usleep()`:

```text
sebelum klik: {"dataLoading":null,"wireLoading":"none"}
+50ms POST terkirim=0 {"dataLoading":null,"wireLoading":"none"}
+300ms POST terkirim=1 {"dataLoading":"true","wireLoading":"inline-block"}
+1000ms POST terkirim=1 {"dataLoading":"true","wireLoading":"inline-block"}
+3000ms POST terkirim=1 {"dataLoading":"true","wireLoading":"inline-block"}
+6000ms POST terkirim=1 {"dataLoading":null,"wireLoading":"none"}
```

Keduanya hilang begitu respons datang. Ini mirip state `isPending` di React, bedanya kamu tidak perlu menyimpannya sendiri.

## Hasil semua test di halaman ini

```text
   PASS  Tests\Feature\LivewireTipsTest
  ✓ public collection misses tasks added later                           5.55s
  ✓ locked task id cannot be changed from browser                        0.21s
  ✓ authorize attribute rejects task of another user                     0.34s
  ✓ owner can delete task                                                0.16s
  ✓ form object validates nested fields                                  0.25s
  ✓ created task is announced and list refreshes                         0.21s
  ✓ filters are read from query string                                   0.14s
  ✓ lazy component renders placeholder first                             0.28s
  ✓ lazy component content                                               0.15s
  ✓ wireable value object survives round trip                            0.17s

  Tests:    10 passed (23 assertions)
  Duration: 11.80s
```
