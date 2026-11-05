// Rifts (Summoning, Limbo scene SceneEvents_28, screen 10; save keys Rift*/Glyphs*/SummonExpGiven). Rift r = 1-9 (index 0 is
// unused, 10 is the Gem Rift, not modelled). A rift cycles "glyphs": each cycle adds rift EXP (levels the rift, whose level is
// its bonus elsewhere) and Summoning EXP. Every formula is ported from Qno2x.js (offsets †) and checked in rift.test.ts against
// a full save, a live Limbo capture, or the game's own code in the sandbox; everything is computed from the save alone.
import { framesPerSec } from '../../anim'
import { equipmentBonuses, potionBonuses } from '../../bus'
import { cbonus, type Catalog } from '../cards/cards-calc'
import catalog from '../../data/card-catalog.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
export const RIFT_COUNT = 9

/** Names as the rift screen draws them (GOLD_COIN_RIFT … RIFT_RIFT, SceneEvents_28 draw). */
export const RIFTS = [, 'Gold Coin', 'Water', 'Power', 'Health', 'Mining', 'Attack Speed', 'Shield', 'Mega AP', 'Rift Rift'] as (string | undefined)[]
/** Cost currency c < 8 is SoulsTotal[c] (RiftItemsYouOwn[0..7] mirrors it, † @12453361). Colours: the game's unlock costs
 *  († @21666915: rift 2 = 300 of c1 + 20 of c2, …) matched to the wiki's unlock table (Red, Orange, … White). SoulsTotal[8]
 *  (Pro cost) is the wiki's Pink soul. */
export const SOULS = ['', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Pink']

// Value/speed upgrade costs, drawn each frame for the selected rift (SceneEvents_28 listener † @21599132). Tiers by the
// upgrade's level: < 25, < 50, else. Tier: [currency 1, a1, currency 2, a2, m, g]; cost_i = (a_i + min(L, m)) · g^L with
// m on cost 1 of tier 0 only (else folded into a), g = 1.1 except rift 3 speed tier 0 (1.2). a2 = 0: no second cost.
type Tier = [number, number, number, number, number?, number?]
const COSTS: Record<number, { value: Tier[]; speed: Tier[] }> = {
  1: { value: [[1, 1, 0, 0, 3], [1, 5, 0, 0], [2, 0.3, 0, 0]], speed: [[1, 1, 0, 0, 3], [1, 5, 0, 0], [2, 0.4, 1, 5]] },
  2: { value: [[1, 6, 0, 0, 3], [2, 1, 1, 23], [2, 1, 1, 33]], speed: [[2, 3, 0, 0, 3], [3, 0.6, 1, 63], [3, 0.6, 1, 63]] },
  3: { value: [[2, 10, 1, 60, 3], [3, 2, 1, 250], [3, 2, 1, 250]], speed: [[3, 2, 0, 0, 3, 1.2], [4, 0.5, 2, 100], [4, 0.6, 2, 100]] },
  4: { value: [[4, 2, 0, 0], [4, 2, 3, 20], [4, 2, 3, 20]], speed: [[3, 20, 1, 5000], [4, 3, 2, 500], [4, 3, 3, 40]] },
  5: { value: [[5, 0.91, 0, 0], [5, 1, 2, 2000], [5, 1, 3, 200]], speed: [[5, 0.91, 4, 40], [6, 0.1, 1, 30000], [6, 0.1, 2, 5000]] },
  6: { value: [[6, 1, 3, 3000], [6, 1, 5, 12], [6, 1, 5, 12]], speed: [[6, 1, 1, 1e5], [7, 0.2, 2, 75000], [7, 0.2, 3, 5000]] },
  7: { value: [[6, 2, 5, 35], [6, 2, 4, 600], [7, 0.3, 5, 40]], speed: [[6, 3, 3, 5000], [7, 0.3, 3, 5000], [7, 0.3, 5, 45]] },
  8: { value: [[6, 5, 4, 750], [7, 1, 5, 225], [7, 1.2, 6, 100]], speed: [[6, 8, 1, 5e6], [7, 1, 2, 5e5], [7, 1, 3, 4e4]] },
  9: { value: [[7, 2, 3, 4e4], [7, 2, 4, 5000], [7, 2, 1, 1.2e7]], speed: [[5, 200, 4, 3000], [7, 2, 3, 7e4], [7, 2, 6, 25]] },
}
export type Cost = [currency: number, amount: number][]
/** The two soul costs of rift r's next value or speed level at level L (the game's RiftCost1/2 or RiftCost3/4). */
export function upgradeCost(r: number, kind: 'value' | 'speed', L: number): Cost {
  const [c1, a1, c2, a2, m = 0, g = 1.1] = COSTS[r]![kind][L < 25 ? 0 : L < 50 ? 1 : 2]!
  const out: Cost = [[c1, (a1 + Math.min(L, m)) * g ** L]]
  if (a2) out.push([c2, a2 * g ** L])
  return out
}
export const SPEED_CAP = 125 // speed buys need RiftSpeedlv < 125 († @12629072); value levels have no cap

/** GlyphsGivenBonusPercent[i] (scene init runLater, † @21496071): rift EXP bonus % per rift, × 1.5 per rift brick
 *  (ConstructLV[7] bricks fill rifts 1-3, 4-6, 7-9 in turn). The game keeps it from the last Limbo visit; this recomputes it.
 *  ponytail: EbonusRiftEXP from the equipped tinker gear; the scene equips the Limbo-linked tinker deck (link 8) first, which a
 *  cloud save can't name. */
export function glyphBonusPct(s: Save, pRift = potionBonuses(s).RiftExp) {
  const sl = (i: number) => n(arr(s, 'SkillLevels')[i]), c7 = n(arr(s, 'ConstructLV')[7])
  const base = (1 + (50 * n(s.MTXoverclockedGlyphsPurchased)) / 100) * (1 + (5 * sl(36)) / 100)
    * (1 + n(cbonus(s, catalog as unknown as Catalog, 8).CbonusGlyphExp) / 100) * (1 + n(equipmentBonuses(s).scalar.EbonusRiftEXP) / 100)
  return Array.from({ length: 11 }, (_, a) => 100 * (base * (1 + pRift / 100) * 1.5 ** Math.max(Math.ceil((c7 - Math.floor((a - 1) / 3)) / 3), 0) - 1))
}

/** The save with the scene-init values recomputed (cloud saves lack them; local ones date from the last Limbo visit). */
export function withRift(s: Save): Save {
  const cb = cbonus(s, catalog as unknown as Catalog, 8)
  return { ...s, GlyphsGivenBonusPercent: glyphBonusPct(s), SummonEXPbonus: n(s.MTXdoubleSummoning), SummonChance: 100 + 10 * n(cb.CbonusSummonEXPchance) }
}

/** Rift EXP needed for the next level after a level-up to level L, from the old requirement († @21532460 rifts 1-8,
 *  @21539806 Rift Rift). Levels gained by a chain (Rift Rift, potion 146) don't touch the requirement, so the stored
 *  RiftExpREQ is history, not a function of the level. */
export function nextReq(s: Save, r: number, req: number, L: number) {
  const b = Math.min(Math.floor(10 * (n(arr(s, 'SmithingItemLevel')[77]) + 1) ** 0.23 - 10), 70) / 70
  return r === 9 ? req * (1.64 - Math.min(b * 0.26, 0.34)) + 150 * Math.floor(L / 2) + 5 * L ** 3
    : req * (1.45 - Math.min(b * 0.16, 0.24)) + 100 * Math.floor(L / 3) + 4 * L ** 2.6
}

/** Per rift. A cycle is 10 animation frames. On screen a 10 ms timer adds speed·k/100 (k = 1 + 5·SkillLevels[35]/100) to a
 *  counter and each 60 fps draw advances one frame when it is ≥ 1 († @21891608), so framesPerSec caps it; away credit is
 *  speed·k/10 cycles per credited second († @21501839). Each cycle: RiftEXP += GlyphsGiven·(1 + GlyphsGivenBonusPercent/100)
 *  († @15384194) and SummonEXP += SummonExpGiven·(1 + SummonEXPbonus) on a roll ≤ SummonChance in 1000. */
export function rifts(s: Save) {
  const k = 1 + (5 * n(arr(s, 'SkillLevels')[35])) / 100, chance = n(s.SummonChance) / 1000, out = []
  for (let r = 1; r <= RIFT_COUNT; r++) {
    if (!n(arr(s, 'RiftVALUElv')[r])) continue // not owned
    const speed = n(arr(s, 'RiftAnimationSpeed')[r]) * k, lv = n(arr(s, 'RiftLVL')[r])
    const glyph = n(arr(s, 'GlyphsGiven')[r]) * (1 + n(arr(s, 'GlyphsGivenBonusPercent')[r]) / 100)
    const summon = n(arr(s, 'SummonExpGiven')[r]) * (1 + n(s.SummonEXPbonus)) * chance
    const screen = framesPerSec(speed) / 10, away = speed / 10, exp = n(arr(s, 'RiftEXP')[r]), req = n(arr(s, 'RiftExpREQ')[r])
    out.push({
      r, lv, value: n(arr(s, 'RiftVALUElv')[r]), speedLv: n(arr(s, 'RiftSpeedlv')[r]), pro: n(arr(s, 'RiftProLvs')[r]), speed, exp, req,
      riftExpScreen: screen * glyph, riftExpAway: away * glyph, summonScreen: screen * summon, summonAway: away * summon,
      toNextAway: Math.max(0, req - exp) / (away * glyph), toNextScreen: Math.max(0, req - exp) / (screen * glyph),
    })
  }
  return out
}

export type Buy = { r: number; kind: 'value' | 'speed'; what: string; cost: Cost; share: number; affordable: boolean; summon: number;
  riftPct: number; levelsPerDay: number; bonusPerDay: number; score: number; best: boolean }
/** Value (ActorEvents_61 † @12457946): SummonExpGiven += 1 + ⌊L/3⌋/10 + ⌊L/10⌋/2, GlyphsGiven += 0.05. Speed (ActorEvents_63
 *  † @12633370, below lv 125): RiftAnimationSpeed ×(1 + 6/(1 + ⌊speed/3⌋/4.4)/100) (the speed itself, not the level),
 *  GlyphsGiven += 0.08. Each buy is priced by re-running rifts() with it. What it optimises: the rift's OWN bonus (BONUS[r])
 *  gained per day of away credit, per share of soul stock spent (Σ cost ÷ souls of that colour owned). Levels per day =
 *  86400 · rift EXP per away second ÷ the current requirement (the requirement grows each level, so this is the near-term
 *  rate). Bonuses of different rifts don't compare, so buys are grouped by rift (sorted by rift, best first within it);
 *  Summoning EXP is a side figure. */
export function buys(s: Save): Buy[] {
  const base = rifts(s), sumAway = (rows: ReturnType<typeof rifts>) => rows.reduce((t, x) => t + x.summonAway, 0), s0 = sumAway(base)
  const owned = (c: number) => n(arr(s, 'SoulsTotal')[c]), out: Buy[] = []
  for (const row of base) {
    const { r } = row, V = row.value, S = row.speedLv
    const opts: [Buy['kind'], string, Save][] = [['value', `value lv ${V} → ${V + 1}`, bought(s, r, 'value')]]
    if (S < SPEED_CAP) opts.push(['speed', `speed lv ${S} → ${S + 1}`, bought(s, r, 'speed')])
    for (const [kind, what, t] of opts) {
      const cost = upgradeCost(r, kind, kind === 'value' ? V : S), after = rifts(t), mine = after.find((x) => x.r === r)!
      const levelsPerDay = (86400 * (mine.riftExpAway - row.riftExpAway)) / Math.max(1, row.req), share = cost.reduce((x, [c, q]) => x + q / owned(c), 0)
      const bonusPerDay = levelsPerDay * perLevel(s, r, row.lv)
      out.push({
        r, kind, what, cost, summon: sumAway(after) - s0, riftPct: 100 * (mine.riftExpAway / row.riftExpAway - 1),
        share, affordable: cost.every(([c, q]) => owned(c) >= q), levelsPerDay, bonusPerDay, score: bonusPerDay / share, best: false,
      })
    }
  }
  out.sort((a, b) => a.r - b.r || b.score - a.score)
  out.forEach((b, i) => (b.best = i === 0 || out[i - 1]!.r !== b.r))
  return out
}

/** The save after one value or speed level of rift r (souls not deducted): the per-level effects documented on buys(). */
export function bought(s: Save, r: number, kind: Buy['kind']): Save {
  const set = (k: string, v: number) => arr(s, k).map((x, i) => (i === r ? v : x))
  const V = n(arr(s, 'RiftVALUElv')[r]), S = n(arr(s, 'RiftSpeedlv')[r]), G = n(arr(s, 'GlyphsGiven')[r]), A = n(arr(s, 'RiftAnimationSpeed')[r])
  return kind === 'value'
    ? { ...s, RiftVALUElv: set('RiftVALUElv', V + 1), GlyphsGiven: set('GlyphsGiven', G + 0.05),
      SummonExpGiven: set('SummonExpGiven', n(arr(s, 'SummonExpGiven')[r]) + 1 + Math.floor(V / 3) / 10 + Math.floor(V / 10) / 2) }
    : { ...s, RiftSpeedlv: set('RiftSpeedlv', S + 1), GlyphsGiven: set('GlyphsGiven', G + 0.08),
      RiftAnimationSpeed: set('RiftAnimationSpeed', A * (1 + 6 / (1 + Math.floor(A / 3) / 4.4) / 100)) }
}

/** Soul spending order across rifts (#52): with the souls you hold, which value/speed levels to buy so the rifts level
 *  fastest, every rift's levelling speed weighed alike (their bonuses don't compare). Worth of a level: ln of the rift's EXP
 *  speed after ÷ before (so a rift's levels compound); price: its share of your starting soul stock (Σ cost ÷ the souls of
 *  that colour held at the start). Lagrange (as spendLevels in src/realm-coins.ts): tabulate each upgrade's next levels once
 *  (running min of worth/price keeps the prefix rule exact), bisect one λ so taking every level worth ≥ λ per share fits
 *  every colour, then top up with the best next level that still fits until none does. Steps are one per upgrade, best
 *  first; riftPct is re-measured with the real model in that order. Spending here leaves fewer souls toward the gaps the
 *  Spiriting plan farms for. ponytail: one λ over the summed share, not one per colour (a colour can end with souls the
 *  others' price would spend); value and speed of a rift share GlyphsGiven, so each kind is tabulated with the other at the
 *  last pass's plan, 3 passes. maxBuys caps levels tabulated per upgrade. */
export function spendPlan(s0: Save, maxBuys = 400) {
  const start = arr(s0, 'SoulsTotal').map(n), KINDS = ['value', 'speed'] as const
  const lvKey = (kind: Buy['kind']) => (kind === 'value' ? 'RiftVALUElv' : 'RiftSpeedlv')
  const away = (s: Save, r: number) => rifts(s).find((x) => x.r === r)!.riftExpAway
  const opts = rifts(s0).flatMap(({ r }) => KINDS.map((kind) => ({ r, kind, L0: n(arr(s0, lvKey(kind))[r]) })))
  let k = opts.map(() => 0)
  const curves = () => opts.map(({ r, kind, L0 }) => {
    let s = s0 // the other kind of this rift at the current plan
    const j = opts.findIndex((o) => o.r === r && o.kind !== kind)
    for (let m = 0; m < (k[j] ?? 0); m++) s = bought(s, r, opts[j]!.kind)
    const steps: { c: number[]; r: number }[] = [], cum = start.map(() => 0)
    let was = away(s, r), ratio = Infinity
    for (let L = L0; steps.length < maxBuys && (kind === 'value' || L < SPEED_CAP); L++) {
      const cost = upgradeCost(r, kind, L), c = start.map(() => 0)
      for (const [cc, q] of cost) { c[cc] = q; cum[cc]! += q }
      if (cost.some(([cc]) => !(cum[cc]! <= start[cc]!))) break
      s = bought(s, r, kind)
      const now = away(s, r)
      ratio = Math.min(ratio, Math.log(now / was) / cost.reduce((x, [cc, q]) => x + q / start[cc]!, 0))
      if (!(ratio > 0)) break
      steps.push({ c, r: ratio }); was = now
    }
    return steps
  })
  for (let pass = 0; pass < 3; pass++) {
    const cv = curves()
    const take = (lam: number) => cv.map((st) => { let m = 0; while (m < st.length && st[m]!.r >= lam) m++; return m })
    const spent = (t: number[]) => start.map((_, c) => cv.reduce((x, st, i) => x + st.slice(0, t[i]).reduce((y, z) => y + z.c[c]!, 0), 0))
    const fits = (t: number[]) => spent(t).every((q, c) => q <= start[c]!)
    let lo = Math.log(1e-300), hi = Math.log(Math.max(1e-300, ...cv.flatMap((st) => st.map((x) => x.r))) * 2)
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (fits(take(Math.exp(mid)))) hi = mid; else lo = mid }
    k = take(Math.exp(hi))
    for (const left = start.map((q, c) => q - spent(k)[c]!); ;) { // top-up: best next tabulated level that still fits
      let bi = -1
      cv.forEach((st, i) => { const x = st[k[i]!]; if (x && x.c.every((q, c) => q <= left[c]!) && (bi < 0 || x.r > cv[bi]![k[bi]!]!.r)) bi = i })
      if (bi < 0) break
      cv[bi]![k[bi]!]!.c.forEach((q, c) => (left[c]! -= q)); k[bi]!++
    }
  }
  // Report: one step per upgrade, best first (first level's ratio), re-measured with the real model in that order.
  const first = curves().map((st) => st[0]?.r ?? 0), held = [...start]
  const steps: { r: number; kind: Buy['kind']; from: number; to: number; cost: number[]; riftPct: number }[] = []
  let s: Save = s0
  for (const i of opts.map((_, i) => i).filter((i) => k[i]).sort((a, b) => first[b]! - first[a]!)) {
    const { r, kind, L0 } = opts[i]!, was = away(s, r), cost = start.map(() => 0)
    for (let L = L0; L < L0 + k[i]!; L++) { for (const [c, q] of upgradeCost(r, kind, L)) { cost[c]! += q; held[c]! -= q } s = bought(s, r, kind) }
    steps.push({ r, kind, from: L0, to: L0 + k[i]!, cost, riftPct: 100 * (away(s, r) / was - 1) })
  }
  return { steps, left: held }
}

/** Each rift's own bonus as a number, from the code that reads its level (offsets in EFFECTS). Unfloored here: the game floors
 *  most of these when it applies them, so a single level can add 0 or 2 points; the slope is what a level is worth on average. */
export const BONUS: Record<number, { label: string; unit: string; raw: (k: number, s: Save) => number }> = {
  1: { label: 'Cash', unit: '% of fight cash/min', raw: (k) => Math.min(7 + 0.8 * k ** 0.7, 60) },
  2: { label: 'Away H2O', unit: '% away H2O', raw: (k) => 12 + 3 * k },
  3: { label: 'Damage', unit: '% damage', raw: (k) => 15 * Math.min(k, 1) + 5 * k },
  4: { label: 'Max HP', unit: '% max HP', raw: (k) => 12 * Math.min(k, 1) + 4 * k },
  5: { label: 'Away Mining', unit: '% away ores/EXP', raw: (k) => 15 * Math.min(k, 1) + 5 * k },
  6: { label: 'Idle attack speed', unit: '% attack speed', raw: (k) => 10 * Math.min(k, 1) + 3 * k },
  7: { label: 'Max shield', unit: '% shield charge', raw: (k) => 15 * Math.min(k, 1) + 5 * k },
  8: { label: 'AP on ascend', unit: '% AP', raw: (k, s) => 20 * Math.min(k, 1) + 5 * k + 4 * n(arr(s, 'SkillLevels')[37]) },
  9: { label: 'Every rift', unit: ' levels on each rift', raw: (k) => k },
}
/** What one more level of rift r is worth from level k, in that rift's bonus units. */
export const perLevel = (s: Save, r: number, k: number) => BONUS[r]!.raw(k + 1, s) - BONUS[r]!.raw(k, s)

/** What each rift's level does, from the code that reads it (k = level, P = Pro level, p = 2P/(P + 100), the Pro scale). */
export const EFFECTS: Record<number, { normal: (k: number, s: Save) => string; pro: (k: number, p: number) => string; at: string }> = {
  1: { normal: (k) => `${Math.floor(Math.min(7 + 0.8 * k ** 0.7, 60))}% of the fight's cash per minute, on the Limbo screen and away (cap 60%)`,
    pro: (k, p) => `cash ×${(1 + p / 2) ** Math.floor(k / 10) > 1e4 ? 'big' : +((1 + p / 2) ** Math.floor(k / 10)).toFixed(3)} (×(1 + p/2) per 10 levels)`, at: '@21682751 · Pro @31681964' },
  // Rift 2 reaches water through a cached attribute: only its own rift-screen draw (RiftSelected 2) sets H20BonusPercent =
  // floor(12 + 3k)/100 († @21712297; save key H2OBonusPercent, load @20369043, save @20622429). Every gym lifter's away water
  // is × (1 + H20BonusPercent): offline (SceneEvents_29 @3884782 @3900259 @3915148 @3930069) and on returning to the Gym,
  // Attack Dojo, Strength Mountain and Endurance Fields (SceneEvents_0 @19380573, 3 @22731233, 4 @26388185, 14 @19849427).
  // So the bonus applied is the level at the last rift-2 screen visit, not the current one. The other RiftLVL[2] reads are
  // the glyph sprite, load/reset, Rift Rift +1, the Pro water-EXP formula and the screen text; none touches water gain.
  2: { normal: (k, s) => `${Math.floor(12 + 3 * k)}% offline and away H2O (applied: ${Math.round(100 * n(s.H20BonusPercent))}%, set when you last opened this rift)`,
    pro: (k, p) => `water EXP requirement grows ${+(2 * (k / (k + 80)) ** 1.6 * p).toFixed(2)} points slower per level (of 12%)`, at: '@21712297 · Pro @19356657' },
  3: { normal: (k) => `+${Math.floor(15 * Math.min(k, 1) + 5 * k)}% damage`, pro: (k, p) => `+${+((200 * k) / (k + 200) * p).toFixed(1)}% pet damage`, at: '@2640849 · Pro @27308191' },
  4: { normal: (k) => `+${Math.floor(12 * Math.min(k, 1) + 4 * k)}% max HP`, pro: (k, p) => `+${+((250 * k) / (k + 200) * p).toFixed(1)}% pet HP`, at: '@3953758 · Pro @27281363' },
  5: { normal: (k) => `+${Math.floor(15 * Math.min(k, 1) + 5 * k)}% away Mining ores and EXP`,
    pro: (k, p) => `Mining EXP requirement grows ${+(6 * (k / (k + 80)) ** 1.6 * p).toFixed(2)} points slower per level (of 33.2%)`, at: '@3947816 · Pro @30332949' },
  6: { normal: (k) => `+${Math.floor(10 * Math.min(k, 1) + 3 * k)}% idle attack speed`, pro: (k, p) => `+${+((200 * k) / (k + 200) * p).toFixed(1)}% builder and machine speed`, at: '@3970415 · Pro @2691497' },
  7: { normal: (k) => `+${15 * Math.min(k, 1) + 5 * k}% max shield charge`, pro: (k, p) => `+${+((240 * k) / (k + 200) * p).toFixed(1)}% Asylum traces`, at: '@19897954 · Pro @18623206' },
  8: { normal: (k, s) => `+${Math.floor(20 * Math.min(k, 1) + 5 * k + 4 * n(arr(s, 'SkillLevels')[37]))}% AP on ascend`, pro: (k, p) => `+${+((250 * k) / (k + 200) * p).toFixed(1)}% BP on rebirth`, at: '@11295680 · Pro @11829083' },
  9: { normal: (k) => `each level-up adds 1 level to every rift (${k} so far)`, pro: (k, p) => `${+((50 * k) / (k + 200) * p).toFixed(2)}% chance a level-up adds a second level to rifts 1-8`, at: '@21534825 · Pro @21536073' },
}

/** Pro levels (dark-mode rift screen, ActorEvents_61 † @12462183): open for rift r when ConstructLV[10] + ConstructLV[22]
 *  (Rift Pro + Rift God) ≥ r († @21522002); level P < min(30 + 100·potion136/(potion136 + 175), 100). Costs († @21776230):
 *  Pink souls (SoulsTotal[8]) (10 + r²)·g^r·(1.43 + r/150)^P, g = 1.2 for r ≤ 4 then 1.22/1.25/1.3/1.35/1.4, and treasure
 *  1/4/7 (TreasureOwned, rifts 1-3/4-6/7-9) (2.3^r + 2500·3^r)·(1.25 + r/400)^P. Effect scale p = 2P/(P + 100). */
export function pro(s: Save) {
  const p136 = n(arr(s, 'PotionLV')[136]), cap = Math.min(30 + (100 * p136) / (p136 + 175), 100)
  const open = n(arr(s, 'ConstructLV')[10]) + n(arr(s, 'ConstructLV')[22]), pink = n(arr(s, 'SoulsTotal')[8])
  return Array.from({ length: RIFT_COUNT }, (_, i) => {
    const r = i + 1, P = n(arr(s, 'RiftProLvs')[r]), k = n(arr(s, 'RiftLVL')[r]), t = r <= 3 ? 1 : r <= 6 ? 4 : 7
    const g = [1.2, 1.2, 1.2, 1.2, 1.22, 1.25, 1.3, 1.35, 1.4][i]!
    const souls = (10 + r * r) * g ** r * (1.43 + r / 150) ** P, treasure = (2.3 ** r + 2500 * 3 ** r) * (1.25 + r / 400) ** P
    const owned = n(arr(s, 'RiftVALUElv')[r]) > 0
    return { r, P, cap, unlocked: open >= r, owned, souls, treasure, treasureId: t, affordable: open >= r && owned && P < cap && pink >= souls && n(arr(s, 'TreasureOwned')[t]) >= treasure,
      now: EFFECTS[r]!.pro(k, (2 * P) / (P + 100)), next: EFFECTS[r]!.pro(k, (2 * (P + 1)) / (P + 101)) }
  })
}
