import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { BUNDLE, compile, loadBundle, matchBraces } from '../../../../src/game-eval'
import { ARENAS, arenaOf, awayExp, awayWater, expgivenAt, expInc, expPerRep, levelCost, nextReq, options, spend, speedAt, speedCost, speedStep, waterPerRep } from './training'

const capture = (day: string, page: string) => new URL(`../../../../data/captures/${day}/${page}/attrs.json`, import.meta.url).pathname
// Same ascension (15), local captures, gitignored.
const C08 = capture('2026-10-08', 'pet-inv-buy'), C09 = capture('2026-10-09', 'crusade')
const IDS = ARENAS.flatMap((a) => a.ids)

test('stored values: every owned lifter\'s expgiven = base + its level increments; animationspeed = (1 + smith boost) × its speed steps', async () => {
  const s = await fullSave()
  for (const i of IDS) {
    const L = s.LifterLV[i], L2 = s.LifterLV2[i]
    if (!L) continue
    expect(expgivenAt(i, L) / s.expgiven[i]).toBeCloseTo(1, 12)
    expect(speedAt(L2, s.smithingRepSpeedBoost) / s.animationspeed[i]).toBeCloseTo(1, 12)
  }
})

test.skipIf(!existsSync(C08) || !existsSync(C09))('level-up requirement ×1.222: 10-08 → 10-09 (Attack 3 level-ups, Strength 1, Endurance 2)', async () => {
  const a = await Bun.file(C08).json(), b = await Bun.file(C09).json()
  // Extra levels also come from elsewhere (atkLVL 201 → 206 with 3 level-ups); the requirement only moves on a level-up.
  for (const [k, ups] of [['atkREQ', 3], ['strREQ', 1], ['endREQ', 2]] as const) {
    let r = a[k]; for (let j = 0; j < ups; j++) r = nextReq(r, 200 + j)
    expect(r / b[k]).toBeCloseTo(1, 8)
  }
})

test('greedy spend never spends more than it has and buys the top-ranked lifter first', async () => {
  const s = await fullSave(), o = options(s)
  expect(o.length).toBe(IDS.filter((i) => s.LifterLV[i] > 0).length)
  const gold = o[0]!.cost * 1.5, r = spend(s, gold)
  expect(r.left).toBeGreaterThanOrEqual(0)
  expect([...r.bought.keys()][0]).toBe(o[0]!.i)
  expect(spend(s, 0).bought.size).toBe(0)
  // Nothing bought = no change: the after-rate must use the same away gift factor as rates() (was -47% before the fix).
  for (const g of spend(s, 0).gain.values()) expect(g).toBeCloseTo(0, 9)
  for (const g of r.gain.values()) expect(g).toBeGreaterThanOrEqual(0)
})

// ---- The game's own code in the sandbox (dev only: needs the extracted bundle).
const bundle = `${import.meta.dir}/../../../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const host = () => ({ wrapper: { enabled: true }, actor: new Proxy({}, { get: () => () => 0 }) })
const fnBefore = (needle: string, at: number) => { const i = src.lastIndexOf(needle, at); if (i < 0) throw new Error(`anchor moved: ${needle}`); return matchBraces(src, src.indexOf('function', i)) }

test.skipIf(!src)('buy handler: gold taken and expgiven / speed added per click equal the port, every lifter', async () => {
  const s = await fullSave()
  const start = src.indexOf('"scripts.ActorEvents_69"'), at = src.indexOf('this.addMouseOverActorListener(this.actor,(function(', start)
  const fn = matchBraces(src, src.indexOf('function', at))
  for (const i of IDS) for (const L of [1, 7, 250]) {
    const c = levelCost(i, L), c2 = speedCost(i, 40)
    const B: Record<string, any> = { ...structuredClone(s), MultiPurchaseToggle: 1, CurrentlyViewedScreen: arenaOf(i).screen, goldcoin: 2 * c, AreParticlesOn: 0, SelectedUpgrade: 2 * i - 5 }
    B.LifterLV[i] = L; const g0 = B.expgiven[i]
    ;(compile(fn, B, { t: host() }) as Function)(5, 0)
    expect(B.goldcoin / c).toBeCloseTo(1, 12)
    expect(B.LifterLV[i]).toBe(L + 1)
    expect(B.expgiven[i] - g0).toBeCloseTo(expInc(i, L), 9)
    const C: Record<string, any> = { ...structuredClone(s), MultiPurchaseToggle: 1, CurrentlyViewedScreen: arenaOf(i).screen, goldcoin: 2 * c2, AreParticlesOn: 0, SelectedUpgrade: 2 * i - 4 }
    C.LifterLV[i] = L; C.LifterLV2[i] = 40; const a0 = C.animationspeed[i]
    ;(compile(fn, C, { t: host() }) as Function)(5, 0)
    expect(C.goldcoin / c2).toBeCloseTo(1, 12)
    expect(C.LifterLV2[i]).toBe(41)
    expect(C.animationspeed[i] / a0).toBeCloseTo(speedStep(41), 12)
    C.LifterLV2[i] = 100; C.goldcoin = 1e300
    ;(compile(fn, C, { t: host() }) as Function)(5, 0)
    expect([C.LifterLV2[i], C.goldcoin]).toEqual([100, 1e300]) // capped
  }
})

test.skipIf(!src)('a rep: each lifter actor adds the ported skill EXP and water, after exactly `frames` frames', async () => {
  const s = await fullSave()
  for (const a of ARENAS) a.ids.forEach((i, k) => {
    const site = src.search(new RegExp(`\\d+<\\(null==\\(\\w=b\\.engine\\.getGameAttribute\\("animations"\\)\\[${i}\\]\\)`))
    expect(+src.slice(site, src.indexOf('<', site))).toBe(a.frames[k]!)
    const fn = fnBefore('addWhenDrawingListener(null,(function(', site)
    for (const L of [1, 300]) {
      const A: Record<string, any> = { ...structuredClone(s), PotionLV: Object.assign([...s.PotionLV], { 73: 12 }) }
      A.LifterLV[i] = L; A.animations[i] = a.frames[k]! + 1
      const e0 = A[a.exp], w0 = A.waterEXP, r0 = A.LiftingReps[i]
      ;(compile(fn, A, { t: host(), a: host() }) as Function)(0, 0, 0, 0)
      expect(A.LiftingReps[i]).toBe(r0 + 1)
      expect((A[a.exp] - e0) / expPerRep(A, i)).toBeCloseTo(1, 9)
      expect((A.waterEXP - w0) / waterPerRep(A, i)).toBeCloseTo(1, 9)
      A.animations[i] = a.frames[k]!
      ;(compile(fn, A, { t: host(), a: host() }) as Function)(0, 0, 0, 0)
      expect(A.LiftingReps[i]).toBe(r0 + 1) // one frame short: no rep
    }
  })
})

test.skipIf(!src)('away credit: each screen\'s 500 ms tick adds the ported skill and water EXP', async () => {
  const s = await fullSave()
  for (const a of ARENAS) {
    const scene = src.indexOf(`"scripts.SceneEvents_${{ 2: 3, 3: 4, 4: 14 }[a.screen]}"`)
    const fn = matchBraces(src, src.indexOf('function', src.indexOf('p.runPeriodically(500,(function(', scene)))
    const A: Record<string, any> = { ...structuredClone(s), OfflineGains: Array(50).fill(0), AwayTimeZone: Object.assign([...s.AwayTimeZone], { [a.screen]: 1000 }), QuitTime: Math.floor(Date.now() / 1000) }
    const q = A.QuitTime, e0 = A[a.exp], w0 = A.waterEXP
    ;(compile(fn, A, { t: host(), a: host() }) as Function)(0)
    const secs = Math.floor(A.LoadTime - q + 1000)
    expect((A[a.exp] - e0) / (awayExp(s, a) * secs)).toBeCloseTo(1, 9)
    expect((A.waterEXP - w0) / (awayWater(s, a) * secs)).toBeCloseTo(1, 9)
  }
})

test.skipIf(!src)('level-up on the skill\'s own screen: requirement ×1.222 + 5⌊L/5⌋ + 10⌊L/10⌋ + 2L', async () => {
  const s = await fullSave()
  for (const [a, at] of [[ARENAS[0]!, 22720549], [ARENAS[1]!, 26375320], [ARENAS[2]!, 19835295]] as const) {
    const fn = fnBefore('addWhenDrawingListener(null,(function(', at)
    for (const L of [49, 210]) {
      const A: Record<string, any> = { ...structuredClone(s), [a.lvl]: L, [a.req]: 1e9, [a.exp]: 1e9, waterEXP: 0 }
      ;(compile(fn, A, { t: host(), a: host() }) as Function)(0, 0, 0, 0)
      expect(A[a.lvl]).toBe(L + 1)
      expect(A[a.req]).toBe(nextReq(1e9, L + 1))
    }
  }
})

test('away rates include the gift shop away factor (1 + GiftShopLevels[13/14/15]/50), as the live check of #50 showed', async () => {
  const { rates, awayExp, awayGift, ARENAS } = await import('./training')
  const s = await fullSave()
  for (const a of ARENAS) {
    const pct = Number(s.nonActiveZoneGainPercent ?? 0) / 100
    expect(rates(s, a).away).toBeCloseTo(awayExp(s, a) * pct * awayGift(s, a), 6)
    expect(awayGift({ ...s, GiftShopLevels: [] }, a)).toBe(1)
  }
})
