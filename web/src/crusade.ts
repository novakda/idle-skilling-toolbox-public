// Crusades / Conquest (#31): the crusade fight (SceneEvents_32), the crusade select screen (SceneEvents_35) and the idle
// crusaders that win victories while you're away (claimed by ActorEvents_995 in the select screen). Every formula is ported
// from Qno2x.js (offsets †) and checked in crusade.test.ts against values a save stores or the game's own code in the
// sandbox; everything here is computed from the save alone.
import { equipmentBonuses, masteryBonuses } from './bus'
import { current } from './screen-bound'
import { cbonus, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { fightStartHPmax, getPlayerDPS, monsterDamageReduction, raidDecks } from './combat'
import { smithingBaseAttack } from './smithing'
import { cooldownSecond, fightContext, FOOD, landed, type Fight } from './fight-sim'
import { CRUSADES } from './crusade-data'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
/** The deck link the crusade fight scene equips 20 ms after entry (card and tinker decks linked to 9, Fighting, † @23143209). */
export const LINK = 9
/** The select screen, where idle crusader victories are claimed (ActorEvents_995), equips the decks linked to 5, Crusades
 *  († @23897104; the Tinkering screen does the same, @22890216). So claim bonuses come from the Crusades-linked decks. */
export const CLAIM_LINK = 5

export { CRUSADES } from './crusade-data'
export const COUNT = 15

/** Material names by id: the claim sorts ids into tiers of 16 (> 80, > 64, > 48, > 32, > 16), the wiki names the art
 *  "Common1".."Legendary16" (crusade 1 drops ids 1, 2, 11, 17, 26 = Common1, Common2, Common11, Uncommon1, Uncommon10). */
const TIERS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
/** The wiki numbers Pearlescent art (ids 81-89) out of id order, so those are named by id. */
export const materialName = (id: number) => (id > 80 ? `Pearlescent (id ${id})` : `${TIERS[Math.floor((id - 1) / 16)]} ${(id - 1) % 16 + 1}`)

/** Fight stats of crusade c at difficulty d (the fight scene's init block, see CRUSADES). */
export function stats(s: Save, c: number, d: number) {
  const k = CRUSADES[c]!, x = d - 1, m = Math.min(x, 1), C = cbonus(s, catalog as unknown as Catalog), E = equipmentBonuses(s).scalar
  const acc = (1 + 0.005 * n(s.waterLV) * n(arr(s, 'AscentionLevel')[1])) * (1 + n(C.CbonusHitChance) / 100) * (1 + n(E.EbonusAccuracy) / 100)
  const f = ([a, b, g]: [number, number, number]) => (a + b * x) * g ** x * m
  const attacks = Math.floor(k.attacks[0] + d / k.attacks[1])
  return {
    base: k.base, dmg: k.dmg, hp: k.hp, req: (k.req[0] + (k.req[1] * x) / (x + 25)) / acc, def: k.def[0] * k.def[1] ** x,
    mobHP: f(k.mobHP), mobDMG: f(k.mobDMG), bossHP: f(k.bossHP), bossDMG: f(k.bossDMG), attacks,
    weapon: k.weapon[0] / (k.weapon[1] * x + 1), recharge: Math.max(k.recharge[0] / (k.recharge[1] * x + 1) / attacks, 0.1),
  }
}

/** Stage HP (mapleexpREQ, the fight's draw listener † @23364200), stages L = 0-3 mobs and 4 the boss, skill 16 off:
 *  BaseHP·(1 + MobHP/100)·(1 + L·⌈c/3⌉/2) for mobs, BaseHP·(1 + BossHP/100)·(2 + 4⌈c/3⌉/3 + ⌈c/3⌉) for the boss. */
export function stageHP(st: ReturnType<typeof stats>, c: number) {
  const u = Math.ceil(c / 3)
  return [0, 1, 2, 3].map((L) => st.hp * (1 + st.mobHP / 100) * (1 + (L * u) / 2)).concat(st.hp * (1 + st.bossHP / 100) * (2 + (4 * u) / 3 + u))
}
/** Seconds between mob hits on stage L: MonstersDamageSpeed = 2 − min(0.1·c·(1 + L/8), 1.8) († @23363278). */
export const mobInterval = (c: number, L: number) => 2 - Math.min(0.1 * c * (1 + L / 8), 1.8)

/** RewardPCT the claim uses (ActorEvents_995 † @17977066): (100 + 15x)·q^x·(1 + CbonusCrusadeMulti/100)·PbonusCrusMATS1·
 *  (1 + EbonusCrusadeMulti/100), q = 1.1 + 0.34095·⌊ConquestSelected/14⌋ (the selected crusade, not the claimed one). The
 *  select screen's copy (stored ConquestRewardPCT, † @24154310) also multiplies MasteryBonuses[30]. */
export function rewardPct(s: Save, d: number, shown = false) {
  const q = 1.1 + 0.34095 * Math.floor(n(s.ConquestSelected) / 14)
  return (100 + 15 * (d - 1)) * q ** (d - 1) * (1 + n(s.CbonusCrusadeMulti) / 100) * n(s.PbonusCrusMATS1 ?? 1) * (1 + n(s.EbonusCrusadeMulti) / 100)
    * (shown ? n(current(s, 'MasteryBonuses', () => masteryBonuses(s))[30] ?? 1) : 1)
}

/** PbonusCrusadeExp and PbonusCrusMATS1 (potion block † @26009232, @26009918): 4·P35 + 3250·P148/(P148 + 175), and
 *  1 + 300·P148/(P148 + 175)·max(ConquestLV − 160, 0)/100. */
export function potion(s: Save) {
  const P = (i: number) => n(arr(s, 'PotionLV')[i]), p148 = P(148) / (P(148) + 175)
  return { PbonusCrusadeExp: 4 * P(35) + 3250 * p148, PbonusCrusMATS1: 1 + 300 * p148 * Math.max(n(s.ConquestLV) - 160, 0) / 100 }
}
/** The save with the select screen's inputs recomputed the way it sets them: the link-9 decks' card and gear bonuses
 *  (cloud saves lack every Cbonus/Ebonus) and the two potion values. */
export function withCrusade(save: Save): Save {
  const s = raidDecks(save, CLAIM_LINK), C = cbonus(s, catalog as unknown as Catalog), E = equipmentBonuses(s).scalar
  return { ...save, ...potion(save), CbonusCrusadeEXP: n(C.CbonusCrusadeEXP), CbonusCrusadeMulti: n(C.CbonusCrusadeMulti),
    EbonusCrusadeEXP: n(E.EbonusCrusadeEXP), EbonusCrusadeMulti: n(E.EbonusCrusadeMulti), CbonusInactiveCrusaders: n(C.CbonusInactiveCrusaders), EbonusCrusaders: n(E.EbonusCrusaders) }
}

const expMult = (s: Save) => (1 + n(s.CbonusCrusadeEXP) / 100) * (1 + n(s.EbonusCrusadeEXP) / 100) * (1 + n(s.PbonusCrusadeExp) / 100)
  * (1 + (10 * n(arr(s, 'SkillLevels')[43])) / 100) * (1 + n(s.MTXdoubleCrusadeEXP))
/** What one claimed victory of crusade c at difficulty d pays (ActorEvents_995 † @17977066-@17985991): Crusade EXP
 *  (1 + (R/100 − 1)^0.7)·11.5·base·(1 + 20%·ContractRank[51])·EXP bonuses, and for each drop slot open at d, chance/100 × qty of
 *  that material (added as is, no roll). At d < 1, R/100 − 1 < 0 and the EXP is NaN (see nanRisk). */
export function perVictory(s: Save, c: number, d: number) {
  const k = CRUSADES[c]!, R = rewardPct(s, d)
  const exp = (1 + ((R / 100 - 1) / 1) ** 0.7) * 11.5 * k.base * (1 + (20 * n(arr(s, 'ContractRank')[51])) / 100) * expMult(s)
  const Q = (R / 100) * (1 + (c - 1) / 4), half = 1 + 0.5 * Math.floor(c / 3)
  const mats = k.drops.filter(([t]) => d >= t).map(([, id]) => {
    const aa = (1 + (id / 16 - Math.floor((id - 1) / 16)) / 2) / (1 + (c - 1) / 13)
    const [chance, qty] = id > 80 ? [Math.min(0.2 / (0.8 * aa), 100), Math.max((0.2 / (1.2 * aa)) * (1 + ((Q - 1) / 100) ** 0.5), 1)]
      : id > 64 ? [Math.min(0.6 / (0.7 * aa), 100), Math.max((0.5 / (1.2 * aa)) * (1 + ((Q - 1) / 50) ** 0.55), 1)]
      : id > 48 ? [Math.min(5 / (0.8 * aa), 100), Math.max(((1.2 * half) / (1.2 * aa)) * (1 + ((Q - 1) / 25) ** 0.58), 1)]
      : id > 32 ? [Math.min(5 / (0.8 * aa), 100), Math.max(((3 + c / 10) / (1.2 * aa)) * (1 + ((Q - 1) / 15) ** 0.6) * half, 1)]
      : id > 16 ? [Math.min(15 / aa, 100), Math.max(((10 + c / 3) / (1.2 * aa)) * (1 + ((Q - 1) / 5) ** 0.63) * half, 1)]
      : [Math.min(45 / aa, 100), Math.max((50 / (1.2 * aa)) * (1 + (Q - 1) ** 0.7) * half, 1)]
    return { id, qty: (chance / 100) * qty }
  })
  return { exp, mats }
}

/** The Crusade EXP/day the crusade info pane shows (ActorEvents_997 † @18149777, stored as CrusadeEXPperday): for the
 *  selected crusade, 12·11.5·base·(1 + (R/100 − 1)^0.7)·crusaders·EXP bonuses with the stored (select screen) R, which
 *  carries MasteryBonuses[30] but not the claim's ContractRank[51] term. */
export function shownExpPerDay(s: Save) {
  const c = n(s.ConquestSelected), d = n(arr(s, 'ConquestDifficultyselected')[c])
  return 12 * 11.5 * CRUSADES[c]!.base * (1 + (rewardPct(s, d, true) / 100 - 1) ** 0.7) * n(arr(s, 'ActiveCrusaders')[c]) * expMult(s)
}

/** TotalCrusaders (screen-switch actor † @4313349): 2 + ⌊ConquestLV⌋ + card and gear "+ inactive crusaders" + training perk 5
 *  + round(2·r + ⌊r/6⌋·(r − 5)) (r = ContractRank[47]) + 2·SkillLevels[42]. */
export function totalCrusaders(s: Save) {
  const r = n(arr(s, 'ContractRank')[47])
  return 2 + Math.floor(n(s.ConquestLV)) + n(s.CbonusInactiveCrusaders) + n(arr(s, 'TrainingPerkLevels')[5]) + n(s.EbonusCrusaders)
    + Math.round(2 * r + Math.floor(r / 6) * (r - 5)) + 2 * n(arr(s, 'SkillLevels')[42])
}

/** ConquestREQ after a level-up to L in the select screens (SceneEvents_31 † @23020832, SceneEvents_35 @24164386, where
 *  claims land): (1.35·REQ + 200⌊L/10⌋ + 1000⌊L/25⌋ + 3L^2.1) × 1.01 from 50, × 1.015 from 70, × 1.02 from 80. A level
 *  takes REQ·(1 − min(GiftShopLevels[30]/5, 50)/100) EXP († @23020648). (The fight scene levels with 1.34·REQ + … and no
 *  multipliers, † @23407989; only active fights level there.) */
export function nextReq(req: number, L: number) {
  return (1.35 * req + 200 * Math.floor(L / 10) + 1e3 * Math.floor(L / 25) + 3 * L ** 2.1) * (L >= 50 ? 1.01 : 1) * (L >= 70 ? 1.015 : 1) * (L >= 80 ? 1.02 : 1)
}
/** Days of `perDay` Crusade EXP to reach level `to`, from the save's level, EXP and requirement. */
export function daysTo(s: Save, to: number, perDay: number) {
  const gift = 1 - Math.min(n(arr(s, 'GiftShopLevels')[30]) / 5, 50) / 100
  let L = n(s.ConquestLV), req = n(s.ConquestREQ), need = -n(s.ConquestEXP)
  for (; L < to; L++) { need += req * gift; req = nextReq(req, L + 1) }
  return perDay > 0 ? Math.max(need, 0) / perDay : Infinity
}

/** Unlocked crusades with what their idle crusaders earn. Victories accrue 12 per crusader per day († @23912751:
 *  ConquestUnclaimedRewards[c] += seconds/86400·12·ActiveCrusaders[c]) and pay at the crusade's selected difficulty. */
export function crusades(s: Save) {
  const out = []
  for (let c = 1; c <= COUNT; c++) {
    const top = n(arr(s, 'ConquestDifficultyLV')[c])
    if (top < 1) continue
    const d = n(arr(s, 'ConquestDifficultyselected')[c]), active = n(arr(s, 'ActiveCrusaders')[c])
    const v = perVictory(s, c, d), best = perVictory(s, c, top)
    out.push({ c, name: CRUSADES[c]!.name, d, top, active, unclaimed: n(arr(s, 'ConquestUnclaimedRewards')[c]),
      nanRisk: !(d >= 1), expPerVictory: v.exp, expAtTop: best.exp, mats: v.mats, matsAtTop: best.mats, perDay: 12 * active })
  }
  return out
}

/** Material ids whose stored count is not a number (NaN, JSON null): what a claim at difficulty 0 leaves behind. */
export const brokenMaterials = (s: Save) => arr(s, 'CraftingMaterialsOwned').flatMap((q, id) => (id > 0 && !Number.isFinite(q as unknown as number) ? [id] : []))

/** Where crusaders earn the most Crusade EXP: all of them on the crusade whose victory pays the most at its highest unlocked
 *  difficulty (every crusader adds the same 12 victories a day wherever it is). Returns the per-day totals now and then. */
export function placement(s: Save) {
  const rows = crusades(s), total = rows.reduce((t, r) => t + r.active, 0)
  const now = rows.reduce((t, r) => t + r.perDay * (r.nanRisk ? 0 : r.expPerVictory), 0)
  const best = rows.reduce((b, r) => (r.expAtTop > b.expAtTop ? r : b), rows[0]!)
  return { rows, total, now, best, then: 12 * total * best.expAtTop }
}

// ---- Can you beat it? -----------------------------------------------------------------------------------------------
// Crusades have no auto-attack: every hit is a skill (as raids, raids.ts). The model casts each owned damage skill as its
// cooldown ends; each hit = DPS × skill multiplier × hit chance × average crit. DPS = GetPlayerDPS ÷ max((DEF − ignore flat)
// ·max(1 − ignore %/100, 0.1), 1) (the fight's DPS listener † @23403121), hit when randomInt(1,100) > 5·(requirement − atkLVL).


export type Cell = { d: number; ttk: number; die: number; verdict: 'win' | 'close' | 'no' }
export const CLOSE = 0.2
export const HORIZON = 600

/** One fight, in 20 ms ticks (the scene's windup ticker † @23382960). Mobs (stages 0-3) hit every mobInterval s for
 *  MonstersDamage·(1 − reduction)·boost, boost +0.03 per hit (CrusadeMobDmgBoost, reset at fight start); stage 0 uses the
 *  select screen's BaseDMG (MonstersDamage is set at init before the crusade block, † @23187602). The boss (stage 4) throws its
 *  weapon every `weapon` s while it has attacks left, then refills one per recharge period († @23401334); a weapon lands
 *  after max(weapon, 0.4) s (x 359 → 180 at 17.8/max(weapon, 0.4) velocity units, 10 px/s each, ActorEvents_993 @17901538;
 *  0.9 for crusade 7's weapon), raising MonstersDamage ×1.07 before it hits († @17925056). Hits empty the shield first, no
 *  carry-over. Damage in a stage beyond its HP is lost (mapleexp resets). Crusade 10 only (the one special modelled): 50 ms
 *  after the throw that empties its attacks it throws weapon 21 († @23400273), which lands 179 px later at 18 units (0.99 s)
 *  and heals the boss min(damage dealt, HP/5) and hits you for min(max HP/5, HP − 1) († @17932515). A cleared stage pauses the
 *  monsters for 0.25 s (MAPLElvTransition † @23369490); skill hits in that pause count toward the next stage. After the kill
 *  the boss keeps attacking in the model, so `die` is when you would have died (for the close/win margin). */
export function fight(f: Fight, c: number, d: number, events: [number, number][]): { ttk: number; die: number } {
  const st = stats(f.rd, c, d), hp = stageHP(st, c), red = 1 - monsterDamageReduction(f.rd), hpMax = fightStartHPmax(f.rd)
  const sl27 = n(arr(f.rd, 'SkillLevels')[27]), C = cbonus(f.rd, catalog as unknown as Catalog)
  const food = FOOD.map(([i, k, w]) => [k * n(arr(f.rd, 'SmithingItemLevel')[i]) * (1 + 0.2 * sl27) * (1 + n(C.CbonusHealingItems) / 100), w, 0] as [number, number, number]).filter((x) => x[0] > 0)
  const k = CRUSADES[c]!, mob0 = (k.sel?.[0] ?? k.dmg) * (1 + st.mobDMG / 100), mob = k.dmg * (1 + st.mobDMG / 100)
  let shield = (n(f.rd.ShieldPercentMAX) * hpMax) / 100, life = hpMax, boost = 1, L = 0, dealt = 0, wind = 0, left = st.attacks, rw = 0, rc = 0
  let bossDmg = k.dmg * (1 + st.bossDMG / 100), i = 0, ttk = Infinity, die = Infinity, pause = 0
  const flying: number[] = [], heals: number[] = [], travel = Math.max(st.weapon, c === 7 ? 0.9 : 0.4)
  const hit = (x: number) => { if (shield > 0) shield = Math.max(shield - x, 0); else life = Math.max(life - x, 0) }
  for (let t = 0.02; t <= HORIZON; t += 0.02) {
    for (; ttk === Infinity && i < events.length && events[i]![0] <= t; i++) {
      dealt += events[i]![1]
      if (dealt < hp[L]!) continue
      if (L === 4) ttk = t // the boss is dead; keep going (boss still attacking) only to see when you'd have died
      else { dealt = 0; wind = 0; pause = t + 0.25; L++ }
    }
    if (t > ttk / (1 - CLOSE)) break // a win whatever happens next
    if (t < pause) wind = 0 // stage transition: the monsters wait
    else if (L < 4) { wind += 0.02; if (wind >= mobInterval(c, L)) { wind = 0; hit((L === 0 ? mob0 : mob) * red * boost); boost += 0.03 } }
    else {
      wind += 0.02
      if (left < 1) { left = 0; rw += 0.02; if (rw > st.recharge) { rw = 0; if (rc + 1 < st.attacks) rc++; else { left = st.attacks; rc = 0 } } }
      if (left > 0 && wind >= st.weapon) { wind = 0; left--; flying.push(t + travel); if (c === 10 && left <= 0) heals.push(t + 0.05 + 179 / 180) }
      while (flying.length && flying[0]! <= t) { flying.shift(); bossDmg *= 1.07; hit(bossDmg * red) }
      while (heals.length && heals[0]! <= t) { heals.shift(); dealt -= Math.min(dealt, hp[4]! / 5); hit(Math.min(hpMax / 5, life - 1)) }
    }
    for (const fd of food) { fd[2] -= 0.02; if (fd[2] <= 0 && life < hpMax) { fd[2] = fd[1]; life = Math.min(life + fd[0], hpMax) } }
    if (life <= 0) { die = t; break }
  }
  return { ttk, die }
}

/** Skill hits as [time, damage] for crusade c at difficulty d over the horizon (raids.ts SKILLS, cast on cooldown). */
export function skillEvents(f: Fight, c: number, d: number): [number, number][] {
  const st = stats(f.rd, c, d), C = cbonus(f.rd, catalog as unknown as Catalog), E = equipmentBonuses(f.rd).scalar
  const dps = f.base / Math.max((st.def - (n(C.CbonusIgnoreDefFLAT) + n(E.EbonusIgnDefFLAT))) * Math.max(1 - (n(C.CbonusIgnoreDefPCT) + n(E.EbonusIgnDefPCT)) / 100, 0.1), 1)
  const hitP = (100 - Math.min(Math.max(Math.floor(5 * (st.req - n(f.rd.atkLVL))), 0), 100)) / 100
  const { CriticalChance: cc, CriticalDamage: cd, Mastery: M } = f.rs, crit = 1 + (Math.min(Math.max(Math.floor(cc), 0), 100) / 100) * (cd - 1)
  const out: [number, number][] = []
  for (const sk of f.skills) {
    const hits = sk.hits(f.ctx), m = sk.mult(f.ctx)
    for (let k = 0; k * sk.cd * f.cdSec < HORIZON; k++) for (const h of hits) {
      const w = landed(sk.time, h)
      if (w > 0) out.push([k * sk.cd * f.cdSec + h, dps * (dps < sk.thr ? (1 + M) / 2 : 1) * w * m * hitP * crit])
    }
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** Verdict at difficulty d: win = kill with 20% of the deadline to spare, close = within 20% either side, no = later. The
 *  deadline is the moment you die; with no death in 10 min, the 10-min horizon (there is no game time limit). */
export function cell(f: Fight, c: number, d: number): Cell {
  const { ttk, die } = fight(f, c, d, skillEvents(f, c, d)), r = ttk / Math.min(die, HORIZON)
  return { d, ttk, die, verdict: r <= 1 - CLOSE ? 'win' : r <= 1 + CLOSE ? 'close' : 'no' }
}

/** Per unlocked crusade: the verdict at its highest unlocked difficulty (the one to beat to unlock the next) and the highest
 *  difficulty you win, searched upward from there (verdicts assumed to worsen with difficulty). */
/** raids.ts's fight context for the crusade fight: the link-9 decks, and the scene init's SmithingBaseAttack, which is the
 *  main fight's copy (smithing.ts, not the raids' older one; † @23168087), so GetPlayerDPS is redone with it. */
export function conquestContext(save: Save): Fight | { missing: string } {
  const f = fightContext(save, LINK)
  if ('missing' in f) return f
  const rs = { ...f.rs, SmithingBaseAttack: smithingBaseAttack(f.rd, LINK) }, base = getPlayerDPS({ ...f.rd, ...rs, SkillActive: [] })
  return typeof base === 'number' ? { ...f, rs, base } : base
}

export function verdicts(save: Save) {
  const f = conquestContext(save)
  if ('missing' in f) return { missing: f.missing }
  const rows = crusades(save).map((r) => {
    const at = (d: number) => cell(f, r.c, d), front = at(r.top)
    let lo = front.verdict === 'win' ? r.top : 0, hi = r.top + 1
    if (lo) { while (at(hi).verdict === 'win' && hi < r.top + 400) { lo = hi; hi = r.top + 2 * (hi - r.top) } }
    else for (lo = r.top - 1; lo >= 1 && at(lo).verdict !== 'win'; lo = Math.floor(lo * 0.8)) hi = lo
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (at(m).verdict === 'win') lo = m; else hi = m }
    return { ...r, front, bestWin: lo >= 1 ? at(lo) : null }
  })
  return { rows, base: f.base, skills: f.skills.map((x) => x.name), cdSec: cooldownSecond(f.rd), hpMax: fightStartHPmax(f.rd),
    shieldPct: n(f.rd.ShieldPercentMAX), reduction: monsterDamageReduction(f.rd) }
}

/** Crusades whose boss throws more than its plain weapon (the fight's draw listener † @23396070-@23400689, effects in
 *  ActorEvents_993 † @17924277+). Not modelled; listed so the page can say so. */
export const SPECIALS: Record<number, string> = {
  3: 'when its attacks run out, a heavy throw (2.5-3× damage)', 4: '1 in 5 throws heals the boss 10%', 5: '1 in 2 throws adds a 1.3-2× hit',
  6: '1 in 4 throws raises its DEF ×1.1', 7: '1 in 10 throws raises your hit requirement (rewritten next frame)', 8: '1 in 3 throws adds 3 s to your skill cooldowns',
  9: '1 in 5 throws a bouncing hit', 11: '1 in 2 throws wipe your shield', 12: 'throws when you press a key: heals it 10%, hits you for up to 10% of max HP',
  13: '1 in 2 throws heal it 10%, hit you for up to 10% of max HP and raise your hit requirement',
}
