// Ascend / rebirth rewards (AP, BP) — a bonus producer split out of load-bonuses.ts (refactor step 3, #66). Ported from the game's code and
// checked against a full save's stored values in load-bonuses.test.ts.
import catalog from './data/card-catalog.json'
import { cbonus, type Catalog } from './modules/cards/cards-calc'
import { masteryBonuses } from './mastery-bonuses'
import { tankBonuses } from './pet-lab'
import { potionBonuses } from './potion-bonuses'
import { current } from './screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** What ascending (AP) and rebirthing (BP) would award now, per source (ActorEvents_604). Index 0 unused. */
export function ascensionRewards(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i])
  const ap = (k: number, x: number) => Math.floor(Math.max(Math.pow(k * Math.max(0, Math.log(Math.max(1, x + 1)) - 6), 2.3) / 100, 0))
  const AP = [0, ap(7, n(save.totalKills)), ap(5, n(save.totalreps)), ap(3, n(save.OresMined)), ap(4, n(save.TotalFishCaught)),
    Math.floor(Math.max(Math.pow(Math.max(0, Math.log(Math.max(1, n(save.totalSkillLV) + 1) / 20)), 3.2), 0))]
  // BP 1: crop/plant overlevels + plant levels + pot ranks; 2: highest flower owned; 3: seeds (weighted by seed tier^5);
  // 4: unspent AP; 5: furthest map progress; 6: smithing + cards + event upgrade.
  let farm = 0
  for (let i = 1; i <= 8; i++) farm += 2.3 * a('OverLevels', i) + 1.2 * a('PlantLevel', i) ** 0.8
  for (let i = 1; i <= 14; i++) farm += 1.2 * a('OverLevels', i + 8) + 0.8 * a('HerblorePotLevel', i) ** 0.7
  let topFlower = 0
  for (let i = 1; i <= 24; i++) if (a('flowersOwned', i) > 0.9) topFlower = i
  let seeds = 0
  for (let i = 1; i <= 20; i++) seeds += a('SeedsOwned', i) * i ** 5
  const F = (i: number) => a('FurthestMapleLV', i), fights = n(save.fightsunlocked)
  let map = fights === 5 ? Math.min(0.5 * F(5), 26) : 0
  if (n(save.HellKeyGot) === 1)
    map = fights === 15 ? Math.min(20 * F(15) + 650, 5000) : fights === 14 ? Math.min(5 * F(14) + 350, 650)
      : fights === 13 ? Math.min(3 * F(13) + 180, 350) : fights === 12 ? Math.min(2 * F(12) + 70, 180) : Math.min(0.8 * F(11) + 26, 70)
  const BP = [0, Math.min(farm ** 1.375 + farm, 1250), Math.min(topFlower ** 2, 1500),
    Math.max(0, Math.min((0.43 * Math.log(Math.abs(seeds ** 0.8) + 1)) ** 2, 750)) || 0,
    Math.min(0.1 * (0.43 * Math.log(Math.abs(n(save.APtoSpend)) + 1)) ** 4.25, 1500), map,
    Math.min(Math.round((8 * a('SmithingItemLevel', 70) ** 0.8) / 8), 1000) + Math.min(n(cbonus(save, catalog as unknown as Catalog).CbonusBPgainMisc), 250) + 2 * a('EventUpgradeLevels', 6)]
  return { AP, BP }
}

/** What ascending / rebirthing would pay right now (the game's APreward/BPreward × multipliers, Qno2x.js award handlers
 *  @12469725 / @12480775 — see issue #10), plus how long this run has taken. Stored TankBonusLIST / MasteryBonuses /
 *  Cbonus values are used when the save has them (local saves), else computed (cloud saves). */
export function ascendGain(save: Save) {
  const a = (k: string, i: number) => n(arr(save, k)[i])
  // ponytail: tankBonuses() only ports [11] and [22], so a cloud save (no stored TankBonusLIST) counts tanks 19/32 as 1;
  // port those two when cloud-save ascend numbers matter.
  const tank: Record<number, number> = arr(save, 'TankBonusLIST').length ? arr(save, 'TankBonusLIST').map(n) : tankBonuses(save)
  const mast = current(save, 'MasteryBonuses', () => masteryBonuses(save)).map(n)
  const cb = (k: string) => (typeof save[`Cbonus${k}`] === 'number' ? n(save[`Cbonus${k}`]) : n(cbonus(save, catalog as unknown as Catalog)[`Cbonus${k}`]))
  const { AP, BP } = ascensionRewards(save)
  const rift = a('RiftLVL', 8), riftPro = a('RiftProLvs', 8), secret2 = a('SecretEarned', 2)
  const M = 1 + Math.floor(20 * Math.min(rift, 1) + 5 * rift + 4 * a('SkillLevels', 37)) / 100
  const apMulti = (1 + 0.02 * a('SmithingItemLevel', 59) + 0.42 * secret2 + 0.02 * a('SmithingItemLevel', 35) * secret2) * M
    * (1 + n(save.MTXdoubleAP)) * (1 + potionBonuses(save).BonusAP / 100) * (1 + (10 * a('AscentionLevel', 60)) / 100)
    * (1 + (5 * a('EventUpgradeLevels', 4)) / 100) * (1 + cb('AP') / 100) * n(mast[31] ?? 1) * n(tank[19] ?? 1)
  const bpMulti = (1 + n(save.MTXdoubleBP)) * (1 + ((250 * rift) / (rift + 200)) * ((2 * riftPro) / (riftPro + 100)) / 100)
    * (1 + (3 * a('ContractRank', 50)) / 100) * (1 + Math.ceil(a('AscentionLevel', 64) / 100)) * (1 + (2 * a('TrainingPerkLevels', 11)) / 100)
    * n(tank[32] ?? 1) * (1 + (1.5 * a('SkillLevels', 65)) / 100) * n(mast[32] ?? 1)
  const apBase = AP.reduce((s, v) => s + v, 0), bpBase = BP.reduce((s, v) => s + Math.round(v), 0)
  // TimeSinceAscention2 is zeroed only by a rebirth (scene 22, APmenuSelected 2) and ticks with TimeSinceAscention,
  // so it is the rebirth cycle's clock; BP accrues over the whole cycle.
  const hours = n(save.TimeSinceAscention) / 3600, rebirthHours = n(save.TimeSinceAscention2) / 3600
  return { AP, BP, apBase, apMulti, ap: apBase * apMulti, bpBase, bpMulti, bp: bpBase * bpMulti, hours, rebirthHours }
}
