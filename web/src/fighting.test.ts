import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { attacksPerSec, bestZones, cardChance, cardId, damageParts, estimate, fightingDeck, monsterGold, monsterHP, monsterName, dpsSpeed, fightStats, killReq, medallion, strafe, unlocked, zoneProgress, ZONES, type FightStats } from './fighting'
import { raidDecks } from './combat'
import { masteryBonuses } from './bus'
import { existsSync, readFileSync } from 'fs'
import { fresh } from './screen-bound'

// Fixture: a full local save taken on The Bog (mode 12, level 5).
test('zone progress: kills per zone sum to totalKills, unlocks follow fightsunlocked / the hell key', async () => {
  const s = await fullSave(), z = zoneProgress(s)
  // totalKills is the sum of MapleMonster[0..1499] at fight-scene init (@31599866); every zone block is in ZONES.
  const all = (s.MapleMonster as number[]).reduce((t, v) => t + (Number(v) || 0), 0)
  expect(z.reduce((t, r) => t + r.kills, 0) / all).toBeCloseTo(1, 12)
  expect(all / s.totalKills).toBeCloseTo(1, 3) // stored at the last fight-scene entry
  for (const r of z) expect(r.furthest).toBe(s.FurthestMapleLV[r.m])
  expect(z.find((r) => r.m === s.currentfightmode)!.here).toBe(s.mapleLV)
  expect(unlocked(s, 11)).toBe(s.HellKeyGot > 0)
  expect(unlocked({ fightsunlocked: 3 }, 3)).toBe(true)
  expect(unlocked({ fightsunlocked: 3 }, 4)).toBe(false)
  expect(ZONES.map((r) => r.m)).toEqual([1, 2, 3, 4, 5, 11, 12, 13, 14, 15])
  for (const r of z) if (r.key != null) expect(r.nextUnlocked).toBe(unlocked(s, ZONES[ZONES.findIndex((x) => x.m === r.m) + 1]!.m))
})

test('kill requirements: the arrow formula and the kill handler copy', () => {
  // Arrow (ActorEvents_253): zone 1 level 0 needs 5, Desert level 0 needs 30, Purgatory level 0 needs 3770.
  expect([killReq(1, 0), killReq(2, 0), killReq(2, 1), killReq(11, 0), killReq(11, 1)]).toEqual([5, 30, 50, 3770, 4210])
  // The kill handler adds 20·⌊(m-1)/2⌋ in zone type 1 from Mountains on, and equals the arrow's in type 2.
  expect(killReq(3, 0, true) - killReq(3, 0)).toBe(20)
  expect(killReq(5, 43, true) - killReq(5, 43)).toBe(40)
  expect(killReq(13, 61, true)).toBe(killReq(13, 61))
})

test('fight stats match what the fight scene stored (fixture: fight deck = the save\'s link-9 deck)', async () => {
  const s = await fullSave(), f = fightStats(s) as FightStats
  expect('missing' in f).toBe(false)
  expect(medallion(raidDecks(s, 9)) / s.MedallionDamageBoost).toBeCloseTo(1, 12) // @31690067 + item 89 @31691066
  expect(f.CriticalDamage / s.CriticalDamage).toBeCloseTo(1, 12) // YourCriticalDamage @31677036 (crit buffs off)
  expect(f.CriticalChance).toBeCloseTo(s.CriticalChance, 12)
  expect(f.Mastery).toBe(s.Mastery)
  expect(f.HPmax / s.PlayerHPmax).toBeCloseTo(1, 12)
  expect(f.SmithingBaseAttack / s.SmithingBaseAttack).toBeCloseTo(1, 5)
  expect(dpsSpeed(s, s.currentfightmode)).toBeCloseTo(s.dpsspeed, 12) // @31804150 / @31804609
  expect(attacksPerSec(s, f, 1)).toBeCloseTo(Math.min((0.02 + s.smithingAttackSpeedBoost) * (1 + Math.floor(10 * Math.min(s.RiftLVL[6], 1) + 3 * s.RiftLVL[6]) / 100) * 50 / dpsSpeed(s, 1), 40), 12)
  const d = damageParts(f)
  expect(d.stats).toBe(25 * s.strLVL + 8 * s.atkLVL + 2 * s.endLVL)
  expect(d.factors.every(([, v]) => Number.isFinite(v) && v > 0)).toBe(true)
  expect(fightStats({ ...s, PbonusCritDmg: undefined })).toEqual({ missing: 'PbonusCritDmg' })
})

// MasteryBonuses (crit damage ×[3], DPS ×[1]) uses the perk amounts the mastery scene's init scales by potion 128 and
// Realm vending item 7 (@29831400-29832200); the fixture has neither, the live save has vending 7 at level 1 (+3.8%).
test('mastery perk amounts scale by vending item 7 and potion 128', () => {
  const all = { MasteryPerksUnlocked: Array(201).fill(1) }, base = masteryBonuses(all)
  const v7 = masteryBonuses({ ...all, RealmStuff: Object.assign([], { 8: [0, 0, 0, 0, 0, 0, 0, 1] }) })
  expect((v7[13]! - 1) / (base[13]! - 1)).toBeCloseTo(1.038, 12) // additive type, perks 1-125
  const p = masteryBonuses({ ...all, PotionLV: Object.assign([], { 128: 175 }) }) // ×(1 + 2.5·175/350) = ×2.25 on types 1/3/6/14/…
  expect((p[6]! - 1) / (base[6]! - 1)).toBeCloseTo(2.25, 12)
  expect(p[13]).toBe(base[13]!)
})

const LIVE = 'data/save.json'
// MasteryBonuses (screen-bound.ts: the Mastery scene, no screen id) is judged fresh by agreeing with the model: a live save is
// stale when potion 128 / Realm vending 7 moved since the last visit, so skip (with a note). The fixture checks exactly.
test('mastery bonuses match what the game stored (fixture)', async () => {
  const s = await fullSave()
  masteryBonuses(s).forEach((v, i) => expect(v / s.MasteryBonuses[i]).toBeCloseTo(1, 9))
})
const live = existsSync(LIVE) ? JSON.parse(readFileSync(LIVE, 'utf8')) : null
const masteryStale = !!live && !fresh(live, 'MasteryBonuses', masteryBonuses(live))
if (masteryStale) console.warn('live save: MasteryBonuses stale (open the Mastery screen in game, then re-extract); mastery check skipped')
test.skipIf(!live || masteryStale)('live save: mastery bonuses match what the game stored', () => {
  masteryBonuses(live).forEach((v, i) => expect(v / live.MasteryBonuses[i]).toBeCloseTo(1, 9))
})
test.skipIf(!live)('live save: crit damage matches what the game stored', () => {
  const s = live, f = fightStats(s) as FightStats
  // CriticalDamage: the model is YourCriticalDamage (fight-scene init), copied into CriticalDamage by the fight actors; DPS: the
  // fight's DPS listener. Both fight screen (8) only (writers in screen-bound.ts); elsewhere they hold the last fight-scene visit.
  // The init reads the stored MasteryBonuses[3] (@31676607), so a stale MasteryBonuses (no Mastery visit since potion 128 / vending 7
  // moved) leaves CriticalDamage off by exactly model/stored MasteryBonuses[3] even on screen 8: fresh() checks that input too.
  if (!fresh(s, 'CriticalDamage', undefined, { MasteryBonuses: masteryBonuses(s) })) return
  expect(f.CriticalDamage / s.CriticalDamage).toBeCloseTo(1, 9)
  // DPS: the game rewrites it only while the fight scene draws (@31880404, same screen); outside it the stored value freezes while the lab keeps
  // raising TankBonusLIST[8], a factor of GetPlayerDPS, so off the fight screen the ratio is tank-now / tank-then (0.33 seen).
  // On it, GetPlayerDPS also multiplies by (1 + 0.2 * SkillLevels[18] * SkillActive[10]) (@2590856); the model runs with no skill
  // active, so a save taken mid-buff reads stored/model = that factor (SkillLevels[18] = 10 -> 3 -> the 0.333 seen on screen 8).
  const buff = 1 + 0.2 * Number(s.SkillLevels?.[18] ?? 0) * Number(s.SkillActive?.[10] ?? 0)
  expect((f.DPS * buff) / s.DPS).toBeGreaterThan(1 - 1e-9); expect((f.DPS * buff) / s.DPS).toBeLessThan(1.05)
})

test('Fighting deck = the deck whose DeckLinkList entry is 9, cards as equipped', async () => {
  const s = await fullSave(), d = fightingDeck(s)!, deck = (s.DeckLinkList as number[]).findIndex((l, i) => i >= 1 && i <= 11 && l === 9)
  expect(d.deck).toBe(deck)
  expect(d.cards.map((c) => c.id)).toEqual((s.CardEquipped as number[]).slice(10 * (deck - 1), 10 * deck).filter((id) => id > 0))
  for (const c of d.cards) expect(c.level).toBe(s.CardLevels[c.id])
  expect(fightingDeck({ ...s, DeckLinkList: [] })).toBeNull()
})

test('monster HP, gold, card and the AFK gold rate match the game\'s stored values (fixture: The Bog level 5)', async () => {
  const s = await fullSave(), m = s.currentfightmode, L = s.mapleLV
  expect(monsterHP(s, m, L) / s.mapleexpREQ).toBeCloseTo(1, 12) // @31804850 / @31806955
  expect(monsterGold(s, m, L) / s.defaultgold).toBeCloseTo(1, 12) // @31807360 / @31809880
  expect(monsterHP({}, 1, 0)).toBe(50) // zone type 1 @31775542: Mushroom (the wiki lists 50 HP too)
  expect([cardId(1, 0), cardId(2, 0), cardId(3, 47), cardId(15, 0), cardId(15, 216)]).toEqual([1, 31, 85, 481, 510])
  expect([monsterName(1, 0), monsterName(2, 0)]).toEqual(['Mushroom', 'Potted Sand'])
  expect(cardChance(1, 0)).toBe(1 / 226) // ⌊170·(4/3)⌋
  expect(cardChance(12, 60)).toBe(1 / 1875) // ⌊1500·2/1.6⌋
  // FightingCashPerMin (AFK screen @21682751) from the stored fight values: the estimate's gold/min × the AFK share.
  const f = { ...(fightStats(s) as FightStats), DPS: s.DPS, CriticalChance: s.CriticalChance, CriticalDamage: s.CriticalDamage, HPmax: s.PlayerHPmax, DR: s.MonsterDamageReduction }
  const e = estimate(f, m, L), r1 = s.RiftLVL[1]
  expect(Math.floor(Math.min(7 + 0.8 * Math.pow(r1, 0.7), 60)) / 100 * e.goldPerMin / s.FightingCashPerMin).toBeCloseTo(1, 3)
  expect(e.canFight).toBe(true)
  expect(estimate({ ...f, HPmax: 1 }, m, L).canFight).toBe(false) // one hit kills you: the AFK formula counts no kills
})

test('best zone ranks only unlocked zones, each at a level you can select, best first', async () => {
  const s = await fullSave(), f = fightStats(s) as FightStats, b = bestZones(s, f), z = zoneProgress(s)
  for (const list of [b.gold, b.kills, b.cards]) {
    expect(list.map((r) => r.m).sort((x, y) => x - y)).toEqual(z.filter((r) => r.unlocked).map((r) => r.m))
    for (let i = 1; i < list.length; i++) expect(list[i]!.perMin).toBeLessThanOrEqual(list[i - 1]!.perMin)
    for (const r of list) expect(r.L).toBeLessThanOrEqual(Math.max(z.find((x) => x.m === r.m)!.furthest, z.find((x) => x.m === r.m)!.here ?? 0))
  }
  expect(b.gold[0]!.perMin).toBe(Math.max(...b.gold.map((r) => estimate(f, r.m, r.L).goldPerMin)))
})

test('strafe: locked/unlocked from HasteUnlocked, null when the save lacks it (cloud save)', () => {
  expect(strafe({})).toBeNull()
  expect(strafe({ HasteUnlocked: 0, MasteryTasksComplete: Object.assign(Array(78).fill(0), { 77: 1 }) })).toEqual({ unlocked: false, usedBefore: true })
  expect(strafe({ HasteUnlocked: 1 })).toEqual({ unlocked: true, usedBefore: false })
})
