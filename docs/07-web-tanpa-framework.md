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

Bab ini memakai proyek baru, terpisah dari `php-dasar`. Dari PowerShell:

```powershell
mkdir latihan/web-dasar
cd latihan/web-dasar
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
    "name": "belajar/web-dasar",
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

Buat `public/hitung.php`:

```php
<?php

declare(strict_types=1);

$hitung = 0;
$hitung++;

echo "Request ke-{$hitung}" . PHP_EOL;
```

Panggil tiga kali:

```bash
curl http://localhost:8000/hitung.php
curl http://localhost:8000/hitung.php
curl http://localhost:8000/hitung.php
```

```text
Request ke-1
Request ke-1
Request ke-1
```

Di Node, kode yang setara akan terus bertambah, karena variabelnya hidup di proses server:

```ts
import { createServer } from 'node:http'

let hitung = 0

createServer((req, res) => {
  hitung++
  res.end(`Request ke-${hitung}\n`)
}).listen(8000)
```

Di PHP tidak ada tempat untuk menaruh `let hitung` itu. Setiap request memulai dari file yang sama dengan memori kosong. Kamu juga tidak me-restart apa pun setelah membuat `hitung.php`: file itu langsung bisa dipanggil, karena memang dibaca ulang di setiap request.

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

Semua isinya berasal dari luar, jadi PHPStan menganggapnya `mixed`. Buat `public/sapa.php`:

```php
<?php

declare(strict_types=1);

echo 'Halo, ' . strtoupper($_GET['nama']) . PHP_EOL;
```

```bash
composer check
```

```text
 ------ -------------------------------------------------------------------
  Line   public/sapa.php
 ------ -------------------------------------------------------------------
  5      Parameter #1 $string of function strtoupper expects string, mixed
         given.
         🪪  argument.type
 ------ -------------------------------------------------------------------

 [ERROR] Found 1 error
```

Keluhan PHPStan itu bukan formalitas. Dengan input yang wajar, script ini jalan:

```bash
curl "http://localhost:8000/sapa.php?nama=budi"
```

```text
Halo, BUDI
```

Tanpa parameter, ia gagal:

```bash
curl "http://localhost:8000/sapa.php"
```

```text
<br />
<b>Warning</b>:  Undefined array key "nama" in <b>/app/public/sapa.php</b> on line <b>5</b><br />
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, null given in /app/public/sapa.php:5
```

Dan pengirim bisa membuat nilainya menjadi array, cukup dengan menambahkan `[]` pada nama parameter:

```bash
curl -g "http://localhost:8000/sapa.php?nama[]=budi"
```

```text
<br />
<b>Fatal error</b>:  Uncaught TypeError: strtoupper(): Argument #1 ($string) must be of type string, array given in /app/public/sapa.php:5
```

Itulah sebabnya tipenya `mixed`: sebuah parameter bisa tidak ada, bisa string, dan bisa array bersarang. Ada masalah ketiga, yaitu input dicetak mentah-mentah ke halaman:

```bash
curl -g "http://localhost:8000/sapa.php?nama=<script>alert(1)</script>"
```

```text
Halo, <SCRIPT>ALERT(1)</SCRIPT>
```

Browser akan menjalankan tag itu sebagai JavaScript. Ini celah XSS, yang dibahas di bagian templat.

Perbaikannya mengikuti pola yang sama dengan `mixed` di [Bab 2](/02-type-system): periksa bentuknya di pintu masuk, dan setelah itu bekerja dengan tipe yang pasti. Timpa `sapa.php`:

```php
<?php

declare(strict_types=1);

$nama = $_GET['nama'] ?? null;

if (!is_string($nama) || $nama === '') {
    http_response_code(400);
    echo 'Parameter nama wajib diisi.' . PHP_EOL;

    return;
}

echo 'Halo, ' . htmlspecialchars(strtoupper($nama)) . PHP_EOL;
```

Sekarang `composer check` lulus, dan ketiga kasus tadi tertangani:

```text
$ curl -g "http://localhost:8000/sapa.php?nama[]=budi"
Parameter nama wajib diisi.

$ curl -g "http://localhost:8000/sapa.php?nama=<script>alert(1)</script>"
Halo, &lt;SCRIPT&gt;ALERT(1)&lt;/SCRIPT&gt;
```

::: warning Pesan error tadi tampil ke pengunjung
Dua output error di atas dikirim ke browser lengkap dengan path file di server, dan dengan status 200. Image `php:8.5-cli` berjalan tanpa `php.ini`, sehingga `display_errors` menyala. Itu membantu saat development, tetapi di production harus dimatikan dan error dicatat ke log. Pengaturannya dibahas di [Bab 12](/12-deploy).
:::

Hapus `public/hitung.php` dan `public/sapa.php`. Mulai dari sini kita membangun aplikasinya.

## Rancangan aplikasi

Buku tamu ini punya fitur secukupnya untuk menyentuh semua topik bab:

- Siapa pun bisa membaca dan menulis pesan.
- Admin bisa masuk dengan sandi, lalu menghapus pesan.

Susunan file akhirnya:

```text
web-dasar/
├── bin/
│   └── siapkan.php            membuat database dan akun admin
├── public/
│   └── index.php              satu-satunya pintu masuk dari web
├── src/
│   ├── Http/
│   │   ├── Request.php        input yang sudah bertipe
│   │   ├── Response.php       status, header, dan isi
│   │   └── Session.php        session, flash, token CSRF
│   ├── BukuTamuController.php
│   ├── Database.php           pembungkus tipis di atas PDO
│   ├── PenggunaRepository.php
│   ├── Pesan.php
│   ├── PesanRepository.php
│   └── fungsi.php             e(), tampilkan(), halaman()
├── templates/
│   ├── beranda.php
│   ├── masuk.php
│   └── tata-letak.php
└── var/
    └── bukutamu.sqlite        dibuat oleh bin/siapkan.php
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

    public static function dariGlobal(): self
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? null;
        $uri = $_SERVER['REQUEST_URI'] ?? null;
        $path = is_string($uri) ? parse_url($uri, PHP_URL_PATH) : null;

        return new self(
            is_string($method) ? $method : 'GET',
            is_string($path) ? $path : '/',
            self::hanyaString($_GET),
            self::hanyaString($_POST),
        );
    }

    public function input(string $kunci): string
    {
        return trim($this->form[$kunci] ?? '');
    }

    /**
     * @param array<mixed> $data
     * @return array<string, string>
     */
    private static function hanyaString(array $data): array
    {
        $hasil = [];

        foreach ($data as $kunci => $nilai) {
            if (is_string($kunci) && is_string($nilai)) {
                $hasil[$kunci] = $nilai;
            }
        }

        return $hasil;
    }
}
```

`hanyaString()` membuang nilai yang bukan string, sehingga trik `nama[]=x` tadi berakhir sebagai field kosong, bukan `TypeError`. Aplikasi ini memang tidak membutuhkan input berupa array.

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
        public string $isi,
        public int $status = 200,
        public array $header = [],
    ) {}

    public static function alihkan(string $tujuan): self
    {
        return new self('', 303, ['Location' => $tujuan]);
    }

    public function kirim(): void
    {
        http_response_code($this->status);

        foreach ($this->header as $nama => $nilai) {
            header("{$nama}: {$nilai}");
        }

        echo $this->isi;
    }
}
```

Bentuknya sama dengan handler di axum atau Express: fungsi yang menerima request dan mengembalikan response.

## Session dan cookie

HTTP tidak mengingat siapa pengirim request, dan PHP tidak menyimpan apa pun di memori. Session menjembatani keduanya:

1. `session_start()` membuat ID acak dan mengirimnya ke browser sebagai cookie.
2. Data yang kamu taruh di `$_SESSION` disimpan di server, dalam file yang dinamai dengan ID itu.
3. Di request berikutnya browser mengirim cookie tadi, dan `session_start()` memuat kembali datanya.

Buat lagi `public/hitung.php`, kali ini dengan session:

```php
<?php

declare(strict_types=1);

session_start();

$hitung = $_SESSION['hitung'] ?? 0;
$hitung = is_int($hitung) ? $hitung + 1 : 1;
$_SESSION['hitung'] = $hitung;

echo "Request ke-{$hitung}" . PHP_EOL;
```

Opsi `-c` dan `-b` membuat `curl` menyimpan dan mengirim cookie seperti browser:

```bash
curl -c /tmp/kue -b /tmp/kue http://localhost:8000/hitung.php
curl -c /tmp/kue -b /tmp/kue http://localhost:8000/hitung.php
curl -c /tmp/kue -b /tmp/kue http://localhost:8000/hitung.php
```

```text
Request ke-1
Request ke-2
Request ke-3
```

Tanpa cookie, server menganggapmu pengunjung baru:

```bash
curl -i http://localhost:8000/hitung.php
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
hitung|i:3;
```

Nama file di tempatmu berbeda, karena ID session selalu acak. Dua hal perlu dicatat dari percobaan ini:

- **`$_SESSION` juga `mixed`.** Karena itu nilainya diperiksa dengan `is_int` sebelum dijumlahkan.
- **Cookie bawaan tidak punya pengaman apa pun.** Header `Set-Cookie` di atas hanya berisi `path=/`.

Hapus `public/hitung.php`. Class berikut membungkus semua akses session aplikasi dan memasang pengamannya. Buat `src/Http/Session.php`:

<!-- file: src/Http/Session.php -->
```php
<?php

declare(strict_types=1);

namespace App\Http;

final class Session
{
    public static function mulai(): void
    {
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax',
            'use_strict_mode' => true,
        ]);
    }

    public static function tokenCsrf(): string
    {
        $token = $_SESSION['csrf'] ?? null;

        if (!is_string($token)) {
            $token = bin2hex(random_bytes(32));
            $_SESSION['csrf'] = $token;
        }

        return $token;
    }

    public static function csrfCocok(string $kiriman): bool
    {
        return hash_equals(self::tokenCsrf(), $kiriman);
    }

    public static function setFlash(string $pesan): void
    {
        $_SESSION['flash'] = $pesan;
    }

    public static function ambilFlash(): ?string
    {
        $pesan = $_SESSION['flash'] ?? null;
        unset($_SESSION['flash']);

        return is_string($pesan) ? $pesan : null;
    }

    public static function masuk(int $idPengguna): void
    {
        session_regenerate_id(true);
        $_SESSION['pengguna'] = $idPengguna;
    }

    public static function keluar(): void
    {
        $_SESSION = [];
        session_regenerate_id(true);
    }

    public static function sudahMasuk(): bool
    {
        return is_int($_SESSION['pengguna'] ?? null);
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

- **`<?= $nilai ?>`** adalah singkatan `<?php echo $nilai ?>`.
- **`<?php if (...): ?>` sampai `<?php endif ?>`** adalah sintaks alternatif untuk blok, lebih mudah dibaca di antara HTML daripada kurung kurawal. Ada juga `foreach (...):` dan `endforeach`.

### Escaping

Di percobaan `sapa.php`, input yang dicetak mentah berubah menjadi tag `<script>` di halaman. Itulah XSS (*cross-site scripting*): teks dari pengguna diperlakukan browser sebagai HTML. Obatnya satu, yaitu meng-escape setiap nilai tepat saat dicetak ke HTML.

Buat `src/fungsi.php`:

<!-- file: src/fungsi.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use App\Http\Session;

function e(string $teks): string
{
    return htmlspecialchars($teks);
}

/**
 * @param array<string, mixed> $data
 */
function tampilkan(string $templat, array $data = []): string
{
    extract($data);
    ob_start();
    require __DIR__ . "/../templates/{$templat}.php";

    return (string) ob_get_clean();
}

/**
 * @param array<string, mixed> $data
 */
function halaman(string $judul, string $templat, array $data = []): string
{
    return tampilkan('tata-letak', [
        'judul' => $judul,
        'isi' => tampilkan($templat, $data),
        'flash' => Session::ambilFlash(),
        'admin' => Session::sudahMasuk(),
        'csrf' => Session::tokenCsrf(),
    ]);
}
```

Tiga fungsi itu:

- **`e()`** mengubah `<`, `>`, `&`, dan tanda kutip menjadi entity HTML. Namanya pendek karena dipanggil di setiap nilai yang dicetak.
- **`tampilkan()`** menjalankan sebuah file templat dan mengembalikan hasilnya sebagai string. `extract()` mengubah kunci array menjadi variabel lokal, dan pasangan `ob_start()` dengan `ob_get_clean()` menampung output `echo` ke dalam buffer alih-alih mengirimnya.
- **`halaman()`** membungkus hasil sebuah templat dengan tata letak bersama.

Seperti di [Bab 6](/06-ekosistem), file berisi fungsi harus didaftarkan sendiri. Tambahkan entri `files` ke `autoload` di `composer.json`, lalu buat ulang autoloader:

```json
"autoload": {
    "psr-4": {
        "App\\": "src/"
    },
    "files": [
        "src/fungsi.php"
    ]
}
```

```bash
composer dump-autoload
```

### File templat

Buat `templates/tata-letak.php`:

<!-- file: templates/tata-letak.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var string $judul
 * @var string $isi
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
    <title><?= e($judul) ?></title>
</head>
<body>
    <nav>
        <a href="/">Buku Tamu</a>
        <?php if ($admin): ?>
            <form method="post" action="/keluar">
                <input type="hidden" name="_token" value="<?= e($csrf) ?>">
                <button>Keluar</button>
            </form>
        <?php else: ?>
            <a href="/masuk">Masuk</a>
        <?php endif ?>
    </nav>

    <?php if ($flash !== null): ?>
        <p role="status"><?= e($flash) ?></p>
    <?php endif ?>

    <main>
        <h1><?= e($judul) ?></h1>
        <?= $isi ?>
    </main>
</body>
</html>
```

Buat `templates/beranda.php`:

<!-- file: templates/beranda.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var list<App\Pesan> $daftarPesan
 * @var string $csrf
 * @var bool $admin
 * @var array<string, string> $galat
 * @var string $nama
 * @var string $isi
 */
?>
<form method="post" action="/pesan">
    <input type="hidden" name="_token" value="<?= e($csrf) ?>">

    <label for="nama">Nama</label>
    <input id="nama" name="nama" value="<?= e($nama) ?>" maxlength="50" required>
    <?php if (isset($galat['nama'])): ?>
        <p role="alert"><?= e($galat['nama']) ?></p>
    <?php endif ?>

    <label for="isi">Pesan</label>
    <textarea id="isi" name="isi" maxlength="500" required><?= e($isi) ?></textarea>
    <?php if (isset($galat['isi'])): ?>
        <p role="alert"><?= e($galat['isi']) ?></p>
    <?php endif ?>

    <button>Kirim</button>
</form>

<?php foreach ($daftarPesan as $pesan): ?>
    <article>
        <h2><?= e($pesan->nama) ?></h2>
        <time datetime="<?= e($pesan->dibuat->format('c')) ?>"><?= e($pesan->dibuat->format('d M Y H:i')) ?></time>
        <p><?= nl2br(e($pesan->isi)) ?></p>

        <?php if ($admin): ?>
            <form method="post" action="/pesan/<?= $pesan->id ?>/hapus">
                <input type="hidden" name="_token" value="<?= e($csrf) ?>">
                <button>Hapus</button>
            </form>
        <?php endif ?>
    </article>
<?php endforeach ?>
```

Buat `templates/masuk.php`:

<!-- file: templates/masuk.php -->
```php
<?php

declare(strict_types=1);

use function App\e;

/**
 * @var string $csrf
 * @var string|null $galat
 */
?>
<form method="post" action="/masuk">
    <input type="hidden" name="_token" value="<?= e($csrf) ?>">

    <?php if ($galat !== null): ?>
        <p role="alert"><?= e($galat) ?></p>
    <?php endif ?>

    <label for="nama">Nama</label>
    <input id="nama" name="nama" autocomplete="username" required>

    <label for="sandi">Sandi</label>
    <input id="sandi" name="sandi" type="password" autocomplete="current-password" required>

    <button>Masuk</button>
</form>
```

Dua pengecualian dari aturan "selalu `e()`" ada di file-file itu, dan keduanya punya alasan:

- **`<?= $isi ?>`** di tata letak: isinya HTML hasil templat lain yang nilainya sudah di-escape satu per satu. Meng-escape-nya lagi justru menampilkan tag sebagai teks.
- **`<?= $pesan->id ?>`**: bertipe `int`, tidak mungkin berisi HTML.

### Templat ikut diperiksa PHPStan

Blok `@var` di awal tiap templat menyatakan variabel apa yang diterima file itu beserta tipenya. Karena folder `templates` masuk ke `paths`, isinya diperiksa seperti kode lain. Kalau baris `@var list<App\Pesan> $daftarPesan` dihapus:

```text
  33     Argument of an invalid type mixed supplied for foreach, only
         iterables are supported.
         🪪  foreach.nonIterable
  33     Variable $daftarPesan might not be defined.
         🪪  variable.undefined
  35     Cannot access property $nama on mixed.
         🪪  property.nonObject
  ...
```

Dan kalau `e($pesan->nama)` salah ditulis menjadi `e($pesan->id)`:

```text
  36     Parameter #1 $teks of function App\e expects string, int given.
         🪪  argument.type
```

Ada batasnya, dan sebaiknya kamu tahu di mana. PHPStan mempercayai `@var` begitu saja. Ia tidak memeriksa apakah array yang dikirim controller ke `tampilkan()` benar-benar berisi kunci dan tipe yang dijanjikan templat. Batas antara controller dan templat adalah satu tempat di aplikasi ini yang dijaga oleh disiplin, bukan oleh tipe.

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

    public static function buka(string $berkas): self
    {
        return new self(new PDO("sqlite:{$berkas}", options: [
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]));
    }

    /**
     * @param array<string, int|string> $parameter
     */
    public function jalankan(string $sql, array $parameter = []): PDOStatement
    {
        $perintah = $this->pdo->prepare($sql);

        // prepare() bertipe PDOStatement|false, walaupun dalam mode exception false tidak pernah muncul.
        if ($perintah === false) {
            throw new RuntimeException('Query gagal disiapkan');
        }

        $perintah->execute($parameter);

        return $perintah;
    }

    /**
     * @template T
     *
     * @param Closure(): T $aksi
     * @return T
     */
    public function transaksi(Closure $aksi): mixed
    {
        $this->pdo->beginTransaction();

        try {
            $hasil = $aksi();
            $this->pdo->commit();

            return $hasil;
        } catch (Throwable $galat) {
            $this->pdo->rollBack();

            throw $galat;
        }
    }
}
```

Yang perlu diperhatikan:

- **`"sqlite:{$berkas}"`** adalah DSN, string koneksi PDO. Untuk MySQL bentuknya `mysql:host=...;dbname=...`, ditambah nama pengguna dan sandi sebagai argumen berikutnya.
- **`FETCH_ASSOC`** membuat setiap baris hasil query berupa array dengan nama kolom sebagai kunci.
- **Kegagalan query melempar `PDOException`.** Itu mode bawaan sejak PHP 8.
- **`jalankan()` selalu memakai prepared statement.** Alasannya ada di bagian SQL injection di bawah.
- **`transaksi()`** memakai generics dari [Bab 2](/02-type-system): apa pun yang dikembalikan closure menjadi tipe kembaliannya.

Pengecekan `=== false` adalah contoh warisan lama dari [Bab 5](/05-error-handling). Tanpa pengecekan itu PHPStan menolak:

```text
  32     Cannot call method execute() on PDOStatement|false.
         🪪  method.nonObject
  34     Method App\Database::jalankan() should return PDOStatement but
         returns (PDOStatement|false).
         🪪  return.type
```

### Dari baris ke objek

Hasil query adalah array yang isinya ditentukan database, bukan oleh kodemu. Bagi PHPStan itu `mixed`, sama seperti superglobal. Polanya juga sama: ubah menjadi objek bertipe di satu tempat. Buat `src/Pesan.php`:

<!-- file: src/Pesan.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use DateTimeImmutable;
use UnexpectedValueException;

final readonly class Pesan
{
    public function __construct(
        public int $id,
        public string $nama,
        public string $isi,
        public DateTimeImmutable $dibuat,
    ) {}

    public static function dariBaris(mixed $baris): self
    {
        $baris = is_array($baris) ? $baris : [];
        $id = $baris['id'] ?? null;
        $nama = $baris['nama'] ?? null;
        $isi = $baris['isi'] ?? null;
        $dibuat = $baris['dibuat'] ?? null;

        if (!is_int($id) || !is_string($nama) || !is_string($isi) || !is_string($dibuat)) {
            throw new UnexpectedValueException('Baris tabel pesan tidak sesuai bentuk yang diharapkan');
        }

        return new self($id, $nama, $isi, new DateTimeImmutable($dibuat));
    }
}
```

Ini padanan `serde` atau schema zod yang ditulis tangan: kalau bentuk baris tidak sesuai, program berhenti di batas ini, bukan jauh di dalam templat.

Buat `src/PesanRepository.php`:

<!-- file: src/PesanRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class PesanRepository
{
    public function __construct(private Database $db) {}

    /**
     * @return list<Pesan>
     */
    public function semua(): array
    {
        $baris = $this->db->jalankan('SELECT id, nama, isi, dibuat FROM pesan ORDER BY id DESC')->fetchAll();

        return array_values(array_map(Pesan::dariBaris(...), $baris));
    }

    public function tambah(string $nama, string $isi): void
    {
        $this->db->jalankan('INSERT INTO pesan (nama, isi, dibuat) VALUES (:nama, :isi, :dibuat)', [
            'nama' => $nama,
            'isi' => $isi,
            'dibuat' => date('Y-m-d H:i:s'),
        ]);
    }

    public function hapus(int $id): void
    {
        $this->db->jalankan('DELETE FROM pesan WHERE id = :id', ['id' => $id]);
    }
}
```

`:nama`, `:isi`, dan `:dibuat` adalah *placeholder*. Nilainya dikirim terpisah dari teks SQL lewat array di argumen kedua.

## Menyimpan sandi

Sandi tidak pernah disimpan apa adanya, dan tidak di-hash dengan fungsi hash umum seperti SHA-256 yang terlalu cepat untuk keperluan ini. PHP punya dua fungsi khusus. Buat `bin/coba-sandi.php`:

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
php bin/coba-sandi.php
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

Hapus file coba-coba itu, lalu buat `src/PenggunaRepository.php`:

<!-- file: src/PenggunaRepository.php -->
```php
<?php

declare(strict_types=1);

namespace App;

final readonly class PenggunaRepository
{
    public function __construct(private Database $db) {}

    public function tambah(string $nama, string $sandi): void
    {
        $this->db->jalankan('INSERT INTO pengguna (nama, hash_sandi) VALUES (:nama, :hash)', [
            'nama' => $nama,
            'hash' => password_hash($sandi, PASSWORD_DEFAULT),
        ]);
    }

    /**
     * Mengembalikan id pengguna kalau nama dan sandinya cocok.
     */
    public function autentikasi(string $nama, string $sandi): ?int
    {
        $baris = $this->db->jalankan('SELECT id, hash_sandi FROM pengguna WHERE nama = :nama', ['nama' => $nama])->fetch();
        $baris = is_array($baris) ? $baris : [];
        $id = $baris['id'] ?? null;
        $hash = $baris['hash_sandi'] ?? null;

        if (!is_int($id) || !is_string($hash) || !password_verify($sandi, $hash)) {
            return null;
        }

        return $id;
    }
}
```

`autentikasi()` mengembalikan `null` baik saat nama tidak dikenal maupun saat sandinya salah. Pemanggil sengaja tidak diberi tahu yang mana, supaya halaman login tidak bisa dipakai untuk menebak nama pengguna yang terdaftar.

## Membuat database

Buat `bin/siapkan.php`:

<!-- file: bin/siapkan.php -->
```php
<?php

declare(strict_types=1);

use App\Database;
use App\PenggunaRepository;

require __DIR__ . '/../vendor/autoload.php';

$folder = __DIR__ . '/../var';
$berkas = $folder . '/bukutamu.sqlite';

if (!is_dir($folder)) {
    mkdir($folder);
}

if (is_file($berkas)) {
    unlink($berkas);
}

$db = Database::buka($berkas);

$db->transaksi(static function () use ($db): void {
    $db->jalankan('CREATE TABLE pesan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        isi TEXT NOT NULL,
        dibuat TEXT NOT NULL
    )');

    $db->jalankan('CREATE TABLE pengguna (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL UNIQUE,
        hash_sandi TEXT NOT NULL
    )');

    new PenggunaRepository($db)->tambah('admin', 'rahasia123');
});

echo 'Database siap: ' . realpath($berkas) . PHP_EOL;
```

```bash
php bin/siapkan.php
```

```text
Database siap: /app/var/bukutamu.sqlite
```

Script ini menghapus database lama dan membuat yang baru, jadi aman dijalankan ulang kapan pun kamu ingin mulai dari kosong. Sandi admin ditulis langsung di script karena ini latihan. Di aplikasi sungguhan, sandi awal tidak pernah ada di kode.

### SQL injection

Sekarang ada data untuk dicoba. Buat `bin/coba-injeksi.php`, yang menjalankan pencarian yang sama dengan dua cara:

```php
<?php

declare(strict_types=1);

use App\Database;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::buka(__DIR__ . '/../var/bukutamu.sqlite');

$nama = "bukan-siapa-siapa' OR '1'='1";

$rentan = $db->jalankan("SELECT nama FROM pengguna WHERE nama = '{$nama}'")->fetchAll();
$aman = $db->jalankan('SELECT nama FROM pengguna WHERE nama = :nama', ['nama' => $nama])->fetchAll();

echo 'Ditempel ke SQL : ' . count($rentan) . ' baris' . PHP_EOL;
echo 'Prepared        : ' . count($aman) . ' baris' . PHP_EOL;
```

```bash
php bin/coba-injeksi.php
```

```text
Ditempel ke SQL : 1 baris
Prepared        : 0 baris
```

Tidak ada pengguna bernama `bukan-siapa-siapa' OR '1'='1`, tetapi cara pertama tetap mengembalikan baris admin. Tanda kutip di dalam input menutup string SQL lebih awal, dan sisanya dibaca database sebagai perintah: `WHERE nama = 'bukan-siapa-siapa' OR '1'='1'`, yang benar untuk semua baris.

Pada cara kedua, teks SQL dan nilainya dikirim terpisah. Database menerima input itu sebagai satu nilai string utuh, apa pun isinya. Aturannya sederhana dan tidak punya pengecualian: **nilai dari luar tidak pernah ditempel ke teks SQL**.

PHPStan tidak menangkap ini. Bagi sistem tipe, kedua query sama-sama `string`. Di Rust, `sqlx::query!` memeriksa query saat compile; di PHP penjaganya adalah kebiasaan, dan nanti query builder Laravel yang selalu memakai placeholder.

### Transaksi

Buat `bin/coba-transaksi.php`. Dua operasi dijalankan dalam satu transaksi, dan yang kedua pasti gagal karena nama `admin` sudah ada:

```php
<?php

declare(strict_types=1);

use App\Database;
use App\PenggunaRepository;
use App\PesanRepository;

require __DIR__ . '/../vendor/autoload.php';

$db = Database::buka(__DIR__ . '/../var/bukutamu.sqlite');
$pesan = new PesanRepository($db);
$pengguna = new PenggunaRepository($db);

$sebelum = count($pesan->semua());

try {
    $db->transaksi(static function () use ($pesan, $pengguna): void {
        $pesan->tambah('Sistem', 'Admin kedua dibuat.');
        $pengguna->tambah('admin', 'sandi-lain');
    });
} catch (PDOException $galat) {
    echo 'Gagal: ' . $galat->getMessage() . PHP_EOL;
}

echo "Jumlah pesan: {$sebelum} -> " . count($pesan->semua()) . PHP_EOL;
```

```bash
php bin/coba-transaksi.php
```

```text
Gagal: SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: pengguna.nama
Jumlah pesan: 0 -> 0
```

Pesan yang sudah sempat ditambahkan ikut dibatalkan. Bentuk `transaksi(fn)` ini sama dengan `DB::transaction()` di Laravel. Hapus kedua file `coba-*.php`.

## Controller

Controller menerima `Request`, memanggil repository, dan mengembalikan `Response`. Buat `src/BukuTamuController.php`:

<!-- file: src/BukuTamuController.php -->
```php
<?php

declare(strict_types=1);

namespace App;

use App\Http\Request;
use App\Http\Response;
use App\Http\Session;

final readonly class BukuTamuController
{
    public function __construct(
        private PesanRepository $pesan,
        private PenggunaRepository $pengguna,
    ) {}

    /**
     * @param array<string, string> $galat
     */
    public function beranda(array $galat = [], string $nama = '', string $isi = ''): Response
    {
        $html = halaman('Buku Tamu', 'beranda', [
            'daftarPesan' => $this->pesan->semua(),
            'csrf' => Session::tokenCsrf(),
            'admin' => Session::sudahMasuk(),
            'galat' => $galat,
            'nama' => $nama,
            'isi' => $isi,
        ]);

        return new Response($html, $galat === [] ? 200 : 422);
    }

    public function kirim(Request $request): Response
    {
        $nama = $request->input('nama');
        $isi = $request->input('isi');
        $galat = [];

        if ($nama === '' || mb_strlen($nama) > 50) {
            $galat['nama'] = 'Nama wajib diisi, maksimal 50 karakter.';
        }

        if ($isi === '' || mb_strlen($isi) > 500) {
            $galat['isi'] = 'Pesan wajib diisi, maksimal 500 karakter.';
        }

        if ($galat !== []) {
            return $this->beranda($galat, $nama, $isi);
        }

        $this->pesan->tambah($nama, $isi);
        Session::setFlash('Pesan terkirim.');

        return Response::alihkan('/');
    }

    public function hapus(int $id): Response
    {
        if (!Session::sudahMasuk()) {
            return new Response('Hanya admin yang boleh menghapus pesan.', 403);
        }

        $this->pesan->hapus($id);
        Session::setFlash('Pesan dihapus.');

        return Response::alihkan('/');
    }

    public function formMasuk(?string $galat = null): Response
    {
        $html = halaman('Masuk', 'masuk', [
            'csrf' => Session::tokenCsrf(),
            'galat' => $galat,
        ]);

        return new Response($html, $galat === null ? 200 : 422);
    }

    public function masuk(Request $request): Response
    {
        $id = $this->pengguna->autentikasi($request->input('nama'), $request->form['sandi'] ?? '');

        if ($id === null) {
            return $this->formMasuk('Nama atau sandi salah.');
        }

        Session::masuk($id);
        Session::setFlash('Kamu masuk sebagai admin.');

        return Response::alihkan('/');
    }

    public function keluar(): Response
    {
        Session::keluar();
        Session::setFlash('Kamu sudah keluar.');

        return Response::alihkan('/');
    }
}
```

Empat pola di dalamnya akan kamu temui lagi di Laravel:

- **Validasi di server.** Atribut `required` dan `maxlength` di form hanya membantu pengguna yang jujur. Siapa pun bisa mengirim request tanpa lewat form, jadi aturan yang sama diperiksa lagi di `kirim()`. Kalau gagal, form ditampilkan ulang dengan pesan galat dan isian sebelumnya, berstatus 422.
- **POST lalu redirect.** Setelah berhasil menyimpan, `kirim()` tidak menampilkan halaman, melainkan mengalihkan ke `/` dengan status 303. Tanpa itu, menekan tombol refresh akan mengirim ulang form dan menggandakan pesan.
- **Otorisasi di server.** Tombol Hapus memang hanya ditampilkan untuk admin, tetapi `hapus()` tetap memeriksa sendiri. Menyembunyikan tombol bukan pengamanan.
- **Dependency lewat constructor.** Controller tidak membuat repository sendiri, melainkan menerimanya, seperti di [Bab 4](/04-oop).

Sandi diambil dari `$request->form` langsung, bukan lewat `input()`, karena `input()` memangkas spasi dan sandi tidak boleh diubah.

## Front controller

Yang tersisa adalah menyambungkan semuanya. Timpa `public/index.php`:

<!-- file: public/index.php -->
```php
<?php

declare(strict_types=1);

use App\BukuTamuController;
use App\Database;
use App\Http\Request;
use App\Http\Response;
use App\Http\Session;
use App\PenggunaRepository;
use App\PesanRepository;

require __DIR__ . '/../vendor/autoload.php';

try {
    Session::mulai();

    $request = Request::dariGlobal();
    $db = Database::buka(__DIR__ . '/../var/bukutamu.sqlite');
    $kontroler = new BukuTamuController(new PesanRepository($db), new PenggunaRepository($db));

    $metode = $request->method;
    $path = $request->path;

    $respons = match (true) {
        $metode === 'GET' && $path === '/' => $kontroler->beranda(),
        $metode === 'GET' && $path === '/masuk' => $kontroler->formMasuk(),

        // Semua POST harus membawa token CSRF yang cocok sebelum sampai ke rute di bawahnya.
        $metode === 'POST' && !Session::csrfCocok($request->input('_token')) => new Response('Token CSRF tidak cocok.', 403),

        $metode === 'POST' && $path === '/pesan' => $kontroler->kirim($request),
        $metode === 'POST' && $path === '/masuk' => $kontroler->masuk($request),
        $metode === 'POST' && $path === '/keluar' => $kontroler->keluar(),
        $metode === 'POST' && preg_match('#^/pesan/(\d+)/hapus$#', $path, $cocok) === 1 => $kontroler->hapus((int) $cocok[1]),

        default => new Response('Halaman tidak ditemukan.', 404),
    };
} catch (Throwable $galat) {
    error_log((string) $galat);
    $respons = new Response('Terjadi kesalahan di server.', 500);
}

$respons->kirim();
```

File ini adalah *front controller*: semua request masuk lewat satu file, apa pun URL-nya. Server bawaan PHP meneruskan URL yang tidak cocok dengan file mana pun di `public/` ke `index.php`. Di server sungguhan, peran itu dipegang aturan rewrite web server, yang disiapkan di [Bab 12](/12-deploy).

Seluruh siklus hidup aplikasi terbaca dari atas ke bawah: muat autoloader, mulai session, bentuk `Request`, rakit objek, pilih rute, kirim `Response`. Semua itu diulang dari nol di setiap request.

### Routing dengan `match`

`match (true)` dari [Bab 3](/03-dasar-bahasa) mengambil lengan pertama yang kondisinya benar, jadi urutan lengan menentukan. Rute dengan bagian yang berubah-ubah, seperti `/pesan/7/hapus`, dicocokkan dengan `preg_match`. PHPStan membaca pola regex itu dan menyimpulkan `$cocok[1]` bertipe `numeric-string`, jadi cast `(int)` di sana aman.

### CSRF

Browser menyertakan cookie session secara otomatis pada setiap request ke situsmu, termasuk request yang dipicu halaman lain. Seandainya admin sedang login lalu membuka halaman milik penyerang, halaman itu bisa berisi form tersembunyi yang mengirim POST ke `/pesan/1/hapus`. Server melihat cookie session admin yang sah, dan menghapus pesannya. Serangan ini disebut CSRF (*cross-site request forgery*).

Pertahanannya adalah meminta sesuatu yang tidak bisa diketahui halaman penyerang:

1. Server membuat token acak dan menyimpannya di session (`Session::tokenCsrf()`).
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

Bandingkan dengan cookie polos di percobaan `hitung.php`: sekarang ada `HttpOnly` dan `SameSite=Lax`.

### POST tanpa token ditolak

```bash
curl -i -d "nama=Budi" -d "isi=Halo" http://localhost:8000/pesan
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
<textarea id="isi" name="isi" maxlength="500" required>tanpa nama</textarea>
```

Trik `nama[]=x` berakhir di tempat yang sama, karena `Request` hanya meneruskan nilai string.

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

ID yang dipakai sebelum login tidak berlaku lagi. Itu hasil `session_regenerate_id(true)` di `Session::masuk()`.

### Error tidak bocor

Untuk melihat penanganan error bekerja, ganti nama file `var/bukutamu.sqlite` sebentar lalu muat halaman:

```text
HTTP/1.1 500 Internal Server Error

Terjadi kesalahan di server.
```

Rinciannya hanya ada di log server, di terminal pertama:

```text
[Mon Nov 16 07:54:51 2026] PDOException: SQLSTATE[HY000]: General error: 1 no such table: pesan in /app/src/Database.php:29
Stack trace:
#0 /app/src/Database.php(29): PDO->prepare('SELECT id, nama...')
#1 /app/src/PesanRepository.php(16): App\Database->jalankan('SELECT id, nama...')
#2 /app/src/BukuTamuController.php(24): App\PesanRepository->semua()
#3 /app/public/index.php(26): App\BukuTamuController->beranda()
#4 {main}
[Mon Nov 16 07:54:51 2026] 172.27.0.1:44634 [500]: GET /
```

Jalankan `php bin/siapkan.php` untuk memulihkan database.

## Yang kamu bangun, dan padanannya di Laravel

Aplikasi ini sekitar 650 baris termasuk templat, dan hampir semuanya adalah pekerjaan yang sama di setiap aplikasi web. Itulah yang diambil alih framework.

| Yang kamu tulis sendiri | Di Laravel |
|---|---|
| `public/index.php` dan `match` | `public/index.php` bawaan dan file rute `routes/web.php` |
| `Request::dariGlobal()` | Objek `Request` yang disuntikkan ke controller |
| `Response` dan `alihkan()` | `response()` dan `redirect()` |
| Validasi dengan `if` di controller | `$request->validate()` dan Form Request |
| `e()` di setiap nilai | Blade: <span v-pre>`{{ $nilai }}`</span> meng-escape secara bawaan |
| `Database`, repository, `dariBaris()` | Query builder dan Eloquent |
| `bin/siapkan.php` | Migration dan seeder |
| `Session`, flash | `session()` dan `->with()` |
| Lengan CSRF di `match` | Middleware CSRF dan direktif `@csrf` |
| `password_hash()` dan `Session::masuk()` | `Hash` dan `Auth` |
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

Seorang rekan yang terbiasa dengan Rust menulis `public/statis.php` ini dan berharap angkanya naik di setiap request, karena property `static` hidup sepanjang program. Apa output tiga request berturut-turut, dan kenapa?

```php
<?php

declare(strict_types=1);

final class Penghitung
{
    public static int $jumlah = 0;
}

Penghitung::$jumlah++;

echo 'Request ke-' . Penghitung::$jumlah . PHP_EOL;
```

::: details Jawaban
```text
Request ke-1
Request ke-1
Request ke-1
```

Property `static` memang hidup sepanjang program, tetapi di PHP "program" adalah satu request. Class `Penghitung` dideklarasikan ulang dari nol setiap kali file dijalankan. Untuk menghitung lintas request, nilainya harus disimpan di luar proses: di session kalau per pengunjung, di database kalau untuk semua.
:::

### 2. Halaman pencarian

Tambahkan rute `GET /cari?kata=...` yang menampilkan pesan yang isinya mengandung kata itu. Judul halaman menyebut kata yang dicari dan jumlah seluruh pesan tersimpan, misalnya `Hasil cari: Halo (3 pesan tersimpan)`. Pakai lagi templat `beranda`.

Setelah jadi, coba dengan `kata=<script>alert(1)</script>` dan `kata=' OR '1'='1`.

::: details Jawaban
Dua method baru di `PesanRepository`:

```php
/**
 * @return list<Pesan>
 */
public function cari(string $kata): array
{
    $baris = $this->db->jalankan(
        'SELECT id, nama, isi, dibuat FROM pesan WHERE isi LIKE :pola ORDER BY id DESC',
        ['pola' => "%{$kata}%"],
    )->fetchAll();

    return array_values(array_map(Pesan::dariBaris(...), $baris));
}

public function jumlah(): int
{
    $jumlah = $this->db->jalankan('SELECT COUNT(*) FROM pesan')->fetchColumn();

    return is_int($jumlah) ? $jumlah : 0;
}
```

Satu method baru di `BukuTamuController`:

```php
public function cari(Request $request): Response
{
    $kata = trim($request->query['kata'] ?? '');

    $html = halaman("Hasil cari: {$kata} ({$this->pesan->jumlah()} pesan tersimpan)", 'beranda', [
        'daftarPesan' => $kata === '' ? [] : $this->pesan->cari($kata),
        'csrf' => Session::tokenCsrf(),
        'admin' => Session::sudahMasuk(),
        'galat' => [],
        'nama' => '',
        'isi' => '',
    ]);

    return new Response($html);
}
```

Dan satu lengan baru di `match`, di antara rute GET lainnya:

```php
$metode === 'GET' && $path === '/cari' => $kontroler->cari($request),
```

Yang perlu diperhatikan:

- **Tanda `%` ditempel ke nilai, bukan ke SQL.** Placeholder-nya tetap `:pola`.
- **`fetchColumn()` bertipe `mixed`**, jadi hasil `COUNT(*)` diperiksa dengan `is_int`.
- **Pencarian tidak mengubah data**, jadi memakai GET dan tidak membutuhkan token CSRF.

Hasil kedua percobaan:

```html
<h1>Hasil cari: &lt;script&gt;alert(1)&lt;/script&gt; (3 pesan tersimpan)</h1>
```

Judul di-escape oleh `e($judul)` di tata letak. Untuk `' OR '1'='1`, hasilnya nol pesan: input itu dicari sebagai teks biasa. Satu hal yang masih tersisa adalah `kata=%`, yang mengembalikan semua pesan karena `%` adalah wildcard `LIKE`. Itu bukan injection, tetapi pantas diketahui.
:::

### 3. Menghapus lewat tautan

Seseorang mengusulkan tombol Hapus diganti tautan biasa supaya templatnya lebih ringkas:

```html
<a href="/pesan/3/hapus">Hapus</a>
```

dengan rute `GET /pesan/{id}/hapus`. Apa yang salah dengan usul ini?

::: details Jawaban
Tautan berarti request GET, dan GET tidak melewati pemeriksaan token CSRF. Akibatnya:

- **Situs lain bisa memicu penghapusan.** Cukup sebuah tautan ke `/pesan/3/hapus` di halaman lain yang diklik admin. `SameSite=Lax` tidak menolong, karena cookie tetap ikut pada navigasi biasa ke situsmu. Tanpa `SameSite`, tautan pun tidak perlu: gambar dengan `src` yang menunjuk URL itu sudah cukup.
- **Perangkat lunak yang mengikuti tautan bisa menghapus data**, misalnya fitur pramuat halaman di browser.

Aturannya: GET hanya untuk membaca. Semua yang mengubah data memakai POST (atau PUT, PATCH, DELETE) dan membawa token CSRF.
:::

### 4. Echo tanpa `e()`

Di `templates/beranda.php`, ubah `<?= nl2br(e($pesan->isi)) ?>` menjadi `<?= $pesan->isi ?>`, lalu jalankan `composer check`. Apa hasilnya, dan apa artinya?

::: details Jawaban
```text
 [OK] No errors
```

PHPStan tidak mengeluh, karena `$pesan->isi` bertipe `string` dan mencetak string itu sah. Padahal aplikasinya sekarang punya celah XSS: pesan berisi `<script>` akan dijalankan browser setiap pengunjung.

Sistem tipe tidak membedakan "string yang aman untuk HTML" dari "string mentah". Di aplikasi ini penjaganya adalah kebiasaan menulis `e()`. Laravel membalik bawaannya: di Blade, <span v-pre>`{{ $pesan->isi }}`</span> selalu meng-escape, dan mencetak mentah membutuhkan sintaks lain yang sengaja mencolok. Kembalikan baris itu seperti semula.
:::
