// Gathering tab (#29): active vs away rates for Mining, Smithing and Fishing. Fishing reuses fishing.ts; Mining and
// Smithing are read from the game code (Qno2x.js offsets below) and use the stored inputs a full local save has.
import catalog from '../../data/card-catalog.json'
import { cbonus, type Catalog } from '../cards/cards-calc'
import { framesPerSec } from '../../anim'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const has = (s: Save, ...k: string[]) => k.every((x) => s[x] != null)

/** BonusMiningExpCUMUpercent (Mining scene init @30259969): Mining-linked deck's CbonusMiningExp × training perk 4 ×
 *  EbonusMiningEXP × PbonusMiningExp × smith item 69. The two bonus inputs are stored-only (cloud saves lack them): null then. */
export function miningExpBonus(s: Save) {
  if (!has(s, 'PbonusMiningExp')) return null
  const C = n(cbonus(s, catalog as unknown as Catalog, 6).CbonusMiningExp)
  return 100 * ((1 + C / 100) * (1 + 5 * n(arr(s, 'TrainingPerkLevels')[4]) / 100) * (1 + n(s.EbonusMiningEXP) / 100)
    * (1 + n(s.PbonusMiningExp) / 100) * (1 + 5 * n(arr(s, 'SmithingItemLevel')[69]) / 100) - 1)
}

/** Mining XP and ores per second, on screen vs per real away second.
 *  Active (miner actor ActorEvents_150 @6985374, scene timers @30322539): frames step like Tilling (60 fps cap), 9 frames
 *  per mine; every mine gives ores, XP lands on randomInt(1,1000) ≤ miningChance.
 *  Away (OfflineGains[5] @3943000-3948700; ores @30293116): Σ floor(anim/9·6000)/6000 per miner, NO armor speed term and no
 *  60 fps cap; away ores use anim/10 with armor and add the rift term to the ore bonus. */
export function mining(s: Save, awayPct: number) {
  const xpBonus = miningExpBonus(s)
  const rift = Math.floor(15 * Math.min(n(arr(s, 'RiftLVL')[5]), 1) + 5 * n(arr(s, 'RiftLVL')[5])) / 100
  const xpMult = xpBonus == null ? null : 1 + xpBonus / 100 + rift
  const ores = has(s, 'BonusOresCUMULATIVEpercent') ? n(s.BonusOresCUMULATIVEpercent) : null
  // miningChance = 100 + 10·CbonusMiningEXPChance, set in the same 50 ms callback (@30252154) with the Mining deck on.
  const chance = (100 + 10 * n(cbonus(s, catalog as unknown as Catalog, 6).CbonusMiningEXPChance)) / 1000, sl = (i: number) => n(arr(s, 'SkillLevels')[i])
  const oreSkill = (1 + sl(4) * n(s.miningLVL) / 100) * (1 + 0.2 * sl(30))
  const miners = [1, 2, 3, 4, 5, 6].filter((m) => n(arr(s, 'MinerLV')[m]) >= 1).map((m) => {
    const anim = n(arr(s, 'MinerAnimationSpeed')[m]), armor = n(arr(s, 'MinerArmor')[m])
    const xp = n(arr(s, 'MiningExpGiven')[m]) * n(arr(s, 'MiningGemEXP')[m])
    const ore = n(arr(s, 'OresGiven')[m]) * n(arr(s, 'MiningGemORES')[m]) * (0.25 * Math.round(armor / 10) + 1) * oreSkill
    const minesPerSec = framesPerSec(anim * (1 + armor / 40)) / 9
    // Active ores: one batch, a second when randomInt(1,1000) ≤ 100·SkillLevels[3], up to 4 more from MiningGemDOUBLE / SkillLevels[3] > 10.
    const X = 10 * n(arr(s, 'MiningGemDOUBLE')[m]) + 100 * Math.max(sl(3) - 10, 0)
    let batches = 1 + Math.min(100 * sl(3), 1000) / 1000
    for (let pe = 0; pe < 4; pe++) batches += Math.min(Math.max((X - 1000 * pe - 1) / 1000, 0), 1)
    return {
      m, minesPerSec,
      activeXp: xpMult == null ? null : minesPerSec * chance * xp * xpMult,
      awayXp: xpMult == null ? null : Math.floor(anim / 9 * 6e3) / 6e3 * xp * chance * xpMult * awayPct / 100,
      activeOres: ores == null ? null : minesPerSec * ore * batches * (1 + ores / 100),
      awayOres: ores == null ? null : Math.floor(anim / 10 * 6e3) / 6e3 * (1 + armor / 40) * n(arr(s, 'MiningGemSPEED')[m]) * ore
        * (0.1 * sl(3) + 0.01 * n(arr(s, 'MiningGemDOUBLE')[m]) + 1) * (1 + ores / 100 + rift) * awayPct / 100,
    }
  })
  const sum = (k: 'activeXp' | 'awayXp' | 'activeOres' | 'awayOres') => miners.some((x) => x[k] == null) ? null : miners.reduce((t, x) => t + x[k]!, 0)
  return { xpBonus, oreBonus: ores, miningChance: 1000 * chance, miners, activeXp: sum('activeXp'), awayXp: sum('awayXp'), activeOres: sum('activeOres'), awayOres: sum('awayOres') }
}

// Smithing craft EXP bands (craft handler, SceneEvents_6 @31501505-31513425): [level below, exponent, smithingREQ divisor].
const BANDS = [[70, 2.9, 400], [90, 2.7, 1200], [120, 2.5, 2500], [160, 2.2, 6000], [200, 1.8, 15e3], [250, 1.4, 15e3]] as const

/** EXP for one craft of the selected anvil's item (CraftingLvUps levels at once). The Smithing/Fishing-linked deck (7)
 *  supplies CbonusSmithingEXPgained. 0 at level 250+ (no branch in the game). */
export function smithingCraftExp(s: Save, item = n(arr(s, 'SmithingAnvilItem')[n(s.SmithingAnvilSelected)])) {
  const lv = n(s.smithingLVL), band = BANDS.find(([cap]) => lv < cap)
  if (!band) return 0
  const t = Math.floor((item + 7) / 8)
  const base = t ** band[1] * (5 + 2.2 * t) * ((item + 7) / 8) ** 2 + Math.max(Math.ceil((10 * n(s.SmithingPageSelected) - lv) / 10), 0.15) * n(s.smithingREQ) / band[2]
  const a = arr(s, 'AscentionLevel')
  return base * (1 + 0.2 * n(arr(s, 'SkillLevels')[14])) * n(s.CraftingLvUps) * n(s.InfinityForgeEXPbonus)
    * (1 + n(cbonus(s, catalog as unknown as Catalog, 7).CbonusSmithingEXPgained) / 100) * (1 + (n(a[33]) + 3 * n(a[37])) / 100)
}

/** Away smithing (OfflineGains[6] @3948700): one craft per 1.8 s of credited time, SmithingExpGiven[1] × (1 + 0.2·SkillLevels[14]) each. */
export const smithingAwayPerSec = (s: Save, awayPct: number) =>
  n(arr(s, 'SmithingExpGiven')[1]) * (1 + 0.2 * n(arr(s, 'SkillLevels')[14])) / 1.8 * awayPct / 100
