<script setup lang="ts">
import { computed, ref } from 'vue'
import potionCatalog from '../../data/potion-catalog.json'
import discoveryStatic from '../../data/discovery-static.json'
import { candyFor, candyText } from '../candy/candy'
import { discoveryTargets, eternalBonus, type PotionStatic } from './potions-calc'
import { awayPercent } from '../../away'
import { POTION_FORMULAS, potionGroup, potionGroupTotal, potionMultiplier, potionTotal } from './potion-formulas'
import { vendingAt } from '../../bus'
import Icon from '../../components/Icon.vue'
import { sectionRef } from '../../section'
import { expPlan, expRates, nextUnlocks, levelNeeds } from './apothecary-exp'
import { brewRate, canMake, cheapestCauldron, nextBrews, LEVEL_CAP, type MakeRow } from './alchemy'

type Potion = { id: number; name: string; level: number; discovered: boolean; bonus: string | null; group: string | null }
const props = defineProps<{ save: Record<string, unknown> | null }>()
// Computed in the browser from the loaded save + static catalog (no server).
const data = computed<{ nextDiscovery: number; potions: Potion[] } | null>(() => {
  if (!props.save) return null
  const lv = (props.save.PotionLV as number[]) ?? []
  return { nextDiscovery: Number(props.save.NewPotionID ?? 0),
    potions: (potionCatalog as PotionStatic[]).map((p) => ({ ...p, level: lv[p.id - 1] ?? 0, discovered: (lv[p.id - 1] ?? 0) > 0 })) }
})

// ---- Brewing: per-cauldron EXP rate from the game's formula (SceneEvents_37), confirmed live 2026-10-02 to within
// a constant: progress += 0.04*AnimSpeed*BrewBoost*GemSpeed per tick, EXP += progress*ExpGiven*PotionBOOST*MTX^2 per
// brew; the game ticks this ~25 times/s (measured/predicted = 0.417 at 60fps on all six cauldrons).
// Not modelled: the Eternal Cauldron's +50% chance to triple a level-up.
// Away % can still be uncomputable (Realm away-gain fruit): then the player enters it (remembered in this browser).
const remembered = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return v > 0 ? v : d } catch { return d } }
const awayIn = ref(remembered('idle-skilling.awayPct', 30))
const remember = (k: string, v: number) => { try { localStorage.setItem(k, String(v)) } catch { /* not persisted */ } }
const awayDerived = computed(() => (props.save ? awayPercent(props.save) : null))
const awayKnown = computed(() => awayDerived.value != null)
const awayPct = computed(() => awayDerived.value ?? awayIn.value)
const arr = (k: string) => (props.save?.[k] as number[]) ?? []
const brewing = computed(() => {
  const type = arr('PotionType'), exp = arr('PotionEXP'), req = arr('PotionEXPreq')
  const afk = awayPct.value / 100
  return [1, 2, 3, 4, 5, 6].map((c) => {
    const t = type[c] ?? 0
    if (!t) return { c, idle: true }
    const discovery = t > 110 && t < 120 // a discovery brew stores progress at PotionEXP[110 + cauldron]
    const rate = brewRate(props.save!, c)
    const left = Math.max(0, (req[t] ?? 0) - (exp[t] ?? 0))
    // PotionType holds the potion id itself: the code reads PotionLV[type - 1] for the level and PotionEXP[type] for progress.
    const name = discovery ? 'New potion (discovery)' : data.value?.potions.find((x) => x.id === t)?.name ?? `potion ${t}`
    return { c, idle: false, discovery, name, potionId: discovery ? null : t, level: discovery ? null : (arr('PotionLV')[t - 1] ?? 0),
      rate, progress: (exp[t] ?? 0) / Math.max(1, req[t] ?? 1), active: rate ? left / rate : Infinity, away: rate && afk ? left / (rate * afk) : Infinity, eternal: eternalBonus(props.save ?? {}, c) > 1 }
  })
})
// Time candy with the Apothecary selected runs at full rate, the same as watching (docs/candy.md): enough for the slowest bar fills all.
const candyAll = computed(() => {
  const t = brewing.value.filter((b) => !b.idle && isFinite(b.active!)).reduce((m, b) => Math.max(m, b.active!), 0)
  return props.save && t > 0 ? candyFor(props.save, t) : null
})
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const fmtRate = (r: number) => (r >= 1e3 ? `${+(r / 1e3).toFixed(1)}K` : String(Math.round(r)))
const error = ref('')

type Target = { id: number; name: string; seed: number | null; flower: number | null; chance: number; needs: { seed: number; flower: number; chance: number } | null }
const disc = computed<{ targets: Target[]; seedNames: string[]; flowerNames: string[] } | null>(() =>
  props.save ? { ...(discoveryStatic as { seedNames: string[]; flowerNames: string[] }), targets: discoveryTargets(props.save, potionCatalog as PotionStatic[]) as Target[] } : null)
// Seed/flower icons: <Icon kind="seed|flower"> (the PotionIngredients sheet, src/derive-discovery.ts).
const seed = (n: number) => ({ name: disc.value?.seedNames[n] ?? `seed ${n}` })
const flower = (n: number) => ({ name: disc.value?.flowerNames[n] ?? `flower ${n}` })
const reachable = computed(() => (disc.value?.targets ?? []).filter((t) => t.chance > 0))
const blocked = computed(() => (disc.value?.targets ?? []).filter((t) => !t.chance))
const pct = (x: number) => `${Math.round(x * 100)}%`

// Potion art: <Icon kind="potion"> (sprite 1144 "Potions", frame = potion id - 1).

const filter = ref('')
const showUndiscovered = ref(false)
const rows = computed(() => {
  const q = filter.value.toLowerCase()
  return (data.value?.potions ?? [])
    .filter((p) => showUndiscovered.value || p.discovered)
    .filter((p) => !q || `${p.name} ${p.bonus ?? ''}`.toLowerCase().includes(q))
})
const discovered = computed(() => (data.value?.potions ?? []).filter((p) => p.discovered).length)
// Additive groups list the other potions whose bonuses stack additively with this one; show the others.
// Groups: potions adding into the same Pbonus key in the game's block (potion-formulas.ts).
const groupIds = (p: Potion) => { const g = potionGroup(p.id); return g.length ? g : [...(p.group ?? '').matchAll(/\[#(\d+)\]/g)].map((m) => +m[1]!) }
const groupOthers = (p: Potion) => groupIds(p).filter((id) => id !== p.id).map((id) => `${potionName(id)} [#${id}]`).join(', ')
// The block multiplies most potion keys by 1 + 2%·Blasphemy level + Realm vending 5 (marked * in Total now).
const mult = computed(() => potionMultiplier(Number((props.save?.PotionLV as number[] | undefined)?.[94] ?? 0), props.save ? vendingAt(props.save, 5) : 0))
const total = (p: Potion) => (p.discovered ? potionTotal(p.id, p.level, mult.value) : '')
const scaled = (p: Potion) => !!POTION_FORMULAS[p.id]?.m
// Group total: members' totals added (only when they all read alike, e.g. all "% ore gains"); ids come from the "[#id]" tags.
const groupSum = (p: Potion) => {
  if (!groupOthers(p)) return ''
  const by = new Map((data.value?.potions ?? []).map((q) => [q.id, q]))
  return potionGroupTotal(groupIds(p).map((id) => [id, by.get(id)?.discovered ? by.get(id)!.level : 0]), mult.value)
}
const nextName = computed(() => data.value?.potions.find((p) => p.id === (data.value?.nextDiscovery ?? 0) + 1)?.name)
// ---- Apothecary skill EXP (apothecary-exp.ts): rates, next brew unlocks, and the plan (one change at a time, model re-run).
const ids = (potionCatalog as PotionStatic[]).map((p) => p.id)
const apo = computed(() => {
  if (!props.save) return null
  const r = expRates(props.save, awayPct.value), need = levelNeeds(props.save, 1)[0] ?? 0
  const unlocks = nextUnlocks(props.save, ids), first = unlocks[0]
  const plan = expPlan(props.save, ids).map((st) => ({ ...st, sooner: first && r.away > 0 ? (first.exp / r.away) * (1 - 1 / (1 + st.gain)) : 0 }))
  return { ...r, lv: Number(props.save.ApothecaryLV ?? 0), exp: Number(props.save.ApothecaryEXP ?? 0), need, unlocks, plan, first }
})
const potionName = (id: number) => data.value?.potions.find((p) => p.id === id)?.name ?? `potion ${id}`
const fmtN = (x: number) => (x >= 1e6 ? x.toExponential(2).replace('e+', 'e') : x >= 1e3 ? `${+(x / 1e3).toFixed(1)}K` : String(Math.round(x)))
// ---- Alchemy (#2632, alchemy.ts): levels the held crops + flowers pay for, and what to put in the cauldrons next.
const names = Object.fromEntries((potionCatalog as PotionStatic[]).map((p) => [p.id, p.name]))
const cropName = (i: number) => (discoveryStatic as { seedNames: string[] }).seedNames[i] || `crop ${i}`
const flowerName = (i: number) => (discoveryStatic as { flowerNames: string[] }).flowerNames[i] || `flower ${i}`
const SORTS = { bang: ['Bang for buck (most)', (a: MakeRow, b: MakeRow) => b.bang - a.bang], bangLow: ['Bang for buck (least)', (a: MakeRow, b: MakeRow) => a.bang - b.bang],
  gain: ['Effect gain (all affordable)', (a: MakeRow, b: MakeRow) => b.gainAll - a.gainAll], levels: ['Levels affordable', (a: MakeRow, b: MakeRow) => b.levels - a.levels],
  name: ['Name', (a: MakeRow, b: MakeRow) => a.name.localeCompare(b.name)] } as const
const makeSort = ref<keyof typeof SORTS>('bang')
const make = computed(() => (props.save ? [...canMake(props.save, names)].sort(SORTS[makeSort.value][1]) : []))
const makeCauldron = computed(() => (props.save ? cheapestCauldron(props.save) : 1))
const horizon = ref(remembered('idle-skilling.brewHours', 24))
const brews = computed(() => (props.save ? nextBrews(props.save, Math.max(horizon.value, 0.01), awayPct.value / 100) : []))
const pctD = (g: number) => (g >= 10 ? `×${+(1 + g).toFixed(1)}` : `+${+(g * 100).toPrecision(3)}%`)
const SECTIONS = [['cauldrons', 'Cauldrons'], ['make', 'Can make'], ['brews', 'Next brews'], ['exp', 'Apothecary EXP'], ['discover', 'Discover next'], ['all', 'Reference']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Potions</h2>
    <p>What each cauldron is brewing and when it finishes, which seed and flower discover the next potion, and every potion's bonus.</p>
    <div v-if="data" class="tiles">
      <div class="tile"><b>{{ discovered }}/{{ data.potions.length }}</b><span>potions discovered</span></div>
      <div class="tile"><b>{{ brewing.filter((b) => !b.idle).length }}/{{ brewing.length }}</b><span>cauldrons brewing</span></div>
      <div class="tile"><b>{{ reachable.length }}</b><span>discoverable with what you own</span></div>
    </div>
  </div>
  <p v-if="error" class="err">{{ error }}</p>
  <template v-if="data">
    <p v-if="nextName" class="facts"><span><b>Next in discovery order</b> {{ nextName }}</span></p>
    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'cauldrons'">
    <div class="sec-head"><h3>Cauldrons</h3><span class="m">EXP/s from the game's brew formula with your save; times while you watch the Potions screen and at your AFK rate</span></div>
    <p v-if="props.save && !awayKnown" class="note">This save doesn't include values the game computes at load:
      <label v-if="!awayKnown"> away gain % <input v-model.number="awayIn" type="number" step="0.5" min="0" class="num" @change="remember('idle-skilling.awayPct', awayIn)" /></label>
      — times use these.</p>
    <div v-if="props.save" class="tbl brew"><table class="list">
      <thead><tr><th class="num">#</th><th>Brewing</th><th class="num">Progress</th><th class="num">EXP/s</th><th class="num">Done in (watching)</th><th class="num">Done in (AFK)</th></tr></thead>
      <tbody>
        <tr v-for="b in brewing" :key="b.c">
          <td class="num">{{ b.c }}<small v-if="!b.idle && b.eternal" title="Eternal Cauldron (gem shop): potions brew 4× faster (its ×2 is squared in the brew formula), and Apothecary skill EXP ×2"> ★</small></td>
          <template v-if="b.idle"><td colspan="5" class="muted">idle</td></template>
          <template v-else>
            <td><Icon v-if="b.potionId" kind="potion" :id="b.potionId" :name="b.name!" /><template v-else>{{ b.name }}</template><small v-if="b.level != null" class="muted"> lv {{ b.level }} → {{ b.level + 1 }}</small></td>
            <td class="num">{{ Math.round(b.progress! * 100) }}%</td><td class="num">{{ fmtRate(b.rate!) }}</td><td class="num">{{ fmtT(b.active!) }}</td><td class="num">{{ fmtT(b.away!) }}</td>
          </template>
        </tr>
      </tbody>
    </table></div>

    <p v-if="candyAll" class="note">Time candy with the Apothecary selected runs at full rate (the "watching" column): <b>{{ fmtT(candyAll.secs) }}</b>
      of candy fills every bar. <template v-if="candyAll.best">Candy needed (from what you hold): <b>{{ candyText(candyAll.best.pick) }}</b>.</template>
      <template v-else>You hold {{ fmtT(candyAll.allHeld) }} of candy, not enough for all of them.</template> A level also needs its crop and flower price (Tilling page).</p>

    </template>

    <template v-else-if="sec === 'make'">
    <div class="sec-head"><h3>Can make</h3><span class="m">potion levels your held crops and flowers pay for, each potion as if it got all of them</span></div>
    <p class="note"><b>Effect gain</b> = relative change of what the potion's bonus does, on the sum of its additive group (potions adding into the
      same game bonus): "+x%" counts as ×(1 + x/100), "-x% cost" as ×1/(1 − x/100), "×x" and flat amounts as the value itself; "per X" scalers are left out.
      <b>Bang for buck</b> = effect gain of the next level ÷ the share of your held stock that level spends (the larger of its crop and flower share),
      i.e. stat gain per whole stock. Prices are in cauldron {{ makeCauldron }} (lowest cost gem); levels stop at a bonus cap. Shared materials: the
      "shares" count is how many other rows pay with the same crop or flower, so their "levels" can't all happen. Paid levels only: double brew adds more.</p>
    <div class="bar"><label>Sort <select v-model="makeSort"><option v-for="(o, k) in SORTS" :key="k" :value="k">{{ o[0] }}</option></select></label>
      <span class="muted">{{ make.length }} potions affordable</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Potion</th><th class="num">Lv</th><th>Crop (next / held)</th><th>Flower (next / held)</th><th class="num">Levels</th>
        <th>Now → next level</th><th>→ all affordable</th><th class="num">Stock/level</th><th class="num">Bang</th><th class="num">Shares</th></tr></thead>
      <tbody><tr v-for="r in make" :key="r.id">
        <td class="num">{{ r.id }}</td><td><Icon kind="potion" :id="r.id" :name="r.name" /></td><td class="num">{{ r.L }}</td>
        <td>{{ cropName(r.crop) }} <small class="muted">{{ fmtN(r.qty) }} / {{ fmtN(r.cropHeld) }}</small></td>
        <td>{{ flowerName(r.flower) }} <small class="muted">{{ fmtN(r.flowerQty) }} / {{ fmtN(r.flowerHeld) }}</small></td>
        <td class="num">{{ r.levels >= LEVEL_CAP ? `${LEVEL_CAP}+` : r.levels }}</td>
        <td>{{ r.before }} → {{ r.after1 }} <small class="st-good">{{ pctD(r.gain1) }}</small></td>
        <td>→ {{ r.afterAll }} <small class="st-good">{{ pctD(r.gainAll) }}</small></td>
        <td class="num">{{ (r.share * 100).toPrecision(2) }}%</td><td class="num">{{ fmtN(r.bang) }}</td><td class="num">{{ r.sharedWith }}</td>
      </tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'brews'">
    <div class="sec-head"><h3>Next brews</h3><span class="m">a potion for each cauldron, from the same prices and effect gains</span></div>
    <p class="note">For each cauldron in turn, the pick is the (cauldron, potion) pair whose levels within the horizon give the largest effect gain
      (as on Can make), limited by brew time at your AFK rate ({{ +awayPct.toFixed(1) }}%) and by the crops and flowers left after earlier picks;
      greedy, one potion per cauldron. Any cauldron can brew any discovered potion (a level-1 potion waits for its Apothecary tag); progress is kept per potion, so a swap loses nothing.
      Cauldrons on a discovery brew are left out. Paid levels only: "double brew" is the expected levels per payment in that cauldron, on top.</p>
    <div class="bar"><label>Horizon (hours) <input v-model.number="horizon" type="number" min="0.1" step="1" class="num" @change="remember('idle-skilling.brewHours', horizon)" /></label></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Cauldron</th><th>Now</th><th>Brew next</th><th class="num">Levels</th><th class="num">Takes</th><th>Effect</th><th>Spends</th><th class="num">Double brew</th></tr></thead>
      <tbody><tr v-for="b in brews" :key="b.c">
        <td class="num">{{ b.c }}</td><td class="muted">{{ b.current ? potionName(b.current) : 'idle' }}</td>
        <td><Icon kind="potion" :id="b.id" :name="potionName(b.id)" /></td><td class="num">+{{ b.levels }}</td><td class="num">{{ fmtT(b.secs) }}</td>
        <td>{{ b.before }} → {{ b.after }} <small class="st-good">{{ pctD(b.gain) }}</small></td>
        <td><small>{{ fmtN(b.qty) }} {{ cropName(b.crop) }} · {{ fmtN(b.flowerQty) }} {{ flowerName(b.flower) }}</small></td>
        <td class="num">×{{ b.levelsPerPay.toFixed(2) }}</td>
      </tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'exp' && apo">
    <div class="sec-head"><h3>Maximise Apothecary EXP</h3><span class="m">levels open new potions for brewing; EXP from the game's brew code with your save</span></div>
    <p class="facts">
      <span><b>Apothecary</b> lv {{ apo.lv }}</span>
      <span><b>EXP</b> {{ fmtN(apo.exp) }} · {{ fmtN(apo.need) }} to lv {{ apo.lv + 1 }}</span>
      <span><b>On the Potions screen</b> {{ fmtN(apo.active * 3600) }}/h</span>
      <span><b>Away ({{ +awayPct.toFixed(1) }}%)</b> {{ fmtN(apo.away * 3600) }}/h</span>
    </p>
    <p v-if="apo.per.some((x) => !x.brewing)" class="note st-bad">Cauldron {{ apo.per.filter((x) => !x.brewing).map((x) => x.c).join(', ') }} idle: an idle cauldron earns no skill EXP.</p>

    <h3>Next potion unlocks</h3>
    <p class="note">A potion at level 1 (just discovered) can't start brewing until your Apothecary level reaches its tag. Times at today's rate.</p>
    <div class="tbl disc"><table class="list">
      <thead><tr><th class="num">#</th><th>Potion</th><th class="num">Needs lv</th><th>Status</th><th class="num">EXP to go</th><th class="num">Away</th><th class="num">On screen</th></tr></thead>
      <tbody><tr v-for="u in apo.unlocks" :key="u.id"><td class="num">{{ u.id }}</td><td><Icon kind="potion" :id="u.id" :name="potionName(u.id)" /></td>
        <td class="num">{{ u.level }}</td><td :class="u.discovered ? 'st-good' : 'muted'">{{ u.discovered ? 'discovered, waiting on level' : 'not discovered yet' }}</td>
        <td class="num">{{ fmtN(u.exp) }}</td><td class="num">{{ fmtT(u.exp / apo.away) }}</td><td class="num">{{ fmtT(u.exp / apo.active) }}</td></tr></tbody>
    </table></div>

    <h3>Plan, step by step</h3>
    <p class="note">Each row changes one thing and re-runs the EXP model; ranked by EXP/h gain (the same % on screen and away).
      "Sooner" is how much earlier {{ apo.first ? `${potionName(apo.first.id)} (lv ${apo.first.level})` : 'the next unlock' }} arrives away. † = estimate or untraced.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Change</th><th class="num">EXP/h</th><th class="num">Sooner</th><th>Cost</th><th>Note</th></tr></thead>
      <tbody><tr v-for="(st, k) in apo.plan" :key="k"><td class="num">{{ k + 1 }}</td><td>{{ st.what }}{{ st.est ? ' †' : '' }}</td>
        <td class="num st-good">+{{ +(st.gain * 100).toFixed(1) }}%</td><td class="num">{{ fmtT(st.sooner) }}</td><td>{{ st.cost }}</td><td class="muted">{{ st.note ?? '' }}</td></tr></tbody>
    </table></div>
    <p class="note">Tradeoffs: which potion a cauldron brews doesn't change skill EXP (only an idle cauldron loses it), so pick potions for their own
      bonus. Value upgrades also speed that cauldron's potion, and cost only gold. New cards go in an empty slot of the Potions-linked deck (rows are skipped when it
      has none). Already maxed or out of reach: speed upgrades (cap 250 + lab + 1.5·<span title="potion 99">Cepheus</span> level), Mama Mia (Construction 38, away only).</p>
    <details class="how"><summary>How Apothecary EXP is worked out</summary>
    <p>Per brewing cauldron per watched second (SceneEvents_37 @24925300, ~25 ticks/s):
      0.04 · animation speed · brew boost · speed crystal · <b>ApothecaryExpGiven</b> (1, 2, 4, 9, 16, 24 for cauldrons 1-6) · EXP crystal ·
      (1 + Potions-deck ApothecaryExp cards %) · √(cauldron value) · Eternal ×2. Away (@24895650): the same × away % × Mama Mia
      ((1 + C38/8)^0.3)^(lv/20). Level-up (@24930300): REQ ×1.25 + 150·⌊lv/10⌋ + 3·lv² (<span title="potion 100">Persezia</span> can skip the growth), the <span title="Asylum shrine 6">Talent shrine</span> refunds
      0.6%·level of the new REQ. Unlock tag (@25093300): id + 0/3/7/11/15/19/24/30 by potion tier. The brew boost comes from your save when it
      has it (else computed); plan rows compare computed values on both sides.</p>
    </details>
    </template>

    <template v-else-if="sec === 'discover'">
    <div class="sec-head"><h3>Discover next</h3><span class="m">best seed + flower per undiscovered potion, exact odds per discovery brew</span></div>
    <p class="note">Only seeds and flowers you own are used.</p>
    <details class="how"><summary>How the odds are worked out</summary>
    <p>From the game's brew formula (normal cauldrons), checked against the infodoc guide's discovery grid.</p>
    </details>
    <div v-if="reachable.length" class="tbl disc"><table class="list">
      <thead><tr><th class="num">#</th><th>Potion</th><th>Seed</th><th>Flower</th><th class="num">Chance</th></tr></thead>
      <tbody><tr v-for="t in reachable" :key="t.id"><td class="num">{{ t.id }}</td><td><Icon kind="potion" :id="t.id" :name="t.name" /></td>
        <td><Icon kind="seed" :id="t.seed!" :name="seed(t.seed!).name" /> <small class="muted">#{{ t.seed }}</small></td>
        <td><Icon kind="flower" :id="t.flower!" :name="flower(t.flower!).name" /> <small class="muted">#{{ t.flower }}</small></td>
        <td class="num">{{ pct(t.chance) }}</td></tr></tbody>
    </table></div>
    <details v-if="blocked.length" class="blocked">
      <summary>{{ blocked.length }} not reachable with what you own</summary>
      <span v-for="t in blocked" :key="t.id">#{{ t.id }} {{ t.name }} <small>{{ t.needs ? `needs ${seed(t.needs.seed).name} + ${flower(t.needs.flower).name}` : 'dark mode or another source' }}</small></span>
    </details>

    </template>

    <template v-else>
    <div class="sec-head"><h3>All potions</h3><span class="m">bonus per level and what it stacks with</span></div>
    <div class="bar">
      <input v-model="filter" type="search" placeholder="Filter by name or bonus…" aria-label="Filter potions" />
      <label class="muted"><input v-model="showUndiscovered" type="checkbox" /> show undiscovered</label>
    </div>
    <p class="note">Total now is the game's own formula at your level, caps included; * = also × {{ +mult.toFixed(3) }}, the multiplier the game
      applies to most potion bonuses (1 + 2% per Blasphemy level + Realm vending item 5). L = potion level, C = L/(L+175).</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Potion</th><th class="num">Lv</th><th>Bonus per level</th><th>Total now</th><th>Stacks additively with</th></tr></thead>
      <tbody>
        <tr v-for="p in rows" :key="p.id" :class="{ missing: !p.discovered }">
          <td class="num">{{ p.id }}</td><td><Icon kind="potion" :id="p.id" :name="p.name" /></td><td class="num">{{ p.discovered ? p.level : '—' }}</td>
          <td>{{ p.bonus ?? '—' }}</td><td>{{ total(p) }}<template v-if="total(p) && scaled(p)">*</template><small v-if="groupSum(p)" class="muted" title="Everything in this additive group, at your levels"> (group {{ groupSum(p) }})</small></td><td class="muted">{{ groupOthers(p) || '—' }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>Levels from your save. Bonus text, totals and additive groups from the game's code (each potion's tooltip and the Pbonus block, potion-formulas.ts).</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.err { color: var(--bad); }
.muted { color: var(--muted); }
.bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-bottom: 10px; font-size: 13px; }
input[type=search] { width: 100%; max-width: 320px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); }
h3 { font-size: 16px; }
.tbl.disc { max-width: 760px; }
.tbl.brew { max-width: 820px; }
input.num { width: 80px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel); color: var(--text); }
.blocked { font-size: 12px; margin-bottom: 10px; } .blocked summary { cursor: pointer; color: var(--muted); }
.blocked span { display: inline-block; margin: 2px 10px 2px 0; }
tr.missing td { color: var(--muted); }
tr.missing :deep(.icon) { filter: grayscale(1) opacity(.5); }
</style>
