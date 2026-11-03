import { expect, test } from 'bun:test'
import { bagYield, nextSteps } from './spelunking'
import { land, simulate } from './spelunk-sim'

/** spelunking.test.ts's mini(): spelunker 1 (V 40, S 90, D 42) digging toward 4e7, Yellow open (Blue gate: >2 of tier 8), a
 *  machine, 28 of treasure 7. */
const mini = (o: Record<string, unknown> = {}): Record<string, any> => ({
  SpelunkerLV: 17, goldcoin: 1e80, SpelunkerLvsVSD: [0, 40, 90, 42], SpelunkerStatus: [0, 1], SpelunkerDistance: [0, 1e6], SpelunkerDistanceMAX: [100, 4e7],
  DigDownOverflow: [0, 0], SpelunkerLearnLVs: [], PbonusSpelunkSpd: 1, SkillLevels: [], PotionLV: [], EbonusThree: [], CbonusTunnels: Array(10).fill(0),
  ConstructLV: Object.assign(Array(70).fill(0), { 1: 1, 3: 10, 61: 1 }), TreasureOwned: Object.assign(Array(29).fill(0), { 7: 28 }), CardLevels: [], ...o })

test('land: a bag adds bagYield(≥ 1) in total, split by tier, nothing below the start tier', () => {
  const s = mini(), t = land(s, 1, 1.5e9).TreasureOwned as number[], add = t.map((x, i) => x - s.TreasureOwned[i])
  expect(add.reduce((a, b) => a + b, 0)).toBeCloseTo(bagYield(s, 1, 1.5e9, 1), 9)
  expect(add.slice(0, 8).every((x) => x === 0)).toBe(true) // tier ⌊9.18 − 1⌋ = 8
  expect(add[9]).toBeCloseTo(bagYield(s, 1, 1.5e9, 9) - bagYield(s, 1, 1.5e9, 10), 12)
})

test('simulate: reinvesting each bag beats spending today\'s stock once (nextSteps), and no stock goes negative', () => {
  // no starting treasure, so every upgrade is paid from bags that come home (with 28 of tier 7 the hour-0 buys alone reach it)
  const s = mini({ TreasureOwned: Array(29).fill(0) }), r = simulate(s, { start: 0 })!, base = nextSteps(s)!.route!.hours
  expect(r.hours).not.toBeNull()
  expect(r.hours!).toBeLessThan(base)
  expect(r.bought.some((b) => b.last > 0)).toBe(true) // bought with treasure that came home, not only at hour 0
  expect(r.minStock).toBeGreaterThanOrEqual(0)
  expect((r.end.save.TreasureOwned as number[]).every((x) => x >= 0)).toBe(true)
  expect(r.milestones.at(-1)!.what).toContain('Blue gate')
  expect(r.milestones.at(-1)!.hours).toBe(r.hours!)
  // check-ins every 6 h can only be later
  expect(simulate(s, { start: 0, checkEvery: 6 })!.hours!).toBeGreaterThanOrEqual(r.hours!)
})

test('simulate: learners are held fixed, and a save with no digger never reaches the gate', () => {
  const r = simulate(mini({ SpelunkerStatus: [0, 2] }), { start: 0, years: 1 })!
  expect(r.hours).toBeNull()
  expect(r.events).toBe(0)
})
