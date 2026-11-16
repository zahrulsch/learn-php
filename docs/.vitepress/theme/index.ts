import type { Theme } from 'vitepress'
// Tanpa Inter bawaan; font dimuat dari Google Fonts di config.mts
import DefaultTheme from 'vitepress/theme-without-fonts'
import { nextTick } from 'vue'
import Layout from './Layout.vue'
import RoadMap from './RoadMap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app, router }) {
    app.component('RoadMap', RoadMap)
    if (typeof window === 'undefined') return

    // Konten halaman baru masuk dengan animasi CSS setelah tampil. Sengaja tidak memakai View Transitions:
    // lapisannya menutupi halaman dan menelan klik kalau pengunjung berpindah halaman dengan cepat.
    router.onAfterRouteChange = async () => {
      await nextTick()
      const content = document.querySelector('.VPContent')
      if (!content) return
      content.classList.remove('page-enter')
      void (content as HTMLElement).offsetWidth // mulai ulang animasi
      content.classList.add('page-enter')
    }
  },
} satisfies Theme
