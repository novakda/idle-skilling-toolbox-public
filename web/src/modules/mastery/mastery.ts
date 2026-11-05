// Mastery: the Portal's Mastery screen (SceneEvents_48, scene 48, opened from the Portal @19806960; init † @29744779).
// Completing a task (MasteryTasksComplete[i]) grants points (MasteryPointsOwned); points buy perk levels
// (MasteryPerksUnlocked[i], perks 1-125 in three trees); perk levels feed MasteryBonuses (load-bonuses.ts masteryBonuses).
// Tables: src/derive-mastery.ts → data/mastery.json. Every rule cites its Qno2x.js offset (†); checked in mastery.test.ts.
import data from '../../data/mastery.json'
import { masteryBonuses, masteryPerkAmounts } from '../../bus'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const D = data as unknown as { type: number[]; names: string[]; cost: number[]; tasks: [string, number | null, number | null][] }
const label = (t: string) => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()

/** Trees (Tree1/2/3 sums at the draw listener † @29833022): perks 1-43, 44-80, 81-125. */
export const TREES = [{ id: 1, from: 1, to: 43 }, { id: 2, from: 44, to: 80 }, { id: 3, from: 81, to: 125 }] as const
/** Branch starts and the perk they hang off (buy check † @29916538); every other perk needs the one before it. */
export const BRANCH: Record<number, number> = { 21: 4, 36: 29, 53: 46, 67: 58, 101: 88, 113: 104 }
const ROOTS = new Set([1, 44, 81])
/** The 9 big perks, which the normal draw loop skips († @29833959). */
export const CAPSTONES = new Set([20, 35, 43, 52, 66, 80, 100, 112, 125])
/** Perks that also give +1 MeritsOwned[6] each time a level is bought († @29923928). */
export const MERIT = new Set([88, 92, 98, 107, 113, 121])
/** typeNAMES shows "?????" for these types until the perk before the capstone is owned; the names it reveals († @29897822). */
const REVEALED: Record<number, string> = { 24: '%_TOTAL_DAMAGE', 25: '%_CASH', 26: '%_DMG_PER_HATCHERY_LV', 27: '%_AP_KEPT_WHEN_REBIRTHING',
  28: '%_CHAIN_LV_CHANCE', 29: '%_FASTER_TICKET_AND_KEY_GAIN', 33: '_LVS_EVERY_100_LVS', 35: '%_AWAY_GAINS', 36: '%_CASHBACK_ON_UPGRADES' }
/** Highest level: the buy needs the tree's tier below 4 († @29919606). */
export const MAX_LV = 4

export const treeOf = (i: number) => TREES.find((t) => i >= t.from && i <= t.to)!
const rawName = (ty: number) => REVEALED[ty] ?? D.names[ty] ?? ''
/** Bonus name without the % marker (isPct says whether it is a percentage). */
export const typeName = (ty: number) => label(rawName(ty).replace(/^%?_/, '')).toLowerCase() || `type ${ty}`
export const isPct = (ty: number) => rawName(ty).startsWith('%')
/** Mastery perks have no names in the game, only their bonus type; label perk i by that (#2674). */
export const masteryPerkName = (i: number) => `Mastery ${CAPSTONES.has(i) ? 'capstone' : 'perk'}: ${typeName(D.type[i]!)}`
const levels = (s: Save) => Array.from({ length: 126 }, (_, i) => n(arr(s, 'MasteryPerksUnlocked')[i]))

/** Tree tier = ⌈average perk level × 100⌉ / 100 († @29833022). A pass through the tree raises every perk one level. */
export const tier = (L: number[], t: (typeof TREES)[number]) => {
  let sum = 0
  for (let i = t.from; i <= t.to; i++) sum += Math.round(L[i]!)
  return Math.ceil((sum / (t.to - t.from + 1)) * 100) / 100
}

/** Can perk i get its next level († @29916538 CanUbuyThis, @29920314 buy): tier < 4, its level = ⌊tier⌋, and the root's
 *  level equals the tier (all of the tree even) or the perk it hangs off is already past the tier. Points not checked. */
export function canBuy(L: number[], i: number): { ok: boolean; why: string } {
  const t = treeOf(i), T = tier(L, t)
  if (T >= MAX_LV) return { ok: false, why: 'maxed' }
  if (L[i] !== Math.floor(T)) return { ok: false, why: L[i]! > T ? 'done this pass' : 'tree behind' }
  if (ROOTS.has(i)) return L[i] === T ? { ok: true, why: '' } : { ok: false, why: `finish tree ${t.id} first` }
  const need = BRANCH[i] ?? i - 1
  return L[need]! > T ? { ok: true, why: '' } : { ok: false, why: `needs #${need}` }
}

export function perks(save: Save) {
  const L = levels(save), A = masteryPerkAmounts(save), hatch = n(save.HatcheryLV)
  return Array.from({ length: 125 }, (_, k) => {
    const i = k + 1, ty = n(D.type[i]), a = n(A[i]), per = i === 43 ? a * hatch : a, b = canBuy(L, i)
    return { i, tree: treeOf(i).id, type: ty, name: typeName(ty), amount: a, lv: L[i]!, cost: n(D.cost[i]), now: per * L[i]!, next: per * (L[i]! + 1),
      pct: isPct(ty), capstone: CAPSTONES.has(i), merit: MERIT.has(i), buyable: b.ok, why: b.why }
  })
}

/** Points per task, from its grant site (derive-mastery.ts). All are ⌈i/20⌉ (the task list page) except task 33 (+1 † @8082482).
 *  With PremiumPackPURCHASED1 or 2xMasteryGem every completed task (1) is set to 2 and pays ⌈i/20⌉ again († @29832387). */
export const taskPoints = (i: number) => n(D.tasks[i]?.[1])
export const doubled = (s: Save) => n(s.PremiumPackPURCHASED1) === 1 || n(s['2xMasteryGem']) === 1
export function points(save: Save) {
  const T = arr(save, 'MasteryTasksComplete'), L = levels(save)
  let earned = 0, unclaimedDouble = 0, spent = 0
  for (let i = 1; i <= 200; i++) { const v = n(T[i]); if (v >= 1) earned += taskPoints(i); if (v >= 2) earned += Math.ceil(i / 20); if (v === 1) unclaimedDouble += Math.ceil(i / 20) }
  for (let i = 1; i <= 125; i++) spent += L[i]! * n(D.cost[i])
  return { earned, spent, owned: n(save.MasteryPointsOwned), doubled: doubled(save), unclaimedDouble }
}

// Task progress readable from the save. Most are checked when the Mastery screen opens (init † @29744779-29810000); the
// crusader counts where TotalCrusaders is recounted († @23910549). Each reads exactly what the check reads.
const at = (s: Save, k: string, i: number) => n(arr(s, k)[i])
const count = (s: Save, k: string, from: number, len: number, ok: (v: number) => boolean) => { let c = 0; for (let i = 0; i < len; i++) if (ok(at(s, k, from + i))) c++; return c }
const max = (s: Save, k: string, from: number, len: number) => { let m = 0; for (let i = 0; i < len; i++) m = Math.max(m, at(s, k, from + i)); return m }
const potionTotal = (s: Save) => { let t = 0; for (let i = 0; i < 95; i++) t += at(s, 'PotionLV', i); return t }
type Track = [need: number, read: (s: Save) => number, what: string]
export const TRACK: Record<number, Track> = {
  34: [4, (s) => at(s, 'CardLevels', 50), 'Mimic card stars'], 40: [1, (s) => at(s, 'CardLevels', 151), 'King X card stars'],
  47: [3, (s) => at(s, 'CardLevels', 94), 'Mist Mites card stars'], 119: [1, (s) => at(s, 'CardLevels', 272), 'Emigdala X card stars'],
  140: [1, (s) => at(s, 'CardLevels', 286), 'Gorshank Z card stars'],
  63: [1e7, (s) => at(s, 'MapleMonster', 121), 'MapleMonster[121]'], 114: [1e8, (s) => at(s, 'MapleMonster', 600), 'MapleMonster[600]'],
  96: [35, (s) => max(s, 'ShrineLevels', 1, 12), 'best shrine level'], 147: [50, (s) => max(s, 'ShrineLevels', 1, 12), 'best shrine level'],
  196: [70, (s) => max(s, 'ShrineLevels', 1, 12), 'best shrine level'],
  108: [17, (s) => count(s, 'CardLevels', 121, 17, (v) => v >= 5), 'cards 121-137 at 5 stars'],
  133: [21, (s) => count(s, 'CardLevels', 361, 21, (v) => v >= 5), 'cards 361-381 at 5 stars'],
  157: [12, (s) => count(s, 'CardLevels', 151, 12, (v) => v >= 1), 'cards 151-162 collected'],
  160: [4, (s) => count(s, 'CardLevels', 275, 4, (v) => v >= 1), 'cards 275-278 collected'],
  168: [16, (s) => count(s, 'CardLevels', 271, 16, (v) => v >= 1), 'cards 271-286 collected'],
  200: [460, (s) => count(s, 'CardLevels', 1, 460, (v) => v >= 5 || v === -1), 'cards 1-460 at 5 stars (or −1)'],
  67: [1, (s) => +(at(s, 'EquipmentEquipped', 7) === 39), 'item 39 in slot 7'], 98: [1, (s) => +(at(s, 'EquipmentEquipped', 1) === 5), 'item 5 in slot 1'],
  115: [1, (s) => +(at(s, 'EquipmentEquipped', 4) === 55 || at(s, 'EquipmentEquipped', 8) === 55), 'item 55 in slot 4 or 8'],
  44: [5e4, (s) => n(s.APtoSpend), 'AP held'], 137: [5e5, (s) => n(s.BPtoSpend), 'BP held'],
  195: [1500, (s) => n(s.waterLV), 'H2O level'], 165: [37, (s) => n(s.HoopScoreBest), 'best hoops score'],
  111: [1e4, (s) => at(s, 'CraftingMaterialsOwned', 82), 'crusade candy'], 146: [1e18, (s) => at(s, 'CraftingMaterialsOwned', 1), 'crusade wood logs'],
  118: [300, (s) => n(s.endLVL), 'Endurance level'], 125: [70, (s) => n(s.HatcheryLV), 'Hatchery level'],
  130: [999, (s) => n(s.fishingLVL), 'Fishing level'], 189: [350, (s) => n(s.miningLVL), 'Mining level'],
  153: [1e16, (s) => at(s, 'OresOwned', 1), 'copper ore'], 173: [750, (s) => at(s, 'PotionLV', 0), 'PotionLV[0]'],
  87: [25e10, (s) => at(s, 'SeedsOwned', 1), 'SeedsOwned[1] (dirt)'],
  131: [1e4, potionTotal, 'total potion level (0-94)'], 190: [56789, potionTotal, 'total potion level (0-94)'],
  192: [6e4, (s) => n(s.TotalSkillerLV), 'total trainer level'], 158: [200, (s) => max(s, 'SkillLevels', 61, 10), 'best SkillLevels[61-70]'],
  159: [10, (s) => at(s, 'OverLevels', 9), 'flower pot 1 overlevel'], 167: [13, (s) => at(s, 'OverLevels', 1), 'tilling land 1 overlevel'],
  175: [1, (s) => at(s, 'DairyAisleAchievements', 1), 'DairyAisleAchievements[1]'], 176: [7, (s) => at(s, 'NestPrestige', 1), 'NestPrestige[1]'],
  177: [1000, (s) => max(s, 'TankLVs', 1, 130), 'best tank level'],
  184: [12, (s) => { let c = 0; for (let k = 0; k < 12; k++) if (at(s, 'EquipmentStarRank', 5 * k + 5) >= 6) c++; return c }, 'T5 equips at star rank 6'],
  183: [1750, (s) => n(s.FarmingLV) + n(s.ApothecaryLV) + n(s.HerbloreLV), 'Farming + Apothecary + Herblore'],
  194: [250, (s) => Math.min(at(s, 'AscentionLevel', 69), at(s, 'AscentionLevel', 70)), 'lower of AscentionLevel[69], [70]'],
  199: [250, (s) => count(s, 'MapleMonster', 0, 250, (v) => v >= 1e8), 'first 250 MapleMonster ≥ 1e8'],
  116: [200, (s) => n(s.TotalCrusaders), 'total crusaders'], 150: [500, (s) => n(s.TotalCrusaders), 'total crusaders'],
}
/** Tasks a tap does: 23 fires 100 000 ms after opening the task list († @29932575); 91 on Help page 4 (SceneEvents_20,
 *  † @20869722); 123 on Crusade page 8 (Tinkering) with inventory page 5 (the 6th), region 59 = the "scent" in Pearlescent († @23014274;
 *  wiki Mastery page image). Screen wording from the task names. */
export const INSTANT: Record<number, string> = {
  23: 'Open the Mastery task list and stay on the Mastery screen for 100 s (a 100 000 ms timer from opening the list)',
  91: 'Help screen, page 4: tap the long green arrow',
  123: 'Crusade → Tinkering, last (6th) inventory page: tap the "scent" at the end of the word Pearlescent (wiki: Mastery, Tap the scent)',
}

export function tasks(save: Save) {
  const T = arr(save, 'MasteryTasksComplete')
  return D.tasks.slice(1, 201).map(([name, pts, off], k) => {
    const i = k + 1, tr = TRACK[i], cur = tr ? tr[1](save) : null
    return { i, name: label(name), page: Math.ceil(i / 20), pts: n(pts), at: off, done: n(T[i]) >= 1, need: tr?.[0] ?? null, cur, what: tr?.[2] ?? '',
      met: tr ? cur! >= tr[0] : false, frac: tr ? Math.min(cur! / tr[0], 1) : null, instant: INSTANT[i] ?? null }
  })
}

/** Plan: tap tasks, then tasks already met (open the Mastery screen to collect), then perk levels cheapest first through the
 *  tree rules, as far as one more full pass of every tree. Perk bonuses are different stats, so cost is the ranking. */
export function plan(save: Save) {
  const tk = tasks(save).filter((t) => !t.done), p = points(save)
  let have = p.owned
  const steps: { kind: 'task' | 'perk'; text: string; delta: number; after: number; why: string; short: number }[] = []
  for (const t of tk.filter((t) => t.instant)) { have += t.pts; steps.push({ kind: 'task', text: `Task ${t.i} ${t.name}`, delta: t.pts, after: have, why: t.instant!, short: 0 }) }
  for (const t of tk.filter((t) => t.met && !t.instant)) { have += t.pts; steps.push({ kind: 'task', text: `Task ${t.i} ${t.name}`, delta: t.pts, after: have, why: 'already met: open the Mastery screen, its init checks it', short: 0 }) }
  const L = levels(save), A = masteryPerkAmounts(save), hatch = n(save.HatcheryLV)
  const stop = TREES.map((t) => Math.min(Math.floor(tier(L, t)) + 1, MAX_LV)) // one pass per tree
  for (;;) {
    let best = 0
    for (let i = 1; i <= 125; i++) if (canBuy(L, i).ok && L[i]! < stop[treeOf(i).id - 1]! && (!best || n(D.cost[i]) < n(D.cost[best]))) best = i
    if (!best) break
    const c = n(D.cost[best]), ty = n(D.type[best]), per = best === 43 ? n(A[best]) * hatch : n(A[best])
    have -= c; L[best]!++
    steps.push({ kind: 'perk', text: `Perk #${best} → Lv ${L[best]}: +${+per.toFixed(2)}${isPct(ty) ? '%' : ''} ${typeName(ty)}`, delta: -c, after: have,
      why: `${(per / c).toFixed(2)} per point${CAPSTONES.has(best) ? ', capstone' : ''}${MERIT.has(best) ? ', +1 green merit' : ''}`, short: Math.max(-have, 0) })
  }
  return steps
}

export function mastery(save: Save) {
  const s = { ...save }, pk = perks(s), tk = tasks(s), L = levels(s)
  return { perks: pk, tasks: tk, points: points(s), plan: plan(s), bonuses: masteryBonuses(s),
    trees: TREES.map((t) => ({ ...t, tier: tier(L, t), owned: pk.filter((x) => x.tree === t.id && x.lv > 0).length, size: t.to - t.from + 1 })),
    missingTasks: tk.filter((t) => !t.done), pageUnlocked: (p: number) => p === 1 || (p < 10 ? Math.max(n(s.fightsunlocked), n(s.fightsunlockedBEST)) >= p + 1 : at(s, 'DairyAisleAchievements', 1) === 1) }
}
export type Mastery = ReturnType<typeof mastery>
