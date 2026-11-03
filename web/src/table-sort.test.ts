import { expect, test } from 'bun:test'
import { compareKeys, sortKey } from './table-sort'

test('sortKey reads the number formats the pages print', () => {
  expect(sortKey('1,234')).toBe(1234)
  expect(sortKey('1.2e15')).toBe(1.2e15)
  expect(sortKey('2.4K')).toBe(2400)
  expect(sortKey('3 B')).toBe(3e9)
  expect(sortKey('+35%')).toBe(35)
  expect(sortKey('×1.5')).toBe(1.5)
  expect(sortKey('−4')).toBe(-4)
  expect(sortKey('12 – 40')).toBe(40)
  expect(sortKey('3 → 5')).toBe(5)
  expect(sortKey('12 / 50')).toBe(12)
  expect(sortKey('3.2h')).toBe(3.2 * 3600)
  expect(sortKey('1d 4h')).toBe(86400 + 4 * 3600)
  expect(sortKey('12:05')).toBe(725)
  expect(sortKey('7 †')).toBe(7)
  expect(sortKey('—')).toBeNull()
  expect(sortKey('  ')).toBeNull()
  expect(sortKey('Lv 30')).toBe('Lv 30')
})

test('compareKeys: numbers before text, blanks last both ways', () => {
  const keys = ['b', null, 10, 'Lv 9', 2, 'Lv 10'].map((x) => x as number | string | null)
  expect([...keys].sort((a, b) => compareKeys(a, b, false))).toEqual([2, 10, 'b', 'Lv 9', 'Lv 10', null])
  expect([...keys].sort((a, b) => compareKeys(a, b, true))).toEqual(['Lv 10', 'Lv 9', 'b', 10, 2, null])
})
