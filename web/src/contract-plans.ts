// Contracts tab: a plan per open contract (the "Plan" dialog in Contracts.vue). Each plan says what to do, where, an ETA when
// an existing module models the rate (marked ESTIMATE), and the fail condition (contracts.ts `fails`). Offsets are bytes in
// data/game/asar/distBuild/static/game/Qno2x.js; "board draw" = ActorEvents_938, which recomputes ContractProgress[i] for the
// selected board, so the save's stored progress can lag: where the source is known, the plan recomputes it from the save.
import { DEPRIVED_SKILL, ROD_FISH, type ContractRow } from './modules/contracts/contracts'
import { buildCards, type Catalog } from './modules/cards/cards-calc'
import catalog from './data/card-catalog.json'
import { estimate, fightStats, monsterName, ZONES } from './modules/fighting/fighting'
import { bill, maxCrafts, name as gearName, owned as gearOwned } from './modules/tinkering/tinkering'
import { CRUSADES, materialName, shownExpPerDay, withCrusade } from './modules/crusade/crusade'
import { summoning } from './modules/summoning/summoning'
import { ARENAS, rates as trainingRates } from './modules/training/training'
import { mining, smithingAwayPerSec } from './modules/gathering/gathering'
import { ACTIVE_CATCH_SECONDS, awayFishing, fishing } from './modules/gathering/fishing'
import { spiritRates } from './modules/spiriting/spiriting'
import { farmers } from './modules/tilling/tilling'
import { expRates as apothecaryRates } from './modules/potions/apothecary-exp'
import { awayPercent } from './away'
import { SKULLS } from './bestiary'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
export const num = (v: number) => (!Number.isFinite(v) ? '∞' : Math.abs(v) >= 1e6 ? v.toExponential(2) : Math.abs(v) < 0.1 && v ? String(+v.toPrecision(2)) : String(+v.toFixed(1)))
export const dur = (h: number) => (!Number.isFinite(h) ? 'never at this rate' : h < 1 ? `${Math.ceil(h * 60)} min` : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`)

/** A plan: either one line shown in the row (inline), or rows for the steps dialog: [Do, Where, Numbers / ETA]. */
export type Plan = { inline: string } | { title: string; rows: string[][] }
export const COLS = ['Do', 'Where', 'Numbers / ETA']

// ---- Per-rank sources, as the board draw reads them (code order = rank F..SSSS+). ----
/** 1 Monster Madness: ContractProgress[1] = MapleMonster[k] (@16079565 … @16116096). */
const MADNESS = [9, 112, 126, 207, 226, 242, 321, 339, 421, 441]
/** 25 Banishing Behemoths: MapleMonster[a] + [a+1] + [a+2] at ranks 0-8 (@16626037 … @16663029); rank 9 [915] only (@16667103). */
const BANISH = [503, 524, 609, 648, 709, 748, 809, 833, 854, 915]
/** 30 You Call That a Knife: ContractProgress[30] = EquipmentOwned[id] (@16793013 … @16806938). */
const KNIFE = [17, 32, 3, 43, 57, 24, 49, 40, 30, 55]
/** 29 Skull Duggeridoo: Contracts screen (SceneEvents_30 @22747522) counts MapleMonster[0..2999] above this, per rank
 *  (@22747613 … @22754887): Bronze, Bronze, Silver, Silver, Gold, Diamond, Bronze, Silver, Gold, Diamond. */
const SKULL_MIN = [99999.9, 99999.9, 999999.9, 999999.9, 9999999.9, 99999999.9, 99999.9, 999999.9, 9999999.9, 99999999.9]
/** Other count sources read by the board draw, for the generic plans: [save key, index per rank]. */
const SOURCE: Record<number, [string, number[]]> = {
  8: ['SmithingItemLevel', [3, 14, 24, 29, 32, 33, 46, 52, 58, 64]], // @16258947 …
  9: ['RaidKillCount', [1, 4, 2, 7, 5, 10, 3, 8, 6, 12]], // @16283141 …
  12: ['SoulsTotal', [1, 2, 3, 4, 5, 6, 7, 7, 7, 7]], // @16339978 …
  26: ['ConquestDifficultyLV', [3, 5, 6, 7, 8, 9, 10, 11, 12, 13]], // @16689998 …
}
/** Contracts that are one action (reach / catch / defeat): their order is the "Plan, step by step" section above. */
const BINARY = new Set([13, 14, 17, 19, 20, 21, 22, 23, 24, 28, 31, 32, 33, 34])
const STEP_BY_STEP = new Set([14, 17, 19, 20, 21, 22, 23, 24, 31, 32, 33, 34])

/** Zone and stage of a MapleMonster index: L + base(m), base = 100·(m − 1) for zones 1-5, 100·(m − 6) for 11-15
 *  (fighting.ts base; Oblivion runs past 100 from 900). */
export function monsterAt(k: number) {
  const m = k >= 900 ? 15 : k >= 500 ? Math.floor(k / 100) + 6 : Math.floor(k / 100) + 1
  const L = k - (m > 10 ? 100 * (m - 6) : 100 * (m - 1))
  return { m, L, name: monsterName(m, L), where: `${ZONES.find((z) => z.m === m)!.name} stage ${L + 1}` }
}
/** ESTIMATE kills per hour at a monster, from fighting.ts estimate() (the game's AFK formula with your Fighting deck). */
function killsPerHour(s: Save, k: number): number | null {
  const f = fightStats(s)
  if ('missing' in f) return null
  const { m, L } = monsterAt(k), e = estimate(f, m, L)
  return e.canFight ? 60 * e.killsPerMin : 0
}
const kphText = (kph: number | null, left: number) =>
  kph == null ? 'no rate: the save lacks a fight-scene input' : kph <= 0 ? 'you cannot farm it yet (fight model: no AFK kills)' : `ESTIMATE ${num(kph)} kills/h → ${dur(left / kph)}`
const KILLS_RESET = 'Kills reset on Ascend and Rebirth (MapleMonster = 0 @20947199, @21016685): turn it in before you Ascend.'

// ---- Contract 2: Skill Training -------------------------------------------------------------------------------------
/** The skills whose level-ups add 1 to ContractProgress[2]: [name, level, EXP, REQ, increment sites]. Rift, Construction,
 *  Spelunking, Botany and pet levels have no increment site. Start level after an Ascend: resets.md §2 (GiftShopLevels slot). */
export const SKILL_TRAINING: { skill: string; lv: string; exp: string; req: string; at: number[]; gift?: number }[] = [
  { skill: 'Attack', lv: 'atkLVL', exp: 'atkEXP', req: 'atkREQ', at: [19373520, 22722303], gift: 1 },
  { skill: 'Strength', lv: 'strLVL', exp: 'strEXP', req: 'strREQ', at: [19368852, 26377074], gift: 3 },
  { skill: 'Endurance', lv: 'endLVL', exp: 'endEXP', req: 'endREQ', at: [19363640, 19837049], gift: 5 },
  { skill: 'Mining', lv: 'miningLVL', exp: 'miningEXP', req: 'miningREQ', at: [30334195], gift: 7 },
  { skill: 'Smithing', lv: 'smithingLVL', exp: 'smithingEXP', req: 'smithingREQ', at: [30926890], gift: 9 },
  { skill: 'Fishing', lv: 'fishingLVL', exp: 'fishingEXP', req: 'fishingREQ', at: [31578920], gift: 11 },
  { skill: 'Spiriting', lv: 'spiritLVL', exp: 'spiritEXP', req: 'SpiritREQ', at: [21306220, 22807349], gift: 19 },
  { skill: 'Summoning', lv: 'summonLVL', exp: 'SummonEXP', req: 'summonREQ', at: [21527730], gift: 21 },
  { skill: 'Tilling', lv: 'FarmingLV', exp: 'farmingEXP', req: 'farmingREQ', at: [23534293] },
  { skill: 'Apothecary', lv: 'ApothecaryLV', exp: 'ApothecaryEXP', req: 'ApothecaryREQ', at: [24936544] },
  { skill: 'Crusade (Conquest level)', lv: 'ConquestLV', exp: 'ConquestEXP', req: 'ConquestREQ', at: [23021790, 23408525, 24165344] },
  { skill: 'Crusade combat level', lv: 'CombatLV', exp: 'CombatEXP', req: 'CombatREQ', at: [23032460, 24175889] },
  { skill: 'Tinkering', lv: 'TinkeringLV', exp: 'TinkeringEXP', req: 'TinkeringREQ', at: [23030548, 24173977] },
  { skill: 'Trekking', lv: 'TrekkingLV', exp: 'TrekkingEXP', req: 'TrekkingREQ', at: [27296498] },
  { skill: 'Hatchery', lv: 'HatcheryLV', exp: 'HatcheryEXP', req: 'HatcheryREQ', at: [27688078] },
  { skill: 'Lab research', lv: 'ResearchLV', exp: 'ResearchEXP', req: 'ResearchREQ', at: [29045999] },
]

/** EXP per real second each modelled skill earns, best of on-screen and away (away = per away second × away %), from the
 *  module that models it; null = no rate modelled. Summoning returns levels/h directly (summoning.ts simulates a day). */
function skillRate(s: Save, skill: string, away: number): { expPerSec?: number; levelsPerHour?: number; how: string } | null {
  const best = (a: number | null | undefined, b: number | null | undefined) => Math.max(n(a), n(b))
  const arena = ARENAS.find((a) => a.skill === skill)
  if (arena) { const r = trainingRates(s, arena); return { expPerSec: r.best, how: `training.ts rates (${r.mode})` } }
  if (skill === 'Mining') { const r = mining(s, away); return { expPerSec: best(r.activeXp, r.awayXp), how: 'gathering.ts mining' } }
  if (skill === 'Smithing') return { expPerSec: smithingAwayPerSec(s, away), how: 'gathering.ts smithingAwayPerSec (away; active crafts are clicks)' }
  if (skill === 'Fishing') return { expPerSec: awayFishing(s, away).perAwaySecond, how: 'fishing.ts awayFishing (away)' }
  if (skill === 'Spiriting') return { expPerSec: spiritRates(s).screen, how: 'spiriting.ts spiritRates (on screen)' }
  if (skill === 'Summoning') return { levelsPerHour: summoning(s).levelsPerDay / 24, how: 'summoning.ts levelsPerDay (away)' }
  if (skill === 'Tilling') { const f = farmers(s, away); return { expPerSec: best(f.reduce((t, x) => t + x.xpPerHarvest * x.harvestsPerSec, 0), f.reduce((t, x) => t + x.awayXpPerSec, 0)), how: 'tilling.ts farmers' } }
  if (skill === 'Apothecary') { const r = apothecaryRates(s, away); return { expPerSec: best(r.active, r.away), how: 'apothecary-exp.ts expRates' } }
  if (skill.startsWith('Crusade (') && CRUSADES[n(s.ConquestSelected)]) return { expPerSec: shownExpPerDay(withCrusade(s)) / 86400, how: 'crusade.ts shownExpPerDay (idle crusaders)' }
  return null
}

export type SkillLine = { skill: string; lv: string; level: number; levelsPerHour: number | null; how: string; start: number | null; at: number[] }
/** Each counting skill: level now, ESTIMATE levels/h at today's requirement (3600·EXP/s ÷ REQ: the next level's rate; REQ
 *  grows every level, so it overstates a long run), and the level an Ascend restarts it at (null: Ascend keeps it). */
export function skillTraining(s: Save): SkillLine[] {
  const away = awayPercent(s) ?? 0
  // Start level after Ascend (resets.md §2): 1 + GiftShopLevels[g] + min(max(100·(MasteryBonuses[16] − 1), 0), 20)
  // + ContractRank[44] + AscentionLevel[24] + (TankBonusLIST[46] − 1).
  const common = 1 + Math.min(Math.max(100 * (n(arr(s, 'MasteryBonuses')[16]) - 1), 0), 20) + n(arr(s, 'ContractRank')[44])
    + n(arr(s, 'AscentionLevel')[24]) + (n(arr(s, 'TankBonusLIST')[46]) - 1)
  return SKILL_TRAINING.map((k) => {
    const r = skillRate(s, k.skill, away), req = n(s[k.req])
    const lph = !r ? null : r.levelsPerHour ?? (req > 0 ? (3600 * n(r.expPerSec)) / req : null)
    return { skill: k.skill, lv: k.lv, level: n(s[k.lv]), levelsPerHour: lph, how: r?.how ?? 'no rate modelled', at: k.at,
      start: k.gift == null ? null : Math.floor(common + n(arr(s, 'GiftShopLevels')[k.gift])) }
  })
}

function skillPlan(s: Save, left: number): string[][] {
  const lines = skillTraining(s), rated = lines.filter((x) => x.levelsPerHour != null).sort((a, b) => b.levelsPerHour! - a.levelsPerHour!)
  const regain = lines.filter((x) => x.start != null).reduce((t, x) => t + Math.max(x.level - x.start!, 0), 0)
  const total = rated.reduce((t, x) => t + x.levelsPerHour!, 0)
  return [
    ['Ascend, then level the 8 reset skills back up', 'Ascend; Training, Mining, Smithing, Fishing, Limbo',
      `Ascend restarts Attack/Strength/Endurance/Mining/Smithing/Fishing/Spiriting/Summoning at their start level (resets.md §2) and keeps ContractProgress[2] (not in the Ascend reset @20903937). Back to today's levels = ${num(regain)} level-ups (ESTIMATE, ${num(left)} still needed${regain ? `, ≈ ${Math.ceil(left / regain)} Ascend${Math.ceil(left / regain) === 1 ? '' : 's'}` : ''}).`],
    ...rated.map((x) => [`Level ${x.skill}`, x.lv, `level ${num(x.level)}; ESTIMATE ${num(x.levelsPerHour!)} levels/h at today's REQ (${x.how})`]),
    ...lines.filter((x) => x.levelsPerHour == null).map((x) => [`Level ${x.skill}`, x.lv, `level ${num(x.level)}; no rate modelled`]),
    ['Without an Ascend', 'all modelled skills at once', total > 0 ? `ESTIMATE ${num(total)} levels/h → ${dur(left / total)} (optimistic: REQ grows each level)` : 'no modelled rate above 0'],
  ]
}

// ---- Contract 19: Fastest Rod in the West ------------------------------------------------------------------------------
/** Seconds left to fish inside the 5:00 after Credits Skip, tree nodes, hook clicks, and walking to the Contracts screen.
 *  Default only: the Contracts page lets the author set it from his own Ascend (setup time is not in the save). */
export const ROD_FISHING_SECONDS = 210
/** ESTIMATE odds of catching the rank's fish in the window after the next Ascend. Ascend resets hook/rod to 1, rod max to 1
 *  (rods are smithing items, wiped), smithingFishingPower to 0, Fishing to its start level, wait to 10-15 s (docs/resets.md).
 *  Hook goes to min(6, ⌊Lv/10⌋+1) for free. After one power-upgrade click the wait is the game's formula with power 0
 *  (@10614975): min = (0.1 + 9.75/2^FunnyHat) + 0.1, max = 4·min; FunnyHatPurchased survives Ascend (not in either reset block). */
export function fastestRod(s: Save, rank: number, seconds = ROD_FISHING_SECONDS) {
  const fish = ROD_FISH[rank]!, lv = skillTraining(s).find((x) => x.skill === 'Fishing')!.start!, hook = Math.min(6, Math.floor(lv / 10) + 1)
  const f = fishing({ ...s, fishingLVL: lv, smithingFishingPower: 0 }, hook, 1)
  const tier = Object.values(f.tiers).find((t) => fish >= t.fish[0] && fish <= t.fish[1])
  const perCatch = tier ? tier.p / (tier.fish[1] - tier.fish[0] + 1) : 0
  const min = 0.1 + 9.75 / 2 ** n(s.FunnyHatPurchased) + 0.1
  // ACTIVE_CATCH_SECONDS was measured at a ~0.15 s wait + 0.8 s; the rest is the reel animation.
  const catchSec = 2.5 * min + 0.8 + (ACTIVE_CATCH_SECONDS - 0.95), catches = Math.floor(seconds / catchSec)
  return { seconds, fish, lv, hook, perCatch, catchSec, catches, odds: 1 - (1 - perCatch) ** catches, large: f.tiers.large.p }
}
function rodPlan(r: ContractRow, s: Save, seconds?: number): Plan {
  const x = fastestRod(s, r.rank, seconds), pc = (v: number) => `${+(100 * v).toFixed(v < 0.1 ? 1 : 0)}%`
  return { title: `19 ${r.name} (${r.rankName}): fish ${x.fish}${r.status === 'failed' ? '; failed, retry after the next Ascend' : ''}`, rows: [
    ['Skip the Credits, buy the Fishing tree nodes', 'Credits, skill tree 3', 'Unlock the Endurance Fields, then Unlock Fishing. The 5:00 runs from the Ascend.'],
    [`Click the hook to ${x.hook}`, 'Fishing', `free; Fishing starts at Lv ${x.lv} after an Ascend (needs Lv ≥ 10× hook). Rod stays 1: rods are smithing crafts, wiped by the Ascend.`],
    ['Buy one Fishing power upgrade', 'Fishing, 250 gold', `makes the game recompute the odds and the bite wait (10-15 s → ~${num(x.catchSec - ACTIVE_CATCH_SECONDS + 0.95)} s); hook clicks alone don't (@10614975).`],
    ['Stay on Fishing', 'Fishing', `ESTIMATE ${pc(x.perCatch)} per catch (large ${pc(x.large)}, uniform over its fish) × ~${x.catches} catches in ${x.seconds} s (~${num(x.catchSec)} s each) → ${pc(x.odds)} this Ascend.`],
    ['Turn it in before 5:00', `Contracts (${r.board} board)`, 'Past 300 s any scene load fails it even when caught (Multibuy @18618755).'],
  ] }
}

// ---- Contract 18: Card Collector ----------------------------------------------------------------------------------------
/** ContractProgress[18] = Σ CardLevels[0..399] ≥ 0 (board draw @16454864). */
export const cardTotal = (s: Save) => arr(s, 'CardLevels').slice(0, 400).reduce((t, v) => t + (n(v) >= 0 ? n(v) : 0), 0)
function cardPlan(s: Save, left: number): string[][] {
  const cat = catalog as unknown as Catalog, b = buildCards(s, cat), rates = cat.swapRates, ex = arr(s, 'CardsOwnedbyTypeEXCESS')
  // Tier-1 equivalents per tier (swaps only go up, n of tier t → 1 of t+1; Cards.vue tierValue): 1, 5, 20, 60, 120.
  const tv = [0, 1]; for (let t = 2; t <= 5; t++) tv[t] = tv[t - 1]! * (rates[t - 1] ?? 1)
  const ups = b.cards.filter((c) => c.id < 400 && c.level >= 1 && c.level < c.maxLevel)
    .map((c) => ({ c, cost: cat.upgradeCost[c.level] ?? [] })).map((x) => ({ ...x, t1: x.cost.reduce((t, q, k) => t + q * (tv[k] ?? 0), 0) }))
    .sort((a, b) => a.t1 - b.t1).slice(0, Math.max(left, 0))
  // Affordability of the running total, tiers low to high with swapped-up surplus (Cards.vue affordable()).
  const need = [0, 0, 0, 0, 0, 0]
  const ok = () => { let carry = 0; for (let t = 1; t <= 5; t++) { const have = n(ex[t]) + carry; if (have < need[t]!) return false; carry = t < 5 ? Math.floor((have - need[t]!) / (rates[t] || Infinity)) : 0 } return true }
  const rows = ups.map(({ c, cost, t1 }) => {
    cost.forEach((q, t) => (need[t]! += q))
    return [`Level up ${c.name} (Lv ${c.level} → ${c.level + 1})`, `Cards (${c.zone ?? 'no zone'})`,
      `${cost.slice(1).map((q, t) => (q ? `${q}×T${t + 1}` : '')).filter(Boolean).join(' ')} (${num(t1)} T1-equiv.)${ok() ? '' : '; not affordable from your spare dupes yet'}`]
  })
  if (ups.length < left) rows.push(['Find new cards', 'Cards page: missing cards', `${left - ups.length} more levels than the owned cards can take; each new card adds its level (Cards page ranks the drops).`])
  rows.push(['Spare dupes now', 'CardsOwnedbyTypeEXCESS', [1, 2, 3, 4, 5].map((t) => `T${t} ${num(n(ex[t]))}`).join(', ')])
  return rows
}

// ---- Generic count contracts --------------------------------------------------------------------------------------------
function progressOf(r: ContractRow, s: Save): number {
  if (r.i === 18) return cardTotal(s)
  if (r.i === 29) return arr(s, 'MapleMonster').slice(0, 3000).filter((v) => n(v) > SKULL_MIN[r.rank]!).length
  if (r.i === 30) return gearOwned(s, KNIFE[r.rank]!)
  if (r.i === 35) return n(s.Skillpoints) // @16917372
  return r.progress
}

/** The plan for one contract, or null when there is none to give (complete). */
export function contractPlan(r: ContractRow, s: Save, rodSeconds?: number): Plan | null {
  if (r.status === 'complete') return null
  if (r.i === 19) return rodPlan(r, s, rodSeconds) // failed outside its 5:00 almost always; the plan is for the next Ascend
  if (r.status === 'failed') return { inline: `Failed: ${r.retry} to retry; no plan until then.` }
  if (BINARY.has(r.i)) {
    const extra = r.i === 21 ? ` Don't level ${DEPRIVED_SKILL[r.rank]}.` : ''
    return { inline: STEP_BY_STEP.has(r.i) ? `${r.asks}.${extra} Its order and holds are in "Plan, step by step" above.` : `One action: ${r.asks.toLowerCase()}.` }
  }
  const req = r.required, have = progressOf(r, s)
  if (req == null) return { inline: 'No requirement in the save for this rank yet (open its board in game).' }
  if (have >= req) return { inline: `Done (${num(have)} / ${num(req)}): open the ${r.board} board and turn it in.${r.i === 29 ? ' Progress is recounted when the Contracts screen opens.' : ''}` }
  const left = req - have, title = `${r.i} ${r.name}: ${num(have)} / ${num(req)} (${num(left)} to go)`
  const rows: string[][] = []
  if (r.i === 1 || r.i === 25) {
    const ks = r.i === 1 ? [MADNESS[r.rank]!] : r.rank === 9 ? [915] : [0, 1, 2].map((d) => BANISH[r.rank]! + d)
    for (const k of ks) { const a = monsterAt(k); rows.push([`Kill ${a.name}`, a.where, `${num(n(arr(s, 'MapleMonster')[k]))} killed; ${kphText(killsPerHour(s, k), left)}`]) }
    if (r.i === 25 && ks.length > 1) rows.push(['Any of the three stages counts', 'sum of the three', 'Pick the stage with the best rate above.'])
    rows.push(['Keep the kills', 'before Ascend', KILLS_RESET])
  } else if (r.i === 29) {
    const min = SKULL_MIN[r.rank]!, skull = SKULLS.find((x) => Math.abs(x.min - min) < 1)?.name ?? `${num(min)}+ kills`
    const near = arr(s, 'MapleMonster').slice(0, 3000).map((v, k) => ({ k, v: n(v) })).filter((x) => x.v > 0 && x.v <= min)
      .sort((a, b) => b.v - a.v).slice(0, Math.ceil(left))
    for (const x of near) { const a = monsterAt(x.k); rows.push([`Get ${a.name} to ${skull}`, a.where, `${num(x.v)} / ${num(Math.ceil(min))}; ${kphText(killsPerHour(s, x.k), min - x.v)}`]) }
    if (near.length < left) rows.push(['Kill new monsters', 'further zones', `${Math.ceil(left - near.length)} more monsters than you have started.`])
    rows.push(['Turn in', 'Contracts screen', 'The count is taken when the Contracts screen opens (SceneEvents_30 @22747522). ' + KILLS_RESET])
  } else if (r.i === 2) rows.push(...skillPlan(s, left))
  else if (r.i === 18) rows.push(...cardPlan(s, left))
  else if (r.i === 30) {
    const id = KNIFE[r.rank]!, k = Math.ceil(left), b = bill(s, id, k), mat = arr(s, 'CraftingMaterialsOwned')
    rows.push([`Craft ${num(k)} ${gearName(id)}`, 'Crusades → Tinkering page', `you own ${num(have)}; affordable now: ${num(maxCrafts(s, id))} crafts${b.ok ? '' : '; a lower-tier recipe in the chain is still locked'}`])
    for (const [m, q] of b.mats) rows.push([`Materials: ${materialName(m)}`, 'crusade drops', `${num(q)} needed, you hold ${num(n(mat[m]))}${q > n(mat[m]) ? ' (short)' : ''}`])
    for (const [g, q] of b.made) rows.push([`First craft ${num(q)} ${gearName(g)}`, 'Tinkering (previous tier)', 'copies the recipe uses up (one copy always stays)'])
    rows.push(['Rate', '—', 'Crafting is manual; material income is not modelled here.'])
  } else if (r.i === 35) {
    const sp = summoning(s).skillPointsPerDay
    rows.push(['Save perk points: buy no perk-tree nodes', 'Skill trees', `${num(have)} held now (ContractProgress[35] = Skillpoints @16917372)`],
      ['Level Summoning (0.5+ perk points per level)', 'Limbo → Summoning', sp > 0 ? `ESTIMATE ${num(sp / 24)} points/h → ${dur(left / (sp / 24))} (summoning.ts, away)` : 'summoning.ts: 0 levels/day at today\'s rate'],
      ['Other sources', 'Spiriting, Construction, Realm', 'not modelled as a rate'],
      ['Keep them past the turn-in', 'before Ascend', 'Ascend zeroes Skillpoints (skilltree.ts, docs/resets.md).'])
  } else {
    const src = SOURCE[r.i]
    rows.push([r.asks, src ? `${src[0]}[${src[1][r.rank]}]` : '—', 'no rate modelled'])
  }
  if (r.fails) rows.push(['Avoid (fails it)', '—', r.fails])
  return { title, rows }
}
