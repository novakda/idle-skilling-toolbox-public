// Realm tab (#23): where you are in the Realm vs the wiki's progression guide (data/wiki/raw/Realm.wikitext, "Strategies").
// RealmStuff index meanings are in docs/realm.md; every formula below is the game's (MinionInfo block, Qno2x.js offsets there).
// Static tables (minions, traits, blessings, shrine/vending rows, colour gates) come from src/derive-realm.ts.
import realm from './data/realm.json'

/** A barn slot as the game shows it: 20 minions a page, so slot 0 is page 1 #1 and slot 20 is page 2 #1. */
export const barnPos = (slot: number) => `p${Math.floor(slot / 20) + 1} #${(slot % 20) + 1}`

type Save = Record<string, unknown>
type Slot = [string, number, unknown, number, number, ...unknown[]]
const n = (v: unknown) => Number(v ?? 0) || 0
const R = realm as unknown as {
  minions: Record<string, { name: string; trait: number; evo: string[]; parent: string | null }>
  traits: Record<string, { name: string; value: number; text: string; stack: boolean }>
  blessings: Record<string, { name: string; value: number; text: string }>
  fruits: Record<string, string>
  shrine: { name: string; max: number; text: string; base: number; scale: number }[]
  vending: { name: string; per: number; base: number; scale: number; text: string }[]
  tierFirst: number[]
  trophies: { target: number; text: string }[]
  compositions: unknown[]
}
export const DATA = R

/** Health-bar colour tiers in RealmStuff[4] order. Gate = first Afterlife whose boss has the tier (game BossHP table). */
export const TIERS = ['Red', 'Orange', 'Yellow', 'Blue', 'Purple', 'Pink', 'White', 'Rainbow'] as const
/** Evolution level caps: a minion at evolution stage s stops levelling at Evo(s) until evolved (MinionInfo "Evo"). */
export const EVO = [10, 50, 200]
const name = (id: string) => R.minions[id]?.name ?? id

/** id, then parent, grandparent… (MinionDatabase field 7). */
export function lineage(id: string): string[] {
  const out: string[] = []
  for (let m: string | null = id; m && R.minions[m]; m = R.minions[m]!.parent) out.push(m)
  return out
}
/** Evolution path root → id, as names ("Piggy → Hippo"). */
export const path = (id: string) => lineage(id).reverse().map(name).join(' → ')

/** A barn minion's traits (TraitList @6451390): its own and every ancestor's, its family passive (MinionA/C → 7 Coin
 *  Pressing, B → 1, D → 53), plus the Orb Tower trait (RealmStuff[31], -1 = none). */
const FAMILY_PASSIVE: Record<string, number> = { A: 7, B: 1, C: 7, D: 53 }
/** Where the wiki's minion note disagrees with the game code (#2618, checked 2026-10-21 against Qno2x.js; offsets in bytes).
 *  Shown under the wiki's text, which is kept as written. Unstackable traits count for 1 + min(Stackability, 1) + Bagged
 *  Pancakes carriers (MinionTraitALL @6441000), which several "N of these" claims ignore. */
export const WIKI_GAME_SAYS: Record<string, string> = {
  Hippo: 'Chonkoppo is the most expensive Pig to upgrade (MinionUpgCost reads MinionDatabase[6]: Chonkoppo 50M, Rainboppo 10M, @6410497).',
  Crikeydile: 'Cashback is capped at 50% (refund = spent × min(0.5, (Open Register + Nickel Back)/100), @6591740): 2 reach it; the 2nd needs an extra stack.',
  Musculor: 'The no-use chance is capped at 65% (@6748300): 2 give 60%, 3 hit the cap.',
  Stork: "Dual Damage works for every minion once one carries it: Red hits also land as Orange and Orange as Red (@6582000).",
  Corruptor: 'Linear, not diminishing: trophy bonus × (1 + count) up to 10× (@6405269); the count is limited by the unstackable-trait cap.',
  Gemmar: "Every minion, not just a main one: each does 1% more damage per its own level (@6397335).",
  Mammoth: 'Doubles the level damage of every Piggy-family minion (@6391747), not just a main one.',
  'Big Bone': "Once any barn minion carries Pure Hearted, every attack adds a White hit of log10(outside-Realm DPS) (@6580900).",
  'Phaser Duck': 'Chance = (total + fruit bonus 4)/100 with no cap; the 2nd duck needs an extra stack (@6743400).',
  Scissarus: 'Chance = (fruit bonus 17 + total)/100, no cap; the free level is skipped at an evolve cap (@6512797). 4 need 3 extra stacks.',
  Purpback: 'Stack cap is 1 + min(Stackability, 1) + Bagged Pancakes (Chonkoppo adds 1).',
  'Blaken Gold': 'Stack cap is 1 + min(Stackability, 1) + Bagged Pancakes (Chonkoppo adds 1).',
  Chonkoppo: 'Its trait is Stackability: unstackable traits count one more carrier (+1 at most).',
}
export function traitsOf(id: string, orb = -1): Set<number> {
  const t = new Set(lineage(id).map((m) => R.minions[m]!.trait))
  const fam = FAMILY_PASSIVE[id[6] ?? '']
  if (fam !== undefined) t.add(fam)
  if (orb >= 0) t.add(orb)
  return t
}

export function barn(save: Save) {
  const rs = (save.RealmStuff as unknown[]) ?? []
  return ((rs[3] as Slot[] | undefined) ?? []).flatMap((s, slot) => s[0] === 'none' ? [] : [{
    slot, id: s[0], name: name(s[0]), level: n(s[1]), stage: n(s[3]), spent: n(s[4]), path: path(s[0]),
    cap: EVO[n(s[3])] ?? Infinity, // levelling stops here until it evolves
  }])
}

/** Barn slots (MinionInfo "BarnSlots"): 3 + 4·crystal-shop item 0 + Wheat Chew + Barno blessing + Carnate, max 180.
 *  ponytail: Barno counted at 1 per pick; blessing multipliers (Superblesser, fruit, Lizardman) not ported. */
export function barnSlots(save: Save) {
  const rs = (save.RealmStuff as any[]) ?? []
  return Math.min(180, Math.round(3 + 4 * n(rs[42]?.[0]) + n(rs[8]?.[0]) + n(rs[11]?.o) + n(rs[13]?.[2])))
}

/** Realm EXP a banish gives before Riftseeker/Intellingo (MinionInfo "BanishEXPgain"): 5 + (10·max(0, log10(coins spent) − 4))² + coins^0.4. */
export const PROTECT_COST = 25 // MinionInfo OrbCost(3)
export const banishExp = (spent: number) => 5 + (10 * Math.max(0, 0.434295 * Math.log(Math.max(1, spent)) - 4)) ** 2 + spent ** 0.4
/** Shrine upgrade cost (MinionInfo "ShrineUpgCost"): base · scale^level, in Spirals. */
export const shrineCost = (i: number, level: number) => R.shrine[i]!.base * R.shrine[i]!.scale ** level
/** Vending item bonus (MinionInfo "VendingBonus"): items 5-8 and 15 curve, the rest per-level × level. */
export function vendingBonus(i: number, level: number) {
  if (i >= 5 && i <= 8) return Math.round(((100 * level) / Math.max(1, level + 25)) * 10) / 10
  if (i === 15) return Math.round(((50 * level) / Math.max(1, level + 35)) * 10) / 10
  return R.vending[i]!.per * level
}
/** FieldTraitBonusQTY (MinionInfo @6424562): Field plot i's bonus at level RealmStuff[35][i]. */
export function fieldTraitQty(rs: any[], i: number) {
  const L = n(rs[35]?.[i]), v = R.traits[45 + i]!.value
  return i === 0 ? Math.floor(7 ** L * v) : i === 1 ? Math.floor(10 * 1.25 ** L * v) / 10 : i === 2 ? Math.floor(1.2 ** L * v)
    : i === 3 ? Math.floor(8 * L) : i === 4 ? Math.floor(L) / 10 : Math.floor(1.5 ** L * v)
}
/** FruitBonusTypes names (CustomMaps @18602300) for the fruit types read outside the Realm, and 18 (all fruit bonuses). */
export const FRUIT_TYPE: Record<number, string> = { 11: '%_Cash_outside_Realm', 15: '%_Fight_DMG_outside_Realm', 16: '%_Away_gains_outside_Realm', 18: '%_All_Fruit_Bonuses' }
/** FruitBonusTypeT(t) (@6468847): the rolled amounts of fruit type t summed over the 7 slots RealmStuff[17] ([name, type1, amt1,
 *  type2, amt2, type3, amt3]); t ≠ 18 then × (1 + Juiced Fruit plot/100) × (1 + fruit 18/100) (@6471874). 0 when no slot rolled t. */
export function fruitBonus(save: Save, t: number): number {
  const rs = (save.RealmStuff as any[] | undefined) ?? [], name = FRUIT_TYPE[t]
  let sum = 0, has = false
  for (const slot of ((rs[17] as unknown[][] | undefined) ?? []).slice(0, 7))
    if (slot[0] !== 'none') for (let i = 0; i < 3; i++) if (slot[2 * i + 1] === name) { has = true; sum += n(slot[2 * i + 2]) }
  if (!has) return 0
  return t === 18 ? sum : (1 + fieldTraitQty(rs, 2) / 100) * (1 + fruitBonus(save, 18) / 100) * sum
}
/** Icecream Sammich (vending 10): a Shrine reset starts coins at VendingCost(10, 17) = 0.02 · base · 25^10 · scale^(level-1) when > 10
 *  (reset @6764000, cost branch 17 @6416528); 0 when unowned. */
export const sammichStart = (level: number) => (level > 0 ? 0.02 * R.vending[10]!.base * 25 ** 10 * R.vending[10]!.scale ** (level - 1) : 0)
/** Orb Tower energy cap (MinionInfo "OrbEnergyCap"): (10 + 10·expansions)·2^expansions + Chagrin. ponytail: Chagrin at 3 per pick, no multipliers. */
export const orbCap = (expansions: number, chagrin = 0) => Math.round((10 + 10 * expansions) * 2 ** expansions + 3 * chagrin)

// Which barn traits deal each colour (trait text from TraitTypes; Blue is the Orb Tower laser, not a trait).
// Colour args of CreateDmg (@6581220..6584237): trait 64 → 6 (White), 71 → 7, Orange trait 2 → 1 else 0, 43 adds the other of 0/1, banish with trait 28 → 4 (@6637201),
// Lemonhearted 23 → crits land on tier 2. Pink (5) has no source of its own: CreateDmg lets any colour land while the tier is Pink (@6446043).
const COLOUR_TRAITS: Record<number, number[]> = { 0: [0], 1: [2, 43], 2: [23], 4: [28], 6: [64], 7: [71] }
const PINK_TRAITS = [...new Set(Object.values(COLOUR_TRAITS).flat())]
const COLOUR_HOW = ['Piggy / Pet Rock / Ogre Spawn line (Heart Attack)', 'Pet Rock → Mountain (OJ Heart Stab), or Stork', 'Babby Egg → Lil Chicken (Lemonhearted: crits deal Yellow)',
  'Orb Tower laser', 'Piggy → Hippo → Horn Hippo (Lv50) → Rainboppo (Lv200): banishing deals Purple', 'Any damage: while Pink is the boss tier, every colour lands (CreateDmg @6446043)',
  'Ogre Spawn → Ogre → Flesh Ogre → Big Bone (Pure Hearted)', 'Torchy (Lord\'s Lair: all four flames, then buy in After Life)']

/** Wiki composition tables (Strategies), parsed from the wiki by src/derive-realm.ts: one per progression stage. `id`: target
 *  minion; anything on its lineage counts toward it. Counts: a number; "Remaining slots" = the rest (REST); "BP+2" = Bagged
 *  Pancakes bonus + 2; "3 up to BP+2" = max(3, BP+2). "Any" rows and the end-game remaining-slot options are optional fill. */
type Target = { count: number; id: string; level: string; note: string; optional: boolean; pick?: string }
const REST = 999
export const STAGES = [
  { key: 's1', label: 'Stage 1 (wiki image)', comp: 'Stage 1 composition (from wiki image)' },
  { key: 's5', label: 'Stage 2-5 (wiki image)', comp: 'End of Stage 5 composition (from wiki image)' },
  { key: 's7', label: 'Stage 6-7 (wiki image)', comp: 'End of Stage 7 composition (from wiki image)' },
  { key: 's10', label: 'Stage 8-10 (wiki image)', comp: 'End of Stage 10 composition (from wiki image)' },
  { key: 's13', label: 'Stage 11-13 (wiki image)', comp: 'End of Stage 13 composition (from wiki image)' },
  { key: 's15', label: 'Stage 14-15 (wiki image)', comp: 'End of Stage 15 composition (from wiki image)' },
  { key: 'reset', label: 'Stage 16-24: reset loop, before Realm Lv20', comp: 'Reset loop composition' },
  { key: 'lv20', label: 'Stage 16-24: reset loop, after Realm Lv20', comp: 'Reset loop composition - after Realm Lv20' },
  { key: 'shrine', label: 'Stage 16-24: about to reach the Shrine goal', comp: 'Reset loop composition - about to reach Shrine Upgrades goal' },
  { key: 'vending', label: 'Stage 25-49: Vending Machine purchase loop', comp: 'Vending Machine purchase loop composition' },
  { key: 'final', label: 'Stage 25-49: final push towards Stage 50', comp: 'Final push composition' },
  { key: 'endgame', label: 'Stage 50+: end-game last reset', comp: 'End-game last reset composition' },
] as const
export type StageKey = (typeof STAGES)[number]['key']
/** Stage from best Afterlife reached (the wiki's section bounds 16 / 25 / 50), Realm Lv and Shrine progress, as the wiki words
 *  each switch: "getting closer to the Shrine Upgrades goal" → that table (read as: half the goal rows at their low target, or
 *  more); "get around 60M Spirals when resetting" to reach the final Shrine targets → final push (Stage 47 is only the White wall
 *  inside it). `goalFrac` 0-1 of SHRINE_GOAL rows met; `finalMet` = every SHRINE_FINAL low target met. Override in the tab. */
export function autoStage(bestReached: number, realmLv: number, goalFrac: number, finalMet: boolean): StageKey {
  // Stage 1-15: the wiki's screenshots ("by Stage 1", "by the end of Stage 5/7/10/13/15"), transcribed in derive-realm.ts.
  if (bestReached < 16) return bestReached <= 1 ? 's1' : bestReached <= 5 ? 's5' : bestReached <= 7 ? 's7' : bestReached <= 10 ? 's10' : bestReached <= 13 ? 's13' : 's15'
  if (bestReached < 25) return realmLv < 20 ? 'reset' : goalFrac >= 0.5 ? 'shrine' : 'lv20'
  if (bestReached < 50) return finalMet ? 'final' : 'vending'
  return 'endgame'
}
/** Share of a Shrine goal's rows at their low target (capped at the upgrade's max). */
export function goalShare(levels: number[], goal: Record<string, [number, number]>) {
  const rows = R.shrine.map((u, i) => ({ u, lv: n(levels[i]) })).filter(({ u }) => goal[u.name])
  return rows.length ? rows.filter(({ u, lv }) => lv >= Math.min(goal[u.name]![0], u.max)).length / rows.length : 0
}
/** Measured alternative to the end-game remaining slots (2026-10-23, the author's save at Afterlife 71, every minion Lv200, scored with
 *  the game's own blocks by PAI/MEMORY/WORK/realm-barn-eval/barn-eval.ts). Swapping 24 of the Lizardmen for these, placed at the
 *  END of the barn so no earlier slot index moves (the slot-index coin doubler, #2645), measured coins ×411 and Red+Orange DPS
 *  ×135. These three don't attack (attackers 85 → 65), but the tail lifts every attacker's crit damage (21 → 143) and multihit, and
 *  crits apply to White hits (log10 outside DPS each, #2670), so White clears 3.8× faster: 51 s vs 194 s over Afterlife 71-75.
 *  Re-measured 2026-10-24 (sweep.ts) as 12 Cinderduck, 8 Goose, 10 Pompeille, 1 Retiarius in place of 31 Lizardmen: coins ×4711,
 *  Red+Orange DPS ×240, White 188 s → 55 s (×3.4), attackers 85 → 65. A snapshot, not re-measured live. */
export const ECONOMY_TAIL = { swap: [['Cinderduck', 12], ['Goose', 8], ['Pompeille', 10], ['Retiarius', 1]] as [string, number][], replaces: 31,
  coins: 4711, dps: 240, white: 3.4, whiteSec: [55, 188], attackers: [85, 65], measured: '2026-10-24' }
/** Wiki File name when the stage's composition was transcribed from a screenshot (Stage 1-15), else null. */
export function stageImage(key: StageKey): string | null {
  const title = STAGES.find((s) => s.key === key)!.comp
  return (R.compositions as { title: string; image?: string }[]).find((c) => c.title === title)?.image ?? null
}
/** What to optimise the end-game optional rows for (#2676). Per goal: [minion name, count]; 'cap' = the unstackable-trait cap
 *  (1 + min(Stackability, 1) + Bagged Pancakes = the wiki's BP+2, Chonkoppo in the table gives the Stackability); 'any' = stackable,
 *  no cap and no measured best, so it stays optional ("as many as you like"). Coins/Measured counts are the barn-eval harness's
 *  tail (ECONOMY_TAIL; Cinderduck 1 → ×7 coins, 10 → ×58, 20 → ×86). Coins drops Goose when the Orb Tower trait is Gold Bless
 *  (39, the Goose's own trait: the wiki's "if you do not have Gold Bless on Orb Tower"). Traits: Tax Collector 32 (Cinderduck),
 *  Bolstered Econ 19 (Crocodile, +20% coins per 100 total minion Lv), Wooping Whack 36 (Pompeille, unstackable), Resetti 29
 *  (Blaken Gold), Fruit Vendor 40 (Everest), Harvester 30 (Retiarius). Crocodile also carries its parent Lizard's Charger (trait 4,
 *  TraitList = own + ancestors' traits), hence Energy. Pompeille is NOT in Coins: the harness measured it lowering coins (1 → ×0.95,
 *  10 → ×0.58; PAI/MEMORY/WORK/realm-barn-eval/barn-eval3.json) despite the wiki's "+150% coins"; it is in Damage and Measured best.
 *  Measured 2026-10-24 (same harness, sweep.ts): Crocodile after the Coins tail peaks at 8 (0 → ×1.48 coins, 9 ≈ 8, 12 lower;
 *  DPS ×0.65, White 49 → 61 s). Retiarius changes no coins/DPS vs Lizardman (it keeps Bless Updog), so Food takes the rest row
 *  ('rest'); 0 Lizardmen measured lower DPS, so one stays. In the Coins barn Retiarius filling the rest measured coins ×1.27, DPS
 *  ×0.97 (1 Retiarius: ×1.07 both). Energy: no swap. Afterlife 71-75 has no Blue tier (no laser), so the only sink is protects,
 *  ≤6 a day × 25 = 150/day, against ~142/h Charger + Spare Charge; extra Crocodile only costs coins and DPS.
 *  Pompeille, re-measured 2026-10-24 in the Retiarius-filled tail: coins rise to the cap (0 → ×2.6 at 1, ×7.2 at 10 = BP+2 at
 *  BP 8), DPS ×72, so it IS in Coins now (the barn-eval3 "lowers coins" result above was a Lizardman-filled barn). Crocodile still
 *  peaks at 8 with Pompeille in. Measured best = Pompeille at cap + 1 Retiarius, Lizardman rest: coins ×1.54, DPS ×1.78 vs
 *  ECONOMY_TAIL, White 49.7 → 54.5 s. ECONOMY_TAIL itself stays the 2026-10-23 snapshot (coin loop + its details panel).
 *  Then hill-climbed (2026-10-24, PAI/MEMORY/WORK/realm-barn-eval/climb.ts, parallel workers, one-step moves from those picks;
 *  local optima): Coins = the picks below, coins ×1.15 / DPS ×0.96 over the hand pick (Goose ahead of Cinderduck helped, order is
 *  not modelled here); Measured best = coins ×1.24, DPS ×1.15, White 54.5 → 44.5 s, Lizardman keeps the rest (19 at BP 8). */
export const GOALS = [
  { key: 'coins', label: 'Coins', picks: [['Goose', 12], ['Cinderduck', 12], ['Pompeille', 9], ['Crocodile', 4], ['Everest', 1], ['Retiarius', 'rest']] },
  { key: 'measured', label: 'Measured best (coins + DPS)', picks: [['Cinderduck', 13], ['Goose', 7], ['Pompeille', 'cap'], ['Crocodile', 1], ['Retiarius', 20], ['Blaken Gold', 2]] },
  { key: 'damage', label: 'Damage', picks: [['Pompeille', 'cap']] },
  { key: 'spirals', label: 'Spirals on reset (swap in before resetting)', picks: [['Blaken Gold', 'cap']] },
  { key: 'rerolls', label: 'Cornucopia rerolls', picks: [['Everest', 'cap']] },
  { key: 'energy', label: 'Energy (already covered: no swap)', picks: [] },
  { key: 'food', label: 'Food bundles', picks: [['Retiarius', 'rest']] },
] as { key: string; label: string; picks: [string, number | 'cap' | 'any' | 'rest'][] }[]
export type GoalKey = string
type Opts = { goal?: GoalKey; orbTrait?: number; slots?: number }
export function stageComp(key: StageKey, bp: number, opts: Opts = {}): Target[] {
  const title = STAGES.find((s) => s.key === key)!.comp
  const table = (R.compositions as { title: string; rows: { amount: string; level: string; id: string | null; note: string; fill: boolean }[] }[]).find((c) => c.title === title)
  const rows: Target[] = (table?.rows ?? []).filter((x) => x.id).map((x) => {
    const a = x.amount.toLowerCase(), num = parseInt(a, 10), lead = Number.isNaN(num) ? 0 : num
    const rest = /rema(i)?ning/.test(a), any = /^any/.test(a) // the end-game table spells it "remaning"
    const count = rest ? REST : /bp\+2/.test(a) && !any ? Math.max(lead, bp + 2) : lead
    return { count, id: x.id!, level: x.level, note: x.note, optional: any || (x.fill && !rest) }
  })
  const goal = GOALS.find((g) => g.key === opts.goal)
  if (!goal) return rows
  // Chosen optional rows become counted ("for Coins: 12×"); the Lizardman rest row gives up the slots. Clamped to the barn's
  // free slots after the counted core rows, in the goal's order.
  let free = opts.slots == null ? Infinity : opts.slots - rows.filter((t) => !t.optional && t.count !== REST).reduce((s, t) => s + t.count, 0)
  for (const [nm, want] of goal.picks) {
    const t = rows.find((t) => t.optional && name(t.id) === nm)
    if (!t || (nm === 'Goose' && goal.key === 'coins' && opts.orbTrait === 39)) continue
    if (want === 'any') { t.pick = goal.label; continue }
    if (want === 'rest') { // takes the rest row's slots; one Lizardman stays (0 Lizardmen measured lower DPS)
      const r = rows.find((t) => t.count === REST)
      if (r) r.count = 1
      Object.assign(t, { count: REST, optional: false, pick: goal.label }); continue
    }
    const tr = R.traits[R.minions[t.id]!.trait]
    const cap = tr && !tr.stack ? bp + 2 : Infinity
    const count = Math.max(0, Math.min(want === 'cap' ? cap : want, cap, free))
    if (!count) continue
    Object.assign(t, { count, optional: false, pick: goal.label })
    free -= count
  }
  return rows
}
// Wiki "Shrine Upgrades goal" (Stage 16-24) and "Final push towards Stage 50". [min, max]; max = upgrade max when "maxed".
export const SHRINE_GOAL: Record<string, [number, number]> = { Bhakti: [30, 40], Dharma: [8, 8], Sahaja: [10, 10], Carnate: [10, 10] }
export const SHRINE_FINAL: Record<string, [number, number]> = { Dharma: [17, 17], Bhakti: [70, 200], Carnate: [16, 16], Ahisma: [20, 20], Sahaja: [30, 40], Nirvana: [20, 50] }
// Wiki final targets for upgrades with no live effect, so they are NOT in SHRINE_FINAL (spendPlan never buys them). Shown struck through in the Shrine table.
//  Moksha [13][6]: no literal read in the game; field gen = MinionFieldGen @6438623 has no shrine term.
//  Taoism [13][4]: read at @6527372 but unreachable: the refund tick (@6527190, runPeriodically 1e3 from @6526300) runs the roll only while GenINFO[52]==0,
//  and then needs coins < .15·GenINFO[52] = 0 (coins are never negative); it sets GenINFO[52]=1 at once, and that is the only write besides the 0 initialiser.
const SHRINE_DEAD: Record<string, [number, number]> = { Taoism: [40, 60], Moksha: [30, 100] }
// Wiki "Vending Machine must-have goodies"; Vendi Bar is the cost-reduction warning.
// Orb Tower coin traits the wiki names for after Realm Lv20: Gold Bless, Smart Money, Make It Rain (TraitTypes ids).
const COIN_TRAITS = [39, 31, 8]
/** Orb Tower reroll (@6925662): the game's trait list (randolist[3]) cut to traits some barn minion carries
 *  (TraitList: own, ancestors', family passive, current Orb trait; an empty barn carries nothing), plus 1, 5, 11, 13
 *  always; then each candidate in ascending id order gets one roll at TraitChanceORB (@18599289) and the first hit
 *  wins; no hit gives 1. Order: the loop walks the map's keys() = arrayKeys() = `for (e in this.h)` (@1010941), and JS
 *  enumerates integer-like keys ascending, whatever order the map was filled in (it is filled rarest-first). */
const ORB_BASE = [1, 5, 7, 8, 11, 12, 13, 14, 20, 22, 30, 31, 32, 33, 39, 42]
const ORB_ODDS: Record<number, number> = { 1: 0.16, 5: 0.16, 7: 0.008, 8: 0.02, 11: 0.16, 12: 0.03, 13: 0.16, 14: 0.03, 20: 0.04, 22: 0.16, 30: 0.16, 31: 0.004, 32: 0.005, 33: 0.05, 39: 0.006, 42: 0.007 }
export function orbRerollOdds(barnTraits: Set<number>) {
  const pool = new Set(ORB_BASE.filter((t) => barnTraits.has(t)).concat([1, 5, 11, 13]))
  const odds: Record<number, number> = {}
  let miss = 1
  for (const t of Object.keys(ORB_ODDS).map(Number).sort((a, b) => a - b)) if (pool.has(t)) { odds[t] = miss * ORB_ODDS[t]!; miss *= 1 - ORB_ODDS[t]! }
  odds[1] = (odds[1] ?? 0) + miss
  return odds
}
/** Every Orb pool trait for the page: base chance, whether this barn lets it roll, the real odds, and who carries it. */
export function orbOddsTable(barnTraits: Set<number>) {
  const odds = orbRerollOdds(barnTraits), always = new Set([1, 5, 11, 13])
  const owners = (t: number) => t === 7 ? 'any Piggy- or Egg-family minion (family passive)'
    : Object.values(R.minions).filter((m) => m.trait === t).map((m) => m.name).join(', ') + ' or a descendant'
  return ORB_BASE.map((t) => ({ id: t, name: R.traits[t]?.name ?? `trait ${t}`, base: ORB_ODDS[t]!,
    status: always.has(t) ? 'always' : barnTraits.has(t) ? 'carried' : 'blocked', p: odds[t] ?? 0,
    carriedBy: always.has(t) ? 'always in the pool' + (t === 1 ? '; also takes every miss' : '') : owners(t) }))
}
export const CHOCCY_CAP = Math.ceil(25 / 0.6) // 1 + 0.6·B% reaches the 1.25 cap at B = 41.67 (1 per level)
const VEND_MUST = new Set(['Wheat Chew', 'Choccy Coin', 'Tuna Can', 'Corn Can', 'Icecream Sammich', 'Bagged Pancakes', 'Iced Footlong'])
const CORN = ['ores', 'fish', 'traces', 'souls', 'crops', 'flowers', 'vessels', 'treasures']
const FIELD = ['Full Blossom', 'Smol Savings', 'Juiced Fruit', 'Cash Genesis', 'Spare Charge', 'Level Cash', 'Level Slash', 'Afterlife Slam']
const FIELD_GOAL: Record<number, number> = { 0: 10, 2: 12, 3: 12, 4: 12, 5: 10 } // wiki "Stage 50 and beyond" Field levels

/** Spend Spirals on the wiki's Shrine goal, cheapest next level first: every goal row to its low target, then to its high one.
 *  Returns from→to per upgrade and what is left. */
export function spendPlan(levels: number[], spirals: number, goal: Record<string, [number, number]>) {
  const lv = R.shrine.map((_, i) => n(levels[i])), plan: Record<string, [number, number]> = {}
  let left = spirals
  for (const k of [0, 1]) for (;;) {
    if (k === 1 && R.shrine.some((u, i) => goal[u.name] && lv[i]! < Math.min(goal[u.name]![0], u.max))) break // low targets first, all of them
    const c = R.shrine.map((u, i) => ({ u, i, cost: shrineCost(i, lv[i]!) }))
      .filter(({ u, i }) => goal[u.name] && lv[i]! < goal[u.name]![k] && lv[i]! < u.max).sort((a, b) => a.cost - b.cost)[0]
    if (!c || c.cost > left) break
    left -= c.cost; plan[c.u.name] = [plan[c.u.name]?.[0] ?? lv[c.i]!, ++lv[c.i]!]
  }
  const met = R.shrine.every((u, i) => !goal[u.name] || lv[i]! >= Math.min(goal[u.name]![0], u.max))
  return { plan, left, levels: lv, met }
}

/** Assign barn minions to composition rows: a minion counts toward a target it is, or is an ancestor of (highest level first). */
function compose(minions: ReturnType<typeof barn>, comp: Target[]) {
  const free = [...minions].sort((a, b) => b.level - a.level)
  // Fill order: counted rows, then optional fill ("Any": no cap), then the remaining-slots row; display keeps the wiki order.
  const pass = (t: Target) => (t.count === REST ? 2 : t.optional ? 1 : 0)
  const got = new Map<Target, ReturnType<typeof barn>>()
  for (const p of [0, 1, 2]) for (const t of comp.filter((t) => pass(t) === p)) {
    const onPath = new Set(lineage(t.id))
    const take = free.filter((m) => onPath.has(m.id)).slice(0, t.optional && !t.count ? Infinity : t.count)
    for (const g of take) free.splice(free.indexOf(g), 1)
    got.set(t, take)
  }
  const rows = comp.map((t) => ({ ...t, name: name(t.id), path: path(t.id), have: got.get(t)!, done: got.get(t)!.filter((g) => g.id === t.id).length }))
  return { rows, extra: free }
}

/** Banishes used and seconds until they refill, as of the save's QuitTime (#2672). RealmStuff[20] only ticks on the Realm screen
 *  (SceneEvents_51, 1 s @30851176) and catches up on entry by now − LastVisitedZone[24] (@30845965), which the Realm screen keeps at
 *  now (@30848506, every 500 ms): so the refill lands at LastVisitedZone[24] + [20], on or off the Realm screen. Past it, [22] is zeroed on entry. */
export function banishRefill(save: Save) {
  const rs = (save.RealmStuff as unknown[]) ?? [], quit = n(save.QuitTime), seen = n((save.LastVisitedZone as unknown[] | undefined)?.[24])
  const left = n(rs[20]) - (quit > 0 && seen > 0 ? Math.max(0, quit - seen) : 0)
  return left >= 0 ? { used: n(rs[22]), resetIn: left } : { used: 0, resetIn: ((left % 86400) + 86400) % 86400 }
}

export function realmState(save: Save, stageOverride?: StageKey | null, barnGoal?: GoalKey) {
  const rs = (save.RealmStuff as any[]) ?? []
  if (rs.length < 50) return null
  const beaten = n(rs[6]), best = n(rs[23]), afterlife = beaten + 1, bestReached = best + 1
  const minions = barn(save), orbTrait = n(rs[31] ?? -1)
  const traits = new Set<number>(minions.flatMap((m) => [...traitsOf(m.id, orbTrait)]))
  // Orb button shows when RealmStuff[23] >= randolist[1][5] = 11 (GenINFO[37][5] built @6525147, click @6919860); [23] = bosses beaten, so Afterlife 12 reached = the first Blue boss.
  const orbUnlocked = best >= 11 // its laser is the only Blue source
  const tiers = TIERS.map((colour, t) => ({
    colour, first: R.tierFirst[t]!, how: COLOUR_HOW[t]!,
    can: t === 3 ? orbUnlocked : (t === 5 ? PINK_TRAITS : COLOUR_TRAITS[t] ?? []).some((x) => traits.has(x)),
    hp: n(rs[4]?.[t]), // current boss's remaining HP in this tier
  }))
  const nextGate = tiers.find((t) => !t.can) ?? null
  const realmLv = n(rs[0]), exp = n(rs[1]), need = n(rs[2])
  // EXP to Realm Lv20: the rest of this level, then each next requirement is 2·req + 5 (LvUp listener).
  let toLv20 = 0
  for (let lv = realmLv, req = need, have = exp; lv < 20; lv++, req = 2 * req + 5, have = 0) toLv20 += req - have

  const shrineLv: number[] = rs[13] ?? []
  const goal = bestReached >= 48 ? SHRINE_FINAL : SHRINE_GOAL
  const spirals = n(rs[12])
  // Total effect at the current level, from each RealmStuff[13][i] read in the game code.
  const x = (v: number) => (v < 1e4 ? String(+v.toFixed(2)) : v.toExponential(2))
  const shrineEffect = (i: number, L: number) => [
    `${10 + L} blessing types`, // BlessingTypes = 10 + L
    `×${x(1.08 ** L)} damage`, // ×1.08^L, Realm minions (@6398081) and outside fights (@2638616)
    `+${L} barn slots`, // BarnSlots @6387458
    `${L} rerolls a run`, // reset sets [34] = L (@6762317)
    'none: the refund roll can never fire', // @6527372: needs coins < .15·GenINFO[52], and GenINFO[52] is 0 whenever it is checked (see SHRINE_DEAD)
    `+${L}% chain chance · ×${x((1 + L / 100) ** best)} coins`, // chain @18667214; coins ×(1+L%)^best bosses (@6404120)
    'none: no game read of this level',
    `+${L * Math.floor(realmLv / 10)}% away gains`, // L × floor(Realm Lv/10) (@20194212)
  ][i]!
  const shrine = R.shrine.map((u, i) => ({
    i, name: u.name, text: u.text, level: n(shrineLv[i]), max: u.max, next: n(shrineLv[i]) < u.max ? shrineCost(i, n(shrineLv[i])) : null, goal: goal[u.name!] ?? null, dead: SHRINE_DEAD[u.name!] ?? null,
    effect: shrineEffect(i, n(shrineLv[i])),
  }))
  // Unlock rule †: none. The Upgrades tab lists all 8 rows (ShrineUpgrades order), two at a time; its scroll bar sets the first
  // row to floor(drag/217·7) (@6845117 draw), and a click buys when level < ShrineMaxLV and Spirals ≥ ShrineUpgCost (@6760065).
  // Spend the Spirals you hold: cheapest next level among goal upgrades still under their target.
  const { plan, left, met: shrineGoalMet } = spendPlan(shrineLv, spirals, goal)

  const cheapest = shrine.filter((s) => s.next != null).sort((a, b) => a.next! - b.next!)[0]
  // Spirals a reset pays (MinionInfo "ShrineResetQTY" @6421692): (5b + b²)·1.12^b, b = bosses beaten this run, × (1 + Resetti)
  // × (1 + Enlightenment blessing) × (1 + Avocado fruit) × construction 47. ponytail: only the base is ported; multipliers need BlessingBonus.
  const resetBase = (5 * beaten + beaten ** 2) * 1.12 ** beaten

  const vendLv: number[] = rs[8] ?? []
  const vendOpen = Math.min(R.vending.length, vendLv.reduce((m, v, i) => (v > 0 ? i + 2 : m), 1))
  // Total at the current level B = VendingBonus(i), from each VendingBonus(i) read; "per best afterlife" = ^RealmStuff[23].
  // IceCreamsBeaten is set on a scene's init: highest i in 7..1 with DairyAisleAchievements[i] = 1, plus 1; else 0 (@19799120).
  const dairyAch = (save.DairyAisleAchievements as number[] | undefined) ?? []
  const iceAt = [7, 6, 5, 4, 3, 2, 1].find((i) => n(dairyAch[i]) === 1), ice = iceAt === undefined ? 0 : iceAt + 1
  const p94 = n((save.PotionLV as number[] | undefined)?.[94])
  const vendEffect = (i: number, B: number, L: number) => [
    `+${B} barn slots`, // BarnSlots @6387725
    `×${x((1 + B / 100) ** best)} fight damage outside`, // ×(1+B%)^best @2639382
    `+${B} perk points`, // Skillpoints @17777739
    `×${x(Math.min(1.25, 1 + 0.6 * B / 100) ** best)} Realm coins`, // min(1.25, 1+0.6·B%)^best, AllCashBonus @6404159
    `×${x((1 + B / 100) ** best)} cash outside`, // ×(1+B%)^best @31680215
    `×${x(1 + B / 100 + 0.02 * p94)} potion bonuses (with Blasphemy #95's 2%/Lv)`, // 1 + B% + 0.02·PotionLV[94] @25950633
    `${B}% away-time retrigger chance`, // @7412838
    `×${x(1 + B / 100)} Mastery bonuses`, // @29832239
    `×${x(1 + B / 100)} Lab tank bonuses`, // @28493664
    `+${B}% away gains`, // added to fruit 16, @20194514
    `${sammichStart(L).toExponential(2)} coins after a reset`, // @6764000
    'none: no VendingBonus read',
    `vending and minion upgrade costs ÷${x(1 + B / 100)}`, // @6417689, MinionUpgCost @6412130
    `+${B} carriers for unstackable traits`, // DoubleStacksZZmax @6442030
    `×${x(1 + B * ice / 100)} minion damage (${ice} ice creams †)`, // 1 + B·IceCreamsBeaten% @6400839
    `+${B}% chain Lv chance outside`, // @18667880
  ][i]!
  const slotsNow = barnSlots(save)
  const vending = R.vending.slice(0, vendOpen).map((v, i) => ({
    // Bundled Broccoli (11) has no VendingBonus read anywhere in the bundle; its only use is VendingMachineItemsOwned
    // (@6415863: any level > 0 opens the next slot, Vendi Bar), so levels past 1 buy nothing.
    name: v.name, level: n(vendLv[i]), bonus: i === 11 || i === 10 ? 0 : vendingBonus(i, n(vendLv[i])),
    text: i === 11 ? 'No bonus: Lv1 unlocks the next slot (Vendi Bar); more levels do nothing (@6415863)'
      : i === 10 ? `Shrine reset starts you with ${sammichStart(n(vendLv[i])).toExponential(2)} coins (2% of your last level's undiscounted price; ×${R.vending[10]!.scale} a level)` : v.text,
    // Choccy Coin (3): AllCashBonus reads it as min(1.25, 1 + 0.6·B%) (@6404159, its only effect read; the other two are tooltip
    // text @6809814), so it caps at B = 41.67 → Lv42 (per 1/Lv). Levels past 42 buy nothing.
    flag: v.name === 'Vendi Bar' || (i === 11 && n(vendLv[i]) > 1) || (i === 3 && n(vendLv[i]) >= CHOCCY_CAP) ? 'avoid' : VEND_MUST.has(v.name) ? 'must-have' : '',
    capNote: i === 3 && n(vendLv[i]) > CHOCCY_CAP ? `capped at Lv${CHOCCY_CAP}: the ${n(vendLv[i]) - CHOCCY_CAP} levels past it do nothing (min(1.25, …) in AllCashBonus)`
      // BarnSlots = min(180, round(3 + 4i + Wheat Chew + blessing 15 + Carnate)) @6387735: +1 slot a level until 180.
      : i === 0 ? (slotsNow >= 180 ? 'barn at the 180-slot cap: more levels do nothing' : `caps at 180 barn slots: ${180 - slotsNow} more levels still add a slot each`)
      // Sparkle chain chance = min(other sources + Jawbreaker%, 0.85) @18667790: the cap is shared with sources outside Realm.
      : i === 15 ? 'chain chance is capped at 85% in total with other sources outside Realm' : '',
    effect: vendEffect(i, i === 11 || i === 10 ? 0 : vendingBonus(i, n(vendLv[i])), n(vendLv[i])),
  }))
  const field = FIELD.map((p, i) => ({ name: p, level: n(rs[35]?.[i]), goal: FIELD_GOAL[i] ?? null, avoid: i === 1 }))

  // Traits tab. TraitList (@6451390): own + ancestors' traits, family passive, Orb trait, then Field plots 1, 4, 6, 7 as traits
  // 45+i on every minion and plots 3, 5 only on Coin Pressing ones (@6455400); plots 0 and 2 are never traits. MinionTraitALL(t)
  // (@6441000) walks barn slots in order adding MinionTrait = TraitTypes value, or FieldTraitBonusQTY(t−45) for 45–52 (@6440251);
  // a "no"-stack trait stops after 1 + min(Stackability total, 1) + Bagged Pancakes carriers (@6441977, @6442900).
  const plot = (i: number) => n(rs[35]?.[i])
  const fieldQty = (i: number) => fieldTraitQty(rs, i)
  const traitList = (id: string) => {
    const s = traitsOf(id, orbTrait), coin = s.has(7)
    for (const i of [1, 3, 4, 5, 6, 7]) if (plot(i) > 0 && (coin || (i !== 3 && i !== 5))) s.add(45 + i)
    return s
  }
  const lists = minions.map((m) => traitList(m.id))
  const carriers = (t: number) => lists.filter((s) => s.has(t)).length
  const extraStacks = Math.min(carriers(41), 1) + vendingBonus(13, n(vendLv[13]))
  const uniq = new Set(minions.map((m) => m.id)).size + n(rs[11]?.i) // UniqueBarnMinions @6472833; ponytail: Countinion at 1 a pick
  const up100 = Math.floor(minions.reduce((t, m) => t + m.level, 0) / 100) // CalcMisc 100upgrades @6473716
  const rl5 = Math.floor(realmLv / 5) // perRealmLV(5) @6475465
  const most = Math.max(0, ...Object.values((rs[11] as Record<string, number>) ?? {}).map(n)) // MostBlessings @6475743
  // T = MinionTraitALL total (held × v); "each carrier" rows are per-slot MinionTrait reads, so T is not what the game uses.
  const on = (b: boolean, s: string) => (b ? s : 'off')
  const traitEffect = (t: number, T: number, v: number): string => ({
    0: 'each carrier attacks (Red); value only tested > 0 (DoesMinionAttack @6410426)',
    1: `each carrier ×${x(1 + v / 100)} damage`, // @6400090
    2: 'each carrier hits Orange instead of Red; value only tested ≥ 1 (@6410474, @6582079)',
    3: 'none: no game read (only as the slot 3 coin-doubler chance, see the bug note)',
    4: `each carrier +${v} Orb energy/h`, // MinionORBCHARGE @6408186
    5: `each carrier +${v}% crit chance`, // @6402763
    6: `+${x(T)}% crit chance`, // @6402809
    7: 'each carrier earns MinionCASH a minute; value only tested ≥ 1 (@6606498)',
    8: `×${x(1 + T / 100)} coins`, // AllCashBonus @6403756
    9: `upgrade cost ÷${x(1 + T * uniq / 100)} (${uniq} unique types)`, // @6412024
    10: `+${x(T)}% damage (summed with Smol Damage)`, // @6400186
    11: `each carrier +${v} base damage`, // @6390162
    12: `+${x(T)} base damage`, // @6390209
    13: `each carrier +${v * rl5} base damage (×⌊Realm Lv/5⌋ ${rl5})`, // @6390258
    14: `each carrier +${v}% attack speed`, // @6409461
    15: `+${x(T)}% attack speed`, // @6409562
    16: `+${x(T * uniq)}% attack speed (${uniq} unique types)`, // @6409984
    17: `×${x(1 + T * uniq / 100)} damage (${uniq} unique types)`, // @6400294
    18: `each carrier +${v * rl5}% crit chance (×⌊Realm Lv/5⌋ ${rl5})`, // @6402675
    19: `×${x(1 + Math.max(0, T * up100) ** 0.6 / 100)} coins (${up100} hundred levels)`, // @6405008
    20: `+${x(T * up100)}% crit damage (${up100} hundred levels)`, // @6403026
    21: `×${x(1 + T * up100 / 100)} damage (${up100} hundred levels)`, // @6400401
    22: `×${x(1 + T / 100)} banish Realm EXP`, // BanishEXPgain @6415706
    23: on(T >= 1, 'crits also deal Yellow'), // @6447853
    24: `+${x(T)} banishes a day`, // TotalDailyBanishes @6415836
    25: `Piggy family ×${x(1 + T / 100)} base damage`, // @6391746
    26: `Pet Rock family +${x(T)}% crit chance`, // @6401690
    27: `Babby Egg family upgrade cost ÷${x(1 + T / 100)}`, // @6412525
    28: on(T > 0.5, 'banishing deals Purple = Realm EXP gained'), // @6637153
    29: `×${x(1 + T / 100)} Spirals a reset`, // ShrineResetQTY @6422510
    30: `×${x(1 + T / 100)} food bundles a turn-in`, // @6429425
    31: `×${x(1 + T * rl5 / 100)} coins (⌊Realm Lv/5⌋ ${rl5})`, // @6407548
    32: `×${x(1 + T * uniq / 100)} coins (${uniq} unique types)`, // @6407441
    33: `each carrier +${v}% multihit`, // @6410146
    34: `+${x(T)}% multihit`, // @6410193
    35: `+${x(T)}% double-blessing chance (plus fruit)`, // ShrineDoubleBlessingPCT @6422963
    36: `×${x(1 + T * rl5 / 100)} damage (⌊Realm Lv/5⌋ ${rl5})`, // @6400502
    37: on(T > 1, `coins ×${x(Math.min(1.5, T))} on each boss kill`), // @6613505
    38: `upgrade cost ÷${x(1 + T / 100)}`, // @6412184
    39: `×${x(1 + T * most / 100)} coins (top blessing ×${most})`, // @6407648
    40: `first ${x(T)} fruit rerolls a day free`, // CornucopiaUPG 1 @6430865
    41: `+${Math.min(T, 1)} carrier for unstackable traits`, // DoubleStacksZZmax @6441977
    42: `+${x(T)} blessing rerolls a boss kill`, // @6613454
    43: on(T > 0, 'Red hits also land as Orange and Orange as Red'), // @6582826
    44: `${x(Math.min(50, T))}% of coins spent refunded (with Nickel Back, cap 50%)`, // @6591419, min(.5) @6591740
    45: `not a trait (never in TraitList): Field plot gives +${x(fieldQty(0))}% flowers`, // FieldTraitBonusQTY 0 in MinionFieldGen @6438729
    46: `upgrade cost ÷${x(1 + T / 100)}`, // @6412241
    47: `not a trait (never in TraitList): Field plot gives ×${x(1 + fieldQty(2) / 100)} fruit bonuses`, // @6471874
    48: 'none: the 2× coin roll passes the slot index, never 48 (@6606617); only slot 48 (49+ slots) reads this total',
    49: `each carrier +${v} Orb energy/h`, // MinionORBCHARGE @6408231
    50: `each carrier +${v}% coins per 100 of its levels`, // MinionCASH @6407807
    51: `each carrier +${v}% damage per 100 of its levels`, // @6396273
    52: `each carrier ×${x(1 + v * best / 100)} damage (${best} best bosses)`, // @6397041
    53: `each carrier ${x(100 * v * (1 + fieldQty(0) / 100))} flowers (MinionFieldGen)`, // @6438680
    54: `upgrade cost ÷${x(1 + T / 100)}`, // @6412298
    55: `+${x(T)}% attack speed`, // @6409934
    56: `×${x(1 + T / 100)} coins`, // @6407751
    57: `+${x(T)}% damage (summed with Scar Wound)`, // @6400235
    58: `+${x(T)}% crit chance`, // @6402858
    // damage term is per minion: min(its base-damage traits/20, T)%, only when T > 1 (@6395036); not computed here
    59: `+${x(T)}% crit damage; damage +min(base-damage traits/20, ${x(T)})% a minion`, // MinionCritDmg @6403118
    60: `${x(T)}% chance a level-up is doubled free (plus fruit)`, // @6512796
    61: `each carrier ${v}% chance of 1 h gains when upgraded`, // @6512350
    62: `Ogre Spawn family +${x(T)}% attack speed`, // MinionAtkSpeedPCT @6408601
    63: `${x(Math.min(65, T))}% chance a blessing reroll is free`, // @6748629
    64: on(T > 0, 'every attack adds a White hit of log10(outside DPS)'), // @6581110
    65: `trophy coin bonus counted ×${Math.max(1, Math.min(10, 1 + T))}`, // AllCashBonus @6405268
    66: `×${x(1 + T / 100)} on the randolist[4] blessings`, // BlessingBonus @6482873
    67: `+${x(T * up100)} base damage (${up100} hundred levels)`, // @6390346
    68: `+${x(T)}% crit chance and +${x(T)}% multihit`, // @6402907, @6410243
    69: `+${x(T * uniq)}% multihit (${uniq} unique types)`, // @6410292
    70: 'none: no game read (only as the slot 70 coin-doubler chance, 71+ barn slots)',
    71: on(T > 0, 'regular attacks also deal Eternal'), // @6581476
    72: `×${x(1.5 ** T)} damage, ×${x(2 ** T)} coins, +${15 * T}% attack speed`, // @6398377, @6404086, @6409510
    73: `each minion ×(1 + ${x(T)}% × its level) damage`, // MinionDMG @6397334
  } as Record<number, string>)[t] ?? ''
  const traitRows = Object.entries(R.traits).map(([k, tr]) => {
    const t = +k, c = carriers(t), held = tr.stack ? c : Math.min(c, 1 + extraStacks)
    const v = t >= 45 && t <= 52 ? fieldQty(t - 45) : tr.value
    // Game bug: the 2× coin roll passes the BARN SLOT INDEX as the trait id (MinionTraitALL(slot, 48), @6606617, @6574275, @6575191),
    // so a Coin Pressing minion in slot k doubles with chance = this trait's total %. Trait 70 only matters in slot 70 (71+ barn slots).
    const ci = minions.findIndex((m, i) => m.slot === t && lists[i]!.has(7))
    const slotNote = ci < 0 ? '' : `slot ${t} coin-doubler: ${x(Math.min(100, held * v))}% chance`
    return { id: t, name: tr.name, text: tr.text, v, held, carriers: c, stack: tr.stack, effect: traitEffect(t, held * v, v), slotNote }
  }).sort((a, b) => +(b.held > 0) - +(a.held > 0) || a.id - b.id)

  const blessings = Object.entries((rs[11] as Record<string, number>) ?? {}).filter(([k]) => R.blessings[k])
    .map(([k, c]) => ({ key: k, count: n(c), ...R.blessings[k]! })).sort((a, b) => b.count - a.count)
  const stageAuto = autoStage(bestReached, realmLv, goalShare(shrineLv, SHRINE_GOAL), goalShare(shrineLv, SHRINE_FINAL) === 1), stage = stageOverride ?? stageAuto
  const bp = vendingBonus(13, n(vendLv[13])) // Bagged Pancakes: the wiki's "BP"
  const comp = { ...compose(minions, stageComp(stage, bp, { goal: barnGoal, orbTrait, slots: barnSlots(save) })), stage, stageAuto, label: STAGES.find((s) => s.key === stage)!.label, bp }
  const slots = barnSlots(save)
  const orb = { energy: n(rs[26]), cap: orbCap(n(rs[25]), n(rs[11]?.a)), expansions: n(rs[25]), trait: orbTrait,
    traitName: R.traits[orbTrait]?.name ?? 'none', coinBuys: n(rs[46]), dmgBuys: n(rs[33]), protects: n(rs[32]) }
  // Cornucopia: food bundles [14], resources turned in per type [15] (order: wiki list; ores/fish/traces seen in game), turn-ins today [16] (2/day), fruit slots [17].
  const cornucopia = { food: n(rs[14]), turnInsLeft: Math.max(0, 2 - n(rs[16])),
    turnedIn: CORN.map((label, i) => ({ label, total: n(rs[15]?.[i]) })),
    fruits: ((rs[17] as unknown[][]) ?? []).filter((f) => f[0] !== 'none').map((f) => ({ name: R.fruits[String(f[0])] ?? String(f[0]),
      bonuses: [1, 3, 5].filter((j) => f[j] !== 'none').map((j) => `+${f[j + 1]}${String(f[j]).replace(/_/g, ' ')}`) })) }
  const banishes = { ...banishRefill(save), max: 6 + 5 * (traits.has(24) ? 1 : 0) } // ponytail: Trashite counted once

  // Next steps, most blocking first.
  const steps: string[] = []
  if (Object.keys(plan).length)
    steps.push(`Spend ${Math.round(spirals - left).toLocaleString()} of your ${Math.round(spirals).toLocaleString()} Spirals on the wiki's Shrine goal: ${Object.entries(plan).map(([k, [a, b]]) => `${k} ${a} → ${b}`).join(', ')}. The Shrine's Upgrades tab shows two rows at a time: drag the scroll bar on its right edge down past Dharma and Bhakti to reach the rest.`)
  else if (cheapest) steps.push(`No Shrine upgrade is affordable: cheapest next level is ${cheapest.name} Lv${cheapest.level + 1} at ${Math.round(cheapest.next!).toLocaleString()} Spirals, ${Math.ceil(cheapest.next! - spirals).toLocaleString()} more than you hold.`)
  if (nextGate) {
    if (nextGate.colour === 'Purple') {
      const horn = minions.filter((m) => m.id === 'MinionA5').sort((a, b) => b.level - a.level)[0]
      const hippo = minions.filter((m) => m.id === 'MinionA2').sort((a, b) => b.level - a.level)[0]
      steps.push(`Purple wall at Afterlife ${nextGate.first} (best reached: ${bestReached}): get a Rainboppo. ` + (horn ? `Level Horn Hippo Lv${horn.level} → 200 and evolve.`
        : hippo ? `Level your Hippo Lv${hippo.level} → 50, evolve to Horn Hippo, then Lv200 → Rainboppo.` : 'Summon a Piggy → Hippo (Lv10) → Horn Hippo (Lv50) → Rainboppo (Lv200).'))
    } else steps.push(`${nextGate.colour} gate at Afterlife ${nextGate.first}: ${nextGate.how}.`)
  }
  const free = slots - minions.length
  const rest = comp.rows.find((r) => r.count === REST) // the stage table's "remaining slots" minion
  const owed = comp.rows.filter((t) => !t.optional && t.count !== REST).reduce((s, t) => s + Math.max(0, t.count - t.have.length), 0)
  const spare = free - owed // empty slots left once the counted rows are built
  if (rest && owed > 0) steps.push(`Build the ${comp.label} composition first: ${owed} counted minion${owed > 1 ? 's' : ''} missing (Barn tab lists them).`)
  if (rest && spare > 0) steps.push(`Then fill the other ${spare} empty barn slot${spare > 1 ? 's' : ''} with ${rest.path}${rest.level ? ` (${rest.level})` : ''}: the wiki's remaining-slots minion for ${comp.label}${rest.note ? ` (${rest.note})` : ''}.`)
  if (realmLv < 20 && orb.trait !== 22) steps.push(`Orb Tower trait is ${orb.traitName}; the wiki's pick until Realm Lv20 is Riftseeker (+150% banish Realm EXP). Reroll costs 15 energy (${Math.floor(orb.energy)} held).`)
  if (realmLv < 20) steps.push(`Realm Lv20 (Ogre Spawns) is ${Math.round(toLv20).toLocaleString()} Realm EXP away; banish your highest-coin minion each time (${banishes.max - banishes.used} of ${banishes.max} banishes left today).`)
  // Banish-protect (Orb Tower, OrbCost(3) = 25 energy †): the next banish keeps the minion (RealmStuff[32] charges), so the
  // same high-coin minion banishes again. ponytail: EXP shown is the base formula; Riftseeker/Intellingo multiply it.
  const top = [...minions].sort((a, b) => b.spent - a.spent)[0]
  if (realmLv < 20 && top && banishes.used < banishes.max)
    steps.push(`Protect before banishing: ${PROTECT_COST} Orb energy keeps ${top.name} (Lv${top.level}, ~${Math.round(banishExp(top.spent)).toLocaleString()} base EXP a banish) in the barn, so you can banish it again. ` +
      (orb.energy >= PROTECT_COST ? `You have ${Math.floor(orb.energy)} energy.` : `You have ${Math.floor(orb.energy)} energy; Lizards (Charger) refill it.`))
  if (rs[11]?.c) steps.push('You hold Che Cheapo (cost reduction). The wiki warns cost reduction lowers minion damage; skip it from now on.')
  if (best >= 22 && rs[11]?.e) steps.push('You hold Intellingo (+Realm EXP); past the Purple gate more Realm EXP only raises Purple boss HP.')
  // The coin-trait reroll odds as rows, for the page's table (the step string stays the plain-text form, e.g. Do next).
  let reroll: { text: string; intro: string; outro: string; rows: { name: string; pct: string; rerolls: string; energy: string; until: string }[] } | null = null
  if (realmLv >= 20 && !COIN_TRAITS.includes(orb.trait)) {
    const odds = orbRerollOdds(traits), coin = COIN_TRAITS.map((t) => ({ t, name: R.traits[t]?.name ?? `trait ${t}`, p: odds[t] ?? 0 }))
    const can = coin.filter((c) => c.p > 0).sort((a, b) => b.p - a.p), cannot = coin.filter((c) => !c.p)
    const carrier: Record<number, string> = { 39: 'a Goose', 31: 'a Babby Egg', 8: 'a Volcano' }
    steps.push(`Orb Tower trait is ${orb.traitName}. Past Realm Lv20 the wiki swaps it for a coin trait. A reroll only draws traits your barn minions carry †: ` +
      (can.length ? can.map((c) => `${c.name} ${+(100 * c.p).toFixed(2)}% a roll (~${Math.round(1 / c.p)} rerolls, ~${Math.round(15 / c.p).toLocaleString()} energy)`).join(', ') : 'no coin trait is possible yet') +
      (cannot.length ? `; ${cannot.map((c) => `${c.name} can't come up until the barn has ${carrier[c.t] ?? 'a minion carrying it'}`).join(', ')}` : '') +
      `. 15 energy a reroll, ${Math.floor(orb.energy)} held. Riftseeker still raises banish EXP, which is what a Rainboppo banish deals as Purple.`)
    reroll = { text: steps.at(-1)!, intro: `Orb Tower trait is ${orb.traitName}. Past Realm Lv20 the wiki swaps it for a coin trait. A reroll only draws traits your barn minions carry †.`,
      outro: `15 energy a reroll, ${Math.floor(orb.energy)} held. Riftseeker still raises banish EXP, which is what a Rainboppo banish deals as Purple.`,
      rows: [...can.map((c) => ({ name: c.name, pct: `${+(100 * c.p).toFixed(2)}%`, rerolls: `~${Math.round(1 / c.p)}`, energy: `~${Math.round(15 / c.p).toLocaleString()}`, until: '' })),
        ...cannot.map((c) => ({ name: c.name, pct: '—', rerolls: '—', energy: '—', until: `the barn has ${carrier[c.t] ?? 'a minion carrying it'}` }))] }
  }
  const shrineStep = steps[0] && /^(Spend|No Shrine)/.test(steps[0]) ? steps[0] : null

  // Run counters † (docs/realm.md): blessing rerolls left this run [34] (reset sets it to Ahisma's level, +Holy Roller per
  // boss kill), fruit rerolls bought today [19] with free ones banked [40], flowers [36], seconds into this run [37], Realm
  // time-skip hours bought from the Crystal Eye Shop [38].
  const run = { blessingRerolls: n(rs[34]), rerollsPerRun: n(shrineLv[3]), fruitRerollsToday: n(rs[19]), freeFruitRerolls: n(rs[40]),
    // CornucopiaUPG(1) @6430623: free while [40] > 0, else 50·7^[19] food bundles. ponytail: Fruit Vendor's daily free ones not counted.
    fruitRerollCost: n(rs[40]) > 0 ? 0 : 50 * 7 ** n(rs[19]),
    flowers: n(rs[36]), seconds: n(rs[37]), timeSkipHours: n(rs[38]) }
  // Lord's Lair torches [39][0..3] (SceneEvents_52 init @30855217 lights each one on entering the Lair; all four open Torchy).
  const water = n(save.waterLV), maple = n((save.FurthestMapleLV as number[] | undefined)?.[15]), dairy = n((save.DairyAisleAchievements as number[] | undefined)?.[7])
  const torches = [
    { torch: 'Yellow', lit: n(rs[39]?.[0]) > 0, need: 'Golden Ice Cream: deliver every ice cream to the Dairy Aisle', have: dairy ? 'have it' : 'not yet', ready: dairy === 1 },
    { torch: 'Green', lit: n(rs[39]?.[1]) > 0, need: 'defeat the 15th Teehee in Oblivion (code: FurthestMapleLV[15] > 230)', have: `${maple} / 231`, ready: maple > 230 },
    { torch: 'Red', lit: n(rs[39]?.[2]) > 0, need: 'beat the Afterlife 50 boss', have: `best ${best} beaten`, ready: best > 49 },
    { torch: 'Blue', lit: n(rs[39]?.[3]) > 0, need: 'H2O level 1776', have: `H2O ${water}`, ready: water > 1775 },
  ]
  // Trophies [24][i] per TrophyInfo row i †: -9 claimed (TotalTrophies counts these), -1 not offered yet (claiming another
  // opens it), ≥ 0 progress toward the row's target.
  const trophyRaw: number[] = Array.isArray(rs[24]) ? rs[24] : []
  const trophies = { claimed: trophyRaw.filter((v) => v === -9).length, total: R.trophies.length,
    active: trophyRaw.flatMap((v, i) => (n(v) >= 0 && R.trophies[i] ? [{ i, text: R.trophies[i]!.text, have: n(v), target: R.trophies[i]!.target }] : [])) }

  // Progress against the wiki's guide, stage by stage. `done` from the save; `when` = the wiki stage it belongs to.
  const has = (id: string) => minions.some((m) => lineage(m.id).includes(id))
  const vend = (nm: string) => vending.find((v) => v.name === nm)?.level ?? 0
  const sg = (nm: string) => { const s = shrine.find((x) => x.name === nm)!; return { done: s.level >= SHRINE_GOAL[nm]![0], have: `Lv${s.level}` } }
  const progress: { when: string; item: string; done: boolean; have: string }[] = [
    { when: 'Stage 1-15', item: 'Realm Lv2: Pet Rock line', done: realmLv >= 2, have: `Lv${realmLv}` },
    { when: 'Stage 1-15', item: 'Realm Lv10: Babby Egg line (Yellow, energy)', done: realmLv >= 10, have: `Lv${realmLv}` },
    { when: 'Stage 1-15', item: 'Orb Tower energy cap 120', done: orb.cap >= 120, have: `cap ${orb.cap}` },
    { when: 'Stage 1-15', item: 'Horn Hippo (Lv50) and Volcano (Lv50) this run', done: has('MinionA5') && has('MinionB3'), have: `${has('MinionA5') ? 'Horn Hippo' : 'no Horn Hippo'}, ${has('MinionB3') ? 'Volcano' : 'no Volcano'}` },
    { when: 'Stage 16-24', item: 'Dharma Lv7 (Enlightenment) before the third reset', done: n(shrineLv[0]) >= 7, have: `Lv${n(shrineLv[0])}` },
    ...['Bhakti', 'Dharma', 'Sahaja', 'Carnate'].map((nm) => ({ when: 'Stage 16-24', item: `Shrine goal: ${nm} ${SHRINE_GOAL[nm]![0] === SHRINE_GOAL[nm]![1] ? SHRINE_GOAL[nm]![0] : SHRINE_GOAL[nm]!.join('–')}`, ...sg(nm) })),
    { when: 'Stage 16-24', item: 'Realm Lv20: Ogre Spawns', done: realmLv >= 20, have: `Lv${realmLv}` },
    { when: 'Stage 16-24', item: 'Orb trait after Lv20: Gold Bless / Smart Money / Make It Rain', done: realmLv >= 20 && COIN_TRAITS.includes(orb.trait), have: orb.traitName },
    { when: 'Stage 16-24', item: 'Goose (Lv50) and Lizardman (Lv50) in the barn', done: has('MinionC3') && has('MinionD3'), have: `${has('MinionC3') ? 'Goose' : 'no Goose'}, ${has('MinionD3') ? 'Lizardman' : 'no Lizardman'}` },
    { when: 'Stage 16-24', item: 'Vending must-haves bought', done: [...VEND_MUST].every((v) => vend(v) > 0), have: [...VEND_MUST].filter((v) => !vend(v)).join(', ') ? `missing ${[...VEND_MUST].filter((v) => !vend(v)).join(', ')}` : 'all' },
    { when: 'Stage 16-24', item: 'Rainboppo (Purple) for Afterlife 23', done: has('MinionA11'), have: has('MinionA11') ? 'yes' : has('MinionA5') ? `Horn Hippo Lv${Math.max(...minions.filter((m) => m.id === 'MinionA5').map((m) => m.level), 0)} / 200` : 'no Horn Hippo' },
    { when: 'Stage 25-49', item: 'Field: Full Blossom, Juiced Fruit, Cash Genesis, Spare Charge', done: [0, 2, 3, 4].every((i) => field[i]!.level > 0), have: best >= 25 ? field.filter((_, i) => [0, 2, 3, 4].includes(i)).map((f) => `${f.name} ${f.level}`).join(', ') : 'Field opens at best 25 (RealmStuff[23] ≥ 25)' },
    { when: 'Stage 25-49', item: 'Big Bone (White) for Afterlife 47', done: has('MinionD14'), have: has('MinionD14') ? 'yes' : 'no' },
    { when: 'Stage 25-49', item: 'Reset for ~60M Spirals, then the final Shrine targets', done: Object.entries(SHRINE_FINAL).every(([nm, [lo]]) => (shrine.find((x) => x.name === nm)?.level ?? 0) >= Math.min(lo, shrine.find((x) => x.name === nm)!.max)), have: `best Afterlife ${bestReached}` },
    { when: 'Stage 50+', item: 'Lord\'s Lair: four torches lit (Torchy)', done: torches.every((t) => t.lit), have: `${torches.filter((t) => t.lit).length} / 4 lit` },
  ]
  const PH = ['Stage 1-15', 'Stage 16-24', 'Stage 25-49', 'Stage 50+'], phase = PH[bestReached < 16 ? 0 : bestReached < 25 ? 1 : bestReached < 50 ? 2 : 3]!
  const progressRows = progress.map((p) => ({ ...p, due: PH.indexOf(p.when) <= PH.indexOf(phase) }))

  return {
    afterlife, bestReached, beaten, best, realmLv, exp, need, toLv20, coins: n(rs[5]), spirals, crystals: n(rs[41]),
    phase,
    tiers, nextGate, minions, slots, comp, shrine, shrineUnlocked: best >= 16 /* randolist[1][3] = 16, GenINFO[37][3] @6525147 */ || shrineLv.some((v) => n(v) > 0), plan, spiralsLeft: left, cheapest, resetBase,
    traitRows, vending, field, fieldUnlocked: best >= 25 /* randolist[1][6] = 25, GenINFO[37][6] @6525147; Field click @6920135 */, cornucopia, blessings, blessingTypes: 10 + n(shrineLv[0]), orb, orbOdds: orbOddsTable(traits), banishes, steps,
    shrineStep, shrineGoalMet, reroll, run, torches, trophies, progress: progressRows,
  }
}
export type RealmState = NonNullable<ReturnType<typeof realmState>>

/** "Do this next" as a sequence (#23). Optimises: reaching the next colour gate, via the wiki's reset loop (reset once a stage
 *  takes over 2 h, spend the Spirals on the Shrine goal, rebuild the barn, push past your best). Needs the reset payout from
 *  realm-combat.json; without it the plan is the first next step only. Times: game-code stage times where known, else blank. */
export type PlanStep = { do: string; sec: number | null; buys: string }
export function realmPlan(r: RealmState, reset: ReturnType<typeof resetCall>, stages: StageRow[] = [], resetti?: Coins['resetti'], loop?: CoinLoop | null): PlanStep[] {
  const fmtPlan = (p: Record<string, [number, number]>) => Object.entries(p).map(([k, [a, b]]) => `${k} ${a} → ${b}`).join(', ')
  const purple = r.nextGate?.colour === 'Purple'
  const gateStep = (fresh = false): PlanStep => {
    const horn = fresh ? undefined : r.minions.filter((m) => m.id === 'MinionA5').sort((a, b) => b.level - a.level)[0]
    return purple
      ? { do: horn ? `Level Horn Hippo Lv${horn.level} → 200 and evolve it into a Rainboppo` : 'Level the Horn Hippo to Lv200 and evolve it into a Rainboppo (Piggy → Hippo Lv10 → Horn Hippo Lv50 → Rainboppo Lv200)', sec: null,
          buys: `Purple damage (banishing deals it) for the Afterlife ${r.nextGate!.first} wall` }
      : { do: r.nextGate ? `${r.nextGate.colour}: ${r.nextGate.how}` : `Push past Afterlife ${r.bestReached}`, sec: null, buys: r.nextGate ? `the Afterlife ${r.nextGate.first} wall` : 'new bests' }
  }
  if (!reset) return r.steps.length ? [{ do: r.steps[0]!, sec: null, buys: '' }] : []
  const comp = r.comp.rows.length
    ? r.comp.rows.filter((t) => !t.optional).map((t) => `${t.count === REST ? 'rest' : t.count + '×'} ${t.name}${t.level ? ` (${t.level})` : ''}`).join(', ')
    : 'the wiki\'s Stage 1-15 pictures (no table to follow)'
  if (!reset.reset) {
    const steps: PlanStep[] = []
    // Just reset (nothing beaten this run) and the stage composition isn't built: rebuilding comes first. Mid-run gaps show on the Barn tab.
    const short = r.beaten === 0 && r.comp.rows.some((t) => !t.optional && t.count !== REST && t.have.length < t.count)
    if (!Number.isFinite(reset.sec) || short) steps.push({ do: `Rebuild the barn: ${comp}`, sec: null, buys: Number.isFinite(reset.sec) ? 'the stage composition (stage times below assume the barn you have now)' : `damage for Afterlife ${r.afterlife} (the barn can't hurt this boss yet)` })
    // End game, just reset: the Sammich grant pays for the barn many times over, so the rest goes into Chonkoppo, then vending.
    if (reset.endgame && loop && r.beaten === 0) {
      const sh = (v: number) => (v >= 1e6 ? v.toExponential(2) : Math.round(v).toLocaleString())
      steps.push({ do: `Summon the economy tail last (${loop.tail.map(([nm, n]) => `${n} ${nm}`).join(', ')}) in place of that many Lizardmen (Barn tab)`, sec: null, buys: 'coins ×379 measured, White tiers ×3.8 faster' },
        { do: `Put the coins left (${sh(loop.grant - loop.rebuild)}) into Chonkoppo: level it to about Lv${loop.chonkLevel}`, sec: null, buys: `${sh(loop.perMin)} coins/min (the barn costs ${sh(loop.rebuild)} of your ${sh(loop.grant)} reset coins)` },
        ...(loop.purple && loop.purple.level > loop.chonkLevel ? [{ do: loop.purple.reached ? `Keep levelling Chonkoppo to Lv${loop.purple.level} (${sh(loop.purple.extra)} more coins, ~${fmtTime(loop.purple.minutes * 60)} of income): one banish then kills the Afterlife ${loop.purple.afterlife} Purple boss` : `Level Chonkoppo as far as you can: one banish can't kill the Afterlife ${loop.purple.afterlife} Purple boss within 400 more levels`, sec: null, buys: `Purple ${sh(loop.purple.hp)} HP in one banish instead of several protected ones a day (#2671)` }] : []),
        { do: `Buy vending as coins come in, cheapest useful first: ${loop.vend.map((v) => `${v.name} Lv${v.level + 1} (${sh(v.cost)}, ~${fmtTime(v.minutes * 60)})`).join(', ')}`, sec: null, buys: 'capped items skipped (Choccy past Lv42, Broccoli, Vendi Bar)' })
    }
    steps.push({ do: `Beat Afterlife ${r.afterlife}`, sec: Number.isFinite(reset.sec) ? reset.sec : null, buys: reset.now > 0 ? `reset payout ${Math.round(reset.now).toLocaleString()} → ${Math.round(reset.next).toLocaleString()} Spirals` : 'the run\'s first Spirals (a reset pays nothing yet)' })
    for (const s of stages.slice(1)) if (Number.isFinite(s.sec) && s.sec <= 7200) steps.push({ do: `Beat Afterlife ${s.afterlife}`, sec: s.sec, buys: 'a bigger reset' }); else break
    if (purple && r.afterlife + steps.length >= r.nextGate!.first) steps.push(gateStep())
    if (reset.endgame) steps.push({ do: `Keep pushing; reset once a reset pays over 235T Spirals (now ${reset.now.toExponential(2)})`, sec: null, buys: 'the Spirals to max the remaining Shrine upgrades (wiki, Stage 50 and beyond)' })
    return steps
  }
  // End game: the wiki's 235T reset is for maxing every remaining Shrine upgrade (the two with no live effect excluded).
  const maxAll = Object.fromEntries(R.shrine.filter((u) => !SHRINE_DEAD[u.name]).map((u) => [u.name, [u.max, u.max] as [number, number]]))
  const after = spendPlan(r.shrine.map((s) => s.level), r.spirals + reset.now, reset.endgame ? maxAll : r.bestReached >= 48 ? SHRINE_FINAL : SHRINE_GOAL)
  const bg = resetti && resetti.copies > 0 ? resetti : null
  const steps: PlanStep[] = [
    ...(bg ? [{ do: `Before resetting: build ${bg.copies} Blaken Gold${bg.copies > 1 ? 's' : ''} in empty barn slots (${bg.path}; ${bg.cost >= 1e6 ? bg.cost.toExponential(2) : Math.round(bg.cost).toLocaleString()} coins each)`, sec: 0,
      buys: `Resetti +${40 * bg.copies}%: +${Math.round(bg.perCopy * bg.copies).toLocaleString()} Spirals on this reset (the reset wipes the coins anyway)` }] : []),
    { do: `Before resetting: spend ${bg ? 'the rest of the ' : ''}coins at the Vending Machine${r.banishes.used < r.banishes.max ? ` and use your ${r.banishes.max - r.banishes.used} banishes` : ''} (the reset wipes coins and minions)`, sec: 0, buys: 'nothing carried over is wasted' },
    { do: reset.endgame ? `Reset at the Shrine (it pays ${reset.now.toExponential(2)} Spirals, over the wiki's end-game 235T)` : `Reset at the Shrine (Afterlife ${r.afterlife} takes ${fmtTime(reset.sec)}, over the wiki's 2 h)`, sec: 0, buys: `${Math.round(reset.now).toLocaleString()} Spirals † (${Math.round(r.spirals + reset.now).toLocaleString()} with what you hold)` },
    { do: Object.keys(after.plan).length ? `Spend Spirals: ${fmtPlan(after.plan)} (drag the Upgrades tab's scroll bar down for rows past Bhakti)` : 'Keep the Spirals: no goal upgrade is affordable yet', sec: 0,
      buys: reset.endgame
        ? (after.met ? 'every live Shrine upgrade maxed: further resets add nothing to the Shrine' : `still short of max: ${r.shrine.filter((s) => maxAll[s.name] && after.levels[s.i]! < s.max).map((s) => `${s.name} ${after.levels[s.i]} / ${s.max}`).join(', ')}`)
        : after.met ? 'the wiki\'s Shrine goal is met: stop resetting' : `goal still short: ${r.shrine.filter((s) => s.goal && after.levels[s.i]! < Math.min(s.goal[0], s.max)).map((s) => `${s.name} ${after.levels[s.i]} / ${s.goal![0]}`).join(', ')}` },
    { do: `Rebuild the barn: ${comp}`, sec: null, buys: 'coins, Yellow, Orange and Blue energy back' },
  ]
  if (after.met) steps.push({ do: `Push to Afterlife ${r.bestReached} without resetting`, sec: null, buys: 'back to your best' }, gateStep(true))
  else if (r.nextGate && r.nextGate.first <= r.bestReached) // already at the wall: the loop can't pass it, it only grows the Shrine
    steps.push({ do: `Push back toward Afterlife ${r.nextGate.first} (the ${r.nextGate.colour} wall) and reset again once a stage takes over 2 h; repeat until the Shrine goal is met`, sec: null, buys: 'the rest of the Shrine goal' },
      { ...gateStep(true), do: `Then stop resetting: ${gateStep(true).do[0]!.toLowerCase()}${gateStep(true).do.slice(1)}` })
  else steps.push({ do: `Push one stage past your best (Afterlife ${r.bestReached + 1}); reset again once a stage takes over 2 h`, sec: null, buys: 'the next reset loop' })
  return steps
}

// ---- Minion guide: every MinionDatabase entry, how to get it, and where the author stands (#23). ----
const FAMILIES: Record<string, { name: string; unlock: string; open: (realmLv: number, flames: boolean) => boolean }> = {
  // SummonTypesUnlocked (@6388059): families A..D open at Realm Lv 1/2/10/20; family 5 (Torchy) once Realm Lv > 99999 or
  // RealmStuff[39][0..3] are all nonzero (the Lord's Lair flames, docs/realm.md [39]). Shinies come from the Crystal Eye Shop (item 4, 575 eyes).
  A: { name: 'Little Piggy', unlock: 'start †', open: () => true },
  B: { name: 'Pet Rock', unlock: 'Realm Lv2 †', open: (lv) => lv > 1 },
  C: { name: 'Babby Egg', unlock: 'Realm Lv10 †', open: (lv) => lv > 9 },
  D: { name: 'Ogre Spawn', unlock: 'Realm Lv20 †', open: (lv) => lv > 19 },
  E: { name: 'Torchy', unlock: 'RealmStuff[39] first 4 set (Lord\'s Lair flames, SummonTypesUnlocked @6388059)', open: (lv, f) => lv > 99999 || f },
  F: { name: 'Shiny', unlock: 'Crystal Eye Shop item 4, 575 eyes (randolistNUMreal[3][4], CrystalShopCost @6438763)', open: () => false },
}
// Trait → damage colour it gives (TraitTypes text †). Pink has no trait of its own (any colour lands, @6446043); Quadrafire (71) is CreateDmg colour 7 = Rainbow (@6581793).
const TRAIT_COLOUR: Record<number, string> = { 0: 'Red', 2: 'Orange', 23: 'Yellow (all crits)', 28: 'Purple (banish)', 43: 'Red counts as Orange', 64: 'White', 71: 'Eternal' }
const WIKI_NAME: Record<string, string> = { Piggy: 'Little Piggy' }

const depth = (id: string) => lineage(id).length - 1

export function minionGuide(save: Save) {
  const rs = (save.RealmStuff as any[]) ?? []
  const realmLv = n(rs[0]), flames = ((rs[39] as number[]) ?? []).slice(0, 4).every((v) => n(v) > 0) && ((rs[39] as number[]) ?? []).length >= 4
  const owned = barn(save)
  const wiki = (realm as any).wiki as Record<string, { prereq: string; note: string }>
  const rows: ReturnType<typeof row>[] = []
  function row(id: string) {
    const m = R.minions[id]!, fam = FAMILIES[id[6]!]!, d = depth(id), parent = m.parent
    const mine = owned.filter((o) => o.id === id), w = wiki[WIKI_NAME[m.name] ?? m.name]
    const siblings = parent ? R.minions[parent]!.evo.filter((e) => e !== id).map(name) : []
    const how = !parent ? (id[6] === 'F' ? 'Crystal Eye Shop (wiki)' : id[6] === 'E' ? 'summon once unlocked †' : 'summon †')
      : `evolve ${name(parent)} at Lv${EVO[d - 1]} †${siblings.length ? ` (or ${siblings.join(' / ')})` : ''}`
    const tr = new Set(lineage(id).map((x) => R.minions[x]!.trait))
    if (tr.has(2)) tr.delete(0) // OJ Heart Stab: "Deal Orange Damage instead of Red" †
    const colours = [...tr].map((x) => TRAIT_COLOUR[x]).filter(Boolean) as string[]
    const t = R.traits[m.trait]
    // Disagreement: wiki prerequisite vs MinionDatabase parent.
    const wikiParent = w?.prereq && w.prereq !== '-' ? w.prereq : ''
    const disagree = wikiParent && parent && wikiParent !== (WIKI_NAME[name(parent)] ?? name(parent)) ? `wiki says from ${wikiParent}` : ''
    // the author's state: owned, next evolution of something he has, reachable (family open), or locked.
    const anc = new Set(lineage(id).slice(1))
    const onPath = owned.filter((o) => anc.has(o.id)).sort((a, b) => depth(b.id) - depth(a.id) || b.level - a.level)[0]
    const state = mine.length ? { kind: 'owned' as const, text: `${mine.length}× best Lv${Math.max(...mine.map((o) => o.level))}` }
      : !fam.open(realmLv, flames) ? { kind: 'locked' as const, text: `needs ${fam.unlock.replace(/ †.*/, '')}` }
      : onPath ? { kind: 'next' as const, text: `from your ${onPath.name} Lv${onPath.level}${onPath.id === parent ? ` (evolves at Lv${EVO[d - 1]})` : ''}` }
      : { kind: 'reachable' as const, text: parent ? `summon ${fam.name}, level the path` : 'summon now' }
    return { id, name: m.name, family: fam.name, familyKey: id[6]!, depth: d, path: path(id), how, unlock: fam.unlock, colours,
      trait: t ? `${t.name}: ${t.text.replace(/[{}\]]/g, String(t.value)).replace(/\(\$\)|\(#\)|\$/g, '').trim()}` : '', wiki: (w?.note ?? '').replace(/\[\[|\]\]/g, ''), gameSays: WIKI_GAME_SAYS[m.name] ?? '',
      disagree, state }
  }
  // Depth-first from each family root so every evolution line reads as a path.
  const visit = (id: string) => { rows.push(row(id)); for (const e of R.minions[id]!.evo) visit(e) }
  for (const id of Object.keys(R.minions)) if (!R.minions[id]!.parent) visit(id)
  return rows
}
export type GuideRow = ReturnType<typeof minionGuide>[number]
// ---- Stage table: time to beat each boss with the barn as it is (#23). Inputs from src/realm-combat.ts (game code, dev only). ----
/** End-game coin loop from src/realm-coinloop.ts (game code, dev only): the post-reset barn and Chonkoppo level the grant buys. */
export type CoinLoop = { grant: number; rebuild: number; chonkLevel: number; left: number; perMin: number; tail: [string, number][]
  vendCosts?: number[]; purple?: { afterlife: number; hp: number; level: number; extra: number; minutes: number; reached: boolean } | null
  vend: { i: number; name: string; level: number; cost: number; minutes: number }[] }
export type Combat = {
  beaten: number; baseAtkSec: number; redMult: number; otherMult: number; allDmg?: number; lemon: boolean; dual: boolean; banishBop: boolean; banishesLeft: number
  banishesPerDay?: number; protectCharges?: number; protectBuy?: boolean; protectCost?: number; realmExp?: number; realmReq?: number
  laserPerSec: number; laserCost: number; energy: number; energyCap: number; hpNow: number[]; bosses: number[][]; resetSpirals?: number
  coins?: Coins; stats?: Stats; white?: boolean; eternal?: boolean; whiteHit?: number; playerDps?: number
  coinLoop?: CoinLoop | null
  minions: { slot: number; id: string; level: number; attacks: boolean; orange: boolean; dmg: number; crit: number; critDmg: number; atkSpeed: number; multihit: number; orbCharge: number; banishExp: number; spent?: number }[]
}
/** Seconds between a minion's attacks †: a 100 ms tick takes 0.1 off its timer; at ≤ 0 it attacks and the timer resets to
 *  20 s / (1 + attack speed %) (ActorEvents_1488 tick @~6618000). Simulated, so float steps land where the game's do. */
export function attackPeriod(baseSec: number, atkSpeedPct: number) {
  const reset = baseSec / Math.max(1, 1 + atkSpeedPct / 100)
  let t = reset, ticks = 0
  for (;;) { ticks++; if (t > 0) t -= 0.1; else return ticks * 0.1 }
}
/** Mean hits per attack †: 2 on U < m, then 3/4/5 on separate rolls U < m−1, m−2, m−3 (m = multihit % / 100). */
export function meanHits(multihitPct: number) {
  const m = multihitPct / 100, q = (x: number) => Math.min(1, Math.max(0, x))
  const p5 = q(m - 3), p4 = q(m - 2) * (1 - p5), p3 = q(m - 1) * (1 - p5) * (1 - q(m - 2))
  return 1 + q(m) * (1 + p3 * 1 + p4 * 2 + p5 * 3) // ponytail: p3/p4 overlap approximated; exact for multihit ≤ 100% (all the author's minions are 0)
}
/** Damage per second one minion lands on each colour tier (index = TIERS) †. CreateDmg(dmg, colour) (@6446043) lands only when
 *  colour = the boss's current tier, or on Pink (tier 5) whatever the colour (outside a 4 s window, GenINFO[63]); Red hits
 *  × (1 + Crimsonile), others × (1 + Refractile); a crit × crit damage; with Lemonhearted a crit lands on Yellow whatever its
 *  colour. Eternal (trait 71) adds a MinionDMG hit on tier 7 each hit. White (Pure Hearted, trait 64, anywhere in the barn) adds a
 *  hit of `whiteHit` = log10(outside fight DPS) on tier 6 each hit (@6618955), through the same CreateDmg (Refractile, crit). */
export function minionDps(c: Combat, m: Combat['minions'][number]) {
  const out = [0, 0, 0, 0, 0, 0, 0, 0]
  if (!m.attacks) return out
  const rate = meanHits(m.multihit) / attackPeriod(c.baseAtkSec, m.atkSpeed), p = Math.min(m.crit, 100) / 100, crit = 1 + p * (m.critDmg - 1)
  const colours = m.orange ? [1] : [0]
  if (c.dual) colours.push(m.orange ? 0 : 1) // Dual Damage: the other one too
  if (c.eternal) colours.push(7)
  if (c.white && c.whiteHit) colours.push(6)
  for (const col of colours) {
    const hit = (col === 6 ? c.whiteHit! : m.dmg) * (col === 0 ? c.redMult : c.otherMult)
    out[col]! += rate * hit * crit
    if (c.lemon && col !== 2) out[2]! += rate * hit * p * m.critDmg
    out[5]! += rate * hit * crit
  }
  return out
}
/** Damage per second on one colour tier: the barn's minionDps summed. */
export const tierDps = (c: Combat, tier: number) => c.minions.reduce((t, m) => t + minionDps(c, m)[tier]!, 0)


export type StageRow = { afterlife: number; tiers: { colour: string; hp: number; dps: number; sec: number; blocker?: string }[]; sec: number; blocker?: string }
/** Coins spent a minion needs so ONE banish deals `hp` Purple (#2671): banishExp⁻¹ of hp ÷ (ALLDMG × Refractile × the barn-wide
 *  BanishEXPgain multipliers, Riftseeker/Intellingo, read off the best minion as banishExp ÷ base formula). null if unknown. */
export function purpleSpentFor(c: Combat, hp: number) {
  const top = c.minions.reduce<Combat['minions'][number] | undefined>((b, m) => (!b || m.banishExp > b.banishExp ? m : b), undefined)
  if (!top || top.spent == null || !(top.banishExp > 0)) return null
  const k = (top.banishExp / banishExp(top.spent)) * (c.allDmg ?? 1) * c.otherMult
  let lo = 0, hi = 400
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (banishExp(10 ** m) * k >= hp) hi = m; else lo = m }
  return 10 ** hi
}
/** Bosses from the current one onward, until best + 5 or the first one a missing colour makes impossible. Tiers fall highest
 *  first (the game's current tier is the highest with HP left). Fixed barn: no levelling, no new minions, on the Realm screen. */
export function stageTable(c: Combat, bestReached: number, refillIn = 86400) {
  const rows: StageRow[] = []
  // refill = seconds until the banish timer RealmStuff[20] next wraps and zeroes RealmStuff[22] (1 s tick @30851176, wrap @30852055).
  let refill = Math.max(0, refillIn), energy = c.energy, held = c.protectCharges ?? 0, banishLeft = c.banishesLeft, realmExp = c.realmExp ?? 0, realmReq = c.realmReq ?? 0
  const req0 = realmReq
  const regen = c.minions.reduce((t, m) => t + m.orbCharge, 0) // energy per hour (Charger, Spare Charge)
  for (let k = 0; c.beaten + k + 1 <= Math.max(bestReached + 5, c.beaten + 1) && k < c.bosses.length; k++) {
    // Purple is set at spawn from Realm EXP needed (BossHPtot tier 4 @6384443): a later boss scales with today's level-ups.
    const hp = k === 0 ? c.hpNow.map((h, t) => (c.bosses[0]![t]! > 0 ? Math.max(0, h) : 0)) : c.bosses[k]!.map((h, t) => (t === 4 && req0 > 0 ? h * realmReq / req0 : h))
    const tiers: StageRow['tiers'] = []
    for (let t = 7; t >= 0; t--) {
      const h = hp[t] ?? 0
      if (!(h > 0)) continue
      const colour = TIERS[t]!
      if (t === 3) { // Blue: only the Orb Tower laser, laserPerSec for 10 s per laserCost energy †
        const shots = Math.ceil(h / (10 * c.laserPerSec)), need = shots * c.laserCost
        let sec = h / c.laserPerSec, blocker
        if (energy >= need) energy -= need
        else if (regen > 0) { sec += ((need - energy) / regen) * 3600; energy = 0; blocker = 'Blue: waiting on laser energy' }
        else { tiers.push({ colour, hp: h, dps: c.laserPerSec, sec: Infinity, blocker: `Blue: laser needs ${need} energy, you have ${Math.floor(energy)} and no Charger` }); break }
        tiers.push({ colour, hp: h, dps: c.laserPerSec, sec, blocker })
      } else if (t === 4) { // Purple: banishing with Banish Bop deals the banish's Realm EXP † (#2671)
        if (!c.banishBop) { tiers.push({ colour, hp: h, dps: 0, sec: Infinity, blocker: 'Purple: needs a Rainboppo (banishing deals Purple)' }); break }
        // Only a banish hits Purple (the one CreateDmg(·, 4), @6637201): BanishEXPgain(coins spent on the minion) × ALLDMG × Refractile,
        // no crit. A protected banish (Orb charge, PROTECT_COST energy) keeps the minion, so the best one can be banished again,
        // up to TotalDailyBanishes a day; unprotected, the barn shrinks (best first).
        const mult = (c.allDmg ?? 1) * c.otherMult
        const top = c.minions.reduce((b, m) => (m.banishExp > b.banishExp ? m : b), c.minions[0]!)
        const best = (top?.banishExp ?? 0) * mult
        const charges = held + (c.protectBuy ? Math.floor(energy / (c.protectCost ?? PROTECT_COST)) : 0)
        let n = best > 0 ? Math.ceil(h / best) : Infinity, sum = n * best, protects = n // every one protected: the barn stays fixed
        if (!(protects <= charges)) { // no protects to repeat it: each minion once, best first
          const exp = c.minions.map((m) => m.banishExp * mult).sort((a, b) => b - a)
          n = 0; sum = 0; protects = 0
          while (sum < h && n < exp.length) sum += exp[n++]!
        }
        if (!(sum >= h)) {
          const need = top ? purpleSpentFor(c, h) : null
          tiers.push({ colour, hp: h, dps: 0, sec: Infinity, blocker: `Purple: ${h.toExponential(2)} HP; one banish needs a minion with ≥${need ? need.toExponential(2) : '?'} coins spent` +
            ` (best now ${(top?.spent ?? 0).toExponential(2)}, ${best.toExponential(2)} a banish; ${Number.isFinite(n) ? `${n} protected banishes` : 'no banish damage'}, ${charges} protects affordable)` })
          break
        }
        const fromHeld = Math.min(protects, held)
        held -= fromHeld; energy -= (protects - fromHeld) * (c.protectCost ?? PROTECT_COST)
        // Realm EXP: each banish adds its EXP (Purple ÷ ALLDMG ÷ Refractile); a level-up doubles the next bosses' Purple.
        realmExp += sum / mult
        while (realmReq > 0 && realmExp >= realmReq) { realmExp -= realmReq; realmReq = 2 * realmReq + 5 }
        // Today's banishes first, then TotalDailyBanishes at each refill: the first in `refill` s (RealmStuff[20]), then every 24 h.
        // ponytail: time fighting other tiers doesn't run the refill timer down.
        const perDay = c.banishesPerDay ?? 6
        let sec = 0
        if (n <= banishLeft) banishLeft -= n
        else { const days = Math.ceil((n - banishLeft) / perDay); banishLeft = days * perDay - (n - banishLeft); sec = refill + (days - 1) * 86400; refill = 86400 }
        tiers.push({ colour, hp: h, dps: 0, sec,
          blocker: `Purple: ${n} banish${n > 1 ? 'es' : ''}${protects ? ` of your best minion (${protects} protect${protects > 1 ? 's' : ''})` : ' (barn shrinks)'}` })
      } else {
        const dps = tierDps(c, t) // Red/Orange/Yellow, Pink (every colour), White (whiteHit), Rainbow (Eternal)
        if (!(dps > 0)) { tiers.push({ colour, hp: h, dps: 0, sec: Infinity, blocker: t === 6 && c.white ? 'White: outside fight DPS unknown (regenerate realm-combat.json)' : `${colour}: ${COLOUR_HOW[t]}` }); break }
        // Pink refills to full every 5 s while it is the tier (runPeriodically(5e3) @6590004, refill @6592818): the barn must
        // land it within one window. ponytail: mean damage per 5 s; at the edge, attack timing and crit rolls decide.
        if (t === 5 && dps * 5 < h) { tiers.push({ colour, hp: h, dps, sec: Infinity, blocker: `Pink: refills every 5 s; the barn deals ${Math.round(dps * 5).toLocaleString()} of ${Math.round(h).toLocaleString()} in 5 s` }); break }
        tiers.push({ colour, hp: h, dps, sec: h / dps })
      }
    }
    const sec = tiers.reduce((s, x) => s + x.sec, 0)
    rows.push({ afterlife: c.beaten + k + 1, tiers, sec, blocker: tiers.find((x) => x.blocker)?.blocker ?? (k === 0 && !tiers.length ? 'Defeated: enter the portal' : undefined) })
    if (!Number.isFinite(sec)) break
  }
  return rows
}
/** Reset now, or beat the current boss first? Payout scales by the base ratio (multipliers are the same blessings either way †).
 *  Wiki reset loop: once a stage takes more than 2 h, reset. */
/** Wiki "Stage 50 and beyond": keep pushing and reset once the reset pays more than 235T Spirals (enough to max the remaining Shrine). */
export const ENDGAME_RESET = 235e12
export function resetCall(c: Combat, rows: StageRow[], endgame = false) {
  if (c.resetSpirals == null) return null
  const base = (b: number) => (5 * b + b * b) * 1.12 ** b
  const now = c.resetSpirals, next = c.beaten > 0 ? now * base(c.beaten + 1) / base(c.beaten) : now, sec = rows[0]?.sec ?? Infinity
  // a reset that pays 0 Spirals (just reset, nothing beaten) is never the call. Before Stage 50: the wiki's reset loop (a stage over 2 h).
  return { now, next, sec, endgame, reset: now > 0 && (endgame ? now >= ENDGAME_RESET : !(sec <= 7200)) }
}
export const fmtTime = (s: number) => !Number.isFinite(s) ? 'never' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m`
  : s < 86400 * 2 ? `${(s / 3600).toFixed(1)}h` : s < 86400 * 730 ? `${(s / 86400).toFixed(1)}d` : `${(s / 86400 / 365).toExponential(1)}y`

// ---- Maximise coins (#23). Inputs from src/realm-coins.ts (game code, dev only): every lever's rate is the game's MinionCASH re-run. ----
export type CoinLever = { do: string; cost: number; currency: 'coins' | 'energy' | 'spirals' | 'none'; afford: boolean; rate: number; note?: string
  steps?: { cols: string[]; rows: (string | number)[][] } } // long instructions as a table, shown in a dialog
export type Coins = {
  perMin: number; coins: number; energy: number; spirals: number; allNow: number
  evolveGobbos?: { count: number; cost: number; rate: number } | null
  lizardComparison?: { slots: number; cost: number; rate: number } | null
  loadout?: { rate: number; cost: number; coins: number; orbBuys: number; moves?: (string | number)[][]; fill: string[][]; fillCost: number; levels: (string | number)[][] }
  resetti?: { perCopy: number; cost: number; empties: number; path: string; copies: number } | null
  minions: { slot: number; id: string; name: string; level: number; spent: number; cash: number; double: number; perMin: number }[]
  parts: Record<'allCash' | 'makeItRain' | 'smartMoney' | 'taxCollector' | 'goldBless' | 'smolCash' | 'bossPilfer' | 'refundPct' | 'awayPct', number>
  levers: CoinLever[]
}
/** Coin plan: what you can do now first (by gain), then what to save or wait for (by gain). An Orb trait row gets its reroll
 *  odds from orbRerollOdds (only traits a barn minion carries can come up). `gain` = rate after ÷ rate now. */
export function coinPlan(c: Coins, r: RealmState) {
  const traits = new Set<number>(r.minions.flatMap((m) => [...traitsOf(m.id, r.orb.trait)]))
  const odds = orbRerollOdds(traits)
  const carrier: Record<number, string> = { 39: 'a Goose', 31: 'a Babby Egg', 8: 'a Volcano' }
  return c.levers.map((l) => {
    const orb = l.note?.startsWith('orb:') ? Number(l.note.slice(4)) : null
    const p = orb == null ? 0 : odds[orb] ?? 0
    const note = orb == null ? l.note ?? '' : p ? `${+(100 * p).toFixed(2)}% a reroll: ~${Math.round(1 / p)} rerolls, ~${Math.round(15 / p).toLocaleString()} energy` : `can't come up until the barn has ${carrier[orb] ?? 'a minion carrying it'}`
    const afford = orb == null ? l.afford : p > 0 && c.energy >= Math.round(15 / p)
    return { ...l, note, afford, gain: l.rate / c.perMin }
  }).filter((l) => l.gain > 1.0001).sort((a, b) => Number(b.afford) - Number(a.afford) || b.gain - a.gain)
}

// ---- Stats (#23): the Realm's computed numbers, from src/realm-stats.ts (game blocks run against the save). ----
export type Stat = { name: string; value: number | null; src: string; level?: number; stored?: number; check?: '=' | '≤'; note?: string; group?: string }
export type Stats = {
  allCash: Stat[]; cash: Stat[]; levelCash: { slot: number; value: number }[]; stackMax: number
  barnTraits: { trait: number; name: string; carriers: number; slots: number[]; stacks: boolean; sum: number; rule: string; total: number; effect: string }[]
  coinOther: Stat[]; blessingStats: Stat[]; bonuses: Stat[]; energy: Stat[]; other: Stat[]
  blessings: { key: string; name: string; count: number; value: number; text: string }[]
  blessingTotals: {
    superblesser: { picks: number; perPick: number; pct: number; fruit6: number; mult: number }
    updog: { total: number; mult: number; carriers: number[] }
    gate: string[]
    rows: { key: string; name: string; cat: string; count: number; base: number; raw: number; gated: boolean; superMult: number
      updogMult: number; total: number; expected: number; instant: boolean; text: string }[]
    groups: { label: string; combined: number; how: string }[]
  }
}
/** Headline coins an hour, all coin minions: on the Realm screen (60 payouts, each minion's 2× roll averaged) and away
 *  (MinionCASH × whole minutes × (1 + fruit 14%), one 2× roll per minion on return, @6574387). */
export const coinsPerHour = (c: Coins) => ({ screen: c.perMin * 60, away: c.perMin * 60 * (1 + c.parts.awayPct / 100) })
/** Does the computed value agree with the save's copy? null = nothing stored to compare. */
export const statMatch = (s: Stat) => s.stored == null || s.value == null ? null
  : s.check === '≤' ? s.stored <= s.value * (1 + 1e-9) : Math.abs(s.stored - s.value) <= 1e-9 * Math.max(1, Math.abs(s.value))

/** Damage per minute per minion and colour, and the current boss tier by tier (HP, stored HP left, time from stageTable). */
export function damageStats(c: Combat, stages: StageRow[]) {
  const minions = c.minions.map((m) => ({ ...m, name: name(m.id), dpm: minionDps(c, m).map((x) => x * 60) }))
  const total = TIERS.map((_, t) => minions.reduce((s, m) => s + m.dpm[t]!, 0))
  const banish = Math.max(0, ...c.minions.map((m) => m.banishExp)) * (c.allDmg ?? 1) * c.otherMult // best single banish as Purple (Banish Bop): CreateDmg(EXP × ALLDMG, 4) †
  const row0 = stages[0]
  const boss = TIERS.map((colour, t) => {
    const full = c.bosses[0]?.[t] ?? 0, left = c.hpNow[t] ?? 0
    const dpm = t === 3 ? c.laserPerSec * 60 : t === 4 ? (c.banishBop ? banish : 0) : t === 6 && c.white && !c.whiteHit ? null : total[t]!
    const st = row0?.tiers.find((x) => x.colour === colour)
    return { t, colour, full, left: Math.max(0, left), untouched: full > 0 && Math.abs(left - full) <= 1e-9 * full, done: full > 0 && left <= 0, dpm, sec: st?.sec ?? (left <= 0 ? 0 : null), blocker: st?.blocker }
  }).filter((b) => b.full > 0)
  return { minions, total, boss, afterlife: c.beaten + 1 }
}
