import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from './test-save.test'
import { BUNDLE } from '../../src/game-eval'
import { buildCards, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import cardSources from './data/card-sources.json'
import { cardValue, expectedAll, expectedKills, gates, missingCards, plan, rank, type MissingCard, type Odds, type Sources, stageKillReq } from './cards-missing'

const PATH = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(PATH) ? readFileSync(PATH, 'latin1') : '' // latin1: string index = byte offset (the † offsets)
const O: Odds = { cardDrop: 0, crusadeCard: 0, ebonus: 0, energy: 1, rollsPerHour: 14400, crusadeRunSec: 3 }
const S = cardSources as unknown as Sources

test.skipIf(!src)('the boss card rolls sit in each win handler, just before the card actor', () => {
  const near = (off: number, s: string) => src.slice(off - 300, off).includes(s)
  for (const off of [19925267, 19938662, 19954658, 19969084]) {
    expect(src.slice(off, off + 17)).toBe('getActorType(875)')
    expect(near(off, 'randomInt(1,70-2*b.engine.getGameAttribute("TicketsToSpend")')).toBe(true)
  }
  ;[[26901624, 100], [26919565, 110], [26935833, 130], [26954655, 145]].forEach(([off, N]) =>
    expect(near(off!, `randomInt(1,${N}-b.engine.getGameAttribute("TicketsToSpend")`)).toBe(true))
  expect(src.slice(31781147, 31781500)).toContain('randomInt(1,170*(1+b.engine.getGameAttribute("currentfightmode")/3)/(1+b.engine.getGameAttribute("CbonusCardDropChance")/100)')
  expect(src.slice(31812316, 31812700)).toContain('randomInt(1,1500*(1+(b.engine.getGameAttribute("currentfightmode")-10)/2)')
  expect(src.slice(17987265, 17987600)).toContain('Math.max(b.engine.getGameAttribute("Energy")-2.2,20)')
})

test('odds: zones, crusades and bosses per the rolls', () => {
  expect(expectedKills({ kind: 'zone', mode: 12, stages: [0, 0] }, { ...O, cardDrop: 100 })).toBe(1500)
  expect(expectedKills({ kind: 'zone', mode: 3, stages: [0, 0] }, O)).toBe(340)
  expect(expectedKills({ kind: 'crusade', conquest: 9, stages: [4, 4] }, { ...O, energy: 0.5 })).toBe(3000)
  expect(expectedKills({ kind: 'boss', boss: 'B', tickets: 10 }, O)).toBe(50)
  expect(expectedKills({ kind: 'boss', boss: 'D2', tickets: 45 }, O)).toBe(100)
  // E[max] of geometrics: one card = 1/p; two cards at p: 2/p − 1/(1 − (1 − p)²).
  expect(expectedAll([0.01])).toBeCloseTo(100, 9)
  expect(expectedAll([0.01, 0.01])).toBeCloseTo(200 - 1 / (1 - 0.99 ** 2), 9)
})

test('stage gate follows the advance rule: the last stage visited in each mode is at most one past the furthest with kills', async () => {
  // You leave stage L upward only once it has kills (@7633616); FurthestMapleLV[mode] holds the last stage visited (@7631079).
  const s = await fullSave(), g = gates(s)
  for (const m of [1, 2, 3, 4, 5, 11, 12, 13, 14, 15]) expect((s.FurthestMapleLV as number[])[m]!).toBeLessThanOrEqual(g.furthest(m) + 1)
  // every owned zone card's mode is open (fightsunlocked never goes down: its only writes raise it, @3864936-@3866025, @7636004)
  const levels = s.CardLevels as number[]
  for (const [id, ss] of Object.entries(S.sources)) for (const z of ss) if (z.kind === 'zone' && levels[+id]! >= 1) expect(g.modeOpen(z.mode)).toBe(true)
})

test('rows, ranking and plan on the save; the page model runs on the reactive save Vue passes', async () => {
  const s = await fullSave(), cards = buildCards(s, catalog as unknown as Catalog).cards as unknown as MissingCard[]
  const decks = [{ deck: 1, w: { CardDropChance: 3, TotalDamage: 1 } }]
  const run = (save: Record<string, unknown>) => {
    const g = gates(save), val = (c: MissingCard) => cardValue(c, Number(save.CardBonusTOTAL ?? 1), decks, { CardDropChance: 10, TotalDamage: 10 })
    const rows = rank(missingCards(cards, S, g, O, val))
    return { rows, p: plan(rows, g, O) }
  }
  const { rows, p } = run(s)
  expect(rows.length).toBe(cards.filter((c) => !c.hidden && c.level < 1).length)
  // value first (to 0.1), then time among ready cards of the same value
  for (let i = 1; i < rows.length; i++) expect(Math.round(rows[i - 1]!.value * 10)).toBeGreaterThanOrEqual(Math.round(rows[i]!.value * 10))
  // event cards: unreachable while no event runs
  if (!s.EventIsON) for (const r of rows.filter((x) => /Event/.test(x.zone ?? ''))) expect(r.status).toBe('unreachable')
  // crusades 16+ don't exist: no row points at one
  expect(rows.some((r) => r.src?.kind === 'crusade' && r.src.conquest > 15)).toBe(false)
  // plan: running totals add up, only ready cards, stops never repeat
  let t = 0
  for (const st of p.farm) { t += st.hours; expect(st.total).toBeCloseTo(t, 9); expect(st.cards.every((r) => r.status === 'ready')).toBe(true) }
  expect(new Set([...p.farm, ...p.boss].map((x) => x.stop)).size).toBe(p.farm.length + p.boss.length)
  const R = run(reactive(s))
  expect(R.rows.map((r) => [r.id, r.status, r.hours])).toEqual(rows.map((r) => [r.id, r.status, r.hours]))
  expect(R.p.farm.map((x) => x.total)).toEqual(p.farm.map((x) => x.total))
}, 30000)

// ---- D1 (#2640): where the cards without a zone/boss/crusade source come from, per the game's code.
const win = (off: number, n = 260) => src.slice(off - n, off + n)
test.skipIf(!src)('event shop and Secretkeeper sources sit where derive-sources cites them', () => {
  for (const [id, off] of [[169, 14937669], [171, 14938152], [175, 14938634], [176, 14939117], [177, 14935871], [174, 14944412]] as const)
    expect(win(off)).toContain(`"CardIDcustom",${id})`)
  expect(win(14940012)).toContain('178+')
  // rng(1,N) < 2 → 1/N for the four shared rolls (the roll sits just before each card id)
  for (const [id, off, N] of [[169, 14937669, 90], [171, 14938152, 400], [175, 14938634, 40], [176, 14939117, 600]] as const) {
    expect(src.slice(off - 330, off)).toContain(`randomInt(1,${N})`)
    expect(S.sources[String(id)]!.some((x) => x.kind === 'skill' && x.skill === 'Event' && Math.abs((x.chance ?? 0) - 1 / N) < 1e-12)).toBe(true)
  }
  expect(src.slice(20210322 - 300, 20210322 + 30)).toContain('getGameAttribute("SecretsFound")[3]')
  expect(S.sources['166']![0]).toMatchObject({ kind: 'skill', skill: 'Secret' })
})

test.skipIf(!src)('the cards left without a source are never set by any drop code', () => {
  const none = (catalog as unknown as { cards: { id: number; hidden?: boolean }[] }).cards.filter((c) => !c.hidden && !S.sources[String(c.id)]?.length).map((c) => c.id)
  // 167 Spooktober (one-time migration), 168/170/172 retired events, 355-360 unknown, 30 "Glitch" placeholders
  const glitch = [...range(382, 390), ...range(412, 420), ...range(444, 450), ...range(476, 480)]
  expect(none).toEqual([167, 168, 170, 172, 355, 356, 357, 358, 359, 360, ...glitch])
  // the zone drop actor (ActorEvents_875 @15661757) stops each fight mode short of the next one's first card: 381, 411, 443, 475
  const init = src.slice(15661757, 15661757 + 30000)
  for (const cap of [381, 411, 443, 475]) expect(init).toContain(`${cap}))`)
  // spooktober is granted once at update 2 (@20209766), not dropped
  expect(src.slice(20209766 - 200, 20209766 + 120)).toContain('uEarnedSpookCard')
})
function range(a: number, b: number) { return Array.from({ length: b - a + 1 }, (_, i) => a + i) }

test('stage gate walks the move-up requirement, not "any kills recorded" (Oblivion 2026-10-31)', () => {
  expect(stageKillReq(15, 46)).toBeGreaterThan(3.0e12); expect(stageKillReq(15, 46)).toBeLessThan(3.02e12) // game showed 3.01T
  const M = Array(4000).fill(0); for (let L = 0; L <= 55; L++) M[900 + L] = L < 46 ? 1e15 : 2e12 // kills recorded past the open stage
  const g = gates({ MapleMonster: M, fightsunlocked: 15 } as Record<string, unknown>)
  expect(g.furthest(15)).toBe(46) // stage 47: 2e12 < 3.01e12, so the arrow stops there
})
