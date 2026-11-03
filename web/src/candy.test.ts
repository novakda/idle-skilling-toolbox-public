import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { bestCandyUse, candyFor, candyHeld, CANDY_SECS } from './candy'

// Durations from the candy-use listener (@14753950-@14755282): 2 h, 4 h, 8 h, 24 h, 72 h (plus 1 s each).
test('durations', () => expect(Object.values(CANDY_SECS).map((s) => Math.round(s / 3600))).toEqual([2, 4, 8, 24, 72]))

test('picks the least candy time that covers the need, then the fewest candies; works on reactive(save)', () => {
  const s = reactive({ CandyOwned: [0, 5, 1, 0, 0, 1] }) // five 2 h, one 4 h, one 72 h
  expect(candyHeld(s).map((c) => [c.hours, c.count])).toEqual([[2, 5], [4, 1], [72, 1]])
  expect(candyFor(s, 3.3 * 3600).best!.pick).toEqual([{ hours: 4, count: 1 }]) // 4 h beats 2 × 2 h (fewer candies, same time)
  expect(candyFor(s, 5 * 3600).best!.pick).toEqual([{ hours: 2, count: 1 }, { hours: 4, count: 1 }]) // 6 h, not the 72 h
  expect(candyFor(s, 100 * 3600).enough).toBe(false)
  expect(candyFor(s, 0).best).toBeNull()
})

test('bestCandyUse: most real time saved, snuggest fit on ties', () => {
  const r = 100 / 605, goals = [{ use: 'a', secs: 3600, rate: r }, { use: 'b', secs: 20000, rate: r }, { use: 'c', secs: 90000, rate: r }]
  expect(bestCandyUse(goals, 7201)?.use).toBe('b') // both b and c take all 2 h; b is the snugger fit
  expect(bestCandyUse(goals, 259201)).toMatchObject({ use: 'c', used: 90000 / 259201 })
  expect(bestCandyUse([], 7201)).toBeNull()
})
