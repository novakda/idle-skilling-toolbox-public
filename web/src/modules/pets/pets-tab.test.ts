import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { MIN_NEST_TREK_GAIN, hatchPlan, petRoles, petsView, type Pet } from './pets'

const at = (o: Record<number, number>) => Object.assign([] as number[], o)
const tiny = () => ({
    PetInventoryOwned: 1, // 5 slots, all full
    PetsOwned: ['Nothing', 'pencil', 'pencil', 'penguin', 'pencil', 'eagle'],
    PetsOwnedINT: [70, 16, 16, 14, 16, 17],
    PetValue1: [0, 30, 20, 40, 10, 50],
    PetAbility1: [0, 16, 16, 3, 16, 5], PetAbility2: [0, 0, 4, 0, 0, 5], PetAbility3: [0, 0, 0, 0, 0, 5],
    PetStatus: [0, 0, 1, 0, 0, 2],
    PetPositions: at({ 1: 5, 7: 2 }), // eagle fighting; pencil #2 parent in nest 1
    PetUnlocked: Array(18).fill(1),
    PetIDlist: Array.from({ length: 18 }, (_, i) => ({ 14: 'penguin', 16: 'pencil', 17: 'eagle' } as Record<number, string>)[i] ?? `s${i}`),
    NestLevelsVSE: [0, 60, 60, 60], EggsCreated: at({ 1: 2, 2: 1 }),
    TrekkingLV: 16, TankBonusLIST: at({ 52: 1 }),
})

test('pets tab: warnings, slot unlocks, combos, trash rule', () => {
  const v = petsView(tiny(), []) // no trek options: the trek role is tested on petRoles below
  expect(v.used).toBe(5); expect(v.size).toBe(5); expect(v.eggsWaiting).toBe(2)
  expect(v.warnings.join('\n')).toContain('Nest 1 can be prestiged')
  expect(v.warnings.join('\n')).toContain('No new species possible')
  expect(v.warnings.join('\n')).toContain('Inventory full')
  expect(v.warnings.join('\n')).toContain('2 eggs waiting')
  expect(v.slots.map((s) => s.open)).toEqual([true, true, true, false, true, false, false, false])
  expect(v.combos.find((g) => g.name === 'Life Leech')).toMatchObject({ count: 3, tier: 1, next: 6 })
  // Pencils #1 (L30) and #4 (L10) idle, neither beats nest parent #2 (fewer genes): #1 is the one spare, #4 is trash.
  // Penguin #3 is the only Healing carrier.
  expect(v.trash.map((t) => t.pet.slot)).toEqual([4])
  // #1 now fills the fixture's empty nest slot (empty slots get the best idle pet, 2026-10-23) instead of being the spare.
  expect(v.trash[0]!.why).toContain('pencil #1 L30 (nest parent)')
  expect(v.swaps.some((w) => w.text.includes('empty slot ← pencil #1 L30') && w.text.includes('page'))).toBe(true)
  expect(v.kept.map((k) => [k.pet.slot, k.why.split(':')[0]])).toEqual([[1, 'nest parent'], [3, 'only pet with Healing']])
})

test('placeOf maps PetPositions to group and position', async () => {
  const { placeOf } = await import('./pets')
  expect(placeOf(3)).toEqual({ group: 'Trekking', position: 'Fighter 3' })
  expect(placeOf(19)).toEqual({ group: 'Trekking', position: 'Support 3' })
  expect(placeOf(7)).toEqual({ group: 'Nest 1', position: 'Parent A' })
  expect(placeOf(10)).toEqual({ group: 'Nest 2', position: 'Parent B' })
  expect(placeOf(22)).toEqual({ group: 'Research', position: 'Capsule 2' })
})

test('invPlace: 5 pets per inventory page, left to right', async () => {
  const { invPlace, invText } = await import('./pets')
  expect(invPlace(1)).toEqual({ page: 1, col: 1 })
  expect(invPlace(5)).toEqual({ page: 1, col: 5 })
  expect(invPlace(30)).toEqual({ page: 6, col: 5 })
  expect(invText(16)).toBe('page 4, 1st from left')
})

test('hatchPlan: trash until every egg fits, hatch rarest first, recheck what is left; null when the eggs fit; reactive save', () => {
  const v = petsView(reactive(tiny()), []), q = hatchPlan(v)! // full, 2 eggs (r2, r1), one trash candidate
  expect(q.trash.map((t) => t.pet.slot)).toEqual([4])
  expect(q.hatch).toEqual([{ egg: 'N1 r2', count: 1 }])
  expect([q.hatched, q.left]).toEqual([1, 1])
  expect(hatchPlan(petsView({ ...tiny(), PetInventoryOwned: 2 }, []))).toBeNull() // 5 free slots
  const r3 = hatchPlan(petsView({ ...tiny(), EggsCreated: at({ 1: 1, 2: 3, 3: 2 }) }, []))! // 3 eggs, still 1 trash
  expect(r3.hatch).toEqual([{ egg: 'N1 r3', count: 1 }])
  expect(r3.left).toBe(2)
})

// the author's 2026-10-23 save in miniature: inventory full of idle pets that each look worth keeping alone.
const pet = (slot: number, name: string, species: number, level: number, genes: number[], status = 0, group = 'Idle', position = '—'): Pet =>
  ({ slot, species, name, level, genes, rarity: 2, status, group, position })
test('petRoles: role rule trashes on a full inventory, every kept pet has a role, swaps free more', () => {
  const pandaParent = pet(1, 'panda', 9, 43, [1, 1], 1, 'Nest 2', 'Parent B'), zebra = pet(2, 'zebra', 19, 49, [17], 1, 'Nest 2', 'Parent A')
  const eagle = pet(3, 'eagle', 17, 41, [4], 1, 'Nest 1', 'Parent A'), spore = pet(4, 'spore', 18, 45, [3], 1, 'Nest 1', 'Parent B')
  const frog = pet(5, 'dart frog', 11, 36, [2, 2], 2, 'Trekking', 'Fighter 1')
  const panda48 = pet(6, 'panda', 9, 48, [1, 1]), panda40 = pet(7, 'panda', 9, 40, [1, 12]), crow = pet(8, 'crow', 13, 32, [5, 14])
  const duck = pet(9, 'duck', 4, 28, [12]), crow39 = pet(10, 'crow', 13, 39, [5, 5])
  const pets = [pandaParent, zebra, eagle, spore, frog, panda48, panda40, crow, duck, crow39]
  const nests = [{ n: 1, parents: [eagle, spore] }, { n: 2, parents: [zebra, pandaParent] }]
  const trek = [{ name: 'Current team', team: { 1: 5 }, moves: [], result: { killsPerMin: 5.3 } },
    { name: 'Best team', team: { 1: 5, 5: 9 }, moves: ['support 5: — → duck'], result: { killsPerMin: 6.3 } }]
  const r = petRoles(pets, nests, trek)
  // panda40: the idle panda48 is the panda keeper (b), so no spare; crow39: crow #8 (Incubation) keeps the crow line.
  expect(r.trash.map((t) => t.pet.slot)).toEqual([10, 7]) // lowest level first
  expect(r.kept.map((k) => [k.pet.slot, k.why.split(':')[0]])).toEqual([[6, 'nest parent'], [8, 'nest parent'], [9, 'trek']])
  for (const k of r.kept) expect(k.why.length).toBeGreaterThan(10)
  expect(r.swaps.map((w) => [w.in.map((p) => p.slot), w.out.map((p) => p.slot)])).toEqual([[[9], []], [[6], [1]], [[8], [3]]])
  expect(r.swaps[2]!.text).toContain('Incubation') // crow (13) replaces the eagle (17 ≤ spore 18): egg timer and new-species pick unchanged
  expect(r.afterTrash.map((t) => t.pet.slot)).toEqual([1]) // the replaced panda; the replaced eagle is the last eagle
  const q = hatchPlan({ eggsWaiting: 5, free: 0, nests: [], ...r })!
  expect(q.trash.map((t) => t.pet.slot)).toEqual([10, 7]); expect(q.nestTrash.map((t) => t.pet.slot)).toEqual([1]); expect(q.nestSwaps.map((r) => [r.nest, r.ok])).toEqual([[2, true], [1, true]]) // no eggs in these nests: safe
})

// Changing a nest parent clears that nest's waiting eggs (docs/pets.md §4): a nest swap is never ordered before its eggs are hatched.
test('hatchPlan: nest swaps wait for their nest\'s eggs; pending-swap nests are hatched first; no room means the swap waits', () => {
  const a = pet(1, 'a', 1, 10, []), b = pet(2, 'b', 2, 20, []), c = pet(3, 'c', 3, 30, []), d = pet(4, 'd', 4, 40, [])
  const sw = (nest: number, i: Pet, o: Pet) => ({ text: `Nest ${nest}: swap`, in: [i], out: [o], nest, rows: [] })
  const trek = { text: 'Trek', in: [c], out: [d], rows: [] }
  const nests = [{ n: 1, rarities: [1, 1] }, { n: 2, rarities: [5, 4, 3] }, { n: 3, rarities: [2, 2] }] as never
  const base = { eggsWaiting: 7, free: 3, trash: [{ pet: a, why: '' }], nests, swaps: [trek, sw(1, a, b)], afterTrash: [{ pet: d, why: '' }, { pet: b, why: '' }] }
  const q = hatchPlan(base)!
  // room before the nest swap = 3 free + 1 trash + trek-freed d = 5: Nest 1 (2 eggs, swap pending) is emptied first, then the rarest left (N2 r5, r4, r3).
  expect(q.trekSwaps).toEqual([trek]); expect(q.trekTrash.map((t) => t.pet.slot)).toEqual([4])
  expect(q.hatch).toEqual([{ egg: 'N1 r1', count: 2 }, { egg: 'N2 r5', count: 1 }, { egg: 'N2 r4', count: 1 }, { egg: 'N2 r3', count: 1 }])
  expect(q.nestSwaps[0]).toMatchObject({ nest: 1, clears: 0, ok: true })
  expect(q.nestTrash.map((t) => t.pet.slot)).toEqual([2]); expect(q.hatchAfter).toEqual([{ egg: 'N3 r2', count: 1 }])
  expect([q.hatched, q.left]).toEqual([6, 1])
  // not enough room to empty Nest 2: its swap waits (ok false, k eggs lost), its freed pet is not counted
  const w = hatchPlan({ ...base, free: 0, trash: [], swaps: [sw(2, a, b)], afterTrash: [{ pet: b, why: '' }] })!
  expect(w.nestSwaps[0]).toMatchObject({ nest: 2, clears: 3, rarities: [5, 4, 3], ok: false }); expect(w.nestTrash).toEqual([])
  // invariant: an ok nest swap never has eggs of its nest left un-hatched
  for (const r of [...q.nestSwaps, ...w.nestSwaps]) expect(r.ok).toBe(r.clears === 0)
})

test('a raid/secret pet as nest parent is swapped for a breedable idle pet (2026-10-24)', () => {
  const pet = (slot: number, species: number, name: string, level: number, status: number, extra: Partial<Pet> = {}) =>
    ({ slot, species, name, level, genes: [], rarity: 1, status, group: status ? 'Nest' : 'Idle', position: status ? 'Nest 1 Parent A' : '—', ...extra }) as unknown as Pet
  const king = pet(1, 71, 'king', 1, 1), crow = pet(2, 10, 'crow', 32, 1, { position: 'Nest 1 Parent B' }), zebra = pet(3, 15, 'zebra', 80, 0)
  const r = petRoles([king, crow, zebra], [{ n: 1, parents: [king, crow] }], [])
  const w = r.swaps.find((x) => x.nest === 1)!
  expect(w.out).toEqual([king])
  expect(w.in).toEqual([zebra])
  expect(w.text).toContain('raid/secret pet')
  expect(w.text).toMatch(/page \d/)
})

// the author, 2026-10-27: a nest parent never moves straight from its nest to trek. Taking it out of the nest is its own swap
// (listed first, carries the nest's eggs), and the trek swap reads it from the inventory.
test('trek swap that needs a nest parent: nest step first, then a separate trek step', () => {
  const eagle = pet(3, 'eagle', 17, 41, [4], 1, 'Nest 1', 'Parent A'), spore = pet(4, 'spore', 18, 45, [3], 1, 'Nest 1', 'Parent B')
  const frog = pet(5, 'dart frog', 11, 36, [2, 2], 2, 'Trekking', 'Fighter 1')
  const trek = [{ name: 'Current team', team: { 1: 5 }, moves: [], result: { killsPerMin: 5 } },
    { name: 'Best team', team: { 1: 5, 5: 3 }, moves: ['support 5: — → eagle L41 (Leech; Nest 1 Parent A)'], result: { killsPerMin: 7 } }]
  const r = petRoles([eagle, spore, frog], [{ n: 1, parents: [eagle, spore] }], trek)
  const [out, tr] = r.swaps
  expect(out).toMatchObject({ nest: 1, in: [], out: [eagle] })
  expect(tr!.nest).toBeUndefined(); expect(tr!.needs).toEqual([1]); expect(tr!.in).toEqual([eagle])
  expect(tr!.rows[0]!.to).not.toContain('Nest 1'); expect(tr!.rows[0]!.to).toContain('after it leaves the nest')
  // with eggs to place, the trek swap is not counted as freeing room before the hatch
  const q = hatchPlan({ eggsWaiting: 2, free: 0, trash: [], nests: [{ n: 1, rarities: [1] }] as never, swaps: r.swaps, afterTrash: [] })!
  expect(q.trekSwaps).toEqual([]); expect(q.trekAfter).toEqual([tr])
})

// #2726 (the author: "swapping pets in and out of the same nests"): the slot a nest parent leaves for trek used to stay empty (the
// next plan then refilled it: a second visit to the nest), and two changes to one nest were two steps. Now each nest is one
// step, refilled from an idle pet, or from the pet the trek swap frees in a step after it.
test('nest churn: one step per nest, the trek-vacated slot is refilled, no pet both in and out of a nest', () => {
  const crowA = pet(1, 'crow', 13, 155, [5, 14], 1, 'Nest 1', 'Parent A'), spore = pet(2, 'spore', 18, 50, [3], 1, 'Nest 1', 'Parent B')
  const crowB = pet(3, 'crow', 13, 126, [5, 5], 2, 'Trekking', 'Fighter 2')
  const trek = [{ name: 'Current team', team: { 2: 3 }, moves: [], result: { killsPerMin: 20.9 } },
    { name: 'Best team', team: { 2: 1 }, moves: ['fighter 2: crow L126 (Trekking Fighter 2) → crow L155 (Nest 1 Parent A)'], result: { killsPerMin: 23 } }] // +10%, past MIN_NEST_TREK_GAIN
  const check = (swaps: ReturnType<typeof petRoles>['swaps']) => {
    for (const n of new Set(swaps.map((w) => w.nest).filter((n) => n !== undefined))) {
      expect(swaps.filter((w) => w.nest === n && !w.needs).length).toBe(1) // one visit before the trek swap
      const ins = swaps.filter((w) => w.nest === n).flatMap((w) => w.in), outs = swaps.filter((w) => w.nest === n).flatMap((w) => w.out)
      expect(ins.filter((p) => outs.includes(p))).toEqual([])
    }
  }
  // idle crow and a better spore: both changes to Nest 1 are one step, made before the trek swap
  const crowIdle = pet(4, 'crow', 13, 150, [5, 14]), spore60 = pet(5, 'spore', 18, 60, [3])
  const r = petRoles([crowA, spore, crowB, crowIdle, spore60], [{ n: 1, parents: [crowA, spore] }], trek)
  check(r.swaps)
  expect(r.swaps.map((w) => [w.nest, w.in.map((p) => p.slot), w.out.map((p) => p.slot)])).toEqual([[1, [4, 5], [1, 2]], [undefined, [1], [3]]])
  // no idle pet: the crow the trek swap frees refills the slot, after it; it is not a trash candidate
  const q = petRoles([crowA, spore, crowB], [{ n: 1, parents: [crowA, spore] }], trek)
  check(q.swaps)
  expect(q.swaps.map((w) => [w.nest, w.needs, w.in.map((p) => p.slot), w.out.map((p) => p.slot)])).toEqual([[1, undefined, [], [1]], [undefined, [1], [1], [3]], [1, [1], [3], []]])
  expect(q.afterTrash).toEqual([])
  const h = hatchPlan({ eggsWaiting: 2, free: 0, trash: [], nests: [{ n: 1, rarities: [1, 1] }] as never, swaps: q.swaps, afterTrash: q.afterTrash })!
  expect(h.nestSwaps.map((x) => x.swap)).toEqual([q.swaps[0]]); expect(h.trekAfter).toEqual([q.swaps[1], q.swaps[2]])
})

// the author, 2026-10-27 (#2726): a nest parent goes to trek only for at least MIN_NEST_TREK_GAIN more kills/min (10-27 save: crow #1
// out of Nest 2 for 20.9 → 21.4, +2.4%, no longer happens). A trek option that takes no nest parent needs any gain.
test('trek takes a nest parent only past MIN_NEST_TREK_GAIN; other trek gains are unaffected', () => {
  expect(MIN_NEST_TREK_GAIN).toBe(0.05)
  const crowA = pet(1, 'crow', 13, 155, [5, 14], 1, 'Nest 1', 'Parent A'), spore = pet(2, 'spore', 18, 50, [3], 1, 'Nest 1', 'Parent B')
  const crowB = pet(3, 'crow', 13, 126, [5, 5], 2, 'Trekking', 'Fighter 2'), duck = pet(4, 'duck', 4, 28, [12])
  const cur = { name: 'Current team', team: { 2: 3 }, moves: [], result: { killsPerMin: 20.9 } }
  const pull = (k: number) => ({ name: 'Best team', team: { 2: 1 }, moves: ['fighter 2: crow L126 → crow L155 (Nest 1 Parent A)'], result: { killsPerMin: k } })
  const nests = [{ n: 1, parents: [crowA, spore] }]
  expect(petRoles([crowA, spore, crowB], nests, [cur, pull(21.4)]).swaps).toEqual([])
  expect(petRoles([crowA, spore, crowB], nests, [cur, pull(20.9 * 1.06)]).swaps.some((w) => w.needs)).toBe(true)
  // the small nest pull is skipped, the next-best option (no nest parent, +0.5%) is taken
  const idleOpt = { name: 'Best single swap', team: { 2: 3, 5: 4 }, moves: ['support 5: — → duck'], result: { killsPerMin: 21.0 } }
  const r = petRoles([crowA, spore, crowB, duck], nests, [cur, pull(21.4), idleOpt])
  expect(r.swaps.map((w) => [w.nest, w.in.map((p) => p.slot)])).toEqual([[undefined, [4]]])
})

// the author, 2026-10-27 (#2726): no nest parent of the highest owned species = no new species anywhere. The plan nests the best idle
// one over a lower-species parent, preferring a nest it already changes (one visit, one egg clear), then the fewest eggs.
test('top species: the best idle pet of the highest species is nested, merged into a nest already being changed', () => {
  const eagle = pet(1, 'eagle', 17, 41, [4], 1, 'Nest 1', 'Parent A'), spore = pet(2, 'spore', 18, 45, [3], 1, 'Nest 1', 'Parent B')
  const panda = pet(3, 'panda', 9, 30, [1], 1, 'Nest 2', 'Parent A'), crow = pet(4, 'crow', 13, 30, [5], 1, 'Nest 2', 'Parent B')
  const zebra50 = pet(5, 'zebra', 19, 50, [17]), zebra40 = pet(6, 'zebra', 19, 40, [17]), crow40 = pet(7, 'crow', 13, 40, [5])
  // Nest 1 has fewer eggs, but Nest 2 is already changing (crow #4 → crow #7): the zebra goes there, in the same step
  const nests = [{ n: 1, parents: [eagle, spore], eggsWaiting: 0 }, { n: 2, parents: [panda, crow], eggsWaiting: 3 }]
  const r = petRoles([eagle, spore, panda, crow, zebra50, zebra40, crow40], nests, [])
  expect(r.swaps.map((w) => [w.nest, w.in.map((p) => p.slot), w.out.map((p) => p.slot)])).toEqual([[2, [7, 5], [4, 3]]])
  expect(r.kept.find((k) => k.pet === zebra50)!.why).toContain('highest species')
  // nothing else changing: the nest with fewer eggs, over its lower-species parent
  const q = petRoles([eagle, spore, panda, crow, zebra50], [{ ...nests[0]!, eggsWaiting: 4 }, nests[1]!], [])
  expect(q.swaps.map((w) => [w.nest, w.in.map((p) => p.slot), w.out.map((p) => p.slot)])).toEqual([[2, [5], [3]]])
  // already nested: no step
  expect(petRoles([eagle, spore, zebra50], [{ n: 1, parents: [eagle, zebra50] }], []).swaps).toEqual([])
})
