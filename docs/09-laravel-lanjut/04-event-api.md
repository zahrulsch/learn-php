# Event, queue, dan API

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

```php:line-numbers [app/Listeners/SendTaskCompletedMail.php]
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

```php:line-numbers [app/Mail/TaskCompletedMail.php]
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

```blade:line-numbers [resources/views/mail/task-completed.blade.php]
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

```php:line-numbers [app/Http/Resources/TaskResource.php]
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

```php:line-numbers [routes/api.php]
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
