// Tilling (scene SceneEvents_34, screen 15; save keys Farm*/Seeds*/Plant*). 8 farmers, farmer f works plot f and grows crop
// PlantType[f]. Every formula is ported from Qno2x.js (offsets †) and checked in tilling.test.ts against the values a full
// save stores, or against the game's own code in the sandbox; everything is computed from the save alone.
import { activeTilling, awayTillingPerSecond } from './away'
import { framesPerSec } from './anim'
import { equipmentBonuses, masteryBonuses, potionBonuses, tankBonuses } from './load-bonuses'
import { buildCards, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { potionLevelCost, potionLevelsPerPay } from './potions-calc'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
export const FARMERS = 8

/** Crop names by crop id 1-40, from the scene's _Plants list († @23437505; 21-40 are the dark-mode crops). */
export const CROPS = [, 'DIRT', 'GRASS', 'QUALITY_HAY', 'SAFFRON', 'CORN', 'MAIZE', 'HYPER_STALK', 'CABBAGE', 'ANCIENT_DEW', 'EGG_YOLK',
  'PACKED_CLAY', 'LIL_PUMPKIN', 'MACROMATO', 'SPOOKTOBBLE', 'CRYSTAL', 'LUCENTIUM', 'PRISMATISM', 'ESSENCE', 'HALLOWNIL', 'SAMMATIAN',
  'MINRIL_SOIL', 'SPUDDIES', 'VEGETABIP', 'BUNNYMUNCH', 'DARNEDLION', 'VIOLETTA', 'STUNFLOWER', 'LEWDPLANTS', 'BEANIES', 'BANANA_VINE',
  'RUPTURIUM', 'BLUE_GRAP', 'PINK_GRAP', 'WHITE_GRAP', 'ABSTRACT', 'NONSENSIC', 'BALDERDASH', 'CHOCO_TREE', 'SALT_LICK', 'CARMAMELLA',
] as (string | undefined)[]
export const cropName = (c: number) => (CROPS[c] ?? `#${c}`).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase())

/** FarmingExpGivenBONUS[f] (scene init runLater, † @23439004): every farmer gets 1 + 0.25 per plot at rank ≥ 2 + 0.25 per
 *  farmer in armor 40, × (1 + PbonusTillingExp/100) × (1 + EbonusThree[5]·waterLV/100). */
export function farmingExpGivenBonus(save: Save) {
  let base = 1
  for (let k = 1; k <= FARMERS; k++) base += 0.25 * Math.floor((98 + n(arr(save, 'PlantLevel')[k])) / 100) + (n(arr(save, 'FarmerArmor')[k]) === 40 ? 0.25 : 0)
  return base * (1 + potionBonuses(save).TillingExp / 100) * (1 + (equipmentBonuses(save).three[5]! * n(save.waterLV)) / 100)
}

/** CropCardsEquipped as the scene init rebuilds it († @23439004): slots 1-10 cleared, then 1 for every crop card (ids 301-320)
 *  in the card holders, which by then hold the Tilling-linked deck (link 2; the selected deck when none is linked). Slots
 *  11-20 are not cleared, so they keep the save's earlier value. */
export function cropCardsEquipped(save: Save) {
  const decks = buildCards(save, catalog as unknown as Catalog).decks, deck = decks.find((d) => d.link === 2) ?? decks.find((d) => d.active)
  const cce = Array.from({ length: 21 }, (_, i) => (i > 10 ? n(arr(save, 'CropCardsEquipped')[i]) : 0))
  for (const id of deck?.cards ?? []) if (id > 300 && id < 321) cce[id - 300] = 1
  return cce
}

/** The parts of SeedsGivenBONUS that don't depend on which crop each plot grows (computed once when plans are compared). */
const seedsFixed = (save: Save) => ({ cce: cropCardsEquipped(save), pb: potionBonuses(save), three: equipmentBonuses(save).three, tank: tankBonuses(save), mast9: masteryBonuses(save)[9]! })

/** SeedsGivenBONUS[1..8] (same runLater, † @23443900-@23478100), run the way the game runs it: for each farmer, additive
 *  terms per plot, crop-group ×1.1 / armor-40 ×1.25 / crop-card factors per plot, then the global multipliers. The ore
 *  certification step sits inside the farmer loop and multiplies indices 1-20 every pass, so its order is kept as is. */
export function seedsGivenBonus(save: Save, plantType = arr(save, 'PlantType'), fixed = seedsFixed(save)) {
  const PL = (k: number) => n(arr(save, 'PlantLevel')[k]), PT = (k: number) => n(plantType[k]), arm = (k: number) => n(arr(save, 'FarmerArmor')[k])
  const S = (k: number) => n(arr(save, 'SeedsOwned')[k]), P = (i: number) => n(arr(save, 'PotionLV')[i]), lg = (x: number) => Math.log(Math.abs(x) + 1)
  const at = (k: number, r: number) => Math.floor((r + PL(k)) / 100) // 1 when plot k's rank ≥ 100 - r
  const { cce, pb, three, tank, mast9 } = fixed, card = (c: number) => n(arr(save, 'CardLevels')[300 + c]) * n(cce[c])
  const water = n(save.waterLV), lv = n(save.FarmingLV), FM = n(save.FarthestMonster), P168 = Math.min(P(168), 1)
  const mythic = arr(save, 'HerblorePotLevel').slice(1, 15).filter((t) => n(t) >= 8).length
  const b = Array.from({ length: 21 }, (_, i) => (i >= 1 && i <= FARMERS ? 1 : n(arr(save, 'SeedsGivenBONUS')[i])))
  for (let f = 1; f <= FARMERS; f++) {
    const t = PT(f)
    for (let k = 1; k <= FARMERS; k++) {
      if (t === 1 || t === 11) b[f]! += 0.005 * lv * at(k, 96) + 0.005 * water * at(k, 97) + 0.25 * at(k, 99)
      else b[f]! += 0.0086 * lg(n(save.goldcoin)) * at(k, 95) + 0.0129 * lg(S(8) + S(9) + S(10)) * at(k, 94)
        + 0.05 * 0.43 * lg(S(20)) * at(k, 93) + 0.0129 * lg(S(5) + S(6) + S(7)) * at(k, 96) + 0.005 * water * at(k, 97)
      // crop group × farmer type on another plot (wiki: "+10% <group> crops for every active <tiller>"), gated on this plot's rank
      if (t >= 2 && t <= 4 && arm(k) === 0 && PL(f) >= 2) b[f]! *= 1.1
      if (t >= 5 && t <= 7 && arm(k) === 10 && PL(f) >= 3) b[f]! *= 1.1
      if (t >= 8 && t <= 10 && arm(k) === 20 && PL(f) >= 4) b[f]! *= 1.1
      if (t >= 15 && t <= 17 && arm(k) === 30 && PL(f) >= 5) b[f]! *= 1.1
      if (arm(k) === 40) b[f]! *= 1.25
      const c = PT(k) // crop card of the crop on plot k (cards 300 + crop, when equipped)
      b[f]! *= 1 + ((c <= 4 ? 3 : c <= 7 ? 4 : c <= 10 ? 5 : c <= 13 ? 6 : c <= 16 ? 7 : c <= 19 ? 8 : c <= 20 ? 10 : 0) * card(c)) / 100
    }
    b[f]! *= (1 + pb.Crops / 100) * Math.pow(1 + ((0.45 * P(132)) / (P(132) + 175)) * P168, Math.ceil(Math.pow(FM, 0.6) + Math.max((FM - 195) / 5, 0) * P168))
      * (1 + (three[4]! * lv) / 100) * mast9 * (1 + (10 * n(arr(save, 'TrainingPerkLevels')[8])) / 100)
    for (let o = 0; o < 20; o++) if (n(arr(save, 'OresOwned')[o + 1]) > 1.001 * Math.pow(10, 21 + o)) b[o + 1]! *= 1 + (1.9 * P(161)) / (P(161) + 175)
    const pachi = 1 + ((40 * P(156)) / (P(156) + 175)) * Math.min(P(167), 1) * (n(save.PachiTixCollected) / 50) / 100
    const c46 = n(arr(save, 'ConstructLV')[46]), s93 = n(arr(save, 'SmithingItemLevel')[93])
    b[f]! *= (1 + (100 * (Math.pow(pachi, 1 + Math.min((1.25 * P(167)) / (P(167) + 175), 1)) - 1)) / 100)
      * (1 + (100 * Math.pow(c46, 1.10128) * Math.pow(1.02, c46) * Math.max(water - 1000, 0)) / 100)
      * Math.pow(1 + ((3 * s93) / (s93 + 1500)) * Math.pow(1.085, Math.min(s93 / 1000, 15)), n(save.CoolCashStars))
      * (1 + (3 * n(arr(save, 'SkillLevels')[59]) * mythic) / 100) * (1 + (5 * n(arr(save, 'ShrineLevels')[4])) / 100)
      * (1 + (4 * n(arr(save, 'EventUpgradeLevels')[5])) / 100) * tank[31] * (1 + (tank[48] * n(arr(save, 'OverLevels')[f])) / 100)
  }
  return b.slice(0, FARMERS + 1)
}

/** FarmingSpeedBOOST as the Tilling screen writes it each draw († @23584216): (1 + 0.1 per plot at rank ≥ 2) ×
 *  (1 + T/1000), T = (10·potion 22 + 0.45·potion 52·FarmingLV)(1 + 0.02·potion 94) (no vending term here). */
export function tillingSpeedBoost(save: Save) {
  const P = (i: number) => n(arr(save, 'PotionLV')[i])
  const plots = arr(save, 'PlantLevel').slice(1, FARMERS + 1).filter((r) => n(r) >= 2).length
  return (1 + 0.1 * plots) * (1 + ((10 * P(22) + 0.45 * P(52) * n(save.FarmingLV)) * (1 + 0.02 * P(94))) / 1000)
}

/** The save with the load-time Tilling values recomputed (cloud saves lack them; local ones can be a level stale). */
export function withTilling(save: Save): Save {
  const exp = farmingExpGivenBonus(save), seeds = seedsGivenBonus(save)
  return {
    ...save, SeedsGivenBONUS: seeds, FarmingSpeedBOOST: tillingSpeedBoost(save),
    FarmingExpGivenBONUS: Array.from({ length: FARMERS + 1 }, (_, f) => (f ? exp : 0)),
    farmingChance: save.farmingChance ?? 100, // only ever read by the game (8 reads, † @3073005); 100 in every save seen
  }
}

/** Per harvest (ActorEvents_1093, † @3072037): amount A = SeedsGiven·(1 + armor/40)·SeedsGivenBONUS goes to the crop's
 *  SeedsOwned and PlantEXP; one roll r = randomInt(1,1000) pays farmingEXP += FarmingExpGiven·FarmingExpGivenBONUS when
 *  r ≤ farmingChance, and pays A a second time when r ≤ 50·SkillLevels[54]. Expected values per harvest. */
export function farmers(s: Save, awayPct: number) {
  const act = activeTilling(s).farmers, chance = n(s.farmingChance) / 1000, twice = Math.min(50 * n(arr(s, 'SkillLevels')[54]), 1000) / 1000
  const out = []
  for (let f = 1, i = 0; f <= FARMERS; f++) {
    if (!n(arr(s, 'FarmerLV1')[f])) continue
    const a = act[i++]!, armor = n(arr(s, 'FarmerArmor')[f])
    const seeds = n(arr(s, 'SeedsGiven')[f]) * (1 + armor / 40) * n(arr(s, 'SeedsGivenBONUS')[f]) * (1 + twice)
    const xp = n(arr(s, 'FarmingExpGiven')[f]) * n(arr(s, 'FarmingExpGivenBONUS')[f])
    const fps = framesPerSec(a.speed)
    const awayHarvests = (n(arr(s, 'FarmingAnimationSpeed')[f]) / 10) * (1 + armor / 40) * n(s.FarmingSpeedBOOST) * (awayPct / 100) * (1 + n(arr(s, 'TankBonusLIST')[36]) / 100)
    out.push({
      f, crop: n(arr(s, 'PlantType')[f]), armor, rank: n(arr(s, 'PlantLevel')[f]), value: n(arr(s, 'FarmerLV1')[f]), speedLv: n(arr(s, 'FarmerLV2')[f]),
      speed: a.speed, harvestsPerSec: a.harvestsPerSec, nextStep: nextSpeedStep(a.speed, fps), seedsPerHarvest: seeds, xpPerHarvest: xp * chance,
      // away (own scene code † @23484882, away.ts): nominal speed/10 harvests per credited second (away s × away % × (1 + tank 36/100)),
      // each paying XP and SeedsGiven·SeedsGivenBONUS × (0.25·round(armor/10) + 1), with no roll
      awayXpPerSec: awayHarvests * xp * (0.25 * Math.round(armor / 10) + 1),
      awayCropsPerSec: awayHarvests * n(arr(s, 'SeedsGiven')[f]) * n(arr(s, 'SeedsGivenBONUS')[f]) * (0.25 * Math.round(armor / 10) + 1),
    })
  }
  return out
}

/** The nominal speed at which a farmer's on-screen frame rate next steps up (framesPerSec is a step function; ≥ 100 is the
 *  60 fps ceiling). Bisection on [speed, 100]. */
export function nextSpeedStep(speed: number, fps = framesPerSec(speed)) {
  if (speed >= 100) return null
  let lo = speed, hi = 100
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (framesPerSec(m) > fps) hi = m; else lo = m }
  return { speed: hi, harvestsPerSec: framesPerSec(hi) / 9 }
}

export type Buy = { f: number; kind: 'value' | 'speed'; cost: number; away: number; active: number; seeds: number; what: string }
/** Gold upgrades for each farmer (value ActorEvents_61 † @12436234, speed ActorEvents_63 † @12609227), priced by re-running
 *  the Tilling formulas on the save with that one level bought. Value: FarmingExpGiven += 1 + ⌊L/3⌋/10 + ⌊L/10⌋/2,
 *  SeedsGiven += 0.05, cost ×1.1. Speed (only below lv 81): FarmingAnimationSpeed ×(1 + 8/(1 + ⌊L/4⌋/3)/100), SeedsGiven += 0.07,
 *  cost ×1.12. Ranked by away Tilling XP per second gained per gold. */
export function goldBuys(s: Save, awayPct: number): Buy[] {
  const away0 = awayTillingPerSecond(s, awayPct), act0 = activeTilling(s).xpPerSec, seeds0 = farmers(s, awayPct).reduce((t, x) => t + x.seedsPerHarvest * x.harvestsPerSec, 0)
  const set = (k: string, f: number, v: number) => arr(s, k).map((x, i) => (i === f ? v : x))
  const buys: Buy[] = []
  for (let f = 1; f <= FARMERS; f++) {
    const L1 = n(arr(s, 'FarmerLV1')[f]), L2 = n(arr(s, 'FarmerLV2')[f]), given = n(arr(s, 'SeedsGiven')[f])
    if (!L1) continue
    const opts: [Buy['kind'], number, Save, string][] = [['value', n(arr(s, 'FarmerValueCost')[f]), {
      ...s, FarmerLV1: set('FarmerLV1', f, L1 + 1), SeedsGiven: set('SeedsGiven', f, given + 0.05),
      FarmingExpGiven: set('FarmingExpGiven', f, n(arr(s, 'FarmingExpGiven')[f]) + 1 + Math.floor(L1 / 3) / 10 + Math.floor(L1 / 10) / 2),
    }, `value lv ${L1} → ${L1 + 1}`]]
    if (L2 < 81) opts.push(['speed', n(arr(s, 'FarmerSpeedCost')[f]), {
      ...s, FarmerLV2: set('FarmerLV2', f, L2 + 1), SeedsGiven: set('SeedsGiven', f, given + 0.07),
      FarmingAnimationSpeed: set('FarmingAnimationSpeed', f, n(arr(s, 'FarmingAnimationSpeed')[f]) * (1 + 8 / (1 + Math.floor(L2 / 4) / 3) / 100)),
    }, `speed lv ${L2} → ${L2 + 1}`])
    for (const [kind, cost, t, what] of opts) buys.push({
      f, kind, cost, what, away: awayTillingPerSecond(t, awayPct) - away0, active: activeTilling(t).xpPerSec - act0,
      seeds: farmers(t, awayPct).reduce((x, y) => x + y.seedsPerHarvest * y.harvestsPerSec, 0) - seeds0,
    })
  }
  return buys.sort((a, b) => b.away / b.cost - a.away / a.cost)
}

/** Plot upgrades (ActorEvents_1126 † @3354637), bought with crops for plot p: small = 25p·1.1^lv Dirt; medium =
 *  600p·1.13^lv Packed Clay + 1000p·1.13^lv Dirt; large = 4000(19 − M)p·1.15^lv of crop M (MysteryFarmingResourceCostCurrency)
 *  + 8000p·1.16^lv Packed Clay. They raise rank EXP: on screen every 200 ms († @23541214) PlantexpRANK += (0.1·small +
 *  0.6·medium + 3·large) × (1 + EbonusThree[6]/100) × (1 + min(round(10·smith item 79^0.88)/100, 40)); away credit is the
 *  same per credited second († @23491609). At PlantexpRANKreq the plot ranks up (PlantLevel + 1, req × (7.3 − 0.3p)) up to
 *  rank 7, then each fill is an overlevel (OverLevels[p] + 1, req × (1 + overlevel/10)) († @23537000). */
export function plots(s: Save) {
  const lv = (k: string, p: number) => n(arr(s, k)[p]), M = n(s.MysteryFarmingResourceCostCurrency)
  const s79 = n(arr(s, 'SmithingItemLevel')[79])
  const mult = (1 + equipmentBonuses(s).three[6]! / 100) * (1 + Math.min(Math.round(10 * Math.pow(s79, 0.88)) / 100, 40))
  const out = []
  for (let p = 1; p <= FARMERS; p++) {
    if (!n(arr(s, 'FarmerLV1')[p])) continue
    const sm = lv('PlantPlotSMALLlv', p), md = lv('PlantPlotMEDlv', p), lg = lv('PlantPlotLARGElv', p)
    const perSec = 5 * (0.1 * sm + 0.6 * md + 3 * lg) * mult, rank = lv('PlantexpRANK', p), req = lv('PlantexpRANKreq', p)
    out.push({
      p, crop: n(arr(s, 'PlantType')[p]), rank: lv('PlantLevel', p), over: lv('OverLevels', p), progress: req ? rank / req : 0,
      perSec, toNext: perSec > 0 ? Math.max(0, req - rank) / perSec : Infinity,
      small: { lv: sm, gain: 0.5 * mult, cost: [[1, 25 * p * 1.1 ** sm]] as [number, number][] },
      medium: { lv: md, gain: 3 * mult, cost: [[11, 600 * p * 1.13 ** md], [1, 1000 * p * 1.13 ** md]] as [number, number][] },
      large: { lv: lg, gain: 15 * mult, cost: [[M, 4000 * (18 - M + 1) * p * 1.15 ** lg], [11, 8000 * p * 1.16 ** lg]] as [number, number][] },
    })
  }
  return out
}

// ---- Which crop each plot should grow (the author, 2026-10-11) ---------------------------------------------------------------------
/** Highest crop the plot's + button can reach: PlantType < 5·ConstructLV[14] + 5·ConstructLV[29] + 20 (+ button, ActorEvents_210 † @7382207), so crops
 *  21-40 (the dark-mode crops) open 5 per level of Construction buildings 14 and 29. */
export const cropCap = (s: Save) => 5 * n(arr(s, 'ConstructLV')[14]) + 5 * n(arr(s, 'ConstructLV')[29]) + 20
/** Tilling level the + button needs to step plot p from crop T to T + 1: 5T + 5·max(T − 19, 0) + (p − 1)(2 + 3⌊T/20⌋)
 *  († @7382820); on reaching a new high it raises PlantTypeMAX[p] († @7385322). The − button (ActorEvents_212) steps down for free († @7404487). */
export const cropUnlockLevel = (T: number, p: number) => 5 * T + 5 * Math.max(T - 19, 0) + (p - 1) * (2 + 3 * Math.floor(T / 20))
/** Crops plot p can be set to now: 1..max(PlantTypeMAX[p], the highest the + button reaches at your Tilling level). Clicking a crop
 *  in the Tilling crop list sets it on every plot whose PlantTypeMAX is at least that crop (ActorEvents_1104 † @3228090).
 *  ponytail: past 20 the list icon only reaches dark-mode crops in dark mode (+20·DarkModeEnabled[0]); the + button covers it. */
export function maxCrop(s: Save, p: number) {
  const lv = n(s.FarmingLV), cap = cropCap(s)
  let T = 1
  while (T < cap && lv >= cropUnlockLevel(T, p)) T++
  return { max: Math.max(T, Math.min(n(arr(s, 'PlantTypeMAX')[p]), cap)), byLevel: T, unlocked: n(arr(s, 'PlantTypeMAX')[p]) }
}

/** The next level of the potion in each cauldron (1-6) and what it costs. Discovery brews (types 108-119) have no level price. */
export function potionNeeds(s: Save) {
  const out = []
  for (let c = 1; c <= 6; c++) {
    const T = n(arr(s, 'PotionType')[c])
    if (!T || (T >= 108 && T <= 119)) continue
    out.push({ c, T, L: n(arr(s, 'PotionLV')[T - 1]), brew: Math.min(n(arr(s, 'PotionEXP')[T]) / Math.max(n(arr(s, 'PotionEXPreq')[T]), 1), 1), /* progress lives at [T], the level at [T - 1] (Potions.vue) */ levels: potionLevelsPerPay(s, c), free: Math.min(15 * n(arr(s, 'ShrineLevels')[3]), 1000) / 1000, ...potionLevelCost(s, T, c) })
  }
  return out
}

type Need = ReturnType<typeof potionNeeds>[number]
export type CropStep = { plan: number[]; secs: number; pays: (Need & { at: number })[] }
/** What each plot should grow, as a sequence. Objective (say it on the page): the soonest time you hold the crops for the next
 *  level of every potion in your cauldrons. Each step takes the plot setup that minimises the time until every crop still short
 *  is covered (ties: the smaller total; a plot nothing is short of keeps its crop), runs it until the first potion's crops are
 *  held, pays that, and re-plans; consecutive steps with the same setup merge. Rates are crops per real second away at awayPct
 *  (farmers().awayCropsPerSec, the model behind the Crops table), so with a different setup only SeedsGivenBONUS is re-run.
 *  ponytail: the "owned crops" yield terms are held at today's stock, and payments assume the brew's EXP is full when the crops are. */
export function cropPlan(s: Save, awayPct: number, maxSteps = 12) {
  const rows = farmers(s, awayPct), fixed = seedsFixed(s), cur = arr(s, 'PlantType').map(n)
  const base = rows.map((r) => ({ f: r.f, k: r.awayCropsPerSec / (n(arr(s, 'SeedsGivenBONUS')[r.f]) || 1), max: maxCrop(s, r.f).max }))
  const rates = (plan: number[]) => {
    const b = seedsGivenBonus(s, plan, fixed), r: number[] = []
    for (const x of base) r[plan[x.f]!] = (r[plan[x.f]!] ?? 0) + x.k * b[x.f]!
    return r
  }
  const held = arr(s, 'SeedsOwned').map(n)
  let todo = potionNeeds(s).filter((x) => x.crop > 0 && x.qty > 0).sort((a, b) => a.qty - b.qty)
  const steps: CropStep[] = []
  let plan = [...cur], clock = 0
  const ready: CropStep['pays'] = []
  const best = (short: Map<number, number>) => {
    const score = (p: number[]) => { const r = rates(p); let mx = 0, sum = 0; for (const [c, d] of short) { const t = d / (r[c] ?? 0); mx = Math.max(mx, t); sum += t } return [mx, sum] }
    const better = (a: number[], b: number[]) => a[0]! < b[0]! * (1 - 1e-9) || (a[0]! <= b[0]! * (1 + 1e-9) && a[1]! < b[1]! * (1 - 1e-9))
    const starts = [plan, ...[...short.keys()].map((c) => plan.map((x, f) => (base.some((b) => b.f === f && b.max >= c) ? c : x)))]
    let top = { p: plan, v: score(plan) }
    for (const st of starts) {
      let p = [...st], v = score(p), moved = true
      while (moved) {
        moved = false
        for (const b of base) for (const c of new Set([...short.keys(), cur[b.f]!])) {
          if (c > b.max || c === p[b.f]) continue
          const q = [...p]; q[b.f] = c
          const w = score(q)
          if (better(w, v)) { p = q; v = w; moved = true }
        }
      }
      if (better(v, top.v)) top = { p, v }
    }
    return top.p
  }
  for (let k = 0; k < maxSteps && todo.length; k++) {
    const pay = todo.filter((x, i) => held[x.crop]! >= todo.slice(0, i + 1).filter((y) => y.crop === x.crop).reduce((t, y) => t + y.qty, 0))
    let secs = 0
    if (!pay.length) {
      const short = new Map<number, number>()
      for (const x of todo) short.set(x.crop, (short.get(x.crop) ?? 0) + x.qty)
      for (const [c, d] of short) short.set(c, d - held[c]!)
      plan = best(short)
      const r = rates(plan), first = todo.map((x) => ({ x, t: (x.qty - held[x.crop]!) / (r[x.crop] ?? 0) })).sort((a, b) => a.t - b.t)[0]!
      if (!isFinite(first.t)) break
      secs = first.t
      for (let c = 1; c < r.length; c++) if (r[c]) held[c] = (held[c] ?? 0) + r[c]! * secs
      pay.push(first.x)
    }
    for (const x of pay) held[x.crop]! -= x.qty
    todo = todo.filter((x) => !pay.includes(x))
    clock += secs
    const last = steps.at(-1), paid = pay.map((x) => ({ ...x, at: clock }))
    if (!secs && !last) ready.push(...paid) // held already: no setup to run for it
    else if (last && (!secs || last.plan.join() === plan.join())) { last.secs += secs; last.pays.push(...paid) }
    else steps.push({ plan: [...plan], secs, pays: paid })
  }
  return { steps, ready, unreachable: todo, now: cur, needs: potionNeeds(s) }
}
