// Smithing values the game computes in scene code (absent from Steam Cloud saves). Checked against stored values in
// smithing.test.ts. Issue #15. PbonusSmithTotalCostRedux / PbonusSmithingScalingRedux / PbonusBaseDmg live in potionBonuses().
import catalog from './data/card-catalog.json'
import items from './data/smithing.json'
import { cbonus, type Catalog, zoneTotalCardLV } from './cards-calc'
import { ORES, FISH } from './names'
import { equipmentBonuses, masteryBonuses, potionBonuses, smithCostCore } from './bus'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** smithingEXPONENTIALlowerbound (smithing scene init): the floor of every cost's growth base, lowered by potion 144. */
export const smithingLowerBound = (save: Save) => { const p = n(arr(save, 'PotionLV')[144]); return 0.025 - (0.0152 * p) / (p + 175) + 1 }

/** PbonusSmithTotalCostRedux as the smithing scene sets it at init, which is what the upgrade costs there use: unlike the
 *  potion/fight-scene copy (potionBonuses().SmithTotalCostRedux, the value usually stored) it adds mastery 17 and drops the
 *  vending-5 term. The two differ (fixture: 0.225950 here vs 0.226749 stored). */
export const smithTotalCostRedux = (save: Save) =>
  (smithCostCore(save) * (1 - Math.min(masteryBonuses(save)[17]! - 1, 0.99))) / (1 + 0.02 * n(arr(save, 'PotionLV')[94]))

type Cost = [cur: number, k: number, redux: number, b: number, div: number, floor: number, floorIsLB: number, e: number]

/** Next-upgrade cost of smithing item `item` at its current level: [{ currency, cost }] for SmithingCost1 (and 2).
 *  The game only computes this for the item on the selected anvil while the smithing screen draws, writing it to
 *  SmithingCost1[currency] / SmithingCost2[currency], so every other stored entry is whatever was last drawn there. */
export const smithingCosts = (save: Save, item: number) => smithingCostAt(save)(item, n(arr(save, 'SmithingItemLevel')[item]))

/** The same cost at any level L (the level being upgraded from), with the save's reductions computed once. */
export function smithingCostAt(save: Save) {
  const R = smithTotalCostRedux(save), S = potionBonuses(save).SmithingScalingRedux, LB = smithingLowerBound(save)
  return (item: number, L: number) => ((items as unknown as Record<number, Cost[]>)[item] ?? []).map(([currency, k, redux, b, div, floor, isLB, e]) =>
    ({ currency, cost: k * (redux ? R : 1) * Math.pow(div ? Math.max(b - S / div, isLB ? LB + floor : floor) : b, L / e) }))
}

/** SmithingBaseAttack: flat base damage from smith items (+ potions, cards, equipment), the last term of BASE DMG.
 *  The fight scene's (SceneEvents_9) formula; the Realm (51) has the same, raids (16), crusade (32) and Asylum fights (41)
 *  older copies without items 82/90 and the Realm term. Card terms come from whatever deck is equipped when a scene
 *  writes it, so the stored value swings with deck links: default here is the Fighting-linked deck (link 9), as during
 *  fights and on the stats panel (fixture 9.24M, live 9.85M with its +80% base-damage card; 6.01M live after a scene
 *  rewrote it under the active non-fight deck). `older`: the raid/Asylum copy (@19894966 / @26863637), which also reads the
 *  stored PbonusBaseDmg instead of recomputing it (here: recomputed with the same deck). */
export function smithingBaseAttack(save: Save, link = 9, older = false) {
  const s = (i: number) => n(arr(save, 'SmithingItemLevel')[i]), P = (i: number) => n(arr(save, 'PotionLV')[i]), a = (k: string, i: number) => n(arr(save, k)[i])
  const kills = 0.43 * Math.log(Math.abs(n(save.totalKills)) + 1)
  const w = 100 * s(66) * n(save.miningLVL) + 1e4 * s(74) * (1 + Math.pow(kills, 2 + Math.pow(P(96) * ((0.2 * Math.pow(s(76), 0.5)) / 800), 0.1)) / 20)
  const conquest = 15e3 * s(82) * Math.pow(2, Math.min(s(82) / 1e3, 15)) * Math.pow(1.05 + Math.min((0.13 * P(163)) / (P(163) + 175), 0.112), a('ConquestDifficultyLV', 15))
  const realm = n((save.RealmStuff as unknown[] | undefined)?.[23]) * s(90) * 1e16 * Math.pow(s(90) / 1e3, 5)
  const C = cbonus(save, catalog as unknown as Catalog, link)
  const flat = n(C.CbonusBaseDamageFLAT) + n(equipmentBonuses(save).scalar.EbonusBaseDmgFLAT) + potionBonuses(save, 0, link).BaseDmg
  const base = 5 * s(2) + 10 * s(10) + s(18) * (25 + 3 * P(16)) + 50 * s(26) + s(34) * (100 + 15 * P(27)) + 250 * s(42) + s(50) * (500 + 60 * P(54))
    + s(58) * (1e3 + 50 * P(83) * s(2)) + w + (older ? 0 : conquest + realm) + flat
  return base * (0.05 * a('AscentionLevel', 7) + (0.1 * a('AscentionLevel', 22) * zoneTotalCardLV(save)[3]!) / 100 + 1)
    * (1 + n(C.CbonusBaseDamage) / 100)
}

// ActorEvents_378 lists: smithing currencies 51-58 index TreasureOwned through TreasureList, 59-64 CraftingMaterialsOwned through CrsuadeList.
const TREASURE = [1, 7, 12, 15, 21, 24, 27, 28], CRUSADE = [44, 60, 87, 61, 76, 89]

/** Where a smithing currency is held (the craft handler's deduction branches @8904563-8909656). None is reset by an ascend. */
export function smithCurrency(save: Save, c: number): { label: string; owned: number } {
  const at = (k: string, i: number) => n(arr(save, k)[i])
  if (c < 17) return { label: ORES[c] ?? `Ore ${c}`, owned: at('OresOwned', c) }
  if (c < 47) return { label: `${FISH[c - 16] ?? 'Fish'} (fish ${c - 16})`, owned: at('FishOwned', c - 16) }
  if (c < 51) return { label: ORES[c - 30] ?? `Ore ${c - 30}`, owned: at('OresOwned', c - 30) }
  if (c < 59) return { label: `Treasure ${TREASURE[c - 51]}`, owned: at('TreasureOwned', TREASURE[c - 51]!) }
  if (c < 65) return { label: `Crusade material ${CRUSADE[c - 59]}`, owned: at('CraftingMaterialsOwned', CRUSADE[c - 59]!) }
  return { label: 'Flower 25', owned: at('flowersOwned', 25) }
}
