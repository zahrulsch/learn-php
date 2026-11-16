# 12. Deploy ke shared hosting

Di akhir bab ini Dompet dari [Bab 10](/10-proyek) berjalan di shared hosting yang kamu pilih di [Bab 11](/11-memilih-hosting). Memperbaruinya cukup tiga perintah dari laptop, versi sebelumnya bisa dikembalikan dengan satu perintah, dan semuanya bisa dijalankan otomatis oleh GitHub Actions setiap kali kamu push.

::: info Asal output di bab ini
Seluruh langkah bab ini dijalankan di server tiruan: container Docker berisi Apache dan PHP 8.5.12 dengan akun biasa bernama `u123`, folder `public_html`, tanpa Node dan tanpa Composer, ditambah MariaDB 11.4. Aplikasinya adalah kerangka Laravel 13.42.0 baru yang diberi penanda versi, satu job antrean, dan satu komponen Livewire, sebagai pengganti Dompet. Nama akun, path, dan tulisan seperti "Versi v1" berasal dari simulasi itu.

Dua bagian tidak bisa dijalankan di sana dan diberi tanda: akses ke GitHub memakai deploy key, dan file workflow GitHub Actions.
:::

## Deploy PHP berarti menyalin file

Men-deploy binary Rust berarti: build, salin binary ke server, restart service. Men-deploy aplikasi Node kurang lebih sama, dengan `npm ci` sebagai ganti build.

Di PHP tidak ada binary dan tidak ada service milikmu. Web server milik host sudah hidup. Begitu file PHP di sebuah folder berganti, request berikutnya menjalankan file yang baru. Jadi deploy hanyalah menaruh file yang benar di folder yang benar.

Tiga hal tetap harus disiapkan, karena tidak ikut tersimpan di Git:

| Yang tidak ada di Git | Asalnya di server |
|---|---|
| `vendor/` | Dipasang Composer di server |
| `public/build/` | Di-build Vite di laptop, lalu diunggah |
| `.env` | Ditulis tangan sekali di server |

Dari model itu lahir tiga aturan yang dipakai sepanjang bab:

- **Satu rilis adalah satu folder.** Folder itu berisi proyek Laravel utuh, lengkap dengan `vendor` dan aset.
- **Berpindah rilis berarti mengganti symlink.** Web server dan cron selalu melihat aplikasi lewat satu path yang tetap.
- **Tidak ada yang di-restart.** Dompet tidak punya worker permanen, jadi bagian "Reloading Services" di dokumentasi deploy Laravel tidak berlaku.

## Struktur di server

```text
/home/u123/
├── dompet/
│   ├── releases/
│   │   ├── 20261116-074732/     satu folder per rilis
│   │   └── 20261116-075101/
│   ├── shared/
│   │   ├── .env                 konfigurasi produksi
│   │   └── storage/             log, cache, session
│   ├── incoming/                tempat mendarat aset yang diunggah
│   ├── current -> releases/20261116-075101
│   └── deploy.sh
└── public_html                  web root bawaan host
```

- **Aplikasi berada di luar web root.** Seperti di [Bab 7](/07-web-tanpa-framework), hanya folder `public` yang boleh terlihat dari web. Dokumentasi Laravel melarang memindahkan `index.php` ke root proyek, karena itu membuka file konfigurasi ke internet. Di server uji, permintaan ke `/.env` dijawab 404.
- **`shared/` berisi yang harus bertahan antar-rilis.** Kalau `.env` dan `storage` ikut di dalam folder rilis, setiap rilis baru akan mulai tanpa konfigurasi, tanpa log, dan tanpa data yang ditulis rilis sebelumnya.
- **`current` adalah symlink ke rilis yang aktif.** Semua yang berada di luar, yaitu web server dan cron, hanya mengenal path ini.

## Persiapan di laptop

### Repo di GitHub

Dompet harus berada di repo Git, dan repo itu di GitHub supaya bisa dipakai CI nanti. Buat repo privat, lalu push. Tiga hal perlu ikut ter-commit:

- **`.env.example`**: dipakai sebagai titik awal `.env` produksi dan dipakai CI.
- **`package-lock.json`**: dibuat `npm install`. CI memakainya lewat `npm ci`.
- **`composer.lock`**: supaya server memasang versi dependency yang persis sama dengan laptopmu.

### Akses SSH

Buat kunci SSH di laptop, kalau belum punya:

```powershell
ssh-keygen -t ed25519
```

Daftarkan isi file `.pub`-nya di panel hosting, di menu yang biasanya bernama SSH Access atau SSH Keys. Lalu buat file `C:\Users\NAMAMU\.ssh\config` supaya tidak perlu mengetik alamat, user, dan port berulang kali:

```text
Host dompet
    HostName server.hostingmu.example
    User u123
    Port 22
```

Isi tiga nilai itu dari panel hosting. Sekarang `ssh dompet` membuka shell di server, dan `scp` mengenal nama yang sama.

::: warning Jangan menyalurkan kunci lewat pipe PowerShell
Cara yang sering ditulis di tutorial, `Get-Content kunci.pub | ssh dompet "cat >> ~/.ssh/authorized_keys"`, gagal di mesin uji. PowerShell menyisipkan tiga byte tak terlihat (BOM) di depan baris, sehingga server tidak lagi mengenali kuncinya dan login ditolak:

```text
u123@server: Permission denied (publickey,password).
```

Pakai panel hosting, atau unggah file `.pub`-nya dengan `scp` seperti di bagian CI/CD di bawah.
:::

## Siapkan server

Masuk dengan `ssh dompet`. Semua perintah di bagian ini dijalankan di server.

### Catat path PHP

```bash
which php
```

```text
/usr/local/bin/php
```

Path lengkap ini dipakai untuk cron dan script deploy. Kalau `php -v` tidak menampilkan 8.5, lihat peringatan di [Bab 11](/11-memilih-hosting#cek-setelah-punya-akses-ssh), lalu ganti `php` di seluruh bab ini dengan path PHP 8.5 di host-mu.

### Pasang Composer

Lewati bagian ini kalau `composer --version` sudah berhasil. Kalau belum, Composer bisa dipasang di folder home tanpa hak root. Perintah di bawah mengikuti cara resmi Composer: unduh installer, cocokkan checksum-nya dengan yang diterbitkan, baru jalankan.

```bash
mkdir -p ~/bin && cd ~/bin
EXPECTED_CHECKSUM="$(php -r 'copy("https://composer.github.io/installer.sig", "php://stdout");')"
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
ACTUAL_CHECKSUM="$(php -r "echo hash_file('sha384', 'composer-setup.php');")"
if [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ]; then
    php composer-setup.php --quiet --filename=composer
else
    echo 'Checksum installer tidak cocok, Composer tidak dipasang' >&2
fi
rm composer-setup.php
php ~/bin/composer --version
```

```text
Composer version 2.11.2 2026-11-10 10:09:37
PHP version 8.5.12 (/usr/local/bin/php)
Run the "diagnose" command to get more detailed diagnostics output.
```

Di materi ini Composer selalu dipanggil sebagai `php ~/bin/composer`. Alasannya terlihat kalau perintah dikirim langsung dari laptop tanpa membuka shell dulu: folder `~/bin` tidak ada di PATH.

```powershell
ssh dompet "composer --version"
```

```text
bash: line 1: composer: command not found
```

### Buat database

Buat database dan penggunanya lewat panel hosting. Catat empat hal: host (hampir selalu `localhost`), nama database, nama pengguna, dan password. Di banyak panel, nama database dan pengguna diberi awalan nama akunmu, misalnya `u123_dompet`.

Catat juga mesinnya, MySQL atau MariaDB, karena Laravel punya driver terpisah untuk keduanya.

### Beri server akses ke repo

::: warning Bagian ini tidak dijalankan di simulasi
Server tiruan mengambil kode dari remote Git lokal, bukan dari GitHub. Langkah deploy key di bawah mengikuti cara kerja GitHub, tetapi belum pernah dijalankan untuk materi ini.
:::

Repo-mu privat, jadi server perlu kunci sendiri untuk membacanya. Buat kunci di server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "deploy-dompet"
cat ~/.ssh/id_ed25519.pub
```

Salin baris yang tercetak. Di GitHub, buka repo Dompet, lalu Settings, Deploy keys, Add deploy key. Tempel kuncinya dan biarkan "Allow write access" tidak dicentang: server hanya perlu membaca.

Uji dari server:

```bash
ssh -T git@github.com
```

Saat pertama kali, SSH menanyakan apakah sidik jari GitHub bisa dipercaya. Cocokkan dulu dengan [daftar sidik jari resmi GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) sebelum menjawab `yes`.

## Deploy pertama

Deploy pertama dikerjakan dengan tangan, langkah demi langkah, supaya kamu tahu apa yang nanti dikerjakan script. Semua perintah dijalankan di server dalam satu sesi SSH, kecuali yang diberi keterangan lain.

### 1. Ambil kode

```bash
mkdir -p ~/dompet/releases ~/dompet/shared ~/dompet/incoming
RELEASE=~/dompet/releases/$(date +%Y%m%d-%H%M%S)
git clone --quiet --depth 1 git@github.com:AKUN/dompet.git "$RELEASE"
cd "$RELEASE"
```

Nama folder rilis adalah waktu pembuatannya, jadi urutan abjad sama dengan urutan waktu. `--depth 1` hanya mengambil commit terakhir, karena server tidak butuh riwayat.

### 2. Pasang dependency

```bash
php ~/bin/composer install --no-dev --optimize-autoloader --no-interaction
```

- **`--no-dev`** melewati `require-dev`. PHPStan dan PHPUnit tidak ada gunanya di server. Padanannya `npm ci --omit=dev`.
- **`--optimize-autoloader`** mengubah autoload PSR-4 dari [Bab 6](/06-ekosistem) menjadi satu peta class ke file, sehingga PHP tidak perlu mencari file di disk untuk tiap class.
- **`--no-interaction`** mencegah Composer menunggu jawaban.

Karena ada `composer.lock`, versi yang terpasang persis sama dengan di laptopmu.

### 3. Tulis `.env` produksi

```bash
cp .env.example ~/dompet/shared/.env
chmod 600 ~/dompet/shared/.env
nano ~/dompet/shared/.env
```

`chmod 600` membuat file itu hanya bisa dibaca pemilik akun. Kalau `nano` tidak ada di server, sunting file itu lewat File Manager di panel. Nilai yang harus diganti:

```ini
APP_NAME=Dompet
APP_ENV=production
APP_DEBUG=false
APP_URL=https://dompet.example.com

DB_CONNECTION=mariadb
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=u123_dompet
DB_USERNAME=u123_dompet
DB_PASSWORD=password-dari-panel

MAIL_MAILER=smtp
MAIL_HOST=mail.example.com
MAIL_PORT=465
MAIL_USERNAME=dompet@example.com
MAIL_PASSWORD=password-email
MAIL_FROM_ADDRESS="dompet@example.com"
```

- **`APP_DEBUG=false`** tidak bisa ditawar. Dokumentasi Laravel memperingatkan bahwa mode debug di produksi bisa menampilkan nilai konfigurasi sensitif ke pengunjung.
- **`DB_CONNECTION`** diisi `mariadb` untuk MariaDB dan `mysql` untuk MySQL. Baris `DB_HOST` sampai `DB_PASSWORD` masih berisi nilai development dari [Bab 10](/10-proyek); ganti semuanya dengan data database yang kamu buat di panel. Di aplikasi yang masih memakai `.env.example` bawaan Laravel, baris-baris itu diawali `#`, dan tanda itu harus dihapus.
- **`MAIL_*`** diisi dari pengaturan akun email di panel hosting. Port dan host di atas hanya contoh. Server uji memakai `MAIL_MAILER=log`, jadi pengiriman lewat SMTP host tidak ikut teruji di bab ini.
- **Sisanya dibiarkan.** `SESSION_DRIVER`, `CACHE_STORE`, dan `QUEUE_CONNECTION` sudah bernilai `database`, yang cocok untuk shared hosting karena tidak membutuhkan Redis.

Sambungkan file itu ke rilis, lalu buat kunci aplikasi:

```bash
ln -s ~/dompet/shared/.env .env
php artisan key:generate
```

```text
   INFO  Application key set successfully.
```

Kunci itu ditulis ke `shared/.env` lewat symlink. Jalankan `key:generate` sekali ini saja. Kunci dipakai untuk mengenkripsi cookie, termasuk cookie session, dan data lain yang dienkripsi aplikasi. Menggantinya membuat semua pengguna keluar dan data terenkripsi itu tidak terbaca lagi.

### 4. Pindahkan `storage` ke tempat bersama

```bash
mv storage ~/dompet/shared/storage
ln -s ~/dompet/shared/storage storage
```

Folder `storage` dari repo sudah berisi struktur subfolder yang dibutuhkan Laravel, jadi cukup dipindahkan.

### 5. Jalankan migrasi

```bash
php artisan migrate --force
```

```text
   INFO  Preparing database.

  Creating migration table ...................................... 32.79ms DONE

   INFO  Running migrations.

  0001_01_01_000000_create_users_table .......................... 75.74ms DONE
  0001_01_01_000001_create_cache_table .......................... 47.60ms DONE
  0001_01_01_000002_create_jobs_table ........................... 73.36ms DONE
```

Di produksi, `migrate` meminta konfirmasi sebelum berjalan. `--force` melewatinya. Daftar di atas adalah tabel bawaan kerangka Laravel. Untuk Dompet, tabel buatanmu ikut muncul.

### 6. Unggah aset

Server tidak punya Node, jadi aset di-build di laptop. Jalankan ini **di laptop**, dari folder proyek:

```powershell
npm run build
scp -r public/build dompet:dompet/incoming/
```

```text
vite v8.3.8 building client environment for production...
transforming...
✓ 3 modules transformed.
rendering chunks...
computing gzip size...
public/build/manifest.json                                      1.47 kB │ gzip: 0.33 kB
public/build/assets/app-DwXdhIKi.css                           37.72 kB │ gzip: 9.42 kB
public/build/assets/app-BvRk9kiK.js                             0.00 kB │ gzip: 0.02 kB

✓ built in 530ms
```

Output di atas dipotong: baris file font dihilangkan. Di perintah `scp`, `dompet:` di depan adalah nama host dari file config SSH, sedangkan `dompet/incoming/` sesudahnya adalah folder di server.

Kembali **di server**, pindahkan hasil unggahan ke dalam rilis:

```bash
mv ~/dompet/incoming/build public/build
```

### 7. Cache untuk produksi

```bash
php artisan optimize
```

```text
   INFO  Caching framework bootstrap, configuration, and metadata.

  config ......................................................... 7.15ms DONE
  events ......................................................... 1.23ms DONE
  routes ......................................................... 7.28ms DONE
  views ......................................................... 16.75ms DONE
```

Satu perintah ini menggabungkan semua file konfigurasi menjadi satu, menyimpan peta event dan route, dan meng-compile semua view Blade. Hasilnya ditaruh di `bootstrap/cache` milik rilis itu.

::: warning Setelah di-cache, `.env` tidak dibaca lagi
Ini berakibat dua hal. Pertama, `env()` hanya boleh dipanggil di dalam file `config/`. Di tempat lain ia mengembalikan `null` begitu konfigurasi di-cache. Kedua, mengubah `.env` tidak berpengaruh sampai kamu menjalankan `php artisan optimize` lagi. Di server uji, `APP_NAME` di `.env` diganti menjadi `DompetBaru`. Aplikasi masih memakai nama lama sampai cache dibuat ulang:

```text
$ php artisan tinker --execute='echo config("app.name"), PHP_EOL;'
Dompet
$ php artisan optimize
$ php artisan tinker --execute='echo config("app.name"), PHP_EOL;'
DompetBaru
```
:::

### 8. Aktifkan rilis

```bash
ln -sfn "$RELEASE" ~/dompet/current
ls -l ~/dompet
```

```text
total 12
lrwxrwxrwx 1 u123 u123   42 Nov 16 07:47 current -> /home/u123/dompet/releases/20261116-074732
drwxrwxr-x 2 u123 u123 4096 Nov 16 07:47 incoming
drwxrwxr-x 3 u123 u123 4096 Nov 16 07:47 releases
drwxrwxr-x 3 u123 u123 4096 Nov 16 07:47 shared
```

### 9. Arahkan web root

Web server harus melayani `~/dompet/current/public`. Ada dua cara, tergantung host-mu.

**Cara A: atur document root lewat panel.** Kalau panel mengizinkan, isi document root domain dengan `/home/u123/dompet/current/public`. Ini cara yang lebih bersih. Di banyak panel, pilihan ini hanya ada untuk subdomain dan domain tambahan, bukan domain utama.

**Cara B: ganti `public_html` dengan symlink.** Kalau web root domain utama dikunci di `~/public_html`, simpan folder aslinya lalu ganti dengan symlink:

```bash
mv ~/public_html ~/public_html.bawaan
ln -s ~/dompet/current/public ~/public_html
ls -ld ~/public_html ~/public_html.bawaan
```

```text
lrwxrwxrwx 1 u123 u123   32 Nov 16 07:48 /home/u123/public_html -> /home/u123/dompet/current/public
drwxr-xr-x 2 u123 u123 4096 Nov 16 07:41 /home/u123/public_html.bawaan
```

Kedua cara diuji di server tiruan dan sama-sama melayani aplikasi. Keduanya juga otomatis mengikuti `current` saat rilis berganti, jadi langkah ini hanya dikerjakan sekali.

Kalau host-mu menolak keduanya, jangan mengakalinya dengan menaruh seluruh proyek di `public_html`. Itu membuka `.env` ke internet. Host itu tidak memenuhi syarat [Bab 11](/11-memilih-hosting).

### 10. Periksa

Buka domainmu di browser. Dari server, ringkasan keadaan aplikasi bisa dilihat dengan:

```bash
cd ~/dompet/current && php artisan about
```

```text
  Environment ................................................................
  Application Name .................................................... Dompet
  Laravel Version .................................................... 13.42.0
  PHP Version ......................................................... 8.5.12
  Composer Version ......................................................... -
  Environment ..................................................... production
  Debug Mode ............................................................. OFF
  URL ......................................................... localhost:8301
  Maintenance Mode ....................................................... OFF
  Timezone ............................................................... UTC
  Locale .................................................................. en

  Cache ......................................................................
  Config .............................................................. CACHED
  Events .............................................................. CACHED
  Routes .............................................................. CACHED
  Views ............................................................... CACHED

  Drivers ....................................................................
  Broadcasting ........................................................... log
  Cache ............................................................. database
  Database ........................................................... mariadb
  Logs ........................................................ stack / single
  Mail ................................................................... log
  Queue ............................................................. database
  Session ........................................................... database

  Storage ....................................................................
  public/storage .................................................. NOT LINKED
```

Yang harus kamu lihat: `Environment` bernilai `production`, `Debug Mode` bernilai `OFF`, dan keempat baris `Cache` bernilai `CACHED`.

Baris `public/storage` bernilai `NOT LINKED` tidak menjadi masalah selama aplikasimu tidak menyimpan file yang harus bisa diunduh pengunjung. Kalau menyimpan, jalankan `php artisan storage:link` di tiap rilis, dan nanti tambahkan baris itu ke `deploy.sh` setelah `optimize`. Di server uji, file di `storage/app/public` bisa diunduh setelah perintah itu dijalankan.

Laravel juga punya route pemeriksaan bawaan di `/up`. Ia menjawab 200 kalau aplikasi berhasil boot, dan cocok dipasang di layanan pemantau uptime.

### HTTPS

Aktifkan sertifikat SSL gratis untuk domainmu di panel hosting, nyalakan pengalihan otomatis ke HTTPS kalau panel menyediakannya, dan pastikan `APP_URL` diawali `https://`. Server uji hanya melayani HTTP, jadi bagian ini tidak ikut teruji.

## Permission

Dokumentasi Laravel hanya meminta satu hal: proses web server harus bisa menulis ke `storage` dan `bootstrap/cache`.

Di shared hosting, PHP umumnya dijalankan sebagai pemilik akun, yaitu kamu sendiri. Jadi permission bawaan hasil `git clone` sudah benar, dan tidak ada yang perlu diubah:

```bash
ls -ld storage .env bootstrap/cache ~/dompet/shared/storage ~/dompet/shared/.env
```

```text
lrwxrwxrwx 1 u123 u123   29 Nov 16 07:47 .env -> /home/u123/dompet/shared/.env
-rw------- 1 u123 u123 1153 Nov 16 07:47 /home/u123/dompet/shared/.env
drwxrwxr-x 5 u123 u123 4096 Nov 16 07:47 /home/u123/dompet/shared/storage
drwxrwxr-x 2 u123 u123 4096 Nov 16 07:47 bootstrap/cache
lrwxrwxrwx 1 u123 u123   32 Nov 16 07:47 storage -> /home/u123/dompet/shared/storage
```

`.env` dengan permission `600` tetap terbaca aplikasi, karena PHP berjalan sebagai `u123`.

::: warning Jangan pernah `chmod 777`
Saran "ubah `storage` jadi 777" banyak beredar. Di server yang dipakai bersama, itu berarti pengguna lain di server yang sama boleh menulis ke folder aplikasimu. Kalau aplikasi gagal menulis ke `storage` padahal kamu pemilik foldernya, tanyakan ke host sebagai pengguna apa PHP dijalankan.
:::

## Cron: scheduler dan antrean

Laravel hanya butuh satu entri cron. Entri itu memanggil scheduler tiap menit, dan scheduler yang memutuskan tugas mana yang sudah waktunya. Bentuk resminya:

```text
* * * * * cd /path-to-your-project && php artisan schedule:run >> /dev/null 2>&1
```

Pasang lewat menu Cron Jobs di panel, atau dengan `crontab -e` di SSH.

### Pakai path PHP yang lengkap

Entri di atas, kalau disalin apa adanya, gagal di server uji. Supaya pesan error-nya terlihat, output-nya sementara diarahkan ke file:

```text
* * * * * cd /home/u123/dompet/current && php artisan schedule:run >> /home/u123/cron.log 2>&1
```

```bash
cat ~/cron.log
```

```text
/bin/sh: 1: php: not found
```

Cron berjalan dengan PATH yang jauh lebih pendek daripada shell SSH-mu, jadi `php` tidak ditemukan. Dengan `/dev/null` sebagai tujuan output, kegagalan ini tidak akan pernah kamu lihat. Entri yang benar memakai path dari `which php`:

```text
* * * * * cd /home/u123/dompet/current && /usr/local/bin/php artisan schedule:run >> /dev/null 2>&1
```

Perhatikan path-nya lewat `current`, bukan folder rilis. Dengan begitu cron selalu menjalankan rilis yang aktif.

### Antrean dikuras oleh scheduler

Shared hosting tidak mengizinkan `queue:work` hidup terus. Jalan keluarnya, yang sudah ada di `routes/console.php` Dompet: scheduler menyalakan worker tiap menit, dan worker itu berhenti sendiri begitu antrean kosong.

```php
Schedule::command('queue:work --stop-when-empty --max-time=50')
    ->everyMinute()
    ->withoutOverlapping();
```

- **`--stop-when-empty`** membuat worker keluar setelah semua job selesai.
- **`--max-time=50`** membuat worker keluar setelah 50 detik walau antrean belum kosong, sebelum cron berikutnya datang.
- **`withoutOverlapping()`** mencegah dua worker berjalan bersamaan kalau yang sebelumnya belum selesai.

Daftar tugas terjadwal bisa dilihat kapan saja:

```bash
php artisan schedule:list
```

```text
  * * * * *  php artisan queue:work --stop-when-empty --max-time=50  Next Due: 50 seconds from now
```

Di server uji, satu job dimasukkan ke antrean pada 07:49:09. Tabel `jobs` berisi satu baris. Cron berikutnya berjalan pada 07:50:02, dan sesudahnya tabel itu kosong. Ini catatan cron dan log aplikasinya:

```text
  2026-11-16 07:50:02 Running ['artisan' queue:work --stop-when-empty --max-time=50]
```

```text
[2026-11-16 07:50:02] production.INFO: job antrean diproses
```

Jeda 53 detik itu adalah harga antrean di shared hosting: job menunggu sampai cron berikutnya.

Job yang gagal tidak hilang. Ia dicatat dan bisa dijalankan ulang:

```bash
php artisan queue:failed
php artisan queue:retry all
```

### Kalau cron tidak bisa tiap menit

Sebagian paket hanya mengizinkan cron tiap 5 atau 15 menit. Scheduler tetap bekerja, dengan dua akibat:

- **Antrean dikuras lebih jarang.** Job menunggu sampai 5 atau 15 menit.
- **Tugas hanya berjalan kalau jadwalnya jatuh tepat di menit cron berjalan.** `schedule:run` hanya menjalankan tugas yang waktunya adalah menit itu. Dengan cron tiap 5 menit, tugas berjadwal `08:00` berjalan, sedangkan tugas berjadwal `08:03` tidak pernah berjalan.

### Jam server

Jam server uji adalah UTC, tujuh jam di belakang WIB. Dompet tidak terpengaruh: di [Bab 10](/10-proyek) zona waktu aplikasinya diatur ke `Asia/Jakarta` di `config/app.php`, dan scheduler menghitung jadwal dengan zona waktu aplikasi. Laporan bulanan yang dijadwalkan pukul 07:00 berjalan pukul 07:00 WIB, di zona waktu mana pun servernya berada.

Lain halnya dengan aplikasi Laravel yang masih memakai bawaan `'timezone' => 'UTC'`: tugas berjadwal 07:00 di sana berjalan pukul 14:00 WIB. Pilihannya mengubah zona waktu aplikasi seperti Dompet, atau menyatakan zona waktu pada jadwal itu saja:

```php
->timezone('Asia/Jakarta')
```

## Otomatiskan dengan `deploy.sh`

Langkah deploy pertama tadi, tanpa bagian yang hanya dikerjakan sekali, menjadi satu script. Script ini disimpan di server, karena isinya khusus server itu: path PHP, lokasi Composer, dan alamat repo.

```bash
#!/usr/bin/env bash
# Membuat rilis baru lalu mengaktifkannya. Dijalankan di server: bash ~/dompet/deploy.sh
set -euo pipefail

APP="$HOME/dompet"
REPO="git@github.com:AKUN/dompet.git"
PHP="/usr/local/bin/php"            # hasil `which php` di server
COMPOSER="$HOME/bin/composer"
KEEP=3                              # jumlah rilis yang disimpan

RELEASE="$APP/releases/$(date +%Y%m%d-%H%M%S)"

# Rilis yang gagal di tengah jalan dihapus; rilis yang sedang aktif tidak disentuh
trap 'echo "Deploy gagal, rilis dibatalkan." >&2; rm -rf "$RELEASE"' ERR

test -f "$APP/incoming/build/manifest.json" || { echo "Unggah dulu public/build ke $APP/incoming" >&2; exit 1; }

git clone --quiet --depth 1 "$REPO" "$RELEASE"
cd "$RELEASE"
"$PHP" "$COMPOSER" install --no-dev --optimize-autoloader --no-interaction --quiet
mv "$APP/incoming/build" public/build

ln -s "$APP/shared/.env" .env
rm -rf storage
ln -s "$APP/shared/storage" storage

"$PHP" artisan migrate --force
"$PHP" artisan optimize

ln -sfn "$RELEASE" "$APP/current"
trap - ERR

# Buang rilis lama, sisakan $KEEP yang terbaru
cd "$APP/releases"
ls -1 | head -n -"$KEEP" | xargs -r rm -rf

echo "Rilis aktif: $(basename "$RELEASE")"
```

Tiga hal yang tidak ada di langkah manual:

- **`set -euo pipefail`** menghentikan script di perintah pertama yang gagal. Tanpa ini, migrasi yang gagal tetap diikuti pengaktifan rilis.
- **`trap ... ERR`** menghapus folder rilis yang gagal dibuat. Setelah `current` berpindah, trap dicabut, supaya kegagalan saat membuang rilis lama tidak menghapus rilis yang baru aktif.
- **Rilis lama dibuang.** Di server uji, satu rilis kerangka Laravel berisi 6.678 file dan memakan 49 MB. Menyimpan tiga rilis berarti sekitar 20.000 file, dan itu perlu kamu bandingkan dengan batas inode paketmu.

Simpan script itu di laptop sebagai `deploy.sh`, lalu unggah:

```powershell
scp deploy.sh dompet:dompet/deploy.sh
```

::: warning Script harus berakhiran baris LF
File yang dibuat di Windows sering memakai akhiran baris CRLF, dan bash di server gagal membacanya. Di VS Code, klik tulisan `CRLF` di pojok kanan bawah dan ganti ke `LF` sebelum menyimpan. Untuk memeriksa di server, perintah ini harus mencetak `0`:

```bash
grep -c $'\r' ~/dompet/deploy.sh
```
:::

### Memperbarui aplikasi

Mulai sekarang, merilis versi baru adalah: push ke GitHub, lalu tiga perintah **di laptop**.

```powershell
npm run build
scp -r public/build dompet:dompet/incoming/
ssh dompet "bash ~/dompet/deploy.sh"
```

Ini output deploy versi kedua di server uji, yang membawa satu migrasi baru:

```text
   INFO  Running migrations.

  2026_11_16_000000_create_catatan_table ........................ 26.27ms DONE


   INFO  Caching framework bootstrap, configuration, and metadata.

  config ......................................................... 5.27ms DONE
  events ......................................................... 0.71ms DONE
  routes ......................................................... 5.66ms DONE
  views ......................................................... 13.08ms DONE

Rilis aktif: 20261116-075101
```

Permintaan pertama sesudahnya langsung dijawab versi baru.

Rilis berikutnya di server uji menambahkan satu komponen Livewire 4.4.8 ke halaman itu, dan ia bekerja tanpa langkah deploy tambahan. Livewire menyajikan JavaScript-nya lewat route Laravel, jadi tidak ada file yang perlu disalin ke `public`. File JavaScript itu dijawab 200, dan pemanggilan aksi komponen mengubah nilainya dari 0 menjadi 1, di kedua cara pengaturan web root.

### Kalau deploy gagal

Dua kegagalan diuji dengan sengaja. Yang pertama, menjalankan script tanpa mengunggah aset:

```text
Unggah dulu public/build ke /home/u123/dompet/incoming
```

Yang kedua, rilis dengan migrasi yang melempar exception:

```text
   INFO  Running migrations.

  2026_11_16_000001_migrasi_rusak ................................ 0.19ms FAIL

In 2026_11_16_000001_migrasi_rusak.php line 9:

  migrasi sengaja dibuat gagal


Deploy gagal, rilis dibatalkan.
```

Sesudahnya, folder rilis yang gagal sudah tidak ada, `current` masih menunjuk ke rilis sebelumnya, dan situs tetap melayani versi lama. Aset yang sudah diunggah ikut terhapus bersama rilis yang gagal, jadi unggah lagi sebelum mencoba ulang.

## Yang terjadi saat rilis berganti

Mengganti symlink tidak berarti semua pengunjung langsung mendapat versi baru. Ini diukur di server uji, dengan meminta halaman utama tiap 5 detik setelah `current` dialihkan:

| Waktu sejak dialihkan | Yang dijawab server |
|---|---|
| 0 sampai 20 detik | Rilis lama |
| 25 sampai 71 detik | Bercampur: sebagian request rilis lama, sebagian rilis baru |
| 76 detik ke atas | Rilis baru |

Penyebabnya, setiap proses PHP mengingat hasil penelusuran path, termasuk ke mana sebuah symlink menunjuk, selama `realpath_cache_ttl` detik. Di server uji nilainya 120, yaitu nilai bawaan PHP. Proses yang baru saja melayani request masih memakai tujuan yang lama sampai ingatannya kedaluwarsa. Pada deploy versi kedua di atas peralihannya langsung terasa, karena saat itu server sudah lebih dari dua menit tidak menerima request, sehingga tidak ada ingatan yang masih berlaku.

Di shared hosting kamu tidak bisa mengosongkan ingatan itu sendiri. Yang bisa kamu lakukan adalah memperhitungkannya:

- **Tunggu dua menit** sebelum menyimpulkan sebuah deploy tidak berhasil.
- **Selama jendela itu, kode lama berjalan di atas database baru**, karena migrasi sudah dijalankan. Tulis migrasi yang masih bisa dipakai kode lama: menambah kolom aman, menghapus atau mengganti nama kolom tidak.
- **Untuk perubahan yang tidak bisa dibuat aman, pakai maintenance mode** (di bawah).

## Rollback

Karena rilis lama masih ada di disk, kembali ke versi sebelumnya hanya mengganti symlink:

```bash
ls ~/dompet/releases
ln -sfn ~/dompet/releases/20261116-074732 ~/dompet/current
```

Tidak ada yang perlu dipasang atau di-build ulang, karena tiap folder rilis sudah lengkap dengan `vendor`, aset, dan cache-nya sendiri. Jeda dua menit di atas berlaku juga di sini.

Yang tidak ikut kembali adalah database. Symlink hanya mengganti kode. Kalau rilis yang kamu tinggalkan membawa migrasi, tabel hasil migrasi itu masih ada:

```bash
php artisan migrate:status
```

```text
  Migration name .............................................. Batch / Status
  0001_01_01_000000_create_users_table ............................... [1] Ran
  0001_01_01_000001_create_cache_table ............................... [1] Ran
  0001_01_01_000002_create_jobs_table ................................ [1] Ran
  2026_11_16_000000_create_catatan_table ............................. [2] Ran
```

Kalau kode lama tidak terganggu oleh skema baru, biarkan. Kalau terganggu, batalkan migrasinya **dari rilis yang baru**, sebelum mengalihkan symlink, karena hanya rilis itu yang punya file migrasinya:

```bash
cd ~/dompet/current
php artisan migrate:rollback --force
```

```text
   INFO  Rolling back migrations.

  2026_11_16_000000_create_catatan_table ........................ 10.63ms DONE
```

::: warning `migrate:rollback` bisa menghapus data
Perintah itu menjalankan method `down()` dari kelompok migrasi terakhir. Kalau `down()` menghapus tabel atau kolom, isinya ikut hilang. Buat backup database lewat panel sebelum menjalankannya.
:::

## Maintenance mode

Untuk perubahan yang tidak boleh disentuh kode lama, tutup dulu aplikasinya:

```bash
cd ~/dompet/current
php artisan down
```

```text
   INFO  Application is now in maintenance mode.
```

Selama itu semua request dijawab 503. Penanda maintenance disimpan di `storage`, yang dipakai bersama, jadi rilis lama dan rilis baru sama-sama tertutup. Urutannya: `down`, deploy, tunggu dua menit, lalu buka lagi:

```bash
cd ~/dompet/current
php artisan up
```

```text
   INFO  Application is now live.
```

Perhatikan `cd` yang diulang: setelah deploy, `current` menunjuk ke folder lain, dan shell-mu masih berdiri di folder rilis lama.

## CI/CD dengan GitHub Actions

Tiga perintah tadi bisa dijalankan GitHub setiap kali kamu push ke `main`, setelah pemeriksaan tipe dan test lulus. Yang dikerjakan CI sama persis dengan yang kamu kerjakan dari laptop: build aset, unggah, lalu memanggil `deploy.sh` lewat SSH.

### Kunci untuk CI

CI butuh kunci SSH sendiri, terpisah dari kunci laptopmu, supaya bisa dicabut tanpa mengganggu aksesmu. Buat di laptop, dan tekan Enter saat ditanya passphrase, karena CI tidak bisa mengetiknya:

```powershell
ssh-keygen -t ed25519 -f dompet-ci -C "github-actions"
```

Daftarkan kunci publiknya di server:

```powershell
scp dompet-ci.pub dompet:dompet-ci.pub
ssh dompet "cat ~/dompet-ci.pub >> ~/.ssh/authorized_keys && rm ~/dompet-ci.pub"
```

CI juga harus tahu sidik jari server, supaya tidak tersambung ke server palsu. Kamu sudah menyimpannya saat pertama kali `ssh dompet`. Tampilkan dengan:

```powershell
ssh-keygen -F server.hostingmu.example
```

Di mesin uji, dengan server di port 8303, hasilnya:

```text
# Host [localhost]:8303 found: line 1
[localhost]:8303 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDWaNlOoAtv+bbQPtQne/jmso7NkPDUfaVu5b3+LNdZd
```

Yang dipakai adalah baris kedua. Kalau port SSH host-mu bukan 22, nama host di perintah ditulis `"[server.hostingmu.example]:PORT"`.

::: warning `ssh-keyscan` bawaan Windows bisa gagal
Cara yang lebih umum untuk mengambil sidik jari adalah `ssh-keyscan`. Di mesin uji, `ssh-keyscan` bawaan Windows gagal terhadap server yang OpenSSH-nya lebih baru:

```text
choose_kex: unsupported KEX method sntrup761x25519-sha512@openssh.com
```
:::

### Secret di GitHub

Di repo, buka Settings, Secrets and variables, Actions, lalu buat lima secret:

| Nama | Isi |
|---|---|
| `SSH_PRIVATE_KEY` | Seluruh isi file `dompet-ci`, termasuk baris `BEGIN` dan `END` |
| `SSH_KNOWN_HOSTS` | Baris sidik jari server dari langkah di atas |
| `SSH_HOST` | Alamat server, sama persis dengan yang tertulis di baris sidik jari |
| `SSH_USER` | Nama akun hosting |
| `SSH_PORT` | Port SSH |

Setelah tersimpan di GitHub, hapus file `dompet-ci` dari laptop.

### Workflow

Buat file `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
          coverage: none
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: composer install --no-interaction --prefer-dist
      - run: npm ci
      - run: npm run build
      - run: cp .env.example .env
      - run: php artisan key:generate
      - run: composer check
      - run: php artisan test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    env:
      SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
      SSH_KNOWN_HOSTS: ${{ secrets.SSH_KNOWN_HOSTS }}
      SSH_HOST: ${{ secrets.SSH_HOST }}
      SSH_USER: ${{ secrets.SSH_USER }}
      SSH_PORT: ${{ secrets.SSH_PORT }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build
      - name: Siapkan SSH
        run: |
          mkdir -p ~/.ssh
          echo "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          echo "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
      - name: Unggah aset
        run: scp -P "$SSH_PORT" -r public/build "$SSH_USER@$SSH_HOST:dompet/incoming/"
      - name: Jalankan deploy
        run: ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" 'bash ~/dompet/deploy.sh'
```

- **Job `test`** adalah `cargo check` dan `cargo test`-nya proyek ini: `composer check` menjalankan PHPStan, script yang dibuat sejak [Bab 1](/01-setup), dan `php artisan test` menjalankan test. Aset ikut di-build karena halaman yang diuji memuatnya. Test memakai SQLite di memori, sesuai `phpunit.xml` bawaan Laravel, jadi CI tidak butuh server database.
- **Job `deploy`** hanya berjalan kalau `test` lulus, karena `needs: test`.
- **`concurrency`** membuat dua push yang berdekatan di-deploy bergiliran, bukan bersamaan.
- **Secret dimasukkan lewat `env`**, lalu dibaca sebagai variabel shell biasa. Dengan begitu isinya tidak pernah tertulis langsung di baris perintah.

::: warning File workflow ini belum pernah dijalankan GitHub
Yang sudah diuji adalah isinya, bukan bungkusnya. Perintah di job `deploy`, mulai dari menyiapkan kunci sampai memanggil `deploy.sh`, dijalankan dari container Linux terhadap server tiruan dan berhasil membuat rilis baru. Perintah di job `test`, kecuali `composer check` dan langkah Node, dijalankan pada salinan bersih kerangka Laravel dan lulus. Nama dan versi action diambil dari dokumentasi masing-masing pada 16 November 2026. Sintaks YAML-nya sendiri baru terbukti saat kamu push untuk pertama kali, jadi perhatikan tab Actions di repo-mu.
:::

## Kalau ada yang salah

Tempat pertama yang dilihat selalu log aplikasi, yang sekarang berada di folder bersama:

```bash
tail -n 50 ~/dompet/shared/storage/logs/laravel.log
```

Semua pesan di tabel ini muncul sungguhan selama pengujian bab ini.

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| Halaman menjawab 500, dan log berisi `Vite manifest not found at: .../public/build/manifest.json` | Aset belum diunggah ke rilis itu | Jalankan `npm run build`, unggah, deploy ulang |
| `cron.log` berisi `/bin/sh: 1: php: not found` | Cron tidak menemukan `php` | Pakai path lengkap dari `which php` |
| `.env` sudah diubah, aplikasi tidak berubah | Konfigurasi masih dari cache | `php artisan optimize` |
| `The "intl" PHP extension is required to use the [format] method.` | Extension `intl` belum aktif | Aktifkan di pemilih extension PHP di panel |
| `Permission denied (publickey,password)` setelah menambah kunci | Baris di `authorized_keys` rusak | Hapus baris itu, tambahkan ulang dengan `scp` |
| Versi lama masih tampil setelah deploy | Proses PHP masih mengingat tujuan symlink yang lama | Tunggu dua menit |
| `composer: command not found` lewat `ssh dompet "..."` | `~/bin` tidak ada di PATH | Panggil sebagai `php ~/bin/composer` |

Kalau cache yang jadi tersangka, buang semuanya lalu buat ulang:

```bash
php artisan optimize:clear
php artisan optimize
```

## Ringkasan

- **Deploy PHP adalah menyalin file.** Tidak ada binary dan tidak ada proses yang di-restart.
- **Satu rilis satu folder**, dengan `.env` dan `storage` di folder bersama, dan `current` sebagai symlink ke rilis aktif.
- **Hanya `public` yang terlihat dari web**, lewat pengaturan document root atau symlink `public_html`.
- **Server memasang `vendor`, laptop atau CI membangun aset.** Server tidak butuh Node.
- **Satu entri cron** menjalankan scheduler, dan scheduler menguras antrean. Path PHP-nya harus lengkap.
- **`deploy.sh`** merangkum semuanya. Rilis yang gagal dibatalkan tanpa menyentuh yang aktif.
- **Rollback mengganti symlink, bukan database.** Peralihan rilis butuh sampai dua menit untuk merata.

## Latihan

### 1. Kenapa `shared`

Apa yang terjadi kalau `.env` dan `storage` dibiarkan di dalam folder rilis, tanpa folder `shared`?

::: details Jawaban
Setiap deploy membuat folder rilis baru dari Git, yang tidak berisi `.env`, sehingga rilis baru tidak punya konfigurasi dan kunci aplikasi. Kalaupun `.env` disalin tiap kali, `storage` yang baru tetap kosong: log lama tertinggal di rilis lama, dan penanda maintenance tidak berlaku untuk rilis baru. Saat rilis lama dibuang, log dan file di dalamnya ikut terhapus.

Folder `shared` memisahkan yang berganti tiap rilis, yaitu kode, dari yang harus bertahan, yaitu konfigurasi dan data.
:::

### 2. Cron lima menit

Host-mu hanya mengizinkan cron tiap 5 menit. Dompet menjadwalkan laporan bulanan pada tanggal 1 pukul `08:03`. Apa yang terjadi, dan apa perbaikannya?

::: details Jawaban
Laporan itu tidak pernah terkirim. Cron memanggil `schedule:run` pada menit 00, 05, 10, dan seterusnya, dan `schedule:run` hanya menjalankan tugas yang jadwalnya adalah menit itu. Menit 03 tidak pernah dilewati.

Perbaikannya, pindahkan jadwal ke menit yang dilewati cron, misalnya `08:00` atau `08:05`. Pengurasan antrean tidak perlu diubah: tugas `everyMinute()` selalu dianggap waktunya, jadi ia berjalan tiap kali cron datang, hanya lebih jarang.
:::

### 3. Rollback dan database

Kamu men-deploy versi yang menambah kolom `catatan` ke tabel pengeluaran. Ternyata ada bug, dan kamu mengalihkan `current` ke rilis sebelumnya tanpa menjalankan `migrate:rollback`. Apakah versi lama berjalan? Kapan jawabannya berubah?

::: details Jawaban
Ya, berjalan. Kode lama tidak tahu ada kolom `catatan`, dan kolom tambahan tidak mengganggu query yang tidak menyebutnya. Itu sebabnya menambah kolom disebut perubahan yang aman.

Jawabannya berubah kalau migrasinya menghapus atau mengganti nama kolom yang masih dipakai kode lama. Dalam keadaan itu, kode lama gagal di setiap query yang menyebut kolom tersebut, dan kamu harus menjalankan `migrate:rollback` dari rilis yang baru sebelum mengalihkan symlink. Data yang sempat dihapus migrasi itu tidak kembali, jadi untuk perubahan semacam ini buat backup database dulu.
:::

### 4. Membaca `deploy.sh`

Di `deploy.sh`, baris `trap - ERR` diletakkan tepat setelah `ln -sfn`. Apa yang bisa terjadi kalau baris itu dihapus?

::: details Jawaban
Trap itu menghapus folder `$RELEASE` setiap kali ada perintah yang gagal. Sebelum symlink berpindah, itu benar: rilis yang gagal dibuat memang harus dibuang.

Setelah symlink berpindah, `$RELEASE` adalah rilis yang sedang aktif. Kalau perintah sesudahnya gagal, misalnya saat membuang rilis lama, trap akan menghapus rilis yang baru saja diaktifkan, dan `current` menunjuk ke folder yang sudah tidak ada. Mencabut trap tepat setelah peralihan mencegah itu.
:::
