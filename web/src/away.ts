// Away gain % (nonActiveZoneGainPercent): the game computes it at load (SceneEvents_2 init), so cloud saves lack it.
// Ported formula: unascended 100 + cards + shrine/2; ascended 28 + cards + realm terms + min(shrine/2 + 5*perk125, 90),
// realm terms = fruit 16 "%_Away_gains_outside_Realm" (realm.ts fruitBonus) + Corn Can vending (2/level) + RealmStuff[13][7]*floor(realm level/10).
import { cbonus, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { fightStats } from './fighting'
import { fruitBonus } from './realm'
import { current, fresh } from './screen-bound'

const n = (v: unknown) => Number(v ?? 0) || 0

/** The game's load-time away gain % (@20193413); the stored value when the save has it. */
export function awayPercent(save: Record<string, unknown>): number | null {
  if (save.nonActiveZoneGainPercent != null) return n(save.nonActiveZoneGainPercent)
  const cards = n(cbonus(save, catalog as unknown as Catalog).CbonusAwayScreenProgress) // selected deck at load
  const shrine = n((save.ShrineLevels as number[] | undefined)?.[9])
  if (n(save.TimesAscended) < 1) return 100 + cards + 0.5 * shrine
  const capped = Math.min(0.5 * shrine + 5 * n((save.MasteryPerksUnlocked as number[] | undefined)?.[125]), 90)
  const realm = (save.RealmStuff as any[] | undefined) ?? []
  if (!realm.length) return 28 + cards + capped
  return 28 + cards + fruitBonus(save, 16) + 2 * n(realm[8]?.[9]) + n(realm[13]?.[7]) * Math.floor(n(realm[0]) / 10) + capped
}

// The stats panel (top-left "APmenu" info, pages cycle Away gains → Potions → Damage → Health; DescriptionStatPage 3,4,1,2).
// Ported from the game's 4 draw listeners (bundle ~10725000 DAMAGE, ~10909000 HEALTH, ~11031700 AWAY GAINS, ~11126000
// POTIONS); src/stat-pages.ts runs those listeners themselves, and away.test.ts checks this port against them.
// Every input is a game attribute a full local save stores (combat stats like DPS, PlayerHPmax are #15's job to derive),
// except DPS and CriticalDamage off the fight screen (withFight).
type A = Record<string, any>
/** DPS and CriticalDamage as the fight screen (8) stores them; off it, the Fighting-deck model (fighting.ts fightStats). */
const fought = new WeakMap<A, A>() // per save object: the Perks tab asks for kills and cash of each variant (fightStats ~10 ms)
export function withFight(a: A): A {
  if (fresh(a, 'DPS') && fresh(a, 'CriticalDamage')) return a
  let w = fought.get(a)
  if (!w) {
    const f = fightStats(a)
    w = 'missing' in f ? a : { ...a, DPS: current(a, 'DPS', () => f.DPS), CriticalDamage: current(a, 'CriticalDamage', () => f.CriticalDamage) }
    fought.set(a, w)
  }
  return w
}
const at = (a: A, k: string, i: number) => n(a[k]?.[i])
const fl = Math.floor

/** Idle hits per second, before the away panel's 40/s cap. Card drops away divide the base speed by FightZoneTYPE². */
export const idleHitsPerSec = (a: A, zoneType = 1) => {
  const rift = at(a, 'RiftLVL', 6)
  return (0.02 + n(a.smithingAttackSpeedBoost)) / zoneType ** 2 * (1 + fl(10 * Math.min(rift, 1) + 3 * rift) / 100) * 50 / n(a.dpsspeed)
}
/** IDLE DAMAGE row as a multiplier: smith item 32, ascension 6, IdleDmgBonusPercent. */
export const idleMult = (a: A) => (1 + 0.015 * at(a, 'SmithingItemLevel', 32)) * (1 + 0.1 * at(a, 'AscentionLevel', 6)) * (1 + n(a.IdleDmgBonusPercent) / 100)
/** Share of idle hits that kill: one average idle hit (hit chance × mastery-averaged DPS × idle × crit) over monster HP (mapleexpREQ), capped at 1. */
export const idleKillShare = (a: A) => Math.min(
  Math.max(1 - Math.max(5 * (n(a.MonsterHitRequirement) - n(a.atkLVL)) / 100, 0), 0) * (n(a.Mastery) * n(a.DPS) + n(a.DPS)) / 2
  * idleMult(a) * (1 + n(a.CriticalChance) / 100 * (n(a.CriticalDamage) - 1)) / n(a.mapleexpREQ), 1)
/** 1 − monster hit / (max HP × shield): 0 means the monster out-damages you and idling earns nothing. */
export const idleSurvival = (a: A) => Math.max(1 - n(a.MonstersDamage) * (1 - n(a.MonsterDamageReduction)) / (n(a.PlayerHPmax) * (1 + n(a.ShieldPercentMAX) / 100)), 0)

/** AWAY GAINS PER HOUR. Kills include multi-kills (BonusKillperKill) and the extra-kill sources; cash does not. */
export const awayGainsPerHour = (a: A) => gainsPerHour(withFight(a))
function gainsPerHour(a: A) {
  const hits = 3600 * Math.min(idleHitsPerSec(a), 40) * idleKillShare(a) * idleSurvival(a) ** 1.8 * (1 + at(a, 'TankBonusLIST', 28) / 100)
  const extra = 1 + Math.min(0.2 * Math.sqrt(at(a, 'SmithingItemLevel', 76)), 9) + at(a, 'SkillLevels', 20) / 10
    + 0.1 * at(a, 'AscentionLevel', 2) + 0.3 * at(a, 'SecretEarned', 1) + 0.02 * at(a, 'SmithingItemLevel', 35)
  return { kills: hits * n(a.BonusKillperKill) * extra, cash: hits * n(a.defaultgold) }
}

/**
 * Card drops banked per away claim (AwayCardDrops, bundle ~31714700 and ~31762300): no 40/s cap, no multi-kills,
 * speed ÷ FightZoneTYPE², odds (180 + 10⁴(zt−1))·(1+mode/3)·3/(1+CbonusCardDropChance/100)·zt⁴, capped at 10+0.2(CardDropsPerDayMAX−10).
 * On return a 40 ms ticker spawns one card actor per whole drop above 1 (zone type 1), or with chance 1−0.8^drops per tick otherwise; none from mode 15.
 */
export function awayCardDrops(save: A, seconds: number) {
  const a = withFight(save)
  const zt = n(a.FightZoneTYPE) || 1
  const odds = (180 + 1e4 * (zt - 1)) * (1 + n(a.currentfightmode) / 3) * 3 / (1 + n(a.CbonusCardDropChance) / 100) * zt ** 4
  return Math.min(idleHitsPerSec(a, zt) * seconds * idleKillShare(a) * idleSurvival(a) ** 1.8 / odds, 10 + 0.2 * (n(a.CardDropsPerDayMAX) - 10))
}

const ladder = (x: number, steps: [number, number, number, string][], top: string) => {
  for (const [lt, div, dp, u] of steps) if (x < lt) return `${fl(x / div * dp) / dp}${u}`
  return top
}
/** Percent rows: 18K%, 1.7K%, 16B%. ponytail: one shared ladder; a few rows stop early in the game (at B%) and would read "999+Q%" vs "NB%" past 1e12. */
export const pct = (x: number) => ladder(x, [[1e3, 1, 1, ''], [1e4, 1e3, 10, 'K'], [1e6, 1e3, 1, 'K'], [1e7, 1e6, 10, 'M'], [1e9, 1e6, 1, 'M'],
  [1e10, 1e9, 10, 'B'], [1e12, 1e9, 1, 'B'], [1e13, 1e12, 10, 'T'], [1e15, 1e12, 1, 'T'], [1e16, 1e15, 10, 'Q'], [1e18, 1e15, 1, 'Q']], '999+Q') + '%'
/** BASE DMG / BASE HP: whole number under 99,999, then K/M/B/T/Q without decimals. */
const base = (x: number) => x < 99999 ? String(x) : ladder(x, [[9999999, 1e3, 1, 'K'], [9999999999.9, 1e6, 1, 'M'], [9999999999999.9, 1e9, 1, 'B'], [1e16, 1e12, 1, 'T'], [1e18, 1e15, 1, 'Q']], '999Q')
/** Away kills/cash: 2.83M, 28.3M, 283M, …; past T the kills ladder says Z/ZZ and the cash ladder Q/QQ (game's own letters). */
export function big(x: number, q: 'Z' | 'Q') {
  if (x <= 999999) return String(fl(x))
  const steps: [number, number, number, string][] = [[9999999, 1e4, 100, 'M'], [99999999, 1e5, 10, 'M'], [999999999, 1e6, 1, 'M'],
    [9999999999.9, 1e7, 100, 'B'], [99999999999.9, 1e8, 10, 'B'], [999999999999.9, 1e9, 1, 'B'],
    [9999999999999.9, 1e10, 100, 'T'], [99999999999999.9, 1e11, 10, 'T'], [999999999999999.9, 1e12, 1, 'T'],
    [1e16, 1e13, 100, q], [1e17, 1e14, 10, q], [1e18, 1e15, 1, q], [1e19, 1e16, 100, q + q], [1e20, 1e17, 10, q + q], [q === 'Q' ? 1e22 : 1e21, 1e18, 1, q + q]]
  for (const [le, div, p, u] of steps) if (x <= le) return `${fl(x / div) / p}${u}`
  return `999${q + q}`
}

/** APPROXIMATE CASH shows cash ÷ 1e21 per tier; the tier is only the digits' colour (1, 2) or coin icons (3+). 3803 in tier 1 = 3.803e24/h. */
export function cashTier(cash: number) {
  let tier = 0
  while (cash > 1e21 && tier < 11) { cash /= 1e21; tier++ }
  return { shown: cash, tier }
}

/** The four pages as [label, value] rows, value text as the game draws it (minus its "_" spacers). */
export function statPages(save: A): Record<'damage' | 'health' | 'away' | 'potions', [string, string][]> {
  const a = withFight(save)
  const plus = (x: number) => '+' + pct(x)
  const baseDmg = 25 * n(a.strLVL) + 8 * n(a.atkLVL) + 2 * n(a.endLVL) + n(a.SmithingBaseAttack) // the page (re)writes BaseDMG from this
  const rift = (i: number, k: number, m: number) => 1 + fl(k * Math.min(at(a, 'RiftLVL', i), 1) + m * at(a, 'RiftLVL', i)) / 100
  const surv = idleSurvival(a)
  const { kills, cash } = gainsPerHour(a)
  // ponytail: the game's "dead" variant (IsPlayerAlive 0) draws a different message; only the too-much-damage one is mirrored.
  const away: [string, string][] = n(a.IsPlayerAlive) === 1 && surv <= 0
    ? [['THIS MONSTER DOES TOO MUCH DAMAGE FOR YOU TO IDLE ON', '']]
    : [['MONSTER KILLS', big(kills, 'Z')], ['APPROXIMATE CASH', big(cashTier(cash).shown, 'Q')]]
  return {
    damage: [
      ['BASE DMG', base(baseDmg)],
      ['SKILL LEVELS', plus((n(a.strLVL) + 10) / 10 * ((n(a.atkLVL) + 25) / 25) * 100)],
      ['SMITH TRINKETS', plus(100 * n(a.MedallionDamageBoost))],
      ['ASCENTION', plus(0.5 * n(a.waterLV) * at(a, 'AscentionLevel', 5))],
      ['POTIONS', plus(n(a.PbonusDamageSUM))],
      ['CARDS', plus(n(a.CbonusTotalDamage))],
      ['TINKER EQUIPS', plus(n(a.EbonusTotalDmgPCT))],
      ['EVENT DMG', plus(n(a.EventBonusDamage))],
      ['MISCELLANEOUS', plus((fl(n(a.MeritsSpent) / 10) * fl(at(a, 'SkillLevels', 38)) + 0.5 * at(a, 'SkillLevels', 39) * n(a.ContractsCompleted))
        * (1 + n(a.CivType) / 2) * rift(3, 15, 5))],
      ['CRIT CHANCE', n(a.CriticalChance) < 100 ? `${fl(n(a.CriticalChance))}%` : '100%'], // display caps; the away formulas use it uncapped
      ['CRIT DAMAGE', plus(100 * n(a.CriticalDamage))],
    ],
    health: [
      ['BASE HP', base(fl(100 + 25 * (n(a.endLVL) - 1) ** 1.3 + n(a.HealthSmithingBoost)))],
      ['SKILL LEVELS', plus(n(a.endLVL) * (1 + 0.3 * at(a, 'SkillLevels', 29)) * 10)],
      ['ASCENTION', plus(0.5 * n(a.waterLV) * at(a, 'AscentionLevel', 9))],
      ['CARDS', plus(n(a.CbonusTotalHealth))],
      ['TINKER EQUIPS', plus(n(a.EbonusTotalHpPCT))],
      ['MISCELLANEOUS', plus(100 * (rift(4, 12, 4) * (0.1 * at(a, 'AscentionLevel', 14) * at(a, 'ZoneTotalCardLV', 1) / 100
        + 0.5 * at(a, 'SkillLevels', 40) * n(a.ContractsCompleted) / 100 + 1) - 1))],
      ['DMG REDUCTION', `${fl(100 * n(a.MonsterDamageReduction))}%`],
      ['IDLE SPEED', `${Math.ceil(100 / idleHitsPerSec(a)) / 100} SEC`],
      ['IDLE DAMAGE', pct(Math.max(100 * (idleMult(a) - 1), 0))],
      ['CASH BONUS', plus(100 * (n(a.SmithingBonusCash) * (1 + 0.5 * at(a, 'AscentionLevel', 10)) - 1))],
    ],
    away,
    potions: [
      ...[1, 2, 3, 4, 5].map((i): [string, string] => [`DMG MULTI ${i}`, plus(n(a[`PbonusTotalDmg${i}`]))]),
      ['TOTAL DAMAGE', plus(n(a.PbonusDamageSUM))],
      ...[1, 2, 3, 4].map((i): [string, string] => [`CASH MULTI ${i}`, plus(n(a[`PbonusCash${i}`]))]),
      ['TOTAL CASH', plus(n(a.PbonusCashSUM))],
    ],
  }
}

/** Tilling away XP per real away second (own scene code): Σ owned farmers anim/10·(1+armor/40)·FarmingSpeedBOOST ×
 *  FarmingExpGiven·(0.25·round(armor/10)+1)·FarmingExpGivenBONUS × awayPct/100 × (1+TankBonusLIST[36]/100). No farmingChance
 *  roll, unlike active harvests. Verified live 2026-10-04: 224 s → +6.35e9 vs 6.0e9 predicted. */
export function awayTillingPerSecond(a: A, awayPct: number) {
  const arr = (k: string) => (a[k] as number[]) ?? []
  let s = 0
  for (let f = 1; f <= 8; f++) {
    if (!n(arr('FarmerLV1')[f])) continue
    const armor = n(arr('FarmerArmor')[f])
    s += (n(arr('FarmingAnimationSpeed')[f]) / 10) * (1 + armor / 40) * n(a.FarmingSpeedBOOST) * n(arr('FarmingExpGiven')[f]) * (0.25 * Math.round(armor / 10) + 1) * n(arr('FarmingExpGivenBONUS')[f])
  }
  return s * (awayPct / 100) * (1 + n(arr('TankBonusLIST')[36]) / 100)
}

/** Animation frames per second for a nominal speed: a 10 ms timer adds speed/100 to a counter, each draw (fps) advances one
 *  frame if it is ≥ 1 and zeroes it (overflow lost). Tilling farmers and Mining miners both animate this way. */
export function framesPerSec(speed: number, fps = 60) {
  const draws = 600
  let acc = 0, frames = 0, ticks = 0
  for (let d = 1; d <= draws; d++) {
    const due = Math.floor(d * 100 / fps) // 10 ms ticks elapsed by this draw
    for (; ticks < due; ticks++) acc += speed / 100
    if (acc >= 1) { acc = 0; frames++ }
  }
  return frames / (draws / fps)
}

/** Active Tilling (on screen): a 10 ms timer adds anim·(1+armor/40)·FarmingSpeedBOOST/100 to each farmer's counter, and each
 *  draw (60 fps) advances the farmer one frame if the counter is ≥ 1, then zeroes it (overflow lost). 9 frames per harvest; XP lands on
 *  randomInt(1,1000) ≤ farmingChance. So a farmer moves 60 frames/s at speed ≥ 100, 40 at 50–100 (2 of every 3 draws), and so on.
 *  Verified live 2026-10-04: 6.65 / 4.43 harvests/s per farmer, 3.03e6 XP/s. */
export function activeTilling(a: A, fps = 60) {
  const arr = (k: string) => (a[k] as number[]) ?? []
  let xp = 0
  const farmers: { harvestsPerSec: number; speed: number }[] = []
  for (let f = 1; f <= 8; f++) {
    if (!n(arr('FarmerLV1')[f])) continue
    const speed = n(arr('FarmingAnimationSpeed')[f]) * (1 + n(arr('FarmerArmor')[f]) / 40) * n(a.FarmingSpeedBOOST)
    const harvestsPerSec = framesPerSec(speed, fps) / 9
    farmers.push({ harvestsPerSec, speed })
    xp += harvestsPerSec * n(arr('FarmingExpGiven')[f]) * n(arr('FarmingExpGivenBONUS')[f])
  }
  return { xpPerSec: xp * n(a.farmingChance) / 1000, farmers }
}

/** Away vs playing, measured live 2026-10-04 (docs/resource-xp.md). Ratios shift as you level; re-measure with src/fish-counter / a watcher. */
export const LEAVE_OR_PLAY: { screen: string; ratio: number; how: 'live' | 'code' | 'save'; verdict?: string }[] = [
  { screen: 'Fishing', ratio: 410, how: 'live' },
  { screen: 'Tilling', ratio: 9, how: 'live' },
  { screen: 'Botany', ratio: 0.3, how: 'live', verdict: 'harvest by hand' }, // XP only on manual harvest (live: 217 s on screen → +0); away grows bars at 30.5%
  { screen: 'Attack Dojo / Strength Mountain / Endurance Fields', ratio: 0.3, how: 'code' },
  { screen: 'Mining', ratio: 0.07, how: 'live' },
]

/** Screens that bank away time, most credited first: (now - LastVisitedZone[K]), times awayPct/100 on "reduced" screens
 *  (Afk tab table; mapping from src/derive-screens.ts). */
export function bankedScreens(save: Record<string, unknown>, screens: Record<string, { names: string[]; reduced: boolean }>, awayPct: number, now = Date.now() / 1000) {
  const last = (save.LastVisitedZone as number[]) ?? [], been = (save.HaveyouBeenBeforeZone as number[]) ?? []
  return Object.entries(screens)
    .filter(([k]) => been[+k] && last[+k]! > 1e9)
    .map(([k, s]) => {
      const away = Math.max(0, now - last[+k]!)
      return { k: +k, name: s.names.join(' / '), away, credited: s.reduced ? away * (awayPct / 100) : away, reduced: s.reduced }
    })
    .sort((a, b) => b.credited - a.credited)
}
