// Cards page, Missing cards (#53): how best to get each card you don't own. Where it drops (data/card-sources.json, from the
// drop actor's own init, src/derive-sources.ts), the odds and time (the drop rolls below), what gates it (fight mode and
// stage, crusade unlock and verdict, raid/Asylum boss unlock and verdict), and a step-by-step farming plan.
// Read from Qno2x.js; offsets †. Untraced pieces are marked unverified where they are used.
import { asylum } from './asylum'
import { BOSS, nameOf, sourceText, type Source, type Sources } from './card-sources'
export { dropText, sourceText, type Source, type Sources } from './card-sources'
import { cell, conquestContext, CRUSADES, COUNT } from './crusade'
import { raids, TIERS, verdicts } from './raids'

type Save = Record<string, unknown>
type Adds = Record<string, number>
const n = (v: unknown) => Number(v ?? 0) || 0
const at = (s: Save, k: string, i: number) => n((s[k] as unknown[] | undefined)?.[i])

export type MissingCard = { id: number; name: string; type: string; zone: string | null; level: number; hidden: boolean; levels: Record<string, Adds> }
/** Drop-roll inputs: card-drop % from the Fighting-linked deck (zones and crusades both equip link 9), crusade card %, gear card
 *  % (crusades only), Fight Bonus (min(Energy, 100)/100), card rolls per hour in a zone, seconds per crusade run. */
export type Odds = { cardDrop: number; crusadeCard: number; ebonus: number; energy: number; rollsPerHour: number; crusadeRunSec: number }

/** Expected attempts for one card from one source.
 *  Zones roll once per real monster death: randomInt(1, 170·(1 + mode/3)/(1 + CbonusCardDropChance/100)) == 1 for modes 1-9
 *  († @31781147), 1500·(1 + (mode − 10)/2)/(…) for modes 10-15 and nothing from 16 († @31812316).
 *  Crusades roll once per stage cleared: 250·ceil(c/3) for stages 1-4 († @23368435), 500·ceil(c/4) for the boss
 *  († @23380524), ÷ min(Energy,100)/100 ÷ (1 + (Card Drop + Crusade Card + gear card chance)/100).
 *  Raid bosses roll once per win: randomInt(1, 70 − 2·TicketsToSpend) == 1, no bonus († @19925267 King, @19938662,
 *  @19954658, @19969084). Asylum: randomInt(1, N − TicketsToSpend), N = 100 Emigdala († @26901624), 110 Occulon
 *  († @26919565), 130 Scallius († @26935833), 145 Gorshank († @26954655), no bonus. */
export function expectedKills(src: Source, o: Odds): number | null {
  if (src.kind === 'zone') {
    const m = src.mode, cb = 1 + o.cardDrop / 100
    if (m >= 16) return null
    return Math.floor((m >= 10 ? 1500 * (1 + (m - 10) / 2) : 170 * (1 + m / 3)) / cb)
  }
  if (src.kind === 'crusade')
    return Math.floor((src.stages[0] >= 4 ? 500 * Math.ceil(src.conquest / 4) : 250 * Math.ceil(src.conquest / 3)) / o.energy / (1 + (o.cardDrop + o.crusadeCard + o.ebonus) / 100))
  if (src.kind === 'skill') return src.chance ? Math.round(1 / src.chance) : null
  const b = BOSS[src.boss]!
  return b.raid ? 70 - 2 * src.tickets : b.n - src.tickets
}

/** Kills on stage L needed to move up to L + 1 (the right arrow's listener, @7631900-@7633616 †): with Z = FightZoneTYPE
 *  (1 for modes 1-9, 2 for 11+) and m the mode, aa = (m − 5(Z−1))·25^Z + 10·(L·m·Z²·max((m − 10(Z−1))(Z−1), 1)
 *  + 2·max(floor((m − 1 − 5(Z−1))(Z−1)/2), 0)) − 20, then for modes 15-19 only (floor((m+85)/100) − floor((m+80)/100) = 1)
 *  ×(1 + (1.1 + 0.03(l+1)^1.8)^(l^0.9/8.1 + 1)) + 5000·l^1.4 with l = min(L, 47). Oblivion stage 47 (L 46): 3.01e12. */
const fmtK = (x: number) => (x >= 1e6 ? x.toExponential(2).replace('e+', 'e') : Math.round(x).toLocaleString())
export function stageKillReq(m: number, L: number) {
  const Z = m < 10 ? 1 : 2, l = Math.min(L, 47), sw = Math.floor((m + 85) / 100) - Math.floor((m + 80) / 100)
  const aa = (m - 5 * (Z - 1)) * 25 ** Z + 10 * (L * m * Z * Z * Math.max((m - 10 * (Z - 1)) * (Z - 1), 1) + 2 * Math.max(Math.floor(((m - (1 + 5 * (Z - 1))) * (Z - 1)) / 2), 0)) - 20
  return aa * (1 + (1.1 + 0.03 * (l + 1) ** 1.8) ** (l ** 0.9 / 8.1 + 1) * sw) + 5e3 * l ** 1.4 * sw
}

// ---- Gates -----------------------------------------------------------------------------------------------------------
/** Everything the gates need, computed once per save (the boss and crusade fight models are the slow part).
 *  Fight modes: the mode-select button for mode m opens at fightsunlocked ≥ m (both zone types, † @4277274-@4279517);
 *  modes 12-15 are set by special keys (SpecialKeysGot, † @3864936-@3866025; where each key drops: unverified). Mode 11's
 *  own gate is unverified (taken as fightsunlocked ≥ 11). Stages: you move up from stage L once MapleMonster[L + 100·(mode −
 *  1)] (mode − 6 for modes 11+) reaches the stage's kill requirement († @7633616); the furthest you can return to is the
 *  first stage whose kills are below its requirement (stageKillReq).
 *  Kill counts do reset (an older save had no mode-4 kills while every mode-4 card was owned; what resets them: unverified),
 *  so a card you once had a stage for can be gated again (only ascension zeroes them, @20947217). FurthestMapleLV is the last stage visited, not the furthest
 *  (written on every move up or down, † @7631079, @8425010), so it isn't used. */
export function gates(save: Save) {
  const fu = Math.max(n(save.fightsunlocked), n(save.fightsunlockedBEST))
  // Furthest stage you can stand on: walk up from stage 0 while the stage's kills meet its move-up requirement (stageKillReq).
  // Kills can be recorded on stages you can't reach yet (Oblivion, 2026-10-31: kills up to stage 56 while the arrow stops at 47).
  const furthest = (mode: number) => {
    const base = 100 * (mode < 10 ? mode - 1 : mode - 6), top = mode === 15 ? 199 : 99
    let L = 0
    while (L < top && at(save, 'MapleMonster', base + L) >= stageKillReq(mode, L)) L++
    return L
  }
  const r = raids(save), v = verdicts(save), a = asylum(save)
  const raidRows = 'missing' in v ? null : v.rows!.filter((x) => x.type === 'raid')
  const cf = conquestContext(save)
  const crusadeWin = new Map<number, string>() // c -> verdict at difficulty 1 (lowest: card odds don't depend on difficulty)
  for (let c = 1; c <= COUNT; c++) if (at(save, 'ConquestDifficultyLV', c) >= 1) crusadeWin.set(c, 'missing' in cf ? 'unknown' : cell(cf, c, 1).verdict)
  return {
    modeOpen: (m: number) => m === 1 || fu >= m, fu, furthest,
    stageKills: (m: number, L: number) => at(save, 'MapleMonster', 100 * (m < 10 ? m - 1 : m - 6) + L), conquestLV: n(save.ConquestLV), crusadeWin,
    voyagePact: at(save, 'ConstructLV', 11) > 0.5, // crusades 14-15 open only with Voyage Pact built (crusade.ts, @23920094)
    raid: r.bosses.filter((b) => b.type === 'raid'), asy: r.bosses.filter((b) => b.type === 'asylum'), raidRows, runs: a.runs,
    tickets: r.tickets.raid, ticketsPerHour: r.raidTicketsPerHour, keys: a.keys.held + a.keys.waiting, keysPerHour: a.keys.perDay / 24,
    eventOn: n(save.EventIsON) === 1,
  }
}
export type Gates = ReturnType<typeof gates>

// ---- Rows ------------------------------------------------------------------------------------------------------------
export type Status = 'ready' | 'gated' | 'skill' | 'unreachable'
export type Row = { id: number; name: string; type: string; zone: string | null; adds: Adds; value: number; deck: number | null
  src: Source | null; where: string; stop: string; kills: number | null; hours: number | null; status: Status; why: string; boosts: string
  // boss runs: tickets/keys a card costs (the plan pays them from one pool) and fight time
  pay?: { pool: 'raid' | 'asylum'; amount: number; fightHours: number } }


/** Value of a card for you: its level-1 bonus scored in the deck whose priorities value it most, with each bonus scaled so
 *  your best owned card of it counts 1.0 (the Decks / Best-cards-to-level scoring). A bonus you own no card of counts 1.0. */
export function cardValue(c: MissingCard, mult: number, decks: { deck: number; w: Adds }[], maxAdd: Adds) {
  const m = c.type === 'CropsGained' ? 1 : mult // crop cards are unscaled (cards-calc.ts)
  const adds = Object.fromEntries(Object.entries(c.levels['1'] ?? {}).map(([k, v]) => [k, v * m]))
  let value = 0, deck: number | null = null
  for (const d of decks) {
    const s = Object.entries(adds).reduce((t, [k, v]) => t + (d.w[k] ?? 0) * (maxAdd[k] ? v / maxAdd[k] : 1), 0)
    if (s > value) { value = s; deck = d.deck }
  }
  return { adds, value, deck }
}

/** One row per missing card (shown in game, not owned): best source, odds, time, gate, value. */
export function missingCards(cards: MissingCard[], src: Sources, g: Gates, o: Odds, value: (c: MissingCard) => { adds: Adds; value: number; deck: number | null }): Row[] {
  const names = Object.fromEntries(Object.entries(src.modeNames).map(([k, v]) => [k, v.replace(/([a-z])([A-Z])/g, "$1 $2")])) as Record<number, string> // game ids are CamelCase ("TheBog")
  return cards.filter((c) => !c.hidden && c.level < 1).map((c) => {
    // Crusades stop at 15: the id formula runs past 265 for crusades 16+ (@15661757 init), which don't exist.
    const opts = (src.sources[c.id] ?? []).filter((s) => s.kind !== 'crusade' || s.conquest <= COUNT).map((s) => judge(s, g, o, names))
    const rank = (x: ReturnType<typeof judge>) => ({ ready: 0, skill: 1, gated: 2, unreachable: 3 })[x.status]
    const best = opts.sort((a, b) => rank(a) - rank(b) || (a.hours ?? Infinity) - (b.hours ?? Infinity) || (a.kills ?? Infinity) - (b.kills ?? Infinity))[0]
    const v = value(c), base = { id: c.id, name: c.name, type: c.type, zone: c.zone, ...v }
    if (best) return { ...base, ...best }
    // No game code ever sets this card (cards-missing.test.ts reads the bundle for it), so the wiki's zone is only a label.
    return { ...base, src: null, where: c.zone ? `wiki: ${c.zone}` : 'unknown', stop: '', kills: null, hours: null, status: 'unreachable' as Status, boosts: '',
      why: /Event/i.test(c.zone ?? '') ? `retired event card (${c.zone}): no game code gives it, so it cannot be farmed.` : 'no drop source: no game code ever sets this card (placeholder or retired), so it cannot be farmed.' }
  })
}

function judge(s: Source, g: Gates, o: Odds, names: Record<number, string>): Omit<Row, 'id' | 'name' | 'type' | 'zone' | 'adds' | 'value' | 'deck'> {
  const kills = expectedKills(s, o), where = sourceText(s, names)
  const out = (status: Status, why: string, hours: number | null, stop: string, boosts: string, pay?: Row['pay']) => ({ src: s, where, kills, hours, status, why, stop, boosts, pay })
  if (s.kind === 'zone') {
    const boosts = `Card Drop Chance +${+o.cardDrop.toFixed(1)}% (Fighting deck)`, hours = kills == null ? null : kills / o.rollsPerHour, stop = `zone:${s.mode}:${s.stages[0]}`
    if (!g.modeOpen(s.mode)) return out('gated', `unlock ${nameOf(names, s.mode)} (fight mode ${s.mode}; you have up to ${nameOf(names, g.fu)}); its key's drop source: unverified`, hours, stop, boosts)
    const f = g.furthest(s.mode)
    if (s.stages[0] > f) return out('gated', `reach ${nameOf(names, s.mode)} stage ${s.stages[0] + 1} (you can reach stage ${f + 1}; ${fmtK(g.stageKills(s.mode, f))} of ${fmtK(stageKillReq(s.mode, f))} kills to open stage ${f + 2})`, hours, stop, boosts)
    return out('ready', '', hours, stop, boosts)
  }
  if (s.kind === 'crusade') {
    const boosts = `Card Drop +${+o.cardDrop.toFixed(1)}%, Crusade Card +${+o.crusadeCard.toFixed(1)}%, gear +${+o.ebonus.toFixed(1)}%, Fight Bonus ${Math.round(o.energy * 100)}%`
    const hours = kills != null && o.crusadeRunSec > 0 ? (kills * o.crusadeRunSec) / 3600 : null, stop = `crusade:${s.conquest}`, k = CRUSADES[s.conquest]
    const v = g.crusadeWin.get(s.conquest)
    if (v == null) return out('gated', `unlock crusade ${s.conquest} ${k?.name ?? ''} (Conquest level ${k?.unlock ?? '?'}; you are ${g.conquestLV}${s.conquest >= 14 ? `; also needs Voyage Pact built${g.voyagePact ? ' (built)' : ', not built yet'}` : ''})`, hours, stop, boosts)
    if (v !== 'win') return out('gated', `win crusade ${s.conquest} at difficulty 1 (verdict now: ${v})`, hours, stop, boosts)
    return out('ready', '', hours, stop, boosts)
  }
  if (s.kind === 'skill' && s.skill === 'Event')
    return out('unreachable', `event-only: the event shop's roll (1 in ${kills}); ${g.eventOn ? 'an event is running in this save' : 'no event running in this save'}`, null, '', 'none')
  if (s.kind === 'skill' && s.skill === 'Secret') return out('skill', `granted once you ${s.detail} (SceneEvents_2 init @20210322); no farm time modelled`, null, '', 'none')
  if (s.kind === 'skill') return out('skill', `drops while you ${s.skill === 'Construction' ? 'level construction' : `do ${s.skill}`}, 1 in ${kills ?? '?'} ${s.per}${s.chance ? '' : ' (odds not extracted)'}; no farm time modelled`, null, '', 'none (card bonuses don\'t apply)')
  const b = BOSS[s.boss]!, list = b.raid ? g.raid : g.asy, boss = list[b.i]!, stop = `boss:${s.boss}:${s.tickets}`
  const tiers = (b.raid ? TIERS.raid : TIERS.asylum).tiers, ti = tiers.findIndex((t) => t[1] === s.tickets), d = tiers[ti]![0] || 'base'
  const boosts = 'none (fixed odds per win)'
  if (boss.unlocked === false) return out('gated', `${boss.needs?.replace(/ †.*/, '') ?? 'unlock this boss'} (${b.raid ? 'Raids' : 'Asylum'})`, null, stop, boosts)
  // Only difficulties whose verdict is 'win' count (raids.ts / asylum.ts fight models).
  let ttk: number | null = null, verdict = 'unknown', back = 0
  if (b.raid) { const cl = g.raidRows?.[b.i]?.cells[ti]; if (cl) { verdict = cl.verdict; ttk = cl.ttk } }
  else {
    const win = g.runs.filter((r) => r.boss === b.i && r.T === s.tickets && r.verdict === 'win').sort((x, y) => x.ttk - y.ttk)[0]
    const any = g.runs.find((r) => r.boss === b.i && r.T === s.tickets)
    verdict = win ? 'win' : any?.verdict ?? 'unknown'; ttk = win?.ttk ?? null; back = win?.keysBack ?? 0
  }
  if (verdict !== 'win') return out('gated', `${boss.name} ${d}: not a win yet (verdict ${verdict})`, null, stop, boosts)
  const wins = kills!, taken = tiers[ti]![2], amount = wins * (taken - back), fightHours = (wins * ttk!) / 3600
  const rate = b.raid ? g.ticketsPerHour : g.keysPerHour, have = b.raid ? g.tickets : g.keys
  return out('ready', '', Math.max(0, amount - have) / rate + fightHours, stop, boosts, { pool: b.raid ? 'raid' : 'asylum', amount, fightHours })
}

/** Ranking: value first (rounded to 0.1, so near-equal bonuses tie), then the cheapest expected time; gated cards rank by
 *  value with no time (after the timed ones of the same value). */
export function rank(rows: Row[]): Row[] {
  const v = (r: Row) => Math.round(r.value * 10)
  return [...rows].sort((a, b) => v(b) - v(a) || (a.status === 'ready' ? 0 : 1) - (b.status === 'ready' ? 0 : 1) || (a.hours ?? Infinity) - (b.hours ?? Infinity) || (a.kills ?? Infinity) - (b.kills ?? Infinity) || a.id - b.id)
}

/** Expected attempts until every card in a stop has dropped, each attempt rolling once per card with chance p_i
 *  (a crusade run rolls every stage it clears): E[max] by inclusion-exclusion, Σ (−1)^(|S|+1) / (1 − Π_S (1 − p)). */
export function expectedAll(ps: number[]): number {
  let e = 0
  for (let m = 1; m < 1 << ps.length; m++) {
    let q = 1, k = 0
    ps.forEach((p, i) => { if (m & (1 << i)) { q *= 1 - p; k++ } })
    e += (k % 2 ? 1 : -1) / (1 - q)
  }
  return e
}

export type Step = { stop: string; where: string; kind: Source['kind']; cards: Row[]; value: number; hours: number; total: number
  pay?: { pool: 'raid' | 'asylum'; amount: number; readyIn: number } }
/** The farming plan: ready cards grouped by stop (cards that drop in the same place), stops ordered by the value they
 *  collect (rounded to 0.1), then by time. `farm`: zone and crusade stops, played one after another (running total). A
 *  crusade run rolls each stage it clears once, so a crusade stop's time is the expected runs until all its cards drop.
 *  `boss`: raid and Asylum stops, paid with tickets/keys that regenerate on their own, so they run alongside the farm;
 *  each pays from one pool in plan order (held first, then the regeneration rate): `readyIn` is when your pool covers
 *  this step and every boss step before it, `hours` the fight time. */
export function plan(rows: Row[], g: Gates, o: Odds) {
  const by = new Map<string, Row[]>()
  for (const r of rows) if (r.status === 'ready' && r.hours != null && r.stop) by.set(r.stop, [...(by.get(r.stop) ?? []), r])
  const steps: Step[] = [...by].map(([stop, cards]) => {
    const s = cards[0]!.src!, p = cards[0]!.pay
    let hours = p ? p.fightHours : cards.reduce((t, r) => Math.max(t, r.hours!), 0)
    if (s.kind === 'crusade' && cards.length > 1) hours = (expectedAll(cards.map((r) => 1 / r.kills!)) * o.crusadeRunSec) / 3600
    const where = s.kind === 'crusade' ? `Crusade ${s.conquest} ${CRUSADES[s.conquest]?.name ?? ''}` : cards[0]!.where
    return { stop, where, kind: s.kind, cards, value: cards.reduce((t, r) => t + r.value, 0), hours, total: 0,
      pay: p ? { pool: p.pool, amount: p.amount, readyIn: 0 } : undefined }
  }).sort((a, b) => Math.round(b.value * 10) - Math.round(a.value * 10) || a.hours + (a.pay?.amount ?? 0) - b.hours - (b.pay?.amount ?? 0))
  const farm = steps.filter((st) => !st.pay), boss = steps.filter((st) => st.pay)
  let total = 0
  for (const st of farm) st.total = total += st.hours
  const spent = { raid: 0, asylum: 0 }, have = { raid: g.tickets, asylum: g.keys }, rate = { raid: g.ticketsPerHour, asylum: g.keysPerHour }
  total = 0
  for (const st of boss) {
    const p = st.pay!
    spent[p.pool] += p.amount
    p.readyIn = Math.max(0, spent[p.pool] - have[p.pool]) / rate[p.pool]
    st.total = total += st.hours
  }
  return { farm, boss }
}

/** Category of a row for the "where they drop" summary (the issue's groups). */
export function category(r: Row): string {
  const s = r.src
  if (!s) return /Event/i.test(r.zone ?? '') ? 'Events' : 'Unknown source'
  if (s.kind === 'zone') return 'Zone monsters'
  if (s.kind === 'crusade') return 'Crusades'
  if (s.kind === 'skill') return s.skill === 'Event' ? 'Events' : `${s.skill} (skill)`
  return BOSS[s.boss]!.raid ? 'Raid bosses' : 'Asylum bosses'
}

