// Perk rules (#6): the ascension (AP) / rebirth (BP) perk table (data/perks.json, src/derive-perks.ts), wiki text
// corrections and per-level totals checked against the game code (CODE), and the key / BP locks. The pricing planner
// (what each next level is worth) is perk-plan.ts (refactor step 9, #72).
import perkData from '../../data/perks.json'
import { levelTotal } from '../../level-total'

type Save = Record<string, unknown>
export type Perk = { i: number; name: string | null; currency: 'AP' | 'BP'; max: number; capped: boolean; cost: number[]; effect?: string }
/** Wiki effect texts the game code contradicts (verdict 'x' in CODE below; offsets there). Everything else keeps the wiki text. */
export const CORRECTIONS: Record<number, string> = {
  17: 'Each upgrade gives +5% chance to get 2x tickets every 2 hours, minus 1 point (a 1-100 roll must be below 5 x level)',
  18: 'Each upgrade shortens the free candy coupon timer by 2 hours (48 h at level 0, 24 h at level 12, which is the cap)',
  19: 'Each upgrade adds +1% cashback on all cash spent (total capped at 70%, mastery perk 112 adds 10). The wiki\'s +10% starting cash is not in the code',
  24: 'Each upgrade gives +1 starting level in 11 skills (attack, strength, endurance, summoning, spiriting, fishing, mining, smithing, tilling, botany, apothecary)',
  26: 'Each upgrade adds +2 to the card-drop-chance bonus that scales the rare star card chance: chance x (1 + (bonus + 2n)/100)',
  27: 'Banana Bonk: damage x (31 + 2n + 0.1 per Banana Bonk skill level), steals (20 + n) x the kill cash',
  28: 'Shoulder Tap: distracts floor((10 + n)/5) seconds, +100 crit chance, +(200 + 20n)% crit damage',
  34: 'Cuts whole smithing scaling points: floor(0.0006 x n x (H2O - 100)), max 5 (it works; the wiki\'s "bugged: no effect" is wrong)',
  38: '+10n% ore and +10n% fish (the wiki says +30% fish)',
  40: '+10n% damage',
  54: 'Potion level-up cost scaling F = max(1.02 + 0.16/(0.43 ln(n x (H2O - 100) + 100)), 1.03) per potion level (gem cost: 0.07 instead of 0.16)',
  62: '+15n% damage',
}
export const PERKS = (perkData as Perk[]).map((p) => (CORRECTIONS[p.i] ? { ...p, effect: CORRECTIONS[p.i] } : p))

const n = (v: unknown) => Number(v ?? 0) || 0

/** Total effect at level L: hand-written where the wiki text can't be scaled (caps, formulas, words), else levelTotal on the wiki text. */
const f1 = (v: number) => +v.toFixed(1)
const h2o = (s: Save) => n(s.waterLV)
/** Potion level-up cost scaling F per potion level for numerator `a` (0.16 coins, 0.07 gems), @3196932 / @3203433. */
const potionF = (s: Save, L: number, a: number) => Math.max(1.02 + a / (0.43 * Math.log(Math.abs(L * Math.max(h2o(s) - 100, 0) + 100))), 1.03)
const TOTALS: Record<number, (s: Save, L: number) => string> = {
  // (1 + .005·H2O·L): accuracy @3956307, damage @2640587, health @3953437.
  1: (s, L) => `+${f1(0.5 * L * h2o(s))}% accuracy (0.5% × ${L} × H2O ${h2o(s)})`,
  5: (s, L) => `+${f1(0.5 * L * h2o(s))}% damage (0.5% × ${L} × H2O ${h2o(s)})`,
  9: (s, L) => `+${f1(0.5 * L * h2o(s))}% health (0.5% × ${L} × H2O ${h2o(s)})`,
  4: (_s, L) => `+${Math.min(L, 20) * 10}% faster skill cooldowns${L > 20 ? ' (capped at level 20)' : ''}`, // Design_101: min(0.05·(1 + 0.1·L), 0.15) @18614149
  12: (_s, L) => `Skilltree perks can be levelled ${L} higher`, 63: (_s, L) => `Skilltree perks can be levelled ${L} higher (of the 5 this perk allows)`,
  // ore ×(1 + .5·L/100·.43·ln(|copper| + 1)), copper = OresOwned[1] @30253731
  16: (s, L) => `+${f1(0.5 * L * 0.43 * Math.log(Math.abs(n((s.OresOwned as number[] | undefined)?.[1])) + 1))}% ores mined (0.5% × ${L} × powers of 10 of copper)`,
  // 2x tickets when randomInt(1,100) < 5·L @19787203 (inclusive roll, so 5L − 1 percent)
  17: (_s, L) => `${Math.max(5 * L - 1, 0)}% chance of 2× tickets every 2 hours`,
  // free coupon after 3600·|48 − 2·L| s, L clamped to 12 @11512856
  18: (_s, L) => `Free candy coupon every ${48 - 2 * Math.min(L, 12)} h${L > 12 ? ' (capped at level 12)' : ''}`,
  19: (s, L) => `+${Math.min(L + 10 * n((s.MasteryPerksUnlocked as number[] | undefined)?.[112]), 70)}% cashback (${L} from the perk; capped at 70)`, // @18691027
  20: (_s, L) => `${25 + L} star cards per zone per day`,
  24: (_s, L) => `+${L} starting level in 11 skills`, // @20908890
  // fish ×(1 + .3·L·(.43·ln(|cash| + 1))/100) @10611368
  25: (s, L) => `+${f1(0.3 * L * 0.43 * Math.log(Math.abs(n(s.goldcoin)) + 1))}% fish caught (0.3% × ${L} × powers of 10 of cash)`,
  26: (_s, L) => `+${2 * L} to the card-drop-chance bonus (rare star card chance × (1 + (bonus + ${2 * L})/100))`, // @15678337
  27: (_s, L) => `Damage × ${31 + 2 * L} + 0.1 per skill level (${3100 + 200 * L}%), steals ${20 + L}× kill cash`, // @17781262, @17779598
  28: (_s, L) => `Distracts ${Math.floor((10 + L) / 5)} s, +100 crit chance, +${200 + 20 * L}% crit damage`, // @17828337, @17828875
  // potionBonuses SmithingScalingRedux, floored per perk, max 5, then ×(1 + .02·potion 94 + vending) @31651415; each point is −0.01 on the cost exponent (smithing cost sites @30953819…)
  34: (s, L) => `−${Math.min(Math.floor(6e-4 * L * Math.max(h2o(s) - 100, 0)), 5)} whole smithing scaling points (floored, max 5)`,
  35: (_s, L) => `+${L} max crit toggles; each toggle: −20% crit chance, +10% damage`,
  38: (_s, L) => `+${10 * L}% ore, +${10 * L}% fish`, // @30253441, @10612224
  39: (s, L) => `+${L * Math.max(h2o(s) - 100, 0)}% cash (${L} × (H2O ${h2o(s)} − 100))`, // @3961255
  40: (_s, L) => `+${10 * L}% damage`, 62: (_s, L) => `+${15 * L}% damage`, // damage product @2643319: (1+5·p49)(1+10·p40)(1+15·p62)
  44: (s, L) => `+${L * Math.max(h2o(s) - 100, 0)}% damage (${L} × (H2O ${h2o(s)} − 100))`, // @2642353
  42: () => 'none: only counted by the all-perks-maxed check',
  // F per potion level, coins @3196932 (gems @3203433); without the perk F = 1.02 + .16/(.43·ln 100)
  54: (s, L) => `Potion cost scaling ×${potionF(s, L, 0.16).toFixed(4)} per level (was ×${potionF(s, 0, 0.16).toFixed(4)}); gems ×${potionF(s, L, 0.07).toFixed(4)} (was ×${potionF(s, 0, 0.07).toFixed(4)})`,
  61: () => '', 64: () => '', 66: () => '', 67: () => '', 68: () => '', // words only, or a flat unlock
}
/** Where the game reads each perk and what it does with it (Qno2x.js byte offsets of `AscentionLevel")[i]`). Verdict: 'c' the wiki
 *  text is linear and matches the code (levelTotal's scaling is right), 'e' text right but non-linear/capped/conditional, so TOTALS
 *  has the exact formula, 'x' the wiki text is wrong (CORRECTIONS + TOTALS). `re` must match within 2600 bytes after the offset
 *  (perks.test.ts checks). Not listed (verdict unknown: effect read not traced, flags/unlocks only): crystals 29-32 36 45 51 55,
 *  contracts/shops 43 46 47 50 52, 53, 61, 66, 67; 63 and 12's +1 come from the buy code (@13497701). */
export const CODE: Record<number, { v: 'c' | 'e' | 'x'; at: number; re: string }> = {
  1: { v: 'e', at: 3956307, re: String.raw`\(1\+\.005\*\w+\*` },
  2: { v: 'c', at: 11047227, re: String.raw`\(\.1\*\w+\+\(\.3\*` },
  3: { v: 'c', at: 19919514, re: String.raw`=2/\(1\+\.1\*` },
  4: { v: 'e', at: 18614149, re: String.raw`Math\.min\(\.05\*\(1\+\.1\*\w+\),\.15\)` },
  5: { v: 'e', at: 2640587, re: String.raw`\(1\+\.005\*\(\w=b\.engine\.getGameAttribute\("waterLV"\)\)` },
  6: { v: 'c', at: 3971543, re: String.raw`\(1\+\.1\*\(null==` },
  7: { v: 'c', at: 19880345, re: String.raw`\(1\+\.05\*\w+\)\*\(1\+\(\w+\+\.1\*` },
  8: { v: 'c', at: 19877789, re: String.raw`\(1\+\.05\*\(null==` },
  9: { v: 'e', at: 3953437, re: String.raw`\(1\+\.005\*\w+\*` },
  10: { v: 'c', at: 3963236, re: String.raw`\(1\+\.5\*\(null==` },
  11: { v: 'c', at: 18670659, re: String.raw`\.6\*\(1\+\.1\*\w+\)` },
  12: { v: 'e', at: 19443966, re: String.raw`5\+\w+\+Math\.min\(45\*` },
  13: { v: 'c', at: 17777515, re: String.raw`"VendingBonus",2,0\)` },
  14: { v: 'c', at: 3954296, re: String.raw`\(\.1\*\w+\*\w+/100\+\.5\*` },
  15: { v: 'c', at: 3960041, re: String.raw`\+\.2\*\w+\*\(null==` },
  16: { v: 'e', at: 30253731, re: String.raw`\(1\+\.5\*\w+/100\*\.43\*Math\.log\(Math\.abs\(` },
  17: { v: 'x', at: 19787203, re: String.raw`"SparklecoinRng1000"\)\)<5\*\(null==` },
  18: { v: 'x', at: 11512856, re: String.raw`3600\*Math\.abs\(48-2\*` },
  19: { v: 'x', at: 18691027, re: String.raw`Math\.min\(\w+\+10\*\w+,70\)/100` },
  20: { v: 'e', at: 23146446, re: String.raw`=25\+\w+;` },
  21: { v: 'c', at: 20907246, re: String.raw`\[21\];\w+\[1\]=\(` },
  22: { v: 'c', at: 19880645, re: String.raw`\(1\+\(\w+\+\.1\*\w+\*\w+/100\)\)` },
  23: { v: 'c', at: 19883235, re: String.raw`1\.25\+\(` },
  24: { v: 'x', at: 20908890, re: String.raw`=1\+\(\w+\+\(\w+\+\(\w+\+\(\w+-1\)\)\)\)` },
  25: { v: 'e', at: 10611368, re: String.raw`\(1\+\.3\*\$\*\w+/100\)` },
  26: { v: 'x', at: 15678337, re: String.raw`\+20\*\(b\.engine\.getGameAttribute\("currentfightmode"\)-1\)\)\+2\*` },
  27: { v: 'x', at: 17781262, re: String.raw`\(\.1\*\w+\+\(30\+2\*\w+\)\+1\)` },
  28: { v: 'x', at: 17828337, re: String.raw`Math\.floor\(Math\.floor\(10\+\(null==` },
  33: { v: 'c', at: 8890449, re: String.raw`\(1\+\(\w+\+3\*\w+\)/100\)` },
  34: { v: 'x', at: 31651415, re: String.raw`Math\.floor\(6e-4\*` },
  35: { v: 'e', at: 26142294, re: String.raw`"CritToggles"\)\+1` },
  37: { v: 'c', at: 8890697, re: String.raw`\(1\+\(\w+\+3\*\w+\)/100\)` },
  38: { v: 'x', at: 10612224, re: String.raw`\(1\+10\*\w+/100\)\*\(1\+20\*` },
  39: { v: 'e', at: 3961255, re: String.raw`Math\.max\(b\.engine\.getGameAttribute\("waterLV"\)-100,0\)/100` },
  40: { v: 'x', at: 2643553, re: String.raw`\(1\+5\*\w+/100\)\*\(1\+10\*\w+/100\)\*\(1\+15\*\w+/100\)` },
  41: { v: 'c', at: 19351462, re: String.raw`\[41\];for\(` },
  44: { v: 'e', at: 2642353, re: String.raw`Math\.max\(b\.engine\.getGameAttribute\("waterLV"\)-100,0\)/100` },
  48: { v: 'c', at: 24238487, re: String.raw`\(1\+5\*\w+\*\(null==` },
  49: { v: 'c', at: 2643319, re: String.raw`\(1\+5\*\w+/100\)\*\(1\+10\*\w+/100\)` },
  54: { v: 'x', at: 3196932, re: String.raw`1\.02\+\.16/\(\.43\*Math\.log\(Math\.abs\(` },
  56: { v: 'c', at: 20960195, re: String.raw`=1\+\(\w+\+\(\w+\+\(\w+\+\(\w+-1\+Math\.min` },
  57: { v: 'c', at: 20961799, re: String.raw`\[57\][^;]*?"ContractRank"\)\[44\]` },
  58: { v: 'c', at: 20963410, re: String.raw`\[58\][^;]*?"ContractRank"\)\[` },
  59: { v: 'c', at: 24875976, re: String.raw`\(1\+8\*\w+/100\)` },
  60: { v: 'c', at: 15613384, re: String.raw`\(1\+10\*\w+/100\)\*\(1\+5\*` },
  62: { v: 'x', at: 2643787, re: String.raw`\(1\+15\*\w+/100\)` },
  64: { v: 'c', at: 11829833, re: String.raw`=1\+Math\.ceil\(` },
  65: { v: 'c', at: 31694097, re: String.raw`\(1\+\(10\*\w+\+\.5\*\w+\)/100\)` },
  68: { v: 'c', at: 19351212, re: String.raw`\.getGameAttribute\("waterLV"\)/3\)` },
}
export const perkTotal = (s: Save, p: Perk, L: number) => (L > 0 ? (TOTALS[p.i] ? TOTALS[p.i]!(s, L) : levelTotal(p.effect, L)) : '')

export type Impact = { output: string; change: number; game?: boolean }
/** AP perks behind a key (ActorEvents_950: clicking the lock tile, ascentionSelected = 100·perk, spends KeysOwned[key]
 *  and sets KeysUnlocked[perk]=1; the buy button itself doesn't check). Consistent with the save: every levelled perk
 *  here is unlocked. BP perks are gated separately, in BP_LOCKS below. */
export const KEY_LOCKS: Record<number, number> = { 13: 5, 17: 5, 18: 5, 29: 5, 16: 6, 19: 6, 20: 6, 30: 6, 21: 7, 25: 7, 26: 7, 31: 7, 24: 8, 27: 8, 28: 8, 32: 8 }
/** BP perks: picking one in the rebirth tree (ActorEvents_615 click handler, @12509217-@12535000 †) needs a level in an
 *  earlier perk (`all`: every one; `any`: at least one) and, for some, a flag that reaching a fight mode sets
 *  (KeysUnlocked[33..37] †@19794001: mode 15 Oblivion → 33, a hell key → 34, 12 The Bog → 35, 13 Lunar Isle → 36,
 *  14 Maelstrom → 37). Flags 38-41 gate perks 40, 60, 42, 49; what sets them isn't traced. [perk, level] = above that level. */
export const BP_LOCKS: Record<number, { flag?: number; all?: [number, number][]; any?: [number, number][] }> = {
  34: { flag: 34, all: [[33, 4]] }, 35: { all: [[34, 9]] }, 36: { all: [[35, 7]] }, 37: { flag: 35, all: [[35, 9]] }, 38: { all: [[37, 14]] },
  39: { flag: 36, all: [[38, 19]] }, 40: { flag: 38, all: [[39, 24]] }, 41: { flag: 37, all: [[39, 29]] }, 42: { flag: 40, all: [[41, 39]] },
  44: { flag: 34, all: [[43, 0]] }, 45: { all: [[44, 7]] }, 46: { flag: 35, all: [[44, 9]] }, 47: { all: [[46, 0]] }, 48: { flag: 36, all: [[47, 0]] },
  49: { flag: 41, all: [[48, 19]] }, 50: { flag: 37, all: [[48, 34]] }, 51: { all: [[50, 0]] }, 52: { any: [[50, 0], [61, 34]] },
  54: { flag: 34, all: [[53, 2]] }, 55: { all: [[54, 7]] }, 56: { all: [[54, 9]] }, 57: { all: [[54, 9]] }, 58: { flag: 35, any: [[56, 6], [57, 6]] },
  59: { flag: 36, all: [[58, 9]] }, 60: { flag: 39, all: [[59, 19]] }, 61: { flag: 37, all: [[59, 24]] }, 62: { all: [[61, 39]] },
  63: { flag: 33, all: [[41, 49], [52, 0]] }, 64: { flag: 35 },
}
export const FLAG_NAMES: Record<number, string> = { 33: 'reach Oblivion', 34: 'a hell key', 35: 'reach The Bog', 36: 'reach Lunar Isle', 37: 'reach Maelstrom' }
const perkName = (i: number) => PERKS.find((q) => q.i === i)?.name ?? `perk ${i}`

export type Lock = { key: number; held: number } | { wiki: true } | { need: string } | null
export function perkLock(save: Save, p: Perk, level: number): Lock {
  const bp = BP_LOCKS[p.i]
  if (p.currency === 'BP' && bp) {
    const lv = (i: number) => Number((save.AscentionLevel as number[] | undefined)?.[i] ?? 0)
    const missing: string[] = []
    if (bp.flag != null && !Number((save.KeysUnlocked as number[] | undefined)?.[bp.flag] ?? 0)) missing.push(FLAG_NAMES[bp.flag] ?? `unlock flag ${bp.flag} (source not traced)`)
    for (const [i, t] of bp.all ?? []) if (lv(i) <= t) missing.push(`${perkName(i)} Lv${t + 1}+ (you have ${lv(i)})`)
    if (bp.any && !bp.any.some(([i, t]) => lv(i) > t)) missing.push(bp.any.map(([i, t]) => `${perkName(i)} Lv${t + 1}+ (you have ${lv(i)})`).join(' or '))
    return missing.length ? { need: missing.join(' and ') } : null
  }
  const key = KEY_LOCKS[p.i]
  if (key != null) return Number((save.KeysUnlocked as number[] | undefined)?.[p.i] ?? 0) ? null : { key, held: Number((save.KeysOwned as number[] | undefined)?.[key] ?? 0) }
  return level === 0 && /key unlock/i.test(p.effect ?? '') ? { wiki: true } : null
}
