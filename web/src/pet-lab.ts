// Lab tanks (TankBonusLIST) and pet capsule passives — a bonus producer split out of load-bonuses.ts (refactor step 3, #66). Ported from the game's code and
// checked against a full save's stored values in load-bonuses.test.ts.
import lab from './data/lab.json'
import { vendingAt } from './realm'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** Lab tank part P[i] (SceneEvents_45): (min(lv,1) + 198*lv/(lv+1000)) * scale/100, lv = TankLVs[3*(tank-1)+slot]. */
function tankPart(save: Save, i: number) {
  const p = (lab.parts as unknown as Record<string, [number, number, number]>)[i]
  if (!p) return 0
  const lv = n(arr(save, 'TankLVs')[3 * (p[0] - 1) + p[1]])
  return ((Math.min(lv, 1) + (198 * lv) / (lv + 1000)) * p[2]) / 100
}

/** TankBonusLIST[45], the capsule away-time multiplier (SceneEvents_45 per-second block @28489765 †):
 *  (1 + P24/100) × _PetPassiveBonusLIST[20] × vend8, where [20] = 1 + (BA44·cap44 + BA72·cap72 + BA77·cap77)/100
 *  (Highness, Entertainer, Emigdala "% capsule exp rate", @28435211 †; they add, not multiply). The lab init multiplies
 *  _CapsuleEXPbonus by it (@28198970 †); the on-screen capsule tick (+0.5 per 500 ms, @28923701 †) and the level-up check
 *  (@28924421 †) don't read it. `known` is false when lab.json lacks part 24. */
export function capsuleExpRate(save: Save) {
  const BA = lab.petBuff as number[], cap = (i: number) => n(arr(save, 'PetCapsuleLV')[i])
  const pets = [44, 72, 77].map((id) => ({ id, pct: n(BA[id]) * cap(id) }))
  const part = 1 + tankPart(save, 24) / 100, pet = 1 + pets.reduce((s, p) => s + p.pct, 0) / 100, vend = 1 + vendingAt(save, 8) / 100
  return { part, pets, pet, vend, value: part * pet * vend, known: !!(lab.parts as Record<string, unknown>)[24] }
}

/** TankBonusLIST entries the app needs ([11] Botany speed, [22] brew speed, [27] chain chance, [31]/[48] Tilling crops, [45] capsule away rate, [52] pet HP), rebuilt every second in SceneEvents_45.
 *  ponytail: 7 of ~55 indices ported (each has its own formula in the same block); add others when a page reads them. */
export function tankBonuses(save: Save) {
  const P = (i: number) => tankPart(save, i), BA = lab.petBuff as number[], cap = (i: number) => n(arr(save, 'PetCapsuleLV')[i])
  const pet5 = [74, 28, 19].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 150), 1) // brew-speed pet passives
  const pet28 = (1 + (n(BA[32]) * cap(32)) / 100) * (1 + (n(BA[20]) * cap(20)) / 100)
  const vend8 = 1 + vendingAt(save, 8) / 100 // Toothpaste Tube boosts tanks 1-55
  return {
    11: (1 + P(94) / 100) * pet28 * vend8,
    22: (1 + (P(33) / 100) * n(save.ResearchLV)) * pet5 * (1 + P(63) / 100) * (1 + P(74) / 100) * (1 + P(101) / 100) * (1 + P(112) / 100) * vend8,
    // Tilling crop yield (SceneEvents_45 @28481689, pet passives 38/31/14 = _PetPassiveBonusLIST[27] @~28416000) and the
    // per-crop-overlevel % (@28491127).
    31: (1 + P(67) / 100) * [38, 31, 14].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1) * (1 + P(75) / 100) * (1 + P(123) / 100)
      * (1 + (n(arr(save, 'AscentionLevel')[38]) * Math.pow(n(arr(save, 'TankLVs')[55]), 0.4)) / 100) * vend8,
    // Chain LV chance (@28478832): parts 62/120/128/134 + _PetPassiveBonusLIST[15] (pet passives 25/7/81, @28430712).
    27: (P(62) + P(120) + P(128) + P(134) + [25, 7, 81].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1)) * vend8,
    45: capsuleExpRate(save).value,
    48: P(38) * vend8,
    // Pet passives 76, 40, 1 (_PetPassiveBonusLIST[26]): multiplies PetHPtot.
    52: [76, 40, 1].reduce((x, i) => x * (1 + (n(BA[i]) * cap(i)) / 100), 1),
  }
}

