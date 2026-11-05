// Perk planner (#6): what the next level of each ascension (AP) / rebirth (BP) perk does, priced by its cost. Method:
// copy the save, add one level, re-run this app's own formulas, report what moved. Split from perks.ts (refactor step 9,
// #72), which keeps the perk table, totals and locks. src/perk-impacts.ts reruns the game's own code for stored values.
import { PERKS, perkLock, perkTotal, type Impact, type Lock, type Perk } from './modules/ascend/perks'
import { awayPercent } from './away'
import { awayGainsPerHour } from './modules/fighting/fight-away'
import { awayTillingPerSecond } from './modules/tilling/tilling-away'
import { awayFishing } from './modules/gathering/fishing'
import { hitChance, playerHPmax } from './combat'
import { smithingBaseAttack } from './modules/gathering/smithing'
import { ascendGain, brewSpeedBoost } from './bus'
import { botanyPots } from './modules/botany/botany-calc'
import * as NX from './next-types'

type Save = Record<string, unknown>
const pctOf = (s: Save) => awayPercent(s) ?? 30.5
const n = (v: unknown) => Number(v ?? 0) || 0
const lvOf = (s: Save, i: number) => n((s.AscentionLevel as number[] | undefined)?.[i])
/** Potion level-up price, coin currency (ActorEvents_1104 ~3196914): 25·PotionEXPreq[p]·F^PotionLV[p−1], F = max(1.02 +
 *  .16/(.43·ln(perk 54·max(H2O−100, 0) + 100)), 1.03); other price factors don't involve the perk. Output: one level of every
 *  owned potion per coin, so a cheaper scaling reads as a gain. No stored value to check (computed on the buy screen). */
function potionLevelsPerCoin(s: Save) {
  const lv = (s.PotionLV as number[]) ?? [], req = (s.PotionEXPreq as number[]) ?? []
  const F = Math.max(1.02 + 0.16 / (0.43 * Math.log(Math.abs(lvOf(s, 54) * Math.max(n(s.waterLV) - 100, 0) + 100))), 1.03)
  let cost = 0
  for (let p = 1; p < req.length; p++) if (n(lv[p - 1]) > 0) cost += 25 * n(req[p]) * F ** n(lv[p - 1])
  return cost ? 1 / cost : null
}
export const OUTPUTS: [string, (s: Save) => number | null][] = [
  ['AP per ascend', (s) => ascendGain(s).ap],
  ['BP per rebirth', (s) => ascendGain(s).bp],
  ['away kills/h', (s) => awayGainsPerHour(s).kills],
  ['away cash/h', (s) => awayGainsPerHour(s).cash],
  ['away gain %', (s) => awayPercent(s)],
  ['hit chance', (s) => hitChance(s)],
  ['max HP', (s) => playerHPmax(s)],
  ['smithing attack', (s) => smithingBaseAttack(s)],
  ['Tilling away XP', (s) => awayTillingPerSecond(s, pctOf(s))],
  ['Fishing away XP', (s) => awayFishing(s, pctOf(s)).perAwaySecond],
  // Cauldron brew-speed multiplier (PotionBrewSpeedBOOST[1]; load-bonuses.test reproduces the stored value).
  ['brew speed', (s) => brewSpeedBoost(s)],
  // Growth per tick summed over pots: potSpeed (HerbloreSpeedBOOST3, perk 48 × the pot's overlevels; botany-calc.test
  // reproduces it) × the pot's anim speed × (1 + tier/4). The global HerbloreSpeedBOOST is a common factor and cancels.
  ['Botany growth', (s) => botanyPots(s).reduce((t, p) => t + p.potSpeed * p.anim * (1 + p.tier / 4), 0)],
  ['potion levels per coin', potionLevelsPerCoin],
  // Cashback (Design_409 Multibuy ~18691009): goldcoin += min(perk 19 + 10·MasteryPerksUnlocked[112], 70)% of what a buy
  // cost, so cash goes 1/(1 − cashback) as far. Applied per purchase; nothing stored to check.
  ['upgrades per cash', (s) => 1 / (1 - Math.min(lvOf(s, 19) + 10 * n((s.MasteryPerksUnlocked as number[] | undefined)?.[112]), 70) / 100)],
]
const run = (f: (s: Save) => number | null, s: Save) => { try { const v = f(s); return Number.isFinite(v) ? (v as number) : null } catch { return null } }

/** Relative change (+0.05 = +5%) of every output the next level of perk `i` moves. */
export function perkImpact(save: Save, i: number): { output: string; change: number }[] {
  const lv = [...((save.AscentionLevel as number[]) ?? [])]
  lv[i] = (lv[i] ?? 0) + 1
  return outputChanges(save, { ...save, AscentionLevel: lv })
}

/** Relative change of every output between two saves (also used by skilltree.ts for SkillLevels). */
export function outputChanges(save: Save, next: Save, outputs = OUTPUTS): { output: string; change: number }[] {
  return outputs.flatMap(([output, f]) => {
    const a = run(f, save), b = run(f, next)
    return a && b != null && Math.abs(b / a - 1) > 1e-9 ? [{ output, change: b / a - 1 }] : []
  })
}

/** Perks that don't change a rate: what one more level gives, in words (from the game code where noted). They rank as 0. */
export type Label = { kind: string; text: string }
const unlock = (what: string): (() => Label) => () => ({ kind: 'unlock', text: `Unlocks ${what}` })
const crystal = (color: string): (() => Label) => () => ({ kind: 'crystal', text: `+1 ${color} crystal` })
const startLv = (skill: string): (() => Label) => () => ({ kind: 'starting level', text: `+1 starting ${skill} level after every reset (1 level saved per reset)` })
const LABELS: Record<number, (s: Save, level: number) => Label> = {
  // Design_101 cooldown ticker: +min(0.05·(1 + 0.1·L), 0.15) per 50 ms, so levels past 20 add nothing.
  4: (_s, L) => ({ kind: L >= 20 ? 'capped' : 'cooldowns', text: L >= 20 ? 'Nothing: cooldown speed caps at level 20 (+200%)' : '+10% faster skill cooldowns' }),
  11: () => ({ kind: 'perk points', text: '+10% more perk points from skill level-ups' }),
  13: () => ({ kind: 'perk points', text: '+1 perk point at the start of every run' }),
  12: () => ({ kind: 'skilltree cap', text: 'Skilltree perks can be levelled 1 higher' }),
  61: () => ({ kind: 'cap raise', text: 'Raises the max level of H2O damage, BTQ1, BTQ2, H2O cash and brew speed rebirth perks' }),
  17: () => ({ kind: 'tickets', text: '+5 points of chance for 2× tickets every 2 hours (roll must be below 5 × level)' }),
  18: (_s, L) => ({ kind: 'candy', text: L >= 12 ? 'Nothing: the candy timer caps at level 12 (24 h)' : `Free candy coupon every ${48 - 2 * (L + 1)} h instead of ${48 - 2 * L} h` }),
  // SceneEvents_9 init: CardDropsPerDayMAX = 25 + perk 20.
  20: (_s, L) => ({ kind: 'star cards', text: `+1 star card per zone per day (${25 + L} → ${26 + L})` }),
  26: () => ({ kind: 'star cards', text: '+2 to the card-drop-chance bonus that scales rare star card drops' }),
  27: (_s, L) => ({ kind: 'active skill', text: `Banana Bonk: ${3100 + 200 * (L + 1)}% damage (+10% per skill level), steals ${20 + L + 1}× kill cash` }),
  28: (_s, L) => ({ kind: 'active skill', text: `Shoulder Tap: distracts ${Math.floor((11 + L) / 5)} s, +100 crit chance, +${200 + 20 * (L + 1)}% crit damage` }),
  29: crystal('yellow'), 45: crystal('yellow'), 30: crystal('red'), 55: crystal('red'), 31: crystal('purple'), 36: crystal('purple'), 32: crystal('blue'), 51: crystal('blue'),
  41: () => ({ kind: 'H2O tokens', text: '+1 extra training perk (H2O) token' }),
  68: () => ({ kind: 'H2O tokens', text: '+1 extra H2O token' }),
  43: unlock('ungodly contracts'), 46: unlock('cerebral contracts'), 50: unlock('lavathian contracts'),
  47: unlock('contract shop 4'), 52: unlock('contract shop 5'), 53: unlock('the next crystal slot (apothecary and mining)'),
  66: unlock('the next training perk (the 10 you cannot get from ascending)'), 67: unlock('the next skilltree training perk'),
  // Ascend/rebirth reset (SceneEvents_22): each skill restarts at 1 + gift shop + mastery + contract + perk 24 + tank − 1.
  24: () => ({ kind: 'starting level', text: '+1 starting level in 11 skills (attack, strength, endurance, summoning, spiriting, fishing, mining, smithing, tilling, botany, apothecary): 11 levels saved per reset' }),
  // Same reset: RiftLVL[k] = perk 21 + 1 for every owned rift.
  21: (s) => { const r = Math.max(n(s.RiftsOwned), 1); return { kind: 'starting level', text: `+1 starting level in each of your ${r} rifts: ${r} levels saved per reset` } },
  56: startLv('tilling'), 57: startLv('botany'), 58: startLv('apothecary'),
  35: () => ({ kind: 'trade-off', text: '+1 max crit toggle; each toggle: −20% crit chance, +10% damage (compounding)' }),
  // potionBonuses SmithingScalingRedux (game: SceneEvents_9 ~31651397): min(floor(6e-4·L·max(H2O−100, 0)), 5), floored to whole points.
  34: (s, L) => {
    const w = Math.max(n(s.waterLV) - 100, 0), pts = (x: number) => Math.min(Math.floor(6e-4 * x * w), 5)
    if (pts(L + 1) > pts(L)) return { kind: 'smithing scaling', text: `−1 whole smithing scaling point (${pts(L)} → ${pts(L + 1)})` }
    const need = w > 0 ? Math.ceil((pts(L) + 1) / (6e-4 * w)) : null
    return { kind: 'no effect yet', text: `Floored to whole points: nothing until level ${need ?? '∞'} at H2O ${n(s.waterLV)} (level × (H2O − 100) ≥ ${Math.round((pts(L) + 1) / 6e-4)}), then −1 smithing scaling point` }
  },
  // Only read by the all-perks-maxed check (SceneEvents_47 ~29349948).
  42: () => ({ kind: 'no effect', text: 'No game effect: only counted by the all-perks-maxed check' }),
  // All Star: its buy also adds 1 to AscentionLevel[12] (Skilltree Overcharge), Qno2x.js @13497701 (skilltree.ts).
  63: () => ({ kind: 'skilltree cap', text: 'Skilltree perks can be levelled 1 higher (adds a level to Skilltree Overcharge)' }),
}

export type PerkRow = Perk & { total: string; lock: Lock; level: number; next: number | null; impact: Impact[]; label?: Label; perCost: number; affordable: number; afterReset: number }
/** data/perk-impacts.json (src/perk-impacts.ts): the same +1-level differences, from the game's own combat code. */
export type GameImpacts = { save: string; levels: number[]; perks: Record<string, { output: string; change: number }[]> }

/** Every perk with level, next cost, modelled impact, and best gain per AP/BP; ranked within each currency.
 *  `game` rows join a perk only when written for this run at the perk's current level, and never repeat an in-app output. */
export function perkPlan(save: Save, game?: GameImpacts | null): PerkRow[] {
  const run = `${save.TimesAscended ?? 0}-${save.NumberofTimesRebirth ?? 0}`
  const lv = (save.AscentionLevel as number[]) ?? [], bal = { AP: Number(save.APtoSpend ?? 0), BP: Number(save.BPtoSpend ?? 0) }
  let g = { ap: 0, bp: 0 }
  try { g = ascendGain(save) } catch { /* cloud save without ascend inputs */ }
  // Levels buyable from a balance, walking the cost table from the current level.
  const buyable = (p: Perk, level: number, left: number) => { let k = 0; for (let L = level; L < p.max && p.cost[L] != null && p.cost[L]! <= left; L++) { left -= p.cost[L]!; k++ } return k }
  return PERKS.map((p) => {
    const level = lv[p.i] ?? 0, next = level < p.max ? (p.cost[level] ?? null) : null
    const own: Impact[] = next == null ? [] : perkImpact(save, p.i)
    const fromGame = next != null && game?.save === run && (game.levels[p.i] ?? 0) === level ? game.perks[p.i] ?? [] : []
    const impact = [...own, ...fromGame.filter((r) => !own.some((x) => x.output === r.output)).map((r) => ({ ...r, game: true }))]
    const best = Math.max(0, ...impact.map((x) => x.change))
    const affordable = buyable(p, level, bal[p.currency])
    // After ascending (AP) or rebirthing (BP) now: balance + what that reset pays (ascendGain).
    const afterReset = buyable(p, level, bal[p.currency] + (p.currency === 'AP' ? g.ap : g.bp))
    const label = impact.length ? undefined : LABELS[p.i]?.(save, level)
    return { ...p, total: perkTotal(save, p, level), lock: perkLock(save, p, level), level, next, impact, label, perCost: next ? best / next : 0, affordable, afterReset }
  }).sort((a, b) => (a.currency === b.currency ? b.perCost - a.perCost : a.currency < b.currency ? -1 : 1))
}

export type Buy = { i: number; name: string | null; from: number; to: number; spent: number; gain: number; output: string }

/** Equal marginal value (Lagrange, as src/realm-coins.ts spendLevels): each option's levels as {cost, ratio} steps, the
 *  ratio already running-min'd so taking a prefix is exact. Bisect λ (log space) so every step with ratio ≥ λ fits the
 *  budget, then top up with the best next step that still fits. Returns levels taken per option and what is left. */
export function lambdaSpend(curves: { c: number; r: number }[][], budget: number): { k: number[]; left: number } {
  const take = (lam: number) => curves.map((cv) => { let k = 0, cost = 0; while (k < cv.length && cv[k]!.r >= lam) cost += cv[k++]!.c; return { k, cost } })
  const total = (t: { cost: number }[]) => t.reduce((a, x) => a + x.cost, 0)
  let lo = Math.log(1e-300), hi = Math.log(Math.max(1e-300, ...curves.flatMap((cv) => cv.map((x) => x.r)).filter(Number.isFinite)) * 2)
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (total(take(Math.exp(mid))) <= budget) hi = mid; else lo = mid }
  const pick = take(Math.exp(hi))
  let left = budget - total(pick)
  for (;;) {
    let bi = -1
    curves.forEach((cv, i) => { const st = cv[pick[i]!.k]; if (st && st.c <= left && (bi < 0 || st.r > curves[bi]![pick[bi]!.k]!.r)) bi = i })
    if (bi < 0) break
    left -= curves[bi]![pick[bi]!.k++]!.c
  }
  return { k: pick.map((x) => x.k), left }
}
/** Steps of one option: next-level cost from `cost(L)` (null = can't), gain g/(1+k·g) for the k-th extra level (g is a fixed
 *  absolute step), tabulated until the budget or the cap. */
export function stepCurve(g: number, from: number, cap: number, cost: (L: number) => number | null | undefined, budget: number) {
  const steps: { c: number; r: number }[] = []
  let r = Infinity
  for (let L = from, k = 0, cum = 0; L < cap && g > 0; L++, k++) {
    const c = cost(L)
    if (c == null || !(cum + c <= budget)) break
    cum += c; r = Math.min(r, g / (1 + k * g) / c); steps.push({ c, r })
  }
  return steps
}

/** What to buy with `balance`: % gain per cost at equal marginal value (lambdaSpend), the k-th extra level of a perk adding
 *  g/(1+k·g) relative. Sorted by AP/BP spent. */
export function buyList(rows: PerkRow[], currency: 'AP' | 'BP', balance: number): { buys: Buy[]; left: number } {
  const st = rows.filter((r) => r.currency === currency && r.next != null && r.impact.length && !r.lock)
    .map((r) => { const best = r.impact.reduce((a, b) => (b.change > a.change ? b : a)); return { r, g: best.change, output: best.output } })
  const curves = st.map((x) => stepCurve(x.g, x.r.level, x.r.max, (L) => x.r.cost[L], balance))
  const { k, left } = lambdaSpend(curves, balance)
  const buys = st.flatMap((x, i) => k[i] ? [{ i: x.r.i, name: x.r.name, from: x.r.level, to: x.r.level + k[i]!, spent: curves[i]!.slice(0, k[i]).reduce((a, s) => a + s.c, 0), gain: k[i]! * x.g, output: x.output }] : [])
  return { buys: buys.sort((a, b) => b.spent - a.spent), left }
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'perks', title: 'Perks', src: 'perks.ts perkPlan + buyList', fn: (s, x) => {
    const rows = perkPlan(s, x.impacts as GameImpacts | null | undefined)
    return (['AP', 'BP'] as const).flatMap((cur) => {
      const bal = NX.n(s[`${cur}toSpend`]), buys = buyList(rows, cur, bal).buys
      if (buys.length) return buys.slice(0, 3).map((b) => ({ text: `${cur}: ${b.name ?? `perk ${b.i}`} ${b.from} → ${b.to}`, why: `spend ${NX.sci(b.spent)} ${cur}, +${(100 * b.gain).toFixed(1)}% ${b.output}` }))
      // Nothing affordable: the plan's top-ranked (best % per cost) unlocked perk, and whether the reset pays for it.
      const top = rows.find((r) => r.currency === cur && r.next != null && r.impact.length && !r.lock)
      return top ? [{ text: `${cur}: save for ${top.name ?? `perk ${top.i}`} Lv${top.level + 1} (${NX.sci(top.next!)} ${cur}, have ${NX.sci(bal)})`,
        why: `best % per ${cur}${top.afterReset ? `; ${cur === 'AP' ? 'ascending' : 'rebirthing'} now pays for ${top.afterReset} level(s)` : ''}` }] : []
    })
  }}
