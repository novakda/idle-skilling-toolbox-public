import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { labPlan, labUpgrades, petsView, petGenes, petHPtot, petValueTotals, speciesAt, tankExpReq } from './pets'
import { tankBonuses } from '../../bus'

// Pets screen snapshot (all attributes, read live 2026-10-03 20:08 PT right after the author opened the Pets/hatchery screen).
const live = new URL('../../../../data/captures/2026-10-03/pets-hatchery/attrs.json', import.meta.url).pathname

function check(s: any) {
  expect(petGenes(s).slice(0, 31)).toEqual(s.PetGenes.slice(0, 31))
  // [1..10] are pet-attack battle buffs (ActorEvents_1349), zeroed on refresh: live mid-fight [2] was 20, so skip them.
  petValueTotals(s).forEach((v, i) => i > 10 && expect(v).toBeCloseTo(s.PetValueTotals[i], 9))
  expect(tankBonuses(s)[52]).toBeCloseTo(s.TankBonusLIST[52], 12)
  expect(petHPtot(s)).toBeCloseTo(s.PetHPtot, 9)
  expect(petHPtot({ ...s, TankBonusLIST: [] })).toBeCloseTo(s.PetHPtot, 9) // cloud save: tank 52 computed
}

test('pet stats match the game (fixture)', async () => check(await fullSave()))
test.skipIf(!existsSync(live))('pet stats match the game (live pets screen)', async () => check(await Bun.file(live).json()))

test('genes from abilities, MTX pack, gene 23 and construct 41', () => {
  // Slot 5 holds pet 1 (ability1 = 7); MTX pack 1 doubles slot 5. Slot 1 holds pet 2 (ability1 = 23, ability2 = 23, ability3 = 23).
  const s = { PetPositions: [0, 2, 0, 0, 0, 1], PetAbility1: [0, 7, 23], PetAbility2: [0, 0, 23], PetAbility3: [0, 0, 23], whichMTXpurchased: Object.assign([], { 50: 1 }), ConstructLV: Object.assign([], { 41: 1 }) }
  const g = petGenes(s)
  expect(g[7]).toBe(2)
  expect(g[23]).toBe(4) // 3 from slot 1's abilities; gene 23 >= 3 then counts slot 1's ability 1 again (4); ability 2 needs 6
  expect(g[12]).toBe(1) // floor((1 + 99) / 100)
  expect(g[13]).toBe(0)
})

test('lab vessel plan: costs, colours, odds, greedy buys', () => {
  const TankLVs: number[] = []
  Object.assign(TankLVs, { 301: 4, 304: 135, 307: 0 }) // 4 expansions (2 vats open), Grasseous tier 1 Lv135, Glycogen Lv0
  const s = { TankLVs, PetCurrenciesOwned: [0, 8000, 4], sparklecoin: 375, MTXmysticVATowned: 1, OpenValues: [0, 1, 0, 0, 0, 0, 1] }
  const p = labPlan(s), up = (t: number, sl: number) => p.upgrades.find((u) => u.tank === t && u.slot === sl)!
  expect(up(101, 1)).toMatchObject({ vessel: 3, odds: 100, gives: 'unlocks vat 3 (Visceral)' })
  expect(up(101, 1).cost).toBeCloseTo(10 * 81 + 5 * 4 ** 5, 6) // 5930 red
  expect(up(102, 1).cost).toBeCloseTo(1.044 ** 135 + 135 ** 1.8, 6)
  expect(up(102, 1).odds).toBe(76)
  expect(up(102, 2).unlocked).toBe(true) // tier 1 >= 50
  expect(up(104, 1).unlocked).toBe(false)
  expect(tankExpReq(0)).toBe(12)
  // Sparklecoins: Shiny tier 2 (+50% all RP, 225: same log-gain as tier 1's +50% Research EXP but cheaper), 150 left.
  // Orange 4: Glycogen tier 1 Lv0 (cost 1), then Lv1 (1.044 + 1); Lv2 (2.09 + 3.48) no longer fits.
  expect(p.buy.filter((b) => b.vessel === 0).map((b) => [b.slot, b.left])).toEqual([[2, 150]])
  expect(p.buy.filter((b) => b.vessel === 2).map((b) => b.level)).toEqual([0, 1])
  expect(p.buy.some((b) => b.vessel === 1)).toBe(true)
})

// ---- Breeding (#27): the game's own pet-scene statements run in the sandbox against the port.
import { EGG_UPGRADE, NEW_BASE, eggReq, geneOdds, nestBreeding, nestUpgradeCost } from './pets'
import { BUNDLE, compile, loadBundle, matchBraces } from '../../../../src/game-eval'
const bundle = `${import.meta.dir}/../../../../${BUNDLE}`
const slice = (src: string, from: string, to: string) => { const i = src.indexOf(from), j = src.indexOf(to, i); if (i < 0 || j < 0) throw new Error(`anchor ${from}`); return src.slice(i, j) }
const fn = (src: string, anchor: string, attrs: Record<string, unknown>, host: object) => compile(matchBraces(src, src.indexOf(anchor)), attrs, { a: host }) as () => void

/** Scene-open tables (@27572228-27595263) then the refresh block (@27696775: speed multi, new-pet bonus, PetINDEX from names). */
function scene(src: string, attrs: Record<string, unknown>, eggCount: number[]) {
  const host: any = { wrapper: { enabled: true } }
  ;(compile(`function(){ ${slice(src, 'this._NestSpeedMultiSPECIFIC=[],this._NestSpeedMultiSPECIFIC.splice(0,0,1)', 'for(var Ja=0;12>Ja;)')} }`, attrs) as Function).call(host)
  ;(compile(`function(){ ${slice(src, 'this._PetChancesRegEgg=[]', 'for(var CS=this._PetsOwned=0')} }`, attrs) as Function).call(host)
  host._dummyListEggAmount = [0, ...eggCount]
  compile(`function(){ ${slice(src, 'a._PetINDEX[0]=0;var I=a._NestSpeedMultiSPECIFIC', 'a._GenePossibilities=[];for(var mt=0;9>mt;)')} }`, attrs, { a: host })()
  return host
}

test.skipIf(!existsSync(bundle))('breeding: tables, nest multipliers and hatch species odds match the game code', async () => {
  const src = loadBundle(bundle), base = await fullSave()
  const ab = (k: number) => [...base[`PetAbility${k}`]], p = base.PetPositions
  // Exercise every term: 2 golden nests, Incubation + Discovery on nest 1's parent A, potion 125, ebonus, TankBonusLIST[30].
  const A2 = ab(2), A3 = ab(3); A2[p[7]] = 14; A3[p[7]] = 18
  const variants = [base, { ...base, whichMTXpurchased: Object.assign([...base.whichMTXpurchased], { 49: 2 }), PetAbility2: A2, PetAbility3: A3,
    PotionLV: Object.assign([...base.PotionLV], { 125: 40 }), EbonusThree: Object.assign([...base.EbonusThree], { 9: 10 }), TankBonusLIST: Object.assign([...base.TankBonusLIST], { 30: 1 }) }]
  // Early species (bear + frog → the 70 − 6·id rule) in nest 1, and a raid pet (King) in nest 2.
  const ids = [...base.PetsOwnedINT], fight = [...base.PetsFighting]; ids[p[7]] = 2; ids[p[8]] = 3; fight[7] = 'bear'; fight[8] = 'frog'; ids[p[9]] = 71; fight[9] = 'king'
  variants.push({ ...base, PetsOwnedINT: ids, PetsFighting: fight })
  for (const s of variants) for (let r = 1; r <= 5; r++) {
    // Nest n holds one egg of rarity r (the hatch reads the last egg).
    const eggs = Array(121).fill(0); for (let nn = 1; nn <= 6; nn++) eggs[1 + 20 * (nn - 1)] = r
    const attrs: Record<string, unknown> = structuredClone({ ...s, EggsCreated: eggs }), host = scene(src, attrs, [1, 1, 1, 1, 1, 1])
    expect(host._NEWPETBaseChance.slice(0, 46)).toEqual(NEW_BASE)
    expect(host._EggUpgradeOdds).toEqual(EGG_UPGRADE)
    for (let i = 0; i <= 100; i++) expect(host._NestAnimationREQ[i]).toBeCloseTo(eggReq(i), 6)
    for (let nn = 1; nn <= 5; nn++) {
      const b = nestBreeding(attrs, nn)
      expect(host._PetINDEX.slice(2 * nn - 1, 2 * nn + 1)).toEqual(b.ids) // name-based PetINDEX = PetsOwnedINT
      expect(host._NestSpeedMultiSPECIFIC[nn]).toBeCloseTo(b.speedMulti, 9)
      expect(host._NestRarityMultiSPECIFIC[nn]).toBeCloseTo(b.rarityMulti, 9)
      expect(host._NestNewPetMultiSPECIFIC[nn]).toBeCloseTo(b.newMulti, 9)
      host._NestSelected = nn
      compile(`function(){ ${slice(src, 'var I=a._PetINDEX[2*(a._NestSelected-1)+1|0]', 'a._PetChancesRegEgg[2]=50,a._PetChancesRegEgg[3]=3}')}a._PetChancesRegEgg[2]=50,a._PetChancesRegEgg[3]=3} }`, attrs, { a: host })()
      const h = b.hatch[r - 1]!
      expect(h.newPct).toBeCloseTo(host._PetChancesRegEgg[1], 9)
      expect(h.newPct + h.higherPct).toBeCloseTo(host._PetChancesRegEgg[2], 9)
    }
  }
})
// The 40 ms timer tick (@28032601), the move-to-nest listener (@28034406) and the lay listener (@28037269), run tick by tick.
test.skipIf(!existsSync(bundle))('breeding: egg interval matches the game timer', async () => {
  const src = loadBundle(bundle), s = await fullSave(), attrs: Record<string, unknown> = structuredClone(s)
  const host = scene(src, attrs, [0, 0, 0, 0, 0, 0])
  const tick = fn(src, 'function(e){if(a.wrapper.enabled){for(1==a._HoldButtonDelay2', attrs, host)
  const move = fn(src, 'function(e,t,n,r){if(a.wrapper.enabled)for(e=0;6>e;)if(t=e++,.04<=', attrs, host)
  const lay = fn(src, 'function(t,n,r,i){if(a.wrapper.enabled)for(t=0;6>t;){n=t++,a._dummy1=n,r=', attrs, host)
  const anim = attrs.NestAnimation as number[], b = nestBreeding(s, 2), req = Math.max(...b.ids.map(eggReq))
  // Speed set so the nest runs at 5/6 of the 600 s cap: an egg every ~12 min keeps the tick loop short.
  ;(attrs.NestAnimationSpeed as number[])[2] = req / 720 / b.speedMulti
  const eggSec = nestBreeding(attrs, 2).eggSec
  anim[2] = req - 1
  const lays: number[] = []
  for (let k = 0; lays.length < 2 && k < 1e5; k++) { const before = anim[2]!; tick(); move(); lay(); if (anim[2]! < before) lays.push(k) }
  expect(lays.length).toBe(2)
  expect(eggSec).toBeCloseTo(727.2, 1)
  expect(((lays[1]! - lays[0]!) * 0.04) / eggSec).toBeCloseTo(1, 2)
})

test.skipIf(!existsSync(bundle))('breeding: gene odds and nest upgrade costs match the game code', async () => {
  const src = loadBundle(bundle)
  const odds = (from: string) => { const i = src.indexOf(from), j = src.indexOf('>b.engine.getGameAttribute("SparklecoinRng1000")', i)
    return (attrs: Record<string, unknown>) => (compile(`function(){ ${src.slice(i, j).replace(';if(', ';return (')}) }`, attrs)() as number) / 1000 }
  const g2 = odds('var Gi=(b.engine.getGameAttribute("HatcheryLV")-19)'), g3 = odds('var Qi=(b.engine.getGameAttribute("HatcheryLV")-39)')
  for (const [HatcheryLV, p154] of [[33, 0], [40, 0], [100, 60], [400, 1000]]) {
    const s = { HatcheryLV, PotionLV: Object.assign([], { 154: p154 }) }
    expect(geneOdds(s).second).toBeCloseTo(Math.min(Math.max(g2(s), 0), 100), 9)
    expect(geneOdds(s).third).toBeCloseTo(Math.min(Math.max(g3(s), 0), 100), 9)
  }
  const cost = slice(src, 'a._HatcheryUpgradeCurrency[1]=1,', ',a._dummy1=0,t=a._UpgradeAfford=0;4>t;)').replace(';for(', ';(')
  for (const L of [0, 20, 21, 30, 31, 82, 150, 151, 300, 700]) for (const tbl44 of [0, 30, 95]) {
    const host: any = { _HatcheryUpgradeCurrency: [], _HatcheryUpgradeCOST: [], _NestSelected: 1 }
    compile(`function(){ var t,n,r; ${cost}) }`, { NestLevelsVSE: [0, L], PetTabSelected: 4, TankBonusLIST: Object.assign([], { 44: tbl44 }), PetCurrenciesOwned: [] }, { a: host })()
    const c = nestUpgradeCost(L, tbl44), [cur, cos] = [host._HatcheryUpgradeCurrency, host._HatcheryUpgradeCOST]
    expect(c.cash).toBeCloseTo(cos[1], 6)
    expect(c.vessel ? c.vessel.v : 0).toBe(cur[2] + 10) // index 0 below L21: the game charges PetCurrenciesOwned[0]
    if (c.vessel) expect(c.vessel.cost).toBeCloseTo(cos[2], 6); else expect(cos[2]).toBe(1)
    expect(c.shell ? c.shell.rarity + 11 : cur[3] + 10).toBe(cur[3] + 10) // shells = PetCurrenciesOwned[12..16]
    if (c.shell) expect(c.shell.cost).toBe(cos[3]); else expect(cur[3] + 10).toBeLessThan(0)
  }
})

test('speciesAt reads the name, not a stale PetsOwnedINT', () => {
  const s = { PetIDlist: ['Nothing', 'bear', 'frog', 'penguin'], PetsOwned: ['Nothing', 'penguin', 'mystery'], PetsOwnedINT: [70, 70, 2] }
  expect(speciesAt(s, 1)).toBe(3) // stale 70 → penguin by name
  expect(speciesAt(s, 2)).toBe(2) // unknown name → falls back to the id
})

test('covers: gene multiset containment (trash rule for duplicate-gene pets, 2026-10-12)', async () => {
  const { covers } = await import('./pets')
  expect(covers([3, 3], [3, 3])).toBe(true) // Healing + Healing vs the same
  expect(covers([3, 5], [3])).toBe(true)
  expect(covers([3], [3, 3])).toBe(false)
  expect(covers([3, 5], [3, 3])).toBe(false)
})

// ---- Tank colour names against the game's own text (#2641).
const gameSrcFile = Bun.file(`${import.meta.dir}/../../../../data/game/asar/distBuild/static/game/Qno2x.js`)
test.skipIf(!(await gameSrcFile.exists()))('tank colours: the game names nine in the order the tab uses for its first five', async () => {
  const { TANK_COLOURS } = await import('./pets')
  const g = await gameSrcFile.text()
  const at = g.indexOf('_MainStat1[102]="GREEN_TANKS_GAIN_RP_AT_A"', 28_270_000)
  expect(at).toBeGreaterThan(0)
  const names = [...g.slice(at, at + 600).matchAll(/_MainStat1\[(1\d\d)\]="([A-Z]+)_TANKS_GAIN_RP_AT_A"/g)].map((m) => m[2]!.toLowerCase())
  expect(names).toEqual(['green', 'orange', 'red', 'yellow', 'pink', 'purple', 'blue', 'white', 'blood'])
  expect(TANK_COLOURS).toEqual(names.slice(0, 5))
  expect(g).toContain('"GREEN_VESSELS_OWNED"') // the only vessel colour the game names
})

test('nests open at Hatchery Lv 0/5/10/20/30/50, even empty and unupgraded', () => {
  const base = JSON.parse(require('fs').readFileSync(`${import.meta.dir}/../../../../data/save.json`, 'utf8'))
  for (const [lv, count] of [[0, 1], [9, 2], [10, 3], [49, 5], [50, 6]] as const)
    expect(petsView({ ...base, HatcheryLV: lv, NestLevelsVSE: [] }).nests.length).toBe(count)
})

test('lab knee: tank-curve upgrades get knee 990, linear ones none', () => {
  const { upgrades } = labUpgrades({ TankLVs: Array(400).fill(0), TankBonusLIST: [], OpenValues: [], PetRewardList: [], PetCurrenciesOwned: [] })
  const vat2 = upgrades.find((u) => u.tank === 102 && u.slot === 2)!
  expect(vat2.knee!.knee).toBe(990)
  expect(upgrades.find((u) => u.tank === 102 && u.slot === 1)!.knee).toBeUndefined()
  // the curve really is at half its ceiling there
  expect((1 + 198 * 990 / 1990) / 199).toBeGreaterThanOrEqual(0.5)
  expect((1 + 198 * 989 / 1989) / 199).toBeLessThan(0.5)
})

test('multi-level chance: no cap at 101, extra levels every 100 points up to 8 at 701', () => {
  const base = { TankLVs: Array(400).fill(0), TankBonusLIST: [], OpenValues: [], PetRewardList: [], PetCurrenciesOwned: [] }
  expect(labUpgrades(base).levelsPer).toBe(1)
  const at = (d: number) => labUpgrades({ ...base, PetRewardList: Object.assign(Array(30).fill(0), { 18: d / 20 }) }).levelsPer
  expect(at(100)).toBeCloseTo(1 + 100 / 101, 6)
  expect(at(250)).toBeCloseTo(1 + 1 + 1 + 50 / 101, 6) // 2nd level always, 3rd always (r ≤ 100 < 150), 4th if r < 50
  expect(at(1000)).toBe(8)
  // a multi-level buy still has value past 101 (the old model gave it 0)
  const shiny = labUpgrades({ ...base, MTXmysticVATowned: 1, PetRewardList: Object.assign(Array(30).fill(0), { 18: 10 }) }).upgrades.find((u) => u.tank === 111 && u.slot === 3)!
  expect(shiny.gain).toBeGreaterThan(0)
})

test('#2777: multi-level chance reads vats 102-110 slot 3 (not 103-111) and adds 200 on a Diamond-piped open tank', () => {
  const base = { TankLVs: Array(400).fill(0), TankBonusLIST: [], OpenValues: [], PetRewardList: [], PetCurrenciesOwned: [] }
  const curve20 = (L: number) => ((Math.min(L, 1) + (198 * L) / (L + 1000)) * 20) / 100
  expect(labUpgrades({ ...base, TankLVs: Object.assign(Array(400).fill(0), { 306: 500 }) }).dblChance).toBeCloseTo(curve20(500), 9) // Grasseous slot 3
  expect(labUpgrades({ ...base, TankLVs: Object.assign(Array(400).fill(0), { 333: 4 }) }).dblChance).toBe(100) // Shiny slot 3: 25/level only
  const open1 = Object.assign(Array(101).fill(0), { 1: 1, 2: 1 })
  const piped = labUpgrades({ ...base, OpenValues: open1, DiamondPiping: Object.assign(Array(60).fill(0), { 1: 1 }) })
  expect(piped.pipedTanks).toBe(1)
  expect(piped.levelsPer).toBeCloseTo((1 + 101 / 101 + 100 / 101 + 1) / 2, 9) // tank 1 at aa 200 (2.99 levels), tank 2 at 0 (1 level)
})
