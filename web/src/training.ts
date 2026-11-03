// Training (#41): the three lifting screens past the main gym. Attack Dojo (scene SceneEvents_3, CurrentlyViewedScreen 2) trains
// Attack, Strength Mountain (SceneEvents_4, screen 3) Strength, Endurance Fields (SceneEvents_14, screen 4) Endurance. Each has
// five lifters (LifterLV indices 8-12, 13-17, 18-22); a lifter finishes a rep every few animation frames and each rep gives its
// skill EXP and water (H2O) EXP. Lifters are levelled with gold: LifterLV raises EXP per rep, LifterLV2 ("speed", cap 100) the
// animation speed. Every formula is ported from Qno2x.js (offsets †) and checked in training.test.ts against stored values or
// the game's own code run in the sandbox. The main-screen gym's five lifters (indices 2, 3, 4, 6, 7) are not on this page.
import { framesPerSec } from './away'
import { expCut } from './giftshop'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const at = (s: Save, k: string, i: number) => n((s[k] as number[] | undefined)?.[i])

export type Arena = {
  screen: number; name: string; skill: string; lvl: string; exp: string; req: string; pbonus: string; awayChance: string; gift: number
  ids: number[]; names: string[]; frames: number[]; awayDiv: number[]; base: number[]
}
/** Per screen:
 *  - ids / names: the lifters and the label drawn under each (SceneEvents_3 "ASSASSIN" @22603540 … "STREETZ" @22688871,
 *    SceneEvents_4 "BOULDER" @26260248 … "ROCKMAN" @26345599; Endurance Fields labels are drawn by the lifter actors,
 *    ActorEvents_492-500 "RUNNING" … "GAMER" @9317252-@9438030).
 *  - frames: animation frames per rep, the lifter actor's `frames < animations[i]` rep check (ActorEvents_81 @15294977, _134
 *    @4964852, _136 @5146132, _140 @6053506, _142 @6217589; _634 @12639543, _636 @12643540, _667 @13218644, _669 @13222849,
 *    _663 @13214439; _492 @9318032, _494 @9343307, _496 @9369059, _498 @9394336, _500 @9439054). †
 *  - awayDiv: the frames the screen's away credit divides by (500 ms tick: SceneEvents_3 @22731267, _4 @26388266, _14
 *    @19849555). Mountain's last lifter and all of Fields differ from the actors' frames: the game's own numbers. †
 *  - pbonus: the potion EXP bonus each rep uses (the same actor sites). awayChance: the chance the away credit multiplies by.
 *    Every one of the 15 actors rolls against strChance on screen, whatever the skill (game quirk, same sites). †
 *  - base: expgiven at LifterLV 1, set by the ascension reset (SceneEvents_22 @20945053 `expgiven[8]=2`, …); checked against
 *    every stored expgiven in training.test.ts.
 *  - gift: GiftShopLevels slot of the skill's "exp" item (giftshop.ts). */
export const ARENAS: Arena[] = [
  { screen: 2, name: 'Attack Dojo', skill: 'Attack', lvl: 'atkLVL', exp: 'atkEXP', req: 'atkREQ', pbonus: 'PbonusDojoExp', awayChance: 'atkChance', gift: 2,
    ids: [8, 9, 10, 11, 12], names: ['Assassin', 'Swordsman', 'Killer', 'Bandit', 'Streetz'], frames: [8, 10, 11, 8, 8], awayDiv: [8, 10, 11, 8, 8], base: [2, 5, 15, 50, 200] },
  { screen: 3, name: 'Strength Mountain', skill: 'Strength', lvl: 'strLVL', exp: 'strEXP', req: 'strREQ', pbonus: 'PbonusMountainExp', awayChance: 'strChance', gift: 4,
    ids: [13, 14, 15, 16, 17], names: ['Boulder', 'Chopchop', 'Laborer', 'Bender', 'Rockman'], frames: [8, 9, 9, 12, 9], awayDiv: [8, 9, 9, 12, 10], base: [2, 5, 10, 20, 50] },
  { screen: 4, name: 'Endurance Fields', skill: 'Endurance', lvl: 'endLVL', exp: 'endEXP', req: 'endREQ', pbonus: 'PbonusFieldExp', awayChance: 'endChance', gift: 6,
    ids: [18, 19, 20, 21, 22], names: ['Running', 'Waiting', 'Sleeping', 'Feaster', 'Gamer'], frames: [12, 9, 8, 10, 8], awayDiv: [8, 9, 9, 12, 10], base: [2, 5, 10, 20, 50] },
]
export const arenaOf = (i: number) => ARENAS.find((a) => a.ids.includes(i))!
const slot = (i: number) => arenaOf(i).ids.indexOf(i)

// ---- Upgrades (ActorEvents_69's buy handler, SelectedUpgrade 2i − 5 for LifterLV and 2i − 4 for LifterLV2, † @13545396-@13631624).
/** Gold for one lifter level / one speed level, by position 1-5 in the screen (same for all three screens). */
const COST = [250, 2e3, 1e4, 5e4, 25e4]
/** EXP per rep added by a lifter level from level L: a + ⌊L/5⌋/d (L before the buy). */
const INC: [number, number][] = [[0.25, 8], [0.5, 3], [2, 1], [8, 0.3], [25, 0.1]]
export const levelCost = (i: number, L: number) => COST[slot(i)]! * 1.1 ** (L - 1)
export const expInc = (i: number, L: number) => INC[slot(i)]![0] + Math.floor(L / 5) / INC[slot(i)]![1]
/** expgiven at level L: base + every level's increment (what the stored value is). */
export function expgivenAt(i: number, L: number) {
  let e = arenaOf(i).base[slot(i)]!
  for (let k = 1; k < L; k++) e += expInc(i, k)
  return e
}
export const SPEED_MAX = 100
export const speedCost = (i: number, L2: number) => COST[slot(i)]! * 1.2 ** (L2 - 1)
/** animationspeed × this when speed goes to level L2 (L2 = the new level). */
export const speedStep = (L2: number) => 1 + 8 / (1 + Math.floor(L2 / 10) / 5) / 100
/** animationspeed at speed level L2: (1 + smithingRepSpeedBoost) × every step. The ascension reset sets every speed to 1
 *  (SceneEvents_22 @20944591); Smithing divides out the old boost and multiplies in the new one (SceneEvents_6 † @30893745). */
export function speedAt(L2: number, smithBoost: number) {
  let v = 1 + smithBoost
  for (let k = 2; k <= L2; k++) v *= speedStep(k)
  return v
}

// ---- Rates ------------------------------------------------------------------------------------------------------------------
/** Skill EXP one rep gives at level L (actor rep code, e.g. ActorEvents_81 @15294977): expgiven × (1 + Pbonus/100)
 *  × (1 + L/100·10·PotionLV[73]/100), only when randomInt(1,1000) ≤ strChance, so × min(strChance, 1000)/1000 on average. */
export function expPerRep(s: Save, i: number, L = at(s, 'LifterLV', i), given = at(s, 'expgiven', i)) {
  const hit = Math.min(Math.max(n(s.strChance), 0), 1000) / 1000
  return given * (1 + n(s[arenaOf(i).pbonus]) / 100) * (1 + (L / 100) * 10 * at(s, 'PotionLV', 73) / 100) * hit
}
/** Water EXP per rep (same sites): WaterGiven × (1 + PbonusGymH20/100), every rep. */
export const waterPerRep = (s: Save, i: number) => at(s, 'WaterGiven', i) * (1 + n(s.PbonusGymH20) / 100)
/** Reps per second on screen: a 10 ms timer adds animationspeed/100 to the lifter's counter and each 60 fps draw moves it one
 *  frame when the counter is ≥ 1, zeroing it (SceneEvents_3 @22602149), so 60 frames/s at most; a rep is `frames` frames. */
export const activeReps = (s: Save, i: number, fps = 60) => (at(s, 'LifterLV', i) > 0 ? framesPerSec(at(s, 'animationspeed', i), fps) / arenaOf(i).frames[slot(i)]! : 0)
/** Reps credited per away second: ⌊animationspeed/awayDiv·6000⌋/6000 (no frame cap). */
export const awayReps = (s: Save, i: number) => (at(s, 'LifterLV', i) > 0 ? Math.floor((at(s, 'animationspeed', i) / arenaOf(i).awayDiv[slot(i)]!) * 6e3) / 6e3 : 0)

/** Skill EXP per second while on the screen. */
export const activeExp = (s: Save, a: Arena) => a.ids.reduce((t, i) => t + activeReps(s, i) * expPerRep(s, i), 0)
export const activeWater = (s: Save, a: Arena) => a.ids.reduce((t, i) => t + activeReps(s, i) * waterPerRep(s, i), 0)
/** Skill EXP per credited away second. The screen's 500 ms tick (SceneEvents_3 @22725067, _4 @26382013, _14 @19843255) adds
 *  Σ awayReps × expgiven × awayChance/1000 × ⌊AwayTimeRewarded⌋ straight to the skill's EXP: no potion bonus, no 1000 cap on
 *  the chance. AwayTimeRewarded = away seconds × nonActiveZoneGainPercent/100 (screen init, @22600245). Water: Σ awayReps ×
 *  WaterGiven × (1 + H20BonusPercent) × TankBonusLIST[38]. */
export const awayExp = (s: Save, a: Arena) => a.ids.reduce((t, i) => t + awayReps(s, i) * at(s, 'expgiven', i) * (n(s[a.awayChance]) / 1000), 0)
export const awayWater = (s: Save, a: Arena) => a.ids.reduce((t, i) => t + awayReps(s, i) * at(s, 'WaterGiven', i), 0) * (1 + n(s.H20BonusPercent)) * at(s, 'TankBonusLIST', 38)

/** Requirement after levelling to L on the skill's own screen (SceneEvents_3 @22720549, _4 @26375320, _14 @19835295):
 *  1.222·REQ + 5⌊L/5⌋ + 10⌊L/10⌋ + 2L. The other two skills level with 1.2·REQ + 2L on these screens (e.g. @22717877). */
export const nextReq = (req: number, L: number) => 1.222 * req + (5 * Math.floor(L / 5) + 10 * Math.floor(L / 10) + 2 * L)
/** EXP still needed: the level-up fires at EXP ≥ REQ·(1 − gift-shop cut) (@22719225). */
export const toLevel = (s: Save, a: Arena) => Math.max(n(s[a.req]) * (1 - expCut(at(s, 'GiftShopLevels', a.gift))) - n(s[a.exp]), 0)

// ---- What to buy ------------------------------------------------------------------------------------------------------------
export type Mode = 'active' | 'away'
/** Away credit includes the gift shop's away items: × (1 + GiftShopLevels[13/14/15]/50) for Attack/Strength/Endurance
 *  (ActorEvents_121 † @3886576, @3889708, @3892844 — the giftshop.ts reading). Checked live 2026-10-11 (#50): over 1.12 h away
 *  the credited EXP was 3.18-3.46× the screens' plain tick formula, against factors 3.44-3.54, so the gift shop path is the one
 *  that pays. PotionLV[73]'s term in that path is 0 on the author's save and left out. */
export const awayGift = (s: Save, a: Arena) => 1 + n((s.GiftShopLevels as number[] | undefined)?.[{ Attack: 13, Strength: 14, Endurance: 15 }[a.skill as 'Attack'] ?? 0]) / 50
/** Per real second: on screen, or away (credit × away %). The page ranks each screen by whichever pays more. */
export function rates(s: Save, a: Arena) {
  const pct = n(s.nonActiveZoneGainPercent) / 100
  const active = activeExp(s, a), away = awayExp(s, a) * pct * awayGift(s, a)
  return { active, away, mode: (away > active ? 'away' : 'active') as Mode, best: Math.max(active, away), water: { active: activeWater(s, a), away: awayWater(s, a) * pct } } // ponytail: water away left without the gift factor (unchecked)
}
/** One more level of lifter i, given its current level L and expgiven, in the rate the screen pays most in. */
function gainOf(s: Save, i: number, mode: Mode, L: number, given: number) {
  const a = arenaOf(i), next = given + expInc(i, L)
  if (mode === 'active') return activeReps(s, i) * (expPerRep(s, i, L + 1, next) - expPerRep(s, i, L, given))
  return awayReps(s, i) * (next - given) * (n(s[a.awayChance]) / 1000) * (n(s.nonActiveZoneGainPercent) / 100) * awayGift(s, a)
}
export type Option = { i: number; L: number; cost: number; gain: number; pct: number; perGold: number }
/** Next level of every owned lifter: EXP/s added in the screen's better mode, as % of that screen's EXP/s, per gold. The
 *  ranking optimises "% faster levelling of that screen's skill per gold"; across screens that treats +1% Attack the same as
 *  +1% Strength. Speed is not offered once at 100 (the cap). */
export function options(s: Save): Option[] {
  return ARENAS.flatMap((a) => {
    const r = rates(s, a)
    return a.ids.filter((i) => at(s, 'LifterLV', i) > 0).map((i) => {
      const L = at(s, 'LifterLV', i), cost = levelCost(i, L), gain = gainOf(s, i, r.mode, L, at(s, 'expgiven', i))
      const pct = r.best > 0 ? gain / r.best : 0
      return { i, L, cost, gain, pct, perGold: pct / cost }
    })
  }).sort((x, y) => y.perGold - x.perGold)
}
/** Spend `gold`: levels bought per lifter and gold left, maximising Σ_screens ln(new EXP/s ÷ today's). This is Lagrange like realm-coins' spendLevels: tabulate each lifter's next levels once (cost, and a
 *  running min of value per gold so the prefix rule stays exact), bisect λ so every level worth ≥ λ fits the gold, then top up
 *  with the best next level that still fits. `maxBuys` caps the levels tabulated per lifter.
 *  ponytail: expInc steps up every 5 levels (+40% for the 5th lifter at L=5), so a lifter's ratio is not monotone at low levels;
 *  the running min undervalues a level just past a dip. Same plan as the old uncapped one-at-a-time greedy on both saves (2026-10-21). */
export function spend(s: Save, gold = n(s.goldcoin), maxBuys = 5000) {
  const L = new Map<number, number>(), given = new Map<number, number>(), bought = new Map<number, number>()
  const owned = ARENAS.flatMap((a) => a.ids).filter((i) => at(s, 'LifterLV', i) > 0)
  for (const i of owned) { L.set(i, at(s, 'LifterLV', i)); given.set(i, at(s, 'expgiven', i)) }
  const mode = new Map(ARENAS.map((a) => [a, rates(s, a)]))
  // Objective (the author 2026-10-21): Σ over screens of ln(new EXP/s ÷ today's), so gains compound per screen and gold spreads across
  // skills instead of piling onto the screen with the cheapest %. A level's value = ln(1 + Δ / rate), where rate is the screen's
  // EXP/s with every level planned so far on it. Other lifters' planned Δ on the same screen are frozen from the previous pass;
  // ponytail: 4 passes of that coupling (the plan settles in 2-3 on the saves tried); a lifter's own Δ accumulate exactly.
  const planned = new Map<number, number>(owned.map((i) => [i, 0])) // EXP/s each lifter's planned levels add
  let pick: { k: number; cost: number }[] = [], curves: { i: number; steps: { c: number; r: number; d: number }[] }[] = []
  const take = (lam: number) => curves.map((cv) => { let k = 0, cost = 0; while (k < cv.steps.length && cv.steps[k]!.r >= lam) cost += cv.steps[k++]!.c; return { k, cost } })
  const total = (t: { cost: number }[]) => t.reduce((a, x) => a + x.cost, 0)
  let left = gold
  for (let pass = 0; pass < 4; pass++) {
    curves = owned.map((i) => {
      const a = arenaOf(i), r = mode.get(a)!, steps: { c: number; r: number; d: number }[] = []
      const others = a.ids.reduce((t, j) => t + (j !== i ? planned.get(j) ?? 0 : 0), 0)
      let l = L.get(i)!, g = given.get(i)!, cum = 0, own = 0, min = Infinity
      while (r.best > 0 && steps.length < maxBuys) {
        const c = levelCost(i, l)
        if (!(cum + c <= gold)) break
        const d = gainOf(s, i, r.mode, l, g)
        min = Math.min(min, Math.log1p(d / (r.best + others + own)) / c)
        if (!(min > 0)) break
        steps.push({ c, r: min, d }); cum += c; own += d; g += expInc(i, l); l++
      }
      return { i, steps }
    })
    let lo = Math.log(1e-300), hi = Math.log(Math.max(1e-300, ...curves.flatMap((cv) => cv.steps.map((x) => x.r))) * 2)
    for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (total(take(Math.exp(mid))) <= gold) hi = mid; else lo = mid }
    pick = take(Math.exp(hi))
    left = gold - total(pick)
    for (;;) {
      let bi = -1
      curves.forEach((cv, k) => { const st = cv.steps[pick[k]!.k]; if (st && st.c <= left && (bi < 0 || st.r > curves[bi]!.steps[pick[bi]!.k]!.r)) bi = k })
      if (bi < 0) break
      left -= curves[bi]!.steps[pick[bi]!.k++]!.c
    }
    curves.forEach((cv, k) => planned.set(cv.i, cv.steps.slice(0, pick[k]!.k).reduce((t, x) => t + x.d, 0)))
  }
  gold = left
  // Best first step first, so `bought` lists lifters in ranking order.
  curves.map((cv, k) => ({ i: cv.i, k: pick[k]!.k, r: cv.steps[0]?.r ?? 0 })).sort((x, y) => y.r - x.r).forEach(({ i, k }) => {
    for (let j = 0; j < k; j++) { given.set(i, given.get(i)! + expInc(i, L.get(i)!)); L.set(i, L.get(i)! + 1) }
    if (k) bought.set(i, k)
  })
  const gain = new Map(ARENAS.map((a) => {
    const r = mode.get(a)!
    const now = a.ids.reduce((t, i) => t + (L.has(i) ? (r.mode === 'active' ? activeReps(s, i) * expPerRep(s, i, L.get(i)!, given.get(i)!) : awayReps(s, i) * given.get(i)! * (n(s[a.awayChance]) / 1000) * (n(s.nonActiveZoneGainPercent) / 100) * awayGift(s, a)) : 0), 0)
    return [a.screen, r.best > 0 ? now / r.best - 1 : 0]
  }))
  return { bought, left: gold, gain }
}
