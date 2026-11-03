import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { awayPercent } from './away'

test('away % from a save without the computed value matches the game', async () => {
  const save = await fullSave()
  const stored = save.nonActiveZoneGainPercent
  delete save.nonActiveZoneGainPercent
  expect(awayPercent(save)).toBe(stored) // 30.5: ascended realm save, game-computed at load
  expect(awayPercent({ TimesAscended: 0, ShrineLevels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 4] })).toBe(102)
  expect(awayPercent({ TimesAscended: 1, RealmStuff: [20, 0, 0, 0, 0, 0, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0, 0, 3], 0, 0, 0, 0, [0, 0, 0, 0, 0, 0, 0, 2]] })).toBe(28 + 6 + 4)
  const fruit = [['F', '%_Away_gains_outside_Realm', 5, 'none', 0, 'none', 0]]
  expect(awayPercent({ TimesAscended: 1, RealmStuff: Object.assign(Array(18).fill([]), { 0: 1, 17: fruit }) })).toBe(28 + 5 * 1.15) // × (1 + Juiced Fruit 15% at plot level 0)
})

test('Tilling away rate matches the live test (224 s away → +6.35e9 XP)', async () => {
  const { awayTillingPerSecond } = await import('./away')
  const save = await Bun.file(new URL('../../data/fixture-away.json', import.meta.url)).json()
  const got = awayTillingPerSecond(save, 30.5) * 224
  expect(Math.abs(got / 6.351e9 - 1)).toBeLessThan(0.1) // fixture = backup-leveldb-20261004-1952, ~2 h after the probe; ratio 0.98
})

test('active Tilling matches the live probe (60 fps: 6.65 / 4.43 harvests/s per farmer, 3.03e6 XP/s)', async () => {
  const { activeTilling } = await import('./away')
  const save = await Bun.file(new URL('../../data/fixture-away.json', import.meta.url)).json()
  const { farmers } = activeTilling(save)
  // Harvest rates depend only on the speed step (stable); XP/s isn't pinned (the fixture is ~2 h after the probe) (at the probe: 2.98e6 predicted vs 3.03e6 live).
  expect(farmers.map(f => +f.harvestsPerSec.toFixed(2))).toEqual([6.67, 6.67, 4.44, 4.44, 4.44, 4.44, 4.44, 4.44])
})
