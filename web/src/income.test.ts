import { expect, test } from 'bun:test'
import { hoursUntil, incomeRates, resetTarget } from './income'

test('income rates and eta', () => {
  const h = [{ t: 0, shrine: [10, 5] }, { t: 60_000, shrine: [11, 5] }, { t: 2 * 36e5, shrine: [30, 5] }]
  const r = incomeRates(h)!
  expect(r.hours).toBe(2)
  expect(r.perHour).toEqual([10, 0])
  expect(hoursUntil(30, 80, r.perHour[0]!)).toBe(5)
  expect(hoursUntil(5, 6, r.perHour[1]!)).toBe(Infinity)
  expect(hoursUntil(30, 20, 0)).toBe(0)
  expect(incomeRates([{ t: 0, shrine: [1] }, { t: 1000, shrine: [2] }])).toBeNull() // < 5 min apart
})

test('resetTarget: best v/(h+down), previous run preferred', () => {
  const cur = [{ h: 1, v: 100 }, { h: 3, v: 240 }]
  expect(resetTarget([], cur, 0)).toEqual({ rate: 100, from: 'this run' })
  expect(resetTarget([], cur, 1)!.rate).toBe(60) // 240/4 beats 100/2
  expect(resetTarget([{ h: 2, v: 300 }], cur, 0)).toEqual({ rate: 150, from: 'previous run' })
  expect(resetTarget([], [], 0)).toBeNull()
})

import { existsSync } from 'fs'
import { BUNDLE, loadBundle } from '../../src/game-eval'
import { shrineMax } from './income'
const bundle = `${import.meta.dir}/../../${BUNDLE}`
const game = existsSync(bundle) ? loadBundle(bundle) : ''
test.skipIf(!game)('shrine cap: round(50 + _ShrineExtraLvList[sel]); extras on shrines 2, 4 (TankBonusLIST[49]) and 6, 9 ([50]); shrine 6 stops at 81', () => {
  const buy = game.slice(26764049, 26764049 + 900)
  expect(buy).toContain('_ShrineExtraLvList[0|b.engine.getGameAttribute("ShrineSelected")]')
  expect(buy).toContain('Math.round(50+')
  expect(buy).toContain('6==b.engine.getGameAttribute("ShrineSelected")?e=80<')
  const list = game.slice(26400580, 26402300).replace(/"number"==typeof \w+\?c\.__cast\(\w+,\w\):/g, '')
  const extras = [...list.matchAll(/TankBonusLIST"\)\[(\d+)\]\)[^;]*?splice\((\d+),0,Math\.ceil/g)].map((m) => [Number(m[2]), Number(m[1])])
  expect(extras).toEqual([[2, 49], [4, 49], [6, 50], [9, 50]])
  const save = { TankBonusLIST: Object.assign(Array(60).fill(0), { 49: 3.2, 50: 40 }) }
  expect([1, 2, 3, 4, 6, 9, 10].map((id) => shrineMax(save, id))).toEqual([50, 54, 50, 54, 81, 90, 50])
  expect(shrineMax({}, 2)).toBe(50)
})

// ---- Shrine and currency names against the game's own text (#2641).
test.skipIf(!game)('shrine names are the 12 the game draws in order; currencies are named after the Asylum bosses', async () => {
  const table = await Bun.file(new URL('./data/shrines.json', import.meta.url)).json()
  const names = ['WRATH', 'PRODIGIOUS', 'RECOUP', 'SCAVENGE', 'HEAVY_CASH', 'TALENT', 'EVISCERATE', 'HYDRATE', 'BEST_REST', 'THE_POWER', 'CHAIN_LEVEL', 'BREWERY']
  let at = 26_550_000
  for (const [i, n] of names.entries()) {
    const o = game.indexOf(`"${n}"`, at)
    expect(o, n).toBeGreaterThan(at - 1)
    at = o
    expect(table.shrines[i].name.toUpperCase().replace(/ /g, '_')).toBe(n)
  }
  expect(at).toBeLessThan(26_760_000)
  expect(Object.values(table.currency)).toEqual(['EMIGDALA', 'OCCULON', 'SCALLIUS', 'GORSHANK'].map((x) => x[0] + x.slice(1).toLowerCase()))
  for (const c of ['EMIGDALA', 'OCCULON', 'SCALLIUS', 'GORSHANK']) expect(game).toContain(`"${c}"`)
})
