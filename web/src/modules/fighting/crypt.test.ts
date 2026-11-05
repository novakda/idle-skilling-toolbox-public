import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { BUNDLE, compile, inert, matchBraces } from '../../../../src/game-eval'
import { BASE, cryptHP, expectedDrops, expectedRares, RARE, type Res } from './crypt'

const PATH = `${import.meta.dir}/../../../../${BUNDLE}`
const src = existsSync(PATH) ? readFileSync(PATH, 'latin1') : ''
const KILL = 31829977 // the Crypt branch of the zone-type-2 kill handler
// ActorEvents_894's credit for drop types 22-35 (@15769598+): what one drop actor of each type adds.
const GIVES: Record<number, Partial<Record<Res, number>>> = { 22: { coupons: 1 }, 24: { gems: 1 }, 26: { balls: 3 }, 27: { keys: 1 }, 28: { ap: 1 }, 29: { bp: 1 },
  31: { candy1: 1 }, 32: { candy2: 1 }, 33: { candy3: 1 }, 34: { candy4: 1 }, 35: { candy5: 1 } }

test('HP: the Crypt rewrite matches the wiki mantissas (Rick 55.7, Mankey 5.12, Mark off)', () => {
  expect(cryptHP({}, 0) / 5.57e28).toBeCloseTo(1, 2)
  expect(cryptHP({}, 1) / 5.12e30).toBeCloseTo(1, 2)
  expect(cryptHP({ SkillActive: Object.assign([], { 16: 1 }) }, 0) / cryptHP({}, 0)).toBeCloseTo(5, 9)
})

test('rare rolls: exact expectation from the pity counter', () => {
  expect(expectedRares(1, 0.9)).toBeCloseTo(0.009, 12) // 10·0.9 = 9 rolls of 1000
  expect(expectedRares(2, 0.9)).toBeCloseTo(0.009 + 0.991 * 0.018 + 0.009 * 0.009, 12) // kill 2: 18 rolls, or 9 after a reset
  expect(expectedRares(7, 100)).toBe(7) // 10·P ≥ 1000: every kill
  expect(RARE.reduce((a, [w]) => a + w, 0)).toBe(1000)
  expect(expectedDrops(10, 0)).toMatchObject({ gems: 10 * BASE.gems, balls: 10 * BASE.balls, keys: 0 })
})

test.skipIf(!src)('drop ladder equals the kill handler run over every roll', () => {
  const run = (pity: number, rolls: () => number) => {
    const got: Partial<Record<Res, number>> = {}, A: Record<string, any> = { RareDropChancee: pity, mapleLV: 0, PetCapsuleLV: [], CardLevels: [] }
    const p = { randomInt: rolls, getActorType: (id: number) => id, runLater: () => {}, getActor: () => inert,
      createRecycledActor: (id: number) => { if (id === 894) for (const [k, v] of Object.entries(GIVES[A.RaidDropType] ?? {})) got[k as Res] = (got[k as Res] ?? 0) + v! } }
    ;(compile(`function(){${matchBraces(src, KILL)}}`, A, { p, a: { _gemsFound: 0 } }) as Function)()
    return got
  }
  const sum = (xs: Partial<Record<Res, number>>[]) => xs.reduce((t, g) => { for (const [k, v] of Object.entries(g)) t[k] = (t[k] ?? 0) + v!; return t }, {} as Record<string, number>)
  const r1000 = Array.from({ length: 1000 }, (_, i) => i + 1)
  // No rare (pity far below): the base roll alone.
  const base = sum(r1000.map((r) => run(-1e4, () => r)))
  expect([base.gems / 1000, base.balls / 1000]).toEqual([BASE.gems, BASE.balls])
  // Rare guaranteed (10·pity ≥ any roll), first roll 1 (no base drop): the second roll walks the ladder.
  const rare = sum(r1000.map((r) => { let k = 0; return run(1e4, () => (k++ ? r : 1)) }))
  const want = expectedDrops(0, 1000)
  for (const [k, v] of Object.entries(want)) expect([k, rare[k] ?? 0]).toEqual([k, expect.closeTo(v, 9) as any])
})
