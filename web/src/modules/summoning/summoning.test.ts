import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { withRift } from '../rift/rift'
import { levelUps, nextRift, reqAt, rules, summonBuys, summoning } from './summoning'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../../../src/game-eval'

const SAVE = new URL('../../../../data/save.json', import.meta.url).pathname

test('stored summonREQ is the requirement formula iterated from 10 at some start level (fixture and live save)', async () => {
  const saves = [await fullSave(), ...(existsSync(SAVE) ? [await Bun.file(SAVE).json()] : [])]
  for (const s of saves) {
    const start = Array.from({ length: s.summonLVL }, (_, i) => i).find((L) => Math.abs(reqAt(L, s.summonLVL) / s.summonREQ - 1) < 1e-12)
    expect(start).toBeDefined() // 2026-10 fixture: 61 → 89; save: 63 → 99
  }
})

test('level-up rule: threshold, carry-over, shrine head start; the summary agrees with it', async () => {
  const s = withRift(await fullSave()), r = rules(s), S = summoning(s)
  expect(r.cut).toBeCloseTo(Math.min(s.GiftShopLevels[22] / 5, 50) / 100, 12)
  expect(S.exp).toBeLessThan(S.threshold) // a stored save never sits past a level
  expect(levelUps(s, S.threshold - S.exp - 1).levels).toBe(0)
  const one = levelUps(s, S.threshold - S.exp + 5)
  expect(one.levels).toBe(1)
  expect(one.req).toBeCloseTo(1.3 * s.summonREQ + 120 * Math.floor((s.summonLVL + 1) / 10) + 2.5 * (s.summonLVL + 1) ** 1.8, 3)
  expect(one.exp).toBeCloseTo(5 + r.shrine * one.req, 3)
  expect(S.skillPointsPerDay).toBeCloseTo(S.levelsPerDay * r.sp, 12)
  expect(S.rifts.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1, 12)
})

test('summon buys: one list ranked by skill points per day per share of souls', async () => {
  const s = withRift(await fullSave()), list = summonBuys(s), { sp, cut } = rules(s)
  expect(list.length).toBeGreaterThan(0)
  for (const [i, b] of list.entries()) {
    expect(b.spPerDay / ((86400 * b.summon * sp) / (s.summonREQ * (1 - cut)))).toBeCloseTo(1, 9)
    if (i) expect(list[i - 1]!.spScore).toBeGreaterThanOrEqual(b.spScore)
  }
  expect(nextRift({ ...s, RiftsOwned: 9 })).toBeNull()
  expect(nextRift({ ...s, RiftsOwned: 2, SoulsTotal: [0, 300, 19] })).toEqual({ rift: 3, cost: [[2, 20], [1, 300]], affordable: false })
})

// ---- The game's own level-up code, run in the sandbox (dev only).
const bundle = new URL(`../../../../${BUNDLE}`, import.meta.url).pathname
const src = existsSync(bundle) ? loadBundle(bundle) : ''

test.skipIf(!src)('level-up equals the Limbo draw listener (level, EXP left, requirement, skill points)', async () => {
  const anchor = 'this.addWhenDrawingListener(null,(function(t,n,r,i){if(a.wrapper.enabled){if(8>=b.engine.getGameAttribute("RiftsOwned")'
  const i = src.indexOf(anchor, 21000000)
  expect(i).toBeGreaterThan(0)
  const fn = matchBraces(src, i + anchor.indexOf('function'))
  const s = withRift(await fullSave()), S = summoning(s), gain = S.threshold - S.exp + 5
  const a: any = { ...structuredClone(s), spiritEXP: 0, MTXgemportal: 0, SummonEXP: s.SummonEXP + gain, RiftEXP: s.RiftEXP.map(() => 0) }
  compile(fn, a, { p: { ...inert, randomInt: () => 100, getActor: () => inert, createRecycledActor() {}, getActorType() {}, runLater() {} } })(inert, 0, 0, 0)
  const mine = levelUps(s, gain)
  expect(a.summonLVL).toBe(mine.lv)
  expect(a.summonREQ / mine.req).toBeCloseTo(1, 12)
  expect(a.SummonEXP / mine.exp).toBeCloseTo(1, 9)
  expect(a.Skillpoints - s.Skillpoints).toBeCloseTo(rules(s).sp, 9)
})
