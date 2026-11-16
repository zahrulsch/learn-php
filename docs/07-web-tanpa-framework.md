# 7. PHP web tanpa framework

Bab ini membangun aplikasi web kecil, sebuah buku tamu, hanya dengan PHP dan tanpa framework. Tujuannya bukan mengajakmu menulis aplikasi seperti ini seterusnya, melainkan supaya kamu tahu persis apa yang dikerjakan Laravel untukmu mulai [Bab 8](/08-laravel-dasar): routing, request, validasi, templat, database, session, dan pengamanannya.

## Model eksekusi: satu request, satu kehidupan

Di Node atau axum, aplikasimu adalah satu proses yang hidup lama. Proses itu membuka port, lalu melayani ribuan request dengan state yang sama di memori.

PHP bekerja terbalik. Yang hidup lama hanya web server. Untuk setiap request, web server menjalankan script PHP dari baris pertama sampai terakhir, mengirim outputnya sebagai response, lalu membuang seluruh state script itu. Model ini dijuluki *shared-nothing*.

| | Node (Express), Rust (axum) | PHP |
|---|---|---|
| Yang hidup lama | Proses aplikasimu | Web server saja, bukan kode aplikasimu |
| State di memori antar request | Ada: variabel global, cache, pool koneksi | Tidak ada. Semua variabel dibuang di akhir request |
| Konkurensi | Event loop atau task async di satu proses | Satu proses pekerja per request, dengan kode sinkron biasa |
| Kebocoran memori | Menumpuk selama proses hidup | Hilang sendiri di akhir request |
| Setelah mengubah kode | Restart atau compile ulang | Tidak perlu. Request berikutnya membaca file terbaru |
| Pekerjaan latar belakang | Task di proses yang sama | Proses terpisah: queue worker dan cron |

Konsekuensinya menjelaskan banyak hal tentang bentuk aplikasi PHP:

- **State harus disimpan di luar proses**: database, file session, atau cache.
- **Tidak ada `async`/`await`.** Kode yang menunggu database cukup ditulis berurutan, karena request lain dilayani proses lain.
- **Semua persiapan diulang di setiap request**: memuat autoloader, membaca konfigurasi, membuka koneksi database. Framework dirancang supaya persiapan itu murah.

## Siapkan proyek

Bab ini memakai proyek baru, terpisah dari `php-basics`. Dari PowerShell:

```powershell
mkdir practice/web-basics
cd practice/web-basics
mkdir bin, public, src, templates
```

`Dockerfile`-nya sama persis dengan [Bab 1](/01-setup):

```dockerfile
FROM php:8.5-cli

# Composer butuh unzip untuk membuka paket yang diunduhnya
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
```

`compose.yaml` mendapat dua tambahan, yaitu port dan perintah yang dijalankan container:

```yaml
services:
  php:
    build: .
    volumes:
      - .:/app
    ports:
      - "8000:8000"
    command: php -S 0.0.0.0:8000 -t public
```

`php -S` menyalakan web server bawaan PHP. Dua bagiannya penting:

- **`0.0.0.0:8000`**: server harus mendengarkan di semua alamat supaya port yang dipublikasikan Docker sampai kepadanya. Dengan `localhost`, server hanya bisa dicapai dari dalam container.
- **`-t public`**: folder `public` menjadi *document root*, satu-satunya folder yang isinya bisa diminta lewat URL.

Buat `public/index.php` sementara:

```php
<?php

declare(strict_types=1);

echo 'PHP ' . PHP_VERSION . ' lewat SAPI ' . PHP_SAPI . PHP_EOL;
```

Nyalakan container:

```powershell
docker compose up
```

```text
php-1  | [Mon Nov 16 07:53:32 2026] PHP 8.5.12 Development Server (http://0.0.0.0:8000) started
```

Terminal itu sekarang menampilkan log server. Biarkan terbuka, lalu buka terminal kedua dan masuk ke container yang sedang berjalan:

```powershell
docker compose exec php bash
```

Semua perintah berikutnya dijalankan dari shell ini. Image PHP sudah menyertakan `curl`, jadi request bisa dicoba dari sini selain dari browser di `http://localhost:8000`:

```bash
curl http://localhost:8000/
```

```text
PHP 8.5.12 lewat SAPI cli-server
```

Jalankan file yang sama langsung dari command line:

```bash
php public/index.php
```

```text
PHP 8.5.12 lewat SAPI cli
```

### SAPI

Yang berbeda di dua output itu adalah SAPI (*Server API*), yaitu cara interpreter PHP dihubungkan dengan dunia luar. Interpreternya sama, pintu masuknya yang berbeda.

| SAPI | Dipakai untuk |
|---|---|
| `cli` | Command line: script, Composer, PHPStan, PHPUnit |
| `cli-server` | Web server bawaan `php -S`. Hanya untuk development: satu proses, satu request dalam satu waktu |
| `fpm-fcgi` | PHP-FPM: sekumpulan proses pekerja di belakang Nginx atau Apache. Susunan paling umum di VPS |
| `apache2handler` | PHP sebagai modul di dalam Apache |
| `litespeed` | PHP di belakang web server LiteSpeed, banyak dipakai shared hosting |

Kodemu tidak berubah di antara SAPI web itu. Yang berbeda adalah siapa yang menjalankan PHP dan bagaimana ia dikonfigurasi. Itu urusan [Bab 11](/11-memilih-hosting) dan [Bab 12](/12-deploy).

Beberapa pengaturan bergantung pada SAPI. Contohnya batas waktu eksekusi `max_execution_time`: 0 (tanpa batas) di `cli`, 30 detik di `cli-server`.

### Pasang PHPStan

Buat `composer.json`:

```json
{
    "name": "learn/web-basics",
    "type": "project",
    "require": {
        "php": "^8.5",
        "ext-pdo_sqlite": "*"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    },
    "scripts": {
        "check": "phpstan analyse"
    }
}
```

Dua hal dari [Bab 6](/06-ekosistem) dipakai di sini: autoload PSR-4 dengan awalan `App\`, dan syarat platform `ext-pdo_sqlite` untuk database nanti.

Buat `phpstan.neon`:

```yaml
parameters:
    level: max
    checkBenevolentUnionTypes: true
    paths:
        - bin
        - public
        - src
        - templates
```

```bash
composer require --dev phpstan/phpstan
```

## Membuktikan shared-nothing

Buat `public/counter.php`:

```php
<?php

declare(strict_types=1);

$count = 0;
$count++;

echo "Request ke-{$count}" . PHP_EOL;
```

Panggil tiga kali:

```bash
curl http://localhost:8000/counter.php
curl http://localhost:8000/counter.php
curl http://localhost:8000/counter.php
```

```text
Request ke-1
Request ke-1
Request ke-1
```

Di Node, kode yang setara akan terus bertambah, karena variabelnya hidup di proses server:

```ts
import { createServer } from 'node:http'

let count = 0

createServer((req, res) => {
  count++
  res.end(`Request ke-${count}\n`)
}).listen(8000)
```

Di PHP tidak ada tempat untuk menaruh `let count` itu. Setiap request memulai dari file yang sama dengan memori kosong. Kamu juga tidak me-restart apa pun setelah membuat `counter.php`: file itu langsung bisa dipanggil, karena memang dibaca ulang di setiap request.

## Input: superglobal bertipe `mixed`

PHP menyerahkan data request lewat beberapa array global yang selalu tersedia, disebut *superglobal*:

| Superglobal | Isinya |
|---|---|
| `$_GET` | Parameter query string |
| `$_POST` | Isi form yang dikirim dengan POST |
| `$_SERVER` | Metode, URL, header, dan info server |
| `$_COOKIE` | Cookie yang dikirim browser |
| `$_FILES` | File yang diunggah |
| `$_SESSION` | Data session, setelah `session_start()` |

Semua isinya berasal dari luar, jadi PHPStan menganggapnya `mixed`. Buat `public/greet.php`:

```php
<?php

declare(strict_types=1);

echo 'Halo, ' . strtoupper($_GET['name']) . PHP_EOL;
```

```bash
composer check
```

```text
 ------ -------------------------------------------------------------------
  Line   public/greet.php
 ------ -------------------------------------------------------------------
  5      Parameter #1 $string of function strtoupper expects string, mixed
         given.
         🪪  argument.type
 ------ -------------------------------------------------------------------

 [ERROR] Found 1 error
```

Keluhan PHPStan itu bukan formalitas. Dengan input yang wajar, script ini jalan:

```bash
curl "http://localhost:8000/greet.php?name=budi"
```

```text
Halo, BUDI
```

Tanpa parameter, ia gagal:

```bash
curl "http://localhost:8000/greet.php"
```

```text
<br />
<b>Warning</b>:  Undefined array key "name" in <b>/app/public/greet.php</b> on line <b>5</b><br />
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, null given in /app/public/greet.php:5
```

Dan pengirim bisa membuat nilainya menjadi array, cukup dengan menambahkan `[]` pada nama parameter:

```bash
curl -g "http://localhost:8000/greet.php?name[]=budi"
```

```text
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, array given in /app/public/greet.php:5
```

Itulah sebabnya tipenya `mixed`: sebuah parameter bisa tidak ada, bisa string, dan bisa array bersarang. Ada masalah ketiga, yaitu input dicetak mentah-mentah ke halaman:

```bash
curl -g "http://localhost:8000/greet.php?name=<script>alert(1)</script>"
```

```text
Halo, <SCRIPT>ALERT(1)</SCRIPT>
```

Browser akan menjalankan tag itu sebagai JavaScript. Ini celah XSS, yang dibahas di bagian templat.

Perbaikannya mengikuti pola yang sama dengan `mixed` di [Bab 2](/02-type-system): periksa bentuknya di pintu masuk, dan setelah itu bekerja dengan tipe yang pasti. Timpa `greet.php`:

```php
<?php

declare(strict_types=1);

$name = $_GET['name'] ?? null;

if (!is_string($name) || $name === '') {
    http_response_code(400);
    echo 'Parameter name wajib diisi.' . PHP_EOL;

    return;
}

echo 'Halo, ' . htmlspecialchars(strtoupper($name)) . PHP_EOL;
```

Sekarang `composer check` lulus, dan ketiga kasus tadi tertangani:

```text
$ curl -g "http://localhost:8000/greet.php?name[]=budi"
Parameter name wajib diisi.

$ curl -g "http://localhost:8000/greet.php?name=<script>alert(1)</script>"
Halo, &lt;SCRIPT&gt;ALERT(1)&lt;/SCRIPT&gt;
```

::: warning Pesan error tadi tampil ke pengunjung
Dua output error di atas dikirim ke browser lengkap dengan path file di server, dan dengan status 200. Image `php:8.5-cli` berjalan tanpa `php.ini`, sehingga `display_errors` menyala. Itu membantu saat development, tetapi di production harus dimatikan dan error dicatat ke log. Pengaturannya dibahas di [Bab 12](/12-deploy).
:::

Hapus `public/counter.php` dan `public/greet.php`. Mulai dari sini kita membangun aplikasinya.

## Rancangan aplikasi

Buku tamu ini punya fitur secukupnya untuk menyentuh semua topik bab:

- Siapa pun bisa membaca dan menulis pesan.
- Admin bisa masuk dengan sandi, lalu menghapus pesan.

Susunan file akhirnya:

```text
web-basics/
├── bin/
│   └── setup.php              membuat database dan akun admin
├── public/
│   └── index.php              satu-satunya pintu masuk dari web
├── src/
│   ├── Http/
│   │   ├── Request.php        input yang sudah bertipe
│   │   ├── Response.php       status, header, dan isi
│   │   └── Session.php        session, flash, token CSRF
│   ├── Database.php           pembungkus tipis di atas PDO
│   ├── GuestbookController.php
│   ├── Message.php
│   ├── MessageRepository.php
│   ├── UserRepository.php
│   └── functions.php          e(), render(), page()
├── templates/
│   ├── home.php
│   ├── layout.php
│   └── login.php
└── var/
    └── guestbook.sqlite       dibuat oleh bin/setup.php
```

Hanya `public/` yang terlihat dari web. Kode di `src/`, dependency di `vendor/`, dan file database di `var/` tidak bisa diminta lewat URL apa pun. Susunan ini sama dengan yang dipakai Laravel, dan menjadi syarat penting saat deploy di [Bab 12](/12-deploy).

## Request dan Response

### Request

Class ini adalah pintu masuk tadi: satu-satunya tempat yang menyentuh `$_SERVER`, `$_GET`, dan `$_POST`. Sisanya bekerja dengan property bertipe. Buat `src/Http/Request.php`:

<!-- file: src/Http/Request.php -->
```php
<?php

declare(strict_types=1);

namespace App\Http;

final readonly class Request
{
    /**
     * @param array<string, string> $query
     * @param array<string, string> $form
     */
    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public array $form,
    ) {}

    public static function fromGlobals(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? null;
        $uri = $_SERVER['REQUEST_URI'] ?? null;
        $path = is_string($uri) ? parse_url($uri, PHP_URL_PATH) : null;

        return new self(
            is_string($method) ? $method : 'GET',
            is_string($path) ? $path : '/',
            self::onlyStrings($_GET),
            self::onlyStrings($_POST),
        );
    }

    public function input(string $key): string
    {
        return trim($this->form[$key] ?? '');
    }

    /**
     * @param array<mixed> $data
     * @return array<string, string>
     */
    private static function onlyStrings(array $data): array
    {
        $result = [];

        foreach ($data as $key => $value) {
            if (is_string($key) && is_string($value)) {
                $result[$key] = $value;
            }
        }

        return $result;
    }
}
```

`onlyStrings()` membuang nilai yang bukan string, sehingga trik `name[]=x` tadi berakhir sebagai field kosong, bukan `TypeError`. Aplikasi ini memang tidak membutuhkan input berupa array.

### Response

Di PHP, response dibentuk dengan efek samping: `echo` menulis isi, `header()` menambah header, `http_response_code()` mengatur status. Ada satu aturan urutan: header harus dikirim sebelum isi. Begitu satu karakter isi keluar, header tidak bisa diubah lagi.

Supaya urutan itu tidak perlu dijaga di banyak tempat, controller mengembalikan nilai, dan pengirimannya dilakukan di satu tempat. Buat `src/Http/Response.php`:

<!-- file: src/Http/Response.php -->
```php
<?php

declare(strict_types=1);

namespace App\Http;

final readonly class Response
{
    /**
     * @param array<string, string> $header
     */
    public function __construct(
        public string $body,
        public int $status = 200,
        public array $header = [],
    ) {}

    public static function redirect(string $target): self
    {
        return new self('', 303, ['Location' => $target]);
    }

    public function send(): void
    {
        http_response_code($this->status);

        foreach ($this->header as $name => $value) {
            header("{$name}: {$value}");
        }

        echo $this->body;
    }
}
```

Bentuknya sama dengan handler di axum atau Express: fungsi yang menerima request dan mengembalikan response.

## Session dan cookie

HTTP tidak mengingat siapa pengirim request, dan PHP tidak menyimpan apa pun di memori. Session menjembatani keduanya:

1. `session_start()` membuat ID acak dan mengirimnya ke browser sebagai cookie.
2. Data yang kamu taruh di `$_SESSION` disimpan di server, dalam file yang dinamai dengan ID itu.
3. Di request berikutnya browser mengirim cookie tadi, dan `session_start()` memuat kembali datanya.

Buat lagi `public/counter.php`, kali ini dengan session:

```php
<?php

declare(strict_types=1);

session_start();

$count = $_SESSION['count'] ?? 0;
$count = is_int($count) ? $count + 1 : 1;
$_SESSION['count'] = $count;

echo "Request ke-{$count}" . PHP_EOL;
```

Opsi `-c` dan `-b` membuat `curl` menyimpan dan mengirim cookie seperti browser:

```bash
curl -c /tmp/cookies -b /tmp/cookies http://localhost:8000/counter.php
curl -c /tmp/cookies -b /tmp/cookies http://localhost:8000/counter.php
curl -c /tmp/cookies -b /tmp/cookies http://localhost:8000/counter.php
```

```text
Request ke-1
Request ke-2
Request ke-3
```

Tanpa cookie, server menganggapmu pengunjung baru:

```bash
curl -i http://localhost:8000/counter.php
```

```text
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=7afd2789fe7907a706e4673ded182d91; path=/
...

Request ke-1
```

Datanya sendiri ada di server, sebagai file biasa:

```bash
cat /tmp/sess_9884b515937569848ce1009f742c37e9
```

```text
count|i:3;
```

Nama file di tempatmu berbeda, karena ID session selalu acak. Dua hal perlu dicatat dari percobaan ini:

- **`$_SESSION` juga `mixed`.** Karena itu nilainya diperiksa dengan `is_int` sebelum dijumlahkan.
- **Cookie bawaan tidak punya pengaman apa pun.** Header `Set-Cookie` di atas hanya berisi `path=/`.

Hapus `public/counter.php`. Class berikut membungkus semua akses session aplikasi dan memasang pengamannya. Buat `src/Http/Session.php`:

<!-- file: src/Http/Session.php -->
```php
<?php

declare(strict_types=1);

namespace App\Http;

final class Session
{
    public static function start(): void
    {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
            'use_strict_mode' => true,
        ]);
    }

    public static function csrfToken(): string
    {
        $token = $_SESSION['csrf'] ?? null;

        if (!is_string($token)) {
            $token = bin2hex(random_bytes(32));
            $_SESSION['csrf'] = $token;
        }

        return $token;
    }

    public static function csrfMatches(string $submitted): bool
    {
        return hash_equals(self::csrfToken(), $submitted);
    }

    public static function setFlash(string $message): void
    {
        $_SESSION['flash'] = $message;
    }

    public static function pullFlash(): ?string
    {
        $message = $_SESSION['flash'] ?? null;
        unset($_SESSION['flash']);

        return is_string($message) ? $message : null;
    }

    public static function login(int $userId): void
    {
        session_regenerate_id(true);
        $_SESSION['user'] = $userId;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        session_regenerate_id(true);
    }

    public static function isLoggedIn(): bool
    {
        return is_int($_SESSION['user'] ?? null);
    }
}
```

Tiga opsi di `session_start()`:

- **`cookie_httponly`**: JavaScript di halaman tidak bisa membaca cookie session, sehingga celah XSS tidak langsung berarti session dicuri.
- **`cookie_samesite => 'Lax'`**: browser tidak menyertakan cookie pada request POST yang berasal dari situs lain. Ini lapis pertama terhadap CSRF.
- **`use_strict_mode`**: server menolak ID session yang tidak pernah dibuatnya sendiri.

Di production ada opsi keempat yang wajib, `'cookie_secure' => true`, supaya cookie hanya dikirim lewat HTTPS. Opsi itu tidak dipasang di sini karena server development berjalan di HTTP.

Bagian lain class ini dipakai di bagian-bagian berikutnya:

- **Flash** adalah pesan yang hidup tepat satu request: ditulis sebelum redirect, dibaca dan dihapus di halaman tujuan.
- **`session_regenerate_id(true)`** mengganti ID session saat status login berubah. Tanpa itu, penyerang yang berhasil menanamkan ID session ke browser korban sebelum login akan ikut masuk setelah korban login. Serangan ini disebut *session fixation*.
- **Token CSRF** dibahas di bagian front controller.

Method-nya static karena session memang state global milik request, sama seperti superglobal yang dibungkusnya.

## Templat dan XSS

### PHP sebagai bahasa templat

PHP lahir sebagai bahasa templat, dan kemampuan itu masih ada: apa pun di luar tag `<?php ... ?>` dikirim apa adanya sebagai output. Dua bentuk yang dipakai di file templat:

- **`<?= $value ?>`** adalah singkatan `<?php echo $value ?>`.
- **`<?php if (...): ?>` sampai `<?php endif ?>`** adalah sintaks alternatif untuk blok, lebih mudah dibaca di antara HTML daripada kurung kurawal. Ada juga `foreach (...):` dan `endforeach`.

### Escaping

Di percobaan `greet.php`, input yang dicetak mentah berubah menjadi tag `<script>` di halaman. Itulah XSS (*cross-site scripting*): teks dari pengguna diperlakukan browser sebagai HTML. Obatnya satu, yaitu meng-escape setiap nilai tepat saat dicetak ke HTML.

Buat `src/functions.php`:

<!-- file: src/functions.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use App\Http\Session;

function e(string $text): string
{
    return htmlspecialchars($text);
}

/**
 * @param array<string, mixed> $data
 */
function render(string $template, array $data = []): string
{
    extract($data);
    ob_start();
    require __DIR__ . "/../templates/{$template}.php";

    return (string) ob_get_clean();
}

/**
 * @param array<string, mixed> $data
 */
function page(string $title, string $template, array $data = []): string
{
    return render('layout', [
        'title' => $title,
        'content' => render($template, $data),
        'flash' => Session::pullFlash(),
        'admin' => Session::isLoggedIn(),
        'csrf' => Session::csrfToken(),
    ]);
}
```

Tiga fungsi itu:

- **`e()`** mengubah `<`, `>`, `&`, dan tanda kutip menjadi entity HTML. Namanya pendek karena dipanggil di setiap nilai yang dicetak.
- **`render()`** menjalankan sebuah file templat dan mengembalikan hasilnya sebagai string. `extract()` mengubah kunci array menjadi variabel lokal, dan pasangan `ob_start()` dengan `ob_get_clean()` menampung output `echo` ke dalam buffer alih-alih mengirimnya.
- **`page()`** membungkus hasil sebuah templat dengan tata letak bersama.

Seperti di [Bab 6](/06-ekosistem), file berisi fungsi harus didaftarkan sendiri. Tambahkan entri `files` ke `autoload` di `composer.json`, lalu buat ulang autoloader:

```json
"autoload": {
    "psr-4": {
        "App\\": "src/"
    },
    "files": [
        "src/functions.php"
    ]
}
```

```bash
composer dump-autoload
```

### File templat

Buat `templates/layout.php`:

<!-- file: templates/layout.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var string $title
 * @var string $content
 * @var string|null $flash
 * @var bool $admin
 * @var string $csrf
 */
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($title) ?></title>
</head>
<body>
    <nav>
        <a href="/">Buku Tamu</a>
        <?php if ($admin): ?>
            <form method="post" action="/logout">
                <input type="hidden" name="_token" value="<?= e($csrf) ?>">
                <button>Keluar</button>
            </form>
        <?php else: ?>
            <a href="/login">Masuk</a>
        <?php endif ?>
    </nav>

    <?php if ($flash !== null): ?>
        <p role="status"><?= e($flash) ?></p>
    <?php endif ?>

    <main>
        <h1><?= e($title) ?></h1>
        <?= $content ?>
    </main>
</body>
</html>
```

Buat `templates/home.php`:

<!-- file: templates/home.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var list<App\Message> $messages
 * @var string $csrf
 * @var bool $admin
 * @var array<string, string> $errors
 * @var string $name
 * @var string $body
 */
?>
<form method="post" action="/messages">
    <input type="hidden" name="_token" value="<?= e($csrf) ?>">

    <label for="name">Nama</label>
    <input id="name" name="name" value="<?= e($name) ?>" maxlength="50" required>
    <?php if (isset($errors['name'])): ?>
        <p role="alert"><?= e($errors['name']) ?></p>
    <?php endif ?>

    <label for="body">Pesan</label>
    <textarea id="body" name="body" maxlength="500" required><?= e($body) ?></textarea>
    <?php if (isset($errors['body'])): ?>
        <p role="alert"><?= e($errors['body']) ?></p>
    <?php endif ?>

    <button>Kirim</button>
</form>

<?php foreach ($messages as $message): ?>
    <article>
        <h2><?= e($message->name) ?></h2>
        <time datetime="<?= e($message->createdAt->format('c')) ?>"><?= e($message->createdAt->format('d M Y H:i')) ?></time>
        <p><?= nl2br(e($message->body)) ?></p>

        <?php if ($admin): ?>
            <form method="post" action="/messages/<?= $message->id ?>/delete">
                <input type="hidden" name="_token" value="<?= e($csrf) ?>">
                <button>Hapus</button>
            </form>
        <?php endif ?>
    </article>
<?php endforeach ?>
```

Buat `templates/login.php`:

<!-- file: templates/login.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var string $csrf
 * @var string|null $error
 */
?>
<form method="post" action="/login">
    <input type="hidden" name="_token" value="<?= e($csrf) ?>">

    <?php if ($error !== null): ?>
        <p role="alert"><?= e($error) ?></p>
    <?php endif ?>

    <label for="name">Nama</label>
    <input id="name" name="name" autocomplete="username" required>

    <label for="password">Sandi</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>

    <button>Masuk</button>
</form>
```

Dua pengecualian dari aturan "selalu `e()`" ada di file-file itu, dan keduanya punya alasan:

- **`<?= $content ?>`** di tata letak: isinya HTML hasil templat lain yang nilainya sudah di-escape satu per satu. Meng-escape-nya lagi justru menampilkan tag sebagai teks.
- **`<?= $message->id ?>`**: bertipe `int`, tidak mungkin berisi HTML.

### Templat ikut diperiksa PHPStan

Blok `@var` di awal tiap templat menyatakan variabel apa yang diterima file itu beserta tipenya. Karena folder `templates` masuk ke `paths`, isinya diperiksa seperti kode lain. Kalau baris `@var list<App\Message> $messages` dihapus:

```text
  33     Argument of an invalid type mixed supplied for foreach, only
         iterables are supported.
         🪪  foreach.nonIterable
  33     Variable $messages might not be defined.
         🪪  variable.undefined
  35     Cannot access property $name on mixed.
         🪪  property.nonObject
  ...
```

Dan kalau `e($message->name)` salah ditulis menjadi `e($message->id)`:

```text
  36     Parameter #1 $text of function App\e expects string, int given.
         🪪  argument.type
```

Ada batasnya, dan sebaiknya kamu tahu di mana. PHPStan mempercayai `@var` begitu saja. Ia tidak memeriksa apakah array yang dikirim controller ke `render()` benar-benar berisi kunci dan tipe yang dijanjikan templat. Batas antara controller dan templat adalah satu tempat di aplikasi ini yang dijaga oleh disiplin, bukan oleh tipe.

## Database dengan PDO

PDO (*PHP Data Objects*) adalah antarmuka database bawaan PHP. API-nya sama untuk SQLite, MySQL, dan PostgreSQL; yang berbeda hanya string koneksinya. Bab ini memakai SQLite karena tidak membutuhkan server: database-nya satu file.

### Pembungkus koneksi

Buat `src/Database.php`:

<!-- file: src/Database.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use Closure;
use PDO;
use PDOStatement;
use RuntimeException;
use Throwable;

final readonly class Database
{
    private function __construct(private PDO $pdo) {}

    public static function open(string $file): self
    {
        return new self(new PDO("sqlite:{$file}", options: [
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]));
    }

    /**
     * @param array<string, int|string> $parameter
     */
    public function run(string $sql, array $parameter = []): PDOStatement
    {
        $statement = $this->pdo->prepare($sql);

        // prepare() bertipe PDOStatement|false, walaupun dalam mode exception false tidak pernah muncul.
        if ($statement === false) {
            throw new RuntimeException('Query gagal disiapkan');
        }

        $statement->execute($parameter);

        return $statement;
    }

    /**
     * @template T
     *
     * @param Closure(): T $action
     * @return T
     */
    public function transaction(Closure $action): mixed
    {
        $this->pdo->beginTransaction();

        try {
            $result = $action();
            $this->pdo->commit();

            return $result;
        } catch (Throwable $error) {
            $this->pdo->rollBack();

            throw $error;
        }
    }
}
```

Yang perlu diperhatikan:

- **`"sqlite:{$file}"`** adalah DSN, string koneksi PDO. Untuk MySQL bentuknya `mysql:host=...;dbname=...`, ditambah nama pengguna dan sandi sebagai argumen berikutnya.
- **`FETCH_ASSOC`** membuat setiap baris hasil query berupa array dengan nama kolom sebagai kunci.
- **Kegagalan query melempar `PDOException`.** Itu mode bawaan sejak PHP 8.
- **`run()` selalu memakai prepared statement.** Alasannya ada di bagian SQL injection di bawah.
- **`transaction()`** memakai generics dari [Bab 2](/02-type-system): apa pun yang dikembalikan closure menjadi tipe kembaliannya.

Pengecekan `=== false` adalah contoh warisan lama dari [Bab 5](/05-error-handling). Tanpa pengecekan itu PHPStan menolak:

```text
  32     Cannot call method execute() on PDOStatement|false.
         🪪  method.nonObject
  34     Method App\Database::run() should return PDOStatement but returns
         (PDOStatement|false).
         🪪  return.type
```

### Dari baris ke objek

Hasil query adalah array yang isinya ditentukan database, bukan oleh kodemu. Bagi PHPStan itu `mixed`, sama seperti superglobal. Polanya juga sama: ubah menjadi objek bertipe di satu tempat. Buat `src/Message.php`:

<!-- file: src/Message.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use DateTimeImmutable;
use UnexpectedValueException;

final readonly class Message
{
    public function __construct(
        public int $id,
        public string $name,
        public string $body,
        public DateTimeImmutable $createdAt,
    ) {}

    public static function fromRow(mixed $row): self
    {
        $row = is_array($row) ? $row : [];
        $id = $row['id'] ?? null;
        $name = $row['name'] ?? null;
        $body = $row['body'] ?? null;
        $createdAt = $row['created_at'] ?? null;

        if (!is_int($id) || !is_string($name) || !is_string($body) || !is_string($createdAt)) {
            throw new UnexpectedValueException('Baris tabel messages tidak sesuai bentuk yang diharapkan');
        }

        return new self($id, $name, $body, new DateTimeImmutable($createdAt));
    }
}
```

Ini padanan `serde` atau schema zod yang ditulis tangan: kalau bentuk baris tidak sesuai, program berhenti di batas ini, bukan jauh di dalam templat.

Buat `src/MessageRepository.php`:

<!-- file: src/MessageRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class MessageRepository
{
    public function __construct(private Database $db) {}

    /**
     * @return list<Message>
     */
    public function all(): array
    {
        $rows = $this->db->run('SELECT id, name, body, created_at FROM messages ORDER BY id DESC')->fetchAll();

        return array_values(array_map(Message::fromRow(...), $rows));
    }

    public function add(string $name, string $body): void
    {
        $this->db->run('INSERT INTO messages (name, body, created_at) VALUES (:name, :body, :created_at)', [
            'name' => $name,
            'body' => $body,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    public function delete(int $id): void
    {
        $this->db->run('DELETE FROM messages WHERE id = :id', ['id' => $id]);
    }
}
```

`:name`, `:body`, dan `:created_at` adalah *placeholder*. Nilainya dikirim terpisah dari teks SQL lewat array di argumen kedua.

## Menyimpan sandi

Sandi tidak pernah disimpan apa adanya, dan tidak di-hash dengan fungsi hash umum seperti SHA-256 yang terlalu cepat untuk keperluan ini. PHP punya dua fungsi khusus. Buat `bin/try-password.php`:

```php
<?php

declare(strict_types=1);

$hash = password_hash('rahasia123', PASSWORD_DEFAULT);

echo $hash . PHP_EOL;
var_dump(password_verify('rahasia123', $hash));
var_dump(password_verify('salah', $hash));
var_dump(password_needs_rehash($hash, PASSWORD_DEFAULT));
```

```bash
php bin/try-password.php
```

```text
$2y$12$US/jsKzcRl27Yy8JE5yNhu9rVJpFkgz1clJgZPPBQLbbO1bUtSaXy
bool(true)
bool(false)
bool(false)
```

String hasilnya memuat semua yang dibutuhkan untuk verifikasi: algoritma (`2y`, yaitu bcrypt), ongkos (`12`), salt acak, dan hash-nya. Karena salt-nya acak, hash di tempatmu akan berbeda walaupun sandinya sama.

- **`password_hash()`** dengan `PASSWORD_DEFAULT` memilih algoritma yang direkomendasikan versi PHP yang dipakai.
- **`password_verify()`** membandingkan sandi dengan hash, dengan waktu yang tidak bergantung pada posisi karakter yang salah.
- **`password_needs_rehash()`** mengembalikan `true` kalau hash lama dibuat dengan pengaturan yang sudah ketinggalan, supaya bisa diperbarui saat pengguna login.

Hapus file coba-coba itu, lalu buat `src/UserRepository.php`:

<!-- file: src/UserRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class UserRepository
{
    public function __construct(private Database $db) {}

    public function add(string $name, string $password): void
    {
        $this->db->run('INSERT INTO users (name, password_hash) VALUES (:name, :hash)', [
            'name' => $name,
            'hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    }

    /**
     * Mengembalikan id pengguna kalau nama dan sandinya cocok.
     */
    public function authenticate(string $name, string $password): ?int
    {
        $row = $this->db->run('SELECT id, password_hash FROM users WHERE name = :name', ['name' => $name])->fetch();
        $row = is_array($row) ? $row : [];
        $id = $row['id'] ?? null;
        $hash = $row['password_hash'] ?? null;

        if (!is_int($id) || !is_string($hash) || !password_verify($password, $hash)) {
            return null;
        }

        return $id;
    }
}
```

`authenticate()` mengembalikan `null` baik saat nama tidak dikenal maupun saat sandinya salah. Pemanggil sengaja tidak diberi tahu yang mana, supaya halaman login tidak bisa dipakai untuk menebak nama pengguna yang terdaftar.

## Membuat database

Buat `bin/setup.php`:

<!-- file: bin/setup.php -->
```php
<?php

declare(strict_types=1);

use App\Database;
use App\UserRepository;

require __DIR__ . '/../vendor/autoload.php';

$folder = __DIR__ . '/../var';
$file = $folder . '/guestbook.sqlite';

if (!is_dir($folder)) {
    mkdir($folder);
}

if (is_file($file)) {
    unlink($file);
}

$db = Database::open($file);

$db->transaction(static function () use ($db): void {
    $db->run('CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    )');

    $db->run('CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
    )');

    new UserRepository($db)->add('admin', 'rahasia123');
});

echo 'Database siap: ' . realpath($file) . PHP_EOL;
```

```bash
php bin/setup.php
```

```text
Database siap: /app/var/guestbook.sqlite
```

Script ini menghapus database lama dan membuat yang baru, jadi aman dijalankan ulang kapan pun kamu ingin mulai dari kosong. Sandi admin ditulis langsung di script karena ini latihan. Di aplikasi sungguhan, sandi awal tidak pernah ada di kode.

### SQL injection

Sekarang ada data untuk dicoba. Buat `bin/try-injection.php`, yang menjalankan pencarian yang sama dengan dua cara:

```php
<?php

declare(strict_types=1);

use App\Database;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::open(__DIR__ . '/../var/guestbook.sqlite');

$name = "bukan-siapa-siapa' OR '1'='1";

$vulnerable = $db->run("SELECT name FROM users WHERE name = '{$name}'")->fetchAll();
$safe = $db->run('SELECT name FROM users WHERE name = :name', ['name' => $name])->fetchAll();

echo 'Ditempel ke SQL : ' . count($vulnerable) . ' baris' . PHP_EOL;
echo 'Prepared        : ' . count($safe) . ' baris' . PHP_EOL;
```

```bash
php bin/try-injection.php
```

```text
Ditempel ke SQL : 1 baris
Prepared        : 0 baris
```

Tidak ada pengguna bernama `bukan-siapa-siapa' OR '1'='1`, tetapi cara pertama tetap mengembalikan baris admin. Tanda kutip di dalam input menutup string SQL lebih awal, dan sisanya dibaca database sebagai perintah: `WHERE name = 'bukan-siapa-siapa' OR '1'='1'`, yang benar untuk semua baris.

Pada cara kedua, teks SQL dan nilainya dikirim terpisah. Database menerima input itu sebagai satu nilai string utuh, apa pun isinya. Aturannya sederhana dan tidak punya pengecualian: **nilai dari luar tidak pernah ditempel ke teks SQL**.

PHPStan tidak menangkap ini. Bagi sistem tipe, kedua query sama-sama `string`. Di Rust, `sqlx::query!` memeriksa query saat compile; di PHP penjaganya adalah kebiasaan, dan nanti query builder Laravel yang selalu memakai placeholder.

### Transaksi

Buat `bin/try-transaction.php`. Dua operasi dijalankan dalam satu transaksi, dan yang kedua pasti gagal karena nama `admin` sudah ada:

```php
<?php

declare(strict_types=1);

use App\Database;
use App\MessageRepository;
use App\UserRepository;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::open(__DIR__ . '/../var/guestbook.sqlite');
$messages = new MessageRepository($db);
$users = new UserRepository($db);

$before = count($messages->all());

try {
    $db->transaction(static function () use ($messages, $users): void {
        $messages->add('Sistem', 'Admin kedua dibuat.');
        $users->add('admin', 'sandi-lain');
    });
} catch (PDOException $error) {
    echo 'Gagal: ' . $error->getMessage() . PHP_EOL;
}

echo "Jumlah pesan: {$before} -> " . count($messages->all()) . PHP_EOL;
```

```bash
php bin/try-transaction.php
```

```text
Gagal: SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: users.name
Jumlah pesan: 0 -> 0
```

Pesan yang sudah sempat ditambahkan ikut dibatalkan. Bentuk `transaction(fn)` ini sama dengan `DB::transaction()` di Laravel. Hapus kedua file `try-*.php`.

## Controller

Controller menerima `Request`, memanggil repository, dan mengembalikan `Response`. Buat `src/GuestbookController.php`:

<!-- file: src/GuestbookController.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use App\Http\Request;
use App\Http\Response;
use App\Http\Session;

final readonly class GuestbookController
{
    public function __construct(
        private MessageRepository $messages,
        private UserRepository $users,
    ) {}

    /**
     * @param array<string, string> $errors
     */
    public function home(array $errors = [], string $name = '', string $body = ''): Response
    {
        $html = page('Buku Tamu', 'home', [
            'messages' => $this->messages->all(),
            'csrf' => Session::csrfToken(),
            'admin' => Session::isLoggedIn(),
            'errors' => $errors,
            'name' => $name,
            'body' => $body,
        ]);

        return new Response($html, $errors === [] ? 200 : 422);
    }

    public function submit(Request $request): Response
    {
        $name = $request->input('name');
        $body = $request->input('body');
        $errors = [];

        if ($name === '' || mb_strlen($name) > 50) {
            $errors['name'] = 'Nama wajib diisi, maksimal 50 karakter.';
        }

        if ($body === '' || mb_strlen($body) > 500) {
            $errors['body'] = 'Pesan wajib diisi, maksimal 500 karakter.';
        }

        if ($errors !== []) {
            return $this->home($errors, $name, $body);
        }

        $this->messages->add($name, $body);
        Session::setFlash('Pesan terkirim.');

        return Response::redirect('/');
    }

    public function delete(int $id): Response
    {
        if (!Session::isLoggedIn()) {
            return new Response('Hanya admin yang boleh menghapus pesan.', 403);
        }

        $this->messages->delete($id);
        Session::setFlash('Pesan dihapus.');

        return Response::redirect('/');
    }

    public function loginForm(?string $error = null): Response
    {
        $html = page('Masuk', 'login', [
            'csrf' => Session::csrfToken(),
            'error' => $error,
        ]);

        return new Response($html, $error === null ? 200 : 422);
    }

    public function login(Request $request): Response
    {
        $id = $this->users->authenticate($request->input('name'), $request->form['password'] ?? '');

        if ($id === null) {
            return $this->loginForm('Nama atau sandi salah.');
        }

        Session::login($id);
        Session::setFlash('Kamu masuk sebagai admin.');

        return Response::redirect('/');
    }

    public function logout(): Response
    {
        Session::logout();
        Session::setFlash('Kamu sudah keluar.');

        return Response::redirect('/');
    }
}
```

Empat pola di dalamnya akan kamu temui lagi di Laravel:

- **Validasi di server.** Atribut `required` dan `maxlength` di form hanya membantu pengguna yang jujur. Siapa pun bisa mengirim request tanpa lewat form, jadi aturan yang sama diperiksa lagi di `submit()`. Kalau gagal, form ditampilkan ulang dengan pesan galat dan isian sebelumnya, berstatus 422.
- **POST lalu redirect.** Setelah berhasil menyimpan, `submit()` tidak menampilkan halaman, melainkan mengalihkan ke `/` dengan status 303. Tanpa itu, menekan tombol refresh akan mengirim ulang form dan menggandakan pesan.
- **Otorisasi di server.** Tombol Hapus memang hanya ditampilkan untuk admin, tetapi `delete()` tetap memeriksa sendiri. Menyembunyikan tombol bukan pengamanan.
- **Dependency lewat constructor.** Controller tidak membuat repository sendiri, melainkan menerimanya, seperti di [Bab 4](/04-oop).

Sandi diambil dari `$request->form` langsung, bukan lewat `input()`, karena `input()` memangkas spasi dan sandi tidak boleh diubah.

## Front controller

Yang tersisa adalah menyambungkan semuanya. Timpa `public/index.php`:

<!-- file: public/index.php -->
```php
<?php

declare(strict_types=1);

use App\Database;
use App\GuestbookController;
use App\Http\Request;
use App\Http\Response;
use App\Http\Session;
use App\MessageRepository;
use App\UserRepository;

require __DIR__ . '/../vendor/autoload.php';

try {
    Session::start();

    $request = Request::fromGlobals();
    $db = Database::open(__DIR__ . '/../var/guestbook.sqlite');
    $controller = new GuestbookController(new MessageRepository($db), new UserRepository($db));

    $method = $request->method;
    $path = $request->path;

    $response = match (true) {
        $method === 'GET' && $path === '/' => $controller->home(),
        $method === 'GET' && $path === '/login' => $controller->loginForm(),

        // Semua POST harus membawa token CSRF yang cocok sebelum sampai ke rute di bawahnya.
        $method === 'POST' && !Session::csrfMatches($request->input('_token')) => new Response('Token CSRF tidak cocok.', 403),

        $method === 'POST' && $path === '/messages' => $controller->submit($request),
        $method === 'POST' && $path === '/login' => $controller->login($request),
        $method === 'POST' && $path === '/logout' => $controller->logout(),
        $method === 'POST' && preg_match('#^/messages/(\d+)/delete$#', $path, $matches) === 1 => $controller->delete((int) $matches[1]),

        default => new Response('Halaman tidak ditemukan.', 404),
    };
} catch (Throwable $error) {
    error_log((string) $error);
    $response = new Response('Terjadi kesalahan di server.', 500);
}

$response->send();
```

File ini adalah *front controller*: semua request masuk lewat satu file, apa pun URL-nya. Server bawaan PHP meneruskan URL yang tidak cocok dengan file mana pun di `public/` ke `index.php`. Di server sungguhan, peran itu dipegang aturan rewrite web server, yang disiapkan di [Bab 12](/12-deploy).

Seluruh siklus hidup aplikasi terbaca dari atas ke bawah: muat autoloader, mulai session, bentuk `Request`, rakit objek, pilih rute, kirim `Response`. Semua itu diulang dari nol di setiap request.

### Routing dengan `match`

`match (true)` dari [Bab 3](/03-dasar-bahasa) mengambil lengan pertama yang kondisinya benar, jadi urutan lengan menentukan. Rute dengan bagian yang berubah-ubah, seperti `/messages/7/delete`, dicocokkan dengan `preg_match`. PHPStan membaca pola regex itu dan menyimpulkan `$matches[1]` bertipe `numeric-string`, jadi cast `(int)` di sana aman.

### CSRF

Browser menyertakan cookie session secara otomatis pada setiap request ke situsmu, termasuk request yang dipicu halaman lain. Seandainya admin sedang login lalu membuka halaman milik penyerang, halaman itu bisa berisi form tersembunyi yang mengirim POST ke `/messages/1/delete`. Server melihat cookie session admin yang sah, dan menghapus pesannya. Serangan ini disebut CSRF (*cross-site request forgery*).

Pertahanannya adalah meminta sesuatu yang tidak bisa diketahui halaman penyerang:

1. Server membuat token acak dan menyimpannya di session (`Session::csrfToken()`).
2. Setiap form menyertakan token itu sebagai field tersembunyi `_token`.
3. Setiap POST ditolak kalau token yang dikirim tidak sama dengan yang di session.

Langkah ketiga adalah lengan `match` yang diberi komentar. Posisinya di atas semua rute POST, sehingga rute baru yang ditambahkan di bawahnya otomatis terlindungi. Lengan itu berperan sebagai *middleware*: pemeriksaan yang dijalankan sebelum request sampai ke controller.

`hash_equals()` dipakai alih-alih `===` supaya lama perbandingan tidak membocorkan berapa karakter awal yang sudah benar.

### Penanganan error

`try`/`catch` terluar menangkap semua yang lolos, mencatatnya ke log, dan memberi pengunjung pesan yang tidak membocorkan apa pun. Ini berlaku sebagai jaring pengaman terakhir, pasangan dari mematikan `display_errors` di production.

## Mencoba aplikasinya

Periksa dulu seluruh kode:

```bash
composer check
```

```text
 [OK] No errors
```

Buka `http://localhost:8000` di browser, tulis beberapa pesan, lalu masuk sebagai `admin` dengan sandi `rahasia123` dan hapus salah satunya. Setelah itu, lihat dari `curl` apa yang terjadi di balik layar.

### Cookie session dengan pengaman

```bash
curl -i http://localhost:8000/
```

```text
HTTP/1.1 200 OK
Set-Cookie: PHPSESSID=c2188e105c78ed941ff537239140f33c; path=/; HttpOnly; SameSite=Lax
...
```

Bandingkan dengan cookie polos di percobaan `counter.php`: sekarang ada `HttpOnly` dan `SameSite=Lax`.

### POST tanpa token ditolak

```bash
curl -i -d "name=Budi" -d "body=Halo" http://localhost:8000/messages
```

```text
HTTP/1.1 403 Forbidden
...

Token CSRF tidak cocok.
```

### POST yang sah dialihkan

Dengan cookie dan token dari form, hasilnya redirect:

```text
HTTP/1.1 303 See Other
Location: /
```

Halaman tujuan menampilkan flash sekali, dan tidak lagi setelah dimuat ulang:

```html
<p role="status">Pesan terkirim.</p>
<h2>Budi</h2>
<p>Halo dari curl</p>
```

### Input berbahaya tampil sebagai teks

Kirim pesan dengan nama `<b>Mallory</b>` dan isi `<script>alert('xss')</script>` lewat form. Di sumber halaman, keduanya sudah di-escape:

```html
<h2>&lt;b&gt;Mallory&lt;/b&gt;</h2>
<p>&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;</p>
```

Browser menampilkannya sebagai teks biasa, dan tidak ada script yang berjalan.

### Validasi

Form dengan nama kosong dijawab 422, lengkap dengan pesan galat dan isian sebelumnya:

```html
<p role="alert">Nama wajib diisi, maksimal 50 karakter.</p>
<textarea id="body" name="body" maxlength="500" required>tanpa nama</textarea>
```

Trik `name[]=x` berakhir di tempat yang sama, karena `Request` hanya meneruskan nilai string.

### Login mengganti ID session

Menghapus pesan tanpa login ditolak:

```text
HTTP/1.1 403 Forbidden

Hanya admin yang boleh menghapus pesan.
```

Saat login berhasil, server mengirim cookie baru:

```text
HTTP/1.1 303 See Other
Set-Cookie: PHPSESSID=7961a4e01df9e9111153d6bdac8e69c0; path=/; HttpOnly; SameSite=Lax
Location: /
```

ID yang dipakai sebelum login tidak berlaku lagi. Itu hasil `session_regenerate_id(true)` di `Session::login()`.

### Error tidak bocor

Untuk melihat penanganan error bekerja, ganti nama file `var/guestbook.sqlite` sebentar lalu muat halaman:

```text
HTTP/1.1 500 Internal Server Error

Terjadi kesalahan di server.
```

Rinciannya hanya ada di log server, di terminal pertama:

```text
[Mon Nov 16 07:54:51 2026] PDOException: SQLSTATE[HY000]: General error: 1 no such table: messages in /app/src/Database.php:29
Stack trace:
#0 /app/src/Database.php(29): PDO->prepare('SELECT id, name...')
#1 /app/src/MessageRepository.php(16): App\Database->run('SELECT id, name...')
#2 /app/src/GuestbookController.php(24): App\MessageRepository->all()
#3 /app/public/index.php(26): App\GuestbookController->home()
#4 {main}
[Mon Nov 16 07:54:51 2026] 172.27.0.1:44634 [500]: GET /
```

Jalankan `php bin/setup.php` untuk memulihkan database.

## Yang kamu bangun, dan padanannya di Laravel

Aplikasi ini sekitar 650 baris termasuk templat, dan hampir semuanya adalah pekerjaan yang sama di setiap aplikasi web. Itulah yang diambil alih framework.

| Yang kamu tulis sendiri | Di Laravel |
|---|---|
| `public/index.php` dan `match` | `public/index.php` bawaan dan file rute `routes/web.php` |
| `Request::fromGlobals()` | Objek `Request` yang disuntikkan ke controller |
| `Response` dan `redirect()` | `response()` dan `redirect()` |
| Validasi dengan `if` di controller | `$request->validate()` dan Form Request |
| `e()` di setiap nilai | Blade: <span v-pre>`{{ $value }}`</span> meng-escape secara bawaan |
| `Database`, repository, `fromRow()` | Query builder dan Eloquent |
| `bin/setup.php` | Migration dan seeder |
| `Session`, flash | `session()` dan `->with()` |
| Lengan CSRF di `match` | Middleware CSRF dan direktif `@csrf` |
| `password_hash()` dan `Session::login()` | `Hash` dan `Auth` |
| `try`/`catch` di `index.php` | Exception handler |
| Merakit objek dengan `new` di `index.php` | Service container |

Dua hal dari bab ini tetap berlaku di Laravel dan tidak diambil alih siapa pun: model shared-nothing, dan kebiasaan mengubah data dari luar menjadi nilai bertipe di pintu masuk.

## Ringkasan

- **Setiap request memulai dari nol.** Tidak ada state di memori antar request; yang perlu diingat disimpan di database atau session.
- **Hanya `public/` yang terlihat dari web**, dan semua request masuk lewat `public/index.php`.
- **Superglobal dan hasil query bertipe `mixed`.** Ubah menjadi nilai bertipe di satu tempat, lalu bekerja dengan tipe itu.
- **XSS dicegah dengan meng-escape saat mencetak**, SQL injection dengan prepared statement, CSRF dengan token di setiap form.
- **PHPStan menangkap kesalahan tipe, bukan kesalahan keamanan.** Echo tanpa `e()` dan SQL yang ditempel sama-sama lolos analisis.
- **Sandi disimpan dengan `password_hash()`**, dan ID session diganti saat login.
- **Validasi dan otorisasi selalu diperiksa di server**, apa pun yang ditampilkan form.

## Latihan

### 1. Static yang tidak bertahan

Seorang rekan yang terbiasa dengan Rust menulis `public/static.php` ini dan berharap angkanya naik di setiap request, karena property `static` hidup sepanjang program. Apa output tiga request berturut-turut, dan kenapa?

```php
<?php

declare(strict_types=1);

final class Counter
{
    public static int $count = 0;
}

Counter::$count++;

echo 'Request ke-' . Counter::$count . PHP_EOL;
```

::: details Jawaban
```text
Request ke-1
Request ke-1
Request ke-1
```

Property `static` memang hidup sepanjang program, tetapi di PHP "program" adalah satu request. Class `Counter` dideklarasikan ulang dari nol setiap kali file dijalankan. Untuk menghitung lintas request, nilainya harus disimpan di luar proses: di session kalau per pengunjung, di database kalau untuk semua.
:::

### 2. Halaman pencarian

Tambahkan rute `GET /search?keyword=...` yang menampilkan pesan yang isinya mengandung kata itu. Judul halaman menyebut kata yang dicari dan jumlah seluruh pesan tersimpan, misalnya `Hasil cari: Halo (3 pesan tersimpan)`. Pakai lagi templat `home`.

Setelah jadi, coba dengan `keyword=<script>alert(1)</script>` dan `keyword=' OR '1'='1`.

::: details Jawaban
Dua method baru di `MessageRepository`:

```php
/**
 * @return list<Message>
 */
public function search(string $keyword): array
{
    $rows = $this->db->run(
        'SELECT id, name, body, created_at FROM messages WHERE body LIKE :pattern ORDER BY id DESC',
        ['pattern' => "%{$keyword}%"],
    )->fetchAll();

    return array_values(array_map(Message::fromRow(...), $rows));
}

public function count(): int
{
    $count = $this->db->run('SELECT COUNT(*) FROM messages')->fetchColumn();

    return is_int($count) ? $count : 0;
}
```

Satu method baru di `GuestbookController`:

```php
public function search(Request $request): Response
{
    $keyword = trim($request->query['keyword'] ?? '');

    $html = page("Hasil cari: {$keyword} ({$this->messages->count()} pesan tersimpan)", 'home', [
        'messages' => $keyword === '' ? [] : $this->messages->search($keyword),
        'csrf' => Session::csrfToken(),
        'admin' => Session::isLoggedIn(),
        'errors' => [],
        'name' => '',
        'body' => '',
    ]);

    return new Response($html);
}
```

Dan satu lengan baru di `match`, di antara rute GET lainnya:

```php
$method === 'GET' && $path === '/search' => $controller->search($request),
```

Yang perlu diperhatikan:

- **Tanda `%` ditempel ke nilai, bukan ke SQL.** Placeholder-nya tetap `:pattern`.
- **`fetchColumn()` bertipe `mixed`**, jadi hasil `COUNT(*)` diperiksa dengan `is_int`.
- **Pencarian tidak mengubah data**, jadi memakai GET dan tidak membutuhkan token CSRF.

Hasil kedua percobaan:

```html
<h1>Hasil cari: &lt;script&gt;alert(1)&lt;/script&gt; (3 pesan tersimpan)</h1>
```

Judul di-escape oleh `e($title)` di tata letak. Untuk `' OR '1'='1`, hasilnya nol pesan: input itu dicari sebagai teks biasa. Satu hal yang masih tersisa adalah `keyword=%`, yang mengembalikan semua pesan karena `%` adalah wildcard `LIKE`. Itu bukan injection, tetapi pantas diketahui.
:::

### 3. Menghapus lewat tautan

Seseorang mengusulkan tombol Hapus diganti tautan biasa supaya templatnya lebih ringkas:

```html
<a href="/messages/3/delete">Hapus</a>
```

dengan rute `GET /messages/{id}/delete`. Apa yang salah dengan usul ini?

::: details Jawaban
Tautan berarti request GET, dan GET tidak melewati pemeriksaan token CSRF. Akibatnya:

- **Situs lain bisa memicu penghapusan.** Cukup sebuah tautan ke `/messages/3/delete` di halaman lain yang diklik admin. `SameSite=Lax` tidak menolong, karena cookie tetap ikut pada navigasi biasa ke situsmu. Tanpa `SameSite`, tautan pun tidak perlu: gambar dengan `src` yang menunjuk URL itu sudah cukup.
- **Perangkat lunak yang mengikuti tautan bisa menghapus data**, misalnya fitur pramuat halaman di browser.

Aturannya: GET hanya untuk membaca. Semua yang mengubah data memakai POST (atau PUT, PATCH, DELETE) dan membawa token CSRF.
:::

### 4. Echo tanpa `e()`

Di `templates/home.php`, ubah `<?= nl2br(e($message->body)) ?>` menjadi `<?= $message->body ?>`, lalu jalankan `composer check`. Apa hasilnya, dan apa artinya?

::: details Jawaban
```text
 [OK] No errors
```

PHPStan tidak mengeluh, karena `$message->body` bertipe `string` dan mencetak string itu sah. Padahal aplikasinya sekarang punya celah XSS: pesan berisi `<script>` akan dijalankan browser setiap pengunjung.

Sistem tipe tidak membedakan "string yang aman untuk HTML" dari "string mentah". Di aplikasi ini penjaganya adalah kebiasaan menulis `e()`. Laravel membalik bawaannya: di Blade, <span v-pre>`{{ $message->body }}`</span> selalu meng-escape, dan mencetak mentah membutuhkan sintaks lain yang sengaja mencolok. Kembalikan baris itu seperti semula.
:::
