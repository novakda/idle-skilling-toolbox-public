import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { AP_HOLD, bpAfterAscend, climbBack, farmClimb, mapClimb, mapFrontier, withBuys, keepPercent, levelsPerCraft, mapTerm, preAscendDeck, rebirthStartLevel, relevelNeed, resetAdvice, resetCompare, startGold } from './ascend'
import { smithCurrency } from './smithing'
import { ascendGain, ascensionRewards } from './bus'
import { perkPlan } from './perk-plan'
import { smithingCostAt } from './smithing'
import { monsterHP } from './fighting'
import { BUNDLE, compile, loadBundle } from '../../src/game-eval'

const bundle = `${import.meta.dir}/../../${BUNDLE}`

test('levels per craft and souls kept match the stored values', async () => {
  const s = await fullSave()
  expect(levelsPerCraft(s)).toBe(s.CraftingLvUps) // skill 19 = 10: ceil(U(2.1, 3)) is always 3
  expect(levelsPerCraft(s, 0)).toBe(1)
  expect(levelsPerCraft(s, 2)).toBeCloseTo((1 * 0.58 + 2 * 0.4) / 0.98, 9) // U(0.42, 1.4): 1 on (0.42, 1], 2 on (1, 1.4]
  expect(keepPercent(s.CbonusSoulsKept)).toBe(s.SoulstoKeepPercent)
  expect(keepPercent(500)).toBe(100)
})

test('re-level need sums the cost of each paid level, minus the shrine-3 free chance', async () => {
  const s = await fullSave(), lv = Array(81).fill(0)
  lv[2] = 2
  const one = { ...s, SmithingItemLevel: lv, ShrineLevels: [0, 0, 0, 0] }, c = smithingCostAt(one)
  const [r] = relevelNeed(one, 1)
  expect(r!.need).toBeCloseTo(c(2, 0)[0]!.cost + c(2, 1)[0]!.cost, 6)
  expect(relevelNeed(one, 2)[0]!.need).toBeCloseTo(c(2, 0)[0]!.cost, 6) // one craft covers both levels
  expect(relevelNeed({ ...one, ShrineLevels: [0, 0, 0, 20] }, 1)[0]!.need).toBeCloseTo(0.7 * r!.need, 6)
  expect(smithCurrency(s, 1).owned).toBe(s.OresOwned[1])
  expect(smithCurrency(s, 17).owned).toBe(s.FishOwned[1])
  expect(smithCurrency(s, 47).owned).toBe(s.OresOwned[17])
})

test('pre-ascend deck only adds cards that raise AP or souls kept', async () => {
  const s = await fullSave(), d = preAscendDeck(s)
  expect(d.cards.length).toBeLessThanOrEqual(10)
  expect(d.apNext).toBeGreaterThanOrEqual(d.apNow)
  expect(d.keep[1]).toBeGreaterThanOrEqual(d.keep[0]!)
  for (const c of d.cards) expect((c.adds.AP ?? 0) > 0 || (c.adds.SoulsKept ?? 0) > 0).toBe(true)
})

// Both start-gold payouts, run as the game wrote them (skip button ActorEvents_958, credits timer SceneEvents_22).
test.skipIf(!existsSync(bundle))('start gold matches both game payouts', async () => {
  const src = loadBundle(bundle), s = await fullSave()
  const run = (from: number, v: string) => {
    const a = src.indexOf(`${v}=Math.max(Math.min(2500*Math.pow(2,`, from)
    const expr = src.slice(a + 2, src.indexOf(`,n=n.gameAttributes`, a))
    return compile(`function(){ return ${expr} }`, { ...s, TimesAscended: s.TimesAscended + 1, GoldcoinPreAscend: s.goldcoin })() as number
  }
  expect(startGold(s).gold / run(src.indexOf('["scripts.ActorEvents_958"]='), 'a')).toBeCloseTo(1, 12)
  expect(startGold(s, false).gold / run(src.indexOf('runLater(24e3', src.indexOf('["scripts.SceneEvents_22"]=')), 't')).toBeCloseTo(1, 12)
  expect(startGold({ ...s, goldcoin: 0 }).gold).toBe(25e4)
})

test('fighting BP term: per-stage step and cap in Oblivion agree with ascendGain', async () => {
  const s = { ...(await fullSave()), fightsunlocked: 15, HellKeyGot: 1, FurthestMapleLV: Object.assign(Array(50).fill(0), { 15: 10 }) }
  const m = mapTerm(s)!, g = ascendGain(s)
  expect(m.zone).toBe('Oblivion')
  expect(m.term).toBe(850) // 20·10 + 650
  expect(g.BP[5]).toBe(m.term)
  expect(m.capStage).toBe(218) // 20·218 + 650 ≥ 5000
  expect(m.perStage).toBeCloseTo(20 * g.bpMulti, 9)
  expect(m.left).toBeCloseTo((5000 - 850) * g.bpMulti, 6)
  const next = ascendGain({ ...s, FurthestMapleLV: Object.assign(Array(50).fill(0), { 15: 11 }) })
  expect(next.bp - g.bp).toBeCloseTo(m.perStage, 6)
  expect(mapTerm({ ...s, HellKeyGot: 0, fightsunlocked: 3 })).toBeNull()
})

test('reset advice: ascend/rebirth now when the recent rate is below target, wait above it, unknown without snapshots', async () => {
  const s = { ...(await fullSave()), TimeSinceAscention: 10 * 3600, TimeSinceAscention2: 100 * 3600 }
  const g = ascendGain(s), run = `${s.TimesAscended}-${s.NumberofTimesRebirth}`, rows = perkPlan(s)
  const prev = { run: `${s.TimesAscended - 1}-${s.NumberofTimesRebirth}`, h: 1000, ap: g.ap, bp: 0 } // target ≈ g.ap / 1000 per hour
  const flat = resetAdvice(s, [prev, { run, h: 8, ap: g.ap, bp: g.bp }], rows, 0)
  expect(flat.ascend.call).toBe('now')
  expect(flat.rebirth.call).toBe(g.bp > 0 ? 'now' : 'wait')
  const fast = resetAdvice(s, [prev, { run, h: 8, ap: 0, bp: 0 }], rows, 0)
  expect(fast.ascend.call).toBe('wait')
  expect(fast.ascend.line).toContain('Wait to ascend')
  if (g.bp > 0) expect(fast.rebirth.call).toBe('wait')
  const none = resetAdvice(s, [], rows, 0)
  expect([none.ascend.call, none.rebirth.call]).toEqual(['unknown', 'unknown'])
  // Snapshots from another run never count.
  expect(resetAdvice(s, [{ ...prev, h: 8, run: 'x' }], rows, 0).ascend.call).toBe('unknown')
  for (const a of [fast.ascend, fast.rebirth]) expect(a.evidence.map(([k]) => k)).toEqual(expect.arrayContaining(['Reward now', 'Rate', 'Loses']))
  expect(fast.rebirth.evidence.find(([k]) => k === 'Loses')![1]).toContain('AP (a rebirth pays BP only')
})

test('reset compare (#2669): hold-AP cap, rebirth start levels, BP after an ascend, back-to-here estimates, verdict', async () => {
  const s = { ...(await fullSave()), TimeSinceAscention: 10 * 3600, TimeSinceAscention2: 100 * 3600 }
  expect(ascensionRewards({ ...s, APtoSpend: AP_HOLD * 1.0001 }).BP[4]).toBe(1500)
  expect(ascensionRewards({ ...s, APtoSpend: AP_HOLD * 0.9 }).BP[4]).toBeLessThan(1500)
  const lv = Array(70).fill(0); lv[56] = 7; lv[24] = 3
  const cr = Array(51).fill(0); cr[44] = 2
  expect(rebirthStartLevel({ AscentionLevel: lv, ContractRank: cr, TankBonusLIST: Object.assign(Array(50).fill(1), { 46: 1.5 }), MasteryBonuses: Object.assign(Array(39).fill(1), { 16: 1.3 }) }, 56))
    .toBeCloseTo(1 + 7 + 2 + 3 + 0.5 + 20, 9) // mastery term capped at 20
  const g = ascendGain(s)
  expect(bpAfterAscend(s)).toBe(ascendGain({ ...s, fightsunlocked: 1, FurthestMapleLV: [], SmithingItemLevel: [], SkillLevels: [] }).bp)
  expect(bpAfterAscend(s)).toBeLessThanOrEqual(g.bp)

  const run = `${s.TimesAscended}-${s.NumberofTimesRebirth}`, rows = perkPlan(s), BP = g.BP
  const prev = { run: `${s.TimesAscended - 1}-${s.NumberofTimesRebirth}`, h: 1000, ap: g.ap, bp: 0 }
  // Map term (BP[5]) first at 95% at hour 4; farm terms (BP[1..3]) first there at cycle hour 60.
  const snaps = [prev, { run, h: 2, rh: 40, ap: 0, bp: 0, BP: [0, 0, 0, 0, 0, 0, 0] }, { run, h: 4, rh: 60, ap: 0, bp: 0, BP: [...BP] }, { run, h: 8, rh: 90, ap: 0, bp: 0, BP: [...BP] }]
  const fast = resetCompare(s, snaps, rows, resetAdvice(s, snaps, rows, 0))
  expect(fast.pick).toBe('keep')
  expect(fast.options.map((o) => o.key)).toEqual(['keep', 'ascend', 'rebirth'])
  const [, asc, reb] = fast.options
  if (BP[5]! > 0) expect(asc!.back).toContain('hour 4 ')
  if (BP[1]! + BP[2]! + BP[3]! > 0) expect(reb!.back).toContain('hour 60 ')
  expect(reb!.keeps).toContain('potion levels')
  expect(reb!.wipes).toContain('tilling')
  expect(asc!.keeps).toContain('tilling, botany')
  const flat = [prev, { run, h: 8, ap: g.ap, bp: g.bp }]
  const f = resetCompare(s, flat, rows, resetAdvice(s, flat, rows, 0))
  expect(f.pick).toBe(f.plan ? 'ascend' : g.bp > 0 ? 'rebirth' : 'ascend')
  // No snapshots: back-to-here falls back to the run / cycle clocks.
  expect(resetCompare(s, [], rows, resetAdvice(s, [], rows, 0)).options[2]!.back).toContain('no snapshots')
})

// What each reset block writes, read from the game (dev only): potion levels survive both, tilling/botany/apothecary only an ascend.
test.skipIf(!existsSync(bundle))('ascend block keeps tilling, botany, apothecary and potions; rebirth wipes all but potion levels', async () => {
  const g = await Bun.file(bundle).text()
  const A = g.slice(20900963, 20952873), R = g.slice(20956359, 21022359)
  const writes = (t: string, k: string) => new RegExp(`setReserved\\("${k}"|getGameAttribute\\("${k}"\\)\\[[^\\]]*\\]=(?!=)`).test(t)
  for (const k of ['PotionLV']) { expect(writes(A, k)).toBe(false); expect(writes(R, k)).toBe(false) }
  for (const k of ['FarmingLV', 'HerbloreLV', 'ApothecaryLV', 'SeedsOwned', 'flowersOwned', 'PlantLevel', 'HerblorePotLevel', 'CauldronsOwned', 'OresOwned', 'FishOwned', 'APtoSpend']) {
    expect(writes(A, k)).toBe(false); expect(writes(R, k)).toBe(true)
  }
  for (const k of ['SkillLevels', 'SmithingItemLevel', 'fightsunlocked']) { expect(writes(A, k)).toBe(true); expect(writes(R, k)).toBe(true) }
})

// ---- Labels against the game's own text (#2641). Dev only: needs the extracted bundle.
const gameFile = Bun.file(`${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`)
test.skipIf(!(await gameFile.exists()))('ore names: the mine screen draws the same 20 names in the same order; fish names appear in the CATCH quests', async () => {
  const { ORES, FISH } = await import('./names')
  const g = await gameFile.text()
  const at = g.indexOf('getTextWidth("COPPER"', 30_330_000)
  const drawn = [...g.slice(at, at + 40_000).matchAll(/getTextWidth\("([A-Z_]+)"/g)].map((m) => m[1]!).slice(0, 20)
  expect(drawn).toEqual(ORES.slice(1).map((o) => o.toUpperCase()))
  // fish: the game has no list; ten CATCH_* quest strings name fish (spelling aside), and every one is in the app's list
  const quest = ['JELLYFISH', 'ANGLER_FISH', 'BONEFISH', 'MANTA_RAY', 'ICE_CUBE_FISH', 'GIANT_SEA_SERPENT', 'SNAILFISH', 'DOLLAR_FISH', 'YELLOW_GULPER', 'JUMBO_SHRIMP']
  const flat = (x: string) => x.toUpperCase().replace(/[^A-Z]/g, '')
  for (const q of quest) {
    expect(g).toMatch(new RegExp(`"CATCH_(A_|AN_|THE_)${q}[_"]`))
    expect(FISH.some((f) => flat(f) === flat(q))).toBe(true)
  }
})

test('climb back with what a reset buys (#2673): frontier decode, map and farm climbs, perk buys', async () => {
  // mapFrontier inverts BP term 5's lines (ascensionRewards); at a cap the next zone's stage 0.
  expect(mapFrontier(20 * 29 + 650)).toEqual({ m: 15, L: 29 })
  expect(mapFrontier(5 * 12 + 350)).toEqual({ m: 14, L: 12 })
  expect(mapFrontier(0.8 * 10 + 26)).toEqual({ m: 11, L: 10 })
  expect(mapFrontier(650)).toEqual({ m: 15, L: 0 })
  expect(mapFrontier(0)).toBeNull()
  const s = await fullSave(), hp = (L: number) => monsterHP(s, 15, L)
  // Frontier Oblivion 0, 10, 20 at hours 10, 20, 30: ×M reaches stage 20's HP when the frontier HP was ≥ HP(20)/M.
  const curve = [{ h: 10, v: 650 }, { h: 20, v: 850 }, { h: 30, v: 1050 }]
  expect(mapClimb(s, curve, hp(20), 1)).toEqual({ old: 30, h: 30, atMost: false })
  expect(mapClimb(s, curve, hp(20), hp(20) / hp(10))!.h).toBe(20)
  expect(mapClimb(s, curve, hp(20), 1.01 * hp(20) / hp(10))!.h).toBe(20)
  expect(mapClimb(s, curve, hp(20), 1e300)).toEqual({ old: 30, h: 10, atMost: true })
  // Farm: term 2 twice as fast reaches the goal when terms 1 + 3 plus term 2 at 2t do.
  const cyc = [{ rh: 10, BP: [0, 100, 0, 0] }, { rh: 20, BP: [0, 100, 50, 0] }, { rh: 40, BP: [0, 100, 100, 10] }]
  expect(farmClimb(cyc, 200, [1, 1, 1, 1])).toBe(40)
  expect(farmClimb(cyc, 200, [1, 1, 2, 1])).toBe(20)
  expect(farmClimb(cyc, 210, [1, 1, 2, 1])).toBe(40) // term 3 (×1) sets the pace
  // withBuys adds buyList's levels; with nothing to spend the climb is the old one.
  const rows = perkPlan(s), g = ascendGain(s)
  const { next, buys } = withBuys(s, rows, 'AP', 0)
  expect(buys).toEqual([]); expect(next.AscentionLevel).toEqual(s.AscentionLevel)
  const run = `${s.TimesAscended}-${s.NumberofTimesRebirth}`, BP = [...g.BP]
  const snaps = [{ run, h: 2, rh: 40, ap: 0, bp: 0, BP: BP.map((v, i) => (i === 5 ? 0.5 * v : 0)) }, { run, h: 4, rh: 60, ap: 0, bp: 0, BP }]
  const c = climbBack(s, snaps, rows, 0)
  if (BP[5]! > 0 && c.ascend.M != null) { expect(c.ascend.M).toBe(1); expect(c.ascend.h).toBe(c.ascend.old) }
  const full = climbBack(s, snaps, rows)
  if (full.ascend.h != null) expect(full.ascend.h).toBeLessThanOrEqual(full.ascend.old!)
  expect(full.factors.map((f) => f.kind)).toEqual(expect.arrayContaining(['estimate', 'not modelled']))
  expect(full.factors.find((f) => f.what.startsWith('Start gold'))!.rebirth).toContain('@20995718')
})
