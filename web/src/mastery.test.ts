import { expect, test } from 'bun:test'
import { fullSave } from './test-save.test'
import { canBuy, mastery, perks, plan, points, taskPoints, tasks, tier, TREES, TRACK } from './mastery'
import { masteryBonuses } from './bus'
import data from './data/mastery.json'

const saves = async () => [await fullSave(), await Bun.file(new URL('../../data/save.json', import.meta.url)).json()]

test('points: task rewards from the grant sites equal perk costs spent + points held (stored values)', async () => {
  for (const s of await saves()) {
    const p = points(s)
    expect(p.earned).toBe(p.spent + p.owned)
  }
  // Every grant pays ⌈i/20⌉ (its task-list page) except task 33.
  for (let i = 1; i <= 200; i++) expect(taskPoints(i)).toBe(i === 33 ? 1 : Math.ceil(i / 20))
  expect(data.tasks.slice(1).every((t) => typeof t[2] === 'number')).toBe(true)
})

test('perk rows rebuild the stored MasteryBonuses for single-loop types', async () => {
  const s = await fullSave(), rows = perks(s), stored = s.MasteryBonuses as number[]
  expect(masteryBonuses(s).map((v) => +v.toFixed(9))).toEqual(stored.slice(0, 39).map((v) => +v.toFixed(9)))
  // Additive types (11-17, 21-23, 27-29, 33-36): 1 + Σ now/100. Perk 43 shows amount × HatcheryLV, so skip type 26.
  for (const ty of [11, 12, 13, 14, 15, 16, 17, 21, 23, 27, 28, 29, 33, 34]) {
    const sum = rows.filter((r) => r.type === ty).reduce((t, r) => t + r.now, 0)
    expect(1 + sum / 100).toBeCloseTo(stored[ty]!, 9)
  }
})

test('tree rules: owned perks form unbroken chains, and nothing owned is past one level above the tier', async () => {
  for (const s of await saves()) {
    const L = (s.MasteryPerksUnlocked as number[]).map(Number)
    for (const t of TREES) for (let i = t.from; i <= t.to; i++) {
      const T = tier(L, t)
      expect(L[i]!).toBeLessThanOrEqual(Math.floor(T) + 1)
      // A level-1 perk's parent was owned when it was bought (levels never fall).
      if (L[i]! >= 1 && i !== t.from) expect(L[{ 21: 4, 36: 29, 53: 46, 67: 58, 101: 88, 113: 104 }[i] ?? i - 1]!).toBeGreaterThanOrEqual(1)
    }
  }
  // Fresh trees: only the three roots are open; all of a tree at 1 → tier 1 and the root reopens for level 2.
  const zero = Array(126).fill(0)
  expect([1, 2, 21, 44, 81].map((i) => canBuy(zero, i).ok)).toEqual([true, false, false, true, true])
  const one = zero.map((_, i) => (i >= 1 && i <= 43 ? 1 : 0))
  expect(tier(one, TREES[0])).toBe(1)
  expect([1, 2].map((i) => canBuy(one, i).ok)).toEqual([true, false])
  expect(tier(Array(126).fill(4), TREES[0])).toBe(4)
  expect(canBuy(Array(126).fill(4), 1).ok).toBe(false)
})

test('tasks: done flags match the save, trackers read real save keys, plan spends points in cost order per pass', async () => {
  const s = await fullSave(), tk = tasks(s), T = s.MasteryTasksComplete as number[]
  expect(tk.filter((t) => t.done).length).toBe(T.slice(1, 201).filter((v) => Number(v) >= 1).length)
  for (const k of Object.keys(TRACK)) expect(Number.isFinite(tk[+k - 1]!.cur!)).toBe(true)
  // Monotonic trackers: a level or best-ever value that meets the need has had its task granted.
  for (const i of [118, 125, 130, 189, 195, 165, 183, 192]) if (tk[i - 1]!.met) expect(tk[i - 1]!.done).toBe(true)
  const steps = plan(s), m = mastery(s)
  const perkSteps = steps.filter((x) => x.kind === 'perk')
  // One pass of every tree = every perk below ⌊tier⌋ + 1 gets one level.
  const L = (s.MasteryPerksUnlocked as number[]).map(Number)
  const left = TREES.reduce((c, t) => { const f = Math.floor(tier(L, t)); let k = 0; for (let i = t.from; i <= t.to; i++) if (L[i]! <= f) k++; return c + k }, 0)
  expect(perkSteps.length).toBe(Math.min(left, 125))
  expect(steps.at(-1)!.after).toBe(m.points.owned + steps.reduce((t, x) => t + x.delta, 0))
})
