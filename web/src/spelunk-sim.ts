// Spelunking progression simulator: the compounding loop nextSteps() leaves out. nextSteps spends today's stock once and quotes
// bestRoute at fixed rates; here every trip home lands its bag's treasure, that treasure buys upgrades (the same canBuy / pay /
// apply, via buyNext), and the faster spelunkers start the next trip. Event-driven and in expected values: one event per
// spelunker reaching its dig target (depth grows at speedPerHour, the 50 ms tick, @29964600 †).
//
// At a target the game offers Dig Down (target += digDown, depth and DigDownOverflow to 0, region-5 listener @30138000 †) or the
// trip home (depth and overflow to 0, target kept, bag of depth × value, @30107242 / @30113241 †). A bag opens into treasure per
// tier as bagYield's expected values (tier t = yield(≥ t) − yield(≥ t + 1); bagItems × rareChance steps × treasurePerItem).
//
// Modelled: every hired digger (status 1; home and walking ones start a trip at once), dig/home choice, bag treasure, every
// canBuy purchase (Value / Speed / Dig, Sitty Chair, the card deck) paid from the running stock and gold.
// Held fixed: learners (status 2) and all perks, hiring, Spelunking EXP / level (not modelled, so no LV20 milestone), gold
// income (gold is only spent), machine conversions are instant (pay()), Sitty Chair's build time, Construction levels other
// than Sitty Chair.
// ponytail: by default the player reacts the instant a spelunker reaches its target, 24/7; opts.checkEvery rounds each action
// up to the next check-in. Waiting at the target, the game banks the extra speed as DigDownOverflow (a bigger next Dig Down):
// ignored, so check-in runs are slightly pessimistic.
import { bagTier, bagYield, bestRoute, buyNext, digDown, gate, hired, nextSteps, speedPerHour, status, value, withArr, type Gate } from './spelunking'
import { cost as buildCost, lv as cLv, name as buildingName, treasureName, viaMachines } from './construction'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const at = (s: Save, k: string, i: number) => n(arr(s, k)[i])

/** years: game time cap (5). checkEvery: hours between the player's check-ins (0 = acts the instant a target is reached; a
 *  spelunker that arrives between check-ins waits at its target, its overflow ignored). start: ms of hour 0 (now). */
export type SimOpts = { years?: number; checkEvery?: number; maxEvents?: number; maxBuys?: number; start?: number; maxLog?: number }
export type Milestone = { hours: number; date: string; what: string }
/** One player action; a run of the same purchase on one return is one action "level a → b". */
export type Action = { hours: number; k: number; kind: 'dig' | 'home' | 'buy'; what: string; id?: string }
export type Bought = { id: string; what: string; levels: number; first: number; last: number }

/** Spelunker k's bag of value v opened into TreasureOwned, as expected amounts per tier. */
export function land(s: Save, k: number, v: number) {
  const t = Array.from({ length: 29 }, (_, i) => at(s, 'TreasureOwned', i))
  for (let g = 1; g <= 28; g++) t[g]! += bagYield(s, k, v, g) - (g < 28 ? bagYield(s, k, v, g + 1) : 0)
  return { ...s, TreasureOwned: t } as Save
}
/** Hours a bestRoute would still take (Infinity when none within its 40 Dig Downs). */
const left = (s: Save, G: Gate) => bestRoute(s, G)?.hours ?? Infinity
/** Dirts Ahoy (Blue building 14) next level: payable from held treasure, or through a machine. */
const dirtsPayable = (s: Save) => { const c = buildCost(s, 14); return !!c && (c.enough || viaMachines(s, c) != null) }

/** Simulate until the next gate (gate(), e.g. Green's 8× tier 15) opens or `years` of game time pass. */
export function simulate(save: Save, o: SimOpts = {}) {
  const G0 = gate(save)
  if (!G0) return null
  const cap = (o.years ?? 5) * 8766, maxEvents = o.maxEvents ?? 5e4, maxBuys = o.maxBuys ?? 200, start = o.start ?? Date.now(), maxLog = o.maxLog ?? 400
  const date = (h: number) => new Date(start + h * 36e5).toISOString().slice(0, 16).replace('T', ' ')
  const milestones: Milestone[] = [], actions: Action[] = [], bought = new Map<string, Bought>()
  const mark = (hours: number, what: string) => milestones.push({ hours, date: date(hours), what })
  const log = (a: Action) => { if (actions.length < maxLog) actions.push(a) }
  const diggers = hired(save).filter((k) => status(save, k) !== 2)
  let s: Save = { ...save, SpelunkerStatus: Array.from({ length: 9 }, (_, i) => (diggers.includes(i) ? 1 : at(save, 'SpelunkerStatus', i))) }
  for (const k of diggers) if (status(save, k) !== 1) s = withArr(s, 'SpelunkerDistance', k, 0) // home / walking: a new trip
  let h = 0, events = 0, trips = 0, digs = 0, minStock = Math.min(...arr(s, 'TreasureOwned').map(n), 0)
  let topTier = Math.max(0, ...diggers.map((k) => bagTier(at(s, 'SpelunkerDistanceMAX', k) * value(s, k))))
  let dirts = cLv(s, 14) >= 1
  const done = (t: Save) => at(t, 'TreasureOwned', G0.tier) > G0.more
  const goalName = `${G0.domain} gate: >${G0.more} ${treasureName(G0.tier)} (tier ${G0.tier}) held`
  const buyAll = (t: Save) => {
    const got: { id: string; what: string }[] = []
    for (let i = 0; i < maxBuys; i++) { const G = gate(t)!, b = buyNext(t, G); if (!b) break; t = b.s; got.push(b.best) }
    return { t, got }
  }
  if (!dirts && dirtsPayable(s)) { mark(0, `${buildingName(14)} payable (now)`); dirts = true }
  // Spend today's stock first (what nextSteps would do), then start the clock.
  { const r = buyAll(s); s = r.t; for (const b of r.got) record(b, 0) }
  function record(b: { id: string; what: string }, hours: number) {
    const prev = actions.at(-1)
    if (prev?.id === b.id && prev.hours === hours) prev.what = prev.what.replace(/→ \d+/, b.what.match(/→ \d+/)?.[0] ?? '$&')
    else log({ hours, k: 0, kind: 'buy', what: b.what, id: b.id })
    const x = bought.get(b.id)
    if (!x) bought.set(b.id, { id: b.id, what: b.what, levels: 1, first: hours, last: hours })
    else { x.levels++; x.last = hours; x.what = x.what.replace(/→ \d+/, b.what.match(/→ \d+/)?.[0] ?? '$&') }
  }
  let reached: number | null = done(s) ? 0 : null
  while (reached == null && events < maxEvents) {
    // Next spelunker to reach its target; advance everyone's depth to then.
    let k = 0, dt = Infinity
    for (const j of diggers) { const d = Math.max(at(s, 'SpelunkerDistanceMAX', j) - at(s, 'SpelunkerDistance', j), 0) / speedPerHour(s, j); if (d < dt) { dt = d; k = j } }
    if (!k || h + dt > cap) break
    if (o.checkEvery) dt = Math.ceil((h + dt) / o.checkEvery - 1e-9) * o.checkEvery - h
    h += dt; events++
    const dist = [...arr(s, 'SpelunkerDistance')]
    for (const j of diggers) dist[j] = Math.min(n(dist[j]) + speedPerHour(s, j) * dt, at(s, 'SpelunkerDistanceMAX', j))
    dist[k] = at(s, 'SpelunkerDistanceMAX', k)
    s = { ...s, SpelunkerDistance: dist }
    const T = at(s, 'SpelunkerDistanceMAX', k), v = T * value(s, k)
    // Both branches, then keep the one with fewer bestRoute hours left (see the ponytail below).
    const reset = (t: Save) => withArr(withArr(t, 'SpelunkerDistance', k, 0), 'DigDownOverflow', k, 0)
    const dug = withArr(reset(s), 'SpelunkerDistanceMAX', k, T + digDown(s, k))
    const landed = land(reset(s), k, v)
    const home = done(landed) ? { t: landed, got: [] } : buyAll(landed)
    // ponytail: one-step greedy. Home is scored by bestRoute after spending the bag (fixed rates from then on), Dig Down by
    // bestRoute from the deeper target; ties (both past 40 Dig Downs) go home. Ceiling: it never sees that a bag also funds
    // later trips' upgrades, so it under-values going home, and bestRoute wants one bag to cover the need (pooled bags are
    // counted only as they land). Upgrade path: a short rollout of each branch (simulate both for a few trips) or a DP over
    // dig depth per spelunker.
    const G = gate(s)!
    if (done(landed) || left(home.t, G) <= left(dug, G)) {
      trips++; s = home.t
      log({ hours: h, k, kind: 'home', what: `Spelunker ${k} home with a ${v.toExponential(2)} bag (tier ${bagTier(v)})` })
      if (bagTier(v) > topTier) { topTier = bagTier(v); mark(h, `first tier-${topTier} bag (${treasureName(topTier)}), spelunker ${k}`) }
      if (!dirts && dirtsPayable(landed)) { mark(h, `${buildingName(14)} payable`); dirts = true }
      for (const b of home.got) record(b, h)
      minStock = Math.min(minStock, ...arr(landed, 'TreasureOwned').map(n), ...arr(s, 'TreasureOwned').map(n))
      if (done(s)) reached = h
    } else {
      digs++; s = dug
      log({ hours: h, k, kind: 'dig', what: `Spelunker ${k} Dig Down: target ${T.toExponential(2)} → ${at(s, 'SpelunkerDistanceMAX', k).toExponential(2)}` })
    }
  }
  if (reached != null) mark(reached, goalName)
  const baseline = nextSteps(save)?.route?.hours ?? Infinity
  return { gate: G0, hours: reached, milestones, actions, bought: [...bought.values()], trips, digs, events, minStock, baseline,
    end: { hours: h, save: s, left: reached == null ? left(s, gate(s)!) : 0, held: at(s, 'TreasureOwned', G0.tier) }, cap }
}
export type Sim = NonNullable<ReturnType<typeof simulate>>

/** The result as text lines (for a terminal: `bun -e` in the report). */
export function summary(r: Sim, first = 10) {
  const fh = (x: number) => (!Number.isFinite(x) ? '∞' : x < 48 ? `${x.toFixed(1)} h` : x < 24 * 730 ? `${(x / 24).toFixed(1)} d` : `${(x / 8766).toPrecision(3)} y`)
  return [
    `Goal: ${r.gate.domain} (${r.gate.need} more ${treasureName(r.gate.tier)}). Simulated: ${r.hours == null ? `not within ${fh(r.cap)} (${r.end.held.toPrecision(3)} held; bestRoute after that: ${fh(r.end.left)})` : fh(r.hours)}; nextSteps (no reinvestment): ${fh(r.baseline)}`,
    `${r.events} arrivals: ${r.trips} trips home, ${r.digs} Dig Downs; lowest treasure stock ${r.minStock}`,
    'Milestones:', ...r.milestones.map((m) => `  ${fh(m.hours).padStart(9)}  ${m.date}  ${m.what}`),
    `First ${first} actions:`, ...r.actions.slice(0, first).map((a) => `  ${fh(a.hours).padStart(9)}  ${a.kind.padEnd(4)} ${a.what}`),
    'Purchases:', ...r.bought.map((b) => `  ${b.what}${b.levels > 1 ? ` (${b.levels} buys)` : ''}  ${fh(b.first)} – ${fh(b.last)}`),
  ]
}
