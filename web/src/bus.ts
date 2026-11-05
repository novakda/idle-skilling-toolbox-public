// The bonus bus (refactor step 4, #67): every cross-system bonus value the app computes, one import for all callers.
// Producers live in their own modules (step 3, #66); in the game's order, each may read the ones above it:
//   realm vending (realm.ts) → equipment (equipment-bonuses.ts) → cards (cards-calc.ts) → mastery (mastery-bonuses.ts)
//   → potions (potion-bonuses.ts) → pet lab tanks (pet-lab.ts) → ascend rewards (ascend-rewards.ts).
// Each producer here is memoised per save object: saves are never mutated in place (what-ifs spread a copy), so a save's
// bonuses never change. Results are frozen so a caller that mutates one fails loudly instead of corrupting the cache.
// ponytail: no state(save) yet (the proposal's decoded-levels tier); add it when a module needs levels from another.
import * as eq from './equipment-bonuses'
import * as ma from './mastery-bonuses'
import * as po from './potion-bonuses'
import * as pl from './pet-lab'
import * as ar from './ascend-rewards'

type Save = Record<string, unknown>
const freeze = <T>(v: T): T => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) freeze(x) }
  return v
}
/** Memoise f per save object; calls with extra arguments or no save go straight through. */
function memo<R>(f: (save: Save, ...rest: any[]) => R) {
  const cache = new WeakMap<Save, R>()
  return (save: Save, ...rest: any[]): R => {
    if (rest.some((x) => x !== undefined) || !save || typeof save !== 'object') return f(save, ...rest)
    if (!cache.has(save)) cache.set(save, freeze(f(save)))
    return cache.get(save)!
  }
}

export const equipmentBonuses = memo(eq.equipmentBonuses)
export const smithCostCore = memo(eq.smithCostCore)
export const masteryPerkAmounts = memo(ma.masteryPerkAmounts)
export const masteryBonuses = memo(ma.masteryBonuses)
export const potionBonuses = memo(po.potionBonuses) as typeof po.potionBonuses
export const brewSpeedBoost = memo(po.brewSpeedBoost)
export const tankBonuses = memo(pl.tankBonuses)
export const capsuleExpRate = memo(pl.capsuleExpRate)
export const ascensionRewards = memo(ar.ascensionRewards)
export const ascendGain = memo(ar.ascendGain)
export { vendingAt } from './modules/realm/realm'
