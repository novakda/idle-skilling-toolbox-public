// Spiriting (the Limbo cultist/acolyte screen, CurrentlyViewedScreen 9; scene init † @21245134). 8 cultists and 8 acolytes
// (index 1-8). Each animation cycle of either rolls Spirit EXP (the skill). A cultist's cycle also rolls soul FRAGMENTS of its
// task colour into a jar; a full jar is a completed soul of that colour (and one fragment of the next colour up), and the
// acolytes assigned to that colour convert it into spendable souls (SoulsTotal, the Rift page's currency). Colours are
// rift.ts SOULS (index = task). Formulas ported from Qno2x.js (offsets †), checked in spiriting.test.ts against the save
// and the game's own code in the sandbox. Away rates follow the away-credit block (deterministic); on screen is noted.
import { framesPerSec } from '../../anim'
import { cbonus, type Catalog } from '../cards/cards-calc'
import catalog from '../../data/card-catalog.json'
import { masteryBonuses, potionBonuses } from '../../bus'
import { rules } from '../summoning/summoning'
import { RIFT_COUNT, SPEED_CAP, upgradeCost as riftCost } from '../rift/rift'
import { current } from '../../screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const set = (s: Save, k: string, i: number, v: number) => arr(s, k).map((x, j) => (j === i ? v : x))
export const SKILLERS = 8
export type Kind = 'cultist' | 'acolyte'

/** Highest task (soul colour) a cultist / acolyte can take (raise button, ActorEvents_809 † @15285743: cultist task < 5,
 *  acolyte < 6), and the Spiriting level the raise from task t to t+1 needs for skiller i: 10·t + 2·(i − 1). Lowering is free. */
export const TASK_MAX: Record<Kind, number> = { cultist: 5, acolyte: 6 }
export const raiseReq = (t: number, i: number) => 10 * t + 2 * (i - 1)
export function taskCap(s: Save, kind: Kind, i: number) {
  let t = 1
  while (t < TASK_MAX[kind] && n(s.spiritLVL) >= raiseReq(t, i)) t++
  return t
}

/** Fragments per completed soul by colour, away († @21283971: 12, 16, 19, 19, 20, 21, 21; the on-screen jar uses 15 for
 *  Orange, † @21476030). Colour 7 (White) promotes nothing. */
export const JAR = [0, 12, 16, 19, 19, 20, 21, 21]

/** The scene-init values (runLater 30, † @21245134), recomputed because cloud saves lack them and local ones date from the
 *  last Spiriting visit. CultistEventBonusPercent = Σ EventBonusPercentList[40..49] + CbonusCultistEfficiency + 10·
 *  ContractRank[40] (the loop adds the last two 10× at 1/10). Soul bonus % per skiller r: hyper (mtxCultandAco ≥ r) 2·(5·SL +
 *  50 + X), else 5·SL + X; cultists SL = SkillLevels[33], X = that event bonus, × (1 + 5%·ShrineLevels[4]); acolytes SL =
 *  SkillLevels[34], X = CbonusAcolyteEfficiency + 10·ContractRank[40]; both × MasteryBonuses[19]. SpiritChance (per 1000) =
 *  100 + 20·SkillLevels[32] + 10·CbonusSpiritEXPchance († @21246921); SpiritEXPbonus = MTXdoubleSpiriting. Cards: the
 *  Spiriting-linked deck (link 8). Then the acolytes' conversion totals (conversion()); the skiller caches (skillerStats) when
 *  the save is off the Spiriting screen. */
export function withSpirit(s: Save): Save {
  const cb = cbonus(s, catalog as unknown as Catalog, 8), sl = (i: number) => n(arr(s, 'SkillLevels')[i]), cr = n(arr(s, 'ContractRank')[40])
  const mast = n(current(s, 'MasteryBonuses', () => masteryBonuses(s))[19])
  const ev = arr(s, 'EventBonusPercentList').slice(40, 50).reduce((t, x) => t + n(x), 0) + n(cb.CbonusCultistEfficiency) + 10 * cr
  const hyper = (r: number) => n(s.mtxCultandAco) >= r, aX = n(cb.CbonusAcolyteEfficiency) + 10 * cr
  let model: ReturnType<typeof skillerStats> | undefined
  const caches = Object.fromEntries(CACHES.map((k) => [k, current(s, k, () => (model ??= skillerStats(s))[k])]))
  const out: Save = {
    ...s, ...caches, CultistEventBonusPercent: ev, SpiritEXPbonus: n(s.MTXdoubleSpiriting),
    SpiritChance: 100 + 20 * sl(32) + 10 * n(cb.CbonusSpiritEXPchance), PbonusLimboLuck: potionBonuses(s).LimboLuck,
    CultistSoulBonusPercent: Array.from({ length: 10 }, (_, r) => (hyper(r) ? 2 * (5 * sl(33) + 50 + ev) : 5 * sl(33) + ev) * (1 + (5 * n(arr(s, 'ShrineLevels')[4])) / 100) * mast),
    AcolyteSoulBonusPercent: Array.from({ length: 10 }, (_, r) => (hyper(r) ? 2 * (5 * sl(34) + 50 + aX) : 5 * sl(34) + aX) * mast),
  }
  return { ...out, ...conversion(out) }
}

const owned = (s: Save, kind: Kind, i: number) => n(arr(s, kind === 'cultist' ? 'CultistLV' : 'AcolyteLV')[i]) > 0
const tasksOf = (s: Save, kind: Kind) => Array.from({ length: SKILLERS + 1 }, (_, i) => (i && owned(s, kind, i) ? n(arr(s, kind === 'cultist' ? 'CultistTASK' : 'AcolyteTASK')[i]) : 0))

/** Acolyte conversion (Spiriting draw, † @15138095 / @15141040): each acolyte i on task t adds 5·(1 + LV3/100)·(1 + bonus/100)
 *  to the conversion chance % and SoulsGivenAco·(1 + bonus/100) to the souls per conversion of colour t AND colour t + 1. */
export function conversion(s: Save, tasks = tasksOf(s, 'acolyte')) {
  const chance = Array<number>(10).fill(0), conv = Array<number>(10).fill(0)
  for (let i = 1; i <= SKILLERS; i++) {
    const t = tasks[i]!
    if (!t) continue
    const b = 1 + n(arr(s, 'AcolyteSoulBonusPercent')[i]) / 100
    for (const k of [t, t + 1]) {
      chance[k]! += 5 * (1 + n(arr(s, 'AcolyteLV3')[i]) / 100) * b
      conv[k]! += n(arr(s, 'SoulsGivenAco')[i]) * b
    }
  }
  return { SoulConversionChanceTOTAL: chance, SoulsConvertedTOTAL: conv }
}

/** Souls per second of away credit by colour (the away block, † @21259174 and @21283971–@21296340): cultist i on task t adds
 *  speed/5 cycles × SoulsGiven·(1 + B/100) × chance 15^−(t−1)·(1 + luck/100)·(1 + B/100) fragments of colour t (B = its soul
 *  bonus; the on-screen roll caps that chance at 100%, † @15193101, away does not). Colour k completes frags/JAR[k] souls, which
 *  also add as fragments of k + 1; the acolytes then bank chance_k/100 × completed × souls-per-conversion_k (uncapped away; on
 *  screen the conversion roll is 1-99, so anything ≥ 100% is a sure 1×, † @21476030). Long-run linear rates: a single away
 *  period too short to fill a jar banks that colour's fragments in the jar (SoulsOwned) instead. */
export function soulRates(s: Save, cult = tasksOf(s, 'cultist'), aco = tasksOf(s, 'acolyte')) {
  const { SoulConversionChanceTOTAL: chance, SoulsConvertedTOTAL: conv } = conversion(s, aco)
  const frags = Array<number>(9).fill(0)
  for (let i = 1; i <= SKILLERS; i++) {
    const t = cult[i]!
    if (!t) continue
    const b = 1 + n(arr(s, 'CultistSoulBonusPercent')[i]) / 100
    frags[t]! += (n(arr(s, 'CultistAnimationSpeed')[i]) / 5) * n(arr(s, 'SoulsGiven')[i]) * b * 15 ** -(t - 1) * (1 + n(arr(s, 'CultLuckLV')[i]) / 100) * b
  }
  const done = Array<number>(9).fill(0), souls = Array<number>(9).fill(0)
  for (let k = 1; k <= 7; k++) {
    done[k] = frags[k]! / JAR[k]!
    if (k < 7) frags[k + 1]! += done[k]!
    souls[k] = (chance[k]! / 100) * done[k]! * conv[k]!
  }
  return { frags, done, souls, chance, conv }
}

/** What souls are for: the next level of each rift's value and speed upgrade (rift.ts upgradeCost, the rift screen's costs
 *  † @21599132; speed only below SPEED_CAP). For each one you can't afford yet: the colours short and by how much. */
export function riftNeeds(s: Save) {
  const held = (c: number) => n(arr(s, 'SoulsTotal')[c]), out = []
  for (let r = 1; r <= RIFT_COUNT; r++) for (const kind of ['value', 'speed'] as const) {
    const L = n(arr(s, kind === 'value' ? 'RiftVALUElv' : 'RiftSpeedlv')[r])
    if (!n(arr(s, 'RiftVALUElv')[r]) || (kind === 'speed' && L >= SPEED_CAP)) continue
    const gaps = riftCost(r, kind, L).filter(([c, q]) => held(c) < q).map(([c, q]) => [c, q - held(c)] as [number, number])
    if (gaps.length) out.push({ r, kind, L, gaps })
  }
  return out
}
/** What the setup optimiser maximises: Σ over those unaffordable rift upgrades of 1 / (time until it is affordable), the
 *  time being its slowest colour's shortfall ÷ that colour's souls per away second. Why: souls only buy rift levels (and
 *  rift unlocks/Pro, all done or Pink here), so the setup worth having is the one that closes the gaps soonest; raw soul
 *  counts would always pick Red (15× more fragments per tier down) even when Red is not what is short. Myopic: next
 *  level of each upgrade only, current stock. */
export function needScore(s: Save, souls: number[], needs = riftNeeds(s)) {
  return needs.reduce((t, b) => t + Math.min(...b.gaps.map(([c, d]) => souls[c]! / d)), 0)
}

/** The best task for every cultist and acolyte (each within its level cap), by needScore. Coordinate ascent: each skiller in
 *  turn takes its best colour given the others (by needScore), until nothing changes; run from the current setup and from
 *  every "everyone on colour t" start, best kept. ponytail: local search (acolyte chance × conversion is a product, so it is not
 *  separable); exhaustive is 5^8 · 6^8, add branch-and-bound if a start ever disagrees with the best. */
export function optimal(s: Save, needs = riftNeeds(s)) {
  const cur = { cult: tasksOf(s, 'cultist'), aco: tasksOf(s, 'acolyte') }
  const score = (c: number[], a: number[]) => needScore(s, soulRates(s, c, a).souls, needs)
  const climb = (c: number[], a: number[]) => {
    for (let moved = true, guard = 0; moved && guard < 50; guard++) {
      moved = false
      for (const [kind, v] of [['cultist', c], ['acolyte', a]] as const) for (let i = 1; i <= SKILLERS; i++) {
        if (!v[i]) continue
        const was = v[i]!
        let best = was, bs = score(c, a)
        for (let t = 1; t <= taskCap(s, kind, i); t++) { v[i] = t; const x = score(c, a); if (x > bs * (1 + 1e-12)) { best = t; bs = x } }
        v[i] = best
        if (best !== was) moved = true
      }
    }
    return { cult: c, aco: a, value: score(c, a) }
  }
  const starts = [{ cult: [...cur.cult], aco: [...cur.aco] }, ...Array.from({ length: 6 }, (_, t) => ({
    cult: cur.cult.map((x, i) => (x ? Math.min(t + 1, taskCap(s, 'cultist', i)) : 0)), aco: cur.aco.map((x, i) => (x ? Math.min(t + 1, taskCap(s, 'acolyte', i)) : 0)),
  }))]
  let best = { ...cur, value: -1 }
  for (const st of starts) { const r = climb(st.cult, st.aco); if (r.value > best.value * (1 + 1e-12)) best = r }
  return { now: { ...cur, ...soulRates(s, cur.cult, cur.aco), value: score(cur.cult, cur.aco) }, best: { ...best, ...soulRates(s, best.cult, best.aco) } }
}

/** The plan as a sequence (the author, 2026-10-11): for the rift upgrades you can't afford today (riftNeeds), repeatedly take the
 *  best setup for the ones still unpaid, run it until the first becomes affordable, pay it, and re-optimise; consecutive steps
 *  with the same setup merge. A setup stays while it can still pay something on the list (each switch is up to 16
 *  reassignments in game); only then is the best setup recomputed. Plans against today's list only: buying a level doesn't queue the next one, or cheap speed
 *  levels would starve the big gaps. Times are seconds of away credit (× nonActiveZoneGainPercent for real time). Upgrades no
 *  setup can reach end the plan as "unreachable". ponytail: souls a step makes beyond the paid gap carry over, but the setup
 *  isn't re-optimised mid-step. */
export function sequence(s0: Save, maxSteps = 20) {
  const held = [...arr(s0, 'SoulsTotal')].map(n)
  let todo = riftNeeds(s0).map(({ r, kind, L }) => ({ r, kind, L }))
  const steps: { cult: number[]; aco: number[]; secs: number; buys: typeof todo }[] = []
  let keep: { cult: number[]; aco: number[]; souls: number[] } | null = null
  for (let k = 0; k < maxSteps && todo.length; k++) {
    const s = { ...s0, SoulsTotal: held }
    const needs = todo.map((u) => ({ ...u, gaps: riftCost(u.r, u.kind, u.L).filter(([c, q]) => held[c]! < q).map(([c, q]) => [c, q - held[c]!] as [number, number]) }))
    const ready = needs.filter((g) => !g.gaps.length)
    const open = needs.filter((g) => g.gaps.length)
    let secs = 0, best = { cult: tasksOf(s0, 'cultist'), aco: tasksOf(s0, 'acolyte'), souls: Array<number>(9).fill(0) }
    let pay = ready
    if (!ready.length) {
      const firstFor = (b: typeof best) => open.map((g) => ({ g, t: Math.max(...g.gaps.map(([c, d]) => (b.souls[c]! > 0 ? d / b.souls[c]! : Infinity))) })).sort((a, b) => a.t - b.t)[0]!
      let first = keep ? firstFor(keep) : null
      if (first && isFinite(first.t)) best = keep!
      else { best = optimal(s, open).best; first = firstFor(best) }
      if (!isFinite(first.t)) break
      keep = best
      secs = first.t
      for (let c = 1; c < held.length; c++) held[c] = held[c]! + (best.souls[c] ?? 0) * secs
      pay = [first.g]
    }
    for (const g of pay) for (const [c, q] of riftCost(g.r, g.kind, g.L)) held[c] = held[c]! - q
    todo = todo.filter((u) => !pay.some((g) => g.r === u.r && g.kind === u.kind))
    const last = steps.at(-1), buys = pay.map(({ r, kind, L }) => ({ r, kind, L }))
    if (last && last.cult.join() === best.cult.join() && last.aco.join() === best.aco.join()) { last.secs += secs; last.buys.push(...buys) }
    else steps.push({ cult: [...best.cult], aco: [...best.aco], secs, buys })
  }
  return { steps, unreachable: todo }
}

/** Stockpile mode (the author, 2026-10-11): no particular target, keep every colour coming in proportion to what it will be spent on.
 *  Demand per colour = souls the next `levels` levels of every owned rift upgrade cost. Measure: rounds per second = min over
 *  colours of rate / demand (1 round = every upgrade +`levels`). Answer: a rotation, the share of time on each single-colour
 *  setup (everyone on colour t, capped at each skiller's top colour). Rotating beats any fixed mix because an acolyte colour's
 *  chance and souls-per-conversion are each summed over its acolytes and then multiplied, so concentrating pays ~quadratically
 *  (checked 2026-10-11: best fixed mix found 0.0026 rounds/real h, rotation 0.0109). ponytail: shares searched on a `step`
 *  grid over the 6 single-colour setups; an LP solver would give exact shares. */
export function stockpile(s: Save, levels = 10, step = 0.05) {
  const demand = Array<number>(9).fill(0)
  for (let r = 1; r <= RIFT_COUNT; r++) for (const kind of ['value', 'speed'] as const) {
    if (!n(arr(s, 'RiftVALUElv')[r])) continue
    const L0 = n(arr(s, kind === 'value' ? 'RiftVALUElv' : 'RiftSpeedlv')[r])
    for (let L = L0; L < L0 + levels && !(kind === 'speed' && L >= SPEED_CAP); L++) for (const [c, q] of riftCost(r, kind, L)) demand[c]! += q
  }
  const cols = demand.map((d, c) => (d > 0 ? c : 0)).filter(Boolean)
  const cur = { cult: tasksOf(s, 'cultist'), aco: tasksOf(s, 'acolyte') }
  const setups = Array.from({ length: Math.max(TASK_MAX.cultist, TASK_MAX.acolyte) }, (_, k) => {
    const cult = cur.cult.map((x, i) => (x ? Math.min(k + 1, taskCap(s, 'cultist', i)) : 0)), aco = cur.aco.map((x, i) => (x ? Math.min(k + 1, taskCap(s, 'acolyte', i)) : 0))
    return { t: k + 1, cult, aco, souls: soulRates(s, cult, aco).souls }
  })
  const rounds = (w: number[]) => Math.min(...cols.map((c) => w.reduce((t, f, j) => t + f * setups[j]!.souls[c]!, 0) / demand[c]!))
  let best = { v: -1, w: [] as number[] }
  const steps = Math.round(1 / step)
  const rec = (j: number, left: number, w: number[]) => {
    if (j === setups.length - 1) { const ww = [...w, left * step]; const v = rounds(ww); if (v > best.v) best = { v, w: ww }; return }
    for (let k = 0; k <= left; k++) rec(j + 1, left - k, [...w, k * step])
  }
  if (cols.length) rec(0, steps, [])
  const souls = Array.from({ length: 9 }, (_, c) => best.w.reduce((t, f, j) => t + f * (setups[j]!.souls[c] ?? 0), 0))
  return { demand, levels, setups: setups.map((x, j) => ({ ...x, share: best.w[j] ?? 0 })).filter((x) => x.share > 0), souls, rounds: Math.max(best.v, 0), now: cols.length ? roundsOf(soulRates(s, cur.cult, cur.aco).souls, demand, cols) : 0 }
}
const roundsOf = (souls: number[], demand: number[], cols: number[]) => Math.min(...cols.map((c) => (souls[c] ?? 0) / demand[c]!))

/** Spirit EXP per second (pass withSpirit(save)). Away (the away block, † @21279930): Σ speed/5 × SpiritExpGiven × (1 +
 *  SpiritEXPbonus) × SpiritChance/1000 × ⌊(99 + LV)/100⌋ over cultists (C) and acolytes (A). That last factor is meant as
 *  "owned" (LV ≥ 1), but an acolyte's LV is its value level, so away credit counts an acolyte 1× per started 100 value
 *  levels (lv 418: 5×); cultists' CultistLV stays 1. On screen a 10 ms timer adds speed/100 to a counter
 *  and each draw advances a frame when it is ≥ 1 († @21488003, as rifts: framesPerSec), 6 frame steps per cycle (the actor
 *  resets past frame 5, † @15193101). */
export function spiritRates(s: Save) {
  const k = (1 + n(s.SpiritEXPbonus)) * (n(s.SpiritChance) / 1000), rows = []
  for (const kind of ['cultist', 'acolyte'] as const) for (let i = 1; i <= SKILLERS; i++) {
    if (!owned(s, kind, i)) continue
    const speed = n(arr(s, kind === 'cultist' ? 'CultistAnimationSpeed' : 'AcolyteAnimationSpeed')[i])
    const per = n(arr(s, kind === 'cultist' ? 'SpiritExpGivenC' : 'SpiritExpGivenA')[i]) * k
    const mult = Math.floor((99 + n(arr(s, kind === 'cultist' ? 'CultistLV' : 'AcolyteLV')[i])) / 100)
    rows.push({ kind, i, speed, mult, away: (speed / 5) * per * mult, screen: (framesPerSec(speed) / 6) * per })
  }
  return { rows, away: rows.reduce((t, r) => t + r.away, 0), screen: rows.reduce((t, r) => t + r.screen, 0) }
}

/** The Spiriting level-up (Spiriting draw listener † @21305482): a level when spiritEXP ≥ SpiritREQ·(1 − cut), cut =
 *  min(GiftShopLevels[20]/5, 50)%; skill points and the shrine-6 head start as Summoning (summoning.ts rules); next
 *  requirement 1.33·req + 150·⌊L/10⌋ + 3·L² (L = new level). Ascending resets it to 10 († @20910927). */
export const nextSpiritReq = (req: number, L: number) => 1.33 * req + 150 * Math.floor(L / 10) + 3 * L ** 2
export function spiritLevel(s: Save, gain = 0) {
  const { sp, shrine } = rules(s), cut = Math.min(n(arr(s, 'GiftShopLevels')[20]) / 5, 50) / 100
  let lv = n(s.spiritLVL), exp = n(s.spiritEXP) + gain, req = n(s.SpiritREQ), levels = 0
  const threshold = req * (1 - cut)
  while (req > 0 && exp >= req * (1 - cut) && levels < 1e4) {
    exp -= req * (1 - cut)
    req = nextSpiritReq(req, ++lv)
    exp += shrine * req
    levels++
  }
  return { cut, sp, shrine, threshold, levels, lv, exp, req }
}

/** Upgrades, paid in gold coins (goldcoin). Cost for skiller i at level L, ÷ (1 + 8·[i ≥ 2]):
 *  cultist value 6^(i−1)·5000i·1.12^(L−1) († @12446338), speed 6^(i−1)·10⁴i·1.2^(L−1) (L < 81, † @12620971),
 *  luck 6^(i−1)·2000i·1.1^(L−1)·1.1^max(L−140, 0) (L < 81 + PbonusLimboLuck, † @15279100); acolytes the same with 8^(i−1)
 *  for 6^(i−1) († @12449888, @12624508, @15281824). Effects: value SpiritExpGiven += 1 + ⌊L/3⌋/10 + ⌊L/10⌋/2 and SoulsGiven
 *  += 0.01; speed × (1 + 8/(1 + ⌊L/10⌋/5)/100) and SoulsGiven += 0.015; luck SoulsGiven += 0.005 (and the luck level itself). */
const KEYS = {
  cultist: { value: 'CultValueLV', speed: 'CultSpeedLV', luck: 'CultLuckLV', exp: 'SpiritExpGivenC', souls: 'SoulsGiven', anim: 'CultistAnimationSpeed', g: 6 },
  acolyte: { value: 'AcolyteLV', speed: 'AcolyteLV2', luck: 'AcolyteLV3', exp: 'SpiritExpGivenA', souls: 'SoulsGivenAco', anim: 'AcolyteAnimationSpeed', g: 8 },
} as const
export type Stat = 'value' | 'speed' | 'luck'
const CACHES = Object.values(KEYS).flatMap((K) => [K.exp, K.souls, K.anim])
/** The skiller caches the Spriting scene rebuilds from the upgrade levels (runPeriodically 500 † @21274672) for each owned
 *  skiller: SpiritExpGiven = 1 + Σ_{L<V} (1 + ⌊L/3⌋/10 + ⌊L/10⌋/2), AnimationSpeed = Π_{L<S} (1 + 8/(1 + ⌊L/10⌋/5)/100),
 *  SoulsGiven = 1 + 0.01·(V − 1) + 0.015·(S − 1) + 0.005·(K − 1) (V/S/K = value/speed/luck level; same as bought()). */
export function skillerStats(s: Save): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const K of Object.values(KEYS)) {
    const exp = [...arr(s, K.exp)], anim = [...arr(s, K.anim)], souls = [...arr(s, K.souls)]
    for (let i = 1; i <= SKILLERS; i++) {
      const V = n(arr(s, K.value)[i]), S = n(arr(s, K.speed)[i]), L = n(arr(s, K.luck)[i])
      if (!V) continue
      let e = 1, a = 1
      for (let x = 1; x < V; x++) e += 1 + Math.floor(x / 3) / 10 + Math.floor(x / 10) / 2
      for (let x = 1; x < S; x++) a *= 1 + 8 / (1 + Math.floor(x / 10) / 5) / 100
      exp[i] = e; anim[i] = a; souls[i] = 1 + 0.01 * (V - 1) + 0.015 * (S - 1) + 0.005 * (L - 1)
    }
    Object.assign(out, { [K.exp]: exp, [K.anim]: anim, [K.souls]: souls })
  }
  return out
}
export const levelCap = (s: Save, st: Stat) => (st === 'value' ? Infinity : st === 'speed' ? 81 : 81 + n(s.PbonusLimboLuck))
export function upgradeCost(kind: Kind, st: Stat, i: number, L: number) {
  const base = st === 'value' ? 5000 * 1.12 ** (L - 1) : st === 'speed' ? 1e4 * 1.2 ** (L - 1) : 2000 * 1.1 ** (L - 1) * 1.1 ** Math.max(L - 140, 0)
  return (KEYS[kind].g ** (i - 1) * i * base) / (1 + 8 * Math.floor((98 + i) / 100))
}
export function bought(s: Save, kind: Kind, st: Stat, i: number): Save {
  const K = KEYS[kind], L = n(arr(s, K[st])[i]), out: Save = { ...s, [K[st]]: set(s, K[st], i, L + 1) }
  const add = (k: string, d: number) => (out[k] = set(out, k, i, n(arr(out, k)[i]) + d))
  if (st === 'value') { add(K.exp, 1 + Math.floor(L / 3) / 10 + Math.floor(L / 10) / 2); add(K.souls, 0.01) }
  if (st === 'speed') { out[K.anim] = set(out, K.anim, i, n(arr(s, K.anim)[i]) * (1 + 8 / (1 + Math.floor(L / 10) / 5) / 100)); add(K.souls, 0.015) }
  if (st === 'luck') add(K.souls, 0.005)
  return out
}

export type Upgrade = { kind: Kind; i: number; st: Stat; from: number; cost: number; affordable: boolean; souls: number[]; value: number; sp: number; score: number }
/** Every open upgrade, ranked by the page's soul measure (needScore at the current task setup, per hour) gained per gold
 *  coin. Skill points per day (from the extra Spirit EXP at today's level threshold) is a side figure. */
export function upgrades(s: Save): Upgrade[] {
  const needs = riftNeeds(s), r0 = soulRates(s), v0 = needScore(s, r0.souls, needs), e0 = spiritRates(s).away, L0 = spiritLevel(s), out: Upgrade[] = []
  for (const kind of ['cultist', 'acolyte'] as const) for (let i = 1; i <= SKILLERS; i++) for (const st of ['value', 'speed', 'luck'] as const) {
    if (!owned(s, kind, i)) continue
    const from = n(arr(s, KEYS[kind][st])[i])
    if (from >= levelCap(s, st)) continue
    const t = bought(s, kind, st, i), r = soulRates(t), cost = upgradeCost(kind, st, i, from)
    const value = 3600 * (needScore(s, r.souls, needs) - v0), sp = ((86400 * (spiritRates(t).away - e0)) / L0.threshold) * L0.sp
    out.push({ kind, i, st, from, cost, affordable: n(s.goldcoin) >= cost, souls: r.souls.map((x, k) => 86400 * (x - r0.souls[k]!)), value, sp, score: value / cost })
  }
  return out.sort((a, b) => b.score - a.score || b.sp / b.cost - a.sp / a.cost)
}

/** Hiring the next cultist / acolyte (SelectedUpgrade 300 / 400, † @13664336): fewer than 8 owned, spiritLVL ≥ 8·owned
 *  (cultists) or 11·owned (acolytes), and NewCultCost / NewAcoCost gold coins (stored by the game; their formula is not
 *  traced, unverified). */
export function nextHire(s: Save, kind: Kind) {
  const have = n(kind === 'cultist' ? s.CultistsOwned : s.AcolytesOwned)
  if (have >= SKILLERS) return null
  const lv = (kind === 'cultist' ? 8 : 11) * have, cost = n(kind === 'cultist' ? s.NewCultCost : s.NewAcoCost)
  return { kind, i: have + 1, lv, cost, ready: n(s.spiritLVL) >= lv && n(s.goldcoin) >= cost }
}
