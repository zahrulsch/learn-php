// Memberi nama file pada blok kode: ```php menjadi ```php:line-numbers [src/Ch02/basics.php].
// Sumber nama file:
//   1. penanda <!-- file: path --> tepat sebelum blok (file utuh yang diuji tools/extract.mjs)
//   2. kalimat tepat sebelum blok yang berakhir dengan `path`: (misalnya "Buat `app/Models/Task.php`:")
// Nomor baris hanya untuk file utuh (bukan potongan yang "ditambahkan"), supaya
// cocok dengan nomor baris di pesan PHPStan. Blok yang sudah berjudul dilewati.
// node tools/code-titles.mjs <docsDir> [--write]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const [docs, flag] = process.argv.slice(2)
const write = flag === '--write'
const files = []
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f)
  if (statSync(p).isDirectory()) { if (!['node_modules', '.vitepress', 'public'].includes(f)) walk(p) }
  else if (f.endsWith('.md')) files.push(p)
})
walk(docs)

// path pertama di kalimat yang berakhir dengan titik dua
const pathRe = /:$/
const firstPath = /`([\w./-]+\.[a-z]{2,10})`/
let total = 0
for (const file of files.sort()) {
  const lines = readFileSync(file, 'utf8').split('\n')
  let fence = false
  lines.forEach((line, i) => {
    const m = line.match(/^```(\w+)(.*)$/)
    if (!m) { if (/^```/.test(line)) fence = !fence; return }
    if (fence) return
    fence = true
    const [, lang, rest] = m
    if (rest.includes('[') || ['text', 'bash', 'powershell'].includes(lang)) return
    // baris tak kosong sebelum blok
    let j = i - 1
    while (j >= 0 && lines[j].trim() === '') j--
    const prev = lines[j] ?? ''
    let title, full
    const marker = prev.match(/^<!-- file: (\S+) -->$/)
    if (marker) { title = marker[1]; full = true }
    else if (!prev.startsWith('<!--')) {
      const p = pathRe.test(prev) && prev.match(firstPath)
      // potongan yang ditambahkan ke file yang sudah ada tidak diberi nomor baris
      if (p) { title = p[1]; full = !/tambah/i.test(prev) }
    }
    if (!title) return
    lines[i] = '```' + lang + (full ? ':line-numbers' : '') + rest + ` [${title}]`
    total++
    console.log(`${relative(docs, file)}:${i + 1}  ${lines[i]}${marker ? '' : `    <- ${prev.slice(0, 90)}`}`)
  })
  if (write) writeFileSync(file, lines.join('\n'))
}
console.log(`${total} blok ${write ? 'diberi' : 'akan diberi'} nama file`)
