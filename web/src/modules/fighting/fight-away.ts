// Away fighting: idle kills, cash and card drops while away, and the stats panel. Split out of away.ts (refactor step 7,
// #70), which keeps the away % and banked time; this half needs the fight model, so it lives with fighting.
import { fightStats } from './fighting'
import { current, fresh } from '../../screen-bound'

const n = (v: unknown) => Number(v ?? 0) || 0

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
