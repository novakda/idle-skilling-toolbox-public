import { expect, test } from 'bun:test'
import { fieldGain, geneCensus, geneDuplicates, genePlan, genePool, geneteaAt, hatchOutcomes, rollGenes } from './pet-genes'
import { petsView } from './pets'

const at = (o: Record<number, number>) => Object.assign([] as number[], o)
// Species (codex.json _specificGENE): 11 dart frog = Curse Skull (2), 12 dog = Incubation (14), 13 crow = Life Leech (5), 22 spoon = Discovery (18).
// #1 crow LL×3 fighter 1; #2 spoon Discovery+LL idle; Nest 1 = #3 dart frog (A) + #4 crow LL+Incubation (B); #5 crow LL idle; #6 dog Incubation×2 idle.
const save = () => ({
  PetInventoryOwned: 2, HatcheryLV: 59, TrekkingLV: 78,
  PetsOwned: ['Nothing', 's13', 's22', 's11', 's13', 's13', 's12'], PetsOwnedINT: [70, 13, 22, 11, 13, 13, 12],
  PetIDlist: Array.from({ length: 30 }, (_, i) => `s${i}`), PetValue1: [0, 100, 90, 50, 80, 70, 60],
  PetAbility1: [0, 5, 18, 2, 5, 5, 14], PetAbility2: [0, 5, 5, 0, 14, 0, 14], PetAbility3: [0, 5, 0, 0, 0, 0, 0],
  PetStatus: [0, 2, 0, 1, 1, 0, 0], PetPositions: at({ 1: 1, 7: 3, 8: 4 }), PetRarity: [0, 1, 1, 1, 1, 1, 1],
  PetUnlocked: Array(30).fill(0).map((_, i) => (i <= 22 ? 1 : 0)), GeneticComboFound: at({ 13: 1 }),
  NestLevelsVSE: [0, 20, 1, 1], NestAnimationSpeed: [0, 1, 1, 1, 1, 1, 1], MaxEggs: [0, 3, 3, 3, 3, 3, 3], EggsCreated: [],
  TankBonusLIST: at({ 1: 1, 5: 1, 16: 1 }), PotionLV: [],
})
const view = () => petsView(save(), [])
const P = (slot: number) => view().pets.find((p) => p.slot === slot)!

test('gene pool: parent A then B genes, each once, then species hi+1 and max(lo-1, 1) genes (pool build @27716561)', () => {
  expect(genePool(P(3), P(4))).toEqual([2, 5, 14, 3, 13]) // dart frog Curse, crow LL, crow Incubation, species 14 Healing, species 10 Swiftness
  expect(genePool(P(4), P(3))).toEqual([5, 2, 14, 3, 13])
  expect(genePool(P(3), P(4), 6)).toEqual([9, 10, 20, 21, 22, 23, 24, 25, 26, 1]) // special egg
})

test('gene roll: every branch adds up, and a pick equal to gene 1 shifts to the one before it', () => {
  expect(rollGenes(2, [2, 5], 0, 0)).toEqual([{ genes: [2], p: 1 }])
  const r = rollGenes(2, [2, 5], 1, 0), p = (g: number[]) => r.find((x) => x.genes.join() === g.join())?.p ?? 0
  expect(p([2, 5])).toBeCloseTo((0.61 * 2) / 3) // i = 0 (Curse = gene 1) shifts to pool[1] = LL, i = 1 is LL
  expect(p([2, 2])).toBeCloseTo(0.24)
  expect(p([2])).toBeCloseTo(0.15 + 0.61 / 3)
  const all = rollGenes(5, [5, 2, 14], 0.58, 0.23)
  expect(all.reduce((t, x) => t + x.p, 0)).toBeCloseTo(1)
  expect(all.some((x) => x.genes.length === 3)).toBe(true)
  // Pool order matters: dart frog as parent A shifts its Curse pick onto LL, as parent B onto itself.
  const ll = (a: number, b: number) => hatchOutcomes(save(), 1, [P(a), P(b)]).filter((o) => o.species === 11 && o.genes.includes(5)).reduce((t, o) => t + o.p, 0)
  expect(ll(3, 4)).toBeGreaterThan(ll(4, 3))
  expect(hatchOutcomes(save(), 1, [P(3), P(4)]).reduce((t, o) => t + o.p, 0)).toBeCloseTo(1)
})

test('census: copies owned, team count, fieldable best-per-species, found tiers', () => {
  const rows = geneCensus(save(), view()), ll = rows.find((r) => r.id === 5)!, inc = rows.find((r) => r.id === 14)!
  expect(ll.owned).toBe(6); expect(ll.team).toBe(3); expect(ll.tier).toBe(1)
  expect(ll.field).toBe(4); expect(ll.short).toBe(2); expect(ll.found).toEqual([true, false, false])
  expect(ll.U).toBe(3) // a fighter fires it
  expect(inc.field).toBe(3); expect(inc.fieldTier).toBe(1); expect(inc.team).toBe(0)
  expect(ll.carriers.map((c) => [c.pet.slot, c.copies, c.status])).toEqual([[1, 3, 'trekking'], [2, 1, 'idle'], [4, 1, 'nest'], [5, 1, 'idle']])
  // A dart frog child with LL is a new LL species: fieldable 4 → 5.
  expect(fieldGain(ll, [{ species: 11, genes: [2, 5], p: 1 }], 8)).toBe(1)
  expect(fieldGain(ll, [{ species: 13, genes: [5, 5], p: 1 }], 8)).toBe(0) // crow already has 3
})

test('plan: field a combo owned pets reach, breed toward short genes with parent order, ranked by value', () => {
  const g = genePlan(save(), view())
  const field = g.actions.find((a) => a.kind === 'field' && a.gene === 14)!
  expect(field.detail).toContain('s12 #6'); expect(field.why).toContain('out of a nest')
  const breeds = g.actions.filter((a) => a.kind === 'breed')
  expect(breeds.map((a) => a.gene).sort()).toEqual([14, 18]) // greedy: those two take all four free pets, so LL gets no pair
  for (const b of breeds) { expect(b.detail).toContain('Parent A'); expect(b.ev).toBeGreaterThan(0) }
  const slots = breeds.flatMap((b) => [...b.detail.matchAll(/#(\d+)/g)].slice(0, 2).map((m) => m[1]))
  expect(new Set(slots).size).toBe(slots.length) // no pet in two nests
  expect(g.actions.find((a) => a.kind === 'claim')!.title).toContain('Life Leech') // an unowned recorded LL species, gene 1 = LL
  expect(g.actions.map((a) => a.ev)).toEqual([...g.actions.map((a) => a.ev)].sort((a, b) => b - a))
  expect(g.actions.some((a) => a.kind === 'trash')).toBe(false) // 4 free slots: no room pressure
  expect(g.actions.find((a) => a.kind === 'genetea')!.ev).toBeGreaterThan(0)
})

test('duplicates and Genetea', () => {
  expect(geneDuplicates(view().pets).map((d) => [d.pet.slot, d.by.slot])).toEqual([[5, 1]])
  expect(geneteaAt(save(), 0).second).toBeCloseTo((40 / 69) * 100)
  expect(geneteaAt(save(), 525).second).toBeCloseTo((40 / 69) * 160) // capped +60%
})
