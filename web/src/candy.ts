// Time candy (docs/candy.md). Using candy type k sets CandyAwayTime to its duration (@14753950-@14755282 †), credited as away
// time on the screen you have selected only, at full rate: the same as watching that screen for that long (checked live
// 2026-10-11 on Tilling and on Apothecary). CandyOwned[k] counts each type. Types 6-7 exist in the save but their durations
// aren't traced, so they're left out.
import { brewRate } from './alchemy'
import { awayPercent } from './away'
import { withDeckLinks } from './cards-calc'
import { cropPlan, withTilling } from './tilling'
import { ARENAS, rates, toLevel } from './training'
type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0

export const CANDY_SECS: Record<number, number> = { 1: 7201, 2: 14401, 3: 28801, 4: 86401, 5: 259201 }

export function candyHeld(s: Save) {
  const owned = (s.CandyOwned as number[] | undefined) ?? []
  return Object.entries(CANDY_SECS).map(([k, secs]) => ({ type: +k, hours: Math.round(secs / 3600), count: n(owned[+k]) })).filter((c) => c.count > 0)
}

/** The candies to use for `secs` of full-rate time on one screen: the cheapest set (least candy time spent, then fewest
 *  candies) that covers it, from what you hold. Exhaustive over your counts (a handful of candies). */
export function candyFor(s: Save, secs: number) {
  const held = candyHeld(s)
  type Pick = { pick: { hours: number; count: number }[]; total: number }
  let best = null as Pick | null
  const rec = (i: number, pick: { hours: number; count: number }[], total: number) => {
    if (total >= secs) {
      const k = pick.reduce((t, p) => t + p.count, 0), bk = best ? best.pick.reduce((t, p) => t + p.count, 0) : Infinity
      if (!best || total < best.total || (total === best.total && k < bk)) best = { pick, total }
      return
    }
    if (i >= held.length) return
    const c = held[i]!
    for (let m = 0; m <= c.count; m++) rec(i + 1, m ? [...pick, { hours: c.hours, count: m }] : pick, total + m * CANDY_SECS[c.type]!)
  }
  if (secs > 0) rec(0, [], 0)
  const all = held.reduce((t, c) => t + c.count * CANDY_SECS[c.type]!, 0)
  return { secs, best: best as Pick | null, enough: !!best, allHeld: all }
}

export const candyText = (pick: { hours: number; count: number }[]) => pick.map((p) => `${p.count} × ${p.hours} h`).join(' + ')

/** What a candy can finish (full-rate seconds to each screen's next milestone), from the same models the Potions, Tilling,
 *  Training and Spelunking pages use, and `rate`: real hours away one candy hour saves there. Candy pays the watching rate on
 *  Apothecary, Tilling and training (docs/candy.md) while real time away pays away %, so a candy hour = 100 / away % real hours.
 *  Spelunking would pay a candy hour as 1 real hour (its load adds SpeedperHour × AwayTimeRewarded / 3600, no away-% factor,
 *  @29951600 †), but the candy menu can't target it: its 14 areas map to screens 1-10, 14-17 only (@14755745 †), not 22. */
export type CandyGoal = { use: string; secs: number; rate: number }
export function candyGoals(s: Save): CandyGoal[] {
  const away = awayPercent(s) ?? 30, other = 100 / Math.max(away, 1e-9), out: CandyGoal[] = []
  const type = (s.PotionType as number[] | undefined) ?? [], exp = (s.PotionEXP as number[] | undefined) ?? [], req = (s.PotionEXPreq as number[] | undefined) ?? []
  const bars = [1, 2, 3, 4, 5, 6].map((c) => { const t = n(type[c]), r = t ? brewRate(s, c) : 0; return r ? Math.max(0, n(req[t]) - n(exp[t])) / r : 0 })
  const brew = Math.max(0, ...bars.filter(Number.isFinite))
  if (brew > 0) out.push({ use: 'Apothecary: fill every brew bar', secs: brew, rate: other })
  const t = withTilling(withDeckLinks(s)), plan = cropPlan(t, away)
  const till = plan ? plan.steps.reduce((a, x) => a + x.secs, 0) * away / 100 : 0
  if (till > 0) out.push({ use: 'Tilling: grow the crop plan', secs: till, rate: other })
  const frac = Math.max(away / 100, 1e-9)
  for (const a of ARENAS) { const r = rates(s, a), secs = toLevel(s, a) / Math.max(r.away / frac, 1e-9); if (secs > 0 && Number.isFinite(secs)) out.push({ use: `${a.name}: next level`, secs, rate: other }) }
  return out
}

/** Best use of one candy of `secs`: the most real time saved, rate × the candy time spent up to the milestone. Ties go to the snuggest fit. ponytail: real time saved
 *  is the common unit; what each screen's milestone is worth to you isn't weighed. */
export function bestCandyUse(goals: CandyGoal[], secs: number) {
  const saved = (g: CandyGoal) => g.rate * Math.min(secs, g.secs) / 3600
  const g = [...goals].sort((a, b) => saved(b) - saved(a) || Math.abs(a.secs - secs) - Math.abs(b.secs - secs))[0]
  return g ? { ...g, used: Math.min(1, g.secs / secs), savedHours: saved(g) } : null
}
