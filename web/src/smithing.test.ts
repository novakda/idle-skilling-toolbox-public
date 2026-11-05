import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { smithingBaseAttack, smithingCosts, smithingLowerBound, smithTotalCostRedux } from './smithing'
import { potionBonuses } from './bus'
import { statPages } from './fight-away'
import { BUNDLE, compile } from '../../src/game-eval'

const bundle = new URL(`../../${BUNDLE}`, import.meta.url).pathname
// All attributes read live 2026-10-03 20:08 PT (pets screen, after the stats panel showed BASE DMG 9860K).
const live = new URL('../../data/captures/2026-10-03/pets-hatchery/attrs.json', import.meta.url).pathname

function check(s: any, digits: number) {
  expect(smithingLowerBound(s)).toBeCloseTo(s.smithingEXPONENTIALlowerbound, 12)
  const pb = potionBonuses(s)
  expect(pb.SmithTotalCostRedux).toBeCloseTo(s.PbonusSmithTotalCostRedux, 12)
  expect(pb.SmithingScalingRedux).toBeCloseTo(s.PbonusSmithingScalingRedux, 12)
  // Costs are written only for the item on the selected anvil while the smithing screen draws; they use the smithing
  // scene's own cost redux (mastery 17, no vending), not the stored PbonusSmithTotalCostRedux.
  expect(smithTotalCostRedux(s)).not.toBeCloseTo(s.PbonusSmithTotalCostRedux, 5)
  const [c1, c2] = smithingCosts(s, s.SmithingAnvilItem[s.SmithingAnvilSelected])
  expect([c1!.currency, c2!.currency]).toEqual([s.SmithingCost1Currency, s.SmithingCost2Currency])
  expect(c1!.cost / s.SmithingCost1[c1!.currency]).toBeCloseTo(1, 12)
  expect(c2!.cost / s.SmithingCost2[c2!.currency]).toBeCloseTo(1, 12)
  // Stored SmithingBaseAttack is written at scene init with the Fighting deck equipped; totalKills keeps rising after, so
  // it trails (fixture: 2,023 kills behind = 22 of 9.24M; live 0.06% short: kills plus stale stored EbonusBaseDmgFLAT). Exact check vs game code below.
  expect(smithingBaseAttack(s) / s.SmithingBaseAttack).toBeCloseTo(1, digits)
}

test('smithing values match the game (fixture)', async () => check(await fullSave(), 5))
test.skipIf(!existsSync(live))('smithing values match the game (live)', async () => {
  const s = await Bun.file(live).json()
  check(s, 2)
  // The panel showed 9860K from the stored (stale) value; recomputed from the same snapshot it is 9865K.
  expect(statPages(s).damage[0]).toEqual(['BASE DMG', '9860K'])
  expect(statPages({ ...s, SmithingBaseAttack: smithingBaseAttack(s) }).damage[0]).toEqual(['BASE DMG', '9865K'])
})

test.skipIf(!existsSync(bundle))('SmithingBaseAttack equals the fight scene\'s own code with the Fighting deck', async () => {
  const s = await fullSave(), src = await Bun.file(bundle).text()
  const at = src.lastIndexOf('getGameAttribute("SmithingItemLevel")[2]', src.indexOf('.h.SmithingBaseAttack=', src.indexOf('["scripts.SceneEvents_9"]=')))
  const body = src.slice(src.lastIndexOf('var ', at), src.indexOf(';', src.indexOf('.h.SmithingBaseAttack=', at)) + 1)
  const attrs = { ...structuredClone(s), CbonusBaseDamage: 105 } // the Fighting deck's 80% + 25% card passives (stored: 25, active deck)
  compile(`function(){${body}}`, attrs, { e: {} })()
  expect(smithingBaseAttack(s) / attrs.SmithingBaseAttack).toBeCloseTo(1, 12)
  expect(smithingBaseAttack(s, -1)).toBeLessThan(0.7 * s.SmithingBaseAttack) // active (non-fight) deck: what live read 6.01M
})
