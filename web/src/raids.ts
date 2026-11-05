// Raids tab (#30): ticket costs, run times and unlocks for Raids (RaidTYPE 1: select SceneEvents_12 → fight SceneEvents_16)
// and the Asylum (RaidTYPE 2: select SceneEvents_39 → fight SceneEvents_41). Read from Qno2x.js; boss and difficulty names are the game's own (DEFEAT_DAYDREAM_KING … @16517614-@16537351, EMIGDALA_X … @22260203-@22260622).
import { asylumMonstersDamage, fightHPmax, monsterDamageReduction, raidMonstersDamage } from './combat'
import { equipmentBonuses, masteryBonuses } from './bus'
import { cbonus, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { FOOD, SHIELD_FOOD, fightContext, runSeconds, skillEvents, type Fight } from './fight-sim'
import { TIERS } from './raid-data'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const range = (k: number) => Array.from({ length: Math.max(k, 0) }, (_, i) => i)

export { TIERS } from './raid-data'

/** Bosses by queue slot (RaidBossQueue 1-4 raids, 5-8 asylum; ActorEvents_577 @10669506). Slot 1/5 is always open; the
 *  others need the unlock flag, which Steam Cloud saves don't carry (local-only, #19). The only writes of true are in the
 *  win handler (mapleexp ≥ mapleexpREQ) of the previous boss, unconditional within its branch, so beating it once on any
 *  difficulty unlocks the next (offset = the write). The same handler sets RaidBossKilled[slot] = max(it, TicketsToSpend),
 *  the best difficulty beaten (raids @19937098+, asylum @26901335+). The only false writes are the bulk resets @20954525 /
 *  @21024011 (with RaidBossKilled[0..4] = 0, @20946509 / @21015995). */
export const BOSSES = {
  raid: [['King', null, 0], ['Entertainer', 'IsbossBunlocked', 19938283], ['Sentinel', 'IsbossCunlocked', 19953387], ['Demon', 'IsbossDunlocked', 19968626]],
  asylum: [['Emigdala', null, 0], ['Occulon', 'IsBossB2unlocked', 26913838], ['Scallius', 'IsBossC2unlocked', 26931891], ['Gorshank', 'IsbossD2unlocked', 26948210]],
} as const

/** Hits a boss needs to kill you from the start of a fight (HP = fightHPmax, what the HP-skill actor holds it at). Each hit takes MonstersDamage·(1 − MonsterDamageReduction) off
 *  the shield (ShieldPercent, % of PlayerHPmax, starts at ShieldPercentMAX) until it is empty, with no carry-over, then off
 *  PlayerHP (raids @19996137/@19996445; Asylum boss actors the same, e.g. @9240585). No healing, food or other attacks. */
export function hitsToKill(save: Save, dmg: number) {
  const hp = fightHPmax(save), d = dmg * (1 - monsterDamageReduction(save)), shield = n(save.ShieldPercentMAX) * hp / 100
  return !(d > 0) ? Infinity : (shield > 0 ? Math.ceil(shield / d) : 0) + Math.ceil(hp / d)
}

const KILLS = ['RaidBossAkills', 'RaidBossBkills', 'RaidBossCkills', 'RaidBossDkills']

export function raids(save: Save) {
  const unlock = (k: string | null) => k == null ? true : k in save ? save[k] === true || save[k] === 1 : null // null = not in this save
  const best = save.RaidBossKilled as number[] | undefined
  const noSkill16 = { SkillActive: [] }, bellBest = (save.AsylumBellBEST as number[] | undefined) ?? []
  const bosses = (Object.keys(BOSSES) as (keyof typeof BOSSES)[]).flatMap((type) => BOSSES[type].map(([name, key, at], i) => {
    const prev = BOSSES[type][i - 1], b = best?.[(type === 'raid' ? 0 : 4) + i] // previous boss's slot (1-4 / 5-8)
    const tier = TIERS[type].tiers.find((t) => t[1] === b)
    return {
      type, name, key, unlocked: unlock(key), kills: type === 'raid' && KILLS[i]! in save ? n(save[KILLS[i]!]) : null,
      needs: prev ? `Beat ${prev[0]} once, any difficulty † @${at}` : null,
      // best difficulty beaten on the previous boss: 0 = never; a TicketsToSpend value maps to the difficulty name
      prevBest: !prev || b == null ? null : !b ? 'not yet' : tier ? `${prev[0]} ${tier[0] || 'base'}` : `TicketsToSpend ${b}`,
      // Per difficulty: the boss's hit (skill 16 off; Demon/Gorshank phase 1; Asylum Z at the bell the fight starts with) and
      // how many hits it takes to kill you.
      damage: TIERS[type].tiers.map(([d, T]) => {
        const hit = type === 'raid' ? raidMonstersDamage(noSkill16, i, T) : asylumMonstersDamage(noSkill16, i, T, n(bellBest[i + 1]))
        return { difficulty: d, hit, hits: hitsToKill(save, hit) }
      }),
    }
  }))
  // Raid tickets (SceneEvents_12 @19786900-19788173): TimetonextTicket counts seconds (offline time added on entry);
  // past 7200 it gives 1 ticket (2 with chance 5·AscentionLevel[17]%) and drops by 7200·(1 − 7%·MasteryPerksUnlocked[80]).
  const m80 = n((save.MasteryPerksUnlocked as number[] | undefined)?.[80]), a17 = n((save.AscentionLevel as number[] | undefined)?.[17])
  const interval = 7200 * (1 - 0.07 * m80)
  return {
    bosses, startHP: fightHPmax(save), shieldPct: n(save.ShieldPercentMAX), reduction: monsterDamageReduction(save),
    localOnlyMissing: bosses.some((b) => b.unlocked == null),
    tickets: { raid: n(save.HellTickets), asylum: n(save.AsylumTickets) },
    raidTicketsPerHour: 3600 / interval * (1 + Math.min(Math.max(5 * a17 - 1, 0), 100) / 100), // randomInt(1,100) < 5·a17
    nextRaidTicketIn: Math.max(0, 7200 - n(save.TimetonextTicket)),
  }
}

// ---- Can you beat it? (#35) ----------------------------------------------------------------------------------------
// Raids and the Asylum have no auto-attack (the only `speedValues >= dpsspeed` hit is the main fight's, @31856390, and
// autocast is only set there, @31900382): every point of damage is a skill you hover (or key) as it comes off cooldown.
// The model casts every damage skill you own the moment it is ready and averages the dice.

/** Boss HP (mapleexpREQ), rewritten every frame by the scenes' draw listeners. Bases are game-attribute defaults no code
 *  writes (BossAhpTOT, bossBhpTOT, bossChpTOT, bossDhpTOT; float32 5e7, 1e9, 5e10, 1e12 as every local save stores them).
 *  Raids: base·T·(1+4·skill 16) @19919886 / @19920779 / @19921672 / @19922590 (the raid Demon never reaches phase 2:
 *  SceneEvents_16 only writes DemonPhase 0/1). Asylum: Emigdala 10000000.1·A·T^8·(1+4·sk) @26887639, Occulon
 *  1500000000.1·B·T^7·(1+6·sk) @26888547, Scallius 2000000000.1·C·T^10·(1+6·sk) @26889457, Gorshank
 *  1e11·D·T^9·(1+6·sk)·phase² @26890372 (phase 2 starts from 0 damage, @26951683); at Z × 5^(4·bell) @26892545. */
export const HP_BASE = [5e7, 1e9, 49999998976, 999999995904]
export function bossHP(type: 'raid' | 'asylum', boss: number, T: number, bell = 0, phase = 1, skill16 = 0) {
  if (type === 'raid') return HP_BASE[boss]! * T * (1 + 4 * skill16)
  const k = [[10000000.1, 8, 4], [1500000000.1, 7, 6], [2000000000.1, 10, 6], [1e11, 9, 6]][boss]!
  return k[0]! * HP_BASE[boss]! * Math.pow(T, k[1]!) * (1 + k[2]! * skill16) * (boss === 3 ? phase ** 2 : 1) * (T === 45 ? Math.pow(5, 4 * bell) : 1)
}

/** AsylumBlock at fight start (@27002064+, e.g. Gorshank Z 75e3 @27021697) and at Gorshank's phase 2 (@26952279), by
 *  difficulty. Every 50 ms it drops to (block − 1)/1.005, to 0 once ≤ 3 (@27033565); your Asylum DPS is
 *  GetPlayerDPS/T × max(1 − ((6(B+10)+10)/(3(B+10)+40) − 1), 0) = ×70/(3B+70) (@26992321). */
const BLOCK = [[100, 250, 800, 5e3], [125, 400, 2e3, 1e4], [300, 1500, 6e3, 25e3], [1e3, 5e3, 3e4, 75e3], [2e3, 12500, 5e4, 15e4]]
// Closed form of k ticks: B_k + 200 = (B_0 + 200)/1.005^k, until a tick starts at ≤ 3.
export function blockAt(b0: number, sec: number) {
  const k = Math.floor(sec / 0.05 + 1e-9), prev = (b0 + 200) * Math.pow(1.005, 1 - k) - 200
  return k === 0 ? b0 : prev > 3 ? (prev - 1) / 1.005 : 0
}

/** Attack level a skill hit must beat (the scenes' DPS listeners): raids 40+5T, 55+6T, 85+6T, 110+6T (@19999972..@20002558),
 *  Asylum 150+8T, 210+13T, 300+16T, 425+20T (@26993019..@26995615), ÷ (1+0.5%·water·perk 1)(1+card hit%)(1+gear accuracy)·mastery 5.
 *  A skill hit lands when randomInt(1,100) > 5·(requirement − atkLVL). */
export function skillHitRequirement(save: Save, type: 'raid' | 'asylum', boss: number, T: number) {
  const C = cbonus(save, catalog as unknown as Catalog), E = equipmentBonuses(save).scalar
  const base = type === 'raid' ? [40 + 5 * T, 55 + 6 * T, 85 + 6 * T, 110 + 6 * T][boss]! : [150 + 8 * T, 210 + 13 * T, 300 + 16 * T, 425 + 20 * T][boss]!
  return base / ((1 + 0.005 * n(save.waterLV) * n((save.AscentionLevel as number[] | undefined)?.[1])) * (1 + n(C.CbonusHitChance) / 100)
    * (1 + n(E.EbonusAccuracy) / 100) * masteryBonuses(save)[5]!)
}
export const skillHitChance = (save: Save, type: 'raid' | 'asylum', boss: number, T: number) =>
  (100 - Math.min(Math.max(Math.floor(5 * (skillHitRequirement(save, type, boss, T) - n(save.atkLVL))), 0), 100)) / 100


/** Boss hits, raids only (SceneEvents_16 every 20 ms, @19982897): MonstersDamageWindup += 0.01 King, 0.08 Entertainer, 0.05
 *  Sentinel, 0.0156862745 Demon; a hit when it reaches MonstersDamageSpeed (2, set at entry @19874574), then back to 0
 *  (Demon −0.6078431369, also its start, @19995481). The Sentinel's windup only runs while nodamageraid is 1, which flips
 *  every 5 s (@19998447) — and while it's 0 your skills can't hit it either (requirement 1e8, @20003463). */
export function raidBossHitTime(boss: number, hits: number) {
  const [inc, from] = [[0.01, 0], [0.08, 0], [0.05, 0], [0.0156862745, -0.6078431369]][boss]!
  let w = from, k = 0
  while (!(w >= 2)) { w += inc; k++ }
  const per = 0.02 * k
  if (boss !== 2) return hits * per
  const inWindow = Math.floor(5 / per) // hits per 5 s on-window (assumed to open as the fight starts)
  return Math.floor((hits - 1) / inWindow) * 10 + ((hits - 1) % inWindow + 1) * per
}


/** Expected seconds to kill (Infinity if not within `horizon`): every owned damage skill cast at 0 and again each time its
 *  cooldown ends; each hit = scene DPS × skill multiplier × hit chance × average crit (× (1+Mastery)/2 under the skill's
 *  low-DPS threshold) × the share of hits that land. Sentinel: × 0.5 (immune half the time). `skill16` = Mark on (boss HP up). */
export function timeToKill(f: Fight, type: 'raid' | 'asylum', boss: number, T: number, bell: number, horizon: number, skill16 = 0) {
  return phaseEnds(f, type, boss, T, bell, horizon, skill16).at(-1)!
}
/** When each boss phase ends (Infinity from the first one not reached); Gorshank has two. */
export function phaseEnds(f: Fight, type: 'raid' | 'asylum', boss: number, T: number, bell: number, horizon: number, skill16 = 0) {
  const hitP = skillHitChance(f.rd, type, boss, T) * (type === 'raid' && boss === 2 ? 0.5 : 1)
  const { CriticalChance: cc, CriticalDamage: cd, Mastery: M } = f.rs, crit = 1 + Math.min(Math.max(Math.floor(cc), 0), 100) / 100 * (cd - 1)
  const events = skillEvents(f, horizon)
  const phases = type === 'asylum' && boss === 3 ? [1, 2] : [1]
  let i = 0, start = 0
  const ends: number[] = []
  for (const ph of phases) {
    const hp = bossHP(type, boss, T, bell, ph, skill16), b0 = type === 'asylum' ? BLOCK[ph === 2 ? 4 : boss]![TIERS.asylum.tiers.findIndex((t) => t[1] === T)]! : 0
    let dealt = 0
    for (; i < events.length && events[i]![0] <= horizon; i++) {
      const [t, wm, thr] = events[i]!
      const dps = f.base / T * (type === 'asylum' ? 70 / (3 * blockAt(b0, t - start) + 70) : 1)
      dealt += dps * (dps < thr ? (1 + M) / 2 : 1) * wm * hitP * crit
      if (dealt >= hp) { start = t; i++; break }
    }
    if (dealt < hp) return [...ends, ...phases.slice(ends.length).map(() => Infinity)]
    ends.push(start)
  }
  return ends
}

// ---- Surviving the Asylum (#35) -------------------------------------------------------------------------------------
// Each Asylum boss (ActorEvents_459, one animation per boss) starts a 20 ms ticker in its entrance callback, the one that
// also starts the run timer: SpareTimer += inc, and past th it resets and the boss throws a volley of projectile actors
// (ActorEvents_993, frame = ConquestWeaponType). The player never moves, so every projectile hits once: md ×
// MonstersDamage·(1 − reduction) off the shield (as % of PlayerHPmax, no carry-over) while it is up, else off HP, then
// `flat` shield points (shield only). Random volleys are averaged: a p-chance volley fires on each cycle where its
// running expected count (from ½) passes a whole number. `at` = seconds from the cycle to the hit: the projectile's own
// timer where it has one (†), else a flight time worked out from its velocities (unverified).
type Shot = { at: number; p?: number; n?: number; md?: number; flat?: number; kids?: true; ret?: true; keep?: number; p1?: true; grow?: true }


/** Boss attack patterns (ActorEvents_459 anims 14-17; projectile hits in ActorEvents_993). */
export function asylumAttacks(boss: number, T: number) {
  const th = boss === 0 ? Math.max(3 - Math.pow(T, 0.35), 0.1) : Math.max(5 - 1.5 * Math.pow(T, 0.35), 1.1)
  const inc = boss < 2 ? 0.02 : 0.03, x = (c: boolean, s: Shot[]) => (c ? s : [])
  if (boss === 0) return { inc, th, start: [{ at: 0.57, md: 1 }] as Shot[], cycle: [
    { at: 0.57, md: 1 }, // 25: a timer hit 570 ms after the throw † @17908604 (cycle † @9223027)
    { at: 4.2, p: 1 / 3, md: 3.15 }, // 26 at +1.7 s (randomInt(1,3) = 1 † @9223681), turns into 27 1.7 s later, hits on landing ×randomFloat(1.3, 5) † @17938754
    ...x(T > 1, [{ at: 5, p: 0.1, n: 30, flat: Math.round(Math.pow(T, 0.8)) }]), // laser: 30 × 30 at +4.1 s (1 in 10 † @9224141), round(T^0.8) shield points each † @17941669
  ] }
  if (boss === 1) {
    const d = 1 / (Math.pow(25 * T, 0.5) - 3) + 0.015, k = range(30).filter((i) => i * d < 1).length // † @9228679
    return { inc, th, start: [{ at: 1.3, md: 1 }] as Shot[], cycle: [
      { at: 1.3, md: 6.3 }, // 29: bounces in place, each landing ×randomInt(17,25)/10 and gone 1 time in 3 (avg 3 hits) † @17940198
      ...x(T > 1, [{ at: 3.9, p: 1 / 3, md: 23.5, flat: T * T + 10 }]), // 31: ×randomInt(70,400)/10 plus T²+10 shield points † @17942547
      { at: 1.31 + (d * (k - 1)) / 2, n: k, md: 1 }, // 28 stream: a timer hit 1.3 s after each throw † @17910926
    ] }
  }
  if (boss === 2) {
    const kid = { md: 0.2, flat: Math.round(Math.pow(T, 0.4) + 1), kids: true } as const // 33 child: ×randomInt(1,3)/10 + round(T^0.4+1) shield points † @17945439
    return { inc, th, start: x(T > 1, [{ at: 0, n: 1 + Number(T > 5) + 2 * Number(T > 20), ...kid }]), cycle: [ // parents at the entrance † @9230834
      { at: 0.6, md: 1 }, // 34: a timer hit 0.62 − (y−170)/400 s after the throw † @17917455
      { at: 2.8, p: 1 / 3, n: range(7).filter((i) => i < Math.sqrt(T)).length, md: 23.5 }, // 32 volley ×randomInt(70,400)/10 † @9232719, @17944318
      ...x(T > 1, [{ at: 1.63, p: 1 / 7, ...kid }]), // a 33 parent † @9233348: hovers 10 s, dropping a child every 1 s that hits ~0.95 s later † @17915810
    ] as Shot[] }
  }
  const flat = Math.round(Math.pow(T, 1.3) + 15)
  return { inc, th, start: [{ at: 1.93, md: 0.2, flat, ret: true, p1: true }] as Shot[], cycle: [
    { at: 0.72, n: T > 5 ? 10 : 5, md: 1, p1: true, grow: true }, // 35: 5 (+5 at 250 ms past T 5) timer hits † @9235972, @17920681
    { at: 1.93, p: 1 / 3, md: 0.2, flat, ret: true, p1: true }, // 36: ×randomInt(1,3)/10 + round(T^1.3+15) points † @17947090; its 38 flies back
    ...x(T > 1, [{ at: 3.03, p: 1 / 7, keep: ({ 3: 0.5, 14: 0.2, 45: 0 } as Record<number, number>)[T] ?? 1 }]), // 37 † @17922331: both phases
  ] as Shot[] }
}

/** Seconds per attack cycle: 20 ms ticks until SpareTimer passes th. */
export function cycleSeconds(inc: number, th: number) {
  let s = 0, k = 0
  while (!(s > th)) { s += inc; k++ }
  return 0.02 * k
}

/** Asylum ShieldPercentMAX as the fight's deck swap rewrites it († @26867510): cards + gear + Rift 7 (15·min(lv,1) + 5·lv)
 *  + 25·SkillLevels[47] + PbonusMaxShield. */
export function asylumShieldMax(rd: Save) {
  const C = cbonus(rd, catalog as unknown as Catalog), E = equipmentBonuses(rd).scalar, rift = n((rd.RiftLVL as number[] | undefined)?.[7])
  return n(C.CbonusMaxShields) + n(E.EbonusShieldMax) + 15 * Math.min(rift, 1) + 5 * rift + 25 * n((rd.SkillLevels as number[] | undefined)?.[47]) + n(rd.PbonusMaxShield)
}

/** Expected seconds until an Asylum boss kills you (Infinity past `horizon`), in 20 ms ticks. Besides asylumAttacks:
 *  Gorshank's floor listener keeps its raises, so at Z each 35 hit compounds ×1.005 († @17920807) and in phase 2 (from
 *  `phase1End`) it hits every 600 ms, 300 ms after raising MonstersDamage ×(1.4 + T/20) († @9240163); a 36 hit sends a 38
 *  back that takes min(PlayerHPmax/5, HP − 1) about 1 s later († @17948943); a 37 (1.4 s timer) leaves the shield ×0.5 at
 *  X, ×0.2 at Y, and at Z sets HP to 1 and the shield to 0. You recover by food (FOOD), by the shield recharge (player
 *  bar actor, every 50 ms + (CbonusShieldChargePCT or 0.5 + EbonusShieldRecharge)/20 points while the shield is up, to
 *  the next of 100, 300, 700, 1500, 3100, 6300, 12700, 22500 or the max † @8792500), and by the heal skill (waterLV > 0,
 *  cooldown 20, PlayerHPmax/4·(1 + CbonusSkillHeal/100) a second for 5 s † @8841970), cast whenever HP is below max.
 *  HP and the shield's base are fightHPmax (the HP-skill actor's value, not the scene init's). The first cycle comes early:
 *  SpareTimer is only reset when a cycle fires (e.g. Scallius † @9233883), never on entry, so it starts from the last
 *  Asylum fight's value (save.SpareTimer). */
export function timeToDie(f: Fight, boss: number, T: number, bell: number, mark: number, horizon: number, phase1End = Infinity) {
  const rd = f.rd, hpMax = fightHPmax(rd), red = 1 - monsterDamageReduction(rd), sMax = asylumShieldMax(rd)
  const C = cbonus(rd, catalog as unknown as Catalog), E = equipmentBonuses(rd).scalar, si = (i: number) => n((rd.SmithingItemLevel as number[] | undefined)?.[i])
  const sl27 = n((rd.SkillLevels as number[] | undefined)?.[27]), cyber = 1 + n(C.CbonusCyberneticFOOD) / 100
  const food = FOOD.map(([i, k, w], j) => ({ hp: k * si(i) * (1 + 0.2 * sl27) * (1 + n(C.CbonusHealingItems) / 100), w, left: 0,
    shield: j < 2 && si(i) > 0 ? Math.ceil(Math.min(si(SHIELD_FOOD[j]![0]) / SHIELD_FOOD[j]![1] * cyber, SHIELD_FOOD[j]![2])) : 0 })).filter((x) => x.hp > 0)
  const recharge = (n(C.CbonusShieldChargePCT) || 0.5) + n(E.EbonusShieldRecharge), heal = n(rd.waterLV) > 0 ? hpMax / 4 * (1 + n(C.CbonusSkillHeal) / 100) : 0
  const sk = { SkillActive: mark ? Object.assign([], { 16: 1 }) : [] }
  let md = asylumMonstersDamage(sk, boss, T, bell, 1)
  const floor2 = asylumMonstersDamage(sk, boss, T, bell, 2)
  // Every hit as [time, shot, count], in time order.
  const A = asylumAttacks(boss, T), per = cycleSeconds(A.inc, A.th), ev: [number, Shot, number][] = [], acc = A.cycle.map(() => 0.5)
  const put = (t0: number, s: Shot) => {
    for (const t of s.kids ? range(10).map((k) => t0 + s.at + 1.75 + k) : [t0 + s.at]) ev.push([t, s, s.n ?? 1])
    if (s.ret) ev.push([t0 + s.at + 1, { at: 0 }, -1])
  }
  for (const s of A.start) if (!s.p1 || phase1End > 0) put(0, s)
  for (let c = cycleSeconds(A.inc, A.th - n(rd.SpareTimer)); c < horizon; c += per) A.cycle.forEach((s, j) => {
    if (s.p1 && c >= phase1End) return
    acc[j]! += s.p ?? 1
    if (acc[j]! >= 1) { acc[j]! -= 1; put(c, s) }
  })
  if (boss === 3) for (let t = 0.6 * Math.ceil(phase1End / 0.6); t + 0.3 < horizon; t += 0.6) ev.push([t + 0.3, { at: 0, md: 1 }, -2])
  ev.sort((a, b) => a[0] - b[0])
  let shield = sMax, life = hpMax, i = 0, healReady = 0
  const heals: number[] = []
  const hit = (dmg: number) => { if (shield > 0) shield = Math.max(shield - dmg / hpMax * 100, 0); else life = Math.max(life - dmg, 0) }
  for (let t = 0.02; t <= horizon; t += 0.02) {
    if (boss === 3 && t >= phase1End) md = Math.max(md, floor2)
    for (; i < ev.length && ev[i]![0] <= t; i++) {
      const [, s, k] = ev[i]!
      if (k === -1) { hit(Math.min(hpMax / 5, life - 1)); continue } // 38: not reduced
      if (k === -2) { md *= 1.4 + T / 20; hit(md * red); continue }
      if (s.keep != null) { if (s.keep === 0) { life = 1; shield = 0 } else shield *= s.keep; continue }
      for (let r = 0; r < k; r++) {
        if (s.grow && T === 45) md *= 1.005
        if (s.md) hit(s.md * md * red)
        if (s.flat && shield > 0) shield = Math.max(shield - s.flat, 0)
      }
    }
    for (const fd of food) {
      if ((fd.left -= 0.02) > 1e-9) continue
      if (life < hpMax) { life = Math.min(life + fd.hp, hpMax); fd.left = fd.w } else if (fd.shield && shield < sMax) { shield = Math.min(shield + fd.shield, sMax); fd.left = fd.w }
    }
    if (shield > 0) shield = Math.min(shield + recharge * 0.02, [100, 300, 700, 1500, 3100, 6300, 12700, 22500, Infinity].find((b) => shield <= b)!, sMax)
    if (heal && life < hpMax && healReady <= t) { healReady = t + 20 * f.cdSec; heals.push(...range(5).map((k) => t + k)) }
    while (heals.length && heals[0]! <= t) { heals.shift(); life = Math.min(life + heal, hpMax) }
    if (life <= 0) return t
  }
  return Infinity
}

/** Close = the kill lands within 20% either side of the deadline: the time limit, or the moment you die if that comes
 *  first (raids: the boss's hits, raidBossHitTime; Asylum: timeToDie). */
export const CLOSE = 0.2
/** Fight start (t = 0 = the boss's entrance callback, e.g. Scallius † @9231800, 3 s after the scene shows it): skills only
 *  hit from then (MonsterHitRequirement is 1e9 until BossX2isActive, Asylum DPS listener † @26992220; earlier casts spend
 *  their cooldown for nothing), and the first hit lands the frame after your first click. timeToKill takes that click at
 *  t = 0 on every skill page at once (Strike needs SkillType 3, the HP skill 2, the rest 1), which no player does, while
 *  the boss's first cycle can fire on the first tick (SpareTimer carries over). So a death inside the opening is a loss
 *  whatever the kill time says. ponytail: one calibrated knob, not a click model. 7 s: above the 2026-10-24 Scallius Z
 *  bell 8 Mark-on death (model death 5.9 s), below Gorshank X beaten on the 2026-10-02 fixture (8.1 s). Known conflict:
 *  Gorshank Z, beaten, models a 5.7 s death (its HP-to-1 projectile, averaged) and so reads 'no'. */
export const OPENING = 7
export const verdictOf = (ttk: number, deadline: number, die = Infinity) => {
  if (die < OPENING) return 'no'
  const r = ttk / deadline
  return r <= 1 - CLOSE ? 'win' : r <= 1 + CLOSE ? 'close' : 'no'
}
/** One Asylum fight: kill time (both Gorshank phases), death time, verdict. */
export function asylumCell(f: Fight, boss: number, T: number, bell: number, mark: number, limit: number) {
  const h = limit * (1 + CLOSE) + 1, ends = phaseEnds(f, 'asylum', boss, T, bell, h, mark), die = timeToDie(f, boss, T, bell, mark, h, ends[0])
  const ttk = ends.at(-1)!
  return { ttk, die, verdict: verdictOf(ttk, Math.min(limit, die), die) }
}
export function verdicts(save: Save) {
  const f = fightContext(save)
  if ('missing' in f) return { missing: f.missing }
  const bellBest = (save.AsylumBellBEST as number[] | undefined) ?? []
  const rows = (Object.keys(BOSSES) as (keyof typeof BOSSES)[]).flatMap((type) => BOSSES[type].map(([name], boss) => ({
    type, name, cells: TIERS[type].tiers.map(([d, T, , min]) => {
      const bell = type === 'asylum' && T === 45 ? n(bellBest[boss + 1]) : 0, limit = runSeconds(min)
      if (type === 'asylum') return { difficulty: d || 'base', limit, ...asylumCell(f, boss, T, bell, 0, limit) }
      const die = raidBossHitTime(boss, hitsToKill(save, raidMonstersDamage({}, boss, T)))
      const deadline = Math.min(limit, die), ttk = timeToKill(f, type, boss, T, bell, deadline * (1 + CLOSE) + 1)
      return { difficulty: d || 'base', ttk, limit, die, verdict: verdictOf(ttk, deadline, die) }
    }),
  })))
  return { rows, base: f.base, skills: f.skills.map((s) => s.name), cdSec: f.cdSec }
}
