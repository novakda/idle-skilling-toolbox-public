// Genes planner (#2764): every gene across the whole pet inventory, which ones matter, and the next actions that add the most
// useful copies. Mechanics (all †, docs/pets.md §1b "Genes"): gene 1 is the child species' own gene; the 2nd and 3rd genes are
// drawn from a pool of the PARENTS' genes (deduped) plus two neighbour species' genes, so genes do inherit. Combos are tiers of
// 3/6/9 copies counted on the current trek team (petGenes); GeneticComboFound only records that a tier was reached once.
import data from './data/codex.json'
import { GENES, geneOdds, nestBreeding, petGenes, petsView, statusName, type Pet } from './pets'
import { withPair } from './pet-breeding'
import { openSlots } from './pet-combat'
import { claim } from './codex'

type Save = Record<string, unknown>
type View = Pick<ReturnType<typeof petsView>, 'pets' | 'nests' | 'trash' | 'free' | 'eggsWaiting'>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const SPECIES_GENE = (data as unknown as { gene: number[] }).gene // _specificGENE[species id] †
const tierOf = (c: number) => Math.min(Math.floor(c / 3), 3)

/** What each gene is for, and a usefulness weight U (3 = pays every day for the author's loop, 1 = niche). ponytail: a fixed table
 *  read off the effect code (docs/pets.md §5, docs/trekking.md), not a simulation; attack moves get U 3 only when a current
 *  fighter fires them (a combo multiplies a move the team uses). Tune the numbers here. */
export const USES: Record<number, { use: string; U: number; why: string }> = {
  1: { use: 'fight', U: 1, why: 'Fire Fist 150% move; combo 250/350/550%' },
  2: { use: 'fight', U: 1, why: 'Curse Skull: +10% stacking damage; combo adds curse chance to all attacks' },
  3: { use: 'fight', U: 1, why: 'Healing 5% HP per cast' },
  4: { use: 'fight', U: 1, why: 'Boomerang 180% move' },
  5: { use: 'fight', U: 1, why: 'Life Leech 200% + heal; combo +1.5% dmg per 1% HP missing per tier' },
  6: { use: 'fight', U: 1, why: 'Bubbler, grows in flight' },
  7: { use: 'fight', U: 1, why: 'Snipe 1200% (50% miss); combo raises the multiplier' },
  8: { use: 'fight', U: 1, why: 'Radiation: +100% to the next hit per copy' },
  9: { use: 'fight', U: 1, why: 'Rattlin Gun ramp' },
  10: { use: 'fight', U: 1, why: 'Zeus Bolt 250%, crits' },
  11: { use: 'fight', U: 2, why: 'Health: +25% team HP per copy, combo more' },
  12: { use: 'fight', U: 2, why: 'Perception: +crit chance, combo +100 per tier' },
  13: { use: 'travel', U: 2, why: 'Swiftness: distance per kill (travel focus)' },
  14: { use: 'breed', U: 3, why: 'Incubation: ×1.4 egg speed per copy on a nest parent; combo tier adds travel' },
  15: { use: 'loot', U: 2, why: 'Loot: +25% vessels per copy (loot focus)' },
  16: { use: 'fight', U: 1, why: 'Evasive: dodge; its combo text has no code' },
  17: { use: 'fight', U: 2, why: 'Enthusiasm: +5% attack speed, +10% damage per tier' },
  18: { use: 'breed', U: 3, why: 'Discovery: ×1.25 new-species odds per copy on a nest parent; combo multiplies Loot' },
  19: { use: 'fight', U: 1, why: 'Defender: −5% damage taken per copy' },
  20: { use: 'exp', U: 2, why: 'Trekkery: +20% Trekking EXP per copy; combo tier adds travel' },
  21: { use: 'fight', U: 2, why: 'Snapzi: crit damage' },
  22: { use: 'fight', U: 2, why: 'Genesis: chance of a second cast' },
  23: { use: 'fight', U: 1, why: 'SoulBound: no effect but its combo re-counts fighter genes' },
  24: { use: 'lab', U: 1, why: 'Ionize: capsule pet EXP, per capsule pet (no team count)' },
  25: { use: 'fight', U: 2, why: 'Respawn: monsters respawn faster (raises the kills/min cap)' },
  26: { use: 'fight', U: 2, why: 'Abominable: damage, crit, HP and travel at once' },
}

export interface Outcome { species: number; genes: number[]; p: number }

/** The pool the 2nd/3rd gene is drawn from († pool build @27716561, a 9-pass loop that adds each value once): parent A gene 1,
 *  B gene 1, A gene 2, B gene 2, A gene 3, B gene 3 (genes > 0), then species gene of max(ids)+1 (or of min(ids)+1 when the
 *  higher id ≥ 45), then of max(min(ids) − 1, 1) (only while the higher id < 45). An egg of rarity > 5 replaces it with
 *  9, 10, 20, 21, 22, 23, 24, 25, 26, 1 (@27735361). */
export function genePool(a: Pet, b: Pet, rarity = 1): number[] {
  if (rarity > 5) return [9, 10, 20, 21, 22, 23, 24, 25, 26, 1]
  const pool: number[] = [], add = (g: number | undefined) => { if (g && g > 0 && !pool.includes(g)) pool.push(g) }
  for (const k of [0, 1, 2]) { add(a.genes[k]); add(b.genes[k]) }
  const hi = Math.max(a.species, b.species), lo = Math.min(a.species, b.species)
  if (hi < 45) add(SPECIES_GENE[hi + 1]); else if (lo < 45) add(SPECIES_GENE[lo + 1])
  if (hi < 45) add(SPECIES_GENE[Math.max(lo - 1, 1)])
  return pool
}

/** Genes of one hatch, exact over every branch († @28094195): s2/s3 = 2nd/3rd gene chance (0-1, geneOdds).
 *  2nd, d100: 24% a copy of gene 1, 10% the −1 bug (empty), 5% nothing, 61% index i uniform over 0..pool length (i = length:
 *  nothing; pool[i] = gene 1: pool[max(i − 1, 1)] instead). 3rd only when the 2nd is a real gene: 14% copy gene 1, 11% copy
 *  gene 2, 9% bug, 5% nothing, 61% the pool (equal to gene 1 or 2: the same shift). */
export function rollGenes(g1: number, pool: number[], s2: number, s3: number): { genes: number[]; p: number }[] {
  const L = pool.length, out = new Map<string, { genes: number[]; p: number }>()
  const add = (genes: number[], p: number) => { if (p <= 0) return; const k = genes.join(); const o = out.get(k); if (o) o.p += p; else out.set(k, { genes, p }) }
  const pick = (i: number, avoid: number[]) => (i === L ? 0 : avoid.includes(pool[i]!) ? n(pool[Math.max(i - 1, 1)]) : pool[i]!)
  const seconds: [number, number][] = [[g1, 0.24], [0, 0.15]]
  for (let i = 0; i <= L; i++) seconds.push([pick(i, [g1]), 0.61 / (L + 1)])
  add([g1], 1 - s2)
  for (const [g2, p] of seconds) {
    if (!g2) { add([g1], s2 * p); continue }
    add([g1, g2], s2 * p * (1 - s3))
    const thirds: [number, number][] = [[g1, 0.14], [g2, 0.11], [0, 0.14]]
    for (let i = 0; i <= L; i++) thirds.push([pick(i, [g1, g2]), 0.61 / (L + 1)])
    for (const [g3, q] of thirds) add(g3 ? [g1, g2, g3] : [g1, g2], s2 * p * s3 * q)
  }
  return [...out.values()]
}

/** Every outcome of one egg from `pair` in nest nn: species (hatch odds † via nestBreeding) × genes, mixed over the egg rarities
 *  waiting there (none: a fresh rarity-1 egg). ponytail: rarity ≥ 6 eggs use the rarity-5 species odds (their own listener
 *  @28115390 is not ported here), but their fixed gene pool is used. */
export function hatchOutcomes(save: Save, nn: number, pair: [Pet, Pet], rarities: number[] = [1], odds = geneOdds(save)): Outcome[] {
  const b = nestBreeding(withPair(save, nn, pair), nn), [lo, hi] = [...pair].sort((x, y) => x.species - y.species) as [Pet, Pet]
  const rs = rarities.length ? rarities : [1], out: Outcome[] = []
  for (const r of rs) {
    const h = b.hatch[Math.min(r, 5) - 1]!, pool = genePool(pair[0], pair[1], r)
    const sp: [number, number][] = [[b.newSpecies ?? hi.species, h.newPct], [hi.species, h.higherPct], [lo.species, h.lowerPct]]
    for (const [species, pct] of sp) {
      if (pct <= 0) continue
      for (const g of rollGenes(n(SPECIES_GENE[species]), pool, odds.second / 100, odds.third / 100)) out.push({ species, genes: g.genes, p: (pct / 100) * g.p / rs.length })
    }
  }
  return out
}

/** Species whose own gene (gene 1 of every pet of that species) is g, with names: where a missing gene can come from. */
export const speciesWith = (g: number) => SPECIES_GENE.map((x, id) => (x === g && id < 85 ? id : -1)).filter((id) => id > 0)
  .map((id) => ({ id, name: String((data as unknown as { name: string[] }).name[id]).replace(/_/g, ' ') }))

const copies = (genes: number[], g: number) => genes.filter((x) => x === g).length

/** Most copies of gene g one team can field: the best pet per species (one per species on a team), top `slots` of them, plus
 *  the copies no pet supplies (construct 41 etc.: petGenes with an empty team). ponytail: one gene at a time (the 8 slots are
 *  shared across genes), slot-pack doubling ignored. */
function fieldable(best: Map<number, number>, slots: number, base: number) {
  return base + [...best.values()].sort((a, b) => b - a).slice(0, slots).reduce((t, c) => t + c, 0)
}

export interface GeneRow {
  id: number; name: string; use: string; U: number; why: string
  owned: number; carriers: { pet: Pet; copies: number; status: string }[]
  team: number; tier: number; found: boolean[]; field: number; fieldTier: number; next: number | null; short: number
  bestBySpecies: Map<number, number>; base: number
}

/** Inventory census: per gene, copies owned and on which pets, team count and tier now, tiers found, and the most a team could field. */
export function geneCensus(save: Save, v: Pick<View, 'pets'>): GeneRow[] {
  const team = petGenes(save), base = petGenes({ ...save, PetPositions: [] }), found = arr(save, 'GeneticComboFound'), slots = openSlots(save).length
  const fighters = new Set(openSlots(save).filter((s) => s.role === 'fighter').map((s) => n(arr(save, 'PetPositions')[s.p])))
  return GENES.slice(1).map((name, i) => {
    const id = i + 1, u = USES[id]!
    const carriers = v.pets.map((pet) => ({ pet, copies: copies(pet.genes, id), status: statusName(pet.status) })).filter((c) => c.copies > 0).sort((a, b) => b.copies - a.copies || b.pet.level - a.pet.level)
    const best = new Map<number, number>()
    for (const c of carriers) best.set(c.pet.species, Math.max(best.get(c.pet.species) ?? 0, c.copies))
    const b0 = n(base[id]), field = fieldable(best, slots, b0), fieldTier = tierOf(field), t = n(team[id])
    const U = id <= 10 && v.pets.some((p) => fighters.has(p.slot) && p.genes.includes(id)) ? 3 : u.U
    return { id, name, use: u.use, U, why: u.why, owned: carriers.reduce((s, c) => s + c.copies, 0), carriers, team: t, tier: tierOf(t),
      found: [1, 2, 3].map((k) => n(found[1 + 3 * (id - 1) + k - 1]) > 0), field, fieldTier, next: fieldTier >= 3 ? null : 3 * (fieldTier + 1),
      short: fieldTier >= 3 ? 0 : 3 * (fieldTier + 1) - field, bestBySpecies: best, base: b0 }
  })
}

/** Fieldable copies of gene g a hatch adds (capped at 9: copies past tier 3 do nothing), expected over the outcomes. */
export function fieldGain(row: GeneRow, outs: Outcome[], slots: number) {
  const before = Math.min(row.field, 9)
  let e = 0
  for (const o of outs) {
    const c = copies(o.genes, row.id)
    if (!c || c <= (row.bestBySpecies.get(o.species) ?? 0)) continue
    const m = new Map(row.bestBySpecies); m.set(o.species, c)
    e += o.p * (Math.min(fieldable(m, slots, row.base), 9) - before)
  }
  return e
}

export interface GeneAction { kind: 'field' | 'breed' | 'claim' | 'genetea' | 'trash'; title: string; detail: string; ev: number; why: string; gene?: number }

/** 2nd / 3rd gene chance at Genetea (potion id 155 = PotionLV[154]) level P †: × (1 + min(80P/(P+175), 60)%) and × (1 + min(50P/(P+175), 40)%). */
export function geneteaAt(save: Save, P: number) {
  const pl = [...arr(save, 'PotionLV')]; pl[154] = P
  return geneOdds({ ...save, PotionLV: pl })
}

/** The ranked plan. ev = useful fieldable copies expected within one day (U × copies), so a swap that adds 3 copies now beats a
 *  nest that adds 0.2 a day. ponytail: greedy, best target first takes its nest and pets; pairs from idle + nest pets, as the
 *  goal planner does. */
export function genePlan(save: Save, v: View) {
  const rows = geneCensus(save, v), slots = openSlots(save).length, odds = geneOdds(save), acts: GeneAction[] = []
  const label = (p: Pet) => `${p.name} #${p.slot} L${p.level}`
  // 1. Field: owned pets already reach a higher tier than the team has now. Trekking and idle carriers first; a nest parent
  // or capsule pet halves the value (pulling a parent clears that nest's eggs, a capsule pet stops banking days).
  const busy = (p: Pet) => p.status === 1 || p.status === 3
  for (const r of rows) if (r.U >= 2 && r.fieldTier > r.tier) {
    const picks = [...r.bestBySpecies].sort((a, b) => b[1] - a[1]).slice(0, slots)
      .map(([sp, c]) => r.carriers.filter((x) => x.pet.species === sp && x.copies === c).sort((a, b) => +busy(a.pet) - +busy(b.pet) || b.pet.level - a.pet.level)[0]!)
    const pulled = picks.filter((c) => busy(c.pet)).length
    acts.push({ kind: 'field', gene: r.id, title: `Field ${r.name} for combo tier ${r.fieldTier}`, ev: r.U * (Math.min(r.field, 9) - r.team) * (pulled ? 0.5 : 1),
      detail: picks.map((c) => `${label(c.pet)} ×${c.copies} (${c.status})`).join(', '),
      why: `team has ${r.team}, owned pets reach ${r.field}: tier ${r.tier} → ${r.fieldTier}${r.found[r.fieldTier - 1] ? '' : ' (first time: records the combo)'}; combos only work while fielded${pulled ? `; takes ${pulled} pet${pulled > 1 ? 's' : ''} out of a nest or capsule` : ''}. Check Trek loadouts for the kill cost` })
  }
  // 2. Breed: per useful gene short of the next tier, the owned pair and nest that add the most fieldable copies per visit.
  // the author's nests lay an egg every 10-45 min, so a nest fills up between visits: value = per egg × the eggs one visit finds
  // (the nest's egg cap, or 8 h of laying if that is fewer). Greedy: the best (gene, nest, pair) first, then the rest.
  const pool = v.pets.filter((p) => p.status === 0 || p.status === 1), used = new Set<number>(), nestsUsed = new Set<number>()
  const cache = new Map<string, { outs: Outcome[]; eggSec: number }>()
  const hatchAt = (nn: number, a: Pet, b: Pet, rar: number[]) => {
    const k = `${nn}:${a.slot}:${b.slot}:${rar.join()}`
    if (!cache.has(k)) cache.set(k, { outs: hatchOutcomes(save, nn, [a, b], rar, odds), eggSec: nestBreeding(withPair(save, nn, [a, b]), nn).eggSec })
    return cache.get(k)!
  }
  const perVisit = (nn: number, eggSec: number) => Math.min(Math.ceil(n(arr(save, 'MaxEggs')[nn])) || 1, Math.max(1, Math.floor((8 * 3600) / eggSec)))
  const canGive = (a: Pet, b: Pet, g: number) => genePool(a, b).includes(g) || [a.species, b.species, Math.max(a.species, b.species) + 1].some((s) => SPECIES_GENE[s] === g)
  let todo = rows.filter((r) => r.U >= 2 && r.fieldTier < 3)
  const breeds: GeneAction[] = []
  for (;;) {
    let best: { r: GeneRow; nn: number; a: Pet; b: Pet; perEgg: number; ev: number; eggs: number; eggSec: number; outs: Outcome[] } | null = null
    for (const r of todo) for (const nest of v.nests) {
      if (nestsUsed.has(nest.n)) continue
      const free = pool.filter((p) => !used.has(p.slot))
      // Both orders: parent A's genes enter the pool first, and the pool order decides what a pick equal to gene 1 shifts to.
      for (let i = 0; i < free.length; i++) for (let j = 0; j < free.length; j++) {
        const a = free[i]!, b = free[j]!
        if (i === j || !canGive(a, b, r.id)) continue // gene g is neither in the pool nor a possible child species' own gene
        const e = hatchAt(nest.n, a, b, nest.rarities), perEgg = fieldGain(r, e.outs, slots), eggs = perVisit(nest.n, e.eggSec), ev = r.U * perEgg * eggs
        if (perEgg > 0 && (!best || ev > best.ev + 1e-12)) best = { r, nn: nest.n, a, b, perEgg, ev, eggs, eggSec: e.eggSec, outs: e.outs }
      }
    }
    if (!best) break
    const { r, nn, a, b } = best
    used.add(a.slot); used.add(b.slot); nestsUsed.add(nn); todo = todo.filter((x) => x !== r)
    const cur = v.nests.find((x) => x.n === nn)!.parents, same = cur.every((p) => p && (p.slot === a.slot || p.slot === b.slot))
    const p2 = best.outs.filter((o) => copies(o.genes, r.id) >= 2).reduce((t, o) => t + o.p, 0), r5 = fieldGain(r, hatchOutcomes(save, nn, [a, b], [5], odds), slots)
    breeds.push({ kind: 'breed', gene: r.id, title: `Breed ${r.name} in Nest ${nn}`, ev: best.ev,
      detail: `${same ? 'keep ' : ''}Parent A ${label(a)}, Parent B ${label(b)}${same ? '' : ` (now ${cur.map((p) => (p ? label(p) : 'empty')).join(' + ')})`}: +${best.perEgg.toFixed(3)} fieldable ${r.name} per egg (rarity-5 egg: ${r5.toFixed(3)}), ${best.eggs} eggs per visit (one every ${Math.round(best.eggSec / 60)} min); ${(100 * p2).toFixed(1)}% of eggs carry 2+ copies`,
      why: `${r.name} fields ${r.field}, ${r.short} short of tier ${r.fieldTier + 1}; the child's 2nd/3rd gene comes from both parents' genes †${same ? '' : '; changing a parent clears that nest\'s eggs'}` })
  }
  acts.push(...breeds)
  // 3. Codex daily claim: a level-1 pet of a recorded species carrying its gene as gene 1 (one a day).
  const rec = new Set(arr(save, 'PetUnlocked').map((x, i) => (n(x) ? i : -1)).filter((i) => i >= 0)), c = claim(save)
  let bestClaim: GeneAction | null = null
  for (const r of rows) if (r.U >= 2 && r.fieldTier < 3) for (const sp of rec) {
    if (SPECIES_GENE[sp] !== r.id || (r.bestBySpecies.get(sp) ?? 0) >= 1) continue
    const gain = fieldGain(r, [{ species: sp, genes: [r.id], p: 1 }], slots), ev = r.U * gain
    if (gain > 0 && (!bestClaim || ev > bestClaim.ev)) bestClaim = { kind: 'claim', gene: r.id, title: `Codex claim: a ${data.name[sp]!.replace(/_/g, ' ')} for ${r.name}`, ev,
      detail: c.ready ? (c.free > 0 ? 'claim ready now' : 'claim ready, but the inventory is full') : `next claim in ${(c.wait / 3600).toFixed(1)} h`,
      why: `no owned ${data.name[sp]!.replace(/_/g, ' ')}: its gene 1 is ${r.name}, +${gain} fieldable (one claim a day)` }
  }
  if (bestClaim) acts.push(bestClaim)
  // 4. Genetea: more 2nd/3rd genes on every hatch. Worth = the extra share of the breeding actions above at Lv 50.
  const g50 = geneteaAt(save, 50), breedEv = breeds.reduce((t, a) => t + a.ev, 0)
  if (odds.second < 100) acts.push({ kind: 'genetea', title: 'Brew Genetea (potion 155)', ev: breedEv * (g50.second / Math.max(odds.second, 1e-9) - 1),
    detail: `Lv ${n(arr(save, 'PotionLV')[154])}: 2nd gene ${odds.second.toFixed(1)}%, 3rd ${odds.third.toFixed(1)}% → Lv 50: ${g50.second.toFixed(1)}% / ${g50.third.toFixed(1)}%`,
    why: 'raises every hatch\'s 2nd and 3rd gene chance (cap +60% / +40% at Lv 525); ev = the breeding rows above scaled by the 2nd-gene gain at Lv 50' })
  // 5. Trash gene duplicates: an idle pet whose genes a same-species pet already has (with repeats) adds nothing to any census row.
  const dups = geneDuplicates(v.pets)
  if (dups.length && v.free <= Math.max(v.eggsWaiting, 1)) {
    // Worth: each freed slot hatches one more egg of the best breeding row.
    const top = breeds[0], perEgg = top ? top.ev / Math.max(1, Number(/(\d+) eggs per visit/.exec(top.detail)?.[1] ?? 1)) : 0
    const agree = dups.filter((d) => v.trash.some((t) => t.pet.slot === d.pet.slot)).length
    acts.push({ kind: 'trash', title: `Trash ${dups.length} gene duplicate${dups.length > 1 ? 's' : ''} for egg room`, ev: perEgg * dups.length,
      detail: dups.map((d) => `${label(d.pet)} (${d.pet.genes.map((g) => GENES[g]).join('+') || 'no genes'}) = ${label(d.by)}${v.trash.some((t) => t.pet.slot === d.pet.slot) ? ' ✓ Plan' : ''}`).join('; '),
      why: `inventory ${v.free} free: each slot lets one more egg hatch (another gene roll) and these add no gene copies; ${agree} of ${dups.length} are also on the Plan's trash list (✓), the others it keeps for level or a role` })
  }
  acts.sort((a, b) => b.ev - a.ev)
  return { rows, actions: acts, odds, slots, dups, genetea: [0, 10, 50, 100, 525].map((P) => ({ P, ...geneteaAt(save, P) })) }
}

/** Idle pets whose gene multiset another pet of the same species covers (that pet keeps the species' genes on the census). */
export function geneDuplicates(pets: Pet[]) {
  const out: { pet: Pet; by: Pet }[] = []
  for (const p of pets) {
    if (p.status !== 0) continue
    const by = pets.filter((q) => q !== p && q.species === p.species && coversAll(q.genes, p.genes) && !out.some((d) => d.pet === q))
      .sort((a, b) => b.genes.length - a.genes.length || b.level - a.level)[0]
    // A tie (same genes) keeps the higher level: trash the lower one only.
    if (by && (by.genes.length > p.genes.length || by.level >= p.level)) out.push({ pet: p, by })
  }
  return out
}
const coversAll = (a: number[], b: number[]) => { const left = [...a]; return b.every((g) => { const i = left.indexOf(g); return i >= 0 && left.splice(i, 1).length > 0 }) }
