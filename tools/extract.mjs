// Mengekstrak contoh kode dari satu halaman bab ke proyek uji, supaya kode di dokumen = kode yang diuji.
// Penanda (komentar HTML, tidak tampil di halaman) tepat sebelum fence ```php:
//   <!-- file: src/Ch02/basics.php -->                      file utuh, harus lulus PHPStan
//   <!-- demo: nama -->                                      file utuh, memang diharapkan error
//   <!-- demo: nama append: src/Ch02/basics.php -->          potongan yang ditempel di akhir file dasar
//   tambahkan kata "norun" untuk demo yang tidak perlu dijalankan dengan php
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [md, project, chapter] = process.argv.slice(2)
const text = readFileSync(md, 'utf8').replace(/\r\n/g, '\n')
const re = /<!--\s*(file|demo):\s*(\S+)(?:\s+append:\s*(\S+))?(\s+norun)?\s*-->\n+```php\n([\s\S]*?)\n```/g

rmSync(join(project, 'src', chapter), { recursive: true, force: true })
rmSync(join(project, 'demo', chapter), { recursive: true, force: true })
mkdirSync(join(project, 'demo', chapter), { recursive: true })

const files = new Map()
const norun = []
let count = 0
for (const [, kind, name, base, skip, code] of text.matchAll(re)) {
  let path, body
  if (kind === 'file') {
    path = name
    body = code + '\n'
    files.set(name, body)
  } else {
    path = `demo/${chapter}/${name}.php`
    if (base) {
      if (!files.has(base)) throw new Error(`demo ${name}: file dasar ${base} belum didefinisikan sebelumnya`)
      body = files.get(base) + '\n' + code + '\n'
    } else {
      body = code + '\n'
    }
    if (skip) norun.push(`${name}.php`)
  }
  const full = join(project, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, body)
  count++
}
writeFileSync(join(project, 'demo', chapter, '.norun'), norun.join('\n') + '\n')
console.log(`${count} blok diekstrak dari ${md}`)
