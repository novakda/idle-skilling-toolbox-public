// Dev tool: which values a Steam Cloud save lacks, how the game produces each (ui / const / derived), and the
// derived-value dependency graph. Heuristic (1500-char statement window; aliased writes are missed). Usage:
//   bun src/state-gaps.ts <path to is.bin>   -> data/game/state-gaps.json + ranked summary
import { parseSave } from '../web/src/save-load'
const G = await Bun.file('data/game/asar/distBuild/static/game/Qno2x.js').text()
const full = JSON.parse(await Bun.file('data/save.json').text())
const cloud = parseSave(await Bun.file(process.argv[2] ?? 'data/is.bin').text()).save as any
const missing = new Set(Object.keys(full).filter((k) => cloud[k] === undefined))
const allKeys = new Set(Object.keys(full))
// script owner of an offset
const marks = [...G.matchAll(/__name__="scripts\.(\w+)"/g)].map((m) => [m.index!, m[1]!] as const)
const owner = (i: number) => (marks.find(([j]) => j > i)?.[1] ?? '?')
const reads: Record<string, number> = {}
for (const m of G.matchAll(/getGameAttribute\("(\w+)"\)/g)) reads[m[1]!] = (reads[m[1]!] ?? 0) + 1
const UI = /^aa\d*$|Selected|SELECTED|selected|[Pp]osition|Rng|RNG|random|Particles|Toggle|Menu|Screen|Dragging|Hover|Click|Xpos|Ypos|DNSM|Tickets|Camera|Mouse|Tutorial|Popup|Display|Shown|Timer$|Cooldown|animation|Animation|amount2next/
type Info = { key: string; cls: string; inputs: Set<string>; owners: Set<string>; writes: number; reads: number; nonNeutral: boolean }
const info: Record<string, Info> = {}
for (const k of missing) {
  const re = new RegExp('setReserved\\("' + k + '",|\\.h\\.' + k + '=|getGameAttribute\\("' + k + '"\\)\\[[^\\]]{1,40}\\]=(?!=)', 'g')
  const ws = [...G.matchAll(re)].map((m) => m.index!)
  const inputs = new Set<string>(), owners = new Set<string>(); let literal = 0, ui = 0
  for (const i of ws) {
    owners.add(owner(i))
    const stmtStart = Math.max(G.lastIndexOf(';', i - 1), G.lastIndexOf('{', i - 1), i - 1500)
    const win = G.slice(stmtStart, i + 160)
    const rhs = G.slice(i, i + 160).match(/^[^,;)]*[,=]\s*([^;,)]*)/)?.[1] ?? ''
    if (/^[\d.e+-]+$|^"[^"]*"$|^!?[01]$/.test(rhs.trim())) literal++
    const ctx = G.slice(Math.max(0, i - 4000), i); if (/addMouse|addWhenDrawing|MouseOver|Clicked|Pressed/.test(ctx.slice(-1500))) ui++
    for (const m of win.matchAll(/getGameAttribute\("(\w+)"\)/g)) if (m[1] !== k && allKeys.has(m[1]!)) inputs.add(m[1]!)
  }
  const v = full[k], nonNeutral = Array.isArray(v) ? v.some((x: any) => typeof x === 'number' && x !== 0 && x !== 1) : typeof v === 'number' && v !== 0 && v !== 1
  const cls = UI.test(k) ? 'ui' : ws.length === 0 ? 'nowrite' : literal === ws.length ? 'const' : ui === ws.length ? 'ui-handler' : 'derived'
  info[k] = { key: k, cls, inputs, owners, writes: ws.length, reads: reads[k] ?? 0, nonNeutral }
}
const derived = Object.values(info).filter((x) => x.cls === 'derived')
// dependents among derived keys (reverse edges), transitive
const rev: Record<string, Set<string>> = {}
for (const d of derived) for (const i of d.inputs) if (info[i]?.cls === 'derived') (rev[i] ??= new Set()).add(d.key)
const trans = (k: string, seen = new Set<string>()): Set<string> => { for (const x of rev[k] ?? []) if (!seen.has(x)) { seen.add(x); trans(x, seen) } return seen }
// layers: 0 = inputs are all cloud/const; n = max(layer of derived inputs)+1 (cycles capped)
const layer: Record<string, number> = {}
for (let pass = 0; pass < 12; pass++) for (const d of derived) layer[d.key] = Math.max(0, ...[...d.inputs].filter((i) => info[i]?.cls === 'derived' && i !== d.key).map((i) => Math.min((layer[i] ?? 0) + 1, 9)))
const counts: Record<string, number> = {}; for (const x of Object.values(info)) counts[x.cls] = (counts[x.cls] ?? 0) + 1
console.log('missing', missing.size, counts)
await Bun.write('data/game/state-gaps.json', JSON.stringify(derived.map((d) => ({ key: d.key, owners: [...d.owners], inputs: [...d.inputs], missingInputs: [...d.inputs].filter((i) => missing.has(i)), reads: d.reads, dependents: trans(d.key).size, layer: layer[d.key], nonNeutral: d.nonNeutral })), null, 1))
console.log('derived', derived.length)
const other = derived.filter((d) => d.nonNeutral).sort((a, b) => b.reads - a.reads)
console.log('\nTOP NON-NEUTRAL DERIVED (reads, key, owner):'); for (const d of other.slice(0, 70)) process.stdout.write(`${d.reads} ${d.key} [${[...d.owners].slice(0, 2).join('/')}]  `)
console.log('\n\nNOWRITE (never written in code):', Object.values(info).filter((x) => x.cls === 'nowrite').map((x) => x.key).join(' '))
console.log('\nCONST sample:', Object.values(info).filter((x) => x.cls === 'const').slice(0, 30).map((x) => x.key).join(' '))
