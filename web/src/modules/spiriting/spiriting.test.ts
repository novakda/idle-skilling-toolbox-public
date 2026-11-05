import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from '../../test-save.test'
import { fresh } from '../../screen-bound'
import { bought, conversion, nextSpiritReq, optimal, riftNeeds, sequence, SKILLERS, stockpile, soulRates, spiritLevel, spiritRates, taskCap, upgradeCost, skillerStats, upgrades, withSpirit } from './spiriting'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../../../src/game-eval'

const SAVE = new URL('../../../../data/save.json', import.meta.url).pathname
const saves = async () => [await fullSave(), ...(existsSync(SAVE) ? [await Bun.file(SAVE).json()] : [])]
const close = (a: number, b: number) => expect(b ? a / b : a).toBeCloseTo(b ? 1 : 0, 9)

test('scene-init bonuses and acolyte conversion totals equal the stored values (fixture and live save)', async () => {
  for (const [j, raw] of (await saves()).entries()) {
    const s = withSpirit(raw), live = j > 0 // the live save is index 1 (live-save rule: CLAUDE.md "Live-save tests")
    // Writers in screen-bound.ts: PbonusLimboLuck at the fight and Potions scene inits, the rest only while Spriting (screen 9) is open.
    if (!live || fresh(raw, 'PbonusLimboLuck')) close(s.PbonusLimboLuck as number, raw.PbonusLimboLuck)
    if (live && !fresh(raw, 'SpiritChance')) continue
    const pairs: [number, number][] = ['SpiritChance', 'CultistEventBonusPercent'].map((k) => [s[k] as number, raw[k]])
    for (let i = 0; i < 10; i++) {
      pairs.push([(s.CultistSoulBonusPercent as number[])[i]!, raw.CultistSoulBonusPercent[i]])
      pairs.push([(s.AcolyteSoulBonusPercent as number[])[i]!, raw.AcolyteSoulBonusPercent[i]])
      if (i) { // index 0 also collects acolyte slot 0 (task 0) in the game; unused
        pairs.push([(s.SoulConversionChanceTOTAL as number[])[i]!, raw.SoulConversionChanceTOTAL[i]])
        pairs.push([(s.SoulsConvertedTOTAL as number[])[i]!, raw.SoulsConvertedTOTAL[i]])
      }
    }
    // The Mastery scene sets no CurrentlyViewedScreen, so a save taken there after Spiriting still reads 9 with these values frozen at
    // the last Spriting visit: skip the live save (with a note) when they lag the model; the fixture keeps the exact check.
    const scene = ['SpiritChance', 'CultistEventBonusPercent', 'CultistSoulBonusPercent', 'AcolyteSoulBonusPercent']
    if (live && !scene.every((k) => fresh(raw, k, s[k]))) {
      console.warn('live save: Spiriting values stale (screen 9 recorded, scene not open; reopen Spiriting, then re-extract); check skipped')
      continue
    }
    for (const [a, b] of pairs) close(a, b)
  }
})

test('upgrade levels rebuild each skiller\'s stored EXP, souls and speed; SpiritREQ is the requirement iterated from 10', async () => {
  for (const [j, s] of (await saves()).entries()) {
    // EXP/souls/speed are cached by the Spriting scene only (screen-bound.ts); SpiritREQ is not (level-up writes both).
    const model = skillerStats(s)
    if (j === 0 || fresh(s, 'SpiritExpGivenC')) for (const [lv, sp, lk, exp, souls, anim] of [['CultValueLV', 'CultSpeedLV', 'CultLuckLV', 'SpiritExpGivenC', 'SoulsGiven', 'CultistAnimationSpeed'],
      ['AcolyteLV', 'AcolyteLV2', 'AcolyteLV3', 'SpiritExpGivenA', 'SoulsGivenAco', 'AcolyteAnimationSpeed']] as const) for (let i = 1; i <= SKILLERS; i++) {
      const V = s[lv][i], S = s[sp][i], K = s[lk][i]
      if (!V) continue
      let e = 1, a = 1
      for (let L = 1; L < V; L++) e += 1 + Math.floor(L / 3) / 10 + Math.floor(L / 10) / 2
      for (let L = 1; L < S; L++) a *= 1 + 8 / (1 + Math.floor(L / 10) / 5) / 100
      close(e, s[exp][i]); close(a, s[anim][i])
      close(model[exp]![i]!, s[exp][i]); close(model[anim]![i]!, s[anim][i]); close(model[souls]![i]!, s[souls][i]) // the app's model
      expect(s[souls][i]).toBeCloseTo(1 + 0.01 * (V - 1) + 0.015 * (S - 1) + 0.005 * (K - 1), 9)
    }
    const start = Array.from({ length: s.spiritLVL }, (_, i) => i).find((L) => {
      let r = 10
      for (let x = L + 1; x <= s.spiritLVL; x++) r = nextSpiritReq(r, x)
      return Math.abs(r / s.SpiritREQ - 1) < 1e-12
    })
    expect(start).toBeDefined() // save: 66 → 112
  }
})

test('rates, level-up, optimiser and upgrade list hang together', async () => {
  const s = withSpirit(await fullSave()), R = soulRates(s), L = spiritLevel(s)
  expect(conversion(s).SoulConversionChanceTOTAL).toEqual(R.chance)
  expect(L.exp).toBeLessThan(L.threshold)
  const one = spiritLevel(s, L.threshold - L.exp + 5)
  expect(one.levels).toBe(1)
  expect(one.exp).toBeCloseTo(5 + L.shrine * one.req, 3)
  const o = optimal(s)
  expect(o.best.value).toBeGreaterThanOrEqual(o.now.value)
  for (const [kind, v] of [['cultist', o.best.cult], ['acolyte', o.best.aco]] as const)
    v.forEach((t, i) => i && t && expect(t).toBeLessThanOrEqual(taskCap(s, kind, i)))
  expect(riftNeeds(s).every((b) => b.gaps.every(([, d]) => d > 0))).toBe(true)
  const list = upgrades(s)
  for (const [i, u] of list.entries()) if (i) expect(list[i - 1]!.score).toBeGreaterThanOrEqual(u.score)
  expect(spiritRates(s).away).toBeGreaterThan(0)
  // a cultist on task 1 vs 2: 15× the fragment chance (away), so 15× the fragments of its colour
  const c1 = soulRates(s, [0, 1, 0, 0, 0, 0, 0, 0, 0], [0]), c2 = soulRates(s, [0, 2, 0, 0, 0, 0, 0, 0, 0], [0])
  expect(c1.frags[1]! / c2.frags[2]!).toBeCloseTo(15, 9)
})

// ---- The game's own code, run in the sandbox (dev only).
const bundle = new URL(`../../../../${BUNDLE}`, import.meta.url).pathname
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const at = (anchor: string, from: number) => { const i = src.indexOf(anchor, from); expect(i).toBeGreaterThan(0); return matchBraces(src, i + anchor.indexOf('function')) }

test.skipIf(!src)('scene init (runLater 30) writes what withSpirit computes', async () => {
  const raw = await fullSave(), s = withSpirit(raw)
  const a: any = { ...structuredClone(raw), CultistEventBonusPercent: 0, SpiritChance: 0, CultistSoulBonusPercent: Array(10).fill(0) }
  compile(at('p.runLater(30,(function(t){for(t=b.engine.gameAttributes,null!=e.CultistEventBonusPercent', 21240000), a, { p: inert })(0)
  close(a.SpiritChance, s.SpiritChance as number)
  for (let i = 0; i < 10; i++) close(a.CultistSoulBonusPercent[i], (s.CultistSoulBonusPercent as number[])[i]!)
})

test.skipIf(!src)('the away block banks what soulRates and spiritRates say', async () => {
  const s = withSpirit(await fullSave()), T = 1e6, a: any = structuredClone(s)
  Object.assign(a, { QuitTime: Date.now() / 1000 - T, AwayTimeZone: a.AwayTimeZone.map(() => 0), AwaySoulsCompleted: Array(18).fill(0), AwaysoulFRAGSgained: Array(15).fill(0), OfflineGains: Array(10).fill(0) })
  compile(at('p.runPeriodically(500,(function(t){if(a.wrapper.enabled){var n=b.engine,r=(new Date).getTime()', 21270000), a, { p: inert })(0)
  const R = soulRates(s)
  for (let k = 1; k <= 7; k++) expect((a.SoulsTotal[k] - s.SoulsTotal[k]) / (T * R.souls[k]! || 1)).toBeCloseTo(R.souls[k] ? 1 : 0, 4)
  expect((a.spiritEXP - (s.spiritEXP as number)) / (T * spiritRates(s).away)).toBeCloseTo(1, 4)
})

test.skipIf(!src)('cultist / acolyte value buy equals the game\'s listener (cost and effect)', async () => {
  const s = withSpirit(await fullSave())
  for (const [kind, from, sel, lv] of [['cultist', 12445000, 'CultistSelected', 'CultValueLV'], ['acolyte', 12449000, 'AcolyteSelected', 'AcolyteLV']] as const) {
    const i = 3, cost = upgradeCost(kind, 'value', i, s[lv][i]), a: any = { ...structuredClone(s), [sel]: i, MultiPurchaseToggle: 1, CurrentlyViewedScreen: 9, goldcoin: cost * 1.5 }
    compile(at('this.addMouseOverActorListener(this.actor,(function(a,n){if(t.wrapper.enabled&&5==a)for(a=0,n=0|b.engine.getGameAttribute("MultiPurchaseToggle")', from), a,
      { t: { wrapper: { enabled: true }, actor: { getY: () => 400 } }, p: inert })(5, 0)
    close(a.goldcoin, cost * 0.5)
    const mine: any = bought(s, kind, 'value', i)
    for (const k of Object.keys(mine)) if (Array.isArray(mine[k]) && /LV|Given/.test(k)) close(a[k][i], mine[k][i])
  }
})

test('sequence: pays every reachable gap from today\'s list once, each setup within level caps, works on the reactive save', async () => {
  for (const s0 of await saves()) {
    const s = withSpirit(s0), q = sequence(reactive(s))
    const want = riftNeeds(s).map((g) => `${g.r}${g.kind}`).sort()
    const paid = q.steps.flatMap((st) => st.buys.map((b) => `${b.r}${b.kind}`))
    expect([...paid, ...q.unreachable.map((b) => `${b.r}${b.kind}`)].sort()).toEqual(want) // each gap once, none lost
    for (const st of q.steps) {
      expect(st.secs).toBeGreaterThanOrEqual(0)
      for (let i = 1; i <= SKILLERS; i++) {
        if (st.cult[i]) expect(st.cult[i]).toBeLessThanOrEqual(taskCap(s, 'cultist', i))
        if (st.aco[i]) expect(st.aco[i]).toBeLessThanOrEqual(taskCap(s, 'acolyte', i))
      }
    }
    for (let k = 1; k < q.steps.length; k++) expect(q.steps[k]!.cult.join() + q.steps[k]!.aco.join()).not.toBe(q.steps[k - 1]!.cult.join() + q.steps[k - 1]!.aco.join()) // merged
  }
})

test('stockpile: shares sum to 1 and the rotation does at least as well as any single-colour setup alone; works on reactive(save)', async () => {
  for (const s0 of await saves()) {
    const s = withSpirit(s0), p = stockpile(reactive(s))
    if (!p.setups.length) continue
    expect(p.setups.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1, 9)
    const cols = p.demand.map((d, c) => (d > 0 ? c : 0)).filter(Boolean)
    const alone = (souls: number[]) => Math.min(...cols.map((c) => souls[c]! / p.demand[c]!))
    for (const x of p.setups) expect(p.rounds).toBeGreaterThanOrEqual(alone(x.souls) - 1e-15)
    expect(p.rounds).toBeGreaterThanOrEqual(p.now - 1e-15)
  }
})
