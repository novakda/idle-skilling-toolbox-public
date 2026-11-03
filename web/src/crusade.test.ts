import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { BUNDLE, blockHost, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { conquestContext, COUNT, CRUSADES, crusades, materialName, rewardPct, skillEvents, mobInterval, nextReq, perVictory, potion, shownExpPerDay, stageHP, stats, totalCrusaders, withCrusade } from './crusade'
import {fightStartHPmax, raidDecks, raidStats } from './combat'
import { smithingBaseAttack } from './smithing'
import type { Fight } from './raids'
import { cbonus, type Catalog, zoneTotalCardLV } from './cards-calc'
import { equipmentBonuses, masteryBonuses, potionBonuses } from './load-bonuses'
import catalog from './data/card-catalog.json'
import wiki from '../../data/wiki/datasets/crusades.json'

const capture = (day: string) => new URL(`../../data/captures/${day}/crusade/attrs.json`, import.meta.url).pathname
// 2026-10-03: on the crusade screen (crusade 1, difficulty 96, level 73). 2026-10-09: right after claiming 12 victories of
// crusade 10 (difficulty 68). Local captures, gitignored.
const C03 = capture('2026-10-03'), C09 = capture('2026-10-09')
const saves = async () => [await fullSave(), ...(await Promise.all([C03, C09].filter(existsSync).map((p) => Bun.file(p).json())))]

test('stored values: EXP/day shown, crusaders, potion bonuses', async () => {
  for (const s of await saves()) {
    const c = s.ConquestSelected
    expect(rewardPct(s, s.ConquestDifficultyselected[c], true) / s.ConquestRewardPCT).toBeCloseTo(1, 12)
    // The pane redraws CrusadeEXPperday only while it shows; the 10-03 capture still holds crusade 10's from before crusade 1 was picked.
    if (c === 10) expect(shownExpPerDay(s) / s.CrusadeEXPperday).toBeCloseTo(1, 12)
    expect(totalCrusaders(s)).toBe(s.TotalCrusaders)
    expect(potion(s).PbonusCrusadeExp).toBe(s.PbonusCrusadeExp)
    expect(potion(s).PbonusCrusMATS1).toBe(s.PbonusCrusMATS1)
  }
})

test.skipIf(!existsSync(C09))('stored value: the claim of 12 crusade-10 victories (CrusadeEXPearned)', async () => {
  const s = await Bun.file(C09).json()
  expect((12 * perVictory(s, 10, s.ConquestDifficultyselected[10]).exp) / s.CrusadeEXPearned).toBeCloseTo(1, 12)
})

test.skipIf(!existsSync(C03))('level-up requirement: level 72 (fixture) → 73 (capture)', async () => {
  const a = await fullSave(), b = await Bun.file(C03).json()
  expect(a.ConquestLV).toBe(72)
  expect(nextReq(a.ConquestREQ, 73) / b.ConquestREQ).toBeCloseTo(1, 12)
})

test('names, unlock levels and drops match the wiki', () => {
  const rows = (wiki as any[]).filter((r) => r._page === 'Crusades' && r._section === 'Drops')
  expect(rows).toHaveLength(COUNT)
  rows.forEach((r, i) => {
    const k = CRUSADES[i + 1]!, [boss, ...mats] = r._images as string[]
    expect(boss!.toLowerCase().replace(/_/g, ' ').replace(/^crusader /, '')).toBe(`${k.name.toLowerCase()}.png`)
    if (k.unlock != null && r.CrusadeLevel != null) expect(k.unlock).toBe(r.CrusadeLevel) // the wiki table has no level for 14-15
    // The wiki's art is named by tier and index ("Common11" = id 11, "Uncommon1" = id 17); Pearlescent art (ids 81-89) is
    // numbered differently on the wiki ("Pearl8", "Perarlescent7", "Pearlescent9"), so only the tier is checked there.
    expect(mats.map((m) => m.replace(/\.png$/, '').replace(/^Pe\w*rl\w*?(\d+)$/, 'Pearlescent'))).toEqual(k.drops.map(([, id]) => materialName(id).replace(/ (\d+)$/, '$1').replace(/ \(id \d+\)$/, '')))
  })
})

// ---- The game's own code in the sandbox (dev only: needs the extracted bundle).
const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const scene = (n: number) => src.indexOf(`"scripts.SceneEvents_${n}"`)
const at = (needle: string, from = 0) => { const i = src.indexOf(needle, from); if (i < 0) throw new Error(`anchor moved: ${needle}`); return i }
/** Attributes for the sandbox: the save plus the derived inputs the scenes read, taken from the app's ports. */
const rewrap = (v: unknown): unknown => Array.isArray(v) ? v.map(rewrap) : v && typeof v === 'object' ? { h: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrap(x)])) } : v
function attrs(s: Record<string, any>) {
  return { ...Object.fromEntries(Object.entries(structuredClone(s)).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? rewrap(v) : v])), ...cbonus(s, catalog as unknown as Catalog), ...equipmentBonuses(s).scalar, MasteryBonuses: masteryBonuses(s),
    DropListID: Array(6).fill(0), DropListCHANCE: Array(6).fill(0), DropListQTY: Array(6).fill(0) } as Record<string, any>
}

test.skipIf(!src)('fight-scene crusade blocks equal stats(), every crusade, difficulty 1-300', async () => {
  const s = attrs(await fullSave()), a = at('null!=e.ConquestSealsUsed', scene(32)), b = at('p.runPeriodically(1e3,', a)
  for (let c = 1; c <= COUNT; c++) for (let d = 1; d <= 300; d += d < 30 ? 1 : 7) {
    const A = { ...s, ConquestSelected: c, ConquestDifficultyselected: Array(40).fill(d) } as Record<string, any>
    ;(compile(`function(){${src.slice(src.lastIndexOf('var ', a), b)}}`, A) as Function)()
    const st = stats(s, c, d), close = (x: number, y: number) => expect(x === y || Math.abs(x / y - 1) < 1e-12).toBe(true)
    close(st.base, A.ConquestCrusadepointsBASE); close(st.dmg, A.ConquestBaseDMG); close(st.hp, A.ConquestBaseHP)
    close(st.req, A.ConquestAttackReq); close(st.def, A.ConquestDEF); close(st.mobHP, A.ConquestMobHP); close(st.mobDMG, A.ConquestMobDMG)
    close(st.bossHP, A.ConquestBossHP); close(st.bossDMG, A.ConquestBossDMG); expect(st.attacks).toBe(A.ConquestAttacksMax)
    close(st.weapon, A.ConquestWeaponSpeed); close(st.recharge, A.ConquestAttackRechargeSpeed)
  }
})

test.skipIf(!src)('select screen copies the fight values (BaseDMG/BaseHP differ for crusades 1-5 only)', async () => {
  const s = attrs(await fullSave())
  for (let c = 1; c <= COUNT; c++) {
    // The select screen splits its crusade blocks over several draw listeners; find the one for c.
    const k = CRUSADES[c]!, head = at(`getGameAttribute("DropListID")[1]=${k.drops[0]![1]},`, at('null!=e.ConquestSealsUsed', scene(35)))
    const fn = matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener(null,', head)))
    const A = { ...s, ConquestSelected: c, ConquestDifficultyselected: Array(40).fill(50) } as Record<string, any>
    ;(compile(fn, A, { a: { wrapper: { enabled: true } } }) as Function)(inert, 0, 0, 0)
    const st = stats(s, c, 50)
    ;(k.sel ?? [k.dmg, k.hp]).forEach((v, i) => expect(v / [A.ConquestBaseDMG, A.ConquestBaseHP][i]).toBeCloseTo(1, 12))
    if (!k.sel) expect([A.ConquestBaseDMG, A.ConquestBaseHP]).not.toEqual([0, 0])
    for (const [x, y, w] of [[st.def, A.ConquestDEF, "def"], [st.bossHP, A.ConquestBossHP, "bossHP"], [st.req, A.ConquestAttackReq, "req"]] as const) if (!(c === 15 && w === 'req')) // 15's Details pane has its own requirement
      expect(`${c} ${w} ${(x / y).toFixed(9)}`).toBe(`${c} ${w} 1.000000000`)
  }
})

test.skipIf(!src)('stage HP and mob hit interval equal the fight\'s draw listener', async () => {
  const s = attrs(await fullSave())
  const fn = matchBraces(src, src.indexOf('function', at('this.addWhenDrawingListener(null,(function(a,n,r,i){if(t.wrapper.enabled&&1==b.engine.getGameAttribute("IsPlayerAlive")){var o=b.engine,s=2-Math.min(', scene(32))))
  for (const c of [1, 4, 10, 13]) for (const d of [1, 40, 96]) {
    const st = stats(s, c, d), hp = stageHP(st, c)
    for (let L = 0; L <= 4; L++) {
      const A = { ...s, ConquestSelected: c, mapleLV: L, mapleexp: 0, IsPlayerAlive: 1, SkillActive: [], Energy: 100,
        ConquestBaseHP: st.hp, ConquestMobHP: st.mobHP, ConquestBossHP: st.bossHP, ConquestBaseDMG: st.dmg, ConquestMobDMG: st.mobDMG, ConquestBossDMG: st.bossDMG }
      ;(compile(fn, A, { t: { wrapper: { enabled: true } } }) as Function)(inert, 0, 0, 0)
      expect((A as any).mapleexpREQ / hp[L]!).toBeCloseTo(1, 12)
      expect((A as any).MonstersDamageSpeed).toBe(mobInterval(c, L))
    }
  }
})

const claimFn = () => matchBraces(src, src.indexOf('function', at('this.addMouseOverActorListener(this.actor,(function(a,n){', src.indexOf('"scripts.ActorEvents_995"'))))
function claim(s: Record<string, any>, c: number, d: number, V: number) {
  const A = { ...attrs(s), ConquestPageSelected: 10, ConquestDifficultyselected: Object.assign(Array(40).fill(0), { [c]: d }), ConquestEXP: 1000,
    // The map's number (highest unlocked) set far off, to show the claim reads only the crusade's selected difficulty († @17976149).
    ConquestDifficultyLV: Array(52).fill(999),
    ConquestUnclaimedRewards: Object.assign(Array(16).fill(0), { [c]: V + 0.5 }), CraftingMaterialsOwned: Array(100).fill(0) } as Record<string, any>
  const actor = { getX: () => 50, getY: () => 50, setCurrentFrame() {}, enableActorDrawing() {}, disableActorDrawing() {} }
  ;(compile(claimFn(), A, { t: { wrapper: { enabled: true }, actor }, p: { ...inert, randomInt: () => 1, saveGame() {}, createRecycledActor() {}, getActorType() {} } }) as Function)(5, 0)
  return A
}

test.skipIf(!src)('a claim pays perVictory() per victory: EXP and every material, each crusade', async () => {
  const s = withCrusade(await fullSave())
  for (let c = 1; c <= COUNT; c++) for (const d of [1, 8, 17, 27, 40, 68, 100]) {
    const A = claim(s, c, d, 7), v = perVictory(s, c, d)
    expect((A.ConquestEXP - 1000) / (7 * v.exp)).toBeCloseTo(1, 12)
    const got = (A.CraftingMaterialsOwned as number[]).map((q, id) => [id, q]).filter(([, q]) => q! > 0)
    expect(got.map(([id]) => id)).toEqual(v.mats.map((m) => m.id).sort((x, y) => x - y))
    for (const m of v.mats) expect(A.CraftingMaterialsOwned[m.id] / (7 * m.qty)).toBeCloseTo(1, 12)
    expect(A.ConquestUnclaimedRewards[c]).toBeCloseTo(0.5, 12)
  }
})

test.skipIf(!src)('claiming at difficulty 0 makes Crusade EXP NaN, and the crusade HUD then sets it to 0', async () => {
  const s = withCrusade(await fullSave()), A = claim(s, 2, 0, 3)
  expect(A.ConquestEXP).toBeNaN()
  expect(perVictory(s, 2, 0).exp).toBeNaN()
  expect(crusades({ ...s, ConquestDifficultyLV: [0, 5, 5], ConquestDifficultyselected: [0, 5, 0] }).map((r) => r.nanRisk)).toEqual([false, true])
  // ActorEvents_988's draw listener formats ConquestEXP by size; NaN fails every comparison and lands in the last branch.
  const hud = at('h.ConquestEXP=0', src.indexOf('"scripts.ActorEvents_988"'))
  const fn = matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener(null,', hud)))
  ;(compile(fn, A, { a: { wrapper: { enabled: true }, actor: inert } }) as Function)(inert, 0, 0, 0)
  expect(A.ConquestEXP).toBe(0)
  expect(src.indexOf('"VICTORIES_PER_DAY:_"+Math.round(12*')).toBeGreaterThan(0) // the info pane: 12 victories a day per crusader
  // Materials: crusade 2's quantity term goes negative at difficulty 0 (Q = 0.77·1.25 < 1) and turns NaN; crusade 3's doesn't.
  expect(perVictory(s, 2, 0).mats.filter((m) => Number.isNaN(m.qty)).map((m) => m.id)).toEqual([6, 12])
  expect(perVictory(s, 3, 0).mats.every((m) => Number.isFinite(m.qty))).toBe(true)
  expect([6, 12].map((id) => A.CraftingMaterialsOwned[id])).toEqual([NaN, NaN])
})

test.skipIf(!src)('the claim reads ConquestDifficultyselected[crusade] for R, not ConquestDifficultyLV', () => {
  const at995 = src.indexOf('"scripts.ActorEvents_995"'), r = at('h.ConquestRewardPCT=', at995)
  const body = src.slice(at('getGameAttribute("ConquestDifficultyselected")[0|b.engine.getGameAttribute("aa5")]', at995) - 3, r)
  expect(body).not.toContain('ConquestDifficultyLV')
  expect(r - at995).toBeLessThan(30000)
})

test.skipIf(!existsSync(C09))('stored: the 10-09 save holds NaN (JSON null) for exactly the materials a difficulty-0 crusade-2 claim breaks', async () => {
  const s = await Bun.file(C09).json()
  expect(s.CraftingMaterialsOwned.flatMap((q: number | null, id: number) => (q === null ? [id] : []))).toEqual([6, 12])
  expect(s.ConquestDifficultyselected[2]).toBe(0)
})

test.skipIf(!src)('Conquest fight: deck link 9, init stats and the DPS listener', async () => {
  const s = await fullSave(), rd = raidDecks(s, 9), rs = raidStats(rd)!
  // The deck swap 20 ms after entry.
  const D = attrs(s), swap = at('runLater(20,(function(t){for(t=0;11>t;)', scene(32))
  ;(compile(matchBraces(src, src.indexOf('function', swap)), D) as Function)(inert)
  expect(D.CardDeckSelected).toBe(rd.CardDeckSelected)
  // The init's stat statements (everything before the crusade blocks), on the link-9 deck the select screen already equipped.
  const A = { ...attrs(rd), ZoneTotalCardLV: zoneTotalCardLV(rd), PbonusBaseDmg: potionBonuses(rd, 0, 9).BaseDmg, PbonusMaxHP: potionBonuses(rd).MaxHP,
    SkillActive: [], SkillBonusdmgPCT: Array(29).fill(0) } as Record<string, any>
  const init = at('init:function(){', scene(32)) + 'init:function(){'.length
  ;(compile(`function(){${src.slice(init, src.lastIndexOf('var ', at('null!=e.ConquestSealsUsed', scene(32))))}}`, A) as Function).call({})
  expect(A.MedallionDamageBoost / rs.MedallionDamageBoost).toBeCloseTo(1, 12)
  expect(A.SmithingBaseAttack / smithingBaseAttack(rd, 9)).toBeCloseTo(1, 12) // the main fight's copy, not the raids' older one
  expect(A.YourCritChance).toBeCloseTo(rs.CriticalChance, 12)
  expect(A.YourCriticalDamage / rs.CriticalDamage).toBeCloseTo(1, 12)
  expect(A.Mastery).toBe(rs.Mastery)
  expect(A.PlayerHPmax / fightStartHPmax(rd)).toBeCloseTo(1, 12)
  for (const i of [2, 3, 4, 5, 11]) expect(rs.SkillBonusdmgPCT[i]).toBeCloseTo(A.SkillBonusdmgPCT[i], 12)
  // The DPS listener (every frame): GetPlayerDPS ÷ the DEF factor, and the hit requirement.
  const f = conquestContext(s) as Fight, host = blockHost(src, A) as any
  expect(f.base / host._customBlock_GetPlayerDPS()).toBeCloseTo(1, 12)
  const dps = compile(matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener', at('Be._customBlock_GetPlayerDPS()/Math.max((b.engine.getGameAttribute("ConquestDEF")', scene(32))))), A, { Be: host, D: host, t: { wrapper: { enabled: true } } }) as Function
  for (const [c, d] of [[10, 68], [10, 80], [1, 123], [13, 40]] as const) {
    const st = stats(rd, c, d), ev = skillEvents(f, c, d)
    Object.assign(A, { ConquestDEF: st.def, ConquestAttackReq: st.req }); dps(inert, 0, 0, 0)
    expect(A.MonsterHitRequirement).toBe(st.req)
    // The first Claw hit (cast at 0, multiplier × hit chance × crit) scales with the scene's DPS.
    const claw = f.skills.find((x) => x.name === 'Claw')!, m = claw.mult(f.ctx), cc = Math.min(Math.max(Math.floor(f.rs.CriticalChance), 0), 100) / 100
    const hitP = (100 - Math.min(Math.max(Math.floor(5 * (st.req - rd.atkLVL)), 0), 100)) / 100
    expect(ev[0]![1] / (A.DPS * m * hitP * (1 + cc * (f.rs.CriticalDamage - 1)) * (A.DPS < claw.thr ? (1 + f.rs.Mastery) / 2 : 1))).toBeCloseTo(1, 9)
  }
})

test.skipIf(!src)('crusades 14 and 15 open at Conquest level 120 and 140, behind Construction building 12 (#2640)', () => {
  expect([CRUSADES[14]!.unlock, CRUSADES[15]!.unlock]).toEqual([120, 140])
  const block = src.slice(23920094 - 450, 23920094 + 1100).replace(/"number"==typeof \w+\?c\.__cast\(\w+,\w\):|"number"==typeof \w+&&\(0\|\w+\)===\w+\?c\.__cast\(\w+,\w\):/g, '')
  expect(block).toContain('ConstructLV")[11]')
  expect(block).toMatch(/\.5<\(null==\w+\?0:/)
  expect(block).toContain('if(120<=b.engine.getGameAttribute("ConquestLV")){var')
  expect(block).toContain('ConquestDifficultyLV")[14]')
  expect(block).toContain('if(140<=b.engine.getGameAttribute("ConquestLV")){var')
  expect(block).toContain('ConquestDifficultyLV")[15]')
})
