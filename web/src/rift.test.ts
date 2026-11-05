import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from './test-save.test'
import { BONUS, bought, buys, EFFECTS, glyphBonusPct, nextReq, pro, rifts, spendPlan, SPEED_CAP, upgradeCost, withRift } from './rift'
import { potionBonuses } from './bus'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'

const bundle = new URL(`../../${BUNDLE}`, import.meta.url).pathname
// Read live on the Limbo screen, 2026-10-03, right after the scene init had run.
const LIMBO = new URL('../../data/captures/2026-10-03/limbo/attrs.json', import.meta.url).pathname

test.skipIf(!existsSync(LIMBO))('rift EXP bonus and potion bonus equal what the Limbo scene stored (live capture)', async () => {
  const s = await Bun.file(LIMBO).json()
  expect(potionBonuses(s).RiftExp).toBeCloseTo(s.PbonusRiftExp, 9)
  glyphBonusPct(s).forEach((v, i) => expect(v / s.GlyphsGivenBonusPercent[i]).toBeCloseTo(1, 12))
})

test('potion bonus matches the full save', async () => {
  const s = await fullSave()
  expect(potionBonuses(s).RiftExp).toBeCloseTo(s.PbonusRiftExp, 9)
})

test('upgrade levels rebuild the stored per-rift values (save and capture)', async () => {
  const saves = [await fullSave(), ...(existsSync(LIMBO) ? [await Bun.file(LIMBO).json()] : [])]
  for (const s of saves) for (let r = 1; r <= 9; r++) {
    const V = s.RiftVALUElv[r], S = s.RiftSpeedlv[r]
    if (!V) continue
    let se = 1, a = 1 // a new rift: value/speed lv 1, Summoning EXP 1, glyph 1, speed 1
    for (let L = 1; L < V; L++) se += 1 + Math.floor(L / 3) / 10 + Math.floor(L / 10) / 2
    for (let L = 1; L < S; L++) a *= 1 + 6 / (1 + Math.floor(a / 3) / 4.4) / 100
    expect(se / s.SummonExpGiven[r]).toBeCloseTo(1, 12)
    expect(a / s.RiftAnimationSpeed[r]).toBeCloseTo(1, 12)
    expect(1 + 0.05 * (V - 1) + 0.08 * (S - 1)).toBeCloseTo(s.GlyphsGiven[r], 9)
  }
})

test('every stored RiftCost1-4 entry is a cost the table produces (current selection exact on the capture)', async () => {
  // The game keeps one slot per currency; slots hold whichever rift last drew there, often at an older level. Unlock costs
  // († @21666915) also land in RiftCost1/2.
  const UNLOCK = new Set([10, 20, 300, 25, 400, 3, 5, 500, 200, 80, 15, 7e8])
  const saves = [await fullSave(), ...(existsSync(LIMBO) ? [await Bun.file(LIMBO).json()] : [])]
  for (const s of saves) for (const K of [1, 2, 3, 4]) {
    const kind = K <= 2 ? 'value' : 'speed', i = (K - 1) % 2
    s[`RiftCost${K}`].forEach((v: number, c: number) => {
      if (!v) return
      let hit = K <= 2 && UNLOCK.has(v)
      for (let r = 1; r <= 9 && !hit; r++) for (let L = 0; L <= 300 && !hit; L++) {
        const e = upgradeCost(r, kind, L)[i]
        hit = !!e && e[0] === c && Math.abs(e[1] / v - 1) < 1e-12
      }
      expect(`${K}:${c}:${hit}`).toBe(`${K}:${c}:true`)
    })
  }
  if (existsSync(LIMBO)) { // last drawn: rift 4 (value lv 135: currencies 4 and 3), both slots current
    const s = await Bun.file(LIMBO).json(), [[c1, q1], [c2, q2]] = upgradeCost(4, 'value', s.RiftVALUElv[4]) as [number, number][]
    expect([c1, c2]).toEqual([s.RiftCost1Currency, s.RiftCost2Currency])
    expect(q1! / s.RiftCost1[c1!]).toBeCloseTo(1, 12)
    expect(q2! / s.RiftCost2[c2!]).toBeCloseTo(1, 12)
  }
})

test('buys: grouped by rift, ranked by own bonus per day per share of souls; maxed speed (lv 125) not offered', async () => {
  const s = withRift(await fullSave()), list = buys(s), rows = rifts(s)
  expect(list.length).toBeGreaterThan(0)
  for (const [i, b] of list.entries()) {
    if (b.kind === 'speed') expect(s.RiftSpeedlv[b.r]).toBeLessThan(SPEED_CAP)
    const row = rows.find((x) => x.r === b.r)!
    // bonus per day = extra levels per day at the current requirement × what the next level is worth
    const lv = 86400 * row.riftExpAway * (b.riftPct / 100) / row.req
    expect(b.levelsPerDay / lv).toBeCloseTo(1, 9)
    expect(b.bonusPerDay / (lv * (BONUS[b.r]!.raw(row.lv + 1, s) - BONUS[b.r]!.raw(row.lv, s)))).toBeCloseTo(1, 9)
    if (i) {
      const p = list[i - 1]!
      expect(p.r).toBeLessThanOrEqual(b.r)
      if (p.r === b.r) { expect(p.score).toBeGreaterThanOrEqual(b.score); expect(b.best).toBe(false) } else expect(b.best).toBe(true)
    }
  }
})

test('spendPlan: levels priced by the cost table, within the souls held, leaves nothing affordable; works on reactive(save)', async () => {
  const SAVE = new URL('../../data/save.json', import.meta.url).pathname
  let steps = 0
  const f = await fullSave(), rich = { ...f, SoulsTotal: f.SoulsTotal.map((x: number) => 100 * x) } // rich: something is affordable
  for (const raw of [f, rich, ...(existsSync(SAVE) ? [await Bun.file(SAVE).json()] : [])]) {
    const s = withRift(raw), q = spendPlan(reactive(s)), start = (s.SoulsTotal as number[]).map(Number)
    steps += q.steps.length
    const spent = Array<number>(start.length).fill(0)
    let after: Record<string, unknown> = s
    for (const st of q.steps) {
      expect(st.to).toBeGreaterThan(st.from)
      const sum = Array<number>(start.length).fill(0)
      for (let L = st.from; L < st.to; L++) { for (const [c, v] of upgradeCost(st.r, st.kind, L)) sum[c]! += v; after = bought(after, st.r, st.kind) }
      sum.forEach((v, c) => { expect(st.cost[c]!).toBeCloseTo(v, 0); spent[c]! += v })
    }
    expect(new Set(q.steps.map((x) => `${x.r}${x.kind}`)).size).toBe(q.steps.length) // one step per upgrade
    start.forEach((v, c) => { expect(q.left[c]!).toBeGreaterThanOrEqual(0); expect(q.left[c]! + spent[c]!).toBeCloseTo(v, 0) })
    expect(buys({ ...after, SoulsTotal: q.left }).some((b) => b.affordable)).toBe(false)
  }
  expect(steps).toBeGreaterThan(0)
})

test('each rift bonus number agrees with the bonus text the page shows (floored where the game floors)', async () => {
  const s = await fullSave()
  for (const r of [3, 4, 5, 6, 7, 8]) for (const k of [1, 15, 47]) expect(EFFECTS[r]!.normal(k, s)).toContain(`+${Math.floor(BONUS[r]!.raw(k, s))}%`)
  expect(EFFECTS[1]!.normal(30, s)).toStartWith(`${Math.floor(BONUS[1]!.raw(30, s))}%`)
})

// ---- The game's own code, run in the sandbox (dev only: needs the extracted bundle).
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const at = (anchor: string, from = 0) => { const i = src.indexOf(anchor, from); if (i < 0) throw new Error(`anchor moved: ${anchor}`); return i }
const listener = (anchor: string, from = 0) => matchBraces(src, at(anchor, from) + anchor.indexOf('function'))
const z = () => Array(30).fill(0)

test.skipIf(!src)('value/speed cost table equals the game\'s cost listener, every rift, level 0-150', () => {
  const fn = listener('this.addWhenDrawingListener(null,(function(n,i,o,s){if(a.wrapper.enabled){var g=b.engine.getGameAttribute("DarkModeEnabled")[3];if(0==')
  for (let r = 1; r <= 9; r++) for (let L = 0; L <= 150; L++) {
    const a: any = { RiftSelected: r, RiftVALUElv: z().fill(L), RiftSpeedlv: z().fill(L), DarkModeEnabled: [0, 0, 0, 0], SelectedUpgrade: 0, RiftsOwned: 9,
      RiftCost1: z(), RiftCost2: z(), RiftCost3: z(), RiftCost4: z() }
    compile(fn, a)(inert, 0, 0, 0)
    for (const [kind, k1, k2] of [['value', 1, 2], ['speed', 3, 4]] as const) {
      const mine = upgradeCost(r, kind, L), c1 = a[`RiftCost${k1}Currency`], c2 = a[`RiftCost${k2}Currency`]
      expect(mine[0]![0]).toBe(c1)
      expect(mine[0]![1] / a[`RiftCost${k1}`][c1]).toBeCloseTo(1, 12)
      const g2 = a[`RiftCost${k2}`][c2]
      if (mine[1]) { expect(mine[1][0]).toBe(c2); expect(mine[1][1] / g2).toBeCloseTo(1, 12) } else expect(g2).toBe(0)
    }
  }
})

test.skipIf(!src)('Pro costs equal the game\'s dark-mode cost listener', async () => {
  const fn = listener('this.addWhenDrawingListener(null,(function(t,n,r,i){if(a.wrapper.enabled){var o=b.engine.getGameAttribute("DarkModeEnabled")[3];if(1==')
  const s = await fullSave()
  for (const P of [0, 1, 7, 29]) {
    const mine = pro({ ...s, RiftProLvs: z().fill(P) })
    for (let r = 1; r <= 9; r++) {
      const a: any = { RiftSelected: r, RiftProLvs: z().fill(P), DarkModeEnabled: [0, 0, 0, 1], RiftCost1: z(), RiftCost2: z() }
      compile(fn, a)(inert, 0, 0, 0)
      expect(a.RiftCost1Currency).toBe(13)
      expect(a.RiftCost2Currency - 13).toBe(mine[r - 1]!.treasureId)
      expect(mine[r - 1]!.souls / a.RiftCost1[13]).toBeCloseTo(1, 12)
      expect(mine[r - 1]!.treasure / a.RiftCost2[a.RiftCost2Currency]).toBeCloseTo(1, 12)
    }
  }
})

test.skipIf(!src)('glyph bonus equals the Limbo scene init on the full save', async () => {
  const s = await fullSave(), a: any = structuredClone(s)
  compile(listener('p.runLater(30,(function(t){for(t=0;11>t;){var a=t++,n=b.engine.getGameAttribute("GlyphsGivenBonusPercent")'), a)(0)
  glyphBonusPct(s, s.PbonusRiftExp).forEach((v, i) => expect(v / a.GlyphsGivenBonusPercent[i]).toBeCloseTo(1, 12))
  expect(withRift(s).SummonChance).toBe(a.SummonChance)
})

test.skipIf(!src)('away credit: the scene init pays what rifts() expects per credited second', async () => {
  const s = withRift(await fullSave()), a: any = { ...structuredClone(s), AwayTimeRewarded: 1000, OfflineGains: z() }
  compile(listener('p.runLater(20,(function(t){for(t=0;10>t;){var a=t++,n=b.engine.getGameAttribute("RiftEXP")'), a, { p: inert })(0)
  for (const x of rifts(s)) expect((a.RiftEXP[x.r] - s.RiftEXP[x.r]) / (1000 * x.riftExpAway)).toBeCloseTo(1, 12)
})

test.skipIf(!src)('level-up: requirement and Rift Rift spread equal the scene\'s draw listener', async () => {
  const s = withRift(await fullSave())
  const fn = listener('this.addWhenDrawingListener(null,(function(t,n,r,i){if(a.wrapper.enabled){if(8>=b.engine.getGameAttribute("RiftsOwned")', 21000000)
  for (const r of [3, 9]) {
    const a: any = { ...structuredClone(s), spiritEXP: 0, SummonEXP: 0, MTXgemportal: 0, RiftEXP: s.RiftExpREQ.map((q: number, i: number) => (i === r ? q + 5 : 0)) }
    compile(fn, a, { p: { ...inert, randomInt: () => 100, getActor: () => inert, createRecycledActor() {}, getActorType() {} } })(inert, 0, 0, 0)
    expect(a.RiftExpREQ[r] / nextReq(s, r, s.RiftExpREQ[r], s.RiftLVL[r] + 1)).toBeCloseTo(1, 12)
    expect(a.RiftEXP[r]).toBeCloseTo(5, 6)
    for (let i = 1; i <= 9; i++) expect(a.RiftLVL[i]).toBe(s.RiftLVL[i] + (r === 9 || i === r ? 1 : 0))
  }
})

test.skipIf(!src)('rift 2 draw sets the away-water bonus to BONUS[2], every level 0-150', () => {
  const a0 = at('var no=b.engine,ro=b.engine.getGameAttribute("RiftLVL")[2]'), a1 = at('lo.h.H20BonusPercent=oo', a0) + 23
  for (let k = 0; k <= 150; k++) {
    const a: any = { RiftLVL: Object.assign(Array(11).fill(0), { 2: k }) }
    compile(`function(){${src.slice(a0, a1)}}`, a)()
    expect(a.H20BonusPercent).toBeCloseTo(Math.floor(BONUS[2]!.raw(k, a)) / 100, 12)
  }
})
