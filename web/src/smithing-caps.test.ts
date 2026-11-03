import { expect, test } from 'bun:test'
import { KNEES, kneeInfo, smithingAffordable, smithingCaps, smithingItems } from './smithing-caps'

test('flags only items at or past their cap', () => {
  const L = Array(100).fill(0); L[76] = 10000; L[70] = 5619
  const r = smithingCaps({ SmithingItemLevel: L })
  expect(r.map((c) => c.item)).toEqual([76])
  expect(r[0]!.name).toBe('Ensouled Head')
  // the formula itself: +9 kills per kill reached exactly at the cap
  expect(Math.min(0.2 * Math.sqrt(2025), 9)).toBe(9)
  expect(Math.min(0.2 * Math.sqrt(2024), 9)).toBeLessThan(9)
})

test('affordable: skips kits past 7 miners and locked page 11, stops at a cap', () => {
  const L = Array(100).fill(0); L[31] = 69; L[72] = 99
  const r = smithingAffordable({ SmithingItemLevel: L, OresOwned: Array(30).fill(1e300), FishOwned: Array(40).fill(1e300), TreasureOwned: Array(40).fill(1e300), CraftingMaterialsOwned: Array(100).fill(1e300), SkillLevels: Array(30).fill(10), ConstructLV: [] })
  expect(r.some((a) => a.item === 31 || a.item >= 81)).toBe(false)
  expect(r.find((a) => a.item === 72)!.to).toBe(100)
})

test('items: one row per anvil item, status from cap / kit / page lock', () => {
  const L = Array(100).fill(0); L[76] = 3000; L[31] = 7
  const r = smithingItems({ SmithingItemLevel: L, SkillLevels: [], ConstructLV: [] })
  expect(r.length).toBe(96)
  expect(r.find((x) => x.item === 76)!.status).toBe('capped')
  expect(r.find((x) => x.item === 31)!.status).toBe('kit done')
  expect(r.find((x) => x.item === 81)!.status).toBe('locked')
  expect(r[0]!.cost[0]!.label).toBe('Copper')
})

test('knee: half the ceiling, B for a soft cap; past it the row is dimmed as past knee', () => {
  expect(KNEES[86]).toBe(2500)
  expect(KNEES[76]).toBe(507) // √L/45 ≥ 0.5 → L ≥ 506.25
  expect(KNEES[89]).toBe(6036); expect(KNEES[92]).toBe(5312); expect(KNEES[19]).toBe(25); expect(KNEES[13]).toBe(5e4)
  expect(kneeInfo(86, 5000)!.pctKnee).toBe(2)
  const L = Array(100).fill(0); L[86] = 0; L[76] = 600; L[72] = 10
  const r = smithingItems({ SmithingItemLevel: L, SkillLevels: [], ConstructLV: [20] })
  expect(r.find((x) => x.item === 76)!.status).toBe('past knee')
  expect(r.find((x) => x.item === 72)!.status).toBe('open')
  expect(r.find((x) => x.item === 1)!.knee).toBeNull()
})

test('a knee curve at its ceiling counts as capped and is not offered as a craft', () => {
  const L = Array(100).fill(0); L[79] = 1748
  const r = smithingItems({ SmithingItemLevel: L, OresOwned: Array(30).fill(1e300), FishOwned: Array(40).fill(1e300), TreasureOwned: Array(40).fill(1e300), CraftingMaterialsOwned: Array(100).fill(1e300), SkillLevels: Array(30).fill(10), ConstructLV: [] })
  expect(r.find((x) => x.item === 79)!.status).toBe('capped')
  expect(r.find((x) => x.item === 79)!.crafts).toBe(0)
})

test('census knees match docs/smithing-curves-census.md, and damage reduction caps as a group', () => {
  for (const [i, k] of [[71, 528], [85, 667960], [87, 8964], [88, 15445], [91, 10796], [93, 8497], [95, 98431333], [96, 9369505], [83, 1500], [77, 691]] as const)
    expect(Math.abs(KNEES[i]! - k)).toBeLessThanOrEqual(2)
  const L = Array(100).fill(0); L[54] = 270; L[14] = 5
  const r = smithingItems({ SmithingItemLevel: L, SkillLevels: [], ConstructLV: [] })
  expect(r.find((x) => x.item === 54)!.status).toBe('capped')
  expect(r.find((x) => x.item === 14)!.status).toBe('capped')
  expect(r.find((x) => x.item === 19)!.knee!.knee).toBe(25)
})

test('panel-text mismatches ride along on the item rows', () => {
  const r = smithingItems({ SmithingItemLevel: Array(100).fill(0), SkillLevels: [], ConstructLV: [] })
  expect(r.find((x) => x.item === 92)!.panel).toContain('2200')
  expect(r.find((x) => x.item === 1)!.panel).toBeNull()
})

test('worth crafting: open and below the knee, never Timelesseum', () => {
  const L = Array(100).fill(0); L[76] = 600; L[72] = 10
  const r = smithingItems({ SmithingItemLevel: L, SkillLevels: [], ConstructLV: [20] })
  expect(r.find((x) => x.item === 72)!.worth).toBe(true)
  expect(r.find((x) => x.item === 76)!.worth).toBe(false)
  expect(r.find((x) => x.item === 94)!.worth).toBe(false)
  expect(r.find((x) => x.item === 2)!.worth).toBe(true)
})
