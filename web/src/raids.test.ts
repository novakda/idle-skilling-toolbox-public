import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { raids, TIERS } from './raids'
import wikiRaids from '../../data/wiki/datasets/raids.json'
import wikiAsylum from '../../data/wiki/datasets/asylum.json'

test('raid costs match the wiki; unlocks come from a local save and are unknown in a cloud one', async () => {
  // Ticket costs read from the game code agree with the wiki's tables (raids: "Ticket Cost", asylum: "Keys").
  const cost = (rows: any[], col: string, name: string) => rows.find((r) => r.Boss_2 === name || r.Monster_2 === name)?.[col]
  for (const [d, , taken] of TIERS.raid.tiers) expect(cost(wikiRaids, 'Ticket Cost', `${d} King`)).toBe(taken)
  for (const [d, , taken] of TIERS.asylum.tiers) expect(cost(wikiAsylum, 'Keys', d ? `Emigdala ${d}` : 'Emigdala')).toBe(taken)
  const s = await fullSave(), local = raids(s)
  expect(local.localOnlyMissing).toBe(false)
  expect(local.bosses.find((b) => b.key === 'IsBossB2unlocked')!.unlocked).toBe(s.IsBossB2unlocked)
  const cloud = raids(Object.fromEntries(Object.entries(s).filter(([k]) => !/^Is[Bb]oss/.test(k))))
  expect(cloud.localOnlyMissing).toBe(true)
  expect(cloud.bosses.filter((b) => b.unlocked == null)).toHaveLength(6)
  expect(cloud.tickets).toEqual(local.tickets) // ticket counts are in cloud saves
})

// Decode check (#34): each boss's flag is set by the previous boss's win handler, which also records RaidBossKilled, so on
// a local save a gated boss is unlocked exactly when the previous boss has a best-beaten difficulty. The bundle half checks
// each cited offset is a `flag = true` write and that the nearest enclosing boss branch is the previous boss (dev-only).
import { existsSync, readFileSync } from 'fs'
import { BUNDLE } from '../../src/game-eval'
import { BOSSES } from './raids'
test('boss unlocks: flag set by beating the previous boss (save + game code)', async () => {
  const s = await fullSave(), r = raids(s)
  for (const b of r.bosses.filter((b) => b.key)) expect(b.unlocked).toBe(b.prevBest !== 'not yet')
  const path = `${import.meta.dir}/../../${BUNDLE}`
  if (!existsSync(path)) return
  const js = readFileSync(path) // byte offsets, like rg -b
  for (const [type, list] of Object.entries(BOSSES)) list.forEach(([, key, at], i) => {
    if (!key) return
    const win = js.subarray(at - 20000, at + 200).toString('latin1'), w = win.indexOf(`h.${key}=!0`)
    expect([type, key, w > 19990]).toEqual([type, key, true])
    const before = win.slice(0, w)
    const heads = [...before.matchAll(/getGameAttribute\("Boss([A-D])2?isActive"\)\)\{/g)]
    expect([key, heads.at(-1)![1]]).toEqual([key, 'ABC'[i - 1]!]) // inside the previous boss's win branch
  })
})

import { hitsToKill } from './raids'
import { fightHPmax, monsterDamageReduction } from './combat'
test('hits to kill: shield first (no carry-over), then HP', async () => {
  const s = await fullSave(), hp = fightHPmax(s), d = hp / 2.5 / (1 - monsterDamageReduction(s)) // a hit takes 40% of HP
  expect(hitsToKill({ ...s, ShieldPercentMAX: 0 }, d)).toBe(3)
  expect(hitsToKill({ ...s, ShieldPercentMAX: 100 }, d)).toBe(6) // shield = 1 HP: 3 hits, then 3 on HP
  expect(raids(s).bosses[0]!.damage.map((x) => x.hit)).toEqual([2500, 7500, 25000])
})

// #35: can you beat it. Every ported piece is run against the game's own code in the sandbox (dev-only).
import { compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { blockAt, bossHP, HP_BASE, raidBossHitTime, verdicts } from './raids'
import { cooldownSecond, landed, runSeconds, SKILLS } from './fight-sim'

test('boss HP bases are what saves store; raid HP matches the wiki table', async () => {
  const s = await fullSave()
  expect([s.BossAhpTOT, s.bossBhpTOT, s.bossChpTOT, s.bossDhpTOT]).toEqual(HP_BASE)
  const unit: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
  const rows = (wikiRaids as any[]).filter((r) => r['Boss HP'])
  const off = rows.filter((r) => {
    const [d, boss] = (r.Boss_2 as string).split(' '), T = { Daydream: 1, Chaotic: 3, Nightmare: 10 }[d!]!, m = /^([\d.]+)([KMBT])$/.exec(r['Boss HP'])!
    return Math.abs(bossHP('raid', ['King', 'Entertainer', 'Sentinel', 'Demon'].indexOf(boss!), T) / (Number(m[1]) * unit[m[2]!]!) - 1) > 1e-6
  }).map((r) => r.Boss_2)
  expect(off).toEqual(['Daydream King', 'Nightmare Demon']) // wiki typos: 4800K for 50M (Chaotic/Nightmare are 3×/10× of 50M), 100T for 10T
})

const BUNDLE_PATH = `${import.meta.dir}/../../${BUNDLE}`
test.skipIf(!existsSync(BUNDLE_PATH))('skills, cooldowns, boss hit timing, Asylum block and the run timer equal the game code', () => {
  const src = loadBundle(BUNDLE_PATH)
  // A skill actor's hover listener, cast once with a scheduler: runLater queues, randomInt returns its max (hit and crit
  // rolls succeed only if the odds are 100%), the scene's one-second SkillTime tick fires at `phase` + k.
  const cast = (actor: number, idx: number, A: Record<string, any>, phase: number) => {
    const at = src.indexOf(`"scripts.ActorEvents_${actor}"`), init = matchBraces(src, src.indexOf('init:function', at) + 5)
    let now = 0, seq = 0
    const q: { t: number; s: number; fn: Function }[] = []
    const p = new Proxy({}, { get: (_t, k) => k === 'runLater' ? (ms: number, fn: Function) => q.push({ t: now + ms, s: seq++, fn }) : k === 'randomInt' || k === 'randomFloatBetween' ? (_a: number, b: number) => b : inert })
    const hover: Function[] = []
    const self = { wrapper: { enabled: true }, actor: inert, addMouseOverActorListener: (_a: unknown, f: Function) => hover.push(f), addKeyStateListener() {}, addWhenDrawingListener() {}, addMouseReleasedListener() {} }
    ;(compile(init, A, { p }) as Function).call(self)
    for (let k = 0; k < 15; k++) q.push({ t: 1e3 * (k + phase), s: -1, fn: () => { for (let i = 0; i < 21; i++) A.SkillTime[i] -= 1 } })
    hover[0]!(5, inert)
    const cd = A.SkillCooldown[idx], time = A.SkillTime[idx]
    while (q.length) { q.sort((a, b) => a.t - b.t || a.s - b.s); const e = q.shift()!; now = e.t; e.fn(inert) }
    return { dealt: A.mapleexp as number, cd, time }
  }
  const ACTOR: Record<string, number> = { Claw: 272, Meteor: 280, Flurry: 290, Poison: 304, Hands: 453, Strike: 960 }
  const IDX: Record<string, number> = { Claw: 1, Meteor: 2, Flurry: 3, Poison: 5, Hands: 8, Strike: 13 }
  for (const sk of SKILLS) for (const lv of [1, 4]) for (const crit of [0, 100]) for (const low of [false, true]) for (const phase of [0.3, 0.9]) {
    const sl = Array.from({ length: 80 }, (_, i) => lv + (i % 3)), sbp = Array.from({ length: 29 }, (_, i) => i / 10)
    const save = { SkillLevels: sl, waterLV: 1, KeysUnlocked: Array(40).fill(1), HealThePlayer: 0, AscentionLevel: Array(130).fill(2) }
    const ctx = { sl: (i: number) => sl[i]!, C: (k: string) => k === 'SkillClaw' ? 30 : 0, E: (k: string) => ({ AllSkillDMG: 20, ClawDMG: 10 } as any)[k] ?? 0, sbp, save }
    const DPS = low ? sk.thr / 2 : sk.thr * 3
    const A = { ...save, mapleexp: 0, SkillCooldown: Array(21).fill(0), SkillTime: Array(21).fill(0), SkillActive: Array(21).fill(0), SkillType: sk.name === 'Strike' ? 3 : 1,
      DPS, CriticalChance: crit, CriticalDamage: 3, Mastery: 1, MonsterHitRequirement: 0, atkLVL: 100, MAPLElvTransition: 0, SkillBonusdmgPCT: sbp, CbonusSkillClaw: 30,
      EbonusAllSkillDMG: 20, EbonusClawDMG: 10, DamageNumberino: 0, AutocastToggles: [] }
    const { dealt, cd, time } = cast(ACTOR[sk.name]!, IDX[sk.name]!, A, phase)
    expect([sk.name, cd, time]).toEqual([sk.name, sk.cd, sk.time])
    const want = sk.hits(ctx).reduce((t, h) => t + landed(sk.time, h, phase), 0) * sk.mult(ctx) * DPS * (crit ? 3 : 1)
    expect([sk.name, lv, crit, low, phase, dealt / want]).toEqual([sk.name, lv, crit, low, phase, expect.closeTo(1, 6) as any])
  }
  // Cooldown ticker: 50 ms adds, the draw check takes 1 off every cooldown once past 1.
  const d = src.indexOf('"scripts.Design_101_101_MiningBoostCooldowns"'), tick = src.indexOf('p.runPeriodically(50,', d)
  for (const perk of [0, 3, 10, 40]) {
    const A: Record<string, any> = { SkillCooldownTimer: 0, AscentionLevel: Object.assign([], { 4: perk }), SkillCooldown: Array(21).fill(5) }
    const self = { wrapper: { enabled: true } }
    const add = compile(matchBraces(src, src.indexOf('function', tick)), A, { t: self }) as Function
    const check = compile(matchBraces(src, src.indexOf('function', src.indexOf('this.addWhenDrawingListener', tick))), A, { t: self }) as Function
    let k = 0
    while (A.SkillCooldown[0] === 5) { add(inert); check(inert, inert, inert, inert); k++ }
    expect([perk, 0.05 * k]).toEqual([perk, cooldownSecond({ AscentionLevel: A.AscentionLevel })])
  }
  // Raid boss hits: the 20 ms windup tick and the draw listener that lands the hit.
  const r16 = src.indexOf('"scripts.SceneEvents_16"')
  const wind = matchBraces(src, src.indexOf('function', src.lastIndexOf('p.runPeriodically(20,', src.indexOf('"MonstersDamageWindup")+.01,', r16))))
  const hitL = matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener', src.indexOf('getGameAttribute("MonstersDamageWindup")>=b.engine.getGameAttribute("MonstersDamageSpeed")', r16))))
  for (let boss = 0; boss < 4; boss++) {
    const A: Record<string, any> = { MonstersDamageSpeed: 2, MonstersDamageWindup: boss === 3 ? -0.6078431369 : 0, nodamageraid: 1, IsPlayerAlive: 1, DemonPhase: 1, SkillTime: [],
      PlayerHP: 1e9, PlayerHPmax: 1e9, ShieldPercent: 0, MonstersDamage: 1, MonsterDamageReduction: 0, RiftLVL: [], smithingAttackSpeedBoost: 0, speedValues: 0,
      BossAisActive: boss === 0, BossBisActive: boss === 1, BossCisActive: boss === 2, BossDisActive: boss === 3 }
    const w = compile(wind, A, { a: { wrapper: { enabled: true } } }) as Function, h = compile(hitL, A) as Function
    const at: number[] = []
    for (let k = 1; at.length < 3; k++) { w(inert); h(inert, inert, inert, inert); if (A.PlayerHP < 1e9) { at.push(0.02 * k); A.PlayerHP = 1e9 } }
    if (boss !== 2) expect(at.map((t) => +t.toFixed(9))).toEqual([1, 2, 3].map((n) => +raidBossHitTime(boss, n).toFixed(9)))
    else expect(+at[0]!.toFixed(9)).toBe(+raidBossHitTime(2, 1).toFixed(9)) // the 5 s on/off window isn't run here
  }
  // Asylum block decay (50 ms).
  const a41 = src.indexOf('"scripts.SceneEvents_41"'), decay = matchBraces(src, src.indexOf('function', src.lastIndexOf('p.runPeriodically(50,', src.indexOf('getGameAttribute("AsylumBlock")/1.005', a41))))
  for (const b0 of [100, 2e3, 75e3, 15e4]) {
    const A: Record<string, any> = { AsylumBlock: b0, BossA2isActive: true, EmigdalaLaserFade: 0 }, f = compile(decay, A) as Function
    for (let k = 1; k <= 3000; k++) { f(inert); if (k % 97 === 0 || A.AsylumBlock === 0 && k % 500 === 0) expect(A.AsylumBlock - blockAt(b0, k * 0.05)).toBeCloseTo(0, 6) }
  }
  // Run timer: ticks from minute M, second 1 until the scene gives up.
  const timer = matchBraces(src, src.indexOf('function', src.lastIndexOf('p.runPeriodically(1e3,', src.indexOf('getGameAttribute("BossASeconds")-1', r16))))
  for (const min of [2, 4, 6]) {
    const A: Record<string, any> = { RaidAnumber: 1633, BossASeconds: 1, BossAMinute: min, BossAisActive: true, RaidBossQueue: 1, TicketsToSpend: 1, SkillLevels: [], SkillActive: [] }
    const f = compile(timer, A) as Function
    let k = 0
    while (A.BossAisActive) { f(inert); k++ }
    expect(k - 1).toBe(runSeconds(min)) // the first tick lands 0-1 s into the fight
  }
})

test('the verdict says win on every difficulty this save has beaten', async () => {
  const s = await fullSave(), v = verdicts(s)
  if (!('rows' in v)) throw new Error(v.missing)
  const best = s.RaidBossKilled as number[]
  for (const r of v.rows) {
    const b = best[(r.type === 'raid' ? 1 : 5) + BOSSES[r.type].findIndex((x) => x[0] === r.name)]!
    for (const c of r.cells) if (TIERS[r.type].tiers.find((t) => (t[0] || 'base') === c.difficulty)![1] <= b) expect([r.name, c.difficulty, c.verdict]).toEqual([r.name, c.difficulty, 'win'])
  }
  const cloud = verdicts(Object.fromEntries(Object.entries(s).filter(([k]) => !['PbonusDamageSUM', 'TankBonusLIST'].includes(k))))
  expect(cloud).toEqual({ missing: 'PbonusDamageSUM, TankBonusLIST' })
})

// #35 survival: the Asylum bosses' attack cycles, projectile damage and food are run against the game's own code (dev-only).
import { asylumAttacks, asylumCell, asylumShieldMax, cycleSeconds } from './raids'
import { FOOD, fightContext, SHIELD_FOOD } from './fight-sim'
import { reactive } from 'vue'
test.skipIf(!existsSync(BUNDLE_PATH))('Asylum attack cycles, projectile hits and food equal the game code', () => {
  const src = loadBundle(BUNDLE_PATH), a459 = src.indexOf('"scripts.ActorEvents_459"')
  // Each boss's 20 ms SpareTimer ticker: ticks until it resets (BossX2isActive unset, so nothing is thrown).
  for (let boss = 0; boss < 4; boss++) for (const T of [1, 3, 14, 45]) {
    const head = boss === 0 ? 'if(14==(null==a?' : `if(${14 + boss}==(null==(a=this.actor.getAnimation())`
    const A: Record<string, any> = { SpareTimer: 0, TicketsToSpend: T, DemonPhase: 1, trigonometric: 0 }
    const f = compile(matchBraces(src, src.indexOf('function', src.indexOf('p.runPeriodically(20,', src.indexOf(head, a459)))), A) as Function
    let k = 0
    do { f(inert); k++ } while (A.SpareTimer !== 0 && k < 1e4)
    const { inc, th } = asylumAttacks(boss, T)
    expect([boss, T, +(0.02 * k).toFixed(9)]).toEqual([boss, T, +cycleSeconds(inc, th).toFixed(9)])
  }
  // Projectile hits (ActorEvents_993's draw listener), with randomInt/randomFloatBetween at their low and high ends.
  const a993 = src.indexOf('"scripts.ActorEvents_993"')
  const draw = matchBraces(src, src.indexOf('function', src.indexOf('this.addWhenDrawingListener(null,(function(a,n,r,i){if(t.wrapper.enabled&&0<t.actor.getCurrentFrame()', a993)))
  const shot = (frame: number, T: number, end: 0 | 1, shield: number, md = 1e3) => {
    const A: Record<string, any> = { MonstersDamage: md, MonsterDamageReduction: 0.5, PlayerHPmax: 1e9, PlayerHP: 1e9, ShieldPercent: shield, TicketsToSpend: T,
      crusadebosskilled: 0, SkillTime: [], BossC2isActive: 1, mapleexp: 0, mapleexpREQ: 1, SkillCooldown: [] }
    const actor = new Proxy({}, { get: (_t, k) => k === 'getCurrentFrame' ? () => frame : k === 'getX' ? () => (frame === 38 ? 500 : 100) : k === 'getY' ? () => 400 : () => inert })
    const p = new Proxy({}, { get: (_t, k) => k === 'randomInt' || k === 'randomFloatBetween' ? (lo: number, hi: number) => (end ? hi : lo) : inert })
    ;(compile(draw, A, { t: { wrapper: { enabled: true }, actor }, p }) as Function)(inert, inert, inert, inert)
    return { hp: (1e9 - A.PlayerHP) / (md * 0.5), shield: shield - A.ShieldPercent }
  }
  const avg = (frame: number, T: number) => (shot(frame, T, 0, 0).hp + shot(frame, T, 1, 0).hp) / 2
  const flat = (frame: number, T: number) => shot(frame, T, 0, 1e5, 0).shield
  for (const T of [3, 14, 45]) {
    const [E, O, S, G] = [0, 1, 2, 3].map((b) => asylumAttacks(b, T))
    expect(E!.cycle[1]!.md).toBeCloseTo(avg(27, T), 9) // Emigdala 26→27
    expect(E!.cycle[2]!.flat).toBe(flat(30, T)) // laser, shield points only
    expect(shot(30, T, 1, 0).hp).toBe(0)
    expect(O!.cycle[0]!.md).toBeCloseTo(3 * avg(29, T), 9) // 3 bounces on average
    expect([O!.cycle[1]!.md, O!.cycle[1]!.flat]).toEqual([avg(31, T), flat(31, T)])
    expect([S!.cycle[1]!.md, S!.cycle[2]!.md, S!.cycle[2]!.flat]).toEqual([avg(32, T), avg(33, T), flat(33, T)])
    expect([G!.cycle[1]!.md, G!.cycle[1]!.flat]).toEqual([avg(36, T), flat(36, T)])
    expect(shot(38, T, 0, 0).hp * 500).toBe(1e9 / 5) // 38: min(PlayerHPmax/5, HP − 1), unreduced
  }
  // Food: one pass of the Asylum scene's food listener with HP down (every slot heals), then with HP full (shield food).
  const a41 = src.indexOf('"scripts.SceneEvents_41"')
  const foodL = matchBraces(src, src.indexOf('function', src.indexOf('this.addWhenDrawingListener(null,(function(t,n,r,i){a.wrapper.enabled&&(1==b.engine.getGameAttribute("IsPlayerAlive")&&(0>=', a41)))
  const S = Array.from({ length: 100 }, (_, i) => i + 1)
  const run = (hp: number) => {
    const A: Record<string, any> = { IsPlayerAlive: 1, FoodInUse: [0, 0, 0, 0, 0, 0], PlayerHP: hp, PlayerHPmax: 1e9, ShieldPercent: 10, ShieldPercentMAX: 1e5,
      SmithingItemLevel: S, SkillLevels: Object.assign([], { 27: 3 }), CbonusHealingItems: 20, CbonusCyberneticFOOD: 10 }
    ;(compile(foodL, A) as Function)(inert, inert, inert, inert)
    return A
  }
  const healed = run(1), shielded = run(1e9)
  expect(healed.PlayerHP - 1).toBeCloseTo(FOOD.reduce((t, [i, k]) => t + k * S[i]! * 1.6 * 1.2, 0), 6)
  expect(healed.FoodInUse.slice(1)).toEqual(FOOD.map(([, , w]) => w))
  expect(shielded.ShieldPercent - 10).toBe(SHIELD_FOOD.reduce((t, [i, d, cap]) => t + Math.ceil(Math.min(S[i]! / d * 1.1, cap)), 0))
})

test('Asylum ShieldPercentMAX formula equals the stored value; Scallius Z with Mark on was a death on the 2026-10-11 save (the author), and is not a no once the game records a Z win', async () => {
  const path = `${import.meta.dir}/../../data/save.json` // the live save the ground truth was taken on (the fixture's stored max is stale by 5)
  if (!existsSync(path)) return
  const s = await Bun.file(path).json()
  // Pin tinker deck 1, the gear worn for the run: the save keeps whatever deck is on now (the author moved to deck 2 later that
  // day), but ShieldPercentMAX is only stored on Asylum entry. Linking deck 1 to Boss Looting (10) makes raidDecks equip it.
  const dl = [...(s.DeckLinkList ?? [])]; dl[12] = 10
  const f = fightContext({ ...s, DeckLinkList: dl })
  if ('missing' in f) throw new Error(f.missing)
  // ShieldPercentMAX is rewritten at every combat-scene entry with one formula (fight @31673715, raids @19898801, crusade @23171966, Asylum
  // @26867472) and no CurrentlyViewedScreen says which ran last, so the stored value is the formula on whichever deck was equipped then.
  // The stored value is only rewritten on combat entry, so it lags anything levelled since: on 2026-10-27 Rift 7 went 98 → 99
  // after the last fight and the formula read 71496 against a stored 71491 (exactly the formula at Rift 98). So it must match
  // some deck at the current Rift 7 level or a few levels below it.
  const rift = n(s.RiftLVL?.[7])
  const decks = Array.from({ length: Math.max(n(s.TinkerDecksOWNED), 1) }, (_, i) => {
    const d = [...(s.DeckLinkList ?? [])]; for (let k = 1; k <= 9; k++) d[11 + k] = k === i + 1 ? 10 : 0
    return Array.from({ length: Math.min(rift, 5) + 1 }, (_, back) => {
      const r = [...(s.RiftLVL ?? [])]; r[7] = rift - back
      const g = fightContext({ ...s, DeckLinkList: d, RiftLVL: r })
      return 'missing' in g ? NaN : asylumShieldMax(g.rd)
    })
  }).flat()
  expect(decks).toContain(s.ShieldPercentMAX)
  const bell = n((s.AsylumBellBEST ?? [])[3])
  if (n(s.RaidBossKilled?.[7]) < 45) { // the author's death was on a save from before he beat Scallius Z (RaidBossKilled[7] was 3)
    const c = asylumCell(f, 2, 45, bell, 1, runSeconds(8))
    expect(c.ttk).toBeLessThan(runSeconds(8)) // the damage race alone says win (74 s then, ~53 s later that day)
    expect(c.die).toBeLessThan(c.ttk) // you die first
    expect(c.verdict).toBe('no')
  } else { // the game has since recorded a Scallius Z win, so at least one owned deck must not be a 'no' with Mark off
    const v = Array.from({ length: Math.max(n(s.TinkerDecksOWNED), 1) }, (_, i) => {
      const d = [...(s.DeckLinkList ?? [])]; for (let k = 1; k <= 9; k++) d[11 + k] = k === i + 1 ? 10 : 0
      const g = fightContext({ ...s, DeckLinkList: d })
      return 'missing' in g ? 'missing' : asylumCell(g, 2, 45, bell, 0, runSeconds(8)).verdict
    })
    expect(v.some((x) => x === 'win' || x === 'close')).toBe(true)
  }
  expect(verdicts(reactive(s))).toEqual(verdicts(s))
})
const n = (v: unknown) => Number(v ?? 0) || 0

// ---- Boss and difficulty names against the game's own text (#2641).
const gameNames = Bun.file(`${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`)
test.skipIf(!(await gameNames.exists()))('raid and Asylum boss names and difficulty words are the game\'s', async () => {
  const { BOSSES } = await import('./raids')
  const g = await gameNames.text()
  for (const [d, boss] of [['DAYDREAM', 'KING'], ['CHAOTIC', 'KING'], ['DAYDREAM', 'ENTERTAINER'], ['CHAOTIC', 'ENTERTAINER'], ['NIGHTMARE', 'ENTERTAINER'], ['DAYDREAM', 'SENTINEL'], ['CHAOTIC', 'SENTINEL'], ['NIGHTMARE', 'SENTINEL'], ['CHAOTIC', 'DEMON'], ['NIGHTMARE', 'DEMON']]) {
    expect(g).toContain(`"DEFEAT_${d}_${boss}"`)
    expect(BOSSES.raid.some((b) => b[0].toUpperCase() === boss)).toBe(true)
    expect(TIERS.raid.tiers.some((t) => t[0].toUpperCase() === d)).toBe(true)
  }
  const at = g.indexOf('"EMIGDALA"', 22_260_000)
  const list = [...g.slice(at, at + 1500).matchAll(/"([A-Z]+(?:_[XYZ])?)"/g)].map((m) => m[1]!)
  const want = BOSSES.asylum.flatMap((b) => [b[0], ...TIERS.asylum.tiers.filter((t) => t[0]).map((t) => `${b[0]}_${t[0]}`)]).map((x) => x.toUpperCase())
  expect(list.slice(0, 16)).toEqual(want)
})

// 2026-10-24 23:20 incident (the author): Asylum Scallius Z (T 45), bell 8, Mark on, card deck 10, tinker deck 1. Died at once,
// 15 keys lost. The model said ttk 0, die Infinity, 'win': it sized HP and the shield's base on the scene init's PlayerHPmax
// (4.95e17), which the HP-skill actor replaces on the next frame (3.52e14, = the live PlayerHP). The save is the 23:15
// extract; copy it to data/fixture-asylum-2026-10-24.json to keep this test after the next extract.
import { OPENING, verdictOf } from './raids'
test('fight HP is the HP-skill actor\'s value; death in the opening is a loss', () => {
  expect(verdictOf(0, runSeconds(8), OPENING - 0.1)).toBe('no')
  expect(verdictOf(0, runSeconds(8), OPENING + 0.1)).toBe('win')
  expect(verdictOf(0, 0)).toBe('no') // dead on the first frame
  if (!existsSync(BUNDLE_PATH)) return
  // ActorEvents_539's draw listener, branch SkillTime[10] ≤ 0 (@10500239): PlayerHPmax write (@10502958) run on the save.
  const src = loadBundle(BUNDLE_PATH), at = src.indexOf('b.engine.getGameAttribute("SkillActive")[10]=0', 10500239)
  expect(at).toBe(10500242)
  const body = src.slice(at, src.indexOf('h.PlayerHPmax=i', at) + 15)
  return fullSave().then((s) => {
    const A: Record<string, any> = { ...s, SkillActive: Object.assign([...s.SkillActive], { 10: 1 }) }
    ;(compile(`function(){${body}}`, A) as Function)()
    expect(A.SkillActive[10]).toBe(0)
    expect(A.PlayerHPmax / fightHPmax(s)).toBeCloseTo(1, 12)
  })
})
const incident = [`${import.meta.dir}/../../data/fixture-asylum-2026-10-24.json`, `${import.meta.dir}/../../data/save.json`].find(existsSync)
test.skipIf(!incident)('2026-10-24 incident: Scallius Z, bell 8, Mark on is not a win', async () => {
  const s = await Bun.file(incident!).json()
  if (!(s.endLVL === 699 && s.ShieldPercentMAX === 69939 && s.AsylumBellBEST?.[3] === 8)) return // a later save: stats moved on
  const f = fightContext({ ...s, CardDeckSelected: 10, TinkerDeckSelected: 1 })
  if ('missing' in f) throw new Error(f.missing)
  expect(fightHPmax(f.rd)).toBeCloseTo(352167949458657, -3) // live PlayerHP on the Fighting screen
  const c = asylumCell(f, 2, 45, 8, 1, runSeconds(8))
  expect(c.die).toBeLessThan(OPENING) // ~5.9 s: two 32 volleys break the 69939% shield, the next hit (1.02e15) kills
  expect(c.verdict).not.toBe('win')
  expect(c.verdict).toBe('no')
})
