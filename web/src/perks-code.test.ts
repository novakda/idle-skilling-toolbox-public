import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { BUNDLE, loadBundle } from '../../src/game-eval'
import { CODE, CORRECTIONS, PERKS, perkTotal } from './perks'

const have = existsSync(`${import.meta.dir}/../../${BUNDLE}`)
const src = have ? loadBundle(`${import.meta.dir}/../../${BUNDLE}`) : ''

// Every perk's cited game read exists at its byte offset, and the formula the app uses is within 2600 bytes after it.
test.skipIf(!have)('perk formulas: each CODE entry reads AscentionLevel[i] at its offset and shows the cited formula', () => {
  for (const [i, c] of Object.entries(CODE)) {
    expect(src.startsWith(`AscentionLevel")[${i}]`, c.at), `perk ${i} read @${c.at}`).toBe(true)
    expect(new RegExp(c.re).test(src.slice(c.at - 200, c.at + 2600)), `perk ${i} formula near @${c.at}`).toBe(true)
  }
})

test('perk verdicts: every corrected text has an exact TOTALS and a CODE entry; totals read the save', () => {
  for (const i of Object.keys(CORRECTIONS).map(Number)) expect(CODE[i]?.v, `perk ${i}`).toBe('x')
  const p = (i: number) => PERKS.find((q) => q.i === i)!
  const s = { waterLV: 376, goldcoin: 1e20, OresOwned: [0, 1e16], MasteryPerksUnlocked: [] as number[] }
  expect(perkTotal(s, p(5), 2)).toContain('+376% damage')
})
test('perk totals: 16 / 44 / 34 / 54 / 17 give plain numbers, no "n"', () => {
  const p = (i: number) => PERKS.find((q) => q.i === i)!
  const s = { waterLV: 376, goldcoin: 1e20, OresOwned: [0, 1e16], MasteryPerksUnlocked: [] as number[] }
  expect(perkTotal(s, p(44), 10)).toContain('+2760% damage')
  expect(perkTotal(s, p(16), 10)).toMatch(/^\+\d+(\.\d)?% ores mined/)
  expect(perkTotal(s, p(34), 10)).toContain('−1 whole')
  expect(perkTotal(s, p(54), 100)).toMatch(/×1\.0\d{3} per level/)
  expect(perkTotal(s, p(17), 4)).toContain('19%')
  for (const q of PERKS) expect(perkTotal(s, q, 3)).not.toMatch(/\dn\b/)
})
