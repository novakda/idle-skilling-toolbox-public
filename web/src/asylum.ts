// Asylum page (#46): keys, traces, bosses and which run to do next. The fight model (boss HP, block, your skills) is
// raids.ts (#35); this adds the Asylum's key timer, what a win drops, and a run plan. Read from Qno2x.js (offsets †).
import { asylumCell, BOSSES, fightContext, raids, runSeconds, TIERS, type Fight } from './raids'
import { shrineOwned, shrineRows, type ShrineTable } from './income'
import shrineTable from './data/shrines.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const at = (save: Save, k: string, i: number) => n((save[k] as number[] | undefined)?.[i])

/** AsylumTracesOwned[1..10]. 1-4 are the bosses' (drop types 7-10 → [1..4], ActorEvents_894 @15767273+); 5-10 are skill
 *  traces, dropped by the same-named activity (drop type − 6; the trace actor 894 is spawned with TraceDropAmount): Mining
 *  (type 11, SceneEvents_5 @30276230), Fishing (12, SceneEvents_7 @31538783), Smithing (13, ActorEvents_376 @8917603), Botany
 *  (14, ActorEvents_1128 @3436249), Tilling (15, SceneEvents_34 @23494373), Apothecary (16, SceneEvents_37 @24899551); the
 *  type → slot table is ActorEvents_894 @15753095+. */
export const TRACES = ['Emigdala', 'Occulon', 'Scallius', 'Gorshank', 'Mining', 'Fishing', 'Smithing', 'Botany', 'Tilling', 'Apothecary']

// ---- Keys (AsylumTickets) ---------------------------------------------------------------------------------------------
/** The Asylum select screen (SceneEvents_39): on entry TimeToNextTicketASYLUM += now − TimeLastInAsylum (@26144436,
 *  @26145013; TimeLastInAsylum is only written there, @26144782), then +1 every second on that screen (@26159304). While it
 *  is past 7200 each frame gives 1 + CbonusAsylumKeys/100 keys, or twice that when randomInt(1,100) < 5·ContractRank[54]
 *  (@26157420, @26157638, @26158125), and takes 7200·(1 − 7%·MasteryPerksUnlocked[80]) off (@26158859). */
export function keys(save: Save, now = Date.now() / 1000) {
  const interval = 7200 * (1 - 0.07 * at(save, 'MasteryPerksUnlocked', 80)), each = 1 + n(save.CbonusAsylumKeys) / 100
  const double = Math.min(Math.max(5 * at(save, 'ContractRank', 54) - 1, 0), 100) / 100
  let timer = n(save.TimeToNextTicketASYLUM) + (n(save.HaveuBeentoAsylum) ? Math.max(0, now - n(save.TimeLastInAsylum)) : 0)
  const grants = timer > 7200 ? Math.ceil((timer - 7200) / interval) : 0
  timer -= grants * interval
  return {
    held: n(save.AsylumTickets), waiting: grants * each * (1 + double), nextIn: 7200 - timer,
    perDay: 86400 / interval * each * (1 + double), interval, each, double,
  }
}

// ---- What a win drops ----------------------------------------------------------------------------------------------
/** Each win's handler (Emigdala @26903763, Occulon @26921705, Scallius @26937973, Gorshank @26956794): a guaranteed drop of
 *  the boss's trace, ceil(T²·randomInt(40,160)/100·(1 + 0.2·SkillLevels[50]·Mark)) × 1.23^(4·bell) (@26904797) ×
 *  AsylumTraceExtraBonus^0.8 (@26904973) × (1 + 400·L/(L+1500)·1.6^min(L/2000, 9)/100), L = SmithingItemLevel[88]
 *  (@26905910); then min(ceil(T^0.8), 20) rolls of randomInt(1,1e5) (@26906253) down a threshold ladder; the last rung is
 *  a bonus trace, ceil(T²·randomInt(40,160)/100·(1 + 0.2·level·Mark)) × 1.23^(4·bell) with no extra bonus (@26908814), the
 *  sixth a key (+1, drop type 5, @15766890). AsylumTraceExtraBonus is the stored value (set at load, @18623700). */
export const rolls = (T: number) => Math.min(Math.ceil(Math.pow(T, 0.8)), 20)
/** Ladder rungs, by drop type 0-7 (Emigdala @26906508-@26908726; the others share one ladder, e.g. @26924751-@26926669). */
export function ladder(boss: number, Cb: number) {
  const s = Math.sqrt(1 + Cb / 250)
  return boss === 0
    ? [10 * (1 + Cb / 100), Math.min(100 * (1 + Cb / 250), 150), Math.min(200 * s, 300), Math.min(500 * s, 450), Math.min(1e3 * s, 1700), Math.min(5e3 * s, 5e3), Math.min(15e3 * s, 3e4), Math.min(45e3 * s, 8e4)]
    : [15 * (1 + Cb / 100), Math.min(100 * (1 + Cb / 250), 200), Math.min(300 * s, 370), Math.min(800 * s, 520), Math.min(1300 * s, 1900), Math.min(6e3 * s, 5500), Math.min(15e3 * s, 31e3), Math.min(45e3 * s, 82e3)]
}
/** Chance per roll of each drop type: the first rung the roll is under (randomInt(1,1e5) < rung). */
export function dropChances(boss: number, Cb: number) {
  const under = (x: number) => Math.min(Math.max(Math.ceil(x) - 1, 0), 1e5) / 1e5
  let below = 0
  return ladder(boss, Cb).map((x) => { const p = Math.max(under(x) - below, 0); below = Math.max(below, under(x)); return p })
}
/** E[ceil(T²·r/100·m)] over r = randomInt(40,160). */
const meanCeil = (T: number, m: number) => { let t = 0; for (let r = 40; r <= 160; r++) t += Math.ceil(T * T * r / 100 * m); return t / 121 }

/** Expected boss traces and keys back from one win at difficulty T. */
export function winDrops(save: Save, boss: number, T: number, bell: number, mark: number) {
  const m = 1 + 0.2 * at(save, 'SkillLevels', 50) * mark, b = Math.pow(1.23, 4 * bell), L = at(save, 'SmithingItemLevel', 88)
  const extra = Math.pow(n(save.AsylumTraceExtraBonus) || 1, 0.8) * (1 + 400 * L / (L + 1500) * Math.pow(1.6, Math.min(L / 2000, 9)) / 100)
  const p = dropChances(boss, n(save.CbonusRaidDrops)), k = rolls(T)
  return { guaranteed: meanCeil(T, m) * b * extra, bonus: k * p[7]! * meanCeil(T, m) * b, keysBack: k * p[5]!, rolls: k }
}

// ---- The bell (Z only) ---------------------------------------------------------------------------------------------
/** ActorEvents_1293: the bell actor is recycled unless T = 45 (@4523794-); a click rings it, AsylumBell[boss] = min(bell + 1,
 *  11) @4524211, and zeroes the fight's progress (mapleexp = 0, the boss's block back to its start value) but not the timer.
 *  A Z fight starts at AsylumBellBEST @26882289 (other difficulties at 0); a win writes the bell it ended on back to
 *  AsylumBellBEST (Emigdala @26914063, Occulon @26932008, Scallius @26948327, Gorshank @26967036); ascension and rebirth
 *  zero it (@20902763, @20957855). So you can't pick a bell below your best: it only ratchets up, a ring at a time. Per ring:
 *  boss HP ×5⁴ (mapleexpREQ @26892615), boss hits ×1.5⁴ (@26893441; Gorshank's compound, combat.ts), traces ×1.23⁴ (winDrops);
 *  the key cost, the time limit and the other drop rolls don't change. */
export const BELL_MAX = 11
/** One Z fight rung up to `bell` at the start (ponytail: rings at t = 0; a later ring throws away the damage dealt so far). Traces
 *  per day = per key × your keys a day (keys, not fight time, are what runs out: 15 a run vs under 20 a day); per fight-hour = a win's
 *  traces × 3600 / (kill time + the 3 s boss entrance before t = 0, raids.ts OPENING), back to back, only if you have keys
 *  banked. ponytail: no select-screen or loot-walk time; add it if fight-hour ever decides anything. */
function bellRow(save: Save, f: Fight, boss: number, bell: number, mark: number, limit: number, taken: number, keysPerDay: number) {
  const { ttk, die, verdict } = asylumCell(f, boss, 45, bell, mark, limit)
  const w = winDrops(save, boss, 45, bell, mark), perRun = w.guaranteed + w.bonus, perKey = perRun / (taken - w.keysBack)
  return { bell, ttk, die, verdict, perRun, perKey, perDay: perKey * keysPerDay, perFightHour: perRun * 3600 / (ttk + 3) }
}
/** The bell to farm: the highest winning bell at or above the one the fight starts at (traces per key grow ×1.23⁴ a ring and
 *  the key cost doesn't, so higher is better while it still wins). null = no winning bell from the start bell up. */
export const farmBell = (rows: { bell: number; verdict: string }[], start: number) =>
  rows.filter((r) => r.bell >= start && r.verdict === 'win').at(-1)?.bell ?? null

// ---- The plan ------------------------------------------------------------------------------------------------------
const ASY = TIERS.asylum.tiers

/** Every unlocked boss × difficulty × Mark off/on (on only if Mark has levels): the verdict (raids.ts asylumCell: the kill
 *  before both the time limit and your death) and boss traces per key spent. */
export function asylum(save: Save, now?: number) {
  const r = raids(save), bosses = r.bosses.filter((b) => b.type === 'asylum'), bellBest = (save.AsylumBellBEST as number[] | undefined) ?? []
  const f = fightContext(save), markLv = at(save, 'SkillLevels', 50), ky = keys(save, now)
  const traces = TRACES.map((name, i) => ({ name, held: at(save, 'AsylumTracesOwned', i + 1), boss: i < 4 }))
  const runs = 'missing' in f ? [] : BOSSES.asylum.flatMap(([name], boss) => bosses[boss]!.unlocked === false ? [] : ASY.flatMap(([d, T, taken, min]) =>
    (markLv > 0 ? [0, 1] : [0]).map((mark) => {
      const bell = T === 45 ? n(bellBest[boss + 1]) : 0, limit = runSeconds(min)
      const { ttk, die, verdict } = asylumCell(f, boss, T, bell, mark, limit)
      const w = winDrops(save, boss, T, bell, mark), perRun = w.guaranteed + w.bonus
      // Z only: every bell 0..BELL_MAX (bellRow); maxBell = the highest of an unbroken run of wins from bell 0 (-1 = not even 0).
      const bells = T === 45 ? Array.from({ length: BELL_MAX + 1 }, (_, b) => bellRow(save, f, boss, b, mark, limit, taken, ky.perDay)) : null
      const maxBell = bells ? bells.findIndex((x) => x.verdict !== 'win') - 1 : null
      return { boss, name, difficulty: d || 'base', T, taken, mark, bell, maxBell: maxBell === -2 ? BELL_MAX : maxBell, bells, farm: bells ? farmBell(bells, bell) : null,
        ttk, die, limit, verdict, perRun, keysBack: w.keysBack, perKey: perRun / (taken - w.keysBack) }
    })))
  // Per boss, the run to farm: the most traces per key among wins at a difficulty you have beaten. A win above your best
  // beaten is only worth trying: the survival model averages the dice and some flight times are estimates.
  const beaten = (boss: number) => n(at(save, 'RaidBossKilled', 5 + boss))
  const best = BOSSES.asylum.map((_, boss) => runs.filter((x) => x.boss === boss && x.verdict === 'win' && x.T <= beaten(boss)).sort((a, b) => b.perKey - a.perKey)[0])
  const tryNext = runs.filter((x) => x.verdict === 'win' && x.T > beaten(x.boss)).sort((a, b) => a.T - b.T || a.mark - b.mark)
  // Next shrine level each boss trace pays for: the cheapest next cost in that trace (cost1 is always a boss trace).
  const owned = shrineOwned(save), shrines = shrineRows(save, shrineTable as ShrineTable)
  const plan = best.flatMap((run, boss) => {
    const slot = boss + 2, next = shrines.filter((s) => s.next?.cur1 === slot).sort((a, b) => a.next!.cost1 - b.next!.cost1)[0]
    if (!run || !next) return []
    const short = Math.max(next.next!.cost1 - (owned[slot] ?? 0), 0), skillShort = Math.max(next.next!.cost2 - (owned[next.next!.cur2] ?? 0), 0)
    return [{ ...run, shrine: next.name, shrineLv: next.lv + 1, short, keys: short / run.perKey, runs: Math.ceil(short / run.perRun),
      skillTrace: TRACES[next.next!.cur2 - 2]!, skillShort }]
  }).sort((a, b) => a.keys - b.keys)
  // The plan as a sequence (#52): keys each step spends (net of keys a win drops back) added up, and how long until your keys
  // cover that running total (held + waiting, then perDay; real time, the timer counts while away).
  let cum = 0
  const steps = plan.map((p) => {
    const spend = p.short > 0 ? p.runs * (p.taken - p.keysBack) : 0
    cum += spend
    return { ...p, spend, keysSoFar: cum, waitSec: (86400 * Math.max(0, cum - ky.held - ky.waiting)) / ky.perDay }
  })
  return {
    keys: ky, traces, plan: steps, runs, tryNext, missing: 'missing' in f ? f.missing : null, markLv,
    bosses: bosses.map((b, i) => {
      const tier = ASY.find((t) => t[1] === at(save, 'RaidBossKilled', 5 + i))
      return { name: b.name, unlocked: b.unlocked, needs: b.needs, best: tier ? tier[0] || 'base' : null, bestT: n(at(save, 'RaidBossKilled', 5 + i)), bell: n(bellBest[i + 1]), traces: traces[i]!.held }
    }),
    extraBonus: n(save.AsylumTraceExtraBonus) || 1,
  }
}

/** The tinker deck an Asylum fight wears: the one linked to Boss Looting (10; the Raids and Asylum fight scenes read it), else whichever deck is on when you enter
 *  (combat.ts raidDecks). `differ`: every boss × difficulty × Mark cell where some owned deck changes the verdict, with each
 *  deck's verdict, from asylumCell on a copy of the save linked to that deck only. */
export function asylumDecks(save: Save) {
  const links = ((save.DeckLinkList as unknown[] | undefined) ?? []).map(n), owned = Math.max(n(save.TinkerDecksOWNED), 1)
  const linked = Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => links[11 + d] === 10).at(-1) ?? null
  const fights = n(linked ?? save.TinkerDeckSelected) || 1
  if (!Array.isArray(save.EquipmentbyDeckList) || owned < 2) return { fights, linked, differ: [] }
  const per = Array.from({ length: owned }, (_, i) => {
    const dl = [...links]; for (let d = 1; d <= 9; d++) dl[11 + d] = d === i + 1 ? 10 : dl[11 + d] === 10 ? 0 : dl[11 + d]!
    return asylum({ ...save, DeckLinkList: dl }).runs
  })
  const differ = per[0]!.flatMap((r, j) => {
    const v = per.map((runs) => runs[j]?.verdict)
    return new Set(v).size > 1 ? [{ name: r.name, difficulty: r.difficulty, mark: r.mark, verdicts: v }] : []
  })
  return { fights, linked, differ }
}
