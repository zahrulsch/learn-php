# Relasi dan kepemilikan

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
