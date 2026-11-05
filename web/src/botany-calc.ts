// Botany (scene Farming16, save keys Herblore*): 14 pots indexed 1-14. Everything here is read from the save or
// ported from the game code (upgrade handlers + the scene's init), so it works from a Steam Cloud save.
// Not here: absolute growth times and flowers/hour. Those need HerbloreSpeedBOOST / HerbloreFlowerBOOST, which the
// game builds at scene load from MasteryBonuses, TankBonusLIST and EbonusThree (not in cloud saves, not ported yet).
import { cbonus, type Catalog } from './cards-calc'
import { equipmentBonuses, masteryBonuses, potionBonuses, tankBonuses } from './bus'
import catalog from './data/card-catalog.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
export const POTS = 14

/** Tier perks from the scene init: each pot at tier >= T adds to a global multiplier. */
export function tierPerks(save: Save) {
  const tiers = arr(save, 'HerblorePotLevel').slice(1, POTS + 1).map(n)
  const at = (t: number) => tiers.filter((x) => x >= t).length
  return {
    expBoost: 1 + 0.5 * at(3), // HerbloreExpBOOST base
    potSpeedFromLevels: at(4), // pots whose own speed boost counts their levels
    maxSpeedLv: 120 + 10 * at(5), // HerbloreMaxSpeedLV base (bonuses add more at load)
    flowerBoost: 1 + 0.3 * at(6), // HerbloreFlowerBOOST base
    speedBoost: 1 + 0.3 * at(8), // HerbloreSpeedBOOST base
  }
}

export function botanyPots(save: Save) {
  const L1 = arr(save, 'HerbloreLV1'), L2 = arr(save, 'HerbloreLV2'), tier = arr(save, 'HerblorePotLevel')
  const asc48 = n(arr(save, 'AscentionLevel')[48]), over = arr(save, 'OverLevels'), mush = n(save.MTXfriendlymushroomsOwned)
  return Array.from({ length: POTS }, (_, i) => {
    const p = i + 1, value = n(L1[p]), speed = n(L2[p])
    // HerbloreSpeedBOOST3[p] (scene init): pot-specific speed multiplier.
    let potSpeed = 1
    if (n(tier[p]) >= 4) potSpeed += 0.01 * speed + 0.01 * value
    if (mush >= p) potSpeed *= 3
    potSpeed *= 1 + (5 * asc48 * n(over[p + 8])) / 100
    return {
      pot: p, tier: n(tier[p]), plant: n(arr(save, 'FlowerType')[p]), overgrowth: n(arr(save, 'HerbloreAnimationOVERGROWTH')[p]),
      value, speed, potSpeed,
      flowers: n(arr(save, 'FlowersGiven')[p]), exp: n(arr(save, 'FlowersExpGiven')[p]), anim: n(arr(save, 'HerbloreAnimationSpeed')[p]),
      // Value upgrade: +0.02 flowers, +EXP below, cost x1.1. Speed upgrade: anim speed x(1+8/(1+floor(L/4)/3)%), +0.02 flowers, cost x1.135.
      valueCost: n(arr(save, 'HerbloreValueCost')[p]), valueExpGain: 0.05 + Math.floor(value / 3) / 300 + Math.floor(value / 15) / 150,
      speedCost: n(arr(save, 'HerbloreSpeedCost')[p]), speedGainPct: 8 / (1 + Math.floor(speed / 4) / 3),
    }
  })
}

/** Speed upgrades are buyable while level < HerbloreMaxSpeedLV + 25 (upgrade handler, bundle ~12612600). The game builds
 *  the max at Botany scene init (~24245598): 120 + 10 per tier-5 pot + potions (Pot Enabler 32, More Fast 58, scaled by
 *  potion 94 + Realm vending 5) + CbonusMAXlBotanySpdUpgrades + perk SkillLevels[53] per 25 Tilling (FarmingLV) levels.
 *  The card term is read BEFORE the scene equips the Botany-linked deck (runLater 20 ms, ~24226081), so it's the
 *  MaxBotanySpdLV cards of whatever deck was on when you entered Botany. The save stores the result, so use it; `cards`
 *  is what that entry deck added. Without a stored value, assume the Botany-linked deck (link 3). */
export function speedCap(save: Save) {
  const potions = potionBonuses(save).MaxFlowerSpeedUpgrades
  const perk = n(arr(save, 'SkillLevels')[53]) * Math.floor(n(save.FarmingLV) / 25)
  const base = tierPerks(save).maxSpeedLv + potions + perk
  const max = save.HerbloreMaxSpeedLV != null ? n(save.HerbloreMaxSpeedLV)
    : base + n(cbonus(save, catalog as unknown as Catalog, 3).CbonusMAXlBotanySpdUpgrades)
  return { max, buyBelow: max + 25, potions, cards: +(max - base).toFixed(2), perk }
}

/** The only uncapped speed source (Botany level-up, ~24276853): roll r = 1..100 once, then for t = 0,1,2, if
 *  r < 240*L/(L+175) - 100t (L = Gray Drank, PotionLV[140]) every owned pot gets +1 Value and +1 Speed level, ignoring
 *  the cap. Returns the expected levels per Botany level-up. */
export function grayDrankPerLevelUp(save: Save) {
  const L = n(arr(save, 'PotionLV')[140]), x = (240 * L) / (L + 175)
  return [0, 1, 2].reduce((s, t) => s + Math.min(Math.max(Math.ceil(x - 100 * t) - 1, 0), 100) / 100, 0)
}

/** Global Botany multipliers from the scene init (HerbloreSpeedBOOST / HerbloreFlowerBOOST / HerbloreExpBOOST). Cards are
 *  the Botany-linked deck (3); pass `link` undefined to use the selected deck. */
export function botanyBoosts(save: Save, link: number | undefined = 3) {
  const t = tierPerks(save), pb = potionBonuses(save), eq = equipmentBonuses(save).three, cb = cbonus(save, catalog as unknown as Catalog, link)
  const P = (i: number) => n(arr(save, 'PotionLV')[i]), asc48 = n(arr(save, 'AscentionLevel')[48]), cap = (lv: number, k: number) => Math.min((k * lv) / (lv + 175), 1)
  const speed = t.speedBoost * (1 + pb.FlowerSpeed / 100) * (1 + eq[1]! / 100) * (1 + n(cb.CbonusBotanySpeed) / 100) * tankBonuses(save)[11]
    * (1 + Math.min(Math.round(10 * Math.pow(n(arr(save, 'SmithingItemLevel')[71]), 0.91)) / 100, 60))
  const pachi = 1 + ((40 * P(156)) / (P(156) + 175)) * Math.min(P(167), 1) * (n(save.PachiTixCollected) / 50) / 100
  let flower = t.flowerBoost * (1 + (eq[3]! * n(save.HerbloreLV)) / 100) * (1 + pb.FlowersGiven / 100) * masteryBonuses(save)[10]!
    // shrine 4: the on-screen refresh uses 20%/level (the scene init uses 5%)
    * (1 + (20 * n(arr(save, 'ShrineLevels')[4])) / 100) * (1 + (100 * (Math.pow(pachi, 1 + cap(P(167), 1.25)) - 1)) / 100)
  const c46 = n(arr(save, 'ConstructLV')[46])
  flower *= 1 + (100 * Math.pow(c46, 1.10128) * Math.pow(1.02, c46) * Math.max(n(save.waterLV) - 1000, 0)) / 100
  flower *= 1 + ((n(arr(save, 'OverLevels')[9]) / 18) * ((asc48 - 200) * Math.floor(asc48 / 200) * 5)) / 100
  for (let i = 0; i < 30; i++) if (n(arr(save, 'FishOwned')[i + 1]) > 1.001 * Math.pow(10, 21 + i)) flower *= 1 + cap(P(159), 1.15)
  const exp = t.expBoost * (1 + pb.Overgrowth / 100) * (1 + n(cb.CbonusBotanyExp) / 100)
  return { speed, flower, exp }
}

// Growth: on screen a 10 ms periodic adds 0.01*(1+tier/4)*HerbloreSpeedBOOST*AnimSpeed*potSpeed per tick; away time is
// credited on return as floor(AnimSpeed*6000)/100*(1+tier/4)*SpeedBOOST*potSpeed/60 per credited second (= the same
// per-tick amount at 100 ticks/s), where credited seconds = away seconds * away % (AFK tab).
// Ticks/s while watching: measured 99.98 live on the Botany screen (2026-10-02, 3 pots over 20 s).
export const BOTANY_TICKS_PER_SEC = 100
/** Overgrowth: a plant's bar runs from REQ*E^(OG-1) to REQ*E^OG; filling it adds an overgrowth level (more flowers/EXP
 *  per harvest). E = OverGrowthExponential = 5 - min(CbonusOGtimeALL/100 + 0.075*SkillLevels[60], 2.7) (Botany deck). */
export function overgrowthExponent(save: Save) {
  const cb = cbonus(save, catalog as unknown as Catalog, 3)
  return 5 - Math.min(n(cb.CbonusOGtimeALL) / 100 + 0.075 * n(arr(save, 'SkillLevels')[60]), 2.7)
}
export function botanyGrowth(save: Save, speedBoost: number, awayPct: number) {
  const anim = arr(save, 'HerbloreAnimationSpeed'), prog = arr(save, 'HerbloreAnimation'), req = arr(save, 'HerbloreAnimationREQ')
  const E = overgrowthExponent(save)
  return botanyPots(save).map((p) => {
    const perTick = 0.01 * (1 + p.tier / 4) * speedBoost * n(anim[p.pot]) * p.potSpeed
    const awayPerSec = ((Math.floor(n(anim[p.pot]) * 6000) / 100) * (1 + p.tier / 4) * speedBoost * p.potSpeed / 60) * (awayPct / 100)
    const R = n(req[p.pot]), now = n(prog[p.pot]), lo = p.overgrowth > 0 ? R * E ** (p.overgrowth - 1) : 0, hi = R * E ** p.overgrowth
    const left = Math.max(0, hi - now)
    return { pot: p.pot, progress: Math.min(1, Math.max(0, (now - lo) / Math.max(1, hi - lo))), watching: left / (perTick * BOTANY_TICKS_PER_SEC), away: left / awayPerSec }
  })
}

// ---- Per-harvest yield. A pot's flower/EXP/exotic bonuses are fixed at planting (FlowersGivenBONUS etc.), from the plant
// and how many seeds and flowers were fed: local saves store them; cloud saves don't (nor the fed amounts), so they're
// recomputed from the planted plant + fed amounts (game default 1000 each). Verified live 2026-10-02 (Grow All).
const PLANTING: [maxPlant: number, seedIdx: number, given: [number, number], exp: [number, number], exotic: [number, number]][] = [
  [1, 1, [1.23, 0], [1.26, 0], [1.2, 0]], // plant 1: seeds only
  [12, 1, [1.18, 1.21], [1.21, 1.25], [1.18, 1.3]],
  [Infinity, 11, [1.19, 1.25], [1.23, 1.3], [1.23, 1.35]],
]
const curve = (base: number, fed: number) => (base ? Math.pow(base, 0.43 * Math.log(Math.abs(fed) + 1)) : 1)
export function plantingBonuses(plant: number, seedsFed: number, flowersFed: number, pbonusExotic: number) {
  const [, , g, e, x] = PLANTING.find(([max]) => plant <= max)!
  return {
    flowers: curve(g[0], seedsFed) * curve(g[1], flowersFed),
    exp: curve(e[0], seedsFed) * curve(e[1], flowersFed),
    exotic: curve(x[0], seedsFed) * curve(x[1], flowersFed) * (1 + pbonusExotic / 100),
  }
}

/** Overgrowth multipliers per overgrowth level (scene init; cards = the Botany deck). */
export function overgrowthBonuses(save: Save, cb: Record<string, number>) {
  return {
    flowers: 2 + (n(cb.CbonusOGflowerR1) + n(arr(save, 'SkillLevels')[58])) / 100,
    exotic: 2.3 + (n(cb.CbonusOGexoticR1) + 5 * n(arr(save, 'ContractRank')[52])) / 100,
    exp: 2.2 + n(cb.CbonusOGexpR1) / 100,
  }
}

/** Base Botany EXP per plant type (HerbloreEXPforFlowerBase): literals to plant 24, then x1.2 per plant (SceneEvents_20). */
const EXP_BASE = [0, 1, 3, 5, 10, 20, 45, 80, 125, 200, 500, 1000, 1800, 3000, 6500, 12000, 20000, 45000, 80000, 150000, 250000, 450000, 800000, 1250000, 1500000]
export const plantExpBase = (plant: number) => (plant < EXP_BASE.length ? EXP_BASE[plant]! : EXP_BASE.at(-1)! * 1.2 ** (plant - EXP_BASE.length + 1))

/** Flowers and Botany EXP from harvesting each pot now (pot actor harvest code). `fed` overrides the planting amounts. */
export function botanyHarvest(save: Save, boosts: { flower: number; exp: number }, fed?: { seeds: number; flowers: number }) {
  const og = overgrowthBonuses(save, cbonus(save, catalog as unknown as Catalog, 3)), pb = potionBonuses(save)
  const stored = (k: string, p: number) => (save[k] as number[] | undefined)?.[p]
  return botanyPots(save).map((p) => {
    const plant = p.plant || n(arr(save, 'FlowerTypeSELECTED')[p.pot]) || 1
    const fedAmount = (k: string) => n(arr(save, k)[p.pot]) || 1000 // game default when the save doesn't say
    const calc = plantingBonuses(plant, fed?.seeds ?? fedAmount('HerbloreIngredient1qtyNumber'), fed?.flowers ?? fedAmount('HerbloreIngredient2qtyBase'), pb.ExoticFlower)
    const given = fed ? calc.flowers : stored('FlowersGivenBONUS', p.pot) ?? calc.flowers
    const expB = fed ? calc.exp : stored('FlowersExpGivenBONUS', p.pot) ?? calc.exp
    const lv = Math.max(p.overgrowth - 1, 0)
    return {
      pot: p.pot, plant, plantingStored: stored('FlowersGivenBONUS', p.pot) != null && !fed,
      flowers: (p.flowers * boosts.flower * given * og.flowers ** lv) / 2,
      exp: plantExpBase(plant) * p.exp * expB * boosts.exp * og.exp ** lv,
    }
  })
}
