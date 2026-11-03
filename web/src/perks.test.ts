import { expect, test } from 'bun:test'
import { existsSync } from 'fs'

// A pre-ascend main-fight save (gitignored, like src/perk-impacts.test.ts uses): data/save.json refreshes live, and right
// after an ascend AP per ascend is ~0, which would make these checks depend on when you last played.
const FIX = new URL('../../data/fixture-fight.json', import.meta.url)
const fixture = () => Bun.file(FIX).json()
const t = existsSync(FIX) ? test : test.skip
import { perkImpact, perkPlan } from './perks'

t('perks: AP-gain perk 60 moves AP per ascend by its formula; plan ranks within currency', async () => {
  const save = await fixture()
  const L = save.AscentionLevel[60] ?? 0
  const ap = perkImpact(save, 60).find((x) => x.output === 'AP per ascend')!
  expect(ap.change).toBeCloseTo((1 + (10 * (L + 1)) / 100) / (1 + (10 * L) / 100) - 1, 9) // ×(1 + 10·Asc[60]/100)
  const plan = perkPlan(save)
  expect(plan.length).toBe(68)
  const ap1 = plan.filter((r) => r.currency === 'AP')
  expect(ap1.every((r, k) => k === 0 || ap1[k - 1]!.perCost >= r.perCost)).toBe(true)
})

t('perks: game-code impacts merge only for this run at the current level, without repeating in-app outputs', async () => {
  const save = await fixture()
  const run = `${save.TimesAscended ?? 0}-${save.NumberofTimesRebirth ?? 0}`, levels = save.AscentionLevel as number[]
  const game = { save: run, levels, perks: { 5: [{ output: 'DPS', change: 0.5 }], 60: [{ output: 'AP per ascend', change: 9 }] } }
  const row = (p: ReturnType<typeof perkPlan>, i: number) => p.find((r) => r.i === i)!
  const plan = perkPlan(save, game)
  if (row(plan, 5).next != null) expect(row(plan, 5).impact).toContainEqual({ output: 'DPS', change: 0.5, game: true })
  expect(row(plan, 60).impact.filter((x) => x.output === 'AP per ascend')).toHaveLength(1) // in-app value wins
  expect(row(perkPlan(save, { ...game, save: 'other' }), 5).impact).toEqual([])
  expect(row(perkPlan(save, { ...game, levels: levels.map((x) => x + 1) }), 5).impact).toEqual([])
})

t('perks: in-app rate outputs (brew 59, botany 48, cashback 19); every unmodelled perk is labelled and ranks below gains', async () => {
  const save = await fixture()
  const L = (i: number) => save.AscentionLevel[i] ?? 0, ch = (i: number, o: string) => perkImpact(save, i).find((x) => x.output === o)?.change
  expect(ch(59, 'brew speed')).toBeCloseTo((1 + (8 * (L(59) + 1)) / 100) / (1 + (8 * L(59)) / 100) - 1, 9)
  // Botany growth sums potSpeed·anim·(1+tier/4); perk 48 scales pot p by (1 + 5·L·OverLevels[p+8]/100).
  if (save.OverLevels.slice(9, 23).some((x: number) => x > 0)) expect(ch(48, 'Botany growth')!).toBeGreaterThan(0)
  const cb = (l: number) => 1 / (1 - Math.min(l + 10 * (save.MasteryPerksUnlocked?.[112] ?? 0), 70) / 100)
  if (cb(L(19) + 1) !== cb(L(19))) expect(ch(19, 'upgrades per cash')).toBeCloseTo(cb(L(19) + 1) / cb(L(19)) - 1, 9)
  // Perks src/perk-impacts.ts prices from game code (the bundle isn't needed here).
  const GAME = [1, 3, 5, 6, 7, 8, 10, 15, 16, 22, 23, 25, 33, 37, 38, 39, 40, 44, 49, 62, 65]
  const plan = perkPlan(save)
  for (const r of plan.filter((x) => x.next != null && !x.impact.length && !GAME.includes(x.i))) expect(r.label, `perk ${r.i}`).toBeDefined()
  for (const cur of ['AP', 'BP']) {
    const rows = plan.filter((r) => r.currency === cur), firstLabel = rows.findIndex((r) => r.label)
    if (firstLabel >= 0) expect(rows.slice(firstLabel).every((r) => r.perCost === 0)).toBe(true)
  }
  expect(plan.find((r) => r.i === 24)!.label!.text).toContain('11 levels saved')
})

t('buyList: spends no more than the balance and only buys modelled perks', async () => {
  const { perkPlan, buyList } = await import('./perks')
  const save = await fixture()
  const rows = perkPlan(save)
  const { buys, left } = buyList(rows, 'AP', 20000)
  expect(left).toBeGreaterThanOrEqual(0)
  expect(buys.reduce((s, b) => s + b.spent, 0) + left).toBeCloseTo(20000, 6)
  expect(buys.every((b) => b.to > b.from && rows.find((r) => r.i === b.i)!.impact.length > 0)).toBe(true)
})

t('key locks: locked perks never reach the buy list; every levelled key perk reads as unlocked', async () => {
  const { perkPlan, buyList, KEY_LOCKS } = await import('./perks')
  const save = await fixture()
  const rows = perkPlan(save)
  for (const i of Object.keys(KEY_LOCKS).map(Number)) if ((save.AscentionLevel[i] ?? 0) > 0) expect(rows.find((r) => r.i === i)!.lock, `perk ${i}`).toBeNull()
  const locked = new Set(rows.filter((r) => r.lock).map((r) => r.i))
  expect(buyList(rows, 'AP', 1e9).buys.some((b) => locked.has(b.i))).toBe(false)
})

test('BP_LOCKS (game click handler): every BP perk you have levelled passes its lock on the live save', async () => {
  const path = `${import.meta.dir}/../../data/save.json`
  if (!existsSync(path)) return
  const save = await Bun.file(path).json(), rows = perkPlan(save)
  for (const r of rows.filter((r) => r.currency === 'BP' && r.level > 0)) expect(r.lock, `perk ${r.i} ${r.name}`).toBeNull()
})
