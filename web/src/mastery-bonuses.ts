// MasteryBonuses — a bonus producer split out of load-bonuses.ts (refactor step 3, #66). Ported from the game's code and
// checked against a full save's stored values in load-bonuses.test.ts.
import mastery from './data/mastery.json'
import { vendingAt } from './modules/realm/realm'

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
  const P128 = n(arr(save, 'PotionLV')[128]), pot = 1 + 2.5 * P128 / (P128 + 175), v7 = 1 + vendingAt(save, 7) / 100
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
