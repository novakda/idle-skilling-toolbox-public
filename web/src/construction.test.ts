import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from './test-save.test'
import { BUNDLE, blockHost, compile, loadBundle, matchBraces } from '../../src/game-eval'
import { builders, builderSpeed, cost, DOMAINS, EFFECTS, unlocks, expPerHour, FOIL_BOSSES, IDS, lv, machines, machineSpeed, maxLv, name, nextReq, prereq, treasureName, viaMachines } from './construction'
import { FOIL } from './cards-calc'
import data from './data/construction.json'
import wiki from '../../data/wiki/datasets/construction.json'
import spelunking from '../../data/wiki/datasets/spelunking.json'
import mining from '../../data/wiki/datasets/mining.json'

const capture = (day: string, page: string) => new URL(`../../data/captures/${day}/${page}/attrs.json`, import.meta.url).pathname
// Construction level 15 (2026-10-05) and 16 (2026-10-08), local captures, gitignored.
const C05 = capture('2026-10-05', 'realm'), C08 = capture('2026-10-08', 'pet-inv-buy')
const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

test('stored values: one builder per Builder Bros level plus the first, one machine per Machinery level', async () => {
  const s = await fullSave()
  expect(builders(s).length).toBe(1 + lv(s, 2))
  expect(machines(s).length).toBe(lv(s, 5))
})

test.skipIf(!existsSync(C05) || !existsSync(C08))('level-up requirement: level 15 (10-05) → 16 (10-08)', async () => {
  const a = await Bun.file(C05).json(), b = await Bun.file(C08).json()
  expect([a.ConstructionLV, b.ConstructionLV]).toEqual([15, 16])
  expect(nextReq(a.ConstructionREQ, 16)).toBeCloseTo(b.ConstructionREQ, 9)
})

test('names, level caps and prerequisites match the wiki tables (40 buildings)', () => {
  const rows = wiki as { Upgrade: string; Prerequisite: string; 'Max Lvl': number }[]
  expect(IDS).toHaveLength(40)
  for (const r of rows) {
    const i = IDS.find((j) => key(name(j)) === key(r.Upgrade))!
    expect(i).toBeGreaterThan(0)
    // The wiki gives Croppy Notes max 4, but its own effect text ("5/10 new crops") has 2 steps, as _ConstructLvMAX[29] = 2.
    expect(maxLv(i)).toBe(r.Upgrade === 'Croppy Notes' ? 2 : r['Max Lvl'])
    const p = prereq(i), first = DOMAINS.some((d) => d.flag === p)
    expect(first ? '-' : key(name(p))).toBe(r.Prerequisite === '-' ? '-' : key(r.Prerequisite))
  }
})

test('treasure and ore names match the wiki lists', () => {
  const t = (spelunking as any[]).filter((r) => r._section === 'Treasure').map((r) => r.Name)
  expect(Array.from({ length: 28 }, (_, i) => treasureName(i + 1))).toEqual(t)
  expect((data as any).ore.slice(1)).toEqual((mining as any[]).filter((r) => r._section === 'Ores').map((r) => r.Ores_2))
})

test('machines: a missing treasure is made from the nearest spare higher one, 3 per step', () => {
  const s = { ConstructLV: Object.assign([], { 61: 1 }), TreasureOwned: [0, 0, 2, 16, 0, 5] }
  const c = { parts: [{ c: 2, q: 22, held: 2 }, { c: 5, q: 3, held: 5 }], req: 1, enough: false } as any
  expect(viaMachines(s, c)).toEqual([{ from: 3, to: 2, take: 20 / 3, give: 20 }])
  // Only 1 Diamond-tier step above is kept back: the 5 Heavy Bars the cost also takes stay, so 70 short can't be made.
  expect(viaMachines(s, { ...c, parts: [{ c: 2, q: 72, held: 2 }, { c: 5, q: 5, held: 5 }] })).toBeNull()
  expect(viaMachines({ ...s, ConstructLV: [] }, c)).toBeNull() // no machine
})

// ---- The game's own code in the sandbox (dev only: needs the extracted bundle).
const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
const scene = () => src.indexOf('"scripts.SceneEvents_50"')
const fnAt = (needle: string) => { const i = src.indexOf(needle, scene()); if (i < 0) throw new Error(`anchor moved: ${needle}`); return matchBraces(src, src.indexOf('function', i)) }
const sample = (i: number) => [...new Set([0, 1, Math.floor(maxLv(i) / 2), maxLv(i) - 1])].filter((L) => L >= 0 && L < maxLv(i))

test.skipIf(!src)('start costs and build points: the cost listeners and ConstructBuildREQ, every building, every level', async () => {
  const { costListeners, runCost } = await import('../../src/derive-construction')
  const fns = costListeners(), s = await fullSave()
  for (const i of IDS) for (let L = 0; L < maxLv(i); L++) {
    const [c1, q1, c2, q2, req] = runCost(i, L, fns), c = cost(s, i, L)!
    const want = [[c1, q1], [c2, q2]].filter(([k]) => k).map(([k, q]) => [k, q! < 1e3 ? Math.floor(q!) : q])
    expect(c.parts.map((p) => p.c)).toEqual(want.map(([k]) => k!))
    c.parts.forEach((p, j) => expect(p.q === want[j]![1] || Math.abs(p.q / want[j]![1]! - 1) < 1e-12).toBe(true))
    expect(c.req / req!).toBeCloseTo(1, 12)
  }
})

test.skipIf(!src)('the 100 ms builder tick caps progress at the same build points (its own cost-exponent table)', () => {
  const tick = fnAt('p.runPeriodically(100,(function(t){if(a.wrapper.enabled)for(var n=0;10>n;){var r=n++,i=b.engine.getGameAttribute("ConstructTasks")[r+1]')
  for (const i of IDS) for (const L of sample(i)) {
    const A: Record<string, any> = { ConstructTasks: Object.assign(Array(82).fill(0), { 1: i }), ConstructLV: Object.assign(Array(80).fill(0), { [i]: L }), ConstructBuildProgress: Array(51).fill(0) }
    const Be = blockHost(src, A) as any
    Be._customBlock_BuilderSpeedHR = () => 1e30
    ;(compile(tick, A, { Be }) as Function)(0)
    expect(A.ConstructBuildProgress[i] / cost({}, i, L)!.req).toBeCloseTo(1, 12)
  }
})

test.skipIf(!src)('builder and machine speed equal BuilderSpeedHR / MachineSpeedHR on the save and on changed inputs', async () => {
  const s = await fullSave()
  const variants = [{}, { MTXbuildersPurchased: 3 }, { MTXbuildersPurchased: 10, SmithingItemLevel: Object.assign([...s.SmithingItemLevel], { 91: 2500 }) },
    { ConstructLV: Object.assign([...s.ConstructLV], { 15: 7, 18: 4, 55: 3, 63: 2 }), RiftProLvs: Object.assign([...s.RiftProLvs], { 6: 20 }), CbonusTunnels: [12, 0, 0, 9, 0, 0, 0, 0, 0], PotionLV: Object.assign([...s.PotionLV], { 141: 40 }) }]
  for (const v of variants) {
    const t = { ...structuredClone(s), ...v }
    for (let k = 1; k <= 10; k++) { const A = { ...t, aa8: k }; expect(builderSpeed(t, k) / (blockHost(src, A) as any)._customBlock_BuilderSpeedHR()).toBeCloseTo(1, 12) }
    for (let m = 1; m <= 8; m++) { const A = { ...t, aa7: m }; expect(machineSpeed(t, m) / (blockHost(src, A) as any)._customBlock_MachineSpeedHR()).toBeCloseTo(1, 12) }
  }
})

test.skipIf(!src)('Construction EXP per hour equals the 1 s tick; the draw listener levels up with the ported requirement', async () => {
  const s = await fullSave(), tick = fnAt('p.runPeriodically(1e3,(function(t){if(a.wrapper.enabled){t=b.engine;var n=b.engine.getGameAttribute("ConstructLV")[39]')
  for (const levels of [{}, { 3: 37, 15: 12, 27: 9, 39: 21 }]) {
    const t = { ...structuredClone(s), ConstructLV: Object.assign([...s.ConstructLV], levels), CbonusTunnels: [0, 0, 0, 0, 0, 0, 0, 0, 15], ConstructionEXP: 0 }
    ;(compile(tick, t) as Function)(0)
    expect((t.ConstructionEXP * 3600) / expPerHour(t)).toBeCloseTo(1, 12)
  }
  const draw = fnAt('addWhenDrawingListener(null,(function(t,n,r,i){a.wrapper.enabled&&b.engine.getGameAttribute("ConstructionEXP")>=')
  const A: Record<string, any> = { ConstructionLV: 16, ConstructionEXP: 6000, ConstructionREQ: 5339.6409098620625, Skillpoints: 0 }
  ;(compile(draw, A) as Function)(0, 0, 0, 0)
  expect([A.ConstructionLV, A.Skillpoints, A.ConstructionEXP]).toEqual([17, 1, 6000 - 5339.6409098620625])
  expect(A.ConstructionREQ).toBeCloseTo(nextReq(5339.6409098620625, 17), 9)
})

test.skipIf(!src)('Foil Cards / Foil Bosses sets: the owned-items listener counts exactly these cards at 5 stars', () => {
  const release = fnAt('addMouseReleasedListener((function(t){if(a.wrapper.enabled){for(var n=0;28>n;){var r=n++;a._ItemsOWNED[r+1]')
  const count = (i: number, L: number, cards: number[]) => {
    const A: Record<string, any> = new Proxy({ ConstructSelected: i, ConstructLV: Object.assign(Array(80).fill(0), { [i]: L }), CardLevels: cards } as Record<string, any>, { get: (t, k: string) => (k in t ? t[k] : []) })
    const host = new Proxy({ wrapper: { enabled: true }, _ItemsOWNED: Array(110).fill(0) } as Record<string, any>, { get: (t, k: string) => (k in t ? t[k] : []) })
    ;(compile(release, A, { a: host }) as Function)(0)
    return host._ItemsOWNED[66]
  }
  for (const [i, sets] of [[8, FOIL.map(([a, b]) => [a, b])], [21, FOIL_BOSSES]] as [number, number[][]][]) sets.forEach(([a, b], L) => {
    const lvl = (inSet: number, out: number) => Array.from({ length: 600 }, (_, id) => (id >= a! && id <= b! ? inSet : out))
    expect(count(i, L, lvl(5, 0))).toBe(b! - a! + 1)
    expect(count(i, L, lvl(4, 5))).toBe(0)
    expect(cost({}, i, L)!.parts.find((p) => p.c === 66)!.q).toBe(b! - a! + 1) // the set is the whole cost
  })
})

test('buildPlan: the goal\'s level-0 prerequisite chain root first, running hours, shared currency counted once, reactive save', async () => {
  const { reactive } = await import('vue')
  const { buildPlan, goals } = await import('./construction')
  const s = reactive(await fullSave())
  const { plan, goals: all } = buildPlan(s)
  expect(all.length).toBe(goals(s).length)
  for (const g of all) {
    expect(g.steps.at(-1)!.i).toBe(g.goal)
    g.steps.forEach((st, k) => {
      expect(lv(s, st.i)).toBe(0)
      // each step's prerequisite is either built or the step before it (or the domain flag)
      if (k) expect(prereq(st.i)).toBe(g.steps[k - 1]!.i)
      else expect(lv(s, prereq(st.i)) >= 1 || prereq(st.i) === g.domain.flag).toBe(true)
      expect(st.total).toBeCloseTo(g.steps.slice(0, k + 1).reduce((t, x) => t + x.hours, 0), 9)
    })
  }
  expect(plan).toBe(all[0]!)
  // a currency two steps both pay: the later step sees what you hold less what the earlier steps take
  for (const g of all) g.steps.forEach((st, k) => st.parts.filter((x) => !x.check).forEach((x) => {
    const before = g.steps.slice(0, k).flatMap((y) => y.parts).filter((y) => y.c === x.c && !y.check).reduce((t, y) => t + y.q, 0)
    expect(x.held).toBe(Math.max(cost(s, st.i, 0)!.parts.find((y) => y.c === x.c)!.held - before, 0))
  }))
})

// ---- Unlocks and effects of the buildings that used wiki text (#2637): each pinned to the game source, compacted (casts -> N()).
const compact = (x: string) => x.replace(/"number"==typeof (\w+)\?c\.__cast\(\1,k\):"number"==typeof \1&&\(0\|\1\)===\1\?c\.__cast\(\1,l\):"boolean"==typeof \1\?c\.__cast\(\1,h\)\?1:0:"string"==typeof \1\?parseFloat\(\1\):parseFloat\(f\.string\(\1\)\)/g, 'N($1)')
let csrc = ''
const near = (anchor: string, after = 900) => { csrc ||= compact(src).replace(/b\.engine\.getGameAttribute/g, 'G'); const i = csrc.indexOf(anchor); if (i < 0) throw new Error(`anchor moved: ${anchor}`); return csrc.slice(i, i + after) }
const L = (i: number) => `("ConstructLV")[${i}]`
const sv = (lvls: Record<number, number>, extra: object = {}) => ({ ConstructLV: Object.assign([], lvls), ...extra })

test.skipIf(!src)('crop types: id < 5·(Dirts Ahoy + Croppy Notes) + 21 (@3175632); flower types: id < 6·(Bucketeers + Plant Em All) + 24 (@3441480)', () => {
  expect(near(L(14))).toMatch(/\[29\];t<5\*a\+5\*\(null==n\?0:N\(n\)\)\+21\?/)
  expect(near(L(16), 1400)).toMatch(/\[30\];if\(sa<6\*ga\+6\*\(null==fa\?0:N\(fa\)\)\+24\)/)
  expect(EFFECTS[14]!.now(sv({ 14: 1, 29: 2 }), 1)).toContain('36 crop types') // 21 + 5·3
  expect(EFFECTS[30]!.now(sv({ 16: 2, 30: 1 }), 1)).toContain('42 flower types') // 24 + 6·3
  expect(unlocks(14, 0)).toContain('+5 crop types'); expect(unlocks(30, 1)).toContain('+6 flower types'); expect(unlocks(30, 2)).toBeNull()
})

test.skipIf(!src)('smithing: pages 11 and 12 open 2 items per level of Smithy Cert (@8867294) / Hammer Time (@8871352)', () => {
  near(L(20)) // loads the compacted source
  expect(csrc).toContain('11==G("SmithingPageSelected")?2*(null==(e=G("ConstructLV")[20])?0:N(e))>=t.actor.getCurrentFrame()-8*(G("SmithingPageSelected")-1)')
  expect(csrc).toContain('12==G("SmithingPageSelected")&&(2*(null==(e=G("ConstructLV")[31])?0:N(e))>=t.actor.getCurrentFrame()-8*(G("SmithingPageSelected")-1)')
  expect(EFFECTS[20]!.now(sv({}), 3)).toContain('6 items'); expect(unlocks(31, 0)).toContain('+2 smithing items')
})

test.skipIf(!src)('new potions: the new-potion roll is capped at min(3·(Brew Laddy + Brew Man + Brew Maestro + Brew Bobby levels) + 121, 169) (@3795400)', () => {
  near(L(17))
  expect(csrc).toContain('r=null==(r=G("ConstructLV")[17])?0:N(r),i=null==(i=G("ConstructLV")[26])?0:N(i),o=null==(o=G("ConstructLV")[32])?0:N(o);var s=G("ConstructLV")[40];s=null==s?0:N(s),a=a.gameAttributes,n=Math.max(Math.round(Math.min(n,Math.min(3*r+(3*i+(3*o+3*s))+121,169))),122)')
  for (const i of [17, 26, 32, 40]) expect(maxLv(i)).toBe(4)
  expect(EFFECTS[26]!.now(sv({ 17: 2, 32: 1 }), 1)).toContain('potion id 133') // 121 + 3·(2 + 1 + 1)
  expect(EFFECTS[40]!.now(sv({ 17: 4, 26: 4, 32: 4 }), 4)).toContain('potion id 169'); expect(unlocks(32, 3)).toBe('+3 new potions'); expect(unlocks(32, 4)).toBeNull()
})

test.skipIf(!src)('Ni Ni Shrubbery learning speed ×(1 + L/135) (@2653820); Big Boy Bags +L max bag items (@2659847), min +L/1.35 (@2657880)', () => {
  expect(near('Be._customBlock_SpelunkerLearnperHour', 4000)).toContain('t=null==(t=G("ConstructLV")[27])?0:N(t)')
  expect(near('Be._customBlock_SpelunkerLearnperHour', 4000)).toContain('return(1+t/135)*')
  expect(near('Be._customBlock_MaxBagItems', 1800)).toContain('Math.floor(1.5+(e+t+')
  expect(near('Be._customBlock_MinimumBagItems', 1800)).toContain('Math.floor(e/1.35+')
  expect(EFFECTS[27]!.now({}, 27)).toContain('×1.2')
})

test.skipIf(!src)('Bogo Offer ÷1.35 per level (@25990883); Mama Mia (1 + L/8)^0.3 per 20 Apothecary levels (@24879706)', () => {
  near(L(35))
  expect(csrc).toMatch(/G\("ConstructLV"\)\[35\],(\w+)=null==\w+\?0:N\(\w+\),\w+=\w+\.gameAttributes,\w+=\w+\*\w+\*\w+\*Math\.pow\(\.7407407407407407,\1\);null!=e\.PbonusPotionCostRedux/)
  expect(1 / 1.35).toBeCloseTo(0.7407407407407407, 15)
  expect(csrc).toContain('Re=G("ConstructLV")[38];Fe[2]=Math.pow(Math.pow(1+(null==Re?0:N(Re))/8,.3),G("ApothecaryLV")/20)')
  expect(EFFECTS[35]!.now({}, 2)).toContain('×0.5487'); expect(EFFECTS[38]!.now({ ApothecaryLV: 40 }, 8)).toContain(`×${+((2 ** 0.3) ** 2).toPrecision(4)}`)
})

test.skipIf(!src)('Prosperity ×1.15^L minion cash (@6405688); Repentance 3·L% daily 1-3 h away time (@30852121); Stoicism ×(1 + 5L/100) ShrineResetQTY (@6422651); Fury min(1.1, 1 + L/100)^afterlives (@6399150)', () => {
  near(L(43))
  expect(csrc).toContain('Pt=G("ConstructLV")[43],Ot=Math.max(1,Math.pow(1.15,null==Pt?0:N(Pt)))')
  expect(csrc).toContain('<3*(null==(n=G("ConstructLV")[45])?0:N(n))/100&&p.runLater(5e3,(function(t){var a=b.engine;t=G("QuitTime")-3600*p.randomInt(1,3)')
  expect(csrc).toContain('Zn=G("ConstructLV")[47];return Vn*Kn*Math.max(1,1+5*(null==Zn?0:N(Zn))/100)')
  expect(csrc).toMatch(/Ze=G\("ConstructLV"\)\[48\],ze=Math\.min\(1\.1,1\+\(null==Ze\?0:N\(Ze\)\)\/100\),Qe=G\("RealmStuff"\)\[23\],qe=Ke\*Math\.max\(1,Math\.pow\(ze,/)
  expect(EFFECTS[43]!.now({}, 2)).toContain('×1.322'); expect(EFFECTS[45]!.now({}, 5)).toContain('15%')
  expect(EFFECTS[47]!.now({}, 4)).toContain('×1.2'); expect(EFFECTS[48]!.now({ RealmStuff: Object.assign([], { 23: 3 }) }, 50)).toContain('×1.1 per afterlife')
})
