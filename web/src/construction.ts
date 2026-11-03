// Construction (#31): the Spelunking world's building screen (scene spelzConstruction23 = SceneEvents_50, CurrentlyViewedScreen
// 23). Construction is a skill (ConstructionLV/EXP/REQ, a level-up gives a skill point) whose builders build upgrades in four
// domains; machines turn treasure into cheaper treasure. Every formula is ported from Qno2x.js (offsets †) and checked in
// construction.test.ts against stored values or the game's own code in the sandbox; everything is computed from the save.
// Per-level start costs and build points come from src/derive-construction.ts (the game's cost listeners, run per level).
import data from './data/construction.json'
import { cropName } from './tilling'
import { materialName } from './crusade'
import { FOIL, FOIL_BOSSES } from './cards-calc'
import { GENES } from './pets'
import { thirdLineNeed } from './tinkering'
import { potionName, smithName } from './names'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const D = data as unknown as { name: Record<string, string>; max: Record<string, number>; cost: Record<string, number[][]>; treasure: string[]; ore: string[]; flower: string[]; wiki: Record<string, string> }
export const lv = (s: Save, i: number) => n(arr(s, 'ConstructLV')[i])

/** Buildings by ConstructLV index; 1, 13, 25, 37 are the domains' own unlock flags. */
export const IDS = Object.keys(D.name).map(Number)
export const name = (i: number) => D.name[i] ?? `building ${i}`
export const maxLv = (i: number) => D.max[i] ?? 100
/** The wiki's effect text (not checked against the game). */
export const wikiEffect = (i: number) => D.wiki[i] ?? ''
/** Domains: flag index, buildings, and the treasure the Sentinel asks for. Clicking the Sentinel sets the flag when
 *  TreasureOwned[t] > more (regions 13, 14, 15, 16 † @30773438-@30698414); treasure is not taken. The yellow one also
 *  gives builder 1. */
export const DOMAINS = [
  { name: 'Yellow', flag: 1, ids: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], treasure: 1, more: 5 },
  { name: 'Blue', flag: 13, ids: [14, 15, 16, 17, 18, 19, 20, 21, 22], treasure: 8, more: 2 },
  { name: 'Green', flag: 25, ids: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35], treasure: 15, more: 7 },
  { name: 'Red', flag: 37, ids: [38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48], treasure: 22, more: 4 },
]
export const domainOf = (i: number) => DOMAINS.find((d) => d.ids.includes(i))!
/** A building can be picked once this one is level ≥ 1 (building click, † @30728893): 8 needs 5, 4/16/28/33/40 need i − 2,
 *  the rest i − 1 (the first of a domain: its flag). */
export const prereq = (i: number) => (i === 8 ? 5 : [4, 16, 28, 33, 40].includes(i) ? i - 2 : i - 1)
export const open = (s: Save, i: number) => lv(s, prereq(i)) >= 1

// ---- Costs -----------------------------------------------------------------------------------------------------------------
/** Currencies a start cost can be paid in (_ItemsOWNED, mouse-release listener † @30538002, payment † @30636456). */
const ORES = [1, 3, 5, 7, 10, 12, 14, 15, 17, 19], FISH = [10, 21, 16, 26, 28], CROPS = [3, 9, 13, 15, 18, 23, 25, 28, 33, 36, 40]
const MATS = [10, 6, 11, 24, 20, 25, 36, 55, 83, 82], PLANTS = [6, 9, 10, 15, 23, 29, 32, 39, 42, 43, 48], VESSELS = [1, 3, 5, 6, 7, 8, 9]
/** Foil Bosses sets by level: the cost counts these cards at level ≥ 5 († @30551238). */
export { FOIL_BOSSES }
const setOf = (i: number, L: number) => (i === 8 ? FOIL[L] : FOIL_BOSSES[L])
export type Currency = { name: string; held: number; icon?: { kind: 'crop' | 'flower' | 'material'; id: number }; check?: boolean }
/** One currency of a start cost for building i at level L. `check`: a requirement the start checks but doesn't take. */
export function currency(s: Save, c: number, i: number, L: number): Currency {
  const at = (k: string, j: number) => n(arr(s, k)[j])
  if (c >= 1 && c <= 28) return { name: D.treasure[c]!, held: at('TreasureOwned', c) }
  if (c === 35 || c === 36) return { name: c === 35 ? 'White souls' : 'Pink souls', held: at('SoulsTotal', c - 28) }
  if (c >= 37 && c <= 46) return { name: D.ore[ORES[c - 37]!]!, held: at('OresOwned', ORES[c - 37]!) }
  if (c >= 47 && c <= 51) return { name: `Fish ${FISH[c - 47]} (name not decoded)`, held: at('FishOwned', FISH[c - 47]!) }
  if (c === 52 || c === 53) return { name: c === 52 ? 'AP' : 'BP', held: n(s[c === 52 ? 'APtoSpend' : 'BPtoSpend']) }
  if (c >= 54 && c <= 64) return { name: cropName(CROPS[c - 54]!), held: at('SeedsOwned', CROPS[c - 54]!), icon: { kind: 'crop', id: CROPS[c - 54]! } }
  if (c === 65 || c === 96 || c === 101) { const t = c === 65 ? 4 : c === 96 ? 7 : 8; return { name: `Asylum traces ${t}`, held: at('AsylumTracesOwned', t) } }
  if (c === 66) { const [a, b] = setOf(i, L) ?? [1, 0]; let k = 0; for (let id = a; id <= b; id++) if (at('CardLevels', id) >= 5) k++
    return { name: `cards ${a}-${b} at 5 stars (the set is turned in)`, held: k } }
  if (c === 67) return { name: 'Skill points', held: n(s.Skillpoints) }
  if (c >= 68 && c <= 77) return { name: materialName(MATS[c - 68]!), held: at('CraftingMaterialsOwned', MATS[c - 68]!), icon: { kind: 'material', id: MATS[c - 68]! } }
  if (c >= 78 && c <= 88) return { name: D.flower[PLANTS[c - 78]!]!, held: at('flowersOwned', PLANTS[c - 78]!), icon: { kind: 'flower', id: PLANTS[c - 78]! } }
  if (c >= 89 && c <= 95) return { name: `Vessel ${VESSELS[c - 89]}`, held: at('PetCurrenciesOwned', VESSELS[c - 89]!) }
  if (c === 97) { const j = i === 20 ? 76 : i === 31 ? 3 : -1; return { name: j < 0 ? 'smithing item level' : `${smithName(j)} level`, held: j < 0 ? 0 : at('SmithingItemLevel', j), check: true } }
  if (c === 98) {
    const P = (j: number) => at('PotionLV', j)
    if (i === 35) { let t = 0; for (let j = 0; j < 105; j++) t += P(j); for (let j = 121; j < 166; j++) t += P(j); return { name: 'total potion levels', held: t, check: true } }
    const j = ({ 17: 64, 26: 94, 32: 27, 40: 145 } as Record<number, number>)[i]
    return { name: j == null ? 'potion level' : `${potionName(j)} level`, held: j == null ? 0 : P(j), check: true }
  }
  if (c === 99) { let b = 0; for (let j = 1; j <= 60; j++) b = Math.max(b, at('EquipmentBonusPct', j)); return { name: 'best tinker booster bonus %', held: b, check: true } }
  if (c === 100) return { name: 'Gems', held: n(s.sparklecoin) }
  return { name: `currency ${c} (not decoded)`, held: 0 }
}
/** Cost to start level L + 1: two currencies (amounts under 1000 are floored when paid and shown, † @30634899) and the build
 *  points the builders must add before the level completes. */
export function cost(s: Save, i: number, L = lv(s, i)) {
  const row = D.cost[i]?.[L]
  if (!row) return null
  const [c1, q1, c2, q2, req] = row as [number, number, number, number, number]
  const part = (c: number, q: number) => (c ? { c, q: q < 1e3 ? Math.floor(q) : q, ...currency(s, c, i, L) } : null)
  const parts = [part(c1, q1), part(c2, q2)].filter((x) => x != null)
  return { parts, req, enough: parts.every((p) => p.held >= p.q) }
}

// ---- Builders, machines, EXP ---------------------------------------------------------------------------------------------
/** Builder k (1-10) exists once ConstructLV[50 + k] ≥ 1 (Builder Bros adds one per level, † @30665919). */
export const builders = (s: Save) => Array.from({ length: 10 }, (_, j) => j + 1).filter((k) => lv(s, 50 + k) >= 1)
/** Build points per hour of builder k (_customBlock_BuilderSpeedHR, † @2688326): iodized (bought) builders ×(3 + smithing 91
 *  term) and the learning perks; ×(1 + Iron Throne/50)·1.32^builder level·(1 + CbonusTunnels[3]/100)
 *  ·(1 + ConstructionLV·min(m, 3)^1.465/50)·(1 + Attack Speed Pro rift term). CbonusTunnels is read as stored. */
export function builderSpeed(s: Save, k: number) {
  const mtx = n(s.MTXbuildersPurchased), s91 = n(arr(s, 'SmithingItemLevel')[91])
  let m = 1
  if (mtx >= k) m *= 3 + ((200 * s91) / (s91 + 3e3)) * 1.15 ** Math.min(s91 / 1e3, 14) / 100
  for (let i = 0; i < 7; i++) if (mtx > i) { const L = n(arr(s, 'SpelunkerLearnLVs')[14 + 14 * i]); m *= 1 + Math.min((50 * L) / (L + 85) / 100, 0.5) }
  const r6 = n(arr(s, 'RiftLVL')[6]), p6 = n(arr(s, 'RiftProLvs')[6])
  return 60 * (1 + lv(s, 15) / 50) * m * 1.32 ** lv(s, 50 + k) * (1 + n(arr(s, 'CbonusTunnels')[3]) / 100)
    * (1 + (n(s.ConstructionLV) * Math.min(m, 3) ** 1.465) / 50) * (1 + ((200 * r6) / (r6 + 200)) * ((2 * p6) / (p6 + 100)) / 100)
}
/** What each builder works on: ConstructTasks[k] (0 = idle). Progress is added every 100 ms at speed/36000, capped at the
 *  build points († @30699566); a level completes when you click it. */
export const task = (s: Save, k: number) => n(arr(s, 'ConstructTasks')[k])
export const started = (s: Save, i: number) => n(arr(s, 'ConstructTasks')[i + 30]) === 1
/** Machine m (1-8) exists once ConstructLV[60 + m] ≥ 1 (Machinery adds one per level, † @30666775). It turns treasure
 *  ConstructTasks[10 + m] into ConstructTasks[18 + m] at speed/hour, taking speed/3^(in − out) input; with Pink Printer
 *  and both set to 1, white souls into pink at 1.2M/max(ConstructLV[7], 1) white each († @30725586: the code reads
 *  Hyper Bricks, index 7, not Pink Printer). Speed (_customBlock_MachineSpeedHR, † @2692003), M = machine level. */
export function machineSpeed(s: Save, m: number) {
  const M = lv(s, 60 + m), p = n(arr(s, 'PotionLV')[141]), r6 = n(arr(s, 'RiftLVL')[6]), p6 = n(arr(s, 'RiftProLvs')[6])
  return (360 + 40 * 1.7 ** M) * (1 + M) * (1 + m / 6) * 1.7 ** M * (1 + n(arr(s, 'CbonusTunnels')[0]) / 100)
    * (0.021 + (0.045 * p) / (p + 175) + 1) ** n(s.ConstructionLV) * 1.58 ** lv(s, 18) * (1 + ((75 * r6) / (r6 + 200)) * ((2 * p6) / (p6 + 100)) / 100)
}
export function machines(s: Save) {
  return Array.from({ length: 8 }, (_, j) => j + 1).filter((m) => lv(s, 60 + m) >= 1).map((m) => {
    const a = task(s, 10 + m), b = task(s, 18 + m), souls = a === 1 && b === 1 && lv(s, 9) >= 1, speed = machineSpeed(s, m)
    const inName = souls ? 'White souls' : a >= 1 ? D.treasure[a]! : '', outName = souls ? 'Pink souls' : b >= 1 ? D.treasure[b]! : ''
    const per = souls ? 12e5 / Math.max(lv(s, 7), 1) : 1 / 3 ** (a - b), held = souls ? n(arr(s, 'SoulsTotal')[7]) : n(arr(s, 'TreasureOwned')[a])
    return { m, level: lv(s, 60 + m), speed, inName, outName, per, held, running: a >= 1 && b >= 1 && held > 0 }
  })
}
const xp = (k: number, g: number, L: number) => k * L * g ** Math.floor(L / 5)
/** Construction EXP per hour (1 s tick, † @30535317; away the same rate × away time, † @30515134): 10·L3·1.17^⌊L3/5⌋ +
 *  25·L15·1.26^⌊L15/5⌋ + 100·L27·1.34^⌊L27/5⌋ + 500·L39·1.4^⌊L39/5⌋ (Sitty Chair, Iron Throne, Ni Ni Shrubbery,
 *  Chandelier), × (1 + CbonusTunnels[8]/100). */
export const expPerHour = (s: Save) => (xp(10, 1.17, lv(s, 3)) + xp(25, 1.26, lv(s, 15)) + xp(100, 1.34, lv(s, 27)) + xp(500, 1.4, lv(s, 39)))
  * (1 + n(arr(s, 'CbonusTunnels')[8]) / 100)
/** ConstructionREQ after a level-up to L: 1.18·REQ + 2·L^1.9 (draw listener, † @30534364). */
export const nextReq = (req: number, L: number) => 1.18 * req + 2 * L ** 1.9

// ---- Effects -------------------------------------------------------------------------------------------------------------
type Fx = { at: string; now: (s: Save, L: number) => string; page?: string; feeds?: string; unlock?: (L: number) => string | null }
const pct = (x: number) => `+${+(100 * (x - 1)).toPrecision(4)}%`
const kilo = (s: Save, L: number) => 1 + (100 * L ** 1.10128 * 1.02 ** L * Math.max(n(s.waterLV) - 1e3, 0)) / 100
const luck = (s: Save) => { let t = 0; for (let i = 1; i <= 8; i++) t += n(arr(s, 'CultLuckLV')[i]) + n(arr(s, 'AcolyteLV3')[i]); return t }
const thirds = (first: number, L: number) => Array.from({ length: 30 }, (_, j) => first + j).filter((id) => thirdLineNeed({ ConstructLV: [] }, id).lv <= L).length
/** Gattaca gene k at level ≥ order (PetGenes, pets.ts: gene i = ⌊(L41 + K)/100⌋). */
const GATTACA = [12, 13, 15, 17, 22, 25, 26]
/** Plant picker (Tilling/Botany): plant type id t shows while t < 5·(Dirts Ahoy + Croppy Notes) + 21 († @3175632); flower type
 *  while t < 6·(Bucketeers + Plant Em All) + 24 († @3441480). `other` is the pair building. */
const cropsOpen = (s: Save, i: number, L: number) => 21 + 5 * (L + lv(s, i === 14 ? 29 : 14))
const flowersOpen = (s: Save, i: number, L: number) => 24 + 6 * (L + lv(s, i === 16 ? 30 : 16))
const BREW = [17, 26, 32, 40]
/** New-potion roll (cauldron, † @3795400): the potion id is capped at min(121 + 3·(Brew Laddy + Brew Man + Brew Maestro + Brew Bobby levels), 169). */
const potionCap = (s: Save, i: number, L: number) => Math.min(121 + 3 * (L + BREW.filter((j) => j !== i).reduce((t, j) => t + lv(s, j), 0)), 169)
/** Hyper Bricks: rift group g (rifts 3g+1..3g+3) gets ×1.5^max(⌈(L − g)/3⌉, 0) (GlyphsGivenBonusPercent, rift.ts). */
const brick = (L: number, g: number) => +(1.5 ** Math.max(Math.ceil((L - g) / 3), 0)).toPrecision(4)
/** Effects decoded from the game (offset in `at`); buildings missing here show the wiki's effect text, marked as such. */
export const EFFECTS: Record<number, Fx> = {
  2: { at: '† @30665919', now: (_, L) => `${1 + L} builders`, unlock: (L) => (L < 9 ? '+1 builder' : null) },
  3: { at: '† @2651436, @30535317', now: (_, L) => `Spelunker speed ${pct(1 + L / 50)}; ${+xp(10, 1.17, L).toFixed(1)} Construction EXP/h` },
  4: { at: '† @30258795', page: 'mining', feeds: 'ores mined (Mining)', now: (s, L) => `ores ×${+(((1 + L / 10) ** 0.31) ** Math.floor(n(s.miningLVL) / 35)).toPrecision(4)} (×${+((1 + L / 10) ** 0.31).toFixed(3)} per 35 Mining levels)` },
  5: { at: '† @30666775', now: (_, L) => `${L} machines`, unlock: (L) => (L < 8 ? '+1 machine' : null) },
  6: { at: '† @2638578', page: 'raids', feeds: 'fight damage (combat.ts)', now: (s, L) => `fight damage ${pct(1 + (10 * L * luck(s)) / 100)} (${luck(s)} luck levels of spiriting skillers)` },
  7: { at: '† @21496635', page: 'rift', feeds: 'rift EXP (Rift)', now: (_, L) => `rift EXP: rifts 1-3 ×${brick(L, 0)}, 4-6 ×${brick(L, 1)}, 7-9 ×${brick(L, 2)}` },
  8: { at: 'cards-calc.ts FOIL', page: 'cards', feeds: 'card max level (Cards)', now: (_, L) => `${L} of 10 card sets go to level 6`, unlock: () => 'a card set to level 6' },
  9: { at: '† @30725586', page: 'rift', feeds: 'pink souls for Pro rifts', now: (s, L) => (L ? `machines can print pink souls (${Math.round(12e5 / Math.max(lv(s, 7), 1)).toLocaleString()} white each); levels 2-5: effect not decoded` : 'no soul printing'), unlock: (L) => (L === 0 ? 'pink-soul printing in machines' : null) },
  10: { at: 'rift.ts pro(), † @21522002', page: 'rift', feeds: 'Pro rift slots (Rift)', now: (s, L) => `${L + lv(s, 22)} Pro rifts open (with Rift God)`, unlock: () => '+1 Pro rift' },
  11: { at: '† @23919912', page: 'crusade', feeds: 'Crusades 14-15', now: (_, L) => (L ? 'Crusades 14 and 15 (at Conquest level 120)' : 'closed'), unlock: () => 'Crusades 14 and 15' },
  15: { at: '† @2690128, @30535317', now: (_, L) => `builder speed ${pct(1 + L / 50)}; ${+xp(25, 1.26, L).toFixed(1)} Construction EXP/h` },
  17: { at: '† @3795613, @3795844, @3796070, @3795400', page: 'potions', feeds: 'new potions (Potions)', now: (s, L) => `new-potion roll reaches potion id ${potionCap(s, 17, L)} (121 + 3 per level of the four Brew buildings, max 169)`, unlock: (L) => (L < 4 ? '+3 new potions' : null) },
  18: { at: '† @2693451', now: (_, L) => `machine speed ×${+(1.58 ** L).toPrecision(4)}` },
  19: { at: 'tinkering.ts thirdLineNeed', page: 'tinker', feeds: 'tinker third lines (Tinkering)', now: (_, L) => `third line open on ${thirds(1, L)} of 30 weapon/helmet/shirt gear`, unlock: (L) => (thirds(1, L + 1) > thirds(1, L) ? `${thirds(1, L + 1) - thirds(1, L)} more third lines` : null) },
  21: { at: 'cards-calc.ts FOIL_BOSSES', page: 'cards', feeds: 'boss card max level (Cards)', now: (_, L) => `${L} of 8 boss card sets go to level 6`, unlock: () => 'a boss card set to level 6' },
  22: { at: 'rift.ts pro(), † @21522002', page: 'rift', feeds: 'Pro rift slots (Rift)', now: (s, L) => `${L + lv(s, 10)} Pro rifts open (with Rift Pro)`, unlock: () => '+1 Pro rift' },
  14: { at: '† @3175397, @3175632', page: 'tilling', feeds: 'crop types (Tilling)', now: (s, L) => `${cropsOpen(s, 14, L)} crop types open (21 + 5 per level of this and Croppy Notes)`, unlock: (L) => (L < 2 ? '+5 crop types' : null) },
  16: { at: '† @3441235, @3441480', page: 'botany', feeds: 'flower types (Botany)', now: (s, L) => `${flowersOpen(s, 16, L)} flower types open (24 + 6 per level of this and Plant Em All)`, unlock: (L) => (L < 2 ? '+6 flower types' : null) },
  20: { at: '† @8867294, @8870950', feeds: 'Smithing page 11', now: (_, L) => `${2 * L} items open on Smithing page 11`, unlock: (L) => (L < 4 ? '+2 smithing items' : null) },
  26: { at: '† @3795613, @3795844, @3796070, @3795400', page: 'potions', feeds: 'new potions (Potions)', now: (s, L) => `new-potion roll reaches potion id ${potionCap(s, 26, L)} (121 + 3 per level of the four Brew buildings, max 169)`, unlock: (L) => (L < 4 ? '+3 new potions' : null) },
  27: { at: '† @2653820, @30535317', now: (_, L) => `Spelunker learning speed ×${+(1 + L / 135).toPrecision(4)}; ${+xp(100, 1.34, L).toFixed(1)} Construction EXP/h` },
  28: { at: '† @2657880, @2659847', now: (_, L) => `bag max items +${L}, min items +${+(L / 1.35).toFixed(2)} (before rounding)` },
  29: { at: '† @3175397, @3175632', page: 'tilling', feeds: 'crop types (Tilling)', now: (s, L) => `${cropsOpen(s, 29, L)} crop types open (21 + 5 per level of this and Dirts Ahoy)`, unlock: (L) => (L < 2 ? '+5 crop types' : null) },
  30: { at: '† @3441235, @3441480', page: 'botany', feeds: 'flower types (Botany)', now: (s, L) => `${flowersOpen(s, 30, L)} flower types open (24 + 6 per level of this and Bucketeers)`, unlock: (L) => (L < 2 ? '+6 flower types' : null) },
  31: { at: '† @8870950, @8871352', feeds: 'Smithing page 12', now: (_, L) => `${2 * L} items open on Smithing page 12`, unlock: (L) => (L < 4 ? '+2 smithing items' : null) },
  35: { at: '† @25990883, @31641952', feeds: 'potion costs', now: (_, L) => `potion brewing cost ×${+(1 / 1.35 ** L).toPrecision(4)} (÷1.35 per level)` },
  38: { at: '† @24879706', feeds: 'brew speed (Potions)', now: (s, L) => `brew speed boost ×${+(((1 + L / 8) ** 0.3) ** (n(s.ApothecaryLV) / 20)).toPrecision(4)} ((1 + L/8)^0.3 per 20 Apothecary levels, Apothecary ${n(s.ApothecaryLV)})` },
  43: { at: '† @6405688', feeds: 'Afterlife minion coins', now: (_, L) => `minion cash ×${+Math.max(1, 1.15 ** L).toPrecision(4)} (1.15 per level)` },
  45: { at: '† @30852121', feeds: 'Afterlife away time', now: (_, L) => `${3 * L}% chance, each time the Afterlife day timer (RealmStuff[20]) runs out, of 1-3 hours of away time` },
  47: { at: '† @6422651 (ShrineResetQTY; its two callers are UI, the grant itself is not traced)', feeds: 'Afterlife spirals', now: (_, L) => `spirals on reset ×${+Math.max(1, 1 + (5 * L) / 100).toPrecision(4)} (+5% per level)` },
  48: { at: '† @6399150', feeds: 'Afterlife minion damage', now: (s, L) => `minion damage ×${+Math.min(1.1, 1 + L / 100).toPrecision(4)} per afterlife reached (cap 1.1; ${n(arr(s, 'RealmStuff')[23])} reached)` },
  32: { at: '† @3795613, @3795844, @3796070, @3795400', page: 'potions', feeds: 'new potions (Potions)', now: (s, L) => `new-potion roll reaches potion id ${potionCap(s, 32, L)} (121 + 3 per level of the four Brew buildings, max 169)`, unlock: (L) => (L < 4 ? '+3 new potions' : null) },
  33: { at: 'tinkering.ts boosterEV', page: 'tinker', feeds: 'booster rolls (Tinkering)', now: (_, L) => `${Math.min(3 * L, 100)}% chance a booster's bonus is ×(1 + Combat level/100)` },
  34: { at: 'tinkering.ts thirdLineNeed', page: 'tinker', feeds: 'tinker third lines (Tinkering)', now: (_, L) => `third line open on ${thirds(31, L)} of 30 pants/off-hand/pendant gear`, unlock: (L) => (thirds(31, L + 1) > thirds(31, L) ? `${thirds(31, L + 1) - thirds(31, L)} more third lines` : null) },
  39: { at: '† @30535317', now: (_, L) => `${+xp(500, 1.4, L).toFixed(1)} Construction EXP/h` },
  40: { at: '† @3795613, @3795844, @3796070, @3795400', page: 'potions', feeds: 'new potions (Potions)', now: (s, L) => `new-potion roll reaches potion id ${potionCap(s, 40, L)} (121 + 3 per level of the four Brew buildings, max 169)`, unlock: (L) => (L < 4 ? '+3 new potions' : null) },
  41: { at: 'pets.ts petGenes', page: 'pets', feeds: 'trek genes (Pets)', now: (_, L) => (L ? `+1 gene: ${GATTACA.slice(0, L).map((g) => GENES[g]).join(', ')}` : 'no genes'), unlock: (L) => (L < 7 ? `+1 ${GENES[GATTACA[L]!]} gene` : null) },
  42: { at: 'tinkering.ts slotsMax', page: 'tinker', feeds: 'booster slots (Tinkering)', now: (_, L) => `${5 + L} booster slots per tinker item`, unlock: () => '+1 booster slot' },
  44: { at: 'combat.ts', page: 'heavycash', feeds: 'cash and fight damage', now: (s, L) => `cash and damage ${pct(kilo(s, L))} (H2O ${n(s.waterLV)}; 0 below 1000)` },
  46: { at: 'tilling.ts, botany-calc.ts', page: 'tilling', feeds: 'crops and flowers (Tilling, Botany)', now: (s, L) => `crops and flowers ${pct(kilo(s, L))} (H2O ${n(s.waterLV)}; 0 below 1000)` },
}
/** Buildings this one opens at level 1 (their prerequisite). */
export const opens = (i: number) => IDS.filter((j) => prereq(j) === i)

/** What level L + 1 adds that you can't get otherwise: a building, a builder, a machine, a Pro rift, crusades, a card set,
 *  third lines, a slot, a gene, crop/flower types, smithing items, potions. null = a stat-only level. */
export function unlocks(i: number, L: number): string | null {
  const parts: string[] = []
  if (L === 0 && opens(i).length) parts.push(`opens ${opens(i).map(name).join(', ')}`)
  const u = EFFECTS[i]?.unlock?.(L)
  if (u) parts.push(u)
  return parts.length ? parts.join('; ') : null
}

/** Treasure a machine can make for a cost you can't pay yet: each missing treasure t is made from the nearest higher treasure
 *  you hold (1 of treasure u gives 3^(u − t) of t), keeping what the same cost also asks for. null when no machine or not
 *  enough treasure; [] when nothing is missing. */
export function viaMachines(s: Save, c: NonNullable<ReturnType<typeof cost>>) {
  const held = arr(s, 'TreasureOwned').map(n), keep = new Map(c.parts.filter((p) => p.c <= 28).map((p) => [p.c, Math.max(p.q, 0)]))
  const out: { from: number; to: number; take: number; give: number }[] = []
  for (const p of c.parts) {
    if (p.held >= p.q) continue
    if (p.c > 28 || !lv(s, 61)) return null
    let need = p.q - p.held
    for (let u = p.c + 1; u <= 28 && need > 0; u++) {
      const spare = Math.max((held[u] ?? 0) - (keep.get(u) ?? 0), 0), take = Math.min(spare, need / 3 ** (u - p.c))
      if (take <= 0) continue
      held[u]! -= take; need -= take * 3 ** (u - p.c)
      out.push({ from: u, to: p.c, take, give: take * 3 ** (u - p.c) })
    }
    if (need > 1e-9) return null
  }
  return out
}
export const treasureName = (t: number) => D.treasure[t] ?? `treasure ${t}`

export type Row = { i: number; L: number; max: number; open: boolean; started: boolean; progress: number; c: ReturnType<typeof cost>; unlock: string | null; hours: number }
/** Every building, with its next level's cost and hours at the given build speed. */
export function rows(s: Save, speed = builders(s).reduce((t, k) => t + builderSpeed(s, k), 0)): Row[] {
  return DOMAINS.flatMap((d) => d.ids).map((i) => {
    const L = lv(s, i), c = L < maxLv(i) ? cost(s, i, L) : null, progress = n(arr(s, 'ConstructBuildProgress')[i])
    return { i, L, max: maxLv(i), open: open(s, i) && lv(s, domainOf(i).flag) >= 1, started: started(s, i), progress, c, unlock: c ? unlocks(i, L) : null,
      hours: c ? Math.max(c.req - (started(s, i) ? progress : 0), 0) / Math.max(speed, 1e-9) : Infinity }
  })
}
/** What to build next. Objective (the wiki: "pay the cost and assign Builders to build an upgrade and unlock new ones"; the
 *  domain trees end in Voyage Pact → Crusades 14-15 and Rift Pro/God → Pro rifts, with new crops, flowers, potions, tinker
 *  lines and builders along the way): among buildings you can pick (prerequisite built, below cap, not started), first the
 *  ones whose next level unlocks something, then stat-only ones; within each, affordable now, then affordable after a machine
 *  turns spare higher treasure into the missing one, then not affordable; then fewest hours with every builder on it.
 *  Stat-only levels are not weighed against each other (their effects are different stats). */
export function plan(s: Save) {
  const all = rows(s), next = all.filter((r) => r.open && !r.started && r.c).map((r) => ({ ...r, via: r.c!.enough ? [] : viaMachines(s, r.c!) }))
  const rank = (r: (typeof next)[number]) => (r.unlock ? 0 : 3) + (r.c!.enough ? 0 : r.via ? 1 : 2)
  return { all, inProgress: all.filter((r) => r.started), next: next.sort((a, b) => rank(a) - rank(b) || a.hours - b.hours) }
}

/** Goals for the build-order plan: buildings nothing else needs (the ends of the domain trees: Voyage Pact → Crusades 14-15,
 *  Rift God, Bogo Offer, Fury, …) that are still level 0. */
export const goals = (s: Save) => DOMAINS.flatMap((d) => d.ids).filter((i) => !lv(s, i) && !IDS.some((j) => prereq(j) === i))
/** Build order to goal `g` (#52): every level-0 building on its prerequisite chain, root first, each built to level 1 (one level
 *  opens the next, † @30728893), with the domain's Sentinel first if the domain is locked. Per step: start cost with what you
 *  hold left after the steps before it (so two steps paying the same currency don't both count it), build points, hours with
 *  every builder on it (builders add up, † @30699566) and the running total. No goal given: the one with the fewest total build
 *  hours, open domains first. Optimises time to the goal; the order is forced by the tree, so the only choice is the goal.
 *  Hours are real time: the scene's 500 ms tick adds BuilderSpeedHR/3600 × AwayTimeRewarded, and there AwayTimeRewarded is
 *  LoadTime − QuitTime with no away % († @30518100, @30519291). The credit on entering the scene (@30501484) uses the
 *  AwayTimeRewarded set elsewhere: whether that carries an away % is unverified.
 *  ponytail: time is build time only; gathering a missing start cost (treasure, ores, cards, …) has no common rate to add. */
export function buildPlan(s: Save, g?: number) {
  const speed = builders(s).reduce((t, k) => t + builderSpeed(s, k), 0)
  const chain = (i: number) => { const c: number[] = []; for (let j = i; !DOMAINS.some((d) => d.flag === j) && !lv(s, j); j = prereq(j)) c.unshift(j); return c }
  const of = (i: number) => {
    const d = domainOf(i), spent = new Map<number, number>()
    let total = 0
    const steps = chain(i).map((j) => {
      const c = cost(s, j, 0)!
      const parts = c.parts.map((p) => {
        const used = p.check ? 0 : spent.get(p.c) ?? 0, held = Math.max(p.held - used, 0)
        if (!p.check) spent.set(p.c, used + p.q)
        return { ...p, held }
      })
      const hours = c.req / Math.max(speed, 1e-9)
      total += hours
      return { i: j, parts, req: c.req, hours, total, short: parts.some((p) => p.held < p.q), unlock: unlocks(j, 0) }
    })
    return { goal: i, domain: d, sentinel: lv(s, d.flag) < 1, steps, hours: total }
  }
  const all = goals(s).map(of).sort((a, b) => Number(a.sentinel) - Number(b.sentinel) || a.hours - b.hours)
  return { plan: g == null ? all[0] ?? null : all.find((p) => p.goal === g) ?? null, goals: all }
}
