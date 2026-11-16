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
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]],
  // strictPort: gagal start kalau port 5000 terpakai, daripada diam-diam pindah ke port lain
  vite: { server: { port: 5000, strictPort: true } },
  themeConfig: {
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
          { text: '6. Ekosistem', link: '/06-ekosistem' },
          { text: '7. PHP web tanpa framework', link: '/07-web-tanpa-framework' },
        ],
      },
      {
        text: 'Laravel',
        items: [
          { text: '8. Laravel dasar', link: '/08-laravel-dasar' },
          { text: '9. Laravel lanjut', link: '/09-laravel-lanjut' },
          { text: '10. Proyek', link: '/10-proyek' },
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
