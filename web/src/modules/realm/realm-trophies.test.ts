import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { BUNDLE } from '../../../../src/game-eval'
import { realmTrophies } from '../../../../src/realm-trophies'
import { DATA } from './realm'
import { offeredBy, TROPHY_RULES, trophyRows, uniqueRoute } from './realm-trophies'
import { fullSave } from '../../test-save.test'

// Every cited offset is a trophyprogress call for that row, and the condition right before it is the one the rule states.
test.skipIf(!existsSync(BUNDLE))('trophy rules cite the game code that moves each row', () => {
  const b = readFileSync(BUNDLE) // offsets are bytes
  const at = (o: number, n: number) => b.subarray(o, o + n).toString('latin1')
  for (const [k, r] of Object.entries(TROPHY_RULES)) {
    const i = +k
    if (r.kind === 'never') { expect(b.includes(`trophyprogress(${i},`)).toBe(false); continue }
    for (const o of [...r.at.matchAll(/@(\d+)/g)].map((m) => +m[1]!))
      expect(at(o, 20)).toStartWith(i >= 40 && i < 64 ? 'trophyprogress(a,' : `trophyprogress(${i},`)
    const before = (o: number) => b.subarray(o - 900, o).toString('latin1')
    const o = +r.at.match(/@(\d+)/)![1]!
    if (r.kind === 'speed') expect(before(o)).toMatch(new RegExp(`${r.sec}>[^;]*${r.n! - 1}<[^;]*$`))
    if (r.kind === 'boss' && !/kill/.test(r.at)) expect(before(o).slice(-700)).toContain(`${r.rule.includes('−') ? +r.rule.match(/− (\d+)/)![1]! : r.n! - 1}<(null==(e=b.engine.getGameAttribute("RealmStuff")[6])`)
  }
  expect(at(6603171 - 120, 120)).toContain('Math.round(40+t)') // rows 40-63: 40 + t, t < 24
})

test('chains: each locked row names the row that offers it', () => {
  expect(offeredBy(27)).toBe(25); expect(offeredBy(29)).toBe(27); expect(offeredBy(66)).toBe(38); expect(offeredBy(39)).toBe(66)
  expect(offeredBy(8)).toBe(9) // special case @6787600
  expect(offeredBy(67)).toBe(-1); expect(offeredBy(64)).toBe(-1)
  expect(DATA.trophies.length).toBe(68)
})

// The 60-unique route on a save: it reaches 60, every step ends on a missing id by its evolution path, and slots add up.
test.skipIf(!existsSync(BUNDLE))('60 unique minion types: the route reaches 60 with the slots it has', async () => {
  for (const save of [await fullSave(), ...(existsSync('data/save.json') ? [await Bun.file('data/save.json').json()] : [])]) {
    const tc = realmTrophies(save), rs = save.RealmStuff
    const ids = new Set((rs[3] as unknown[][]).filter((x) => x[0] !== 'none').map((x) => x[0]))
    expect(tc.distinct).toBe(ids.size); expect(tc.unique).toBe(ids.size + Number(rs[11].i ?? 0))
    expect(tc.need).toBe(Math.max(0, 60 - tc.unique))
    expect(new Set(tc.steps.map((s) => s.target)).size).toBe(tc.steps.length)
    if (tc.missing.length >= tc.need) expect(tc.unique + tc.steps.length).toBeGreaterThanOrEqual(60)
    for (const s of tc.steps) {
      expect(tc.missing).toContain(s.target); expect(s.path.at(-1)).toBe(s.target)
      for (let k = 1; k < s.path.length; k++) expect(DATA.minions[s.path[k]!]!.parent).toBe(s.path[k - 1]!)
      if (s.kind === 'summon') expect(DATA.minions[s.path[0]!]!.parent).toBeNull()
    }
    const summons = tc.steps.filter((s) => s.kind === 'summon').length
    expect(tc.banish.length + tc.banishShort).toBe(Math.max(0, summons - tc.free))
    expect(uniqueRoute(tc).length).toBe(tc.banish.length + tc.steps.length)
    expect(tc.cost).toBeCloseTo(tc.steps.reduce((t, s) => t + s.cost, 0), 6)
    // Read back: claimed rows are the -9s; row 32 shows the same count the game stores.
    const rows = trophyRows(save, { trophies: tc } as never)
    expect(rows.filter((r) => r.status === 'claimed').length).toBe((rs[24] as number[]).filter((v) => v === -9).length)
    if (rs[24][32] >= 0) expect(rs[24][32]).toBe(tc.unique)
  }
}, 60_000)
