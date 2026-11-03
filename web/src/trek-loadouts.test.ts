import { existsSync } from 'fs'
import { expect, test } from 'bun:test'
import { BUNDLE, compile, loadBundle } from '../../src/game-eval'
import { petsView, petValueTotals } from './pets'
import { current } from "./screen-bound"
import { masteryBonuses } from "./load-bonuses"
import { openSlots } from './pet-combat'
import { bestLoadouts, expPerKill, focusValue, savedLoadouts } from './trek-loadouts'

const at = (o: Record<number, unknown>) => Object.assign([] as unknown[], o)
const bundle = `${import.meta.dir}/../../${BUNDLE}`, hasBundle = existsSync(bundle)

test.skipIf(!hasBundle)('EXP per kill = the kill handler statement (@27289245)', () => {
  const src = loadBundle(bundle), from = 't=b.engine.getGameAttribute("TrekkingEXP"),n=Math.pow(', a = src.indexOf(from, 27_280_000)
  const b = src.indexOf(',null!=e.TrekkingEXP', a)
  expect(a).toBeGreaterThan(0); expect(b - a).toBeLessThan(2000) // fingerprint: the statement moved or changed shape
  const stmt = src.slice(a, b)
  // Trekkery x3 on a support (tier 1 → PVT[20] scales with TrekkingLV), the other multipliers set off 1
  const base = { TrekkingLV: 40, PetPositions: at({ 5: 1 }), PetAbility1: [0, 20], PetAbility2: [0, 20], PetAbility3: [0, 20], PetValue1: [0, 10],
    TankBonusLIST: Object.assign(Array(60).fill(1), { 25: 3.1 }), MasteryBonuses: Object.assign(Array(30).fill(1), { 11: 1.3 }) }
  for (const id of [1, 9, 16, 36, 40, 77]) for (const p130 of [0, 40]) {
    const s = { ...base, PotionLV: Object.assign(Array(160).fill(0), { 130: p130 }) }
    const pvt = petValueTotals(s) // both sides read the app's PVT and MasteryBonuses (current(): stored when fresh, else the model)
    expect(pvt[20]).toBeGreaterThan(60)
    const got = compile(`function(){ var r,t,n,i,o,s,g,u; r=b.engine,${stmt}; return t }`, { ...s, aa2: id, TrekkingEXP: 0, PetValueTotals: pvt, MasteryBonuses: current(s, "MasteryBonuses", () => masteryBonuses(s)) })() as number
    expect(expPerKill(s, id)).toBeCloseTo(got, 6)
  }
})

// Synthetic trek: TrekkingLV 10 → fighters 1-2, support 5. Inventory slot: species, level, genes, status (0 idle, 1 nest, 2 trek, 3 capsule).
const PETS: [string, number, number[], number][] = [
  ['s1', 50, [1], 2], ['s2', 50, [1], 2], ['s3', 10, [15], 2], // current team: fighters a, b; support c (Loot)
  ['s4', 10, [20], 0], ['s5', 10, [13], 0], ['s6', 200, [1], 0], // idle: Trekkery, Swiftness, a strong fighter
  ['s1', 300, [1], 0], // stronger, but the same species as slot 1
  ['s7', 999, [1, 15, 15], 1], ['s8', 999, [1, 15, 15], 3], // a nest parent and a capsule pet: a loadout can't place them
]
const save = () => {
  const ab = (k: number) => [0, ...PETS.map((p) => p[2][k] ?? 0)]
  return {
    TrekkingLV: 10, PetInventoryOwned: 2, PetsOwned: ['Nothing', ...PETS.map((p) => p[0])], PetIDlist: Array.from({ length: 12 }, (_, i) => `s${i}`),
    PetsOwnedINT: [70, ...PETS.map((p) => +p[0].slice(1))], PetValue1: [0, ...PETS.map((p) => p[1])], PetRarity: [0, ...PETS.map(() => 1)],
    PetAbility1: ab(0), PetAbility2: ab(1), PetAbility3: ab(2), PetStatus: [0, ...PETS.map((p) => p[3])],
    PetPositions: at({ 1: 1, 2: 2, 5: 3, 7: 8, 21: 9 }), LoadoutArray: at({ 1: 1, 2: 2, 5: 3 }), LoadoutSelected: 1,
    MonsterSelected: 3, MonsterPageSelected: 2, PetDistanceLV: 8, TankBonusLIST: Object.assign(Array(60).fill(1)), MasteryBonuses: Array(30).fill(1),
    NestLevelsVSE: [], NestAnimationSpeed: [], MaxEggs: [], EggsCreated: [],
  } as Record<string, unknown>
}
const pets = () => petsView(save(), []).pets
const n = (v: unknown) => Number(v ?? 0) || 0
const has = (r: { team: Record<number, number> }, slot: number) => Object.values(r.team).includes(slot)

test('fight: the strongest legal fighters (one per species: L300 s1 replaces L50 s1, not both)', () => {
  const [r] = bestLoadouts(save(), pets(), ['fight'])
  const placed = Object.values(r!.team)
  expect(placed).toContain(7); expect(placed).not.toContain(1)
  expect(r!.best).toBeGreaterThan(r!.now)
})

// Genes count from all 8 slots, so once the strong fighter alone kills at the respawn cap, a gene pet takes the other fighter slot.
test('loot keeps the Loot pet; exp adds the Trekkery pet; travel adds the Swiftness pet', () => {
  const [loot, travel, exp] = bestLoadouts(save(), pets(), ['loot', 'travel', 'exp'])
  expect(has(loot!, 3)).toBe(true)
  expect(has(travel!, 5)).toBe(true)
  expect(has(exp!, 4)).toBe(true)
  for (const r of [travel!, exp!]) expect(r.best).toBeGreaterThan(r.now)
  // the gain is the focus value of the recommended team, recomputed
  expect(exp!.best).toBeCloseTo(focusValue(save(), exp!.team, 'exp'), 9)
})

test('constraints: open slots only, no pet twice, one per species, never a nest or capsule pet', () => {
  const s = save(), ps = pets(), open = new Set(openSlots(s).map((x) => x.p)), bySlot = new Map(ps.map((p) => [p.slot, p]))
  for (const r of bestLoadouts(s, ps)) {
    const placed = Object.entries(r.team).filter(([p, slot]) => open.has(+p) && slot > 0).map(([, slot]) => slot)
    expect(new Set(placed).size).toBe(placed.length)
    expect(new Set(placed.map((x) => bySlot.get(x)!.name)).size).toBe(placed.length)
    for (const x of placed) expect([0, 2]).toContain(bySlot.get(x)!.status)
    for (const p of [3, 4, 6, 19, 20]) expect(n(r.team[p])).toBe(0) // closed at Trekking 10
    expect(r.best).toBeGreaterThanOrEqual(r.now)
  }
})

test('a nest parent that would beat the loadout is reported, not placed', () => {
  const [loot] = bestLoadouts(save(), pets(), ['loot'])
  expect(loot!.nest?.pets.map((p) => p.slot)).toEqual([8])
  expect(Object.values(loot!.team)).not.toContain(8)
})

test('saved loadouts: LoadoutArray[k + 8(L-1)], k 1-8 = positions 1-6, 19, 20', () => {
  const l = savedLoadouts({ LoadoutArray: at({ 1: 5, 7: 6, 8: 7, 9: 11, 32: 12 }) })
  expect(l[0]).toMatchObject({ 1: 5, 19: 6, 20: 7 }); expect(l[1]![1]).toBe(11); expect(l[3]![20]).toBe(12)
  const [fight] = bestLoadouts(save(), pets(), ['fight'])
  expect(fight!.savedIn).toBeNull() // loadout 1 is the current team, which the fight pick replaces
})

test('travel is scored on the frontier monster; the others on the selected one', () => {
  const s = { ...save(), PetDistanceLV: 3 }
  const [t, f] = bestLoadouts(s, pets(), ['travel', 'fight'])
  expect(t!.monster).toBe(3); expect(f!.monster).toBe(8)
})


test('levers: a gene that only pays per combo tier steps to the next tier (travel Trekkery 0 → 3 = +Trekking Lv %)', () => {
  const [travel] = bestLoadouts(save(), pets(), ['travel'])
  const t = travel!.levers.find((l) => l.name === 'Trekkery')!
  expect(t.next).toBe(3); expect(t.gain).toBeCloseTo(0.1, 9) // tier 1 × Trekking Lv 10 %
  expect(travel!.levers.find((l) => l.name === 'Swiftness')!.next).toBe(2) // Swiftness pays per gene
})
