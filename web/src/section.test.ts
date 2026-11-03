import { expect, test } from 'bun:test'
import { nextTick } from 'vue'

test('sectionRef reads ?section= and writes the picked tab back; setParam clears it', async () => {
  let href = 'http://x/?tab=pets&section=trekking'
  Object.assign(globalThis, {
    location: { get href() { return href }, get search() { return new URL(href).search } },
    history: { state: null, replaceState: (_s: unknown, _t: string, u: URL) => { href = String(u) } },
  })
  const { sectionRef, setParam } = await import('./section')
  const sec = sectionRef(['hatchery', 'trekking', 'research'] as const)
  expect(sec.value).toBe('trekking')
  sec.value = 'research'
  await nextTick()
  expect(href).toBe('http://x/?tab=pets&section=research')
  setParam('section', null); setParam('tab', 'cards')
  expect(href).toBe('http://x/?tab=cards')
})

// #2586: every section id a page had before a merge still opens a tab (its own, or the one that now holds it).
const OLD_SECTIONS: Record<keyof typeof import('./section').SECTION_ALIASES, [file: string, ids: string[]]> = {
  realm: ['Realm.vue', ['guide', 'bosses', 'barn', 'shrine', 'orb', 'coins', 'stats', 'plan', 'buildings', 'loadouts', 'purple', 'traits', 'reference', 'trophies']],
  cards: ['Cards.vue', ['decks', 'level', 'missing', 'collection', 'bonus', 'builds']],
}
test('old ?section= ids resolve to a current tab', async () => {
  const { SECTION_ALIASES } = await import('./section')
  for (const [page, [file, old]] of Object.entries(OLD_SECTIONS)) {
    const src = await Bun.file(`${import.meta.dir}/components/${file}`).text()
    const ids = [...src.match(/const SECTIONS = (\[.*\]) as const/)![1]!.matchAll(/\['(\w+)', '/g)].map((m) => m[1])
    const alias: Record<string, string> = SECTION_ALIASES[page as keyof typeof SECTION_ALIASES]
    for (const id of old) expect(ids).toContain(alias[id] ?? id)
    for (const to of Object.values(alias)) expect(ids).toContain(to)
  }
})

test('sectionRef follows an alias and rewrites ?section=', async () => {
  let href = 'http://x/?tab=realm&section=guide'
  Object.assign(globalThis, {
    location: { get href() { return href }, get search() { return new URL(href).search } },
    history: { state: null, replaceState: (_s: unknown, _t: string, u: URL) => { href = String(u) } },
  })
  const { sectionRef, SECTION_ALIASES } = await import('./section')
  expect(sectionRef(['plan', 'bosses'] as const, SECTION_ALIASES.realm).value).toBe('bosses')
  expect(href).toBe('http://x/?tab=realm&section=bosses')
})
