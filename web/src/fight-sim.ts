// The fight simulator shared by every boss fight mode (Raids, Asylum, crusade, the Crypt): deck and scene stats, damage
// skills and their hit timing, cooldowns, run length and food. Moved out of raids.ts (refactor step 6, #69); raids.ts keeps
// the Raid and Asylum bosses, tickets and verdicts. Offsets (@) are Qno2x.js, as in raids.ts.
import { getPlayerDPS, raidDecks, raidStats } from './combat'
import { equipmentBonuses } from './bus'
import { cbonus, type Catalog } from './modules/cards/cards-calc'
import catalog from './data/card-catalog.json'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0

type Ctx = { sl: (i: number) => number; C: (k: string) => number; E: (k: string) => number; sbp: number[]; save: Save }
/** Damage skills you hover, from their actors' hover listeners: SkillCooldown and SkillTime set at the cast, hit times
 *  (seconds after the cast), the multiplier on DPS per hit, and the DPS below which a hit rolls randomInt(Mastery·DPS, DPS)
 *  instead of DPS. A hit only lands while SkillTime > 0; the scene takes 1 off SkillTime every second (@19913283). */
export const SKILLS: { name: string; at: number; cd: number; time: number; thr: number; has: (c: Ctx) => boolean; hits: (c: Ctx) => number[]; mult: (c: Ctx) => number }[] = [
  { name: 'Claw', at: 8429893, cd: 5, time: 2, thr: 2e7, has: (c) => n(c.save.waterLV) > 0, hits: (c) => range(2 * c.sl(5) + 2).map((i) => 0.1 * i),
    mult: (c) => (0.1 * c.sl(17) + 0.8 * c.sl(10) + 1) * (1 + c.C('SkillClaw') / 100) * (1 + c.E('AllSkillDMG') / 100) * (1 + c.E('ClawDMG') / 100) },
  { name: 'Meteor', at: 8465725, cd: 22, time: 7, thr: 1e8, has: (c) => c.sl(15) > 0, hits: () => range(5).flatMap((i) => Array(4).fill(0.45 + 1.1 * (i + 1))),
    mult: (c) => (1.5 + 0.5 * c.sl(15)) * (1 + 0.1 * c.sl(17)) * (1 + c.sbp[3]!) },
  { name: 'Flurry', at: 8568540, cd: 15, time: 5, thr: 1e8, has: (c) => c.sl(16) > 0, hits: () => [0, ...[0, 1.6, 3.2].flatMap((s) => range(10).map((i) => s + 0.16 * (i + 1)))],
    mult: (c) => (0.1 * c.sl(17) + 0.2 * c.sl(16) + 1) * (1 + c.sbp[4]!) },
  { name: 'Poison', at: 8686939, cd: 27, time: 10, thr: 1e8, has: (c) => c.sl(25) > 0, hits: (c) => range(60).map((i) => i * (1 - Math.min(c.sl(25) / 10, 0.9))),
    mult: (c) => (1 + 0.1 * c.sl(17)) * (1 + c.sbp[2]!) },
  { name: 'Hands', at: 9046173, cd: 28, time: 8, thr: 2e7, has: (c) => c.sl(8) > 0, hits: () => [[0.5, 8], [1.4, 10], [1.7, 10]].flatMap(([s, k]) => range(k!).map((i) => s! + 0.8 * i)),
    mult: (c) => (0.75 * c.sl(8) + 0.1 * c.sl(17) + 2) * (1 + c.sbp[5]!) },
  { name: 'Strike', at: 17779076, cd: 25, time: 3, thr: 2e5, has: (c) => n((c.save.KeysUnlocked as number[] | undefined)?.[27]) > 0 && !c.save.HealThePlayer, hits: () => [0.83],
    mult: (c) => (0.1 * c.sl(17) + 31 + 2 * n((c.save.AscentionLevel as number[] | undefined)?.[27])) * (1 + c.sbp[11]!) },
]
function range(k: number) { return Array.from({ length: Math.max(k, 0) }, (_, i) => i) }
/** Share of a hit at `h` s that lands: SkillTime runs out between S−1 and S s after the cast, depending on where the
 *  scene's one-second tick falls (uniform); `phase` pins the tick (s after the cast) for tests. */
export const landed = (S: number, h: number, phase?: number) => phase == null ? Math.min(Math.max(S - h, 0), 1) : h < phase + S - 1 ? 1 : 0

/** Seconds per cooldown point: the cooldown ticker (Design_101_101_MiningBoostCooldowns @18614469) adds
 *  min(0.05·(1 + 0.1·perk 4), 0.15) every 50 ms and takes 1 off every SkillCooldown once past 1, then restarts at 0. */
export function cooldownSecond(save: Save) {
  const inc = Math.min(0.05 * (1 + 0.1 * n((save.AscentionLevel as number[] | undefined)?.[4])), 0.15)
  let t = 0, k = 0
  while (!(t > 1)) { t += inc; k++ }
  return 0.05 * k
}

/** Seconds of fight before a raid or Asylum run times out: BossAMinute = run minutes, BossASeconds = 1, one second off per
 *  tick (@20017029 / @27002374); at minute 0 past second 0 the scene switches back to the select screen with no kill. */
export const runSeconds = (minutes: number) => 60 * minutes + 1

/** Everything the per-row verdicts share: the raid/Asylum deck, scene stats and base DPS. */
export function fightContext(save: Save, link = 10) {
  const rd = raidDecks(save, link), rs = raidStats(rd)
  if (!rs) return { missing: 'PbonusCritDmg' }
  const base = getPlayerDPS({ ...rd, ...rs, SkillActive: [] })
  if (typeof base !== 'number') return base
  const C = cbonus(rd, catalog as unknown as Catalog), E = equipmentBonuses(rd).scalar, sl = (i: number) => n((rd.SkillLevels as number[] | undefined)?.[i])
  const ctx: Ctx = { sl, C: (k) => n(C[`Cbonus${k}`]), E: (k) => n(E[`Ebonus${k}`]), sbp: rs.SkillBonusdmgPCT, save: rd }
  return { base, rs, ctx, rd, skills: SKILLS.filter((s) => s.has(ctx)), cdSec: cooldownSecond(rd) }
}
export type Fight = Exclude<ReturnType<typeof fightContext>, { missing: string }>

/** Every skill hit in time order as [time, landed share × multiplier, low-DPS threshold]: each owned damage skill cast at 0
 *  and again each time its cooldown ends, until `horizon`. */
export function skillEvents(f: Pick<Fight, 'skills' | 'ctx' | 'cdSec'>, horizon: number) {
  const events: [number, number, number][] = []
  for (const s of f.skills) {
    const hits = s.hits(f.ctx), m = s.mult(f.ctx)
    for (let c = 0; c * s.cd * f.cdSec < horizon; c++) for (const h of hits) { const w = landed(s.time, h); if (w > 0) events.push([c * s.cd * f.cdSec + h, w * m, s.thr]) }
  }
  return events.sort((a, b) => a[0] - b[0])
}

/** Food (the fight scenes' draw listener: Asylum † @26978786, crusade † @23384198): while HP < max, food slot i with smith
 *  item s_i > 0 heals k_i·s_i·(1 + 0.2·SkillLevels[27])·(1 + CbonusHealingItems/100) and waits w_i s. In the Asylum, slots
 *  1-2 instead restore shield points while HP is full and the shield isn't: ⌈min(s/div·(1 + CbonusCyberneticFOOD/100), cap)⌉
 *  from smith item 67 (÷4, cap 2500) / 75 (÷1, cap 4000), needing slot item 3 / 11 too. */
export const FOOD: [item: number, k: number, wait: number][] = [[3, 3, 2.5], [11, 15, 5], [27, 50, 7.5], [43, 200, 10], [51, 400, 12.5]]
export const SHIELD_FOOD: [item: number, div: number, cap: number][] = [[67, 4, 2500], [75, 1, 4e3]]
