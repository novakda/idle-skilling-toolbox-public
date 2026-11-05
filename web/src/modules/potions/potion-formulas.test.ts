// potion-formulas.ts against the game: the Pbonus block (run per potion, one level at a time) and each potion's own
// tooltip draw code (run in the sandbox, text captured). Run from the repo root: bun test web/src/potion-formulas.
import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { BUNDLE, compile, haxeMap, inert, loadBundle, matchBraces } from '../../../../src/game-eval'
import { POTION_FORMULAS } from './potion-formulas'
import catalog from '../../data/potion-catalog.json'

const bundle = new URL(`../../../../${BUNDLE}`, import.meta.url).pathname
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const PLACEHOLDER = (id: number) => id >= 107 && id <= 121 // "A": no tooltip branch, no reads
// Potions whose tooltip states something other than what the Pbonus block applies (the table follows the block):
// display caps 1.5/3/4/5.5 vs 2.5/2.5/3/4.7, Shiny 20 vs 10/merit, Smalloan capped at 99 in text only, Distill Till 2%
// per 5 tilling lv vs 0.45%/lv, Riche Biche 325 vs 300, Pot Enabler/More Fast without the ⌈L/500⌉ factor, Tealy ×2 vs 1.7.
const TOOLTIP_DIFFERS = new Set([33, 43, 46, 53, 59, 69, 82, 86, 88, 124, 149,
  // Tooltip vs the code that applies it (table follows the code): Unparalleled 1.5·L^0.85 (@22249268), Dippah 70 (@19356117),
  // Evoluzin 150 per Hatchery^0.82/25 (@27585459), Crackin Yolk ×(1+min(2.5C,2)) (@15761604), Olivertime exponent (@2682648),
  // Gray Drank ×(1.021+.045C)^ConstructionLV (@2693184), Injurade 75·3.5/4 (@27308657), Yolks 10+75C max 40 (@15760486),
  // Donut Bottle 1.52 (@30891395), Riche Biche 110 (@2664908), Genetea 80 max 60 (@28094308), Trunkoke 35 max 34 (@2647671).
  94, 102, 126, 132, 140, 142, 143, 144, 145, 148, 155, 156])
// Which number in the tooltip text is the potion's value (default: the first).
const NTH: Record<number, number> = { 131: 1, 132: 1 }

const val = (d: number): any => new Proxy(function () {}, { get: (_t, p) => (p === Symbol.toPrimitive ? () => d : p === 'length' ? 0 : val(d)), apply: () => val(d) })
const attrsOf = (base: Record<string, unknown>, d: number): any =>
  new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : val(d)), has: () => true, set: (t, k: string, v) => ((t[k] = v), true) })
const one = (i: number, L: number, more: Record<number, number> = {}) => {
  const lv = Array<number>(200).fill(0); lv[i] = L
  for (const [j, x] of Object.entries(more)) lv[+j] = x
  return lv
}

// ---- Pbonus block: the periodic function that writes every Pbonus key.
const blockAt = src ? src.lastIndexOf('function(t){', src.indexOf('setReserved("PbonusTotalDmg1"')) : -1
const block = src ? matchBraces(src, blockAt) : ''
function runBlock(lv: number[]) {
  // Other stats 10 ("per 10 levels" terms read ×1); the counts some keys gate on made non-zero.
  const a = attrsOf({ PotionLV: lv, CardLevels: Array(600).fill(5), TreasureOwned: Array(30).fill(2e6), ConquestLV: 170 }, 10)
  ;(compile(block, a) as any).call({}, 0)
  return Object.fromEntries(Object.keys(a).filter((k) => k.startsWith('Pbonus')).map((k) => [k, Number(a[k])])) as Record<string, number>
}

// ---- Tooltips: `if(N==aa)` branches in the drawing listeners just before the block, one per potion index.
const branch = new Map<number, number>()
if (src) for (const m of src.slice(blockAt - 800000, blockAt).matchAll(/(\d+)==b\.engine\.getGameAttribute\("aa"\)/g)) branch.set(+m[1]!, blockAt - 800000 + m.index!)
const fns = new Map<number, string>()
function tooltip(i: number, L: number): string {
  const s = src.lastIndexOf('function(n,i,o,s){', branch.get(i)!)
  if (!fns.has(s)) fns.set(s, matchBraces(src, s))
  const out: string[] = []
  const font: any = { font: { getTextWidth: (t: unknown) => (out.push(String(t)), 0), getFontHeight: () => 0 }, fontScale: 1, letterSpacing: 0 }
  const n: any = new Proxy({ font, defaultFont: font, drawActor: false, x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1 }, { get: (t: any, k) => (k in t ? t[k] : inert) })
  const p = new Proxy({ getFont: () => null }, { get: (t: any, k) => (k in t ? t[k] : inert) })
  const a = attrsOf({ PotionLV: one(i, L), PotionSelected: i + 1, CauldronLV1: [1, 1, 1, 1, 1, 1, 1], CauldronSelected: 1, CauldronMenuSelected: 1 }, 0)
  ;(compile(fns.get(s)!, a, { p, d: { drawnStringCache: haxeMap(), drawnStringCacheKeys: [] } }) as any).call(new Proxy({}, { get: () => inert }), n, 0, 0, 0)
  return out.join(' / ')
}
const nums = (s: string) => [...s.matchAll(/\d+(?:\.\d+)?/g)].map((m) => +m[0])
const step = (s: string) => 10 ** -(s.split('.')[1]?.length ?? 0) // the tooltip's rounding unit

test.skipIf(!src)('every potion has a tooltip branch (placeholders 107-121 none) and a formula unless it states no amount', () => {
  const none: number[] = []
  for (let id = 1; id <= 169; id++) {
    expect(branch.has(id - 1)).toBe(!PLACEHOLDER(id))
    if (!PLACEHOLDER(id) && !POTION_FORMULAS[id]) none.push(id)
  }
  // Bob Perfume (no description), level-up chains (96 red/orange/yellow, 104 green/cyan/purple, 106 demon/godly),
  // Lupinis (a power on Oberon kills that depends on smith item 76), Nevasettle (unlocks Forewordi's aberrant term).
  expect(none).toEqual([92, 96, 97, 104, 106, 169])
})

test.skipIf(!src)('formula value = the number the potion tooltip shows, levels 1 and 100', () => {
  const bad: string[] = []
  for (const [id, p] of Object.entries(POTION_FORMULAS).map(([k, v]) => [+k, v] as const)) {
    if (TOOLTIP_DIFFERS.has(id)) continue
    for (const L of [1, 100]) {
      const tt = tooltip(id - 1, L), gs = [...tt.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])[NTH[id] ?? 0]!, g = +gs, v = p.v(L)
      // The tooltip rounds to its last digit (floor/ceil/round; +0.01 on the "×" ones) and shows ln terms per power of 10 rounded.
      if (!(Math.abs(v - g) <= 0.015 * Math.abs(g) + step(gs) + 0.011)) bad.push(`#${id} L${L}: table ${v} vs tooltip ${g} (${tooltip(id - 1, L)})`)
    }
  }
  expect(bad).toEqual([])
})

test.skipIf(!src)('block potions: the Pbonus key, shape and caps (levels 1/100/1000) and the Blasphemy multiplier match the game', () => {
  const bad: string[] = []
  for (const [id, p] of Object.entries(POTION_FORMULAS).map(([k, v]) => [+k, v] as const)) {
    if (!p.k) continue
    const d = (L: number, more = {}) => { const r = runBlock(one(id - 1, L, more)), r0 = runBlock(one(id - 1, 0, more)); return r[p.k!]! - r0[p.k!]! }
    const ones = Object.fromEntries(Array.from({ length: 169 }, (_, j) => [j, j === 94 ? 0 : 1])) // products need the other factors present
    if (runBlock(one(id - 1, 100, { ...ones, [id - 1]: 100 }))[p.k] === runBlock(one(id - 1, 0, { ...ones, [id - 1]: 0 }))[p.k]) { bad.push(`#${id}: ${p.k} doesn't move`); continue }
    if (p.x) continue // products (cost multipliers, ×factors): key checked, shape via the tooltip test
    if (id === 83) continue // Drop of Each: .02·L × total potion level, which includes its own L (quadratic in the one-hot run)
    const ratios = [1, 100, 1000].map((L) => d(L) / p.v(L))
    if (ratios.some((r) => Math.abs(r / ratios[0]! - 1) > 1e-9)) bad.push(`#${id}: shape ${ratios}`)
    const withBlasphemy = d(100, { 94: 50 }) / d(100) // S = 1 + 0.02·50 = 2
    if (Math.abs(withBlasphemy - (p.m ? 2 : 1)) > 1e-9) bad.push(`#${id}: multiplier ${withBlasphemy}, table m=${p.m ?? 0}`)
  }
  expect(bad).toEqual([])
})

test.skipIf(!src)('every potion the block reads is in the table under a key it moves', () => {
  const b0 = runBlock(one(0, 0)), bad: string[] = []
  for (let i = 0; i < 169; i++) {
    if (i === 94) continue // Blasphemy: the multiplier itself
    const r = runBlock(one(i, 100))
    const moved = Object.keys(r).filter((k) => r[k] !== b0[k] && !k.endsWith('SUM'))
    if (moved.length && !moved.includes(POTION_FORMULAS[i + 1]?.k ?? '')) bad.push(`#${i + 1} moves ${moved}, table ${POTION_FORMULAS[i + 1]?.k}`)
  }
  expect(bad).toEqual([])
})

test('catalog per-level text agrees with the table for every linear potion', () => {
  const bad: string[] = []
  for (const c of catalog as { id: number; bonus: string | null }[]) {
    const p = POTION_FORMULAS[c.id]
    if (!p || Math.abs(p.v(100) / p.v(1) - 100) > 1e-9 || Math.abs(p.v(2) / p.v(1) - 2) > 1e-9) continue
    const n = c.bonus ? nums(c.bonus)[0] : undefined
    // 2%: the ln terms are quoted per power of 10 (0.2475 → "0.25").
    if (n == null || Math.abs(n - p.v(1)) > 0.02 * p.v(1)) bad.push(`#${c.id}: "${c.bonus}" vs ${p.v(1)}`)
  }
  expect(bad).toEqual([])
})
