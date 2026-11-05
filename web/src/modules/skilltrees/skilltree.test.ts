import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../../../src/game-eval'
import { apNodeNext, DAIRY, skillCap, skillCost, skillLock, treeOf } from './skilltree'
import { skillBuys, skillPlan } from '../../skill-plan'
import { fullSave } from '../../test-save.test'

const SAVE = new URL('../../../../data/save.json', import.meta.url).pathname
const haveGame = existsSync(new URL(`../../../../${BUNDLE}`, import.meta.url).pathname)

// The ten slot click listeners of the skill-tree scene, in slot order (actors 82-91; 88 and 89 are swapped on screen).
const ACTORS = [82, 83, 84, 85, 86, 87, 89, 88, 90, 91]
let fns: string[] = []
if (haveGame) {
  const src = loadBundle(new URL(`../../../../${BUNDLE}`, import.meta.url).pathname)
  fns = ACTORS.map((a) => {
    const at = src.indexOf(`addMouseOverActorListener(p.getActor(${a}),(function(t,n)`, 19438000)
    return matchBraces(src, src.indexOf('function', at))
  })
}
/** One click on slot `i` with plenty of points and no refund; returns points spent, or null if the game refused. */
function gameBuy(SL: number[], i: number, AL12 = 0, P158 = 0, dairy = Array(20).fill(1)): number | null {
  const A: Record<string, any> = { SkillTreeType: treeOf(i), SelectedSkill: Array(20).fill(1), PerkToggleMulti: 1, Skillpoints: 1e6, SkillLevels: [...SL],
    AscentionLevel: Object.assign(Array(70).fill(0), { 12: AL12 }), PotionLV: Object.assign(Array(200).fill(0), { 158: P158 }), TankBonusLIST: Array(40).fill(-1),
    LifterLV: Array(30).fill(1), LifterLV2: Array(30).fill(1), LiftersOwnedAtkStrEnd: Array(5).fill(1), ContractProgress: Array(40).fill(0), DairyAisleAchievements: dairy }
  ;(compile(fns[i - 10 * (treeOf(i) - 1) - 1]!, A, { p: inert }) as Function)(5, 0)
  return A.SkillLevels[i] === SL[i]! + 1 ? 1e6 - A.Skillpoints : null
}
const mk = (AL12: number, P158: number, SL: number[], dairy = Array(30).fill(1)) =>
  ({ AscentionLevel: Object.assign(Array(70).fill(0), { 12: AL12 }), PotionLV: Object.assign(Array(200).fill(0), { 158: P158 }), SkillLevels: SL, DairyAisleAchievements: dairy })

test.skipIf(!haveGame)('caps and costs match the game\'s buy listeners (no Bobby, Overcharge 5, Bobby saturated, fractional Bobby)', () => {
  for (const [AL12, P] of [[0, 0], [5, 0], [10, 1e9], [3, 20]] as const) for (let i = 1; i <= 70; i++) {
    const SL = Array(102).fill(1)
    const cap = skillCap(mk(AL12, P, SL), i)
    for (const L of [0, 1, 4, 5, 9, 10, 14, 15, 30, 49, 50]) {
      SL[i] = L
      const spent = gameBuy(SL, i, AL12, P)
      expect([i, L, spent]).toEqual([i, L, L < cap ? skillCost(i, L) : null])
    }
  }
})

test.skipIf(!haveGame)('prerequisites and Infinity Dairy Aisle locks match the game', () => {
  for (let i = 1; i <= 70; i++) for (let o = 10 * (treeOf(i) - 1) + 1; o <= 10 * treeOf(i); o++) {
    if (o === i) continue
    const SL = Array(102).fill(1); SL[i] = 0
    for (const z of [[o], [o, o + 1]]) { // single parents, and the middle slot's "either of two"
      const S2 = [...SL]; for (const x of z) if (x !== i && treeOf(x) === treeOf(i)) S2[x] = 0
      expect([i, z, gameBuy(S2, i) !== null]).toEqual([i, z, !skillLock(mk(0, 0, S2), i)])
    }
  }
  for (const [i, k] of Object.entries(DAIRY)) {
    const SL = Array(102).fill(0), d = Array(30).fill(1); d[k] = 0
    expect(gameBuy(SL, +i, 0, 0, d)).toBeNull()
    expect(skillLock(mk(0, 0, SL, d), +i)).toBe(`Dairy Aisle achievement ${k}`)
  }
})

test.skipIf(!existsSync(SAVE))('live save: levels within caps; plan spends only points held; works on a reactive save', async () => {
  const s = await Bun.file(SAVE).json()
  const rows = skillPlan(s)
  for (const r of rows) expect(r.level).toBeLessThanOrEqual(r.cap)
  const { buys, left } = skillBuys(rows, Math.floor(s.Skillpoints))
  expect(buys.reduce((t, b) => t + b.spent, 0) + left).toBe(Math.floor(s.Skillpoints))
  const viaProxy = skillPlan(reactive(s))
  expect(viaProxy.map((r) => [r.i, r.level, r.cap, r.next, r.impact.length])).toEqual(rows.map((r) => [r.i, r.level, r.cap, r.next, r.impact.length]))
})

test('Infinity cost climbs by one per level; greedy prefers the cheaper step at equal gain', () => {
  expect([0, 1, 14].map((L) => skillCost(61, L))).toEqual([1, 2, 15])
  const row = (i: number, level: number) => ({ i, tree: 7, name: String(i), per: '', level, cap: Infinity, next: level + 1, lock: null, impact: [{ output: 'x', change: 0.02 }], perPoint: 0 })
  const { buys } = skillBuys([row(61, 14), row(62, 2)], 3)
  expect(buys).toEqual([{ i: 62, name: '62', from: 2, to: 3, spent: 3, gain: 0.02, output: 'x' }])
})

test('apNodeNext: slot 37 is the only pre-ascend spend; null once capped', async () => {
  const s = await fullSave(), SL = [...(s.SkillLevels as number[])]
  SL[37] = skillCap(s, 37); expect(apNodeNext({ ...s, SkillLevels: SL })).toBeNull()
  SL[37] = 0; expect(apNodeNext({ ...s, SkillLevels: SL })).toBe(skillCost(37, 0))
})
