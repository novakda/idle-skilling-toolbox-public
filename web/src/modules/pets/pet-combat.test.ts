import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { fullSave } from '../../test-save.test'
import { allPetDmgMultiplier, bubbleGrowth, bubbleSpeed, COOLDOWN, genesisMult, hitValue, monsterHPtot, radKeep, rattleStep, simulateTrek, trekOptions, volley } from './pet-combat'
import { petGenes, petsView, petValueTotals } from './pets'
import { BUNDLE, compile, loadBundle, matchBraces } from '../../../../src/game-eval'

// The save stores what the pet screen last computed: AllPetDmgMultiplier, MonsterHPtot, PetCooldownsREQ (the author's current team).
test('trek damage multiplier, monster HP and cooldowns match the save', async () => {
  const s = await fullSave(), pvt = petValueTotals(s)
  expect(allPetDmgMultiplier(s, { hp: s.PetHP, hpTot: s.PetHPtot, curse: s.PetValueTotals[2], rad: s.PetValueTotals[8] })).toBeCloseTo(s.AllPetDmgMultiplier, 9)
  expect(monsterHPtot(s.MonsterSelected + 5 * (s.MonsterPageSelected - 1))).toBeCloseTo(s.MonsterHPtot, 6)
  for (let k = 1; k <= 21; k++) expect(COOLDOWN[k]! / (1 + pvt[17]! / 100)).toBeCloseTo(s.PetCooldownsREQ[k], 9)
  const r = simulateTrek(s, undefined, 120)
  expect(r.killsPerMin).toBeGreaterThan(0)
  expect(r.notModelled).toEqual([])
})

// The game's own statements (pet scene draw listener @27307482, MonsterHPtot @27241117) run in the sandbox, with fight state
// the save doesn't hold (half HP, curse stacks, Enthusiasm combo, potion 142, skill 69) so every term is exercised.
test.skipIf(!existsSync(`${import.meta.dir}/../../../../${BUNDLE}`))('trek damage multiplier matches the game code mid-fight', async () => {
  const src = loadBundle(`${import.meta.dir}/../../../../${BUNDLE}`), base = await fullSave()
  const pvt = [...base.PetValueTotals]; pvt[2] = 37; pvt[8] = 0.4; pvt[26] = 50
  const genes = petGenes(base); genes[17] = 4; genes[26] = 3
  const s = { ...base, PetHP: base.PetHPtot / 2, PetValueTotals: pvt, PetGenes: genes, PotionLV: Object.assign([...base.PotionLV], { 142: 50 }),
    SkillLevels: Object.assign([...base.SkillLevels], { 69: 10 }), RiftProLvs: Object.assign([...base.RiftProLvs], { 3: 20 }) }
  const end = src.indexOf('t.h.AllPetDmgMultiplier=n}'), start = src.lastIndexOf('if(a.wrapper.enabled){', end) + 'if(a.wrapper.enabled){'.length
  const attrs: Record<string, unknown> = { ...s }
  compile(`function(){ ${src.slice(start, end + 't.h.AllPetDmgMultiplier=n'.length)} }`, attrs, { e: {} })()
  expect(attrs.AllPetDmgMultiplier).not.toBe(base.AllPetDmgMultiplier)
  expect(allPetDmgMultiplier(s, { hp: s.PetHP, hpTot: s.PetHPtot, curse: 37, rad: 0.4, genes, pvt })).toBeCloseTo(attrs.AllPetDmgMultiplier as number, 9)

  const y = src.indexOf('var S=b.engine,y=(1+(b.engine.getGameAttribute("ID")'), expr = src.slice(y + 'var S=b.engine,y='.length, src.indexOf(',A=S.gameAttributes', y))
  for (const id of [1, 18, 77, 250]) expect(monsterHPtot(id)).toBeCloseTo(compile(`function(){ return ${expr} }`, { ID: id })() as number, 6)
})

// One pet per species per team (the author, in game 2026-10-09): no suggested team may repeat a species.
test('trek options never repeat a species', async () => {
  const s = await fullSave(), pets = petsView(s).pets, by = new Map(pets.map((p) => [p.slot, p.name]))
  for (const o of trekOptions(s, pets)) {
    if (o.name === 'Current team') continue
    const sp = Object.values(o.team).map((x) => by.get(x)).filter(Boolean)
    expect(new Set(sp).size, o.name).toBe(sp.length)
  }
})

// Best team searches every legal fighter set and every legal support set, so it beats any other option.
test('best team is at least as good as every option', async () => {
  const s = await fullSave(), opts = trekOptions(s, petsView(s).pets, true), cur = opts.find((o) => o.name === 'Current team')!
  const bt = opts.find((o) => o.name === 'Best team') ?? cur
  for (const o of opts) if (o.name !== 'Best single swap') expect(bt.result.killsPerMin).toBeGreaterThanOrEqual(o.result.killsPerMin - 0.05)
})

// Genes 6-10 (#28): the game's fire loop (@27312868) and on-hit blocks (ActorEvents_1349) run in the sandbox mid-fight
// (Radiation stacks, Rattlin Gun ramp, crit and Genesis stats, combos) against volley/genesisMult/hitValue/bubbleGrowth.
const enemyFight = async () => {
  const base = await fullSave(), pos = base.PetPositions as number[], fs = [1, 2, 3, 4].map((p) => pos[p]!)
  const ab = [[6, 6, 10], [7, 8, 9], [8, 9, 10], [6, 10, 7]], abil = [1, 2, 3].map((j) => [...base[`PetAbility${j}`]])
  fs.forEach((slot, i) => [0, 1, 2].forEach((j) => (abil[j]![slot] = ab[i]![j])))
  const genes = [...petGenes(base)]; Object.assign(genes, { 6: 4, 7: 6, 8: 9, 9: 3, 10: 7, 22: 3 })
  const pvt = [...base.PetValueTotals]; Object.assign(pvt, { 8: 0.6, 9: 0.12, 12: 150, 21: 60, 22: 10 })
  return { ...base, PetAbility1: abil[0], PetAbility2: abil[1], PetAbility3: abil[2], PetGenes: genes, PetValueTotals: pvt }
}
/** Exact expectation over every outcome of the randomInt calls `enumerate` picks (others return `fixed`). */
function expectation(run: (roll: (lo: number, hi: number) => number) => number, enumerate: (lo: number, hi: number) => boolean, fixed: (hi: number) => number) {
  let path: number[] = [], total = 0
  for (;;) {
    const ranges: number[] = []; let d = 0, w = 1
    total += run((lo, hi) => { if (!enumerate(lo, hi)) return fixed(hi); path[d] ??= lo; ranges[d] = hi; w /= hi - lo + 1; return path[d++]! }) * w
    let j = d - 1
    while (j >= 0 && path[j] === ranges[j]) j--
    if (j < 0) return total
    path = path.slice(0, j + 1); path[j]!++
  }
}
const hasBundle = existsSync(`${import.meta.dir}/../../../../${BUNDLE}`)

test.skipIf(!hasBundle)('genes 6-10 fire the values the game fires', async () => {
  const src = loadBundle(`${import.meta.dir}/../../../../${BUNDLE}`), s = await enemyFight(), g = s.PetGenes
  const at = src.indexOf('p.runPeriodically(50,(function(t){if(a.wrapper.enabled){for(t=0;11>t;)')
  const fn = matchBraces(src, src.indexOf('function(t)', at))
  for (const genesis of [false, true]) {
    const cd = Array(22).fill(0); for (const k of [6, 7, 8, 9, 10]) cd[k] = s.PetCooldownsREQ[k]
    const attrs: Record<string, unknown> = { ...s, PetCooldowns: cd, petResetSpin: 0, GlobalPetAttackType: Array(102).fill(0), GlobalPetAttackValue: Array(102).fill(0), PetAttackList: Array(102).fill(0) }
    const A = { wrapper: { enabled: true }, _PetAttackValue: Array(102).fill(0), _PetAttackIterization: 1, _PetDamageMultiplier: 0 }
    const P = { runLater: (_ms: number, f: (x?: unknown) => void) => f(), randomInt: (lo: number, hi: number) => (genesis ? lo : hi) }
    compile(fn, attrs, { e: {}, a: A, p: P })(0)
    const type = attrs.GlobalPetAttackType as number[], val = attrs.GlobalPetAttackValue as number[]
    for (const k of [6, 7, 8, 9, 10]) {
      const got = type.flatMap((t, i) => (t === k ? [val[i]!] : []))
      const want = volley(s, k, g, s.PetValueTotals[9]).flatMap(({ v }) => (genesis ? [v, v * genesisMult(k, g)] : [v]))
      expect(got.length, `move ${k}`).toBe(want.length)
      got.forEach((v, i) => expect(v, `move ${k} shot ${i}`).toBeCloseTo(want[i]!, 9))
    }
  }
})

test.skipIf(!hasBundle)('genes 6-10 on-hit expectation matches the game', async () => {
  const src = loadBundle(`${import.meta.dir}/../../../../${BUNDLE}`), s = await enemyFight(), g = s.PetGenes, M = 1.7, v = 1000
  for (const k of [6, 7, 8, 9, 10]) {
    const at = src.indexOf(`if(${k}==t.actor.getValue("ActorEvents_1349","_PetAttackType")&&427<t.actor.getX())`)
    const vals: Record<string, number> = {}, actor = new Proxy({ getValue: (_: string, key: string) => vals[key], setValue: (_: string, key: string, x: number) => (vals[key] = x), getX: () => 430 }, { get: (t, p) => (t as any)[p] ?? (() => {}) })
    let roll: (lo: number, hi: number) => number = () => 1
    const attrs: Record<string, unknown> = {}
    const run = compile(`function(){ ${matchBraces(src, at)} }`, attrs, { e: {}, t: { actor }, p: { randomInt: (lo: number, hi: number) => roll(lo, hi), createRecycledActor() {}, getActorType() {} } })
    const once = (r: typeof roll) => {
      Object.assign(attrs, { ...s, PetValueTotals: [...s.PetValueTotals], MonsterHP: 1e9, AllPetDmgMultiplier: M, MonsterRespawn: 0, CalibrationValues: [0, 0, 0], PetAttackList: Array(102).fill(0) })
      Object.assign(vals, { _PetAttackType: k, _PetAttackValue: v, _PetAttackID: 1 }); roll = r; run()
      return { dmg: 1e9 - (attrs.MonsterHP as number), pvt: attrs.PetValueTotals as number[] }
    }
    // damage: every crit/Snipe roll enumerated (1-100 rolls fixed at 100: no curse proc, stacks cleared; popup offsets any)
    expect(expectation((r) => once(r).dmg, (lo, hi) => lo === 1 && hi !== 100, (hi) => hi), `move ${k} damage`).toBeCloseTo(hitValue(k, v, g, s.PetValueTotals) * M, 6)
    // Radiation stacks after the hit: every 1-100 roll enumerated
    const keep = k === 8 ? 1 : radKeep(g), add = k === 8 ? v : 0
    expect(expectation((r) => once(r).pvt[8]!, (lo, hi) => lo === 1 && hi === 100, (hi) => hi), `move ${k} radiation`).toBeCloseTo(s.PetValueTotals[8] * keep + add, 9)
    expect(once((_, hi) => hi).pvt[9]! - s.PetValueTotals[9], `move ${k} rattle`).toBeCloseTo(k === 9 ? rattleStep(g) : 0, 9)
  }
  // Bubbler growth in flight (launch block, ActorEvents_1349 update listener): speed and growth per 0.2 s timer
  const at = src.indexOf('6==t.actor.getValue("ActorEvents_1349","_PetAttackType")){for(t.actor.setValue("ActorEvents_1349","_PetAttackValueInitial"')
  for (const i of [0, 1, 2, 3]) for (const copy of [false, true]) {
    const vals: Record<string, number> = { _PetAttackType: 6, _PetAttackValue: 100 }, timers: [number, () => void][] = []
    let vel = 0
    const actor = { getValue: (_: string, key: string) => vals[key], setValue: (_: string, key: string, x: number) => (vals[key] = x), setXVelocity: (x: number) => (vel = x) }
    compile(`function(){ ${matchBraces(src, src.indexOf('{', at))} }`, { ...s }, { e: {}, t: { actor }, p: { runLater: (ms: number, f: () => void) => timers.push([ms, f]) } })()
    expect(10 * vel).toBeCloseTo(bubbleSpeed(s.PetGenes), 9)
    const flight = (427 - ((copy ? 324 : 330) - 82 * i)) / (10 * vel)
    for (const [ms, f] of timers) if (ms / 1000 < flight) f()
    expect(vals._PetAttackValue! / 100, `fighter ${i}${copy ? ' copy' : ''}`).toBeCloseTo(bubbleGrowth(i, s.PetGenes, copy), 9)
  }
})

test.skipIf(!hasBundle)('Boomerang bounce chain matches the game', async () => {
  // Drives the game's Boomerang hit block (@5071842) on one actor through repeated bounces: the value it carries (crit and bounce
  // multipliers compounded by the game code itself) flows into the next hit. Chains are enumerated to depth D over every crit and
  // bounce outcome; a projectile still bouncing at D is closed with hitValue on the value it carries, so the total is exact.
  const src = loadBundle(`${import.meta.dir}/../../../../${BUNDLE}`), base = await enemyFight(), M = 1.7, v = 1000, D = 6
  const at = src.indexOf('if(4==t.actor.getValue("ActorEvents_1349","_PetAttackType")&&427<t.actor.getX())')
  const vals: Record<string, number> = {}
  let x = 430, roll: (lo: number, hi: number) => number = (_, hi) => hi
  const actor = new Proxy({ getValue: (_: string, key: string) => vals[key], setValue: (_: string, key: string, y: number) => (vals[key] = y), getX: () => x, setX: (y: number) => (x = y) }, { get: (t, p) => (t as any)[p] ?? (() => {}) })
  const attrs: Record<string, unknown> = {}
  const run = compile(`function(){ ${matchBraces(src, at)} }`, attrs, { e: {}, t: { actor }, p: { randomInt: (lo: number, hi: number) => roll(lo, hi), runLater() {}, createRecycledActor() {}, getActorType() {} } })
  for (const genes4 of [0, 3, 6]) { // Boomerang tier 0-2 (tier 3 bounces ×2.02 at 54%: unbounded)
    const s = { ...base, PetGenes: Object.assign([...base.PetGenes], { 4: genes4 }) }
    // One hit carrying `value`; rolls = the block's randomInt(1,1000) calls in order (crit, bounce), other rolls at their max.
    const hit = (value: number, rolls: number[]) => {
      Object.assign(attrs, { ...s, PetValueTotals: [...s.PetValueTotals], MonsterHP: 1e9, AllPetDmgMultiplier: M, MonsterRespawn: 0, CalibrationValues: [0, 0, 0], PetAttackList: Array(102).fill(0) })
      Object.assign(vals, { _PetAttackType: 4, _PetAttackValue: value, _PetAttackID: 1 }); x = 430
      let i = 0; roll = (lo, hi) => (lo === 1 && hi === 1000 ? rolls[i++]! : hi); run()
      return { dmg: 1e9 - (attrs.MonsterHP as number), next: vals._PetAttackValue!, bounced: x === 422 }
    }
    // Outcome classes of each randomInt(1,1000) call, found by trying all 1000 values: [representative roll, probability].
    const classes = [0, 1].map((j) => {
      const m = new Map<string, [number, number]>()
      for (let r = 1; r <= 1000; r++) { const o = hit(v, j ? [1000, r] : [r, 1000]), key = `${o.dmg}|${o.next}|${o.bounced}`; const c = m.get(key); if (c) c[1]++; else m.set(key, [r, 1]) }
      return [...m.values()].map(([r, cnt]) => [r, cnt / 1000] as const)
    })
    const chain = (value: number, depth: number): number => {
      let total = 0
      for (const [rc, pc] of classes[0]!) for (const [rb, pb] of classes[1]!) {
        const o = hit(value, [rc, rb])
        total += pc * pb * (o.dmg + (o.bounced ? (depth < D ? chain(o.next, depth + 1) : hitValue(4, o.next, s.PetGenes, s.PetValueTotals) * M) : 0))
      }
      return total
    }
    expect(chain(v, 1), `Boomerang genes ${genes4}`).toBeCloseTo(hitValue(4, v, s.PetGenes, s.PetValueTotals) * M, 6)
  }
})

test('a team with genes 6-10 is fully modelled', async () => {
  const s = await enemyFight(), r = simulateTrek(s, undefined, 120)
  expect(r.notModelled).toEqual([])
  for (const name of ['Bubbler', 'Snipe', 'Rattlin Gun', 'Zeus Bolt']) expect(r.bySource.some((b) => b.name === name && b.share > 0), name).toBe(true)
})
