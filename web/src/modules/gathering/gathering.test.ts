import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { mining, miningExpBonus, smithingCraftExp } from './gathering'
import { cbonus, type Catalog } from '../cards/cards-calc'
import catalog from '../../data/card-catalog.json'
import { BUNDLE } from '../../../../src/game-eval'

const bundle = new URL(`../../../../${BUNDLE}`, import.meta.url).pathname

test('Mining bonuses match the stored values; smithing craft EXP matches the game\'s craft handler', async () => {
  const s = await fullSave()
  // Both written by the Mining scene's 50 ms callback with the Mining-linked deck on.
  expect(miningExpBonus(s)! / s.BonusMiningExpCUMUpercent).toBeCloseTo(1, 12)
  expect(mining(s, 30.5).miningChance).toBe(s.miningChance)
  if (!existsSync(bundle)) return
  const { skillStats } = await import('../../../../src/perk-impacts')
  const game = skillStats(await Bun.file(bundle).text())({ ...s, CbonusSmithingEXPgained: cbonus(s, catalog as unknown as Catalog, 7).CbonusSmithingEXPgained ?? 0 })
  expect(smithingCraftExp(s) / game.smithingEXPperCraft).toBeCloseTo(1, 12)
})
