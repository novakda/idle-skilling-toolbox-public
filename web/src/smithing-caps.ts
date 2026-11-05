// Smithing items whose bonus stops growing at a level (a Math.min in the game's formula). Only caps read from the game
// code and checked against the wiki or a second use are listed; levels past `cap` add nothing to that bonus.
import names from './data/smithing-names.json'
import { smithCurrency } from './smithing'
import { smithingCostAt } from './smithing'
import * as NX from './next-types'

type Save = Record<string, unknown>
export type Cap = { item: number; cap: number; bonus: string; note?: string }

export const CAPS: Cap[] = [
  // @11046703 (and 8 other copies): kills-per-kill + min(0.2·√L, 9); 0.2·√2025 = 9. Wiki lists 2450 for "+10".
  { item: 76, cap: 2025, bonus: 'kills per kill + min(0.2·√L, 9)', note: 'also feeds the Lupinis potion (PotionLV[96]) term (P·0.2·√L/800)^0.1, which grows only ~3.5% per doubling of L and is 0 while that potion is 0' },
  // @18701652 (8 crystal blocks, 16 reads): Green/Orange/Pink/Black crystal bonus + min(round(15·√L)/10, 15); 1.5·√100 = 15. Wiki says +20%.
  { item: 72, cap: 100, bonus: 'Green/Orange/Pink/Black crystal bonus + min(1.5·√L, 15)' },
  // @18699026 (Yellow/Red/Purple/Blue crystal bonus + min(round(10·√L)/10, cap)): two scenes cap at 10 (L100), one at 15
  // (@18791162, L225); 225 is where every copy stops. Wiki's max 2255 looks like a typo for 225.
  { item: 80, cap: 224, bonus: 'Yellow/Red/Purple/Blue crystal bonus + min(√L, 10 or 15 by scene)' },
  // @10715911: min(round(L^0.8), 1000) BP on rebirth; wiki max 5625.
  { item: 70, cap: 5620, bonus: 'BP when rebirthing, min(L^0.8, 1000)' },
]

/** The knee (Idleon Math Lab, Lab 1): the level where an item's bonus reaches half its ceiling. For a soft cap
 *  A·L/(L+B) that is B; past it each level buys less than half what the first ones did, so stop upgrading there.
 *  `frac` is the bonus as a fraction of its ceiling. `hard`: linear up to a cap, so there is no diminishing return and
 *  the knee is the cap itself. Formulas and offsets: docs/smithing-curves-census.md (all 96 items, 2026-10-30). Items
 *  not listed are linear or convex in L (cost growth is their only limit); 94 has no effect in the game code. */
type Curve = { frac: (L: number) => number; src: string; hard?: boolean }
const soft = (B: number) => (L: number) => L / (L + B)
const softExp = (B: number, base: number, div: number, max: number) => (L: number) => (L / (L + B)) * Math.pow(base, Math.min(L / div, max) - max)
const capAt = (cap: number) => (L: number) => Math.min(L / cap, 1)
const REPS = 'rep speed, level clamped to 50,000 by the game (SceneEvents_2 @20241588)'
const KNEE_CURVES: Record<number, Curve> = {
  13: { frac: capAt(5e4), src: REPS, hard: true }, 29: { frac: capAt(5e4), src: REPS, hard: true },
  37: { frac: capAt(5e4), src: REPS, hard: true }, 53: { frac: capAt(5e4), src: REPS, hard: true },
  19: { frac: capAt(25), src: 'smithing cost ×(1 − Aloof)^min(L, 25), 3 copies (@25992445)', hard: true },
  67: { frac: capAt(9997), src: 'shield food min(ceil(L/4), 2500) @26980420', hard: true },
  75: { frac: capAt(4000), src: 'shield food min(L, 4000) @26983450', hard: true },
  70: { frac: (L) => Math.min(Math.round(Math.pow(L, 0.8)) / 1000, 1), src: 'min(round(L^0.8), 1000) @10715836' },
  71: { frac: (L) => Math.min(Math.pow(L, 0.91) / 600, 1), src: 'botany ×(1 + min(10·L^0.91/100, 60)) @24236736' },
  72: { frac: (L) => Math.min(Math.sqrt(L) / 10, 1), src: 'min(1.5·√L, 15) @18701652' },
  76: { frac: (L) => Math.min(Math.sqrt(L) / 45, 1), src: 'min(0.2·√L, 9) @11046703' },
  77: { frac: (L) => Math.min((10 * Math.pow(L + 1, 0.23) - 10) / 70, 1), src: 'min(10·(L+1)^0.23 − 10, 70) rift' },
  79: { frac: (L) => Math.min(Math.pow(L, 0.88) / 400, 1), src: 'min(L^0.88/10, 40)% tilling' },
  80: { frac: (L) => Math.min(Math.sqrt(L) / 15, 1), src: 'min(√L, 15) MiningGem blocks @18723654 (10 in PotionGem blocks)' },
  85: { frac: (L) => Math.min(5 * Math.pow(L, 0.12) / 50, 1), src: 'minion atk spd min(50, 5·L^0.12) @6408657' },
  95: { frac: (L) => Math.min(Math.pow(L, 0.3) / 500, 1), src: 'realm coins min(L^0.3, 500) @6402446' },
  96: { frac: (L) => Math.min(9 * Math.pow(L, 0.15) / 200, 1), src: 'minion dmg min(200, 9·L^0.15) @6399741' },
  83: { frac: soft(1500), src: 'mystic levels 200 + 400·L/(L+1500) @12332016' },
  86: { frac: soft(2500), src: '600·L/(L+2500) tilling' },
  87: { frac: softExp(2000, 1.15, 2000, 8), src: 'pet dmg 400·L/(L+2000)·1.15^min(L/2000, 8) @27308176' },
  88: { frac: softExp(1500, 1.6, 2000, 9), src: 'traces 400·L/(L+1500)·1.6^min(L/2000, 9) @26904788' },
  89: { frac: (L) => soft(2500)(L) ** 2, src: 'medallion^(1 + (0.96·L/(L+2500))²) @31690094' },
  91: { frac: softExp(3000, 1.15, 1000, 14), src: 'build speed 200·L/(L+3000)·1.15^min(L/1000, 14) @2688547' },
  92: { frac: (L) => soft(2200)(L) ** 2, src: 'smith cash^((0.96·L/(L+2200))²) @31690700' },
  93: { frac: softExp(1500, 1.085, 1000, 15), src: '(1 + 3·L/(L+1500)·1.085^min(L/1000, 15))^stars @23474942' },
}
const kneeOf = (c: Curve) => { const t = c.hard ? 1 : 0.5; let lo = 0, hi = 2e9; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (c.frac(m) >= t) hi = m; else lo = m } return hi }
export const KNEES: Record<number, number> = Object.fromEntries(Object.entries(KNEE_CURVES).map(([i, c]) => [i, kneeOf(c)]))
export const kneeInfo = (item: number, level: number) => {
  const c = KNEE_CURVES[item]; if (!c) return null
  return { knee: KNEES[item]!, pctKnee: level / KNEES[item]!, pctCeiling: c.frac(level), src: c.src }
}

/** Timelesseum: the game only ever resets its level to 0 (SceneEvents_2 @20257772); nothing reads it (census). */
const NO_EFFECT = 94

/** Items whose anvil panel text (SceneEvents_6 _BonusDisp) disagrees with the formula the game applies (census). */
export const PANEL_MISMATCH: Record<number, string> = {
  72: 'panel shows min(0.4·√L, 20); applied is min(1.5·√L, 15)',
  77: 'panel says −70% XP; applied is −16% / −26%',
  84: 'panel shows 500·L·2.41^…; applied is L·(Spelunker LV/2)·2.39^min(L/1000, 15)',
  87: 'panel shows 500·…·1.25^…; applied is 400·L/(L+2000)·1.15^min(L/2000, 8)',
  88: 'panel caps the exponent at 10; applied caps it at 9',
  91: 'panel shows 1.16^…; applied is 1.15^min(L/1000, 14)',
  92: 'panel uses B = 2000; applied is B = 2200',
}

// Damage reduction: items 14/30/38/54 add L/12, L/8, L/6, L/3 inside one shared min(90, …) (@31704119), so the knee of
// each is the level that fills the cap with the other three where they are (0 when they already fill it); past the cap
// none of them adds anything.
const DR: [number, number][] = [[14, 12], [30, 8], [38, 6], [54, 3]]
const drInfo = (L: number[], item: number) => {
  const div = DR.find(([i]) => i === item)?.[1]; if (!div) return null
  const sum = DR.reduce((t, [i, d]) => t + (Number(L[i] ?? 0) || 0) / d, 0), level = Number(L[item] ?? 0) || 0
  const knee = Math.max(0, Math.ceil(level + (90 - sum) * div)) // 0 = the other three already fill the cap
  return { knee, pctKnee: knee ? level / knee : Infinity, pctCeiling: Math.min(sum / 90, 1), src: 'damage reduction, shared min(90, L14/12 + L30/8 + L38/6 + L54/3) @31704119' }
}

export function smithingCaps(save: Save) {
  const L = (save.SmithingItemLevel as number[] | undefined) ?? []
  return CAPS.map((c) => ({ ...c, name: (names as Record<string, string>)[c.item] ?? `item ${c.item}`, level: Number(L[c.item] ?? 0) || 0 }))
    .filter((c) => c.level >= c.cap)
}

// Kits set miner armor tiers: Lv > a arms miner a+1, and the loop runs over 7 miners (@ MinerArmor block), so Lv 7 is all.
const KITS = [31, 47, 55], MINERS = 7

/** What you hold of every smithing currency 1-64. Not SmithingItemsYouOwn: that is a copy the smithing screen refreshes
 *  from OresOwned/FishOwned/… while it draws (@8920887), so it is stale off that screen; crafts spend the real arrays. */
const held = (save: Save) => new Map(Array.from({ length: 64 }, (_, k) => [k + 1, smithCurrency(save, k + 1).owned]))

/** Uncapped, unlocked items the materials on hand can level now, best relative gain first. Each craft costs the current
 *  level's price and adds ceil(rand(0.21·S, 1 + 0.2·S)) levels (S = SkillLevels[19], craft routine @8878736); this counts
 *  the low end. Each item is costed alone, so two items sharing a material can't both get what's listed. Page 11
 *  (81-96) opens 2 items per Smithy Cert level (Construction 20). */
export function smithingAffordable(save: Save) {
  const L = (save.SmithingItemLevel as number[] | undefined) ?? [], own = held(save)
  const ups = Math.max(1, Math.ceil(0.21 * Number((save.SkillLevels as number[] | undefined)?.[19] ?? 0)))
  const open = 80 + 2 * Number((save.ConstructLV as number[] | undefined)?.[20] ?? 0), at = smithingCostAt(save)
  const out = []
  for (let item = 1; item <= 96; item++) {
    const level = Number(L[item] ?? 0) || 0, cap = CAPS.find((c) => c.item === item)?.cap ?? Infinity
    if (item > open || level >= cap || (KITS.includes(item) && level >= MINERS) || ((drInfo(L, item) ?? kneeInfo(item, level))?.pctCeiling ?? 0) >= 1) continue
    const left = new Map(own); let crafts = 0, l = level
    for (; crafts < 1e4 && l < cap && (KNEE_CURVES[item]?.frac(l) ?? 0) < 1; crafts++, l += ups) {
      const cost = at(item, l)
      if (cost.some((c) => !((left.get(c.currency) ?? 0) >= c.cost))) break
      cost.forEach((c) => left.set(c.currency, left.get(c.currency)! - c.cost))
    }
    if (crafts) out.push({ item, name: (names as Record<string, string>)[item] ?? `item ${item}`, level, to: Math.min(l, cap), crafts, materials: at(item, level).map((c) => c.currency) })
  }
  return out.sort((a, b) => (b.to - b.level) / Math.max(b.level, 1) - (a.to - a.level) / Math.max(a.level, 1))
}

export type ItemStatus = 'capped' | 'kit done' | 'past knee' | 'locked' | 'open'

/** Every anvil item 1-96 for the Smithing page: level, cap, status, the next craft's cost against what you hold, and how
 *  far your materials take it now (smithingAffordable's numbers). Page p holds items 8p-7..8p (12 pages). */
export function smithingItems(save: Save) {
  const L = (save.SmithingItemLevel as number[] | undefined) ?? []
  const open = 80 + 2 * Number((save.ConstructLV as number[] | undefined)?.[20] ?? 0), at = smithingCostAt(save)
  const afford = new Map(smithingAffordable(save).map((a) => [a.item, a]))
  return Array.from({ length: 96 }, (_, k) => {
    const item = k + 1, level = Number(L[item] ?? 0) || 0, cap = CAPS.find((c) => c.item === item)?.cap ?? null
    const knee = drInfo(L, item) ?? kneeInfo(item, level)
    const status: ItemStatus = (cap != null && level >= cap) || (knee && knee.pctCeiling >= 1) ? 'capped' : KITS.includes(item) && level >= MINERS ? 'kit done' : item > open ? 'locked' : knee && level >= knee.knee ? 'past knee' : 'open'
    const a = afford.get(item)
    return { item, name: (names as Record<string, string>)[item] ?? `item ${item}`, page: Math.ceil(item / 8), level, cap, status, knee, panel: PANEL_MISMATCH[item] ?? null,
      worth: status === 'open' && item !== NO_EFFECT,
      cost: at(item, level).map((c) => ({ ...c, ...smithCurrency(save, c.currency) })),
      to: a?.to ?? level, crafts: a?.crafts ?? 0 }
  })
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'smithing', title: 'Smithing', src: 'smithing-caps.ts smithingCaps, smithingAffordable', fn: (s) => smithingCaps(s).map((c) => ({
    text: `Stop crafting ${c.name}: Lv ${c.level.toLocaleString()} is past its cap`,
    why: `${c.bonus} maxes at Lv ${c.cap.toLocaleString()}; further levels add nothing${c.note ? ` (${c.note})` : ''}` }))
    .concat(smithingAffordable(s).filter((a) => (a.to - a.level) / Math.max(a.level, 1) >= 0.05).slice(0, 3).map((a) => ({
      text: `Craft ${a.name}: Lv ${a.level.toLocaleString()} → ${a.to.toLocaleString()} (${a.crafts} crafts)`,
      why: `your materials cover it now (+${Math.round((100 * (a.to - a.level)) / Math.max(a.level, 1))}% levels); costed alone, other items on the same materials share them` })))}
