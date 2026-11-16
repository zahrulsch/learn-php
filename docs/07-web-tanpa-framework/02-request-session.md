# Request, response, dan session

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
