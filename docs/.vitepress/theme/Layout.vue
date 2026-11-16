<script setup lang="ts">
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import { nextTick, provide } from 'vue'
import HeroCode from './HeroCode.vue'

const { isDark } = useData()

// Ganti tema dengan lingkaran yang menyebar dari tombol (resep resmi VitePress, memakai View Transitions API).
provide('toggle-appearance', async ({ clientX: x, clientY: y }: MouseEvent) => {
  const canAnimate =
    'startViewTransition' in document && window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  if (!canAnimate) {
    isDark.value = !isDark.value
    return
  }

  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]

  const root = document.documentElement
  root.classList.add('theme-transition')
  const transition = document.startViewTransition(async () => {
    isDark.value = !isDark.value
    await nextTick()
  })
  transition.finished.catch(() => {}).finally(() => root.classList.remove('theme-transition'))
  try {
    await transition.ready
  } catch {
    // browser membatalkan transisi (misalnya tab tersembunyi); temanya sudah berganti tanpa animasi
    return
  }

  root.animate(
    { clipPath: isDark.value ? clipPath.reverse() : clipPath },
    {
      duration: 400,
      easing: 'ease-in',
      fill: 'forwards',
      pseudoElement: `::view-transition-${isDark.value ? 'old' : 'new'}(root)`,
    },
  )
})
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <HeroCode />
    </template>
  </DefaultTheme.Layout>
</template>
