// Tilling XP while away and while on screen. Split out of away.ts (refactor step 7, #70).
import { framesPerSec } from '../../anim'

const n = (v: unknown) => Number(v ?? 0) || 0
type A = Record<string, any>

/** Tilling away XP per real away second (own scene code): Σ owned farmers anim/10·(1+armor/40)·FarmingSpeedBOOST ×
 *  FarmingExpGiven·(0.25·round(armor/10)+1)·FarmingExpGivenBONUS × awayPct/100 × (1+TankBonusLIST[36]/100). No farmingChance
 *  roll, unlike active harvests. Verified live 2026-10-04: 224 s → +6.35e9 vs 6.0e9 predicted. */
export function awayTillingPerSecond(a: A, awayPct: number) {
  const arr = (k: string) => (a[k] as number[]) ?? []
  let s = 0
  for (let f = 1; f <= 8; f++) {
    if (!n(arr('FarmerLV1')[f])) continue
    const armor = n(arr('FarmerArmor')[f])
    s += (n(arr('FarmingAnimationSpeed')[f]) / 10) * (1 + armor / 40) * n(a.FarmingSpeedBOOST) * n(arr('FarmingExpGiven')[f]) * (0.25 * Math.round(armor / 10) + 1) * n(arr('FarmingExpGivenBONUS')[f])
  }
  return s * (awayPct / 100) * (1 + n(arr('TankBonusLIST')[36]) / 100)
}


/** Active Tilling (on screen): a 10 ms timer adds anim·(1+armor/40)·FarmingSpeedBOOST/100 to each farmer's counter, and each
 *  draw (60 fps) advances the farmer one frame if the counter is ≥ 1, then zeroes it (overflow lost). 9 frames per harvest; XP lands on
 *  randomInt(1,1000) ≤ farmingChance. So a farmer moves 60 frames/s at speed ≥ 100, 40 at 50–100 (2 of every 3 draws), and so on.
 *  Verified live 2026-10-04: 6.65 / 4.43 harvests/s per farmer, 3.03e6 XP/s. */
export function activeTilling(a: A, fps = 60) {
  const arr = (k: string) => (a[k] as number[]) ?? []
  let xp = 0
  const farmers: { harvestsPerSec: number; speed: number }[] = []
  for (let f = 1; f <= 8; f++) {
    if (!n(arr('FarmerLV1')[f])) continue
    const speed = n(arr('FarmingAnimationSpeed')[f]) * (1 + n(arr('FarmerArmor')[f]) / 40) * n(a.FarmingSpeedBOOST)
    const harvestsPerSec = framesPerSec(speed, fps) / 9
    farmers.push({ harvestsPerSec, speed })
    xp += harvestsPerSec * n(arr('FarmingExpGiven')[f]) * n(arr('FarmingExpGivenBONUS')[f])
  }
  return { xpPerSec: xp * n(a.farmingChance) / 1000, farmers }
}
