// Gem shop advisor (#11): what you own, and the next purchase's effect where a formula in this app can price it.
// Costs/caps from the game's buy handler (MTXbuyableSELECTED branches @14665302-@14741983, one per item number; gems.test.ts reads them); owned counts from the MTX* save keys. Gems = save.sparklecoin.
import { awayPercent } from './away'
import { activeTilling, awayTillingPerSecond } from './tilling-away'
import { awayFishing } from './fishing'
import { ascendGain } from './bus'
import * as NX from './next-types'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
export type GemItem = { name: string; cost: number; max: number; owned: number; next?: { gain: number; what: string } }

/** Next-purchase gain as a fraction (1 = +100%) of the thing it multiplies. */
export function gemShop(save: Save): { gems: number; items: GemItem[] } {
  const pct = awayPercent(save) ?? 30.5
  const hats = n(save.FunnyHatPurchased), ap = n(save.MTXdoubleAP), bp = n(save.MTXdoubleBP), tillers = n(save.MTXmysticTillersPurchased)
  const fish = awayFishing(save, pct).perAwaySecond, till = awayTillingPerSecond(save, pct)
  let gain: ReturnType<typeof ascendGain> | null = null
  try { gain = ascendGain(save) } catch { /* cloud save without ascend inputs */ }
  const items: GemItem[] = [
    // Fishing XP × 2^FunnyHatPurchased, active and away (fishing code + away formula).
    // Funny Hat is item #6 (@14675184).
    { name: 'Funny Hat', cost: 100, max: Infinity, owned: hats, next: { gain: 1, what: `fishing XP ×2: away ${short(fish)} → ${short(2 * fish)}/s` } },
    // AP × (1 + MTXdoubleAP) (load-bonuses ascendGain).
    { name: '2x AP', cost: 100, max: Infinity, owned: ap, next: { gain: 1 / (1 + ap), what: gain ? `ascend now ${short(gain.ap)} → ${short((gain.ap * (2 + ap)) / (1 + ap))} AP` : 'ascend AP' } },
    { name: '2x BP', cost: 350, max: 5, owned: bp, next: { gain: 1 / (1 + bp), what: gain ? `rebirth now ${short(gain.bp)} → ${short((gain.bp * (2 + bp)) / (1 + bp))} BP` : 'rebirth BP' } },
    // Tiller N unlocks armor 40 on farmer N (armor picker: MTXmysticTillersPurchased >= FarmerSelected): ×(1+armor/40) speed, more away XP,
    // and on screen a farmer under speed 100 crosses to the 60 fps step. Priced by re-running both Tilling formulas with that farmer at 40.
    { name: 'Mystical Tiller', cost: 150, max: 8, owned: tillers, next: tillerNext(save, pct, tillers, till) },
    { name: 'Friendly Mushroom', cost: 125, max: 14, owned: n(save.MTXfriendlymushroomsOwned), next: { gain: 2 / 14, what: 'one more Botany pot grows 3× faster' /* HerbloreSpeedBOOST3[pot] ×= 3 when owned >= pot, @24237734 */ } },
    { name: 'Eternal Cauldron', cost: 175, max: 6, owned: n(save.MTXeternalCauldronsOwned), next: { gain: 3 / 6, what: 'one more cauldron brews 4× faster' /* MTXcauldronBonus2x = 2, brew term Math.pow(it, 2), @24894742 */ } },
    // TraceETCbonusMulti starts at 1, +1 per purchase (gem-shop buy handler); it multiplies shrine item gains.
    { name: 'Scavengers Wit', cost: 325, max: 7, owned: Math.max(n(save.TraceETCbonusMulti) - 1, 0), next: { gain: 1 / Math.max(n(save.TraceETCbonusMulti), 1), what: `shrine items ×${+((Math.max(n(save.TraceETCbonusMulti), 1) + 1) / Math.max(n(save.TraceETCbonusMulti), 1)).toFixed(2)}` } },
    // #37 @14713737: each purchase adds 3 slots (MTXgemslotsPurchased += 3) while < 18, so 6 purchases per page; Cauldron once
    // BuyingCauldronGemslots == 1, else Mining.
    { name: 'Crystal Slots: Cauldron', cost: 250, max: 6, owned: Math.floor(n(save.MTXgemslotsPurchased) / 3), next: { gain: 0, what: '3 cauldron crystal slots (crystals boost brew speed/EXP)' } },
    { name: 'Crystal Slots: Mining', cost: 250, max: 6, owned: Math.floor(n(save.MTXgemslotsPurchasedMINING) / 3) },
    { name: 'Hyper Spirits', cost: 70, max: 8, owned: n(save.mtxCultandAco), next: { gain: 0, what: 'one more hyper skiller: 2× souls, 2× luck' } },
    { name: 'Diamond Piping', cost: 225, max: 45, owned: ((save.DiamondPiping as number[]) ?? []).filter((x) => n(x)).length, next: { gain: 0, what: 'one pipe → diamond: faster connected lab tank' } },
    { name: 'Golden Nest', cost: 375, max: 6, owned: n(save.GoldNestsPurchased) },
    { name: 'Arcane Carpet', cost: 525, max: 4, owned: n(save.ArcaneCarpetsPurchased) },
    { name: 'Overlord Miner', cost: 75, max: 6, owned: n(save.MTXoverlordminersPurchased) },
    { name: 'Extra Card Slot', cost: 100, max: 10, owned: n(save.MTXcardSlotsUnlocked) },
    { name: 'Second Necklace', cost: 350, max: 1, owned: save.SecondPendantSlotPurchased ? 1 : 0 },
    { name: '2x Crusade EXP', cost: 150, max: Infinity, owned: n(save.MTXdoubleCrusadeEXP) },
    { name: '2x Tinkering EXP', cost: 150, max: Infinity, owned: n(save.MTXdoubleTinkeringEXP) },
    { name: '2x Spirit EXP', cost: 125, max: Infinity, owned: n(save.MTXdoubleSpiriting) },
    { name: '2x Summon EXP', cost: 125, max: Infinity, owned: n(save.MTXdoubleSummoning) },
  ]
  return { gems: n(save.sparklecoin), items }
}

// Ranked by % boost per 100 gems; each % is of a different income (fishing XP, AP, Tilling…), so it ranks bang-for-gem, not absolute value.
export const per100 = (i: { cost: number; next?: { gain: number } }) => (i.next?.gain ?? 0) / i.cost * 100
/** Items not yet maxed, best boost per 100 gems first (Gems tab table). */
export const openItems = (shop: { items: GemItem[] }) => shop.items.filter((i) => i.owned < i.max).sort((a, b) => per100(b) - per100(a))

/** Purchase order (#52): every priced open item once, best boost per 100 gems first, with gems spent so far and how many
 *  more you need past what you hold. Today's list, one copy each: Funny Hat's ×2 never shrinks, so with repeats it would be
 *  every step; after a copy, its row stays first in the table below. Unpriced items (no boost formula) are left out. */
export function gemPlan(shop: { gems: number; items: GemItem[] }) {
  let total = 0
  return openItems(shop).filter((i) => per100(i) > 0).map((i) => ({ item: i, total: (total += i.cost), short: Math.max(0, total - shop.gems) }))
}

function short(x: number) {
  const u = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const
  for (const [v, s] of u) if (Math.abs(x) >= v) return `${+(x / v).toFixed(2)}${s}`
  return x.toFixed(0)
}

function tillerNext(save: Save, pct: number, owned: number, away: number): GemItem['next'] {
  const f = owned + 1, armor = save.FarmerArmor as number[] | undefined
  if (f > 8 || !armor || !n((save.FarmerLV1 as number[] | undefined)?.[f])) return undefined
  const t = { ...save, FarmerArmor: armor.map((a, i) => (i === f ? 40 : a)) }
  const act0 = activeTilling(save).xpPerSec, act1 = activeTilling(t).xpPerSec, away1 = awayTillingPerSecond(t, pct)
  const pctOf = (a: number, b: number) => `+${(100 * (b / a - 1)).toFixed(1)}%`
  return { gain: away1 / away - 1, what: `farmer ${f} armor ${n(armor[f])} → 40: Tilling XP away ${pctOf(away, away1)}, on screen ${act0 ? pctOf(act0, act1) : '?'}; its crop yield ×${((1 + 1) / (1 + n(armor[f]) / 40)).toFixed(2)}` }
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'gems', title: 'Gems', src: 'gems.ts gemShop + openItems', fn: (s) => {
    const shop = gemShop(s), open = openItems(shop).filter((i) => per100(i) > 0)
    const ok = open.filter((i) => i.cost <= shop.gems)
    if (ok.length) return ok.slice(0, 3).map((i) => ({ text: `Buy ${i.name} (${i.cost} gems)`, why: `${i.next!.what}; +${(100 * per100(i)).toFixed(1)}% per 100 gems` }))
    return open.slice(0, 1).map((i) => ({ text: `Save for ${i.name} (${i.cost} gems, have ${shop.gems})`, why: `best per gem: ${i.next!.what}` }))
  }}
