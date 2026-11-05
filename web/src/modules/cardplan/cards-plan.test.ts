import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { fullSave } from '../../test-save.test'
import { cardSettings, cardsModel, cardsPlan, DEFAULTS, guide, linksOfSection, PHASE, ROLLS_KEY, WEIGHTS_KEY } from './cards-plan'
import { DECK_LINKS_KEY } from '../cards/cards-calc'

const brief = (p: ReturnType<typeof cardsPlan>) => ({
  missing: p.missing.map((r) => [r.id, r.status, r.hours, +r.value.toFixed(6)]),
  farm: p.steps.farm.map((s) => [s.stop, s.cards.map((r) => r.id), s.hours, s.total]),
  boss: p.steps.boss.map((s) => [s.stop, s.pay!.readyIn, s.hours]),
  decks: [p.farmFight.total, p.farmFight.now, p.farmCrusade.total, p.farmCrusade.factor],
})

test('cardsPlan: same plan on the plain save and the reactive proxy Vue passes; reusing the model changes nothing', async () => {
  const s = await fullSave(), p = cardsPlan(s)
  expect(p.missing.length).toBeGreaterThan(0)
  expect(p.steps.farm.length).toBeGreaterThan(0)
  let t = 0
  for (const st of p.steps.farm) { t += st.hours; expect(st.total).toBeCloseTo(t, 9) } // running total
  expect(brief(cardsPlan(reactive(s)))).toEqual(brief(p))
  expect(brief(cardsPlan(s, DEFAULTS, cardsModel(s, {})))).toEqual(brief(p))
})

test('cardsPlan: settings drive the times and the values', async () => {
  const s = await fullSave(), p = cardsPlan(s), z = p.missing.find((r) => r.src?.kind === 'zone' && r.hours != null)!
  const fast = cardsPlan(s, { ...DEFAULTS, rollsPerHour: 2 * DEFAULTS.rollsPerHour }).missing.find((r) => r.id === z.id)!
  expect(fast.hours!).toBeCloseTo(z.hours! / 2, 9)
  const c = p.missing.find((r) => r.src?.kind === 'crusade' && r.hours != null)!
  expect(cardsPlan(s, { ...DEFAULTS, crusadeRunSec: 6 }).missing.find((r) => r.id === c.id)!.hours!).toBeCloseTo(2 * c.hours!, 9)
  // all-zero priorities: no card is worth anything
  const zero = Object.fromEntries(cardsModel(s, {}).data.decks.map((d) => [d.deck, {}]))
  expect(cardsPlan(s, { ...DEFAULTS, weights: zero }).missing.every((r) => r.value === 0)).toBe(true)
})

test('cardSettings: defaults without storage, stored values when present, junk ignored', () => {
  const g = globalThis as { localStorage?: unknown }, had = g.localStorage
  try {
    delete g.localStorage
    expect(cardSettings()).toEqual(DEFAULTS)
    const store: Record<string, string> = { [ROLLS_KEY]: '9000', [WEIGHTS_KEY]: '{"3":{"TotalDamage":2}}', [DECK_LINKS_KEY]: 'not json', 'idle-skilling.cards.crusadeRunSec': '-1' }
    g.localStorage = { getItem: (k: string) => store[k] ?? null }
    expect(cardSettings()).toEqual({ weights: { 3: { TotalDamage: 2 } }, rollsPerHour: 9000, crusadeRunSec: 3, links: {} })
  } finally { g.localStorage = had }
})

// The guide's 'Idle Crus./Bot. Spd.' deck is two unrelated bonuses: split into a link-5 build and an entry-deck build.
test('Idle Crusaders and Botany speed cap are separate builds', async () => {
  expect(linksOfSection('Idle Crusaders')).toEqual([5])
  expect(linksOfSection('Botany speed cap')).toEqual([])
  expect(guide.sections['Idle Crus./Bot. Spd.']).toBeUndefined()
  const m = cardsModel(await fullSave(), {})
  expect(m.sectionWeights('Idle Crusaders').InactiveCrusaders).toBeGreaterThan(0)
  expect(m.sectionWeights('Idle Crusaders').MAXlBotanySpdUpgrades).toBeUndefined()
  expect(m.sectionWeights('Botany speed cap')).toEqual({ MAXlBotanySpdUpgrades: 1 })
  expect(guide.sections['Botany speed cap']![PHASE]!.every((c) => /Pot Speed/.test(c.bonus))).toBe(true)
})

// Decks follow the deck links unless none applies (the author, 2026-10-23).
test('builds: one per deck link with its variants; specials carry no link', async () => {
  const m = cardsModel(await fullSave(), {})
  expect(m.linkBuilds.map((b) => b.link)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  for (const b of m.linkBuilds) expect(b.variants.every((v) => v.link === b.link && v.group === 'link')).toBe(true)
  const by = (l: number) => m.linkBuilds.find((b) => b.link === l)!.variants.map((v) => v.label)
  expect(by(8)).toEqual(['Combined', 'Spiriting', 'Summoning']) // Limbo: one build, its sections as variants
  expect(by(5)).toEqual(['Combined', 'Tinkering', 'Idle Crusaders'])
  expect(by(9)).toEqual(['Combined', 'Damage', 'Cash', 'Crusade', 'Card farming: zone fights', 'Card farming: crusade fights'])
  expect(by(12)).toEqual(['Spelunking', 'Card collecting: spelunk cards'])
  // Smithing / Fishing drops the ascension/rebirth cards; Tilling counts crop cards
  const w = (l: number) => m.linkBuilds.find((b) => b.link === l)!.variants[0]!.w
  expect(w(7).SoulsKept ?? w(7).BPgainMisc).toBeUndefined()
  expect(w(7).FishGained).toBeGreaterThan(0)
  expect(Object.keys(w(2)).some((k) => / crop %$/.test(k)) || m.owned.every((c) => c.type !== 'CropsGained')).toBe(true)
  expect(m.specials.map((s) => s.label)).toEqual(['Ascension', 'Rebirth'])
  // Botany speed cap is a variant of the Botany (link 3) build (the author, 2026-10-23).
  expect(m.linkBuilds.find((b) => b.link === 3)!.variants.map((v) => v.label)).toEqual(['Botany', 'Botany speed cap'])
  expect(m.specials.every((s) => s.link === 0 && s.group === 'special')).toBe(true)
})
