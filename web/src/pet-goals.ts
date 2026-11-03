// Pets goal (#2755): what the Plan tab optimizes for. Each goal re-ranks the same game data the Pets page already ports:
// nest hatch odds and egg timers (nestBreeding †), child levels (breedingPlan †), vessels per hour (vesselFarm †).
// "balanced" is the page as it was: no goal panel, nothing re-ranked.
import { nestBreeding, petsView, type Pet } from './pets'
import { breedingPlan, withPair } from './pet-breeding'
import type { vesselFarm } from './pet-combat'

type Save = Record<string, unknown>
type View = ReturnType<typeof petsView>
export const GOAL_KEY = 'idle-skilling.petGoal'
export const GOALS = [
  { id: 'balanced', label: 'Balanced (default)', blurb: 'The plan as it was: trash, hatch, swap. Nothing re-ranked.', disabled: '' },
  { id: 'new', label: 'Get new pets', blurb: 'Ranks nests by the chance a hatch is a new species (the higher parent + 1) and picks the owned pair that maximizes it.', disabled: '' },
  { id: 'upgrade', label: 'Upgrade existing pets', blurb: 'Ranks nests by expected child level and picks the owned pair with the highest one (a pet\'s level is fixed at hatch).', disabled: '' },
  { id: 'speed', label: 'Faster breeding', blurb: 'Ranks nests by eggs per hour: the egg timer follows the slower parent species (lower id lays faster) and Incubation genes.', disabled: '' },
  { id: 'vessels', label: 'More vessels', blurb: 'Ranks trek monsters by vessels per hour for the current team, per colour.', disabled: '' },
] as const
export type GoalId = (typeof GOALS)[number]['id']
export const isGoal = (x: unknown): x is GoalId => GOALS.some((g) => g.id === x && !g.disabled)
export const loadGoal = (): GoalId => { try { const g = localStorage.getItem(GOAL_KEY); return isGoal(g) ? g : 'balanced' } catch { return 'balanced' } }
export const saveGoal = (g: GoalId) => { try { localStorage.setItem(GOAL_KEY, g) } catch { /* not persisted */ } }

export interface GoalRow { n: number | null; title: string; now: string; best: string; gain: number; why: string }
export interface GoalPlan { id: GoalId; headline: string; rows: GoalRow[] }

const label = (p: Pet) => `${p.name} L${p.level}`
const pairText = (ps: Pet[]) => ps.map(label).join(' + ')
const lv = (ps: Pet[]) => ps.reduce((t, p) => t + p.level, 0) // tie-break: equal score, keep the higher-level pair
const KEEP = 'keep the current pair'
const pc = (x: number) => `${x < 10 ? x.toFixed(2) : x.toFixed(1)}%`
const hrs = (sec: number) => 3600 / sec

/** Per nest, the owned pair (idle or already a nest parent, no pet in two nests) with the best `score`, ranked by gain over
 *  the current pair. ponytail: greedy by nest order of best score, all pairs scored through the game's own nestBreeding;
 *  fine for ~60 pets, dedupe by species/genes if the pool grows. */
function byNest(save: Save, v: View, score: (b: ReturnType<typeof nestBreeding>, nest: View['nests'][number]) => number, show: (x: number) => string) {
  const pool = v.pets.filter((p) => p.group === 'Idle' || p.group.startsWith('Nest ')), used = new Set<number>()
  const sc = (nest: View['nests'][number], pair: Pet[]) => score(nestBreeding(withPair(save, nest.n, pair), nest.n), nest)
  const rows: (GoalRow & { s: number })[] = []
  const done = new Map<number, GoalRow & { s: number }>()
  const order = [...v.nests].sort((a, b) => b.levels[0]! - a.levels[0]!)
  for (const nest of order) {
    const cur = nest.parents.every(Boolean) ? sc(nest, nest.parents as Pet[]) : null
    const free = pool.filter((p) => !used.has(p.slot))
    let best: { pair: Pet[]; s: number } | null = null
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const s = sc(nest, [free[i]!, free[j]!])
      if (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && lv([free[i]!, free[j]!]) > lv(best.pair))) best = { pair: [free[i]!, free[j]!], s }
    }
    // No gain over the current pair: say keep it, and take its pets out of the pool for the other nests.
    const keep = best != null && cur != null && best.s <= cur + 0.005
    if (keep) best = { pair: nest.parents as Pet[], s: cur! }
    if (best) for (const p of best.pair) used.add(p.slot)
    if (best) done.set(nest.n, { n: nest.n, title: `Nest ${nest.n}`, now: nest.parents.every(Boolean) ? `${pairText(nest.parents as Pet[])}: ${show(cur!)}` : 'empty', best: keep ? KEEP : `${pairText(best.pair)}: ${show(best.s)}`,
      gain: cur == null ? best.s : keep ? 0 : best.s - cur, why: '', s: best.s })
  }
  for (const nest of v.nests) if (done.has(nest.n)) rows.push(done.get(nest.n)!)
  return rows.sort((a, b) => b.gain - a.gain || b.s - a.s)
}

export function goalPlan(save: Save, v: View, goal: GoalId, farm: ReturnType<typeof vesselFarm> | null = null): GoalPlan {
  const g = GOALS.find((x) => x.id === goal)!
  if (goal === 'new') {
    // Chance per hatch of species hi+1 while that species is not in the Codex yet (else a hatch discovers nothing: 0), weighted over
    // the eggs waiting in the nest (none: a fresh rarity-1 egg †).
    const unlocked = (save.PetUnlocked as number[] | undefined) ?? []
    const rar = (n: number) => { const r = v.nests.find((x) => x.n === n)?.rarities; return r?.length ? r : [1] }
    const rows = byNest(save, v, (b, nest) => { const rs = rar(nest.n); return b.newSpecies == null || unlocked[b.newSpecies] ? 0 : rs.reduce((t, r) => t + b.hatch[Math.min(r, 5) - 1]!.newPct, 0) / rs.length }, pc)
    // Gain 0 with s > 0 means the current pair is already the best and can still discover: say so, never "can't".
    for (const r of rows) r.why = r.gain > 0.005 ? `+${pc(r.gain)} new-species chance per hatch`
      : r.s > 0 ? `already the best pair here: ${pc(r.s)} per hatch for a new species (tiny odds at this species tier)`
      : 'no owned pair gets further: the next species is owned or out of reach'
    const top = rows.find((r) => r.gain > 0.005)
    const can = [...rows].sort((a, b) => b.s - a.s).find((r) => r.s > 0)
    const headline = top ? `Best for new pets: ${top.title}, ${top.best}.`
      : can ? `Your nests are already set up for new species: best is ${can.title} at ${pc(can.s)} per hatch. Odds this low come from the species tier, not the pairing.`
      : 'No nest can discover a new species with the pets you own: the species above each pair is already in your Codex (or past the species cap †).'
    return { id: goal, headline, rows }
  }
  if (goal === 'upgrade') {
    const plan = breedingPlan(save, v)
    const rows: GoalRow[] = plan.nests.filter((x) => x.best).map((x) => { const up = (x.gain ?? x.best!.mean) > 0.05
      return { n: x.n, title: `Nest ${x.n}`, now: x.now ? `${pairText(x.now.pair)}: Lv ${x.now.mean.toFixed(1)}` : 'empty',
        best: up ? `${pairText(x.best!.pair)}: Lv ${x.best!.mean.toFixed(1)} (${x.best!.low}–${x.best!.high})` : KEEP, gain: up ? x.gain ?? x.best!.mean : 0,
        why: up ? `+${(x.gain ?? x.best!.mean).toFixed(1)} expected child levels` : 'no owned pair does better' } }).sort((a, b) => b.gain - a.gain)
    return { id: goal, headline: plan.verdict, rows }
  }
  if (goal === 'speed') {
    const rows = byNest(save, v, (b) => hrs(b.eggSec), (x) => `${x.toFixed(2)} eggs/h`)
    for (const r of rows) r.why = r.gain > 0.005 ? `+${r.gain.toFixed(2)} eggs per hour; the child stays in the lower species ids, so check new-species odds too` : 'no owned pair lays faster'
    return { id: goal, headline: rows.length ? `Fastest: ${rows[0]!.title}, ${rows[0]!.best}.` : 'No pair to breed.', rows }
  }
  if (goal === 'vessels') {
    const rows: GoalRow[] = (farm?.colours ?? []).map((c) => ({ n: null, title: `${c.name} vessels`, now: farm!.current && farm!.current.colour === c.colour ? `monster ${farm!.current.monster}: ${Math.round(farm!.current.live).toLocaleString()}/h` : 'not farming',
      best: `monster ${c.best.monster}: ${Math.round(c.best.live).toLocaleString()}/h`, gain: farm!.current && farm!.current.colour === c.colour ? c.best.live - farm!.current.live : c.best.live,
      why: c.best.frontier ? 'the frontier monster, it keeps advancing' : `stops paying at the frontier (${farm!.frontier})` })).sort((a, b) => b.gain - a.gain)
    return { id: goal, headline: rows.length ? `Most vessels per hour: ${rows[0]!.title} from ${rows[0]!.best}.` : 'No vessel data.', rows }
  }
  return { id: 'balanced', headline: g.blurb, rows: [] }
}
