// Spelunking (#42): the skill's screen is scene SceneEvents_49 (CurrentlyViewedScreen 22). Up to 8 spelunkers; each one digs
// (SpelunkerStatus 1), learns (2) or waits at home (0; .2/.25/.5/.75 are walking animations). Every formula is ported from
// Qno2x.js (offsets †) and checked in spelunking.test.ts against the game's own code in the sandbox or a stored value.
//
// Save keys (decoded here):
//   SpelunkerLV / SpelunkerEXP / SpelunkerREQ  the skill level; REQ starts at 30 (@20253151 †) and becomes 1.195·REQ + 2·LV^2.3 on
//                                              a level-up, which also gives a skill point and LV Coins (@29963236 †).
//   SpelunkerLvsVSD[3k-2 / 3k-1 / 3k]          spelunker k's Value / Speed / Dig levels; k is hired once Value ≥ 1 (hiring sets all
//                                              three to 1, @29977388 †).
//   SpelunkerDistance[k]                       digging: depth reached this trip; learning: learning points.
//   SpelunkerDistanceMAX[k]                    the dig target: digging stops there (the rest of the speed goes to DigDownOverflow[k]).
//   SpelunkerLearnLVs[p + 14(k-1)]             spelunker k's level in perk p (1-14, the "learning cards").
//   TreasureOwned[t]                           treasure of tier t (names: construction.json).
import { treasureName, DOMAINS, lv as cLv, name as buildingName, cost as buildCost } from '../construction/construction'
import { buildCards, type Catalog } from '../cards/cards-calc'
import { SPELUNK_BONUSES } from '../cardplan/cards-plan'
import catalog from '../../data/card-catalog.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const at = (s: Save, k: string, i: number) => n(arr(s, k)[i])
/** log10 the way the game writes it (.4342945·ln), so ported numbers match the game's to the last digit. */
const lg = (x: number) => 0.4342945 * Math.log(x)

export { treasureName }
export const SLOTS = 8
/** Value, Speed, Dig level of spelunker k (SpelunkerLvsVSD, 3 per spelunker). */
export const vsd = (s: Save, k: number) => [at(s, 'SpelunkerLvsVSD', 3 * k - 2), at(s, 'SpelunkerLvsVSD', 3 * k - 1), at(s, 'SpelunkerLvsVSD', 3 * k)] as const
export const hired = (s: Save) => Array.from({ length: SLOTS }, (_, j) => j + 1).filter((k) => vsd(s, k)[0] > 0)
export const perk = (s: Save, k: number, p: number) => at(s, 'SpelunkerLearnLVs', p + 14 * (k - 1))
export const status = (s: Save, k: number) => at(s, 'SpelunkerStatus', k)
export const STATUS: Record<number, string> = { 0: 'home', 1: 'digging', 2: 'learning' }

// ---- Perks (learning cards) -----------------------------------------------------------------------------------------------
/** _LearningCardNAMES (SceneEvents_49 init, @29943037 †), title-cased. */
export const PERKS = ['', 'Basic Switfness', 'Value Town', 'Big Brained', 'Diggy Hole', 'Craaazy Skull', 'Extra Baggage', 'Were Goin Down',
  'Sacks on Sacks', 'Galaxy Brained', 'Obol Blessing', 'Sanic Speed', 'Shiny is Good', 'Hey Look Ma', 'Hammer Time']
/** _LearningcardPERCENT: the card's "% per level" (@29943815 †); cards 3, 5, 6, 8, 9, 11, 13, 14 override it with a curve. */
export const PCT = [0, 10, 8, 5, 5, 1, 5, 4, 5, 3, 0.1, 2, 4, 3, 5]
/** _MinReqLearnBarNUM: the learn bar a perk needs before a learning trip can level it (@29943815 †). */
export const MIN_REQ = [0, 0.1, 0.5, 1, 1.5, 2.3, 3, 4, 5, 6, 7, 8, 9, 10, 12]

type PerkFx = { scope: 'this spelunker' | 'all spelunkers' | 'Construction'; what: string; at: string; pct: (L: number) => number; dead?: string }
/** What each perk does, read from the formulas that use it (not from the card text). `pct(L)` is the bonus in % at level L. */
export const PERK_FX: Record<number, PerkFx> = {
  1: { scope: 'this spelunker', what: 'dig speed', at: '@2648435 †', pct: (L) => 10 * L },
  2: { scope: 'this spelunker', what: 'bag value', at: '@2679031 †', pct: (L) => 8 * L },
  3: { scope: 'this spelunker', what: 'learning rate', at: '@2652753 †', pct: (L) => (200 * L) / (L + 50) },
  4: { scope: 'this spelunker', what: 'dig-down amount (card)', at: '@2680419 †', pct: (L) => 5 * L,
    dead: 'no effect: the game adds 5×level to a term it then clamps to 300 (Math.max(Math.min(x, 45), 300))' },
  5: { scope: 'this spelunker', what: 'of the Spelunking EXP bonus from Spunky Pop', at: '@30203568 †', pct: (L) => (100 * L) / (L + 49) },
  6: { scope: 'this spelunker', what: 'treasure items per bag (the bags-owned term, capped at +400%)', at: '@2657807, @2659778 †', pct: (L) => Math.min((500 * L) / (L + 155), 400) },
  7: { scope: 'this spelunker', what: 'dig-down base (the 10^… term; the card says 4%/level, the code uses 5%)', at: '@2680419 †', pct: (L) => 5 * L },
  8: { scope: 'this spelunker', what: 'value of each extra bag vs the one before (extra bags: 1 at level 1-75, 2 above)', at: '@2656159, @2656833 †', pct: (L) => 10 + Math.min((70 * L) / (L + 85), 50) },
  9: { scope: 'all spelunkers', what: 'learning rate', at: '@2652753 †', pct: (L) => (40 * L) / (L + 50) },
  10: { scope: 'this spelunker', what: 'dig-down speed per Spelunking level (card)', at: 'card only', pct: (L) => 0.1 * L,
    dead: 'no effect found: no formula reads this perk (SpelunkerLearnLVs[10 + 14k])' },
  11: { scope: 'all spelunkers', what: 'dig speed', at: '@2648435 †', pct: (L) => (150 * L) / (L + 49) },
  12: { scope: 'this spelunker', what: 'treasure per item', at: '@2664555 †', pct: (L) => 4 * L },
  13: { scope: 'this spelunker', what: 'rare-treasure chance (an item rolls one tier up)', at: '@2661988 †', pct: (L) => (250 * L) / (L + 49) },
  14: { scope: 'Construction', what: 'speed of iodized builder k (only if bought)', at: '@2689433 †', pct: (L) => Math.min((50 * L) / (L + 85), 50) },
}

// ---- Rates (the game's custom blocks, aa12 = the spelunker) -----------------------------------------------------------------
/** Depth per hour (_customBlock_SpelunkerSpeedperHour, @2648435 †). */
export function speedPerHour(s: Save, k: number) {
  let m = 1
  const p135 = at(s, 'PotionLV', 135)
  for (let a = 0; a < 8; a++) if (status(s, a + 1) === 2) m += ((250 * p135) / (p135 + 175)) * (n(s.SpelunkerLV) / 10) / 100
  for (let i = 0; i < 8; i++) { const L = perk(s, i + 1, 11); m *= 1 + (150 * L) / (L + 49) / 100 }
  m *= n(s.PbonusSpelunkSpd)
  const sk = at(s, 'SkillLevels', 70)
  m *= 1 + (1.9 * sk) / (sk + 1e3)
  if (n(s.MTXdemonspelunkersPurchased) >= k) m *= 5
  const S = at(s, 'SpelunkerLvsVSD', Math.max(3 * k - 1, 0))
  return 10 ** (((S - 1) / 30) ** 0.84) * (600 * m * (1 + at(s, 'ConstructLV', 3) / 50) * (1 + ((S - 1) / 100) ** 0.5))
    * (1 + (10 * perk(s, k, 1)) / 100) * (1 + at(s, 'CbonusTunnels', 1) / 100) * (1 + at(s, 'EbonusThree', 15) / 100)
}
/** Learning points per hour (_customBlock_SpelunkerLearnperHour, @2652753 †). */
export function learnPerHour(s: Save, k: number) {
  let g = 0
  for (let a = 0; a < 8; a++) { const L = perk(s, a + 1, 9); g += (40 * L) / (L + 50) }
  const mtx = n(s.MTXcanarysPurchased) >= k ? 4 : 1, sk = at(s, 'SkillLevels', 70), p = at(s, 'PotionLV', 133), L3 = perk(s, k, 3)
  return (1 + at(s, 'ConstructLV', 27) / 135) * (1 + at(s, 'CbonusTunnels', 6) / 100) * (1 + at(s, 'EbonusThree', 16) / 100) * 60 * mtx * (1 + g / 100)
    * (1 + (2 * sk) / (sk + 1e3)) * (1 + (250 * p) / (p + 175) / 100) * (1 + (200 * L3) / (L3 + 50) / 100)
}
/** Bag value per unit of depth (_customBlock_SpelunkerVALUE, @2679031 †): a bag is worth depth × this. */
export function value(s: Save, k: number) {
  const V = at(s, 'SpelunkerLvsVSD', Math.max(3 * k - 2, 0))
  return Math.max(10 ** (Math.min(V - 1, 35) / 45), 10 ** (((V - 1) / 5 * 0.3) ** 0.5 - 1) + 3.2) * (1 + (8 * perk(s, k, 2)) / 100)
}
/** How much deeper the dig target goes on a Dig Down (_customBlock_DigDownAmount, @2680419 †). Dig Down is offered once depth
 *  reaches the target; it raises the target by this and sets depth to 0 (region-5 listener, @30138000 †). */
export function digDown(s: Save, k: number) {
  let a6 = 0
  for (let a = 0; a < 8; a++) a6 += 4 * perk(s, a + 1, 7)
  a6 += 5 * perk(s, k, 4)
  a6 = (3 * a6) / (Math.max(a6, 0) + 1750)
  const mx = at(s, 'SpelunkerDistanceMAX', k), r = at(s, 'DigDownOverflow', k), p = at(s, 'PotionLV', 139), D = at(s, 'SpelunkerLvsVSD', 3 + 3 * (k - 1))
  let t = (1 + at(s, 'CbonusTunnels', 2) / 100) * (n(s.MTXdemonspelunkersPurchased) >= k ? 4 : 1)
  t *= 1 + (r / mx / 2) ** (0.45 + (0.33 * p) / (p + 175))
  const base = 10 ** (2 + D / (16 + Math.min((23 * D) / (D + 120), 12)))
  // ponytail: ported as written; Math.max(Math.min(x, 45), 300) is always 300, so Diggy Hole and the all-spelunker We're Goin Down
  // sum (a6) change nothing. The test pins that.
  const c = 130.28835 * Math.log(mx + 0.1)
  const o = Math.max(Math.min((200 - c / (lg(mx + 0.1) + 13)) * (1 + a6), 45), 300)
  return t * (1 + at(s, 'EbonusThree', 17) / 100) * (base * (1 + (5 * perk(s, k, 7)) / 100) + 29
    + mx * ((o * Math.max(1 - (10 * Math.max(100 - ((D / 23 + 1) / lg(mx + 0.1)) * 100, 0) ** 0.5) / 100, 0.2)) / 100))
}
/** Treasure per bag item (_customBlock_AmountOfTreasure, @2664555 †). */
export function treasurePerItem(s: Save, k: number) {
  const p = at(s, 'PotionLV', 147)
  return (1 + (4 * perk(s, k, 12)) / 100) * (1 + ((110 * p) / (p + 175)) * (n(s.SpelunkerLV) / 10) / 100)
}
/** Bags per trip and each extra bag's share of the one before (_customBlock_MultibagChance @2656159 †, MultibagDecay @2656833 †;
 *  used on the way home, @30113241 †). */
export function bags(s: Save, k: number) {
  const L = perk(s, k, 8), mtx = n(s.MTXdemonspelunkersPurchased) >= k
  const chance = 100 * (Math.min(Math.ceil((L / 75) ** 0.5), 2) + (mtx ? 2 : 0))
  const decay = (Math.min(90 - Math.min((70 * L) / (L + 85), 50), 100) * (mtx ? 0 : 1)) / 100
  return { chance, decay, count: 1 + Math.floor(chance / 100), share: Math.max(1 - decay, 0.1) }
}
/** A bag's treasure tier from its value: ⌊log10 v⌋ − 1, 1-26 (bag frame, @30082348 †; opening rolls tier ⌊log10(v + .1) − 1⌋, then
 *  may step up on the rare chance, @30201500 †). A bag needs value ≥ 100. */
export const bagTier = (v: number) => (v < 100 ? 0 : Math.min(Math.max(Math.floor(lg(v + 0.1)) - 1, 1), 26))

// ---- Learning ---------------------------------------------------------------------------------------------------------------
/** The learn bar from learning points P (LearningTierThreshold @2665447 †, used in the learn listener @30130165 †): tier t takes
 *  1440·t points, so the bar is (completed tiers) + (fraction of the next). */
export function learnBar(P: number) {
  const t = Math.floor(1 + (Math.sqrt(8 * Math.floor(P / 1440) + 1) - 1) / 2)
  return t - 1 + (P - (1440 * (t - 1) * t) / 2) / (1440 * t)
}
/** Learning points for a bar value (the inverse of learnBar). */
export const pointsFor = (bar: number) => { const t = Math.floor(bar); return 1440 * ((t * (t + 1)) / 2 + (bar - t) * (t + 1)) }
/** Levels a learning trip adds to one perk (learn listener @30130165 †): nothing below the perk's bar; else a roll of 1..m with
 *  m = ⌊(bar − req)/(0.7 + req) + bar^0.45 + 0.5⌋, capped at 9 + potion 151, × potion 150, at most 15. Returns the min, max and
 *  mean of that roll. */
export function learnGain(s: Save, bar: number, p: number) {
  const req = MIN_REQ[p]!
  if (bar < req) return null
  const p150 = at(s, 'PotionLV', 150), p149 = at(s, 'PotionLV', 149), cap = 9 + Math.min(6, Math.ceil((6.5 * p150) / (p150 + 175)))
  const m = Math.max(Math.floor((bar - req) / (0.7 + req) + bar ** 0.45 + 0.5), 1)
  const g = (j: number) => Math.min(15, Math.min(cap, Math.min(cap, Math.max(j, 1)) * (1 + (75 * p149) / (p149 + 175) / 100)))
  let t = 0
  for (let j = 1; j <= m; j++) t += g(j)
  return { min: g(1), max: g(m), mean: t / m }
}

// ---- Upgrades and hiring ----------------------------------------------------------------------------------------------------
/** Treasure-cost curve shared by the three upgrades (SpelunkCost1b/2b/3b, @2667950 †, @2673714 †, @2677169 †). */
function costB(k: number, L: number, step: number, big: number, base: number, last: number) {
  const f = Math.floor(L / step), e = Math.min(0.5 + (0.92 * L) / (L + 150), 1)
  const core = (b: number) => k * ((L - step * f + Math.min(f, 1)) ** (base + b * f) + (3 + f) * f)
  if (Math.floor(L / big) - Math.floor(Math.max(L - step, 0) / big) === 1)
    return (core(0.085) * (1.5 + 0.3 * Math.max(Math.floor((L - step) / big) - 1, 0)) ** Math.round(3 + 0.25 * Math.max(Math.floor(L / big), 0))) ** e
  if (Math.ceil((L - step * Math.floor(L / big) + 1) / step) !== 28) return core(0.06) ** e
  return k * (L ** last + 2 * L)
}
/** Which treasure tier an upgrade costs (_CostCurrencies112233 [2]/[4]/[6], draw listener @30212200 †), at most 28. */
function costTier(L: number, step: number, big: number) {
  const t = Math.floor(L / big) - Math.floor(Math.max(L - step, 0) / big) === 1
    ? Math.round(1 + 2 * Math.max(Math.floor((L + step) / big) - 1, 0)) : Math.ceil((L - step * Math.floor(L / big) + 1) / step)
  return Math.min(t, 28)
}
export const UPGRADES = ['Value', 'Speed', 'Dig'] as const
const UP = [{ gold: 5e13, div: 23, step: 20, big: 80, base: 1.2, last: 0.3 }, { gold: 25e12, div: 35, step: 30, big: 120, base: 1.17, last: 0.26 },
  { gold: 5e13, div: 23, step: 20, big: 80, base: 1.2, last: 0.3 }]
/** Cost of spelunker k's next Value / Speed / Dig level (u = 0/1/2): gold (SpelunkCost1a/2a/3a @2665689 †, @2672089 †, @2676405 †)
 *  and treasure; the button is lit when gold > cost and treasure ≥ ⌊amount⌋ (draw listener @30220300 †). */
export function upgradeCost(s: Save, k: number, u: 0 | 1 | 2) {
  const L = vsd(s, k)[u], c = UP[u]!
  const gold = c.gold * 4 ** k * (4 + L / c.div / 7) ** ((L / c.div) ** 1.46)
  const amount = costB(k, L, c.step, c.big, c.base, c.last), tier = costTier(L, c.step, c.big)
  const held = at(s, 'TreasureOwned', tier)
  return { gold, tier, amount, held, ok: n(s.goldcoin) > gold && held >= Math.floor(amount) }
}
/** Hiring the next spelunker (hire listener @29977388 †): Spelunking level, gold (SpelunkCost2a, menu 2) and treasure (2b). */
export function hireCost(s: Save) {
  const t = hired(s).length
  if (t >= SLOTS) return null
  const fl = (x: number) => Math.floor(x / 100)
  const level = (t - fl(97 + t)) * (5 + 5 * fl(96 + t)) + 2 * fl(98 + t) + 8 * fl(97 + t) - 10 * fl(96 + t) + 10 * fl(94 + t) + 20 * fl(93 + t)
  const last = t - 1 // the cost blocks key on the last hired spelunker
  const gold = 125e12 * 4 ** last * 10 ** (5 * 1.52 ** last), amount = 10 * (last + 1)
  const tier = Math.floor(2.5 * t) + 2 * fl(t + 96) + fl(t + 95) + fl(t + 93)
  const held = at(s, 'TreasureOwned', tier)
  return { k: t + 1, level, gold, tier, amount, held, ok: n(s.SpelunkerLV) >= level && n(s.goldcoin) > gold && held >= Math.floor(amount) }
}

/** SpelunkerREQ after a level-up to L (@29963236 †). */
export const nextReq = (req: number, L: number) => 1.195 * req + 2 * L ** 2.3

// ---- The page model ---------------------------------------------------------------------------------------------------------
export type Spelunker = ReturnType<typeof spelunker>
export function spelunker(s: Save, k: number) {
  const st = status(s, k), [V, S, D] = vsd(s, k), depth = at(s, 'SpelunkerDistance', k), target = at(s, 'SpelunkerDistanceMAX', k)
  const speed = speedPerHour(s, k), val = value(s, k), dig = digDown(s, k), learn = learnPerHour(s, k), b = bags(s, k)
  const atTarget = st === 1 && depth >= target
  // Digging: hours until depth reaches the target (the 50 ms tick adds speed/72,000, @29964600 †; away time the same, @29950000 †).
  const hours = st === 1 ? Math.max(target - depth, 0) / speed : st === 2 ? null : 0
  const bar = st === 2 ? learnBar(depth) : null
  const nextPerk = bar == null ? null : MIN_REQ.findIndex((r, p) => p > 0 && r > bar)
  const learnHours = bar == null || nextPerk! < 0 ? null : (pointsFor(MIN_REQ[nextPerk!]!) - depth) / learn
  return { k, st, V, S, D, depth, target, speed, value: val, dig, learn, bags: b, atTarget, hours, bar, nextPerk: nextPerk! > 0 ? nextPerk : null, learnHours,
    bagNow: depth * val, bagAtTarget: target * val, perks: Array.from({ length: 14 }, (_, j) => perk(s, k, j + 1)) }
}
/** What the player can do next, soonest first: ranked by when the action is available (now before later), because each one is
 *  a different kind of gain (a bag, a deeper target, perk levels, a new spelunker) and the game gives no common unit to weigh them. */
export function plan(s: Save) {
  const all = hired(s).map((k) => spelunker(s, k))
  const order = (x: Spelunker) => (x.atTarget || x.st === 0 ? 0 : x.st === 1 ? x.hours! : x.learnHours ?? Infinity)
  const ups = all.flatMap((x) => UPGRADES.map((name, u) => ({ k: x.k, name, u: u as 0 | 1 | 2, level: [x.V, x.S, x.D][u]!, c: upgradeCost(s, x.k, u as 0 | 1 | 2) })))
  return { all: [...all].sort((a, b) => order(a) - order(b)), ups: ups.filter((u) => u.c.ok), allUps: ups, hire: hireCost(s), order }
}
/** One more level of spelunker k's Value/Speed (u 0/1): fractional gain in bag value per hour (value × speed, below the target);
 *  Dig (u 2): fractional gain in the Dig Down amount. */
export function upgradeGain(s: Save, k: number, u: 0 | 1 | 2) {
  // shallow copy: the page passes Vue's reactive save, which structuredClone can't clone
  const a = [...arr(s, 'SpelunkerLvsVSD')]
  a[3 * k - 2 + u] = n(a[3 * k - 2 + u]) + 1
  const t = { ...s, SpelunkerLvsVSD: a } as Save
  return u === 2 ? digDown(t, k) / digDown(s, k) - 1 : (value(t, k) * speedPerHour(t, k)) / (value(s, k) * speedPerHour(s, k)) - 1
}

// ---- Treasure from bags, the next gate, what to buy (#2653) ------------------------------------------------------------------
// Opening spelunker k's bag of value v (bag listener @30201500 †): randomInt(MinimumBagItems, MaxBagItems) items (randomInt is
// uniform over the range either way round, @592542 †); each item starts at tier ⌊min(log10(v + .1) − 1, 26)⌋, then up to 5 times
// steps one tier up (max 28) while a 1..100000 roll ≤ 100000·BagItemRareChance, and adds AmountOfTreasure to that tier.
/** Fewest / most items in a bag of value v (_customBlock_MinimumBagItems @2657807 †, _customBlock_MaxBagItems @2659778 †). */
export function bagItems(s: Save, k: number, v: number) {
  const L = perk(s, k, 6), c28 = at(s, 'ConstructLV', 28), extra = Math.min((500 * L) / (L + 155), 400) / 100
  const lead = v / 10 ** Math.floor(lg(v + 0.1))
  const min = Math.floor(c28 / 1.35 + (2 + extra) * (Math.floor(lg(v + 0.1) - 2) ** 0.57 + lead ** 0.4))
  const max = Math.floor(1.5 + (c28 + at(s, 'CbonusTunnels', 4) + (1 + extra) * (1 + (Math.floor(lg(v + 0.1) - 1) ** 0.7 + lead ** 0.85))))
  return { min, max, mean: (min + max) / 2 }
}
/** Chance per roll that an item steps one tier up (_customBlock_BagItemRareChance @2661988 †): ~2.3% at tier 8, more for a bag
 *  further into its tier; × Hey Look Ma (perk 13) and RareTreasure cards (CbonusTunnels[5]); at most 30%. */
export function rareChance(s: Save, k: number, v: number) {
  const a = Math.round(lg(v + 0.1) - 1), a2 = Math.max(v / 10 ** (a + 1), 1)
  const a3 = a < 20 ? 18.466666666666665 * (1 - (1.138 * a) / (a + 3)) * (1 - a / 30) : 0.008695652173913044
  const L = perk(s, k, 13)
  return Math.min((a > 26 ? 1e-4 * (a - 26) : 0) + ((a3 + a3 * ((1.5 * (a2 - 1)) / (a2 + 3.5))) / 100) * (1 + (250 * L) / (L + 49) / 100) * (1 + at(s, 'CbonusTunnels', 5) / 100), 0.3)
}
/** Expected treasure of tier ≥ G from spelunker k's trip home with depth × value = v: every bag (extra bags are worth `share` of
 *  the one before, bags()), mean items × P(item reaches G) × AmountOfTreasure. P is 1 when the start tier is ≥ G, else
 *  p^(G − start) for up to 5 steps (the roll is ⌊1e5·p⌋/1e5, taken as p). */
export function bagYield(s: Save, k: number, v: number, G: number) {
  const b = bags(s, k), per = treasurePerItem(s, k)
  let total = 0
  for (let i = 0, x = v; i < b.count; i++, x *= b.share) {
    if (x < 100) break
    const start = Math.floor(Math.min(lg(x + 0.1) - 1, 26)), d = G - start
    total += bagItems(s, k, x).mean * (d <= 0 ? 1 : d <= 5 ? rareChance(s, k, x) ** d : 0) * per
  }
  return total
}

/** The next locked Construction domain: its Sentinel opens it once TreasureOwned[tier] > more (construction.ts DOMAINS, regions
 *  13-16 † @30773438-@30698414); the treasure is not taken. need = how many more of that tier. */
export function gate(s: Save) {
  const d = DOMAINS.find((x) => cLv(s, x.flag) < 1)
  if (!d) return null
  const held = at(s, 'TreasureOwned', d.treasure)
  return { domain: d.name, tier: d.treasure, more: d.more, held, need: Math.max(Math.floor(d.more - held) + 1, 0), opens: d.ids.map(buildingName) }
}
export type Gate = NonNullable<ReturnType<typeof gate>>

export const withArr = (s: Save, key: string, i: number, v: number) => { const a = [...arr(s, key)]; a[i] = v; return { ...s, [key]: a } as Save }
export type Leg = { target: number; hours: number; bag: number; expected: number }
/** Spelunker k's fastest way to the gate on its own: reach the current target, then Dig Down 0, 1, 2 … times (each raises the
 *  target by digDown and restarts depth at 0, so it costs target/speed), and bring the bag home at the first target whose
 *  expected gate treasure covers `need`. Speed and value as now; overflow past the target is kept for the first Dig Down only.
 *  Learners (no depth) get null. legs[0] is the current target. */
export function route(s: Save, k: number, G: Gate | null = gate(s), maxDigs = 40) {
  const st = status(s, k)
  if (!G || st === 2) return null
  const sp = speedPerHour(s, k), val = value(s, k)
  let T = at(s, 'SpelunkerDistanceMAX', k), t = s, hours = Math.max(T - (st === 1 ? at(s, 'SpelunkerDistance', k) : 0), 0) / sp
  const legs: Leg[] = []
  // one copy of the (1400-key) save per route, its two arrays then set in place per leg: copying per leg made this 25 ms
  const mx = [...arr(s, 'SpelunkerDistanceMAX')], of = [...arr(s, 'DigDownOverflow')], u = { ...s, SpelunkerDistanceMAX: mx, DigDownOverflow: of } as Save
  for (let d = 0; d <= maxDigs; d++) {
    const expected = bagYield(s, k, T * val, G.tier)
    legs.push({ target: T, hours, bag: T * val, expected })
    if (expected >= G.need) {
      // Scoring proxy: the finishing leg cut at the bag value that just covers the need (bisected in log v between this leg's
      // bag and the one before), so a Value level, which lowers the depth that bag needs, shortens it smoothly instead of only
      // when a whole Dig Down drops off. ponytail: assumes bagYield rises with v across the leg; the target itself stays fixed.
      const p = legs[d - 1]
      let lo = Math.log(p ? p.bag : 1), hi = Math.log(T * val)
      if (p) for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (bagYield(s, k, Math.exp(m), G.tier) >= G.need) hi = m; else lo = m }
      return { k, digs: d, hours, legs, expected, smooth: p ? p.hours + Math.exp(hi) / val / sp : hours }
    }
    T += digDown(t, k); hours += T / sp
    mx[k] = T; of[k] = 0; t = u
  }
  return null
}
/** The fastest spelunker's route to the gate (null: none within 40 Dig Downs). */
export function bestRoute(s: Save, G: Gate | null = gate(s)) {
  return hired(s).map((k) => route(s, k, G)).filter((r) => r != null).reduce<ReturnType<typeof route>>((b, r) => (!b || r.hours < b.hours ? r : b), null)
}

/** Treasure of tier t you hold in tier-t units, counting what machines can make from higher tiers (1 of u gives 3^(u − t),
 *  construction.ts viaMachines) when a machine is built; tiers at or above the gate's are kept for the gate. */
export function treasureWorth(s: Save, t: number, keepFrom = 99) {
  const held = arr(s, 'TreasureOwned')
  let w = n(held[t])
  if (cLv(s, 61) >= 1) for (let u = t + 1; u <= 28 && u < keepFrom; u++) w += n(held[u]) * 3 ** (u - t)
  return w
}
/** Pay `amount` of tier t: own tier first, then the nearest higher tiers through a machine. Returns the new save and the
 *  conversions, or null when it can't be paid. */
function pay(s: Save, t: number, amount: number, keepFrom = 99) {
  const held = [...arr(s, 'TreasureOwned')].map(n), conv: { from: number; take: number }[] = []
  const own = Math.min(held[t]!, amount) // exact: amount − (amount − held) can round below held and leave −1e-14
  held[t]! -= own
  let need = amount - own
  for (let u = t + 1; need > 1e-9 && u <= 28 && u < keepFrom && cLv(s, 61) >= 1; u++) {
    const take = Math.min(held[u]!, need / 3 ** (u - t))
    if (take <= 0) continue
    held[u]! -= take; need -= take * 3 ** (u - t); conv.push({ from: u, take })
  }
  return need > 1e-9 ? null : { s: { ...s, TreasureOwned: held } as Save, conv }
}

/** Card bonuses (CbonusTunnels[0..9], SPELUNK_BONUSES order) from your best owned cards that carry them, up to a deck's 10
 *  slots, ranked by speed + dig + rare + extra treasure first. The game sums the selected deck's cards into CbonusTunnels
 *  (CalculateCardBonusTotals @22141523 †), and a deck linked to Spelunking (link 12) is selected on its screen. */
export function spelunkDeck(s: Save) {
  const b = buildCards(s, catalog as unknown as Catalog), key = (c: { adds: Record<string, number> }) =>
    10 * ((c.adds.SpelunkerSpeed ?? 0) + (c.adds.SpelunkerDig ?? 0) + (c.adds.RareTreasure ?? 0) + (c.adds.ExtraTreasure ?? 0)) + SPELUNK_BONUSES.reduce((t, x) => t + (c.adds[x] ?? 0), 0)
  const cards = b.cards.filter((c) => c.level >= 1 && key(c) > 0).sort((x, y) => key(y) - key(x)).slice(0, b.slots)
  return { cards: cards.map((c) => ({ id: c.id, name: c.name, level: c.level })), tunnels: SPELUNK_BONUSES.map((x) => cards.reduce((t, c) => t + (c.adds[x] ?? 0), 0)) }
}

export type Buy = { id: string; what: string; detail: string; tier: number | null; amount: number; gold: number; status: 'now' | 'convert' | 'short';
  share: number; growth: number; growthOf: string; before: number; after: number; saved: number; bang: number; apply: (s: Save) => Save }
/** Every Spelunking purchase (Value / Speed / Dig per spelunker, the next Sitty Chair level) plus linking a Spelunking card deck,
 *  each with: cost, share = its treasure ÷ treasureWorth of that tier (1 = everything that can pay it), growth = the existing
 *  per-item gain (bag value/h for Value and Speed, Dig Down amount for Dig, depth/h for Sitty Chair and cards), and the gate
 *  metric: hours to the gate before → after (bestRoute) and saved ÷ share ("bang": hours saved per whole stock spent). */
export function canBuy(s: Save, G: Gate | null = gate(s)): Buy[] {
  const r0 = bestRoute(s, G), base = r0?.hours ?? Infinity, base2 = r0?.smooth ?? Infinity, keep = G?.tier ?? 99, gold = n(s.goldcoin)
  const row = (r: Omit<Buy, 'status' | 'share' | 'before' | 'after' | 'saved' | 'bang'>): Buy => {
    const worth = r.tier == null ? Infinity : treasureWorth(s, r.tier, keep), heldT = r.tier == null ? Infinity : at(s, 'TreasureOwned', r.tier)
    const status = gold < r.gold ? 'short' : heldT >= Math.floor(r.amount) ? 'now' : worth >= r.amount ? 'convert' : 'short'
    const r1 = bestRoute(r.apply(s), G), after = r1?.hours ?? Infinity, share = r.tier == null ? 0 : r.amount / Math.max(worth, 1e-300)
    const after2 = r1?.smooth ?? Infinity // saved is scored on the smooth proxy; before/after stay real route hours
    const saved = Number.isFinite(base2) && Number.isFinite(after2) ? base2 - after2 : 0
    return { ...r, status, share, before: base, after, saved, bang: share > 0 ? saved / share : saved > 0 ? Infinity : 0 }
  }
  const out: Buy[] = []
  for (const k of hired(s)) for (const u of [0, 1, 2] as const) {
    const c = upgradeCost(s, k, u), L = vsd(s, k)[u]
    out.push(row({ id: `${k}-${u}`, what: `Spelunker ${k} ${UPGRADES[u]} ${L} → ${L + 1}`, detail: '', tier: c.tier, amount: c.amount, gold: c.gold,
      growth: upgradeGain(s, k, u), growthOf: u === 2 ? 'Dig Down amount' : 'bag value/h', apply: (t) => withArr(t, 'SpelunkerLvsVSD', 3 * k - 2 + u, vsd(t, k)[u] + 1) }))
  }
  // Sitty Chair (Construction building 3): +2% spelunker speed per level (1 + ConstructLV[3]/50 in SpeedperHour, @2648435 †).
  const sc = buildCost(s, 3), L3 = cLv(s, 3), tp = sc?.parts.find((p) => p.c <= 28)
  if (sc && tp) out.push(row({ id: 'sitty', what: `Sitty Chair ${L3} → ${L3 + 1} (Construction)`, detail: sc.parts.filter((p) => p !== tp).map((p) => `${p.q < 1e3 ? p.q : p.q.toExponential(2)} ${p.name}`).join(', ') + ` and ${+sc.req.toFixed(1)} build points`,
    tier: tp.c, amount: tp.q, gold: 0, growth: (1 + (L3 + 1) / 50) / (1 + L3 / 50) - 1, growthOf: 'depth/h', apply: (t) => withArr(t, 'ConstructLV', 3, L3 + 1) }))
  // its other part (flowers, fish) must be held too; it is checked, not taken: apply() doesn't spend it
  if (sc && tp && sc.parts.some((p) => p !== tp && p.held < p.q)) out.at(-1)!.status = 'short'
  const dk = spelunkDeck(s), cur = arr(s, 'CbonusTunnels')
  if (dk.tunnels.some((v, i) => v > n(cur[i]))) out.push(row({ id: 'deck', what: 'Link a deck with your Spelunking cards to Spelunking', detail: dk.cards.map((c) => `${c.name} (★${c.level})`).join(', '),
    tier: null, amount: 0, gold: 0, growth: (1 + dk.tunnels[1]! / 100) / (1 + n(cur[1]) / 100) - 1, growthOf: 'depth/h', apply: (t) => ({ ...t, CbonusTunnels: dk.tunnels }) }))
  return out
}

/** The one purchase nextSteps makes next (most gate hours saved per share of its tier's stock, payable now or through a machine
 *  from below the gate tier), paid and applied: the new save, or null when nothing saves time. spelunk-sim.ts reuses it. */
export function buyNext(t: Save, G: Gate) {
  const best = canBuy(t, G).filter((b) => b.status !== 'short' && b.saved > 1e-6).sort((a, b) => b.bang - a.bang)[0]
  if (!best) return null
  const paid = best.tier == null ? { s: t, conv: [] } : pay(t, best.tier, best.amount, G.tier)
  return paid && { best, paid, s: best.apply({ ...paid.s, goldcoin: n(paid.s.goldcoin) - best.gold }) }
}

/** A plan step; a run of the same upgrade is one step with `levels` levels, `amount` = their summed treasure and `conv` = tier →
 *  amount of that tier a machine turns into the paid one. */
export type Step = { id: string; what: string; detail: string; tier: number | null; amount: number; levels: number; hours: number; conv: Record<number, number> }
/** "What to do next" toward the gate. Greedy: link the card deck if it helps; then repeatedly buy the purchase (now or after a
 *  machine conversion from lower-than-gate tiers) with the most gate hours saved per share of its tier's stock, paying it from
 *  the running stock, until nothing saves time (or `maxBuys`); then the fastest spelunker's route (reach target, Dig Downs, bring
 *  home). Hours are the gate time after each step. ponytail: one spelunker's bag must cover the need alone; pooling two trips'
 *  expected treasure would be faster when two diggers are close. */
export function nextSteps(s: Save, maxBuys = 80) {
  const G = gate(s)
  if (!G) return null
  let t = s
  const steps: Step[] = []
  for (let i = 0; i < maxBuys; i++) {
    const b = buyNext(t, G)
    if (!b) break
    const { best, paid } = b
    t = b.s
    const last = steps.at(-1), conv = Object.fromEntries(paid.conv.map((c) => [c.from, c.take]))
    if (last?.id === best.id) { // the same upgrade again: one step, "level a → b"
      last.levels++; last.amount += best.amount; last.hours = best.after; last.what = last.what.replace(/→ \d+/, best.what.match(/→ \d+/)?.[0] ?? '$&') // the level may be followed by "(Construction)"
      for (const [u, x] of Object.entries(conv)) last.conv[+u] = (last.conv[+u] ?? 0) + x
    } else steps.push({ id: best.id, what: best.what, detail: best.detail, tier: best.tier, amount: best.amount, levels: 1, hours: best.after, conv })
  }
  return { gate: G, steps, start: bestRoute(s, G), route: bestRoute(t, G), save: t }
}
