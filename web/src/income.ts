import shrineTable from './data/shrines.json'
import * as NX from './next-types'
export type Snap = { t: number; shrine: number[] }

/** Income per hour per slot: latest snapshot vs the oldest from the last 24h that is 5+ min older. */
export function incomeRates(h: Snap[]): { hours: number; perHour: number[] } | null {
  const last = h.at(-1)
  const ref = last && h.find((x) => x.t >= last.t - 864e5 && last.t - x.t >= 3e5)
  if (!last || !ref) return null
  const hours = (last.t - ref.t) / 36e5
  return { hours, perHour: last.shrine.map((v, i) => (v - (ref.shrine[i] ?? 0)) / hours) }
}

/** Hours until `need` is affordable: 0 = now, Infinity = no positive income observed. */
export function hoursUntil(have: number, need: number, perHour: number): number {
  if (need <= have) return 0
  return perHour > 0 ? (need - have) / perHour : Infinity
}

/** Rate a fresh run is expected to earn, for the reset rule "reset when the recent rate drops below it" (renewal
 *  reward: a cycle pays v(h) over h + downtime hours, so the best cycle rate is max v/(h + down)). Uses the
 *  previous run's snapshots when there are any, since they include its slow start from the reset levels; else
 *  this run's. Runs usually get faster (more perks), so this target is a floor and the verdict can be late. */
export function resetTarget(prev: { h: number; v: number }[], cur: { h: number; v: number }[], downH: number) {
  const src = prev.length ? prev : cur
  if (!src.length) return null
  return { rate: Math.max(...src.map((s) => s.v / (s.h + downH))), from: prev.length ? 'previous run' : 'this run' }
}

// ---- Shrines tab: costs from data/shrines.json (src/derive-shrines.ts), per shrine + level.
export type ShrineCost = { cost1: number; cur1: number; cost2: number; cur2: number }
export type ShrineTable = { currency: Record<string, string>; shrines: { id: number; name: string; levels: ShrineCost[] }[] }
/** Base buy cap. The buy handler (@26764049, SceneEvents_40) allows a level while lv < round(50 + _ShrineExtraLvList[sel]); the list
 *  is built at @26400580: shrines 2 and 4 get ceil(TankBonusLIST[49]), shrines 6 and 9 get ceil(TankBonusLIST[50]), the rest 0.
 *  Shrine 6 also refuses past level 80. */
export const SHRINE_MAX_LV = 50
export function shrineMax(save: Record<string, unknown>, id: number): number {
  const tank = (save.TankBonusLIST as number[] | undefined) ?? []
  const extra = id === 2 || id === 4 ? tank[49] : id === 6 || id === 9 ? tank[50] : 0
  const cap = Math.round(SHRINE_MAX_LV + Math.ceil(Number(extra) || 0))
  return id === 6 ? Math.min(cap, 81) : cap
}

/** Cloud saves lack ShrineCurrencyOwned: the game fills it from asylum traces, slot i = AsylumTracesOwned[i - 1]
 *  for slots 2-11 (shrine click handler in the game code). */
export function shrineOwned(save: Record<string, unknown>): number[] {
  const direct = save.ShrineCurrencyOwned as number[] | undefined
  if (direct?.length) return direct
  const traces = (save.AsylumTracesOwned as number[]) ?? []
  return Array.from({ length: 12 }, (_, i) => (i >= 2 && i <= 11 ? traces[i - 1] ?? 0 : 0))
}

/** Per shrine: level, next cost, levels buyable now (spending on that shrine alone) and hours until the next level. */
export function shrineRows(save: Record<string, unknown>, table: ShrineTable, perHour: number[] = []) {
  const owned = shrineOwned(save), levels = (save.ShrineLevels as number[]) ?? []
  const eta = (slot: number, need: number) => hoursUntil(owned[slot] ?? 0, need, perHour[slot] ?? 0)
  return table.shrines.map((s) => {
    const lv = levels[s.id] ?? 0, max = shrineMax(save, s.id)
    const next = s.levels[lv]
    // ponytail: buys levels of this shrine alone; shrines sharing a currency compete for it
    const wallet = [...owned]
    let buyable = 0
    for (let l = lv; l < max && s.levels[l]; l++) {
      const c = s.levels[l]!
      if ((wallet[c.cur1] ?? 0) < c.cost1 || (wallet[c.cur2] ?? 0) < c.cost2) break
      wallet[c.cur1]! -= c.cost1
      wallet[c.cur2]! -= c.cost2
      buyable++
    }
    const wait = next && lv < max ? Math.max(eta(next.cur1, next.cost1), eta(next.cur2, next.cost2)) : undefined
    return { ...s, lv, max, next: lv < max ? next : undefined, buyable, wait }
  })
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'shrines', title: 'Shrines', src: 'income.ts shrineRows', fn: (s, x) => {
    const rows = shrineRows(s, shrineTable as ShrineTable, incomeRates((x.history as Snap[] | undefined) ?? [])?.perHour)
    const buy = rows.filter((r) => r.buyable > 0).sort((a, b) => b.buyable - a.buyable)
    if (buy.length) return buy.slice(0, 5).map((r) => ({ text: `Level ${r.name} +${r.buyable}`, why: `Lv ${r.lv} → ${r.lv + r.buyable} affordable now (spending on it alone)` }))
    return rows.filter((r) => r.wait !== undefined).sort((a, b) => a.wait! - b.wait!).slice(0, 3)
      .map((r) => ({ text: `Next: ${r.name} Lv ${r.lv + 1}`, why: isFinite(r.wait!) ? `affordable in ${NX.hrs(r.wait!)}` : 'not affordable; no shrine income measured yet (needs saves 5+ min apart)' }))
  }}
