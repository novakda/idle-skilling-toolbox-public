// Alchemy planner (#2632): which potion levels the held crops + flowers pay for, what each does to its bonus, and which potions
// to put in the cauldrons next. How brewing works (SceneEvents_37 in Qno2x.js):
// - Any owned cauldron brews any discovered potion; the only gate is the Apothecary level for a level-1 potion (@3676830, tag @25093300).
// - A brewing cauldron adds potion EXP to PotionEXP[T] (progress is per potion, so switching loses nothing) at
//   25·0.04·anim·brew boost·speed gem·PotionExpGiven·PotionBOOST·Eternal² per watched second (Potions.vue brewing rates).
// - At PotionEXPreq[T] the level happens only while you hold its crop + flower price (potionLevelCost, @24939757), then
//   the req grows (nextPotionReq, @24963261). A payment can give extra levels (double brew, potionLevelsPerPay @24951900).
import { potionLevelCost, potionLevelsPerPay, nextPotionReq } from './tilling'
import { eternalBonus, TICKS_PER_SEC } from './potions-calc'
import { unlockLevel } from './apothecary-exp'
import { POTION_FORMULAS, potionGroup, potionMultiplier, potionTotal } from './potion-formulas'
import { brewSpeedBoost, vendingBonus } from './load-bonuses'
import { withDeckLinks } from './cards-calc'
import { current } from './screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
/** Stop counting affordable levels here (stocks can cover thousands). */
export const LEVEL_CAP = 999

/** Potion EXP per watched second that cauldron c adds to whatever it brews. */
export function brewRate(s: Save, c: number) {
  const at = (k: string, d = 0) => n(arr(s, k)[c] ?? d)
  const boost = n(current(s, 'PotionBrewSpeedBOOST[1]', () => brewSpeedBoost(withDeckLinks(s))))
  return TICKS_PER_SEC * 0.04 * at('PotionAnimationSpeed') * boost * at('PotionGemSPEED', 1) * at('PotionExpGiven') * n(s.PotionBOOST ?? 1) * eternalBonus(s, c) ** 2
}

/** The value metric. Each potion feeds one bonus; its "stat" is the sum of its additive group (potions adding into the same
 *  Pbonus key, × the potion multiplier where the game applies it), else its own value. Gain = relative change of what that
 *  bonus does: "+x%" → ×(1 + x/100); "-x%" (cost) → ×1/(1 − x/100); "×x" / "^x" / flat counts → the value itself.
 *  Ignored: "per X" scalers (per 10 ATT levels, per power of 10 …) multiply before and after alike, so they cancel only
 *  when nothing else is in the group. Potions without a formula (92, 96, 97, 104, 106) get null. */
export function effectGain(s: Save, id: number, to: number) {
  const f = POTION_FORMULAS[id]
  if (!f) return null
  const lv = arr(s, 'PotionLV'), S = potionMultiplier(n(lv[94]), vendingBonus(s, 5))
  const ids = potionGroup(id).length ? potionGroup(id) : [id]
  const stat = (L: number) => ids.reduce((t, j) => {
    const l = j === id ? L : n(lv[j - 1]), g = POTION_FORMULAS[j]!
    return l > 0 ? t + g.v(l) * (g.m ? S : 1) : t
  }, 0)
  const L = n(lv[id - 1]), b = stat(L), a = stat(to)
  let gain: number
  if (f.t.startsWith('-')) gain = (100 - b) / Math.max(100 - a, 1e-9) - 1
  else if (f.t.startsWith('×') || f.t.includes('^{}') || !f.t.includes('{}%')) gain = b > 0 ? a / b - 1 : 0
  else gain = a >= b ? (100 + a) / (100 + b) - 1 : (100 + b) / (100 + a) - 1 // falling "%" (e.g. #145's per-craft rise) is a cost
  return { gain, before: potionTotal(id, L, S), after: potionTotal(id, to, S) }
}

/** A discovered potion a cauldron can start now (level ≥ 2, or level 1 with the Apothecary tag reached). */
export const brewable = (s: Save, id: number) => {
  const L = n(arr(s, 'PotionLV')[id - 1])
  return !!POTION_FORMULAS[id] && L > 0 && (L >= 2 || n(s.ApothecaryLV) >= unlockLevel(id))
}
const owned = (s: Save) => Array.from({ length: Math.min(n(s.CauldronsOwned), 6) }, (_, i) => i + 1)
/** The owned cauldron with the lowest cost gem (PotionGemCOST, 1 when empty): prices in "Can make" use it. */
export const cheapestCauldron = (s: Save) => owned(s).reduce((b, c) => ((arr(s, 'PotionGemCOST')[c] || 1) < (arr(s, 'PotionGemCOST')[b] || 1) ? c : b), 1)

/** Paid levels of potion T the given crop/flower stock covers in cauldron c, each level at its own (growing) price. */
export function affordLevels(s: Save, T: number, c: number, crops = arr(s, 'SeedsOwned'), flowers = arr(s, 'flowersOwned')) {
  let L = n(arr(s, 'PotionLV')[T - 1]), req = n(arr(s, 'PotionEXPreq')[T]), k = 0
  const first = potionLevelCost(s, T, c, L, req)
  let crop = n(crops[first.crop]), flower = n(flowers[first.flower])
  const v = POTION_FORMULAS[T]?.v
  while (k < LEVEL_CAP && (!v || v(L + 1000) !== v(L))) { // stop at the bonus cap
    const p = potionLevelCost(s, T, c, L, req)
    if (!(crop >= p.qty && flower >= p.flowerQty)) break
    crop -= p.qty; flower -= p.flowerQty; k++; L++; req = nextPotionReq(req, T)
  }
  // Stock share of one level: the larger of the two fractions of what you hold (the binding material).
  const share = Math.max(first.qty / Math.max(n(crops[first.crop]), 1e-300), first.flowerQty / Math.max(n(flowers[first.flower]), 1e-300))
  return { ...first, cropHeld: n(crops[first.crop]), flowerHeld: n(flowers[first.flower]), levels: k, share }
}

export type MakeRow = ReturnType<typeof canMake>[number]
/** One row per brewable potion whose next level the held stock pays for (each potion as if it got all of it). */
export function canMake(s: Save, names: Record<number, string> = {}) {
  const c = cheapestCauldron(s), lv = arr(s, 'PotionLV')
  const rows = []
  for (let id = 1; id < lv.length + 1; id++) {
    if (!brewable(s, id)) continue
    const a = affordLevels(s, id, c)
    if (a.levels < 1) continue
    const L = n(lv[id - 1]), one = effectGain(s, id, L + 1)!, all = effectGain(s, id, L + a.levels)!
    rows.push({ id, name: names[id] ?? `potion ${id}`, L, ...a, gain1: one.gain, gainAll: all.gain, before: one.before, after1: one.after, afterAll: all.after,
      bang: a.share > 0 ? one.gain / a.share : 0, sharedWith: 0 })
  }
  // Shared materials: how many other rows pay with the same crop or flower.
  for (const r of rows) r.sharedWith = rows.filter((q) => q !== r && (q.crop === r.crop || q.flower === r.flower)).length
  return rows
}

export type Brew = { c: number; id: number; current: number; levels: number; secs: number; gain: number; levelsPerPay: number; before: string; after: string; crop: number; qty: number; flower: number; flowerQty: number }
/** Levels cauldron c gets on potion id within `secs` of brewing at `rate` EXP/s, paying each from the stock (which it mutates). */
function run(s: Save, id: number, c: number, rate: number, secs: number, crops: number[], flowers: number[]) {
  let L = n(arr(s, 'PotionLV')[id - 1]), req = n(arr(s, 'PotionEXPreq')[id]), t = Math.max(0, req - n(arr(s, 'PotionEXP')[id])) / rate, k = 0, qty = 0, fq = 0
  const first = potionLevelCost(s, id, c, L, req)
  const v = POTION_FORMULAS[id]!.v
  while (k < LEVEL_CAP && t <= secs && v(L + 1000) !== v(L)) { // stop at the bonus cap (floored steps still pass)
    const p = potionLevelCost(s, id, c, L, req)
    if (n(crops[p.crop]) < p.qty || n(flowers[p.flower]) < p.flowerQty) break
    crops[p.crop] = n(crops[p.crop]) - p.qty; flowers[p.flower] = n(flowers[p.flower]) - p.flowerQty; qty += p.qty; fq += p.flowerQty
    k++; L++; req = nextPotionReq(req, id); t += req / rate
  }
  return { levels: k, secs: k ? t - req / rate : 0, crop: first.crop, flower: first.flower, qty, flowerQty: fq }
}
/** Suggested potion per owned cauldron for the next `hours` (cauldrons on a discovery brew are left alone). Greedy: repeatedly
 *  take the (cauldron, potion) pair whose levels within the horizon — limited by brew time at `rateFactor` × the watched
 *  rate and by the stock left after earlier picks — give the largest stat gain; one potion per cauldron. Paid levels only:
 *  double-brew extra levels (levelsPerPay) come on top. */
export function nextBrews(s: Save, hours = 24, rateFactor = 1): Brew[] {
  const free = owned(s).filter((c) => { const T = n(arr(s, 'PotionType')[c]); return !(T >= 107 && T <= 121) && brewRate(s, c) * rateFactor > 0 })
  const crops = [...arr(s, 'SeedsOwned')], flowers = [...arr(s, 'flowersOwned')], lv = arr(s, 'PotionLV')
  const ids = lv.map((_, i) => i + 1).filter((id) => brewable(s, id))
  const out: Brew[] = [], used = new Set<number>()
  while (free.length) {
    let best: (Brew & { r: number }) | null = null
    for (const c of free) {
      const r = brewRate(s, c) * rateFactor
      for (const id of ids) {
        if (used.has(id)) continue
        const x = run(s, id, c, r, hours * 3600, [...crops], [...flowers])
        if (!x.levels) continue
        const g = effectGain(s, id, n(lv[id - 1]) + x.levels)!
        if (g.gain > 0 && (!best || g.gain > best.gain)) best = { c, id, r, current: n(arr(s, 'PotionType')[c]), ...x, gain: g.gain, levelsPerPay: potionLevelsPerPay(s, c), before: g.before, after: g.after }
      }
    }
    if (!best) break
    run(s, best.id, best.c, best.r, hours * 3600, crops, flowers)
    const { r: _, ...b } = best
    used.add(b.id); free.splice(free.indexOf(b.c), 1); out.push(b)
  }
  return out.sort((a, b) => a.c - b.c)
}
