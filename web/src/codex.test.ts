import { expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { reactive } from 'vue'
import { fullSave } from './test-save.test'
import { BUNDLE, compile, inert, loadBundle, matchBraces } from '../../src/game-eval'
import { codexInit } from '../../src/derive-codex'
import { petsView } from './pets'
import { awaySources, claimPick, nextTiers, capsuleIds, capsuleNeed, claim, codex, genes, labAmount, passiveText, rewards, species, SPECIES } from './codex'
import data from './data/codex.json'
import lab from './data/lab.json'

const bundle = `${import.meta.dir}/../../${BUNDLE}`
const src = existsSync(bundle) ? loadBundle(bundle) : ''
/** Game attributes: the save's, plus a zero list for anything the snippet reads that the save lacks. */
const attrs = (s: Record<string, unknown>) => new Proxy({ ...s } as Record<string, any>, { get: (t, k: string) => (k in t ? t[k] : (t[k] = Array(400).fill(0))) })

test('stored values: PetRewardList flags are reached levels, combos found cover the current team tiers', async () => {
  const s = await fullSave()
  for (const r of rewards(s)) if (r.held) expect(r.reached).toBe(true)
  for (const g of genes(s)) for (const c of g.combos) if (c.t <= g.tier) expect(c.found).toBe(true)
  // Decoding: gene g tier t is GeneticComboFound[1 + 3(g − 1) + t − 1] (Boomerang = 4: [10], Life Leech = 5: [13]).
  const t = { ...s, GeneticComboFound: Object.assign(Array(80).fill(0), { 10: 1, 13: 1, 34: 1 }) }
  expect(genes(t).filter((g) => g.combos[0]!.found).map((g) => g.name)).toEqual(['boomerang', 'life leech', 'perception'])
})

test('capsule passive list matches the lab scene\'s own copy (lab.json, SceneEvents_45)', () => {
  // Six species differ between the two scenes' copies (Codex → lab): dog, platz, sentinel y, occulon, golden boy, poopy g.
  expect(SPECIES.filter((id) => lab.petBuff[id] != null && Number(data.buffAmount[id]) !== lab.petBuff[id])).toEqual([12, 43, 75, 78, 81, 84])
  expect([12, 43, 75, 78, 81, 84, 19].map(labAmount)).toEqual([3, 8, 10, 12, 150, 5, null])
  expect(passiveText(19, 2)).toBe('+60% brewing speed')
  expect(passiveText(12, 10)).toBe('+8% pachi balls') // round((2·10)^0.7)
})

test.skipIf(!src)('codex.json is what the Codex init builds', () => {
  const h = codexInit(src, attrs({ HatcheryLV: 999, TrekkingLV: 999, ResearchLV: 999 }))
  expect(data.name).toEqual(h._PetINDEXtoNAME)
  expect(data.gene).toEqual(h._specificGENE)
  expect(data.buffType).toEqual(h._PetBuffType)
  expect(data.rewards.map((r) => r[1])).toEqual((h._TaskBonus as string[]).slice(0, 25).map((x) => x.replace(/_+/g, ' ').trim().toLowerCase()))
})

test.skipIf(!src)('Codex init on the save: reward flags, unlocked genes and the claim timer equal the port', async () => {
  const s = await fullSave()
  const A = attrs({ ...s, PetRewardList: Array(40).fill(0) }), h = codexInit(src, A)
  const r = rewards(s)
  expect(r.map((x) => A.PetRewardList[x.k])).toEqual(r.map((x) => (x.reached ? 1 : 0)))
  const g = genes(s)
  expect(g.map((x) => h._GeneticUnlocked[x.id])).toEqual(g.map((x) => (x.unlocked ? 1 : 0)))
  // The init stamps RightNowZone[21] with the clock and takes the time since the last visit off the timer (it also restamps
  // LastVisitedZone[21] in the shared array, so the port reads a fresh copy of the save).
  const c = claim(await fullSave(), A.RightNowZone[21])
  expect(c.timer).toBeCloseTo(A.PetClaimTimer, 6)
  // Levels below a threshold leave the flag unset.
  const B = attrs({ ...s, PetRewardList: Array(40).fill(0), HatcheryLV: 9, TrekkingLV: 4, ResearchLV: 9 })
  codexInit(src, B)
  expect(B.PetRewardList.slice(1, 25)).toEqual([1, ...Array(23).fill(0)])
})

test.skipIf(!src)('capsule level-up: the lab\'s 500 ms tick levels exactly at capsuleNeed()', () => {
  const at = src.indexOf('runPeriodically(500,(function(t){if(a.wrapper.enabled){for(t=0;80>t;)')
  const fn = matchBraces(src, src.indexOf('function', at))
  for (const lv of [0, 4, 47]) for (const [gap, up] of [[0.6, false], [0.4, true]] as const) {
    const A = attrs({}), need = capsuleNeed(lv)
    A.PetCapsuleLV[13] = lv; A.PetPassiveDays[13] = need - gap
    const a = new Proxy({ wrapper: { enabled: true }, _PetINDEX: [0, 13, 0, 0, 0, 0, 0], _TankRPbonusCOLOUR: Array(10).fill(1), _TankRPbonusALL: 1, _OpenValues: Array(10).fill(1) } as any,
      { get: (t, k: string) => (k in t ? t[k] : inert) })
    ;(compile(fn, A, { a }) as Function)(0)
    expect(A.PetCapsuleLV[13]).toBe(up ? lv + 1 : lv)
    expect(A.PetPassiveDays[0]).toBe(2.5) // the 5 empty capsules bank days on poop (id 0)
  }
})

test.skipIf(!src)('capsule species: the lab maps PetsFighting[21..26] names to the Codex ids', async () => {
  const i = src.indexOf('"slime"==""+f.string(b.engine.getGameAttribute("PetsFighting")[pe+21])')
  const chain = [...src.slice(i, i + 20000).matchAll(/"(\w+)"==""\+f\.string\(b\.engine\.getGameAttribute\("PetsFighting"\)\[pe\+21\]\)\?this\._PetINDEX\[pe\+1\]=(\d+)/g)]
  expect(chain.length).toBe(59)
  for (const m of chain) expect(data.name[+m[2]!]).toBe(m[1]!)
  const s = await fullSave()
  expect(capsuleIds(s).filter((x) => x > 0).length).toBeGreaterThan(0)
})

test('the page model runs on the reactive save Vue passes (structuredClone fails on proxies)', async () => {
  const s = await fullSave()
  const c = codex(reactive(s))
  expect(c.recorded).toBe(SPECIES.filter((id) => (s.PetUnlocked as number[])[id]! > 0).length)
})

test('claimPick: a recorded carrier of the closest gene whose next combo is not yet found', async () => {
  const s = await fullSave(), p = claimPick(s)
  if (!p) return
  expect(p.gene.recordedCarriers.length).toBeGreaterThan(0)
  expect(p.gene.combos[p.gene.tier]!.found).toBe(false)
  for (const g of nextTiers(s).combos) if (g.recordedCarriers.length && !g.combos[g.tier]!.found) expect(g.toNext).toBeGreaterThanOrEqual(p.gene.toNext)
})

test('away banking rate: the rebuilt TankBonusLIST[45] equals the stored one, and away times divide by the rate', async () => {
  const s = await fullSave(), a = awaySources(s)
  expect(a.tank45).toBeCloseTo(s.TankBonusLIST[45], 9)
  const base = a.rows[0]!.factor
  expect(a.rate).toBeCloseTo(base * s.TankBonusLIST[45], 9)
  for (const x of species(s)) expect(x.awayLeft).toBeCloseTo(x.left / a.rate, 6)
})

test('claimPick: a species already on the team is swapped in place of its twin, never added alongside (the author, 2026-10-25)', async () => {
  const s = await fullSave(), p = claimPick(s)
  if (!p?.owned) return
  const v = petsView(s), team = v.pets.filter((x) => x.group === 'Trekking'), pick = v.pets.find((x) => p.text.includes(`${x.name} #${x.slot} `))!
  const twin = team.find((x) => x.species === pick.species)
  if (twin) expect(p.text).toContain(`in place of your ${twin.name} #${twin.slot}`)
  else expect(p.text).not.toContain('in place of')
})

test('claimPick plans every swap, puts gene carriers in supports, and lists what to put back', async () => {
  const { claimPick } = await import('./codex')
  const f = Bun.file(new URL('../../data/save.json', import.meta.url))
  if (!(await f.exists())) return
  const r = claimPick(await f.json())
  if (!r?.owned) return
  expect(r.text).toMatch(/1\) your .+ #\d+ L\d+ \(idle\) (in place of your .+ \((Fighter|Support) \d\)|in the empty (Fighter|Support) \d slot) \+\d/)
  if (/in place of/.test(r.text)) expect(r.why).toMatch(/then put back: .+ #\d+ to (Fighter|Support) \d/)
})
