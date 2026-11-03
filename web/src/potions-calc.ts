// Potion logic shared by the browser and the generators — no game code. Formulas from the game's brew code
// (ActorEvents_1174 discovery, SceneEvents_37 brewing), verified 2026-10-02 against the infodoc discovery grid and
// live cauldron rates.
/** Potions-screen draw ticks per second: measured/predicted brew rate = 0.417 at 60 fps (live 2026-10-02, six cauldrons). */
export const TICKS_PER_SEC = 25

export type PotionStatic = { id: number; name: string; bonus: string | null; group: string | null }

/** Discovery brew outcome distribution for one seed+flower pair (normal cauldrons): 16 r-values x 2 signs. */
export function outcomes(seed: number, flower: number): Map<number, number> {
  const m = new Map<number, number>()
  for (let r = 1; r <= 16; r++)
    for (const sign of [1, -1]) {
      const id = Math.max(Math.round(1.9 * seed + 2.4 * flower - 4 + sign * (4 - Math.sqrt(16 - r))), 1)
      m.set(id, (m.get(id) ?? 0) + 1 / 32)
    }
  return m
}

export const SEEDS = 21, FLOWERS = 24
type Best = { seed: number; flower: number; chance: number }

/** Best owned seed+flower per undiscovered potion, plus what unreachable ones would need. */
export function discoveryTargets(save: Record<string, unknown>, potions: PotionStatic[]) {
  const lv = (save.PotionLV as number[]) ?? [], seeds = (save.SeedsOwned as number[]) ?? [], flowers = (save.flowersOwned as number[]) ?? []
  const best = new Map<number, Best>(), any = new Map<number, Best>()
  for (let s = 1; s <= SEEDS; s++)
    for (let f = 1; f <= FLOWERS; f++)
      for (const [id, p] of outcomes(s, f)) {
        if (p > (any.get(id)?.chance ?? 0)) any.set(id, { seed: s, flower: f, chance: p })
        if ((seeds[s] ?? 0) > 0 && (flowers[f] ?? 0) > 0 && p > (best.get(id)?.chance ?? 0)) best.set(id, { seed: s, flower: f, chance: p })
      }
  return potions.filter((p) => !((lv[p.id - 1] ?? 0) > 0)).map((p) => ({
    id: p.id, name: p.name, ...(best.get(p.id) ?? { seed: null, flower: null, chance: 0 }), needs: best.has(p.id) ? null : any.get(p.id) ?? null,
  }))
}

/** Cauldron c's Eternal Cauldron multiplier: the game sets MTXcauldronBonus2x[c] = 2 when MTXeternalCauldronsOwned >= c. */
export const eternalBonus = (save: Record<string, unknown>, c: number) =>
  ((save.MTXcauldronBonus2x as number[]) ?? [])[c] ?? (Number(save.MTXeternalCauldronsOwned ?? 0) >= c ? 2 : 1)

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** PotionEXPreq after a level-up (SceneEvents_37 † @24963261): req·(1.2 − T/950 + ⌊T/122⌋(0.0425 + (T − 122)/2000)) + 10T/8 + T. */
export const nextPotionReq = (req: number, T: number) => req * (1.2 - T / 950 + Math.floor(T / 122) * (0.0425 + (T - 122) / 2000)) + (T / 8) * 10 + T
/** Price of potion T's next level in cauldron c (SceneEvents_37 draw listener † @24939757, deducted † @24947900). When PotionEXP[T]
 *  reaches PotionEXPreq[T] the level happens only while you hold both: crop PotionsCostCurrency1[T], 25·req·K^LV·R·g, and
 *  flower PotionsCostCurrency2[T] − 20, (0.1·req·K2^LV)^0.79·R·g, with K = max(1.02 + 0.16/(0.43·ln(perk 54·max(H2O − 100, 0) +
 *  100)), 1.03) (K2 the same with 0.07), R = PbonusPotionCostRedux, g = PotionGemCOST[c], and the crop part also ×
 *  (1 − min(0.7·PotionLV[145]/(PotionLV[145] + 175), 0.4))^min(log10(flower 9 + 1)^0.92, 40). The price is then taken unless a
 *  roll randomInt(1, 1000) ≤ 15·ShrineLevels[3] makes it free, but holding it is required either way. */
export function potionLevelCost(s: Save, T: number, c: number, L = n(arr(s, 'PotionLV')[T - 1]), req = n(arr(s, 'PotionEXPreq')[T])) {
  const lnw = 0.43 * Math.log(Math.abs(n(arr(s, 'AscentionLevel')[54]) * Math.max(n(s.waterLV) - 100, 0) + 100))
  const K = Math.max(1.02 + 0.16 / lnw, 1.03), K2 = Math.max(1.02 + 0.07 / lnw, 1.03)
  const R = s.PbonusPotionCostRedux == null ? 1 : n(s.PbonusPotionCostRedux), g = n(arr(s, 'PotionGemCOST')[c] ?? 1)
  const P145 = n(arr(s, 'PotionLV')[145]), te = 1 - Math.min((0.7 * P145) / (P145 + 175), 0.4)
  const redux = R * Math.pow(te, Math.min(Math.pow(0.43429 * Math.log(Math.abs(n(arr(s, 'flowersOwned')[9]) + 1)), 0.92), 40))
  return {
    crop: n(arr(s, 'PotionsCostCurrency1')[T]), qty: 25 * req * Math.pow(K, L) * redux * g,
    flower: n(arr(s, 'PotionsCostCurrency2')[T]) - 20, flowerQty: Math.pow(0.1 * req * Math.pow(K2, L), 0.79) * R * g,
  }
}
/** Levels one payment buys in cauldron c (same listener † @24951900): roll r = randomInt(0, 100); aa = 150·(MTXcauldronBonus2x[c] − 1)
 *  + 2·min(PotionLV[29], 100) + CbonusApoDoublePotChance + 600·s86/(s86 + 2500) + 3·SkillLevels[52] + PotionGemDOUBLE[c] (s86 =
 *  SmithingItemLevel[86]); levels = 1 + #{j = 1..14 : r < aa − 100(j − 1)}, j ≥ 9 only when s86 > 0.5; every level grows the req.
 *  Without r: the expectation over the 101 rolls. */
export function potionLevelsPerPay(s: Save, c: number, r?: number) {
  const s86 = n(arr(s, 'SmithingItemLevel')[86])
  const aa = 150 * (eternalBonus(s, c) - 1) + 2 * Math.min(n(arr(s, 'PotionLV')[29]), 100) + n(s.CbonusApoDoublePotChance) + (600 * s86) / (s86 + 2500)
    + 3 * n(arr(s, 'SkillLevels')[52]) + n(arr(s, 'PotionGemDOUBLE')[c])
  const at = (x: number) => { let L = 1; for (let j = 1; j <= (s86 > 0.5 ? 14 : 8) && x < aa - 100 * (j - 1); j++) L++; return L }
  if (r != null) return at(r)
  let t = 0
  for (let x = 0; x <= 100; x++) t += at(x)
  return t / 101
}
