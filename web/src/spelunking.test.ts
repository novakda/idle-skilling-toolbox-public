import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from './test-save.test'
import { BUNDLE, blockHost, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { bagItems, bagTier, bags, bagYield, canBuy, digDown, gate, hireCost, hired, learnBar, learnGain, learnPerHour, MIN_REQ, nextReq, nextSteps, PCT, PERKS, plan, pointsFor, rareChance, route, speedPerHour, treasurePerItem, upgradeCost, upgradeGain, value } from './spelunking'

test('stored values: SpelunkerREQ is 30 grown by the level-up rule to the stored level', async () => {
  const s = await fullSave()
  let r = 30
  for (let L = 2; L <= s.SpelunkerLV; L++) r = nextReq(r, L)
  expect(r / s.SpelunkerREQ).toBeCloseTo(1, 12)
})

test('learn bar: tier t takes 1440·t points; pointsFor inverts learnBar', () => {
  expect(learnBar(0)).toBe(0)
  expect(learnBar(1440)).toBe(1) // tier 1 done after 1440 points
  expect(learnBar(1440 + 2880)).toBe(2)
  expect(learnBar(1440 + 1440)).toBe(1.5)
  for (const b of [0.1, 0.5, 2.3, 7, 12, 12.7]) expect(learnBar(pointsFor(b))).toBeCloseTo(b, 12)
})

test('bag tier: ⌊log10 v⌋ − 1, 1-26, nothing under 100', () => {
  expect([bagTier(99), bagTier(100), bagTier(999), bagTier(1e4), bagTier(3.8e6), bagTier(1e40)]).toEqual([0, 1, 1, 3, 5, 26])
})

// ---- The game's own code in the sandbox (dev only: needs the extracted bundle).
const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const scene = () => src.indexOf('"scripts.SceneEvents_49"')
const fnAt = (needle: string) => { const i = src.indexOf(needle, scene()); if (i < 0) throw new Error(`anchor moved: ${needle}`); return matchBraces(src, src.indexOf('function', i)) }
const spliced = (name: string) => [...src.slice(src.indexOf(`this._${name}=[]`, scene())).matchAll(new RegExp(`this\\._${name}\\.splice\\((\\d+),0,("[^"]*"|[\\d.]+)\\)`, 'g'))]
  .slice(0, 15).map((m) => JSON.parse(m[2]!.startsWith('.') ? `0${m[2]}` : m[2]!))

test.skipIf(!src)('perk names, % per level and learn-bar thresholds are the scene\'s own lists', () => {
  const title = (x: string) => x.toLowerCase().replace(/_/g, ' ')
  expect(spliced('LearningCardNAMES').slice(1).map(title)).toEqual(PERKS.slice(1).map((x) => x.toLowerCase()))
  expect(spliced('LearningcardPERCENT')).toEqual(PCT)
  expect(spliced('MinReqLearnBarNUM')).toEqual(MIN_REQ)
})

/** Variants that move every input the ports read. */
async function variants() {
  const s = await fullSave()
  const learn = Array.from({ length: 113 }, (_, i) => (i % 7) * 13 + (i % 3))
  return [s,
    { ...structuredClone(s), SpelunkerLearnLVs: learn, SpelunkerStatus: [0, 2, 1, 1, 2, 1, 0, 1, 1], SpelunkerLvsVSD: Array.from({ length: 25 }, (_, i) => (i ? 5 + i * 9 : 0)),
      PotionLV: Object.assign([...s.PotionLV], { 124: 40, 133: 60, 135: 33, 139: 80, 147: 25 }), CbonusTunnels: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      EbonusThree: Object.assign(Array(18).fill(0), { 15: 7, 16: 8, 17: 9 }), DigDownOverflow: [0, 5e4, 0, 3e5, 1, 0, 0, 9e4, 0],
      MTXdemonspelunkersPurchased: 3, MTXcanarysPurchased: 2, SkillLevels: Object.assign([...s.SkillLevels], { 70: 140 }), ConstructLV: Object.assign([...s.ConstructLV], { 3: 12, 27: 9, 28: 4 }),
      SpelunkerDistanceMAX: [100, 2e6, 3e7, 5e5, 9e9, 1e4, 100, 7e5, 1e3] }]
}

test.skipIf(!src)('speed, learning, value, dig-down, treasure and bags equal the game\'s blocks for all 8 spelunkers', async () => {
  for (const t of await variants()) for (let k = 1; k <= 8; k++) {
    const A = { ...structuredClone(t), aa12: k, SpelunkerSelected: k }, B = blockHost(src, A) as any
    const close = (a: number, b: number) => expect(a === b || (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a / b - 1) < 1e-12).toBe(true)
    close(speedPerHour(t, k), B._customBlock_SpelunkerSpeedperHour())
    close(learnPerHour(t, k), B._customBlock_SpelunkerLearnperHour())
    close(value(t, k), B._customBlock_SpelunkerVALUE())
    close(digDown(t, k), B._customBlock_DigDownAmount())
    close(treasurePerItem(t, k), B._customBlock_AmountOfTreasure())
    const b = bags(t, k)
    expect(b.chance).toBe(B._customBlock_MultibagChance())
    close(b.decay, B._customBlock_MultibagDecay())
  }
})

test.skipIf(!src)('Diggy Hole and the all-spelunker We\'re Goin Down term change nothing in DigDownAmount (clamped to 300)', async () => {
  const s = await fullSave()
  const dig = (learn: number[]) => (blockHost(src, { ...structuredClone(s), SpelunkerLearnLVs: learn, SpelunkerSelected: 1 }) as any)._customBlock_DigDownAmount()
  const zero = Array(113).fill(0), d4 = Object.assign([...zero], { 4: 500 }), d7other = Object.assign([...zero], { 21: 500 }), d7own = Object.assign([...zero], { 7: 50 })
  expect(dig(d4)).toBe(dig(zero))
  expect(dig(d7other)).toBe(dig(zero))
  expect(dig(d7own)).toBeGreaterThan(dig(zero)) // its own 5%/level on the 10^… term is real
})

test.skipIf(!src)('upgrade and hire costs equal SpelunkCost1a-3b on the save and on other levels', async () => {
  for (const t of await variants()) {
    for (const k of hired(t)) for (const u of [0, 1, 2] as const) {
      const B = blockHost(src, { ...structuredClone(t), SpelunkerSelected: k, CurrentlyViewedScreen: 22, SpelunkerMenuSelected: 1 }) as any
      const c = upgradeCost(t, k, u), [ga, gb] = [[B._customBlock_SpelunkCost1a, B._customBlock_SpelunkCost1b], [B._customBlock_SpelunkCost2a, B._customBlock_SpelunkCost2b], [B._customBlock_SpelunkCost3a, B._customBlock_SpelunkCost3b]][u]!
      expect(c.gold / ga()).toBeCloseTo(1, 12)
      expect(c.amount / gb()).toBeCloseTo(1, 12)
    }
    const h = hireCost(t)
    if (h) {
      const B = blockHost(src, { ...structuredClone(t), SpelunkerSelected: 0, SpelunkerMenuSelected: 2 }) as any
      expect(h.gold / B._customBlock_SpelunkCost2a()).toBeCloseTo(1, 12)
      expect(h.amount).toBe(B._customBlock_SpelunkCost2b())
    }
  }
})

test.skipIf(!src)('the hire listener takes exactly the ported gold, treasure tier and level requirement', async () => {
  const s = await fullSave()
  const hire = fnAt('addMouseOverActorListener(p.getRegion(20),(function(t,n){if(a.wrapper.enabled&&5==t&&(2==b.engine.getGameAttribute("SpelunkerMenuSelected")')
  for (const t of [1, 2, 3, 5, 7]) {
    const VSD = Array.from({ length: 25 }, (_, i) => (i >= 1 && i <= 3 * t ? 10 : 0))
    const base = { ...structuredClone(s), SpelunkerLvsVSD: VSD, SpelunkerSelected: 0, SpelunkerMenuSelected: 2, TreasureOwned: Array(29).fill(1e6), goldcoin: 1e300 }
    const h = hireCost(base)!
    expect(h.k).toBe(t + 1)
    for (const lv of [h.level - 1, h.level]) {
      const A: Record<string, any> = { ...structuredClone(base), SpelunkerLV: lv }
      const host = { wrapper: { enabled: true }, _CostCurrencies112233: Object.assign(Array(7).fill(0), { 4: h.tier }) }
      ;(compile(hire, A, { a: host, Be: blockHost(src, A), p: inert }) as Function)(5, 0)
      expect(A.SpelunkerLvsVSD[1 + 3 * t]).toBe(lv >= h.level ? 1 : 0)
      if (lv >= h.level) { expect(A.goldcoin).toBe(1e300 - h.gold); expect(1e6 - A.TreasureOwned[h.tier]).toBe(h.amount) }
    }
  }
})

test.skipIf(!src)('the 50 ms tick adds speed/72,000 depth and stops at the target; learners gain learning points', async () => {
  const s = await fullSave()
  const tick = fnAt('p.runPeriodically(50,(function(t){if(a.wrapper.enabled)for(t=0;8>t;){var n=t++,r=b.engine.getGameAttribute("SpelunkerLvsVSD")')
  const A: Record<string, any> = { ...structuredClone(s), SpelunkerStatus: [0, 1, 2, 1, 0, 0, 0, 0, 0], SpelunkerDistance: [0, 10, 500, 0, 0, 0, 0, 0, 0, 0, 0] }
  A.SpelunkerDistanceMAX = [...s.SpelunkerDistanceMAX]; A.SpelunkerDistanceMAX[3] = 1e-9
  const t0 = structuredClone(A)
  ;(compile(tick, A, { a: { wrapper: { enabled: true }, _SpelunkerSPDperHR: Array(9).fill(0) }, Be: blockHost(src, A) }) as Function)(0)
  expect(A.SpelunkerDistance[1] - 10).toBeCloseTo(speedPerHour(t0, 1) / 72e3, 9)
  expect(A.SpelunkerDistance[2] - 500).toBeCloseTo(learnPerHour(t0, 2) / 72e3, 9)
  expect(A.SpelunkerDistance[3]).toBe(1e-9) // capped at the target
})

test.skipIf(!src)('a learning trip: only perks at or under the bar gain, by the ported min/max roll', async () => {
  const s = await fullSave()
  const learn = fnAt('addMouseOverActorListener(p.getRegion(5),(function(t,n){if(a.wrapper.enabled&&5==t&&0==b.engine.getGameAttribute("SpelunkerMenuSelected")&&1<=b.engine.getGameAttribute("SpelunkerSelected")')
  for (const bar of [0.05, 0.3, 1.2, 4.5, 12.4]) for (const pot of [0, 120]) for (const roll of ['lo', 'hi'] as const) {
    const A: Record<string, any> = { ...structuredClone(s), SpelunkerSelected: 1, SpelunkerStatus: [0, 2, 0, 0, 0, 0, 0, 0, 0], SpelunkerMenuSelected: 0,
      SpelunkerDistance: [0, pointsFor(bar), 0, 0, 0, 0, 0, 0, 0, 0, 0], SpelunkerLearnLVs: Array(113).fill(0), PotionLV: Object.assign([...s.PotionLV], { 149: pot, 150: pot }) }
    const p = new Proxy({ randomInt: (lo: number, hi: number) => (roll === 'lo' ? lo : hi) }, { get: (t, k) => (k in t ? (t as any)[k] : inert) })
    ;(compile(learn, A, { a: { wrapper: { enabled: true }, _MinReqLearnBarNUM: MIN_REQ }, Be: blockHost(src, A), p }) as Function)(5, 0)
    for (let q = 1; q <= 14; q++) {
      const g = learnGain(A, bar, q)
      expect(A.SpelunkerLearnLVs[q]).toBeCloseTo(g == null ? 0 : roll === 'lo' ? g.min : g.max, 9)
    }
  }
})

test('plan: every hired spelunker once, the one at its target or home first', async () => {
  const s = await fullSave()
  const p = plan(s)
  expect(p.all.map((x) => x.k).sort()).toEqual(hired(s))
  const t = structuredClone(s); t.SpelunkerDistance[2] = t.SpelunkerDistanceMAX[2]
  expect(plan(t).all[0]!.k).toBe(2)
})

test('upgradeGain works on the reactive save the page passes (structuredClone fails on Vue proxies)', async () => {
  const s = await fullSave()
  if (!s) return
  expect(() => upgradeGain(reactive(s), 1, 0)).not.toThrow()
})

// ---- #2653: bag treasure, the gate, Can buy / Next steps ---------------------------------------------------------------------
test.skipIf(!src)('items per bag and the rare-step chance equal MinimumBagItems / MaxBagItems / BagItemRareChance', async () => {
  for (const t of await variants()) for (const k of [1, 2, 5]) for (const v of [150, 9.9e3, 4.73e8, 1.2e9, 7.7e14, 3e28]) {
    const bagsOwned = Object.assign(Array(90).fill(0), { [10 * (k - 1) + 1]: v })
    const B = blockHost(src, { ...structuredClone(t), SpelunkerSelected: k, TreasureBAGSowned: bagsOwned }) as any
    const b = bagItems(t, k, v)
    expect([b.min, b.max]).toEqual([B._customBlock_MinimumBagItems(), B._customBlock_MaxBagItems()])
    expect(rareChance(t, k, v) / B._customBlock_BagItemRareChance()).toBeCloseTo(1, 12)
  }
})

/** A small save: spelunker 1 (V 40, S 90, D 42) digging toward 4e7, Yellow domain open, a machine, 28 of treasure 7. */
const mini = (o: Record<string, unknown> = {}): Record<string, any> => ({
  SpelunkerLV: 17, goldcoin: 1e80, SpelunkerLvsVSD: [0, 40, 90, 42], SpelunkerStatus: [0, 1], SpelunkerDistance: [0, 1e6], SpelunkerDistanceMAX: [100, 4e7],
  DigDownOverflow: [0, 0], SpelunkerLearnLVs: [], PbonusSpelunkSpd: 1, SkillLevels: [], PotionLV: [], EbonusThree: [], CbonusTunnels: Array(10).fill(0),
  ConstructLV: Object.assign(Array(70).fill(0), { 1: 1, 3: 10, 61: 1 }), TreasureOwned: Object.assign(Array(29).fill(0), { 7: 28 }), CardLevels: [], ...o })

test('bagYield: whole bag at or above the gate tier, p^steps below it, nothing more than 5 steps down', () => {
  const s = mini(), per = treasurePerItem(s, 1)
  expect(bagYield(s, 1, 1.5e9, 8)).toBeCloseTo(bagItems(s, 1, 1.5e9).mean * per, 12) // tier ⌊9.18 − 1⌋ = 8
  expect(bagYield(s, 1, 1.5e9, 9)).toBeCloseTo(bagItems(s, 1, 1.5e9).mean * rareChance(s, 1, 1.5e9), 12)
  expect(bagYield(s, 1, 1.5e9, 14)).toBe(0)
  expect(bagYield(s, 1, 99, 1)).toBe(0) // no bag under 100
})

test('gate: the first domain whose flag is unset; need is how many more than `more` you must hold', () => {
  expect(gate(mini())).toMatchObject({ domain: 'Blue', tier: 8, need: 3 })
  expect(gate(mini({ TreasureOwned: Object.assign(Array(29).fill(0), { 8: 2 }) }))!.need).toBe(1)
  expect(gate(mini({ TreasureOwned: Object.assign(Array(29).fill(0), { 8: 2.5 }) }))!.need).toBe(0) // 2.5 > 2 already opens it
  expect(gate(mini({ ConstructLV: Object.assign(Array(70).fill(0), { 1: 1, 13: 1 }) }))).toMatchObject({ domain: 'Green', tier: 15, need: 8 })
})

test('route: reach the target, then Dig Down until the bag yields the need; each leg costs its target / speed', () => {
  const s = mini(), r = route(s, 1)!, sp = speedPerHour(s, 1), val = value(s, 1)
  expect(r.legs[0]!.hours).toBeCloseTo((4e7 - 1e6) / sp, 9)
  expect(r.legs[1]!.target).toBeCloseTo(4e7 + digDown(s, 1), 6)
  expect(r.legs[1]!.hours).toBeCloseTo(r.legs[0]!.hours + r.legs[1]!.target / sp, 9)
  expect(r.legs.slice(0, -1).every((l) => l.expected < 3)).toBe(true)
  expect(r.expected).toBeGreaterThanOrEqual(3)
  expect(r.legs.at(-1)!.bag).toBeCloseTo(r.legs.at(-1)!.target * val, 3)
  expect(route(mini({ SpelunkerStatus: [0, 2] }), 1)).toBeNull() // learners have no depth
})

test('canBuy: Speed saves gate hours, its share is the treasure over what tier 7 converts to; the card row needs owned cards', () => {
  const s = mini(), rows = canBuy(s), sp = rows.find((b) => b.id === '1-1')!, c = upgradeCost(s, 1, 1)
  expect(sp.status).toBe('convert') // no Candle held, 28 Wealth Obol through the machine
  expect(sp.share).toBeCloseTo(c.amount / (28 * 3 ** (7 - c.tier)), 12)
  expect(sp.saved).toBeGreaterThan(0)
  expect(sp.bang).toBeCloseTo(sp.saved / sp.share, 9)
  expect(rows.some((b) => b.id === 'deck')).toBe(false)
  expect(canBuy(mini({ ConstructLV: Object.assign(Array(70).fill(0), { 1: 1, 3: 10 }) })).find((b) => b.id === '1-1')!.status).toBe('short') // no machine
})

test('nextSteps: greedy by bang, runs of one upgrade merged, conversions only from below the gate tier, hours fall', () => {
  const s = mini({ TreasureOwned: Object.assign(Array(29).fill(0), { 7: 28, 9: 40 }) }), p = nextSteps(s)!
  const first = canBuy(s).filter((b) => b.status !== 'short' && b.saved > 0).sort((a, b) => b.bang - a.bang)[0]!
  expect(p.steps[0]!.id).toBe(first.id)
  expect(p.steps.every((x, i) => i === 0 || x.id !== p.steps[i - 1]!.id)).toBe(true) // consecutive runs merged (Value and Speed may alternate)
  for (const x of p.steps) expect(Object.keys(x.conv).every((u) => +u < 8)).toBe(true) // treasure 9 is never converted
  expect(p.save.TreasureOwned[9]).toBe(40)
  expect(p.route!.hours).toBeLessThan(p.start!.hours)
  expect(p.steps.at(-1)!.hours).toBeCloseTo(p.route!.hours, 9)
})
