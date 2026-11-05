import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { fullSave } from './test-save.test'
import { BESTIARY, progress, QOXZUL_HP, SKULLS, skullTier } from './bestiary'
import { monsterName } from './modules/fighting/fighting'
import { bossHP } from './modules/raids/raids'

const find = (name: string, where = '') => BESTIARY.find((r) => r.name === name && r.where.includes(where))!

test('one row per monster: 230 zone, Qoxzul, 12 raid, 16 Asylum, 75 crusade', () => {
  const by = BESTIARY.reduce((m, r) => ((m[r.kind] = (m[r.kind] ?? 0) + 1), m), {} as Record<string, number>)
  expect(by).toEqual({ zone: 230, special: 1, raid: 12, asylum: 16, crusade: 75 })
  // a zone row's name is the fight scene's monsterName at both ends of its range
  for (const r of BESTIARY.filter((x) => x.kind === 'zone')) expect([monsterName(r.m!, r.stages![0]), monsterName(r.m!, r.stages![1])]).toEqual([r.cardName, r.cardName])
})

test('pinned rows: ranges, HP and gold agree with the stored fight values (fixture: The Bog level 5, skill 16 on)', async () => {
  const s = await fullSave(), m = s.currentfightmode, L = s.mapleLV
  const r = BESTIARY.find((x) => x.kind === 'zone' && x.m === m && x.stages![0] <= L && L <= x.stages![1])!
  const i = L === r.stages![0] ? 0 : L === r.stages![1] ? 1 : -1
  if (i >= 0) {
    expect(r.hp[i]! * (1 + 4 * (s.SkillActive?.[16] ?? 0)) / s.mapleexpREQ).toBeCloseTo(1, 12) // skill 16 ×5 @31804850
    expect(progress(s, r).gold![i]! / s.defaultgold).toBeCloseTo(1, 12)
  }
  expect(find('Mushroom').hp[0]).toBe(50) // Grasslands stage 1 (@31775542)
  expect(find('Halluccino').where).toBe('The Bog stages 10–12')
  expect(find('Tee Hee').where).toBe('Oblivion stages 209–270') // Oblivion stops at mapleLV 269 (@7631307)
  expect(BESTIARY.find((x) => x.card === 16)!.stages).toEqual([15, 98]) // Grasslands stage 100 is Qoxzul
  expect(find('King', 'Nightmare').hp[0]).toBe(bossHP('raid', 0, 10))
  expect(find('Gorshank', 'Z').cardName).toBe('Gorshank Z')
  expect(find('The Bruiser').where).toBe('Crusade 1 (The Bruiser) boss')
  expect(find('Bandit Shroom').hp[0]).toBe(2e4) // crusade 1 BaseHP, stage 1, difficulty 1
})

const bundle = `${import.meta.dir}/../../data/game/asar/distBuild/static/game/Qno2x.js`
test.skipIf(!existsSync(bundle))('Qoxzul HP is the expression its drawing listener writes (@31848281)', () => {
  const src = readFileSync(bundle, 'utf8'), a = src.indexOf('t=((Math.floor(Math.pow(20,2.2)'), b = src.indexOf(',r=', a)
  expect(a).toBeGreaterThan(0)
  expect(QOXZUL_HP).toBe(new Function(`return ${src.slice(a + 2, b)}`)())
  expect(src.slice(b, b + 600)).toContain('setReserved("defaultgold",666)')
})

test('kill skulls: tier thresholds from the fight scene (@7666605 ff.), icon frames 30 + tier of sprite 1236', async () => {
  expect(SKULLS.map((s) => s.min)).toEqual([0, 99999, 999999.9, 9999999.9, 99999999.9])
  expect([0, 99998, 99999, 1e5, 999999, 1e6, 9999999, 1e7, 99999999, 1e8, 1e12].map(skullTier)).toEqual([0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4])
  const maps = JSON.parse(await Bun.file(`${import.meta.dir}/data/icon-maps.json`).text())
  expect(Object.values(maps.skull)).toEqual([0, 1, 2, 3, 4].map((t) => ['graphics/1x/sprite-1236-0.png', 30 + t, 7, 7]))
})
