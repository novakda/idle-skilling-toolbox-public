import { existsSync } from 'fs'
import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { fullSave } from '../../test-save.test'
import { calibrate, VESSEL_TYPES, vesselBase, vesselColour, vesselFarm, vesselMulti, vesselsPerKill } from './pet-combat'
import { BUNDLE, compile, loadBundle } from '../../../../src/game-eval'
import { fresh } from '../../screen-bound'
import { masteryBonuses } from '../../bus'

const bundle = `${import.meta.dir}/../../../../${BUNDLE}`, hasBundle = existsSync(bundle)
const src = hasBundle ? loadBundle(bundle) : ''
const cut = (from: string, to: string, after = 0, keepTo = true) => {
  const a = src.indexOf(from, after), b = src.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`snippet not found: ${from}`)
  return src.slice(a, keepTo ? b + to.length : b)
}
const page = (id: number) => ({ MonsterPageSelected: Math.ceil(id / 5), MonsterSelected: id - 5 * (Math.ceil(id / 5) - 1) })

test.skipIf(!hasBundle)('vessel colour table = the pet scene builds (SceneEvents_43 init)', () => {
  const body = cut('this._VesselTypes=[];', ';var Vn=b.engine.gameAttributes', 27_000_000, false)
  const host: Record<string, unknown> = {}
  ;(compile(`function(){ ${body} }`, {}) as Function).call(host)
  expect(host._VesselTypes).toEqual(VESSEL_TYPES)
})

test.skipIf(!hasBundle)('vessel multiplier = the game statement (pet scene init)', () => {
  const expr = cut('var S=b.engine.getGameAttribute("whichMTXpurchased")[53]', ';var L=b.engine.gameAttributes', 0, false)
  // MasteryBonuses consistent with its perks (screen-bound.ts: else the app takes the model over a stored value)
  const unlocked = { MasteryPerksUnlocked: Array(201).fill(1) }, perks = { ...unlocked, MasteryBonuses: masteryBonuses(unlocked) }
  const s = { whichMTXpurchased: Object.assign(Array(60).fill(0), { 53: 1 }), TankBonusLIST: [1, 1, 2.27], EbonusThree: Object.assign(Array(17).fill(0), { 10: 12 }),
    SkillLevels: Object.assign(Array(70).fill(0), { 63: 5 }), PotionLV: Object.assign(Array(160).fill(0), { 100: 7 }), ...perks }
  const host: Record<string, unknown> = {}
  ;(compile(`function(){ ${expr} }`, { ...s }) as Function).call(host)
  expect(vesselMulti(s)).toBeCloseTo(host._VesselMULTI as number, 9)
  expect(vesselMulti(s)).not.toBeCloseTo(1, 2)
})

test.skipIf(!hasBundle)('per-kill vessels and colour = the kill handler, every page and the page-9 wrap', () => {
  const stmt = cut('t=b.engine,n=a._VesselTypes[', '*a._VesselMULTI', 27_280_000)
  for (const id of [1, 5, 16, 20, 35, 40, 41, 46, 63, 80, 120]) for (const loot of [0, 75]) {
    const cur = Array(17).fill(0), pvt = Object.assign(Array(33).fill(0), { 15: loot }), attrs: Record<string, unknown> = { ...page(id), PetCurrenciesOwned: cur, PetValueTotals: pvt }
    compile(`function(){ var t,n,r,i,o; ${stmt} }`, attrs, { a: { _VesselTypes: VESSEL_TYPES, _VesselMULTI: 2.5 } })()
    const c = vesselColour(id)
    expect(cur.findIndex((x) => x > 0)).toBe(c)
    expect(vesselBase(id) * (1 + loot / 100) * 2.5).toBeCloseTo(cur[c], 9)
  }
})

test.skipIf(!hasBundle)('away vessels = calibrated kills/h x per-kill x away hours (pet scene init)', () => {
  const stmt = cut('var xi=b.engine,Gi=this._VesselTypes[', 'this._VesselMULTI/3600);')
  const cur = Array(17).fill(0), id = 19
  const attrs = { ...page(id), PetCurrenciesOwned: cur, PetValueTotals: Object.assign(Array(33).fill(0), { 15: 25 }), CalibrationValues: [0, 0, 0, 0, 0, 0, 300], AwayTimeRewarded: 7200 }
  ;(compile(`function(){ ${stmt} }`, attrs) as Function).call({ _VesselTypes: VESSEL_TYPES, _VesselMULTI: 2 })
  expect(cur[vesselColour(id)]).toBeCloseTo(300 * 2 * vesselBase(id) * 1.25 * 2, 6)
})

test.skipIf(!hasBundle)('calibration end = the game statement', () => {
  const stmt = cut('t=b.engine.getGameAttribute("CalibrationValues"),n=b.engine.getGameAttribute("CalibrationValues")[1],t[3]=', ',p.saveGame("mySave"', 0, false)
  for (const [dealt, taken, killed] of [[4232, -67, 5], [4938, 137, 3], [800, 900, 1], [800, 900, 0]] as const) {
    const cv = [0, dealt, taken, 0, 0, 0, 0, 0, 0], attrs = { CalibrationValues: cv, MonsterHPtot: 2773, MonsterRespawnTime: 0.8, PetHPtot: 320, MonstersKilled: Object.assign(Array(30).fill(0), { 20: killed }), ...page(20) }
    compile(`function(){ var t,n; ${stmt} }`, attrs, { a: {} })()
    const mine = calibrate(dealt, taken, 2773, 0.8, 320, killed)
    expect(mine.cv5).toBeCloseTo(cv[5]!, 9); expect(mine.cv6).toBeCloseTo(cv[6]!, 9)
  }
})

const live = new URL('../../../../data/save.json', import.meta.url).pathname
test.skipIf(!existsSync(live))("the author's save: calibrate() reproduces the stored CalibrationValues[5]/[6]", async () => {
  const s = await Bun.file(live).json(), cv = s.CalibrationValues as number[]
  if (!cv[3]) return // no calibration stored
  // CalibrationValues are written on the Trek screen (screen-bound.ts); a save taken elsewhere pairs them with inputs that moved on since.
  if (!fresh(s, 'CalibrationValues')) return
  const c = calibrate(cv[3]!, cv[4]!, s.MonsterHPtot, s.MonsterRespawnTime, s.PetHPtot)
  expect(c.cv5).toBeCloseTo(cv[5]!, 6); expect(c.cv6).toBeCloseTo(cv[6]!, 6)
  const f = vesselFarm(s)
  console.log('vessel farm', JSON.stringify({ selected: f.selected, frontier: f.frontier, multi: f.multi, loot: f.lootPct, colours: f.colours.map((x) => ({ c: x.name, best: x.best.monster, live: Math.round(x.best.live), away: Math.round(x.best.away), candy: Math.round(x.best.candy), runnerUp: x.runnerUp && [x.runnerUp.monster, Math.round(x.runnerUp.live)], bestAway: x.bestAway.monster })), current: f.current && { m: f.current.monster, live: Math.round(f.current.live), away: Math.round(f.current.away) } }))
})

test('vessel farm: one row per selectable monster, best per colour ranks by on-screen rate', async () => {
  const s = await fullSave(), f = vesselFarm(s)
  expect(f.rows.map((r) => r.monster)).toEqual(Array.from({ length: s.PetDistanceLV }, (_, i) => i + 1))
  expect(f.rows.filter((r) => r.frontier).map((r) => r.monster)).toEqual([s.PetDistanceLV])
  for (const c of f.colours) {
    for (const r of f.rows.filter((x) => x.colour === c.colour)) expect(c.best.live).toBeGreaterThanOrEqual(r.live)
    if (c.runnerUp) expect(c.runnerUp.live).toBeLessThanOrEqual(c.best.live)
  }
  for (const r of f.rows) {
    expect(r.perKill).toBeCloseTo(vesselsPerKill(s, r.monster), 9)
    expect(r.away).toBeCloseTo((r.candy * f.awayPct) / 100, 9)
  }
})

test('vessel farm runs on the reactive save Vue passes', async () => {
  const s = await fullSave()
  expect(JSON.stringify(vesselFarm(reactive(s)))).toBe(JSON.stringify(vesselFarm(s)))
})
