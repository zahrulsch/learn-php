import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitepress'

// GitHub Pages menyajikan situs di /learn-php/; dev server lokal tetap di akar.
const base = process.env.GITHUB_ACTIONS ? '/learn-php/' : '/'
const siteUrl = 'https://zahrulsch.github.io/learn-php/'
const repo = 'https://github.com/zahrulsch/learn-php'

// Bab yang belum ditulis tidak diberi `link`, sehingga tampil sebagai teks biasa di sidebar.
export default defineConfig({
  base,
  lang: 'id-ID',
  title: 'Belajar PHP',
  description: 'PHP modern sampai Laravel dan deploy, untuk yang datang dari Rust dan TypeScript',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    // Kartu pratinjau saat link dibagikan di WhatsApp, Telegram, Discord, dan sejenisnya
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Belajar PHP' }],
    ['meta', { property: 'og:title', content: 'Belajar PHP: dari tipe ketat sampai deploy' }],
    ['meta', { property: 'og:description', content: 'PHP 8.5 dan Laravel 13, untuk yang datang dari Rust dan TypeScript.' }],
    ['meta', { property: 'og:image', content: `${siteUrl}og.png` }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
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
  markdown: {
    theme: { light: 'vitesse-light', dark: 'vitesse-dark' },
    codeCopyButtonTitle: 'Salin kode',
    config(md) {
      // VitePress hanya memakai [judul] blok kode sebagai label tab di code-group. Di luar itu
      // judulnya dibuang, jadi di sini ditampilkan sebagai bilah nama file di atas blok.
      const fence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const title = tokens[idx].info.match(/\[(.+)\]/)?.[1]
        const html = fence(tokens, idx, options, env, self)
        let depth = 0
        for (let i = idx - 1; i >= 0; i--) {
          if (tokens[i].type === 'container_code-group_close') depth--
          if (tokens[i].type === 'container_code-group_open' && ++depth > 0) return html
        }
        if (!title) return html
        return `<div class="vp-code-titled"><div class="vp-code-title">${md.utils.escapeHtml(title)}</div>${html}</div>`
      }
    },
  },
  // Perkiraan waktu baca untuk bilah info di awal tiap bab: 200 kata per menit, kode ikut dihitung
  transformPageData(pageData, { siteConfig }) {
    const source = readFileSync(join(siteConfig.srcDir, pageData.relativePath), 'utf8')
    const words = source.replace(/<!--[\s\S]*?-->/g, '').split(/\s+/).filter(Boolean).length
    pageData.frontmatter.readingMinutes = Math.max(1, Math.round(words / 200))
  },
  themeConfig: {
    logo: '/favicon.svg',
    nav: [{ text: 'Mulai belajar', link: '/01-setup' }],
    socialLinks: [{ icon: 'github', link: repo, ariaLabel: 'Repositori di GitHub' }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Perbaiki halaman ini di GitHub' },
    lastUpdated: { text: 'Terakhir diperbarui', formatOptions: { dateStyle: 'long', forceLocale: true } },
    footer: {
      message: 'Materi belajar PHP sampai Laravel dan deploy, dalam bahasa Indonesia.',
      copyright: `Sumber materi ada di <a href="${repo}">GitHub</a>.`,
    },
    darkModeSwitchLabel: 'Tampilan',
    lightModeSwitchTitle: 'Ganti ke mode terang',
    darkModeSwitchTitle: 'Ganti ke mode gelap',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Kembali ke atas',
    skipToContentLabel: 'Langsung ke konten',
    notFound: {
      code: '404',
      title: 'Halaman tidak ditemukan',
      quote: 'Alamatnya mungkin salah ketik, atau halamannya sudah pindah. Mulai lagi dari peta belajar di halaman awal.',
      linkLabel: 'Kembali ke halaman awal',
      linkText: 'Ke halaman awal',
    },
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
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Cari', buttonAriaLabel: 'Cari' },
          modal: {
            displayDetails: 'Tampilkan detail',
            resetButtonTitle: 'Hapus pencarian',
            backButtonTitle: 'Tutup pencarian',
            noResultsText: 'Tidak ada hasil untuk',
            footer: {
              selectText: 'buka',
              selectKeyAriaLabel: 'enter',
              navigateText: 'pilih',
              navigateUpKeyAriaLabel: 'panah atas',
              navigateDownKeyAriaLabel: 'panah bawah',
              closeText: 'tutup',
              closeKeyAriaLabel: 'escape',
            },
          },
        },
      },
    },
  },
})
