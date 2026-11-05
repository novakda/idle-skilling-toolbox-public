import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../../../src/game-eval'
import { reactive } from 'vue'
import { autocastEvery, cost, expCut, gain, giftPlan, giftShop, ITEMS, raidTrophies } from './giftshop'
import wikiRaids from '../../../../data/wiki/datasets/raids.json'

const BUNDLE_PATH = `${import.meta.dir}/../../../../${BUNDLE}`

test('trophies per raid win match the wiki table (12 rows)', () => {
  const rows = (wikiRaids as any[]).filter((r) => r['Trophies Earned'] != null)
  expect(rows).toHaveLength(12)
  const off: string[] = []
  for (const r of rows) {
    const [d, boss] = (r.Boss_2 as string).split(' '), T = { Daydream: 1, Chaotic: 3, Nightmare: 10 }[d!]!
    const got = raidTrophies(['King', 'Entertainer', 'Sentinel', 'Demon'].indexOf(boss!), T), want = r['Trophies Earned'] as number
    if (got !== want) off.push(r.Boss_2)
    expect([r.Boss_2, Math.abs(got / want - 1) < 1e-3]).toEqual([r.Boss_2, true])
  }
  // The game floors the base before × T², so Chaotic/Nightmare are exactly 9×/100× Daydream; these four wiki cells aren't
  // (e.g. Nightmare Entertainer 57697 next to Daydream 577): typos or unfloored figures, all within 0.1%.
  expect(off).toEqual(['Nightmare Entertainer', 'Chaotic Sentinel', 'Nightmare Sentinel', 'Nightmare Demon'])
})

test('the save: 22 items, integer levels, 17/18 within their cap', async () => {
  const s = await fullSave(), lv = s.GiftShopLevels as number[], g = giftShop(s)
  expect(g.rows).toHaveLength(22)
  for (const it of ITEMS) expect(Number.isInteger(lv[it.i])).toBe(true)
  expect(lv[17]! <= 4 && lv[18]! <= 4).toBe(true)
  expect(g.held).toBe(s.BloodMoney)
})

test.skipIf(!existsSync(BUNDLE_PATH))('buy button, level-up cut and autocast timer equal the game code', async () => {
  const src = loadBundle(BUNDLE_PATH), s = await fullSave()
  // Buy button (ActorEvents_624): one click per item on its tab and position, at the save's level and at 0.
  const at = src.indexOf('"scripts.ActorEvents_624"'), init = matchBraces(src, src.indexOf('init:function', at) + 5)
  for (const it of ITEMS) for (const L of [0, (s.GiftShopLevels as number[])[it.i]!, 4]) {
    const lv = Array(53).fill(0); lv[it.i] = L
    const M = 2 * cost(it.kind, L) + 1, A: Record<string, any> = { GiftShopType: it.tab, GiftShopLevels: lv, BloodMoney: M }
    const hover: Function[] = []
    const self = { wrapper: { enabled: true }, actor: { getX: () => [100, 400, 700][it.col], getY: () => [300, 500][it.row], ...inert },
      addMouseOverActorListener: (_a: unknown, f: Function) => hover.push(f), addWhenDrawingListener() {} }
    ;(compile(init, A) as Function).call(self)
    hover[0]!(5, inert)
    const capped = (it.kind === 'attacks' || it.kind === 'buffs') && L >= 4
    expect([it.i, L, lv[it.i]]).toEqual([it.i, L, capped ? L : L + 1])
    if (!capped) expect([it.i, L, (M - A.BloodMoney) / cost(it.kind, L)]).toEqual([it.i, L, expect.closeTo(1, 9) as any])
    for (let j = 1; j <= 22; j++) if (j !== it.i) expect(lv[j]).toBe(0) // no other slot moved
    // Not enough trophies: nothing happens.
    const B: Record<string, any> = { GiftShopType: it.tab, GiftShopLevels: [...lv], BloodMoney: cost(it.kind, lv[it.i]) * 0.999 }
    const h2: Function[] = []
    ;(compile(init, B) as Function).call({ ...self, addMouseOverActorListener: (_a: unknown, f: Function) => h2.push(f) })
    h2[0]!(5, inert)
    expect(B.GiftShopLevels[it.i]).toBe(lv[it.i])
  }
  // Level-up checks: the EXP cut read right before each skill's REQ test.
  const raw = readFileSync(BUNDLE_PATH)
  for (const [off, i, exp] of [[19370404, 2, 'atkEXP'], [19365192, 4, 'strEXP'], [19360744, 6, 'endEXP'], [30327953, 8, 'miningEXP'],
    [30924014, 10, 'smithingEXP'], [31566101, 12, 'fishingEXP'], [21303856, 20, 'spiritEXP'], [21525322, 22, 'SummonEXP']] as const) {
    const w = raw.subarray(off - 160, off + 900).toString('latin1') // byte offsets, like rg -b
    expect([exp, w.slice(160).startsWith(`getGameAttribute("GiftShopLevels")[${i}]`), w.includes(`getGameAttribute("${exp}")`),
      /\*\(1-Math\.min\(/.test(w), w.includes('/5,50)/100)')]).toEqual([exp, true, true, true, true])
    expect(ITEMS.find((it) => it.i === i)!.kind).toBe('exp')
  }
  // Skillers: the lifters' away EXP × (1 + L/50), next to that skill's lifting chance (ActorEvents_121).
  for (const [off, i, chance] of [[3886576, 13, 'atkChance'], [3889708, 14, 'strChance'], [3892844, 15, 'endChance']] as const) {
    const w = raw.toString("latin1", off - 2500, off + 700)
    expect([i, w.slice(2500).startsWith(`getGameAttribute("GiftShopLevels")[${i}]`), w.includes(`getGameAttribute("${chance}")`), w.slice(2500).includes(')/50)')])
      .toEqual([i, true, true, true])
  }
  // Starting level: ascend (@20914264...) and rebirth (@20983801...) set <skill>LVL = 1 + GiftShopLevels[i] + other bonuses.
  for (const it of ITEMS.filter((x) => x.kind === 'start')) {
    const at = [...raw.toString('latin1', 20900000, 21060000).matchAll(new RegExp(`GiftShopLevels"\\)\\[${it.i}\\][^]{0,1500}?setReserved\\("(\\w+)"`, 'g'))]
    expect([it.i, at.map((m) => m[1])]).toEqual([it.i, [it.skill, it.skill]])
  }
  for (const L of [0, 1, 7, 145, 250, 300]) expect(expCut(L)).toBe(Math.min(L / 5, 50) / 100)
  // Autocast (SceneEvents_9): the 20 ms tick and the draw check that casts, counted in ticks.
  const s9 = src.indexOf('"scripts.SceneEvents_9"')
  const tickAt = src.lastIndexOf('p.runPeriodically(20,', src.indexOf('getGameAttribute("AutoCasting")+.02', s9))
  const tick = matchBraces(src, src.indexOf('function', tickAt))
  const castAt = src.lastIndexOf('this.addWhenDrawingListener', src.indexOf('15/(.08*', src.indexOf('getGameAttribute("AutoCasting")+.02', s9)))
  const cast = matchBraces(src, src.indexOf('function', castAt))
  for (const L of [1, 5, 61, 200]) {
    const A: Record<string, any> = { AutoCasting: 0, GiftShopLevels: Object.assign(Array(53).fill(0), { 16: L }), IsPlayerAlive: 1, AutoSkills: 1 }
    const t = compile(tick, A, { a: { wrapper: { enabled: true } } }) as Function, c = compile(cast, A, { a: { wrapper: { enabled: true } } }) as Function
    let k = 0
    do { t(inert); c(inert, inert, inert, inert); k++ } while (A.AutoCasting > 0 && k < 1e5)
    expect([L, 0.02 * k]).toEqual([L, expect.closeTo(autocastEvery(L), 1) as any]) // first tick past the threshold
  }
})

test('giftPlan: each group buys in gain-per-trophy order, levels and running totals add up, merged; reactive save', async () => {
  const s = await fullSave(), g = giftShop(s), plans = giftPlan(reactive(s), 6)
  expect(plans.length).toBeGreaterThan(0)
  for (const p of plans) {
    const grp = g.groups.find((x) => x.title === p.title)!, first = grp.list.find((r) => r.rank === 1)!
    expect([p.steps[0]!.i, p.steps[0]!.from]).toEqual([first.i, first.L]) // starts with the table's best buy
    let total = 0, buys = 0
    p.steps.forEach((st, k) => {
      for (let L = st.from; L < st.to; L++) total += cost(st.kind, L)
      buys += st.to - st.from
      expect(st.total).toBeCloseTo(total, 3)
      if (k) expect(st.i).not.toBe(p.steps[k - 1]!.i)
      if (st.kind === 'start') expect(st.gain).toBe(st.to - st.from)
    })
    expect(buys).toBeLessThanOrEqual(6)
    expect(gain(p.steps[0]!.kind, p.steps[0]!.from)).not.toBeNull()
  }
})
