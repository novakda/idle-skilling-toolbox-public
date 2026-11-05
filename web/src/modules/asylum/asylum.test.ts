import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from '../../test-save.test'
import { BUNDLE, compile, inert, matchBraces } from '../../../../src/game-eval'
import { asylum, asylumDecks, BELL_MAX, dropChances, farmBell, keys, rolls, TRACES, winDrops } from './asylum'
const n = (v: unknown) => Number(v ?? 0) || 0

const PATH = `${import.meta.dir}/../../../../${BUNDLE}`
const src = existsSync(PATH) ? readFileSync(PATH, 'latin1') : '' // latin1: string index = byte offset (the † offsets)
const WIN = [26903763, 26921705, 26937973, 26956794] // each boss's `t=Math.pow(TicketsToSpend,2)` in its win handler

test('stored values: traces, keys, best difficulty and the trace bonus come from the save as stored', async () => {
  const s = await fullSave(), a = asylum(s)
  expect(a.traces.map((t) => t.held)).toEqual((s.AsylumTracesOwned as number[]).slice(1, 11))
  expect(a.keys.held).toBe(s.AsylumTickets)
  const T = { base: 1, X: 3, Y: 14, Z: 45 } as Record<string, number>
  a.bosses.forEach((b, i) => expect(b.best ? T[b.best] : 0).toBe(s.RaidBossKilled[5 + i]))
  // AsylumTraceExtraBonus (@18623700) recomputed from its inputs equals the stored value.
  const g = (k: string, i: number) => Number(s[k]?.[i] ?? 0), rift = g('RiftLVL', 7), pro = g('RiftProLvs', 7)
  const extra = (1 + 2 * g('TrainingPerkLevels', 13) / 100) * g('TankBonusLIST', 21) * (1 + g('EbonusThree', 7) / 100) * (1 + Number(s.CbonusAsylumTraces ?? 0) / 100)
    * (1 + 240 * rift / (rift + 200) * (2 * pro / (pro + 100)) / 100)
  expect(extra).toBeCloseTo(s.AsylumTraceExtraBonus, 9)
})

test('the page model runs on the reactive save the component passes', async () => {
  const s = await fullSave()
  expect(() => asylum(reactive(s), 1.8e9)).not.toThrow()
  expect(asylum(reactive(s), 1.8e9).plan).toEqual(asylum(s, 1.8e9).plan)
})

test('key timer: entry adds the time away; past 7200 it pays and drops by the interval', () => {
  const k = keys({ AsylumTickets: 5, TimeToNextTicketASYLUM: 1000, TimeLastInAsylum: 1e9, HaveuBeentoAsylum: 1, MasteryPerksUnlocked: Object.assign([], { 80: 2 }) }, 1e9 + 20000)
  // 21000 s on the timer, interval 7200·0.86 = 6192: three grants leave 2424, next in 4776.
  expect([k.waiting, Math.round(k.nextIn), k.perDay]).toEqual([3, 4776, 86400 / 6192])
})

test.skipIf(!src)('guaranteed trace: equals the win handler run for every randomInt(40,160)', () => {
  for (const [boss, at] of WIN.entries()) for (const [T, L, mark, bell, L88] of [[45, 10, 1, 0, 0], [14, 3, 0, 1, 2500], [3, 7, 1, 2, 30000], [1, 0, 0, 0, 0]]) {
    const start = src.lastIndexOf(',', src.lastIndexOf(',', at - 1) - 1) + 1
    const end = src.indexOf('h.TraceDropAmount=t', src.indexOf('Math.pow(1.6,Math.min(', at)) + 19
    const body = src.slice(start, end).replace(';for(', ';(') + ')'
    let r = 0, sum = 0
    const A: Record<string, any> = { TicketsToSpend: T, SkillLevels: Object.assign([], { 50: L }), SkillActive: Object.assign([], { 16: mark }), RaidBossQueue: 5 + boss,
      AsylumBell: Object.assign([], { [boss + 1]: bell }), AsylumTraceExtraBonus: 1.185, SmithingItemLevel: Object.assign([], { 88: L88 }) }
    const f = compile(`function(){var r,n,i,o,t;${body}}`, A, { p: { randomInt: () => r } }) as Function
    for (r = 40; r <= 160; r++) { f(); sum += A.TraceDropAmount }
    const want = winDrops({ SkillLevels: A.SkillLevels, AsylumTraceExtraBonus: 1.185, SmithingItemLevel: A.SmithingItemLevel }, boss, T, bell, mark).guaranteed
    expect([boss, T, sum / 121 / want]).toEqual([boss, T, expect.closeTo(1, 9) as any])
  }
})

test.skipIf(!src)('drop rolls: the ladder run over every randomInt(1,1e5) gives the chances and bonus trace modelled', () => {
  for (const [boss, at] of WIN.entries()) for (const Cb of [0, 80]) {
    const fn = src.indexOf('function', src.indexOf('p.runLater(70*n,', at))
    const A: Record<string, any> = { CbonusRaidDrops: Cb, TicketsToSpend: 14, SkillLevels: Object.assign([], { 50: 10 }), SkillActive: Object.assign([], { 16: 1 }), RaidBossQueue: 5 + boss, AsylumBell: [] }
    let rng = 0
    const got = Array(8).fill(0), qty: number[] = []
    const p = { randomInt: (a: number, b: number) => a === 1 && b === 1e5 ? rng : a === 40 ? 100 : 0, getActorType: (id: number) => id,
      createRecycledActor: (id: number) => { if (id !== 894) return; const t = A.RaidDropType; got[t >= 7 ? 7 : t]++; if (t >= 7) qty.push(A.TraceDropAmount) }, runLater: () => {} }
    const f = compile(matchBraces(src, fn), A, { p, a: { wrapper: { enabled: true } } }) as Function
    for (rng = 1; rng <= 1e5; rng++) f(inert)
    expect([boss, Cb, got.map((c) => c / 1e5)]).toEqual([boss, Cb, dropChances(boss, Cb).map((x) => +x.toFixed(9))])
    expect(new Set(qty)).toEqual(new Set([Math.ceil(14 * 14 * 3)])) // T²·(r = 100)/100·(1 + 0.2·10), bell 0
  }
  expect([1, 3, 14, 45].map(rolls)).toEqual([1, 3, 9, 20]) // ceil(T^0.8) capped by the 20-pass loop
}, 60000)

test.skipIf(!src)('key timer equals the Asylum screen\'s draw listener (grants, double chance, interval)', () => {
  const a39 = src.indexOf('"scripts.SceneEvents_39"'), cond = src.indexOf('7200<b.engine.getGameAttribute("TimeToNextTicketASYLUM")', a39)
  const fn = matchBraces(src, src.indexOf('function', src.lastIndexOf('this.addWhenDrawingListener', cond)))
  for (const [m80, rank, Cb, roll] of [[0, 0, 0, 50], [3, 4, 25, 10], [3, 4, 25, 30]]) {
    const A: Record<string, any> = { TimeToNextTicketASYLUM: 30000, AsylumTickets: 0, AsylumTixCollected: 0, MasteryPerksUnlocked: Object.assign([], { 80: m80 }),
      ContractRank: Object.assign([], { 54: rank }), CbonusAsylumKeys: Cb }
    const f = compile(fn, A, { p: { randomInt: () => roll, getFont: () => null, createRecycledActor: () => {}, getActorType: () => 0 }, a: { wrapper: { enabled: true } } }) as Function
    for (let i = 0; i < 20; i++) f(inert, inert, inert, inert)
    const k = keys({ TimeToNextTicketASYLUM: 30000, MasteryPerksUnlocked: A.MasteryPerksUnlocked, ContractRank: A.ContractRank, CbonusAsylumKeys: Cb })
    const doubled = roll < 5 * rank // this run's fixed roll: all grants double or none
    expect([m80, rank, roll, A.AsylumTickets]).toEqual([m80, rank, roll, expect.closeTo(k.waiting / (1 + k.double) * (doubled ? 2 : 1), 9) as any])
    expect(7200 - A.TimeToNextTicketASYLUM).toBeCloseTo(k.nextIn, 9)
  }
})

test('plan: per boss, the most traces per key among wins at a beaten difficulty; harder wins only as try-next; Mark rows only with Mark levels', async () => {
  const s = await fullSave(), a = asylum(s, 1.8e9)
  if (a.missing) throw new Error(a.missing)
  const beaten = (boss: number) => Number(s.RaidBossKilled[5 + boss] ?? 0)
  for (const p of a.plan) {
    expect(p.verdict).toBe('win')
    expect(p.T).toBeLessThanOrEqual(beaten(p.boss)) // only difficulties you have beaten are planned (the model averages the dice)
    for (const r of a.runs.filter((x) => x.boss === p.boss && x.verdict === 'win' && x.T <= beaten(p.boss))) expect(r.perKey).toBeLessThanOrEqual(p.perKey)
  }
  for (const r of a.tryNext) expect(r.T).toBeGreaterThan(beaten(r.boss))
  expect(a.plan.map((p) => p.keys)).toEqual(a.plan.map((p) => p.keys).sort((x, y) => x - y))
  expect(asylum({ ...s, SkillLevels: Object.assign([...s.SkillLevels], { 50: 0 }) }, 1.8e9).runs.every((r) => r.mark === 0)).toBe(true)
  expect(TRACES).toHaveLength(10)
})

test('plan as a sequence: keys so far add up each step\'s net keys; the wait covers what the keys held and waiting don\'t', async () => {
  const s = await fullSave(), a = asylum(reactive(s), 1.8e9)
  let cum = 0
  for (const p of a.plan) {
    expect(p.spend).toBeCloseTo(p.short > 0 ? p.runs * (p.taken - p.keysBack) : 0, 9)
    cum += p.spend
    expect(p.keysSoFar).toBeCloseTo(cum, 9)
    expect(p.waitSec * a.keys.perDay / 86400).toBeCloseTo(Math.max(0, cum - a.keys.held - a.keys.waiting), 6)
  }
})

test('asylumDecks: the deck changes the Scallius Y verdict on the fixture (model)', async () => {
  // Was pinned to the live save of 2026-10-11 (Scallius Z Mark on: deck 1 no, deck 2 win). The live save has outgrown
  // that: Scallius Z is beaten (RaidBossKilled[7] 3 → 45) and both decks now win every cell, so differ is empty there.
  // The fixture (2026-10-02, two tinker decks, neither linked to 10) still has decks that disagree.
  if (!existsSync(`${import.meta.dir}/../../../../data/fixture-save.json`)) return
  const d = asylumDecks(await fullSave())
  expect(d.differ).toEqual([ // since fight HP = fightHPmax (2026-10-24)
    { name: 'Scallius', difficulty: 'Y', mark: 0, verdicts: ['win', 'no'] },
    { name: 'Scallius', difficulty: 'Y', mark: 1, verdicts: ['close', 'no'] },
  ])
})

test('bell: traces ×1.23⁴ a ring, cap 11, farm = highest win from the start bell up; per-bell rows on the fixture', async () => {
  const s = { SkillLevels: Object.assign([], { 50: 10 }), AsylumTraceExtraBonus: 1.2 }
  for (const b of [0, 3, 10]) expect(winDrops(s, 1, 45, b + 1, 1).guaranteed / winDrops(s, 1, 45, b, 1).guaranteed).toBeCloseTo(1.23 ** 4, 9)
  const v = (w: string[]) => w.map((verdict, bell) => ({ bell, verdict }))
  expect(farmBell(v(['win', 'win', 'win', 'close', 'no']), 1)).toBe(2)
  expect(farmBell(v(['win', 'win', 'no']), 2)).toBeNull() // best bell no longer wins: no way down
  expect(farmBell(v(['win', 'win', 'win']), 0)).toBe(2)
  expect(BELL_MAX).toBe(11)
  if (src) expect(src.slice(4524211, 4524800)).toContain('+1,11)') // Math.min(bell + 1, 11) @4524211
  const a = asylum(await fullSave(), 1.8e9)
  if (a.missing) throw new Error(a.missing)
  for (const r of a.runs) {
    if (r.T !== 45) { expect(r.bells).toBeNull(); continue }
    expect(r.bells!.map((b) => b.bell)).toEqual([...Array(BELL_MAX + 1).keys()])
    expect(r.bells![r.bell]!.verdict).toBe(r.verdict) // the start bell row is the grid's Z cell
    expect(r.bells![r.bell]!.perRun).toBeCloseTo(r.perRun, 6)
    expect(r.farm).toBe(farmBell(r.bells!, r.bell))
    if (r.maxBell! >= 0) expect(r.bells!.slice(0, r.maxBell! + 1).every((b) => b.verdict === 'win')).toBe(true)
    for (const b of r.bells!) expect(b.perDay).toBeCloseTo(b.perKey * a.keys.perDay, 6)
  }
})
