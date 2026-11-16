import { defineConfig } from 'vitepress'

// GitHub Pages menyajikan situs di /learn-php/; dev server lokal tetap di akar.
const base = process.env.GITHUB_ACTIONS ? '/learn-php/' : '/'

// Bab yang belum ditulis tidak diberi `link`, sehingga tampil sebagai teks biasa di sidebar.
export default defineConfig({
  base,
  lang: 'id-ID',
  title: 'Belajar PHP',
  description: 'PHP modern sampai Laravel dan deploy, untuk yang datang dari Rust dan TypeScript',
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400..700;1,400..700&family=Roboto:ital,wght@0,400..700;1,400..700&display=swap',
      },
    ],
  ],
  // strictPort: gagal start kalau port 5000 terpakai, daripada diam-diam pindah ke port lain
  vite: { server: { port: 5000, strictPort: true } },
  themeConfig: {
    logo: '/favicon.svg',
    nav: [{ text: 'Mulai belajar', link: '/01-setup' }],
    sidebar: [
      {
        text: 'PHP',
        items: [
          { text: '1. Setup dan tooling', link: '/01-setup' },
          { text: '2. Type system', link: '/02-type-system' },
          { text: '3. Dasar bahasa', link: '/03-dasar-bahasa' },
          { text: '4. OOP', link: '/04-oop' },
          { text: '5. Error handling', link: '/05-error-handling' },
          {
            text: '6. Ekosistem',
            collapsed: true,
            items: [
              { text: 'Persiapan dan namespace', link: '/06-ekosistem/' },
              { text: 'Autoload', link: '/06-ekosistem/02-autoload' },
              { text: 'Formatter dan testing', link: '/06-ekosistem/03-format-dan-test' },
              { text: 'Composer, ekstensi, dan PSR', link: '/06-ekosistem/04-composer' },
            ],
          },
          {
            text: '7. PHP web tanpa framework',
            collapsed: true,
            items: [
              { text: 'Model eksekusi dan input', link: '/07-web-tanpa-framework/' },
              { text: 'Request, response, dan session', link: '/07-web-tanpa-framework/02-request-session' },
              { text: 'Templat dan XSS', link: '/07-web-tanpa-framework/03-templat-xss' },
              { text: 'Database dan sandi', link: '/07-web-tanpa-framework/04-database' },
              { text: 'Merangkai aplikasi', link: '/07-web-tanpa-framework/05-merangkai' },
            ],
          },
        ],
      },
      {
        text: 'Laravel',
        items: [
          { text: '8. Laravel dasar', link: '/08-laravel-dasar' },
          {
            text: '9. Laravel lanjut',
            collapsed: true,
            items: [
              { text: 'Autentikasi', link: '/09-laravel-lanjut/' },
              { text: 'Relasi dan kepemilikan', link: '/09-laravel-lanjut/02-relasi' },
              { text: 'Livewire', link: '/09-laravel-lanjut/03-livewire' },
              { text: 'Event, queue, dan API', link: '/09-laravel-lanjut/04-event-api' },
              { text: 'Testing dan Larastan', link: '/09-laravel-lanjut/05-testing' },
            ],
          },
          {
            text: '10. Proyek',
            collapsed: true,
            items: [
              { text: 'Rancangan dan data', link: '/10-proyek/' },
              { text: 'Logika murni dan akun', link: '/10-proyek/02-logika-akun' },
              { text: 'Halaman dan route', link: '/10-proyek/03-halaman' },
              { text: 'Laporan bulanan dan API', link: '/10-proyek/04-laporan-api' },
              { text: 'Test dan persiapan deploy', link: '/10-proyek/05-test' },
            ],
          },
        ],
      },
      {
        text: 'Rilis',
        items: [
          { text: '11. Memilih hosting', link: '/11-memilih-hosting' },
          { text: '12. Deploy ke shared hosting', link: '/12-deploy' },
        ],
      },
    ],
    outline: { level: [2, 3], label: 'Di halaman ini' },
    docFooter: { prev: 'Sebelumnya', next: 'Berikutnya' },
    search: { provider: 'local' },
  },
})
