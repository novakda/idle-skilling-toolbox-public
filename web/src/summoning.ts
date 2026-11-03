// Summoning (the Rune Summon screen, screen 10 = the Limbo rift scene). The rifts themselves (levels, bonuses, upgrades by
// each rift's own bonus) live on the Rift page (rift.ts); this page is the Summoning skill those rifts feed: its level, EXP,
// what a level gives (skill points), which rift upgrade raises it fastest, and the next rift to summon. Formulas from Qno2x.js
// (offsets †), checked in summoning.test.ts against the save and the game's own level-up code in the sandbox.
import { buys, rifts, type Buy } from './rift'
import { cbonus, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** Runes: RuneLVL / runeEXP / runeREQ are only loaded (@20382486 †) and saved (@20629634 †); no other code reads or writes
 *  them, so there are no runes to own and no rune bonuses in this build of the game. */
export const runes = (s: Save) => ({ lv: n(s.RuneLVL), exp: n(s.runeEXP), req: n(s.runeREQ) })

/** Requirement after a level-up to level L (the new level), from the old one († @21526972): 1.3·req + 120·⌊L/10⌋ + 2.5·L^1.8.
 *  Ascending resets it to 10 († @20909506), so the stored summonREQ is reproduced by iterating from 10 at the start level. */
export const nextSummonReq = (req: number, L: number) => 1.3 * req + 120 * Math.floor(L / 10) + 2.5 * L ** 1.8
/** summonREQ at level `lv` after ascending at level `start` (req 10 there). */
export function reqAt(start: number, lv: number) {
  let r = 10
  for (let L = start + 1; L <= lv; L++) r = nextSummonReq(r, L)
  return r
}

/** The level-up rule in the Limbo scene's draw listener († @21525225): a level when SummonEXP ≥ summonREQ·(1 − cut), cut =
 *  min(GiftShopLevels[22]/5, 50)%; that much EXP is spent, Skillpoints += 0.5·(1 + 0.1·AscentionLevel[11])·(1 +
 *  CbonusSkillPoints/100) († @21526032), then the new requirement, then SummonEXP += 0.6·ShrineLevels[6]% of it († @21527564).
 *  ponytail: MasteryPerksUnlocked[100] adds 3 levels at each multiple of 100 († @18679035, trigger not traced); not simulated. */
export function rules(s: Save) {
  const cut = Math.min(n(arr(s, 'GiftShopLevels')[22]) / 5, 50) / 100
  const sp = 0.5 * (1 + 0.1 * n(arr(s, 'AscentionLevel')[11])) * (1 + n(cbonus(s, catalog as unknown as Catalog, 8).CbonusSkillPoints) / 100)
  return { cut, sp, shrine: (0.6 * n(arr(s, 'ShrineLevels')[6])) / 100 }
}

/** Levels gained from `gain` more Summoning EXP, running the level-up rule as the game does. */
export function levelUps(s: Save, gain: number) {
  const { cut, shrine } = rules(s)
  let lv = n(s.summonLVL), exp = n(s.SummonEXP) + gain, req = n(s.summonREQ), levels = 0
  while (req > 0 && exp >= req * (1 - cut) && levels < 1e4) {
    exp -= req * (1 - cut)
    req = nextSummonReq(req, ++lv)
    exp += shrine * req
    levels++
  }
  return { levels, lv, exp, req }
}

/** The skill now. Rates come from rifts() (each rift's glyph cycles roll SummonExpGiven; see rift.ts). Pass withRift(save). */
export function summoning(s: Save) {
  const r = rules(s), rows = rifts(s), lv = n(s.summonLVL), exp = n(s.SummonEXP), req = n(s.summonREQ)
  const threshold = req * (1 - r.cut), away = rows.reduce((t, x) => t + x.summonAway, 0), screen = rows.reduce((t, x) => t + x.summonScreen, 0)
  const day = levelUps(s, 86400 * away)
  return {
    ...r, lv, exp, req, threshold, away, screen, toNextAway: Math.max(0, threshold - exp) / away, levelsPerDay: day.levels,
    skillPointsPerDay: day.levels * r.sp,
    rifts: rows.map((x) => ({ r: x.r, perCycle: n(arr(s, 'SummonExpGiven')[x.r]), away: x.summonAway, screen: x.summonScreen, share: away ? x.summonAway / away : 0 })),
  }
}

export type SummonBuy = Buy & { levelsPerDay: number; spPerDay: number; spScore: number }
/** Rift upgrades ranked by what Summoning gives the player: skill points per day of away credit, per share of soul stock
 *  spent (Σ cost ÷ souls of that colour held, as on the Rift page). Extra levels/day = 86400 · extra Summoning EXP per away
 *  second ÷ today's level threshold (near-term: the requirement grows 30%+ per level). Unlike rift bonuses, skill points
 *  compare across rifts, so this is one list, best first. */
export function summonBuys(s: Save): SummonBuy[] {
  const { sp } = rules(s), threshold = n(s.summonREQ) * (1 - rules(s).cut)
  return buys(s).map((b) => {
    const levelsPerDay = (86400 * b.summon) / threshold
    return { ...b, levelsPerDay, spPerDay: levelsPerDay * sp, spScore: (levelsPerDay * sp) / b.share }
  }).sort((a, b) => b.spScore - a.spScore)
}

/** Summoning the next rift (button SelectedUpgrade 500, † @13668914): needs RiftsOwned < 9, summonLVL ≥ waterLVreq (a value
 *  this branch shares with the acolyte buy, which sets it to 11·AcolytesOwned — its meaning for rifts is unverified), and two
 *  soul costs by rifts owned († @21666915): [currency, amount] pairs, currency index into SoulsTotal (see rift.ts SOULS). */
export const UNLOCK: Record<number, [number, number][]> = {
  1: [[1, 10]], 2: [[2, 20], [1, 300]], 3: [[3, 25], [2, 400]], 4: [[5, 3], [3, 400]], 5: [[6, 5], [4, 500]],
  6: [[6, 20], [5, 200]], 7: [[7, 5], [6, 80]], 8: [[7, 15], [1, 7e8]],
}
export function nextRift(s: Save) {
  const owned = n(s.RiftsOwned)
  if (owned >= 9) return null
  const cost = UNLOCK[owned] ?? []
  return { rift: owned + 1, cost, affordable: cost.every(([c, q]) => n(arr(s, 'SoulsTotal')[c]) >= q) }
}
