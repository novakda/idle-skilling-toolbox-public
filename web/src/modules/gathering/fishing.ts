// Fishing from a save (docs/resource-xp.md). Each active catch rolls r = randomInt(1,1000)/10: large if r < FishChanceLARGE,
// else medium if r < FishChanceMEDIUM, else small. MEDIUM is a cutoff, not a share, so the screen's medium/small odds are
// wrong (verified live 2026-10-04, 100/100 catches). Base XP per fish f, times ((100+power)/100)^0.7 · 2^FunnyHat.
import { awayPercent } from '../../away'
import * as NX from '../../next-types'
type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0

export const fishXp = (f: number) => 5 * f + 15 * Math.floor(f / 15) * (f - 14) + 75 * Math.floor(f / 25) * (f - 25)

export function chances(hook: number, rod: number, lv: number) {
  const large = Math.min((hook ** 2 / 12 + (rod - 1) ** 3 / 12) * ((lv + 20) / 35), 45)
  const medium = Math.min((2 * hook + 4 * rod) * ((lv + 25) / 50), 100 - large, 45)
  return { large, medium, small: 100 - medium - large }
}

/** P(r < x) for r = i/10, i = 1..1000. */
const below = (x: number) => Math.min(1000, Math.max(0, Math.ceil(x * 10) - 1)) / 1000
const avg = (a: number, b: number) => { let s = 0; for (let f = a; f <= b; f++) s += fishXp(f); return s / (b - a + 1) }

export function fishing(save: Save, hook = n(save.HookLv), rod = n(save.FishingRodLv)) {
  const lv = n(save.fishingLVL), shown = chances(hook, rod, lv)
  const pL = below(shown.large), pM = Math.max(below(shown.medium) - pL, 0), pS = 1 - pL - pM
  const tiers = {
    large: { p: pL, fish: [25, Math.min(25 + Math.floor(lv / 15), 30)] as const },
    medium: { p: pM, fish: [15, Math.min(15 + Math.floor(lv / 8), 24)] as const },
    small: { p: pS, fish: [1, Math.min(4 + Math.floor(lv / 6), 14)] as const },
  }
  const base = Object.values(tiers).reduce((s, t) => s + t.p * avg(t.fish[0], t.fish[1]), 0)
  const multi = ((100 + n(save.smithingFishingPower)) / 100) ** 0.7 * 2 ** n(save.FunnyHatPurchased)
  return { hook, rod, lv, shown, tiers, base, multi, perCatch: base * multi }
}

/** Expected XP per catch after hook/rod upgrades, vs now; stops once large odds hit the 45% cap. */
export function upgrades(save: Save) {
  // Away credit uses the screen's odds, so an upgrade moves it differently: re-run awayFishing with the upgraded chances.
  const awayAt = (f: ReturnType<typeof fishing>) => awayFishing({ ...save, FishChanceLARGE: f.shown.large, FishChanceMEDIUM: f.shown.medium, FishChanceSMALL: f.shown.small }, 100).perAwaySecond
  const now = fishing(save), awayNow = awayAt(now), rows: { hook: number; rod: number; base: number; gain: number; awayGain: number; large: number; capped: boolean }[] = []
  for (let dr = 0; dr <= 2; dr++) for (let dh = 0; dh <= 3; dh++) {
    if (!dh && !dr) continue
    const f = fishing(save, now.hook + dh, now.rod + dr)
    rows.push({ hook: f.hook, rod: f.rod, base: f.base, gain: f.base / now.base - 1, awayGain: awayAt(f) / awayNow - 1, large: f.tiers.large.p, capped: f.shown.large >= 45 })
  }
  return rows.sort((a, b) => a.rod - b.rod || a.hook - b.hook)
}

/** Away fishing isn't rolled: returning to Fishing credits a formula (generic away code, CurrentlyViewedScreen 7) with the
 *  SCREEN's odds, one catch per bite wait ((TimeMin+TimeMax)/2, no reel animation), power without ^0.7, and the game's
 *  own tier averages (large overstated). Credited time = away seconds × awayPct/100. Verified live 2026-10-04: 327 s away,
 *  +4.906e9 vs 4.95e9 predicted. The ×(1+TankBonusLIST[12]/100) at one credit site is not applied on a screen switch. */
export function awayFishing(save: Save, awayPct: number) {
  const lv = n(save.fishingLVL), small = 5 * (Math.min(4 + Math.floor(lv / 6), 14) + 1) / 2
  const medium = 5 * (Math.min(15 + Math.floor(lv / 8), 24) + 15) / 2 + 15 * (Math.min(1 + Math.floor(lv / 8), 10) + 1) / 2
  const large = (Math.min(25 + Math.floor(lv / 15), 30) + 25) / 2 * 5 + (Math.min(11 + Math.floor(lv / 15), 16) + 11) / 2 * 30 + (Math.min(1 + Math.floor(lv / 15), 6) + 1) / 2 * 75
  const base = (small * n(save.FishChanceSMALL) + medium * n(save.FishChanceMEDIUM) + large * n(save.FishChanceLARGE)) / 100
  const wait = (n(save.FishingTimeMin) + n(save.FishingTimeMax)) / 2 || 1
  const multi = (100 + n(save.smithingFishingPower)) / 100 * (0.5 * n((save.SecretEarned as number[])?.[3]) + 0.02 * n((save.SmithingItemLevel as number[])?.[35]) + 1) * 2 ** n(save.FunnyHatPurchased)
  return { perAwaySecond: (base / wait) * multi * (awayPct / 100), catchesPerSecond: 1 / wait }
}
// ponytail: active catch cycle measured live (100 catches ≈ 9 min, 2026-10-04); derive from FishingTime + animation timers if it drifts.
export const ACTIVE_CATCH_SECONDS = 5.4

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'fishing', title: 'Fishing', src: 'fishing.ts fishing + awayFishing + upgrades', fn: (s) => {
    const f = fishing(s), p = awayPercent(s), out: NX.Item[] = []
    if (p != null) {
      const ratio = awayFishing(s, p).perAwaySecond / (f.perCatch / ACTIVE_CATCH_SECONDS)
      if (ratio > 1) out.push({ text: 'Leave Fishing parked, visit only to collect', why: `away pays ${Math.round(ratio).toLocaleString()}× active fishing` })
    }
    for (const u of upgrades(s).filter((u) => (u.hook === f.hook + 1 && u.rod === f.rod) || (u.hook === f.hook && u.rod === f.rod + 1)))
      out.push({ text: u.rod > f.rod ? `Rod → ${u.rod}` : `Hook → ${u.hook}`, why: `+${(100 * u.gain).toFixed(0)}% active, +${(100 * u.awayGain).toFixed(0)}% away XP/catch` })
    return out
  }}
