import { existsSync } from 'fs'
import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { fullSave } from './test-save.test'
import { killDistance, simulateTrek, trekEta, trekReq } from './pet-combat'

test('trek distance requirement matches the stored PetDistanceREQ / REQprev (game formula)', async () => {
  const s: any = await fullSave()
  expect(trekReq(s.PetDistanceLV)).toBeCloseTo(s.PetDistanceREQ, 6)
  expect(trekReq(s.PetDistanceLV - 1)).toBeCloseTo(s.PetDistanceREQprev, 6)
})

test('next-monster ETA = distance left / (kill distance x kills per min)', async () => {
  const f: any = await fullSave() // fixture frontier is monster 18; put the trek on it
  const s = { ...f, MonsterPageSelected: Math.ceil(f.PetDistanceLV / 5), MonsterSelected: f.PetDistanceLV - 5 * (Math.ceil(f.PetDistanceLV / 5) - 1) }
  const e = trekEta(s)
  expect(e.onFrontier).toBe(true)
  const kpm = simulateTrek(s, undefined, 300).killsPerMin
  expect(e.gain).toBeGreaterThan(0)
  expect(e.steps[0]!.distance).toBeCloseTo(s.PetDistanceREQ - s.PetDistance, 6)
  expect(e.nextMonsterSec).toBeCloseTo(((s.PetDistanceREQ - s.PetDistance - 1) / e.gain / kpm) * 60, 3)
  expect(e.nextStageSec).toBeGreaterThanOrEqual(e.nextMonsterSec)
  expect(e.stageMonster % 5).toBe(1)
  expect(e.stageMonster).toBeGreaterThan(e.monster)
})

test('stage boundary: a frontier at the end of a page is one step from the next stage', async () => {
  const s: any = await fullSave()
  expect(trekEta({ ...s, PetDistanceLV: 20 }).steps.length).toBe(1)
  expect(trekEta({ ...s, PetDistanceLV: 21, PetDistanceREQ: trekReq(21), PetDistanceREQprev: trekReq(20), MonsterPageSelected: 5, MonsterSelected: 1 }).steps.length).toBe(5)
})

test('runs on the reactive save Vue passes', async () => {
  const s: any = await fullSave()
  expect(killDistance(reactive(s))).toBeCloseTo(killDistance(s), 9)
  expect(trekEta(reactive(s)).nextMonsterSec).toBeCloseTo(trekEta(s).nextMonsterSec, 6)
})

const live = new URL('../../data/save.json', import.meta.url).pathname
test.skipIf(!existsSync(live))("the author's save: REQ formula, per-kill gain and ETA are sane", async () => {
  const s = await Bun.file(live).json()
  expect(trekReq(s.PetDistanceLV)).toBeCloseTo(s.PetDistanceREQ, 6)
  const e = trekEta(s)
  console.log('the author save ETA', JSON.stringify({ gain: e.gain, onFrontier: e.onFrontier, nextMonsterH: e.nextMonsterSec / 3600, steps: e.steps }))
  expect(e.gain).toBeGreaterThan(1)
})
