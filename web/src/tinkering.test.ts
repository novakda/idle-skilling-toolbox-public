import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { baseCosts, boosterEV, BOOSTERS, craftExp, crafts, craftsTo, decks, kind, lines, lvReq, MUTATORS, name, nextReq, recipe, slotsMax, LINK } from './tinkering'
import { cbonus, type Catalog } from './cards-calc'
import { equipmentBonuses, masteryBonuses } from './load-bonuses'
import catalog from './data/card-catalog.json'
import wiki from '../../data/wiki/datasets/tinkering.json'

const capture = (day: string) => new URL(`../../data/captures/${day}/crusade/attrs.json`, import.meta.url).pathname
// Tinkering level 55 (2026-10-03) and 56 (2026-10-09), local captures, gitignored.
const C03 = capture('2026-10-03'), C09 = capture('2026-10-09')
const C = (s: Record<string, unknown>) => cbonus(s, catalog as unknown as Catalog, LINK)

test('stored values: base costs, the selected item\'s cost, slot count, card bonuses of the link-5 deck', async () => {
  for (const s of [await fullSave(), ...(await Promise.all([C03, C09].filter(existsSync).map((p) => Bun.file(p).json())))]) {
    // The stored copies date from the last Tinkering visit; the cards then were the link-5 deck's.
    if (s.CbonusTinkeringEXP) expect(C(s).CbonusTinkeringEXP).toBe(s.CbonusTinkeringEXP)
    expect(baseCosts(s)).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Pearl'].map((t) => s[`${t}BaseCost`]))
    if (!s.EquipmentSelected) continue // nothing picked since the scene opened
    const r = recipe(s, s.EquipmentSelected)
    expect([0, ...r.mats.map((x) => x.qty), r.prev?.qty ?? 0]).toEqual(s.TinkeringCost)
    expect([0, ...r.mats.map((x) => x.id), r.prev?.id ?? 0]).toEqual(s.TinkeringCostCurrency)
    expect(slotsMax(s)).toBe(s.EquipmentSlotsMAX)
  }
})

test.skipIf(!existsSync(C03) || !existsSync(C09))('level-up requirement: level 55 (10-03) → 56 (10-09)', async () => {
  const a = await Bun.file(C03).json(), b = await Bun.file(C09).json()
  expect([a.TinkeringLV, b.TinkeringLV]).toEqual([55, 56])
  expect(nextReq(a.TinkeringREQ, 56)).toBe(b.TinkeringREQ)
})

test('equipped gear lines add up to the stored Ebonus totals', async () => {
  const s = await fullSave(), sum: Record<string, number> = {}
  for (const id of (s.EquipmentEquipped as number[]).slice(1, 9)) for (const l of lines(s, id)) if (l.on) sum[l.t] = (sum[l.t] ?? 0) + l.v
  const E = equipmentBonuses(s).scalar
  for (const [t, v] of Object.entries(sum)) if (`Ebonus${t}` in E) expect(v / E[`Ebonus${t}`]!).toBeCloseTo(1, 12)
  expect(decks(s)[0]!.slots.map((x) => x.id).filter(Boolean).sort()).toEqual((s.EquipmentEquipped as number[]).slice(1, 9).filter(Boolean).sort())
})

test('names and unlock levels match the wiki tables (row i of a section = id 10·section + i + 1)', () => {
  const rows = (wiki as any[]).filter((r) => r._section !== 'Materials')
  expect(rows).toHaveLength(70)
  rows.forEach((r, i) => {
    const id = i + 1, img = (r._images[0] as string).replace(/\.png$/, '').replace(/_/g, ' ').toLowerCase()
    // The wiki spells a few differently (Gaurd, Cheist, "Blobulytes equip", Booster1/Mutator1); the level column is lvReq, or 1 for 0.
    if (!/gaurd|cheist|equip|booster|mutator/.test(img)) expect(name(id).toLowerCase().replace(/'/g, '')).toBe(img.replace(/'/g, ''))
    expect(Math.max(lvReq(id), 1)).toBe(r.Level)
    expect(kind(id)).toBe(({ Weapons: 'Weapon', Helmets: 'Helmet', Shirts: 'Shirt', Pants: 'Pants', 'Off-hands': 'Off-hand', Pendants: 'Pendant' } as any)[r._section] ?? (id > 65 ? 'Mutator' : 'Booster'))
  })
})

// ---- The game's own code in the sandbox (dev only: needs the extracted bundle).
const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const scene31 = () => src.indexOf('"scripts.SceneEvents_31"')
const at = (needle: string, from = 0) => { const i = src.indexOf(needle, from); if (i < 0) throw new Error(`anchor moved: ${needle}`); return i }
/** `p` (Stencyl's script utils) with the given methods; everything else absorbs calls. */
const P = (m: Record<string, unknown>) => new Proxy(m, { get: (t, k: string) => (k in t ? t[k] : inert) })

test.skipIf(!src)('cost block (ActorEvents_1007) equals recipe(), all 70 items, two card setups', async () => {
  const fn = matchBraces(src, src.lastIndexOf('function(t)', at('n=260*Math.max(')))
  const s = await fullSave(), K = ['Common', 'Uncommon', 'Rare'].map((t) => `Cbonus${t}CostReductionTink`)
  for (const red of [K.map((k) => n(C(s)[k])), [37, 55, 95]]) for (let id = 1; id <= 70; id++) {
    const A: Record<string, any> = { ...Object.fromEntries(K.map((k, i) => [k, red[i]])), EquipmentSelected: id, TinkeringCost: [0, 0, 0, 0], TinkeringCostCurrency: [0, 0, 0, 0] }
    ;(compile(fn, A) as Function)()
    const B = [260, 90, 20].map((b, i) => b * Math.max(1 - red[i]! / 100, 0.1)).concat([10, 5, 2])
    expect(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Pearl'].map((t) => A[`${t}BaseCost`])).toEqual(B)
    const r = recipe(s, id, B)
    expect([0, ...r.mats.map((x) => x.qty), r.prev?.qty ?? 0]).toEqual(A.TinkeringCost)
    expect([0, ...r.mats.map((x) => x.id), r.prev?.id ?? 0]).toEqual(A.TinkeringCostCurrency)
  }
})

test.skipIf(!src)('craft click (SceneEvents_31 region 30) pays craftExp() × min(amount, 10000), every EXP band', async () => {
  const s = await fullSave()
  const fn = matchBraces(src, src.indexOf('function', at('addMouseOverActorListener(p.getRegion(30)', scene31())))
  for (const id of [21, 11, 48, 9, 57, 60]) for (const L of [10, 50, 56, 70, 85, 120]) for (const amount of [1, 3, 20000]) {
    const r = recipe(s, id), t = { ...s, TinkeringLV: L }
    const A: Record<string, any> = { ...structuredClone(s), CbonusTinkeringEXP: C(s).CbonusTinkeringEXP, TinkeringLV: L, ConquestPageSelected: 8,
      EquipmentSelected: id, TinkerCraftMulti: amount, CraftTypeAmountTink: 2,
      TinkeringCost: [0, r.mats[0]!.qty, r.mats[1]!.qty, r.prev?.qty ?? 0], TinkeringCostCurrency: [0, r.mats[0]!.id, r.mats[1]!.id, r.prev?.id ?? 0],
      CraftingMaterialsOwned: Array(106).fill(1e12), EquipmentOwned: Array(104).fill(1e9) }
    const e0 = A.TinkeringEXP
    ;(compile(fn, A, { a: { wrapper: { enabled: true } }, p: P({}) }) as Function)(5, 0)
    expect(`${id} ${L} ${amount} ${((A.TinkeringEXP - e0) / (craftExp(t, id) * Math.min(amount, 1e4))).toFixed(9)}`).toBe(`${id} ${L} ${amount} 1.000000000`)
    expect(1e12 - A.CraftingMaterialsOwned[r.mats[0]!.id]).toBe(r.mats[0]!.qty * amount)
    expect(A.EquipmentOwned[id] - 1e9).toBe(amount)
    if (r.prev) expect(1e9 - A.EquipmentOwned[r.prev.id]).toBe(r.prev.qty * amount)
  }
})

test.skipIf(!src)('booster roll (region 39): success threshold, base bonus and mutator range equal boosterEV()\'s inputs', async () => {
  const s = await fullSave()
  const fn = matchBraces(src, src.indexOf('function', at('addMouseOverActorListener(p.getRegion(39)', at('addMouseOverActorListener(p.getRegion(39)', scene31()) + 1)))
  const bonus = Math.min(Math.max(100 * (masteryBonuses(s)[15]! - 1), 0), 8)
  for (let b = 1; b <= 5; b++) for (const m of [0, 1, 5]) for (const side of [-1e-6, 1e-6]) for (const mutRoll of ['lo', 'hi'] as const) {
    const [chance, base] = BOOSTERS[b - 1]!, q = chance + bonus + side
    const A: Record<string, any> = { ...structuredClone(s), CbonusBoosterChance: 0, MasteryBonuses: masteryBonuses(s), ConstructLV: Array(80).fill(0),
      ConquestPageSelected: 6, EquipmentSelected: 7, UpgradeType: [0, b, m ? 5 + m : 0, 0, 0], EquipmentSlotsMAX: 5, EquipmentSlotsUsed: Array(90).fill(0),
      EquipmentBonusPct: Array(90).fill(0), EquipmentOwned: Array(104).fill(100), GoBackButtonCooldown: -1, UpgradeSystemChosen: 1, CrusadeTutoralPart: 99 }
    const p = P({ randomFloatBetween: () => q, randomInt: (lo: number, hi: number) => (lo === 0 && hi === 99 ? 99 : mutRoll === 'lo' ? lo : hi) })
    ;(compile(fn, A, { a: { wrapper: { enabled: true }, _customBlock_CalculatePrimStatTotals() {} }, p }) as Function)(5, 0)
    const mult = m ? MUTATORS[m - 1]![mutRoll === 'lo' ? 0 : 1] / 10 : 1
    expect(A.EquipmentBonusPct[7]).toBeCloseTo(side < 0 ? base * mult : 0, 9)
    expect(A.EquipmentSlotsUsed[7]).toBe(1)
  }
  // With nothing else in play, the expectation is P(success) · base · mean mutator.
  const t = { ...s, ConstructLV: [] }
  expect(boosterEV(t, 5, 2)).toBeCloseTo(((15 + bonus + n(C(s).CbonusBoosterChance)) / 100) * 250 * 1.1, 9)
})
const n = (v: unknown) => Number(v ?? 0) || 0

test('route: crafts to the next unlock are what craftsTo prices, and a richer stock makes the best route affordable', async () => {
  const s = await fullSave(), c = crafts(s)
  expect(c.next!.lv).toBeGreaterThan(s.TinkeringLV)
  for (const r of c.route) expect(r.crafts).toBeLessThanOrEqual(craftsTo(s, r.id, c.next!.lv))
  const rich = { ...s, CraftingMaterialsOwned: (s.CraftingMaterialsOwned as number[]).map((q) => q * 1e3 + 1e6) }
  expect(crafts(rich).route[0]!.enough).toBe(true)
})

// #2769: deck swap suggestions on a small made-up save (one Crusades-linked deck: tinker deck 1 = DeckLinkList[12]).
test('deckSwaps: gain, equip rules, no-op when optimal', async () => {
  const { deckSwaps } = await import('./tinkering')
  const save = (deck: Record<number, number>, own: number[], extra: Record<string, unknown> = {}) => {
    const list = Array(9).fill(0), owned = Array(71).fill(0)
    for (const [slot, id] of Object.entries(deck)) list[+slot] = id
    for (const id of own) owned[id] = 1
    owned[56] = 0.3 // Worm Ruff: a fraction of a copy is not held (equip needs > 0.5)
    return { TinkerDecksOWNED: 1, TinkerDeckSelected: 1, DeckLinkList: [...Array(12).fill(0), 5], EquipmentbyDeckList: list, EquipmentOwned: owned, ...extra }
  }
  // Pendant slot holds Carrot Charms (+10% Crusade EXP, base values: no booster bonus here); you also hold Gheist Pearls (+25%), Blood Screamer (a weapon, no
  // Crusades stat) and a fraction of Worm Ruff.
  const [d] = deckSwaps(save({ 8: 51 }, [51, 52, 5]))
  expect(d!.swaps.map((x) => [x.slot, x.from, x.to])).toEqual([[8, 51, 52]])
  expect(d!.swaps[0]!.gain).toBeCloseTo(Math.log(1.25 / 1.1), 9)
  expect(d!.swaps[0]!.delta).toEqual([{ t: 'CrusadeEXP', v: 15 }])
  expect(d!.all).toEqual(d!.swaps)
  // Second pendant slot: never the same pendant twice. Slot 8 has Gheist Pearls; Divination Eye (+250%) goes in the empty slot 4.
  const [p] = deckSwaps(save({ 8: 52 }, [51, 52, 55], { SecondPendantSlotPurchased: 1 }))
  expect(p!.all.map((x) => [x.slot, x.to])).toEqual([[4, 55]])
  expect(p!.gain).toBeCloseTo(Math.log(3.75 / 1.25), 9)
  // Only Gheist Pearls and Carrot Charms held: slot 4 gets Carrot Charms, not a second Gheist Pearls.
  expect(deckSwaps(save({ 8: 52 }, [51, 52], { SecondPendantSlotPurchased: 1 }))[0]!.swaps.map((x) => [x.slot, x.to])).toEqual([[4, 51]])
  // Already the best you hold: nothing to suggest. Unlinked deck: no goal.
  const [o] = deckSwaps(save({ 8: 52 }, [51, 52, 5]))
  expect([o!.swaps, o!.all, o!.gain]).toEqual([[], [], 0])
  expect(deckSwaps({ ...save({ 8: 51 }, [52]), DeckLinkList: [] })[0]!.goal).toBeNull()
})
