import { expect, test } from 'bun:test'
import { DATA, CHOCCY_CAP, ENDGAME_RESET, STAGES, autoStage, resetCall, stageComp, stageImage, GOALS, SHRINE_GOAL, SHRINE_FINAL, attackPeriod, barnPos, banishExp, banishRefill, sammichStart, barnSlots, coinsPerHour, lineage, meanHits, minionGuide, orbCap, purpleSpentFor, realmState, shrineCost, stageTable, tierDps, traitsOf, type Combat } from './realm'
import fixture from './realm-fixture.json'
import { readFileSync } from 'fs'

// realm-fixture.json: the author's RealmStuff on 2026-10-05 (player name scrubbed). In game that day: "Afterlife 14", badge "Lv. 16 / 218K",
// 13 lit barn slots, Orb Tower "177/803" with trait Flesh Wound, yellow bar 811K/841K (data/captures/2026-10-05/realm*).
const save = { RealmStuff: fixture }

test('position reads the numbers the game draws', () => {
  const r = realmState(save)!
  expect(r.afterlife).toBe(14) // ActorEvents_1490 draws "Afterlife" + (RealmStuff[6] + 1)
  expect(r.bestReached).toBe(23)
  expect(r.realmLv).toBe(16)
  expect(Math.round(r.exp)).toBe(218244)
  expect(r.orb).toMatchObject({ energy: 177, cap: 803, expansions: 4, traitName: 'Flesh Wound', coinBuys: 7 })
  expect(barnSlots(save)).toBe(13)
})

test('colour gates come from the boss table and the barn decides what you deal', () => {
  const r = realmState(save)!
  expect(r.tiers.map((t) => t.first)).toEqual([1, 5, 10, 12, 23, 30, 47, 91])
  expect(r.tiers.filter((t) => t.can).map((t) => t.colour)).toEqual(['Red', 'Orange', 'Yellow', 'Blue', 'Pink']) // Pink: any colour lands, no trait of its own
  expect(r.nextGate?.colour).toBe('Purple')
  // A Volcano keeps Mountain's Orange trait (TraitList walks the parent chain); the Orb trait joins every minion.
  expect(lineage('MinionB3')).toEqual(['MinionB3', 'MinionB1', 'MinionB0'])
  expect(traitsOf('MinionB3', 22).has(2)).toBe(true)
  expect(traitsOf('MinionB3', 22).has(22)).toBe(true)
})

test('barn maps onto the wiki reset-loop composition', () => {
  const r = realmState(save)!
  const by = Object.fromEntries(r.comp.rows.map((c) => [c.name, c]))
  expect(by['Horn Hippo']!.have.map((m) => m.level)).toEqual([24]) // best Hippo is on the Horn Hippo path, not there yet
  expect(by['Horn Hippo']!.done).toBe(0)
  expect(by['Volcano']!.done).toBe(1)
  expect(by['Lizard']!.have).toEqual([])
  expect(r.minions.find((m) => m.name === 'Hippo')!.cap).toBe(50) // evolution stage 1 levels to 50
})

test('shrine plan buys the cheapest wiki-goal levels the Spirals cover', () => {
  const r = realmState(save)!
  expect(shrineCost(2, 0)).toBe(40) // Carnate
  expect(shrineCost(1, 31)).toBeCloseTo(25 * 1.15 ** 31, 6) // Bhakti
  expect(r.plan).toEqual({ Carnate: [0, 6], Sahaja: [0, 2] })
  expect(r.spiralsLeft).toBeGreaterThanOrEqual(0)
  expect(r.steps[0]).toContain('Carnate 0 → 6')
  expect(r.steps[1]).toContain('Rainboppo')
})

test('formulas', () => {
  expect(banishExp(1)).toBe(6)
  expect(banishExp(1e5)).toBeCloseTo(5 + 100 + 1e2, 2) // game LOG uses 0.434295
  expect(orbCap(0)).toBe(10)
  expect(realmState({ RealmStuff: [] })).toBeNull()
})

test('minion guide: every MinionDatabase entry, each line a path, the author\'s state per row', () => {
  const g = minionGuide(save)
  expect(g.length).toBe(73)
  const by = Object.fromEntries(g.map((r) => [r.name, r]))
  expect(by['Rainboppo']!.how).toBe('evolve Horn Hippo at Lv200 † (or Hippemo)')
  expect(by['Horn Hippo']!.how).toBe('evolve Hippo at Lv50 † (or Beeg Hippo)')
  expect(by['Rainboppo']!.colours).toContain('Purple (banish)')
  expect(by['Volcano']!.colours).toEqual(['Orange']) // OJ Heart Stab replaces Red
  expect(by['Hippo']!.state).toEqual({ kind: 'owned', text: '4× best Lv24' })
  expect(by['Horn Hippo']!.state.text).toBe('from your Hippo Lv24 (evolves at Lv50)')
  expect(by['Lizard']!.state.kind).toBe('reachable')
  expect(by['Big Bone']!.state).toEqual({ kind: 'locked', text: 'needs Realm Lv20' })
  // Depth-first order: a child always follows its parent.
  g.forEach((r, i) => { if (r.depth) expect(g.slice(0, i).some((p) => p.depth === r.depth - 1)).toBe(true) })
  expect(g.every((r) => !r.disagree)).toBe(true) // wiki prerequisites match the game's parents
})

test('shrine plan: every row is buyable in code, nothing planned past what the Spirals cover', () => {
  // the author's report 2026-10-05: the screen showed only Dharma Lv10 (12K) and Bhakti Lv31 (1.9K), both "too poor", at 1.7K Spirals.
  // The other six rows sit below the scroll; the buy handler has no unlock gate, only level < max and Spirals ≥ cost.
  const r = realmState(save)!
  expect(r.shrine.slice(0, 2).map((s) => [s.level, Math.round(s.next!)])).toEqual([[10, 12262], [31, 1904]])
  for (const [name, [from, to]] of Object.entries(r.plan)) {
    const s = r.shrine.find((x) => x.name === name)!
    expect(to).toBeLessThanOrEqual(s.max)
    expect(from).toBe(s.level)
  }
  const spent = Object.entries(r.plan).reduce((t, [name, [a, b]]) => { const i = r.shrine.find((x) => x.name === name)!.i; for (let l = a; l < b; l++) t += shrineCost(i, l); return t }, 0)
  expect(spent).toBeLessThanOrEqual(1719.02)
  expect(r.steps[0]).toContain('scroll bar')
  // Nothing affordable: say so, with the cheapest level and the shortfall.
  const poor = fixture.slice() as unknown[]; poor[12] = 30
  const p = realmState({ RealmStuff: poor })!
  expect(p.plan).toEqual({})
  expect(p.steps[0]).toBe('No Shrine upgrade is affordable: cheapest next level is Carnate Lv1 at 40 Spirals, 10 more than you hold.')
  expect(Math.round(r.resetBase)).toBe(1021) // b = 13
})

// Stage table on a hand-built combat snapshot (the game-code numbers are tested in src/realm-combat.test.ts).
const minion = (o: Partial<Combat['minions'][number]>) => ({ slot: 0, id: 'MinionA2', level: 1, attacks: true, orange: false, dmg: 100, crit: 0, critDmg: 1.25, atkSpeed: 0, multihit: 0, orbCharge: 0, banishExp: 0, ...o })
const combat = (o: Partial<Combat> = {}): Combat => ({ beaten: 0, baseAtkSec: 20, redMult: 1, otherMult: 1, lemon: false, dual: false, banishBop: false, banishesLeft: 6,
  laserPerSec: 810, laserCost: 5, energy: 0, energyCap: 10, hpNow: [1000, 0, 0, 0, 0, 0, 0, 0], bosses: [[1000, 0, 0, 0, 0, 0, 0, 0], [2000, 500, 0, 0, 0, 0, 0, 0]], minions: [], ...o })

test('attack timing and colour routing follow the game tick', () => {
  expect(attackPeriod(20, 0)).toBeCloseTo(20.1, 6) // 200 decrements of 0.1, then the attack tick
  expect(meanHits(0)).toBe(1)
  expect(meanHits(50)).toBe(1.5)
  const c = combat({ minions: [minion({ dmg: 201, crit: 25, critDmg: 2 }), minion({ orange: true, dmg: 402 })], redMult: 2 })
  expect(tierDps(c, 0)).toBeCloseTo((201 * 2 * 1.25) / 20.1, 6) // red hit × Crimsonile × crit mean
  expect(tierDps(c, 1)).toBeCloseTo(402 / 20.1, 6)
  expect(tierDps(c, 2)).toBe(0) // no Lemonhearted, no Yellow
  expect(tierDps({ ...c, lemon: true }, 2)).toBeCloseTo((201 * 2 * 0.25 * 2) / 20.1, 6) // only crits land on Yellow
})

test('stage table: sums tiers, stops at a colour the barn cannot deal', () => {
  const c = combat({ minions: [minion({ dmg: 201 })], bosses: [[1000, 0, 0, 0, 0, 0, 0, 0], [2000, 0, 0, 0, 0, 0, 0, 0], [3000, 0, 0, 0, 50, 0, 0, 0]] })
  const rows = stageTable(c, 1)
  expect(rows.map((r) => r.afterlife)).toEqual([1, 2, 3])
  expect(rows[0]!.sec).toBeCloseTo(100, 6) // 1000 HP at 10/s
  expect(rows[2]!.blocker).toBe('Purple: needs a Rainboppo (banishing deals Purple)')
  expect(rows[2]!.sec).toBe(Infinity)
  const blue = stageTable(combat({ minions: [minion({})], bosses: [[1000, 0, 0, 9000, 0, 0, 0, 0]], hpNow: [1000, 0, 0, 9000, 0, 0, 0, 0] }), 0)
  expect(blue[0]!.blocker).toContain('laser needs 10 energy')
})

test('stage table: White = hits/s × log10(outside DPS) hit (Refractile, crit); Pink must land within its 5 s refill', () => {
  // whiteHit 87 per hit, ×1.5 Refractile, crit 50% × 3 → mean ×2; one attack per 20.1 s, multihit 50% → 1.5 hits
  const m = minion({ dmg: 10, crit: 50, critDmg: 3, multihit: 50 })
  const hp = [0, 0, 0, 0, 0, 0, 5000, 0]
  const c = combat({ white: true, whiteHit: 87, otherMult: 1.5, minions: [m], bosses: [hp], hpNow: hp })
  const dps = (1.5 / 20.1) * 87 * 1.5 * 2
  expect(tierDps(c, 6)).toBeCloseTo(dps, 9)
  expect(stageTable(c, 0)[0]!.sec).toBeCloseTo(5000 / dps, 6)
  expect(stageTable({ ...c, white: false }, 0)[0]!.blocker).toContain('Big Bone') // no Pure Hearted carrier: still blocked
  expect(stageTable({ ...c, whiteHit: undefined }, 0)[0]!.blocker).toContain('outside fight DPS unknown')
  // Pink: every colour lands (White included); feasible only when 5 s of damage covers the HP
  const pink = (h: number) => stageTable(combat({ white: true, whiteHit: 87, minions: [m], bosses: [[0, 0, 0, 0, 0, h, 0, 0]], hpNow: [0, 0, 0, 0, 0, h, 0, 0] }), 0)[0]!.tiers[0]!
  const pinkDps = (1.5 / 20.1) * (10 + 87) * 2
  expect(pink(10).sec).toBeCloseTo(10 / pinkDps, 9)
  expect(pink(1e6).sec).toBe(Infinity)
  expect(pink(1e6).blocker).toContain('refills every 5 s')
})
test('stage table: Purple = protected repeat banishes of the best minion, days at TotalDailyBanishes; blocker names the coins (#2671)', () => {
  // one banish: banishExp × ALLDMG × Refractile = 1e3 × 8 × 1.25 = 1e4; Purple 3.5e4 → 4 banishes, each protected
  const spent = 1e10, m = minion({ attacks: false, banishExp: 1e3, spent })
  const bosses = [[0, 0, 0, 0, 3.5e4, 0, 0, 0], [0, 0, 0, 0, 3.5e4, 0, 0, 0]]
  const c = combat({ banishBop: true, allDmg: 8, otherMult: 1.25, minions: [m], bosses, hpNow: bosses[0]!, banishesLeft: 6, banishesPerDay: 6,
    protectCharges: 2, protectBuy: true, protectCost: 25, energy: 150, realmExp: 0, realmReq: 1e9 })
  const rows = stageTable(c, 1)
  expect(rows[0]!.tiers[0]!.blocker).toBe('Purple: 4 banishes of your best minion (4 protects)')
  expect(rows[0]!.sec).toBe(0) // 4 of today's 6
  expect(rows[1]!.sec).toBe(86400) // 2 left today, the other 2 tomorrow; 2 held + 6 bought from 150 energy cover all 8 protects
  // The refill comes when the banish timer RealmStuff[20] runs out, not a whole day later (#2672)
  expect(stageTable(c, 1, 7200)[1]!.sec).toBe(7200)
  const long = stageTable({ ...c, bosses: [...bosses, [0, 0, 0, 0, 1.05e5, 0, 0, 0]], energy: 1e4 }, 2, 7200) // 4 now; 2 + 2 at the 2 h refill; 11 = 4 left + 6 at 24 h later + 1 at 48 h
  expect(long.map((x) => x.sec)).toEqual([0, 7200, 86400 * 2])
  // No protects: each minion once (barn shrinks) → one minion can't cover it; the blocker gives the coins one banish needs
  const none = stageTable({ ...c, protectCharges: 0, protectBuy: false }, 1)[0]!.tiers[0]!
  expect(none.sec).toBe(Infinity)
  const need = purpleSpentFor(c, 3.5e4)!
  expect(none.blocker).toContain(`≥${need.toExponential(2)} coins spent`)
  expect(banishExp(need) * (1e3 / banishExp(spent)) * 8 * 1.25).toBeCloseTo(3.5e4, 0) // inverts BanishEXPgain
  // A level-up from banish EXP doubles the next boss's Purple (BossHPtot tier 4 reads RealmStuff[2], next req = 2·req + 5)
  const lv = stageTable({ ...c, realmExp: 0, realmReq: 4e3 - 5 }, 1) // 4 banishes add 4e3 EXP: one level-up, req 4e3 - 5 → 7995
  expect(lv[1]!.tiers[0]!.hp).toBeCloseTo(3.5e4 * 7995 / 3995, 6)
})

test('resetCall: >2h stage says reset; next boss scales by the base ratio', async () => {
  const { resetCall } = await import('./realm')
  const c = { beaten: 20, resetSpirals: 11926 } as any
  const slow = resetCall(c, [{ afterlife: 21, tiers: [], sec: 67000 }])!
  expect(slow.reset).toBe(true)
  expect(Math.round(slow.next)).toBe(Math.round(11926 * (546 * 1.12 ** 21) / (500 * 1.12 ** 20)))
  expect(resetCall(c, [{ afterlife: 21, tiers: [], sec: 3600 }])!.reset).toBe(false)
  expect(resetCall({ beaten: 20 } as any, [])).toBeNull()
})

test('protect step: offered below Realm Lv20 with banishes left, names the top-coin minion', async () => {
  const { realmState } = await import('./realm')
  const rs: any[] = Array(50).fill(0)
  rs[3] = [['MinionA2', 32, 'none', 1, 5e9, 0, 0], ['MinionB1', 22, 'none', 1, 1e6, 0, 0]]
  rs[4] = []; rs[8] = []; rs[11] = {}; rs[13] = []; rs[16] = 0; rs[17] = []; rs[26] = 30; rs[31] = 22; rs[0] = 19; rs[22] = 0
  const st = realmState({ RealmStuff: rs } as any)!
  const step = st.steps.find((x) => x.startsWith('Protect'))!
  expect(step).toContain('Hippo')
  expect(step).toContain('You have 30 energy.')
  rs[22] = 6
  expect(realmState({ RealmStuff: rs } as any)!.steps.some((x) => x.startsWith('Protect'))).toBe(false)
})

test('decoded run counters, trophies and torches (docs/realm.md)', async () => {
  const { reactive } = await import('vue')
  const r = realmState(reactive({ ...save, waterLV: 1776, FurthestMapleLV: Array(16).fill(0), DairyAisleAchievements: [0, 0, 0, 0, 0, 0, 0, 1] }))!
  expect(Math.round(r.run.seconds)).toBe(135168) // [37]: +0.1 a tick, zeroed by a Shrine reset
  expect(r.run.rerollsPerRun).toBe(0) // Ahisma 0 in the fixture
  expect(r.run.fruitRerollCost).toBe(50) // CornucopiaUPG(1): 50·7^[19]
  const rs = fixture.slice() as any[]; rs[19] = 2
  expect(realmState({ RealmStuff: rs })!.run.fruitRerollCost).toBe(2450)
  rs[40] = 3
  expect(realmState({ RealmStuff: rs })!.run.fruitRerollCost).toBe(0) // free banked rerolls first
  expect(r.trophies.claimed).toBe(25)
  expect(r.trophies.active.map((t) => t.i)).toEqual([20, 25, 26, 42])
  expect(r.trophies.active[0]).toMatchObject({ text: 'Have 15 unique minion types in the barn', have: 6, target: 15 })
  expect(r.torches.map((t) => [t.torch, t.lit, t.ready])).toEqual([['Yellow', false, true], ['Green', false, false], ['Red', false, false], ['Blue', false, true]])
  expect(r.progress.find((p) => p.item.startsWith('Realm Lv10'))!.done).toBe(true)
  expect(r.progress.find((p) => p.item.startsWith('Field'))!.due).toBe(false) // best 23: Stage 16-24
})

test('spend plan fills every low Shrine target before any high one', async () => {
  const { spendPlan } = await import('./realm')
  const goal = { Bhakti: [30, 40], Sahaja: [10, 10] } as Record<string, [number, number]>
  const lv = [10, 31, 10, 5, 3, 7, 0, 0]
  // the author 2026-10-11: 9,131 Spirals covers Sahaja 7 → 9 but not 10; Bhakti (already 31 ≥ 30) must not take the rest.
  expect(spendPlan(lv, 9131, goal)).toMatchObject({ plan: { Sahaja: [7, 9] }, met: false })
  const rich = spendPlan(lv, 1e6, goal)
  expect(rich.met).toBe(true)
  expect(rich.plan.Bhakti).toEqual([31, 40])
})

test('plan: reset loop at the Purple wall ends in the Rainboppo', async () => {
  const { realmPlan } = await import('./realm')
  const r = realmState(save)!
  const steps = realmPlan(r, { now: 1e9, next: 2e9, sec: 9000, reset: true })
  expect(steps[1]!.do).toContain('Reset at the Shrine')
  expect(steps.at(-1)!.do).toContain('Rainboppo')
  expect(steps.at(-1)!.buys).toContain('Afterlife 23')
  // Under 2 h: take the stage.
  expect(realmPlan(r, { now: 10, next: 12, sec: 600, reset: false })[0]).toMatchObject({ do: 'Beat Afterlife 14', sec: 600 })
  // No combat data: first next step only.
  expect(realmPlan(r, null)).toEqual([{ do: r.steps[0]!, sec: null, buys: '' }])
  // Resetti: Blaken Golds built before the reset lead the plan; none affordable → no step.
  const bg = realmPlan(r, { now: 1e9, next: 2e9, sec: 9000, reset: true }, [], { perCopy: 8904, cost: 1e42, empties: 5, path: 'p', copies: 2 })
  expect(bg[0]!.do).toContain('build 2 Blaken Golds')
  expect(bg[0]!.buys).toContain('+17,808 Spirals')
  expect(realmPlan(r, { now: 1e9, next: 2e9, sec: 9000, reset: true }, [], { perCopy: 8904, cost: 1e42, empties: 5, path: 'p', copies: 0 })[0]!.do).not.toContain('Blaken')
})

test('orbRerollOdds: pool is barn traits + 1/5/11/13, first hit in id order wins (@6925662, @18599289)', async () => {
  const { orbRerollOdds } = await import('./realm')
  const o = orbRerollOdds(new Set([5, 8, 22, 31])) // the author's barn 2026-10-12
  expect(o[39]).toBeUndefined() // Gold Bless: no Goose in the barn
  expect(o[8]).toBeCloseTo(0.84 * 0.84 * 0.02, 6)
  expect(o[31]).toBeCloseTo(0.84 ** 5 * 0.98 * 0.004, 6)
  expect(Object.values(o).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
})

test('coinsPerHour: Realm screen = rate × 60; away adds fruit 14% and equals the per-minion rows summed', () => {
  const minions = [{ slot: 0, id: 'a', name: 'a', level: 1, spent: 0, cash: 100, double: 0.5, perMin: 150 }, { slot: 1, id: 'b', name: 'b', level: 1, spent: 0, cash: 40, double: 0, perMin: 40 }]
  const c = { perMin: 190, coins: 0, energy: 0, spirals: 0, allNow: 0, minions, levers: [], parts: { awayPct: 25 } } as any
  expect(coinsPerHour(c)).toEqual({ screen: 190 * 60, away: 190 * 60 * 1.25 })
  expect(minions.reduce((t, m) => t + m.cash * (1 + m.double) * 60 * 1.25, 0)).toBeCloseTo(coinsPerHour(c).away, 9)
})

test('Bundled Broccoli: no bonus, flagged avoid past Lv1 (unlock-only, VendingMachineItemsOwned @6415863)', () => {
  const src = readFileSync(`${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`, 'utf8')
  expect(src.includes('VendingBonus",11,')).toBe(false)
  const rs = structuredClone(fixture) as unknown[]
  rs[8] = (rs[8] as number[]).map((v, i) => (i <= 11 ? (i === 11 ? 5 : Math.max(1, v)) : v))
  const b = realmState({ RealmStuff: rs })!.vending[11]!
  expect([b.name, b.bonus, b.flag]).toEqual(['Bundled Broccoli', 0, 'avoid'])
})

test('Icecream Sammich start coins = the game\'s VendingCost(10, 17) on the live save', async () => {
  const { existsSync } = await import('fs')
  if (!existsSync('data/save.json')) return
  const { blockHost, haxeMap, loadBundle } = await import('../../src/game-eval')
  const { ge, wrap } = await import('../../src/realm-combat')
  const save = JSON.parse(readFileSync(`${import.meta.dir}/../../data/save.json`, 'utf8')), A: Record<string, any> = {}
  for (const [k, v] of Object.entries(save)) A[k] = wrap(v)
  const H = blockHost(loadBundle(), A, { ge }) as any; A.DNSM = haxeMap()
  const lv = Number((A.RealmStuff as any[])[8][10])
  expect(sammichStart(lv) / Number(H._customBlock_MinionInfo('VendingCost', 10, 17))).toBeCloseTo(1, 9)
  expect(sammichStart(0)).toBe(0)
}, 60_000)

test('barn slots read as the game pages them: 20 a page', () => {
  expect([0, 8, 19, 20, 39, 40].map(barnPos)).toEqual(['p1 #1', 'p1 #9', 'p1 #20', 'p2 #1', 'p2 #20', 'p3 #1'])
})

test('every upgrade in the Shrine goals is one the game reads, and Taoism\'s refund is unreachable', () => {
  const src = readFileSync(`${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`, 'utf8')
  const names = Object.keys({ ...SHRINE_GOAL, ...SHRINE_FINAL })
  expect(names.length).toBeGreaterThan(0)
  for (const nm of names) {
    const i = realmState(save)!.shrine.findIndex((u) => u.name === nm)
    expect([nm, i >= 0 && src.includes(`RealmStuff")[13][${i}]`)]).toEqual([nm, true])
  }
  expect(names).not.toContain('Moksha')
  expect(src.includes('RealmStuff")[13][6]')).toBe(false)
  // Taoism: [13][4] is read only after 0==GenINFO[52] and coins < .15·GenINFO[52], and GenINFO[52] is otherwise only set to 1 (@6527190)
  expect(names).not.toContain('Taoism')
  expect(src.includes('0==a._GenINFO[52]&&')).toBe(true)
  expect(src.split('a._GenINFO[52]=').length - 1).toBe(1)
})

test('Realm gates and colour sources match the game code', () => {
  const src = readFileSync(`${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`, 'utf8')
  const lists = JSON.parse(readFileSync(`${import.meta.dir}/../../data/game/lists.json`, 'utf8'))
  // GenINFO[37][i] = RealmStuff[23] >= randolist[1][i] (@6525147): Shrine [3] = 16, Orb Tower [5] = 11, Field [6] = 25
  expect(src.includes('for(this._GenINFO.push(this._DL),this._GenINFO.push(-1),this._GenINFO.push(0),this._DL=[],n=0;10>n;)')).toBe(true)
  expect([3, 5, 6].map((i) => Number(lists.randolist[1][i]))).toEqual([16, 11, 25])
  expect(src.includes('1==a._GenINFO[37][5]&&1==D._customBlock_mouseywithin(1746-p.getScreenX()')).toBe(true) // Orb button
  expect(src.includes('1==a._GenINFO[37][6]&&1==D._customBlock_mouseywithin(115-p.getScreenX()')).toBe(true) // Field button
  const at = (best: number) => { const rs = structuredClone(fixture) as any[]; rs[23] = best; rs[13] = rs[13].map(() => 0); return realmState({ RealmStuff: rs })! }
  expect([10, 11].map((b) => at(b).tiers[3]!.can)).toEqual([false, true])
  expect([15, 16].map((b) => at(b).shrineUnlocked)).toEqual([false, true])
  expect([24, 25].map((b) => at(b).fieldUnlocked)).toEqual([false, true])
  // CreateDmg colour arg per trait: 64 → 6 (White), 71 → 7 (Rainbow), banish 28 → 4 (Purple); any colour lands on Pink (tier 5, GenINFO[63] = 0)
  expect(src.includes('MinionTraitALL",64,0)&&(r=D._customBlock_MinionInfo("whitedamage"')).toBe(true)
  expect(src.includes('D._customBlock_CreateDmg(r,6,')).toBe(true)
  expect(src.includes('MinionTraitALL",71,0)&&(r=a._GenINFO[5][0|a._DN4][8],r=D._customBlock_MinionInfo("MinionDMG"')).toBe(true)
  expect(src.includes('"ALLDMG",0,0),4,-1,"none"')).toBe(true)
  expect(src.includes('5==i.getValue("ActorEvents_1488","_GenINFO")[12]&&0==i.getValue("ActorEvents_1488","_GenINFO")[63]')).toBe(true)
  // Riftseeker (trait 22): banish EXP × (1 + total/100), 150 per copy; Shiny = Crystal Eye Shop item 4 at randolistNUMreal[3][4] = 575
  expect(src.includes('*(1+D._customBlock_MinionInfo("MinionTraitALL",22,0)/100)*(1+D._customBlock_BlessingBonus(5)/100)')).toBe(true)
  expect(DATA.traits['22']!.value).toBe(150)
  expect(Number(lists.randolistNUMreal[3][4])).toBe(575)
  expect(src.includes('Summons_a_permanent_shiny_minion')).toBe(true)
})

test('every coin minion gets a slot-index doubler note matching its trait row (game bug, @6606617)', () => {
  const r = realmState(save)!
  const rows = r.traitRows.filter((t) => t.slotNote)
  expect(rows.length).toBeGreaterThan(0)
  for (const t of rows) expect(t.slotNote).toContain(`slot ${t.id} coin-doubler`)
})

test('progression stage picks the wiki composition for where the player is (#2614)', () => {
  expect([0, 1, 2, 5, 6, 7, 8, 10, 11, 13, 14, 15].map((b) => autoStage(b, 16, 0, false))).toEqual(['s1', 's1', 's5', 's5', 's7', 's7', 's10', 's10', 's13', 's13', 's15', 's15'])
  expect(autoStage(20, 18, 0, false)).toBe('reset')
  expect(autoStage(20, 25, 0.25, false)).toBe('lv20')
  expect(autoStage(23, 25, 0.5, false)).toBe('shrine') // "getting closer to the Shrine Upgrades goal"
  expect(autoStage(23, 25, 1, false)).toBe('shrine') // met, still pushing to 25
  expect(autoStage(48, 60, 1, false)).toBe('vending') // Stage 47+ alone is not the final push
  expect(autoStage(30, 60, 1, true)).toBe('final') // the ~60M reset reached the final Shrine targets
  expect(autoStage(71, 122, 1, true)).toBe('endgame') // 2026-10-23 save: best Afterlife 71, Realm Lv122
  // every wiki table resolves every row to a game minion (aliases in derive-realm.ts)
  for (const s of STAGES) if (!stageImage(s.key)) expect(stageComp(s.key, 5).length).toBeGreaterThan(4)
  const end = stageComp('endgame', 5)
  expect(end.find((t) => t.count === 999)?.id).toBe('MinionD3') // remaining slots: Lizardman
  expect(end.find((t) => t.id === 'MinionC13')?.count).toBe(7) // Purpback "3 up to BP+2" with BP 5
  expect(end.filter((t) => t.optional).length).toBe(7) // Goose, Cinderduck, Crocodile, Pompeille, Everest, Blaken Gold, Retiarius
  expect(realmState(save)!.comp.stage).toBe('reset') // fixture: best reached 23, Realm Lv16
  expect(realmState(save, 'lv20')!.comp.rows.map((t) => t.count)).toEqual([1, 1, 1, 1, 12, 999]) // the old hardcoded table
})

test('end game resets on the wiki 235T payout, not the 2 h loop (#2614)', () => {
  const c = (resetSpirals: number) => ({ resetSpirals, beaten: 10 }) as unknown as Combat
  const slow = [{ afterlife: 11, sec: 99999 }] as any, fast = [{ afterlife: 11, sec: 60 }] as any
  expect(resetCall(c(1e12), slow)!.reset).toBe(true) // reset loop: the stage takes over 2 h
  expect(resetCall(c(1e12), slow, true)!.reset).toBe(false) // end game: 1T < 235T, keep pushing
  expect(resetCall(c(ENDGAME_RESET), fast, true)!.reset).toBe(true) // 235T reached, even on a fast stage
  expect(resetCall(c(0), slow, true)!.reset).toBe(false) // just reset: never the call
})

test('Choccy Coin caps at Lv42: AllCashBonus min(1.25, 1 + 0.6·B%) (@6404159)', () => {
  expect(CHOCCY_CAP).toBe(42)
  expect(Math.min(1.25, 1 + 0.6 * (CHOCCY_CAP - 1) / 100)).toBeLessThan(1.25)
  expect(Math.min(1.25, 1 + 0.6 * CHOCCY_CAP / 100)).toBe(1.25)
  const rs = structuredClone(fixture) as any[]; rs[8][3] = 92
  const choccy = realmState({ RealmStuff: rs })!.vending.find((v) => v.name === 'Choccy Coin')!
  expect(choccy.flag).toBe('avoid')
  expect(choccy.capNote).toContain('50 levels past it do nothing')
})

test('end game, just reset: the plan runs the coin loop (#2614)', async () => {
  const { realmPlan } = await import('./realm')
  const rs = structuredClone(fixture) as any[]; rs[6] = 0
  const r = realmState({ RealmStuff: rs }, 'endgame')!
  const loop = { grant: 2.35e87, rebuild: 2.1e57, chonkLevel: 904, left: 6.6e85, perMin: 9.58e87, tail: [['Cinderduck', 12], ['Goose', 8], ['Pompeille', 4]] as [string, number][],
    vend: [{ i: 10, name: 'Icecream Sammich', level: 54, cost: 1.79e90, minutes: 187 }] }
  const steps = realmPlan(r, { now: 0, next: 0, sec: Infinity, endgame: true, reset: false }, [], undefined, loop).map((s) => s.do)
  expect(steps[0]).toContain('Rebuild the barn')
  expect(steps.some((d) => d.includes('economy tail last'))).toBe(true)
  expect(steps.some((d) => d.includes('Chonkoppo: level it to about Lv904'))).toBe(true)
  expect(steps.some((d) => d.includes('Icecream Sammich Lv55'))).toBe(true)
  const withPurple = realmPlan(r, { now: 0, next: 0, sec: Infinity, endgame: true, reset: false }, [], undefined,
    { ...loop, purple: { afterlife: 71, hp: 7.8e36, level: 923, extra: 9.98e88, minutes: 10.4, reached: true } }).map((s) => s.do)
  expect(withPurple.some((d) => d.includes('Chonkoppo to Lv923') && d.includes('Afterlife 71 Purple'))).toBe(true)
  // mid-run (a boss beaten) the loop steps stay out of the plan
  const mid = realmPlan(realmState({ RealmStuff: fixture }, 'endgame')!, { now: 10, next: 12, sec: 600, endgame: true, reset: false }, [], undefined, loop).map((s) => s.do)
  expect(mid.some((d) => d.includes('Chonkoppo'))).toBe(false)
})

test('banish refill: RealmStuff[20] pauses off the Realm screen, so the refill is LastVisitedZone[24] + [20] (#2672)', () => {
  const save = (r20: number, quit: number, seen: number) => ({ RealmStuff: Object.assign(Array(40).fill(0), { 20: r20, 22: 6 }), QuitTime: quit, LastVisitedZone: Object.assign(Array(30).fill(0), { 24: seen }) })
  expect(banishRefill(save(17241, 1000, 1000))).toEqual({ used: 6, resetIn: 17241 }) // on the Realm screen: as stored
  expect(banishRefill(save(17218, 1000 + 444, 1000))).toEqual({ used: 6, resetIn: 17218 - 444 }) // 444 s elsewhere: frozen, caught up on entry
  expect(banishRefill(save(100, 1000 + 400, 1000))).toEqual({ used: 0, resetIn: 86400 - 300 }) // refill passed while away: banishes back
  expect(banishRefill({ RealmStuff: Object.assign(Array(40).fill(0), { 20: 500, 22: 2 }) })).toEqual({ used: 2, resetIn: 500 }) // no timestamps
})


test('Stage 1-15 compositions transcribed from the wiki images resolve to minions (#2675)', () => {
  const early = STAGES.filter((s) => stageImage(s.key))
  expect(early.map((s) => s.key)).toEqual(['s1', 's5', 's7', 's10', 's13', 's15'])
  for (const s of early) {
    const titled = (DATA.compositions as { title: string; rows: { id: string | null }[] }[]).find((c) => c.title === s.comp)!
    expect(titled.rows.every((x) => x.id)).toBe(true) // every transcribed path resolves
  }
  const ids = (k: Parameters<typeof stageComp>[0]) => stageComp(k, 5).map((t) => `${t.count}×${t.id}`)
  expect(ids('s1')).toEqual(['3×MinionA2']) // 3 Hippo
  expect(ids('s10')).toEqual(['6×MinionA2', '1×MinionB1', '1×MinionC1']) // Hippo, Mountain, Lil Chicken
  expect(ids('s15')).toEqual(['1×MinionA5', '4×MinionA6', '1×MinionB3', '1×MinionC1', '3×MinionC8']) // Horn/Beeg Hippo, Volcano, Lil Chicken, Lizard
  expect(stageImage('s13')).toBe('Realm build - Stage 13 end.png')
  expect(stageImage('endgame')).toBeNull()
})

test('end-game goal picks which optional rows to count (#2676)', () => {
  const pick = (goal: string, o: { orbTrait?: number; slots?: number; bp?: number } = {}) =>
    Object.fromEntries(stageComp('endgame', o.bp ?? 5, { goal, ...o }).filter((t) => t.pick).map((t) => [DATA.minions[t.id]!.name, t.optional ? 'any' : t.count === 999 ? 'rest' : t.count]))
  expect(pick('coins')).toEqual({ Goose: 12, Cinderduck: 12, Pompeille: 7, Crocodile: 4, Everest: 1, Retiarius: 'rest' }) // hill-climbed; Pompeille 9 clamped to cap BP+2
  expect(pick('coins', { orbTrait: 39 })).toEqual({ Cinderduck: 12, Pompeille: 7, Crocodile: 4, Everest: 1, Retiarius: 'rest' }) // Gold Bless on the Orb Tower: no Goose
  expect(pick('measured', { orbTrait: 39 })).toEqual({ Cinderduck: 13, Goose: 7, Pompeille: 7, Crocodile: 1, Retiarius: 20, 'Blaken Gold': 2 }) // hill-climbed 2026-10-24
  expect(pick('damage', { bp: 1 }).Pompeille).toBe(3) // unstackable Wooping Whack: cap BP+2
  expect(pick('damage', { bp: 5 })).toEqual({ Pompeille: 7 })
  expect(pick('spirals', { bp: 3 })).toEqual({ 'Blaken Gold': 5 })
  expect(pick('rerolls', { bp: 3 })).toEqual({ Everest: 5 })
  expect(pick('energy')).toEqual({}) // already covered: no swap
  expect(pick('food')).toEqual({ Retiarius: 'rest' })
  expect(stageComp('endgame', 5, { goal: 'food' }).find((t) => t.id === 'MinionD3')?.count).toBe(1) // one Lizardman stays
  // barn slots: the counted core rows hold 27 at BP 5 (Purpback BP+2 = 7); 40 slots leave 13, taken in goal order
  expect(pick('coins', { slots: 40 })).toEqual({ Goose: 12, Cinderduck: 1, Retiarius: 'rest' })
  const all = stageComp('endgame', 5, { goal: 'coins' })
  expect(all.find((t) => t.count === 999)?.id).toBe('MinionD7') // Retiarius takes the rest row
  expect(all.find((t) => t.id === 'MinionD3')?.count).toBe(1) // one Lizardman stays
  expect(all.filter((t) => t.optional && !t.pick).length).toBe(1) // Blaken Gold stays dimmed
  expect(stageComp('endgame', 5)).toEqual(stageComp('endgame', 5, { goal: 'nope' })) // no goal: the wiki table as is
  expect(GOALS.map((g) => g.key)).toContain('measured')
})
