// Trek combat (#24): how fast a pet team kills the selected trek monster. All formulas † from Qno2x.js (byte offsets):
// - pet attacks: the 50 ms cooldown loop in the pet scene (@27312868). Cooldown k fills by 0.05·(1+PVT[7]%)/(1+PVT[27]%) per
//   tick (= 1/s) against PetCooldownsREQ[k] = base/(1 + PVT[17]%) (bases @27238988, divisor @27271476). When it fires, every
//   fighter (PetPositions 1-4; supports never attack) adds PetValue1 once per gene slot holding k, × the move's multiplier;
//   60 ms later a Genesis roll (PVT[22]%) fires a copy × (1 + 0.5·tier(Genesis)).
// - hits on the monster: ActorEvents_1349 (@5063189-5121700): MonsterHP −= value · AllPetDmgMultiplier · (1 − MonsterRespawn).
//   Every damaging hit (all moves but Curse Skull and Radiation; Boomerang only on its last bounce) then clears the Radiation
//   stacks PVT[8] unless randomInt(1,100) ≤ 25·tier(Radiation) (@5101017 and each hit block).
// - AllPetDmgMultiplier: pet scene draw listener (@27307482-27312867), recomputed every frame (so curse stacks and HP count live).
// - monster: MonsterHPtot (@27241117), monster attacks (@27428144-27452000), kill/death handling (@27284246, @27235762).
// ponytail: an expected-value simulation (each random roll replaced by its mean, projectile travel time ignored: a hit lands
// in the step its move fires; Bubbler's growth in flight is counted, see bubbleGrowth) in the game's own 50 ms steps. Fine for
// ranking teams; a single fight in game varies around it. Each fighter's projectile (and its Genesis copy, weighted by the
// Genesis chance) is its own hit, in fighter order, so Radiation stacks go to the first hit after them.
import { petGenes, petHPtot, petValueTotals, GENES, TREK_SLOTS, invText, type Pet } from './pets'
import { equipmentBonuses, masteryBonuses } from './load-bonuses'
import { awayPercent } from './away'
import { current } from './screen-bound'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const tier = (g: number) => Math.min(Math.floor(g / 3), 3)
const any = (g: number) => Math.floor((g + 97) / 100)

/** PetCooldownsREQ bases (s) set on every pet-screen refresh @27238988 †: 1-10 attack genes, 11 basic attack, 12-21 monster attacks. */
export const COOLDOWN = [0, 2.5, 2, 4.2, 3, 3.75, 5, 8, 3.25, 0.75, 1.5, 2.75, 2, 3.5, 3.5, 2.5, 4, 5, 3, 7, 5.5, 4]

/** _PetDamageMultiplier per move † (@27321100 Fire Fist … @27416157 Zeus Bolt; basic attack @27315875). g = PetGenes,
 *  rattle = PVT[9] (Rattlin Gun ramp, fight state). */
export const moveMult = (k: number, g: number[], rattle = 0) => {
  const G = (i: number) => n(g[i])
  switch (k) {
    case 11: return 1
    case 1: return 1.5 + 0.5 * 2 ** tier(G(1)) * any(G(1)) // 150%, combo 250/350/550%
    case 2: return 1 // Curse Skull: the value becomes +value% damage for the rest of the fight
    case 3: return 0 // Healing: heals 5% per gene (below)
    case 4: return 1.8
    case 5: return 2
    case 6: return 1 // Bubbler @27372279: grows in flight (bubbleGrowth)
    case 7: return 12 + 4 * 2 ** tier(G(7)) * any(G(7)) // Snipe @27388407: 1200%, combo 2000/2800/4400%
    case 8: return 1 // Radiation @27395699: value = 1 per gene slot (not the level), becomes +100% per stack (PVT[8])
    case 9: return 0.25 + rattle // Rattlin Gun @27408807: 25% + PVT[9], which each hit raises by 2% + 1%·tier (@5106010)
    case 10: return 2.5 + 0.25 * 2 ** tier(G(10)) * any(G(10)) // Zeus Bolt @27421112: 250%, combo 300/350/450%
    default: return 0
  }
}

/** Genesis copy (60 ms after a projectile, randomInt(1,100) < PVT[22]) multiplier † (@27312868 loop): × (1 + 0.5·tier(Genesis)),
 *  except Radiation (@27395699) and Healing, whose copy is ×1. */
export const genesisMult = (k: number, g: number[]) => (k === 8 || k === 3 ? 1 : 1 + 0.5 * tier(n(g[22])))

/** The projectiles move k fires, one per fighter carrying it (fighter i = PetPositions[i+1], i = 0 front): PetValue1 per gene
 *  slot holding k, × moveMult (@27321659); Radiation: 1 per slot (@27395699); basic attack: PetValue1 once if ability 1 ≠ 0. */
export function volley(save: Save, k: number, g: number[], rattle = 0) {
  const at = (key: string, i: number) => n(arr(save, key)[i])
  return [0, 1, 2, 3].flatMap((i) => {
    const slot = at('PetPositions', i + 1), ab = [1, 2, 3].map((j) => at(`PetAbility${j}`, slot)), lvl = at('PetValue1', slot)
    const v = k === 11 ? (ab[0] !== 0 ? lvl : 0) : ab.filter((a) => a === k).length * (k === 8 ? 1 : lvl)
    return slot > 0 && v > 0 ? [{ i, v: v * moveMult(k, g, rattle) }] : []
  })
}

/** Radiation combo †: chance a damaging hit leaves the PVT[8] stacks, randomInt(1,100) ≤ 25·tier (@5101017 and every hit block). */
export const radKeep = (g: number[]) => 0.25 * tier(n(g[8]))

/** Rattlin Gun ramp per hit †: PVT[9] += 0.02 + 0.01·tier (@5106010); PVT[1-10] reset when the next monster comes. */
export const rattleStep = (g: number[]) => 0.02 + 0.01 * tier(n(g[9]))

/** Bubbler speed in px/s †: setXVelocity(12/(1 + 0.2·tier)) (ActorEvents_1349 update @5015480); Stencyl simple physics moves
 *  10·velocity px/s (moveActorBy(10/STEP_SIZE·xSpeed·ms·0.01) @833660, STEP_SIZE 10 @499865). */
export const bubbleSpeed = (g: number[]) => 120 / (1 + 0.2 * tier(n(g[6])))
/** Bubbler growth †: every 0.2 s in flight (27 timers, @5015480) the value grows by its launch value × (0.4 + 0.05·2^tier·combo).
 *  It launches at x = 330 − 82·i (Genesis copy 324 − 82·i, @27372279) and hits once x > 427 (@5089437), so the back fighters'
 *  bubbles grow more. ponytail: flight time from straight-line motion; the game's frame timing can shift a tick at an edge. */
export function bubbleGrowth(i: number, g: number[], copy = false) {
  const ticks = Math.min(Math.floor((427 - ((copy ? 324 : 330) - 82 * i)) / bubbleSpeed(g) / 0.2), 27)
  return 1 + ticks * (0.4 + 0.05 * 2 ** tier(n(g[6])) * any(n(g[6])))
}

/** Expected value one projectile of move k carrying v takes off MonsterHP before AllPetDmgMultiplier (ActorEvents_1349 †).
 *  Crit: randomInt(1,1000) ≤ PVT[12] → ×(1.5 + PVT[21]%) (@5063415). Snipe (@5095028) always crits, then randomInt(1,10) ≤
 *  5 − tier misses and deals 1. Zeus Bolt (@5110491) crits at 2·PVT[12] for ×(1.5 + PVT[21]%)·(3 + 0.5·2^tier).
 *  Boomerang (block @5071842): the crit multiplies the stored value (@5072818), then randomInt(1,1000) ≤ 330 + 70·tier (@5076477)
 *  sends it back (setX(422) @5076715) ×(1 + 0.34·tier) (@5077065) to hit, crit and roll again, no cap. Each hit's expected
 *  multiplier is c·(b·bm) on the one before, so the chain is v·c/(1 − b·bm·c). Life Leech scaling is applied by the sim on top. */
export function hitValue(k: number, v: number, g: number[], pvt: number[]) {
  const cm = 1.5 + n(pvt[21]) / 100, t = (i: number) => tier(n(g[i]))
  if (k === 2 || k === 3 || k === 8) return 0
  if (k === 7) { const miss = (5 - t(7)) / 10; return (1 - miss) * v * cm + miss }
  if (k === 10) return v * (1 + (Math.min(2 * n(pvt[12]), 1000) / 1000) * (cm * (3 + 0.5 * 2 ** t(10)) - 1))
  const c = 1 + (Math.min(n(pvt[12]), 1000) / 1000) * (cm - 1)
  if (k !== 4) return v * c
  const r = boomerangBounce(g) * (1 + 0.34 * t(4)) * c
  return r < 1 ? (v * c) / (1 - r) : Infinity // ponytail: r ≥ 1 (tier 3, or tier 2 with strong crits) = unbounded expectation, the hit kills
}
/** Boomerang's chance to bounce back for another hit (@5076477 †). */
export const boomerangBounce = (g: number[]) => (330 + 70 * tier(n(g[4]))) / 1000

/** MonsterHPtot for monster id (= MonsterSelected + 5·(page−1)) @27241117 †. */
export const monsterHPtot = (id: number) => (1 + (id + 5 * id ** 1.4 + 2 * id)) * (1 + Math.ceil((id + 1) / 5) / 2) ** 1.07 * 1.045 ** id / 1.3 - 8

/** AllPetDmgMultiplier @27307482 †. `curse` = PetValueTotals[2] (Curse Skull stacks), `rad` = PetValueTotals[8]; both are fight state. */
export function allPetDmgMultiplier(save: Save, st: { hp: number; hpTot: number; curse?: number; rad?: number; genes?: number[]; pvt?: number[]; e13?: number; m14?: number }) {
  const g = st.genes ?? petGenes(save), pvt = st.pvt ?? petValueTotals(save), G = (i: number) => n(g[i])
  const at = (k: string, i: number) => n(arr(save, k)[i])
  // e13 / m14: team-independent, so a simulation passes them in once instead of rebuilding the bonus tables every hit
  const e13 = st.e13 ?? (arr(save, 'EbonusThree').length ? at('EbonusThree', 13) : n(equipmentBonuses(save).three[13]))
  const m14 = st.m14 ?? n(current(save, 'MasteryBonuses', () => masteryBonuses(save))[14])
  const t51 = arr(save, 'TankBonusLIST').length ? at('TankBonusLIST', 51) : 1 // ponytail: TankBonusLIST[51] not ported (cloud saves lack it); team-independent
  const rift = at('RiftLVL', 3), pro = at('RiftProLvs', 3), p142 = at('PotionLV', 142), s87 = at('SmithingItemLevel', 87), sk = at('SkillLevels', 69)
  return (1 + e13 / 100) * (1 + ((200 * rift) / (rift + 200)) * ((2 * pro) / (pro + 100)) / 100) * (1 + ((75 * p142) / (p142 + 175)) * 3.5 * (1 - st.hp / (st.hpTot + 1)) / 100)
    * (1 + n(st.curse) / 100) * (1 + ((400 * s87) / (s87 + 2000)) * 1.15 ** Math.min(s87 / 2000, 8) / 100)
    * (1 + (2 * at('CardLevels', 177)) / 100) * m14
    * (1 + n(st.rad)) * (1 + n(pvt[26]) / 100) * (1 + tier(G(26)))
    * (1 + (10 * G(17)) / 100 + (15 * tier(G(17))) / 100)
    * (1 + ((200 * sk + 10) / (sk + 100) + 100 * Math.max(t51 - 1, 0)) / 100)
}

/** A team: inventory slot at each trek position (1-4 fighters, 5/6/19/20 supports). */
export type Team = Record<number, number>
export const teamOf = (save: Save): Team => Object.fromEntries(TREK_SLOTS.map((s) => [s.p, n(arr(save, 'PetPositions')[s.p])]))
/** The save with `team` placed (other positions untouched; a pet moved from a nest just leaves it empty there). */
export function withTeam(save: Save, team: Team): Save {
  const pos = [...arr(save, 'PetPositions')]
  for (const [p, slot] of Object.entries(team)) {
    if (slot) for (let q = 1; q < pos.length; q++) if (n(pos[q]) === slot && !(q in team)) pos[q] = 0
    pos[+p] = slot
  }
  return { ...save, PetPositions: pos }
}

export interface TrekResult { monster: number; monsterHP: number; killsPerMin: number; killSec: number; deathsPer10Min: number; avgHpPct: number;
  dps: number; bySource: { name: string; share: number }[]; hpTot: number; notModelled: string[]
  /** Net damage the pets took (monster hits minus heals, uncapped as the game's CalibrationValues[2] counts them †). */
  taken: number }

/** Expected-value fight vs the selected monster for `seconds` of continuous trekking (pet HP carries over between kills, as in game). */
export function simulateTrek(save: Save, team: Team = teamOf(save), seconds = 600): TrekResult {
  const s = withTeam(save, team), g = petGenes(s), pvt = petValueTotals(s), G = (i: number) => n(g[i])
  const at = (k: string, i: number) => n(arr(s, k)[i])
  const id = n(s.MonsterSelected) + 5 * (n(s.MonsterPageSelected) - 1), page = n(s.MonsterPageSelected)
  const mTot = monsterHPtot(id), hpTot = petHPtot(s)
  const fighters = [1, 2, 3, 4].map((p) => at('PetPositions', p)).filter((x) => x > 0)
  const abil = (slot: number) => [1, 2, 3].map((k) => at(`PetAbility${k}`, slot))
  const notModelled: string[] = []
  if (n(s.MonsterSelected) + 5 * (page - 1) >= 35) notModelled.push('monster attacks for monster ≥ 35')

  // Rolls → means (crits in hitValue); randomInt(1,100) < x is (ceil(x)−1)%.
  const below = (x: number) => Math.max(Math.ceil(Math.min(x, 100)) - 1, 0) / 100
  const pGenesis = below(n(pvt[22]))
  const keep = radKeep(g)
  const evade = below(Math.min(n(pvt[16]), 75)) // @27430090: a dodged monster attack does 0
  const bounce = boomerangBounce(g) // each Boomerang hit can bounce again (chain value in hitValue)
  const curseCombo = 0.15 * tier(G(2)) * 10 // Curse Skull combo @5066061: 15%·tier chance per hit of +10 curse
  const health = 1 + 0.1 * tier(G(11))
  const req = COOLDOWN.map((b) => b / (1 + n(pvt[17]) / 100))
  const respawn = 1 / (1 + n(pvt[25]) / 100) // MonsterRespawnTime @27278752
  const defend = n(pvt[19]) || 1
  const at1 = (k: string, i: number) => n(arr(s, k)[i])
  const e13 = arr(s, 'EbonusThree').length ? at1('EbonusThree', 13) : n(equipmentBonuses(s).three[13]), m14 = n(current(s, 'MasteryBonuses', () => masteryBonuses(s))[14])

  // Monster attacks @27428814..: one hit per cooldown on the first occupied fighter slot. 12: ids 1-70, 13: 10-120, 15 (monster heals): 25-150.
  const mAtk: { k: number; dmg: number; heal: number }[] = []
  if (id >= 1 && id <= 70) mAtk.push({ k: 12, dmg: Math.ceil(Math.max(mTot ** 0.83 / 70 + (id / 2 - 0.5), 0)), heal: 0 })
  if (id >= 10 && id <= 120) mAtk.push({ k: 13, dmg: mTot ** 0.9 / 27, heal: 0 })
  if (id >= 25 && id <= 150) mAtk.push({ k: 15, dmg: 0, heal: 10 + (page - 1) ** 0.5 })

  const DT = 0.05, cd = Array<number>(22).fill(0), src = new Map<string, number>()
  let mHP = mTot, hp = hpTot, curse = 0, rad = 0, rattle = 0, kills = 0, deaths = 0, killStart = 0, killTime = 0, hpSum = 0, steps = 0
  let respawnLeft = 0, deadLeft = 0, taken = 0
  // One damaging hit of weight w (1, or the Genesis chance for a copy); rolls = curse-combo rolls it makes (Boomerang: one per bounce).
  const hit = (name: string, v: number, w: number, rolls = 1) => { // v: expected value before AllPetDmgMultiplier, already × w
    if (respawnLeft > 0) return
    const d = v * allPetDmgMultiplier(s, { hp, hpTot, curse, rad, genes: g, pvt, e13, m14 })
    mHP -= d; src.set(name, (src.get(name) ?? 0) + d)
    rad *= 1 - w * (1 - keep); curse += curseCombo * w * rolls
  }
  for (let t = 0; t < seconds; t += DT) {
    steps++; hpSum += hp / hpTot
    if (deadLeft > 0) { // 10 s revive @27237049: +10% HP per second, full HP and monster at 9.8 s, cooldowns reset
      deadLeft -= DT; hp = Math.min(hp + hpTot * 0.1 * DT, hpTot)
      if (deadLeft <= 0) { hp = hpTot; mHP = mTot; curse = rad = rattle = 0; killStart = t }
      continue
    }
    for (let k = 1; k <= 21; k++) cd[k]! += DT
    for (let k = 1; k <= 11; k++) {
      if (cd[k]! < req[k]!) continue
      cd[k] = 0
      if (k === 3) { // Healing @5011006: 5% per gene, +2·tier% below half HP, × Health combo; Genesis copy heals ×1
        const pct = 5 * fighters.reduce((c, f) => c + abil(f).filter((a) => a === 3).length, 0) // +5 per gene slot (@27342269), not PetValue1
        if (!pct) continue // fires only when a fighter carries it
        const heal = hpTot * health * (pct + 2 * tier(G(3)) * Math.floor(2 - (hp / hpTot) * 2)) / 100
        hp = Math.min(hp + heal * (1 + below(n(pvt[22]))), hpTot); taken -= heal * (1 + below(n(pvt[22])))
        continue
      }
      const shots = volley(s, k, g, rattle)
      for (const { i, v: shot } of shots) for (const copy of [false, true]) {
        const w = copy ? pGenesis : 1, v = shot * (copy ? genesisMult(k, g) : 1)
        if (!w) continue
        if (k === 2 || k === 8) { // Curse Skull: +value% damage, Radiation: +value×100% to the next hits; both until the monster dies
          if (respawnLeft <= 0) { if (k === 2) curse += w * v; else rad += w * v; curse += curseCombo * w }
          continue
        }
        let dmg = w * hitValue(k, k === 6 ? v * bubbleGrowth(i, g, copy) : v, g, pvt)
        if (k === 5) { // Life Leech @5082207: ×Health combo ×(1 + 150·(1 − HP/HPtot)·tier/100); heals HPtot·value/MonsterHPtot
          dmg *= health * (1 + (150 * (1 - hp / hpTot) * tier(G(5))) / 100)
          if (respawnLeft <= 0) { hp = Math.min(hp + hpTot * (dmg / mTot), hpTot); taken -= hpTot * (dmg / mTot) }
        }
        hit(k === 11 ? 'basic attack' : GENES[k]!, dmg, w, k === 4 ? 1 / (1 - bounce) : 1)
        if (k === 9 && respawnLeft <= 0) rattle += w * rattleStep(g)
      }
    }
    for (const a of mAtk) {
      if (cd[a.k]! < req[a.k]!) continue
      cd[a.k] = 0
      if (a.heal) { if (respawnLeft <= 0) mHP = Math.min(mHP + (a.heal / 100) * mTot, mTot) }
      else { hp -= a.dmg * (1 - evade) * defend; taken += a.dmg * (1 - evade) * defend }
    }
    if (respawnLeft > 0) { respawnLeft -= DT; if (respawnLeft <= 0) { mHP = mTot; curse = rad = rattle = 0; killStart = t } }
    else if (mHP <= 0) { kills++; killTime += t - killStart; respawnLeft = respawn } // @27284246
    if (hp <= 0) { deaths++; hp = 0; deadLeft = 10; respawnLeft = 0; cd.fill(0) }
  }
  const total = [...src.values()].reduce((a, b) => a + b, 0)
  const progress = deadLeft > 0 || respawnLeft > 0 ? 0 : Math.max(1 - mHP / mTot, 0) // the fight in progress counts pro rata
  return { monster: id, monsterHP: mTot, killsPerMin: ((kills + progress) * 60) / seconds, killSec: kills ? killTime / kills : Infinity, deathsPer10Min: (deaths * 600) / seconds,
    avgHpPct: hpSum / steps, dps: total / seconds, hpTot, notModelled, taken,
    bySource: [...src].map(([name, d]) => ({ name, share: d / (total || 1) })).sort((a, b) => b.share - a.share) }
}

type Slot = (typeof TREK_SLOTS)[number]
/** Trek slots open on this save (Trekking level, or the MTX slot pack). */
export const openSlots = (save: Save) => { const tlv = n(save.TrekkingLV), mtx = n(arr(save, 'whichMTXpurchased')[50]); return TREK_SLOTS.filter((s) => tlv >= s.lv || (s.mtx > 0 && mtx >= s.mtx)) }
/** Same pets in each role (slots fill in add order, so only the set per role matters). */
const sameRoles = (open: readonly Slot[], a: Team, b: Team) => open.every((s) => open.filter((x) => x.role === s.role).map((x) => a[x.p]).sort().join() === open.filter((x) => x.role === s.role).map((x) => b[x.p]).sort().join())

/** Best team by `score`: brute-force one role's open slots (other role kept), alternate fighters/supports until neither
 *  changes, from each start (pets that fail `eligible` removed from it); keep the best. Pool = top-level pet per species + gene
 *  set passing `eligible`, unknown (-1) genes left out, one pet per species per team (the author, in game 2026-10-09).
 *  An open slot is never left empty: a partial team only wins if no full set exists.
 *  ponytail: C(pool, slots) sims per pass, ~1k at 14×4 — prune by species if the pool grows past ~25. */
export function bestTeam(save: Save, pets: Pet[], starts: Team[], score: (t: Team) => number, eligible: (p: Pet) => boolean): Team {
  const open = openSlots(save), bySlot = new Map(pets.map((p) => [p.slot, p]))
  const bestFor = (team: Team, role: 'fighter' | 'support'): Team => {
    const slots = open.filter((s) => s.role === role).map((s) => s.p)
    const other = open.filter((s) => s.role !== role).map((s) => team[s.p])
    const otherSpecies = new Set(other.map((x) => bySlot.get(x!)?.name).filter(Boolean))
    const pool = new Map<string, Pet>()
    for (const p of pets) {
      if (!eligible(p) || otherSpecies.has(p.name) || p.genes.includes(-1) || other.includes(p.slot)) continue
      const k = `${p.name}|${[...p.genes].sort().join(',')}`, o = pool.get(k)
      if (!o || o.level < p.level) pool.set(k, p)
    }
    const cand = [...pool.values()]
    let best = team, best$ = slots.every((p) => bySlot.has(team[p]!)) ? score(team) : -1
    const pick = (from: number, chosen: Pet[]) => {
      if (chosen.length === slots.length || (from >= cand.length && chosen.length === Math.min(slots.length, cand.length))) {
        const t = { ...team }; slots.forEach((p, i) => (t[p] = chosen[i]?.slot ?? -1))
        const sc = score(t); if (sc > best$ + 1e-9) { best$ = sc; best = t }
        return
      }
      for (let i = from; i < cand.length; i++) if (!chosen.some((c) => c.name === cand[i]!.name)) pick(i + 1, [...chosen, cand[i]!])
    }
    pick(0, [])
    return best
  }
  const descend = (start: Team) => { let t = start; for (let i = 0; i < 4; i++) { const next = bestFor(bestFor(t, 'fighter'), 'support'); if (sameRoles(open, next, t)) break; t = next } return t }
  const strip = (t: Team) => { const u = { ...t }; for (const s of open) { const p = bySlot.get(u[s.p]!); if (!p || !eligible(p)) u[s.p] = -1 } return u }
  const st = starts.map(strip).filter((t, i, all) => all.findIndex((u) => sameRoles(open, u, t)) === i)
  return st.map(descend).reduce((x, y) => (score(y) > score(x) + 1e-9 ? y : x))
}

export interface TrekOption { name: string; team: Team; moves: string[]; result: TrekResult; genes: string }

/** Current team plus candidate swaps from owned pets, ranked by kills per minute. Each "combo" option greedily places pets
 *  carrying the gene into open slots of the right role (attack genes: fighters; others: supports), picking at each step the
 *  swap the simulation likes best, until the combo (3 of the gene) is reached. */
export function trekOptions(save: Save, pets: Pet[], search = false): TrekOption[] {
  const tlv = n(save.TrekkingLV), mtx = n(arr(save, 'whichMTXpurchased')[50])
  const open = TREK_SLOTS.filter((s) => tlv >= s.lv || (s.mtx > 0 && mtx >= s.mtx))
  const cur = teamOf(save), bySlot = new Map(pets.map((p) => [p.slot, p]))
  const label = (slot: number) => { const p = bySlot.get(slot); return p ? `${p.name} L${p.level} (${p.genes.map((x) => GENES[x]).join('+') || '—'}; ${p.group === 'Idle' ? invText(slot) : `${p.group} ${p.position}`})` : '—' }
  const geneCount = (team: Team, id: number) => n(petGenes(withTeam(save, team))[id])
  const score = (team: Team) => simulateTrek(save, team, 300).killsPerMin
  // One pet per species per team (the author, in game 2026-10-09).
  const legal = (team: Team) => { const sp = Object.values(team).map((s) => bySlot.get(s)?.name).filter(Boolean); return new Set(sp).size === sp.length }
  const make = (name: string, team: Team): TrekOption => {
    const moves = open.filter((s) => team[s.p] !== cur[s.p]).map((s) => `${s.role} ${s.p}: ${label(cur[s.p]!)} → ${label(team[s.p]!)}`)
    const gs = petGenes(withTeam(save, team))
    return { name, team, moves, result: simulateTrek(save, team), genes: gs.map((c, i) => ({ c: n(c), i })).filter((x) => x.i > 0 && x.c > 0).map((x) => `${GENES[x.i]} ${x.c}`).join(', ') }
  }
  const combo = (start: Team, gene: number): Team | null => {
    const role = gene <= 10 ? 'fighter' : 'support', slots = open.filter((s) => s.role === role).map((s) => s.p)
    let team = { ...start }
    for (let step = 0; step < 4 && geneCount(team, gene) < 3; step++) {
      const inTeam = new Set(Object.values(team))
      const all = pets.filter((p) => p.genes.includes(gene) && !inTeam.has(p.slot)), idle = all.filter((p) => p.group === 'Idle')
      let best: Team | null = null, bestScore = -1
      // idle pets first: don't empty a nest or capsule when an idle pet does the job
      for (const carriers of [idle, all]) { if (best) break; for (const p of carriers) for (const pos of slots) {
        const was = bySlot.get(team[pos]!)
        if (was && was.genes.filter((x) => x === gene).length >= p.genes.filter((x) => x === gene).length) continue
        const t = { ...team, [pos]: p.slot }
        if (!legal(t)) continue
        const sc = geneCount(t, gene) * 1e3 + score(t) // more of the gene first, then kill speed
        if (sc > bestScore) { bestScore = sc; best = t }
      } }
      if (!best) return null
      team = best
    }
    return geneCount(team, gene) >= 3 ? team : null
  }
  const out: TrekOption[] = [make('Current team', cur)]
  // No Evasive combo option: its combo bonus has no code (description only †), so Evasive 3 adds nothing over Evasive 1's dodge.
  const ll = combo(cur, 5)
  if (ll) out.push(make('Life Leech combo', ll))
  // Best single swap of any owned pet into any open slot.
  let best: Team | null = null, bestScore = score(cur)
  const inTeam = new Set(Object.values(cur))
  for (const p of pets) if (!inTeam.has(p.slot)) for (const s of open) { const t = { ...cur, [s.p]: p.slot }; if (!legal(t)) continue; const sc = score(t); if (sc > bestScore + 1e-9) { bestScore = sc; best = t } }
  if (best && !out.some((o) => JSON.stringify(o.team) === JSON.stringify(best))) out.push(make('Best single swap', best))
  if (search) { // full search takes seconds: run on request (Pets tab button), not on every load
  // Alternating passes stop on a local best, so start from the current team and every option above (capsule pets removed); keep the fastest.
  // ponytail: 120 s sim inside the search; rows re-sim at 600 s
  const bt = bestTeam(save, pets, [cur, ...out.map((o) => o.team)], (t) => simulateTrek(save, t, 120).killsPerMin, (p) => p.group !== 'Research')
  // Slots fill in add order, so only the set matters: keep pets that stay where they are, so the moves list shows real swaps.
  const aligned = { ...cur }
  for (const role of ['fighter', 'support'] as const) {
    const ps = open.filter((s) => s.role === role).map((s) => s.p), want = ps.map((p) => bt[p])
    const stay = ps.filter((p) => want.includes(cur[p])), add = want.filter((x) => !stay.some((p) => cur[p] === x))
    ps.filter((p) => !stay.includes(p)).forEach((p, i) => (aligned[p] = add[i]!))
  }
  if (!sameRoles(open, cur, bt)) out.push(make('Best team', aligned))
  }
  return out.sort((a, b) => b.result.killsPerMin - a.result.killsPerMin)
}

// ---- Time to the next trek monster / stage (#49). Distance accrues per KILL, not per second or step:
// - kill handler @27284246: when MonsterHP <= 0 and PetHP > 0 and PetDistanceLV == the selected monster (only the frontier
//   monster pays), PetDistance += (1+PVT[14]) · (1+AscentionLevel[70]/150) · MasteryBonuses[12] · (1+EbonusThree[12]/100)
//   · (1+PVT[13]) · TankBonusLIST[34] · (1+50·PetRewardList[15]/100) · (1+tier(Trekkery gene 20)·TrekkingLV/100) @27287121.
//   A kill while the pets are dead (PetHP <= 0) adds nothing, so a death costs time only (10 s revive, monster reset), and
//   simulateTrek's kills/min already contains that downtime.
// - level-up listener @27291755-27293070: PetDistanceREQ(L) = (100 + L + 7·L^2.3 + 3) · ceil((L+1)/5)^1.8; when PetDistance >
//   REQ-1 it sets PetDistance = REQ, PetDistanceLV += 1, PetDistanceREQprev = REQ, recomputes REQ, selects the new frontier
//   monster, and moves to the next page of 5 monsters when LV > 5·page. So a step costs REQ(L) - REQ(L-1) distance (the first
//   step is the save's PetDistanceREQ - PetDistance), and a "stage" is a page of 5 monsters (the game's name for it is unverified).
// - away time @27224760 / @27303007 pays distance per hour from CalibrationValues[6]; not modelled here (live trek only).
export const trekReq = (L: number) => (100 + (L + 7 * L ** 2.3 + 3)) * Math.ceil((L + 1) / 5) ** 1.8

/** Distance one kill adds on the frontier monster (@27287121). TankBonusLIST[34] has no port: stored value, else 1 (unverified for cloud saves). */
export function killDistance(save: Save): number {
  const pvt = petValueTotals(save), g = petGenes(save)
  const mast = n(current(save, 'MasteryBonuses', () => masteryBonuses(save))[12])
  const tank34 = arr(save, 'TankBonusLIST').length ? n(arr(save, 'TankBonusLIST')[34]) : 1
  return (1 + n(pvt[14])) * (1 + n(arr(save, 'AscentionLevel')[70]) / 150) * mast * (1 + n(arr(save, 'EbonusThree')[12]) / 100) * (1 + n(pvt[13]))
    * tank34 * (1 + (50 * n(arr(save, 'PetRewardList')[15])) / 100) * (1 + (tier(n(g[20])) * n(save.TrekkingLV)) / 100)
}

export interface TrekEta { monster: number; gain: number; onFrontier: boolean; nextMonsterSec: number; nextStageSec: number; stageMonster: number;
  steps: { monster: number; distance: number; killsPerMin: number; sec: number }[] }

/** Seconds to reach monster frontier+1 and the first monster of the next page, for `team` (default: the current one).
 *  Each step is simulated against the monster being fought, kills/min including deaths. */
export function trekEta(save: Save, team: Team = teamOf(save), simSeconds = 300): TrekEta {
  const L = n(save.PetDistanceLV), gain = killDistance(save), selected = n(save.MonsterSelected) + 5 * (n(save.MonsterPageSelected) - 1)
  const stageMonster = 5 * Math.ceil(L / 5) + 1 // first monster of the next page
  const steps: TrekEta['steps'] = []
  let nextStageSec = 0
  for (let m = L; m < stageMonster; m++) {
    const page = Math.ceil(m / 5), s = { ...save, MonsterPageSelected: page, MonsterSelected: m - 5 * (page - 1) }
    const kpm = simulateTrek(s, team, simSeconds).killsPerMin
    const distance = m === L ? n(save.PetDistanceREQ) - n(save.PetDistance) : trekReq(m) - trekReq(m - 1)
    const sec = kpm > 0 ? (Math.max(distance - 1, 0) / gain / kpm) * 60 : Infinity // level-up needs PetDistance > REQ-1
    steps.push({ monster: m, distance, killsPerMin: kpm, sec }); nextStageSec += sec
  }
  return { monster: L, gain, onFrontier: selected === L, nextMonsterSec: steps[0]!.sec, nextStageSec, stageMonster, steps }
}

// ---- Vessels per hour from trekking (the author 2026-10-11: "most effective monster to target for each color vessels/hr").
// Every kill of the selected monster while the pets are alive pays vessels, frontier or not (kill handler @27287534 †: the
// vessel lines sit after the frontier-only distance block, inside `PetHP > 0`). No roll: each kill pays the same amount.
// - colour = min(_VesselTypes[sel + 5·((page−1) mod 8)] + floor((page−1)/8), 2·sel − (page mod 2), 9) †, into PetCurrenciesOwned[colour].
// - amount = (id + floor(id/10)² + floor(id/8)) · 1.06^floor(id/5) · (1 + PetValueTotals[15]/100) · _VesselMULTI †.
// - away (@27225189 †): CalibrationValues[6] kills/h × the same amount × AwayTimeRewarded/3600, on the selected monster.
// - CalibrationValues[6]: a 15 s calibration that every monster click (or frontier level-up) restarts (CountdownR = 15.5,
//   @27491528 †) and finishes at @27516161 † from damage dealt (CV1→CV3) and net damage taken (CV2→CV4) in those 15 s; see calibrate.
/** Scene _VesselTypes (SceneEvents_43 init @27207618 †), index sel + 5·((page−1) mod 8). The ActorEvents_1411 copy (@6063125)
 *  swaps [19]/[20]; the kill and away handlers read the scene's. */
export const VESSEL_TYPES = [0, 1, 1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 2, 3, 2, 1, 3, 1, 2, 3, 2, 3, 2, 3, 1, 3, 4, 1, 2, 3, 3, 4]
/** Vessel colour (PetCurrenciesOwned index) monster id pays † (@27287534). */
export function vesselColour(id: number) {
  const page = Math.ceil(id / 5), sel = id - 5 * (page - 1)
  return Math.min(n(VESSEL_TYPES[sel + 5 * ((page - 1) % 8)]) + Math.floor((page - 1) / 8), 2 * sel - (page % 2), 9)
}
/** Vessels per kill before multipliers † (@27287534). */
export const vesselBase = (id: number) => (id + Math.floor(id / 10) ** 2 + Math.floor(id / 8)) * 1.06 ** Math.floor(id / 5)
/** _VesselMULTI, pet scene init @27188109 †: (1 + double-vessel MTX) · lab TankBonusLIST[2] · (1 + Tinkering "Vessel Gain" EbonusThree[10]%)
 *  · (1 + skill-tree node 63 SkillLevels[63]%) · (1 + 2·PotionLV[100]%) · MasteryBonuses[20]. The MTX count is raised to DoubleVesselsBought first †. */
export function vesselMulti(save: Save) {
  const at = (k: string, i: number) => n(arr(save, k)[i])
  const mtx = Math.max(at('whichMTXpurchased', 53), n(save.DoubleVesselsBought))
  const t2 = arr(save, 'TankBonusLIST').length ? at('TankBonusLIST', 2) : 1 // ponytail: TankBonusLIST[2] not ported (cloud saves lack it)
  const e10 = arr(save, 'EbonusThree').length ? at('EbonusThree', 10) : n(equipmentBonuses(save).three[10])
  const m20 = n(current(save, 'MasteryBonuses', () => masteryBonuses(save))[20])
  return (1 + mtx) * t2 * (1 + e10 / 100) * (1 + at('SkillLevels', 63) / 100) * (1 + (2 * at('PotionLV', 100)) / 100) * m20
}
/** Vessels one kill of monster id pays with the team in `save` (Loot gene → PetValueTotals[15], × Discovery combo †). */
export const vesselsPerKill = (save: Save, id: number) => vesselBase(id) * (1 + n(petValueTotals(save)[15]) / 100) * vesselMulti(save)

/** CalibrationValues[5]/[6] from 15 s of damage dealt (cv3) and net damage taken (cv4) @27516161 †: kills/h with the respawn gap,
 *  3600/(killTime + respawn), × the share of time alive, D/(D + 10) with D = 15·PetHPtot/cv4 seconds to die (10 s revive). 0 if the
 *  monster has never been killed (MonstersKilled[id] = 0). */
export function calibrate(cv3: number, cv4: number, mHP: number, respawn: number, hpTot: number, killed = 1) {
  const d1 = cv3 === 0 ? 0 : 1 / ((240 * cv3 * respawn) / (3600 * mHP)), cv5 = (d1 / (d1 + 1)) * ((240 * cv3) / mHP)
  const d2 = (15 * hpTot) / Math.max(cv4, 1)
  return { cv5, cv6: killed > 0 ? cv5 * (d2 / (d2 + 10)) : 0 }
}

const atMonster = (save: Save, id: number): Save => { const page = Math.ceil(id / 5); return { ...save, MonsterPageSelected: page, MonsterSelected: id - 5 * (page - 1) } }
export const VESSEL_NAMES = ['', 'green', 'orange', 'red', 'yellow'] // PetCurrenciesOwned[1..4] †; colours wiki
export const vesselColourName = (c: number) => VESSEL_NAMES[c] ?? `vessel ${c}`

export interface VesselRow { monster: number; colour: number; perKill: number; killsPerHour: number; awayKillsPerHour: number
  /** vessels per hour watching the screen / per real hour away (× away %) / per candy hour (full away rate) */
  live: number; away: number; candy: number; frontier: boolean
  /** away kills/h is the save's own CalibrationValues[6] (selected monster), not the sim-fed estimate */
  awayMeasured: boolean
  /** away vessels/h from the sim-fed calibration for every monster, measured or not: like-for-like for ranking */
  awayEst: number }

/** Vessels per hour for every monster you can select (1..frontier) with `team`, and per colour the best and runner-up by
 *  vessels per hour on screen. Live kills/h from simulateTrek; away kills/h from the game's 15 s calibration fed by a 15 s sim. */
export function vesselFarm(save: Save, team: Team = teamOf(save), simSeconds = 300) {
  const frontier = n(save.PetDistanceLV), selected = n(save.MonsterSelected) + 5 * (n(save.MonsterPageSelected) - 1)
  const pct = (awayPercent(save) ?? 100) / 100
  const s0 = withTeam(save, team), perKillTeam = (1 + n(petValueTotals(s0)[15]) / 100) * vesselMulti(s0)
  const respawn = 1 / (1 + n(petValueTotals(s0)[25]) / 100), hpTot = petHPtot(s0)
  const rows: VesselRow[] = []
  for (let m = 1; m <= frontier; m++) {
    const s = atMonster(save, m), r = simulateTrek(s, team, simSeconds), c = simulateTrek(s, team, 15)
    // The selected monster's away rate is the stored calibration (measured in game); others: the calibration fed by a 15 s sim.
    const est = calibrate(c.dps * 15, c.taken, c.monsterHP, respawn, hpTot, 1).cv6 // ponytail: assumes MonstersKilled > 0
    const stored = m === selected && n(arr(save, 'CalibrationValues')[6]) > 0
    const awayKph = stored ? n(arr(save, 'CalibrationValues')[6]) : est
    const perKill = vesselBase(m) * perKillTeam
    rows.push({ monster: m, colour: vesselColour(m), perKill, killsPerHour: r.killsPerMin * 60, awayKillsPerHour: awayKph,
      live: r.killsPerMin * 60 * perKill, away: awayKph * perKill * pct, candy: awayKph * perKill, frontier: m === frontier, awayMeasured: stored, awayEst: est * perKill * pct })
  }
  const colours = [...new Set(rows.map((r) => r.colour))].sort((a, b) => a - b).map((colour) => {
    const by = rows.filter((r) => r.colour === colour).sort((a, b) => b.live - a.live)
    const bestAway = [...by].sort((a, b) => b.awayEst - a.awayEst)[0]!
    return { colour, name: vesselColourName(colour), best: by[0]!, runnerUp: by[1] ?? null, bestAway, current: rows.find((r) => r.monster === selected) ?? null }
  })
  return { rows, colours, frontier, selected, multi: vesselMulti(s0), lootPct: n(petValueTotals(s0)[15]), current: rows.find((r) => r.monster === selected) ?? null, awayPct: pct * 100, awayPctKnown: awayPercent(save) != null }
}
