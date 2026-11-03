import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { affordLevels, brewable, canMake, effectGain, nextBrews } from './alchemy'
import { nextPotionReq, potionLevelCost } from './potions-calc'

// A tiny save: potions 4 (+3%/lv crop gains) and 56 (-L% smithing cost, cap 98) discovered, two plain cauldrons.
const toy = (crop = 1e9, flower = 1e9) => {
  const PotionLV = Array(170).fill(0), PotionEXPreq = Array(170).fill(0), PotionEXP = Array(170).fill(0)
  PotionLV[3] = 10; PotionLV[55] = 96; PotionEXPreq[4] = 100; PotionEXPreq[56] = 100; PotionEXP[4] = 50
  const cur1 = Array(170).fill(1), cur2 = Array(170).fill(21)
  return { PotionLV, PotionEXPreq, PotionEXP, PotionsCostCurrency1: cur1, PotionsCostCurrency2: cur2, PbonusPotionCostRedux: 1, PotionGemCOST: [1, 1, 1],
    SeedsOwned: [0, crop], flowersOwned: [0, flower], CauldronsOwned: 2, PotionType: [0, 0, 0], PotionAnimationSpeed: [0, 1, 1], PotionExpGiven: [0, 1, 1],
    PotionBrewSpeedBOOST: [0, 1], ApothecaryLV: 0 } as Record<string, unknown>
}

test('affordLevels pays level by level at the growing price and stops when either material runs out', () => {
  const s = toy()
  const a = affordLevels(s, 4, 1)
  let L = 10, req = 100, crop = 1e9, flower = 1e9, k = 0
  for (;;) {
    const p = potionLevelCost(s, 4, 1, L, req)
    if (crop < p.qty || flower < p.flowerQty) break
    crop -= p.qty; flower -= p.flowerQty; k++; L++; req = nextPotionReq(req, 4)
  }
  expect(a.levels).toBe(k)
  expect(a.levels).toBeGreaterThan(0)
  expect(affordLevels(toy(0), 4, 1).levels).toBe(0)
  // #56 caps at 98: from 96 only two levels are worth paying for however much is held.
  expect(affordLevels(toy(1e30, 1e30), 56, 1).levels).toBe(2)
})

test('effectGain: "+x%" as ×(1 + x/100), "-x% cost" as ×1/(1 − x/100)', () => {
  const s = toy()
  expect(effectGain(s, 4, 11)!.gain).toBeCloseTo((100 + 33) / (100 + 30) - 1, 12)
  expect(effectGain(s, 56, 97)!.gain).toBeCloseTo(4 / 3 - 1, 12)
  expect(effectGain(s, 92, 2)).toBeNull()
})

test('canMake lists only affordable brewable potions; bang = next-level gain ÷ stock share', () => {
  const rows = canMake(toy())
  expect(rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([4, 56])
  for (const r of rows) expect(r.bang).toBeCloseTo(r.gain1 / r.share, 9)
  expect(rows.every((r) => r.sharedWith === 1)).toBe(true) // both pay with crop 1 / flower 1
  expect(canMake(toy(0))).toEqual([])
})

test('nextBrews: one potion per cauldron, greedy by gain, stock shared between picks', () => {
  const s = toy(1e30, 1e30)
  const b = nextBrews(s, 1e6)
  expect(b.map((x) => x.c)).toEqual([1, 2])
  expect(new Set(b.map((x) => x.id)).size).toBe(2)
  expect(b.find((x) => x.id === 56)!.levels).toBe(2) // capped
  // Stock for one level of one potion only: a single pick, the other cauldron gets nothing.
  const one = potionLevelCost(s, 56, 1, 96, 100)
  const tight = toy(one.qty * 1.01, one.flowerQty * 1.01)
  expect(nextBrews(tight, 1e6).length).toBe(1)
})

test('real save: every can-make row is brewable and every suggestion affordable', async () => {
  const s = await fullSave()
  const rows = canMake(s)
  expect(rows.length).toBeGreaterThan(0)
  for (const r of rows) { expect(brewable(s, r.id)).toBe(true); expect(r.qty).toBeLessThanOrEqual(r.cropHeld); expect(r.gainAll).toBeGreaterThanOrEqual(r.gain1) }
  const b = nextBrews(s, 24, 0.3)
  expect(b.length).toBeGreaterThan(0)
  for (const x of b) { expect(x.qty).toBeLessThanOrEqual((s.SeedsOwned as number[])[x.crop]!); expect(x.gain).toBeGreaterThan(0) }
})
