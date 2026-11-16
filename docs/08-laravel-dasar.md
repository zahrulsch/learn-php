# 8. Laravel dasar

Di [Bab 7](/07-web-tanpa-framework/) kamu menulis sendiri front controller, router, pembacaan input, validasi, akses database, template, dan token CSRF. Laravel adalah versi matang dari semua itu dalam satu framework. Di bab ini kamu membangun aplikasi kecil pengelola tugas dengan fitur tambah, ubah, dan hapus, sambil mengenal bagian inti Laravel: routing, controller, migration, Eloquent, Blade, Vite, dan validation.

Dua hal dari bab-bab sebelumnya tetap berlaku: semuanya berjalan di Docker, dan semua kode lulus PHPStan level max.

## Peta: dari Bab 7 ke Laravel

| Yang kamu tulis sendiri di Bab 7 | Padanannya di Laravel |
|---|---|
| Front controller di `public/index.php` | `public/index.php` dan `bootstrap/app.php` |
| Router | `routes/web.php` |
| Membaca input dari superglobal | Class `Request` |
| Validasi manual | Form Request dan validation rule |
| PDO dan pemetaan baris ke objek | Eloquent |
| Skema tabel dalam file SQL | Migration |
| Template PHP dan escaping manual | Blade |
| Token CSRF buatan sendiri | Middleware bawaan dan `@csrf` |

Dibanding dunia yang kamu kenal, Laravel adalah framework "serba ada" seperti Rails atau Django. Di Rust, kamu biasanya merakit sendiri Axum, SQLx, dan Askama. Di TypeScript, yang paling mirip adalah AdonisJS atau NestJS ditambah Prisma.

Harga dari serba ada itu adalah banyaknya "sihir": method yang tidak pernah ditulis di class-nya, property yang muncul dari kolom tabel. PHPStan polos tidak paham sihir itu, jadi kita memakai **Larastan**, ekstensi PHPStan untuk Laravel.

## Buat proyek

Laravel dibuat dengan `composer create-project`. PHP tidak ada di mesinmu, jadi jalankan Composer dari image resminya. Dari PowerShell, di dalam folder `practice`:

```powershell
docker run --rm -v "${PWD}:/app" -w /app composer:2 create-project laravel/laravel laravel-basics
cd laravel-basics
```

Perintah itu mengunduh skeleton Laravel beserta semua dependency-nya, lalu menjalankan beberapa langkah awal:

```text
> @php artisan key:generate --ansi

   INFO  Application key set successfully.

> @php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
> @php artisan migrate --graceful --ansi
```

::: warning Hapus `AGENTS.md` dan `CLAUDE.md` bawaan skeleton
Skeleton Laravel 13 menyertakan dua file instruksi untuk AI agent. Isinya menyuruh agent memasang PHP langsung di mesinmu, berlawanan dengan cara kerja kita. Kalau kamu memakai AI agent di folder ini, hapus atau sesuaikan dulu kedua file itu.
:::

### Container

Buat `Dockerfile` di folder proyek. Bedanya dengan [Bab 1](/01-setup) hanya ekstensi `pdo_mysql`:

```dockerfile
FROM php:8.5-cli

# unzip dipakai Composer, pdo_mysql dipakai Laravel untuk terhubung ke MySQL
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_mysql

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
```

Lalu `compose.yaml`:

```yaml:line-numbers [compose.yaml]
services:
  app:
    build: .
    volumes:
      - .:/app
      - vendor:/app/vendor
    ports:
      - "8000:8000"
    command: php artisan serve --host=0.0.0.0 --port=8000
    depends_on:
      mysql:
        condition: service_healthy

  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: laravel
      MYSQL_USER: laravel
      MYSQL_PASSWORD: secret
      MYSQL_ROOT_PASSWORD: secret
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      # 127.0.0.1 memaksa TCP, supaya baru dianggap sehat setelah inisialisasi selesai
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
      interval: 5s
      retries: 20

volumes:
  mysql-data:
  vendor:
```

Tiga hal yang perlu dijelaskan:

- **`php artisan serve`** menjalankan server development bawaan PHP, yang sudah kamu pakai di [Bab 7](/07-web-tanpa-framework/). `artisan` adalah CLI Laravel, perannya seperti `cargo` untuk tugas-tugas proyek.
- **Service `mysql`** dipakai karena shared hosting yang menjadi target deploy kita menyediakan MySQL. Development memakai database yang sama dengan production.
- **Volume `vendor`** menaruh folder `vendor/` di dalam filesystem Linux milik Docker, bukan di folder Windows yang di-mount.

Volume `vendor` itu soal kecepatan. Laravel memuat ratusan file dari `vendor/` di setiap request, dan akses file dari container ke folder Windows lambat. Di mesin yang dipakai menguji materi ini, satu request butuh 2,6 sampai 5,5 detik tanpa volume itu, dan 0,1 sampai 0,2 detik dengannya.

Konsekuensinya ada dua salinan `vendor/`:

| Salinan | Lokasi | Dipakai oleh |
|---|---|---|
| Volume `vendor` | Di dalam Docker | Aplikasi, `artisan`, PHPStan, test |
| Folder `vendor/` di Windows | Folder proyek | Editor saja (autocomplete) |

Salinan di Windows tidak ikut berubah saat kamu memasang paket dari dalam container. Setiap selesai memasang paket baru, segarkan dari PowerShell:

```powershell
docker compose cp app:/app/vendor .
```

### Database dan jalankan

Buka `.env` dan arahkan koneksi database ke service `mysql`:

```ini
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=laravel
DB_USERNAME=laravel
DB_PASSWORD=secret
```

`.env` adalah tempat semua pengaturan yang berbeda per lingkungan. File ini tidak masuk Git, dan di [Bab 12](/12-deploy) server production akan punya `.env` sendiri.

Isi volume `vendor`, lalu nyalakan semuanya:

```powershell
docker compose run --rm app composer install
docker compose up -d
docker compose exec app bash
```

Perintah terakhir membawamu ke shell di dalam container `app`. Seperti di [Bab 1](/01-setup), semua perintah `php`, `composer`, dan `vendor/bin/...` dijalankan dari shell itu. Buat tabel-tabel bawaan Laravel di MySQL:

```bash
php artisan migrate
```

```text
   INFO  Preparing database.

  Creating migration table ..................................... 102.23ms DONE

   INFO  Running migrations.

  0001_01_01_000000_create_users_table ......................... 180.82ms DONE
  0001_01_01_000001_create_cache_table .......................... 78.04ms DONE
  0001_01_01_000002_create_jobs_table .......................... 141.00ms DONE
```

Buka `http://localhost:8000`. Halaman sambutan Laravel seharusnya tampil. Versi yang terpasang saat bab ini ditulis:

```bash
php artisan --version
```

```text
Laravel Framework 13.42.0
```

## Struktur folder

| Folder | Isi |
|---|---|
| `app/` | Kode aplikasimu: model, controller, dan lainnya. Namespace `App\` lewat PSR-4. |
| `bootstrap/` | `app.php`, tempat aplikasi dirakit: routing, middleware, penanganan exception. |
| `config/` | Konfigurasi, satu file per topik. Nilainya dibaca dari `.env`. |
| `database/` | Migration, factory, dan seeder. |
| `public/` | Document root. Hanya folder ini yang boleh terlihat dari web. |
| `resources/` | View Blade, CSS, dan JavaScript sebelum di-build. |
| `routes/` | Daftar route: `web.php` untuk halaman, `console.php` untuk perintah dan jadwal. |
| `storage/` | File yang ditulis aplikasi saat berjalan: log, cache, session, view hasil kompilasi. |
| `tests/` | Test PHPUnit. |
| `vendor/` | Dependency dari Composer. |

`public/` sebagai document root adalah pola front controller dari [Bab 7](/07-web-tanpa-framework/), dan akan menjadi pokok bahasan saat deploy di [Bab 12](/12-deploy).

## Menjaga tipe: Pint dan Larastan

Alur kerja dari [Bab 6](/06-ekosistem/) tetap sama: format, check, test. Skeleton sudah punya script `composer test`; dua lainnya kita siapkan sekarang.

### Format

Pint sudah terpasang di skeleton dan memakai preset `laravel`, seperti disebut di [Bab 6](/06-ekosistem/). Satu hal kurang: skeleton tidak memakai `declare(strict_types=1);`, dan perintah `artisan make:...` menghasilkan file tanpa baris itu. Daripada menambahkannya dengan tangan, tambahkan satu rule ke preset itu. Buat `pint.json`:

```json [pint.json]
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true
    }
}
```

Tambahkan script `format` ke bagian `scripts` di `composer.json`:

```json [composer.json]
"format": "pint",
```

```bash
composer format
```

```text
  ✓ bootstrap/app.php       declare_strict_types, blank_line_after_opening_tag
  ✓ config/app.php          declare_strict_types, blank_line_after_opening_tag
  ✓ routes/web.php          declare_strict_types, blank_line_after_opening_tag
```

Output di atas dipotong: Pint menambahkan baris itu ke semua file PHP skeleton. Mulai sekarang, jalankan `composer format` setiap selesai membuat file baru.

### Check

Sekarang Larastan:

```bash
composer require --dev larastan/larastan
```

Composer memasang Larastan 3.15 beserta PHPStan 2.3. Buat `phpstan.neon`:

```yaml:line-numbers [phpstan.neon]
includes:
    - vendor/larastan/larastan/extension.neon

parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - app
        - bootstrap/app.php
        - database
        - routes
        - tests
    parseModelCastsMethod: true
    checkModelProperties: true
```

`level` dan `checkBenevolentUnionTypes` sama dengan proyek PHP-mu sejak [Bab 2](/02-type-system). Dua opsi terakhir khusus Larastan dan tidak aktif secara bawaan:

- **`parseModelCastsMethod`** membuat Larastan membaca method `casts()` di model, sehingga tipe property mengikuti cast-nya.
- **`checkModelProperties`** memeriksa bahwa nama kolom yang kamu tulis di query benar-benar ada di model.

Tambahkan script `check` ke `composer.json`, di sebelah `format`:

```json [composer.json]
"check": "phpstan analyse --memory-limit=1G",
```

Batas memori bawaan PHP adalah 128 MB, dan itu tidak cukup untuk menganalisis aplikasi Laravel. Tanpa opsi `--memory-limit`, proyek sebesar [Bab 10](/10-proyek/) berhenti dengan pesan ini:

```text
     Child process error: PHPStan process crashed because it reached
     configured PHP memory limit: 128M
     Increase your memory limit in php.ini or run PHPStan with --memory-limit
     CLI option.
```

Lalu jalankan `composer check`. Skeleton hampir lulus level max; Larastan hanya melaporkan dua hal. Yang pertama adalah test contoh yang tidak menguji apa pun:

```text
 ------ ----------------------------------------------------------------------
  Line   tests/Unit/ExampleTest.php
 ------ ----------------------------------------------------------------------
  16     Call to method PHPUnit\Framework\Assert::assertTrue() with true will
         always evaluate to true.
         🪪  method.alreadyNarrowedType
 ------ ----------------------------------------------------------------------
```

Hapus file `tests/Unit/ExampleTest.php`. Yang kedua muncul karena `checkModelProperties`:

```text
 ------ -----------------------------------------------------------------------
  Line   database/factories/UserFactory.php
 ------ -----------------------------------------------------------------------
  27     Return type (array<string, mixed>) of method Database\Factories\UserF
         actory::definition() should be compatible with return type (array<mod
         el property of App\Models\User, mixed>) of method Illuminate\Database
         \Eloquent\Factories\Factory<App\Models\User>::definition()
         🪪  method.childReturnType
 ------ -----------------------------------------------------------------------
```

Di `database/factories/UserFactory.php`, ganti PHPDoc method `definition()`:

```php:line-numbers [database/factories/UserFactory.php]
     * @return array<model-property<User>, mixed>
```

`model-property<User>` adalah tipe PHPDoc dari Larastan yang berarti "nama salah satu kolom model `User`". Padanannya di TypeScript adalah `keyof User`. Setelah dua perbaikan itu:

```text
 [OK] No errors
```

## Perjalanan satu request

Setiap request ke aplikasi Laravel melewati jalur yang sama:

1. **`public/index.php`** menerima request. Ini front controller.
2. **`bootstrap/app.php`** merakit aplikasi.
3. **Middleware** dijalankan berurutan: membuka session, memeriksa token CSRF, memangkas spasi input, dan lainnya.
4. **Router** mencocokkan URL dengan daftar di `routes/web.php`.
5. **Controller** menjalankan logika dan mengembalikan response.
6. **Response** berjalan balik melewati middleware, lalu dikirim ke browser.

Model shared-nothing dari [Bab 7](/07-web-tanpa-framework/) tidak berubah. Seluruh rangkaian itu dibangun dari nol di setiap request, lalu dibuang. Tidak ada state di memori yang bertahan antar-request seperti di server Axum atau Express.

Middleware adalah lapisan yang membungkus handler, sama dengan `tower::Layer` di Axum atau middleware di Express.

## Routing

Route didaftarkan di `routes/web.php`. Bentuk paling sederhana adalah closure. Ganti isi file itu:

```php:line-numbers [routes/web.php]
<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

Route::get('/hello/{name}', function (string $name): string {
    return "Halo, {$name}!";
});
```

`{name}` adalah parameter route, diteruskan ke closure sebagai argumen. Coba dari shell container:

```bash
curl http://localhost:8000/hello/Budi
```

```text
Halo, Budi!
```

`Route` adalah sebuah *facade*: class dengan method static yang sebenarnya meneruskan panggilan ke sebuah objek di dalam framework. Method `get` tidak ditulis di class `Route`. Ini contoh pertama sihir Laravel yang dipahami Larastan, tetapi tidak dipahami PHPStan polos.

Untuk aplikasi sungguhan, closure diganti controller. Sebelum itu, kita butuh datanya.

## Migration

Migration adalah skema database yang ditulis sebagai kode PHP dan dijalankan berurutan, sama dengan migration di SQLx atau Prisma Migrate. Buat model beserta migration-nya:

```bash
php artisan make:model Task -m
```

```text
   INFO  Model [app/Models/Task.php] created successfully.

   INFO  Migration [database/migrations/2026_11_16_074723_create_tasks_table.php] created successfully.
```

Nama file migration diawali tanggal dan jam pembuatannya, jadi milikmu akan berbeda. Nama class, tabel, dan kolom ditulis dalam bahasa Inggris, karena konvensi Laravel bergantung padanya: model `Task` otomatis dipetakan ke tabel `tasks`. Teks yang dilihat pengguna tetap berbahasa Indonesia.

Isi file migration itu:

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
        Schema::create('tasks', function (Blueprint $table): void {
            $table->id();
            $table->string('title');
            $table->string('priority')->default('medium');
            $table->date('due_date')->nullable();
            $table->boolean('is_done')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
```

`up()` menerapkan perubahan, `down()` membatalkannya. `$table->id()` membuat primary key auto-increment, dan `$table->timestamps()` membuat kolom `created_at` dan `updated_at` yang diisi Laravel secara otomatis.

```bash
php artisan migrate
```

```text
   INFO  Running migrations.

  2026_11_16_074723_create_tasks_table .......................... 29.29ms DONE
```

Perintah yang akan sering kamu pakai:

| Perintah | Fungsi |
|---|---|
| `php artisan migrate` | Menjalankan migration yang belum dijalankan |
| `php artisan migrate:status` | Menampilkan migration mana yang sudah dijalankan |
| `php artisan migrate:rollback` | Membatalkan kelompok migration terakhir |
| `php artisan migrate:fresh` | Menghapus semua tabel, lalu menjalankan semuanya dari awal |

::: warning `migrate:fresh` menghapus data
Perintah itu membuang seluruh isi database. Aman di development, jangan pernah dijalankan di production.
:::

## Eloquent

Eloquent adalah ORM Laravel dengan pola *Active Record*: satu objek model mewakili satu baris tabel, dan objek itu sendiri yang tahu cara menyimpan dirinya. Ini berbeda dari SQLx, yang memetakan hasil query ke struct pasif, dan dari Prisma, yang memakai client terpisah.

### Enum untuk prioritas

Kolom `priority` berisi string, tetapi di kode kita ingin enum dari [Bab 2](/02-type-system). Buat `app/Enums/Priority.php`:

```php:line-numbers [app/Enums/Priority.php]
<?php

declare(strict_types=1);

namespace App\Enums;

enum Priority: string
{
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';

    public function label(): string
    {
        return match ($this) {
            self::Low => 'Rendah',
            self::Medium => 'Sedang',
            self::High => 'Tinggi',
        };
    }
}
```

### Model

Ganti isi `app/Models/Task.php`:

```php:line-numbers [app/Models/Task.php]
<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\Priority;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['title', 'priority', 'due_date', 'is_done'])]
class Task extends Model
{
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

Class ini tidak mendeklarasikan satu property pun untuk kolomnya. Tiga bagiannya:

- **`#[Fillable]`** adalah attribute ([Bab 4](/04-oop)) yang mendaftar kolom yang boleh diisi sekaligus lewat array. Kolom di luar daftar itu diabaikan, sehingga input pengguna tidak bisa mengisi kolom yang tidak kamu maksudkan.
- **`$attributes`** memberi nilai awal pada model baru, supaya `new Task` langsung punya prioritas.
- **`casts()`** mengubah nilai mentah dari database menjadi tipe PHP: string menjadi enum `Priority`, tanggal menjadi objek `CarbonImmutable`, dan angka 0 atau 1 menjadi `bool`.

### Tipe property dari mana?

`$task->title` bukan property sungguhan. Eloquent menyediakannya lewat method ajaib `__get`, hal yang di [Bab 4](/04-oop) disarankan untuk dihindari karena mengalahkan analisis statis. Larastan menutup celah itu: ia membaca file migration dan method `casts()`, lalu menyimpulkan tipe tiap property. Hasil `\PHPStan\dumpType()` untuk model di atas:

| Ekspresi | Tipe menurut Larastan |
|---|---|
| `$task->title` | `string` |
| `$task->priority` | `App\Enums\Priority` |
| `$task->due_date` | `Carbon\CarbonImmutable\|null` |
| `$task->is_done` | `bool` |
| `Task::query()->get()` | `Illuminate\Database\Eloquent\Collection<int, App\Models\Task>` |
| `Task::query()->find(1)` | `App\Models\Task\|null` |

Property yang tidak ada ikut tertangkap:

```text
  46     Access to an undefined property App\Models\Task::$name.
         🪪  property.notFound
```

Cara kerjanya mirip Prisma, yang menghasilkan tipe dari file skema. Bedanya, tidak ada langkah generate: Larastan membaca migration setiap kali analisis berjalan.

### Mencoba di tinker

`php artisan tinker` adalah REPL yang sudah memuat aplikasimu. Jalankan, lalu coba:

```text
> $task = App\Models\Task::create(['title' => 'Coba tinker', 'priority' => 'high']);

> $task->priority;

= App\Enums\Priority {#8620
    +name: "High",
    +value: "high",
  }

> $task->is_done;

= false

> App\Models\Task::query()->where('priority', 'high')->count();

= 1

> $task->update(['is_done' => true]);

= true

> App\Models\Task::query()->where('is_done', true)->pluck('title');

= Illuminate\Support\Collection {#8133
    all: [
      "Coba tinker",
    ],
  }

> $task->delete();

= true
```

String `'high'` masuk sebagai teks dan keluar sebagai enum, berkat cast. Ketik `exit` untuk keluar.

### Query

Semua query dimulai dari `Task::query()`, yang mengembalikan query builder:

```php
$tasks = Task::query()
    ->where('is_done', false)
    ->orderBy('due_date')
    ->get();
```

Query builder menyusun SQL dengan parameter terikat, jadi aman dari SQL injection seperti prepared statement di [Bab 7](/07-web-tanpa-framework/). Untuk melihat SQL yang dihasilkan, ganti `get()` dengan `toRawSql()`:

```text
select * from `tasks` where `is_done` = 0 order by `due_date` asc
```

::: tip Pakai `Task::query()`, bukan `Task::where()`
Kamu akan sering melihat `Task::where(...)` di tutorial. Itu jalan, tetapi `where` bukan method static milik `Task`: panggilannya diteruskan lewat `__callStatic`. `Task::query()` adalah method sungguhan, sehingga editor dan PHPStan mengikuti alurnya tanpa bantuan.
:::

Dengan `checkModelProperties`, salah ketik nama kolom di `where()` tertangkap sebelum kode dijalankan. Contoh untuk `where('titel', 'x')`:

```text
  41     Parameter #1 $column of method Illuminate\Database\Eloquent\Builder<A
         pp\Models\Task>::where() expects array<int|model property of App\Mode
         ls\Task, mixed>|(Closure(Illuminate\Database\Query\Builder): mixed)|I
         lluminate\Contracts\Database\Query\Expression|model property of
         App\Models\Task, 'titel' given.
         🪪  argument.type
         💡  Type #4 from the union: The given string should be a property of
         App\Models\Task, titel given.
```

## Controller

Controller adalah class yang method-nya menangani request. Buat:

```bash
php artisan make:controller TaskController
```

Isi `app/Http/Controllers/TaskController.php`:

```php:line-numbers [app/Http/Controllers/TaskController.php]
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\Priority;
use App\Http\Requests\TaskRequest;
use App\Models\Task;
use Illuminate\Http\RedirectResponse;
use Illuminate\View\View;

class TaskController extends Controller
{
    public function index(): View
    {
        $tasks = Task::query()
            ->orderBy('is_done')
            ->orderBy('due_date')
            ->get();

        return view('tasks.index', ['tasks' => $tasks]);
    }

    public function create(): View
    {
        return view('tasks.create', ['task' => new Task, 'priorities' => Priority::cases()]);
    }

    public function store(TaskRequest $request): RedirectResponse
    {
        Task::create($request->validated());

        return to_route('tasks.index')->with('status', 'Tugas ditambahkan.');
    }

    public function edit(Task $task): View
    {
        return view('tasks.edit', ['task' => $task, 'priorities' => Priority::cases()]);
    }

    public function update(TaskRequest $request, Task $task): RedirectResponse
    {
        $task->update($request->validated());

        return to_route('tasks.index')->with('status', 'Tugas diperbarui.');
    }

    public function destroy(Task $task): RedirectResponse
    {
        $task->delete();

        return to_route('tasks.index')->with('status', 'Tugas dihapus.');
    }
}
```

Class `TaskRequest` belum ada; kita buat di bagian validation. Yang perlu diperhatikan di sini:

- **Tipe parameter menentukan apa yang kamu terima.** Laravel membaca tipe parameter method, lalu menyediakan objeknya. Ini *dependency injection* dari [Bab 4](/04-oop), dikerjakan framework. Padanannya di Axum adalah extractor.
- **`Task $task`** disebut *route model binding*. Laravel mengambil `{task}` dari URL, mencari baris dengan id itu, dan memberikan modelnya. Kalau tidak ditemukan, pengguna mendapat 404 tanpa satu baris kode pun darimu.
- **`view('tasks.index', [...])`** merender `resources/views/tasks/index.blade.php` dengan data yang diberikan.
- **`to_route(...)->with('status', ...)`** mengalihkan ke route bernama, sambil menitipkan pesan di session untuk satu request berikutnya. Ini pola POST-redirect-GET dari [Bab 7](/07-web-tanpa-framework/).

Daftarkan route-nya. `routes/web.php` menjadi:

```php:line-numbers [routes/web.php]
<?php

declare(strict_types=1);

use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/tasks');

Route::get('/hello/{name}', function (string $name): string {
    return "Halo, {$name}!";
});

Route::resource('tasks', TaskController::class)->except('show');
```

`Route::resource` mendaftarkan sekumpulan route CRUD sekaligus. Lihat hasilnya:

```bash
php artisan route:list --except-vendor
```

```text
  ANY             / .................. Illuminate\Routing › RedirectController
  GET|HEAD        hello/{name} ............................. routes/web.php:10
  GET|HEAD        tasks ................... tasks.index › TaskController@index
  POST            tasks ................... tasks.store › TaskController@store
  GET|HEAD        tasks/create .......... tasks.create › TaskController@create
  PUT|PATCH       tasks/{task} .......... tasks.update › TaskController@update
  DELETE          tasks/{task} ........ tasks.destroy › TaskController@destroy
  GET|HEAD        tasks/{task}/edit ......... tasks.edit › TaskController@edit

                                                            Showing [8] routes
```

Kolom tengah adalah nama route. Di kode, selalu rujuk route lewat namanya (`route('tasks.edit', $task)`), bukan URL mentah, supaya URL bisa diubah di satu tempat.

## Blade

Blade adalah template engine Laravel. File-nya berakhiran `.blade.php`, berada di `resources/views`, dan dikompilasi menjadi PHP biasa.

### Layout sebagai komponen

Buat `resources/views/components/layout.blade.php`:

```blade:line-numbers [resources/views/components/layout.blade.php]
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} - Tugas</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="bg-gray-50 text-gray-900">
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

File di folder `components` otomatis menjadi tag: file ini dipakai sebagai `<x-layout>`. Attribute pada tag menjadi variabel (`$title`), dan isi tag menjadi `$slot`. Modelnya sama dengan komponen dan `children` di React.

### Daftar tugas

Buat `resources/views/tasks/index.blade.php`:

```blade:line-numbers [resources/views/tasks/index.blade.php]
<x-layout title="Daftar tugas">
    <a href="{{ route('tasks.create') }}" class="rounded bg-blue-600 px-3 py-2 text-white">Tambah tugas</a>

    <ul class="mt-6 divide-y rounded border bg-white">
        @forelse ($tasks as $task)
            <li class="flex items-center justify-between gap-4 p-3">
                <div>
                    <p @class(['font-medium', 'text-gray-400 line-through' => $task->is_done])>{{ $task->title }}</p>
                    <p class="text-sm text-gray-500">
                        Prioritas {{ $task->priority->label() }}
                        @if ($task->due_date)
                            · tenggat {{ $task->due_date->format('d-m-Y') }}
                        @endif
                    </p>
                </div>
                <div class="flex gap-3 text-sm">
                    <a href="{{ route('tasks.edit', $task) }}" class="text-blue-700 underline">Ubah</a>
                    <form method="POST" action="{{ route('tasks.destroy', $task) }}">
                        @csrf
                        @method('DELETE')
                        <button type="submit" class="text-red-700 underline">Hapus</button>
                    </form>
                </div>
            </li>
        @empty
            <li class="p-3 text-gray-500">Belum ada tugas.</li>
        @endforelse
    </ul>
</x-layout>
```

### Form

Form tambah dan ubah isinya sama, jadi ditulis sekali di `resources/views/tasks/form.blade.php`:

```blade [resources/views/tasks/form.blade.php]
<form method="POST" action="{{ $action }}" class="space-y-4">
    @csrf
    @method($method)

    <div>
        <label for="title" class="block font-medium">Judul</label>
        <input id="title" name="title" type="text" value="{{ old('title', $task->title) }}" required
            class="mt-1 w-full rounded border p-2">
        @error('title')
            <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
        @enderror
    </div>

    <div>
        <label for="priority" class="block font-medium">Prioritas</label>
        <select id="priority" name="priority" class="mt-1 rounded border p-2">
            @foreach ($priorities as $priority)
                <option value="{{ $priority->value }}" @selected(old('priority', $task->priority->value) === $priority->value)>
                    {{ $priority->label() }}
                </option>
            @endforeach
        </select>
        @error('priority')
            <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
        @enderror
    </div>

    <div>
        <label for="due_date" class="block font-medium">Tenggat</label>
        <input id="due_date" name="due_date" type="date" value="{{ old('due_date', $task->due_date?->format('Y-m-d')) }}"
            class="mt-1 rounded border p-2">
        @error('due_date')
            <p class="mt-1 text-sm text-red-700">{{ $message }}</p>
        @enderror
    </div>

    <label class="flex items-center gap-2">
        {{-- Checkbox yang tidak dicentang tidak dikirim browser, jadi nilai 0 ini yang terkirim --}}
        <input type="hidden" name="is_done" value="0">
        <input type="checkbox" name="is_done" value="1" @checked(old('is_done', $task->is_done))>
        Selesai
    </label>

    <div class="flex items-center gap-4">
        <button type="submit" class="rounded bg-blue-600 px-3 py-2 text-white">Simpan</button>
        <a href="{{ route('tasks.index') }}" class="underline">Batal</a>
    </div>
</form>
```

Lalu dua halaman yang memakainya. `resources/views/tasks/create.blade.php`:

```blade:line-numbers [resources/views/tasks/create.blade.php]
<x-layout title="Tambah tugas">
    @include('tasks.form', ['action' => route('tasks.store'), 'method' => 'POST'])
</x-layout>
```

Dan `resources/views/tasks/edit.blade.php`:

```blade:line-numbers [resources/views/tasks/edit.blade.php]
<x-layout title="Ubah tugas">
    @include('tasks.form', ['action' => route('tasks.update', $task), 'method' => 'PUT'])
</x-layout>
```

### Yang dipakai di template tadi

| Sintaks | Fungsi |
|---|---|
| <span v-pre>`{{ $x }}`</span> | Mencetak nilai, sudah di-escape |
| <span v-pre>`{!! $x !!}`</span> | Mencetak nilai mentah tanpa escape |
| `@if`, `@foreach`, `@forelse` | Alur kontrol. `@forelse` punya cabang `@empty`. |
| `@csrf` | Menyisipkan input tersembunyi berisi token CSRF |
| `@method('PUT')` | Menyisipkan input `_method`, karena form HTML hanya mengenal GET dan POST |
| `@error('title')` | Blok yang tampil kalau field itu gagal validasi |
| `old('title', $default)` | Nilai yang diketik pengguna sebelum validasi gagal |
| `@class`, `@selected`, `@checked` | Attribute HTML bersyarat |
| `@include` | Menyertakan view lain |

Dua kurung kurawal meng-escape output secara otomatis. Di [Bab 7](/07-web-tanpa-framework/) kamu harus ingat memanggil `htmlspecialchars` di setiap tempat; di Blade, aman adalah bawaan. Tugas berjudul `<script>alert(1)</script>` tampil di HTML sebagai:

```text
&lt;script&gt;alert(1)&lt;/script&gt;
```

::: warning PHPStan tidak memeriksa Blade
File `.blade.php` berada di luar jangkauan analisis. Salah ketik `$task->titel` di template baru ketahuan saat halaman dibuka. Karena itu, taruh logika di controller dan model, dan biarkan template hanya menampilkan.
:::

## Vite

Di layout ada baris `@vite([...])`. Directive itu menyisipkan tag CSS dan JavaScript, dan sumbernya bergantung pada keadaan:

| Keadaan | Yang dipakai |
|---|---|
| Vite dev server berjalan | File `public/hot`, yang berisi alamat dev server |
| Aset sudah di-build | `public/build/manifest.json` |
| Tidak keduanya | Error 500: `Vite manifest not found at: /app/public/build/manifest.json` |

Vite adalah program Node, dan Node sudah ada di mesinmu. Jalankan dari PowerShell di folder proyek, bukan dari container:

```powershell
npm install
npm run dev
```

```text
  VITE v8.3.8  ready in 325 ms

  ➜  Local:   http://localhost:5173/

  LARAVEL v13.42.0  plugin v3.2.1

  ➜  APP_URL: http://localhost:8000
```

Output di atas dipotong. Buka `http://localhost:8000/tasks`. Halaman dilayani Laravel dari container, sedangkan CSS dan JavaScript dimuat browser langsung dari Vite di port 5173. Mengubah file Blade atau CSS langsung memperbarui halaman.

Skeleton sudah menyertakan Tailwind CSS 4, itu sebabnya class seperti `bg-blue-600` di template tadi berfungsi.

Untuk production, aset di-build menjadi file statis:

```powershell
npm run build
```

```text
vite v8.3.8 building client environment for production...
✓ 3 modules transformed.
public/build/manifest.json                1.47 kB │ gzip:  0.33 kB
public/build/assets/app-CxbOIQK0.css     42.40 kB │ gzip: 10.13 kB
public/build/assets/app-BvRk9kiK.js       0.00 kB │ gzip:  0.02 kB
✓ built in 502ms
```

Output di atas dipotong di bagian font. Folder `public/build` inilah yang nanti diunggah ke server, karena shared hosting tidak punya Node ([Bab 12](/12-deploy)).

::: tip Halaman tampil tanpa gaya?
Kalau Vite dimatikan paksa, file `public/hot` bisa tertinggal dan halaman tetap menunjuk ke dev server yang sudah mati. Hapus file itu, atau jalankan lagi `npm run dev`.
:::

## Validation

Tinggal satu class yang belum ada. *Form Request* adalah class request dengan aturan validasi di dalamnya:

```bash
php artisan make:request TaskRequest
```

Isi `app/Http/Requests/TaskRequest.php`:

```php:line-numbers [app/Http/Requests/TaskRequest.php]
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\Priority;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TaskRequest extends FormRequest
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
            'title' => ['required', 'string', 'max:255'],
            'priority' => ['required', Rule::enum(Priority::class)],
            'due_date' => ['nullable', 'date'],
            'is_done' => ['required', 'boolean'],
        ];
    }
}
```

Karena method controller meminta `TaskRequest`, validasi berjalan **sebelum** method itu dipanggil. Kalau gagal, controller tidak pernah dijalankan.

Rapikan dan periksa dulu, lalu coba di browser:

```bash
composer format
composer check
```

```text
 [OK] No errors
```

### Saat validasi gagal

Kirim form dengan judul kosong. Yang terjadi, diamati lewat `curl`:

```text
302 -> http://localhost:8000/tasks/create
```

Laravel mengalihkan kembali ke form, membawa pesan error dan input lama di session. Di halaman form, blok `@error` menampilkan:

```text
The title field is required.
The selected priority is invalid.
```

Pesan bawaan berbahasa Inggris. Cara menerjemahkannya ada di dokumentasi Laravel bagian Localization.

### Saat validasi lolos

`$request->validated()` mengembalikan hanya field yang punya aturan. Field liar yang diselipkan pengguna tidak ikut. Tipenya menurut Larastan:

```text
array<string, mixed>
```

Di sinilah batas terluar sistem tipe: nilai dari form memang belum bertipe. Yang membuatnya aman adalah gabungan tiga lapis: aturan validasi menjamin isinya, `#[Fillable]` membatasi kolomnya, dan `casts()` mengubahnya menjadi enum, tanggal, dan `bool` saat masuk ke model.

Kalau kamu perlu satu nilai dengan tipe yang jelas, `Request` punya method pembaca bertipe:

| Method | Tipe hasil |
|---|---|
| `$request->string('title')` | Objek `Stringable` |
| `$request->integer('page')` | `int` |
| `$request->boolean('open')` | `bool` |
| `$request->date('due_date')` | `Carbon\|null` |
| `$request->enum('priority', Priority::class)` | `Priority\|null` |

### CSRF

Middleware CSRF aktif untuk semua route di `web.php`. Request POST tanpa token ditolak:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8000/tasks -d "title=x"
```

```text
419
```

Itu sebabnya setiap form di atas memuat `@csrf`.

## Ringkasan

- **Proyek Laravel berjalan di dua container**: `app` dan `mysql`. Folder `vendor/` ditaruh di volume supaya cepat.
- **`composer format` menambahkan `declare(strict_types=1);`** ke semua file, dan Larastan membuat `composer check` di level max paham Eloquent.
- **Route** memetakan URL ke method controller; `Route::resource` mendaftarkan satu set CRUD.
- **Migration** adalah skema sebagai kode. Larastan membacanya untuk menyimpulkan tipe property model.
- **Eloquent** memakai pola Active Record. `casts()` mengubah nilai database menjadi enum, tanggal, dan `bool`.
- **Blade** meng-escape output secara otomatis, tetapi tidak diperiksa PHPStan.
- **Vite** berjalan di Node pada mesinmu. Hasil `npm run build` adalah yang dikirim ke server.
- **Form Request** memvalidasi sebelum controller dijalankan.

## Latihan

### 1. Salah ketik nama kolom

Di method `index`, ubah `->orderBy('due_date')` menjadi `->orderBy('due_dat')`, lalu jalankan `composer check`. Setelah itu, tambahkan `->where('is_don', false)` dan jalankan lagi. Mana yang tertangkap?

::: details Jawaban
Hanya `where('is_don', false)` yang dilaporkan. `checkModelProperties` memeriksa nama kolom di `where()`, tetapi `orderBy('due_dat')` lolos dari analisis dan baru gagal sebagai error SQL saat halaman dibuka.

Pelajarannya: Larastan menutup banyak celah, tidak semuanya. Test ([Bab 9](/09-laravel-lanjut/)) menutup sisanya.
:::

### 2. Filter tugas yang belum selesai

Buat `/tasks?open=1` hanya menampilkan tugas yang belum selesai, sedangkan `/tasks` tetap menampilkan semuanya.

::: details Jawaban
Minta objek `Request` di method `index`, lalu tambahkan kondisi bersyarat dengan `when()`:

```php
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

public function index(Request $request): View
{
    $tasks = Task::query()
        ->when($request->boolean('open'), fn (Builder $query) => $query->where('is_done', false))
        ->orderBy('is_done')
        ->orderBy('due_date')
        ->get();

    return view('tasks.index', ['tasks' => $tasks]);
}
```

`$request->boolean('open')` mengembalikan `bool` sungguhan, jadi tidak ada `mixed` yang perlu dipersempit. `when()` menjalankan closure hanya kalau argumen pertamanya `true`.
:::

### 3. Tenggat tidak boleh di masa lalu

Tambahkan aturan supaya `due_date` tidak boleh lebih awal dari hari ini. Coba kirim tanggal tahun 2020.

::: details Jawaban
Tambahkan rule `after_or_equal:today`:

```php
'due_date' => ['nullable', 'date', 'after_or_equal:today'],
```

Form ditolak dengan pesan:

```text
The due date field must be a date after or equal to today.
```
:::
