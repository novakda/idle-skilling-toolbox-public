import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { cashMult, heavyCash, monsterCash, speedMult } from './heavycash'

test('monster cash port reproduces the stored defaultgold; toggle rows follow the game formulas', async () => {
  const s = await fullSave()
  expect(monsterCash(s, s.FightZoneTYPE, s.currentfightmode, s.mapleLV, s.SmithingBonusCash)! / s.defaultgold).toBeCloseTo(1, 12)
  const h = heavyCash(s), L = s.ShrineLevels[5]
  expect(h.rows).toHaveLength(Math.min(L, 50) + 1)
  expect(h.rows[0]!.cash! / s.defaultgold).toBeCloseTo(1 / cashMult(L, s.HeavyCashToggle), 12)
  // a drifted SmithingBonusCash (live saves alternate) doesn't move the anchored rows
  expect(heavyCash({ ...s, SmithingBonusCash: 1 }).rows[3]!.cash).toBe(h.rows[3]!.cash)
  // first upgrade, wiki "100 S / 100 C -> 80 S / 126 C": level 1 is (1.25 + 1/200) = 1.255 cash; 0.8 per toggle speed
  expect(cashMult(1, 1)).toBeCloseTo(1.255, 12)
  expect(speedMult(2, 5, 1) / speedMult(2, 5, 0)).toBeCloseTo(0.8, 12)
  expect(speedMult(1, 5, 3)).toBe(1) // zone 1: no speed effect
  // net cash rate per toggle = (0.8·(1.25+L/200)) = 1 + 0.004·L
  expect(h.rows[1]!.rate).toBeCloseTo(1 + 0.004 * L, 12)
})

test('zone 1 monster cash (L=0, m=1, S=1): ceil(0 + 0 + 25 + ... ) shape', () => {
  expect(monsterCash({ AscentionLevel: [], SkillLevels: [], SkillActive: [] }, 1, 1, 0, 1)).toBe(Math.ceil(25 + 0))
})
