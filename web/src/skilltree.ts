// Skill trees (#51): SkillLevels[1..70], six coloured trees (SkillTreeType 1-6, slots 10·(T−1)+1..10·T) and the Infinity tree
// (SkillTreeType 7, slots 61-70). Buy rules from the ten slot click listeners of the skill-tree scene (scripts.SceneEvents_1,
// Qno2x.js @19438727 slot 1 … @19521311 slot 10); skilltree.test.ts runs those listeners in the sandbox and checks every
// cap, cost and prerequisite below against them. Names and per-level text: wiki "Perks" page (index order = wiki order,
// confirmed where this app already uses the slot: 3/4 ores, 7 mastery, 14 smithing EXP, 19 multicraft, 20 kills, 29/40 HP,
// 32-40 Limbo, 42/43/45/50 gray, 53/54/56/58/59/60 yellow, 61/65/66 Infinity); every slot is now checked against the game code (CODE below).
import { lambdaSpend, outputChanges, OUTPUTS, stepCurve } from './perks'
import { getPlayerDPS } from './combat'
import { soulRates, spiritRates, withSpirit } from './spiriting'
import { glyphBonusPct, rifts } from './rift'
import { expMult } from './tinkering'
import { mining, smithingCraftExp } from './gathering'
import { levelsPerCraft } from './ascend'
import { farmers, withTilling } from './tilling'
import { shownExpPerDay, totalCrusaders, withCrusade } from './crusade'
import { awayPercent } from './away'
import { overgrowthExponent } from './botany-calc'
import { levelTotal } from './level-total'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

export const TREES = ['Red · Attack', 'Orange · Strength', 'Green · Endurance', 'Blue · Limbo', 'Gray · Crusades', 'Yellow · Farming', 'Infinity']
/** [name, per level] by SkillLevels index (wiki text; CORRECTIONS below replaces the ones the game code contradicts). */
const WIKI: Record<number, [string, string]> = {
  1: ['Unlock the Attack Dojo', '—'], 2: ['Unlock Mining', '—'], 3: ['Double ore chance', '+10%'], 4: ['Ores per Mining level', '+1%'],
  5: ['Claw attacks more times', '+2'], 6: ['Vision: crit chance', '+5%'], 7: ['Minimum damage as % of maximum', '+8%'],
  8: ['Smite damage', '+100%'], 9: ['Idle attack speed', '+10%'], 10: ['Claw damage', '+80%'],
  11: ['Unlock the Strength Mountain', '—'], 12: ['Unlock Smithing', '—'], 13: ['Forge charges faster', '+20%'], 14: ['Crafting EXP', '+20%'],
  15: ['Meteor damage', '+50%'], 16: ['Flurry damage', '+20%'], 17: ['All skills damage', '+10%'], 18: ['Valor: damage and HP', '+20%'],
  19: ['Double craft chance (multicraft)', '+20%'], 20: ['Kills per kill', '+0.1'],
  21: ['Unlock the Endurance Fields', '—'], 22: ['Unlock Fishing', '—'], 23: ['Fishing speed', '+5%'], 24: ['Fishing warp: seconds skipped per click', '+1'],
  25: ['Poison: seconds between hits', '−0.1'], 26: ['Midas: monster gold per click', '+10%'], 27: ['Food heals more', '+20%'],
  28: ['Seal: seconds of no enemy damage', '+1'], 29: ['HP per Endurance level', '+3%'], 30: ['Resource collection', '+20%'],
  31: ['Unlock Limbo', '—'], 32: ['Spiriting EXP chance', '+2%'], 33: ['Cultist efficiency', '+5%'], 34: ['Acolyte efficiency', '+5%'],
  35: ['Summoning rift speed', '+5%'], 36: ['Rift EXP', '+5%'], 37: ['AP on ascend', '+4%'], 38: ['Damage per 10 merits spent', '+1%'],
  39: ['Damage per contract completed', '+0.5%'], 40: ['HP per contract completed', '+0.5%'],
  41: ['Unlock the special skill toggle', '—'], 42: ['Inactive crusaders', '+2'], 43: ['Crusade EXP', '+10%'], 44: ['Max Crusade energy', '+10%'],
  45: ['Tinkering EXP', '+10%'], 46: ['Anion damage', '+100%'], 47: ['Max shield', '+25%'], 48: ['Idle damage per Combat level', '+1%'],
  49: ['Icies damage', '+600%'], 50: ['Mark: monster damage/HP ×4, reward', '+20%'],
  51: ['Potion cost redux', '+2%'], 52: ['Double brew chance', '+3%'], 53: ['Max Botany speed level per 25 Tilling levels', '+1'],
  54: ['Double crop chance', '+5%'], 55: ['Gem bonuses', '+1.5%'], 56: ['Potion brew speed', '+10%'], 57: ['Botany multidrop', '+15%'],
  58: ['Overgrowth flower bonus', '+1%'], 59: ['Crops per mythic pot owned', '+3%'], 60: ['Overgrowth time redux', '−0.075 exponent'],
  61: ['Damage', '+2%'], 62: ['Lower smith cost cap', '+3%'], 63: ['Vessel gain', '+1%'], 64: ['RP gain from all tanks', '+3%'],
  65: ['BP from rebirthing', '+1.5%'], 66: ['Potion brew speed', 'see Next'], 67: ['Chain level chance', 'unverified'],
  68: ['More away time', 'unverified'], 69: ['Pet damage', '+3%'], 70: ['Spelunking speed and learn rate', 'unverified'],
}
/** Skill-tree node label by SkillLevels index (the game draws no node names; this is the wiki's description). */
export const skillName = (i: number) => WIKI[i]?.[0] ?? `skill ${i}`

/** Per-level texts the game code contradicts (verdict 'x' in CODE below, offsets there); each has an exact TOTALS entry. */
export const CORRECTIONS: Record<number, string> = {
  6: '+5% crit chance × (level + 1), for 10 s (45 s cooldown)',
  8: 'Smite damage × (2 + 0.75 per level)',
  19: 'crafts per craft = ceil(random 0.21L … 1 + 0.2L)',
  23: '−5% of the base bite time (floor 0.1 s)',
  25: '−10% of the 1 s poison interval (max −90%)',
  28: '+2 s per boss killed (lasts (2L − 1) × bosses + 1 s)',
  44: '+10 max Crusade energy',
  48: '+1% per Combat level',
  55: '+1 to every crystal bonus',
  57: '+15 on a 1-100 roll, 4 tiers',
  64: '+1%',
  66: 'see Total (0.4L)^0.6 × Apothecary level',
  67: '(8L + 10)/(L + 80)%',
  68: '(100L + 10)/(L + 80)% of away-time tank bonus',
  69: '(200L + 10)/(L + 100)% (max 200%)',
  70: 'speed 1.9L/(L + 1000), learn 2L/(L + 1000)',
}
export const SKILLS: Record<number, [string, string]> = Object.fromEntries(Object.entries(WIKI).map(([i, [name, per]]) => [i, [name, CORRECTIONS[+i] ?? per]]))

const num = (x: number) => String(+x.toFixed(2))
const sv = (s: Save, k: string) => n(s[k])
/** Expected ceil(U(a, b)) with a < b: Σ_{k≥0} P(U > k). */
const expCeil = (a: number, b: number) => { let e = 0; for (let k = 0; k < b; k++) e += Math.min(Math.max((b - k) / (b - a), 0), 1); return e }
/** Exact totals where the per-level text alone would mislead (corrected, capped or conditional); everything else is levelTotal(per, level). */
const TOTALS: Record<number, (s: Save, L: number) => string> = {
  // first ore: roll 1-1000 ≤ 100L; the gem-double tiers add 100·max(L − 10, 0) of 1000 (@6988884, @6991925)
  3: (_s, L) => `${Math.min(10 * L, 100)}% chance of a double ore${L > 10 ? `; levels past 10 add +${10 * (L - 10)}% to the Mining gem-double tiers` : ''}`,
  6: (_s, L) => `+${5 * (L + 1)}% crit chance for 10 s (45 s cooldown)`, // t += 5·(L+1) @8675266
  8: (_s, L) => `Smite hits × ${num(2 + 0.75 * L)} base (2 + 0.75 per level; the in-game tooltip says ${300 + 100 * L}%)`, // @9047832
  19: (_s, L) => `${num(expCeil(0.21 * L, 1 + 0.2 * L))} crafts per craft on average (random ${num(0.21 * L)} … ${num(1 + 0.2 * L)}, rounded up)`, // @8878948
  23: (_s, L) => `Fishing bite time −${Math.min(5 * L, 100)}% of base (then +0.1 s)`, // base·(1 − .05·L) + .1 @31524088
  25: (_s, L) => `Poison hits every ${num(Math.max(1 - L / 10, 0.1))} s (was 1 s; floor 0.1 s)`, // 1e3·(1 − min(L/10, .9)) ms @8695460
  28: (_s, L) => `Seal lasts ${2 * L - 1} s per boss killed + 1 s`, // (2L − 1)·crusadebosskilled + 1 @10469322
  44: (_s, L) => `+${10 * L} max Crusade energy`, // EnergyMAX = 100 + … + 10L @22894707
  48: (s, L) => `+${L * sv(s, 'CombatLV')}% idle damage (${L}% × Combat level ${sv(s, 'CombatLV')})`, // @19899805
  51: (_s, L) => `−${Math.min(2 * L, 90)}% potion cost${L > 45 ? ' (capped at 90%)' : ''}`, // 1 − min(.02L, .9) @25990305
  53: (s, L) => `+${L * Math.floor(sv(s, 'FarmingLV') / 25)} max Botany speed levels (${L} × ${Math.floor(sv(s, 'FarmingLV') / 25)})`, // @24245501
  55: (_s, L) => `+${L} to every crystal bonus (GemBonuses)`, // @18698760
  57: (_s, L) => `Multidrop tiers: ${[0, 1, 2, 3].map((k) => `${Math.max(0, Math.min(15 * L - 100 * k - 1, 100))}%`).join(' / ')}`, // roll 1-100 + 100k < 15L @3436619
  60: (_s, L) => `−${num(Math.min(0.075 * L, 2.7))} overgrowth exponent (summed with the Botany deck's, capped at 2.7)`, // 5 − min(deck/100 + .075L, 2.7) @24313313
  64: (_s, L) => `+${L}% RP gain from all tanks`, // (1 + L/100) @28269683
  66: (s, L) => `Potion brew speed × ${num(1 + (Math.pow(0.4 * L, 0.6) * (sv(s, 'ApothecaryLV') / 3)) / 125)} (Apothecary level ${sv(s, 'ApothecaryLV')})`, // @24876459
  67: (_s, L) => `+${num((8 * L + 10) / (L + 80))}% chain level chance`, // @18666848
  68: (_s, L) => `+${num((100 * L + 10) / (L + 80))}% on the away-time tank bonus (TankBonusLIST[12])`, // @28466873
  69: (_s, L) => `+${num((200 * L + 10) / (L + 100))}% pet damage (max 200%)`, // @27312243
  70: (_s, L) => `Spelunking speed × ${num(1 + (1.9 * L) / (L + 1e3))}, learn rate × ${num(1 + (2 * L) / (L + 1e3))}`, // @2650578, @2654824
}
/** "Total now" for slot `i` at `level`: the exact entry when there is one, else the per-level text scaled. */
export const skillTotal = (s: Save, i: number, level: number) => (level > 0 ? (TOTALS[i] ? TOTALS[i]!(s, level) : levelTotal(SKILLS[i]![1], level)) : '')

/** Where the game reads each node's level and what it does with it (Qno2x.js byte offsets of `SkillLevels")[i]`). Verdict:
 *  'c' the per-level text is linear and matches the code (levelTotal's scaling is right), 'e' text right but capped/conditional (TOTALS has
 *  the exact figure), 'x' text wrong (CORRECTIONS + TOTALS), 'u' unlock node (the level only gates). 26 and 62: the effect read isn't a
 *  literal SkillLevels[i] (container reads), so the cite is the game's own tooltip, which states the per-level number. `re` must match
 *  within 2600 bytes after the offset (skilltree-code.test.ts checks). */
export const CODE: Record<number, { v: 'c' | 'e' | 'x' | 'u'; at: number; re: string; also?: [number, string] }> = {
  1: { v: 'u', at: 19412669, re: String.raw`SkillLevels"\)\[1\]` },
  2: { v: 'u', at: 19412969, re: String.raw`SkillLevels"\)\[2\]` },
  3: { v: 'e', at: 6988884, re: String.raw`if\(\w+<=100\*\(`, also: [6991925, String.raw`10\*\w+\+100\*Math\.max\(`] },
  4: { v: 'c', at: 6986436, re: String.raw`\*b\.engine\.getGameAttribute\("miningLVL"\)/100` },
  5: { v: 'c', at: 8439079, re: String.raw`\)\+2\|0;` },
  6: { v: 'x', at: 8675266, re: String.raw`\+=5\*\(\w+\+1\)` },
  7: { v: 'c', at: 19875388, re: String.raw`Math\.floor\(100\*\(\.08\*\w+\+\.2\)\)/100` },
  8: { v: 'x', at: 9047832, re: String.raw`\(\.75\*\w+\+\.1\*\w+\+2\)` },
  9: { v: 'c', at: 19897303, re: String.raw`\.002\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\+2e-4\*` },
  10: { v: 'c', at: 8431830, re: String.raw`\.1\*\w+\+\.8\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\+1` },
  11: { v: 'u', at: 19415739, re: String.raw`SkillLevels"\)\[11\]` },
  12: { v: 'u', at: 19416040, re: String.raw`SkillLevels"\)\[12\]` },
  13: { v: 'c', at: 7443413, re: String.raw`\(1\+\.2\*Math\.floor\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)` },
  14: { v: 'c', at: 8890039, re: String.raw`\(1\+\.2\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)\*b\.engine\.getGameAttribute\("CraftingLvUps"\)` },
  15: { v: 'c', at: 8467023, re: String.raw`\(1\.5\+\.5\*\w+\)\*\(1\+\.1\*` },
  16: { v: 'c', at: 8578021, re: String.raw`\.1\*\w+\+\.2\*\w+\+1\)` },
  17: { v: 'c', at: 2956983, re: String.raw`\(1\+\.1\*\w+\)\*\(1\+\w+\)\*\(\w+\+3\)` },
  18: { v: 'c', at: 2640073, re: String.raw`\(1\+\.2\*\(\w+=null==\(\w+=b\.engine\.getGameAttribute\("SkillLevels"\)\[18\]\)` },
  19: { v: 'x', at: 8878948, re: String.raw`randomFloatBetween\(\.21\*(?:\w+|null==[^;]{1,330}?string\(\w+\)\)),1\+\.2\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)` },
  20: { v: 'c', at: 31708813, re: String.raw`\(\w+\+\w+/10\)\+\(\.1\*` },
  21: { v: 'u', at: 19418820, re: String.raw`SkillLevels"\)\[21\]` },
  22: { v: 'u', at: 19419121, re: String.raw`SkillLevels"\)\[22\]` },
  23: { v: 'x', at: 31524088, re: String.raw`\*\(1-\.05\*Math\.floor\(\w+\)\)\+\.1` },
  24: { v: 'c', at: 9757309, re: String.raw`\w+\+=\w+,null!=\w+\.FishingComplete` },
  25: { v: 'x', at: 8695460, re: String.raw`1e3\*\w+\*\(1-Math\.min\(` },
  26: { v: 'c', at: 19623309, re: String.raw`CLICKS_GIVE_"\+Math\.floor\(10\*` },
  27: { v: 'c', at: 19984839, re: String.raw`\*\(1\+\.2\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)\*\(1\+b\.engine\.getGameAttribute\("CbonusHealingItems"\)` },
  28: { v: 'x', at: 10469322, re: String.raw`\(2\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)-1\)\*b\.engine\.getGameAttribute\("crusadebosskilled"\)\+1` },
  29: { v: 'c', at: 10485497, re: String.raw`\(\w+\*\(1\+\.3\*\w+\)\+10\)/10` },
  30: { v: 'c', at: 6986713, re: String.raw`\*\(1\+\.2\*\w+\);null!=\w+\.OresMined` },
  31: { v: 'u', at: 19421901, re: String.raw`SkillLevels"\)\[31\]` },
  32: { v: 'c', at: 21246963, re: String.raw`\+10\*b\.engine\.getGameAttribute\("CbonusSpiritEXPchance"\)\+100` },
  33: { v: 'c', at: 21247453, re: String.raw`\)\+\(50\+b\.engine\.getGameAttribute\("CultistEventBonusPercent"\)\)\)` },
  34: { v: 'c', at: 21248803, re: String.raw`\+\(50\+b\.engine\.getGameAttribute\("CbonusAcolyteEfficiency"\)\)` },
  35: { v: 'c', at: 21502378, re: String.raw`\(1\+5\*\w+/100\)\*\w+\*\(1\+` },
  36: { v: 'c', at: 21496250, re: String.raw`/100\)\*\(1\+b\.engine\.getGameAttribute\("CbonusGlyphExp"\)/100\)` },
  37: { v: 'c', at: 11296193, re: String.raw`1\+Math\.floor\(\w+\+\(5\*\w+\+4\*\(` },
  38: { v: 'c', at: 2641416, re: String.raw`Math\.floor\(b\.engine\.getGameAttribute\("MeritsSpent"\)/10\)` },
  39: { v: 'c', at: 2641683, re: String.raw`\.5\*\(?(?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)?\*b\.engine\.getGameAttribute\("ContractsCompleted"\)/100` },
  40: { v: 'c', at: 10487078, re: String.raw`\.5\*\(?(?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)?\*b\.engine\.getGameAttribute\("ContractsCompleted"\)/100` },
  41: { v: 'u', at: 19424984, re: String.raw`SkillLevels"\)\[41\]` },
  42: { v: 'c', at: 22902727, re: String.raw`\(\w+\+\(2\*\w+\+Math\.round\(2\*\w+\+\w+\*\(\w+-5\)\)\)\)\)` },
  43: { v: 'c', at: 23364662, re: String.raw`\(1\+10\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)/100\)\*\(1\+b\.engine\.getGameAttribute\("EbonusCrusadeEXP"\)` },
  44: { v: 'x', at: 22894707, re: String.raw`100\+\(\w+\+\(\w+\+10\*\w+\)\)` },
  45: { v: 'c', at: 22938448, re: String.raw`\(1\+10\*\w+/100\)\*\w+\*\(1\+25\*` },
  46: { v: 'c', at: 2957458, re: String.raw`\(1\+\.1\*\w+\)\*\(1\+\w+\)\*\(\w+\+3\)` },
  47: { v: 'c', at: 19898467, re: String.raw`\(25\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\+b\.engine\.getGameAttribute\("PbonusMaxShield"\)` },
  48: { v: 'x', at: 19899805, re: String.raw`\(\w+\+\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\*b\.engine\.getGameAttribute\("CombatLV"\)\)/100` },
  49: { v: 'c', at: 2991334, re: String.raw`\*6\*\(\w+\+3\)` },
  50: { v: 'c', at: 23365022, re: String.raw`\(1\+\.2\*(?:\w+|null==[^;]{1,330}?string\(\w+\)\))\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)\*\(1\+b\.engine\.getGameAttribute\("MTXdoubleCrusadeEXP"\)` },
  51: { v: 'e', at: 25990305, re: String.raw`\(1-Math\.min\(\.02\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\),\.9\)\)` },
  52: { v: 'c', at: 24953838, re: String.raw`600\*\w+/\(\w+\+2500\)\+\(3\*\w+\+\w+\)` },
  53: { v: 'e', at: 24245501, re: String.raw`\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\*Math\.floor\(b\.engine\.getGameAttribute\("FarmingLV"\)/25\)` },
  54: { v: 'c', at: 3074216, re: String.raw`<=50\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)` },
  55: { v: 'x', at: 18698760, re: String.raw`\[1\]=\w+\+Math\.min\(Math\.round\(10\*Math\.pow` },
  56: { v: 'c', at: 24903157, re: String.raw`\(1\+10\*\w+/100\)\*\(1\+8\*` },
  57: { v: 'x', at: 3436619, re: String.raw`<15\*\(` },
  58: { v: 'c', at: 24301020, re: String.raw`2\+\(\w+\+\w+\)/100` },
  59: { v: 'c', at: 23477124, re: String.raw`\(1\+3\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\*b\.engine\.getGameAttribute\("MythicPotsOwned"\)/100\)` },
  60: { v: 'e', at: 24313313, re: String.raw`5-Math\.min\(\w+\+\.075\*\w+,2\.7\)` },
  61: { v: 'c', at: 2645096, re: String.raw`\(1\+2\*\w+/100\)` },
  62: { v: 'c', at: 19722704, re: String.raw`Math\.floor\(3\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\)\)\+"%_LOWER_SMITH_COST_CAP"` },
  63: { v: 'c', at: 6062648, re: String.raw`\(1\+\w+\)\*\w+\*\(1\+\w+/100\)\*\(1\+2\*` },
  64: { v: 'x', at: 28269683, re: String.raw`\(1\+\w+/100\)\*\(1\+3\*\w+/100\)\}` },
  65: { v: 'c', at: 11830599, re: String.raw`\(1\+1\.5\*\w+/100\)` },
  66: { v: 'x', at: 24876459, re: String.raw`Math\.pow\(\.4\*\((?:\w+|null==[^;]{1,330}?string\(\w+\)\))\),\.6\)\*\(b\.engine\.getGameAttribute\("ApothecaryLV"\)/3\)/125` },
  67: { v: 'x', at: 18666848, re: String.raw`\(8\*\w+\+10\)/\(\w+\+80\)/100` },
  68: { v: 'x', at: 28466873, re: String.raw`\(100\*\w+\+10\)/\(` },
  69: { v: 'x', at: 27312243, re: String.raw`\(200\*\w+\+10\)/\(\w+\+100\)` },
  70: { v: 'x', at: 2650578, re: String.raw`1\+1\.9\*\w+/\(\w+\+1e3\)`, also: [2654824, String.raw`1\+2\*\w+/\(\w+\+1e3\)`] },
}

/** Points per level by slot (1-10) in the coloured trees (@19438727 … @19521311 †). Infinity: level + 1 († same listeners, else branch). */
const SLOT_COST = [0, 1, 2, 2, 3, 3, 4, 5, 5, 10, 10]
/** Slots capped at 1 (unlock nodes; `1>SkillLevels[…]` checks †). */
const ONE_SHOT = new Set([1, 2, 11, 12, 21, 22, 31, 41])
/** Slots whose cap leaves out Tressii Brew Bobby: the cap term is × (1 − ⌊(T+97)/100⌋ + ⌊(T+96)/100⌋), zero only on tree 3 (slot 5 = 25),
 *  and likewise tree 2 slot 9 (19) and tree 6 slot 10 (60) († @19471176, @19504700, @19512937). */
const NO_BOBBY = new Set([19, 25, 60])
/** Infinity slots unlocked by DairyAisleAchievements[k] († `1==DairyAisleAchievements[k]` guard); 61, 62, 65 are always open. */
export const DAIRY: Record<number, number> = { 63: 1, 64: 2, 66: 3, 67: 4, 68: 5, 69: 6, 70: 7 }
/** Prerequisite slot(s) within a tree, slot numbers 1-10 (any one suffices; sandbox-tested). */
const PARENTS: Record<number, number[]> = { 2: [1], 3: [2], 4: [3], 5: [2], 6: [4, 5], 7: [6], 8: [6], 9: [7], 10: [8] }

export const treeOf = (i: number) => Math.ceil(i / 10)
const slotOf = (i: number) => i - 10 * (treeOf(i) - 1)

/** The cap check (@19443966 †): level < 5 + AscentionLevel[12] + min(45·P/(P + 175), 35), P = PotionLV[158] (Tressii Brew Bobby).
 *  AscentionLevel[12] is Skilltree Overcharge (AP, buyable to 5, @13329107 †) plus All Star (BP perk 63, which adds +1 to
 *  AscentionLevel[12] on every level it buys, to 5, @13497701 †), so the cap tops out at 5 + 10 + 35 = 50 (15 on NO_BOBBY slots).
 *  The test is `level < cap`, so a fractional Bobby term still allows the level above: max level = ⌈cap⌉. */
export function capParts(s: Save) {
  const overcharge = n(arr(s, 'AscentionLevel')[12]), P = n(arr(s, 'PotionLV')[158])
  return { overcharge, allStar: n(arr(s, 'AscentionLevel')[63]), bobby: Math.min((45 * P) / (P + 175), 35) }
}
export function skillCap(s: Save, i: number): number {
  if (i > 60) return Infinity
  if (ONE_SHOT.has(i)) return 1
  const c = capParts(s)
  return Math.ceil(5 + c.overcharge + (NO_BOBBY.has(i) ? 0 : c.bobby))
}
export const skillCost = (i: number, level: number) => (i > 60 ? level + 1 : SLOT_COST[slotOf(i)]!)

/** Why the next level can't be bought, or null. */
export function skillLock(s: Save, i: number): string | null {
  const lv = arr(s, 'SkillLevels')
  if (DAIRY[i] != null && !n(arr(s, 'DairyAisleAchievements')[DAIRY[i]!])) return `Dairy Aisle achievement ${DAIRY[i]}`
  const par = i > 60 ? undefined : PARENTS[slotOf(i)]
  if (par && !par.some((p) => n(lv[p + 10 * (treeOf(i) - 1)]) > 0)) return `needs ${par.map((p) => SKILLS[p + 10 * (treeOf(i) - 1)]![0]).join(' or ')}`
  return null
}

/** Slot 37 (AP on ascend, +4%/level) is the one tree spend that outlasts an ascend: ascendGain reads SkillLevels[37] at the
 *  press, then the reset zeroes SkillLevels and Skillpoints (docs/resets.md). Cost of its next level, or null if capped/locked. */
export function apNodeNext(s: Save): number | null {
  const level = n(arr(s, 'SkillLevels')[37])
  return level < skillCap(s, 37) && !skillLock(s, 37) ? skillCost(37, level) : null
}

/** Chance a spent point comes straight back: min(TankBonusLIST[4], 90)% per level bought (@19440921 †). */
export const refundPct = (s: Save) => Math.min(n(arr(s, 'TankBonusLIST')[4]), 90)

const pct = (s: Save) => awayPercent(s) ?? 30.5
/** Rates the skill trees feed beyond perks.ts OUTPUTS, each from this app's own (tested) formula. */
const EXTRA: [string, (s: Save) => number | null][] = [
  ['damage (DPS)', (s) => { const v = getPlayerDPS(s); return typeof v === 'number' ? v : null }],
  ['Spirit EXP', (s) => spiritRates(withSpirit(s)).away],
  ['souls', (s) => soulRates(withSpirit(s)).souls.reduce((t, x) => t + x, 0)],
  ['rift speed', (s) => rifts(s).reduce((t, r) => t + r.speed, 0)],
  ['rift EXP', (s) => glyphBonusPct(s).slice(1).reduce((t, p) => t + 1 + p / 100, 0)],
  ['Tinkering EXP', expMult],
  ['Crusade EXP/day', (s) => shownExpPerDay(withCrusade(s))],
  ['crusaders', (s) => totalCrusaders(withCrusade(s))],
  ['active ores', (s) => mining(s, pct(s))?.activeOres ?? null],
  ['Smithing craft EXP', (s) => smithingCraftExp(s)],
  ['levels per craft', (s) => levelsPerCraft(s)],
  ['Tilling away crops', (s) => farmers(withTilling(s), pct(s)).reduce((t, f) => t + f.awayCropsPerSec, 0)],
  // Overgrowth time scales as base^E (botany-calc.ts): a lower exponent is shorter, so report 1/E.
  ['overgrowth speed (1/E)', (s) => 1 / overgrowthExponent(s)],
]

export type SkillRow = { i: number; tree: number; name: string; per: string; level: number; cap: number; next: number | null; lock: string | null
  impact: { output: string; change: number }[]; perPoint: number }

/** Every slot with level, cap, next cost and what one more level changes; `perPoint` = best % gain per point. */
export function skillPlan(save: Save): SkillRow[] {
  const lv = arr(save, 'SkillLevels')
  return Array.from({ length: 70 }, (_, k) => {
    const i = k + 1, level = n(lv[i]), cap = skillCap(save, i), next = level < cap ? skillCost(i, level) : null, lock = next == null ? null : skillLock(save, i)
    let impact: SkillRow['impact'] = []
    if (next != null && !ONE_SHOT.has(i)) {
      const SL = [...lv]; SL[i] = level + 1
      impact = outputChanges(save, { ...save, SkillLevels: SL }, [...OUTPUTS, ...EXTRA])
    }
    const best = Math.max(0, ...impact.map((x) => x.change))
    return { i, tree: treeOf(i), name: SKILLS[i]![0], per: SKILLS[i]![1], level, cap, next, lock, impact, perPoint: next ? best / next : 0 }
  })
}

export type SkillBuy = { i: number; name: string; from: number; to: number; spent: number; gain: number; output: string }
/** Spend `points` at equal marginal % gain per point (perks.ts lambdaSpend); a perk's gain g is a fixed absolute step, so its
 *  k-th extra level adds g/(1 + k·g). Infinity costs rise by 1 per level. ponytail: refunds not counted. */
export function skillBuys(rows: SkillRow[], points: number): { buys: SkillBuy[]; left: number } {
  const st = rows.filter((r) => r.next != null && !r.lock && r.impact.length).map((r) => {
    const b = r.impact.reduce((a, x) => (x.change > a.change ? x : a))
    return { r, g: b.change, output: b.output }
  })
  const curves = st.map((x) => stepCurve(x.g, x.r.level, x.r.cap, (L) => skillCost(x.r.i, L), points))
  const { k, left } = lambdaSpend(curves, points)
  return { buys: st.flatMap((x, i) => k[i] ? [{ i: x.r.i, name: x.r.name, from: x.r.level, to: x.r.level + k[i]!, spent: curves[i]!.slice(0, k[i]).reduce((a, s) => a + s.c, 0), gain: k[i]! * x.g, output: x.output }] : []).sort((a, b) => b.spent - a.spent), left }
}
