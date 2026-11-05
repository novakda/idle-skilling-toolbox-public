// Ascend readiness (#10): what carries over an ascend and what it buys back. Every rule below is the game's code
// (Qno2x.js offsets cited); docs/resets.md has the full reset list.
import catalog from './data/card-catalog.json'
import { buildCards, cbonus, type Catalog } from './cards-calc'
import { ascendGain, potionBonuses } from './bus'
import { smithingCostAt, smithCurrency } from './smithing'
import { ZONES, estimate, fightStats, monsterHP } from './fighting'
import { resetTarget } from './income'
import { OUTPUTS, buyList, type Buy, type PerkRow } from './perks'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const CAT = catalog as unknown as Catalog

// Ore names, OresOwned[1..20]: the game's mine screen draws exactly these 20 names in this order (COPPER … DJINN, @30339569-@30362000;
// ascend.test.ts reads them). The index pairing is by position (the ore icon actor shows frame k for OresOwned[k], @7315892).
// Fish names: the wiki's Resources tables, read area by area (area 1: 14, area 2: 10, area 3: 6), left column then right.
// UNVERIFIED that this is the FishOwned[1..30] order: the game has no fish name list (only sprites). Its CATCH_* quest text names ten of
// them (Jellyfish, Angler Fish, Bonefish, Manta Ray, Ice Cube Fish, Giant Sea Serpent, Snailfish, Dollar Fish, Yellow Gulper, Jumbo Shrimp;
// ascend.test.ts), which confirms the names, not the index.

/** Levels per craft: CraftingLvUps = ceil(U(0.21·s, 1 + 0.2·s)), s = SkillLevels[19] (@8879104); its mean.
 *  Skill levels reset on ascend, so right after one this is 1 until skill 19 is bought back. */
export function levelsPerCraft(save: Save, s = n(arr(save, 'SkillLevels')[19])) {
  const a = 0.21 * s, b = 1 + 0.2 * s
  let mean = 0
  for (let k = Math.ceil(a) || 1; k - 1 < b; k++) mean += (k * (Math.min(b, k) - Math.max(a, k - 1))) / (b - a)
  return mean
}

/** Ore/fish/etc. needed to re-craft every smithing item 1..80 (ascend zeroes SmithingItemLevel[0..80], @20951025) back to
 *  its current level, vs what you hold (kept through an ascend). Expected cost: a craft pays the cost at its level and
 *  adds `step` levels; each craft is free with chance 15·ShrineLevels[3]/1000 (EventRNG roll @8904265, both costs).
 *  ponytail: costs use this save's reductions (item 19, waterLV terms), and a fractional step is walked at its mean;
 *  exact when the step is a whole number (the author: skill 19 = 10 → always 3). */
export function relevelNeed(save: Save, step = levelsPerCraft(save)) {
  const cost = smithingCostAt(save), paid = 1 - Math.min(15 * n(arr(save, 'ShrineLevels')[3]), 1000) / 1000
  const need = new Map<number, number>()
  for (let item = 1; item <= 80; item++) {
    const L = n(arr(save, 'SmithingItemLevel')[item])
    for (let l = 0; l < L; l += step)
      for (const c of cost(item, Math.floor(l))) need.set(c.currency, (need.get(c.currency) ?? 0) + c.cost * paid)
  }
  return [...need].map(([currency, v]) => ({ currency, ...smithCurrency(save, currency), need: v }))
    .map((r) => ({ ...r, surplus: r.owned - r.need })).sort((a, b) => a.currency - b.currency)
}

/** SoulstoKeepPercent = min(20 + CbonusSoulsKept, 100), written when the ascend menu opens (SceneEvents_19 init @20186347,
 *  also fight scenes 9/32/38); the reset multiplies SoulsTotal (the bank rifts and constructions spend) by it and zeroes
 *  SoulsOwned (per-tier conversion progress, SceneEvents_27). */
export const keepPercent = (soulsKeptCards: number) => Math.min(20 + soulsKeptCards, 100)
export function soulsKept(save: Save, pct: number) {
  return arr(save, 'SoulsTotal').map((v, i) => ({ i, banked: n(v), kept: (n(v) * pct) / 100 })).filter((r) => r.banked > 0)
}

/** Start gold of the next run. Ascend/rebirth plays the credits scene (22), which stores GoldcoinPreAscend = goldcoin
 *  (@20926183; 0 on rebirth) and then pays one of two formulas:
 *  - Skip button (ActorEvents_958, shown from the 2nd ascend, 5 s in): GoldcoinPreAscend · min((PbonusStartingCash + 0.8)/100, 0.99) @17777134
 *  - waiting the credits out (24 s timer, SceneEvents_22 @21120286): · min((PbonusStartingCash + 0.6)/100, 0.3)
 *  floored at min(2500·2^TimesAscended, 250,000) (TimesAscended already +1). */
export function startGold(save: Save, skip = true, gold = n(save.goldcoin)) {
  const pb = potionBonuses(save).StartingCash, ta = n(save.TimesAscended) + 1
  const keep = skip ? Math.min((pb + 0.8) / 100, 0.99) : Math.min((pb + 0.6) / 100, 0.3)
  return { keep, floor: Math.min(2500 * 2 ** ta, 25e4), gold: Math.max(Math.min(2500 * 2 ** ta, 25e4), gold * keep) }
}

/** Deck to equip right before ascending: every owned AP card (AP is multiplied by 1 + CbonusAP/100 when you press Ascend,
 *  ActorEvents_613 @12473343), then Souls Kept cards until the 100% cap. ascendGain re-run with the new deck in place
 *  of the selected one. ponytail: greedy fill of Souls Kept (can overshoot the cap by one card); fine for 5 cards. */
export function preAscendDeck(save: Save) {
  const { cards, decks, slots } = buildCards(save, CAT)
  const own = cards.filter((c) => c.level >= 1), v = (c: (typeof cards)[number], k: string) => n(c.adds[k])
  const picks = own.filter((c) => v(c, 'AP') > 0).sort((a, b) => v(b, 'AP') - v(a, 'AP'))
  let souls = 0
  for (const c of own.filter((c) => v(c, 'SoulsKept') > 0 && !picks.includes(c)).sort((a, b) => v(b, 'SoulsKept') - v(a, 'SoulsKept')))
    if (20 + souls < 100 && picks.length < slots) { picks.push(c); souls += v(c, 'SoulsKept') }
  const sel = n(save.CardDeckSelected), eq = [...arr(save, 'CardEquipped')]
  const ids = picks.slice(0, slots).map((c) => c.id)
  eq.splice(slots * (sel - 1), slots, ...ids, ...Array(slots - ids.length).fill(0))
  const now = cbonus(save, CAT), next = cbonus({ ...save, CardEquipped: eq }, CAT)
  const cbNow = typeof save.CbonusAP === 'number' ? save.CbonusAP : n(now.CbonusAP)
  const apNow = ascendGain({ ...save, CbonusAP: cbNow }).ap, apNext = ascendGain({ ...save, CbonusAP: n(next.CbonusAP) }).ap
  // A deck no activity is linked to, so entering a linked screen doesn't swap it out (DeckLinkList; empty first).
  const spare = decks.filter((d) => !d.link).sort((a, b) => a.cards.filter(Boolean).length - b.cards.filter(Boolean).length)[0]?.deck ?? null
  return {
    cards: picks.slice(0, slots).map((c) => ({ id: c.id, name: c.name, level: c.level, adds: c.adds, page: c.page, tab: c.tab, row: c.row, col: c.col })), spare,
    apNow, apNext, cbAP: [cbNow, n(next.CbonusAP)],
    keep: [keepPercent(typeof save.CbonusSoulsKept === 'number' ? save.CbonusSoulsKept : n(now.CbonusSoulsKept)), keepPercent(n(next.CbonusSoulsKept))],
  }
}

/** BP term 5 (furthest map progress, ascensionRewards) in the zone you are in: BP per furthest stage after the BP
 *  multipliers, and the stage where the term caps. Hell-key branch: Oblivion 20·F15+650 ≤ 5000 (@10713843), Maelstrom
 *  5·F14+350 ≤ 650, Lunar Isle 3·F13+180 ≤ 350, The Bog 2·F12+70 ≤ 180, else Purgatory 0.8·F11+26 ≤ 70; before it,
 *  Dungeon 0.5·F5 ≤ 26. null when no zone you are in raises it. */
export function mapTerm(save: Save) {
  const fights = n(save.fightsunlocked), hell = n(save.HellKeyGot) === 1
  const z = hell ? ({ 15: [15, 20, 650, 5000], 14: [14, 5, 350, 650], 13: [13, 3, 180, 350], 12: [12, 2, 70, 180] } as Record<number, number[]>)[fights] ?? [11, 0.8, 26, 70]
    : fights === 5 ? [5, 0.5, 0, 26] : null
  if (!z) return null
  const [m, slope, b, cap] = z as [number, number, number, number], stage = n(arr(save, 'FurthestMapleLV')[m]), g = ascendGain(save)
  const term = Math.min(slope * stage + b, cap)
  return { zone: ZONES.find((x) => x.m === m)?.name ?? `zone ${m}`, stage, term, cap, perStage: slope * g.bpMulti,
    capStage: Math.ceil((cap - b) / slope), left: (cap - term) * g.bpMulti }
}

export type AscendSnap = { h: number; ap: number; bp: number; run?: string; rh?: number; BP?: number[] }
export type Advice = { call: 'now' | 'wait' | 'unknown'; line: string; evidence: [string, string][] }
const big = (v: number) => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toPrecision(3)}M` : Math.round(v).toLocaleString())
const dur = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`)
// Reset downtime knob, shared with the AFK page (minutes).
const downDefault = () => { try { return Number(localStorage.getItem('idle-skilling.resetDownMin') ?? 5) / 60 } catch { return 5 / 60 } }

/** What `reward` AP/BP on top of the unspent balance buys (perks.ts buyList): a perk that raises the reset's own reward
 *  first, then the biggest modelled gains. */
export function buyLine(save: Save, rows: PerkRow[], cur: 'AP' | 'BP', reward: number): [string, string] {
  const bal = n(save[`${cur}toSpend`]), { buys, left } = buyList(rows, cur, bal + reward), self = cur === 'AP' ? 'AP per ascend' : 'BP per rebirth'
  const top = buys.sort((x, y) => Number(y.output === self) - Number(x.output === self) || y.gain - x.gain).slice(0, 3)
  return [`Buys (${big(bal)} + ${big(reward)} ${cur})`, top.length
    ? `${top.map((b) => `${b.name ?? `perk ${b.i}`} ${b.from}→${b.to} (+${+(100 * b.gain).toFixed(1)}% ${b.output})`).join(', ')}${buys.length > 3 ? `, ${buys.length - 3} more` : ''}; ${big(left)} left. Gains are the model's estimates (Perks page).`
    : `no ranked perk level is affordable even after the reset (Perks page).`]
}

/** BP reward right after an ascend, before any progress: the ascend block zeroes fighting (fightsunlocked=1,
 *  FurthestMapleLV, so BP term 5 falls to its floor), SmithingItemLevel[0..80] @20951307 (term 6's item 70) and
 *  SkillLevels[0..99] @20950905 (skill 65's +1.5% BP each). */
export const bpAfterAscend = (save: Save) => ascendGain({ ...save, fightsunlocked: 1, FurthestMapleLV: [], SmithingItemLevel: [], SkillLevels: [] }).bp

/** When to ascend and when to rebirth, with the evidence: reward now, reward per hour over the last hour or more of this
 *  run (snapshots: data/ascend-history.json, src/history.ts), what the reward buys (perks.ts buyList on balance + reward),
 *  and what the reset loses (docs/resets.md). Rule (the AFK page's): reset once the recent rate falls below the best
 *  average a run pays counting downtime — AP: the previous run's curve, else this one's; BP: this rebirth cycle's average. */
export function resetAdvice(save: Save, snaps: AscendSnap[], rows: PerkRow[], downH = downDefault()): { ascend: Advice; rebirth: Advice; recent: { dh: number; ap: number; bp: number } | null } {
  const g = ascendGain(save), ta = n(save.TimesAscended), nr = n(save.NumberofTimesRebirth)
  const run = `${ta}-${nr}`, cur = { h: g.hours, ap: g.ap, bp: g.bp }
  const mine = snaps.filter((x) => x.run === run && x.h < cur.h - 0.01).sort((a, b) => a.h - b.h)
  const a = [...mine].reverse().find((x) => cur.h - x.h >= 1) ?? mine[0]
  const recent = a && cur.h - a.h >= 0.25 ? { dh: cur.h - a.h, ap: (cur.ap - a.ap) / (cur.h - a.h), bp: (cur.bp - a.bp) / (cur.h - a.h) } : null
  const prev = snaps.filter((x) => x.run === `${ta - 1}-${nr}`).map((x) => ({ h: x.h, v: x.ap }))
  const apT = resetTarget(prev, [...mine, cur].map((x) => ({ h: x.h, v: x.ap })), downH)!
  const bpT = resetTarget([], [{ h: g.rebirthHours, v: g.bp }], downH)!
  const window = recent ? `over the last ${dur(recent.dh)} of the run (idle time counts)` : ''

  const buys = (cur: 'AP' | 'BP', reward: number) => buyLine(save, rows, cur, reward)
  const mt = mapTerm(save)
  const { keep } = preAscendDeck(save)
  const bpAsc = bpAfterAscend(save)

  // Ascend.
  const apEv: [string, string][] = [
    ['Reward now', `${big(g.ap)} AP (${big(g.apBase)} base × ${big(g.apMulti)}) after ${dur(g.hours)}; ${big(g.ap / Math.max(g.hours, 0.01))} AP/h on average.`],
    ['Rate', recent ? `+${big(recent.ap)} AP/h ${window}; target ${big(apT.rate)} AP/h, the best average a run pays counting ${Math.round(downH * 60)} min downtime (${apT.from}).` : 'needs a save snapshot from earlier in this run (refresh the save again after an hour).'],
    buys('AP', g.ap),
    ['Loses', `fighting back to zone 1, the skill tree and its points, smithing items 1–80, gold (Skip keeps ${+(startGold(save).keep * 100).toFixed(1)}%), souls (keeps ${keep[0]}%, ${keep[1]}% with the ascend deck)`
      + `${bpAsc < g.bp - 0.5 ? `; the BP reward drops ${big(g.bp)} → ${big(bpAsc)} until you are back in ${mt?.zone ?? 'your zone'} with smithing and the skill tree rebuilt` : ''}. Keeps perks, unspent AP, BP, ores, fish, tilling, botany, apothecary and potions, cards, pets (scene 22, Qno2x.js @20900963–20952873).`],
  ]
  const ascend: Advice = !recent ? { call: 'unknown', line: `Ascend: no rate yet. ${big(g.ap)} AP is waiting; refresh the save after an hour more of the run to see whether it is still climbing.`, evidence: apEv }
    : recent.ap < apT.rate ? { call: 'now', line: `Ascend now: AP is coming in at ${big(recent.ap)}/h, below the ${big(apT.rate)}/h a run averages, so a fresh run earns AP faster.`, evidence: apEv }
      : { call: 'wait', line: `Wait to ascend: AP is still climbing at ${big(recent.ap)}/h, above the ${big(apT.rate)}/h a run averages. Ascend once it drops below that.`, evidence: apEv }

  // Rebirth.
  const m52 = n(arr(save, 'MasteryPerksUnlocked')[52])
  const holdAP = ascendGain({ ...save, APtoSpend: n(save.APtoSpend) + g.ap }).bp - g.bp
  const bpEv: [string, string][] = [
    ['Reward now', `${big(g.bp)} BP (${big(g.bpBase)} base × ${+g.bpMulti.toFixed(2)}) after ${dur(g.rebirthHours)} of this rebirth; ${+(g.bp / Math.max(g.rebirthHours, 0.01)).toFixed(1)} BP/h on average.`],
    ['Rate', recent ? `+${big(recent.bp)} BP/h ${window}; target ${+bpT.rate.toFixed(1)} BP/h, this rebirth's average counting downtime.` : 'needs a save snapshot from earlier in this run.'],
    ...(mt && mt.left > 0.5 ? [['Fighting term', `${mt.zone} stage ${mt.stage}: about +${big(mt.perStage)} BP per stage cleared (estimate: ${mt.perStage / g.bpMulti} base × ${+g.bpMulti.toFixed(2)}), until stage ${mt.capStage} caps it, +${big(mt.left)} BP more.`] as [string, string]] : []),
    buys('BP', g.bp),
    ['Loses', `this run's ${big(g.ap)} AP (a rebirth pays BP only, @12480775), unspent AP${m52 ? ` except ${7 * m52}%` : ''}, ores and fish owned, tilling, botany, the apothecary level and cauldrons (potion levels are kept: neither block writes PotionLV), and everything an ascend resets (@20956359–21022359).`],
    ...(holdAP >= 0.01 * g.bp ? [['Unspent AP', `counts toward BP: ascending and holding that ${big(g.ap)} AP unspent until the rebirth would add about ${big(holdAP)} BP (estimate), at the cost of the perks it buys.`] as [string, string]] : []),
  ]
  const climbing = mt && mt.left > 0.5 ? ` Each ${mt.zone} stage adds about ${big(mt.perStage)} BP until stage ${mt.capStage}.` : ''
  const rebirth: Advice = !recent ? { call: 'unknown', line: `Rebirth: no rate yet. ${big(g.bp)} BP is waiting.${climbing}`, evidence: bpEv }
    : recent.bp < bpT.rate ? { call: 'now', line: `Rebirth now: BP is coming in at ${+recent.bp.toFixed(1)}/h, below this rebirth's ${+bpT.rate.toFixed(1)}/h average. It forfeits the ${big(g.ap)} AP an ascend would pay.`, evidence: bpEv }
      : { call: 'wait', line: `Wait to rebirth: BP is still climbing at ${big(recent.bp)}/h, above this rebirth's ${+bpT.rate.toFixed(1)}/h average.${climbing} Rebirth once the rate drops below that.`, evidence: bpEv }
  return { ascend, rebirth, recent }
}

/** Unspent AP that caps BP term 4 (min(0.1·(0.43·ln(AP + 1))^4.25, 1500), ActorEvents_604; load-bonuses ascensionRewards). */
export const AP_HOLD = Math.expm1(15000 ** (1 / 4.25) / 0.43)

/** Start level after a rebirth (block 2: FarmingLV @20961507, HerbloreLV @20963110, ApothecaryLV @20964725):
 *  1 + AscentionLevel[perk] + ContractRank[44] + AscentionLevel[24] + (TankBonusLIST[46] − 1) + min(max(100·(MasteryBonuses[16] − 1), 0), 20). */
export function rebirthStartLevel(save: Save, perk: 56 | 57 | 58) {
  const al = (i: number) => n(arr(save, 'AscentionLevel')[i]), t46 = arr(save, 'TankBonusLIST').length ? n(arr(save, 'TankBonusLIST')[46]) : 1
  const m16 = arr(save, 'MasteryBonuses').length ? n(arr(save, 'MasteryBonuses')[16]) : 1
  return 1 + al(perk) + n(arr(save, 'ContractRank')[44]) + al(24) + (t46 - 1) + Math.min(Math.max(100 * (m16 - 1), 0), 20)
}

// ---- Climb back with what a reset buys (#2673). ----
/** BP term 5 back to the frontier (zone mode, stage): the inverse of mapTerm's piecewise line (ascensionRewards). At a
 *  zone's cap the next zone's stage 0 is taken (its monsters are tougher, monsterHP rises across zones). */
const MAP_LINES: [number, number, number, number][] = [[650, 15, 20, 650], [350, 14, 5, 350], [180, 13, 3, 180], [70, 12, 2, 70], [26, 11, 0.8, 26], [0, 5, 0.5, 0]]
export function mapFrontier(v: number): { m: number; L: number } | null {
  if (!(v > 0)) return null
  const [, m, slope, b] = MAP_LINES.find(([lo]) => v >= lo)!
  return { m, L: Math.floor((v - b) / slope + 1e-9) }
}

/** A save with the levels `buyList` picks for `budget` of `cur` added to AscentionLevel. */
export function withBuys(save: Save, rows: PerkRow[], cur: 'AP' | 'BP', budget: number) {
  const { buys } = buyList(rows, cur, budget), lv = [...arr(save, 'AscentionLevel')]
  for (const b of buys) lv[b.i] = b.to
  return { next: { ...save, AscentionLevel: lv } as Save, buys }
}

/** Kill rate at a frontier monster, without the one-attack cap: attacks/s × (average hit / monster HP) × survival^1.8 ×
 *  kills credited per kill (fighting.ts estimate, the game's AFK formula @21682751 / @31705994). `a → b` ratio. null on a
 *  save without the fight-scene inputs. */
export function frontierRate(a: Save, b: Save, m: number, L: number) {
  const r = (s: Save) => { const f = fightStats(s); if ('missing' in f) return null; const e = estimate(f, m, L); return e.aps * e.perHit / e.HP * e.survival * e.credit }
  const x = r(a), y = r(b)
  return x && y != null ? y / x : null
}

/** Map climb with a kill-rate multiplier M. ESTIMATE: the climb is taken as damage-walled, the frontier sitting where
 *  the kill rate falls to a fixed level, so frontier monster HP (fighting.ts monsterHP, the game's mapleexpREQ) tracks
 *  your damage over the run. ×M damage reaches a wall when your rebuilt damage was 1/M of what it was there: the first
 *  snapshot of the last climb whose frontier HP was ≥ target HP / M. Snapshots: BP term 5 → (zone, stage). */
export function mapClimb(save: Save, curve: { h: number; v: number }[], target: number, M: number) {
  let best = 0
  const pts = curve.filter((x) => x.v > 0).sort((a, b) => a.h - b.h).map((x) => {
    const f = mapFrontier(x.v)!
    best = Math.max(best, monsterHP(save, f.m, f.L))
    return { h: x.h, hp: best }
  })
  const reach = (need: number) => pts.find((x) => x.hp >= need * (1 - 1e-12))
  const t = reach(target)
  if (!t) return null
  const hit = reach(target / Math.max(M, 1))!
  return { old: t.h, h: hit.h, atMost: hit === pts[0] && M > 1 }
}

/** Farm climb (BP terms 1-3) with a rate factor per term. ESTIMATE: term k's curve over the last cycle runs f_k× faster
 *  (time scales inversely with the rate); first cycle hour when Σ terms ≥ 95% of today's. Snapshot values held between snapshots. */
export function farmClimb(cyc: { rh: number; BP: number[] }[], goal: number, f: number[]) {
  const pts = [...cyc].sort((a, b) => a.rh - b.rh)
  const val = (k: number, t: number) => { let v = 0; for (const x of pts) if (x.rh <= t + 1e-9) v = Math.max(v, n(x.BP[k])); else break; return v }
  const cands = [...new Set(pts.flatMap((x) => [1, 2, 3].map((k) => x.rh / (f[k] ?? 1))))].sort((a, b) => a - b)
  return cands.find((t) => [1, 2, 3].reduce((s, k) => s + val(k, (f[k] ?? 1) * t), 0) >= goal) ?? null
}

export type ClimbFactor = { what: string; ascend: string; rebirth: string; kind: 'modelled' | 'estimate' | 'not modelled' | 'slower' }
const pctx = (x: number) => (x >= 10 ? `×${+x.toFixed(1)}` : `×${+x.toFixed(2)}`)
const buyName = (b: Buy) => `${b.name ?? `perk ${b.i}`} ${b.from}→${b.to}`

/** Climb back after an ascend / a rebirth with the perks the reset buys, against the last climb (resetCompare's "back").
 *  Ascend: map climb with the AP buys' frontier kill-rate ratio (mapClimb). Rebirth: the slower of the map climb with the
 *  BP buys and the farm terms with botany growth from the BP buys (farmClimb). Plus the other things that differ from the
 *  last climb's start, each labelled modelled / estimate / not modelled. `apBudget`: AP spent (the hold-AP plan spends less). */
export function climbBack(save: Save, snaps: AscendSnap[], rows: PerkRow[], apBudget?: number) {
  const g = ascendGain(save), nr = n(save.NumberofTimesRebirth), run = `${n(save.TimesAscended)}-${nr}`, map = g.BP[5]!
  const mine = snaps.filter((x) => x.run === run && x.BP)
  const curve = mine.map((x) => ({ h: x.h, v: n(x.BP![5]) }))
  const tgtSnap = mine.filter((x) => n(x.BP![5]) >= 0.95 * map).sort((a, b) => a.h - b.h)[0]
  const tgt = tgtSnap ? mapFrontier(n(tgtSnap.BP![5])) : mapFrontier(map)
  const tgtHP = tgt ? monsterHP(save, tgt.m, tgt.L) : 0

  // Perk buys and their frontier kill-rate ratio, total and per perk.
  const side = (cur: 'AP' | 'BP', budget: number) => {
    const { next, buys } = withBuys(save, rows, cur, budget)
    const M = tgt ? frontierRate(save, next, tgt.m, tgt.L) : null
    const per = tgt && M != null ? buys.map((b) => {
      const lv = [...arr(save, 'AscentionLevel')]; lv[b.i] = b.to
      return { b, M: frontierRate(save, { ...save, AscentionLevel: lv }, tgt.m, tgt.L) ?? 1 }
    }).filter((x) => x.M > 1.001).sort((x, y) => y.M - x.M) : []
    const climb = M != null && tgt ? mapClimb(save, curve, tgtHP, M) : null
    return { next, buys, M, per, climb }
  }
  const ap = side('AP', apBudget ?? n(save.APtoSpend) + g.ap), bp = side('BP', n(save.BPtoSpend) + g.bp)

  // Farm terms after a rebirth: botany growth from the BP buys (perks.ts OUTPUTS, botany-calc botanyPots; perk 48 @24238487)
  // speeds term 2 (highest flower). Nothing bought changes tilling (tilling.ts reads no AscentionLevel but 54, a potion
  // price), so terms 1 (plant and pot levels, partly botany: kept at ×1) and 3 (seeds) keep their pace.
  const growth = OUTPUTS.find(([k]) => k === 'Botany growth')![1]
  const g0 = growth(save), g1 = growth(bp.next), fBot = g0 && g1 ? g1 / g0 : 1
  const cyc = snaps.filter((x) => x.run?.endsWith(`-${nr}`) && x.BP && Number.isFinite(n(x.rh ?? NaN))).map((x) => ({ rh: n(x.rh), BP: x.BP! }))
  const farmGoal = 0.95 * (n(g.BP[1]) + n(g.BP[2]) + n(g.BP[3]))
  const farmOld = cyc.length ? farmClimb(cyc, farmGoal, [1, 1, 1, 1]) : null, farmNew = cyc.length ? farmClimb(cyc, farmGoal, [1, 1, fBot, 1]) : null
  const termAt = (k: number) => cyc.filter((x) => n(x.BP[k]) >= 0.95 * n(g.BP[k])).sort((a, b) => a.rh - b.rh)[0]?.rh
  const slow = [1, 2, 3].map((k) => ({ k, h: (termAt(k) ?? 0) / (k === 2 ? fBot : 1) })).sort((a, b) => b.h - a.h)[0]!

  const ascOld = ap.climb?.old ?? null, ascNew = ap.climb?.h ?? null
  const rebMapOld = bp.climb?.old ?? ascOld, rebMapNew = bp.climb?.h ?? rebMapOld
  const rebOld = farmOld != null || rebMapOld != null ? Math.max(farmOld ?? 0, rebMapOld ?? 0) : null
  const rebNew = farmNew != null || rebMapNew != null ? Math.max(farmNew ?? 0, rebMapNew ?? 0) : null

  const perkLine = (s: typeof ap) => s.M == null ? 'not modelled (needs a local save with the fight-scene values)'
    : s.per.length ? `${s.per.slice(0, 3).map((x) => `${buyName(x.b)} (+${+(100 * x.b.gain).toFixed(0)}% ${x.b.output}) ×${+x.M.toFixed(2)}`).join(', ')}: frontier kill rate ${pctx(s.M)}`
      : 'no bought perk raises the frontier kill rate'
  const tgtName = tgt ? `${ZONES.find((z) => z.m === tgt.m)?.name ?? `zone ${tgt.m}`} stage ${tgt.L}` : 'today\'s map progress'
  const sg = startGold(save), sgPrev = startGold(save, true, n(save.GoldcoinPreAscend))
  const keptAP = 0.07 * n(arr(save, 'MasteryPerksUnlocked')[52]) * n(save.APtoSpend)
  const short = relevelNeed(save).filter((r) => r.surplus < 0).length

  const factors: ClimbFactor[] = [
    { what: 'Perks the reset buys: damage at the frontier', kind: 'estimate',
      ascend: `${perkLine(ap)}. Map climb to ${tgtName}: ${ascOld != null && ascNew != null ? `hour ${+ascOld.toFixed(1)} → ${ap.climb!.atMost ? 'at most ' : ''}hour ${+ascNew.toFixed(1)} (${pctx(ascOld / Math.max(ascNew, 1e-9))} faster)` : 'no snapshots'}.`,
      rebirth: `${perkLine(bp)}. Map climb: ${rebMapOld != null && rebMapNew != null ? `hour ${+rebMapOld.toFixed(1)} → hour ${+rebMapNew.toFixed(1)}` : 'no snapshots'}.` },
    { what: 'Perks the reset buys: tilling and botany', kind: 'estimate', ascend: 'Kept through an ascend; not part of the map climb.',
      rebirth: `Botany growth ${pctx(fBot)}${fBot > 1.001 ? ` (${bp.buys.filter((b) => b.output === 'Botany growth').map(buyName).join(', ')})` : ''} speeds BP term 2 (highest flower); no bought perk changes tilling, so plant levels and seeds keep their pace. Farm terms: ${farmOld != null && farmNew != null ? `95% of today's sum at cycle hour ${+farmOld.toFixed(0)} → ${+farmNew.toFixed(0)}; ${['', 'plant and pot levels', 'highest flower', 'seeds'][slow.k]} set the pace (95% of today's at hour ${+slow.h.toFixed(0)}${slow.k === 2 ? ' with the faster growth' : ', nothing bought speeds them'})` : 'no snapshots'}.` },
    { what: 'Smithing and the skill tree', kind: 'not modelled',
      ascend: 'Reset to 0 as at the last climb\'s start. Weapon Savant / collector perks raise smithing attack, counted in the damage above; no bought perk changes perk points (perks 11, 13 are not in the buy list).',
      rebirth: `Same, plus ores and fish wiped as at this cycle's start. Bought ore/fish and smithing EXP perks (${bp.buys.filter((b) => /ores|smithing/.test(b.output)).map(buyName).join(', ') || 'none'}) speed re-crafting; how much that shortens the climb is not modelled.` },
    { what: 'Start gold (Skip)', kind: 'not modelled',
      ascend: `${sci(sg.gold)} (${+(sg.keep * 100).toFixed(1)}% of ${sci(n(save.goldcoin))} held) against ${sci(sgPrev.gold)} last time (GoldcoinPreAscend ${sci(n(save.GoldcoinPreAscend))}, today's keep %): ${sgPrev.gold > 0 ? `${sci(sg.gold / sgPrev.gold)}×` : '—'}. Buys lifter levels (training) at once; the time it saves is not modelled (no gold or DPS history in the snapshots).`,
      rebirth: 'A rebirth sets GoldcoinPreAscend = 0 (@20995718; an ascend sets it to goldcoin, @20926350), so it starts from the floor: same as this cycle\'s start.' },
    { what: 'Progress kept since the last climb started', kind: 'not modelled',
      ascend: 'Potion levels, cards, pets, construction, mastery, contract ranks, Realm/vending and other permanent bonuses grown during this run start the next climb at today\'s level. Faster by an amount not determinable: no save from the start of the last climb (snapshots store AP/BP only).',
      rebirth: 'Same for what a rebirth keeps (potion levels, cards, pets, construction, mastery, contract ranks); tilling, botany and apothecary restart as at this cycle\'s start.' },
    { what: 'Souls and unspent AP', kind: 'modelled',
      ascend: `Souls: ${preAscendDeck(save).keep[1]}% kept with the ascend deck, the same rule as last ascend; unspent AP stays (the hold-AP plan).`,
      rebirth: `The AP-kept-when-rebirthing mastery capstone keeps ${7 * n(arr(save, 'MasteryPerksUnlocked')[52])}% of unspent AP: ${sci(keptAP)} AP now${keptAP < 1 ? ', buys nothing' : ''} (the plan's held AP would leave more).` },
    ...(short ? [{ what: 'Ores short for smithing', kind: 'slower' as const, ascend: `Short on ${short} currencies to re-craft today's smithing (Before you ascend): the climb can stall there. Not modelled.`, rebirth: 'Ores and fish are wiped: re-crafting waits on new ore income, as at this cycle\'s start.' }] : []),
  ]
  return { ascend: { old: ascOld, h: ascNew, M: ap.M, per: ap.per }, rebirth: { old: rebOld, h: rebNew, M: bp.M, fBot, per: bp.per }, factors }
}
const sci = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : Math.round(v).toLocaleString())

export type ResetOption = { key: 'keep' | 'ascend' | 'rebirth'; title: string; pays: string; buys: string; wipes: string; keeps: string; back: string }
/** Keep going vs ascend now vs rebirth now: what each pays and buys against what it wipes and how long getting back took.
 *  "Back" is an estimate from the save snapshots (data/ascend-history.json): the hour of this run when BP term 5 (map
 *  progress) first reached 95% of today's, and the hour of this rebirth cycle when BP terms 1-3 (tilling plants and
 *  overlevels, botany flowers and pots, seeds) did, assuming the next climb is no faster than the last one; beside it, the
 *  same climb with what the reset buys (climbBack, #2673). Verdict: resetAdvice's calls, plus the hold-AP plan. */
export function resetCompare(save: Save, snaps: AscendSnap[], rows: PerkRow[], adv = resetAdvice(save, snaps, rows)) {
  const g = ascendGain(save), nr = n(save.NumberofTimesRebirth), run = `${n(save.TimesAscended)}-${nr}`
  const first = (xs: AscendSnap[], clock: (x: AscendSnap) => number) => xs.map(clock).filter(Number.isFinite).sort((a, b) => a - b)[0]
  const map = g.BP[5]!, farm = (b: number[]) => n(b[1]) + n(b[2]) + n(b[3]), farmNow = farm(g.BP)
  const ascBack = first(snaps.filter((x) => x.run === run && (map > 0 ? n(x.BP?.[5]) >= 0.95 * map : x.ap >= 0.95 * g.ap)), (x) => x.h)
  const rebBack = first(snaps.filter((x) => x.run?.endsWith(`-${nr}`) && x.BP && farm(x.BP) >= 0.95 * farmNow), (x) => n(x.rh ?? NaN))
  const ascH = ascBack ?? g.hours, rebH = Math.max(rebBack ?? g.rebirthHours, ascH)
  const r = adv.recent, mt = mapTerm(save), bpAsc = bpAfterAscend(save), keepGold = +(startGold(save).keep * 100).toFixed(1)
  const sl = (k: string) => Math.round(n(save[k])), m52 = n(arr(save, 'MasteryPerksUnlocked')[52])
  // With what the reset buys (#2673): climbBack's map / farm climbs, the old estimate kept beside it.
  const cb = climbBack(save, snaps, rows)
  const faster = (c: { old: number | null; h: number | null }, drivers: string) => c.old != null && c.h != null
    ? ` With what it buys: about ${dur(c.h)} (${pctx(c.old / Math.max(c.h, 1e-9))} faster${drivers ? `; ${drivers}` : ''}). Estimate; breakdown below.` : ''
  const top = (per: { b: Buy; M: number }[], M: number | null) => per.length && M ? `${per.slice(0, 3).map((x) => `${x.b.name ?? `perk ${x.b.i}`} ×${+x.M.toFixed(2)}`).join(', ')} → frontier kill rate ${pctx(M)}` : ''

  // Hold-AP plan: ascend, leave AP_HOLD unspent, climb back, then rebirth. BP at today's progress with that AP held.
  const held = Math.min(n(save.APtoSpend) + g.ap, AP_HOLD), planBP = ascendGain({ ...save, APtoSpend: held }).bp
  const plan = planBP - g.bp >= 0.05 * g.bp
    ? `Ascend, keep ${big(held)} AP unspent (that caps the unspent-AP BP term), get back to today's progress (about ${dur(cb.ascend.h ?? ascH)}, estimate with the perks it buys), then rebirth: about ${big(planBP)} BP instead of ${big(g.bp)} now (estimate: today's terms with the held AP), and the other ${big(Math.max(n(save.APtoSpend) + g.ap - held, 0))} AP buys perks.${m52 ? ` The rebirth keeps ${7 * m52}% of the held AP.` : ''}`
    : null

  const options: ResetOption[] = [
    { key: 'keep', title: 'Keep going',
      pays: r ? `AP +${big(r.ap)}/h, BP +${big(r.bp)}/h over the last ${dur(r.dh)}.` : 'No recent rate yet (needs a snapshot an hour back).',
      buys: mt && mt.left > 0.5 ? `Room to grow: each ${mt.zone} stage adds about ${big(mt.perStage)} BP, +${big(mt.left)} BP more by stage ${mt.capStage}.` : 'Rewards grow with the run; nothing is spent.',
      wipes: 'Nothing.', keeps: 'Everything.', back: '—' },
    { key: 'ascend', title: 'Ascend now',
      pays: `${big(g.ap)} AP.`, buys: buyLine(save, rows, 'AP', g.ap)[1],
      wipes: `Fighting back to zone 1, the skill tree and perk points, smithing items 1–80, gold (Skip keeps ${keepGold}%), most souls (@20900963–20952873)${bpAsc < g.bp - 0.5 ? `. The BP a rebirth would pay drops ${big(g.bp)} → ${big(bpAsc)} until those are rebuilt` : ''}.`,
      keeps: 'AP and BP perks, unspent AP and BP, tilling, botany, apothecary and potion levels, ores and fish, cards, pets, mastery, contract ranks.',
      back: `About ${dur(ascH)} (estimate: ${ascBack != null ? `this run reached today's ${map > 0 ? 'map progress' : 'AP'} at hour ${+ascH.toFixed(1)} of ${+g.hours.toFixed(1)}` : 'no snapshots, the whole run so far'}).${faster(cb.ascend, top(cb.ascend.per, cb.ascend.M))}` },
    { key: 'rebirth', title: 'Rebirth now',
      pays: `${big(g.bp)} BP; this run's ${big(g.ap)} AP is not paid.`, buys: buyLine(save, rows, 'BP', g.bp)[1],
      wipes: `Everything an ascend wipes, plus tilling (level ${sl('FarmingLV')} → ${Math.floor(rebirthStartLevel(save, 56))}), botany (${sl('HerbloreLV')} → ${Math.floor(rebirthStartLevel(save, 57))}), the apothecary level and cauldrons (${sl('ApothecaryLV')} → ${Math.floor(rebirthStartLevel(save, 58))}), seeds, flowers, plots, ores and fish owned, unspent AP${m52 ? ` except ${7 * m52}%` : ''} (@20956359–21022359).`,
      keeps: 'AP and BP perks, potion levels (neither reset writes PotionLV), cards, pets, mastery, contract ranks, construction.',
      back: `About ${dur(rebH)} (estimate: ${rebBack != null ? `tilling and botany reached today's BP terms at hour ${+rebH.toFixed(0)} of this ${dur(g.rebirthHours)} rebirth cycle` : 'no snapshots, the whole rebirth cycle so far'}).${faster(cb.rebirth, [top(cb.rebirth.per, cb.rebirth.M), cb.rebirth.fBot > 1.001 ? `botany growth ${pctx(cb.rebirth.fBot)}` : ''].filter(Boolean).join(', '))}` },
  ]
  const a = adv.ascend.call, b = adv.rebirth.call
  const pick: ResetOption['key'] = b === 'now' && !(a === 'now' && plan) ? 'rebirth' : a === 'now' ? 'ascend' : 'keep'
  const verdict = pick === 'rebirth' ? `Rebirth: BP has stopped climbing; ${big(g.bp)} BP outweighs the ${big(g.ap)} AP it forfeits only if you won't ascend first.`
    : pick === 'ascend' ? `Ascend${b === 'now' && plan ? ', then rebirth (plan below)' : ''}: AP has stopped climbing, and an ascend keeps tilling, botany and potions.`
      : `Keep going: ${a === 'unknown' ? 'no rate yet' : 'AP and BP are both still climbing faster than a run averages'}. Neither reset pays more per hour yet.`
  return { pick, verdict, options, plan, climb: cb }
}
