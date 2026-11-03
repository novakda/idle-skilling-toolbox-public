import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { CROPS, cropCardsEquipped, cropPlan, cropUnlockLevel, farmers, farmingExpGivenBonus, goldBuys, maxCrop, plots, potionNeeds, seedsGivenBonus, tillingSpeedBoost, withTilling } from './tilling'
import { nextPotionReq, potionLevelCost, potionLevelsPerPay } from './potions-calc'
import { withDeckLinks } from './cards-calc'
import { reactive } from 'vue'
import { potionBonuses, tankBonuses } from './load-bonuses'
import { buildCards, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'

const bundle = new URL(`../../${BUNDLE}`, import.meta.url).pathname
const capture = (d: string) => new URL(`../../data/captures/${d}/attrs.json`, import.meta.url).pathname
// All attributes read live: 2026-10-09 (crop 2 on every plot, armors 40/40/30/30/30/20/20/10), 2026-10-08 (crop 1, a
// dirt-type crop), 2026-10-03 on the Tilling screen (crop 12). Each was read right after the Tilling scene computed them.
const CAPTURES = ['2026-10-09/tilling', '2026-10-08/pet-inv-buy', '2026-10-03/tilling'].filter((d) => existsSync(capture(d)))

test.skipIf(!CAPTURES.length)('per-harvest bonuses match the values the game stored', async () => {
  for (const d of CAPTURES) {
    const s = await Bun.file(capture(d)).json()
    const pb = potionBonuses(s), tank = tankBonuses(s), seeds = seedsGivenBonus(s), exp = farmingExpGivenBonus(s)
    expect(pb.Crops).toBeCloseTo(s.PbonusCrops, 9)
    expect(pb.TillingExp).toBeCloseTo(s.PbonusTillingExp, 9)
    expect(tank[31]).toBeCloseTo(s.TankBonusLIST[31], 12)
    expect(tank[48]).toBeCloseTo(s.TankBonusLIST[48], 12)
    expect(cropCardsEquipped(s).slice(1, 21)).toEqual(s.CropCardsEquipped.slice(1, 21)) // the Tilling-linked deck's crop cards
    for (let f = 1; f <= 8; f++) {
      expect(seeds[f]! / s.SeedsGivenBONUS[f]).toBeCloseTo(1, 12)
      expect(exp / s.FarmingExpGivenBONUS[f]).toBeCloseTo(1, 12)
    }
  }
})

test.skipIf(!existsSync(capture('2026-10-03/tilling')))('Tilling speed boost matches what the Tilling screen wrote', async () => {
  const s = await Bun.file(capture('2026-10-03/tilling')).json()
  expect(tillingSpeedBoost(s)).toBeCloseTo(s.FarmingSpeedBOOST, 12)
})

test('farmer upgrade levels rebuild the stored per-farmer values', async () => {
  const s = await fullSave()
  for (let f = 1; f <= 8; f++) {
    if (!s.FarmerLV1[f]) continue
    let xp = 1, anim = 1 // a new farmer starts at 1 EXP, 1 seed, anim speed 1, levels 1/1
    for (let L = 1; L < s.FarmerLV1[f]; L++) xp += 1 + Math.floor(L / 3) / 10 + Math.floor(L / 10) / 2
    for (let L = 1; L < s.FarmerLV2[f]; L++) anim *= 1 + 8 / (1 + Math.floor(L / 4) / 3) / 100
    expect(xp).toBeCloseTo(s.FarmingExpGiven[f], 6)
    expect(anim).toBeCloseTo(s.FarmingAnimationSpeed[f], 9)
    expect(1 + 0.05 * (s.FarmerLV1[f] - 1) + 0.07 * (s.FarmerLV2[f] - 1)).toBeCloseTo(s.SeedsGiven[f], 9)
  }
})

test('gold buys: value upgrades raise XP; maxed speed (lv 81) is not offered', async () => {
  const s = withTilling(await fullSave()), buys = goldBuys(s, 30.5)
  expect(buys.length).toBeGreaterThan(0)
  for (const b of buys) {
    expect(b.away).toBeGreaterThan(0)
    if (b.kind === 'speed') expect(s.FarmerLV2[b.f]).toBeLessThan(81)
  }
  for (let i = 1; i < buys.length; i++) expect(buys[i - 1]!.away / buys[i - 1]!.cost).toBeGreaterThanOrEqual(buys[i]!.away / buys[i]!.cost)
})

// ---- The game's own code, run in the sandbox (dev only: needs the extracted bundle).
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const at = (anchor: string) => { const i = src.indexOf(anchor); if (i < 0) throw new Error(`anchor moved: ${anchor}`); return i }

test.skipIf(!src)('crop names are the scene\'s _Plants list', () => {
  const list = [...src.slice(at('this._Plants.splice(1,0,'), at('this._Plants.splice(40,0,') + 60).matchAll(/_Plants\.splice\((\d+),0,"(\w+)"\)/g)]
  expect(list.length).toBe(40)
  for (const [, i, name] of list) expect(CROPS[+i!]).toBe(name)
})

test.skipIf(!src)('seed and EXP bonuses equal the scene init on mixed crops, ranks and armors', async () => {
  const s = await fullSave()
  // Every crop group, a dirt-type crop, an empty-card crop and each armor, so every branch of the loop runs.
  const save = { ...structuredClone(s), PlantType: [0, 19, 18, 11, 5, 8, 15, 3, 1], PlantLevel: [0, 7, 6, 5, 4, 3, 2, 1, 6], FarmerArmor: [0, 40, 0, 10, 20, 30, 40, 0, 10] }
  // The init reads the crop cards from the card holders, which hold the Tilling-linked deck once the scene has equipped it.
  const tillingDeck = buildCards(save, catalog as unknown as Catalog).decks.find((d) => d.link === 2)!.cards
  const attrs = { ...structuredClone(save), CardHolderWhichCard: [...tillingDeck] }
  const fn = src.slice(at('p.runLater(30,(function(t){b.engine.getGameAttribute("FarmingExpGivenBONUS")[1]=1') + 'p.runLater(30,('.length)
  compile(matchBraces(fn, 0), attrs, { e: {} })(0)
  const seeds = seedsGivenBonus(save), exp = farmingExpGivenBonus(save)
  for (let f = 1; f <= 8; f++) {
    expect(seeds[f]! / attrs.SeedsGivenBONUS[f]).toBeCloseTo(1, 12)
    expect(exp / attrs.FarmingExpGivenBONUS[f]).toBeCloseTo(1, 12)
  }
  expect(new Set(seeds.slice(1).map((x) => x.toFixed(6))).size).toBeGreaterThan(2) // the mix really does split the farmers
})

test.skipIf(!src)('a harvest pays what farmers() expects (ActorEvents_1093, farmer 1)', async () => {
  const s = withTilling(await fullSave())
  const listener = src.slice(at('function(a,n,r,i){if(t.wrapper.enabled)if(200>t.actor.getY())if(130>t.actor.getX())'))
  const f1 = farmers(s, 30)[0]!, crop = s.PlantType[1], chance = s.farmingChance / 1000, twice = Math.min(50 * s.SkillLevels[54], 1000) / 1000
  const once = f1.seedsPerHarvest / (1 + twice), xp = f1.xpPerHarvest / chance
  for (const roll of [1, 1000]) { // roll 1: EXP and the second payout both land; 1000: neither (farmingChance 100, perk ≤ 500)
    const attrs = { ...structuredClone(s), FarmerAnimation: [1, 10] }
    const p = { randomInt: () => roll, createRecycledActor() {}, getActorType() {} }
    const actor = { getY: () => 100, getX: () => 100, setCurrentFrame() {}, getXCenter: () => 0, getYCenter: () => 0 }
    compile(matchBraces(listener, 0), attrs, { e: {}, t: { wrapper: { enabled: true }, actor }, p })(0, 0, 0, 0)
    const paid = roll <= 50 * s.SkillLevels[54] ? 2 : 1
    expect((attrs.SeedsOwned[crop] - s.SeedsOwned[crop]) / (paid * once)).toBeCloseTo(1, 9)
    expect((attrs.PlantEXP[crop] - s.PlantEXP[crop]) / (paid * once)).toBeCloseTo(1, 9)
    expect(attrs.farmingEXP - s.farmingEXP).toBeCloseTo(roll <= s.farmingChance ? xp : 0, 0)
  }
})

test.skipIf(!src)('plot upgrade costs and rank EXP equal the game\'s handlers', async () => {
  const s = withTilling(await fullSave()), mine = plots(s)
  const buy = src.slice(at('function(t,a){if(e.wrapper.enabled&&5==t)for(t=0,a=0|b.engine.getGameAttribute("MultiPurchaseToggle");t<a;)if(t++,1==b.engine.getGameAttribute("PlantMenuType")'))
  for (const [x, size] of [[200, 'small'], [300, 'medium'], [500, 'large']] as const) {
    const p = 3, plot = mine.find((q) => q.p === p)!
    const attrs = { ...structuredClone(s), PlantSelected: p, PlantMenuType: 1, CurrentlyViewedScreen: 15, MultiPurchaseToggle: 1, SeedsOwned: s.SeedsOwned.map(() => 1e15) }
    compile(matchBraces(buy, 0), attrs, { e: { wrapper: { enabled: true }, actor: { getX: () => x } } })(5, 0)
    for (const [crop, cost] of plot[size].cost) expect((1e15 - attrs.SeedsOwned[crop]) / cost).toBeCloseTo(1, 6)
    const key = { small: 'PlantPlotSMALLlv', medium: 'PlantPlotMEDlv', large: 'PlantPlotLARGElv' }[size]
    expect(attrs[key][p]).toBe(s[key][p] + 1)
  }
  const tick = src.slice(at('p.runPeriodically(200,(function(t){if(a.wrapper.enabled){for(b.engine.getGameAttribute("FarmerLV1")[0]=0') + 'p.runPeriodically(200,('.length)
  const attrs = structuredClone(s)
  compile(matchBraces(tick, 0), attrs, { e: {}, a: { wrapper: { enabled: true } }, p: { randomInt: () => 2 } })(0)
  for (const q of mine) expect((attrs.PlantexpRANK[q.p] - s.PlantexpRANK[q.p]) / (q.perSec / 5)).toBeCloseTo(1, 9)
})

test('farmers() agrees with the AFK tab\'s Tilling rates', async () => {
  const { activeTilling, awayTillingPerSecond } = await import('./away')
  const s = withTilling(await fullSave()), rows = farmers(s, 30.5)
  expect(rows.reduce((t, r) => t + r.awayXpPerSec, 0) / awayTillingPerSecond(s, 30.5)).toBeCloseTo(1, 12)
  expect(rows.reduce((t, r) => t + r.xpPerHarvest * r.harvestsPerSec, 0) / activeTilling(s).xpPerSec).toBeCloseTo(1, 12)
})

// ---- Which crop to grow ------------------------------------------------------------------------------------------------------
test.skipIf(!src)('potion level price, levels per payment and req growth equal the cauldron listener (SceneEvents_37)', async () => {
  const s = await fullSave()
  const fn = matchBraces(src, at('this.addWhenDrawingListener(null,(function(n,i,o,s){if(a.wrapper.enabled)for(var g=0;6>g;){var m=g++,_=b.engine.getGameAttribute("PotionType")[m+1];if(108>') + 'this.addWhenDrawingListener(null,('.length)
  for (let c = 1; c <= 6; c++) {
    const T = s.PotionType[c]
    if (!T || (T >= 108 && T <= 119)) continue
    const cost = potionLevelCost(s, T, c)
    for (const [k, roll] of [[1.5, 100], [1.5, 0], [0.999, 100]] as const) {
      const attrs = structuredClone(s)
      for (let d = 1; d <= 6; d++) attrs.PotionEXP[attrs.PotionType[d]] = d === c ? attrs.PotionEXPreq[T] : 0
      attrs.SeedsOwned[cost.crop] = cost.qty * k
      attrs.flowersOwned[cost.flower] = cost.flowerQty * 2
      // randomInt(1,1000) = 1000: no shrine freebie; randomInt(0,100) = the multi-level roll
      compile(fn, attrs, { p: { randomInt: (lo: number, hi: number) => (hi === 1000 ? 1000 : roll), createRecycledActor() {}, getActorType() {} } })(inert, 0, 0, 0)
      if (k < 1) { expect(attrs.SeedsOwned[cost.crop]).toBe(cost.qty * k); expect(attrs.PotionLV[T - 1]).toBe(s.PotionLV[T - 1]); continue }
      expect((cost.qty * k - attrs.SeedsOwned[cost.crop]) / cost.qty).toBeCloseTo(1, 9)
      expect((cost.flowerQty * 2 - attrs.flowersOwned[cost.flower]) / cost.flowerQty).toBeCloseTo(1, 9)
      const levels = potionLevelsPerPay(s, c, roll)
      expect(attrs.PotionLV[T - 1] - s.PotionLV[T - 1]).toBe(levels)
      let req = s.PotionEXPreq[T]
      for (let L = 0; L < levels; L++) req = nextPotionReq(req, T)
      expect(attrs.PotionEXPreq[T] / req).toBeCloseTo(1, 9)
    }
  }
})

test.skipIf(!src)('the plot + button needs cropUnlockLevel and stops at cropCap (ActorEvents_210)', async () => {
  const s = await fullSave()
  const fn = matchBraces(src, at('function(a,n){if(t.wrapper.enabled&&5==a){if(15==b.engine.getGameAttribute("CurrentlyViewedScreen")&&1!=b.engine.getGameAttribute("PlantMenuType")&&0!=(null==(a=b.engine.getGameAttribute("FarmerLV1")'))
  for (const [p, T] of [[1, 5], [4, 13], [8, 19], [3, 20]] as const) for (const lv of [cropUnlockLevel(T, p) - 1, cropUnlockLevel(T, p)]) {
    const attrs = { ...structuredClone(s), PlantSelected: p, PlantMenuType: 0, CurrentlyViewedScreen: 15, FarmingLV: lv, PlantType: s.PlantType.map((x: number, i: number) => (i === p ? T : x)), PlantTypeMAX: s.PlantTypeMAX.map((x: number, i: number) => (i === p ? T : x)) }
    compile(fn, attrs, { t: { wrapper: { enabled: true } }, p: { createRecycledActor() {}, getActorType() {} } })(5, 0)
    const cap = 5 * s.ConstructLV[14] + 5 * s.ConstructLV[29] + 20
    const up = T < cap && lv >= cropUnlockLevel(T, p)
    expect(attrs.PlantType[p]).toBe(up ? T + 1 : T)
    expect(attrs.PlantTypeMAX[p]).toBe(up ? T + 1 : T)
  }
})

test('a plan with the current crops reproduces farmers()', async () => {
  const s = withTilling(withDeckLinks(await fullSave()))
  const other = [0, 11, 13, 5, 1, 13, 8, 2, 11]
  expect(seedsGivenBonus(s, other)).toEqual(seedsGivenBonus({ ...s, PlantType: other }))
  for (let p = 1; p <= 8; p++) expect(maxCrop(s, p).max).toBeGreaterThanOrEqual(Math.max(1, s.PlantTypeMAX[p]))
})

test('crop plan: every step only uses crops the plot can grow, and covers every potion level', async () => {
  const s = withTilling(withDeckLinks(await fullSave())), plan = cropPlan(s, 30.5)
  expect(plan.needs).toEqual(potionNeeds(s))
  for (const st of plan.steps) for (let p = 1; p <= 8; p++) if (s.FarmerLV1[p]) expect(st.plan[p]).toBeLessThanOrEqual(maxCrop(s, p).max)
  const covered = [...plan.ready, ...plan.steps.flatMap((st) => st.pays)].map((x) => x.c).sort()
  expect([...covered, ...plan.unreachable.map((x) => x.c)].sort()).toEqual(plan.needs.filter((x) => x.qty > 0).map((x) => x.c).sort())
  // the plan's first setup is no slower than the current one at covering every shortfall
  const short = (pt: number[]) => {
    const r: number[] = []
    for (const x of farmers(withTilling({ ...s, PlantType: pt }), 30.5)) r[x.crop] = (r[x.crop] ?? 0) + x.awayCropsPerSec
    const need = new Map<number, number>()
    for (const x of plan.needs) need.set(x.crop, (need.get(x.crop) ?? 0) + x.qty)
    return Math.max(...[...need].map(([c, q]) => Math.max(q - s.SeedsOwned[c], 0) / (r[c] ?? 0)).map((t) => (isNaN(t) ? 0 : t)))
  }
  if (plan.steps[0]) expect(short(plan.steps[0].plan)).toBeLessThanOrEqual(short(s.PlantType) * (1 + 1e-9))
})

test('crop plan works on the reactive save Vue passes', async () => {
  const save = await fullSave()
  const plain = cropPlan(withTilling(withDeckLinks(save)), 30.5), viaVue = cropPlan(withTilling(withDeckLinks(reactive(save))), 30.5)
  expect(viaVue.steps.map((st) => [st.plan.join(), st.secs])).toEqual(plain.steps.map((st) => [st.plan.join(), st.secs]))
})
