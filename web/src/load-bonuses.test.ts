import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { ascensionRewards, brewSpeedBoost, equipmentBonuses, masteryBonuses, potionBonuses, tankBonuses } from './bus'

const full = async () => fullSave()

test('MasteryBonuses match the game (all 39)', async () => {
  const save = await full()
  masteryBonuses(save).forEach((v, i) => expect(v).toBeCloseTo(save.MasteryBonuses[i], 9))
})

test('potion bonuses match the game', async () => {
  const save = await full(), pb = potionBonuses(save, save.EbonusThree[0])
  for (const [k, v] of Object.entries(pb)) expect(v).toBeCloseTo(save[`Pbonus${k}`], 6)
})

test('equipment bonuses match every stored Ebonus value', async () => {
  const save = await full(), { three, scalar } = equipmentBonuses(save)
  three.forEach((v, i) => expect(v).toBeCloseTo(+save.EbonusThree[i] || 0, 6))
  for (const k of Object.keys(save).filter((k) => /^Ebonus/.test(k) && k !== 'EbonusThree' && typeof save[k] === 'number'))
    expect(scalar[k] ?? 0).toBeCloseTo(save[k], 6)
})

test('lab tank bonuses [11], [22] and [27] match the game', async () => {
  const save = await full(), t = tankBonuses(save)
  expect(t[11]).toBeCloseTo(save.TankBonusLIST[11], 9)
  expect(t[22]).toBeCloseTo(save.TankBonusLIST[22], 9)
  expect(t[27]).toBeCloseTo(save.TankBonusLIST[27], 9) // chain chance
})

test('lab tank bonus [45] (capsule away rate) matches the game', async () => {
  const save = await full()
  expect(tankBonuses(save)[45]).toBeCloseTo(save.TankBonusLIST[45], 9) // 4.3140: part 24 × pet passives 44/72/77 × vend8
})

test('brew speed boost matches the game', async () => {
  const save = await full()
  expect(brewSpeedBoost(save)).toBeCloseTo(save.PotionBrewSpeedBOOST[1], 9) // 7.2476
})

test('ascend (AP) and rebirth (BP) rewards match the game', async () => {
  const save = await full(), { AP, BP } = ascensionRewards(save)
  AP.forEach((v, i) => expect(v).toBe(save.APreward[i]))
  BP.forEach((v, i) => expect(v).toBeCloseTo(save.BPreward[i], 9))
})

// The game's own ascend/rebirth award code (Qno2x.js handlers @12469725 / @12480775), run in the sandbox on the same save.
// Dev-only: skipped when the extracted bundle isn't present.
import { existsSync } from 'fs'
import { BUNDLE, compile, loadBundle } from '../../src/game-eval'
import { ascendGain } from './bus'
test.skipIf(!existsSync(`${import.meta.dir}/../../${BUNDLE}`))('ascend/rebirth gain matches the game award code', async () => {
  const src = loadBundle(`${import.meta.dir}/../../${BUNDLE}`), s = await full(), g = ascendGain(s)
  const body = (at: number, open: string, end: string) => { const a = src.lastIndexOf(open, at); return src.slice(a + 4, src.indexOf(end, a)) }
  const ap = compile(`function(){ var ${body(12469725, 'var i=b.engine,o=', ';null!=e.APtoSpend')}; return q - o }`, { ...s })() as number
  const bs = src.lastIndexOf('BPtoSpend")', 12480765)
  const bp = compile(`function(){ var ${body(bs, 'var ', ';null!=e.BPtoSpend')}; return Mt - at }`, { ...s })() as number
  expect(g.ap).toBeCloseTo(ap, 6)
  expect(g.bp).toBeCloseTo(bp, 6)
})
