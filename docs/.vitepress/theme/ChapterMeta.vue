<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

const TOTAL = 12
const { page, frontmatter, theme } = useData()

type Item = { text?: string; link?: string; items?: Item[] }

const info = computed(() => {
  const path = page.value.relativePath
  const n = Number(path.match(/^(\d{2})-/)?.[1])
  if (!n) return null

  // Bab yang dipecah: cari grupnya di sidebar untuk tahu ini bagian ke berapa
  const link = '/' + path.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  let part: { index: number; count: number } | null = null
  const walk = (items: Item[]) => {
    for (const it of items) {
      const idx = it.items?.findIndex((c) => c.link === link) ?? -1
      if (idx >= 0 && it.items && /^\d+\./.test(it.text ?? '')) part = { index: idx + 1, count: it.items.length }
      if (it.items) walk(it.items)
    }
  }
  walk((theme.value.sidebar ?? []) as Item[])

  return { n, part: part as { index: number; count: number } | null, minutes: frontmatter.value.readingMinutes as number | undefined }
})
</script>

<template>
  <div v-if="info" class="chapter-meta">
    <ol class="track" :aria-label="`Bab ${info.n} dari ${TOTAL}`">
      <li v-for="i in TOTAL" :key="i" :class="{ done: i < info.n, now: i === info.n }" />
    </ol>
    <p class="text">
      <span class="chapter">Bab {{ info.n }} dari {{ TOTAL }}</span>
      <span v-if="info.part">Bagian {{ info.part.index }} dari {{ info.part.count }}</span>
      <span v-if="info.minutes">Sekitar {{ info.minutes }} menit baca</span>
    </p>
  </div>
</template>

<style scoped>
.chapter-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin-bottom: 20px;
}

.track {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.track li {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--vp-c-divider);
  border-radius: 50%;
}

.track li.done {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  opacity: 0.45;
}

.track li.now {
  width: 10px;
  height: 10px;
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.text {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--vp-c-text-2);
}

.chapter {
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
</style>
