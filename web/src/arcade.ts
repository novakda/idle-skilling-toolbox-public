// Arcade (Pachinko) page logic: ball income, tasks, golden-ball shop. Game code is the source (†); values only the wiki gives are marked wiki.
// Save keys: PachinkoBallsOwned (balls in hand), PachinkoBallRegainTimer (seconds banked, capped 28800 = 8h), PachinkoBallRechargeTime
// (seconds per ball); a collect pays floor(min(timer,28800)/recharge) balls (@21186300-@21189400). TasksComplete[1..45] are 0/1 flags:
// set 1 = 1-15, set 2 = 16-30 (29-30 unused), set 3 = 31-45 (40-45 unused); names @14780178, flags re-derived from live state at load @21154200.
// EventCurrency = golden balls (shop currency); EventUpgradeLevels/EventUpgradeCOST/EVENTpurchasesMAX [1..6] = the six permanent upgrades,
// [7],[8] = Fall event (HolidayON); PachiTixCollected = balls launched, lifetime (+1 per launch @14929437).
import { ascendGain } from './load-bonuses'
type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : [])

export const REGAIN_CAP = 28800 // @21186300 Math.min(PachinkoBallRegainTimer,28800)
export const BASE_RECHARGE = 2700 // @21156400 PachinkoBallRechargeTime = 2700/(1+aa4/100)
// Per-task ball-rate bonus %, by set (@21154200: 1.8, 2.7, 4.5; the wiki still says 2/3/5).
export const SET_BONUS = [1.8, 2.7, 4.5]

/** [task index in TasksComplete, set (0-2), game task name @14780178, wiki requirement (wiki)] */
export const TASKS: [number, number, string, string][] = [
  [1, 0, 'Reach the Mountains', 'zone 3'], [2, 0, 'Reach the Mist', 'zone 4'], [3, 0, 'Reach the Dungeon', 'zone 5'],
  [4, 0, 'Mine some Refractium', 'Mining lvl 45'], [5, 0, 'Mine some Godshard', 'Mining lvl 75'], [6, 0, 'Achieve level 99 Attack', ''],
  [7, 0, 'Kill 10m Bandit Bobs', '2-13 Bandit Bob'], [8, 0, 'Defeat Chaotic Sentinel', 'raids: 3rd boss, 2nd difficulty'],
  [9, 0, 'Defeat Nightmare Demon', 'raids: 4th boss, 3rd difficulty'], [10, 0, 'Employ 6 Noble Tillers', 'unlock with Purple Land'],
  [11, 0, 'Harvest some Candypops', 'Botany plant 12'], [12, 0, 'Brew a Purple potion', ''], [13, 0, 'Defeat the Basilisk', 'Crusades lvl 70'],
  [14, 0, 'Have 150 Crusaders', ''], [15, 0, 'Get 5 SSSS++ Contracts', ''],
  [16, 1, 'Kill 99m Chaotic Bob 3', '2-9, zone 6'], [17, 1, 'Get a Shrine to lvl 16', 'Asylum shrines'], [18, 1, 'Craft a cyber food', 'Warped Smithing'],
  [19, 1, 'Defeat Occulon X', 'Asylum'], [20, 1, 'Survive Emigdala Y', 'do not kill it, wait out the timer'], [21, 1, 'Level Rift Rift to 30', 'Summoning'],
  [22, 1, 'Achieve lvl 140 H2O', ''], [23, 1, 'Defeat Gheist', 'Crusades lvl 60'], [24, 1, 'Set 6 Tillers to crop 20', 'crop 20 is Sammatian'],
  [25, 1, 'Find the Civilization', 'see Secrets'], [26, 1, 'Get a Hoops score of 20', 'see Secrets'], [27, 1, 'Reach the Beach', 'Trekking zone 3'],
  [28, 1, 'Hatch a purple egg', ''],
  [31, 2, 'Unlock all 16 Tperks', ''], [32, 2, 'Overgrow Sunburst to 25', ''], [33, 2, 'Defeat a Bell 11 boss', 'ring bells in Nightmare fights'],
  [34, 2, 'Achieve lvl 999 Strength', ''], [35, 2, 'Equip a Crystal Skull', 'Tinkering lvl 99'], [36, 2, 'Get 30 SSSS++ Contracts', ''],
  [37, 2, 'Free Bob', "'Our Best Friend' purple Research tank to 540 and unlock the Bob Perfume Godly potion"], [38, 2, 'Reach the Aberrant', 'Trekking zone 8'],
  [39, 2, 'Breed the Almighty', 'Almight (pet 45), last in the breedable line'],
]

/** The ball-rate bonus % and what it is made of (@21154900-@21156601), checked against PachinkoBallRechargeTime. */
export function ballRate(save: Save) {
  const flags = arr(save.TasksComplete).map(n)
  const tasks = [0, 1, 2].map((s) => TASKS.filter((t) => t[1] === s && flags[t[0]]).length)
  const taskPct = tasks.reduce((a, c, s) => a + c * SET_BONUS[s]!, 0)
  const cardPct = Math.min(n(save.CbonusPachiBalls), 100)
  const tank = n(arr(save.TankBonusLIST)[53]) // Research tank 53 (game's TankBonusLIST[53])
  const tankPct = Math.min(Math.pow(80 * Math.max(tank - 1, 0), 0.8), 160)
  const pct = taskPct + cardPct + tankPct
  return { tasks, taskPct, cardPct, tankPct, pct, secsPerBall: BASE_RECHARGE / (1 + pct / 100) }
}

export type ArcadeUpgrade = { idx: number; name: string; per: string; level: number; max: number; cost: number; maxed: boolean; gain?: number; canBuy: number; at: string }
const UPS: [number, string, string, number, number][] = [ // idx, name, per level, start cost, default max
  [1, 'Damage', '+3% damage', 3, 1000], [2, 'Kills', '+0.5% kills per kill', 10, 300], [3, 'Cash', '+5% cash', 2, 800],
  [4, 'Ascend', '+5% AP', 5, 500], [5, 'Crops', '+4% Tilling crops', 4, 200], [6, 'Rebirth', '+2 base BP', 8, 600],
]
/** Cost added after reaching level L (buy handler @14931373-@14935005: levels go up first, then cost += step(new level)). */
export const costStep = (idx: number, L: number) => [0, 1 + Math.floor(L / 20), 1 + Math.floor(L / 3), 1 + Math.floor(L / 35), 1 + Math.floor(L / 7), 1 + L / 18, 1 + Math.floor(L / 3)][idx]!
/** Relative gain of the next level on the multiplier it sits in. Each term is (1 + k·L/100): Damage ×(1+3L/100) @2644383, Cash ×(1+5L/100)
 *  @3961564, Ascend ×(1+5L/100) @11296816, Crops ×(1+4L/100) @23478303, Kills (1+(10·AscLv65+0.5L)/100) @31694335; Rebirth is +2 on base BP: BPreward[6] = smithing + min(card BP, 250) + 2L
 *  (@10716268), and base BP is the summed BPreward (ascendGain, load-bonuses.ts), so a level adds 2 / base BP. */
function gainOf(idx: number, L: number, asc65: number, bpBase: number) {
  if (idx === 6) return bpBase > 0 ? 2 / bpBase : undefined
  const k = [0, 3, 0.5, 5, 5, 4][idx]
  if (!k) return undefined
  return k / (100 + (idx === 2 ? 10 * asc65 + 0.5 * L : k * L))
}

export function arcade(save: Save) {
  const rate = ballRate(save)
  const recharge = n(save.PachinkoBallRechargeTime) || rate.secsPerBall
  const banked = Math.min(n(save.PachinkoBallRegainTimer), REGAIN_CAP)
  const flags = arr(save.TasksComplete).map(n)
  const gold = n(save.EventCurrency)
  const lv = arr(save.EventUpgradeLevels).map(n), cost = arr(save.EventUpgradeCOST).map(n), mx = arr(save.EVENTpurchasesMAX).map(n)
  const asc65 = n(arr(save.AscentionLevel)[65])
  const bpBase = ascendGain(save).bpBase
  const upgrades: ArcadeUpgrade[] = UPS.map(([idx, name, per, , dmax]) => {
    const level = lv[idx] ?? 0, max = mx[idx] || dmax, c = cost[idx] ?? 0
    let left = gold, k = 0, cc = c, L = level
    while (L < max && cc <= left) { left -= cc; L++; k++; cc += costStep(idx, L) }
    const gain = level < max ? gainOf(idx, level, asc65, bpBase) : undefined
    return { idx, name, per, level, max, cost: c, maxed: level >= max, gain, canBuy: k, at: gain === undefined ? '' : `${(100 * gain).toFixed(3)}%` }
  })
  return {
    balls: n(save.PachinkoBallsOwned), pending: Math.floor(banked / Math.max(recharge, 1)), banked, recharge, full: banked >= REGAIN_CAP,
    secsToNext: banked >= REGAIN_CAP ? 0 : Math.ceil(banked / Math.max(recharge, 1)) * recharge - banked, // the game's NEXT timer @21187679
    launched: n(save.PachiTixCollected), gold, rate, event: !!save.HolidayON,
    tasks: TASKS.map(([i, set, name, req]) => ({ i, set: set + 1, name, req, done: !!flags[i] })), upgrades,
  }
}

/** Open upgrades by relative gain per golden ball, best first (Rebirth's gain is 2 / your base BP per rebirth). */
export const arcadeRank = (a: { upgrades: ArcadeUpgrade[] }) =>
  a.upgrades.filter((u) => u.gain !== undefined && !u.maxed).sort((x, y) => y.gain! / y.cost - x.gain! / x.cost)

/** Portal tiers (wiki): golden balls per landing, and the reward table. Each tier's last row hands the ball on to the next portal. */
export const PORTALS: { name: string; gold: string; rows: string }[] = [
  { name: 'Lame', gold: '1', rows: '29% 50 monster cash, 26% 8 kills, 10% grey card, 1% raid ticket, 34% to Bronze' },
  { name: 'Bronze', gold: '3', rows: '26% 17 kills, 24.5% green card, 13% 2 gems, 8% 2 grey cards, 1% raid ticket, 0.5% 2h candy, 30.5% to Silver' },
  { name: 'Silver', gold: '5', rows: '18% 3 grey cards, 15% blue card, 16.5% 8 balls, 14.5% 5 gems, 2% crusade misc item, 0.5% 4h candy, 33.5% to Gold' },
  { name: 'Gold', gold: '15', rows: '19% 6 grey cards, 19% 12 gems, 18% 15 balls, 9% purple card, 5% ascend coupon, 1% 8h candy, 29% to Elite' },
  { name: 'Elite', gold: '50', rows: '36% 30 balls, 25% 15 grey cards, 18% 60 gems, 11% orange card, 4% 2 crusade misc items, 3% 24h candy, 3% rebirth coupon' },
  { name: 'Divine', gold: '200', rows: '40% 75 balls, 23% asylum key, 23% 200 gems, 8% 72h candy, 6% one of each crystal' },
]
