// Apothecary skill EXP (ApothecaryEXP / ApothecaryLV), from the game's potions scene (SceneEvents_37 in Qno2x.js).
// - On screen @24925300: each draw tick a brewing cauldron (PotionType[c] >= 1, discovery brews included) adds
//   amount2next·ApothecaryExpGiven[c]·PotionGemEXP[c]·ApothecaryExpGivenBONUS·sqrt(max(1, PotionExpGiven[c]))·MTXcauldronBonus2x[c],
//   amount2next = 0.04·PotionAnimationSpeed[c]·PotionBrewSpeedBOOST[1]·PotionGemSPEED[c] per tick (@24922442), ~25 ticks/s.
//   The potion's own id never enters it: any brew pays the same skill EXP; an idle cauldron pays none.
// - Away @24895650: the same product × AwayTimeRewarded × PotionBrewSpeedBOOST[2..4] × PotionBOOST (1 at init), no 0.04
//   and no tick rate, so one away second = one watched second × away %. BOOST[2] = ((1 + ConstructLV[38]/8)^0.3)^(LV/20)
//   (Mama Mia, @24880000) and AwayTimeRewarded ×(1 + TankBonusLIST[36]/100) (@24891500) apply away only.
// - ApothecaryExpGivenBONUS = 1 + CbonusApothecaryExp/100 at scene init (@24880283): cards of the Potions-linked deck (4).
// - ApothecaryExpGiven is fixed per cauldron: 1, 2, 4, 9, 16, 24 (cauldron buy @13662364). Value upgrade: PotionExpGiven
//   +0.04, cost ×1.12, no cap (@12443000). Speed upgrade: animation ×(1 + 6/(1 + ⌊LV2/6⌋/3)%), PotionExpGiven +0.02,
//   cost ×1.16, capped at 250 + TankBonusLIST[24] + 1.5·PotionLV[98] (@12616300).
// - Level-up @24930300: EXP ≥ REQ·(1 − min(GiftShopLevels[42]/5, 50)%) → LV+1, EXP −= that; with chance 70·P/(50+P)%
//   (P = PotionLV[99]) REQ stays, else REQ = 1.25·REQ + 150·⌊LV/10⌋ + 3·LV²; then EXP += 0.6%·ShrineLevels[6]·REQ.
// - Brewing gate @3676830 / @25093300: a potion at level 1 can only start brewing once ApothecaryLV ≥ its unlock level.
import catalog from './data/card-catalog.json'
import { buildCards, cbonus, withDeckLinks, type Catalog } from './cards-calc'
import { brewSpeedBoost } from './bus'
import { TICKS_PER_SEC } from './potions-calc'
import { PERKS, perkLock } from './perks'
import { skillLock } from './skilltree'
import { dropText } from './card-sources'
import { current } from './screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const CAULDRONS = [1, 2, 3, 4, 5, 6]
export const POTIONS_LINK = 4

/** Apothecary level a discovered potion needs before its first brew (the brew screen's level tag, @25093300). */
export const unlockLevel = (id: number) =>
  id + (id <= 8 ? 0 : id <= 18 ? 3 : id <= 30 ? 7 : id <= 43 ? 11 : id <= 56 ? 15 : id <= 69 ? 19 : id <= 82 ? 24 : 30)

export const expBonus = (s: Save) => 1 + n(cbonus(s, catalog as unknown as Catalog, POTIONS_LINK).CbonusApothecaryExp) / 100
/** Away-only multiplier: Mama Mia (BOOST[2]) and the lab's away-time bonus. */
export const awayExtra = (s: Save) =>
  Math.pow(Math.pow(1 + n(arr(s, 'ConstructLV')[38]) / 8, 0.3), n(s.ApothecaryLV) / 20) * (1 + n(arr(s, 'TankBonusLIST')[36]) / 100)

/** Skill EXP per watched second for each cauldron. `stored`: use the save's Potions-scene boosts when fresh (display);
 *  false recomputes them (so plan variants compare like with like). */
export function cauldronExp(save: Save, stored = true) {
  const s = withDeckLinks(save)
  const boost = stored ? n(current(s, 'PotionBrewSpeedBOOST[1]', () => brewSpeedBoost(s))) : brewSpeedBoost(s)
  const bonus = stored ? n(current(s, 'ApothecaryExpGivenBONUS', () => expBonus(s))) : expBonus(s)
  const owned = n(s.CauldronsOwned)
  return CAULDRONS.filter((c) => c <= owned).map((c) => {
    const at = (k: string, d = 0) => (arr(s, k)[c] ?? d)
    const brewing = n(at('PotionType')) >= 1
    const perSec = brewing ? TICKS_PER_SEC * 0.04 * n(at('PotionAnimationSpeed')) * boost * n(at('PotionGemSPEED', 1)) * n(at('ApothecaryExpGiven'))
      * n(at('PotionGemEXP', 1)) * bonus * Math.sqrt(Math.max(1, n(at('PotionExpGiven')))) * Math.max(1, n(at('MTXcauldronBonus2x', 1))) : 0
    return { c, brewing, potion: n(at('PotionType')), perSec }
  })
}

export function expRates(save: Save, awayPct: number, stored = true) {
  const per = cauldronExp(save, stored), active = per.reduce((t, x) => t + x.perSec, 0)
  return { per, active, away: (active * awayPct) / 100 * awayExtra(save) }
}

/** EXP still needed to finish each of the next `count` levels (expected REQ growth when potion 100 can skip it). */
export function levelNeeds(save: Save, count: number): number[] {
  let L = n(save.ApothecaryLV), req = n(save.ApothecaryREQ), exp = n(save.ApothecaryEXP)
  const cut = 1 - Math.min(n(arr(save, 'GiftShopLevels')[42]) / 5, 50) / 100
  const P = n(arr(save, 'PotionLV')[99]), skip = Math.min((70 * P) / (50 + P), 100) / 100
  const refund = (0.6 * n(arr(save, 'ShrineLevels')[6])) / 100
  const out: number[] = []
  for (let k = 0; k < count; k++) {
    out.push(Math.max(0, req * cut - exp))
    exp = Math.max(exp, req * cut) - req * cut
    L += 1
    req = skip * req + (1 - skip) * nextReq(req, L)
    exp += refund * req
  }
  return out
}
/** REQ after reaching level L (no potion-100 skip). */
export const nextReq = (req: number, L: number) => 1.25 * req + 150 * Math.floor(L / 10) + 3 * L * L

export type Unlock = { id: number; level: number; discovered: boolean; exp: number }
/** The next potions the level opens for brewing, with the EXP still needed to reach each. */
export function nextUnlocks(save: Save, ids: number[], count = 5): Unlock[] {
  const L = n(save.ApothecaryLV), lv = arr(save, 'PotionLV')
  const next = ids.map((id) => ({ id, level: unlockLevel(id) })).filter((u) => u.level > L).sort((a, b) => a.level - b.level || a.id - b.id).slice(0, count)
  if (!next.length) return []
  const needs = levelNeeds(save, next.at(-1)!.level - L)
  return next.map((u) => ({ ...u, discovered: n(lv[u.id - 1]) > 0, exp: needs.slice(0, u.level - L).reduce((t, x) => t + x, 0) }))
}

// ---- Plan: one change at a time, model re-run (cauldronExp(…, false)), ranked by EXP/h gain -------------------------
export type Step = { what: string; gain: number; cost: string; note?: string; est?: boolean }
const edit = (s: Save, k: string, i: number, f: (v: number) => number): Save => {
  const a = [...arr(s, k)]; a[i] = f(n(a[i])); return { ...s, [k]: a }
}
/** Share of gold one value-upgrade row spends (each row alone). */
export const GOLD_SHARE = 0.1

export function expPlan(save: Save, ids: number[]): Step[] {
  const s = withDeckLinks(save)
  const base = expRates(s, 100, false).active
  const gain = (v: Save) => (base > 0 ? expRates(v, 100, false).active / base - 1 : 0)
  const steps: Step[] = []
  const owned = n(s.CauldronsOwned), lv = arr(s, 'PotionLV')
  const fmtG = (g: number) => g.toExponential(2).replace('e+', 'e')

  // Idle cauldrons pay no skill EXP at all.
  const fill = ids.includes(25) && n(lv[24]) > 1 ? 25 : ids.find((id) => n(lv[id - 1]) > 1) ?? 1
  for (const c of CAULDRONS.filter((c) => c <= owned && n(arr(s, 'PotionType')[c]) < 1))
    steps.push({ what: `Start a brew in idle cauldron ${c}${n(arr(s, 'MTXcauldronBonus2x')[c]) > 1 ? ' (Eternal ★)' : ''}`, gain: gain(edit(s, 'PotionType', c, () => fill)),
      cost: 'free', note: `any potion pays the same skill EXP; Bubblez (#25) also speeds every brew${n(arr(s, 'MTXcauldronBonus2x')[c]) > 1 ? ', and this cauldron levels its potion 4× faster' : ''}` })

  // Value upgrades: PotionExpGiven +0.04 each, cost ×1.12, gold only.
  const gold = n(s.goldcoin)
  const value = CAULDRONS.filter((c) => c <= owned && n(arr(s, 'CauldronLV1')[c]) > 0).map((c) => {
    const c0 = n(arr(s, 'ApothecaryValueCost')[c]), k = c0 > 0 ? Math.floor(Math.log(1 + (GOLD_SHARE * gold * 0.12) / c0) / Math.log(1.12)) : 0
    return { c, k, cost: (c0 * (Math.pow(1.12, k) - 1)) / 0.12, g: gain(edit(s, 'PotionExpGiven', c, (v) => v + 0.04 * k)) }
  }).filter((x) => x.k > 0).sort((a, b) => b.g - a.g)
  for (const x of value.slice(0, 2))
    steps.push({ what: `Cauldron ${x.c} value upgrade +${x.k} levels`, gain: x.g, cost: `${fmtG(x.cost)} gold (${Math.round(GOLD_SHARE * 100)}% of yours)`,
      note: 'also raises that cauldron\'s potion EXP by the same levels, so no potion tradeoff; skill EXP grows with √(value)' })

  // Bubblez: +5% brew speed per level (potion bonuses → PotionBrewSpeedBOOST[1]).
  if (n(lv[24]) > 0) steps.push({ what: `Bubblez (#25) lv ${n(lv[24])} → ${n(lv[24]) + 1}`, gain: gain(edit(s, 'PotionLV', 24, (v) => v + 1)),
    cost: 'one potion level (brew time + crops)', note: 'brewing it costs a cauldron slot another potion could level in' })

  // Cards in the Potions-linked deck: upgrades of owned EXP / brew-speed cards, and missing ones in a free slot.
  const cards = buildCards(s, catalog as unknown as Catalog), deck = cards.decks.find((d) => d.link === POTIONS_LINK)
  const want = (c: { levels?: unknown; type: string }) => c.type === 'ApothecaryExp' || c.type === 'BrewSpeed'
  if (deck) for (const c of cards.cards.filter(want)) {
    const level = n(arr(s, 'CardLevels')[c.id])
    if (level >= 1 && deck.cards.includes(c.id) && level < c.maxLevel)
      steps.push({ what: `Card ${c.name} lv ${level} → ${level + 1}`, gain: gain(edit(s, 'CardLevels', c.id, (v) => v + 1)), cost: 'card upgrade (Cards tab)' })
    else if (!deck.cards.includes(c.id)) {
      const slot = deck.cards.indexOf(0)
      if (slot < 0) continue
      const eq = edit(s, 'CardEquipped', (deck.deck - 1) * cards.slots + slot, () => c.id)
      steps.push({ what: `Card ${c.name} into the Potions deck`, gain: gain(level >= 1 ? eq : edit(eq, 'CardLevels', c.id, () => 1)),
        cost: level >= 1 ? 'free (owned, empty slot)' : `drop: ${dropText(c.id, c.zone)}`, note: level >= 1 ? undefined : 'gain at card level 1' })
    }
  }

  // Bubble Bubble (BP perk 59): +8% brew speed per level.
  const perk = PERKS.find((p) => p.i === 59), pl = n(arr(s, 'AscentionLevel')[59])
  if (perk && pl < perk.max) {
    const lock = perkLock(s, perk, pl)
    steps.push({ what: `Bubble Bubble (BP perk 59) lv ${pl} → ${pl + 1}`, gain: gain(edit(s, 'AscentionLevel', 59, (v) => v + 1)),
      cost: `${perk.cost[pl]} BP`, note: lock ? `locked: ${'need' in lock ? lock.need : 'see Perks tab'}` : undefined })
  }
  // Skill 66 (Dairy Aisle tree): brew speed × (1 + (0.4·L)^0.6·(LV/3)/125).
  if (n(arr(s, 'SkillLevels')[66]) === 0)
    steps.push({ what: 'Skill tree: Potion brew speed (Infinity) lv 0 → 1', gain: gain(edit(s, 'SkillLevels', 66, () => 1)), cost: '1 skill point',
      note: skillLock(s, 66) ? `locked: ${skillLock(s, 66)}` : undefined })

  // EXP crystals: +50%·(1 + GemBonuses[1]%) on one cauldron (@18707150); cauldron gem slots open in order (3 per cauldron)
  // as MTXgemslotsPurchased grows (@4241015), so the next slot bought sits on cauldron ⌊bought/3⌋ + 1.
  const spare = n(arr(s, 'TotalPotionGEMSowned')[1]) - n(arr(s, 'PotionGEMSinUSE')[1]), next = Math.floor(n(s.MTXgemslotsPurchased) / 3) + 1
  if (spare > 0 && next <= owned)
    steps.push({ what: `EXP crystal in a new cauldron gem slot (cauldron ${next})`, gain: gain(edit(s, 'PotionGemEXP', next, (v) => v + 0.5 * (1 + n(arr(s, 'GemBonuses')[1]) / 100))),
      cost: 'gem shop: one cauldron gem slot †', note: `you hold ${spare} unused EXP crystal${spare > 1 ? 's' : ''}; slot price not traced`, est: true })

  return steps.filter((x) => x.gain > 1e-6).sort((a, b) => b.gain - a.gain)
}
