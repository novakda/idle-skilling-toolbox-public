// Crypt tab: the zone-type-2 daily run (currentfightmode 20) in the main fight scene (SceneEvents_9 in Qno2x.js, byte offsets
// cited). Monster HP is the fight scene's (monsterHP, fighting.ts) with the Crypt's own rewrite; damage reuses the raids skill
// model (raids.ts SKILLS / skillEvents) on the Fighting-linked decks (fightStats, fighting.ts).
import { fightStats, LINK, monsterGold, monsterHP } from './fighting'
import { fightContext, runSeconds, skillEvents, type Fight } from './fight-sim'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** Monster names the fight HUD draws for mapleLV 0-65 (@8253542+). Level 66 has no name in the code; the wiki's is used †. */
export const NAMES = ['Rick', 'Mankey', 'Boin', 'Thought', 'Belief', 'Putt Putt', 'Trip', 'Momic', 'Relish', 'E', 'Unaccelerate', 'Perception',
  'Realization', 'Babbo', 'Drank', 'Pipsickle', 'Thingy', 'Party Hut', 'Cry Stall', 'Frustration', 'Outrage', 'Splot', 'Laddies', 'Ez', 'Flower',
  'Squee', 'Tito Pool', 'Calmness', 'Stoicism', 'Lick', 'Chin', 'Skolotin', 'Skill', 'Vengeance', 'Bloodshed', 'Clockity', 'Ump', 'Mousterize', 'Wtf',
  'Dameon', 'Wooble', 'Illness', 'Pestilence', 'Pen Teller', 'Hip', 'Moshrim', 'Boogie', 'Recollection', 'Evocation', 'Tea Veal', 'Jogger',
  'Tape Worn', 'Blonky', 'Peepo', 'Chitin', 'Excitement', 'Delirium', 'Switz', 'Bolby', 'Pink Bunny', 'Tim', 'Loud', 'Seal Strike', 'Sporky', 'Son',
  'Father', 'Holy Spirit 1 †']
export const LAST = 66 // a kill moves to mapleLV + 1 while it is below 66 (kill handler's runLater(360) @31838715)
export const TRANSITION = 0.57 // MAPLElvTransition is set at the kill (@31830349) and cleared 570 ms later (@31839236); every skill hit checks it is 0
/** Mastery tasks that name a Crypt monster (MasteryTaskNames @5185457, @5186255, @5188028, @5189745). */
export const TASKS = [[132, 'Reach Putt Putt', 5], [144, 'Reach E', 9], [171, 'Reach Ez', 23], [197, 'Reach the end', LAST]] as const

/** Crypt HP (mapleexpREQ): the zone-type-2 formula at m = 20 (@31804850, ÷ @31806955), then ÷ (1 + 1e23⁴) and
 *  × 25^(1.2·(L + 1)) (@31810484-31810631). Reads SkillActive[16] (Mark: ×5). */
export const cryptHP = (save: Save, L: number) => monsterHP(save, 20, L) / (1 + Math.pow(1e23, 4)) * Math.pow(25, 1.2 * (L + 1))

/** Drops per kill (kill handler @31829977+, drops are ActorEvents_894 types, credited @15769598+). One randomInt(1,1000) roll r
 *  (@31831606): 650-874 a pachinko drop (+3 balls), 875-924 one gem, 925-1000 two (@31831660). Rare roll: RareDropChancee +=
 *  0.9·min(1.15, 1 + (2·PetCapsuleLV[75] + 3·CardLevels[179])/100) every kill (@31830893), and when 10·RareDropChancee ≥ r
 *  (@31832577) it resets to 0 and a second roll picks one of RARE. */
export const BASE = { balls: 225 * 3 / 1000, gems: (50 + 2 * 76) / 1000 }
/** The rare ladder (second randomInt(1,1000)): [rolls out of 1000, what it gives]. Candy k = CandyOwned[k] (2/4/8/24/72 h). */
export const RARE: [number, Partial<Record<Res, number>>][] = [
  [1, { candy5: 3 }], [2, { candy5: 1 }], [6, { bp: 1 }], [11, { balls: 3 }], [20, { ap: 1 }], [50, { keys: 1 }], [30, { candy4: 1 }],
  [100, { balls: 39 }], [150, { balls: 15 }], [60, { keys: 10 }], [200, { keys: 4 }], [170, { gems: 10 }], [30, { candy3: 1 }], [40, { candy2: 1 }],
  [120, { candy1: 1 }], [10, { coupons: 1 }],
]
export type Res = 'gems' | 'keys' | 'balls' | 'coupons' | 'ap' | 'bp' | 'candy1' | 'candy2' | 'candy3' | 'candy4' | 'candy5'
export const RES: [Res, string][] = [['gems', 'Gems'], ['keys', 'Asylum keys'], ['balls', 'Pachinko balls'], ['coupons', 'Candy coupons'], ['ap', 'AP coupons'],
  ['bp', 'BP coupons'], ['candy1', '2 h candy'], ['candy2', '4 h candy'], ['candy3', '8 h candy'], ['candy4', '24 h candy'], ['candy5', '72 h candy']]

export const rareStep = (save: Save) => 0.9 * Math.min(1.15, 1 + (2 * n(arr(save, 'PetCapsuleLV')[75]) + 3 * n(arr(save, 'CardLevels')[179])) / 100)

/** Expected rare rolls over `kills` kills, exactly: the distribution of RareDropChancee, a kill at a time. */
export function expectedRares(kills: number, step: number, start = 0) {
  let dist = new Map<number, number>([[start, 1]]), rares = 0
  for (let k = 0; k < kills; k++) {
    const next = new Map<number, number>()
    for (const [p, w] of dist) {
      const q = Math.min(Math.max(Math.floor(10 * (p + step) + 1e-9), 0), 1000) / 1000
      rares += w * q
      next.set(0, (next.get(0) ?? 0) + w * q)
      if (q < 1) next.set(p + step, (next.get(p + step) ?? 0) + w * (1 - q))
    }
    dist = next
  }
  return rares
}

/** Expected drops for `kills` kills. */
export function expectedDrops(kills: number, rares: number) {
  const out = Object.fromEntries(RES.map(([k]) => [k, 0])) as Record<Res, number>
  out.gems += kills * BASE.gems; out.balls += kills * BASE.balls
  for (const [w, give] of RARE) for (const [k, v] of Object.entries(give)) out[k as Res] += rares * w / 1000 * v!
  return out
}

/** Your skills as the fight scene has them: the raids skill model on the Fighting decks, with the fight scene's DPS. */
export function cryptFight(save: Save) {
  const f = fightStats(save)
  if ('missing' in f) return f
  const c = fightContext(save, LINK)
  if ('missing' in c) return c
  return { ...c, base: f.DPS, rs: { ...c.rs, CriticalDamage: f.CriticalDamage } } as Fight
}

/** One run, expected: every damage skill cast at 0 and again as its cooldown ends (no auto-attack in the Crypt: the fight's
 *  attack listener needs currentfightmode < 20, @31856462), each hit = DPS × skill multiplier × average crit (hit chance 1: the
 *  Crypt's MonsterHitRequirement is 0, (1 − ⌊m/20⌋) in combat.ts monsterHitRequirement); hits during a kill's transition
 *  are lost, overkill too. Ends at 61 s: TimeleftInVault 60 counts down once a second and at 0 the next tick kills you (@31896120). */
export function simulate(save: Save, f: Fight, seconds = runSeconds(1)) {
  const { CriticalChance: cc, CriticalDamage: cd, Mastery: M } = f.rs, crit = 1 + Math.min(Math.max(Math.floor(cc), 0), 100) / 100 * (cd - 1)
  const HP = Array.from({ length: LAST + 1 }, (_, L) => cryptHP(save, L))
  const rows = HP.map((hp, L) => ({ L, name: NAMES[L]!, hp, reachedAt: null as number | null, kills: [] as number[], hits: 0 }))
  let L = 0, dealt = 0, until = 0
  rows[0]!.reachedAt = 0
  for (const [t, wm, thr] of skillEvents(f, seconds)) {
    if (t > seconds) break
    if (t < until) continue
    dealt += f.base * (f.base < thr ? (1 + M) / 2 : 1) * wm * crit
    rows[L]!.hits++
    if (dealt >= HP[L]!) {
      rows[L]!.kills.push(t); dealt = 0; until = t + TRANSITION
      if (L < LAST) { L++; rows[L]!.reachedAt = t + 0.36 }
    }
  }
  return { rows, kills: rows.reduce((a, r) => a + r.kills.length, 0), furthest: L, crit, hitAvg: f.base * crit }
}

/** Seconds until the run opens. timetoNextVault is shared with the Vault (30 s run, 3600 s): entry sets 86400 (@4281970),
 *  the fight scene takes 1 off every second (@31896120) and the time away on its next entry (@31748127). */
export function cooldown(save: Save, now = Date.now() / 1000) {
  const away = n(save.CurrentlyViewedScreen) === 8 ? 0 : Math.max(0, now - n(save.TimeLastInHell2))
  return Math.max(0, n(save.timetoNextVault) - away)
}

export function crypt(save: Save, now = Date.now() / 1000) {
  const unlocked = n(save.fightsunlocked) >= 12 // the zone bar's Crypt slot needs fightsunlocked ≥ 12 (@4281369)
  const wait = cooldown(save, now), inRun = n(save.currentfightmode) === 20
  // Crypt gold per kill: the scene's _DUMMYvault2Gold, the zone-type-2 gold of the last frame before entry, × 1.22^(L+1) (@31809959).
  const m = n(save.currentfightmode), from = m > 10 && m < 20 ? { m, L: n(save.mapleLV) } : null
  const gold0 = from ? monsterGold(save, from.m, from.L) : null
  const f = cryptFight(save)
  const common = { unlocked, wait, inRun, timeLeft: n(save.TimeleftInVault), mark: n(arr(save, 'SkillActive')[16]) > 0, step: rareStep(save),
    pity: n(save.RareDropChancee), tasks: TASKS.map(([i, label, L]) => ({ label, L, done: n(arr(save, 'MasteryTasksComplete')[i]) > 0 })), from, gold0 }
  if ('missing' in f) return { ...common, missing: f.missing }
  const sim = simulate(save, f), rares = expectedRares(sim.kills, common.step, common.pity)
  // The same run with Mark (skill 16) toggled: it multiplies Crypt HP by 5 and changes nothing else here.
  const toggled = simulate({ ...save, SkillActive: Object.assign([...arr(save, 'SkillActive')], { 16: common.mark ? 0 : 1 }) }, f)
  const gold = gold0 == null ? null : sim.rows.reduce((a, r) => a + r.kills.length * gold0 * Math.pow(1.22, r.L + 1), 0)
  return { ...common, sim, toggled: { kills: toggled.kills, furthest: toggled.furthest }, rares, drops: expectedDrops(sim.kills, rares), gold, skills: f.skills.map((s) => s.name), cdSec: f.cdSec }
}
