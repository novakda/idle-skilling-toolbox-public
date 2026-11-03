import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { BUNDLE, compile, loadBundle } from '../../src/game-eval'
import { ASCEND_RESET, ascendPlan, contracts, WINDOW } from './contracts'
import { fullSave } from './test-save.test'
import { doNext } from './do-next'

const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''

test('contracts: board/slot mapping, failed vs complete, rank-dependent Deprived Raiding', () => {
  const rank = Array(57).fill(0), prog = Array(57).fill(0)
  rank[22] = 8; prog[22] = -1 // Unskilled Kills failed
  rank[21] = 3                // Deprived Raiding at rank B: don't level Attack
  rank[1] = 10; prog[1] = -1  // maxed beats -1
  prog[32] = -1               // Cerebral contract: Rebirth to retry
  const rows = contracts({ ContractRank: rank, ContractProgress: prog, ContractSelected: 6 })
  const by = (i: number) => rows[i - 1]!
  expect(rows).toHaveLength(36)
  expect(by(17)).toMatchObject({ name: 'Broken Forge', board: 'Insane', confidence: 'verified' })
  expect(by(22)).toMatchObject({ name: 'Unskilled Kills', board: 'Regal', status: 'failed', retry: 'Ascend', selected: true, rankName: 'SSSS' })
  expect(by(21).fails).toStartWith("Don't level Attack.")
  expect(by(1).status).toBe('complete')
  expect(by(32).retry).toBe('Rebirth')
  expect(by(13)).toMatchObject({ fails: null, confidence: 'none', selected: false })
})

const blank = () => ({ ContractRank: Array(57).fill(0), ContractProgress: Array(57).fill(0), ContractSelected: 1 })

test('ascend plan: holds first, 5-minute window next, 14 skipped when the window needs kills', () => {
  const s = blank()
  for (const i of [20, 21]) s.ContractRank[i] = 10 // done: drop out of the plan
  const { steps, skipped, rebirth } = ascendPlan(contracts(s))
  expect(steps.map((x) => x.when)).toEqual(['From the Ascend', '0:00-5:00', 'Then, any order', 'After that'])
  expect(steps[0]!.ids).toEqual([17, 22]) // 14 skipped, 21 maxed
  expect(steps[1]!.ids).toEqual([23, 24]) // 19 needs the Fishing tree nodes, which fail 22: an either/or
  expect(steps[2]!.ids).toEqual([22, 17])
  expect(skipped[0]!.ids).toEqual([14])
  expect(rebirth[0]!.ids).toEqual([33, 31, 32, 34])
  // 14 goes before any kill when no window contract needs kills.
  s.ContractRank[23] = s.ContractRank[24] = 10
  const p = ascendPlan(contracts(s))
  expect(p.skipped).toEqual([])
  // 14 and 19 both need tree nodes (Mining, Fishing) that fail 22: they move into the choice.
  expect(p.steps.map((x) => x.ids)).toEqual([[14, 17, 22], [22, 17], []])
  expect(p.choices.map((c) => [c.a.ids, c.b.ids])).toEqual([[[19, 14], [22]]])
  expect(p.choices[0]!.a.text).toContain('Unlock Fishing')
  // With 22 already maxed, 19 is in the window again, with its nodes named.
  s.ContractRank[22] = 10
  const q = ascendPlan(contracts(s))
  expect(q.choices).toEqual([])
  expect(q.steps.find((x) => x.when === '0:00-5:00')!.text).toContain('Unlock the Endurance Fields, then Unlock Fishing')
  expect(q.steps.find((x) => x.when === '0:00-5:00')!.text).toContain('19: catch fish 5. In Fishing, click the hook up to 6')
  s.ContractRank[22] = 0
  s.ContractRank[21] = 4
  expect(ascendPlan(contracts(s)).steps[0]!.text).toContain('no Strength level-ups')
})

test("game code: Ascend resets ASCEND_RESET; Multibuy fails exactly WINDOW past 300 s", () => {
  if (!src) return console.warn("game bundle missing: skipped")
  const at = src.indexOf('ContractProgress")[14]=0', 20903900)
  expect([...src.slice(at - 40, at + 500).matchAll(/ContractProgress"\)\[(\d+)\]=0/g)].map((m) => +m[1]!)).toEqual(ASCEND_RESET)
  const m = src.indexOf('300<b.engine.getGameAttribute("TimeSinceAscention")&&(b.engine.getGameAttribute("ContractProgress")[24]=-1')
  const expr = src.slice(m, src.indexOf(')', src.indexOf('[20]=-1', m)) + 1)
  for (const t of [300, 301]) {
    const a: Record<string, unknown> = { TimeSinceAscention: t, ContractProgress: Array(37).fill(0) }
    compile(`function(){ return ${expr} }`, a)()
    const failed = (a.ContractProgress as number[]).flatMap((v, i) => (v === -1 ? [i] : []))
    expect(failed).toEqual(t > 300 ? [...WINDOW].sort((x, y) => x - y) : [])
  }
})

test('stored values: no open contract in the save meets its fail condition without already being -1', async () => {
  const s = await fullSave()
  const rows = contracts(s)
  expect(rows.filter((r) => r.doomed)).toEqual([])
  if (s.TimeSinceAscention > 300) for (const i of WINDOW) if (s.ContractRank[i] < 10) expect(s.ContractProgress[i]).toBe(-1)
  if (s.IceCream === 1 && s.ContractRank[34] < 10) expect(s.ContractProgress[34]).toBe(-1)
  if (s.TimeSinceAscention2 > 180 && s.ContractRank[33] < 10) expect(s.ContractProgress[33]).toBe(-1)
  expect(contracts(reactive(s))).toEqual(rows) // the page passes a reactive proxy
  expect(ascendPlan(contracts(reactive(s)))).toEqual(ascendPlan(rows))
})

test('do next: fresh Ascend shows the plan, later the failed list', () => {
  const s = { ...blank(), TimeSinceAscention: 60 }
  const sec = () => doNext(s).find((x) => x.view === 'contracts')!.items!
  expect(sec()[0]!.text).toStartWith('From the Ascend:')
  expect(sec().map((i) => i.text.split(':')[0])).toEqual(['From the Ascend', '0', 'Then, any order', 'Option A', 'Option B', 'This Ascend'])
  s.TimeSinceAscention = 400
  s.ContractProgress[19] = -1
  expect(sec().map((i) => i.text)).toContain('Speed Mining (Insane) will fail')
  expect(sec().some((i) => i.text.endsWith(' failed'))).toBe(true)
})

// ---- Contract and board names against the game's own text (#2641).
test.skipIf(!src)('all 36 contract names are game strings, in game order; the last three board names too', () => {
  const rows = contracts({ ContractRank: Array(57).fill(0), ContractProgress: Array(57).fill(0), ContractSelected: 1 })
  const flat = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '')
  // the board draws "NAME_" and "NAME_COMPLETE" in index order (@16078400 Monster Madness … @16937828 Solar Flare); Unskilled Kills has no COMPLETE string
  const titles = [...src.matchAll(/"([A-Z][A-Z0-9_.)!']+)_"/g)].map((m) => [flat(m[1]!), m.index!] as const)
  let prev = 16_000_000
  for (const r of rows) {
    const hit = titles.find(([t, o]) => t === flat(r.name) && o > prev - 1)
    expect(hit, r.name).toBeDefined()
    prev = hit![1]
  }
  for (const b of ['UNGODLY', 'CEREBRAL', 'LAVATHIAN']) expect(src).toContain(`"${b}_CONTRACT"`)
})

test('rows carry the board number and ContractRequirement as the target for the current rank', () => {
  const save = { ContractRank: [0, 2, 10], ContractProgress: [0, 40, 5], ContractRequirement: [0, 100, 0], ContractSelected: 1 }
  const [a, b] = contracts(save)
  expect(a).toMatchObject({ i: 1, boardNo: 1, progress: 40, required: 100, status: 'open' })
  expect(b).toMatchObject({ i: 2, boardNo: 1, required: null, status: 'complete' }) // 0 = unset
  expect(contracts(save)[4]!.boardNo).toBe(2) // contract 5 is board 2's first
})
