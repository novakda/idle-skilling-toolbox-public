import { ascendGain } from './bus'
import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { arcade, arcadeRank, ballRate, costStep } from './arcade'

// A frozen save, not the live one: the game only rewrites PachinkoBallRechargeTime while the Arcade screen is open, so the
// live save's stored value lags its inputs (e.g. tank 53 growing) until the next visit.
const fixture = new URL('../../data/fixture-asylum-2026-10-24.json', import.meta.url)
const save = existsSync(fixture) ? await Bun.file(fixture).json() : null // not in the public copy

test.skipIf(!save)('ball rate rebuilds PachinkoBallRechargeTime from tasks + cards + tank', () => {
  expect(ballRate(save).secsPerBall).toBeCloseTo(save.PachinkoBallRechargeTime, 6)
})

test.skipIf(!save)('replaying the cost steps from the start cost gives the saved cost of every upgrade', () => {
  const start = [0, 3, 10, 2, 5, 4, 8]
  for (let i = 1; i <= 6; i++) {
    let c = start[i]!
    for (let L = 1; L <= save.EventUpgradeLevels[i]; L++) c += costStep(i, L)
    expect(c).toBeCloseTo(save.EventUpgradeCOST[i], 6)
  }
})

test.skipIf(!save)('arcade(): pending balls, task flags, ranking', () => {
  const a = arcade(save)
  expect(a.pending).toBe(Math.floor(Math.min(save.PachinkoBallRegainTimer, 28800) / save.PachinkoBallRechargeTime))
  expect(a.tasks.filter((t) => t.done).length).toBe(ballRate(save).tasks.reduce((x, y) => x + y, 0))
  const r = arcadeRank(a)
  // The game rewrites EVENTpurchasesMAX[2..6] = 1,2,3,3,3 on every load (@20212641), so Kills-Rebirth are maxed here and only Damage ranks.
  expect(r.map((u) => u.name)).toEqual(a.upgrades.filter((u) => !u.maxed).map((u) => u.name))
  expect(r.map((u) => u.name)).toEqual(['Damage'])
  // Rebirth's gain, where it is still open: 2 / base BP (summed BPreward)
  const open = arcade({ ...save, EVENTpurchasesMAX: [0, 1000, 300, 800, 500, 200, 600] })
  expect(arcadeRank(open).find((u) => u.name === 'Rebirth')!.gain).toBeCloseTo(2 / ascendGain(save).bpBase, 12)
  for (let k = 1; k < r.length; k++) expect(r[k - 1]!.gain! / r[k - 1]!.cost).toBeGreaterThanOrEqual(r[k]!.gain! / r[k]!.cost)
  expect(arcade({}).upgrades[0]!.max).toBe(1000)
})
