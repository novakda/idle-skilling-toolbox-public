// Move files into web/src/modules/<module>/ and rewrite every relative import that points at them (refactor step 10, #73).
// Covers static/dynamic imports and re-exports in web/src (recursive), src/ and scripts/, plus the moved files' own
// imports and their import.meta-relative path strings (new URL('…', import.meta.url), `${import.meta.dir}/…`).
// usage: bun scripts/move-module.ts --module candy --files candy.ts components/Candy.vue candy.test.ts [--dry-run]
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

const args = process.argv.slice(2)
const flag = (k: string) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]! }
const mod = flag('--module'), dry = args.includes('--dry-run')
const fi = args.indexOf('--files'), files = fi < 0 ? [] : args.slice(fi + 1).filter((a) => !a.startsWith('--'))
if (!mod || !files.length) { console.error('usage: --module <name> --files <path relative to web/src>...'); process.exit(2) }

const ROOT = resolve(import.meta.dir, '..'), WEB = join(ROOT, 'web/src'), DEST = join(WEB, 'modules', mod)
const moves = new Map<string, string>()
for (const f of files) {
  const from = join(WEB, f)
  if (!existsSync(from)) { console.error(`missing: ${f}`); process.exit(2) }
  moves.set(from, join(DEST, f.split('/').pop()!))
}
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  if (n === 'node_modules' || n === 'data' || n.startsWith('.')) return []
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(n) ? [p] : []
})
const all = [...walk(WEB), ...['src', 'scripts'].flatMap((d) => existsSync(join(ROOT, d)) ? walk(join(ROOT, d)) : [])]
const newPath = (p: string) => moves.get(p) ?? p
const resolveSpec = (fromFile: string, spec: string) => {
  const base = resolve(dirname(fromFile), spec)
  for (const c of [base, base + '.ts', base + '.vue', join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}
const rel = (fromDir: string, to: string) => { const r = relative(fromDir, to); return r.startsWith('.') ? r : './' + r }

let changed = 0
for (const file of all) {
  const src = readFileSync(file, 'utf8'), fileNew = newPath(file), dirNew = dirname(fileNew), moved = moves.has(file)
  let out = src.replace(/((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, pre, q, spec) => {
    const target = resolveSpec(file, spec)
    if (!target) return m
    if (!moved && !moves.has(target)) return m
    let r = rel(dirNew, newPath(target))
    if (!/\.(ts|vue|json)$/.test(spec)) r = r.replace(/\.ts$/, '')
    return `${pre}${q}${r}${q}`
  })
  if (moved) {
    // import.meta-relative path strings: re-aim them from the new directory at the same place.
    const fix = (spec: string) => { const abs = resolve(dirname(file), spec); return relative(dirNew, abs) + (spec.endsWith('/') ? '/' : '') }
    out = out.replace(/new URL\((['`])([^'`$]+)\1, import\.meta\.url\)/g, (_m, q, spec) => `new URL(${q}${fix(spec)}${q}, import.meta.url)`)
      .replace(/(\$\{import\.meta\.dir\}\/)([^`$'"]*)/g, (_m, pre, spec) => spec ? `${pre}${fix(spec)}` : _m)
      .replace(/(new URL\(`)([^`$]*)(\$\{)/g, (_m, pre, spec, tail) => `${pre}${fix(spec)}${tail}`)
  }
  if (out !== src) { changed++; if (!dry) writeFileSync(file, out) }
}
if (!dry) { mkdirSync(DEST, { recursive: true }); for (const [a, b] of moves) renameSync(a, b) }
console.log(`${dry ? '[dry-run] ' : ''}${mod}: moved ${moves.size} file(s) to ${relative(ROOT, DEST)}, rewrote imports in ${changed} file(s)`)
