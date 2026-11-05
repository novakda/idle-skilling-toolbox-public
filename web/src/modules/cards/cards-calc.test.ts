import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { BUNDLE, blockHost, compile, loadBundle, matchBraces } from '../../../../src/game-eval'
import { fullSave } from '../../test-save.test'
import { buildCards, cardMaxLevel, cbonus, deckFor, petLinkDeck, PET_LINK, FOIL, FOIL_BOSSES, type Catalog } from './cards-calc'
import catalog from '../../data/card-catalog.json'
import globals from '../../data/card-globals.json'

test('Foil Cards raises max level to 6 per id range', () => {
  expect(cardMaxLevel(5, 0, 0)).toBe(5)
  expect(cardMaxLevel(5, 1, 0)).toBe(6)
  expect(cardMaxLevel(31, 1, 0)).toBe(5) // range 31-60 needs Foil 2
  expect(cardMaxLevel(17, 10, 0)).toBe(5) // 17-30 is never foiled
  expect(cardMaxLevel(510, 10, 0)).toBe(6)
  expect(cardMaxLevel(151, 10, 0)).toBe(5) // boss cards ignore Foil Cards
  expect(cardMaxLevel(151, 0, 1)).toBe(6)
  expect(cardMaxLevel(154, 0, 1)).toBe(5) // 154-156 needs Foil Bosses 2
  expect(cardMaxLevel(286, 0, 8)).toBe(6)
  expect(cardMaxLevel(5, 0, 8)).toBe(5) // Foil Bosses doesn't touch normal cards
})

// The game's own card upgrade-button draw listener († @3034866) in the sandbox: the button shows while the selected card is
// below its max level, so a card's max is the first level at which the button hides.
const bundle = `${import.meta.dir}/../../../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
test.skipIf(!src)('card max level matches the upgrade-button listener for normal, Foil Cards and Foil Bosses cards', () => {
  const at = src.indexOf('(function(a,n,r,i){if(t.wrapper.enabled){for(a=b.engine.gameAttributes,null!=e.aa15?a.setReserved("aa15",0)')
  if (at < 0) throw new Error('anchor moved')
  const draw = matchBraces(src, at + 1)
  const gameMax = (id: number, foil: number, bosses: number) => {
    for (let L = 1; ; L++) {
      let hidden = false
      const A = { CardSelected: id, CardLevels: Object.assign(Array(600).fill(0), { [id]: L }), ConstructLV: Object.assign(Array(80).fill(0), { 8: foil, 21: bosses }) }
      ;(compile(draw, A, { t: { wrapper: { enabled: true }, actor: { disableActorDrawing: () => (hidden = true) } } }) as Function)(0, 0, 0, 0)
      if (hidden) return L
    }
  }
  const ids = [1, 16, 17, 30, 31, 60, 100, 137, 150, 151, 153, 154, 160, 162, 163, 270, 271, 274, 275, 283, 286, 287, 300, 361, 510, 511]
  for (const [a, b] of [...FOIL, ...FOIL_BOSSES]) ids.push(a!, b!)
  for (const id of ids) for (const foil of [0, 1, 5, 10]) for (const bosses of [0, 1, 4, 5, 8])
    expect([id, foil, bosses, cardMaxLevel(id, foil, bosses)]).toEqual([id, foil, bosses, gameMax(id, foil, bosses)])
})

test('cbonus reproduces every stored Cbonus value (deck + passive cards + potion transforms)', async () => {
  const save = await fullSave()
  const c = cbonus(save, catalog as unknown as Catalog)
  // CbonusShieldChargePCT is set by a fight actor (0.5 while fighting), not by cards.
  for (const k of Object.keys(save).filter((k) => k.startsWith('Cbonus') && k !== 'CbonusShieldChargePCT' && typeof save[k] === 'number')) expect(c[k] ?? 0).toBeCloseTo(save[k], 6)
})

test('crop cards add k*level % to their own crop, unscaled by CardBonusTOTAL (Tilling yield code)', () => {
  const levels: number[] = []; levels[301] = 3; levels[313] = 2
  const d = buildCards({ CardLevels: levels, CardBonusTOTAL: 2, CardEquipped: [301, 313], CardDecksOWNED: 1 }, catalog as unknown as Catalog)
  expect(d.decks[0]!.totals).toEqual({ 'Dirt crop %': 9, 'Macromato crop %': 12 })
})

test('petLinkDeck: best owned Skill Points cards, at most one deck, sorted; an empty link gains the whole total', async () => {
  const s = await fullSave(), p = petLinkDeck(s, catalog as unknown as Catalog)
  const sp = (c: { adds: Record<string, number> }) => c.adds.SkillPoints ?? 0
  expect(p.cards.length).toBeLessThanOrEqual(buildCards(s, catalog as unknown as Catalog).slots)
  p.cards.forEach((c, i) => { expect(sp(c)).toBeGreaterThan(0); if (i) expect(sp(c)).toBeLessThanOrEqual(sp(p.cards[i - 1]!)) })
  const unlinked = petLinkDeck({ ...s, DeckLinkList: ((s.DeckLinkList as number[]) ?? []).map((l) => (l === PET_LINK ? 0 : l)) }, catalog as unknown as Catalog)
  expect(unlinked.linked).toBeNull(); expect(unlinked.linkedTotal).toBe(0)
})

// The game's own CalculateCardBonusTotals on `save` with deck 1 = `deck` (Cbonus zeroed first: the calc adds onto them),
// vs cbonus() on the same save. A passive card counts in the calc's tail whether equipped or not, and its deck value
// once more when equipped, so the catalog must hold only the equipped extra.
const SKIP = new Set(['CbonusShieldChargePCT']) // set by a fight actor, not by cards
function vsGame(save: Record<string, any>, deck: number[]) {
  const a = { ...structuredClone(save), CardEquipped: [...deck, ...((save.CardEquipped as number[]) ?? []).slice(10)], CardDeckSelected: 1, CardDecksOWNED: Math.max(1, Number(save.CardDecksOWNED ?? 0)) }
  const keys = Object.keys(a).filter((k) => k.startsWith('Cbonus') && !SKIP.has(k) && typeof a[k] === 'number')
  const ours = cbonus(a, catalog as unknown as Catalog)
  for (const k of Object.keys(a)) if (k.startsWith('Cbonus')) a[k] = Array.isArray(a[k]) ? a[k].map(() => 0) : 0
  ;(blockHost(src, a) as any)._customBlock_CalculateCardBonusTotals(deck)
  return keys.filter((k) => Math.abs((ours[k] ?? 0) - a[k]) > 1e-6 * Math.max(1, Math.abs(a[k]))).map((k) => [k, ours[k] ?? 0, a[k]])
}

test.skipIf(!src)('cbonus matches the game with each passive card equipped at levels 1-6 (CardBonusTOTAL 1.5)', async () => {
  const save = { ...(await fullSave()), CardBonusTOTAL: 1.5 }
  for (const p of globals.passives) for (let lv = 1; lv <= 6; lv++) {
    const s = { ...save, CardLevels: Object.assign([...save.CardLevels], { [p.card]: lv }) }
    expect([p.card, lv, vsGame(s, [p.card, ...Array(9).fill(0)])]).toEqual([p.card, lv, []])
  }
}, 60_000)

test.skipIf(!src)('cbonus matches the game on a real deck holding a passive card (Forpaque 459 at level 4)', async () => {
  const save = await fullSave(), sel = Number(save.CardDeckSelected ?? 1)
  const deck = (save.CardEquipped as number[]).slice(10 * (sel - 1), 10 * sel).filter((id) => id !== 459).slice(0, 9).concat(459)
  expect(vsGame({ ...save, CardLevels: Object.assign([...save.CardLevels], { 459: 4 }) }, deck)).toEqual([])
})

test('level-up value counts a passive card\'s passive gain, on top of the equipped gain when it is in a deck', async () => {
  const { levelValue } = await import('../cardplan/cards-plan')
  const card = (id: number, adds: Record<string, number>, next: Record<string, number> | null, decks: number[]) => ({ id, level: 2, adds, next, decks }) as never
  const w = [{ deck: 1, w: { AsylumTraces: 1, StrEXPchance: 1 } }]
  const tie = levelValue(card(490, {}, {}, []), 2, w, {}) // 6 per level, x2 multiplier; nothing when equipped
  expect(tie).toBe(12)
  const p = globals.passives.find((x) => x.card === 271)!, key = p.key.slice(6)
  const passive = ((p.values[3]! - p.values[2]!) / p.div) * (p.scaled ? 2 : 1)
  const both = levelValue(card(271, { [key]: 10 }, { [key]: 14 }, [1]), 2, w, {})
  expect(both).toBeCloseTo(passive + 4)
  expect(levelValue(card(271, { [key]: 10 }, { [key]: 14 }, []), 2, w, {})).toBeCloseTo(passive)
})

// #2623: Spelunking-page cards have no scalar Cbonus (the game adds their card-map value into CbonusTunnels[i], unscaled), so the
// catalog was empty for them and a deck of them totalled nothing.
test('Spelunking cards 541-545 add their bonus (unscaled) in a deck', () => {
  const levels: number[] = []; levels[541] = 4; levels[542] = 2; levels[543] = 2; levels[544] = 2; levels[545] = 2
  const d = buildCards({ CardLevels: levels, CardBonusTOTAL: 2, CardEquipped: [541, 542, 543, 544, 545], CardDecksOWNED: 1 }, catalog as unknown as Catalog)
  expect(d.decks[0]!.totals).toEqual({ SpelunkerSpeed: 20, SpelunkEXP: 20, TunnelCardChance: 10, BuildSpeed: 8, LearnSpeed: 4 })
})

// #2623: the scenes only swap to a card deck (DeckLinkList[1..11]) linked to them; with none linked (Fighting's 9 sits at index
// 12 = a tinker deck) the selected deck stays on.
test('deckFor: the linked deck, else the selected one', () => {
  const decks = [{ deck: 1, link: 4, active: false }, { deck: 2, link: 0, active: true }]
  expect(deckFor(decks, 4)?.deck).toBe(1)
  expect(deckFor(decks, 9)?.deck).toBe(2)
})

test('builds match the deck by purpose (its link), not deck number (#2655, the author 2026-10-23)', async () => {
  const { deckForBuild } = await import('./cards-calc')
  const d = (deck: number, link: number, cards: number[], active = false) => ({ deck, link, active, cards })
  const decks = [d(1, 4, [1, 2, 3]), d(9, 4, [1, 2, 3, 4], true), d(2, 10, [5, 6, 7]), d(10, 9, [5, 6, 7, 8]), d(11, 1, [20])]
  expect(deckForBuild(decks, [1, 2, 3, 4], 4).deck?.deck).toBe(9) // two Potions decks: the one holding the most
  expect(deckForBuild(decks, [5, 6, 7, 8], 10).deck?.deck).toBe(2) // Boss Looting stays on its own deck, not All Combat's
  expect(deckForBuild(decks, [30, 31], 2).deck).toBeNull() // no deck linked, nothing shared: a spare deck
  expect(deckForBuild(decks, [5, 6, 7, 8], 0).deck?.deck).toBe(10) // a special (no link): the closest deck
  expect(deckForBuild(decks, [1, 40, 41], 0).deck).toBeNull() // under 3 shared: no deck holds it yet
})
