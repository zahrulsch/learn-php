<script setup lang="ts">
import { withBase } from 'vitepress'

// Urutan bab memang berurutan, jadi nomor dipakai sebagai stasiun di satu jalur.
const parts = [
  {
    name: 'PHP',
    range: 'Bab 1 sampai 7',
    result: 'Hasilnya: buku tamu dengan login, ditulis tanpa framework.',
    chapters: [
      { n: 1, title: 'Setup dan tooling', link: '/01-setup', desc: 'PHP 8.5 dan Composer di Docker, dengan PHPStan level max sejak hari pertama.' },
      { n: 2, title: 'Type system', link: '/02-type-system', desc: 'Union, nullable, enum, dan generics lewat PHPStan, dibandingkan dengan Rust dan TS.' },
      { n: 3, title: 'Dasar bahasa', link: '/03-dasar-bahasa', desc: 'Array yang sekaligus list dan map, == dan ===, match, serta closure.' },
      { n: 4, title: 'OOP', link: '/04-oop', desc: 'Interface, trait, readonly, property hooks, dan asymmetric visibility.' },
      { n: 5, title: 'Error handling', link: '/05-error-handling', desc: 'Exception, dan cara memodelkan kegagalan supaya tetap aman tipe.' },
      { n: 6, title: 'Ekosistem', link: '/06-ekosistem/', desc: 'Namespace, autoload, Pint, PHPUnit, dan Composer.' },
      { n: 7, title: 'PHP web tanpa framework', link: '/07-web-tanpa-framework/', desc: 'Request, session, dan PDO, plus pertahanan dari SQL injection, XSS, dan CSRF.' },
    ],
  },
  {
    name: 'Laravel',
    range: 'Bab 8 sampai 10',
    result: 'Hasilnya: Dompet, pencatat pengeluaran dengan API dan laporan bulanan.',
    chapters: [
      { n: 8, title: 'Laravel dasar', link: '/08-laravel-dasar', desc: 'Routing, controller, Blade, Eloquent, migration, dan validasi.' },
      { n: 9, title: 'Laravel lanjut', link: '/09-laravel-lanjut/', desc: 'Auth, Livewire, queue, API bertoken, test, dan Larastan.' },
      { n: 10, title: 'Proyek', link: '/10-proyek/', desc: 'Membangun Dompet dari folder kosong sampai siap dipasang di server.' },
    ],
  },
  {
    name: 'Rilis',
    range: 'Bab 11 dan 12',
    result: 'Hasilnya: Dompet online, dan setiap push ke GitHub langsung ter-deploy.',
    chapters: [
      { n: 11, title: 'Memilih hosting', link: '/11-memilih-hosting', desc: 'Shared, VPS, atau PaaS, dan cara memastikan sebuah paket sanggup menjalankan Laravel.' },
      { n: 12, title: 'Deploy ke shared hosting', link: '/12-deploy', desc: 'Rilis lewat symlink, rollback satu perintah, queue lewat cron, dan CI dari GitHub Actions.', goal: true },
    ],
  },
]
</script>

<template>
  <div class="roadmap vp-raw">
    <section v-for="part in parts" :key="part.name" class="part">
      <header class="part-head">
        <h3 class="part-name">{{ part.name }}</h3>
        <p class="part-range">{{ part.range }}</p>
        <p class="part-result">{{ part.result }}</p>
      </header>
      <ol class="stations">
        <li v-for="ch in part.chapters" :key="ch.n" class="station" :class="{ goal: ch.goal }">
          <span class="stop" aria-hidden="true">{{ ch.n }}</span>
          <div class="body">
            <a class="title" :href="withBase(ch.link)"><span class="sr-only">Bab {{ ch.n }}: </span>{{ ch.title }}</a>
            <p class="desc">{{ ch.desc }}</p>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.roadmap {
  margin-top: 8px;
}

.part {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  padding: 28px 0 8px;
  border-top: 1px solid var(--vp-c-divider);
}

@media (min-width: 768px) {
  .part {
    grid-template-columns: 240px 1fr;
    gap: 40px;
    padding-top: 36px;
  }
  .part-head {
    position: sticky;
    top: calc(var(--vp-nav-height) + 24px);
    align-self: start;
  }
}

.part-name {
  margin: 0;
  font-size: 24px;
  line-height: 32px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.part-range {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--vp-c-text-3);
}

.part-result {
  margin: 12px 0 0;
  max-width: 32ch;
  font-size: 15px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

.stations {
  margin: 0;
  padding: 0;
  list-style: none;
}

.station {
  position: relative;
  display: grid;
  grid-template-columns: 40px 1fr;
  column-gap: 18px;
  padding-bottom: 24px;
}

/* Garis jalur yang menyambungkan satu stasiun ke stasiun berikutnya */
.station:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 40px;
  bottom: 0;
  width: 2px;
  background: var(--vp-c-brand-1);
  opacity: 0.3;
}

.stop {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 2px solid var(--vp-c-brand-1);
  border-radius: 50%;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.goal .stop {
  border-color: var(--vp-c-brand-3);
  background: var(--vp-c-brand-3);
  color: var(--vp-c-white);
  box-shadow: 0 0 0 5px var(--vp-c-brand-soft);
}

.body {
  padding-top: 7px;
  min-width: 0;
}

.title {
  font-size: 17px;
  line-height: 26px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-decoration: none;
  border-radius: 4px;
  transition: color 0.2s;
}

.title:hover {
  color: var(--vp-c-brand-1);
}

.title:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.desc {
  margin: 4px 0 0;
  max-width: 62ch;
  font-size: 15px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

/* Jalur menyala mengikuti scroll: nomor bab menyala dan garisnya tergambar saat stasiun masuk layar.
   Browser yang belum mendukung scroll-driven animation menampilkan peta diam seperti biasa. */
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .station {
      view-timeline: --station block;
    }
    /* Rentang "entry": animasi selesai begitu stasiun seluruhnya masuk layar. Stasiun terakhir di dasar
       halaman tidak pernah naik ke tengah layar, jadi rentang yang memakai posisi tengah membuatnya
       tertinggal setengah menyala walaupun scroll sudah mentok. */
    .stop {
      animation: station-on linear both;
      animation-timeline: --station;
      animation-range: entry 0% entry 60%;
    }
    .body {
      animation: body-on linear both;
      animation-timeline: --station;
      animation-range: entry 0% entry 60%;
    }
    .station:not(:last-child)::before {
      transform-origin: top;
      animation: line-draw linear both;
      animation-timeline: --station;
      animation-range: entry 30% entry 100%;
    }
  }
}

@keyframes station-on {
  from {
    opacity: 0.2;
    transform: scale(0.85);
  }
}

@keyframes body-on {
  from {
    opacity: 0.25;
  }
}

@keyframes line-draw {
  from {
    transform: scaleY(0);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
