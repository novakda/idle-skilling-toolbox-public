// Fighting tab: zone progress, the fight scene's damage, the Fighting deck, every zone's monsters and a per-zone estimate.
// Every formula is the main fight scene's (SceneEvents_9 in Qno2x.js, byte offsets cited) or an existing port reused from
// combat.ts / smithing.ts / cards-calc.ts. Zone modes: 1-5 are FightZoneTYPE 1, 11-15 are FightZoneTYPE 2.
import catalog from './data/card-catalog.json'
import { buildCards, cbonus, type Catalog } from './cards-calc'
import { getPlayerDPS, hitChance, monsterDamageReduction, monsterHitRequirement, monstersDamage, playerHPmax, raidDecks, raidStats } from './combat'
import { equipmentBonuses, masteryBonuses, potionBonuses } from './bus'
import { smithingBaseAttack } from './smithing'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const CAT = catalog as unknown as Catalog
const fl = Math.floor
export const LINK = 9 // DeckLinkList value the fight scene equips (cards @31597653, tinker deck @31598519)

/** Fight zones by currentfightmode. Names: the card catalog's zone labels for the cards each zone drops. `levels`: monster
 *  levels with their own picture (ActorEvents_238 @7447433); above that the zone shows its glitch frame. `key`: the level
 *  (with its kill requirement met) whose kill unlocks the next zone (@31788970-31789994, @31820654-31821683). */
export const ZONES = [
  { m: 1, name: 'Grasslands', levels: 15, key: 14 }, { m: 2, name: 'Desert', levels: 29, key: 28 },
  { m: 3, name: 'Mountains', levels: 48, key: 47 }, { m: 4, name: 'The Mist', levels: 56, key: 55 },
  { m: 5, name: 'Dungeon', levels: 44, key: 43 }, { m: 11, name: 'Purgatory', levels: 56, key: 55 },
  { m: 12, name: 'The Bog', levels: 56, key: 55 }, { m: 13, name: 'Lunar Isle', levels: 62, key: 61 },
  { m: 14, name: 'Maelstrom', levels: 68, key: 67 }, { m: 15, name: 'Oblivion', levels: 216, key: null },
] as const
const zt = (m: number) => (m > 10 ? 2 : 1)
/** First MapleMonster index of a zone: L + 100·(m − (1 + 5·(Z − 1))) (kill handlers @31785544 / @31816765). */
export const base = (m: number) => 100 * (m - (1 + 5 * (zt(m) - 1)))

/** Unlocked: zones 1-5 and 12-15 at fightsunlocked ≥ m (raised by the key drops above and the key items @3865124+);
 *  Purgatory by the hell key (HellKeyGot, item 0 of ActorEvents_1188 @3864500+). */
export const unlocked = (save: Save, m: number) => (m === 11 ? n(save.HellKeyGot) > 0 : n(save.fightsunlocked) >= m)

/** Kills a level needs before the right arrow moves you on (ActorEvents_253 @7628828, both zone types; levels stop at 99,
 *  Oblivion 269, @7631307). `auto`: the kill handler's copy, which gates auto-advance and the next-zone key: zone type 1
 *  adds 20·⌊(m − 1)/2⌋ (@31788463); type 2 is the same as the arrow's (@31819831). */
export function killReq(m: number, L: number, auto = false) {
  const Z = zt(m)
  if (auto && Z === 1) return 25 * m + 10 * (L * m + 2 * Math.max(fl((m - 1) / 2), 0)) - 20
  return (m - 5 * (Z - 1)) * Math.pow(25, Z) + 10 * (L * m * Z * Z * Math.max((m - 10 * (Z - 1)) * (Z - 1), 1) + 2 * Math.max(fl((m - (1 + 5 * (Z - 1))) * (Z - 1) / 2), 0)) - 20
}

/** Monster HP (mapleexpREQ), set every frame: zone type 1 @31775542, type 2 @31804850 then ÷ @31806955. Skill 16 ×5. */
export function monsterHP(save: Save, m: number, L: number) {
  const s16 = n(arr(save, 'SkillActive')[16])
  if (zt(m) === 1) {
    const f10 = fl(m / 10)
    const v = (((fl(Math.pow(L, 2.2) * Math.pow(1.05, L - 1) * 20 * ((L + 6) / 6)) + 50 * (L + 1) * ((L + 6) / 6)) * Math.pow(40, m - 1) * (1 - f10)
      + (f10 * (1e5 + 5e4 * L) * Math.pow(10, L) + 16e3 * Math.pow((110 + 2 * m + 0.3 * L) / 100, Math.min(L, 16) + (1 + (L - 16) / 5 * fl(m / 4) * fl((84 + L) / 100))) * (Math.pow(2, Math.pow(m, 2.2) - 1) - 1) * (1 - f10))) * (1 - f10)
      + 50 * (L + 1) * Math.pow(2.4, L) * f10) / (1 + 0.6 * (fl((m + 98) / 100) - fl((m + 90) / 100))) * (1 + 4 * (fl((m + 97) / 100) - fl((m + 90) / 100)))
      * (1 + 0.5 * (fl((m + 96) / 100) - fl((m + 90) / 100))) * (fl((m + 95) / 100) - fl((m + 90) / 100) + 1)
    return v * (1 + 4 * s16)
  }
  const f20 = fl(m / 20)
  const R = ((Math.pow(L, 2.2) * Math.pow(1.05, L - 1) * 20 * ((L + 6) / 6) + 50 * (L + 1) * ((L + 6) / 6)) * Math.pow(40, m - 6)
    + (f20 * (1e5 + 5e4 * L) + 16e3 * Math.pow((110 + 2 * m + 0.3 * L) / 100, Math.min(L, 16) + (1 + (L - 16) / 5 * fl(m / 4) * fl((84 + L) / 100))) * (Math.pow(2, Math.pow(m - 5, 2.2) - 1) - 1)) + f20)
    / (1 + 0.6 * (fl((m + 98) / 100) - fl((m + 80) / 100))) * (1 + 4 * (Math.ceil((m + 97) / 100) - fl((m + 80) / 100)))
    * (1 + 0.5 * (fl((m + 96) / 100) - fl((m + 80) / 100))) * (fl((m + 95) / 100) - fl((m + 80) / 100) + 1)
  const G = R * (1 + 4 * s16) * (1 / (1 + 19 * fl((m + 86) / 100))) * (1 + Math.pow(1.4 + 0.3 * Math.pow(L + 1, 1.75), Math.pow(L, 0.8) / 4.1 + 1) * fl((m + 85) / 100))
  return G / (Math.max(Math.pow(1.15, L) * (m - 11), 1) * (1 + Math.pow(1e15, Math.pow(fl(Math.max(L - 16, 0) / 100), 2) - Math.max(L - 216, 0))))
}

/** Gold per kill (defaultgold): zone type 1 @31777695, type 2 @31807360 then ÷ @31809880. Reads the stored SmithingBonusCash
 *  (a fight-scene init value, @31683186 / @31693941, not ported). */
export function monsterGold(save: Save, m: number, L: number) {
  const SBC = n(save.SmithingBonusCash), a10 = n(arr(save, 'AscentionLevel')[10]), sk = 1 + 0.2 * n(arr(save, 'SkillLevels')[50]) * n(arr(save, 'SkillActive')[16])
  if (zt(m) === 1) {
    const f10 = fl(m / 10)
    const g = Math.ceil((Math.pow(L, 2 + 0.15 * m) + 12 * (m + 1) * L) * m * (40 * f10 + 1) * m + (850 * (Math.pow(3.8, m - 1) - 1) * (1 - f10) + 5e3 * f10 * (L + 1) + 25)) * SBC * (1 - f10)
      + 250 * (L + 1) * Math.pow(1.27, L) * f10 * SBC
    return g * (1 + 0.5 * a10) * (1 + 3 * (fl((m + 97) / 100) - fl((m + 90) / 100))) * (1 + 9 * (fl((m + 96) / 100) - fl((m + 90) / 100))) * (1 + 5 * (fl((m + 95) / 100) - fl((m + 90) / 100))) * sk
  }
  const f20 = fl(m / 20)
  const Y = ((Math.pow(L, 2 + 0.15 * (m - 5)) + 12 * (m - 5 + 1) * L) * m * (40 * f20 + 1) * (m - 5) + (850 * (Math.pow(3.8, m - 6) - 1) * (1 - f20) + 5e3 * f20 * (L + 1) + 25)) * SBC * (1 - f20)
    + 250 * (L + 1) * Math.pow(1.27, L) * f20 * SBC
  const B = Y * (1 + 0.5 * a10) * (1 + 3 * (fl((m + 97) / 100) - fl((m + 80) / 100))) * (1 + 9 * (fl((m + 96) / 100) - fl((m + 80) / 100))) * (1 + 5 * (fl((m + 95) / 100) - fl((m + 80) / 100)))
    * sk * (7 + 30 * (m - 11)) * Math.pow(1.03, L + 55 * (m - 11)) * (1 + Math.pow(1.05, L) * fl((m + 85) / 100))
  return B / Math.pow(1.02, Math.max(L - 55, 0)) * (1 + 4 * fl((m + 86) / 100))
}

/** The card a kill drops at (m, L) (ActorEvents_875 init @15665419; Oblivion @15669300). Its name is the monster's. */
export function cardId(m: number, L: number) {
  const step = (div: number, first: number, last: number) => Math.min(fl(L / div) + first, last)
  switch (m) {
    case 1: return Math.min(L + 1, 16)
    case 2: return Math.min(L + 31, 60)
    case 3: return L >= 48 ? 86 : L === 47 ? 85 : L === 46 ? 84 : step(2, 61, 86)
    case 4: return L >= 56 ? 111 : L === 55 ? 110 : L === 54 ? 109 : step(3, 91, 111)
    case 5: return L >= 44 ? 137 : L === 43 ? 136 : L === 42 ? 135 : step(3, 121, 136)
    case 11: return L >= 56 ? 381 : L === 55 ? 380 : L === 54 ? 379 : step(3, 361, 381)
    case 12: return L >= 56 ? 411 : L === 55 ? 410 : L === 54 ? 409 : step(3, 391, 411)
    case 13: return L >= 62 ? 443 : L === 61 ? 442 : L === 60 ? 441 : step(3, 421, 443)
    case 14: return L >= 68 ? 475 : L === 67 ? 474 : L === 66 ? 473 : step(3, 451, 475)
    default: return L >= 216 ? 510 : step(5, 481, 503) + Math.max(fl((L - 110) / 14), 0)
  }
}
const cardById = new Map(CAT.cards.map((c) => [c.id, c]))
export const monsterName = (m: number, L: number) => cardById.get(cardId(m, L))?.name || `card ${cardId(m, L)}`

/** One kill's card-drop chance: randomInt(1, ⌊base/(1 + CardDropChance/100)⌋) == 1, base 170·(1 + m/3) in zone type 1
 *  (@31781330), 1500·(1 + (m − 10)/2) in type 2 (@31812491). */
export function cardChance(m: number, cardDropPct: number) {
  const k = fl((zt(m) === 1 ? 170 * (1 + m / 3) : 1500 * (1 + (m - 10) / 2)) / (1 + cardDropPct / 100))
  return k <= 1 ? 1 : 1 / k
}

/** MedallionDamageBoost as the fight scene's init writes it (@31690067): the raid copy's medallion items plus item 81
 *  (× STR) and Trekking-scaled item 73, then raised to 1 + (0.96·i89/(i89 + 2500))² when item 89 is owned (@31691066). */
export function medallion(save: Save) {
  const s = (i: number) => n(arr(save, 'SmithingItemLevel')[i]), a = (k: string, i: number) => n(arr(save, k)[i])
  const i81 = 15 * s(57) + 2500 * s(81) * (n(save.strLVL) / 100) * Math.pow(2.23, Math.min(s(81) / 1e3, 15))
  const c = (0.5 * s(1) + 0.75 * s(9) + 1.25 * s(17) + 2 * s(25) + 3.5 * s(33) + 5 * s(41) + 8 * s(49) + i81 + 35 * s(65) + s(73) * (100 + a('TankBonusLIST', 54) * n(save.TrekkingLV))) / 100
  const m = 1 + c * (1 + 0.05 * a('AscentionLevel', 8)) * (1 + n(cbonus(save, CAT).CbonusBaseMedallions) / 100)
  return s(89) > 0 ? Math.pow(m, 1 + Math.pow(0.96 * s(89) / (s(89) + 2500), 2)) : m
}

/** Player stats as the fight scene has them, on the Fighting-linked decks. null when the save lacks a load-time input. */
export function fightStats(save: Save) {
  const rd = raidDecks(save, LINK), rs = raidStats(rd)
  if (!rs) return { missing: 'PbonusCritDmg' }
  // The fight scene's init (@31669863) uses the newer SmithingBaseAttack copy, and its YourCriticalDamage (@31677036)
  // has MasteryBonuses[3] where the raid scenes' copy (raidStats) does not.
  const SBA = smithingBaseAttack(rd, LINK), CriticalDamage = rs.CriticalDamage * masteryBonuses(rd)[3]!, MedallionDamageBoost = medallion(rd)
  const DPS = getPlayerDPS({ ...rd, ...rs, SmithingBaseAttack: SBA, MedallionDamageBoost, SkillActive: [] }) // the fight's DPS listener @31880404
  if (typeof DPS !== 'number') return DPS
  // Fight-scene init values not ported: taken as stored (null on a cloud save).
  const stored = (k: string) => (save[k] == null ? null : n(save[k]))
  const s = {
    smithingAttackSpeedBoost: stored('smithingAttackSpeedBoost'), IdleDmgBonusPercent: stored('IdleDmgBonusPercent'),
    ShieldPercentMAX: stored('ShieldPercentMAX'), BonusKillperKill: stored('BonusKillperKill'), SmithingBonusCash: stored('SmithingBonusCash'),
  }
  const missing = Object.entries(s).filter(([, v]) => v == null).map(([k]) => k)
  if (missing.length) return { missing: missing.join(', ') }
  return { rd, DPS, SmithingBaseAttack: SBA, MedallionDamageBoost, CriticalChance: rs.CriticalChance, CriticalDamage,
    Mastery: rs.Mastery, HPmax: playerHPmax(rd), DR: monsterDamageReduction(rd), cardDrop: n(cbonus(rd, CAT, LINK).CbonusCardDropChance),
    hitNow: hitChance(rd), ...(s as Record<keyof typeof s, number>) }
}
export type FightStats = Exclude<ReturnType<typeof fightStats>, { missing: string }>

/** Seconds per attack threshold (dpsspeed): 2·Z²/(1 + 0.1·Ascension 3) @31775292 / @31804150; in zone type 2, shrine 5
 *  (Heavy Cash) above level 1 divides it by 2·(1 − 0.8^min(toggle, 50)) @31804609. */
export function dpsSpeed(save: Save, m: number) {
  const Z = zt(m), v = 2 * Z * Z / (1 + 0.1 * n(arr(save, 'AscentionLevel')[3]))
  return Z === 2 && n(arr(save, 'ShrineLevels')[5]) > 1 ? v / (-1 * (1 - 2 * Math.pow(0.8, Math.min(n(save.HeavyCashToggle), 50))) + 1) : v
}
/** Attacks per second as the game's own AFK estimates use it (offline gains @31705994, FightingCashPerMin @21682751):
 *  min((0.02 + smithingAttackSpeedBoost)·(1 + ⌊10·min(rift 6, 1) + 3·rift 6⌋/100)·50/dpsspeed, 40). */
export function attacksPerSec(save: Save, f: FightStats, m: number) {
  const r6 = n(arr(save, 'RiftLVL')[6])
  return Math.min((0.02 + f.smithingAttackSpeedBoost) * (1 + fl(10 * Math.min(r6, 1) + 3 * r6) / 100) * 50 / dpsSpeed(save, m), 40)
}

/** What GetPlayerDPS (@2637594, ported in combat.ts) multiplies together, for the breakdown: the base-attack sum and the
 *  biggest factors, each as the game reads it on the Fighting decks. Rift, merit, civ, ascension, event and Realm terms and
 *  the ice-cream exponent are in the total but not listed. */
export function damageParts(f: FightStats) {
  const rd = f.rd, C = cbonus(rd, CAT, LINK), E = equipmentBonuses(rd).scalar, a = (k: string, i: number) => n(arr(rd, k)[i])
  const str = n(rd.strLVL), atk = n(rd.atkLVL), end = n(rd.endLVL), tp = (i: number) => a('TrainingPerkLevels', i)
  return {
    stats: 25 * str + 8 * atk + 2 * end, str, atk, end,
    flat: { cards: n(C.CbonusBaseDamageFLAT), equipment: n(E.EbonusBaseDmgFLAT), potions: potionBonuses(rd, 0, LINK).BaseDmg },
    cardBasePct: n(C.CbonusBaseDamage),
    factors: [
      ['Medallion boost (smithing items)', f.MedallionDamageBoost, '@31690067'],
      ['STR and ATK scaling', ((str + 10) / 10) * ((atk + 25) / 25), 'GetPlayerDPS'],
      ['Cards in the Fighting deck: total damage', 1 + n(C.CbonusTotalDamage) / 100, 'CbonusTotalDamage'],
      ['Equipment (tinker deck): total damage', 1 + n(E.EbonusTotalDmgPCT) / 100, 'EbonusTotalDmgPCT'],
      ['Potions: total damage', 1 + n(rd.PbonusDamageSUM) / 100, 'PbonusDamageSUM (load-time, stored)'],
      ['Mastery perks', masteryBonuses(rd)[1]!, 'MasteryBonuses[1]'],
      ['Training perks 1 / 7 / 14', 1 + (5 * tp(1) + 20 * tp(7) + 50 * tp(14)) / 100, 'TrainingPerkLevels'],
      ['Skill tree slot 61', 1 + 2 * a('SkillLevels', 61) / 100, 'SkillLevels[61]'],
      ['Shrines 1 (STR above 50) and 10', (1 + a('ShrineLevels', 1) * Math.max(str - 50, 0) / 100) * (1 + 10 * a('ShrineLevels', 10) / 100), 'ShrineLevels'],
      ['Lab tank bonus 8', a('TankBonusLIST', 8), 'TankBonusLIST[8]'],
    ] as [string, number, string][],
  }
}

/** ESTIMATE for fighting zone m at level L, built from the game's AFK formula (FightingCashPerMin @21682751, offline kills
 *  @31705994): monsters/min = 60·attacks/s·min(hit·avg hit·idle·crit / HP, 1)·survival^1.8, gold/min × gold per kill,
 *  kills credited × the kill handler's per-kill credit (@31785544), cards/min × cardChance. The game itself only runs this
 *  for the zone you are in; here it is run for any zone with your current fight stats. */
export function estimate(f: FightStats, m: number, L: number) {
  const a = (k: string, i: number) => n(arr(f.rd, k)[i]), at = { ...f.rd, FightZoneTYPE: zt(m), currentfightmode: m, mapleLV: L }
  const HP = monsterHP(f.rd, m, L), MD = monstersDamage(at)!, req = monsterHitRequirement(at)!
  const hit = Math.max(1 - Math.max(5 * (req - n(f.rd.atkLVL)) / 100, 0), 0)
  const perHit = hit * (f.Mastery * f.DPS + f.DPS) / 2 * (1 + 0.015 * a('SmithingItemLevel', 32)) * (1 + 0.1 * a('AscentionLevel', 6))
    * (1 + f.IdleDmgBonusPercent / 100) * (1 + f.CriticalChance / 100 * (f.CriticalDamage - 1))
  const taken = MD * (1 - f.DR), hp = f.HPmax * (1 + f.ShieldPercentMAX / 100)
  const survival = hp > taken ? Math.pow(Math.max(1 - taken / hp, 0), 1.8) : 0
  const aps = attacksPerSec(f.rd, f, m), perAttack = Math.min(perHit / HP, 1), perMin = 60 * aps * perAttack * survival
  const credit = (1 + (Math.min(0.2 * Math.pow(a('SmithingItemLevel', 76), 0.5), 9) + a('SkillLevels', 20) / 10) + 0.1 * a('AscentionLevel', 2))
    * (1 + a('SecretEarned', 1) * (0.3 + 0.02 * a('SmithingItemLevel', 35))) * f.BonusKillperKill
  const gold = monsterGold(f.rd, m, L)
  return {
    HP, MD, req, hit, perHit, survival, aps, gold, credit,
    secPerKill: perAttack > 0 ? 1 / (aps * perAttack) : Infinity, // attack time only; survival scales the per-minute rates
    perMin, goldPerMin: perMin * gold, killsPerMin: perMin * credit, cardsPerMin: perMin * cardChance(m, f.cardDrop),
    canFight: survival > 0 && hit > 0,
    dpsFactor: HP / Math.max(perHit, 1e-300), // ×DPS needed to kill in one attack (≤ 1: already one attack)
    hpFactor: taken / hp, // share of your HP (with shields) one monster hit takes; ≥ 1: the game counts no AFK kills
  }
}

/** Zone progress (save keys FurthestMapleLV, MapleMonster, fightsunlocked, HellKeyGot). */
export function zoneProgress(save: Save) {
  const mm = arr(save, 'MapleMonster'), cur = n(save.currentfightmode), curL = n(save.mapleLV)
  return ZONES.map((z, i) => {
    const kills = mm.slice(base(z.m), base(z.m) + 100).reduce((t, v) => t + n(v), 0), furthest = n(arr(save, 'FurthestMapleLV')[z.m])
    const keyKills = z.key == null ? null : n(mm[base(z.m) + z.key])
    return { ...z, furthest, kills, here: cur === z.m ? curL : null, unlocked: unlocked(save, z.m), visited: furthest > 0 || kills > 0,
      atFurthest: n(mm[base(z.m) + furthest]), reqAtFurthest: killReq(z.m, furthest),
      keyKills, keyReq: z.key == null ? null : killReq(z.m, z.key, true), nextUnlocked: z.key != null && unlocked(save, ZONES[i + 1]!.m) }
  })
}

/** The deck the fight scene equips (DeckLinkList = 9), each card with what it adds. */
export function fightingDeck(save: Save) {
  const b = buildCards(save, CAT), d = b.decks.find((x) => x.link === LINK)
  if (!d) return null
  const byId = new Map(b.cards.map((c) => [c.id, c]))
  return { deck: d.deck, totals: d.totals, cards: d.cards.filter((id) => id > 0).map((id) => byId.get(id)!).filter(Boolean) }
}

/** ESTIMATE: for each unlocked zone, the level you can select (0 to your furthest) that is best for each metric, ranked.
 *  Gold, monster kills (with the kill handler's per-kill credit) and card drops per minute come from estimate(). Fighting
 *  has no EXP to rank: the kill handlers (@31783344-31790000, @31814443-31821700) write gold, kill counts, unlocks and drops only. */
export function bestZones(save: Save, f: FightStats) {
  const rows = zoneProgress(save).filter((z) => z.unlocked).map((z) => {
    const top = Math.max(z.furthest, z.here ?? 0), all = Array.from({ length: top + 1 }, (_, L) => ({ L, e: estimate(f, z.m, L) }))
    const best = (k: 'goldPerMin' | 'killsPerMin' | 'cardsPerMin') => all.reduce((a, b) => (b.e[k] > a.e[k] ? b : a))
    return { m: z.m, name: z.name, gold: best('goldPerMin'), kills: best('killsPerMin'), cards: best('cardsPerMin') }
  })
  const rank = (k: 'gold' | 'kills' | 'cards', v: 'goldPerMin' | 'killsPerMin' | 'cardsPerMin') =>
    rows.map((r) => ({ m: r.m, name: r.name, L: r[k].L, perMin: r[k].e[v], name2: monsterName(r.m, r[k].L) })).sort((a, b) => b.perMin - a.perMin)
  return { gold: rank('gold', 'goldPerMin'), kills: rank('kills', 'killsPerMin'), cards: rank('cards', 'cardsPerMin') }
}

/** Strafe (the game's "Haste" buff, special skill bar SkillType 4, button ActorEvents_1285 @4489938). Usable only while
 *  HasteUnlocked > 0; Mini Lava's key on the Portal screen sets it (ActorEvents_1303 @4551958, roll 4-7 of randomInt(4,540)
 *  per click, @4531239). HasteUnlocked is not in the cloud save list (SceneEvents_2 addSaveEntry), only in the local save, so
 *  null = this save doesn't carry it. usedBefore: mastery task 77 USE_THE_HASTE_BUFF. */
export function strafe(save: Save) {
  if (!('HasteUnlocked' in save)) return null
  return { unlocked: n(save.HasteUnlocked) > 0, usedBefore: n(arr(save, 'MasteryTasksComplete')[77]) > 0 }
}
