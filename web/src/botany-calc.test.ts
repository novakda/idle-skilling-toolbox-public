import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { botanyBoosts, botanyPots, grayDrankPerLevelUp, overgrowthBonuses, overgrowthExponent, plantExpBase, plantingBonuses, speedCap, tierPerks } from './botany-calc'

test('botany matches the values the game computed in a full save', async () => {
  const save = await fullSave()
  const pots = botanyPots(save)
  pots.forEach((p) => expect(p.potSpeed).toBeCloseTo(save.HerbloreSpeedBOOST3[p.pot], 9)) // scene-init speed multiplier
  // tier-perk bases: the game multiplies them by load-time bonuses, so the save's value is a multiple of ours
  expect(tierPerks(save).maxSpeedLv).toBeLessThanOrEqual(save.HerbloreMaxSpeedLV)
  expect(speedCap({ ...save, HerbloreMaxSpeedLV: undefined }).max).toBeCloseTo(save.HerbloreMaxSpeedLV, 9) // 283.76
  const b = botanyBoosts(save)
  expect(b.speed).toBeCloseTo(save.HerbloreSpeedBOOST, 6)
  expect(b.flower).toBeCloseTo(save.HerbloreFlowerBOOST, 6)
  expect(b.exp).toBeCloseTo(save.HerbloreExpBOOST, 6)
  expect(overgrowthExponent(save)).toBeCloseTo(save.OverGrowthExponential, 9) // 4.925
})

test('planting bonuses match the values the game set at planting (plant 8, 1000 seeds + 1000 flowers)', async () => {
  const save = await fullSave(), p = plantingBonuses(8, 1000, 1000, save.PbonusExoticFlower)
  expect(p.flowers).toBeCloseTo(2.880582800597731, 12) // FlowersGivenBONUS after Grow All, read live 2026-10-02
  expect(p.exp).toBeCloseTo(3.4184771042619078, 12)
  expect(p.exotic).toBeCloseTo(115.85819355519601, 9)
})

test('overgrowth bonuses and plant EXP base match the game', async () => {
  const save = await fullSave()
  // The save's stored values were computed with a deck carrying no overgrowth cards.
  const og = overgrowthBonuses(save, {})
  expect(og.flowers).toBeCloseTo(save.OvergrowthFLOWERbonus, 12)
  expect(og.exotic).toBeCloseTo(save.OvergrowthEXOTICbonus, 12)
  expect(og.exp).toBeCloseTo(save.OvergrowthEXPbonus, 12)
  for (let i = 1; i < 45; i++) expect(plantExpBase(i)).toBeCloseTo(save.HerbloreEXPforFlowerBase[i], 4)
})

test('speed cap and Gray Drank explain the live pots (capture 2026-10-03, Botany screen)', () => {
  // Inputs read live: 14 pots at tier >= 5, Pot Enabler 58, More Fast 0, vending 5 = 1 (+3.8%), perk 3 x floor(84/25),
  // Disciple B lv1 (5 cap) on the Botany deck, Gray Drank 0. The game stored 289.76: Disciple B's 5 is missing because the
  // cap is computed before the Botany deck is equipped.
  const PotionLV = Array(171).fill(0); PotionLV[32] = 58
  const RealmStuff: unknown[] = []; RealmStuff[8] = [10, 6, 19, 5, 2, 1]
  const SkillLevels = Array(60).fill(0); SkillLevels[53] = 3
  const save = { HerblorePotLevel: [0, 8, 8, 8, 8, 8, 8, 8, 8, 7, 7, 6, 6, 6, 5], PotionLV, RealmStuff, SkillLevels, FarmingLV: 84, HerbloreMaxSpeedLV: 289.76 }
  const cap = speedCap(save)
  expect([cap.potions, cap.perk, cap.cards, cap.buyBelow]).toEqual([20.76, 9, 0, 314.76])
  const speed = [326, 326, 326, 317, 288, 284, 256, 208, 202, 164, 133, 106, 94, 56] // HerbloreLV2[1..14]
  expect(speed.filter((s) => s > Math.ceil(cap.buyBelow))).toEqual([326, 326, 326, 317]) // shown MAX_LEVEL, above the cap
  // Entering Botany with Disciple B's deck on gives 319.76 (buy up to 320): covers pot 4, not pots 1-3.
  expect(Math.ceil(cap.buyBelow + 5)).toBe(320)
  expect(grayDrankPerLevelUp(save)).toBe(0) // never brewed, so no uncapped levels came from it in this save
  PotionLV[140] = 175 // 240*175/350 = 120: always one bump, 19% a second
  expect(grayDrankPerLevelUp(save)).toBeCloseTo(1.19, 9)
})
