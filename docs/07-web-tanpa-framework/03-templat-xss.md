# Templat dan XSS

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

Seperti di [Bab 6](/06-ekosistem/), file berisi fungsi harus didaftarkan sendiri. Tambahkan entri `files` ke `autoload` di `composer.json`, lalu buat ulang autoloader:

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
