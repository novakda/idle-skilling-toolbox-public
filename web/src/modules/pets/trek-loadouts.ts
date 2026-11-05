// Trekking loadouts (#2756): the best saved trek team for each focus. docs/trekking.md has the mechanics and offsets.
// A loadout is a saved trek team, like a card deck: LoadoutArray[k + 8·(L−1)] (k = 1..8 → positions 1-6, 19, 20) for
// loadouts L = 1..4, LoadoutSelected the active one. Selecting a loadout places only pets that are idle (PetStatus 0) †,
// so a loadout can draw on idle and trekking pets, never nest parents or capsule pets.
// Each focus is a per-kill payout × kills/min, and kills/min comes from the trek simulation (pet-combat.ts):
// - fight: kills/min on the selected monster.
// - loot: vessels/h = kills/h × vesselsPerKill (Loot gene, Discovery combo) on the selected monster.
// - exp: Trekking EXP/h = kills/h × expPerKill (Trekkery gene) on the selected monster.
// - travel: distance/min = kills/min × killDistance (Swiftness, Incubation combo, Trekkery combo) on the frontier monster: only
//   the frontier pays distance †.
import { petGenes, petValueTotals, GENES, invText, type Pet } from './pets'
import { bestTeam, killDistance, openSlots, simulateTrek, teamOf, vesselsPerKill, withTeam, type Team } from './pet-combat'
import { masteryBonuses } from '../../bus'
import { current } from '../../screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

export type FocusId = 'fight' | 'loot' | 'travel' | 'exp'
/** genes: the support genes whose count the focus's per-kill payout reads (fight has none: it is kills/min alone). */
export const FOCUSES: { id: FocusId; label: string; unit: string; what: string; genes: number[] }[] = [
  { id: 'fight', label: 'Fight', unit: 'kills/min', what: 'kills per minute on the selected monster', genes: [] },
  { id: 'loot', label: 'Loot', unit: 'vessels/h', what: 'vessels per hour on the selected monster (kills × Loot gene, Discovery combo)', genes: [15, 18] },
  { id: 'travel', label: 'Travel', unit: 'distance/min', what: 'distance per minute on the frontier monster (kills × Swiftness, Incubation combo, Trekkery combo)', genes: [13, 14, 20] },
  { id: 'exp', label: 'EXP', unit: 'Trekking EXP/h', what: 'Trekking EXP per hour on the selected monster (kills × Trekkery gene)', genes: [20] },
]

const selectedMonster = (s: Save) => n(s.MonsterSelected) + 5 * (n(s.MonsterPageSelected) - 1)
/** The save with monster `id` selected (5 per page). */
const onMonster = (s: Save, id: number): Save => { const page = Math.ceil(id / 5); return { ...s, MonsterPageSelected: page, MonsterSelected: id - 5 * (page - 1) } }

/** Trekking EXP one kill pays (kill handler @27289245 †, every kill while PetHP > 0, frontier or not, like vessels):
 *  (id + floor(id/10)² + floor(id/8))·1.08^floor(id/5) · (1 + PVT[20]/100) · TankBonusLIST[25] · MasteryBonuses[11] · (1 + 200·P/(P+175)/100), P = PotionLV[130]. */
export function expPerKill(save: Save, id = selectedMonster(save)) {
  const p = n(arr(save, 'PotionLV')[130]), tank = arr(save, 'TankBonusLIST')
  return (id + Math.floor(id / 10) ** 2 + Math.floor(id / 8)) * 1.08 ** Math.floor(id / 5) * (1 + n(petValueTotals(save)[20]) / 100)
    * (tank.length ? n(tank[25]) : 1) * n(current(save, 'MasteryBonuses', () => masteryBonuses(save))[11]) * (1 + (200 * p) / (p + 175) / 100)
}

/** The focus value of `team` (`seconds` of simulated trekking). */
export function focusValue(save: Save, team: Team, focus: FocusId, seconds = 600): number {
  if (focus === 'travel') {
    const s = onMonster(save, n(save.PetDistanceLV))
    return simulateTrek(s, team, seconds).killsPerMin * killDistance(withTeam(s, team))
  }
  const kpm = simulateTrek(save, team, seconds).killsPerMin, s = withTeam(save, team), id = selectedMonster(save)
  return focus === 'fight' ? kpm : focus === 'loot' ? kpm * 60 * vesselsPerKill(s, id) : kpm * 60 * expPerKill(s, id)
}

/** A pet a loadout can place: idle or already trekking (status 0/2) †. */
export const loadoutEligible = (p: Pet) => p.status === 0 || p.status === 2

/** Saved loadouts 1-4: position → inventory slot (0 = empty). */
export function savedLoadouts(save: Save): Team[] {
  const la = arr(save, 'LoadoutArray'), pos = [1, 2, 3, 4, 5, 6, 19, 20]
  return [1, 2, 3, 4].map((L) => Object.fromEntries(pos.map((p, k) => [p, n(la[k + 1 + 8 * (L - 1)])])))
}

export interface LoadoutPick { pos: number; role: string; pet: Pet | null; was: Pet | null; why: string }
export interface Lever { gene: number; name: string; now: number; next: number; gain: number; carriers: number; note: string }
export interface FocusResult { focus: (typeof FOCUSES)[number]; monster: number; team: Team; now: number; best: number; gain: number
  picks: LoadoutPick[]; savedIn: number | null; nest: { value: number; pets: Pet[] } | null; levers: Lever[] }

/** Best loadout per focus from the pets a loadout can place, vs the current trek team. quickSeconds = sim length inside the search. */
export function bestLoadouts(save: Save, pets: Pet[], focuses: FocusId[] = FOCUSES.map((f) => f.id), quickSeconds = 120): FocusResult[] {
  const open = openSlots(save), cur = teamOf(save), bySlot = new Map(pets.map((p) => [p.slot, p])), saved = savedLoadouts(save)
  const sameSet = (a: Team, b: Team) => ['fighter', 'support'].every((r) => { const ps = open.filter((s) => s.role === r).map((s) => s.p); return ps.map((p) => n(a[p])).sort().join() === ps.map((p) => n(b[p])).sort().join() })
  return focuses.map((id) => {
    const focus = FOCUSES.find((f) => f.id === id)!
    const quick = (t: Team) => focusValue(save, t, id, quickSeconds)
    const raw = bestTeam(save, pets, [cur, ...saved.filter((t) => Object.values(t).some(Boolean))], quick, loadoutEligible)
    // Keep pets that stay put, so the picks show real swaps (slots fill in add order; only the set per role matters).
    const team = { ...cur }
    for (const role of ['fighter', 'support']) {
      const ps = open.filter((s) => s.role === role).map((s) => s.p), want = ps.map((p) => raw[p]!)
      const stay = ps.filter((p) => want.includes(cur[p]!)), add = want.filter((x) => !stay.some((p) => cur[p] === x))
      ps.filter((p) => !stay.includes(p)).forEach((p, i) => (team[p] = add[i]!))
    }
    const now = focusValue(save, cur, id), best = Math.max(focusValue(save, team, id), now)
    const final = best > now ? team : cur
    const g = petGenes(withTeam(save, final))
    const picks: LoadoutPick[] = open.map((s) => {
      const pet = bySlot.get(n(final[s.p])) ?? null, was = bySlot.get(n(cur[s.p])) ?? null
      return { pos: s.p, role: s.role, pet, was, why: pet ? why(pet, s.role, focus.genes, g, pet !== was) : 'no pet available' }
    })
    // A nest parent the loadout can't place: worth taking out of its nest? (search with nest parents allowed, capsules still out)
    const withNest = bestTeam(save, pets, [final], quick, (p) => p.group !== 'Research')
    const nv = focusValue(save, withNest, id), extra = open.map((s) => bySlot.get(n(withNest[s.p]))).filter((p): p is Pet => !!p && !loadoutEligible(p))
    const savedIn = saved.findIndex((t) => sameSet(t, final))
    return { focus, monster: id === 'travel' ? n(save.PetDistanceLV) : selectedMonster(save), team: final, now, best, gain: now > 0 ? best / now - 1 : 0, picks,
      savedIn: savedIn >= 0 ? savedIn + 1 : null, nest: extra.length && nv > best * 1.001 ? { value: nv, pets: extra } : null,
      levers: levers(save, final, focus.genes, pets) }
  })
}

/** Compact reason for one pick: its genes that the focus reads, else its role. */
function why(p: Pet, role: string, focusGenes: number[], g: number[], swapped: boolean) {
  const hit = p.genes.filter((x) => focusGenes.includes(x)).map((x) => `${GENES[x]} (team ${n(g[x])})`)
  const attack = p.genes.filter((x) => x >= 1 && x <= 10).map((x) => GENES[x])
  const base = hit.length ? hit.join(', ') : role === 'fighter' && attack.length ? `attack: ${attack.join(', ')}, L${p.level}` : `L${p.level}${p.genes.length ? `, ${p.genes.map((x) => GENES[x]).join('+')}` : ''} (kills/min)`
  return `${swapped ? '' : 'keep · '}${base}${swapped ? ` · ${p.group === 'Idle' ? invText(p.slot) : p.group}` : ''}`
}

/** One more of each focus gene on this team: the per-kill payout gain (kills/min held fixed), and how many owned pets carry it. */
function levers(save: Save, team: Team, genes: number[], pets: Pet[]): Lever[] {
  const s = withTeam(save, team), g = petGenes(s), inTeam = new Set(Object.values(team))
  return genes.map((gene) => {
    // +1, or up to the next combo tier when one more adds nothing (Discovery, Incubation and Trekkery-for-travel only pay per tier)
    const at = (k: number) => { const more = [...g]; more[gene] = n(more[gene]) + k; return geneFactor(save, s, more, genes) / geneFactor(save, s, g, genes) - 1 }
    let add = 1; while (add < 3 && at(add) < 1e-9 && (n(g[gene]) + add) % 3 !== 0) add++
    const gain = at(add)
    const species = new Set(pets.filter((p) => inTeam.has(p.slot)).map((p) => p.name))
    const spare = pets.filter((p) => p.genes.includes(gene) && !inTeam.has(p.slot)), placeable = spare.filter(loadoutEligible)
    const carriers = placeable.length, clash = placeable.every((p) => species.has(p.name)), nested = spare.filter((p) => p.status === 1).length
    const next = n(g[gene]) + add, combo = next % 3 === 0 && next <= 9 ? ` (combo tier ${next / 3})` : ''
    return { gene, name: GENES[gene]!, now: n(g[gene]), next, gain, carriers,
      note: `${carriers ? (clash ? `the ${carriers} idle carrier${carriers > 1 ? "s are" : " is"} a species already in the team (one per species)` : `${carriers} idle pet${carriers > 1 ? "s" : ""} carry it, but no team with one scored higher`) : nested ? `only nest parents (${nested}) carry it` : "no spare pet carries it: breed or hatch one"}${combo}` }
  })
}

/** The team-dependent per-kill factor of a focus from gene counts gg (kills/min held fixed). */
function geneFactor(save: Save, s: Save, gg: number[], genes: number[]) {
  const v = petValueTotals(s, gg), tier = (x: number) => Math.min(Math.floor(x / 3), 3)
  if (genes.includes(15)) return 1 + n(v[15]) / 100 // loot
  if (genes.includes(13)) return (1 + n(v[14])) * (1 + n(v[13])) * (1 + (tier(n(gg[20])) * n(save.TrekkingLV)) / 100) // travel
  return 1 + n(v[20]) / 100 // exp
}
