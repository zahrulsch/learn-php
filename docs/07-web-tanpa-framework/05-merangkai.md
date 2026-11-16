# Merangkai aplikasi

## Controller

Controller menerima `Request`, memanggil repository, dan mengembalikan `Response`. Buat `src/GuestbookController.php`:

<!-- file: src/GuestbookController.php -->
```php:line-numbers [src/GuestbookController.php]
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
```php:line-numbers [public/index.php]
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
