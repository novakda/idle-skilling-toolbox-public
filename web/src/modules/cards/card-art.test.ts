import { expect, test } from 'bun:test'
import { inBookOrder } from './card-art'

test('inBookOrder: Main/Skull, tab, row, col', () => {
  const c = (page: number, tab: number, row: number, col: number) => ({ page, tab, row, col })
  expect(inBookOrder([c(2, 1, 1, 1), c(1, 3, 1, 1), c(1, 1, 2, 1), c(1, 1, 1, 4), c(1, 1, 1, 2)])).toEqual([c(1, 1, 1, 2), c(1, 1, 1, 4), c(1, 1, 2, 1), c(1, 3, 1, 1), c(2, 1, 1, 1)])
})
