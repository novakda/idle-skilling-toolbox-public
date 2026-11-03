import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { doNext } from './do-next'

const d = `${import.meta.dir}/../../data/`
const file = existsSync(d + 'fixture-save.json') ? 'fixture-save.json' : 'save.json'
const json = async (p: string) => (existsSync(d + p) ? Bun.file(d + p).json() : null)

test(`do next: every section runs on ${file}; sections with logic give an item`, async () => {
  const sections = doNext(await Bun.file(d + file).json(), { impacts: await json('perk-impacts.json'), combat: await json('realm-combat.json') })
  expect(sections.map((s) => s.view)).toEqual(['afk', 'codex', 'shrines', 'cards', 'potions', 'botany', 'fishing', 'gems', 'ascend', 'perks', 'realm', 'contracts', 'smithing', 'pets'])
  for (const s of sections) {
    expect(s.error, s.title).toBeUndefined()
    // smithing: empty is a valid answer (no item past its cap on this fixture); smithing-caps.test.ts covers it
    if (s.items !== null && s.view !== 'smithing') expect(s.items.length, s.title).toBeGreaterThanOrEqual(1)
  }
})

test('do next: a throwing page shows as unavailable, not a blank tab', () => {
  const boom = new Proxy({}, { get: () => { throw new Error('bad save') } }) as Record<string, unknown>
  const sections = doNext(boom)
  expect(sections.filter((s) => s.items !== null).every((s) => s.error)).toBe(true)
  expect(sections.filter((s) => s.items === null).map((s) => s.title)).toEqual([])
})

test.skipIf(!existsSync(d + 'save.json'))('do next: Cards gives the first farm stops on save.json', async () => {
  const cards = doNext(await Bun.file(d + 'save.json').json()).find((s) => s.view === 'cards')!
  expect(cards.error).toBeUndefined()
  expect(cards.items!.length).toBeGreaterThanOrEqual(1)
  expect(cards.items!.length).toBeLessThanOrEqual(3)
  for (const i of cards.items!) { expect(i.text).toStartWith('Farm '); expect(i.why).toContain('total so far') }
})

test(`do next: Ascend opens with the ascend and rebirth calls, each with its evidence (${file})`, async () => {
  const a = doNext(await Bun.file(d + file).json(), { impacts: await json('perk-impacts.json'), ascendHistory: (await json('ascend-history.json')) ?? [] }).find((s) => s.view === 'ascend')!
  expect(a.items![0]!.text).toMatch(/^(Ascend|Wait to ascend)/)
  expect(a.items![1]!.text).toMatch(/^(Rebirth|Wait to rebirth)/)
  for (const i of a.items!.slice(0, 2)) expect(i.sub!.rows.map((r) => r[0])).toEqual(expect.arrayContaining(['Reward now', 'Rate', 'Loses']))
})
