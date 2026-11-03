import { expect, test } from 'bun:test'
import { ascName, asylumShrine, potionName, smithName } from './names'
import { masteryPerkName } from './mastery'
import { skillName } from './skilltree'
import { fullSave } from './test-save.test'
import { STATS } from './totals'

test('index → in-game name (#2674)', () => {
  // Anvil titles (SceneEvents_6, derive-smithing.ts): 56 @31203462, 88 @31367781, 92 @31395803.
  expect(smithName(56)).toBe('Dragoneye Charm')
  expect(smithName(88)).toBe('Sacrificial Altar')
  expect(smithName(92)).toBe('Snapped Time')
  expect(smithName(1)).toBe('Copper Trinket')
  expect(ascName(5)).toBe('H2O Damage Boost')
  expect(ascName(59)).toBe('Bubbul Bubbul')
  // PotionLV[i] is potion id i + 1: PotionLV[104] is Cantivici (+chain level chance), not Serpenzu (#104).
  expect(potionName(104)).toBe('Cantivici')
  expect(potionName(156)).toBe('Badonkadonk')
  expect(asylumShrine(11)).toBe('Chain Level')
  expect(skillName(61)).toBe('Damage')
  expect(masteryPerkName(66)).toBe('Mastery capstone: chain lv chance')
})

test('Totals labels name things, and stay unique per stat (they are the row keys)', () => {
  const rows = STATS.flatMap((st) => {
    const names = st.rows(fullSave).map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
    return names
  })
  expect(rows).toContain('Dragoneye Charm')
  expect(rows).toContain('H20 Moneybags × Water')
  expect(rows.some((n) => /^(Smith(ing)? item|Ascension|Potion|Construction|Skill tree) \d/.test(n))).toBe(false)
})
