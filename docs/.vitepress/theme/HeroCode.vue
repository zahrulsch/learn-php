<script setup lang="ts">
// Ornamen hero: kode dan output PHPStan asli dari Bab 1, jadi isinya tetap benar kalau ada yang membacanya.
</script>

<template>
  <div class="hero-code" role="img" aria-label="Contoh dari Bab 1: PHPStan menolak greet(42) karena parameter $name bertipe string">
    <div class="window" aria-hidden="true">
      <div class="tab">
        <span class="file">src/hello.php</span>
        <span class="lang">PHP 8.5</span>
      </div>
      <pre class="code"><code><span class="ln">1</span><span class="kw">&lt;?php</span>
<span class="ln">2</span>
<span class="ln">3</span><span class="kw">declare</span><span class="p">(</span>strict_types<span class="p">=</span><span class="num">1</span><span class="p">);</span>
<span class="ln">4</span>
<span class="ln">5</span><span class="kw">function</span> <span class="fn">greet</span><span class="p">(</span><span class="ty">string</span> <span class="var">$name</span><span class="p">):</span> <span class="ty">string</span>
<span class="ln">6</span><span class="p">{</span>
<span class="ln">7</span>    <span class="kw">return</span> <span class="str">"Halo, {</span><span class="var">$name</span><span class="str">}!"</span><span class="p">;</span>
<span class="ln">8</span><span class="p">}</span>
<span class="ln">9</span>
<span class="ln">10</span><span class="kw">echo</span> <span class="fn">greet</span><span class="p">(</span><span class="str">'dunia'</span><span class="p">)</span> <span class="p">.</span> PHP_EOL<span class="p">;</span>
<span class="ln">11</span><span class="kw">echo</span> <span class="fn">greet</span><span class="p">(</span><span class="bad">42</span><span class="p">)</span> <span class="p">.</span> PHP_EOL<span class="p">;</span></code></pre>
      <div class="term">
        <p class="cmd"><span class="prompt">$</span> composer check</p>
        <p class="err"><span class="line-no">11</span><span>Parameter #1 $name of function greet expects string, int given.</span></p>
        <p class="sum">[ERROR] Found 1 error</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-code {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
  /* ukuran huruf mengikuti lebar ruang gambar hero, yang menyempit di layar 960-1150px */
  container-type: inline-size;
}

.window {
  --hc-size: clamp(10px, 2.75cqi, 13px);
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-code-block-bg);
  box-shadow: 0 24px 48px -24px rgb(0 0 0 / 0.35);
  font-family: var(--vp-font-family-mono);
  font-size: var(--hc-size);
  line-height: 1.75;
  text-align: left;
}

.tab {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
}

.file {
  color: var(--vp-c-text-1);
}

.lang {
  color: var(--vp-c-text-3);
}

.code {
  margin: 0;
  padding: 12px 16px 14px 0;
  overflow: hidden;
  white-space: pre;
  color: var(--vp-c-text-1);
}

.ln {
  display: inline-block;
  width: 3.2em;
  padding-right: 1.4em;
  text-align: right;
  color: var(--vp-c-text-3);
  user-select: none;
}

.kw {
  color: var(--vp-c-brand-1);
}

.ty {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.fn {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.var {
  color: var(--vp-c-text-2);
}

.str {
  color: var(--vp-c-warning-1);
}

.num {
  color: var(--vp-c-text-1);
}

.p {
  color: var(--vp-c-text-3);
}

/* Satu-satunya gerak: garis bergelombang di bawah 42 digambar setelah halaman dimuat */
.bad {
  position: relative;
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.bad::after {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: -0.25em;
  height: 0.38em;
  background: var(--vp-c-danger-1);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 3 2 1l2 2 2-2 2 2' fill='none' stroke='%23000' stroke-width='1.2'/%3E%3C/svg%3E") repeat-x left center / 0.6em 100%;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 3 2 1l2 2 2-2 2 2' fill='none' stroke='%23000' stroke-width='1.2'/%3E%3C/svg%3E") repeat-x left center / 0.6em 100%;
  clip-path: inset(0 100% 0 0);
  animation: squiggle 0.5s ease-out 0.7s forwards;
}

.term {
  padding: 10px 16px 12px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.term p {
  margin: 0;
}

.prompt {
  margin-right: 0.6em;
  color: var(--vp-c-brand-1);
}

.err,
.sum {
  opacity: 0;
  animation: appear 0.3s ease-out 1.2s forwards;
}

.err {
  display: flex;
  gap: 1.2em;
  margin-top: 4px !important;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}

.line-no {
  flex-shrink: 0;
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

.sum {
  margin-top: 4px !important;
  color: var(--vp-c-danger-1);
  font-weight: 600;
}

@keyframes squiggle {
  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes appear {
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bad::after {
    clip-path: none;
    animation: none;
  }
  .err,
  .sum {
    opacity: 1;
    animation: none;
  }
}
</style>
