import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { BUNDLE, loadBundle } from '../../src/game-eval'
import { CODE, CORRECTIONS, SKILLS, skillTotal } from './skilltree'

const have = existsSync(`${import.meta.dir}/../../${BUNDLE}`)
const src = have ? loadBundle(`${import.meta.dir}/../../${BUNDLE}`) : ''

// Every node's cited game read exists at its byte offset, and the formula the app uses is within 2600 bytes after it.
test.skipIf(!have)('skill tree formulas: each CODE entry reads SkillLevels[i] at its offset and shows the cited formula', () => {
  for (const [i, c] of Object.entries(CODE)) {
    expect(src.startsWith(`SkillLevels")[${i}]`, c.at), `node ${i} read @${c.at}`).toBe(true)
    expect(new RegExp(c.re).test(src.slice(c.at - 200, c.at + 2600)), `node ${i} formula near @${c.at}`).toBe(true)
    if (c.also) {
      expect(src.startsWith(`SkillLevels")[${i}]`, c.also[0]), `node ${i} 2nd read @${c.also[0]}`).toBe(true)
      expect(new RegExp(c.also[1]).test(src.slice(c.also[0] - 200, c.also[0] + 2600)), `node ${i} 2nd formula @${c.also[0]}`).toBe(true)
    }
  }
})

test('skill tree verdicts: all 70 nodes have a CODE entry; corrected texts have an exact total', () => {
  for (let i = 1; i <= 70; i++) expect(CODE[i], `node ${i}`).toBeDefined()
  const s = { CombatLV: 100, ApothecaryLV: 300, FarmingLV: 80 }
  for (const i of Object.keys(CORRECTIONS).map(Number)) {
    expect(CODE[i]!.v, `node ${i}`).toBe('x')
    expect(SKILLS[i]![1]).toBe(CORRECTIONS[i]!)
    expect(skillTotal(s, i, 7), `node ${i} total`).not.toBe('')
  }
  for (const i of [3, 51, 53, 60]) expect(CODE[i]!.v).toBe('e')
  expect(Object.values(CODE).filter((c) => c.v === 'u').length).toBe(8)
})

test('skill tree totals: exact figures', () => {
  const s = { CombatLV: 100, ApothecaryLV: 300, FarmingLV: 80 }
  expect(skillTotal(s, 67, 18)).toContain('+1.57% chain level chance') // (8·18+10)/(18+80) = 1.5714
  expect(skillTotal(s, 6, 3)).toContain('+20% crit chance')
  expect(skillTotal(s, 28, 5)).toContain('9 s per boss')
  expect(skillTotal(s, 48, 4)).toContain('+400% idle damage')
  expect(skillTotal(s, 53, 3)).toContain('+9 max Botany')
  expect(skillTotal(s, 51, 50)).toContain('−90%')
  expect(skillTotal(s, 19, 5)).toContain('2 crafts per craft') // random 1.05 … 2, rounded up: always 2
  expect(skillTotal(s, 57, 10)).toBe('Multidrop tiers: 100% / 49% / 0% / 0%')
  expect(skillTotal(s, 14, 5)).toBe('+100%') // linear: levelTotal of the wiki text
  expect(skillTotal(s, 1, 1)).toBe('')
  expect(skillTotal(s, 14, 0)).toBe('')
})
