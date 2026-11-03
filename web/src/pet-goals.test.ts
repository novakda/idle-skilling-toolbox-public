import { expect, test } from 'bun:test'
import { GOALS, goalPlan, isGoal } from './pet-goals'
import { petsView } from './pets'

const at = (o: Record<number, number>) => Object.assign([] as number[], o)
// One nest (parents slots 1+2 = species 5 L10, 6 L20); idle: species 9 L50 (#3), 3 L40 (#4), 2 L30 (#5, Incubation x2 genes).
const save = () => ({
  PetInventoryOwned: 2, HatcheryLV: 30,
  PetsOwned: ['Nothing', 'a', 'b', 'c', 'd', 'e'], PetsOwnedINT: [70, 5, 6, 9, 3, 2],
  PetValue1: [0, 10, 20, 50, 40, 30],
  PetAbility1: [0, 1, 1, 1, 1, 14], PetAbility2: [0, 0, 0, 0, 0, 14], PetAbility3: [0, 0, 0, 0, 0, 0],
  PetStatus: [0, 1, 1, 0, 0, 0], PetPositions: at({ 7: 1, 8: 2 }),
  PetUnlocked: Array(12).fill(0).map((_, i) => (i <= 9 ? 1 : 0)), PetIDlist: Array.from({ length: 12 }, (_, i) => `s${i}`),
  NestLevelsVSE: [0, 20, 1, 1], NestAnimationSpeed: [0, 1], MaxEggs: [0, 3], EggsCreated: [],
  TankBonusLIST: at({ 1: 1, 5: 1, 16: 1 }), TrekkingLV: 1,
})
const view = () => petsView(save(), [])

test('goals: every option is a real select entry, balanced shows nothing re-ranked', () => {
  expect(GOALS.map((g) => g.id)).toEqual(['balanced', 'new', 'upgrade', 'speed', 'vessels'])
  expect(isGoal('new')).toBe(true); expect(isGoal('bogus')).toBe(false)
  expect(goalPlan(save(), view(), 'balanced').rows).toEqual([])
})

test('get new pets: the pair with the highest species wins, and its new-species chance beats the current pair', () => {
  const p = goalPlan(save(), view(), 'new'), r = p.rows[0]!
  expect(r.best).toContain('c L50') // species 9 is the highest id owned
  expect(r.gain).toBeGreaterThan(0); expect(r.why).toContain('new-species')
})

test('upgrade existing pets: highest-level pair, positive expected-level gain', () => {
  const p = goalPlan(save(), view(), 'upgrade'), r = p.rows[0]!
  expect(r.best).toContain('c L50'); expect(r.best).toContain('d L40')
  expect(r.gain).toBeGreaterThan(0); expect(p.headline).toContain('expected child Lv')
})

test('faster breeding: low species ids with Incubation lay faster than the current pair', () => {
  const p = goalPlan(save(), view(), 'speed'), r = p.rows[0]!
  expect(r.best).toContain('e L30') // species 2 with two Incubation genes
  expect(r.gain).toBeGreaterThan(0); expect(r.best).toContain('eggs/h')
})

test('goals disagree: new pets and faster breeding pick different pairs', () => {
  const a = goalPlan(save(), view(), 'new').rows[0]!.best.split(':')[0], b = goalPlan(save(), view(), 'speed').rows[0]!.best.split(':')[0]
  expect(a).not.toBe(b)
})

test('more vessels: colours ranked by the best monster, current monster shown', () => {
  const mon = (monster: number, colour: number, live: number, frontier = false) => ({ monster, colour, live, frontier })
  const farm = { frontier: 9, selected: 3, current: mon(3, 1, 100), colours: [
    { colour: 1, name: 'green', best: mon(5, 1, 400), current: null }, { colour: 2, name: 'orange', best: mon(9, 2, 900, true), current: null }] } as never
  const p = goalPlan(save(), view(), 'vessels', farm)
  expect(p.rows.map((r) => r.title)).toEqual(['orange vessels', 'green vessels'])
  expect(p.rows[1]!.now).toContain('monster 3'); expect(p.rows[1]!.gain).toBe(300)
  expect(goalPlan(save(), view(), 'vessels', null).rows).toEqual([])
})

test('no gain: the row says keep the current pair instead of recommending a worse one', () => {
  const s = { ...save(), PetPositions: at({ 7: 3, 8: 4 }) } // nest already holds the two highest-level pets (50, 40)
  const r = goalPlan(s, petsView(s, []), 'upgrade').rows.find((x) => x.n === 1)!
  expect(r.best).toBe('keep the current pair'); expect(r.gain).toBe(0)
})
