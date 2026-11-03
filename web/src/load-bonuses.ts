// Values the game computes at load (absent from Steam Cloud saves), ported from its code and checked against a full
// save's stored values in load-bonuses.test.ts. Tracking: GitHub issues #1-#4.
import mastery from './data/mastery.json'
import equipment from './data/equipment.json'
import lab from './data/lab.json'
import catalog from './data/card-catalog.json'
import { cbonus, type Catalog } from './cards-calc'
import { current } from './screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

// Bonus types that multiply; the rest add (SceneEvents_49 periodic loop).
const MULTIPLY = new Set([1, 2, 3, 4, 5, 7, 8, 9, 10, 18, 19, 20, 30, 31, 32])
const POT128 = new Set([1, 2, 3, 6, 7, 8, 9, 10, 14, 30]) // perk types potion 128 scales (two loops in the game, same factor)

/** Per-level amount of each mastery perk as the game applies it. The mastery scene's init scales perks 1-125
 *  (@29831400-29832200): types 1/3/6/14 and 2/7/8/9/10/30 by 1 + 2.5·P128/(P128 + 175) (potion 128), then every one by
 *  Realm vending item 7. */
export function masteryPerkAmounts(save: Save): number[] {
  const T = mastery.type as number[]
  const P128 = n(arr(save, 'PotionLV')[128]), pot = 1 + 2.5 * P128 / (P128 + 175), v7 = 1 + vendingBonus(save, 7) / 100
  return (mastery.bonusAmount as number[]).map((a, t) => t < 1 || t > 125 ? a
    : (POT128.has(n(T[t])) ? n(a) * pot : n(a)) * v7)
}

/** MasteryBonuses[0..38]: from unlocked mastery perks (index = bonus type, see mastery.json names). */
export function masteryBonuses(save: Save): number[] {
  const T = mastery.type as number[], u = (i: number) => n(arr(save, 'MasteryPerksUnlocked')[i])
  const A = masteryPerkAmounts(save)
  const m = Array<number>(39).fill(1)
  for (let t = 1; t <= 200; t++) {
    const ty = n(T[t]), a = n(A[t])
    m[ty] = MULTIPLY.has(ty) ? m[ty]! * (1 + (a * u(t)) / 100) : m[ty]! + (a * u(t)) / 100
  }
  m[2]! *= 1 + (n(A[35]) * u(35)) / 100
  m[1]! *= 1 + (n(A[20]) * u(20)) / 100
  m[1]! *= 1 + (n(A[43]) * n(save.HatcheryLV) * u(43)) / 100
  return m
}

/** Realm vending item bonus (MinionInfo "VendingBonus"); items 5-8 share this curve. 5 scales potion bonuses, 8 lab tanks. */
export const vendingBonus = (save: Save, item: number) => {
  const v = n((save.RealmStuff as any[] | undefined)?.[8]?.[item])
  return Math.round(((100 * v) / Math.max(1, v + 25)) * 10) / 10
}

/** The potion bonuses (Pbonus*) the app needs, from the game's potion-bonus block. Most scale by potion 94 + vending 5.
 *  `link`: the deck equipped when the game ran the block (BaseDmg reads card flat HP), default the selected one.
 *  ponytail: 13 of 45 ported (those open pages read); add the rest from the same block when a page needs them. */
export function potionBonuses(save: Save, ebonusThree0 = 0, link?: number) {
  const P = (i: number) => n(arr(save, 'PotionLV')[i]), owned = (l: number) => Math.floor((499 + l) / 500)
  const si = (i: number) => Math.floor(n(arr(save, 'SmithingItemLevel')[i]))
  const S = 0.02 * P(94) + vendingBonus(save, 5) / 100 + 1
  return {
    PotionSpeed: 5 * P(24),
    FlowerSpeed: (3 * P(77) * n(save.HerbloreLV) + Math.min(2 * P(71), 200) * n(arr(save, 'SmithingItemLevel')[35]) + 40 * P(46) + 10 * P(20) + 4 * P(4)) * S,
    FlowersGiven: (5 * P(11) + 15 * P(36) + 50 * P(53)) * S,
    Overgrowth: (5 * P(14) + 30 * P(40) + 100 * P(61)) * S,
    // The Botany scene's own copy (what harvests use) skips the vending term; NewFlowerPot121 (scratch, 0) dropped.
    ExoticFlower: (10 * P(17) + 40 * P(49)) * (1 + 0.02 * P(94)) * (1 + ebonusThree0 / 100),
    BonusAP: 10 * P(57) * S,
    // Starting cash after an ascend (% of the gold you ascended with; see ascend.ts startGold).
    StartingCash: (5 * owned(P(45)) + 0.5 * P(45)) * S,
    MaxHP: 30 * P(66) * S,
    MaxFlowerSpeedUpgrades: (Math.floor(P(32) / 3 + 1) * owned(P(32)) + Math.floor(P(58) / 2 + 1) * owned(P(58))) * S,
    // Flat base damage: potions 6/34/62, and potion 67 turns 2%/lv of smith-item and card/equipment flat HP into damage.
    BaseDmg: (400 * P(6) + 1500 * P(34) + 4e3 * P(62) + (2 * P(67) / 100) * (10 * si(6) + 50 * si(22) + 350 * si(46) + 1e3 * si(62)
      + n(cbonus(save, catalog as unknown as Catalog, link).CbonusBaseHpFLAT) + n(equipmentBonuses(save).scalar.EbonusBaseHpFLAT))) * S,
    // Smithing cost multiplier. The smithing scene writes its own copy at init (smithTotalCostRedux() in smithing.ts).
    SmithTotalCostRedux: smithCostCore(save) / S,
    // Tilling (SceneEvents_37 potion block, Qno2x.js @25982700 / @25997600): crop yield %, and Tilling EXP % compounded per dark
    // crop owned (SeedsOwned[21..40] > 2) by potion 123. The Tilling scene's draw redoes TillingExp without the vending term
    // and with 2 for 1.7 (tillingSpeedBoost in tilling.ts); the per-harvest bonuses read this copy.
    Crops: (3 * P(3) + 12 * P(33) + 50 * P(59) + 0.5 * P(74) * n(save.FarmingLV)) * S,
    TillingExp: (10 * P(22) + 0.45 * P(52) * n(save.FarmingLV)) * S
      * Math.pow(1 + (1.7 * P(123)) / (P(123) + 175), arr(save, 'SeedsOwned').slice(21, 41).filter((q) => n(q) > 2).length),
    // Rift EXP (same block @25983925): 8%/level of potion 38 (Riftion).
    RiftExp: 8 * P(38) * S,
    // Spiriting luck-level cap above 81 (same block @26007200 †): ⌊P78 + P78/5⌋ scaled, plus 20 per level of building 6.
    LimboLuck: Math.floor(P(78) + P(78) / 5) * S + 20 * n(arr(save, 'ConstructLV')[6]),
    SmithingScalingRedux: (Math.min(Math.floor(25 * P(42)) / 1e3, 2.5) + Math.min(Math.floor(30 * P(68)) / 1e3, 2.5) + Math.min(Math.floor(40 * P(81)) / 1e3, 3)
      + Math.min(Math.floor(6e-4 * n(arr(save, 'AscentionLevel')[34]) * Math.max(n(save.waterLV) - 100, 0)), 5) + Math.min(Math.floor(80 * P(85)) / 1e3, 4.7)) * S,
  }
}

/** Smithing cost reduction shared by both PbonusSmithTotalCostRedux copies: potions 7/28/55/90 (90 per level of smith item 19, max 25). */
export function smithCostCore(save: Save) {
  const P = (i: number) => n(arr(save, 'PotionLV')[i])
  return (1 - Math.min(0.0025 * P(7), 0.9)) * (1 - Math.min(0.005 * P(28), 0.95)) * (1 - Math.min(0.01 * P(55), 0.98))
    * Math.pow(1 - Math.min(0.001 * P(90), 0.98), Math.min(n(arr(save, 'SmithingItemLevel')[19]), 25))
}

type Item = { t1: string; v1: number; t2: string; v2: number; t3: string; k: number }
// EbonusThree slot per stat type (CalculatePrimStatsTotalsGLOBAL); other types go to scalar Ebonus<type>.
const THREE: Record<string, number> = { NewFlower: 0, BotanySpd: 1, FlowerPotEXP: 2, FlowerGain: 3, CropGain: 4, TillEXPgain: 5, CropLandGain: 6,
  AsylumGain: 7, NestSpd: 8, NewPets: 9, Vessels: 10, ResearchExp: 11, TrekkingSpd: 12, PetDamage: 13, BrewSpd: 14, SpelunkerSpd: 15, SpelunkerLearn: 16 }

// Stat types whose scalar key isn't Ebonus<type>.
const RENAME: Record<string, string> = { Poison: 'PoisonDMG', Claw: 'ClawDMG', Meteor: 'MeteorDMG', Smite: 'SmiteDMG', Fishing: 'FishingPCT', ShieldRech: 'ShieldRecharge', Energy: 'EnergyMAX' }

/** Equipment stat totals: EbonusThree[0..16] plus scalar values keyed by save name (e.g. EbonusCardChance). */
export function equipmentBonuses(save: Save) {
  const three = Array<number>(17).fill(0), scalar: Record<string, number> = {}
  const shrine = 1 + n(arr(save, 'ShrineLevels')[2]) / 100
  for (const id of arr(save, 'EquipmentEquipped').map(n)) {
    const it = (equipment as Record<string, Item>)[id]
    if (!it) continue
    const pct = 1 + n(arr(save, 'EquipmentBonusPct')[id]) / 100
    const third = it.k * Math.floor((99 + n(arr(save, 'TinkerThirdLine')[id])) / 100)
    for (const [t, v] of [[it.t1, it.v1], [it.t2, it.v2], [it.t3, third]] as [string, number][]) {
      const x = v * pct * shrine
      if (t in THREE) three[THREE[t]!]! += x
      else { const key = `Ebonus${RENAME[t] ?? t}`; scalar[key] = (scalar[key] ?? 0) + x }
    }
  }
  return { three, scalar }
}

/** Lab tank part P[i] (SceneEvents_45): (min(lv,1) + 198*lv/(lv+1000)) * scale/100, lv = TankLVs[3*(tank-1)+slot]. */
function tankPart(save: Save, i: number) {
  const p = (lab.parts as unknown as Record<string, [number, number, number]>)[i]
  if (!p) return 0
  const lv = n(arr(save, 'TankLVs')[3 * (p[0] - 1) + p[1]])
  return ((Math.min(lv, 1) + (198 * lv) / (lv + 1000)) * p[2]) / 100
}

/** TankBonusLIST[45], the capsule away-time multiplier (SceneEvents_45 per-second block @28489765 †):
 *  (1 + P24/100) × _PetPassiveBonusLIST[20] × vend8, where [20] = 1 + (BA44·cap44 + BA72·cap72 + BA77·cap77)/100
 *  (Highness, Entertainer, Emigdala "% capsule exp rate", @28435211 †; they add, not multiply). The lab init multiplies
 *  _CapsuleEXPbonus by it (@28198970 †); the on-screen capsule tick (+0.5 per 500 ms, @28923701 †) and the level-up check
 *  (@28924421 †) don't read it. `known` is false when lab.json lacks part 24. */
export function capsuleExpRate(save: Save) {
  const BA = lab.petBuff as number[], cap = (i: number) => n(arr(save, 'PetCapsuleLV')[i])
  const pets = [44, 72, 77].map((id) => ({ id, pct: n(BA[id]) * cap(id) }))
  const part = 1 + tankPart(save, 24) / 100, pet = 1 + pets.reduce((s, p) => s + p.pct, 0) / 100, vend = 1 + vendingBonus(save, 8) / 100
  return { part, pets, pet, vend, value: part * pet * vend, known: !!(lab.parts as Record<string, unknown>)[24] }
}

/** TankBonusLIST entries the app needs ([11] Botany speed, [22] brew speed, [27] chain chance, [31]/[48] Tilling crops, [45] capsule away rate, [52] pet HP), rebuilt every second in SceneEvents_45.
 *  ponytail: 7 of ~55 indices ported (each has its own formula in the same block); add others when a page reads them. */
export function tankBonuses(save: Save) {
  const P = (i: number) => tankPart(save, i), BA = lab.petBuff as number[], cap = (i: number) => n(arr(save, 'PetCapsuleLV')[i])
  const pet5 = [74, 28, 19].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 150), 1) // brew-speed pet passives
  const pet28 = (1 + (n(BA[32]) * cap(32)) / 100) * (1 + (n(BA[20]) * cap(20)) / 100)
  const vend8 = 1 + vendingBonus(save, 8) / 100 // Toothpaste Tube boosts tanks 1-55
  return {
    11: (1 + P(94) / 100) * pet28 * vend8,
    22: (1 + (P(33) / 100) * n(save.ResearchLV)) * pet5 * (1 + P(63) / 100) * (1 + P(74) / 100) * (1 + P(101) / 100) * (1 + P(112) / 100) * vend8,
    // Tilling crop yield (SceneEvents_45 @28481689, pet passives 38/31/14 = _PetPassiveBonusLIST[27] @~28416000) and the
    // per-crop-overlevel % (@28491127).
    31: (1 + P(67) / 100) * [38, 31, 14].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1) * (1 + P(75) / 100) * (1 + P(123) / 100)
      * (1 + (n(arr(save, 'AscentionLevel')[38]) * Math.pow(n(arr(save, 'TankLVs')[55]), 0.4)) / 100) * vend8,
    // Chain LV chance (@28478832): parts 62/120/128/134 + _PetPassiveBonusLIST[15] (pet passives 25/7/81, @28430712).
    27: (P(62) + P(120) + P(128) + P(134) + [25, 7, 81].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1)) * vend8,
    45: capsuleExpRate(save).value,
    48: P(38) * vend8,
    // Pet passives 76, 40, 1 (_PetPassiveBonusLIST[26]): multiplies PetHPtot.
    52: [76, 40, 1].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1),
  }
}

/** PotionBrewSpeedBOOST[1] (potions scene init): the cauldron brew-speed multiplier. Cards: the Apothecary-linked deck (4). */
export function brewSpeedBoost(save: Save) {
  const sl = (i: number) => n(arr(save, 'SkillLevels')[i]), tp = (i: number) => n(arr(save, 'TrainingPerkLevels')[i])
  const v = (1 + potionBonuses(save).PotionSpeed / 100) * (1 + equipmentBonuses(save).three[14]! / 100)
    * (1 + n(cbonus(save, catalog as unknown as Catalog, 4).CbonusBrewSpeed) / 100) * masteryBonuses(save)[18]!
    * (1 + (12 * tp(6) + 25 * tp(10)) / 100) * (1 + (10 * sl(56)) / 100) * (1 + (8 * n(arr(save, 'AscentionLevel')[59])) / 100)
    * tankBonuses(save)[22] * (1 + (Math.pow(0.4 * sl(66), 0.6) * (n(save.ApothecaryLV) / 3)) / 125)
  return Math.max(v, 1)
}

/** What ascending (AP) and rebirthing (BP) would award now, per source (ActorEvents_604). Index 0 unused. */
export function ascensionRewards(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i])
  const ap = (k: number, x: number) => Math.floor(Math.max(Math.pow(k * Math.max(0, Math.log(Math.max(1, x + 1)) - 6), 2.3) / 100, 0))
  const AP = [0, ap(7, n(save.totalKills)), ap(5, n(save.totalreps)), ap(3, n(save.OresMined)), ap(4, n(save.TotalFishCaught)),
    Math.floor(Math.max(Math.pow(Math.max(0, Math.log(Math.max(1, n(save.totalSkillLV) + 1) / 20)), 3.2), 0))]
  // BP 1: crop/plant overlevels + plant levels + pot ranks; 2: highest flower owned; 3: seeds (weighted by seed tier^5);
  // 4: unspent AP; 5: furthest map progress; 6: smithing + cards + event upgrade.
  let farm = 0
  for (let i = 1; i <= 8; i++) farm += 2.3 * a('OverLevels', i) + 1.2 * a('PlantLevel', i) ** 0.8
  for (let i = 1; i <= 14; i++) farm += 1.2 * a('OverLevels', i + 8) + 0.8 * a('HerblorePotLevel', i) ** 0.7
  let topFlower = 0
  for (let i = 1; i <= 24; i++) if (a('flowersOwned', i) > 0.9) topFlower = i
  let seeds = 0
  for (let i = 1; i <= 20; i++) seeds += a('SeedsOwned', i) * i ** 5
  const F = (i: number) => a('FurthestMapleLV', i), fights = n(save.fightsunlocked)
  let map = fights === 5 ? Math.min(0.5 * F(5), 26) : 0
  if (n(save.HellKeyGot) === 1)
    map = fights === 15 ? Math.min(20 * F(15) + 650, 5000) : fights === 14 ? Math.min(5 * F(14) + 350, 650)
      : fights === 13 ? Math.min(3 * F(13) + 180, 350) : fights === 12 ? Math.min(2 * F(12) + 70, 180) : Math.min(0.8 * F(11) + 26, 70)
  const BP = [0, Math.min(farm ** 1.375 + farm, 1250), Math.min(topFlower ** 2, 1500),
    Math.max(0, Math.min((0.43 * Math.log(Math.abs(seeds ** 0.8) + 1)) ** 2, 750)) || 0,
    Math.min(0.1 * (0.43 * Math.log(Math.abs(n(save.APtoSpend)) + 1)) ** 4.25, 1500), map,
    Math.min(Math.round((8 * a('SmithingItemLevel', 70) ** 0.8) / 8), 1000) + Math.min(n(cbonus(save, catalog as unknown as Catalog).CbonusBPgainMisc), 250) + 2 * a('EventUpgradeLevels', 6)]
  return { AP, BP }
}

/** What ascending / rebirthing would pay right now (the game's APreward/BPreward × multipliers, Qno2x.js award handlers
 *  @12469725 / @12480775 — see issue #10), plus how long this run has taken. Stored TankBonusLIST / MasteryBonuses /
 *  Cbonus values are used when the save has them (local saves), else computed (cloud saves). */
export function ascendGain(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i])
  // ponytail: tankBonuses() only ports [11] and [22], so a cloud save (no stored TankBonusLIST) counts tanks 19/32 as 1;
  // port those two when cloud-save ascend numbers matter.
  const tank: Record<number, number> = arr(save, 'TankBonusLIST').length ? arr(save, 'TankBonusLIST').map(n) : tankBonuses(save)
  const mast = current(save, 'MasteryBonuses', () => masteryBonuses(save)).map(n)
  const cb = (k: string) => (typeof save[`Cbonus${k}`] === 'number' ? n(save[`Cbonus${k}`]) : n(cbonus(save, catalog as unknown as Catalog)[`Cbonus${k}`]))
  const { AP, BP } = ascensionRewards(save)
  const rift = a('RiftLVL', 8), riftPro = a('RiftProLvs', 8), secret2 = a('SecretEarned', 2)
  const M = 1 + Math.floor(20 * Math.min(rift, 1) + 5 * rift + 4 * a('SkillLevels', 37)) / 100
  const apMulti = (1 + 0.02 * a('SmithingItemLevel', 59) + 0.42 * secret2 + 0.02 * a('SmithingItemLevel', 35) * secret2) * M
    * (1 + n(save.MTXdoubleAP)) * (1 + potionBonuses(save).BonusAP / 100) * (1 + (10 * a('AscentionLevel', 60)) / 100)
    * (1 + (5 * a('EventUpgradeLevels', 4)) / 100) * (1 + cb('AP') / 100) * n(mast[31] ?? 1) * n(tank[19] ?? 1)
  const bpMulti = (1 + n(save.MTXdoubleBP)) * (1 + ((250 * rift) / (rift + 200)) * ((2 * riftPro) / (riftPro + 100)) / 100)
    * (1 + (3 * a('ContractRank', 50)) / 100) * (1 + Math.ceil(a('AscentionLevel', 64) / 100)) * (1 + (2 * a('TrainingPerkLevels', 11)) / 100)
    * n(tank[32] ?? 1) * (1 + (1.5 * a('SkillLevels', 65)) / 100) * n(mast[32] ?? 1)
  const apBase = AP.reduce((s, v) => s + v, 0), bpBase = BP.reduce((s, v) => s + Math.round(v), 0)
  // TimeSinceAscention2 is zeroed only by a rebirth (scene 22, APmenuSelected 2) and ticks with TimeSinceAscention,
  // so it is the rebirth cycle's clock; BP accrues over the whole cycle.
  const hours = n(save.TimeSinceAscention) / 3600, rebirthHours = n(save.TimeSinceAscention2) / 3600
  return { AP, BP, apBase, apMulti, ap: apBase * apMulti, bpBase, bpMulti, bp: bpBase * bpMulti, hours, rebirthHours }
}
