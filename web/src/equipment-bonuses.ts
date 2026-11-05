// Equipment Ebonus / EbonusThree and the smithing cost core — a bonus producer split out of load-bonuses.ts (refactor step 3, #66). Ported from the game's code and
// checked against a full save's stored values in load-bonuses.test.ts.
import equipment from './data/equipment.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

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

