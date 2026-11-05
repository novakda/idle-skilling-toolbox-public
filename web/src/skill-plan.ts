// Skill-point pricing (refactor step 9, #72): what each skill-tree level would add to the app's rates, and the best
// buys for the points you hold. Split out of skilltree.ts, which keeps the tree rules (caps, costs, locks, names).
import { lambdaSpend, outputChanges, OUTPUTS, stepCurve } from './perk-plan'
import { getPlayerDPS } from './combat'
import { soulRates, spiritRates, withSpirit } from './spiriting'
import { glyphBonusPct, rifts } from './rift'
import { expMult } from './tinkering'
import { mining, smithingCraftExp } from './gathering'
import { levelsPerCraft } from './ascend'
import { farmers, withTilling } from './tilling'
import { shownExpPerDay, totalCrusaders, withCrusade } from './crusade'
import { awayPercent } from './away'
import { overgrowthExponent } from './botany-calc'
import { ONE_SHOT, skillCap, skillCost, skillLock, SKILLS, treeOf } from './skilltree'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

const pct = (s: Save) => awayPercent(s) ?? 30.5
/** Rates the skill trees feed beyond perks.ts OUTPUTS, each from this app's own (tested) formula. */
const EXTRA: [string, (s: Save) => number | null][] = [
  ['damage (DPS)', (s) => { const v = getPlayerDPS(s); return typeof v === 'number' ? v : null }],
  ['Spirit EXP', (s) => spiritRates(withSpirit(s)).away],
  ['souls', (s) => soulRates(withSpirit(s)).souls.reduce((t, x) => t + x, 0)],
  ['rift speed', (s) => rifts(s).reduce((t, r) => t + r.speed, 0)],
  ['rift EXP', (s) => glyphBonusPct(s).slice(1).reduce((t, p) => t + 1 + p / 100, 0)],
  ['Tinkering EXP', expMult],
  ['Crusade EXP/day', (s) => shownExpPerDay(withCrusade(s))],
  ['crusaders', (s) => totalCrusaders(withCrusade(s))],
  ['active ores', (s) => mining(s, pct(s))?.activeOres ?? null],
  ['Smithing craft EXP', (s) => smithingCraftExp(s)],
  ['levels per craft', (s) => levelsPerCraft(s)],
  ['Tilling away crops', (s) => farmers(withTilling(s), pct(s)).reduce((t, f) => t + f.awayCropsPerSec, 0)],
  // Overgrowth time scales as base^E (botany-calc.ts): a lower exponent is shorter, so report 1/E.
  ['overgrowth speed (1/E)', (s) => 1 / overgrowthExponent(s)],
]

export type SkillRow = { i: number; tree: number; name: string; per: string; level: number; cap: number; next: number | null; lock: string | null
  impact: { output: string; change: number }[]; perPoint: number }

/** Every slot with level, cap, next cost and what one more level changes; `perPoint` = best % gain per point. */
export function skillPlan(save: Save): SkillRow[] {
  const lv = arr(save, 'SkillLevels')
  return Array.from({ length: 70 }, (_, k) => {
    const i = k + 1, level = n(lv[i]), cap = skillCap(save, i), next = level < cap ? skillCost(i, level) : null, lock = next == null ? null : skillLock(save, i)
    let impact: SkillRow['impact'] = []
    if (next != null && !ONE_SHOT.has(i)) {
      const SL = [...lv]; SL[i] = level + 1
      impact = outputChanges(save, { ...save, SkillLevels: SL }, [...OUTPUTS, ...EXTRA])
    }
    const best = Math.max(0, ...impact.map((x) => x.change))
    return { i, tree: treeOf(i), name: SKILLS[i]![0], per: SKILLS[i]![1], level, cap, next, lock, impact, perPoint: next ? best / next : 0 }
  })
}

export type SkillBuy = { i: number; name: string; from: number; to: number; spent: number; gain: number; output: string }
/** Spend `points` at equal marginal % gain per point (perks.ts lambdaSpend); a perk's gain g is a fixed absolute step, so its
 *  k-th extra level adds g/(1 + k·g). Infinity costs rise by 1 per level. ponytail: refunds not counted. */
export function skillBuys(rows: SkillRow[], points: number): { buys: SkillBuy[]; left: number } {
  const st = rows.filter((r) => r.next != null && !r.lock && r.impact.length).map((r) => {
    const b = r.impact.reduce((a, x) => (x.change > a.change ? x : a))
    return { r, g: b.change, output: b.output }
  })
  const curves = st.map((x) => stepCurve(x.g, x.r.level, x.r.cap, (L) => skillCost(x.r.i, L), points))
  const { k, left } = lambdaSpend(curves, points)
  return { buys: st.flatMap((x, i) => k[i] ? [{ i: x.r.i, name: x.r.name, from: x.r.level, to: x.r.level + k[i]!, spent: curves[i]!.slice(0, k[i]).reduce((a, s) => a + s.c, 0), gain: k[i]! * x.g, output: x.output }] : []).sort((a, b) => b.spent - a.spent), left }
}
