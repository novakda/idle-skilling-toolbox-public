import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { breedingPlan, childLevel, eggsTo } from './pet-breeding'
import { petsView } from './pets'
import { BUNDLE, compile, loadBundle } from '../../../../src/game-eval'

const bundle = `${import.meta.dir}/../../../../${BUNDLE}`
const slice = (src: string, from: string, to: string) => { const i = src.indexOf(from), j = src.indexOf(to, i); if (i < 0 || j < 0) throw new Error(`anchor ${from}`); return src.slice(i, j) }

// The game's own level statements, with randomInt pinned to its low or high end: rarity 1-5 (@28083998) and rarity ≥ 6 (@28136682).
test.skipIf(!existsSync(bundle))('child level range matches the game code', () => {
  const src = loadBundle(bundle)
  const main = slice(src, 'var $n=b.engine.getGameAttribute("PetValue1")', ';var Jr=b.engine.getGameAttribute("EggsCreated")')
  const special = slice(src, 'var pa=b.engine.getGameAttribute("PetValue1")', ';var Qa=b.engine.getGameAttribute("PetRarity")')
  const run = (code: string, a: number, b: number, ids: number[], r: number, V: number, t20: number, end: 'low' | 'high') => {
    const attrs: Record<string, unknown> = { PetValue1: [0, a, b], PetPositions: Object.assign([], { 7: 1, 8: 2 }), TankBonusLIST: Object.assign([], { 20: t20 }),
      EggsCreated: [0, r], NestLevelsVSE: [0, V] }
    const host = { wrapper: { enabled: true }, _NestSelected: 1, _PetINDEX: [0, ...ids], _dummyListEggAmount: [0, 1] }
    const randomInt = (x: number, y: number) => (end === 'low' ? Math.min(x, y) : Math.max(x, y))
    compile(`function(){ ${code} }`, attrs, { a: host, p: { randomInt } })()
    return (attrs.PetValue1 as number[])[0]
  }
  for (const [a, b] of [[30, 41], [45, 47], [1, 1], [40, 40], [12, 90]]) for (const ids of [[16, 17], [2, 3], [71, 9], [44, 45]])
    for (const r of [1, 2, 3, 5]) for (const V of [0, 28, 60, 300]) for (const t20 of [0, 11.89, 50]) {
      const c = childLevel(a!, b!, ids, r, V, t20)
      expect([c.low, c.high]).toEqual([run(main, a!, b!, ids, r, V, t20, 'low'), run(main, a!, b!, ids, r, V, t20, 'high')])
      expect(c.mean).toBe((c.low + c.high) / 2) // randomInt is uniform over integers
    }
  for (const r of [6, 7]) expect(childLevel(45, 47, [17, 9], r, 60, 11.89).low).toBe(run(special, 45, 47, [17, 9], r, 60, 11.89, 'low'))
})

test('lo/hi follow docs/pets.md', () => {
  // Parents 30 and 41, ids 16/17, rarity 1, V 28, TankBonusLIST[20] 12: k = 0.75, lo = trunc(22.5) = 22,
  // hi = trunc(min(41.41, 41 + 41^(0.3+17/130)) + (28/48)^1.5) = trunc(41.41 + 0.4455) = 41 → level 24..43.
  expect(childLevel(30, 41, [16, 17], 1, 28, 12)).toEqual({ low: 24, high: 43, mean: 33.5 })
  expect(childLevel(30, 41, [16, 17], 6, 28, 12).low).toBe(Math.ceil(1.03 * 47))
})

test('eggsTo: zero at the target, more eggs for a higher one, no ceiling', () => {
  const w = new Map([[1, 1]]), e = (X: number) => eggsTo(X, 40, 45, [17, 17], w, 60, 12)
  expect(e(45)).toBe(0)
  expect(e(46)).toBeGreaterThan(1)
  expect(e(50)).toBeGreaterThan(e(46))
  expect(Number.isFinite(e(100))).toBe(true) // hi exceeds the better parent every time (max^(0.3+m/130)·r), so levels have no cap
})

test('breeding plan on the save: owned, unused-elsewhere pets; current pair inside the formula bounds', async () => {
  const s = await fullSave(), v = petsView(s), plan = breedingPlan(s, v)
  const owned = new Map(v.pets.map((p) => [p.slot, p])), seen = new Set<number>()
  for (const x of plan.nests) {
    if (!x.best) continue
    for (const p of x.best.pair) {
      expect(owned.get(p.slot)).toBe(p) // owned
      expect(p.group === 'Idle' || p.group.startsWith('Nest ')).toBe(true) // not pulled out of trekking or a capsule
      expect(seen.has(p.slot)).toBe(false); seen.add(p.slot) // never in two nests at once
    }
  }
  // A nest whose current pair no other nest took keeps a pick at least as good as that pair.
  for (const x of plan.nests) if (x.now && x.best && !plan.nests.some((y) => y !== x && y.best?.pair.some((p) => x.now!.pair.includes(p))))
    expect(x.gain!).toBeGreaterThanOrEqual(-1e-9)
  const t20 = Number(s.TankBonusLIST[20])
  for (const x of plan.nests) if (x.now) {
    const [a, b] = x.now.pair.map((p) => p.level) as [number, number], mn = Math.min(a, b), mx = Math.max(a, b)
    for (const { r } of x.weights) {
      const k = 0.7 + t20 / 240, top = mx * (1 + r / 100) + (x.V / 20) ** 1.5 + r + 1
      expect(x.now.low).toBeGreaterThanOrEqual(Math.floor(mn * k) + r + 1)
      expect(x.now.mean).toBeGreaterThanOrEqual(x.now.low)
      expect(x.now.mean).toBeLessThanOrEqual(x.now.high)
      expect(x.now.high).toBeLessThanOrEqual(top)
    }
  }
})
