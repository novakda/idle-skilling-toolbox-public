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
