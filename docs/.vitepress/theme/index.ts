import type { Theme } from 'vitepress'
// Tanpa Inter bawaan; font dimuat dari Google Fonts di config.mts
import DefaultTheme from 'vitepress/theme-without-fonts'
import { h } from 'vue'
import HeroCode from './HeroCode.vue'
import RoadMap from './RoadMap.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-image': () => h(HeroCode) }),
  enhanceApp({ app }) {
    app.component('RoadMap', RoadMap)
  },
} satisfies Theme
