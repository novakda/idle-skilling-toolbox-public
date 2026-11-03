// What each potion gives at level L, from the game's own code (Qno2x.js). Index = potion id (PotionLV[id - 1]).
// Potions in the Pbonus block (SceneEvents_38 runPeriodically @25947870-@26010353) use that block's formula (`k` = the
// Pbonus key; `m` = the block multiplies the key by S = 1 + 2%·Blasphemy (PotionLV[94]) + VendingBonus(5)/100).
// The rest use the potion tooltip's own formula (description draw code @25250406-@25947870, one branch per potion).
// `t` is the text with {} for the value. Checked for all 169 against the game code in potion-formulas.test.ts.
const C = (l: number) => l / (l + 175) // the curve most potions from #122 on use
const own = (l: number) => Math.floor((499 + l) / 500) // ⌈L/500⌉: some potions' base doubles from level 502
const LN10 = Math.LN10

export type PotionFormula = { v: (L: number) => number; t: string; m?: 1; k?: string; x?: 1 }
const f = (v: PotionFormula['v'], t: string, k?: string, m?: 1, x?: 1): PotionFormula => ({ v, t, k, m, x })

/** x: the key is a product (cost multiplier or ×factor): its members don't add. */
export const POTION_FORMULAS: Record<number, PotionFormula> = {
  1: f((l) => l, '+{}% damage per 10 ATT levels', 'PbonusTotalDmg1', 1),
  2: f((l) => 12 * l, '+{}% EXP for gym skillers', 'PbonusGymExp', 1),
  3: f((l) => 2 * l, '+{}% cash from enemies', 'PbonusCash1', 1),
  4: f((l) => 3 * l, '+{}% crop gains', 'PbonusCrops', 1),
  5: f((l) => 4 * l, '+{}% plant growth speed', 'PbonusFlowerSpeed', 1),
  6: f((l) => 4 * l, '+{}% ore gains', 'PbonusOresGiven', 1),
  7: f((l) => 400 * l, '+{} base damage', 'PbonusBaseDmg', 1),
  8: f((l) => Math.min(0.25 * l, 90), '-{}% smithing cost', 'PbonusSmithTotalCostRedux', undefined, 1),
  9: f((l) => l, '+{}% damage per 10 STR levels', 'PbonusTotalDmg1', 1),
  10: f((l) => 15 * l, '+{}% EXP for dojo skillers', 'PbonusDojoExp', 1),
  11: f((l) => Math.min(0.5 * l, 90), '-{}% potion brewing cost', 'PbonusPotionCostRedux', undefined, 1),
  12: f((l) => 5 * l, '+{}% plant gains', 'PbonusFlowersGiven', 1),
  13: f((l) => 5 * l, '+{}% idle damage', 'PbonusIdleDmg', 1),
  14: f((l) => 5 * l, '+{}% mining exp', 'PbonusMiningExp', 1),
  15: f((l) => 5 * l, '+{}% botany exp', 'PbonusOvergrowth', 1),
  16: f((l) => 0.1075 * LN10 * l, '+{}% monster cash per power of 10 AP owned', 'PbonusCash1', 1),
  17: f((l) => 3 * l, '+{} base damage per Imbued Scimitar owned'),
  18: f((l) => 10 * l, '+{}% chance to discover new plant', 'PbonusExoticFlower', 1),
  19: f((l) => l, '+{}% damage per 10 SMT levels', 'PbonusTotalDmg1', 1),
  20: f((l) => 15 * l, '+{}% EXP for mountain skillers', 'PbonusMountainExp', 1),
  21: f((l) => 10 * l, '+{}% plant growth speed', 'PbonusFlowerSpeed', 1),
  22: f((l) => 5 * l, '+{}% idle speed', 'PbonusIdleSpeed', 1),
  23: f((l) => 10 * l, '+{}% tilling exp', 'PbonusTillingExp', 1),
  24: f((l) => 2 * l, '+{}% crit damage', 'PbonusCritDmg', 1),
  25: f((l) => 5 * l, '+{}% brewing speed', 'PbonusPotionSpeed'),
  26: f((l) => 0.215 * LN10 * l, '+{}% monster cash per power of 10 gold ore owned', 'PbonusCash2', 1),
  27: f((l) => 10 * l, '+{}% ore gains', 'PbonusOresGiven', 1),
  28: f((l) => 15 * l, '+{} base damage per Crystalline Ripper owned'),
  29: f((l) => Math.min(0.5 * l, 95), '-{}% smithing cost', 'PbonusSmithTotalCostRedux', undefined, 1),
  30: f((l) => 2 * Math.min(l, 100), '+{}% double brew chance'),
  31: f((l) => l, '+{}% damage per 10 END levels', 'PbonusTotalDmg1', 1),
  32: f((l) => 15 * l, '+{}% EXP for field skillers', 'PbonusFieldExp', 1),
  33: f((l) => Math.floor(l / 3 + 1) * own(l), '+{} plant pot speed upgrade cap', 'PbonusMaxFlowerSpeedUpgrades', 1),
  34: f((l) => 12 * l, '+{}% crop gains', 'PbonusCrops', 1),
  35: f((l) => 1500 * l, '+{} base damage', 'PbonusBaseDmg', 1),
  36: f((l) => 4 * l, '+{}% crusade exp', 'PbonusCrusadeExp'),
  37: f((l) => 15 * l, '+{}% plant gains', 'PbonusFlowersGiven', 1),
  38: f((l) => 10 * l, '+{}% cash from enemies', 'PbonusCash1', 1),
  39: f((l) => 8 * l, '+{}% rift exp', 'PbonusRiftExp', 1),
  40: f((l) => 12 * l, '+{}% total damage', 'PbonusTotalDmg2', 1),
  41: f((l) => 30 * l, '+{}% botany exp', 'PbonusOvergrowth', 1),
  42: f((l) => 15 * l, '+{}% mining exp', 'PbonusMiningExp', 1),
  43: f((l) => Math.min(Math.floor(25 * l) / 1e3, 2.5), '-{}% per-craft smithing cost increase', 'PbonusSmithingScalingRedux', 1),
  44: f((l) => l, '+{}% damage per 10 H2O levels', 'PbonusTotalDmg1', 1),
  45: f((l) => 15 * l, '+{}% H2O from gym skillers', 'PbonusGymH20', 1),
  46: f((l) => 5 * own(l) + 0.5 * l, '+{}% cash kept on ascending', 'PbonusStartingCash', 1),
  47: f((l) => 40 * l, '+{}% plant growth speed', 'PbonusFlowerSpeed', 1),
  48: f((l) => 8 * l, '+{}% crit damage', 'PbonusCritDmg', 1),
  49: f((l) => 15 * l, '+{}% idle speed', 'PbonusIdleSpeed', 1),
  50: f((l) => 40 * l, '+{}% chance to discover new plant', 'PbonusExoticFlower', 1),
  51: f((l) => 25 * l, '+{}% ore gains', 'PbonusOresGiven', 1),
  52: f((l) => 20 * l, '+{}% cash from enemies', 'PbonusCash2', 1),
  53: f((l) => 0.45 * l, '+{}% tilling exp per tilling level', 'PbonusTillingExp', 1),
  54: f((l) => 50 * l, '+{}% plant gains', 'PbonusFlowersGiven', 1),
  55: f((l) => 60 * l, '+{} base damage per Big Ol Sword owned'),
  56: f((l) => Math.min(l, 98), '-{}% smithing cost', 'PbonusSmithTotalCostRedux', undefined, 1),
  57: f((l) => 2 * l, '+{}% damage per 10 SPI levels', 'PbonusTotalDmg1', 1),
  58: f((l) => 10 * l, '+{}% AP', 'PbonusBonusAP', 1),
  59: f((l) => Math.floor(l / 2 + 1) * own(l), '+{} plant pot speed upgrade cap', 'PbonusMaxFlowerSpeedUpgrades', 1),
  60: f((l) => 50 * l, '+{}% crop gains', 'PbonusCrops', 1),
  61: f((l) => 10 * l, '+{}% idle damage', 'PbonusIdleDmg', 1),
  62: f((l) => 100 * l, '+{}% botany exp', 'PbonusOvergrowth', 1),
  63: f((l) => 4000 * l, '+{} base damage', 'PbonusBaseDmg', 1),
  64: f((l) => Math.min(2 * l, 95), '-{}% potion brewing cost', 'PbonusPotionCostRedux', undefined, 1),
  65: f((l) => 0.2 * l, '+{}% cash per trinket level (all trinkets)', 'PbonusCash2', 1),
  66: f((l) => 40 * l, '+{}% total damage', 'PbonusTotalDmg2', 1),
  67: f((l) => 30 * l, '+{}% HP', 'PbonusMaxHP', 1),
  68: f((l) => 2 * l, '+{} base damage per 100 base HP', 'PbonusBaseDmg', 1),
  69: f((l) => Math.min(Math.floor(30 * l) / 1e3, 2.5), '-{}% per-craft smithing cost increase', 'PbonusSmithingScalingRedux', 1),
  70: f((l) => 2 * l, '+{}% damage per 10 CON levels', 'PbonusTotalDmg1', 1),
  71: f((l) => 0.5 * l, '+{}% cash per Dubloon Trinket level', 'PbonusCash3', 1),
  72: f((l) => Math.min(2 * l, 200), '+{}% plant growth speed per Enigmatic Booster level', 'PbonusFlowerSpeed', 1),
  73: f((l) => 20 * l, '+{}% crit damage', 'PbonusCritDmg', 1),
  74: f((l) => 10 * l, '+{}% skiller exp per 100 cash upgrades bought', 'PbonusMaxCrusader'),
  75: f((l) => 0.5 * l, '+{}% crops per tilling level', 'PbonusCrops', 1),
  76: f((l) => l, '+{}% total damage per +100% HP bonus', 'PbonusTotalDmg3', 1),
  77: f((l) => 0.86 * LN10 * l, '+{}% monster cash per power of 10 kills on current monster', 'PbonusCash3', 1),
  78: f((l) => 3 * l, '+{}% plant growth speed per botany level', 'PbonusFlowerSpeed', 1),
  79: f((l) => Math.floor(l + l / 5), '+{} spiriting luck upgrade cap', 'PbonusLimboLuck', 1),
  80: f((l) => 50 * l, '+{}% max shields', 'PbonusMaxShield', 1),
  81: f((l) => 4.3 * LN10 * l, '+{}% damage per power of 10 AP owned', 'PbonusTotalDmg3', 1),
  82: f((l) => Math.min(Math.floor(40 * l) / 1e3, 3), '-{}% per-craft smithing cost increase', 'PbonusSmithingScalingRedux', 1),
  83: f((l) => 0.02 * l, '+{}% damage per total potion level', 'PbonusTotalDmg4', 1),
  84: f((l) => 50 * l, '+{} Galaxial Slasher base damage per Broken Dagger crafted'),
  85: f((l) => 6.45 * LN10 * l, '+{}% damage per power of 10 total kills', 'PbonusTotalDmg4', 1),
  86: f((l) => Math.min(Math.floor(80 * l) / 1e3, 4.7), '-{}% per-craft smithing cost increase', 'PbonusSmithingScalingRedux', 1),
  87: f((l) => 5 * l, '+{}% cash per Hourglass smithing item level', 'PbonusCash4'),
  88: f((l) => 10 * l, '+{}% damage per unspent diamond merit', 'PbonusTotalDmg5', 1),
  89: f((l) => 3.44 * LN10 * l, '+{}% damage per power of 10 raid awards', 'PbonusTotalDmg5', 1),
  90: f((l) => 200 * l / (l + 200), '+{}% chance for a tunnels card'),
  91: f((l) => Math.min(0.1 * l, 98), '-{}% smithing cost per Blacksmith Pill (up to 25)', 'PbonusSmithTotalCostRedux', undefined, 1),
  93: f((l) => 5 * l, '+{}% damage per level-5 card', 'PbonusTotalDmg5', 1),
  94: f((l) => Math.min(1.5 * l ** 0.85, 350), '+{}% card bonus (×1-2 by Lab tank 42 level)'),
  95: f((l) => 2 * l, '+{}% potion bonus (most potions)'),
  98: f((l) => 70 * l / (50 + l), '{}% chance a STR level-up keeps its EXP req'),
  99: f((l) => Math.floor(1.5 * l), '+{} max cauldron speed upgrade levels'),
  100: f((l) => 70 * l / (50 + l), '{}% chance an Apothecary level-up keeps its EXP req'),
  101: f((l) => 2 * l, '+{}% Trekking vessel gain'),
  102: f((l) => 70 * l / (50 + l), '{}% chance an H2O level-up keeps its EXP req'),
  103: f((l) => 3 * l, '+{}% RP gain for all tanks'),
  105: f((l) => 5 * l / (50 + l), '+{}% chain level chance'),
  122: f((l) => 800 * C(l), '+{}% new-flower chance after a failed discovery (highest plant)'),
  123: f((l) => 240 * C(l), '{}% chance a Fishing level-up raises all 3 power upgrades'),
  124: f((l) => 1 + 1.7 * C(l), '×{} tilling exp per new crop type', 'PbonusTillingExp', undefined, 1),
  125: f((l) => 50 * C(l), '+{}% spelunking exp per power of 10 gold skulls'),
  126: f((l) => 150 * C(l), '+{}% new-pet hatch chance per (Hatchery level^0.82 / 25)'),
  127: f((l) => 75 * C(l), '+{}% cash per 10 raid tickets collected', 'PbonusCash4', undefined, 1),
  128: f((l) => 250 * C(l), '+{}% damage per treasure with 1M+ owned', 'PbonusTotalDmg6', undefined, 1),
  129: f((l) => 1 + 2.5 * C(l), '×{} mastery perks a, c, f, n'),
  130: f((l) => 240 * C(l), '{}% chance a Mining level-up raises all six miners'),
  131: f((l) => 275 * C(l), '+{}% exp for all 3 pet skills'),
  132: f((l) => 1 + Math.min(2.5 * C(l), 2), '×{} eggshell chain value'),
  133: f((l) => 1 + 0.45 * C(l), '×{} cash, applied once per FarthestMonster^0.6', 'PbonusCashSUM', undefined, 1),
  134: f((l) => 250 * C(l), '+{}% spelunk learning rate'),
  135: f((l) => 75 * C(l), '+{}% damage per 10 asylum keys collected', 'PbonusTotalDmg6', undefined, 1),
  136: f((l) => 250 * C(l), '+{}% spelunker speed per 10 spelunking levels'),
  137: f((l) => Math.ceil(Math.min(30 + 100 * C(l), 100)), 'Pro Rift bonus upgrade cap {}'),
  138: f((l) => 240 * C(l), '{}% chance a Tilling level-up raises all six tillers'),
  139: f((l) => 1 + 2.5 * C(l), '×{} mastery perks b, g, h, i, j, D'),
  140: f((l) => 0.45 + 0.33 * C(l), 'dig-down after a tunnel end grows by (depth ratio / 2)^{}'),
  141: f((l) => 240 * C(l), '{}% chance a Botany level-up raises all pots'),
  142: f((l) => 1.021 + 0.045 * C(l), '×{} machine speed per Construction level'),
  143: f((l) => 65.625 * C(l), '+{}% pet damage per 25% team HP missing'),
  144: f((l) => Math.min(10 + 75 * C(l), 40), '+{}% Crackin Yolk eggshell chain chance'),
  145: f((l) => 2.5 - 1.52 * C(l), 'smithing cost rises at least {}% per craft'),
  146: f((l) => Math.min(70 * C(l), 40), '-{}% brewing crop cost per power of 10 Saharan Foals'),
  147: f((l) => Math.min(60 * C(l), 40), '{}% chance a rift level-up also levels the rift to its left'),
  148: f((l) => 110 * C(l), '+{}% spelunk treasure per 10 spelunking levels'),
  149: f((l) => 300 * C(l), '+{}% crusade materials per crusade level above 160', 'PbonusCrusMATS1', undefined, 1),
  150: f((l) => 100 * C(l), '+{}% extra levels when a spelunker absorbs'),
  151: f((l) => 9 + Math.min(6, Math.ceil(6.5 * C(l))), 'learn traits level up by {} per absorb'),
  152: f((l) => 240 * C(l), '{}% chance an Apothecary level-up raises all cauldrons'),
  153: f((l) => 200 * C(l), '+{}% tunnel card chance'),
  154: f((l) => Math.min(250 * C(l), 200), '{}% chance a nest upgrade levels twice'),
  155: f((l) => Math.min(80 * C(l), 60), '+{}% chance to hatch a 2-gene pet (3-gene: 50·L/(L+175), max 40)'),
  156: f((l) => Math.min(35 * C(l), 34), '-{}% tank level-up reqs per power of 10 green vessels'),
  157: f((l) => 40 * C(l), '+{}% ores and fish per 50 arcade balls launched', 'PbonusTotalDmg6', undefined, 1),
  158: f((l) => 1 + Math.min(3.5 * C(l), 3), '×{} damage, applied once per H2O level^0.34', 'PbonusTotalDmg6', undefined, 1),
  159: f((l) => Math.ceil(Math.min(45 * C(l), 35)), '+{} perk tree upgrade cap'),
  160: f((l) => 1 + Math.min(1.15 * C(l), 1), '×{} flower gain per certified fish'),
  161: f((l) => 1 + 0.85 * C(l), '×{} brew speed per certified flower'),
  162: f((l) => 1 + 1.9 * C(l), '×{} crop gain per certified ore'),
  163: f((l) => 1 + 0.49 * C(l), '×{} spelunk speed per certified crop'),
  164: f((l) => 1.05 + Math.min(0.13 * C(l), 0.112), '×{} Doom Gauntlet per final-crusade difficulty level'),
  165: f((l) => 1 + Math.min(1.2 * C(l), 1), '×{} ores'),
  166: f((l) => 1 + Math.min(1.25 * C(l), 1), 'ore, fish, botany, potion, crusade and limbo card bonuses ^{}'),
  167: f((l) => 1 + Math.min(1.25 * C(l), 1), 'cash, kills, tunnels and damage card bonuses ^{}'),
  168: f((l) => 1 + Math.min(1.25 * C(l), 1), 'Badonkadonk (#157) boost ^{}'),
}

/** The multiplier the Pbonus block applies to `m` potions: 1 + 2%·Blasphemy level + VendingBonus(5)/100. */
export const potionMultiplier = (blasphemyLv: number, vending5: number) => 1 + 0.02 * blasphemyLv + vending5 / 100

const fmt = (v: number) => String(+v.toPrecision(4))

/** "Total now" text for potion `id` at `level` (× `mult` where the game applies it), or '' without a formula. */
export function potionTotal(id: number, level: number, mult = 1): string {
  const p = POTION_FORMULAS[id]
  if (!p || !(level > 0)) return ''
  return p.t.replace('{}', fmt(p.v(level) * (p.m ? mult : 1)))
}

/** Potions that add into the same Pbonus key as `id` (itself included), or [] when it isn't in an additive key. */
export function potionGroup(id: number): number[] {
  const p = POTION_FORMULAS[id]
  if (!p?.k || p.x) return []
  return Object.keys(POTION_FORMULAS).map(Number).filter((j) => POTION_FORMULAS[j]!.k === p.k && !POTION_FORMULAS[j]!.x)
}

/** Sum of the group's totals when every member says the same thing (same template), else ''. */
export function potionGroupTotal(members: [number, number][], mult = 1): string {
  let t: string | null = null, sum = 0
  for (const [id, level] of members) {
    const p = POTION_FORMULAS[id]
    if (!p || p.x) return ''
    if (!(level > 0)) continue
    if (t != null && p.t !== t) return ''
    t = p.t; sum += p.v(level) * (p.m ? mult : 1)
  }
  return t == null ? '' : t.replace('{}', fmt(sum))
}
