import { expect, test } from 'bun:test'
import { reactive } from 'vue'
import { gemPlan, gemShop, per100 } from './gems'

test('gem shop reads owned counts and prices the doublers', () => {
  const g = gemShop({ sparklecoin: 656, FunnyHatPurchased: 2, MTXdoubleAP: 1, MTXdoubleBP: 5 })
  expect(g.gems).toBe(656)
  const by = Object.fromEntries(g.items.map((i) => [i.name, i]))
  expect(by['Funny Hat']!.next!.gain).toBe(1)
  expect(by['2x AP']!.next!.gain).toBe(0.5) // multiplier is 1 + purchases
  expect(by['2x BP']!.owned).toBe(by['2x BP']!.max) // maxed at 5
})

test('Mystical Tiller prices armor 40 on the next farmer (tiller N → farmer N)', async () => {
  const save = await Bun.file(new URL('../../../../data/save.json', import.meta.url)).json() // owns 2: farmers 1–2 at armor 40
  const t = gemShop(save).items.find((i) => i.name === 'Mystical Tiller')!
  // Live save: the next farmer and its share of away Tilling move as the author buys tillers and value upgrades (FarmingExpGiven, bought
  // per farmer @12436935), so derive them. Away term per farmer = EG·(1+armor/40)·(0.25·round(armor/10)+1) (speed/BONUS/boost are the
  // same for every farmer and cancel); armor 40 multiplies the next farmer's term by 4 / that factor. 2026-10-04: farmer 3, +4.4%.
  const f = Number(save.MTXmysticTillersPurchased) + 1, a = save.FarmerArmor[f], w = (x: number) => (1 + x / 40) * (0.25 * Math.round(x / 10) + 1)
  const term = (i: number) => save.FarmingExpGiven[i] * w(save.FarmerArmor[i])
  const all = [1, 2, 3, 4, 5, 6, 7, 8].filter((i) => save.FarmerLV1[i]).reduce((x, i) => x + term(i), 0)
  expect(t.next!.what).toStartWith(`farmer ${f} armor ${a} → 40`)
  expect(t.next!.gain).toBeCloseTo((term(f) * (w(40) / w(a) - 1)) / all, 9) // away; on screen differs (crossing speed 100)
})

test('gemPlan: priced open items once each, best per 100 gems first, running total and shortfall; reactive save', () => {
  const q = gemPlan(gemShop(reactive({ sparklecoin: 250, FunnyHatPurchased: 2, MTXdoubleAP: 1, MTXdoubleBP: 5 })))
  expect(q.map((x) => x.item.name).slice(0, 2)).toEqual(['Funny Hat', '2x AP'])
  expect(q.some((x) => x.item.name === '2x BP')).toBe(false) // maxed
  let t = 0
  q.forEach((x, k) => {
    t += x.item.cost
    expect([x.total, x.short]).toEqual([t, Math.max(0, t - 250)])
    expect(per100(x.item)).toBeGreaterThan(0)
    if (k) expect(per100(q[k - 1]!.item)).toBeGreaterThanOrEqual(per100(x.item))
  })
})

// ---- The game's buy handler: item number → cost and cap (dev only: needs the extracted bundle).
import { existsSync } from 'fs'
import { BUNDLE, loadBundle } from '../../../../src/game-eval'
const bundle = `${import.meta.dir}/../../../../${BUNDLE}`
const game = existsSync(bundle) ? loadBundle(bundle) : ''
/** Text of item N's branch in the buy handler (@14665302-@14741983): from "N==…MTXbuyableSELECTED" to the next item's. */
const branch = (num: number) => {
  const i = game.indexOf(`${num}==b.engine.getGameAttribute("MTXbuyableSELECTED")`, 14_665_000)
  if (i < 0) throw new Error(`gem item ${num} branch moved: game update?`)
  const j = game.indexOf('==b.engine.getGameAttribute("MTXbuyableSELECTED")', i + 60)
  return game.slice(i, Math.min(j < 0 ? i + 4000 : j, i + 4000))
}
// [shop item, game item number, cap attribute, game's cap compare (omit = uncapped)]
const GEM_ITEMS: [string, number, string?, number?][] = [
  ['Funny Hat', 6], ['2x AP', 9], ['2x BP', 40, 'MTXdoubleBP', 5], ['Mystical Tiller', 19, 'MTXmysticTillersPurchased', 8],
  ['Friendly Mushroom', 20, 'MTXfriendlymushroomsOwned', 14], ['Eternal Cauldron', 21, 'MTXeternalCauldronsOwned', 6],
  ['Scavengers Wit', 44, 'TraceETCbonusMulti', 8], ['Crystal Slots: Cauldron', 37, 'MTXgemslotsPurchased', 18],
  ['Crystal Slots: Mining', 37, 'MTXgemslotsPurchasedMINING', 18], ['Hyper Spirits', 10, 'mtxCultandAco', 8],
  ['Diamond Piping', 51], ['Golden Nest', 49], ['Arcane Carpet', 50], ['Overlord Miner', 4, 'MTXoverlordminersPurchased', 6],
  ['Extra Card Slot', 13, 'MTXcardSlotsUnlocked', 10], ['Second Necklace', 31], ['2x Crusade EXP', 35], ['2x Tinkering EXP', 36],
  ['2x Spirit EXP', 7], ['2x Summon EXP', 8],
]
test.skipIf(!game)('gem shop: every item number\'s cost (and cap, where the branch tests one) matches the buy handler', () => {
  const items = gemShop({}).items
  expect(items.length).toBe(GEM_ITEMS.length)
  for (const [name, num, attr, cap] of GEM_ITEMS) {
    const it = items.find((x) => x.name === name)!, b = branch(num)
    expect(b).toContain(`${it.cost}<=b.engine.getGameAttribute("sparklecoin")`)
    if (attr) {
      expect(b).toContain(`${cap}>b.engine.getGameAttribute("${attr}")`)
      // purchases = how many times the compare passes: attr steps +3 for crystal slots, +1 otherwise (Scavengers starts at 1)
      const step = name.startsWith('Crystal') ? 3 : 1, start = name === 'Scavengers Wit' ? 1 : 0
      expect(it.max).toBe(Math.ceil((cap! - start) / step))
    }
  }
})

test.skipIf(!game)('gem shop: Friendly Mushroom 3× pot speed and Eternal Cauldron 4× brew speed are in the game code', () => {
  expect(game.slice(24237734, 24237734 + 140)).toContain('MTXfriendlymushroomsOwned")>=U+1')
  expect(game.slice(24237734, 24237734 + 300)).toContain('=3*(')
  expect(game.slice(24894742, 24894742 + 400)).toContain('MTXcauldronBonus2x")[Dt+1]')
  expect(game.slice(24894742, 24894742 + 900)).toMatch(/aa=Math\.pow\([^;]*?,2\),na=/)
  expect(game.slice(27641632, 27641632 + 500)).toContain('MTXeternalCauldronsOwned")&&(b.engine.getGameAttribute("MTXcauldronBonus2x")[1]=2)')
})
