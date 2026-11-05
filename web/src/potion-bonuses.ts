// Potion bonuses (Pbonus*) and brew speed — a bonus producer split out of load-bonuses.ts (refactor step 3, #66). Ported from the game's code and
// checked against a full save's stored values in load-bonuses.test.ts.
import catalog from './data/card-catalog.json'
import { cbonus, type Catalog } from './modules/cards/cards-calc'
import { equipmentBonuses, smithCostCore } from './equipment-bonuses'
import { masteryBonuses } from './mastery-bonuses'
import { tankBonuses } from './pet-lab'
import { vendingAt } from './modules/realm/realm'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** The potion bonuses (Pbonus*) the app needs, from the game's potion-bonus block. Most scale by potion 94 + vending 5.
 *  `link`: the deck equipped when the game ran the block (BaseDmg reads card flat HP), default the selected one.
 *  ponytail: 13 of 45 ported (those open pages read); add the rest from the same block when a page needs them. */
export function potionBonuses(save: Save, ebonusThree0 = 0, link?: number) {
  const P = (i: number) => n(arr(save, 'PotionLV')[i]), owned = (l: number) => Math.floor((499 + l) / 500)
  const si = (i: number) => Math.floor(n(arr(save, 'SmithingItemLevel')[i]))
  const S = 0.02 * P(94) + vendingAt(save, 5) / 100 + 1
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

/** PotionBrewSpeedBOOST[1] (potions scene init): the cauldron brew-speed multiplier. Cards: the Apothecary-linked deck (4). */
export function brewSpeedBoost(save: Save) {
  const sl = (i: number) => n(arr(save, 'SkillLevels')[i]), tp = (i: number) => n(arr(save, 'TrainingPerkLevels')[i])
  const v = (1 + potionBonuses(save).PotionSpeed / 100) * (1 + equipmentBonuses(save).three[14]! / 100)
    * (1 + n(cbonus(save, catalog as unknown as Catalog, 4).CbonusBrewSpeed) / 100) * masteryBonuses(save)[18]!
    * (1 + (12 * tp(6) + 25 * tp(10)) / 100) * (1 + (10 * sl(56)) / 100) * (1 + (8 * n(arr(save, 'AscentionLevel')[59])) / 100)
    * tankBonuses(save)[22] * (1 + (Math.pow(0.4 * sl(66), 0.6) * (n(save.ApothecaryLV) / 3)) / 125)
  return Math.max(v, 1)
}

