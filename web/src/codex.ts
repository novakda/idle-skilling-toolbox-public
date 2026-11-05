// Codex (#45): the pet Codex scene (SceneEvents_46, screen 21; init † @29050781). Three tabs: every species recorded
// (PetUnlocked) with its gene and capsule passive, the genetic list with combos found, and the level-up rewards of Hatchery,
// Trekking and Research. Lists come from the scene's own init (src/derive-codex.ts → data/codex.json); every rule below cites
// its Qno2x.js offset (†) and is checked in codex.test.ts against the stored save or the game's own code in the sandbox.
import data from './data/codex.json'
import lab from './data/lab.json'
import { petGenes, petsView, TREK_SLOTS, type Pet } from './pets'
import { capsuleExpRate } from './bus'
import * as NX from './next-types'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const D = data as unknown as { name: string[]; gene: number[]; buffType: string[]; buffAmount: (number | string)[]; genes: string[][]; combos: string[][]; rewards: string[][] }

/** Species the Codex pages show: 2 per page, ids 2(p − 10) and +1, skipping 70 and 85 († page draw @29207059, @29229254):
 *  0-45 bred, 71-84 raid/asylum/secret. */
export const SPECIES = D.name.map((_, id) => id).filter((id) => id < 85 && D.name[id] !== 'Nothing')
export const petName = (id: number) => (D.name[id] ?? `#${id}`).replace(/_/g, ' ')
export const geneName = (g: number) => D.genes[g]?.[0] ?? `gene ${g}`

/** Capsule passive as the Codex page prints it († @29215757): "+round(amount × PetCapsuleLV)" + type, except Pachi balls:
 *  round((amount × LV)^0.7). Types starting "%" are percentages. */
export function passive(id: number, lv: number, amount = n(D.buffAmount[id])) {
  const a = amount, t = String(D.buffType[id] ?? '')
  const v = t === '%_PACHI_BALLS' ? Math.round((a * lv) ** 0.7) : Math.round(a * lv)
  return { v, pct: t.startsWith('%'), what: t.replace(/^%?_/, '').replace(/_/g, ' ').toLowerCase() }
}
export const passiveText = (id: number, lv: number, amount?: number) => { const p = passive(id, lv, amount); return `+${p.v}${p.pct ? '%' : ''} ${p.what}` }
/** The lab scene builds its own copy of the amounts († @28212482) and applies that one (_PetPassiveBonusLIST from † @28416516;
 *  load-bonuses.ts uses it too). It differs from the Codex's copy († @29091800) for six species: dog 2 → 3, platz 15 → 8,
 *  sentinel y 11 → 10, occulon 6 → 12, golden boy 80 → 150, poopy g 3 → 5 (Codex → lab). Null where they agree. */
export const labAmount = (id: number) => { const l = (lab.petBuff as number[])[id]; return l != null && l !== n(D.buffAmount[id]) ? l : null }

/** Capsule level-up (lab, every 500 ms † @28924421): when ⌊PetPassiveDays/86400 · 10⌋ ≥ ⌈5(LV + 1)^1.5⌉ the days drop by
 *  43200(LV + 1)^1.5 and LV rises. So level LV + 1 needs ⌈5(LV + 1)^1.5⌉/10 days banked. */
export const capsuleNeed = (lv: number) => (Math.ceil(5 * (lv + 1) ** 1.5) / 10) * 86400
/** Species in the 6 lab capsules: _PetINDEX[i + 1] = id of PetsFighting[21 + i] by name, 0 (poop) for an empty capsule
 *  (lab init † @28203909). Only these bank passive days. */
export const capsuleIds = (s: Save) => [0, 1, 2, 3, 4, 5].map((i) => { const id = D.name.indexOf(String(arr(s, 'PetsFighting')[21 + i])); return id > 0 && id < 85 ? id : 0 })
/** Away credit per second of away time (lab init † @28195376): (1 + 15·PetRewardList[19]/150 + 25·PetRewardList[22]/150 +
 *  per capsule pet with Ionize (gene 24) as gene 1/2/3: 0.5/0.3/0.2) × TankBonusLIST[45] († @28198970), which is rebuilt
 *  here (load-bonuses.ts capsuleExpRate); the stored value is used only if lab.json lacks its tank part. Both away credits
 *  add away seconds × this († @28262481 at lab init, † @28503998). On the lab screen a capsule banks a flat 0.5 s per 500 ms
 *  tick, so 1 day per day, bonus or not († @28923701). `rows` is each source's factor; they multiply to `rate`. */
export function awaySources(s: Save) {
  const R = arr(s, 'PetRewardList'), pos = arr(s, 'PetPositions')
  let ionize = 0
  for (let i = 0; i < 6; i++) for (const [k, add] of [[1, 0.5], [2, 0.3], [3, 0.2]] as const) if (n(arr(s, `PetAbility${k}`)[n(pos[21 + i])]) === 24) ionize += add
  const r19 = (15 * n(R[19])) / 150, r22 = (25 * n(R[22])) / 150, base = 1 + r19 + r22 + ionize
  const e = capsuleExpRate(s), stored = n(arr(s, 'TankBonusLIST')[45]) || 1
  const pets = e.pets.filter((p) => p.pct).map((p) => `${petName(p.id)} +${+p.pct.toFixed(1)}%`).join(', ')
  const rows = e.known
    ? [{ what: `rewards 19/22 + Ionize capsule pets (+${+r19.toFixed(2)} +${+r22.toFixed(2)} +${+ionize.toFixed(1)})`, factor: base },
      { what: 'lab tank part 24', factor: e.part },
      { what: `capsule exp rate passives (${pets || 'none'})`, factor: e.pet },
      { what: 'Toothpaste Tube (vending 8)', factor: e.vend }]
    : [{ what: 'rewards 19/22 + Ionize capsule pets', factor: base }, { what: 'stored TankBonusLIST[45]', factor: stored }]
  return { rate: rows.reduce((x, r) => x * r.factor, 1), rows, tank45: e.known ? e.value : stored }
}
export const capsuleAwayRate = (s: Save) => awaySources(s).rate

/** One row per species. `left` is banked seconds still needed, which is also the time on the lab screen (1 day per day);
 *  `awayLeft` is that time while away (left / capsuleAwayRate). `applied*` use the lab's amount (what the game applies). */
export function species(s: Save) {
  const caps = capsuleIds(s), rate = capsuleAwayRate(s)
  return SPECIES.map((id) => {
    const lv = n(arr(s, 'PetCapsuleLV')[id]), days = n(arr(s, 'PetPassiveDays')[id]), need = capsuleNeed(lv)
    return { id, name: petName(id), recorded: n(arr(s, 'PetUnlocked')[id]) > 0, gene: D.gene[id]!, lv, now: passive(id, lv).v, next: passive(id, lv + 1).v,
      text: passiveText(id, lv), labAmount: labAmount(id), amount: n(D.buffAmount[id]), nextText: passiveText(id, lv + 1), days, need, left: Math.max(need - days, 0), awayLeft: Math.max(need - days, 0) / rate, progress: Math.min(days / need, 1), inCapsule: caps.includes(id),
      appliedText: passiveText(id, lv, labAmount(id) ?? undefined), appliedNextText: passiveText(id, lv + 1, labAmount(id) ?? undefined) }
  })
}

/** Genes 1-26: unlocked in the Codex once a recorded species carries it (codex init † @29147633: _GeneticUnlocked[_specificGENE[id]]
 *  = 1 for each PetUnlocked id < 85). Combo tier t of gene g is GeneticComboFound[1 + 3(g − 1) + t − 1], set by the trekking
 *  screen once PetGenes[g] reaches 3t († @27258789) and never cleared. `count` = PetGenes[g] (team genes, pets.ts petGenes). */
export function genes(s: Save) {
  const found = arr(s, 'GeneticComboFound'), team = petGenes(s), rec = SPECIES.filter((id) => n(arr(s, 'PetUnlocked')[id]) > 0)
  return D.genes.slice(1).map((g, i) => {
    const id = i + 1, count = n(team[id]), tier = Math.min(Math.floor(count / 3), 3), carriers = SPECIES.filter((x) => D.gene[x] === id)
    return { id, name: g[0]!, type: g[1]!, desc: g.slice(2).filter((x) => x).join(' '), unlocked: carriers.some((x) => rec.includes(x)), carriers,
      recordedCarriers: carriers.filter((x) => rec.includes(x)), count, tier, toNext: tier >= 3 ? 0 : 3 * (tier + 1) - count,
      combos: [1, 2, 3].map((t) => ({ t, found: n(found[1 + 3 * (id - 1) + t - 1]) > 0, text: D.combos[1 + 3 * (id - 1) + t - 1]!.filter((x) => x).join(' ') })) }
  })
}

/** Level-up rewards k 1-24 (8 each): the Codex init sets PetRewardList[k] = 1 once the skill level reaches the threshold
 *  († @29145227). Nothing else sets it, and the game reads the flag (not the level) for k 1, 2, 4, 6 and 15-22 (18
 *  reads, e.g. nest speed † @27576247), so a reached reward does nothing until you open the Codex. k 8 also grants Poopy G
 *  there (PetLvl[5]). No code reads k 23 or 24. The scene shows k 7, 8, 15, 16, 23, 24 as "???" until reached (k 15 from Trekking 80, † @29151599). */
export const SKILLS = ['Hatchery', 'Trekking', 'Research'] as const
export const FLAG_READ = new Set([1, 2, 4, 6, 8, 15, 16, 17, 18, 19, 20, 21, 22])
export function rewards(s: Save) {
  return D.rewards.slice(1).map(([lvText, bonus], i) => {
    const k = i + 1, skill = SKILLS[Math.floor(i / 8)]!, at = Number(lvText!.replace(/\D/g, '')), lv = n(s[`${skill}LV`]), held = n(arr(s, 'PetRewardList')[k]) === 1
    return { k, skill, at, bonus: bonus!, lv, held, reached: lv >= at, pending: lv >= at && !held && FLAG_READ.has(k), unread: k >= 23 }
  })
}

/** Daily claim (region 8/9 click † @29328283): with PetClaimTimer < 0 and room in the inventory, tapping a recorded species
 *  gives a level 1, rarity 1 copy with its own gene as gene 1, and the timer restarts at 86400 s. The timer counts down 1/s on
 *  the Codex screen († @29261277) and by the time since your last visit when you open it († @29153885). */
export function claim(s: Save, now = Date.now() / 1000) {
  const away = Math.max(now - n(arr(s, 'LastVisitedZone')[21]), 0) * n(arr(s, 'HaveyouBeenBeforeZone')[21])
  const timer = n(s.PetClaimTimer) - away, size = 5 * n(s.PetInventoryOwned)
  let used = 0
  for (let i = 1; i <= size; i++) if (String(arr(s, 'PetsOwned')[i] ?? 'Nothing') !== 'Nothing') used++
  return { ready: timer < 0, timer, wait: Math.max(timer, 0), free: size - used }
}

/** Next tiers, each list ranked by how soon it unlocks (closest first). Different kinds are not weighed against each other:
 *  their bonuses are different stats. */
export function nextTiers(s: Save) {
  const r = rewards(s)
  const next = SKILLS.map((k) => r.find((x) => x.skill === k && !x.reached)).filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => ({ ...x, levels: x.at - x.lv, pct: n(s[`${x.skill}REQ`]) ? n(s[`${x.skill}EXP`]) / n(s[`${x.skill}REQ`]) : 0 }))
    .sort((a, b) => a.levels - a.pct - (b.levels - b.pct))
  const combos = genes(s).filter((g) => g.count > 0 && g.tier < 3).sort((a, b) => a.toNext - b.toNext || b.count - a.count)
  const capsules = species(s).filter((x) => x.inCapsule && x.id > 0).sort((a, b) => a.left - b.left)
  return { rewards: next, combos, capsules, pending: r.filter((x) => x.pending) }
}

/** A shallow copy is enough for the page (Vue hands the save in as a reactive proxy, which structuredClone rejects). */
export function codex(save: Save, now?: number) {
  const s = { ...save }
  const sp = species(s), g = genes(s)
  return { species: sp, genes: g, rewards: rewards(s), claim: claim(s, now), next: nextTiers(s), awayRate: capsuleAwayRate(s), away: awaySources(s),
    recorded: sp.filter((x) => x.recorded).length, unlockedGenes: g.filter((x) => x.unlocked).length,
    combosFound: g.reduce((t, x) => t + x.combos.filter((c) => c.found).length, 0) }
}
export type Codex = ReturnType<typeof codex>

/** What to take with a ready daily claim: a recorded carrier of the gene closest to an unfound combo tier. A claimed pet has
 *  its species' gene as gene 1, so on the team it adds to that gene's count; the trekking screen sets the combo once the
 *  count reaches 3t and never clears it, so the pet can leave the team afterwards. null when no combo is within reach. */
const lexGt = (a: number[], b: number[]) => { const i = a.findIndex((v, j) => v !== b[j]); return i >= 0 && a[i]! > b[i]! }

export function claimPick(s: Save) {
  const g = nextTiers(s).combos.find((x) => x.recordedCarriers.length && !x.combos[x.tier]!.found)
  if (!g) return null
  // An idle owned pet (not a nest parent: moving one clears its eggs; not a capsule pet) that already carries the gene does it today, no claim and no level-1 pet (the author, 2026-10-23).
  // The game allows one pet per species on the team (the author, 2026-10-25: a second fireplop could not join while one sat in support), so a
  // candidate whose species is already there must replace that pet and adds only its extra copies of the gene. Rank by copies added.
  const pets = petsView(s).pets, copies = (p: Pet) => p.genes.filter((x) => x === g.id).length
  // Plan every swap needed to reach the next combo, greedily: each step puts the idle carrier that adds the most copies into
  // its twin's spot (one per species), else an empty unlocked slot, else over the team pet holding the fewest copies (lowest
  // level first). Gene-role slots first (attack genes fighters, others supports, as trekOptions places them), then the rest.
  const role = g.id <= 10 ? 'fighter' : 'support', tlv = Number(s.TrekkingLV ?? 0), mtx = Number((s.whichMTXpurchased as number[] | undefined)?.[50] ?? 0)
  const placed = (s.PetPositions as number[] | undefined) ?? []
  const open = TREK_SLOTS.filter((x) => tlv >= x.lv || (x.mtx > 0 && mtx >= x.mtx)).sort((a, b) => +(b.role === role) - +(a.role === role))
  const posName = (pos: number) => (pos <= 4 ? `Fighter ${pos}` : `Support ${[5, 6, 19, 20].indexOf(pos) + 1}`)
  const at = new Map<number, Pet | undefined>(open.map((x) => [x.p, pets.find((q) => q.slot === Number(placed[x.p]))]))
  const moved = new Set<number>(), swaps: { pin: Pet; pos: number; out?: Pet; adds: number }[] = []
  let gained = 0
  while (gained < g.toNext) {
    let best: { pin: Pet; pos: number; out?: Pet; adds: number } | null = null
    for (const pin of pets.filter((q) => q.group === 'Idle' && q.genes.includes(g.id) && !moved.has(q.slot))) {
      const twin = [...at].find(([, t]) => t?.species === pin.species)
      const options = twin ? [twin[0]] : [...at].filter(([, t]) => !t || !moved.has(t.slot)).map(([pos]) => pos)
      for (const pos of options) {
        const out = at.get(pos), adds = copies(pin) - (out ? copies(out) : 0)
        // Rank: copies that count toward the combo, then a gene-role slot, then an empty slot or the lowest-level pet out, then the higher-level pet in.
        const c = { pin, pos, out, adds }, rank = (x: NonNullable<typeof best>) => [Math.min(x.adds, g.toNext - gained), +(open.find((o) => o.p === x.pos)!.role === role), -(x.out?.level ?? -1), x.pin.level]
        if (adds > 0 && (!best || lexGt(rank(c), rank(best)))) best = c
      }
    }
    if (!best) break
    swaps.push(best); moved.add(best.pin.slot); at.set(best.pos, best.pin); gained += best.adds
  }
  if (swaps.length) {
    const steps = swaps.map((w, i) => `${i + 1}) your ${w.pin.name} #${w.pin.slot} L${w.pin.level} (idle) ${w.out ? `in place of your ${w.out.name} #${w.out.slot} L${w.out.level} (${posName(w.pos)})` : `in the empty ${posName(w.pos)} slot`} +${w.adds}`)
    const back = swaps.filter((w) => w.out).map((w) => `${w.out!.name} #${w.out!.slot} to ${posName(w.pos)}`)
    // A claimed pet only helps if its species is not on the team yet (one per species).
    const onTeam = new Set([...at.values()].map((t) => t?.species)), fresh = g.recordedCarriers.filter((c) => !onTeam.has(c))
    const done = gained >= g.toNext, who = fresh.length ? `a ${fresh.map(petName).join(' or ')}` : `a ${g.recordedCarriers.map(petName).join(' or ')} with more ${g.name} copies than yours (that species is already on the team, one per species)`
    return { gene: g, who: swaps[0]!.pin.name, owned: true,
      text: `${done ? 'no claim needed' : `idle pets get you +${gained} of ${g.toNext}`}: ${steps.join('; ')}${done ? `, reaching combo ${g.tier + 1} (${g.name} ${3 * (g.tier + 1)})` : `; still ${g.toNext - gained} short, so the rest needs ${who}`}`,
      why: `${g.combos[g.tier]!.text}. The combo registers once the team reaches ${3 * (g.tier + 1)} and stays found${back.length ? `; then put back: ${back.join(', ')}` : ''}.` }
  }
  const who = g.recordedCarriers.map(petName).join(' or ')
  return { gene: g, who, owned: false, text: `take a ${who}: ${g.name} is ${g.toNext} gene${g.toNext === 1 ? '' : 's'} short of combo ${g.tier + 1}`,
    why: `${g.combos[g.tier]!.text}. Put it on the team until the combo registers (found combos stay)${g.toNext > 1 ? `; one claim a day, so ${g.toNext} days` : ''}${g.id <= 10 ? '; attack genes count on fighters only' : ''}.` }
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'codex', title: 'Codex', src: 'codex.ts claim, rewards', fn: (s, x) => {
    // Opening the Codex does two things: the daily pet claim (timer restarts at 86400 s on claim, so a ready claim doesn't
    // stack) and setting reached level-up reward flags, which the game reads instead of the level (codex.ts rewards).
    const c = claim(s, x.now), pick = claimPick(s), ready = c.ready ? [{ text: c.free <= 0 ? 'Daily pet ready, but the inventory is full' : pick ? `Claim the daily pet: ${pick.text}` : 'Claim the daily pet',
      why: `${pick && c.free > 0 ? pick.why + ' ' : ''}Ready for ${NX.dur(-c.timer)}; one claim a day, a waiting claim doesn't stack (${c.free} free slot${c.free === 1 ? '' : 's'}).` }] : []
    return [...ready, ...rewards(s).filter((r) => r.pending).map((r) => ({ text: `Open the Codex to switch on ${r.skill} ${r.at}: ${r.bonus}`, why: 'reached, but inactive until the Codex sets its flag' }))]
  }}
