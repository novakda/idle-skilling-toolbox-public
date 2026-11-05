import { expect, test } from 'bun:test'
import { fightStats } from './fighting'
import { ascendGain } from './bus'
import { fullSave } from './test-save.test'
import { STATS, awayTotal, cashTotal, chainChance, damageTotal } from './totals'

test('chain chance: Σ% capped at 85%, P(≥k levels) = floor(1000·p^k)/1000', () => {
  const lo = chainChance(50)
  expect(lo.p).toBe(0.5)
  expect(lo.atLeast).toEqual([0.5, 0.25, 0.125, 0.062, 0.031, 0.015, 0.007])
  const hi = chainChance(87.68)
  expect(hi.p).toBe(0.85)
  expect(hi.atLeast).toEqual([0.85, 0.722, 0.614, 0.522, 0.443, 0.377, 0.32])
  expect(hi.expected).toBeCloseTo(3.848, 6)
})

test('away %: uncapped sum + min(capped sum, 90)', () => {
  expect(awayTotal([{ pct: 28 }, { pct: 10 }, { pct: 60, cap: true }, { pct: 40, cap: true }])).toEqual({ capped: 100, value: 128 })
  expect(awayTotal([{ pct: 100 }, { pct: 2 }]).value).toBe(102)
})

test('damage: (B·Πx)^(2/(max(IceCream, 1) + 1))', () => {
  expect(damageTotal(10, [2, 3], 1)).toEqual({ mult: 6, exp: 1, dps: 60 })
  expect(damageTotal(10, [2, 3], 0).dps).toBe(60) // IceCream 0 counts as 1
  expect(damageTotal(10, [2, 3], 3).dps).toBeCloseTo(Math.sqrt(60), 12)
})

test('cash: (1 + Σ%/100)·Πx', () => {
  expect(cashTotal([100, 50], [2, 3])).toBe(15)
})

test('full save: away rows give the stored %, damage rows give the fight scene DPS', async () => {
  const s = await fullSave(), stat = (id: string) => STATS.find((x) => x.id === id)!
  const away = stat('away'), dmg = stat('damage')
  expect(100 * away.total(away.rows(s), s).value!).toBeCloseTo(Number(s.nonActiveZoneGainPercent), 9)
  const rows = dmg.rows(s), f = fightStats(s) as { DPS: number }
  expect(damageTotal(rows[0]!.value!, rows.slice(1).map((r) => r.x!), Number(s.IceCream)).dps / f.DPS).toBeCloseTo(1, 12)
})

const stat = (id: string) => STATS.find((x) => x.id === id)!
// A save with every array the rows read present but empty (missing arrays read as unknown); tanks 19/23/32 set to ×1.
const EMPTY = Object.fromEntries(['AscentionLevel', 'TrainingPerkLevels', 'ConstructLV', 'SkillLevels', 'SmithingItemLevel', 'ShrineLevels', 'RiftLVL',
  'RiftProLvs', 'ContractRank', 'EventUpgradeLevels', 'PotionLV', 'TankLVs', 'PetCapsuleLV'].map((k) => [k, [] as number[]]))
const total = (id: string, s: Record<string, unknown>) => { const t = { ...EMPTY, CritToggles: 0, TankBonusLIST: z(40, { 19: 1, 23: 1, 32: 1 }), ...s }; return stat(id).total(stat(id).rows(t), t).value }
const z = (len: number, set: Record<number, number>) => Array.from({ length: len }, (_, i) => set[i] ?? 0)

test('known inputs: each added stat combines its rows the way the game does', () => {
  // crit chance: 10 + 0.25·4 + 0.75·10 − 20·1 = −1.5 → max(…, 0)
  expect(total('critchance', { SmithingItemLevel: z(100, { 24: 4, 56: 10 }), CritToggles: 1 })).toBe(0)
  expect(total('critchance', { SmithingItemLevel: z(100, { 56: 200 }), CritToggles: 0 })).toBeCloseTo(1.6, 12) // 160%: flagged
  expect(stat('critchance').total(stat('critchance').rows({ ...EMPTY, SmithingItemLevel: z(100, { 56: 200 }), CritToggles: 0 }), {}).flag).toContain('60% wasted')
  // crit damage: (125 + 2.5·10)% × (1 + 100/100)
  expect(total('critdmg', { SmithingItemLevel: z(100, { 40: 10 }), AscentionLevel: [], PbonusCritDmg: 100 })).toBeCloseTo(3, 12)
  // ores: shrine 4 L20 ×2, potions ×2, tank 23 ×1 → 100·(4 − 1)%
  expect(total('ores', { ShrineLevels: z(20, { 4: 20 }), PbonusOresGiven: 100, TankBonusLIST: z(60, { 23: 1 }) })).toBeCloseTo(3, 12)
  expect(total('ores', { ShrineLevels: z(20, { 4: 20 }) })).toBeNull() // PbonusOresGiven not in the save: unknown
  // mining EXP: potions ×2, smith item 69 L20 ×2
  expect(total('miningexp', { PbonusMiningExp: 100, SmithingItemLevel: z(100, { 69: 20 }) })).toBeCloseTo(3, 12)
  // brew: core below 1 is raised to 1, then potion 160 (L175 → ×1.425) per flower type past 1.001e21
  const brew = { PotionLV: z(200, { 160: 175 }), flowersOwned: z(50, { 1: 2e21 }), TankLVs: [], PetCapsuleLV: [], TankBonusLIST: [] }
  expect(total('brew', brew)).toBeCloseTo(1.425, 12)
  // botany: 14 pots at tier 8 → 1 + 0.3·14, × card 272's passive, +15% even at card level 0 (card-globals.json)
  expect(total('botany', { HerblorePotLevel: z(15, Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, 8]))) })).toBeCloseTo(5.2 * 1.15, 12)
  // AP: (1 + 42%) × tank 19
  expect(total('ap', { SecretEarned: [0, 0, 1], TankBonusLIST: z(40, { 19: 2 }) })).toBeCloseTo(2.84, 12)
  // BP: double pack ×2, contract rank 50 L10 ×1.3, tank 32 ×1
  expect(total('bp', { MTXdoubleBP: 1, ContractRank: z(60, { 50: 10 }), TankBonusLIST: z(40, { 32: 1 }) })).toBeCloseTo(2.6, 12)
})

test('full save: each added stat equals the value the game stored', async () => {
  const s = await fullSave()
  expect(total('critchance', s)! * 100).toBeCloseTo(s.YourCritChance, 9)
  expect(total('critdmg', s)! / s.YourCriticalDamage).toBeCloseTo(1, 12)
  expect(total('ores', s)! * 100 / s.BonusOresCUMULATIVEpercent).toBeCloseTo(1, 12)
  expect(total('miningexp', s)! * 100 / s.BonusMiningExpCUMUpercent).toBeCloseTo(1, 12)
  expect(total('brew', s)!).toBeCloseTo(s.PotionBrewSpeedBOOST[1], 9)
  expect(total('botany', s)! / s.HerbloreSpeedBOOST).toBeCloseTo(1, 9)
  const g = ascendGain(s)
  expect(total('ap', s)! / g.apMulti).toBeCloseTo(1, 12)
  expect(total('bp', s)! / g.bpMulti).toBeCloseTo(1, 12)
})

// ---- Raid loot and Spelunking card rolls, checked against the game's own code (#cards) ----
import { existsSync, readFileSync } from 'fs'
import { BUNDLE, compile, matchBraces } from '../../src/game-eval'
import { raidLoot, rollOdds, spelunkDepths, spelunkRoll } from './totals'
const PATH = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(PATH) ? readFileSync(PATH, 'latin1') : ''

test.skipIf(!src)('raid loot: raidLoot equals each boss\'s ticket callback run over every randomInt(1, 4000)', () => {
  const KIND = [894, 917, 877] // 894 carries RaidDropType 1-4; 917 card pack; 877 the rest
  for (const [i, at] of [19927556, 19940952, 19956947, 19971374].entries()) for (const [C, r39, r43, forge] of [[0, 0, 0, 0], [38, 10, 10, 1], [250, 3, 7, 0], [400, 10, 10, 1]] as const) {
    const A: Record<string, any> = { CbonusRaidDrops: C, ContractRank: Object.assign([], { 39: r39, 43: r43 }), InfinityForgePurchased: forge }
    let R = 0
    const got = [0, 0, 0, 0, 0, 0]
    const p = { randomInt: (a: number, b: number) => (a === 1 && b === 4e3 ? R : 0), getActorType: (id: number) => id,
      createRecycledActor: (id: number) => { expect(KIND).toContain(id); got[id === 894 ? A.RaidDropType - 1 : id === 917 ? 4 : 5]!++ } }
    const f = compile(matchBraces(src, src.indexOf('function', at)), A, { p }) as Function
    for (R = 1; R <= 4000; R++) f(0)
    expect([i, C, got.map((c) => c / 4000)]).toEqual([i, C, raidLoot(C, r39, r43, !!forge, i === 0)])
  }
})

test.skipIf(!src)('spelunking card roll: the bundle has the traced expressions; closed form = enumeration', () => {
  expect(src.slice(30207757, 30207900)).toContain('p.randomInt(1,350/(7+b.engine.getGameAttribute("RaidDropType"))*(1/(b.engine.getGameAttribute("aa4")+1e-4))|0)')
  expect(src.slice(30208290, 30208700)).toContain('/(1+Be._customBlock_SpelunkerVALUE()*Be._customBlock_SpelunkerSpeedperHour()),.8)+.85')
  expect(src.slice(30208813, 30208829)).toBe('916297>b.engine.')
  for (const m of [1, 2.13, 40]) for (const t of [1, 8, 26]) for (const H of [0, 0.5, 3, 67]) {
    const M = Math.floor(350 / (7 + t) / (m + 1e-4)), X = H ** 0.8 + 0.85, vals = M >= 1 ? Array.from({ length: M }, (_, k) => k + 1) : [0, 1]
    expect(spelunkRoll(m, t, H).p).toBeCloseTo(vals.filter((v) => v < X).length / vals.length, 12)
  }
  const d = spelunkDepths(8, (k) => (k <= 3 ? 5 : 0)) // owns tiers 1-3: walk steps 1→2→3, stops there
  expect(d[1]).toBeCloseTo(1 - 0.916296, 9)
  expect(d[3]).toBeCloseTo(0.916296 ** 2, 9)
  expect(spelunkDepths(2, () => 5).reduce((a, x) => a + (x ?? 0), 0)).toBeCloseTo(1 - 0.916296 ** 28, 9) // 28 steps: no card
})

test('card roll odds: 1/⌊N/(1 + C/100)⌋, 50% once the range hits 0', () => {
  expect(rollOdds(170 * (1 + 1 / 3), 363.21)).toEqual({ M: 48, p: 1 / 48 })
  expect(rollOdds(226.67, 11300).M).toBe(1)
  expect(rollOdds(226.67, 30000)).toEqual({ M: 0, p: 0.5 })
})
