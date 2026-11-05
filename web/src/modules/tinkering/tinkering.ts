// Tinkering (#31): crafting gear from crusade materials in the Crusades14 scene (SceneEvents_31, its Tinkering page is
// ConquestPageSelected 8, boosters page 6). Every formula is ported from Qno2x.js (offsets †) and checked in
// tinkering.test.ts against values a save stores or the game's own code in the sandbox; everything is computed from the save.
// Items: 1-60 gear (10 per kind, see KINDS), 61-65 Booster I-V, 66-70 Mutator I-V (recipes, names: src/derive-tinkering.ts).
import data from '../../data/tinkering.json'
import equipment from '../../data/equipment.json'
import catalog from '../../data/card-catalog.json'
import { cbonus, LINKS, type Catalog } from '../cards/cards-calc'
import { masteryBonuses } from '../../bus'
import { fightStats } from '../fighting/fighting'
import { totalCrusaders, withCrusade } from '../crusade/crusade'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const D = data as unknown as { name: Record<string, string>; lvReq: number[]; recipe: Record<string, [number, number, number, number][]> }

/** The Tinkering scene's init equips the card and tinker decks linked to activity 5 († @22890216, 20 ms after entry). */
export const LINK = 5
export const name = (id: number) => D.name[id] ?? `item ${id}`
export const lvReq = (id: number) => n(D.lvReq[id])
export const KINDS = ['Weapon', 'Helmet', 'Shirt', 'Pants', 'Off-hand', 'Pendant'] as const
export const kind = (id: number) => (id > 65 ? 'Mutator' : id > 60 ? 'Booster' : KINDS[Math.floor((id - 1) / 10)]!)
/** EquipmentEquipped slot per kind (equip click, region 28 † @22959725): weapon 1, off-hand 2, helmet 5, shirt 6, pants 7,
 *  pendant 8, and 4 for the second pendant once SecondPendantSlotPurchased. Slot 3 is never written. */
export const SLOT: Record<string, number> = { Weapon: 1, 'Off-hand': 2, Helmet: 5, Shirt: 6, Pants: 7, Pendant: 8 }
export const SLOT_ORDER = [1, 5, 6, 7, 2, 8, 4]

/** Stat names as the wiki writes them; FLAT stats and Crusaders are counts, the rest %. */
const LABEL: Record<string, string> = { BaseDmgFLAT: 'Base Damage', Claw: 'Claw Damage', MonsterGold: 'Monster Cash', CritChance: 'Crit Chance',
  NestSpd: 'Nest Speed', IdleSpeed: 'Idle Speed', SpelunkerDig: 'Spelunker Dig Down Amount', IdleDMG: 'Idle Damage', FlowerGain: 'Flowers Gained per Botany Level',
  TotalDmgPCT: 'Total Damage', TillEXPgain: 'Tilling EXP per H2O Level', Meteor: 'Meteor Damage', FlowerPotEXP: 'Flower Pot EXP', Smite: 'Smite Damage',
  CropLandGain: 'Crop Land EXP', IgnDefFLAT: 'Ignore Defense', SpelunkerSpd: 'Spelunker Speed', TotalHpPCT: 'Total HP', CrusadeMulti: 'Crusade Multiplier',
  CritDMG: 'Crit Damage', NewFlower: 'New Flower Odds', Crusaders: 'Crusaders', Energy: 'Fight Bonus', RiftEXP: 'Rift EXP', BaseHpFLAT: 'Base HP',
  NewPets: 'New Pet Odds', IgnDefPCT: 'Ignore Defense', Accuracy: 'Accuracy', MiningEXP: 'Mining EXP', Fishing: 'Fish Caught', ResearchExp: 'Research EXP',
  SpelunkerLearn: 'Spelunker Learning Rate', ShieldRech: 'Shield Regen', CardChance: 'Card Chance', ShieldMax: 'Max Shields', StrengthEXP: 'Away Str EXP',
  CrusadeEXP: 'Crusade EXP', OreMined: 'Ores Mined', TrekkingSpd: 'Trekking Speed', BotanySpd: 'Botany Grow Speed', CropGain: 'Crops Gained per Tilling Level',
  BrewSpd: 'Brew Speed', Vessels: 'Vessel Gain', PetDamage: 'Pet Damage', AllSkillDMG: 'All Skill Damage', AsylumGain: 'Asylum Traces', Poison: 'Poison Damage' }
const COUNT = new Set(['BaseDmgFLAT', 'BaseHpFLAT', 'IgnDefFLAT', 'Crusaders'])
export const statText = (t: string, v: number) => `+${+v.toPrecision(4)}${COUNT.has(t) ? '' : '%'} ${LABEL[t] ?? t}`

type Item = { t1: string; v1: number; t2: string; v2: number; t3: string; k: number }
/** An item's lines as load-bonuses.ts equipmentBonuses() counts them: value × (1 + EquipmentBonusPct/100) × (1 + shrine 2/100);
 *  the third line only once TinkerThirdLine[id] is set. */
export function lines(s: Save, id: number) {
  const it = (equipment as Record<string, Item>)[id]
  if (!it) return []
  const m = (1 + n(arr(s, 'EquipmentBonusPct')[id]) / 100) * (1 + n(arr(s, 'ShrineLevels')[2]) / 100), third = n(arr(s, 'TinkerThirdLine')[id]) > 0
  return [{ t: it.t1, v: it.v1 * m, on: true }, { t: it.t2, v: it.v2 * m, on: true }, { t: it.t3, v: it.k * m, on: third }]
}

// ---- Crafting ------------------------------------------------------------------------------------------------------------
/** Tier base costs (ActorEvents_1007 † @2562585): Common 260, Uncommon 90, Rare 20 × max(1 − card cost reduction/100, 0.1)
 *  (cards of the link-5 deck), Epic 10, Legendary 5, Pearlescent 2. */
export function baseCosts(s: Save) {
  const C = cbonus(s, catalog as unknown as Catalog, LINK), r = (k: string) => Math.max(1 - n(C[`Cbonus${k}CostReductionTink`]) / 100, 0.1)
  return [260 * r('Common'), 90 * r('Uncommon'), 20 * r('Rare'), 10, 5, 2]
}
/** One craft of item id: two materials and (from tier 2) qty copies of the previous-tier item. Each material cost is
 *  round(k · base[tier] − c), the cost block's own statement (tier −1: a literal). */
export function recipe(s: Save, id: number, B = baseCosts(s)) {
  const r = D.recipe[id]!
  const mats = r.slice(0, 2).map(([m, t, k, c]) => ({ id: m, qty: Math.round((t < 0 ? 0 : k * B[t]!) - c) }))
  const [prev, pq] = r[2] as unknown as [number, number]
  return { mats, prev: pq > 0 ? { id: prev, qty: pq } : null }
}
export const owned = (s: Save, id: number) => n(arr(s, 'EquipmentOwned')[id])
/** Crafts you can afford: the craft click (region 30 † @22929505) needs each material ≥ cost × amount and the previous-tier
 *  item's copies − 1 ≥ qty × amount (one copy always stays). */
export function maxCrafts(s: Save, id: number) {
  const r = recipe(s, id), mat = arr(s, 'CraftingMaterialsOwned')
  let m = Math.min(...r.mats.map((x) => (x.qty > 0 ? Math.floor(n(mat[x.id]) / x.qty) : Infinity)))
  if (r.prev) m = Math.min(m, Math.floor((owned(s, r.prev.id) - 1) / r.prev.qty))
  return Math.max(m, 0)
}

/** EXP divisor of the REQ term by level band (craft click † @22937974-@22952654): < 43, < 55, < 69, < 80, < 92, else. */
const BANDS: [number, number][] = [[43, 3e5], [55, 5e5], [69, 12e5], [80, 6e7], [92, 12e7], [Infinity, 12e8]]
/** Levels whose level-up zeroes the EXP instead of carrying the overflow (level-up † @23029288). */
export const RESET = new Set([43, 55, 69, 80, 92])
const w = (c: number, e: number) => Math.ceil(Math.ceil(c / 16) ** e / 8) * (1 + (c / 16 - Math.floor(c / 16)) / 16)
/** EXP multiplier of one craft (same block): (1 + MTXdoubleTinkeringEXP)·(1 + 10%·SkillLevels[45])·(1 + CbonusTinkeringEXP/100)
 *  ·(1 + 25%·ContractRank[51]). The card bonus is the link-5 deck's. */
export function expMult(s: Save) {
  return (1 + n(s.MTXdoubleTinkeringEXP)) * (1 + (10 * n(arr(s, 'SkillLevels')[45])) / 100)
    * (1 + n(cbonus(s, catalog as unknown as Catalog, LINK).CbonusTinkeringEXP) / 100) * (1 + (25 * n(arr(s, 'ContractRank')[51])) / 100)
}
/** Tinkering EXP of one craft of gear id (ids ≤ 60 and level ≤ 199 only) at level L with requirement REQ:
 *  (10·(w(c1) + w(c2)) + REQ/band · 10^⌈c1/16⌉)·expMult, c1/c2 = the material ids, w(c) = ⌈⌈c/16⌉^e/8⌉·(1 + (c/16 − ⌊c/16⌋)/16),
 *  e = 9.5 below level 92, 8 from 92 († @22952654).
 *  A click of `amount` crafts pays that × min(amount, 10000), so crafting more than 10000 at once wastes EXP. */
export function craftExp(s: Save, id: number, L = n(s.TinkeringLV), REQ = n(s.TinkeringREQ)) {
  if (id > 60 || L > 199) return 0
  const [c1, c2] = D.recipe[id]!.map((x) => x[0]) as [number, number]
  const e = L < 92 ? 9.5 : 8
  return (10 * (w(c1, e) + w(c2, e)) + (REQ / BANDS.find(([b]) => L < b)![1]) * 10 ** Math.ceil(c1 / 16)) * expMult(s)
}
/** EXP to clear level L: REQ·(1 − min(GiftShopLevels[31]/5, 50)/100) (level-up † @23029288, bar @17847312). */
export const need = (s: Save, REQ: number) => REQ * (1 - Math.min(n(arr(s, 'GiftShopLevels')[31]) / 5, 50) / 100)
/** TinkeringREQ after a level-up to L: 1.3312·REQ + 100·⌊L/10⌋ + 4.3·L^1.8 († @23029288). */
export const nextReq = (req: number, L: number) => 1.3312 * req + 100 * Math.floor(L / 10) + 4.3 * L ** 1.8

/** Crafts of item id needed to reach level `to` from the save, crafting at most one level's worth per click (each craft is
 *  priced at the level and requirement it is made at; a click that spans levels pays the old rate for all of it).
 *  ponytail: per-level loop, fine to level 199. */
export function craftsTo(s: Save, id: number, to: number) {
  let L = n(s.TinkeringLV), REQ = n(s.TinkeringREQ), E = n(s.TinkeringEXP), crafts = 0
  for (; L < to; ) {
    const u = craftExp(s, id, L, REQ)
    if (u <= 0) return Infinity
    const k = Math.max(Math.ceil((need(s, REQ) - E) / u), 0)
    crafts += k; E += k * u - need(s, REQ); L++; REQ = nextReq(REQ, L)
    if (RESET.has(L)) E = 0
  }
  return crafts
}

/** The next locked recipes: the lowest level requirement above your level, and the items it opens. */
export function nextUnlock(s: Save) {
  const L = n(s.TinkeringLV), reqs = Array.from({ length: 70 }, (_, i) => i + 1).filter((id) => lvReq(id) > L)
  const lv = Math.min(...reqs.map(lvReq))
  return Number.isFinite(lv) ? { lv, items: reqs.filter((id) => lvReq(id) === lv) } : null
}

/** What k crafts of item id take: materials and previous-tier copies (one copy of each stays), crafting any missing copies
 *  first, down the chain. `ok` false when a missing copy's recipe is still locked. */
export function bill(s: Save, id: number, k: number, mats = new Map<number, number>(), copies = new Map<number, number>(), made = new Map<number, number>()): { mats: Map<number, number>; copies: Map<number, number>; made: Map<number, number>; ok: boolean } {
  const r = recipe(s, id)
  let ok = true
  for (const x of r.mats) mats.set(x.id, (mats.get(x.id) ?? 0) + x.qty * k)
  if (r.prev) {
    const want = r.prev.qty * k, have = Math.max(Math.floor(owned(s, r.prev.id) - 1), 0), use = Math.min(want, have), make = want - use
    copies.set(r.prev.id, use)
    if (make > 0) {
      made.set(r.prev.id, make)
      ok = lvReq(r.prev.id) <= n(s.TinkeringLV) && bill(s, r.prev.id, make, mats, copies, made).ok
    }
  }
  return { mats, copies, made, ok }
}

export type Craft = { id: number; crafts: number; made: Map<number, number>; use: number; worst: number; enough: boolean }
/** What to craft next. Objective (the wiki: recipes unlock with Tinkering level; gear, once crafted, stays equippable):
 *  1. `fresh`: unlocked gear you have never crafted (StarRank 0 and no copy) that you can afford: one craft adds new gear;
 *  2. `route`: reach the next recipe unlock using the smallest bite of any one material: per unlocked gear recipe, the crafts
 *     to that level (craftsTo) and everything they take (bill, previous-tier copies crafted as needed), scored by the largest
 *     share of any one material held (`use`, ≤ 1 = you hold enough). The previous-tier crafts earn EXP too; they are counted at
 *     today's rate, so a chained route is if anything a little cheaper than shown. */
export function crafts(s: Save) {
  const L = n(s.TinkeringLV), mat = arr(s, 'CraftingMaterialsOwned'), next = nextUnlock(s)
  const fresh: number[] = [], route: Craft[] = []
  for (let id = 1; id <= 60; id++) {
    if (lvReq(id) > L) continue
    if (owned(s, id) < 0.5 && n(arr(s, 'EquipmentStarRank')[id]) < 1 && maxCrafts(s, id) >= 1) fresh.push(id)
    if (!next) continue
    // Fewest crafts k whose own EXP plus the EXP of the previous-tier copies crafted for them (at today's rate, which only
    // grows with level) covers the k0 crafts craftsTo prices: k·u + Σ made·u_i ≥ k0·u.
    const k0 = craftsTo(s, id, next.lv), u = craftExp(s, id)
    if (!Number.isFinite(k0)) continue
    const exp = (k: number) => k * u + [...bill(s, id, k).made].reduce((t, [i, q]) => t + q * craftExp(s, i), 0)
    let lo = 0, hi = k0
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (exp(m) >= k0 * u) hi = m; else lo = m }
    const k = k0 && exp(lo) >= k0 * u ? lo : hi, b = bill(s, id, k)
    if (!b.ok) continue
    let use = 0, worst = 0
    for (const [m, q] of b.mats) { const u = q / Math.max(n(mat[m]), 1e-9); if (u > use) { use = u; worst = m } }
    route.push({ id, crafts: k, made: b.made, use, worst, enough: use <= 1 })
  }
  route.sort((a, b) => a.use - b.use)
  return { fresh, route, next }
}

// ---- Decks ---------------------------------------------------------------------------------------------------------------
/** Tinker decks: 8 slots each in EquipmentbyDeckList[8(d − 1) + slot]; deck d's link is DeckLinkList[11 + d] (the decks panel,
 *  regions 50-58 † @23135138: link d needs CardDeckLinksOwned ≥ d). A scene equips the deck linked to its activity; with none,
 *  the deck you last picked stays on everywhere. Both lists are local-only (a Steam Cloud save lacks them). */
export function decks(s: Save) {
  const list = arr(s, 'EquipmentbyDeckList'), links = arr(s, 'DeckLinkList'), sel = n(s.TinkerDeckSelected)
  return Array.from({ length: Math.max(n(s.TinkerDecksOWNED), 1) }, (_, i) => {
    const d = i + 1, link = n(links[11 + d])
    const slots = SLOT_ORDER.map((slot) => ({ slot, id: n(d === sel && !list.length ? arr(s, 'EquipmentEquipped')[slot] : list[8 * i + slot]) }))
    return { d, link, linkName: LINKS[link] ?? null, selected: d === sel, slots }
  })
}
export const localOnly = (s: Save) => !Array.isArray(s.EquipmentbyDeckList) || !Array.isArray(s.DeckLinkList)

// ---- Deck suggestions (#2769) --------------------------------------------------------------------------------------------
/** Fight stats: the zone, crusade, raid and Asylum fight scenes (SceneEvents_9/32/16/41) read these Ebonus values, and the
 *  damage/HP totals they use read TotalDmgPCT and Claw in shared code († @2641998, @8432177) and ShieldRech († @8792522). */
const FIGHT = ['BaseDmgFLAT', 'TotalDmgPCT', 'Claw', 'CritChance', 'CritDMG', 'IdleSpeed', 'IdleDMG', 'Meteor', 'Smite', 'Poison', 'AllSkillDMG',
  'IgnDefPCT', 'Accuracy', 'BaseHpFLAT', 'TotalHpPCT', 'ShieldMax', 'ShieldRech']
/** What a tinker deck is for: the gear stats its linked activity reads (getGameAttribute("Ebonus…") in the scenes that equip
 *  that link, as src/derive-activity-bonuses.ts counts card bonuses). Link 5's scenes (Tinkering, crusade map) read every stat
 *  for the stats panel and fight preview; what they use is the claim (crusade.ts withCrusade: Crusade EXP, Multiplier,
 *  Crusaders). Link 9 also pays crusade-fight EXP (@23364895, CrusadeMulti beside it), monster cash and card drops.
 *  Guessed, no scene read: Flower Pot EXP (read in an actor, @3429062) for Botany, Asylum Traces for Boss Looting (the Asylum
 *  scene equips link 10), the Spelunker stats for Spelunking. Left out, no total to price them against: max crusade energy
 *  (Energy, link 5), flat Ignore Defense (fights) and the HP lines the Potions scene reads. */
export const GOAL: Record<number, string[]> = {
  1: ['StrengthEXP'], 2: ['CropGain', 'TillEXPgain', 'CropLandGain'], 3: ['NewFlower', 'BotanySpd', 'FlowerGain', 'FlowerPotEXP'],
  4: ['BrewSpd'], 5: ['CrusadeEXP', 'CrusadeMulti', 'Crusaders'], 6: ['OreMined', 'MiningEXP'],
  7: ['StrengthEXP', 'Fishing'], 8: ['RiftEXP'], 9: [...FIGHT, 'MonsterGold', 'CardChance', 'CrusadeEXP', 'CrusadeMulti'],
  10: [...FIGHT, 'MonsterGold', 'AsylumGain'], 11: ['NestSpd', 'NewPets', 'Vessels', 'ResearchExp', 'TrekkingSpd', 'PetDamage'],
  12: ['SpelunkerSpd', 'SpelunkerLearn', 'SpelunkerDig'],
}
/** Fight stats priced by the fight model itself (fighting.ts fightStats: one hit's damage with crit, and max HP). */
const MODELED = new Set(['BaseDmgFLAT', 'TotalDmgPCT', 'CritChance', 'CritDMG', 'BaseHpFLAT', 'TotalHpPCT'])
export const deltaText = (t: string, v: number) => (v < 0 ? statText(t, -v).replace('+', '−') : statText(t, v))
export type Swap = { slot: number; from: number; to: number; gain: number; delta: { t: string; v: number }[] }
type Slots = { slot: number; id: number }[]

/** How good a set of gear is for a goal: ln of the product of the multipliers it gives. A % stat counts as its own factor
 *  1 + total/100 (the game multiplies most gear totals in separately, e.g. Crusade EXP (1 + EbonusCrusadeEXP/100), crusade.ts
 *  expMult; an approximation where it adds into a sum instead). Crusaders: (others + gear) / others, others from
 *  totalCrusaders. Fight links: the damage and HP stats through the fight model (hit × crit factor, max HP), so a flat
 *  +1.26M base damage counts for what it is next to the rest of your damage. So the gain of a swap reads as ×(1 + x)
 *  on "everything this deck's activity reads, multiplied together", every stat weighed alike. */
function valuer(s: Save, link: number, goal: string[], fight: (eq: number[]) => { dmg: number; hp: number } | null) {
  const others = totalCrusaders({ ...withCrusade(s), EbonusCrusaders: 0 })
  return (slots: Slots) => {
    const tot: Record<string, number> = {}
    for (const x of slots) for (const l of x.id ? lines(s, x.id) : []) if (l.on && goal.includes(l.t)) tot[l.t] = (tot[l.t] ?? 0) + l.v
    const f = link === 9 || link === 10 ? fight(slots.map((x) => x.id)) : null
    let v = f ? Math.log(f.dmg) + Math.log(f.hp) : 0
    for (const t of goal) {
      if (f && MODELED.has(t)) continue
      v += t === 'Crusaders' ? Math.log((others + (tot[t] ?? 0)) / Math.max(others, 1)) : COUNT.has(t) ? 0 : Math.log(1 + (tot[t] ?? 0) / 100)
    }
    return { v, tot }
  }
}

/** Suggested replacements per deck, ranked by that gain. Equip rules (equip click, region 28 † @22959725): only gear you hold
 *  (EquipmentOwned > 0.5), each kind in its own slot, the two pendant slots never the same pendant. `swaps`: the best single
 *  swap per slot, best first; `all`: the swaps together, picked greedily (best swap, then the best on top of it, until none
 *  gains), since slots sharing a stat interact. Unlinked decks have no goal. */
export function deckSwaps(s: Save) {
  const have = Array.from({ length: 60 }, (_, i) => i + 1).filter((id) => owned(s, id) > 0.5), pend2 = n(s.SecondPendantSlotPurchased) > 0
  // The fight model on a save wearing `eq` (slot order SLOT_ORDER), tinker links cleared so raidDecks keeps it on.
  const links = arr(s, 'DeckLinkList').map((v, i) => (i > 11 ? 0 : v))
  const fight = (ids: number[]) => {
    const eq = [...arr(s, 'EquipmentEquipped')]
    SLOT_ORDER.forEach((slot, i) => (eq[slot] = ids[i] ?? 0))
    const f = fightStats({ ...s, EquipmentEquipped: eq, DeckLinkList: links })
    return 'missing' in f ? null : { dmg: f.DPS * (1 + (f.CriticalChance / 100) * (f.CriticalDamage - 1)), hp: f.HPmax }
  }
  return decks(s).map((d) => {
    const goal = GOAL[d.link]
    if (!goal) return { d: d.d, goal: null, swaps: [] as Swap[], all: [] as Swap[], gain: 0 }
    const V = valuer(s, d.link, goal, fight)
    const fits = (slot: number) => have.filter((id) => id <= 60 && SLOT[kind(id)] === (slot === 4 ? 8 : slot))
    const cur: Slots = d.slots.map((x) => ({ ...x, id: x.slot === 4 && !pend2 ? 0 : x.id }))
    const swap = (state: Slots, slot: number, to: number): Swap => {
      const next = state.map((x) => (x.slot === slot ? { slot, id: to } : x)), a = V(state), b = V(next)
      return { slot, from: state.find((x) => x.slot === slot)!.id, to, gain: b.v - a.v,
        delta: [...new Set([...Object.keys(b.tot), ...Object.keys(a.tot)])].map((t) => ({ t, v: (b.tot[t] ?? 0) - (a.tot[t] ?? 0) })).filter((x) => Math.abs(x.v) > 1e-9) }
    }
    const best = (state: Slots, slot: number) => {
      const id = state.find((x) => x.slot === slot)!.id, other = state.find((x) => x.slot === (slot === 8 ? 4 : slot === 4 ? 8 : -1))?.id
      return fits(slot).filter((c) => c !== id && c !== other).map((c) => swap(state, slot, c)).sort((x, y) => y.gain - x.gain)[0]
    }
    const open = cur.filter((x) => x.slot !== 4 || pend2).map((x) => x.slot)
    const swaps = open.flatMap((slot) => { const b = best(cur, slot); return b && b.gain > 1e-9 ? [b] : [] }).sort((x, y) => y.gain - x.gain)
    const all: Swap[] = []
    for (let state = cur, i = 0; i < 20; i++) {
      const b = open.map((slot) => best(state, slot)).filter((x): x is Swap => !!x).sort((x, y) => y.gain - x.gain)[0]
      if (!b || b.gain <= 1e-9) break
      all.push(b); state = state.map((x) => (x.slot === b.slot ? { slot: b.slot, id: b.to } : x))
    }
    // A slot swapped twice keeps one entry: from its original item to its last.
    const merged = open.flatMap((slot) => { const xs = all.filter((x) => x.slot === slot); return xs.length ? [{ ...xs.at(-1)!, from: xs[0]!.from, gain: xs.reduce((a, x) => a + x.gain, 0) }] : [] })
    return { d: d.d, goal, swaps, all: merged.sort((x, y) => y.gain - x.gain), gain: all.reduce((a, x) => a + x.gain, 0) }
  })
}

// ---- Boosters (upgrades) -------------------------------------------------------------------------------------------------
/** Booster I-V (items 61-65): success chance % and base bonus %. Mutator I-V (66-70): ×randomInt(a, b)/10 on success, mean
 *  (a + b)/20. Boosters page, the second region-39 listener († @22975366, roll @22981775) and the mutator rolls († @22993269-@22998906). */
export const BOOSTERS = [[90, 10], [70, 25], [50, 50], [30, 100], [15, 250]] as const
export const MUTATORS = [[8, 13], [7, 15], [6, 18], [5, 21], [3, 25]] as const
/** Booster slots per item: 5 + ⌊ConstructLV[42]⌋ (scene init † @22890216). */
export const slotsMax = (s: Save) => 5 + Math.floor(n(arr(s, 'ConstructLV')[42]))
/** Expected bonus % one booster b (1-5) adds, with mutator m (1-5, or 0 for none): a roll U(0, 100) succeeds when it is
 *  ≤ chance + CbonusBoosterChance (link-5 deck) + min(max(100·(MasteryBonuses[15] − 1), 0), 8); on success the base bonus,
 *  ×(1 + CombatLV/100) with chance 3·ConstructLV[33]% († after @22981775), × the mutator, is added to EquipmentBonusPct
 *  († @22999864). The slot is used either way. Safety Charm, Lucky Donut, Booster Genesis and the Chaotic/Benign mutator
 *  charms (UpgradeType 11-15) are left out. */
export function boosterEV(s: Save, b: number, m = 0) {
  const [chance, base] = BOOSTERS[b - 1]!
  const bonus = n(cbonus(s, catalog as unknown as Catalog, LINK).CbonusBoosterChance) + Math.min(Math.max(100 * (masteryBonuses(s)[15]! - 1), 0), 8)
  const p = Math.min(Math.max((chance + bonus) / 100, 0), 1), c33 = 1 + (Math.min(3 * n(arr(s, 'ConstructLV')[33]), 100) / 100) * (n(s.CombatLV) / 100)
  const mut = m ? (MUTATORS[m - 1]![0] + MUTATORS[m - 1]![1]) / 20 : 1
  return p * base * c33 * mut
}
/** The best booster (+ mutator) per slot you hold `count` of each. */
export function bestBooster(s: Save, count = 1) {
  let best = { b: 0, m: 0, ev: 0 }
  for (let b = 1; b <= 5; b++) {
    if (owned(s, 60 + b) < count) continue
    for (let m = 0; m <= 5; m++) {
      if (m && owned(s, 65 + m) < count) continue
      const ev = boosterEV(s, b, m)
      if (ev > best.ev) best = { b, m, ev }
    }
  }
  return best
}
export type Upgrade = { id: number; what: string; pct: number; gain: number; grow: number; cost: string; best: ReturnType<typeof bestBooster> }
/** Upgrades for gear on any deck. Objective: how much every line of that item grows (its lines scale with
 *  1 + EquipmentBonusPct/100), so items with different stats compare. Free slots: fill them with the best booster you hold.
 *  Full slots: a reset (3 copies of the item, region 40 † @22973232, needs > 3.5 owned) clears slots and bonus to 0, then 5
 *  fresh boosters; only listed when its expected bonus beats the current one. Expected values: a gamble, not a promise. */
export function upgrades(s: Save): Upgrade[] {
  const ids = [...new Set(decks(s).flatMap((d) => d.slots.map((x) => x.id)).filter((id) => id > 0 && id <= 60))]
  const max = slotsMax(s), out: Upgrade[] = []
  for (const id of ids) {
    const pct = n(arr(s, 'EquipmentBonusPct')[id]), free = max - n(arr(s, 'EquipmentSlotsUsed')[id])
    const tag = (b: ReturnType<typeof bestBooster>, k: number) => `${k} × ${name(60 + b.b)}${b.m ? ` + ${name(65 + b.m)}` : ''}`
    if (free > 0) {
      const b = bestBooster(s, free)
      if (b.ev > 0) out.push({ id, what: `Fill ${free} free slot${free > 1 ? 's' : ''}`, pct, gain: free * b.ev, grow: 0, cost: tag(b, free), best: b })
    } else if (owned(s, id) > 3.5) {
      const b = bestBooster(s, max)
      if (max * b.ev > pct) out.push({ id, what: `Reset, then ${max} boosters`, pct, gain: max * b.ev - pct, grow: 0, cost: `3 copies + ${tag(b, max)}`, best: b })
    }
  }
  for (const u of out) u.grow = (1 + (u.pct + u.gain) / 100) / (1 + u.pct / 100) - 1
  return out.sort((a, b) => b.grow - a.grow)
}

/** Third lines (region 60 † @23127199): gear 1-30 needs Tunnel building ConstructLV[19] (Tink Time), 31-60 ConstructLV[34]
 *  (Tinkolicious), at least 2k − 1 − 9⌊(k + 10)/16⌋ for k = (id − 1) % 10 + 1, plus a large material cost (not ranked). */
export function thirdLineNeed(s: Save, id: number) {
  const k = ((id - 1) % 10) + 1, lv = 2 * k - 1 - 9 * Math.floor((k + 10) / 16), b = id <= 30 ? 19 : 34
  return { building: id <= 30 ? 'Tink Time' : 'Tinkolicious', lv, have: n(arr(s, 'ConstructLV')[b]) }
}
