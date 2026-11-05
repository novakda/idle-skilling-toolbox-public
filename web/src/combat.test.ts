import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import {healthSmithingBoost, hitChance, monsterDamageReduction, monsterHitRequirement, monstersDamage, playerHPmax, skillBonusDmgPct } from './combat'

// Every value is compared with what the game stored in a full local save (fixture: The Bog, FightZoneTYPE 2, mode 12).
test('combat stats match the game', async () => {
  const s = await fullSave()
  skillBonusDmgPct(s).forEach((v, i) => expect(v).toBeCloseTo(s.SkillBonusdmgPCT[i], 9))
  expect(monsterDamageReduction(s)).toBeCloseTo(s.MonsterDamageReduction, 12)
  zoneTotalCardLV(s).forEach((v, i) => expect(v).toBe(s.ZoneTotalCardLV[i]))
  expect(healthSmithingBoost(s)).toBe(s.HealthSmithingBoost)
  expect(playerHPmax(s)! / s.PlayerHPmax).toBeCloseTo(1, 12)
  expect(monstersDamage(s)! / s.MonstersDamage).toBeCloseTo(1, 12)
  // Recomputed only while the fight screen draws; the fixture was taken on another screen (20) after waterLV went
  // 124 → 125, so its stored requirement still has 124 in it. (Live game, on the fight screen: matches exactly.)
  expect(monsterHitRequirement({ ...s, waterLV: 124 })!).toBeCloseTo(s.MonsterHitRequirement, 9)
  expect(hitChance(s)).toBe(100) // HUD "Hit Chance 100%" (requirement ~80 < atkLVL 187)
})

test('zone 1 monster damage and partial hit chance', () => {
  const s = { FightZoneTYPE: 1, currentfightmode: 1, mapleLV: 0, SkillActive: [], atkLVL: 0, waterLV: 0 }
  expect(monstersDamage(s)).toBe(3) // L=0, m=1: (0^1.75 + 1)·1 + 2·1
  expect(hitChance(s)).toBe(70) // requirement 6 vs atkLVL 0 → 100 - 30
  expect(monstersDamage({ FightZoneTYPE: 3 })).toBeNull()
})

// #32: raid, Asylum and Conquest monster damage. No full save is taken inside those fights, so the ports are checked
// against the game's own statements run in the sandbox (dev-only: needs the extracted bundle), the wiki's raid table, and
// the one stored Conquest value we have (two live captures, dev-only).
import { existsSync, readFileSync } from 'fs'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { asylumMonstersDamage, conquestMonstersDamage, fightStartHPmax, raidMonstersDamage } from './combat'
import wikiRaids from '../../data/wiki/datasets/raids.json'
import { bossHP, HP_BASE } from './modules/raids/raids'

test('raid boss damage matches the wiki table', () => {
  const rows = (wikiRaids as any[]).filter((r) => r['Boss Damage per Hit'] != null)
  expect(rows).toHaveLength(12)
  for (const r of rows) {
    const [diff, boss] = (r.Boss_2 as string).split(' '), T = { Daydream: 1, Chaotic: 3, Nightmare: 10 }[diff!]!
    expect(raidMonstersDamage({}, ['King', 'Entertainer', 'Sentinel', 'Demon'].indexOf(boss!), T)).toBe(r['Boss Damage per Hit'])
  }
})

const bundle = `${import.meta.dir}/../../${BUNDLE}`
test.skipIf(!existsSync(bundle))('raid / Asylum / Conquest MonstersDamage and fight-start HP equal the game code', async () => {
  const src = loadBundle(bundle), bytes = readFileSync(bundle)
  // Every offset cited in combat.ts is a MonstersDamage write (byte offsets, as rg -b prints them).
  for (const at of [19920679, 19921572, 19922487, 19923476, 19923958, 26888467, 26889377, 26890288, 26891640, 26892451, 26893776, 23187602, 23382755])
    expect(bytes.subarray(at, at + 17).toString()).toBe('h.MonstersDamage=')
  const after = (scene: number, needle: string) => { const at = src.indexOf(needle, src.indexOf(`"scripts.SceneEvents_${scene}"`)); expect(at).toBeGreaterThan(0); return at }
  const A: Record<string, any> = {}
  const listener = (scene: number, needle: string) => compile(matchBraces(src, src.indexOf('function', after(scene, needle))), A) as Function
  const stmt = (scene: number, needle: string, write: string) => {
    const at = after(scene, needle)
    return compile(`function(){${src.slice(src.lastIndexOf('var ', at), src.indexOf(';', src.indexOf(write, at)) + 1)}}`, A) as Function
  }
  const raid = listener(16, 'this.addWhenDrawingListener(null,(function(n,i,o,s){if(a.wrapper.enabled&&1==b.engine.getGameAttribute("IsPlayerAlive")){var g=b.engine,m=b.engine.getGameAttribute("AscentionLevel")[3]')
  const asylum = listener(41, 'this.addWhenDrawingListener(null,(function(t,n,r,i){a.wrapper.enabled&&1==b.engine.getGameAttribute("IsPlayerAlive")&&(t=b.engine,n=null==(n=b.engine.getGameAttribute("AscentionLevel")[3])')
  const conquest = stmt(32, 'ConquestBaseDMG")*(1+b.engine.getGameAttribute("ConquestMobDMG")/100)', '.h.MonstersDamage=')
  const hpInit = stmt(16, '=100+25*Math.pow(b.engine.getGameAttribute("endLVL")-1,1.3)+b.engine.getGameAttribute("HealthSmithingBoost")', '.h.PlayerHPmax=')
  const set = (o: Record<string, unknown>) => { for (const k of Object.keys(A)) delete A[k]; Object.assign(A, { IsPlayerAlive: 1, AscentionLevel: [], MonstersDamage: 0,
    BossAhpTOT: HP_BASE[0], bossBhpTOT: HP_BASE[1], bossChpTOT: HP_BASE[2], bossDhpTOT: HP_BASE[3] }, o) }
  for (const sk of [0, 1]) for (const T of [1, 3, 10, 14, 45]) for (let boss = 0; boss < 4; boss++) for (const phase of [1, 2]) {
    const save = { SkillActive: Object.assign([], { 16: sk }) }
    set({ ...save, TicketsToSpend: T, DemonPhase: phase, [`Boss${'ABCD'[boss]}isActive`]: 1 }); raid(inert, inert, inert, inert)
    expect(A.MonstersDamage).toBe(raidMonstersDamage(save, boss, T, phase))
    expect(A.mapleexpREQ).toBe(bossHP('raid', boss, T, 0, 1, sk)) // #35: boss HP (the raid Demon has no phase 2)
    for (const bell of [0, 2]) {
      set({ ...save, TicketsToSpend: T, DemonPhase: phase, RaidBossQueue: 5 + boss, AsylumBell: [0, bell, bell, bell, bell] }); asylum(inert, inert, inert, inert)
      const first = A.MonstersDamage, want = asylumMonstersDamage(save, boss, T, bell, phase)
      expect(A.mapleexpREQ / bossHP('asylum', boss, T, bell, phase, sk)).toBeCloseTo(1, 12)
      asylum(inert, inert, inert, inert) // the next frame: Gorshank at Z with a bell keeps multiplying, the others repeat
      if (want === Infinity) expect(A.MonstersDamage / first).toBeCloseTo(1.5 ** (4 * bell), 9)
      else { expect(first / want).toBeCloseTo(1, 12); expect(A.MonstersDamage).toBe(first) }
    }
  }
  const s = await fullSave()
  for (let L = 0; L <= 7; L++) {
    set({ ...s, mapleLV: L }); conquest()
    expect(A.MonstersDamage / conquestMonstersDamage({ ...s, mapleLV: L })).toBeCloseTo(1, 12)
  }
  set(s); hpInit()
  expect(fightStartHPmax(s) / A.PlayerHPmax).toBeCloseTo(1, 12)
})

// Stored value: the 'crusade' capture (Conquest screen, stage mapleLV 3, ConquestBaseDMG 1000) holds the inputs; the game's
// next capture four minutes later still holds the MonstersDamage that fight set (20496838571.72), after the Conquest* values
// had moved on. Local captures, gitignored.
const cap = (name: string) => `${import.meta.dir}/../../data/captures/2026-10-03/${name}/attrs.json`
test.skipIf(!existsSync(cap('crusade')) || !existsSync(cap('cards')))('Conquest damage reproduces a stored value', async () => {
  const inputs = await Bun.file(cap('crusade')).json(), later = await Bun.file(cap('cards')).json()
  expect(conquestMonstersDamage(inputs) / later.MonstersDamage).toBeCloseTo(1, 12)
})

// #35: what the raid and Asylum scenes set for your side of the fight, against the scenes' own statements and the
// GetPlayerDPS block (dev-only). Inputs other ports own (cards, gear, mastery, zone card levels) are fed in from those ports.
import { blockHost } from '../../src/game-eval'
import { getPlayerDPS, raidDecks, raidStats } from './combat'
import { cbonus, type Catalog, zoneTotalCardLV } from './modules/cards/cards-calc'
import { equipmentBonuses, masteryBonuses, potionBonuses } from './bus'
import { skillHitRequirement } from './modules/raids/raids'
import cardCatalog from './data/card-catalog.json'
const rewrap = (v: unknown): unknown => Array.isArray(v) ? v.map(rewrap) : v && typeof v === 'object' ? { h: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrap(x)])) } : v
/** Attribute table for a raid-decked save, with the derived inputs the scene reads taken from the app's ports. */
function raidAttrs(rd: Record<string, any>) {
  const A: Record<string, any> = {}
  for (const [k, v] of Object.entries(rd)) A[k] = v && typeof v === 'object' && !Array.isArray(v) ? rewrap(v) : Array.isArray(v) ? structuredClone(v) : v
  Object.assign(A, cbonus(rd, cardCatalog as unknown as Catalog), equipmentBonuses(rd).scalar, { MasteryBonuses: masteryBonuses(rd), ZoneTotalCardLV: zoneTotalCardLV(rd),
    PbonusBaseDmg: potionBonuses(rd, 0, 10).BaseDmg, SkillActive: [], SkillBonusdmgPCT: Array(29).fill(0) })
  return A
}
test.skipIf(!existsSync(bundle))('raid and Asylum fight stats, GetPlayerDPS and scene DPS equal the game code', async () => {
  const src = loadBundle(bundle), s = await fullSave()
  for (const sv of [s, { ...s, DeckLinkList: Object.assign([...s.DeckLinkList], { 1: 10, 2: 0, 12: 10 }) }]) { // the save's link, and deck 1 + tinker deck 1
    const rd = raidDecks(sv), rs = raidStats(rd)!
    for (const scene of [16, 41]) {
      // The deck swap 20 ms after entry.
      const D = raidAttrs(sv), swap = src.indexOf('runLater(20,(function(t){for(t=0;11>t;)', src.indexOf(`"scripts.SceneEvents_${scene}"`))
      ;(compile(matchBraces(src, src.indexOf('function', swap)), D) as Function)(inert)
      expect([D.CardDeckSelected, D.EquipmentEquipped.slice(1, 9)]).toEqual([rd.CardDeckSelected, (rd.EquipmentEquipped as number[]).slice(1, 9)])
      const at = src.indexOf('runLater(50,(function(t){b.engine.getGameAttribute("SkillBonusdmgPCT")[2]=', src.indexOf(`"scripts.SceneEvents_${scene}"`))
      const A = raidAttrs(rd); (compile(matchBraces(src, src.indexOf('function', at)), A) as Function)(inert)
      const m = src.indexOf('h.Mastery=F', src.indexOf(`"scripts.SceneEvents_${scene}"`))
      if (scene === 16) { (compile(`function(){${src.slice(src.lastIndexOf('var ', src.lastIndexOf('getGameAttribute("SkillLevels")[7]', m)), m + 11)}}`, A) as Function)(); expect(A.Mastery).toBe(rs.Mastery) }
      for (const k of ['MedallionDamageBoost', 'SmithingBaseAttack'] as const) expect(rs[k] / A[k]).toBeCloseTo(1, 12)
      expect(rs.CriticalChance).toBeCloseTo(A.YourCritChance, 12)
      expect(rs.CriticalDamage / A.YourCriticalDamage).toBeCloseTo(1, 12)
      for (const i of [2, 3, 4, 5, 11]) expect(rs.SkillBonusdmgPCT[i]).toBeCloseTo(A.SkillBonusdmgPCT[i], 12)
    }
    // GetPlayerDPS: the block itself, then the raid and Asylum DPS listeners that divide it (@19999142, @26992321).
    const A = Object.assign(raidAttrs(rd), { SmithingBaseAttack: rs.SmithingBaseAttack, MedallionDamageBoost: rs.MedallionDamageBoost })
    const host = blockHost(src, A) as any, game = host._customBlock_GetPlayerDPS(), port = getPlayerDPS({ ...rd, ...rs, SkillActive: [] }) as number
    expect(port / game).toBeCloseTo(1, 12)
    const listener = (scene: number, needle: string) => compile(matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener', src.indexOf(needle, src.indexOf(`"scripts.SceneEvents_${scene}"`))))), A, { Be: host, D: host }) as Function
    const raidDps = listener(16, 'Be._customBlock_GetPlayerDPS()/b.engine.getGameAttribute("TicketsToSpend"),n=n.gameAttributes')
    const asyDps = listener(41, 'Be._customBlock_GetPlayerDPS()/b.engine.getGameAttribute("TicketsToSpend")*Math.max(')
    for (const T of [1, 3, 10, 14, 45]) for (let boss = 0; boss < 4; boss++) {
      Object.assign(A, { TicketsToSpend: T, DmgCappo: 0, nodamageraid: 1, BossAisActive: boss === 0, BossBisActive: boss === 1, BossCisActive: boss === 2, BossDisActive: boss === 3 })
      raidDps(inert, inert, inert, inert)
      expect(A.DPS / (port / T)).toBeCloseTo(1, 12)
      expect(A.MonsterHitRequirement / skillHitRequirement(rd, 'raid', boss, T)).toBeCloseTo(1, 12)
      for (const block of [0, 3.5, 800, 75e3]) {
        Object.assign(A, { AsylumBlock: block, BossA2isActive: boss === 0, BossB2isActive: boss === 1, BossC2isActive: boss === 2, BossD2isActive: boss === 3 })
        asyDps(inert, inert, inert, inert)
        expect(A.DPS / (port / T * 70 / (3 * block + 70))).toBeCloseTo(1, 12)
        expect(A.MonsterHitRequirement / skillHitRequirement(rd, 'asylum', boss, T)).toBeCloseTo(1, 12)
      }
    }
  }
})
