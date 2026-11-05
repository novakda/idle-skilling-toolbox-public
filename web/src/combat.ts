// Combat stats the game computes at fight-scene load or per frame (absent from Steam Cloud saves), ported from the main
// fight scene (SceneEvents_9 in Qno2x.js) and checked against a full save's stored values in combat.test.ts. Issue #15.
// Raid (SceneEvents_16), Asylum (SceneEvents_41) and Conquest (crusade fight, SceneEvents_32) store their own
// MonstersDamage formula: raidMonstersDamage / asylumMonstersDamage / conquestMonstersDamage (#32).
import catalog from './data/card-catalog.json'
import { cbonus, type Catalog, zoneTotalCardLV } from './modules/cards/cards-calc'
import { equipmentBonuses, masteryBonuses, potionBonuses } from './bus'
import { fruitBonus, vendingBonus as realmVending } from './modules/realm/realm'
import { smithingBaseAttack } from './modules/gathering/smithing'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** Card (selected deck) and equipment bonuses, by save name. */
function bonuses(save: Save) {
  const c = cbonus(save, catalog as unknown as Catalog), e = equipmentBonuses(save).scalar
  return { C: (k: string) => n(c[`Cbonus${k}`]), E: (k: string) => n(e[`Ebonus${k}`]) }
}

/** SkillBonusdmgPCT[0..28]: fight-skill damage multipliers (poison 2, meteor 3, flurry 4, smite 5, banana 11). */
export function skillBonusDmgPct(save: Save): number[] {
  const { C, E } = bonuses(save), all = E('AllSkillDMG') / 100, out = Array<number>(29).fill(0)
  out[2] = C('PoisonDMG') / 100 + (E('PoisonDMG') / 100 + all)
  out[3] = C('MeteorDMG') / 100 + (E('MeteorDMG') / 100 + all)
  out[4] = C('FlurryDMG') / 100 + all
  out[5] = C('SmiteDMG') / 100 + (E('SmiteDMG') / 100 + all)
  out[11] = C('BananaDMG') / 100 + all
  return out
}

/** MonsterDamageReduction: share of monster damage blocked (smithing items 14/30/38/54 + cards), capped at 90%. */
export function monsterDamageReduction(save: Save) {
  const s = (i: number) => Math.floor(n(arr(save, 'SmithingItemLevel')[i]))
  return Math.min(90, s(14) / 12 + (s(30) / 8 + (s(38) / 6 + (s(54) / 3 + bonuses(save).C('DamageReduction'))))) / 100
}


/** HealthSmithingBoost: flat base HP from smithing items 6/22/46/62/78 + cards + equipment. */
export function healthSmithingBoost(save: Save) {
  const s = (i: number) => n(arr(save, 'SmithingItemLevel')[i]), { C, E } = bonuses(save)
  return 10 * s(6) + (50 * s(22) + (350 * s(46) + (1e3 * s(62) + (C('BaseHpFLAT') + E('BaseHpFLAT') + 1e4 * s(78)))))
}

/** PlayerHPmax as the game holds it during fights. The fight scene's init (SceneEvents_9) also multiplies in potion
 *  MaxHP, shrine 10 (×(1+15·lv/100)) and training perk 2 (×(1+endLVL·lv/100)), but the HP-skill actor (ActorEvents_539)
 *  recomputes PlayerHPmax on every cast and expiry without those three terms, and that is the value stored and used
 *  (fixture and live game both match this, both are 1.9× short of the init formula at shrine 10 level 6). */
export function playerHPmax(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i]), end = n(save.endLVL), { C, E } = bonuses(save)
  const base = 100 + 25 * Math.pow(end - 1, 1.3) + healthSmithingBoost(save)
  const t = ((end * (1 + 0.3 * a('SkillLevels', 29)) + 10) / 10) * base * (1 + 0.005 * n(save.waterLV) * a('AscentionLevel', 9)) * (1 + n(save.EventBonusHealth) / 100)
  const rift = a('RiftLVL', 4)
  const zone = (1 + Math.floor(12 * Math.min(rift, 1) + 4 * rift) / 100)
    * ((0.1 * a('AscentionLevel', 14) * zoneTotalCardLV(save)[1]!) / 100 + (0.5 * a('SkillLevels', 40) * n(save.ContractsCompleted)) / 100 + 1)
  return t * zone * (1 + 0.2 * a('SkillLevels', 18) * a('SkillActive', 10)) * (1 + C('TotalHealth') / 100) * (1 + E('TotalHpPCT') / 100)
}

/** Skill 16 (SkillActive[16], toggled by `marktoggle`) multiplies every monster's damage by 5 in all these formulas. */
const skill16 = (save: Save) => 1 + 4 * n(arr(save, 'SkillActive')[16])

/** MonstersDamage: what the current monster hits for (before MonsterDamageReduction), set at each spawn from zone
 *  type, fight mode and monster level. null outside the two regular zones (raid/Asylum/Conquest: the functions below). */
export function monstersDamage(save: Save): number | null {
  const m = n(save.currentfightmode), L = n(save.mapleLV), rage = skill16(save)
  if (n(save.FightZoneTYPE) === 1)
    return Math.ceil((Math.pow(L, 1.67 + 0.08 * m) + 1) * ((L + 20) / 20 + (m - 1))
      + (2 + 300 * (1 + 0.3 * (m - 1)) * (Math.pow(2.2 + 0.4 * m, m - 1) - 1) * (1 - Math.floor(m / 10)) + 3.5 * Math.pow(L, 1.12)) * ((L + 30) / 30)) * rage
  if (n(save.FightZoneTYPE) === 2)
    return ((Math.pow(L, 1.67 + 0.08 * (m - 5)) + 1) * ((L + 20) / 20 + (m - 6))
      + (2 + 300 * (1 + 0.3 * (m - 6)) * (Math.pow(2.2 + 0.4 * (m - 4), m - 4) - 1) * (1 - Math.floor(m / 20)) + 3.5 * Math.pow(L, 1.12)) * ((L + 30) / 30))
      * rage * (1 + 3 * (m - 11)) * Math.pow(1.01, L + 55 * (m - 11)) / Math.pow(10, m - 10)
  return null
}

/** PlayerHPmax as the raid, Asylum and Conquest scenes set it at init, which is also PlayerHP at the start of the fight
 *  (raids @19911195, PlayerHP = PlayerHPmax right after; Asylum @26876812; Conquest @23181306; same statement as the
 *  main fight scene's init): playerHPmax's terms without the HP skill (SkillActive[10]), times potion MaxHP, shrine 10
 *  and training perk 2. The HP-skill actor rewrites it without those three on the next frame (fightHPmax): use that for
 *  survival, this only for what the init statement writes. */
export function fightStartHPmax(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i]), active = [...arr(save, 'SkillActive')]
  active[10] = 0
  return playerHPmax({ ...save, SkillActive: active }) * (1 + potionBonuses(save).MaxHP / 100)
    * (1 + 15 * a('ShrineLevels', 10) / 100) * (1 + n(save.endLVL) * a('TrainingPerkLevels', 2) / 100)
}

/** PlayerHPmax a raid, Asylum or Conquest fight actually runs on: playerHPmax with the HP skill off. The HP-skill actor
 *  (ActorEvents_539) is placed in every fight scene (scene-9/16/32/41.mbs, not the select screens) and its draw listener,
 *  every frame while SkillTime[10] ≤ 0 (@10500239), sets SkillActive[10] = 0, rewrites PlayerHPmax without potion MaxHP,
 *  shrine 10 and training perk 2 (@10502958) and clamps PlayerHP to it (@10503175). So fightStartHPmax (the scene init's
 *  value, written in the 50 ms callback after PlayerHP = PlayerHPmax was already set) lasts until the next frame. Live
 *  2026-10-24 Asylum: PlayerHP 3.5217e14 = this; PlayerHPmax 1.0565e15 = this × (1 + 0.2·skill 18) while the HP skill ran.
 *  ponytail: the HP skill's ×(1 + 0.2·skill 18) on max (no heal of its own) is ignored; add it if casting it is modelled. */
export function fightHPmax(save: Save) {
  const active = [...arr(save, 'SkillActive')]
  active[10] = 0
  return playerHPmax({ ...save, SkillActive: active })
}

/** Raid boss MonstersDamage: the raid scene's (SceneEvents_16) draw listener rewrites it every frame while you're alive as
 *  per-hit base × TicketsToSpend × skill 16. Bases: King 2500 @19920679, Entertainer 1250 @19921572, Sentinel 12000
 *  @19922487, Demon 1e5 in phase 1 @19923476 and 5e4 in phase 2 @19923958. Boss actors that multiply it mid-fight are
 *  overwritten the next frame. boss = 0..3 (RaidBossQueue 1-4). */
export function raidMonstersDamage(save: Save, boss: number, tickets: number, demonPhase = 1) {
  const base = [2500, 1250, 12e3, demonPhase === 2 ? 5e4 : 1e5][boss]!
  return base * tickets * skill16(save)
}

/** Asylum boss MonstersDamage: the Asylum fight scene's (SceneEvents_41) draw listener, every frame while alive. Emigdala
 *  2e5·T^1.8 @26888467, Occulon 6e5·T^1.8 @26889377, Scallius 5e6·T^1.8 @26890288 (T = TicketsToSpend; the scene init
 *  and difficulty buttons write other values, @26883714-26887102 / @27007384+, which this listener replaces next frame).
 *  Gorshank only raises it to a floor: max(current, 8e7·T^1.8) in phase 1 @26891640, 2e8·T^1.8 in phase 2 @26892451, so
 *  its actors' mid-fight raises stick (×(1.4+T/20) on a phase-2 attack, ActorEvents_459 @9240163). At Z (T = 45) the
 *  listener then multiplies by 1.5^(4·bell) whenever bell > 0 @26893776 (bell = AsylumBell[boss], set from AsylumBellBEST
 *  when the fight starts @26882289, each ring +1 via ActorEvents_1293 @4524211). For Emigdala to Scallius that is a
 *  fixed ×1.5^(4·bell); Gorshank's floor doesn't reset it, so with bell ≥ 1 its damage multiplies again every frame
 *  (returned as Infinity). boss = 0..3 (RaidBossQueue 5-8). */
export function asylumMonstersDamage(save: Save, boss: number, tickets: number, bell = 0, demonPhase = 1) {
  const base = [2e5, 6e5, 5e6, demonPhase === 2 ? 2e8 : 8e7][boss]! * Math.pow(tickets, 1.8) * skill16(save)
  return tickets !== 45 || bell <= 0 ? base : boss === 3 ? Infinity : base * Math.pow(1.5, 4 * bell)
}

/** Conquest (crusade fight scene, SceneEvents_32) MonstersDamage, set at fight start @23187602 and after each stage
 *  @23382755: ConquestBaseDMG·(1 + ConquestMobDMG/100) on the mob stages (mapleLV 0-3) plus ConquestBaseDMG·(1 +
 *  ConquestBossDMG/100)·floor(mapleLV/3.5) on the boss stages (4-6 once, 7 twice), × skill 16. The Conquest* inputs are
 *  set per crusade and difficulty by the select scenes (@23191106+, @23996534+), not ported. */
export function conquestMonstersDamage(save: Save) {
  const L = n(save.mapleLV), B = n(save.ConquestBaseDMG)
  return (B * (1 + n(save.ConquestMobDMG) / 100) * Math.floor((7.5 - L) / 4) + B * (1 + n(save.ConquestBossDMG) / 100) * Math.floor(L / 3.5)) * skill16(save)
}

/** MonsterHitRequirement (per frame, regular zones): the attack level the current monster needs. null elsewhere. */
export function monsterHitRequirement(save: Save): number | null {
  const m = n(save.currentfightmode), L = n(save.mapleLV), z = n(save.FightZoneTYPE), a = (k: string, i: number) => n(arr(save, k)[i])
  const base = z === 1 ? (25 * (m - 1) + (L * (0.6 + 0.3 * (m - 1)) + 6)) * (1 - Math.floor(m / 10))
    : z === 2 ? (750 * Math.pow(m - 10, 2) + 48 * L * (m - 10)) * (1 - Math.floor(m / 20)) * Math.pow(1.25, m - 10) : null
  if (base == null) return null
  const { C, E } = bonuses(save)
  return base / ((1 + 0.005 * n(save.waterLV) * a('AscentionLevel', 1)) * (C('HitChance') / 100 + E('Accuracy') / 100 + 1)
    * masteryBonuses(save)[5]! * (1 + (10 * a('TrainingPerkLevels', 1) + 5 * a('TrainingPerkLevels', 7)) / 100))
}

/** Hit chance % as the fight HUD shows it: ceil(100 - 5·(MonsterHitRequirement - atkLVL)), clamped to 0-100.
 *  The save key `Hitchance` is not this: it is the RNG roll for each attack (randomInt 1-1000, hits when above
 *  50·(requirement - atkLVL)), so it has nothing to port. */
export function hitChance(save: Save): number | null {
  const req = monsterHitRequirement(save)
  return req == null ? null : Math.max(0, Math.min(100, Math.ceil(100 - 5 * (req - n(save.atkLVL)))))
}

// ---- Player damage in the raid (SceneEvents_16) and Asylum (SceneEvents_41) scenes (#35) ----

/** The decks a raid or Asylum fight uses (link 10, labelled "Boss Looting" in game; scenes Raids9REAL = SceneEvents_16 @19872209, AsylumFight22REAL = SceneEvents_41 @26853600): 20 ms after entry each scene equips the card deck and the tinker deck whose
 *  DeckLinkList entry is 10 (cards: DeckLinkList[1..11] → CardDeckSelected @19872874 / @26854265; tinker:
 *  DeckLinkList[12..20] → EquipmentEquipped from EquipmentbyDeckList @19873741 / @26855132; last match wins). With no
 *  linked deck the deck you entered with stays on. The Conquest fight (SceneEvents_32) does the same for link 9 (@23143209). */
export function raidDecks(save: Save, link = 10): Save {
  const dl = arr(save, 'DeckLinkList').map(n), out: Save = { ...save }
  for (let d = 1; d <= 11; d++) if (dl[d] === link) out.CardDeckSelected = d
  for (let d = 1; d <= 9; d++) if (dl[d + 11] === link) {
    const eq = [...arr(save, 'EquipmentEquipped')]
    for (let i = 1; i <= 8; i++) eq[i] = n(arr(save, 'EquipmentbyDeckList')[8 * (d - 1) + i])
    Object.assign(out, { EquipmentEquipped: eq, TinkerDeckSelected: d })
  }
  return out
}

/** Stats the raid and Asylum scenes write for the fight, on a save from raidDecks(): Mastery at init (@19875686), the rest in
 *  the 50 ms callback that follows the deck swap (@19888588 raids, @26857259 Asylum; the same statements):
 *  MedallionDamageBoost @19908225, SmithingBaseAttack @19894966 (smithing.ts, older copy), YourCritChance @19899638,
 *  YourCriticalDamage @19901609, SkillBonusdmgPCT. CriticalChance/CriticalDamage equal YourCritChance/YourCriticalDamage
 *  while crit buffs 4 and 14 are off (@19999892; ActorEvents_294/974). null: PbonusCritDmg (a load-time potion total)
 *  isn't in this save. */
export function raidStats(save: Save) {
  if (save.PbonusCritDmg == null) return null
  const s = (i: number) => n(arr(save, 'SmithingItemLevel')[i]), a = (k: string, i: number) => n(arr(save, k)[i]), { C, E } = bonuses(save)
  return {
    Mastery: Math.floor(100 * (0.08 * a('SkillLevels', 7) + 0.2)) / 100,
    MedallionDamageBoost: 1 + (0.5 * s(1) + 0.75 * s(9) + 1.25 * s(17) + 2 * s(25) + 3.5 * s(33) + 5 * s(41) + 8 * s(49) + 15 * s(57) + 35 * s(65) + 100 * s(73)) / 100
      * (1 + 0.05 * a('AscentionLevel', 8)) * (1 + C('BaseMedallions') / 100),
    SmithingBaseAttack: smithingBaseAttack(save, 10, true),
    CriticalChance: Math.max(10 + 0.25 * s(24) + 0.75 * s(56) + C('CriticalChance') + E('CritChance') - 20 * n(save.CritToggles), 0),
    CriticalDamage: (1.25 + (0.75 * s(8) + 2.5 * s(40) + n(save.EventCritDmgBonus) + C('CriticalDamage') + 0.1 * a('AscentionLevel', 23) * zoneTotalCardLV(save)[4]!) / 100)
      * (1 + E('CritDMG') / 100) * (1 + n(save.PbonusCritDmg) / 100),
    SkillBonusdmgPCT: skillBonusDmgPct(save),
  }
}

/** GetPlayerDPS (custom block @2637594): the damage of one plain hit, which every fight scene turns into its DPS (main
 *  fight as is, raids ÷ TicketsToSpend, Asylum ÷ TicketsToSpend × block). Reads SmithingBaseAttack and
 *  MedallionDamageBoost from `save` (pass raidStats' values for raids). null with the reason when an input is a load-time
 *  value this save lacks (cloud saves: PbonusDamageSUM, TankBonusLIST). Skill 10 is treated as off (its ×(1 + 0.2·skill 18) only applies while cast). */
export function getPlayerDPS(save: Save): number | { missing: string } {
  const a = (k: string, i: number) => n(arr(save, k)[i]), { C, E } = bonuses(save), realm = (save.RealmStuff as any[] | undefined) ?? []
  const missing = ['PbonusDamageSUM', 'TankBonusLIST'].filter((k) => save[k] == null)
  if (missing.length) return { missing: missing.join(', ') }
  let aa14 = 0
  for (let i = 1; i <= 8; i++) aa14 += a('CultLuckLV', i) + a('AcolyteLV3', i)
  const aa6 = (1 + 10 * a('ConstructLV', 6) * aa14 / 100) * Math.pow(1.08, Math.max(0, n(realm[13]?.[1]))) * (1 + fruitBonus(save, 15) / 100)
    * Math.pow(1 + realmVending(1, n(realm[8]?.[1])) / 100, n(realm[23]))
  const str = n(save.strLVL), atk = n(save.atkLVL), water = n(save.waterLV), sl = (i: number) => a('SkillLevels', i), asc = (i: number) => a('AscentionLevel', i)
  const t = (25 * str + 8 * atk + 2 * n(save.endLVL) + n(save.SmithingBaseAttack)) * n(save.MedallionDamageBoost) * ((str + 10) / 10) * ((atk + 25) / 25)
    * (1 + 0.005 * water * asc(5)) * (1 + n(save.EventBonusDamage) / 100)
  const rift = 1 + Math.floor(15 * Math.min(a('RiftLVL', 3), 1) + 5 * a('RiftLVL', 3)) / 100
  const merit = 1 + Math.floor(n(save.MeritsSpent) / 10) * Math.floor(sl(38)) / 100 + 0.5 * sl(39) * n(save.ContractsCompleted) / 100
  const civ = (1 + n(save.CivType) / 2) * (1 + asc(44) * Math.max(water - 100, 0) / 100)
  const c44 = a('ConstructLV', 44), pot = (1 + n(save.PbonusDamageSUM) / 100) * aa6 * (1 + 100 * Math.pow(c44, 1.10128) * Math.pow(1.02, c44) * Math.max(water - 1e3, 0) / 100)
  const x = t * rift * merit * (1 + C('TotalDamage') / 100) * (1 + E('TotalDmgPCT') / 100) * masteryBonuses(save)[1]! * civ * pot
    * (1 + 5 * asc(49) / 100) * (1 + 10 * asc(40) / 100) * (1 + 15 * asc(62) / 100) * Math.pow(1.1, n(save.CritToggles))
    * (1 + a('ShrineLevels', 1) * Math.max(str - 50, 0) / 100) * (1 + 3 * a('EventUpgradeLevels', 1) / 100) * (1 + 10 * a('ShrineLevels', 10) / 100)
    * a('TankBonusLIST', 8) * (1 + 2 * sl(61) / 100) * (1 + (5 * a('TrainingPerkLevels', 1) + 20 * a('TrainingPerkLevels', 7) + 50 * a('TrainingPerkLevels', 14)) / 100)
  return Math.pow(x, 2 / (Math.max(n(save.IceCream), 1) + 1))
}
