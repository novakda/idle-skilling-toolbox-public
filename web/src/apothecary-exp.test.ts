import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { cauldronExp, expBonus, expPlan, expRates, levelNeeds, nextReq, nextUnlocks, unlockLevel } from './apothecary-exp'
import { withDeckLinks } from './cards-calc'
import catalog from './data/potion-catalog.json'
import { fresh } from './screen-bound'

const live = () => Bun.file(new URL('../../data/save.json', import.meta.url)).json()
const ids = catalog.map((p) => p.id)
const saves = async () => [await fullSave(), await live()]

test('card EXP bonus reproduces the stored ApothecaryExpGivenBONUS (1 + CbonusApothecaryExp/100, deck link 4)', async () => {
  // ApothecaryExpGivenBONUS is written once, at the Potions scene init (screen-bound.ts), so the live save (index 1) holds the value
  // of the last Potions visit; only compare it when fresh.
  for (const [j, s] of (await saves()).entries()) if (j === 0 || fresh(s, 'ApothecaryExpGivenBONUS')) expect(expBonus(withDeckLinks(s))).toBeCloseTo(s.ApothecaryExpGivenBONUS, 9)
})

test('recomputed boosts give the same EXP rate as the stored ones (fixture)', async () => {
  const s = await fullSave()
  expect(expRates(s, 100, false).active).toBeCloseTo(expRates(s, 100).active, 6)
})

test('REQ growth: fixture REQ grown level by level matches the live save REQ', async () => {
  const [a, b] = await saves()
  if (b.ApothecaryLV < a.ApothecaryLV || (b.PotionLV[99] ?? 0) > 0) return // a rebirth or potion-100 skips in between
  let req = a.ApothecaryREQ
  for (let L = a.ApothecaryLV + 1; L <= b.ApothecaryLV; L++) req = nextReq(req, L)
  expect(req / b.ApothecaryREQ).toBeCloseTo(1, 12)
})

test('brew gate: every potion past level 1 has an unlock level the save has reached', async () => {
  for (const s of await saves())
    for (const id of ids) if ((s.PotionLV[id - 1] ?? 0) >= 2) expect(unlockLevel(id)).toBeLessThanOrEqual(s.ApothecaryLV)
  expect([8, 9, 18, 19, 61, 70, 83].map(unlockLevel)).toEqual([8, 12, 21, 26, 80, 94, 113])
})

test('the potion brewed does not change skill EXP; an idle cauldron earns none', async () => {
  const s = await live(), t = [...s.PotionType]
  const c = t.findIndex((x: number, i: number) => i >= 1 && i <= 6 && x >= 1)
  const other = { ...s, PotionType: t.map((x: number, i: number) => (i === c ? (x === 1 ? 2 : 1) : x)) }
  expect(cauldronExp(other)[c - 1]!.perSec).toBeCloseTo(cauldronExp(s)[c - 1]!.perSec, 9)
  const idle = { ...s, PotionType: t.map((x: number, i: number) => (i === c ? 0 : x)) }
  expect(cauldronExp(idle)[c - 1]!.perSec).toBe(0)
})

test('level needs, unlocks and plan are consistent', async () => {
  const s = await live()
  expect(levelNeeds(s, 1)[0]).toBeCloseTo(Math.max(0, s.ApothecaryREQ - s.ApothecaryEXP), 3) // no gift-shop REQ cut on this save
  const u = nextUnlocks(s, ids)
  expect(u.length).toBe(5)
  for (let i = 1; i < u.length; i++) expect(u[i]!.exp).toBeGreaterThanOrEqual(u[i - 1]!.exp)
  const plan = expPlan(s, ids)
  expect(plan.length).toBeGreaterThan(0)
  for (let i = 1; i < plan.length; i++) expect(plan[i]!.gain).toBeLessThanOrEqual(plan[i - 1]!.gain)
})
