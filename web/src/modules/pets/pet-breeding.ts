// Breeding planner (#27): child level per nest, the best owned pair per nest, and eggs/time to a target level.
// Level roll, all † (Qno2x.js, pet scene, region-72 hatch listeners): rarity 1-5 eggs @28049476 (roll @28084032-28090907),
// rarity ≥ 6 eggs @28115390 (override @28141152). A pet's level never changes after the hatch, so this is the only way up.
import { nestBreeding, petsView, type Pet } from './pets'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** Child level range of one hatch †. a/b parent levels, ids parent species (_PetINDEX), r egg rarity, V nest Value, t20 TankBonusLIST[20].
 *  Rarity 1-5: level = ceil(randomInt(lo, hi) + 0.5 + r) = roll + r + 1 (randomInt is inclusive, swaps lo > hi);
 *  lo = trunc(min·k + (r−1)/7·|max − min·k|), k = 0.7 + t20/240;
 *  hi = trunc(min(max·(1 + r/100), max + max^(0.3 + m/130)·r) + (V / max(65 − m, 20))^1.5), m = higher parent id ≤ 70 (raid pets count 0).
 *  Rarity ≥ 6: ceil(1.03·(max + 6)), fixed. */
export function childLevel(a: number, b: number, ids: number[], r: number, V: number, t20: number) {
  const mn = Math.min(a, b), mx = Math.max(a, b)
  if (r >= 6) { const L = Math.ceil(1.03 * (mx + 6)); return { low: L, high: L, mean: L } }
  const k = 0.7 + t20 / 240, m = Math.max(0, ...ids.map((id) => (id <= 70 ? id : 0)))
  const lo = Math.trunc(mn * k + ((r - 1) / 7) * Math.abs(mx - mn * k))
  const hi = Math.trunc(Math.min(mx * (1 + r / 100), mx + mx ** (0.3 + m / 130) * r) + (V / Math.max(65 - m, 20)) ** 1.5)
  const [l, h] = lo <= hi ? [lo, hi] : [hi, lo]
  return { low: l + r + 1, high: h + r + 1, mean: (l + h) / 2 + r + 1 }
}

/** Level distribution of one egg, mixed over rarity weights: level → probability. */
function dist(a: number, b: number, ids: number[], weights: Map<number, number>, V: number, t20: number) {
  const out = new Map<number, number>()
  for (const [r, w] of weights) {
    const c = childLevel(a, b, ids, r, V, t20), p = w / (c.high - c.low + 1)
    for (let L = c.low; L <= c.high; L++) out.set(L, (out.get(L) ?? 0) + p)
  }
  return out
}
const mix = (a: number, b: number, ids: number[], w: Map<number, number>, V: number, t20: number) => {
  let low = Infinity, high = -Infinity, mean = 0
  for (const [r, p] of w) { const c = childLevel(a, b, ids, r, V, t20); low = Math.min(low, c.low); high = Math.max(high, c.high); mean += p * c.mean }
  return { low, high, mean }
}

/** Expected eggs until a child reaches level X, keeping the best two levels as parents (exact Markov chain on (a, b)).
 *  ponytail: species ids stay those of the starting pair (a child of the next species would raise m a little), genes and
 *  nest upgrades ignored. Infinity when X is out of reach. */
export function eggsTo(X: number, a: number, b: number, ids: number[], w: Map<number, number>, V: number, t20: number) {
  const memo = new Map<string, number>()
  const E = (a: number, b: number): number => {
    if (Math.max(a, b) >= X) return 0
    const lo = Math.min(a, b), hi = Math.max(a, b), key = `${lo},${hi}`
    if (memo.has(key)) return memo.get(key)!
    let stay = 0, rest = 1
    for (const [L, p] of dist(lo, hi, ids, w, V, t20)) {
      if (L <= lo) { stay += p; continue }
      rest += p * (L >= X ? 0 : E(Math.min(L, hi), Math.max(L, hi))) // keep the best two
    }
    const v = stay >= 1 - 1e-12 ? Infinity : rest / (1 - stay)
    memo.set(key, v)
    return v
  }
  return E(a, b)
}

/** The save as if `pair` sat in nest nn (what the game's own nest functions then read). */
export function withPair(save: Save, nn: number, pair: Pet[]): Save {
  const pos = [...arr(save, 'PetPositions')]; pos[7 + 2 * (nn - 1)] = pair[0]!.slot; pos[8 + 2 * (nn - 1)] = pair[1]!.slot
  const ints = [...arr(save, 'PetsOwnedINT')]; for (const p of pair) ints[p.slot] = p.species // nestBreeding reads PetsOwnedINT
  return { ...save, PetPositions: pos, PetsOwnedINT: ints }
}

const label = (p: Pet) => `${p.name} L${p.level}`

/** Per nest: the current pair's expected child, the best pair of owned idle/nest pets (no pet in two nests), and the gain.
 *  Rarity weights: the eggs waiting in that nest now (the next hatches), else a fresh rarity-1 egg (every new egg is laid at
 *  rarity 1 †). ponytail: no hatch-timing model (eggs keep rising a rarity while they wait, @28037269), so waiting is not credited. */
export function breedingPlan(save: Save, v: Pick<ReturnType<typeof petsView>, 'pets' | 'nests'> = petsView(save)) {
  const t20 = n(arr(save, 'TankBonusLIST')[20])
  const V = (nn: number) => n(arr(save, 'NestLevelsVSE')[3 * (nn - 1) + 1])
  const weights = (x: (typeof v.nests)[number]) => {
    const w = new Map<number, number>(), rs = x.rarities.length ? x.rarities : [1]
    for (const r of rs) w.set(r, (w.get(r) ?? 0) + 1 / rs.length)
    return w
  }
  const egg = (nn: number, pair: Pet[]) => nestBreeding(withPair(save, nn, pair), nn).eggSec
  // Candidates: idle pets and current nest parents. Trekking and capsule pets are left where they are.
  const pool = v.pets.filter((p) => p.group === 'Idle' || p.group.startsWith('Nest '))
  const used = new Set<number>()
  // ponytail: greedy, highest-Value nest picks first (Value only adds to hi, so the top pair is worth most there); an exact
  // disjoint-pairs assignment would matter only if nests differed by more than the V term.
  const order = [...v.nests].sort((a, b) => V(b.n) - V(a.n))
  const rows = new Map<number, ReturnType<typeof row>>()
  function row(x: (typeof v.nests)[number]) {
    const w = weights(x), Vn = V(x.n)
    const cur = x.parents.every(Boolean) ? x.parents as Pet[] : null
    const now = cur ? { pair: cur, ...mix(cur[0]!.level, cur[1]!.level, x.breed!.ids, w, Vn, t20), eggSec: x.breed!.eggSec } : null
    let best: { pair: Pet[]; low: number; high: number; mean: number } | null = null
    const free = pool.filter((p) => !used.has(p.slot))
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const P = free[i]!, Q = free[j]!, e = mix(P.level, Q.level, [P.species, Q.species], w, Vn, t20)
      if (!best || e.mean > best.mean || (e.mean === best.mean && e.high > best.high)) best = { pair: [P, Q], ...e }
    }
    if (best) for (const p of best.pair) used.add(p.slot)
    return { n: x.n, V: Vn, weights: [...w].map(([r, p]) => ({ r, p })), now, best: best && { ...best, eggSec: egg(x.n, best.pair) },
      gain: best && now ? best.mean - now.mean : null }
  }
  for (const x of order) rows.set(x.n, row(x))
  const nests = v.nests.map((x) => rows.get(x.n)!)

  // Progress estimate from the best recommended pair: eggs to beat the best owned pet (+0/+5/+10 levels).
  const top = Math.max(0, ...v.pets.map((p) => p.level)), lead = nests.filter((r) => r.best).sort((a, b) => b.best!.mean - a.best!.mean)[0]
  const targets = lead?.best ? [top + 1, top + 5, top + 10].map((X) => {
    const [P, Q] = lead.best!.pair as [Pet, Pet], w = new Map(lead.weights.map((x) => [x.r, x.p]))
    const eggs = eggsTo(X, P.level, Q.level, [P.species, Q.species], w, lead.V, t20)
    return { level: X, eggs, sec: eggs * lead.best!.eggSec }
  }) : []
  const verdict = !lead?.best ? 'No pair to breed: fewer than two idle or nest pets.'
    : `Best: ${lead.best.pair.map(label).join(' + ')} in Nest ${lead.n}, expected child Lv ${lead.best.mean.toFixed(1)} (${lead.best.low}–${lead.best.high})`
      + (lead.now ? ` vs ${lead.now.mean.toFixed(1)} with the current pair` : '') + `; your best pet is L${top}.`
  return { nests, top, lead: lead?.n ?? null, targets, verdict, t20 }
}
