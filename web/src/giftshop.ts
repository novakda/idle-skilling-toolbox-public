// Raid gift shop (#38): the gift shop screen (SceneEvents_17), its buy button (ActorEvents_624) and tab buttons
// (ActorEvents_626). Currency: BloodMoney, the wiki's "trophies", earned only by raids. Read from Qno2x.js (offsets †);
// tab names from the wiki. Everything is computed from the save (GiftShopLevels, BloodMoney, RaidBossKilled, SkillLevels).

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

export type Kind = 'start' | 'exp' | 'away' | 'autocast' | 'attacks' | 'buffs'
/** Tab buttons left to right set GiftShopType 1, 2, 5, 3, 4 (ActorEvents_626 † @12587171); names from the wiki. */
export const TABS: Record<number, string> = { 1: 'Training', 2: 'Crafting', 5: 'Limbo', 3: 'Skillers', 4: 'Auto' }

/** GiftShopLevels[i]: tab (GiftShopType), column (buy handler: x < 350, < 600, else) and row (y < 400 = top), the skill's level
 *  attribute (also its icon key) and what the level does. The handler (ActorEvents_624 † @12551884) picks the slot from the
 *  button's tab and position, checks BloodMoney ≥ cost, subtracts it and adds 1; only 17 and 18 have a cap (lv < 4). */
export const ITEMS: { i: number; tab: number; col: number; row: number; skill: string; name: string; kind: Kind }[] = [
  [1, 1, 0, 0, 'atkLVL', 'Attack', 'start'], [2, 1, 0, 1, 'atkLVL', 'Attack', 'exp'],
  [3, 1, 1, 0, 'strLVL', 'Strength', 'start'], [4, 1, 1, 1, 'strLVL', 'Strength', 'exp'],
  [5, 1, 2, 0, 'endLVL', 'Endurance', 'start'], [6, 1, 2, 1, 'endLVL', 'Endurance', 'exp'],
  [7, 2, 0, 0, 'miningLVL', 'Mining', 'start'], [8, 2, 0, 1, 'miningLVL', 'Mining', 'exp'],
  [9, 2, 1, 0, 'smithingLVL', 'Smithing', 'start'], [10, 2, 1, 1, 'smithingLVL', 'Smithing', 'exp'],
  [11, 2, 2, 0, 'fishingLVL', 'Fishing', 'start'], [12, 2, 2, 1, 'fishingLVL', 'Fishing', 'exp'],
  [13, 3, 0, 0, 'atkLVL', 'Attack', 'away'], [14, 3, 1, 0, 'strLVL', 'Strength', 'away'], [15, 3, 2, 0, 'endLVL', 'Endurance', 'away'],
  [16, 4, 0, 0, '', 'Unlock autocast', 'autocast'], [17, 4, 1, 0, '', 'Autocast attacks', 'attacks'], [18, 4, 1, 1, '', 'Autocast buffs', 'buffs'],
  [19, 5, 0, 0, 'spiritLVL', 'Spiriting', 'start'], [20, 5, 0, 1, 'spiritLVL', 'Spiriting', 'exp'],
  [21, 5, 1, 0, 'summonLVL', 'Summoning', 'start'], [22, 5, 1, 1, 'summonLVL', 'Summoning', 'exp'],
].map(([i, tab, col, row, skill, name, kind]) => ({ i, tab, col, row, skill, name, kind }) as any)

/** Trophies for the next level from level L (the buy handler's check and deduction, unfloored; the screen shows it floored). */
export function cost(kind: Kind, L: number) {
  switch (kind) {
    case 'start': return (1 + 2 * L) * 1.27 ** L
    case 'exp': return (1 + L) * 1.1 ** L
    case 'away': return (1 + 2 * L) * 1.1 ** L
    case 'autocast': return (10 + 2 * L) * 1.25 ** L
    default: return 10 * 10 ** L // attacks, buffs
  }
}
export const CAP: Partial<Record<Kind, number>> = { attacks: 4, buffs: 4, exp: 250 } // exp: buyable past 250, but the cut stops at 50%

/** EXP requirement cut: the level-up checks compare EXP ≥ REQ·(1 − min(L/5, 50)/100) and subtract that, so every level needs
 *  that much less (Attack @19370404, Strength @19365192, Endurance @19360744, Mining @30327953, Smithing @30924014, Fishing
 *  @31566101, Spiriting @21303856, Summoning @21525322). */
export const expCut = (L: number) => Math.min(L / 5, 50) / 100
/** Autocast (SceneEvents_9): AutoCasting += 0.02 every 20 ms (1/s) in the main fight while alive with autocast on († @31898363);
 *  past floor((15/(0.08L + 1) + 0.5)·min(L, 1)·100)/100 it casts and restarts († @31900468), a random attack from the first
 *  GiftShopLevels[17] + 1 or a random buff from the first [18] + 1 (coin flip). L = 0: not unlocked (button @14761410). */
export const autocastEvery = (L: number) => Math.floor((15 / (0.08 * L + 1) + 0.5) * Math.min(L, 1) * 100) / 100

/** What level L does, in words (the game's own screen text at L: "ATTACK_LV_" 1+L, "ATK_REDUCED_BY_" floor(L/5·10)/10 %,
 *  "GIVE_+" 2L "%_EXP", "AUTO_CAST_EVERY_" … "_SEC", L+1 "_DIFFERENT_ATTACKS", SceneEvents_17 † @20052583 "ATTACK_LV_", @20057810, @20116864, @20134896, @20140252). */
export function effect(kind: Kind, L: number) {
  switch (kind) {
    case 'start': return `starts at Lv ${1 + L}`
    case 'exp': return `−${Math.min(Math.floor((L / 5) * 10) / 10, 50)}% EXP per level`
    case 'away': return `+${2 * L}% away lifting EXP`
    case 'autocast': return L ? `casts every ${autocastEvery(L)} s` : 'locked'
    case 'attacks': return `${L + 1} of 5 attacks`
    case 'buffs': return `${L + 1} of 5 buffs`
  }
}

/** What one more level adds, in the unit its group is ranked by (null: no ranked unit).
 *  start: +1 starting level (ascend † @20914264, rebirth † @20983801 set e.g. atkLVL = 1 + L + other bonuses).
 *  exp: % faster levelling = (1 − cut)/(1 − cut') − 1. away: % more away lifting EXP: the skillers' offline EXP is
 *  × (1 + L/50) (ActorEvents_121 † @3886576 Attack, @3889708 Strength, @3892844 Endurance; also @3907628, @3922592, @3937545).
 *  autocast: casts per minute. */
export function gain(kind: Kind, L: number): number | null {
  switch (kind) {
    case 'start': return 1
    case 'exp': return L >= 250 ? 0 : 100 * ((1 - expCut(L)) / (1 - expCut(L + 1)) - 1)
    case 'away': return 100 * ((1 + (L + 1) / 50) / (1 + L / 50) - 1)
    case 'autocast': return 60 / autocastEvery(L + 1) - (L ? 60 / autocastEvery(L) : 0)
    default: return null
  }
}

/** Ranked groups: one unit each, so items rank against each other only inside their group. */
export const GROUPS: { kinds: Kind[]; title: string; unit: string }[] = [
  { kinds: ['exp'], title: 'Faster levelling', unit: '% faster levelling' },
  { kinds: ['start'], title: 'Starting level (every ascend and rebirth)', unit: ' starting level' },
  { kinds: ['away'], title: 'Away lifting EXP (skillers)', unit: '% more away EXP' },
  { kinds: ['autocast', 'attacks', 'buffs'], title: 'Autocast (main fight)', unit: ' casts/min' },
]

/** Trophies for a raid win (boss 0-3, TicketsToSpend T): floor((k·Q³)^(1 + Q/10))·T²·(1 + 0.2·SkillLevels[50]·skill16), Q =
 *  boss 1-4, k = 25 (King † @19936638, Entertainer @19952130, Sentinel @19966981) or 50 (Demon @19980165). Death or time-out
 *  pays the same with k = BloodToGive, +1 per 4% of the boss's HP dealt († @20035457). Asylum fights pay nothing (their only
 *  trophy write uses BloodToGive, which only the raid scene raises). */
export function raidTrophies(boss: number, T: number, sl50 = 0, skill16 = 0) {
  const Q = boss + 1
  return Math.floor(((boss === 3 ? 50 : 25) * Q ** 3) ** (1 + 0.1 * Q)) * T * T * (1 + 0.2 * sl50 * skill16)
}
const RAID = [['King'], ['Entertainer'], ['Sentinel'], ['Demon']], DIFF: [string, number][] = [['Daydream', 1], ['Chaotic', 3], ['Nightmare', 10]]

export function giftShop(s: Save) {
  const lv = arr(s, 'GiftShopLevels'), held = n(s.BloodMoney), best = arr(s, 'RaidBossKilled')
  // Best trophies per ticket among the raids you have beaten (RaidBossKilled[slot] = best TicketsToSpend won; T tickets, T² trophies).
  let perTicket = 0, from = ''
  RAID.forEach(([name], b) => DIFF.forEach(([d, T]) => {
    const t = raidTrophies(b, T) / T
    if (n(best[b + 1]) >= T && t > perTicket) { perTicket = t; from = `${d} ${name}` }
  }))
  const rows = ITEMS.map((it) => {
    const L = n(lv[it.i]), c = cost(it.kind, L), maxed = CAP[it.kind] != null && L >= CAP[it.kind]!
    const g = maxed ? null : gain(it.kind, L)
    let spent = 0
    for (let l = 0; l < L; l++) spent += cost(it.kind, l)
    return { ...it, L, cost: c, maxed, gain: g, score: g == null ? -1 : g / c, affordable: !maxed && held >= c, spent,
      now: effect(it.kind, L), next: maxed ? 'max' : effect(it.kind, L + 1), tickets: perTicket ? Math.max(0, c - held) / perTicket : null, rank: 0 }
  })
  const groups = GROUPS.map((g) => {
    const list = rows.filter((r) => g.kinds.includes(r.kind)).sort((a, b) => b.score - a.score || a.cost - b.cost)
    list.forEach((r, k) => (r.rank = r.gain == null ? 0 : k + 1))
    return { ...g, list }
  })
  return { held, perTicket, from, sl50: n(arr(s, 'SkillLevels')[50]), groups, rows,
    spent: rows.reduce((t, r) => t + r.spent, 0), affordable: rows.filter((r) => r.affordable).length, open: rows.filter((r) => !r.maxed).length }
}

/** Purchase order per group (#52): the next `count` buys, each the most gain per trophy at its level then (cost and gain
 *  re-priced after every level, the same ranking as the All upgrades table), consecutive levels of one upgrade merged, with
 *  trophies so far and the raid tickets to earn them past what you hold (your best beaten raid). Groups don't compare and
 *  share the same trophies, so each plan assumes you spend on that group alone. */
export function giftPlan(s: Save, count = 5) {
  const g = giftShop(s)
  return g.groups.map(({ title, unit, list }) => {
    const lv = new Map(list.map((r) => [r.i, r.L]))
    const steps: { i: number; name: string; skill: string; kind: Kind; from: number; to: number; cost: number; gain: number; total: number; tickets: number | null }[] = []
    let total = 0
    for (let k = 0; k < count; k++) {
      const pick = list.map((r) => ({ r, L: lv.get(r.i)! })).filter(({ r, L }) => !(CAP[r.kind] != null && L >= CAP[r.kind]!) && gain(r.kind, L) != null)
        .map((x) => ({ ...x, c: cost(x.r.kind, x.L), gn: gain(x.r.kind, x.L)! })).sort((a, b) => b.gn / b.c - a.gn / a.c || a.c - b.c)[0]
      if (!pick) break
      total += pick.c
      lv.set(pick.r.i, pick.L + 1)
      const tickets = g.perTicket ? Math.max(0, total - g.held) / g.perTicket : null, last = steps.at(-1)
      if (last?.i === pick.r.i) Object.assign(last, { to: pick.L + 1, cost: last.cost + pick.c, total, tickets,
        gain: pick.r.kind === 'exp' || pick.r.kind === 'away' ? 100 * ((1 + last.gain / 100) * (1 + pick.gn / 100) - 1) : last.gain + pick.gn }) // % gains compound
      else steps.push({ i: pick.r.i, name: pick.r.name, skill: pick.r.skill, kind: pick.r.kind, from: pick.L, to: pick.L + 1, cost: pick.c, gain: pick.gn, total, tickets })
    }
    return { title, unit, steps }
  }).filter((p) => p.steps.length)
}
