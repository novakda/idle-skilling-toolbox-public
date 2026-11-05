import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { BUNDLE } from '../../src/game-eval'
import { contracts, ROD_FISH } from './modules/contracts/contracts'
import { cardTotal, contractPlan, fastestRod, monsterAt, SKILL_TRAINING, skillTraining } from './contract-plans'

const blank = () => ({ ContractRank: Array(57).fill(0), ContractProgress: Array(57).fill(0), ContractRequirement: Array(57).fill(0), ContractSelected: 1 } as Record<string, any>)
const plan = (s: Record<string, any>, i: number) => contractPlan(contracts(s)[i - 1]!, s)

test('contract plans: complete/failed/binary/ready are inline or none; counts recomputed from the save', () => {
  const s = blank()
  s.ContractRank[1] = 10
  s.ContractProgress[20] = -1
  expect(plan(s, 1)).toBeNull()
  expect(plan(s, 20)).toEqual({ inline: 'Failed: Ascend to retry; no plan until then.' })
  expect('inline' in plan(s, 22)! && (plan(s, 22) as { inline: string }).inline).toContain('Plan, step by step')
  // 29 at rank SSS counts monsters above 999999.9 kills; the stored progress (0) is stale.
  s.ContractRank[29] = 7; s.ContractRequirement[29] = 2; s.MapleMonster = Array(3000).fill(0)
  s.MapleMonster[5] = 2e6; s.MapleMonster[6] = 999999; s.MapleMonster[7] = 999999
  expect((plan(s, 29) as { title: string }).title).toContain('1 / 2')
  s.MapleMonster[7] = 1e6
  expect((plan(s, 29) as { inline: string }).inline).toStartWith('Done (2 / 2)')
  // 18 sums CardLevels[0..399] ≥ 0 only.
  expect(cardTotal({ CardLevels: [-1, 2, 3, ...Array(397).fill(0), 50] })).toBe(5)
  // 35 reads Skillpoints; the fail-free plan still says not to spend them.
  s.ContractRequirement[35] = 100; s.Skillpoints = 40
  const p35 = plan(s, 35) as { title: string; rows: string[][] }
  expect(p35.title).toContain('40 / 100')
  expect(p35.rows[0]![0]).toContain('buy no perk-tree nodes')
})

test('contract plans: MapleMonster index → zone and stage (fighting.ts base)', () => {
  expect(monsterAt(9)).toMatchObject({ m: 1, L: 9 })
  expect(monsterAt(503)).toMatchObject({ m: 11, L: 3, where: 'Purgatory stage 4' }) // wiki: Clackity, Purgatory 4-6
  expect(monsterAt(854)).toMatchObject({ m: 14, L: 54 }) // wiki: Trombain, Maelstrom 55-57
  expect(monsterAt(915)).toMatchObject({ m: 15, L: 15, where: 'Oblivion stage 16' }) // wiki: Blither, Oblivion 16 only
})

test('skill training: 16 counting skills, Ascend start levels only for the 8 reset ones', () => {
  const s = { atkLVL: 50, atkREQ: 100, GiftShopLevels: [0, 4], ContractRank: [], AscentionLevel: [], TankBonusLIST: [], MasteryBonuses: [] } as Record<string, any>
  const lines = skillTraining(s)
  expect(lines).toHaveLength(16)
  expect(lines[0]).toMatchObject({ skill: 'Attack', level: 50, start: 4 }) // 1 + gift 4 + (TankBonusLIST[46] − 1 = −1)
  expect(lines.filter((x) => x.start != null)).toHaveLength(8)
})

test('game code: each Skill Training site adds 1 to ContractProgress[2]; skull thresholds per rank', () => {
  const path = `${import.meta.dir}/../../${BUNDLE}`
  if (!existsSync(path)) return console.warn('game bundle missing: skipped')
  const b = readFileSync(path)
  const at = (o: number, len: number) => b.toString('latin1', o, o + len)
  for (const k of SKILL_TRAINING) for (const o of k.at) expect(at(o, 21)).toBe('ContractProgress")[2]')
  expect(SKILL_TRAINING.flatMap((k) => k.at)).toHaveLength(24)
  const skull = [...at(22747500, 9000).matchAll(/MapleMonster"\)\[X\];if\(([0-9.e]+)</g)].map((x) => x[1])
  expect(skull.slice(0, 5)).toEqual(['99999.9', '99999.9', '999999.9', '999999.9', '9999999.9'])
})

test('19 Fastest Rod: rank fish read from the Fishing scene; odds after an Ascend at hook 6, rod 1', () => {
  const bundle = `${import.meta.dir}/../../${BUNDLE}`
  if (existsSync(bundle)) {
    const src = readFileSync(bundle, 'utf8'), at = src.indexOf('getGameAttribute("ContractProgress")[19]=-1', 31500000)
    const re = /(\d+)==\(null==\(t=b\.engine\.getGameAttribute\("ContractRank"\)\[19\]\).{0,300}?&&(\d+)==b\.engine\.getGameAttribute\("FishOnHook"\)/g
    const got = [...src.slice(at, at + 12000).matchAll(re)].map((m) => [+m[1]!, +m[2]!])
    expect(got).toEqual(ROD_FISH.map((f, r) => [r, f]))
  }
  // Start Fishing Lv 113 (gift shop 112): hook 6, large = 3·133/35 = 11.4 → 11.3% after the 0.1 roll step; fish 26 is 1 of 6.
  const s = { GiftShopLevels: Object.assign(Array(30).fill(0), { 11: 112 }), TankBonusLIST: Object.assign(Array(50).fill(0), { 46: 1 }), FunnyHatPurchased: 3 } as Record<string, any>
  const x = fastestRod(s, 3)
  expect(x).toMatchObject({ fish: 26, lv: 113, hook: 6 })
  expect(x.perCatch).toBeCloseTo(0.113 / 6, 6)
  expect(fastestRod({ ...s, GiftShopLevels: [] }, 3).perCatch).toBe(0) // Lv 0: large tier is fish 25 only
  const p = plan({ ...blank(), ...s, ContractRank: Object.assign(Array(57).fill(0), { 19: 3 }), ContractProgress: Object.assign(Array(57).fill(0), { 19: -1 }) }, 19) as { title: string; rows: string[][] }
  expect(p.title).toContain('fish 26; failed')
  expect(p.rows.map((r) => r[0])).toContain('Buy one Fishing power upgrade')
})

test('Fastest Rod odds follow the fishing-seconds setting', () => {
  const s = { GiftShopLevels: Object.assign(Array(30).fill(0), { 11: 112 }), TankBonusLIST: Object.assign(Array(50).fill(0), { 46: 1 }), FunnyHatPurchased: 3 } as Record<string, any>
  const short = fastestRod(s, 3, 60), long = fastestRod(s, 3, 240)
  expect(short.seconds).toBe(60)
  expect(long.catches).toBeGreaterThan(short.catches)
  expect(long.odds).toBeGreaterThan(short.odds)
})
