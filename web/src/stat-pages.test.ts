import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { fullSave } from './test-save.test'
import { awayCardDrops, awayGainsPerHour, cashTier, statPages } from './fight-away'
import { BUNDLE } from '../../src/game-eval'
import { pageListeners, renderPage } from '../../src/stat-pages'

const bundle = new URL(`../../${BUNDLE}`, import.meta.url).pathname
const live = new URL('../../data/stat-pages-live.json', import.meta.url).pathname // 60 attrs read 2026-10-03 19:2x PT
const flat = (s: string) => s.replace(/[_\s]/g, '')
// Game page order: DescriptionStatPage 1 damage, 2 health, 3 away, 4 potions.
const ORDER = ['damage', 'health', 'away', 'potions'] as const

function againstGame(attrs: Record<string, unknown>) {
  const fs = pageListeners(readFileSync(bundle, 'utf8'))
  ORDER.forEach((k, i) => {
    // Game rows are "LABEL:  value" (the away page puts each value on the row below); headers have no ':'.
    const game = renderPage(fs[i]!, attrs, i + 1).map(flat).join('|').replace(/:\|/g, ':').split('|').filter((r) => r.includes(':'))
    expect(statPages(attrs)[k]!.map(([l, v]) => flat(l) + ':' + flat(v))).toEqual(game)
  })
}

test.skipIf(!existsSync(bundle))('stat panel port matches the game\'s own draw code on the full save', async () => {
  againstGame(await fullSave())
})

test.skipIf(!existsSync(bundle) || !existsSync(live))('stat panel port matches the game and the values the author read live', async () => {
  const a = await Bun.file(live).json()
  againstGame(a)
  const p = statPages(a)
  // Screenshots 2026-10-03 19:21-19:24 PT, Septislime 1, The Bog (mode 12).
  expect(p.away).toEqual([['MONSTER KILLS', '2.83M'], ['APPROXIMATE CASH', '3803']])
  expect(cashTier(awayGainsPerHour(a).cash).tier).toBe(1) // 3803 × 1e21 = 3.8e24 cash/h
  expect(Object.fromEntries(p.potions)).toMatchObject({ 'DMG MULTI 1': '+5.4K%', 'DMG MULTI 2': '+610%', 'TOTAL DAMAGE': '+39K%', 'CASH MULTI 1': '+778%', 'CASH MULTI 2': '+331%', 'CASH MULTI 4': '+1%', 'TOTAL CASH': '+3.7K%' })
  expect(Object.fromEntries(p.damage)).toMatchObject({ 'BASE DMG': '9860K', 'SKILL LEVELS': '+18K%', 'SMITH TRINKETS': '+40K%', POTIONS: '+39K%', CARDS: '+80%', 'TINKER EQUIPS': '+295%', MISCELLANEOUS: '+11K%', 'CRIT CHANCE': '100%', 'CRIT DAMAGE': '+4.4K%' })
  expect(Object.fromEntries(p.health)).toMatchObject({ 'BASE HP': '594K', 'SKILL LEVELS': '+7K%', ASCENTION: '+1.4K%', CARDS: '+35%', MISCELLANEOUS: '+3.5K%', 'DMG REDUCTION': '85%', 'IDLE SPEED': '0.05 SEC', 'IDLE DAMAGE': '32K%', 'CASH BONUS': '+16B%' })
  // Cards while away (FightZoneTYPE 2 here): a trickle, ~0.02 per away hour vs ~14,400 active rolls/h.
  expect(awayCardDrops(a, 3600)).toBeGreaterThan(0)
  expect(awayCardDrops(a, 3600)).toBeLessThan(0.1)
})
