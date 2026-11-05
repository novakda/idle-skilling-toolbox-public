<script setup lang="ts">
import { SECTION_ALIASES, sectionRef } from '../../section'
import { computed, ref } from 'vue'
import { hatchPlan, invPlace, swapEggs, invText, nestUpgradeCost, petsView, statusName, type Pet } from './pets'
import { trekEta, trekOptions, vesselFarm, vesselColourName } from './pet-combat'
import { breedingPlan } from './pet-breeding'
import { GOALS, goalPlan, loadGoal, saveGoal, type GoalId } from './pet-goals'
import { FOCUSES, bestLoadouts, savedLoadouts, type FocusResult } from './trek-loadouts'
import { genePlan, speciesWith } from './pet-genes'
import { candyHeld } from '../candy/candy'
import { awaySources, claim, claimPick, species } from './codex'
import { petLinkDeck } from '../cards/cards-calc'
import cardCatalog from '../../data/card-catalog.json'
import Icon from '../../components/Icon.vue'
import PetCells from './PetCells.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
// The trash rule keeps idle pets that a faster trek team uses, so it reads the trek options: the quick ones (~0.2 s) on load,
// the full best-team search (~15 s on the author's save) once "Find best team" is clicked, which then recomputes the trash list.
const search = ref(false)
const base = computed(() => { try { return props.save ? petsView(props.save) : null } catch (e) { console.warn('pets:', e); return null } })
const trek = computed(() => { try { return props.save && base.value ? (search.value ? trekOptions(props.save, base.value.pets, true) : base.value.trek) : [] } catch (e) { console.warn('trek:', e); return [] } })
const v = computed(() => { try { return props.save && search.value ? petsView(props.save, trek.value) : base.value } catch (e) { console.warn('pets:', e); return null } })
const hatch = computed(() => (v.value ? hatchPlan(v.value) : null))
const breed = computed(() => { try { return props.save && v.value ? breedingPlan(props.save, v.value) : null } catch (e) { console.warn('breeding:', e); return null } })
const goal = ref<GoalId>(loadGoal())
const setGoal = (e: Event) => { goal.value = (e.target as HTMLSelectElement).value as GoalId; saveGoal(goal.value) }
const goalBlurb = computed(() => GOALS.find((g) => g.id === goal.value)?.blurb ?? '')
const goalRes = computed(() => { try { return props.save && v.value && goal.value !== 'balanced' ? goalPlan(props.save, v.value, goal.value, goal.value === 'vessels' ? farm.value : null) : null } catch (e) { console.warn('goal:', e); return null } })
const pairText = (ps: Pet[]) => ps.map((p) => `${p.name} L${p.level}`).join(' + ')
// The Codex's daily free pet, when ready: which species to take (codex.ts claimPick).
const daily = computed(() => { const sv = props.save; if (!sv) return null; const c = claim(sv); const pick = claimPick(sv); return pick && (pick.owned || (c.ready && c.free > 0)) ? pick : null })
const statusSummary = computed(() => [0, 1, 2, 3].map((s) => `${v.value?.pets.filter((p) => p.status === s).length ?? 0} ${statusName(s)}`).join(', '))
const allPets = computed(() => [...(v.value?.pets ?? [])].sort((a, b) => a.slot - b.slot)) // slot order = inventory page, then spot
const trashSlots = computed(() => new Set(v.value?.trash.map((t) => t.pet.slot)))
const rar = (rs: number[]) => rs.map((r) => `r${r}`).join(' ')
const afterSlots = computed(() => new Set(v.value?.afterTrash.map((t) => t.pet.slot)))
// Shown in inventory order (page, then position) so they are easy to find in game; WHICH ones to trash stays the
// heuristic's priority order (lowest level first), so the verdict keys off that set, not the row index.
const bySlot = <T extends { pet: Pet }>(xs: T[]) => [...xs].sort((a, b) => a.pet.slot - b.pet.slot)
const trashBySlot = computed(() => (v.value ? bySlot(v.value.trash) : []))
const toHatch = computed(() => new Set(v.value?.trash.slice(0, Math.max(v.value.eggsWaiting - v.value.free, 0)).map((t) => t.pet.slot)))
const pct = (x: number) => `${Math.round(100 * x)}%`
const pc = (x: number) => `${x >= 1 || x === 0 ? +x.toFixed(1) : +x.toPrecision(2)}%`
const dur = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`)
const sci = (x: number) => (Math.abs(x) >= 1e6 ? x.toExponential(2) : Math.round(x).toLocaleString())
// Knee: past the level where the bonus is half its ceiling (pets.ts LabKnee), each level buys under half what the first did.
const pastKnee = (u: { level: number; knee?: { knee: number; pctCeiling: number } | null }) => !!u.knee && (u.level >= u.knee.knee || u.knee.pctCeiling >= 1)
const labRows = computed(() => v.value?.lab.upgrades.filter((u) => u.unlocked || u.tank === 101 || u.tank === 111) ?? [])
const nearest = computed(() => v.value?.lab.upgrades.filter((u) => u.unlocked && !u.maxed && (u.gain > 0 || u.tank === 101))
  .map((u) => ({ u, have: v.value!.lab.vessels.find((x) => x.v === u.vessel)?.have ?? 0 })).sort((a, b) => a.u.cost / Math.max(a.have, 1) - b.u.cost / Math.max(b.have, 1)).slice(0, 3) ?? [])
const costText = (c: ReturnType<typeof nestUpgradeCost>) => [`${sci(c.cash)} cash`, c.vessel && `${sci(c.vessel.cost)} ${vname(c.vessel.v)}`, c.shell && `${c.shell.cost} r${c.shell.rarity} shells`].filter(Boolean).join(' + ')
// Mainframe names already say their tier ("Mainframe: tier 2"); others get it appended.
const p1 = (x: number) => +x.toFixed(1)
// The buy list repeats one upgrade level by level: show each upgrade once, with its level range and total cost.
const buyGroups = computed(() => {
  const out: { u: any; from: number; to: number; cost: number; odds: number; first: string; last: string }[] = []
  for (const b of v.value?.lab.buy ?? []) {
    const g = out.find((x) => x.u.tank === b.tank && x.u.slot === b.slot)
    if (g) { g.to = b.level + 1; g.cost += b.cost; g.last = b.gives } else out.push({ u: b, from: b.level + 1, to: b.level + 1, cost: b.cost, odds: b.odds, first: b.gives, last: b.gives })
  }
  return out
})
const ulabel = (u: { name: string; slot: number }) => (/tier \d+$/.test(u.name) ? u.name : `${u.name} tier ${u.slot}`)
// A tank can have several tiers waiting; name each tank once.
const readyTanks = computed(() => [...new Set(v.value?.lab.ready.map((r) => r.tank) ?? [])])
const vname = (i: number) => v.value?.lab.vessels.find((x) => x.v === i)?.name ?? `vessel ${i}`
// Inventory tab: every pet in slot order with what it does now and why it stays (or that it is a trash candidate).
const ROLE: Record<string, string> = { Trekking: 'on the trek team', Research: 'in a research capsule' }
const swapOut = computed(() => new Map((v.value?.swaps ?? []).flatMap((w) => w.out.map((p) => [p.slot, w.text] as const))))
const invRows = computed(() => {
  const kept = new Map(v.value?.kept.map((k) => [k.pet.slot, k.why]) ?? []), trash = new Map(v.value?.trash.map((t) => [t.pet.slot, t.why]) ?? [])
  return allPets.value.map((p) => {
    const doing = p.status === 0 ? 'idle' : `${p.group} ${p.position}`
    const why = trash.has(p.slot) ? `not keeping: trash candidate (${trash.get(p.slot)})`
      : kept.get(p.slot) ?? (ROLE[p.group] ?? (p.group.startsWith('Nest') ? `parent of ${p.group}` : 'placed'))
    const swap = swapOut.value.get(p.slot)
    const after = afterSlots.value.has(p.slot) ? '; trash after the swap' : ''
    return { p, ...invPlace(p.slot), doing, why: (swap ? `${why}; swap suggested: ${swap}` : why) + after, trash: trash.has(p.slot) || !!after }
  })
})
const current = computed(() => trek.value.find((o) => o.name === 'Current team'))
const eta = computed(() => { try { return props.save ? trekEta(props.save) : null } catch (e) { console.warn('trek eta:', e); return null } })
// Sections as tabs (Idleon Toolbox's page tabs, docs/ux-idleon-reference.md); ?section=<id> opens one directly.
const SECTIONS = [['plan', 'Plan'], ['inventory', 'Inventory'], ['hatchery', 'Hatchery'], ['trekking', 'Trekking'], ['loadouts', 'Trek loadouts'], ['genes', 'Genes'], ['research', 'Research'], ['codex', 'Codex']] as const
// Tank numbers as runs: [1,2,3,5] → '1-3, 5'.
const ranges = (ns: number[]) => { const out: string[] = []; for (let i = 0; i < ns.length; ) { let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++; out.push(j > i ? `${ns[i]}-${ns[j]}` : `${ns[i]}`); i = j + 1 } return out.join(', ') }
type Sec = typeof SECTIONS[number][0]
const sec = sectionRef<Sec>(SECTIONS.map(([id]) => id), SECTION_ALIASES.pets)
const farm = computed(() => { try { return props.save ? vesselFarm(props.save) : null } catch (e) { console.warn('vessel farm:', e); return null } })
const candyHours = computed(() => (props.save ? candyHeld(props.save).reduce((t, c) => t + c.hours * c.count, 0) : 0))
const k = (x: number) => (x >= 1e4 ? `${(x / 1000).toFixed(x >= 1e5 ? 0 : 1)}k` : Math.round(x).toLocaleString())
const etaText = (s: number) => (!isFinite(s) ? 'never (0 kills/min)' : s >= 172800 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.max(Math.round(s / 60), 1)} min`)
// Codex tab: every species, capsule pets first, then soonest next level (codex.ts species / awaySources).
const away = computed(() => (props.save ? awaySources(props.save) : null))
const codexRows = computed(() => (props.save ? species(props.save) : []).sort((a, b) => +b.inCapsule - +a.inCapsule || a.left - b.left || a.id - b.id))
const dhm = (sec: number) => (sec >= 86400 ? `${(sec / 86400).toFixed(1)} d` : dur(sec))
// Trek loadouts (#2756): the best saved team per focus. The search runs ~10-20 s per focus, so it starts on a click and fills
// in focus by focus (a short yield between them lets each table render).
const loadouts = ref<FocusResult[]>([]), loadoutRun = ref('')
async function findLoadouts() {
  const sv = props.save, pets = v.value?.pets
  if (!sv || !pets) return
  loadouts.value = []
  for (const f of FOCUSES) {
    loadoutRun.value = f.label; await new Promise((r) => setTimeout(r, 30))
    try { loadouts.value = [...loadouts.value, ...bestLoadouts(sv, pets, [f.id])] } catch (e) { console.warn('loadouts:', e) }
  }
  loadoutRun.value = ''
}
const savedNums = computed(() => (props.save ? savedLoadouts(props.save).map((t, i) => (Object.values(t).some(Boolean) ? i + 1 : 0)).filter(Boolean) : []))
const fv = (x: number) => (x >= 1e6 ? x.toExponential(2) : x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1))
const sgn = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`
// Genes (#2764): census, usefulness and the ranked gene plan (pet-genes.ts). ~1.5 s on the author's save, so only while the tab is open.
const genes = computed(() => { try { return props.save && v.value && sec.value === 'genes' ? genePlan(props.save, v.value) : null } catch (e) { console.warn('genes:', e); return null } })
const geneRows = computed(() => (genes.value?.rows ?? []).filter((r) => r.owned > 0 || r.team > 0).sort((a, b) => b.U - a.U || b.owned - a.owned))
const missing = computed(() => (genes.value?.rows ?? []).filter((r) => r.owned === 0 && r.U >= 2).map((r) => {
  const un = (props.save?.PetUnlocked as number[] | undefined) ?? [], sp = speciesWith(r.id)
  return { ...r, effect: r.why.slice(r.why.indexOf(':') + 1).trim(), from: sp.map((x) => `${x.name}${un[x.id] ? ' (recorded: Codex claim)' : ''}`).join(', ') || 'no species: only from a pool pick' }
}))
const KIND: Record<string, string> = { field: 'Field', breed: 'Breed', claim: 'Claim', genetea: 'Potion', trash: 'Trash' }
const carrierText = (r: { carriers: { pet: Pet; copies: number; status: string }[] }) => r.carriers.map((c) => `${c.pet.name} #${c.pet.slot}${c.copies > 1 ? ` ×${c.copies}` : ''} (${c.status})`).join(', ')
const petDeck = computed(() => (props.save ? petLinkDeck(props.save, cardCatalog as unknown as Parameters<typeof petLinkDeck>[1]) : null))
</script>

<template>
  <section v-if="v">
    <div class="page-head">
      <h2>Pets</h2>
      <p>Which pets to trash for egg space, which nests can prestige, how fast the trek team kills, and where to spend vessels.</p>
      <p class="goal"><label for="pet-goal"><b>Planning for</b></label> <select id="pet-goal" :value="goal" @change="setGoal"><option v-for="g in GOALS" :key="g.id" :value="g.id" :disabled="!!g.disabled" :title="g.disabled || g.blurb">{{ g.label }}{{ g.disabled ? ` (${g.disabled})` : '' }}</option></select>
        <small class="m">{{ goalBlurb }}</small></p>
      <div class="tiles">
        <div class="tile"><b>{{ current ? current.result.killsPerMin.toFixed(1) : '—' }}</b><span>kills/min, trek team</span></div>
        <div class="tile"><b :class="{ 'st-bad': v.free < v.eggsWaiting }">{{ v.used }}/{{ v.size }}</b><span>inventory used</span></div>
        <div class="tile"><b>{{ v.eggsWaiting }}</b><span>eggs waiting</span></div>
        <div class="tile"><b>{{ eta ? (eta.onFrontier ? `~${etaText(eta.nextMonsterSec)}` : 'not advancing') : '—' }}</b><span>to next trek monster (estimate, current team)</span></div>
      </div>
    </div>
    <ul v-if="v.warnings.length" class="warn"><li v-for="w in v.warnings" :key="w">{{ w }}</li></ul>

    <p v-if="petDeck && petDeck.cards.length && petDeck.linkedTotal < petDeck.total"><b>Pet screens deck:</b> {{ petDeck.linked ? `deck ${petDeck.linked.deck} is linked to Trek / Hatchery / Lab with +${p1(petDeck.linkedTotal)}% perk points` : 'no deck is linked to Trek / Hatchery / Lab' }}; put {{ petDeck.cards.map((c) => `${c.name} (+${p1(c.adds.SkillPoints)}%)`).join(', ') }} in a deck linked there for +{{ p1(petDeck.total) }}% perk points on every Hatchery, Trekking and Research level-up. <small class="m">Perk points are the only card bonus the pet screens read (Hatchery level-up @27686807).</small></p>
    <p v-if="daily"><b>{{ daily.owned ? (daily.text.startsWith('no claim') ? 'Combo within reach:' : 'Combo progress:') : 'Daily Codex claim is ready:' }}</b> {{ daily.text }}. <small class="m">{{ daily.why }} †</small></p>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}<small v-if="id === 'inventory'" class="m"> {{ v.pets.length }}</small></button>
    </div>

    <template v-if="sec === 'plan'">
    <section v-if="goalRes" class="goal-plan" aria-label="Goal recommendations">
      <h3>Goal: {{ GOALS.find((g) => g.id === goal)?.label }} <small class="m">top recommendations first</small></h3>
      <p><b>{{ goalRes.headline }}</b></p>
      <div v-if="goalRes.rows.length" class="tbl"><table class="list nosort">
        <thead><tr><th>#</th><th>Where</th><th>Now</th><th>Recommended</th><th>Why</th></tr></thead>
        <tbody><tr v-for="(r, i) in goalRes.rows" :key="r.title"><td class="num">{{ i + 1 }}</td><td>{{ r.title }}</td><td>{{ r.now }}</td><td>{{ r.best }}</td><td>{{ r.why }}</td></tr></tbody>
      </table></div>
      <p v-else class="note">Nothing to rank for this goal with the current save.</p>
      <p v-if="goal !== 'vessels'" class="note">Moving a nest parent clears that nest's waiting eggs †; hatch first. The step-by-step plan below is unchanged.</p>
    </section>
    <template v-if="hatch">
    <h3>Plan, step by step <small class="m">{{ v.eggsWaiting }} eggs, {{ Math.max(v.free, 0) }} free slots</small></h3>
    <ol class="do">
      <li v-if="hatch.trash.length"><b>Trash {{ hatch.trash.length }} pet{{ hatch.trash.length > 1 ? 's' : '' }}</b> (frees {{ hatch.trash.length }} slot{{ hatch.trash.length > 1 ? 's' : '' }} †):
        <div class="tbl sub"><table class="list"><thead><tr><th></th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Why trash it</th></tr></thead><tbody><tr v-for="t in bySlot(hatch.trash)" :key="t.pet.slot"><td>☐</td><PetCells :pet="t.pet" /><td>{{ t.why }}</td></tr></tbody></table></div></li>
      <li v-else><b>No safe trash candidate</b> (see the rule under Trash candidates): free slots yourself, or skip to step 2 with the {{ Math.max(v.free, 0) }} free.</li>
      <li v-if="hatch.trekSwaps.length"><b>Trek swap, then trash {{ hatch.trekTrash.length }} more</b> (no eggs involved, safe now):
        <div class="tbl sub"><table class="list nosort"><thead><tr><th></th><th>Where</th><th>From (out)</th><th>To (in)</th><th>Why</th></tr></thead><tbody><template v-for="w in hatch.trekSwaps" :key="w.text"><tr v-for="(r, i) in w.rows" :key="i"><td>☐</td><td>{{ r.where }}</td><td>{{ r.from }}</td><td>{{ r.to }}</td><td>{{ r.note }}</td></tr></template></tbody></table></div>
        <div class="tbl sub"><table class="list"><thead><tr><th></th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Why trash it</th></tr></thead><tbody><tr v-for="t in bySlot(hatch.trekTrash)" :key="t.pet.slot"><td>☐</td><PetCells :pet="t.pet" /><td>{{ t.why }}</td></tr></tbody></table></div></li>
      <li><b>Hatch {{ hatch.hatch.reduce((t, h) => t + h.count, 0) }} egg{{ hatch.hatch.reduce((t, h) => t + h.count, 0) === 1 ? '' : 's' }}</b>, nests with a pending parent swap first, then rarest first (a rarer egg has better new-species odds †):<template v-if="!hatch.hatch.length"> none fit.</template>
        <ul v-else><li v-for="h in hatch.hatch" :key="h.egg">{{ h.egg }} ×{{ h.count }}</li></ul></li>
      <li v-if="hatch.nestSwaps.length"><b>Nest swaps</b> (changing a nest parent clears that nest's waiting eggs †, so only after its eggs are hatched):
        <div class="tbl sub"><table class="list nosort"><thead><tr><th></th><th>Where</th><th>From (out)</th><th>To (in)</th><th>Why</th></tr></thead><tbody><template v-for="r in hatch.nestSwaps" :key="r.swap.text"><tr v-for="(x, i) in r.swap.rows" :key="i"><td>{{ r.ok ? '☐' : '⏸' }}</td><td>{{ x.where }}</td><td>{{ x.from }}</td><td>{{ x.to }}</td>
          <td>{{ x.note }}<span v-if="r.ok" class="m">. Nest {{ r.nest }} is empty now ({{ r.total }} hatched), safe</span>
          <span v-else class="st-warn">. WAIT: Nest {{ r.nest }} still has {{ r.clears }} egg{{ r.clears === 1 ? '' : 's' }} ({{ rar(r.rarities) }}); hatch them first (no room yet), or swap now and lose them for the parent upgrade</span></td></tr></template></tbody></table></div>
        <template v-if="hatch.trekAfter.length"><b>Then the trek swap</b> (a separate step, once its nest step above is done), and any nest refill with the pet it frees:
        <div class="tbl sub"><table class="list nosort"><thead><tr><th></th><th>Where</th><th>From (out)</th><th>To (in)</th><th>Why</th></tr></thead><tbody><template v-for="w in hatch.trekAfter" :key="w.text"><tr v-for="(r, i) in w.rows" :key="i"><td>{{ hatch.nestSwaps.filter((x) => w.needs!.includes(x.nest)).every((x) => x.ok) ? '☐' : '⏸' }}</td><td>{{ r.where }}</td><td>{{ r.from }}</td><td>{{ r.to }}</td><td>{{ r.note }}</td></tr></template></tbody></table></div></template>
        <template v-if="hatch.nestTrash.length"><b>Then trash {{ hatch.nestTrash.length }} more</b>:
        <div class="tbl sub"><table class="list"><thead><tr><th></th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Why trash it</th></tr></thead><tbody><tr v-for="t in bySlot(hatch.nestTrash)" :key="t.pet.slot"><td>☐</td><PetCells :pet="t.pet" /><td>{{ t.why }}</td></tr></tbody></table></div></template>
        <template v-if="hatch.hatchAfter.length"><b>Hatch {{ hatch.hatchAfter.reduce((t, h) => t + h.count, 0) }} more</b>: {{ hatch.hatchAfter.map((h) => `${h.egg} ×${h.count}`).join(', ') }}</template></li>
      <li v-if="hatch.left"><b>Recheck</b>: {{ hatch.left }} egg{{ hatch.left === 1 ? '' : 's' }} still waiting. Reload the save here: a fresh hatch can be a new trash candidate (a second pet of its species), then repeat from step 1.</li>
      <li v-else><b>Done</b>: every egg hatched; reload to see what came out.</li>
    </ol>
    <p class="note">Trash picks are the role rule below, least valuable first; check each before you trash it. Egg labels: nest and rarity (N1 r2 = nest 1, rarity 2).</p>
    </template>
    <template v-if="!hatch && v.swaps.length">
    <h3>Plan, step by step <small class="m">{{ v.eggsWaiting }} eggs, {{ Math.max(v.free, 0) }} free slots</small></h3>
    <ol class="do">
      <li v-if="v.eggsWaiting"><b>Hatch all {{ v.eggsWaiting }} egg{{ v.eggsWaiting === 1 ? '' : 's' }}</b>: they fit in your free slots.</li>
      <li><b>Then swap</b> (changing a nest parent clears that nest's waiting eggs †, so hatch first):
        <div class="tbl sub"><table class="list nosort"><thead><tr><th></th><th>Where</th><th>From (out)</th><th>To (in)</th><th>Why</th></tr></thead><tbody><template v-for="w in v.swaps" :key="w.text"><tr v-for="(r, i) in w.rows" :key="i"><td>☐</td><td>{{ r.where }}</td><td>{{ r.from }}</td><td>{{ r.to }}</td>
          <td>{{ r.note }}<template v-if="!i && w.out.some((p) => afterSlots.has(p.slot))">; then trash <template v-for="(p, j) in w.out.filter((p) => afterSlots.has(p.slot))" :key="p.slot">{{ j ? ', ' : '' }}{{ p.name }} #{{ p.slot }} L{{ p.level }}</template></template></td></tr></template></tbody></table></div></li>
    </ol>
    </template>
    <p v-else-if="!hatch" class="note">No plan needed: every waiting egg fits in your free slots, and no swap is due.</p>
    </template>
    <template v-else-if="sec === 'inventory'">
    <h3>Inventory <small class="m">{{ allPets.length }} pets, slot order (page, then position)</small></h3>
    <div class="tbl"><table class="list">
      <thead><tr><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Doing</th><th>Why we keep it</th></tr></thead>
      <tbody><tr v-for="r in invRows" :key="r.p.slot"><PetCells :pet="r.p" /><td>{{ r.doing }}</td>
        <td :class="{ 'st-warn': r.trash }">{{ r.why }}</td></tr></tbody>
    </table></div>
    <p class="note">Position counts from the left of the inventory page. Placed pets are kept for the job they do; idle ones by the role rule (docs/pets.md §4 step 4).</p>
    </template>
    <template v-else-if="sec === 'hatchery'">
    <div class="sec-head"><h3>Hatchery</h3><span class="m">Lv {{ v.hatchery.lv }} † · {{ pct(v.hatchery.pct) }} to {{ v.hatchery.lv + 1 }}</span></div>
    <p class="facts"><span><b>Next milestone</b> Lv{{ v.hatchery.next?.at ?? '—' }} †</span>
      <span><b>Inventory</b> <span :class="{ short: v.free < v.eggsWaiting }">{{ v.used }}/{{ v.size }}</span> †</span>
      <span><b>Eggs waiting</b> {{ v.eggsWaiting }} †</span><span><b>Golden nests</b> {{ v.gold }} †</span>
      <span><b>Highest species owned</b> {{ v.nameOf(v.highest) }} ({{ v.highest }}) †</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Nest</th><th>Value / Speed / Size †</th><th>Eggs †</th><th>Egg every †</th><th>New species per hatch † <small class="m">egg rarity 1 / 3 / 5</small></th><th>Next Value lv †</th><th>Next Speed lv †</th><th>Next Size lv †</th><th>Notes</th></tr></thead>
      <tbody><tr v-for="x in v.nests" :key="x.n">
        <td class="num">{{ x.n }}</td><td>{{ x.levels.join(' / ') }} <small class="m">of {{ x.cap }}, prestige {{ x.prestige }}</small></td>
        <td class="num">{{ x.eggsWaiting }}<small v-if="x.breed" class="m"><br />next egg {{ pc(x.breed.nextEggPct) }}, rarity up {{ pc(x.breed.upgradePct[0]!) }}</small></td>
        <td>{{ x.breed ? dur(x.breed.eggSec) : '—' }}<small v-if="x.breed?.capped" class="m"> (10 min floor)</small></td>
        <td><template v-if="x.breed?.newSpecies != null">{{ v.nameOf(x.breed.newSpecies) }}: {{ [0, 2, 4].map((r) => pc(x.breed!.hatch[r]!.newPct)).join(' / ') }}</template><template v-else>—</template></td>
        <td v-for="(c, k) in x.costs" :key="k"><small>{{ costText(c) }}</small></td>
        <td :class="{ 'st-good': x.prestigeReady }"><span v-if="x.breed?.gold">golden † </span>
          <b v-if="x.prestigeReady">prestige ready †</b>
          <span v-if="x.canDiscover"> can discover {{ x.canDiscover }} †</span></td></tr></tbody>
    </table></div>
    <h4>Nest parents</h4>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Nest</th><th>Parent</th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th></tr></thead>
      <tbody><template v-for="x in v.nests" :key="x.n"><tr v-for="(q, i) in x.parents" :key="i"><td class="num">{{ x.n }}</td><td>{{ i ? 'B' : 'A' }}</td><PetCells v-if="q" :pet="q" /><td v-else colspan="5">—</td></tr></template></tbody>
    </table></div>
    <details class="how"><summary>How the hatchery numbers are worked out</summary>
    <p>6th nest at Hatchery Lv50 (wiki). Prestige needs all three stats at the cap; it resets them to 0 and raises the cap by 60 †.
      Egg timer: the slower parent sets it (3600·1.42^(id−1) s), cut by Speed, lab, golden ×4, Incubation ×1.4 per gene; 10 min minimum †. Each lay a waiting
      egg may go up a rarity, else the next empty slot may get an egg (×0.62 per egg held) †. A hatch that isn't a new species is the higher parent
      15% of the time, the lower parent otherwise †. Per hatch: 2nd gene {{ pc(v.genes2.second) }}, 3rd {{ pc(v.genes2.third) }} † (a 2nd gene is 24% a copy of gene 1,
      10% a broken −1 gene, 5% nothing, else drawn from both parents' genes plus the next and previous species' genes †).
      Egg shells † (trashing a pet gives one of its rarity and one of each lower): {{ v.shells.map((s, i) => `r${i + 1} ${sci(s)}`).join(' · ') }}.</p>
    </details>

    <template v-if="breed">
    <div class="sec-head"><h4>Breeding</h4><span class="m">estimates from the game's level roll †; a pet's level is fixed at hatch, so breeding is the only way up</span></div>
    <p><b>{{ breed.verdict }}</b></p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Nest</th><th>Parents now (lv)</th><th>Expected child lv (low–high)</th><th>Best pair you own</th><th>Expected lv with it</th><th class="num">Gain</th></tr></thead>
      <tbody><tr v-for="x in breed.nests" :key="x.n">
        <td class="num">{{ x.n }}<small class="m"><br />Value {{ x.V }}</small></td>
        <td>{{ x.now ? pairText(x.now.pair) : '—' }}<small v-if="x.now" class="m"><br />egg every {{ dur(x.now.eggSec) }}</small></td>
        <td>{{ x.now ? `${x.now.mean.toFixed(1)} (${x.now.low}–${x.now.high})` : '—' }}</td>
        <td><template v-if="x.best">{{ pairText(x.best.pair) }}<small class="m"><br />from {{ x.best.pair.map((p) => p.group === 'Idle' ? invText(p.slot) : p.group).join(' / ') }} · egg every {{ dur(x.best.eggSec) }}</small></template><template v-else>—</template></td>
        <td>{{ x.best ? `${x.best.mean.toFixed(1)} (${x.best.low}–${x.best.high})` : '—' }}</td>
        <td class="num" :class="{ 'st-good': (x.gain ?? 0) > 0 }">{{ x.gain == null ? '—' : `${x.gain > 0 ? '+' : ''}${x.gain.toFixed(1)}` }}</td></tr></tbody>
    </table></div>
    <p v-if="breed.targets.length" class="facts"><span><b>From the best pair (estimate):</b></span><span v-for="t in breed.targets" :key="t.level">Lv {{ t.level }}: ~{{ isFinite(t.eggs) ? t.eggs.toFixed(0) : '∞' }} eggs{{ isFinite(t.sec) ? `, ~${etaText(t.sec)}` : '' }}</span></p>
    <details class="how"><summary>How the breeding estimate is worked out</summary>
    <p>Rarity 1-5 egg † (hatch @28049476, roll @28084032): level = ceil(randomInt(lo, hi) + 0.5 + r) = roll + r + 1, randomInt uniform and inclusive;
      lo = trunc(min·k + (r−1)/7·|max − min·k|), k = 0.7 + TankBonusLIST[20]/240 (now {{ (0.7 + breed.t20 / 240).toFixed(3) }});
      hi = trunc(min(max·(1 + r/100), max + max^(0.3 + m/130)·r) + (Value / max(65 − m, 20))^1.5), m = higher parent species id (raid pets 0).
      Rarity ≥ 6 egg † (@28115390, @28141152): ceil(1.03·(best parent + 6)). Expected = mean of the roll, weighted over the eggs waiting in that nest (none: a fresh rarity-1 egg †).
      Best pair: idle pets and nest parents only (trekking and capsule pets stay put); highest-Value nest picks first, no pet in two nests.
      It ranks by level alone: it ignores genes, new-species odds (moving an eagle out of Nest 1 ends its Spore chance) and egg time (shown).
      Eggs to a level: exact Markov chain keeping the two best levels as parents, species and nest unchanged (estimate);
      time = eggs × that pair's egg timer, ignoring eggs that rise a rarity while waiting †/not modelled.</p>
    </details>
    </template>

    <div class="sec-head"><h4>Trash candidates</h4><span class="m">role rule (docs/pets.md §4 step 4), not game code<template v-if="v.eggsWaiting > v.free"> · need {{ v.eggsWaiting - v.free }} slot(s) to hatch every egg</template></span></div>
    <div v-if="v.trash.length" class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Verdict</th><th>Why it's safe</th></tr></thead>
      <tbody><tr v-for="(t, k) in trashBySlot" :key="t.pet.slot"><td class="num">{{ k + 1 }}</td><PetCells :pet="t.pet" />
        <td :class="toHatch.has(t.pet.slot) ? 'st-bad' : 'st-warn'">{{ toHatch.has(t.pet.slot) ? 'trash to hatch' : 'can trash' }}</td><td>{{ t.why }}</td></tr></tbody>
    </table></div>
    <p v-else class="m">No safe trash candidate.</p>
    <template v-if="v.swaps.length">
    <div class="sec-head"><h4>Swaps</h4><span class="m">an idle pet beats a placed one in its role{{ search ? '' : ' (trek: quick options; "Find best team" under Trekking searches every team)' }}</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Move</th><th>Eggs it clears</th><th>Then trash</th></tr></thead>
      <tbody><tr v-for="w in v.swaps" :key="w.text"><td>{{ w.text }}</td>
        <td><template v-if="w.nest !== undefined"><span v-if="swapEggs(v, w).count" class="st-warn">{{ swapEggs(v, w).count }} ({{ rar(swapEggs(v, w).rarities) }}): hatch Nest {{ w.nest }}'s {{ swapEggs(v, w).count }} egg{{ swapEggs(v, w).count === 1 ? '' : 's' }} first</span><template v-else>none</template></template><template v-else>none</template></td>
        <td><template v-for="p in w.out" :key="p.slot"><span v-if="afterSlots.has(p.slot)" class="st-warn">{{ p.name }} #{{ p.slot }} L{{ p.level }} </span></template></td></tr></tbody>
    </table></div>
    </template>
    <details class="how"><summary>The trash rule<template v-if="v.kept.length">, and {{ v.kept.length }} idle pet{{ v.kept.length === 1 ? '' : 's' }} kept</template></summary>
    <p>An idle pet does nothing in game, so it is kept only for a role: (a) it is in a trek team that kills faster than the current one,
      (b) it is a better nest parent (same species with a parent's genes or more at a higher level, or Incubation/Discovery that no parent of some nest has),
      (c) it is the only pet with a gene, (d) it is the last of its species, or the species' one spare (highest-level idle, and none when (a)-(c) already keep one).
      Everything else is trash, least valuable first (level, rarity, most-shared genes). Each frees 1 inventory slot †; trashing gives egg shells (wiki, amount unknown).</p>
    <div v-if="v.kept.length" class="tbl"><table class="list">
      <thead><tr><th>Kept idle pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Role</th></tr></thead>
      <tbody><tr v-for="k in bySlot(v.kept)" :key="k.pet.slot"><PetCells :pet="k.pet" /><td>{{ k.why }}</td></tr></tbody>
    </table></div>
    </details>
    </template>

    <template v-else-if="sec === 'trekking'">
    <div class="sec-head"><h3><Icon kind="skill" id="TrekkingLV" name="Trekking" /></h3><span class="m">Lv {{ v.trekking.lv }} † · {{ pct(v.trekking.pct) }}</span></div>
    <p class="facts"><span><b>Next milestone</b> Lv{{ v.trekking.next?.at ?? '—' }} †</span><span><b>Team HP</b> {{ sci(v.hp) }} †</span>
      <span><b>Frontier</b> <Icon kind="monster" :id="v.frontier" :name="`monster ${v.frontier}`" /> †</span><span><b>To the next</b> {{ sci(v.distanceLeft) }} distance †</span>
      <span><b>Red vessels</b> from monster 20 †</span></p>
    <template v-if="eta">
      <p v-if="eta.onFrontier"><b>Next monster ({{ eta.monster + 1 }}) in ~{{ etaText(eta.nextMonsterSec) }}</b><template v-if="eta.stageMonster > eta.monster + 1">; next stage (monster {{ eta.stageMonster }}, a new page of 5) in ~{{ etaText(eta.nextStageSec) }}</template><template v-else> (that is also the start of the next stage)</template>.
        <small class="m">Estimate, unverified against a live reading; away time not counted.</small></p>
      <p v-else class="short">The trek is not on the frontier monster ({{ eta.monster }}), so kills add no distance † (@27284246). Select monster {{ eta.monster }} to advance.</p>
      <details v-if="eta.onFrontier" class="how"><summary>How the estimate is worked out</summary>
      <p>Distance accrues only per kill of the frontier monster, {{ eta.gain.toFixed(2) }} per kill † (kill handler @27287121), and a death adds no distance, only the 10 s revive, already inside kills/min.
        Each step is simulated against the monster you will be fighting then (kills/min {{ eta.steps.map((s) => s.killsPerMin.toFixed(1)).join(' → ') }}), with the current team and no gear or gene changes.
        Distance needed per step: {{ eta.steps.map((s) => sci(s.distance)).join(' + ') }} † (@27291755). Unverified: not compared with a live PetDistance reading over time; "stage" = page of 5 monsters is my naming; away-time progress is not counted.</p>
      </details>
    </template>
    <p class="facts"><span><b>Vessels</b> † (colours wiki):</span><span v-for="x in v.vessels" :key="x.colour">{{ x.colour }} {{ sci(x.have) }}</span><span><b>Slot pack</b> {{ v.mtx }} †</span></p>
    <template v-if="farm">
    <div class="sec-head"><h4>Vessels per hour: best monster per colour</h4><span class="m">ranked by vessels per hour watching the screen, current team, monsters 1-{{ farm.frontier }} (all you can select)</span></div>
    <p v-if="farm.current"><b>Now:</b> monster {{ farm.current.monster }} pays {{ vesselColourName(farm.current.colour) }}, {{ k(farm.current.live) }}/h on screen, {{ k(farm.current.away) }}/h away.
      <template v-if="farm.colours.find((c) => c.colour === farm!.current!.colour)?.best.monster === farm.current.monster">That is the best monster for {{ vesselColourName(farm.current.colour) }}.</template>
      <template v-else>Monster {{ farm.colours.find((c) => c.colour === farm!.current!.colour)?.best.monster }} pays more {{ vesselColourName(farm.current.colour) }}.</template>
      <span v-if="!farm.current.frontier" class="short"> Off the frontier ({{ farm.frontier }}): no trek progress while you farm here †.</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Colour</th><th>Best monster</th><th class="num">Per kill †</th><th class="num">On screen /h</th><th class="num">Away /h <small class="m">real, ×{{ +farm.awayPct.toFixed(1) }}%</small></th><th class="num">Per candy hour</th><th>Runner-up</th><th>Trek progress</th></tr></thead>
      <tbody><tr v-for="c in farm.colours" :key="c.colour" :class="{ cur: c.best.monster === farm.selected }">
        <td>{{ c.name }}</td><td><Icon kind="monster" :id="c.best.monster" :name="`monster ${c.best.monster}`" /><small v-if="c.bestAway.monster !== c.best.monster" class="m"><br />away: monster {{ c.bestAway.monster }} ({{ k(c.bestAway.away) }}/h)</small></td>
        <td class="num">{{ c.best.perKill.toFixed(1) }}</td><td class="num">{{ k(c.best.live) }}</td>
        <td class="num">{{ k(c.best.away) }}<small v-if="!c.best.awayMeasured" class="m"> est.</small></td><td class="num">{{ k(c.best.candy) }}</td>
        <td>{{ c.runnerUp ? `monster ${c.runnerUp.monster}, ${k(c.runnerUp.live)}/h` : '—' }}</td>
        <td>{{ c.best.frontier ? 'none: the frontier, keeps advancing' : `stops (frontier is ${farm.frontier}${eta ? `; next monster ~${etaText(eta.nextMonsterSec)} of frontier kills` : ''})` }}</td></tr></tbody>
    </table></div>
    <p class="note">On screen = simulated kills/h × vessels per kill. Away and candy use the game's own away rate: a 15 s measurement it takes when you click a monster †;
      for the selected monster that is the save's value, for the others it is estimated ("est.") from a 15 s simulation. Candy on the Pets screen should pay the away rate at
      full speed (candy checked live on Tilling and Apothecary only, not Pets){{ candyHours ? `; you hold ${candyHours} h of candy` : '' }}.</p>
    <details class="how"><summary>Every monster, and how the numbers are worked out</summary>
    <p>Kill of the selected monster with the pets alive (kill handler @27287534 †), frontier or not: colour = min(table[sel + 5·((page−1) mod 8)] + floor((page−1)/8), 2·sel − page mod 2, 9) †;
      amount = (id + floor(id/10)² + floor(id/8)) · 1.06^floor(id/5) · (1 + Loot % (PetValueTotals[15]: Loot gene, × Discovery combo) ) · vessel multiplier †, no random roll.
      Vessel multiplier (@27188109 †) = (1 + double-vessel gem buys) · lab bonus 2 · (1 + Tinkering "Vessel Gain" %) · (1 + <span title="skill-tree node 63">Vessel gain</span> skill-tree %) · (1 + 2 · <span title="PotionLV[100], potion 101">Auricia</span> level %) · <span title="MasteryBonuses[20]">mastery vessel gain</span>: ×{{ farm.multi.toFixed(3) }} here, Loot +{{ +farm.lootPct.toFixed(1) }}%.
      No card term in the formula. Only frontier kills add distance † (@27284246), so farming any other monster pauses the trek.
      Away (@27225189 †): calibrated kills/h × amount × away hours; the calibration is 3600/(kill time + respawn) × share of time alive, D/(D+10) with D = seconds to die †.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Monster</th><th>Colour †</th><th class="num">Per kill</th><th class="num">Kills/h</th><th class="num">On screen /h</th><th class="num">Away kills/h</th><th class="num">Away /h</th></tr></thead>
      <tbody><tr v-for="r in farm.rows" :key="r.monster" :class="{ cur: r.monster === farm.selected }">
        <td class="num">{{ r.monster }}{{ r.frontier ? ' (frontier)' : '' }}</td><td>{{ vesselColourName(r.colour) }}</td><td class="num">{{ r.perKill.toFixed(1) }}</td><td class="num">{{ Math.round(r.killsPerHour) }}</td>
        <td class="num">{{ k(r.live) }}</td><td class="num">{{ Math.round(r.awayKillsPerHour) }}{{ r.awayMeasured ? ' (save)' : '' }}</td><td class="num">{{ k(r.away) }}</td></tr></tbody>
    </table></div>
    </details>
    </template>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Pos</th><th>Role</th><th>Opens at †</th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th></tr></thead>
      <tbody><tr v-for="s in v.slots" :key="s.p" :class="{ locked: !s.open }">
        <td class="num">{{ s.p }}</td><td>{{ s.role }}</td><td>{{ s.lv ? `Trekking Lv${s.lv}` : 'always' }}{{ s.mtx ? ` or slot pack ${s.mtx}` : '' }}</td>
        <PetCells v-if="s.open && s.pet" :pet="s.pet" /><td v-else colspan="5">{{ s.open ? '—' : 'locked' }}</td></tr></tbody>
    </table></div>
    <div class="sec-head"><h4>Gene combos</h4><span class="m">count / tier † (tier = count÷3, max 3; attack genes 1-10 only work on fighters †). Active combos come from the current team: take a pet off and its genes stop counting, though a combo once found stays found in the Codex (the author, live)</span></div>
    <p><span v-for="g in v.combos" :key="g.id" :class="{ b: g.tier > 0 }" class="chip">{{ g.name }} {{ g.count }}{{ g.tier ? ` (combo ${g.tier})` : '' }}{{ g.next ? ` → ${g.next}` : '' }}</span>
      <span v-if="!v.combos.some((g) => g.tier > 0)" class="short"> No combos: nothing reaches 3.</span></p>
    <template v-if="trek.length">
    <div class="sec-head"><h4>Trek damage</h4><span class="m">kills/min vs <Icon kind="monster" :id="trek[0]!.result.monster" :name="`monster ${trek[0]!.result.monster}`" /> ({{ sci(trek[0]!.result.monsterHP) }} HP †), expected-value simulation of 10 min of the game's own fight loop †</span></div>
    <p v-if="search && !trek.some((o) => o.name === 'Best team')" class="note">Best-team search done: no legal team (one pet per species, capsule pets left out) beats the current one. Pets with an unreadable (-1) gene aren't searched.</p>
    <p v-if="!search"><button @click="search = true">Find best team</button> <small class="m">searches every legal fighter and support set, one pet per species; also catches a fresh hatch that beats a team member and updates the trash list (~15 s)</small></p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Team</th><th class="num">Kills/min</th><th class="num">s/kill</th><th class="num">Deaths/10 min</th><th class="num">Avg HP</th><th>Damage from</th></tr></thead>
      <tbody><tr v-for="(o, k) in trek" :key="o.name" :class="{ cur: o.name === 'Current team' }">
        <td class="num">{{ k + 1 }}</td>
        <td><b>{{ o.name }}</b> <small class="m">{{ o.genes }}</small><br /><small v-for="m in o.moves" :key="m">{{ m }}<br /></small></td>
        <td class="num">{{ o.result.killsPerMin.toFixed(1) }}</td><td class="num">{{ o.result.killSec.toFixed(1) }}</td><td class="num">{{ o.result.deathsPer10Min }}</td><td class="num">{{ pct(o.result.avgHpPct) }}</td>
        <td><small>{{ o.result.bySource.map((b) => `${b.name} ${pct(b.share)}`).join(' · ') }}{{ o.result.notModelled.length ? ` · not modelled: ${o.result.notModelled.join(', ')}` : '' }}</small></td></tr></tbody>
    </table></div>
    <p class="note">Every roll is replaced by its average, so treat gaps under ~5% as a tie. Moving a pet out of a nest or capsule empties that spot.</p>
    <details class="how"><summary>How trek damage is worked out</summary>
    <p>Formulas † (docs/pets.md "Trek damage"); every roll is replaced by its average and projectile travel time is ignored, so
      treat gaps under ~5% as a tie. Curse Skull stacks into the damage multiplier (not a source row). Evasive's combo text promises +10% damage per
      evasion but no game code reads it †: Evasive only adds dodge chance. Life Leech's combo is +1.5% damage per 1% HP missing per tier in code †
      (the text says 3%). Moving a pet out of a nest or capsule empties that spot. Card 177 (not in the Cards list) adds +2% pet damage per level; it only drops from the event shop's upgrade 7 (Gold Balls, 3 copies per drop) † @14935922.</p>
    </details>
    </template>
    </template>

    <template v-else-if="sec === 'loadouts'">
    <div class="sec-head"><h3>Trek loadouts</h3><span class="m">the best saved trek team for each focus, from the pets a loadout can place</span></div>
    <p>A loadout is a saved trek team, like a card deck: 4 loadouts of 8 positions (4 fighters, 4 supports) †; placing pets edits the selected one †.
      Switching loadouts places only <b>idle</b> pets †, so nest parents and capsule pets are left out here. Saved now: {{ savedNums.length ? `loadout ${savedNums.join(', ')}` : 'none' }}{{ savedNums.length < 4 ? ` (empty: ${[1, 2, 3, 4].filter((x) => !savedNums.includes(x)).join(', ')})` : '' }}.</p>
    <p v-if="!loadouts.length && !loadoutRun"><button @click="findLoadouts">Find best loadouts</button> <small class="m">searches every legal fighter and support set for each focus, one pet per species (~10-20 s per focus; the page pauses while each runs)</small></p>
    <p v-if="loadoutRun" class="note">Searching: {{ loadoutRun }}…</p>
    <template v-if="loadouts.length">
    <div class="tbl"><table class="list nosort">
      <thead><tr><th>Focus</th><th>Measured as</th><th class="num">Monster</th><th class="num">Current team</th><th class="num">Best loadout</th><th class="num">Gain</th><th>Saved?</th></tr></thead>
      <tbody><tr v-for="r in loadouts" :key="r.focus.id"><td><b>{{ r.focus.label }}</b></td><td>{{ r.focus.unit }}</td><td class="num">{{ r.monster }}</td>
        <td class="num">{{ fv(r.now) }}</td><td class="num">{{ fv(r.best) }}</td><td class="num" :class="{ 'st-good': r.gain > 0.05 }">{{ r.gain > 1e-6 ? sgn(r.gain) : 'already best' }}</td>
        <td>{{ r.savedIn ? `loadout ${r.savedIn}` : 'not saved' }}</td></tr></tbody>
    </table></div>
    <section v-for="r in loadouts" :key="r.focus.id" :aria-label="`${r.focus.label} loadout`">
      <div class="sec-head"><h4>{{ r.focus.label }}: {{ fv(r.now) }} → {{ fv(r.best) }} {{ r.focus.unit }} <small class="m">{{ r.gain > 1e-6 ? sgn(r.gain) : 'the current team is already the best' }}</small></h4>
        <span class="m">{{ r.focus.what }}; monster {{ r.monster }}</span></div>
      <p v-if="r.focus.id === 'travel' && eta && !eta.onFrontier" class="short">Distance only accrues on the frontier monster ({{ r.monster }}) †: select it while this loadout runs.</p>
      <div class="tbl"><table class="list nosort">
        <thead><tr><th class="num">Pos</th><th>Role</th><th>Now</th><th>Best</th><th>Why</th></tr></thead>
        <tbody><tr v-for="p in r.picks" :key="p.pos" :class="{ cur: p.pet !== p.was }">
          <td class="num">{{ p.pos }}</td><td>{{ p.role }}</td><td>{{ p.was ? `${p.was.name} L${p.was.level}` : '—' }}</td>
          <td>{{ p.pet ? `${p.pet.name} L${p.pet.level}` : '—' }}</td><td><small>{{ p.why }}</small></td></tr></tbody>
      </table></div>
      <p v-if="r.nest" class="note">A nest parent would raise it to {{ fv(r.nest.value) }} ({{ sgn(r.nest.value / r.now - 1) }} on the current team): {{ r.nest.pets.map((p) => `${p.name} L${p.level} (${p.group})`).join(', ') }}. A loadout won't place it from the nest †; take it out first, which clears that nest's eggs.</p>
      <template v-if="r.levers.length">
      <p><b>What would improve it next</b> <small class="m">one more of a gene on this team, kills/min held the same</small></p>
      <div class="tbl"><table class="list nosort">
        <thead><tr><th>Gene</th><th class="num">On the team</th><th class="num">Payout per kill</th><th>Note</th></tr></thead>
        <tbody><tr v-for="l in r.levers" :key="l.gene"><td>{{ l.name }}</td><td class="num">{{ l.now }} → {{ l.next }}</td><td class="num">{{ l.gain > 1e-9 ? sgn(l.gain) : '—' }}</td><td><small>{{ l.note }}</small></td></tr></tbody>
      </table></div>
      </template>
      <p v-else class="note">Fight is kills/min alone: no single gene lever. Trekking → Trek damage shows which moves the kills come from.</p>
    </section>
    <details class="how"><summary>How each focus is worked out</summary>
    <p>Each focus is kills/min from the trek simulation (Trekking → Trek damage) × what one kill pays, all † (docs/trekking.md):
      <b>Fight</b> kills/min on the selected monster. <b>Loot</b> vessels per kill × (1 + Loot % from the Loot gene, × Discovery combo) (@27287534).
      <b>EXP</b> Trekking EXP per kill = (id + ⌊id/10⌋² + ⌊id/8⌋)·1.08^⌊id/5⌋ × (1 + Trekkery %) × lab bonus 25 × mastery × potion 130 (@27289245).
      <b>Travel</b> distance per kill × kills/min on the frontier monster: (1 + Incubation combo tier) × (1 + Swiftness) × (1 + Trekkery combo tier × Trekking Lv %) × account terms (@27287121); only frontier kills add distance.
      Genes count from all 8 positions, so a gene pet can sit in a fighter slot when the fighters already kill at the respawn cap. Search: every set of the open fighter slots, then supports, alternating until neither changes, 2-minute sims; the rows are re-simulated for 10 minutes. Treat gaps under ~5% as a tie.</p>
    </details>
    </template>
    </template>
    <template v-else-if="sec === 'genes'">
    <div class="sec-head"><h3>Genes</h3><span class="m">every gene across the whole inventory, which ones matter, and the next actions that add the most useful copies</span></div>
    <template v-if="genes">
    <p>Genes <b>do</b> inherit †: gene 1 is the child species' own gene, and the 2nd and 3rd genes are drawn from a pool of <b>both parents' genes</b> plus two neighbour species' genes.
      2nd gene {{ pc(genes.odds.second) }} per hatch, 3rd {{ pc(genes.odds.third) }} (Hatchery Lv {{ v.hatchery.lv }}, Genetea Lv {{ (props.save?.PotionLV as number[] | undefined)?.[154] ?? 0 }}).
      A combo counts copies on the trek team ({{ genes.slots }} open slots, one pet per species) and only works while they are fielded; "found" just records that a tier was reached once †.</p>
    <h4>Plan <small class="m">ranked by useful copies expected (usefulness × fieldable copies: now for a swap, one visit's eggs for a nest, one a day for a claim)</small></h4>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">#</th><th>Kind</th><th>Action</th><th>Detail</th><th class="num">Value</th><th>Why</th></tr></thead>
      <tbody><tr v-for="(a, i) in genes.actions" :key="a.title"><td class="num">{{ i + 1 }}</td><td>{{ KIND[a.kind] }}</td><td><b>{{ a.title }}</b></td><td><small>{{ a.detail }}</small></td><td class="num">{{ a.ev.toFixed(2) }}</td><td><small>{{ a.why }}</small></td></tr></tbody>
    </table></div>
    <p v-if="!genes.actions.length" class="note">No action adds a useful gene copy with the pets you own.</p>
    <h4>Gene census <small class="m">{{ geneRows.length }} genes owned; usefulness 3 = pays in every loop (breeding genes, the moves your fighters fire), 1 = niche</small></h4>
    <div class="tbl"><table class="list">
      <thead><tr><th>Gene</th><th>For</th><th class="num">Useful</th><th class="num">Copies owned</th><th class="num">Team now</th><th class="num">Fieldable</th><th class="num">To next tier</th><th>Found t1/t2/t3</th><th>On pets</th></tr></thead>
      <tbody><tr v-for="r in geneRows" :key="r.id" :class="{ dim: r.U < 2 }"><td>{{ r.name }}</td><td><small>{{ r.use }}</small></td><td class="num">{{ r.U }}</td><td class="num">{{ r.owned }}</td>
        <td class="num">{{ r.team }} (t{{ r.tier }})</td><td class="num" :class="{ 'st-good': r.fieldTier > r.tier }">{{ r.field }} (t{{ r.fieldTier }})</td>
        <td class="num">{{ r.next == null ? 'maxed' : `${r.short} for t${r.fieldTier + 1}` }}</td><td>{{ r.found.map((f) => (f ? '✓' : '·')).join(' ') }}</td><td><small>{{ carrierText(r) }}</small></td></tr></tbody>
    </table></div>
    <p class="note">Fieldable = the most copies one team could hold: the best pet per species, top {{ genes.slots }}, plus copies no pet supplies (construct). One gene at a time: the slots are shared, so two combos at once may not fit.</p>
    <template v-if="missing.length"><h4>Useful genes you own no copy of</h4>
    <ul class="caps"><li v-for="r in missing" :key="r.id"><b>{{ r.name }}</b>: {{ r.effect }} <small class="m">· gene 1 of {{ r.from }}</small></li></ul></template>
    <template v-if="genes.dups.length"><h4>Gene duplicates <small class="m">idle pets whose genes a same-species pet already has (with repeats); ✓ = the Plan's trash list agrees</small></h4>
    <div class="tbl sub"><table class="list"><thead><tr><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th><th>Covered by</th></tr></thead>
      <tbody><tr v-for="d in genes.dups" :key="d.pet.slot"><PetCells :pet="d.pet" /><td>{{ d.by.name }} #{{ d.by.slot }} L{{ d.by.level }} ({{ statusName(d.by.status) }}){{ trashSlots.has(d.pet.slot) ? ' ✓' : '' }}</td></tr></tbody></table></div></template>
    <h4>Genetea (potion 155) <small class="m">2nd / 3rd gene chance per hatch at each level †</small></h4>
    <div class="tbl sub"><table class="list nosort"><thead><tr><th class="num">Genetea Lv</th><th class="num">2nd gene</th><th class="num">3rd gene</th></tr></thead>
      <tbody><tr v-for="g in genes.genetea" :key="g.P"><td class="num">{{ g.P }}</td><td class="num">{{ pc(g.second) }}</td><td class="num">{{ pc(g.third) }}</td></tr></tbody></table></div>
    <details class="how"><summary>How genes are rolled (all †, docs/pets.md §1b)</summary>
    <p>On hatch the child's species is the higher parent id + 1 (rare), the higher parent (15%) or the lower parent; gene 1 is that species' own gene.
      2nd gene chance (HatcheryLV − 19)/(HatcheryLV + 10) × Genetea; then 24% a copy of gene 1, 10% empty (the −1 bug), 5% nothing, 61% one pick from the pool
      (parent A's and B's genes in that order, each once, + the genes of species hi + 1 and max(lo − 1, 1); a pick equal to gene 1 takes the one before it, so <b>which parent is A matters</b>).
      3rd gene (only after a real 2nd): (HatcheryLV − 39)/(HatcheryLV + 28) × Genetea; 14% copy gene 1, 11% copy gene 2, 9% empty, 5% nothing, 61% the pool.
      Egg rarity changes only the species odds (more hi + 1), so it barely moves genes. Levels are ignored here: the Upgrade goal on the Plan ranks parents by child level.</p>
    </details>
    </template>
    <p v-else class="note">Working out the gene plan…</p>
    </template>
    <template v-else-if="sec === 'research'">
    <div class="tiles">
      <div class="tile"><b>Lv {{ v.research.lv }}</b><span>research, {{ pct(v.research.pct) }} to next †</span></div>
      <div class="tile"><b>Lv {{ v.research.next?.at ?? '—' }}</b><span>next milestone †</span></div>
      <div class="tile"><b>{{ v.expansions }}</b><span>lab expansions †</span></div>
      <div class="tile"><b>{{ v.lab.dblChance.toFixed(1) }}</b><span>multi-level chance (pts) †: {{ v.lab.levelsPer.toFixed(2) }} levels per tier level-up (max 8 at 701){{ v.lab.pipedTanks ? `; +200 on ${v.lab.pipedTanks} Diamond-piped open tank${v.lab.pipedTanks > 1 ? 's' : ''}, averaged` : '' }}</span></div>
    </div>

    <div class="sec-head"><h3>Do now</h3></div>
    <ol class="do">
      <li v-if="v.lab.ready.length"><b>Open {{ readyTanks.length }} tank{{ readyTanks.length === 1 ? '' : 's' }} with a waiting level:</b> {{ ranges(readyTanks) }}.
        <small class="m">Research EXP only comes from tank tier level-ups, and those only run for the tank you have open †.</small></li>
      <li v-if="v.lab.buy.length"><b>Buy these lab upgrades</b>, best research gain per vessel first (approximate ranking):</li>
      <li v-else><b>Nothing affordable.</b> Closest:
        <span v-for="(x, i) in nearest" :key="`${x.u.tank}-${x.u.slot}`">{{ i ? '; ' : '' }}{{ ulabel(x.u) }} for {{ sci(x.u.cost) }} {{ vname(x.u.vessel) }} (have {{ sci(x.have) }})</span>.</li>
    </ol>
    <div v-if="v.lab.buy.length" class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Upgrade</th><th class="num">Levels</th><th class="num">Total cost</th><th class="num">Odds</th><th>Gives</th></tr></thead>
      <tbody><tr v-for="(g, i) in buyGroups" :key="i"><td class="num">{{ i + 1 }}</td><td>{{ ulabel(g.u) }}</td>
        <td class="num">{{ g.from === g.to ? `Lv${g.to}` : `Lv${g.from}-${g.to} (${g.to - g.from + 1})` }}</td>
        <td class="num">{{ sci(g.cost) }} {{ vname(g.u.vessel) }}</td><td class="num">{{ g.odds }}%</td>
        <td>{{ g.from === g.to ? g.first : `${g.first.replace(/ → [^ ]+$/, '')} → ${g.last.split(' → ').pop()}` }}</td></tr></tbody>
    </table></div>

    <div class="sec-head"><h3>Vessels</h3><span class="m">what you hold, and where to farm each colour</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Vessel</th><th class="num">Have †</th><th>Best trek monster</th><th class="num">Per hour (on screen)</th></tr></thead>
      <tbody><tr v-for="x in v.lab.vessels" :key="x.v"><td>{{ x.name }}</td><td class="num">{{ sci(x.have) }}</td>
        <template v-for="c in [farm?.colours.find((f) => f.name === x.name)]" :key="x.v + 'f'">
          <td>{{ c ? `monster ${c.best.monster}` : '—' }}</td><td class="num">{{ c ? k(c.best.live) : '—' }}</td></template></tr></tbody>
    </table></div>

    <div class="sec-head"><h3>All lab upgrades</h3><span class="m">† from game code unless marked; green cost = affordable now; dimmed = maxed, locked or past its knee (the level where the bonus is half its ceiling)</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Upgrade</th><th class="num">Tier</th><th class="num">Lv</th><th class="num">Knee (level / knee)</th><th class="num">Next cost</th><th class="num">Odds</th><th>Next level gives</th></tr></thead>
      <tbody><tr v-for="u in labRows" :key="`${u.tank}-${u.slot}`" :class="{ locked: !u.unlocked || u.maxed || pastKnee(u) }">
        <td>{{ u.name }}<span v-if="pastKnee(u) && u.unlocked && !u.maxed" class="m"> · past knee</span></td><td class="num">{{ u.slot }}</td><td class="num">{{ u.level }}</td>
        <td class="num" :title="u.knee ? `${u.knee.src}; ${Math.round(100 * u.knee.pctCeiling)}% of the ceiling` : 'no knee: linear or exponential'"><template v-if="u.knee">{{ u.knee.knee.toLocaleString() }} · <b>{{ Number.isFinite(u.knee.pctKnee) ? Math.round(100 * u.knee.pctKnee).toLocaleString() : '∞' }}%</b><span class="m"> ({{ Math.round(100 * u.knee.pctCeiling) }}% of ceiling)</span></template><span v-else class="m">—</span></td>
        <td class="num" :class="{ 'st-good': !u.maxed && u.unlocked && u.cost <= (v.lab.vessels.find((x) => x.v === u.vessel)?.have ?? 0) }">{{ u.maxed ? 'max' : `${sci(u.cost)} ${vname(u.vessel)}` }}</td>
        <td class="num">{{ u.odds }}%</td>
        <td>{{ !u.unlocked ? (u.tank === 111 ? 'needs the Mystic Vat (MTX) — ' : u.tank === 101 ? `locked (${u.slot === 2 ? '5 expansions' : 'tier 2 Lv40'}) — ` : 'locked — ') : '' }}{{ u.gives }}</td></tr></tbody>
    </table></div>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Ranking is approximate: log-gain per expected vessel (cost ÷ odds), each colour's budget separately, RP and Research EXP multipliers weighted alike.
      Vessels are spent even when the odds roll fails †. Research EXP only comes from tank tier level-ups, and those only run for the tank you have open in the lab †.</p>
    </details>

    <details class="how"><summary>Tank levels by colour and tier</summary>
    <p class="m">Pink tanks open at research Lv58 †. Colours from the wiki.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Tanks</th><th class="num">Tier 1 †</th><th class="num">Tier 2 †</th><th class="num">Tier 3 †</th></tr></thead>
      <tbody><tr v-for="g in v.tankGroups" :key="g.colour"><td>{{ g.colour }}</td>
        <td v-for="(t, i) in g.tiers" :key="i" class="num">{{ t.max ? (t.min === t.max ? t.max : `${t.min}-${t.max}`) : '—' }}</td></tr></tbody>
    </table></div>
    </details>

    <details class="how"><summary>Capsules and capsule passives</summary>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th>Capsule</th><th>Pet</th><th class="num">Page</th><th class="num">Position</th><th class="num">Lv</th><th>Genes</th></tr></thead>
      <tbody><tr v-for="c in v.capsules" :key="c.p"><td>{{ c.p - 20 }}</td><PetCells v-if="c.pet" :pet="c.pet" /><td v-else colspan="5">empty</td></tr></tbody>
    </table></div>
    <p class="m">Passive levels † (they apply from the species level, in a capsule or not):</p>
    <ul class="caps cols"><li v-for="x in v.passives" :key="x.id">{{ x.name }} {{ x.lv }}</li></ul>
    </details>
    </template>

    <template v-else-if="sec === 'codex'">
    <div class="sec-head"><h3>Codex</h3><span class="m">every species · capsule pets first, then soonest next level</span></div>
    <p v-if="away" class="note">Away, capsules bank <b>×{{ +away.rate.toFixed(3) }}</b> days per day =
      <template v-for="(r, i) in away.rows" :key="i">{{ i ? ' × ' : '' }}{{ +r.factor.toFixed(3) }} {{ r.what }}</template> †.
      On the lab screen they bank 1 day per day, bonus or not †.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Species</th><th class="num">Capsule Lv</th><th>Bonus now → next</th><th class="num">Capsule %</th><th>In capsule</th><th class="num">Next Lv on lab screen</th><th class="num">Next Lv away</th></tr></thead>
      <tbody><tr v-for="x in codexRows" :key="x.id" :class="{ dim: !x.recorded }"><td class="num">{{ x.id }}</td>
        <td><Icon v-if="x.recorded" kind="pet" :name="x.name" /><template v-else>{{ x.name }} <small class="m">not recorded</small></template></td>
        <td class="num">{{ x.lv }}</td><td>{{ x.lv ? x.appliedText : '—' }} → {{ x.appliedNextText }}<small v-if="x.labAmount != null" class="m"> (lab amount †)</small></td>
        <td class="num">{{ pct(x.progress) }}</td><td>{{ x.inCapsule ? 'yes' : '' }}</td>
        <td class="num">{{ x.inCapsule ? dhm(x.left) : 'not banking' }}</td><td class="num">{{ x.inCapsule ? dhm(x.awayLeft) : 'not banking' }}</td></tr></tbody>
    </table></div>
    <p class="m">Capsule % = banked days / days the next level needs (⌈5(Lv + 1)^1.5⌉/10 †). Only the 6 capsule pets bank days †.</p>
    </template>


    <details class="how"><summary>Sources</summary>
    <p>From the save keys decoded in docs/pets.md. † = read in game code; wiki / guide = that source only; inferred = fits the save, not traced.</p>
    <p>Milestones held †: <span v-for="(s, k) in { Hatchery: v.hatchery, Trekking: v.trekking, Research: v.research }" :key="k">{{ k }} {{ s.milestones.filter((m) => m.held).map((m) => m.at).join('/') || 'none' }}; </span>
      Pet status per slot is inferred (0 idle, 1 nest, 2 trek, 3 capsule): {{ v.pets.length }} pets, {{ statusSummary }}.</p>
    </details>
  </section>
  <p v-else class="muted">Load a save to see your pets.</p>
</template>

<style scoped>
.do { margin: 0 0 10px; padding-left: 20px; } .do li { margin: 4px 0; }
ul.caps { list-style: none; padding: 0; margin: 4px 0 8px; } ul.caps li { margin: 2px 0; }
ul.caps.cols { columns: 4 160px; }
h3 { font-size: 16px; margin: 18px 0 6px; } h4 { font-size: 14px; margin: 12px 0 6px; }
.note { color: var(--muted); font-size: 13px; margin: 4px 0 10px; }
.muted, .m { color: var(--muted); }
.warn { border-left: 3px solid var(--bad); padding: 6px 10px 6px 26px; background: var(--panel); }
.short { color: var(--bad); } .b { font-weight: bold; color: var(--accent); }
.chip { display: inline-block; margin: 0 10px 4px 0; }
.do { margin: 0 0 10px; padding-left: 20px; } .do li { margin: 4px 0; }
tr.locked td { color: var(--muted); }
tr.cur td { font-weight: 600; }
tr.dim td { opacity: .7; }
.check { list-style: none; padding-left: 4px; margin: 2px 0; }
.sub { margin: 4px 0 6px; } .sub table.list { min-width: 0; }
</style>
