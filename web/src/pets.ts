// Pet (Trekking) stats the pet scene (SceneEvents_43 in Qno2x.js) rebuilds each time the pet screen refreshes; absent
// from Steam Cloud saves. Checked against stored values in pets.test.ts. Issue #15.
// Not ported, on purpose: GlobalPetAttackType / GlobalPetAttackValue are the queue of pet attacks fired in battle (each
// cooldown hit writes slot _PetAttackIterization: ability id 1-21, PetValue1 × that ability's multiplier) for the battle
// actor to consume. Event log, not a stat.
import { tankBonuses } from './bus'
import { trekOptions, type TrekOption } from './pet-combat' // circular (pet-combat imports this file); both only call each other inside functions
import * as NX from './next-types'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
/** Gene tier bonus: 1 per 3 genes, max 3. */
const tier = (g: number) => Math.min(Math.floor(g / 3), 3)
/** 1 from 3 genes up (the game writes floor((g+97)/100)). */
const any = (g: number) => Math.floor((g + 97) / 100)

/** Species id of the pet in inventory slot i, from its name (PetsOwned → PetIDlist), as the game's PetINDEX does.
 *  PetsOwnedINT goes stale for idle inventory pets after trashing/hatching (2026-10-10: 7 of 35 idle slots held old
 *  or 70 ids); placed pets always matched, so nestBreeding keeps PetsOwnedINT to stay equal to the game's PetINDEX. */
export function speciesAt(save: Save, i: number): number {
  const id = (arr(save, 'PetIDlist') as unknown as string[]).indexOf(String(arr(save, 'PetsOwned')[i]))
  return id > 0 ? id : n(arr(save, 'PetsOwnedINT')[i])
}

/** The 8 fighting slots: PetPositions[1..6, 19, 20] (pet ids). */
const SLOTS = [1, 2, 3, 4, 5, 6, 19, 20]

/** PetGenes[1..30]: how many fighting pets carry each ability (PetAbility1-3), plus construct 41, the MTX slot pack
 *  (whichMTXpurchased[50]: slots 5/6/19/20 count twice) and Dairy Aisle achievement 10 (slots 1-4, ability 2).
 *  Gene 23 at 3/6/9 counts slots 1-4's abilities 1/2/3 once more. Same order as the game: gene 23 can rise mid-loop. */
export function petGenes(save: Save): number[] {
  const stored = arr(save, 'PetGenes'), g = Array.from({ length: Math.max(31, stored.length) }, (_, i) => n(stored[i])), c41 = n(arr(save, 'ConstructLV')[41]), mtx = n(arr(save, 'whichMTXpurchased')[50])
  const dairy = n(arr(save, 'DairyAisleAchievements')[10]), pos = (s: number) => n(arr(save, 'PetPositions')[s])
  const ab = (k: number, s: number) => n(arr(save, `PetAbility${k}`)[pos(s)])
  const CONSTRUCT: Record<number, number> = { 12: 99, 13: 98, 15: 97, 17: 96, 22: 95, 25: 94, 26: 93 }
  for (let i = 1; i <= 30; i++) g[i] = i in CONSTRUCT ? Math.floor((c41 + CONSTRUCT[i]!) / 100) : 0
  const pack = (s: number) => (s === 5 && mtx >= 1) || (s === 6 && mtx >= 2) || (s === 19 && mtx >= 3) || (s === 20 && mtx >= 4) ? 1 : 0
  for (const s of SLOTS) for (let i = 1; i <= 30; i++) for (const k of [1, 2, 3])
    if (ab(k, s) === i) g[i]! += 1 + pack(s) + (k === 2 && s <= 4 && dairy === 1 ? dairy : 0)
  for (const s of SLOTS) for (let i = 1; i <= 30; i++)
    for (const k of [1, 2, 3]) if (n(g[23]) >= 3 * k && s <= 4 && ab(k, s) === i) g[i]! += 1
  return g
}

/** PetValueTotals[11..29] as the pet screen sets them. [1..10] are battle buffs the pet-attack actor (ActorEvents_1349)
 *  adds during a fight and the screen zeroes on refresh, so they are 0 here (live mid-fight they aren't: [2] read 20). */
export function petValueTotals(save: Save, g = petGenes(save)): number[] {
  const G = (i: number) => n(g[i]), v = Array<number>(arr(save, 'PetValueTotals').length || 33).fill(0)
  const pv1 = (s: number) => n(arr(save, 'PetValue1')[n(arr(save, 'PetPositions')[s])])
  v[11] = SLOTS.reduce((t, s) => t + pv1(s), 0)
  v[12] = 50 + 40 * G(26) + (50 * G(12) + 100 * tier(G(12)))
  v[13] = (0.15 * G(13) + 0.2 * G(26)) * (1 + 0.5 * 2 ** tier(G(13)) * any(G(13)))
  v[14] = tier(G(14))
  v[15] = 25 * G(15) * (1 + 0.5 * 2 ** tier(G(15)) * any(G(15))) * (1 + 0.25 * 2 ** tier(G(18)) * any(G(18)))
  v[16] = Math.min(4 * G(16), 75)
  v[17] = 5 * G(17) + 10 * tier(G(17))
  v[19] = Math.max(1 - 0.05 * G(19), 0.1) * (1 - 0.25 * tier(G(19)))
  v[20] = 20 * G(20) * (1 + (tier(G(20)) * n(save.TrekkingLV)) / 100)
  v[21] = 25 * G(21) * (1 + 0.5 * 2 ** tier(G(21)) * any(G(21))) + 15 * tier(G(12))
  v[22] = 5 * G(22)
  v[23] = 1
  v[25] = 25 * G(25)
  v[26] = 50 * G(26)
  return v
}

/** PetHPtot: (10 + summed PetValue1 of the fighters) × lab tank 52 × genes 11/26 × Rift 4. */
export function petHPtot(save: Save) {
  const g = petGenes(save), G = (i: number) => n(g[i]), rift = n(arr(save, 'RiftLVL')[4]), pro = n(arr(save, 'RiftProLvs')[4])
  const tank52 = arr(save, 'TankBonusLIST').length ? n(arr(save, 'TankBonusLIST')[52]) : tankBonuses(save)[52]
  return (10 + petValueTotals(save)[11]!) * tank52 * (0.25 * G(11) + 0.2 * G(26) + 0.375 * 2 ** tier(G(11)) * any(G(11)) + 1)
    * (1 + ((250 * rift) / (rift + 200)) * ((2 * pro) / (pro + 100)) / 100)
}

// ---- Pets tab (#24). Keys, layouts and confidence marks from docs/pets.md: † = read in game code, wiki/guide = that
// source only, inferred = fits the save, not traced. The trash rule (petRoles) is a role rule (docs/pets.md §4 step 4), not game code.

/** _GeneticNames † (Qno2x.js). 1-10 attack moves (fighters only). */
export const GENES = ['', 'Fire Fist', 'Curse Skull', 'Healing', 'Boomerang', 'Life Leech', 'Bubbler', 'Snipe', 'Radiation', 'Rattlin Gun',
  'Zeus Bolt', 'Health', 'Perception', 'Swiftness', 'Incubation', 'Loot', 'Evasive', 'Enthusiasm', 'Discovery', 'Defender', 'Trekkery',
  'Snapzi', 'Genesis', 'SoulBound', 'Ionize', 'Respawn', 'Abominable']
/** Trek slots: position, role, Trekking level that opens it †, MTX slot-pack count that also opens it †. */
export const TREK_SLOTS = [
  { p: 1, role: 'fighter', lv: 0, mtx: 0 }, { p: 2, role: 'fighter', lv: 0, mtx: 0 }, { p: 3, role: 'fighter', lv: 15, mtx: 0 }, { p: 4, role: 'fighter', lv: 50, mtx: 0 },
  { p: 5, role: 'support', lv: 5, mtx: 1 }, { p: 6, role: 'support', lv: 25, mtx: 2 }, { p: 19, role: 'support', lv: 35, mtx: 3 }, { p: 20, role: 'support', lv: 70, mtx: 4 },
] as const
/** PetRewardList[k] milestone thresholds †: k 1-8 Hatchery, 9-16 Trekking, 17-24 Research. */
export const MILESTONES = { Hatchery: [5, 10, 20, 30, 40, 70, 100, 150], Trekking: [5, 15, 25, 35, 50, 70, 90, 120], Research: [10, 20, 40, 70, 100, 150, 250, 400] }
// The game names nine tank colours in this order (_MainStat1[102..110] "GREEN_TANKS_GAIN_RP_AT_A" … "BLOOD_…", @28270920; pets.test.ts);
// this tab models the first five, 5 tanks each.
export const TANK_COLOURS = ['green', 'orange', 'red', 'yellow', 'pink']
const VESSELS = ['', 'green', 'orange', 'red', 'yellow'] // PetCurrenciesOwned[1..4] †; only green is named in the game (GREEN_VESSELS_OWNED @25858388), the rest are wiki colours
const MAX_BRED = 45 // ids 0-45 bred species, 71-85 raid/asylum/secret †
/** Hatchery level that opens nest 1-6: the nest buttons' click gates (regions 65-70, @27673578-@27684092). */
export const NEST_UNLOCK = [0, 5, 10, 20, 30, 50]

export interface Pet { slot: number; species: number; name: string; level: number; genes: number[]; rarity: number; status: number; group: string; position: string }
/** Where PetPositions[p] puts a pet †: 1-4 fighters, 5/6/19/20 supports, 7-18 nest parents (two per nest), 21+ capsules. */
/** Where to find a pet in the inventory screen †: 5 per page in a row, index = column + 5·page + 1 (pet-icon actors, x = 115 + 116·column). */
export const invPlace = (slot: number) => ({ page: Math.ceil(slot / 5), col: ((slot - 1) % 5) + 1 })
export const invText = (slot: number) => { const { page, col } = invPlace(slot); return `page ${page}, ${['1st', '2nd', '3rd', '4th', '5th'][col - 1]} from left` }
export function placeOf(p: number): { group: string; position: string } {
  if (p >= 1 && p <= 4) return { group: 'Trekking', position: `Fighter ${p}` }
  const sup = [5, 6, 19, 20].indexOf(p)
  if (sup >= 0) return { group: 'Trekking', position: `Support ${sup + 1}` }
  if (p >= 7 && p <= 18) return { group: `Nest ${Math.floor((p - 7) / 2) + 1}`, position: `Parent ${(p - 7) % 2 ? 'B' : 'A'}` }
  if (p >= 21) return { group: 'Research', position: `Capsule ${p - 20}` }
  return { group: 'Idle', position: '—' }
}
const STATUS = ['idle', 'nest', 'trekking', 'capsule'] // PetStatus: inferred
export const statusName = (s: number) => STATUS[s] ?? `status ${s}`

/** trek: trekOptions(save, pets, search) when the caller already has them (the Pets tab, after "Find best team"); default = the quick options (no search, ~0.2 s). */
export function petsView(save: Save, trek?: TrekOption[]) {
  const names = arr(save, 'PetIDlist') as unknown as string[], owned = arr(save, 'PetsOwned') as unknown as string[]
  const nameOf = (id: number) => (names[id] && names[id] !== 'Nothing' ? String(names[id]).replace(/_/g, ' ') : `#${id}`)
  const pos = (p: number) => n(arr(save, 'PetPositions')[p])
  const size = 5 * n(save.PetInventoryOwned)
  const placed = new Map<number, number>() // inventory slot → position
  arr(save, 'PetPositions').forEach((slot, p) => { if (p > 0 && n(slot) > 0) placed.set(n(slot), p) })
  const pets: Pet[] = []
  for (let i = 1; i <= Math.max(size, owned.length - 1); i++) {
    if (!owned[i] || owned[i] === 'Nothing') continue
    // A gene of -1 is the hatch's own bug: 10% of second-gene rolls read _GenePossibilities[length] (one past the end) and
    // store N(undefined) - 1 = -1 (@28095827). It matches no gene id, so it is an empty slot, like the 0 the next 5% branch stores.
    const ab = [1, 2, 3].map((k) => n(arr(save, `PetAbility${k}`)[i]))
    pets.push({ slot: i, species: speciesAt(save, i), name: String(owned[i]).replace(/_/g, ' '), level: n(arr(save, 'PetValue1')[i]),
      genes: ab.filter((g) => g > 0), rarity: n(arr(save, 'PetRarity')[i]), status: n(arr(save, 'PetStatus')[i]),
      ...(placed.has(i) ? placeOf(placed.get(i)!) : { group: 'Idle', position: '—' }) })
  }
  const bySlot = new Map(pets.map((p) => [p.slot, p]))
  const at = (p: number) => bySlot.get(pos(p)) ?? null
  const unlocked = arr(save, 'PetUnlocked')
  let highest = -1
  for (let id = 0; id <= MAX_BRED; id++) if (n(unlocked[id])) highest = id

  // Hatchery
  const vse = arr(save, 'NestLevelsVSE'), prest = arr(save, 'NestPrestige'), eggs = arr(save, 'EggsCreated')
  const nests = [1, 2, 3, 4, 5, 6].map((nn) => {
    const levels = [1, 2, 3].map((k) => n(vse[3 * (nn - 1) + k])), prestige = n(prest[nn])
    const parents = [at(7 + 2 * (nn - 1)), at(8 + 2 * (nn - 1))]
    const rarities = Array.from({ length: 20 }, (_, e) => n(eggs[e + 1 + 20 * (nn - 1)])).filter((v) => v > 0), eggsWaiting = rarities.length
    const bred = parents.filter((p): p is Pet => !!p && p.species <= MAX_BRED).map((p) => p.species)
    const best = bred.length ? Math.max(...bred) : -1
    const next = best >= 0 && best < MAX_BRED && !n(unlocked[best + 1]) ? best + 1 : null
    return { n: nn, levels, prestige, cap: 60 * (prestige + 1), prestigeReady: levels.every((l) => l >= 60 * (prestige + 1)), parents, eggsWaiting, rarities,
      breed: parents.every(Boolean) ? nestBreeding(save, nn) : null, costs: levels.map((L) => nestUpgradeCost(L, n(arr(save, 'TankBonusLIST')[44]))),
      bestParent: best, canDiscover: next === null ? null : nameOf(next),
      unlock: NEST_UNLOCK[nn - 1]!, active: n(save.HatcheryLV) >= NEST_UNLOCK[nn - 1]! }
  }).filter((x) => x.active)
  const eggsWaiting = nests.reduce((t, x) => t + x.eggsWaiting, 0)
  const used = pets.filter((p) => p.slot <= size).length, free = size - used
  const bestParent = Math.max(-1, ...nests.map((x) => x.bestParent))

  const trekRows = trek ?? trekOptions(save, pets, false)
  const { trash, kept, swaps, afterTrash } = petRoles(pets, nests, trekRows)

  // Trekking
  const tlv = n(save.TrekkingLV), mtx = n(arr(save, 'whichMTXpurchased')[50]), genes = petGenes(save)
  const slots = TREK_SLOTS.map((s) => ({ ...s, open: tlv >= s.lv || (s.mtx > 0 && mtx >= s.mtx), pet: at(s.p) }))
  const combos = genes.map((c, id) => ({ id, name: GENES[id] ?? `gene ${id}`, count: n(c), tier: tier(n(c)), next: n(c) >= 9 ? null : 3 * (tier(n(c)) + 1) }))
    .filter((g) => g.id > 0 && g.count > 0).sort((a, b) => b.count - a.count)
  const cur = arr(save, 'PetCurrenciesOwned')

  // Research
  const tanks = arr(save, 'TankLVs')
  const tankGroups = TANK_COLOURS.map((colour, c) => {
    const tiers = [1, 2, 3].map((s) => { const lv = [1, 2, 3, 4, 5].map((t) => n(tanks[3 * (5 * c + t - 1) + s])); return { min: Math.min(...lv), max: Math.max(...lv) } })
    return { colour, tiers }
  }).filter((g) => g.tiers.some((t) => t.max > 0))
  const capsules: { p: number; pet: Pet | null }[] = []
  for (let p = 21; p < arr(save, 'PetPositions').length; p++) if (pos(p)) capsules.push({ p, pet: at(p) })
  const capLv = arr(save, 'PetCapsuleLV')
  const passives = capLv.map((lv, id) => ({ id, name: nameOf(id), lv: n(lv) })).filter((x) => x.lv > 0).sort((a, b) => b.lv - a.lv)

  const rewards = arr(save, 'PetRewardList')
  const skill = (k: keyof typeof MILESTONES, base: number) => {
    const lv = n(save[`${k}LV`]), need = n(save[`${k}REQ`])
    const ms = MILESTONES[k].map((at, j) => ({ at, held: n(rewards[base + j]) === 1 }))
    return { lv, pct: need ? n(save[`${k}EXP`]) / need : 0, milestones: ms, next: ms.find((m) => !m.held) ?? null }
  }

  const warnings: string[] = []
  for (const x of nests) if (x.prestigeReady) warnings.push(`Nest ${x.n} can be prestiged (all three stats ≥ ${x.cap}) †`)
  if (nests.length && bestParent < highest && !swaps.some((w) => w.in.some((p) => p.species === highest))) warnings.push(`No new species possible: best nest parent is ${nameOf(bestParent)} (${bestParent}), highest owned is ${nameOf(highest)} (${highest}). Nest one of your ${nameOf(highest)}s († new species = highest parent + 1)`)
  if (free < eggsWaiting || free <= 0) warnings.push(`${free <= 0 ? 'Inventory full' : `Not enough room: ${free} free`}: ${used}/${size} used, ${eggsWaiting} egg${eggsWaiting === 1 ? '' : 's'} waiting${trash.length ? `; ${trash.length} trash candidate${trash.length === 1 ? '' : 's'} below` : ''}`)
  if (eggsWaiting) warnings.push(`${eggsWaiting} egg${eggsWaiting === 1 ? '' : 's'} waiting to hatch (${nests.filter((x) => x.eggsWaiting).map((x) => `N${x.n} ${x.eggsWaiting}`).join(', ')})`)

  return {
    warnings, nameOf, pets, nests, eggsWaiting, used, size, free, highest, bestParent, gold: n(save.GoldNestsPurchased), trash, kept, swaps, afterTrash, trek: trekRows,
    hatchery: skill('Hatchery', 1), trekking: skill('Trekking', 9), research: skill('Research', 17),
    slots, combos, mtx, hp: petHPtot(save),
    frontier: n(save.PetDistanceLV), distanceLeft: n(save.PetDistanceREQ) - n(save.PetDistance),
    vessels: [1, 2, 3, 4].map((i) => ({ colour: VESSELS[i]!, have: n(cur[i]) })), shells: [12, 13, 14, 15, 16].map((i) => n(cur[i])), genes2: geneOdds(save),
    tankGroups, expansions: n(tanks[301]), capsules, passives, lab: labPlan(save),
  }
}
export type PetsView = ReturnType<typeof petsView>

/** Eggs waiting > free inventory slots (#52): the trash → hatch → recheck loop as a checklist. Trash the first candidates
 *  (the heuristic list, lowest level first) until every egg fits, hatch, rarest eggs first (higher rarity = better new-species
 *  odds †) in case room runs short, and if eggs remain, reload the save: a fresh hatch can make a new trash candidate (a second
 *  pet of its species). null when every egg already fits. Clicks, not waiting: no step has a duration. */
/** Every gene of `b` (with repeats) is also in `a`. */
export function covers(a: number[], b: number[]) {
  const left = [...a]
  return b.every((g) => { const i = left.indexOf(g); return i >= 0 && left.splice(i, 1).length > 0 })
}

/** The slice of a trekOptions row the trash rule reads (team = position → inventory slot). */
export interface TrekLike { name: string; team: Record<number, number>; moves: string[]; result: { killsPerMin: number } }
/** nest = set for a nest-parent swap. Changing a parent clears that nest's waiting eggs (docs/pets.md §4), so these go after the hatch. */
/** rows: the same swap as table rows (where, the pet taken out → the pet put in, why) for the Plan. */
export interface SwapRow { where: string; from: string; to: string; note: string }
/** needs = a trek swap that takes a pet out of that nest first: the nest step is its own swap, listed before it. */
export interface Swap { text: string; in: Pet[]; out: Pet[]; nest?: number; needs?: number[]; rows: SwapRow[] }
/** Genes that work in a nest, per parent gene slot †: Incubation ×1.4 egg speed (nestBreeding speedMulti), Discovery ×1.25 new-species odds (hatch b0). */
const NEST_GENES: Record<number, string> = { 14: '×1.4 egg speed', 18: '×1.25 new-species odds' }

/** Role-based trash rule (docs/pets.md §4 step 4; the author 2026-10-23). An idle pet does nothing in game, so it is kept only for a
 *  role: (a) in a trek option that beats the current team, (b) a better nest parent (same species, covers a parent's genes at a
 *  higher level; or carries a nest gene no parent of some nest has), (c) the only owned carrier of a gene, (d) the last of its
 *  species, or the species' one spare (none when the species already has an idle keeper from a-c).
 *  Swaps: the top better trek option, then each (b) pet onto the weakest parent it beats; afterTrash = pets the swaps
 *  displace that the same rule would then trash. Trash ranks least valuable first: level, rarity, then most-duplicated genes. */
/** Least kills/min gain (fraction of the current team's) for a trek option that takes a nest parent (the author, 2026-10-27, #2726).
 *  Pulling a parent costs a nest visit, clears its eggs, and swaps a breeding parent; a few % of trek speed isn't worth that
 *  churn (10-27 save: crow #1 out of Nest 2 for +2.4%). Options that take no nest parent need any gain at all. Tune here. */
export const MIN_NEST_TREK_GAIN = 0.05

export function petRoles(pets: Pet[], nests: { n: number; parents: (Pet | null)[]; eggsWaiting?: number }[], trek: TrekLike[]) {
  const idle = pets.filter((p) => p.status === 0), bySlot = new Map(pets.map((p) => [p.slot, p]))
  const tag = (p: Pet) => `${p.name} #${p.slot} L${p.level}`
  const where = (p: Pet) => (p.status === 0 ? invText(p.slot) : `${p.group} ${p.position}`)
  // Every pet named in a swap carries its inventory page and position (the author, 2026-10-23), plus its role when it has one.
  const at = (p: Pet) => `${tag(p)} (${invText(p.slot)}${p.status === 0 ? '' : `, ${p.group} ${p.position}`})`
  const nestRow = (n: number, from: Pet, to: Pet, note: string): SwapRow => ({ where: `Nest ${n} ${from.position}`, from: `${tag(from)} (${invText(from.slot)})`, to: `${tag(to)} (${invText(to.slot)})`, note })
  const carriers = (g: number) => pets.filter((p) => p.genes.includes(g)).length
  const why = new Map<number, string>(), swaps: Swap[] = [], used = new Set<number>(), replaced = new Set<number>()
  // toTrek: nest parents the trek swap takes (their nest slot is empty after it); trekOut: pets that swap frees, free for that slot.
  const toTrek = new Set<number>(), trekOut: Pet[] = []

  // (a) trek: idle pets in any option that kills faster than the current team; the fastest option is the swap.
  const cur = trek.find((o) => o.name === 'Current team'), base = cur?.result.killsPerMin ?? 0
  const takesParent = (o: TrekLike) => Object.values(o.team).some((s) => !Object.values(cur?.team ?? {}).includes(s) && /^Nest \d/.test(bySlot.get(s)?.group ?? ''))
  const better = trek.filter((o) => cur && o.result.killsPerMin > (takesParent(o) ? base * (1 + MIN_NEST_TREK_GAIN) : base + 1e-9)).sort((a, b) => b.result.killsPerMin - a.result.killsPerMin)
  const rate = (o: TrekLike) => `${base.toFixed(1)} → ${o.result.killsPerMin.toFixed(1)} kills/min`
  for (const o of better) for (const s of Object.values(o.team)) {
    const p = bySlot.get(s)
    if (p?.status === 0 && !why.has(s)) why.set(s, `trek: in ${o.name} (${rate(o)})`)
  }
  if (better[0] && cur) {
    const was = Object.values(cur.team), now = Object.values(better[0].team)
    const inc = now.filter((s) => !was.includes(s)).map((s) => bySlot.get(s)).filter((p): p is Pet => !!p)
    const out = was.filter((s) => !now.includes(s)).map((s) => bySlot.get(s)).filter((p): p is Pet => !!p)
    // a move reads "<slot>: <from> → <to>"
    // A nest parent never goes straight from its nest to trek (the author, 2026-10-27): taking it out of the nest is its own swap,
    // listed first (it clears that nest's eggs), and the trek swap then picks it up from the inventory.
    const fromNest = inc.filter((p) => /^Nest \d/.test(p.group)), needs = [...new Set(fromNest.map((p) => Number(p.group.slice(5))))]
    for (const p of fromNest) {
      const nn = Number(p.group.slice(5)); replaced.add(p.slot); toTrek.add(p.slot)
      swaps.push({ text: `Nest ${nn}: take ${at(p)} out to the inventory (it joins the trek team in the next step)`, in: [], out: [p], nest: nn,
        rows: [{ where: `Nest ${nn} ${p.position}`, from: `${tag(p)} (${invText(p.slot)})`, to: '(inventory)', note: 'step 1: out of the nest; the trek swap is a separate step' }] })
    }
    const fromInv = (t: string) => fromNest.reduce((x, p) => x.replace(`${p.group} ${p.position}`, `${invText(p.slot)}, after it leaves the nest`), t)
    const moves = better[0].moves.map(fromInv)
    const rows = moves.map((m, i) => { const [where, rest = ''] = m.split(/: (.*)/s), [from = '', to = ''] = rest.split(' → ')
      return { where: `Trek ${where}`, from, to, note: i ? '' : `${better[0]!.name}: ${rate(better[0]!)}` } })
    swaps.push({ text: `Trek, ${better[0].name} (${rate(better[0])}): ${moves.join('; ')}${out.length ? ` · out: ${out.map(at).join(', ')}` : ''}`, in: inc, out, rows, ...(needs.length ? { needs } : {}) })
    inc.forEach((p) => used.add(p.slot))
    if (needs.length) trekOut.push(...out) // only a needs-trek swap is always in the plan, so only its freed pets can refill a nest
  }

  // (b) nest parents.
  const parents = nests.flatMap((x) => x.parents.map((p, k) => ({ nest: x.n, p, other: x.parents[1 - k] ?? null })))
    .filter((e): e is { nest: number; p: Pet; other: Pet | null } => !!e.p)
  for (const p of [...idle].sort((a, b) => b.level - a.level)) {
    const beats = parents.filter((e) => e.p.species === p.species && p.level > e.p.level && covers(p.genes, e.p.genes))
    if (!beats.length) continue
    if (!why.has(p.slot)) why.set(p.slot, `nest parent: beats ${beats.map((e) => `Nest ${e.nest} ${tag(e.p)}`).join(', ')} (same genes or more, higher level)`)
    const e = beats.filter((x) => !replaced.has(x.p.slot)).sort((a, b) => a.p.level - b.p.level)[0]
    if (e && !used.has(p.slot)) {
      replaced.add(e.p.slot); used.add(p.slot)
      swaps.push({ text: `Nest ${e.nest}: ${at(e.p)} → ${at(p)}, +${p.level - e.p.level} levels, genes kept`, in: [p], out: [e.p], nest: e.nest, rows: [nestRow(e.nest, e.p, p, `+${p.level - e.p.level} levels, genes kept`)] })
    }
  }
  for (const [gs, effect] of Object.entries(NEST_GENES)) {
    const g = Number(gs), lacking = new Set(nests.filter((x) => x.parents.every(Boolean) && !x.parents.some((q) => q!.genes.includes(g))).map((x) => x.n))
    for (const p of idle.filter((q) => q.genes.includes(g))) {
      if (!lacking.size) break
      if (!why.has(p.slot)) why.set(p.slot, `nest parent: ${GENES[g]} (${effect}); no parent in Nest ${[...lacking].join('/')} has it`)
      if (used.has(p.slot)) continue
      // Replace the lower-species parent, only where the other parent's species is at least this pet's: the slower parent
      // sets the egg timer and the higher one the new-species pick †, so both stay; weakest such parent first.
      const e = parents.filter((x) => lacking.has(x.nest) && !replaced.has(x.p.slot) && x.other && !replaced.has(x.other.slot)
        && x.p.species <= x.other.species && p.species <= x.other.species && !Object.keys(NEST_GENES).some((k) => x.p.genes.includes(Number(k))))
        .sort((a, b) => a.p.level - b.p.level)[0]
      if (!e) continue
      replaced.add(e.p.slot); used.add(p.slot); lacking.delete(e.nest)
      swaps.push({ text: `Nest ${e.nest}: ${at(e.p)} → ${at(p)}, ${GENES[g]} ${effect}${p.level < e.p.level ? `, ${e.p.level - p.level} levels lower` : ''}`, in: [p], out: [e.p], nest: e.nest,
        rows: [nestRow(e.nest, e.p, p, `${GENES[g]} ${effect}${p.level < e.p.level ? `, ${e.p.level - p.level} levels lower` : ''}`)] })
    }
  }
  // Empty parent slots: fill each with the best idle pet left. Highest species first (the higher parent sets the new-species
  // pick †), then a nest gene the nest lacks, then level. An empty slot breeds nothing, so any pet beats none.
  // A raid/secret parent (species above MAX_BRED) never sets the new-species pick, so it counts as an empty slot too.
  // A slot whose parent goes to trek counts as empty (#2726): refilled in the same nest step from an idle pet, or, when the best
  // pet is one the trek swap frees, as its own step after the trek swap (it needs no second egg clear: the nest step did that).
  for (const x of nests) for (const [k, q] of x.parents.entries()) {
    const vacated = !!q && toTrek.has(q.slot)
    if (q && !vacated && (q.species <= MAX_BRED || replaced.has(q.slot))) continue
    const o = x.parents[1 - k] ?? null, other = o && toTrek.has(o.slot) ? null : o && (swaps.find((w) => w.out.includes(o))?.in[0] ?? o) // the parent it will pair with
    const bredRank = (p: Pet) => (p.species <= MAX_BRED ? p.species : -1) // raid/secret pets (above MAX_BRED) never set the new-species pick
    const hasGene = (p: Pet) => Object.keys(NEST_GENES).some((g) => p.genes.includes(Number(g)) && !other?.genes.includes(Number(g)))
    const p = [...idle, ...trekOut].filter((c) => !used.has(c.slot))
      // same species and nest gene: an idle pet (same step) beats one the trek swap frees (a second visit to the nest)
      .sort((a, b) => bredRank(b) - bredRank(a) || +hasGene(b) - +hasGene(a) || +trekOut.includes(a) - +trekOut.includes(b) || b.level - a.level)[0]
    if (!p) continue
    if (q && !vacated && bredRank(p) < 0) continue // only swap a raid/secret parent for a breedable pet
    used.add(p.slot)
    const late = trekOut.includes(p), pairs = other ? `; pairs with ${tag(other)}` : ''
    if (!why.has(p.slot)) why.set(p.slot, `nest parent: fills Nest ${x.n}'s ${vacated ? 'trek-vacated' : q ? 'raid/secret-pet' : 'empty'} slot`)
    if (vacated) {
      const where = `Nest ${x.n} ${q!.position}`, to = `${tag(p)} (${invText(p.slot)}${late ? ', after the trek swap' : ''})`
      if (late) {
        swaps.push({ text: `Nest ${x.n}: ${where.slice(`Nest ${x.n} `.length)} (empty since ${tag(q!)} went to trek) ← ${at(p)}, freed by the trek swap${pairs}`, in: [p], out: [], nest: x.n, needs: [x.n],
          rows: [{ where, from: '(empty)', to, note: `freed by the trek swap; refills the slot ${q!.name} left${pairs}` }] })
      } else {
        const w = swaps.find((s) => s.nest === x.n && s.out.includes(q!))!
        w.in.push(p); w.text = `Nest ${x.n}: ${at(q!)} → ${at(p)} (${tag(q!)} joins the trek team in the next step)`
        w.rows[0] = { ...w.rows[0]!, to, note: `step 1: ${q!.name} out to the inventory, ${p.name} in; the trek swap is a separate step` }
      }
      continue
    }
    if (q) replaced.add(q.slot)
    swaps.push({ text: q ? `Nest ${x.n}: ${at(q)} → ${at(p)}${other ? ` (pairs with ${tag(other)})` : ''}, ${q.name} is a raid/secret pet and never sets the new-species pick`
      : `Nest ${x.n}: empty slot ← ${at(p)}${other ? ` (pairs with ${tag(other)})` : ''}, an empty slot breeds nothing`, in: [p], out: q ? [q] : [], nest: x.n,
      ...(late ? { needs: [x.n] } : {}),
      rows: [{ where: `Nest ${x.n} ${q ? q.position : 'empty slot'}`, from: q ? `${tag(q)} (${invText(q.slot)})` : '(empty)', to: `${tag(p)} (${invText(p.slot)})`,
        note: `${q ? `${q.name} is a raid/secret pet and never sets the new-species pick` : 'an empty slot breeds nothing'}${pairs}` }] })
  }
  // Top species (the author, 2026-10-27, #2726): new species = highest parent + 1 †, so with no parent of the highest owned bred
  // species no nest can discover anything. Nest the best idle one of that species over a lower-species parent: a nest this
  // plan already changes first (its eggs clear anyway), then the fewest eggs waiting, then the lowest parent.
  const after = (x: (typeof nests)[number]) => [...x.parents.filter((p) => p && !swaps.some((w) => w.out.includes(p))), ...swaps.filter((w) => w.nest === x.n).flatMap((w) => w.in)]
  const top = Math.max(-1, ...pets.filter((p) => p.species <= MAX_BRED).map((p) => p.species))
  const topPet = idle.filter((p) => p.species === top && !used.has(p.slot)).sort((a, b) => b.level - a.level)[0]
  if (topPet && !nests.some((x) => after(x).some((p) => p?.species === top))) {
    const touched = (n: number) => swaps.some((w) => w.nest === n && !w.needs)
    const e = parents.filter((x) => !replaced.has(x.p.slot) && !swaps.some((w) => w.out.includes(x.p)) && x.p.species < top)
      .sort((a, b) => +touched(b.nest) - +touched(a.nest) || (nests.find((x) => x.n === a.nest)!.eggsWaiting ?? 0) - (nests.find((x) => x.n === b.nest)!.eggsWaiting ?? 0)
        || a.p.species - b.p.species || a.p.level - b.p.level)[0]
    if (e) {
      used.add(topPet.slot); replaced.add(e.p.slot)
      why.set(topPet.slot, `nest parent: highest species owned, no nest has one (new species = highest parent + 1)`)
      const note = `${topPet.name} is the highest species owned: lets Nest ${e.nest} discover a new species`
      swaps.push({ text: `Nest ${e.nest}: ${at(e.p)} → ${at(topPet)}, ${note}`, in: [topPet], out: [e.p], nest: e.nest, rows: [nestRow(e.nest, e.p, topPet, note)] })
    }
  }
  // One step per nest (#2726): every parent change clears the nest's eggs, so several changes to one nest are done in one visit.
  // Steps that wait on the trek swap (needs) stay separate.
  const merged: Swap[] = []
  for (const w of swaps) {
    const f = w.nest !== undefined && !w.needs ? merged.find((m) => m.nest === w.nest && !m.needs) : undefined
    if (!f) { merged.push(w); continue }
    f.in.push(...w.in); f.out.push(...w.out); f.rows.push(...w.rows); f.text += `; ${w.text.replace(/^Nest \d+: /, '')}`
  }
  swaps.splice(0, swaps.length, ...merged)

  // (c) only carrier, (e) unknown gene, (d) last of species.
  const free = (p: Pet) => p.status === 0 || swaps.some((w) => w.out.includes(p)) // idle once the swaps are done
  const solo = (p: Pet) => p.genes.find((g) => carriers(g) === 1)
  const fixed = (p: Pet) => (solo(p) !== undefined ? `only pet with ${GENES[solo(p)!]}`
    : pets.filter((q) => q.species === p.species).length === 1 ? `last ${p.name}` : null)
  for (const p of idle) if (!why.has(p.slot)) { const w = fixed(p); if (w) why.set(p.slot, w) }
  // (d) spare: one per species, the highest-level pet left idle after the swaps (displaced parents/fighters count), unless an
  // idle pet of that species is already kept by a-c/e. ponytail: one spare is a judgment call; 0 or 2 is a one-line change.
  const spare = new Map<number, Pet>()
  for (const p of pets.filter((q) => free(q) && !used.has(q.slot))) {
    if (idle.some((q) => q.species === p.species && why.has(q.slot))) continue
    const s = spare.get(p.species); if (!s || p.level > s.level || (p.level === s.level && p.rarity > s.rarity)) spare.set(p.species, p)
  }
  for (const s of spare.values()) if (s.status === 0 && !why.has(s.slot)) why.set(s.slot, `spare ${s.name}: highest-level idle one, kept as parent material (one per species)`)

  const dup = (p: Pet) => p.genes.reduce((t, g) => t + carriers(g), 0)
  const rank = (a: { pet: Pet }, b: { pet: Pet }) => a.pet.level - b.pet.level || a.pet.rarity - b.pet.rarity || dup(b.pet) - dup(a.pet)
  const reason = (p: Pet, after: boolean) => {
    const others = pets.filter((q) => q !== p && q.species === p.species && (why.has(q.slot) || !free(q) || used.has(q.slot) || spare.get(q.species) === q))
      .sort((a, b) => b.level - a.level).slice(0, 2)
    const role = (q: Pet) => (why.has(q.slot) ? why.get(q.slot)!.split(':')[0] : spare.get(q.species) === q ? 'spare' : where(q))
    const genes = [...new Set(p.genes)].map((g) => `${GENES[g]} is also on ${carriers(g) - 1} other pet${carriers(g) === 2 ? '' : 's'}`).join('; ')
    return `${after ? 'after the swap, ' : ''}duplicate ${p.name}: the ${p.name}s worth keeping are ${others.map((q) => `${tag(q)} (${role(q)})`).join(', ')}; ${genes || 'it carries no gene'}`
  }
  const trash = idle.filter((p) => !why.has(p.slot)).map((pet) => ({ pet, why: reason(pet, false) })).sort(rank)
  const kept = idle.filter((p) => why.has(p.slot)).map((pet) => ({ pet, why: why.get(pet.slot)! }))
  const afterTrash = swaps.flatMap((w) => w.out).filter((p, i, all) => all.indexOf(p) === i && !used.has(p.slot) && !fixed(p) && spare.get(p.species) !== p)
    .map((pet) => ({ pet, why: reason(pet, true) })).sort(rank)
  return { trash, kept, swaps, afterTrash }
}

/** Eggs a nest-parent swap would clear: the nest's eggs still waiting. Zero for trek swaps. */
export function swapEggs(v: Pick<PetsView, 'nests'>, w: Swap) {
  const rarities = w.nest === undefined ? [] : [...(v.nests.find((x) => x.n === w.nest)?.rarities ?? [])].sort((a, b) => b - a)
  return { nest: w.nest, count: rarities.length, rarities }
}

/** Order of play when eggs outnumber free slots (nest swaps clear that nest's eggs, docs/pets.md §4, so they come after the hatch):
 *  trash now → trek swaps (no eggs involved) + the pets they free → hatch (nests with a pending parent swap first, smallest first)
 *  → nest swaps whose nest is now empty + the pets they free → hatch what still waits. A nest swap whose eggs do not all fit
 *  is `ok: false`: it waits, or costs `count` eggs. */
export function hatchPlan(v: Pick<PetsView, 'eggsWaiting' | 'free' | 'trash' | 'nests'> & Partial<Pick<PetsView, 'swaps' | 'afterTrash'>>) {
  if (v.eggsWaiting <= Math.max(v.free, 0)) return null
  const free = Math.max(v.free, 0), need = v.eggsWaiting - free, now = v.trash.slice(0, need)
  const swaps = v.swaps ?? [], after = v.afterTrash ?? [], swapOf = (p: Pet) => swaps.find((w) => w.out.includes(p))
  // a trek swap that needs a nest step first can't run before the hatch, so its freed pets don't count here
  const trekFreed = after.filter((t) => { const w = swapOf(t.pet); return w?.nest === undefined && !w?.needs }).slice(0, need - now.length)
  const trekSwaps = swaps.filter((w) => w.nest === undefined && w.out.some((p) => trekFreed.some((t) => t.pet === p)))
  const key = (e: { nest: number; rarity: number }) => `N${e.nest} r${e.rarity}`
  const tally = (eggs: { nest: number; rarity: number }[]) => { const by = new Map<string, number>(); for (const e of eggs) by.set(key(e), (by.get(key(e)) ?? 0) + 1); return [...by].map(([egg, count]) => ({ egg, count })) }
  const eggs = v.nests.flatMap((x) => x.rarities.map((r) => ({ nest: x.n, rarity: r })))
  // Stage A: room before any nest swap. Nests with a swap pending are emptied first (fewest eggs first), then rarest eggs.
  let room = free + now.length + trekFreed.length
  const taken = new Set<{ nest: number; rarity: number }>(), done = new Set<number>()
  for (const n of [...new Set(swaps.filter((w) => w.nest !== undefined).map((w) => w.nest!))].sort((a, b) => eggs.filter((e) => e.nest === a).length - eggs.filter((e) => e.nest === b).length)) {
    const mine = eggs.filter((e) => e.nest === n)
    if (mine.length <= room) { mine.forEach((e) => taken.add(e)); room -= mine.length; done.add(n) }
  }
  const byRarity = (a: { rarity: number }, b: { rarity: number }) => b.rarity - a.rarity
  const hatchA = [...taken], extraA = eggs.filter((e) => !taken.has(e)).sort(byRarity).slice(0, room)
  extraA.forEach((e) => taken.add(e))
  const nestRows = swaps.filter((w) => w.nest !== undefined && !w.needs).map((w) => {
    const rest = eggs.filter((e) => e.nest === w.nest && !taken.has(e)).map((e) => e.rarity)
    return { swap: w, nest: w.nest!, total: eggs.filter((e) => e.nest === w.nest).length, clears: rest.length, rarities: rest, ok: rest.length === 0 }
  })
  const nestFreed = after.filter((t) => { const w = swapOf(t.pet); return w?.nest !== undefined && !!nestRows.find((r) => r.swap === w)?.ok }).slice(0, need - now.length - trekFreed.length)
  const hatchB = eggs.filter((e) => !taken.has(e)).sort(byRarity).slice(0, nestFreed.length)
  const hatched = taken.size + hatchB.length
  // trek swaps that wait on a nest step, then nest refills that wait on that trek swap: listed after the nest swaps, in order
  const trekAfter = swaps.filter((w) => w.needs?.length)
  return { trash: now, trekSwaps, trekTrash: trekFreed, hatch: tally([...hatchA, ...extraA]), nestSwaps: nestRows, trekAfter, nestTrash: nestFreed, hatchAfter: tally(hatchB), hatched, left: v.eggsWaiting - hatched }
}

// ---- Research lab vessel upgrades (#24). Lab scene in Qno2x.js †: costs from the _UpgradeCost1-3 block (@28974300),
// vessel colour from _VesselTypeSPEND (@28595000, @28602100), odds from the region-72/73/74 buy handlers (@28980500),
// effects from _TankBonusesListPARTS[161..193] (@28325300, @28367000, @28369300, @28403100) and _TankRPbonusCOLOUR (@28265500).
// Lab "tanks": 101 Lab Mainframe, 102-110 vats (Grasseous, Glycogen, Visceral, Cash Money, Tool Shed, Ecksdee, Mutagen,
// Risquious, Satanic; vat 102+c feeds colour c), 111 Shiny Vat (sparklecoins, needs MTXmysticVATowned). Levels at TankLVs[3(T-1)+slot].
const VAT_NAMES = ['Grasseous', 'Glycogen', 'Visceral', 'Cash Money', 'Tool Shed', 'Ecksdee', 'Mutagen', 'Risquious', 'Satanic']
const vesselName = (i: number) => (i === 0 ? 'sparklecoin' : VESSELS[i] ?? `vessel ${i}`)
/** Tank-bonus curve the lab uses everywhere: (min(L,1) + 198L/(L+1000)) × scale/100 †. */
const curve = (L: number, scale: number) => ((Math.min(L, 1) + (198 * L) / (L + 1000)) * scale) / 100
/** Vat slot 1 (PARTS[161+3n]) †: ×RP for that vat's colour, 1.042^L softcapped by 1.005 per level past 100/200/350/500/700, ^0.8. */
const vatRate = (L: number) => (1.042 ** L / [100, 200, 350, 500, 700].reduce((d, c) => d * 1.005 ** Math.max(L - c, 0), 1)) ** 0.8
/** Vat slot 2 (PARTS[165+3n]) †: ×RP for all tanks. */
const vatAll = (L: number) => 1 - 0.04 * Math.min(L, 1) + curve(L, 4)
/** Buy odds % † (roll 1-100 ≤ round(odds); vessels are spent either way). Slot 1 of the mainframe has its own curve. */
const odds = (mainframeSlot1: boolean, L: number, tbl39: number) =>
  Math.min(100, Math.round((mainframeSlot1 ? Math.max(Math.ceil((105 - (100 * L) / (L + 40)) / 5) * 5, 50) : Math.max(58 + 2 * Math.ceil((105 - (100 * L) / (L + 80)) / 5), 50)) * (1 + tbl39)))
/** Tier level-up EXP requirement (_customBlock_GetTankExpREQ) †. */
export const tankExpReq = (L: number, potion155 = 0, green = 0) =>
  (12 * 1.1 ** L + L ** 5.3 + 15 * (L + Math.floor(L / 10)) ** 1.7) * (1 + L / 400) * (1 - Math.min((0.35 * potion155) / (potion155 + 175), 0.34)) ** Math.log10(Math.abs(green + 10))

/** Knee (as smithing-caps.ts): level where the bonus reaches half its ceiling. null = no ceiling (Mainframe expansions, tier 2,
 *  vat slot 1's RP rate, Shiny Vat slots 1-2 are linear or exponential). */
export type LabKnee = { knee: number; pctKnee: number; pctCeiling: number; src: string } | null
export interface LabUpgrade { tank: number; slot: number; name: string; level: number; unlocked: boolean; maxed: boolean; vessel: number; cost: number; odds: number; gives: string; gain: number; knee?: LabKnee }

/** curve(L, s) tends to 199·s/100; it is half that at L = 990 (1 + 198L/(L+1000) = 99.5). */
const CURVE_KNEE = 990
const curveKnee = (L: number, src: string): LabKnee => ({ knee: CURVE_KNEE, pctKnee: L / CURVE_KNEE, pctCeiling: (Math.min(L, 1) + (198 * L) / (L + 1000)) / 199, src })

const have = (save: Save, v: number) => (v === 0 ? n(save.sparklecoin) : n(arr(save, 'PetCurrenciesOwned')[v]))

/** Every vessel upgrade at its current level: next cost, colour, odds, effect, and gain = log of the research-side multiplier. */
export function labUpgrades(save: Save) {
  const lv = (i: number) => n(arr(save, 'TankLVs')[i]), tbl = arr(save, 'TankBonusLIST')
  const exp = lv(301), vats = Math.min(Math.min(exp, 1) + Math.floor(Math.max(exp - 1, 0) / 2), 9)
  // Share of open (RP-earning, OpenValues[t] > 0 †) tanks in each colour: weights a colour-only RP buy against an all-tanks one.
  const open = Array.from({ length: 100 }, (_, t) => n(arr(save, 'OpenValues')[t + 1]) > 0)
  const share = (c: number) => open.slice(5 * c, 5 * c + 5).filter(Boolean).length / Math.max(open.filter(Boolean).length, 1)
  // Multi-level chance (aa in the tier level-up, roll @28937177) †: r = randomInt(0, 100); r < aa gives 2 levels, r < aa−100 gives 3,
  // … r < aa−600 gives 8 (15 with Dairy Aisle achievement 11, ignored here). So expected levels per level-up = 1 + Σk P(r < aa−100k),
  // capped at 8 when aa ≥ 701; there is no cap at 101.
  // Vat slot 3 of vats 102-110 (PARTS[163+3(o+1)] = curve(TankLVs[3·(101+o)+3], 20), o = 0..8, @28370300 †).
  const piece = (o: number) => curve(lv(3 * (101 + o) + 3), 20)
  const dbl = Math.min(n(tbl[13]), 170) + 20 * n(arr(save, 'PetRewardList')[18]) + 40 * n(arr(save, 'PetRewardList')[21]) + 25 * lv(333)
    + [0, 1, 2, 3, 4, 5, 6, 7, 8].reduce((t, o) => t + piece(o), 0)
  const levels = (aa: number) => 1 + [0, 1, 2, 3, 4, 5, 6].reduce((t, k) => t + Math.min(Math.max(aa - 100 * k, 0), 101) / 101, 0)
  // + 200 when the open tank's pipe is Diamond (DiamondPiping[tank], @28937177 †): aa differs per tank, so a buy's gain is the
  // mean over open tanks. ponytail: equal weight per open tank; tanks are levelled only while open, so this is a proxy.
  const piped = Array.from({ length: 100 }, (_, t) => (open[t] ? 200 * Math.min(n(arr(save, 'DiamondPiping')[t + 1]), 1) : -1)).filter((x) => x >= 0)
  const meanLevels = (d: number) => (piped.length ? piped.reduce((t, p) => t + levels(dbl + d + p), 0) / piped.length : levels(dbl + d))
  const dblGain = (d: number) => meanLevels(d) / meanLevels(0)
  const ups: LabUpgrade[] = []
  // Multi-level chance stops paying at 701 (8 levels per level-up): past it, slot 3 and Shiny slot 3 add nothing.
  const dblKnee = (L: number, perLevel: (l: number) => number, src: string): LabKnee => {
    if (dbl >= 701) return { knee: Math.max(0, L - Math.ceil((dbl - 701) / Math.max(perLevel(L), 1e-9))), pctKnee: Infinity, pctCeiling: 1, src: `${src}; total multi-level chance ${dbl.toFixed(0)} is past its 701 cap (8 levels per level-up)` }
    return null
  }
  const add = (u: Omit<LabUpgrade, 'maxed' | 'odds'> & { max?: number; mf1?: boolean }) =>
    ups.push({ ...u, maxed: u.level >= (u.max ?? 1000), odds: u.vessel === 0 ? 100 : odds(!!u.mf1, u.level, n(tbl[39])) })

  // Lab Mainframe (101). Slot 1 expansions alternate: even level → a new vat (while < 9), odd → a new capsule (while level < 12) †.
  const nextExp = exp % 2 === 0 ? (vats < 9 ? `unlocks vat ${vats + 1} (${VAT_NAMES[vats]})` : 'all tanks RP (mode after 9 vats)')
    : exp < 12 ? `unlocks capsule ${Math.floor(exp / 2) + 1}` : 'all tanks RP (mode after 6 capsules)'
  add({ tank: 101, slot: 1, name: 'Mainframe: Expand The Lab', level: exp, unlocked: true, max: 30, mf1: true, vessel: Math.min(1 + Math.floor(exp / 2), 9),
    cost: 10 * 3 ** exp + 5 * (exp + Math.max(exp - 4, 0) ** 1.5) ** 5, gives: nextExp, gain: 0 })
  const m2 = lv(302), m3 = lv(303)
  add({ tank: 101, slot: 2, name: 'Mainframe: tier 2', level: m2, unlocked: exp >= 5, vessel: Math.min(Math.max(Math.ceil(m2 / 55) - Math.floor(m2 / 99), 1), 9),
    cost: 2 * 1.044 ** m2 + m2 ** 2.7, gives: 'all tanks bonuses level up faster (wiki; size not decoded)', gain: 0 })
  add({ tank: 101, slot: 3, name: 'Mainframe: tier 3', level: m3, unlocked: m2 >= 40,
    vessel: Math.min(Math.max(Math.ceil(m3 / 55) - Math.floor(m3 / 90) + Math.floor(m3 / 58) - Math.floor(m3 / 65), 1), 9),
    cost: 5 * 1.044 ** m3 + m3 ** 3.2, knee: curveKnee(m3, 'chain-upward chance 20·(min(L,1) + 198L/(L+1000))/100'), gives: `chain-upward chance ${curve(m3, 20).toFixed(2)}% → ${curve(m3 + 1, 20).toFixed(2)}% (cap 38 with tank 35)`, gain: 0 })
  // Vats 102-110: vessel colour = vat number (102 green …) †; slot 2 opens at slot 1 Lv50, slot 3 at slot 2 Lv150 †.
  for (let c = 0; c < 9; c++) {
    const T = 102 + c, [a, b, d] = [1, 2, 3].map((s) => lv(3 * (T - 1) + s)) as [number, number, number], on = c < vats, name = `${VAT_NAMES[c]} Vat`
    add({ tank: T, slot: 1, name, level: a, unlocked: on, vessel: c + 1, cost: 1.044 ** a + a ** 1.8,
      gives: `${TANK_COLOURS[c] ?? `colour ${c + 1}`} tanks RP ×${vatRate(a).toFixed(2)} → ×${vatRate(a + 1).toFixed(2)}`, gain: Math.log(vatRate(a + 1) / vatRate(a)) * share(c) })
    add({ tank: T, slot: 2, name, level: b, unlocked: on && a >= 50, vessel: c + 1, cost: 2 * 1.044 ** b + b ** 2.4, knee: curveKnee(b, 'all tanks RP ×(1 + 4·(min(L,1) + 198L/(L+1000))/100)'),
      gives: `all tanks RP ×${vatAll(b).toFixed(3)} → ×${vatAll(b + 1).toFixed(3)}`, gain: Math.log(vatAll(b + 1) / vatAll(b)) })
    add({ tank: T, slot: 3, name, level: d, unlocked: on && b >= 150, vessel: c + 1, cost: 5 * 1.044 ** d + d ** 2.9,
      knee: dblKnee(d, (l) => curve(l + 1, 20) - curve(l, 20), 'double-level chance 20·(min(L,1) + 198L/(L+1000))/100') ?? curveKnee(d, 'double-level chance 20·(min(L,1) + 198L/(L+1000))/100'),
      gives: `double-level chance +${curve(d, 20).toFixed(2)}% → +${curve(d + 1, 20).toFixed(2)}%`, gain: Math.log(dblGain(curve(d + 1, 20) - curve(d, 20))) })
  }
  // Shiny Vat (111) †: sparklecoins 250/225/200 flat, 10 levels each, only with the Mystic Vat MTX.
  const sh = [331, 332, 333].map(lv), mystic = n(save.MTXmysticVATowned) === 1
  add({ tank: 111, slot: 1, name: 'Shiny Vat', level: sh[0]!, unlocked: mystic, max: 10, vessel: 0, cost: 250, gives: `Research EXP +${50 * sh[0]!}% → +${50 * sh[0]! + 50}%`, gain: Math.log((1.5 + 0.5 * sh[0]!) / (1 + 0.5 * sh[0]!)) })
  add({ tank: 111, slot: 2, name: 'Shiny Vat', level: sh[1]!, unlocked: mystic, max: 10, vessel: 0, cost: 225, gives: `all tanks RP +${50 * sh[1]!}% → +${50 * sh[1]! + 50}%`, gain: Math.log((1.5 + 0.5 * sh[1]!) / (1 + 0.5 * sh[1]!)) })
  add({ tank: 111, slot: 3, name: 'Shiny Vat', level: sh[2]!, unlocked: mystic, max: 10, vessel: 0, cost: 200, knee: dblKnee(sh[2]!, () => 25, '+25 double-level chance per level'), gives: `double-level chance +${25 * sh[2]!} → +${25 * sh[2]! + 25}`, gain: Math.log(dblGain(25)) })
  return { upgrades: ups, dblChance: dbl, levelsPer: meanLevels(0), pipedTanks: piped.filter((p) => p > 0).length, mystic }
}

export function labPlan(save: Save) {
  const { upgrades: ups, dblChance, levelsPer, pipedTanks, mystic } = labUpgrades(save), lv = (i: number) => n(arr(save, 'TankLVs')[i]), cur = arr(save, 'PetCurrenciesOwned')

  // ponytail: maximise Σ log-gain per expected vessel (cost ÷ odds), one vessel colour's budget at a time; an RP multiplier
  // counts the same as a Research EXP one. Not modelled: RP only pays off once re-invested in a tier (TankRPinvest is set to the
  // tank's RP when you click), and tier EXP then grows as x³·1.05^(x²), x = log2(RP invested). Model that chain if rankings look off.
  // Equal marginal value (Lagrange, as spendLevels in src/realm-coins.ts), one λ per colour: each upgrade's level curve is
  // tabulated once, λ bisected so every step with ratio ≥ λ fits, then a top-up. Each roll assumed to succeed.
  // ponytail: curves are read with the other tanks frozen, so a tier unlocked by another (slot 2 at slot 1 Lv50, slot 3 at
  // slot 2 Lv150) and the shared double-level chance (slot-3 gains) only update between passes; passes repeat on the leftover.
  const byRatio = (a: { r: number; level: number }, b: { r: number; level: number }) => b.r - a.r || a.level - b.level
  const tl = [...arr(save, 'TankLVs')], left = new Map<number, number>()
  const buy: (LabUpgrade & { left: number })[] = []
  for (let pass = 0; pass < 10; pass++) {
    const base = labUpgrades({ ...save, TankLVs: tl }).upgrades, got: (LabUpgrade & { left: number; r: number })[] = []
    for (const v of new Set(base.map((u) => u.vessel))) {
      const budget = left.get(v) ?? have(save, v)
      const curves = base.filter((u) => u.vessel === v && u.unlocked && !u.maxed && u.gain > 0).map((u0) => {
        const i = 3 * (u0.tank - 1) + u0.slot, t = [...tl], steps: (LabUpgrade & { r: number })[] = []
        for (let u = u0, cum = 0, r = Infinity; u.unlocked && !u.maxed && u.gain > 0 && cum + u.cost <= budget; ) {
          r = Math.min(r, (u.gain * u.odds) / 100 / u.cost) // running min keeps the prefix rule exact
          steps.push({ ...u, r }); cum += u.cost; t[i] = u.level + 1
          u = labUpgrades({ ...save, TankLVs: t }).upgrades.find((x) => x.tank === u0.tank && x.slot === u0.slot)!
        }
        return steps
      })
      if (!curves.some((c) => c.length)) continue
      const take = (lam: number) => curves.map((cv) => { let k = 0; while (k < cv.length && cv[k]!.r >= lam) k++; return k })
      const spend = (ks: number[]) => ks.reduce((a, k, j) => a + curves[j]!.slice(0, k).reduce((b, s) => b + s.cost, 0), 0)
      let lo = Math.log(1e-300), hi = Math.log(Math.max(...curves.flatMap((cv) => cv.map((s) => s.r))) * 2)
      for (let it = 0; it < 200; it++) { const mid = (lo + hi) / 2; if (spend(take(Math.exp(mid))) <= budget) hi = mid; else lo = mid }
      const ks = take(Math.exp(hi))
      for (let rest = budget - spend(ks); ;) { // top-up: best next tabulated level that still fits
        let bj = -1
        curves.forEach((cv, j) => { const s = cv[ks[j]!]; if (s && s.cost <= rest && (bj < 0 || s.r > curves[bj]![ks[bj]!]!.r)) bj = j })
        if (bj < 0) break
        rest -= curves[bj]![ks[bj]!++]!.cost
      }
      let rest = budget
      curves.flatMap((cv, j) => cv.slice(0, ks[j])).sort(byRatio).forEach((s) => {
        rest -= s.cost; got.push({ ...s, left: rest }); tl[3 * (s.tank - 1) + s.slot] = s.level + 1
      })
      left.set(v, rest)
    }
    if (!got.length) break
    // Best ratio first across colours (do-next shows the first two); the running min keeps one upgrade's levels in order.
    buy.push(...got.sort(byRatio).map(({ r: _, ...b }) => b))
  }
  // Tier level-ups (and so all Research EXP) run only for the tank open on screen (_TankSelected in the lab draw loop) †:
  // tiers whose stored EXP already covers the next level are waiting for you to open that tank.
  const ready: { tank: number; slot: number }[] = []
  for (let t = 1; t <= 100; t++) for (let s = 1; s <= 3; s++) {
    const i = 3 * (t - 1) + s
    if (lv(i) > 0 && n(arr(save, 'TankLVexp')[i]) >= tankExpReq(lv(i), n(arr(save, 'PotionLV')[155]), n(cur[1]))) ready.push({ tank: t, slot: s })
  }
  const vessels = [0, 1, 2, 3, 4].map((v) => ({ v, name: vesselName(v), have: have(save, v) }))
  return { upgrades: ups, buy, ready, vessels, dblChance, levelsPer, pipedTanks, mystic }
}

// ---- Breeding (#27). Pet scene in Qno2x.js †: multipliers @27572228 (scene open) and @27696775 (refresh), egg timer
// @28033000 (40 ms tick) + @28037200 (lay), hatch @28053205 (species), @28094195 (genes), upgrade costs @27736384.
/** _NEWPETBaseChance[id] †: new-species % for the higher parent's species id. */
export const NEW_BASE = [0, 35, 26, 20, 16, 10, 7, 4, 2.5, 1.5, 1, 0.7, 0.5, 0.3, 0.2, 0.12, 0.07, 0.04, 0.025, 0.012, 0.006, 0.003, 0.0017, 0.001,
  7e-4, 4e-4, 25e-5, 13e-5, 8e-5, 5e-5, 3e-5, 17e-6, 1e-5, 7e-6, 4e-6, 25e-7, 16e-7, 1e-6, 4e-7, 25e-8, 17e-8, 5e-8, 1e-8, 1e-9, 1e-10, 1e-11]
/** _EggUpgradeOdds[rarity] †: % to raise an egg one rarity per lay ([0] = a new egg). */
export const EGG_UPGRADE = [100, 4, 0.2, 0.01, 1e-4, 0]
/** _NestAnimationREQ[id] †: egg-timer length set by the slower parent; raid/secret pets (71+) 7200. */
export const eggReq = (id: number) => (id >= 1 && id <= 70 ? 3600 * 1.42 ** (id - 1) : 7200)

/** Nest n's egg timer and hatch odds for an egg of each rarity 1-5, from the save. */
export function nestBreeding(save: Save, nn: number) {
  const tbl = arr(save, 'TankBonusLIST'), lv = n(save.HatcheryLV), mtx49 = n(arr(save, 'whichMTXpurchased')[49]), pr = arr(save, 'PetRewardList')
  const gold = Math.floor((16 - nn + mtx49) / 16) // golden nest k = the k-th one bought †
  const slots = [7, 8].map((p) => n(arr(save, 'PetPositions')[p + 2 * (nn - 1)]))
  const ids = slots.map((s) => n(arr(save, 'PetsOwnedINT')[s])), genes = slots.flatMap((s) => [1, 2, 3].map((k) => n(arr(save, `PetAbility${k}`)[s])))
  const count = (g: number) => genes.filter((x) => x === g).length
  // Refresh multiplier (@27696775), which runs right after the screen opens: it drops the Hatchery Lv5/70 milestones the open-time one has.
  const speedMulti = n(tbl[1]) * (1 + 3 * gold) * 1.4 ** count(14) // Incubation
  const rarityMulti = n(tbl[5]) * (1 + 2 * gold)
  const p125 = n(arr(save, 'PotionLV')[125])
  const newMulti = n(tbl[16]) * (1 + ((150 * p125) / (p125 + 175)) * (lv ** 0.82 / 25) / 100) * (1 + n(arr(save, 'EbonusThree')[9]) / 100) * (1 + 2 * gold)
  const req = Math.max(...ids.map(eggReq)), rate = Math.min(n(arr(save, 'NestAnimationSpeed')[nn]) * speedMulti, req / 600)
  const vMul = 1 + n(arr(save, 'NestLevelsVSE')[3 * (nn - 1) + 1]) ** 0.854 / 10.5
  const eggs = Array.from({ length: 20 }, (_, e) => n(arr(save, 'EggsCreated')[e + 1 + 20 * (nn - 1)])).filter((x) => x > 0).length
  const [lo, hi] = [Math.min(...ids), Math.max(...ids)], dairy = [1, 2, 3, 4, 5, 6, 7].reduce((t, i) => t + n(arr(save, 'DairyAisleAchievements')[i]), 0)
  const hatch = [1, 2, 3, 4, 5].map((r) => {
    const b0 = (1 + (r - 1) ** (2.2 + n(tbl[30]) / 5)) * (1 + (25 * n(pr[2]) + 50 * n(pr[4])) / 100) * 1.25 ** count(18) // Discovery
    let p1 = 0, p2 = 50
    if (hi < 71) {
      p1 = hi < 4 ? 70 - 6 * hi : Math.min((NEW_BASE[hi] ?? 0) * b0 * newMulti, 33)
      // The game measures |parent A − parent A| here (always 0), so this term is a flat 49.7.
      p2 = Math.min(Math.min((NEW_BASE[hi] ?? 0) * b0, 33) + 100 * (2.56 / 4.01 + 0.04) ** 1.8, p1 + 15)
    } else if (lo < 71) p2 = 15
    return { rarity: r, newPct: p1, higherPct: p2 - p1, lowerPct: 100 - p2 }
  })
  return {
    ids, gold: gold > 0, speedMulti, rarityMulti, newMulti, eggSec: (1.01 * req) / rate, capped: rate >= req / 600, // ponytail: 1.01 = the lay also takes 1% of the timer (@28037200)
    nextEggPct: eggs >= n(arr(save, 'MaxEggs')[nn]) ? 0 : Math.min(100, eggs ? 100 * vMul * rarityMulti * 0.62 ** eggs : 100),
    upgradePct: EGG_UPGRADE.slice(1, 5).map((o) => Math.min(100, o * vMul * rarityMulti)),
    newSpecies: hi < 71 ? Math.min(hi + 1, 38 + dairy) : null, hatch,
  }
}

/** 2nd / 3rd gene chance per hatch (%) †: Hatchery level and potion 154. The 3rd needs a 2nd. */
export function geneOdds(save: Save) {
  const lv = n(save.HatcheryLV), p = n(arr(save, 'PotionLV')[154]), c = (x: number) => Math.min(Math.max(x, 0), 100)
  return { second: c(((lv - 19) / (lv + 10)) * 100 * (1 + Math.min((80 * p) / (p + 175), 60) / 100)), third: c(((lv - 39) / (lv + 28)) * 100 * (1 + Math.min((50 * p) / (p + 175), 40) / 100)) }
}

/** Cost of the next level of a nest stat at level L †: cash always; vessels from L21 (colour by level); egg shells from L31
 *  (rarity 1-5 = PetCurrenciesOwned[12..16], cut by TankBonusLIST[44]). Below L21 the game charges 1 from PetCurrenciesOwned[0]. */
export function nestUpgradeCost(L: number, tbl44 = 0) {
  const d = Math.max(L - 20, 0), F = Math.floor((L + 210) / 120), k = Math.min(Math.ceil((L - 30) / 120), 5)
  const shell = ((L + 90) / (2 * F ** 2) - (120 / (2 * F ** 2)) * Math.floor((L + 89) / 120)) * Math.max(1 - tbl44 / 100, 0.2)
  return {
    cash: 5000 * 1.32 ** L,
    vessel: L > 20 ? { v: Math.min(Math.ceil((L - 20) / (45 + L ** 0.63)), 9), cost: 10 * d + d ** 3 + 1.02 ** d } : null,
    shell: L > 30 ? { rarity: k, cost: Math.ceil(shell * (1 + Math.max(k - 1, 0) / 2)) } : null,
  }
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'pets', title: 'Pets', src: 'pets.ts petsView (warnings, lab.ready, lab.buy, trash)', fn: (s) => {
    const v = petsView(s), vname = (i: number) => v.lab.vessels.find((x) => x.v === i)?.name ?? `vessel ${i}`
    return [
      ...v.warnings.map((w) => ({ text: w, why: 'Pets warning' })),
      ...(v.lab.ready.length ? [{ text: `Open lab tank(s) ${[...new Set(v.lab.ready.map((r) => r.tank))].join(', ')}`, why: 'a tier level is waiting; Research EXP only runs for the open tank' }] : []),
      ...v.lab.buy.slice(0, 2).map((b) => ({ text: `Lab: ${b.name} tier ${b.slot} → Lv${b.level + 1}`, why: `${NX.sci(b.cost)} ${vname(b.vessel)}, ${b.odds}% odds; ${b.gives}` })),
      ...(v.eggsWaiting > v.free && v.trash.length ? [{ text: `Trash ${Math.min(v.eggsWaiting - v.free, v.trash.length)} pet(s), starting with ${v.trash[0]!.pet.name} L${v.trash[0]!.pet.level}`, why: `frees slots for ${v.eggsWaiting} waiting eggs (heuristic, see Pets tab)` }] : []),
    ].slice(0, 5)
  }}
