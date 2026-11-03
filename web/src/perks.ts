// Perk planner (#6): what the next level of each ascension (AP) / rebirth (BP) perk does, priced by finite difference:
// copy the save, add one level, re-run this app's own formulas, report what moved. Costs/max from the game's buy
// button (src/derive-perks.ts). Formulas that read stored derived values (DPS, HP…) won't see a perk that feeds those;
// src/perk-impacts.ts reruns the game's own code for those. Perks that change no rate get a LABELS entry instead.
import perkData from './data/perks.json'
import { awayGainsPerHour, awayPercent, awayTillingPerSecond } from './away'
import { awayFishing } from './fishing'
import { hitChance, playerHPmax } from './combat'
import { smithingBaseAttack } from './smithing'
import { ascendGain, brewSpeedBoost } from './load-bonuses'
import { botanyPots } from './botany-calc'
import { levelTotal } from './level-total'

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

const pctOf = (s: Save) => awayPercent(s) ?? 30.5
const n = (v: unknown) => Number(v ?? 0) || 0
const lvOf = (s: Save, i: number) => n((s.AscentionLevel as number[] | undefined)?.[i])
/** Potion level-up price, coin currency (ActorEvents_1104 ~3196914): 25·PotionEXPreq[p]·F^PotionLV[p−1], F = max(1.02 +
 *  .16/(.43·ln(perk 54·max(H2O−100, 0) + 100)), 1.03); other price factors don't involve the perk. Output: one level of every
 *  owned potion per coin, so a cheaper scaling reads as a gain. No stored value to check (computed on the buy screen). */
function potionLevelsPerCoin(s: Save) {
  const lv = (s.PotionLV as number[]) ?? [], req = (s.PotionEXPreq as number[]) ?? []
  const F = Math.max(1.02 + 0.16 / (0.43 * Math.log(Math.abs(lvOf(s, 54) * Math.max(n(s.waterLV) - 100, 0) + 100))), 1.03)
  let cost = 0
  for (let p = 1; p < req.length; p++) if (n(lv[p - 1]) > 0) cost += 25 * n(req[p]) * F ** n(lv[p - 1])
  return cost ? 1 / cost : null
}
export const OUTPUTS: [string, (s: Save) => number | null][] = [
  ['AP per ascend', (s) => ascendGain(s).ap],
  ['BP per rebirth', (s) => ascendGain(s).bp],
  ['away kills/h', (s) => awayGainsPerHour(s).kills],
  ['away cash/h', (s) => awayGainsPerHour(s).cash],
  ['away gain %', (s) => awayPercent(s)],
  ['hit chance', (s) => hitChance(s)],
  ['max HP', (s) => playerHPmax(s)],
  ['smithing attack', (s) => smithingBaseAttack(s)],
  ['Tilling away XP', (s) => awayTillingPerSecond(s, pctOf(s))],
  ['Fishing away XP', (s) => awayFishing(s, pctOf(s)).perAwaySecond],
  // Cauldron brew-speed multiplier (PotionBrewSpeedBOOST[1]; load-bonuses.test reproduces the stored value).
  ['brew speed', (s) => brewSpeedBoost(s)],
  // Growth per tick summed over pots: potSpeed (HerbloreSpeedBOOST3, perk 48 × the pot's overlevels; botany-calc.test
  // reproduces it) × the pot's anim speed × (1 + tier/4). The global HerbloreSpeedBOOST is a common factor and cancels.
  ['Botany growth', (s) => botanyPots(s).reduce((t, p) => t + p.potSpeed * p.anim * (1 + p.tier / 4), 0)],
  ['potion levels per coin', potionLevelsPerCoin],
  // Cashback (Design_409 Multibuy ~18691009): goldcoin += min(perk 19 + 10·MasteryPerksUnlocked[112], 70)% of what a buy
  // cost, so cash goes 1/(1 − cashback) as far. Applied per purchase; nothing stored to check.
  ['upgrades per cash', (s) => 1 / (1 - Math.min(lvOf(s, 19) + 10 * n((s.MasteryPerksUnlocked as number[] | undefined)?.[112]), 70) / 100)],
]
const run = (f: (s: Save) => number | null, s: Save) => { try { const v = f(s); return Number.isFinite(v) ? (v as number) : null } catch { return null } }

/** Relative change (+0.05 = +5%) of every output the next level of perk `i` moves. */
export function perkImpact(save: Save, i: number): { output: string; change: number }[] {
  const lv = [...((save.AscentionLevel as number[]) ?? [])]
  lv[i] = (lv[i] ?? 0) + 1
  return outputChanges(save, { ...save, AscentionLevel: lv })
}

/** Relative change of every output between two saves (also used by skilltree.ts for SkillLevels). */
export function outputChanges(save: Save, next: Save, outputs = OUTPUTS): { output: string; change: number }[] {
  return outputs.flatMap(([output, f]) => {
    const a = run(f, save), b = run(f, next)
    return a && b != null && Math.abs(b / a - 1) > 1e-9 ? [{ output, change: b / a - 1 }] : []
  })
}

/** Perks that don't change a rate: what one more level gives, in words (from the game code where noted). They rank as 0. */
export type Label = { kind: string; text: string }
const unlock = (what: string): (() => Label) => () => ({ kind: 'unlock', text: `Unlocks ${what}` })
const crystal = (color: string): (() => Label) => () => ({ kind: 'crystal', text: `+1 ${color} crystal` })
const startLv = (skill: string): (() => Label) => () => ({ kind: 'starting level', text: `+1 starting ${skill} level after every reset (1 level saved per reset)` })
const LABELS: Record<number, (s: Save, level: number) => Label> = {
  // Design_101 cooldown ticker: +min(0.05·(1 + 0.1·L), 0.15) per 50 ms, so levels past 20 add nothing.
  4: (_s, L) => ({ kind: L >= 20 ? 'capped' : 'cooldowns', text: L >= 20 ? 'Nothing: cooldown speed caps at level 20 (+200%)' : '+10% faster skill cooldowns' }),
  11: () => ({ kind: 'perk points', text: '+10% more perk points from skill level-ups' }),
  13: () => ({ kind: 'perk points', text: '+1 perk point at the start of every run' }),
  12: () => ({ kind: 'skilltree cap', text: 'Skilltree perks can be levelled 1 higher' }),
  61: () => ({ kind: 'cap raise', text: 'Raises the max level of H2O damage, BTQ1, BTQ2, H2O cash and brew speed rebirth perks' }),
  17: () => ({ kind: 'tickets', text: '+5 points of chance for 2× tickets every 2 hours (roll must be below 5 × level)' }),
  18: (_s, L) => ({ kind: 'candy', text: L >= 12 ? 'Nothing: the candy timer caps at level 12 (24 h)' : `Free candy coupon every ${48 - 2 * (L + 1)} h instead of ${48 - 2 * L} h` }),
  // SceneEvents_9 init: CardDropsPerDayMAX = 25 + perk 20.
  20: (_s, L) => ({ kind: 'star cards', text: `+1 star card per zone per day (${25 + L} → ${26 + L})` }),
  26: () => ({ kind: 'star cards', text: '+2 to the card-drop-chance bonus that scales rare star card drops' }),
  27: (_s, L) => ({ kind: 'active skill', text: `Banana Bonk: ${3100 + 200 * (L + 1)}% damage (+10% per skill level), steals ${20 + L + 1}× kill cash` }),
  28: (_s, L) => ({ kind: 'active skill', text: `Shoulder Tap: distracts ${Math.floor((11 + L) / 5)} s, +100 crit chance, +${200 + 20 * (L + 1)}% crit damage` }),
  29: crystal('yellow'), 45: crystal('yellow'), 30: crystal('red'), 55: crystal('red'), 31: crystal('purple'), 36: crystal('purple'), 32: crystal('blue'), 51: crystal('blue'),
  41: () => ({ kind: 'H2O tokens', text: '+1 extra training perk (H2O) token' }),
  68: () => ({ kind: 'H2O tokens', text: '+1 extra H2O token' }),
  43: unlock('ungodly contracts'), 46: unlock('cerebral contracts'), 50: unlock('lavathian contracts'),
  47: unlock('contract shop 4'), 52: unlock('contract shop 5'), 53: unlock('the next crystal slot (apothecary and mining)'),
  66: unlock('the next training perk (the 10 you cannot get from ascending)'), 67: unlock('the next skilltree training perk'),
  // Ascend/rebirth reset (SceneEvents_22): each skill restarts at 1 + gift shop + mastery + contract + perk 24 + tank − 1.
  24: () => ({ kind: 'starting level', text: '+1 starting level in 11 skills (attack, strength, endurance, summoning, spiriting, fishing, mining, smithing, tilling, botany, apothecary): 11 levels saved per reset' }),
  // Same reset: RiftLVL[k] = perk 21 + 1 for every owned rift.
  21: (s) => { const r = Math.max(n(s.RiftsOwned), 1); return { kind: 'starting level', text: `+1 starting level in each of your ${r} rifts: ${r} levels saved per reset` } },
  56: startLv('tilling'), 57: startLv('botany'), 58: startLv('apothecary'),
  35: () => ({ kind: 'trade-off', text: '+1 max crit toggle; each toggle: −20% crit chance, +10% damage (compounding)' }),
  // potionBonuses SmithingScalingRedux (game: SceneEvents_9 ~31651397): min(floor(6e-4·L·max(H2O−100, 0)), 5), floored to whole points.
  34: (s, L) => {
    const w = Math.max(n(s.waterLV) - 100, 0), pts = (x: number) => Math.min(Math.floor(6e-4 * x * w), 5)
    if (pts(L + 1) > pts(L)) return { kind: 'smithing scaling', text: `−1 whole smithing scaling point (${pts(L)} → ${pts(L + 1)})` }
    const need = w > 0 ? Math.ceil((pts(L) + 1) / (6e-4 * w)) : null
    return { kind: 'no effect yet', text: `Floored to whole points: nothing until level ${need ?? '∞'} at H2O ${n(s.waterLV)} (level × (H2O − 100) ≥ ${Math.round((pts(L) + 1) / 6e-4)}), then −1 smithing scaling point` }
  },
  // Only read by the all-perks-maxed check (SceneEvents_47 ~29349948).
  42: () => ({ kind: 'no effect', text: 'No game effect: only counted by the all-perks-maxed check' }),
  // All Star: its buy also adds 1 to AscentionLevel[12] (Skilltree Overcharge), Qno2x.js @13497701 (skilltree.ts).
  63: () => ({ kind: 'skilltree cap', text: 'Skilltree perks can be levelled 1 higher (adds a level to Skilltree Overcharge)' }),
}

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

export type PerkRow = Perk & { total: string; lock: Lock; level: number; next: number | null; impact: Impact[]; label?: Label; perCost: number; affordable: number; afterReset: number }
/** data/perk-impacts.json (src/perk-impacts.ts): the same +1-level differences, from the game's own combat code. */
export type GameImpacts = { save: string; levels: number[]; perks: Record<string, { output: string; change: number }[]> }

/** Every perk with level, next cost, modelled impact, and best gain per AP/BP; ranked within each currency.
 *  `game` rows join a perk only when written for this run at the perk's current level, and never repeat an in-app output. */
export function perkPlan(save: Save, game?: GameImpacts | null): PerkRow[] {
  const run = `${save.TimesAscended ?? 0}-${save.NumberofTimesRebirth ?? 0}`
  const lv = (save.AscentionLevel as number[]) ?? [], bal = { AP: Number(save.APtoSpend ?? 0), BP: Number(save.BPtoSpend ?? 0) }
  let g = { ap: 0, bp: 0 }
  try { g = ascendGain(save) } catch { /* cloud save without ascend inputs */ }
  // Levels buyable from a balance, walking the cost table from the current level.
  const buyable = (p: Perk, level: number, left: number) => { let k = 0; for (let L = level; L < p.max && p.cost[L] != null && p.cost[L]! <= left; L++) { left -= p.cost[L]!; k++ } return k }
  return PERKS.map((p) => {
    const level = lv[p.i] ?? 0, next = level < p.max ? (p.cost[level] ?? null) : null
    const own: Impact[] = next == null ? [] : perkImpact(save, p.i)
    const fromGame = next != null && game?.save === run && (game.levels[p.i] ?? 0) === level ? game.perks[p.i] ?? [] : []
    const impact = [...own, ...fromGame.filter((r) => !own.some((x) => x.output === r.output)).map((r) => ({ ...r, game: true }))]
    const best = Math.max(0, ...impact.map((x) => x.change))
    const affordable = buyable(p, level, bal[p.currency])
    // After ascending (AP) or rebirthing (BP) now: balance + what that reset pays (ascendGain).
    const afterReset = buyable(p, level, bal[p.currency] + (p.currency === 'AP' ? g.ap : g.bp))
    const label = impact.length ? undefined : LABELS[p.i]?.(save, level)
    return { ...p, total: perkTotal(save, p, level), lock: perkLock(save, p, level), level, next, impact, label, perCost: next ? best / next : 0, affordable, afterReset }
  }).sort((a, b) => (a.currency === b.currency ? b.perCost - a.perCost : a.currency < b.currency ? -1 : 1))
}

export type Buy = { i: number; name: string | null; from: number; to: number; spent: number; gain: number; output: string }

/** Equal marginal value (Lagrange, as src/realm-coins.ts spendLevels): each option's levels as {cost, ratio} steps, the
 *  ratio already running-min'd so taking a prefix is exact. Bisect λ (log space) so every step with ratio ≥ λ fits the
 *  budget, then top up with the best next step that still fits. Returns levels taken per option and what is left. */
export function lambdaSpend(curves: { c: number; r: number }[][], budget: number): { k: number[]; left: number } {
  const take = (lam: number) => curves.map((cv) => { let k = 0, cost = 0; while (k < cv.length && cv[k]!.r >= lam) cost += cv[k++]!.c; return { k, cost } })
  const total = (t: { cost: number }[]) => t.reduce((a, x) => a + x.cost, 0)
  let lo = Math.log(1e-300), hi = Math.log(Math.max(1e-300, ...curves.flatMap((cv) => cv.map((x) => x.r)).filter(Number.isFinite)) * 2)
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (total(take(Math.exp(mid))) <= budget) hi = mid; else lo = mid }
  const pick = take(Math.exp(hi))
  let left = budget - total(pick)
  for (;;) {
    let bi = -1
    curves.forEach((cv, i) => { const st = cv[pick[i]!.k]; if (st && st.c <= left && (bi < 0 || st.r > curves[bi]![pick[bi]!.k]!.r)) bi = i })
    if (bi < 0) break
    left -= curves[bi]![pick[bi]!.k++]!.c
  }
  return { k: pick.map((x) => x.k), left }
}
/** Steps of one option: next-level cost from `cost(L)` (null = can't), gain g/(1+k·g) for the k-th extra level (g is a fixed
 *  absolute step), tabulated until the budget or the cap. */
export function stepCurve(g: number, from: number, cap: number, cost: (L: number) => number | null | undefined, budget: number) {
  const steps: { c: number; r: number }[] = []
  let r = Infinity
  for (let L = from, k = 0, cum = 0; L < cap && g > 0; L++, k++) {
    const c = cost(L)
    if (c == null || !(cum + c <= budget)) break
    cum += c; r = Math.min(r, g / (1 + k * g) / c); steps.push({ c, r })
  }
  return steps
}

/** What to buy with `balance`: % gain per cost at equal marginal value (lambdaSpend), the k-th extra level of a perk adding
 *  g/(1+k·g) relative. Sorted by AP/BP spent. */
export function buyList(rows: PerkRow[], currency: 'AP' | 'BP', balance: number): { buys: Buy[]; left: number } {
  const st = rows.filter((r) => r.currency === currency && r.next != null && r.impact.length && !r.lock)
    .map((r) => { const best = r.impact.reduce((a, b) => (b.change > a.change ? b : a)); return { r, g: best.change, output: best.output } })
  const curves = st.map((x) => stepCurve(x.g, x.r.level, x.r.max, (L) => x.r.cost[L], balance))
  const { k, left } = lambdaSpend(curves, balance)
  const buys = st.flatMap((x, i) => k[i] ? [{ i: x.r.i, name: x.r.name, from: x.r.level, to: x.r.level + k[i]!, spent: curves[i]!.slice(0, k[i]).reduce((a, s) => a + s.c, 0), gain: k[i]! * x.g, output: x.output }] : [])
  return { buys: buys.sort((a, b) => b.spent - a.spent), left }
}
