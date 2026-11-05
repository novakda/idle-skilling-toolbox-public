<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { bonusAmount, bonusName, DECK_LINKS_KEY, deckForBuild, LINKS, petLinkDeck } from '../cards/cards-calc'
import cardCatalog from '../../data/card-catalog.json'
import { inBookOrder, tabOf, tabTitle } from '../cards/card-art'
import Icon from '../../components/Icon.vue'
import { SECTION_ALIASES, sectionRef } from '../../section'
import { category, dropText } from './cards-missing'
import { cardSettings, cardsModel, cardsPlan, guide, levelGain, levelValue as levelValueOf, GUIDE_SECTIONS, PHASE, ROLLS_KEY, RUN_KEY, WEIGHTS_KEY, type BuildSpec, type Card, type Deck, type GuideCard, type Weights } from './cards-plan'
import cardGlobals from '../../data/card-globals.json'

type Adds = Record<string, number>
const props = defineProps<{ save: Record<string, unknown> | null; only?: 'bonus' | 'builds' }>()

// Computed in the browser from the loaded save + static catalog (no server): see cards-calc.ts. Verified against the
// game-code sandbox: 1386/1386 card values and 10/10 deck totals identical on a real save.
// The plan model (priorities, odds, farming decks, missing cards, plan) is cards-plan.ts, shared with the Do next page;
// so are the settings kept in this browser (cardSettings).
const kept = cardSettings()
// Steam Cloud saves don't store DeckLinkList (the game keeps deck links only locally), so the player sets them
// here when the save lacks them; kept in this browser.
const linkOverride = ref<Record<number, number>>(kept.links)
const linksMissing = computed(() => !!props.save && !Array.isArray(props.save.DeckLinkList))
function setLink(deck: number, link: number) {
  linkOverride.value = { ...linkOverride.value, [deck]: link }
  try { localStorage.setItem(DECK_LINKS_KEY, JSON.stringify(linkOverride.value)) } catch { /* not persisted */ }
}
// ponytail: cardsModel runs gates() (raid, Asylum and crusade fight models, ~0.6 s); kept apart from the settings so
// editing priorities or rolls/h doesn't rerun it.
const model = computed(() => (props.save ? cardsModel(props.save, linkOverride.value) : null))
const data = computed(() => model.value?.data ?? null)
const error = ref('')

const byId = computed(() => model.value?.byId ?? new Map<number, Card>())
// Crop cards boost only the crop they're named for, on plots growing it (PlantType[1..]; crop t = card 300+t).
const planted = computed(() => [...new Set(((props.save?.PlantType as number[]) ?? []).slice(1).filter((t) => t > 0))].map((t) => byId.value.get(300 + t)?.name ?? `crop ${t}`))
const owned = computed(() => model.value?.owned ?? [])
const add = (c: Card) => Object.values(c.adds)[0] ?? 0

// ---- Bonus priorities: per-deck weights (0-3) over bonus types, kept in this browser.
const weights = ref<Weights>(kept.weights)
const persist = () => { try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(weights.value)) } catch { /* not persisted */ } }

// Card rolls happen once per visible kill event, not per credited kill (defaults and how they were measured: cards-plan.ts).
// Editable because attack speed changes it.
const rollsPerHour = ref(kept.rollsPerHour)
const crusadeRunSec = ref(kept.crusadeRunSec)
const saveRun = () => { try { localStorage.setItem(RUN_KEY, String(crusadeRunSec.value || '')) } catch { /* not persisted */ } }
const saveRolls = () => { try { localStorage.setItem(ROLLS_KEY, String(rollsPerHour.value)) } catch { /* not persisted */ } }
const pl = computed(() => (props.save && model.value ? cardsPlan(props.save, { weights: weights.value, rollsPerHour: rollsPerHour.value, crusadeRunSec: crusadeRunSec.value, links: linkOverride.value }, model.value) : null))

const allTypes = computed(() => [...new Set(owned.value.flatMap((c) => Object.keys(c.adds)))].sort())
const maxAdd = computed(() => model.value?.maxAdd ?? {})
const byName = computed(() => model.value?.byName ?? new Map<string, Card>())
const guideCards = (d: Deck): GuideCard[] =>
  (GUIDE_SECTIONS[d.link] ?? []).flatMap((sec) => guide.sections[sec]?.[PHASE] ?? [])
const guideWeights = (d: Deck) => model.value?.guideW.get(d.deck) ?? null
const deckWeights = (d: Deck): Record<string, number> => pl.value?.deckWeights(d) ?? {}
const weightSource = (d: Deck) => (weights.value[d.deck] ? 'yours' : guideWeights(d) ? `guide, ${PHASE}` : 'current bonuses')
function resetWeights(d: Deck) { const w = { ...weights.value }; delete w[d.deck]; weights.value = w; persist() }
function setWeight(d: Deck, type: string, w: number) {
  weights.value = { ...weights.value, [d.deck]: { ...deckWeights(d), [type]: w } }
  persist()
}
const score = (c: Card, w: Record<string, number>) =>
  Object.entries(c.adds).reduce((s, [k, v]) => s + (w[k] ?? 0) * (v / (maxAdd.value[k] || 1)), 0)

const editing = ref<number | null>(null)

// ---- Leveling: what the next level adds, weighted by the priorities of every deck the card is in.
const levelValue = (c: Card) => levelValueOf(c, Number(props.save?.CardBonusTOTAL ?? 1), (data.value?.decks ?? []).map((d) => ({ deck: d.deck, w: deckWeights(d) })), maxAdd.value)

// ---- Level-up cost: spare dupes by tier (CardsOwnedbyTypeEXCESS[1..5]); swaps only go up (n of t -> 1 of t+1).
const excess = computed(() => (props.save?.CardsOwnedbyTypeEXCESS as number[]) ?? [])
/** Tier-1 equivalents per tier, from the swap rates: 1, 5, 20, 60, 120. */
const tierValue = computed(() => { const r = data.value?.swapRates ?? []; const v = [0, 1]; for (let t = 2; t <= 5; t++) v[t] = v[t - 1]! * (r[t - 1] ?? 1); return v })
const costOf = (lv: number) => data.value?.upgradeCost[lv] ?? null
const costT1 = (cost: number[]) => cost.reduce((s, n, t) => s + n * (tierValue.value[t] ?? 0), 0)
/** Affordable if, walking tiers low to high, own + swapped-up surplus covers each tier. */
function affordable(cost: number[]): boolean {
  const r = data.value?.swapRates ?? []
  let carry = 0
  for (let t = 1; t <= 5; t++) {
    const have = (excess.value[t] ?? 0) + carry, need = cost[t] ?? 0
    if (have < need) return false
    carry = t < 5 ? Math.floor((have - need) / (r[t] || Infinity)) : 0
  }
  return true
}
const fmtCost = (cost: number[]) => cost.slice(1).map((n, i) => (n ? `${n}×T${i + 1}` : '')).filter(Boolean).join(' ')

const showAllLevels = ref(false)
const leveling = computed(() => {
  const rows = owned.value.filter((c) => c.next).map((c) => {
    const cost = costOf(c.level), t1 = cost ? costT1(cost) : 0, value = levelValue(c), g = levelGain(c, Number(props.save?.CardBonusTOTAL ?? 1))
    return { c, gain: g.equipped, passive: g.passive, value, cost, t1, perCost: t1 ? (100 * value) / t1 : 0, ok: cost ? affordable(cost) : false }
  }).sort((a, b) => b.perCost - a.perCost || b.value - a.value || a.c.name.localeCompare(b.c.name))
  return showAllLevels.value ? rows : rows.filter((r) => r.value > 0)
})

const fmt = (n: number) => String(+n.toFixed(2))
const gainText = (r: { gain: Adds; passive: { key: string; gain: number } | null }) => {
  const eq = fmtAdds(r.gain), ps = r.passive?.gain ? `${r.passive.key} +${fmt(r.passive.gain)} passive` : ''
  return ps ? (eq === '—' ? ps : `${ps} (${eq} equipped)`) : eq
}
const fmtAdds = (a: Record<string, number>) => Object.entries(a).map(([k, v]) => bonusAmount(k, fmt(v))).join(', ') || '—'
// ---- Missing cards (#53): sources, odds, gates, value and the plan are in cards-missing.ts / cards-plan.ts.
const deckBonus = (link: number, key: string) => pl.value?.deckBonus(link, key) ?? 0
const energyFactor = computed(() => pl.value?.odds.energy ?? 1)
const missing = computed(() => pl.value?.missing ?? [])
const ready = computed(() => missing.value.filter((r) => r.status === 'ready'))
const gated = computed(() => missing.value.filter((r) => r.status === 'gated'))
const unreachable = computed(() => missing.value.filter((r) => r.status === 'unreachable'))
const ranked = computed(() => missing.value.filter((r) => r.status !== 'unreachable'))
const bestNext = computed(() => [...ready.value].filter((r) => r.hours != null).sort((a, b) => a.hours! - b.hours!)[0] ?? null)
const groups = computed(() => {
  const m = new Map<string, { n: number; ready: number }>()
  for (const r of missing.value) { const k = category(r), e = m.get(k) ?? { n: 0, ready: 0 }; m.set(k, { n: e.n + 1, ready: e.ready + (r.status === 'ready' ? 1 : 0) }) }
  return [...m].sort((a, b) => b[1].n - a[1].n)
})
const steps = computed(() => pl.value?.steps ?? { farm: [], boss: [] })
const PLAN_ROWS = 12
const deckFor = (kind: string) => pl.value?.deckFor(kind) ?? null
const bestDropDeck = (keys: string[]) => pl.value?.bestDropDeck(keys) ?? { picks: [] as Card[], total: 0 }
const EMPTY_FARM = { picks: [] as Card[], total: 0, now: 0, deck: undefined as number | undefined, factor: 1 }
const farmFight = computed(() => pl.value?.farmFight ?? EMPTY_FARM)
const farmCrusade = computed(() => pl.value?.farmCrusade ?? EMPTY_FARM)

const farms = computed(() => [{ label: 'Fighting (zone cards)', ...farmFight.value }, { label: 'Crusade fights', ...farmCrusade.value }])

const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${+h.toFixed(1)}h` : `${+(h / 24).toFixed(1)}d`)

// True odds (the author, 2026-10-24): a drop roll succeeds 1 in N (the game floors N, cards-missing.ts expectedKills), so the attempts
// until a card are geometric: expected N, but 50% of players have it by ln 2 / −ln(1 − 1/N) ≈ 0.69 N and 90% by ≈ 2.3 N.
const within = (N: number, q: number) => (N <= 1 ? 1 : Math.log(1 - q) / Math.log(1 - 1 / N))
const oddsText = (N: number | null) => (N == null ? '—' : N <= 1 ? 'every attempt' : `1 in ${fmtKills(N)} (${+(100 / N).toPrecision(2)}%)`)
const timeAt = (N: number | null, hours: number | null, q: number) => (N == null || hours == null ? null : hours * within(N, q) / Math.max(N, 1))
const fmtKills = (n: number | null) => (n == null ? '—' : n >= 1e4 ? `${+(n / 1e3).toFixed(1)}K` : String(n))

const filter = ref('')

// ---- By bonus: every owned card that gives one bonus type, best first. Passive cards count without being equipped.
const passives = new Map((cardGlobals.passives as { key: string; card: number; scaled: boolean; div: number; values: number[] }[]).map((p) => [p.card, p]))
const BONUS_KEY = 'idle-skilling.cards.byBonus'
const bonusPick = ref((() => { try { return localStorage.getItem(BONUS_KEY) ?? '' } catch { return '' } })())
const pickBonus = (k: string) => { bonusPick.value = k; try { localStorage.setItem(BONUS_KEY, k) } catch { /* not persisted */ } }
const passiveValue = (c: Card) => {
  const p = passives.get(c.id); if (!p) return null
  const v = (p.values[Math.min(Math.max(c.level, 0), 6)] ?? 0) / p.div
  return { key: p.key.slice(6), value: p.scaled ? v * Number(props.save?.CardBonusTOTAL ?? 1) : v }
}
const bonusTypes = computed(() => [...new Set([...allTypes.value, ...(data.value?.cards ?? []).flatMap((c) => { const p = passiveValue(c); return p && c.level >= 0 ? [p.key] : [] })])].sort())
const byBonus = computed(() => {
  const k = bonusPick.value
  if (!k) return []
  const decks = data.value?.decks ?? []
  return (data.value?.cards ?? []).flatMap((c) => {
    const p = passiveValue(c), equipped = c.adds[k]
    if (equipped == null && p?.key !== k) return []
    if (c.level < 1 && !(p?.key === k && p.value)) return []
    return [{ c, now: equipped ?? 0, next: c.next?.[k] ?? null, max: c.max[k] ?? null, passive: p?.key === k ? p.value : null,
      decks: c.decks.map((d) => { const dk = decks.find((x) => x.deck === d); return dk?.linkName ? `${d} (${dk.linkName})` : String(d) }) }]
  }).sort((a, b) => (b.passive ?? 0) + b.now - ((a.passive ?? 0) + a.now))
})
// ---- Builds (cards-plan.ts linkBuilds/specials): one per deck link with its variants, then specials no link applies to.
// Drop cards go in first (they add into one roll), then the best owned cards by the build's weights.
const MIN_SHARED = 3
const make = (b: BuildSpec) => {
  const slots = data.value?.slots ?? 10, first = b.drop ? bestDropDeck(b.drop).picks : [], taken = new Set(first.map((c) => c.id))
  const fill = owned.value.filter((c) => !taken.has(c.id)).map((c) => ({ c, s: score(c, b.w) })).filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s).slice(0, slots - first.length).map((x) => x.c)
  const picks = [...first, ...fill], decks = data.value?.decks ?? []
  const { deck, shared, linkedTo } = deckForBuild(decks, picks.map((c) => c.id), b.link, MIN_SHARED)
  const cur = new Set(deck?.cards.filter(Boolean)), ids = new Set(picks.map((c) => c.id))
  return { ...b, deck, linkedTo, shared, picks, add: picks.filter((c) => !cur.has(c.id)),
    remove: [...cur].filter((id) => !ids.has(id)).map((id) => byId.value.get(id)!).filter(Boolean) }
}
// The variant picked per link, kept in this browser; default = the variant closest to the linked deck (most cards shared).
const VARIANT_KEY = 'idle-skilling.cards.buildVariant'
const variantPick = ref<Record<number, string>>((() => { try { return JSON.parse(localStorage.getItem(VARIANT_KEY) ?? '{}') ?? {} } catch { return {} } })())
function pickVariant(link: number, label: string) {
  variantPick.value = { ...variantPick.value, [link]: label }
  try { localStorage.setItem(VARIANT_KEY, JSON.stringify(variantPick.value)) } catch { /* not persisted */ }
}
const linkBuilds = computed(() => (model.value?.linkBuilds ?? []).map((lb) => {
  const vs = lb.variants.map(make), shared = (v: (typeof vs)[number]) => v.picks.filter((c) => v.deck?.cards.includes(c.id)).length
  const closest = vs.reduce((best, v) => (shared(v) > shared(best) ? v : best), vs[0]!)
  // Tilling defaults to 'Crops in game' (the crops planted now) rather than whatever the old deck held.
  return { ...lb, vs, sel: vs.find((v) => v.label === variantPick.value[lb.link]) ?? (lb.link === 2 ? vs[0]! : closest) }
}))
const specials = computed(() => (model.value?.specials ?? []).map(make))
const collection = computed(() => {
  const q = filter.value.toLowerCase()
  return (data.value?.cards ?? [])
    .filter((c) => !c.hidden)
    .filter((c) => !q || `${c.name} ${c.type} ${dropText(c.id, c.zone)} ${tabOf(c)}`.toLowerCase().includes(q))
    .sort((a, b) => a.type.localeCompare(b.type) || add(b) - add(a))
})
// Cards page sections as tabs (#2586: Plan = Decks + Best cards to level; Reference = Collection + By bonus).
// Plan tab: one line per deck that points at its build (the full lists live on Builds only; #2624).
const buildFor = (d: Deck) => linkBuilds.value.find((b) => b.link === d.link)
function showBuild(link: number) { sec.value = 'builds'; nextTick(() => document.getElementById(`build-link-${link}`)?.scrollIntoView()) }
const SECTIONS = [['plan', 'Plan'], ['level', 'Upgrade priority'], ['missing', 'Missing cards'], ['builds', 'Builds'], ['reference', 'Reference']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id), SECTION_ALIASES.cards)
const petDeck = computed(() => (props.save ? petLinkDeck(props.save, cardCatalog as unknown as Parameters<typeof petLinkDeck>[1]) : null))
</script>

<template>
  <div v-if="!only" class="page-head">
    <h2>Cards</h2>
    <p>Your decks and what to change in each, which cards to level next, and where to farm the ones you're missing.</p>
    <div v-if="data" class="tiles">
      <div class="tile"><b>{{ owned.length }}/{{ data.cards.filter((c) => !c.hidden).length }}</b><span>cards owned</span></div>
      <div class="tile"><b>{{ leveling.filter((r) => r.ok).length }}</b><span>level-ups affordable</span></div>
      <div class="tile"><b>{{ missing.length }}</b><span>cards missing</span></div>
      <div class="tile"><b>{{ bestNext ? fmtHours(bestNext.hours!) : '—' }}</b><span>quickest next card</span></div>
    </div>
  </div>
  <div v-else-if="only === 'bonus'" class="page-head">
    <h2>By bonus</h2>
    <p>Every owned card that gives one bonus, strongest first; passive cards count even when not equipped.</p>
    <div v-if="data" class="tiles">
      <div class="tile"><b>{{ bonusTypes.length }}</b><span>bonus types</span></div>
      <div class="tile"><b>{{ bonusPick ? byBonus.length : '—' }}</b><span>cards with {{ bonusPick || 'the picked bonus' }}</span></div>
    </div>
  </div>
  <div v-else class="page-head">
    <h2>Builds</h2>
    <p>The best deck of owned cards for each activity, compared with the deck linked to it.</p>
    <div v-if="data" class="tiles">
      <div class="tile"><b>{{ linkBuilds.filter((b) => !b.sel.deck).length }}</b><span>builds no deck holds yet</span></div>
      <div class="tile"><b>{{ linkBuilds.filter((b) => b.sel.deck && b.sel.add.length).length }}</b><span>decks to change</span></div>
      <div class="tile"><b>{{ data.slots }}</b><span>deck slots</span></div>
    </div>
  </div>
  <p v-if="error" class="err">{{ error }}</p>
  <template v-if="data">
    <template v-if="!only">
    <template v-if="steps.farm.length || ready.length">
    <h3>Do this next</h3>
    <ol class="do">
      <li v-for="st in steps.farm.slice(0, 1)" :key="st.stop"><b>Farm {{ st.where }}</b> for {{ st.cards.map((r) => r.name).join(', ') }}: about
        <b>{{ fmtHours(st.hours) }}</b><template v-if="deckFor(st.kind)?.factor! < 0.999">, after putting {{ deckFor(st.kind)!.picks.map((c) => c.name).join(', ') }} in deck {{ deckFor(st.kind)!.deck ?? '—' }}
        (+{{ fmt(deckFor(st.kind)!.total) }}% card drop, now +{{ fmt(deckFor(st.kind)!.now) }}%)</template>. The most valuable card you can farm now; see Missing cards for the full plan.</li>
      <li v-for="st in steps.boss.filter((b) => b.pay!.readyIn === 0).slice(0, 1)" :key="st.stop"><b>Spend {{ st.pay!.pool === 'raid' ? 'raid tickets' : 'Asylum keys' }}</b> (you hold enough now):
        <table class="list mini"><thead><tr><th>Run</th><th>For</th><th class="num">Wins</th><th class="num">{{ st.pay!.pool === 'raid' ? 'Tickets' : 'Keys' }}</th></tr></thead>
          <tbody><tr><td>{{ st.where }}</td><td>{{ st.cards[0]!.name }}</td><td class="num">about {{ fmtKills(st.cards[0]!.kills) }}</td><td class="num">{{ Math.ceil(st.pay!.amount) }}</td></tr></tbody></table></li>
    </ol>
    </template>
    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}<small v-if="id === 'missing'"> {{ missing.length }}</small></button>
    </div>
    <template v-if="sec === 'plan'">
    <div class="sec-head"><h3>Decks</h3><span class="m">what each deck gives and what to change</span></div>
    <p class="note">Set per-deck priorities to compare different bonuses; each bonus is scaled so your best card for it counts 1.0.</p>
    <p v-if="petDeck && petDeck.cards.length && petDeck.linkedTotal < petDeck.total"><b>Pet screens deck:</b> {{ petDeck.linked ? `deck ${petDeck.linked.deck} is linked to Trek / Hatchery / Lab with +${petDeck.linkedTotal}% perk points` : 'no deck is linked to Trek / Hatchery / Lab' }}; put {{ petDeck.cards.map((c) => `${c.name} (+${c.adds.SkillPoints}%)`).join(', ') }} in a deck linked there for +{{ petDeck.total }}% perk points on every Hatchery, Trekking and Research level-up. <small class="m">Perk points are the only card bonus the pet screens read (Hatchery level-up @27686807).</small></p>
    <p v-if="linksMissing" class="note">This save doesn't include deck links (Steam Cloud saves leave them out). Set each deck's link below to match the game; it's remembered in this browser.</p>
    <div class="decks">
      <article v-for="d in data.decks" :key="d.deck" :class="{ active: d.active }">
        <h3>Deck {{ d.deck }}
          <select v-if="linksMissing" class="linksel" :value="d.link" :aria-label="`Deck ${d.deck} link`" @change="setLink(d.deck, +($event.target as HTMLSelectElement).value)">
            <option :value="0">not linked</option>
            <option v-for="(name, id) in LINKS" :key="id" :value="+id">{{ name }}</option>
          </select>
          <span v-else>{{ d.linkName ?? 'not linked' }}</span><em v-if="d.active">active</em></h3>
        <p v-if="buildFor(d)" class="rec">Best deck for {{ buildFor(d)!.name }}<template v-if="buildFor(d)!.vs.length > 1"> ({{ buildFor(d)!.sel.label }})</template>: <button class="link" @click="showBuild(d.link)">see Builds</button></p>
        <details class="deckcards"><summary>Cards in this deck ({{ d.cards.filter((id) => id && byId.get(id)).length }})</summary>
        <table class="list mini">
          <thead><tr><th>Card</th><th class="num">Lv</th><th>Bonus</th><th>Where</th></tr></thead>
          <tbody><tr v-for="(id, i) in d.cards" :key="i">
            <template v-if="id && byId.get(id)"><td><Icon kind="card" :id="id" :name="byId.get(id)!.name" /></td><td class="num">{{ byId.get(id)!.level }}</td>
              <td>{{ fmtAdds(byId.get(id)!.adds) }}</td><td class="tab">{{ tabOf(byId.get(id)!) }}</td></template>
            <td v-else colspan="4" class="emptyslot">empty</td>
          </tr></tbody>
        </table>
        </details>
        <table v-if="Object.keys(d.totals).length" class="list mini tot">
          <thead><tr><th>Deck gives</th><th class="num">Total</th></tr></thead>
          <tbody><tr v-for="(v, k) in d.totals" :key="k"><td>{{ k }}</td><td class="num">+{{ fmt(v) }}</td></tr></tbody>
        </table>
        <p v-else class="tot"><b>Gives:</b> —</p>
        <p v-if="d.link === 2" class="muted">Planted now: {{ planted.join(', ') || 'nothing' }}. Crop cards only boost their own crop while it's planted.</p>
        <div class="prio">
          <button class="link" @click="editing = editing === d.deck ? null : d.deck">{{ editing === d.deck ? 'Done' : 'Priorities' }}</button>
          <span v-if="editing !== d.deck" class="muted">({{ weightSource(d) }})<template v-for="[k, w] in Object.entries(deckWeights(d)).filter(([, w]) => w > 0)" :key="k"> <span class="chip">{{ k }} ×{{ w }}</span></template><template v-if="!Object.values(deckWeights(d)).some((w) => w > 0)"> none set</template></span>
          <button v-if="weights[d.deck]" class="link" @click="resetWeights(d)">use guide</button>
        </div>
        <div v-if="editing === d.deck" class="weights">
          <label v-for="t in allTypes" :key="t">
            <select :value="deckWeights(d)[t] ?? 0" @change="setWeight(d, t, +($event.target as HTMLSelectElement).value)">
              <option v-for="n in [0, 1, 2, 3]" :key="n" :value="n">{{ n }}</option>
            </select> {{ t }}
          </label>
        </div>
        <details v-if="guideCards(d).length" class="guide">
          <summary>Guide picks ({{ PHASE }}): {{ guideCards(d).filter((g) => (byName.get(g.card.toLowerCase())?.level ?? 0) >= 1).length }}/{{ guideCards(d).length }} owned</summary>
          <span v-for="g in guideCards(d)" :key="g.card + g.loc" :class="(byName.get(g.card.toLowerCase())?.level ?? 0) >= 1 ? 'have' : 'need'">
            {{ g.card }}<small> {{ g.bonus }}<template v-if="(byName.get(g.card.toLowerCase())?.level ?? 0) < 1"> · get at {{ g.loc }}</template></small>
          </span>
        </details>
      </article>
    </div>


    </template>

    <template v-else-if="sec === 'level'">
    <div class="sec-head"><h3>Best cards to level</h3><span class="m">next-level gain weighted by deck priorities, per cost; cap level {{ data.maxLevel }}</span></div>
    <p class="facts"><span><b>Spare dupes</b></span><span v-for="(n, i) in excess.slice(1, 6)" :key="i">T{{ i + 1 }} {{ n ?? 0 }}</span></p>
    <p class="note">✓ = affordable now, counting swaps up.</p>
    <details class="how"><summary>How costs are counted</summary>
    <p>Costs in tier-1 equivalents (swaps: 5 T1→T2, 4 T2→T3, 3 T3→T4, 2 T4→T5).</p>
    </details>
    <label class="muted small"><input v-model="showAllLevels" type="checkbox" /> include cards not in a prioritised deck</label>
    <div class="tbl"><table class="list">
      <thead><tr><th>Card</th><th>Tab</th><th class="num">Lv</th><th>Next level adds</th><th>At max</th><th>Decks</th><th class="num">Value</th><th class="num">Cost</th><th class="num">Value / 100 T1</th></tr></thead>
      <tbody>
        <tr v-for="r in leveling" :key="r.c.id">
          <td><Icon kind="card" :id="r.c.id" :name="r.c.name" /></td><td class="tab" :title="tabTitle(r.c)">{{ tabOf(r.c) }}</td><td class="num">{{ r.c.level }} → {{ r.c.level + 1 }}</td>
          <td>{{ gainText(r) }}</td><td>{{ fmtAdds(r.c.max) }}</td>
          <td>{{ r.c.decks.join(', ') || '—' }}</td><td class="num">{{ r.value ? fmt(r.value) : '—' }}</td>
          <td class="num" :class="{ 'st-good': r.ok }">{{ r.cost ? fmtCost(r.cost) : '—' }} <small>({{ r.t1 }} T1)</small><span v-if="r.ok"> ✓</span></td>
          <td class="num">{{ r.perCost ? fmt(r.perCost) : '—' }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'missing'">
    <div class="sec-head"><h3>Missing cards</h3><span class="m">{{ missing.length }} shown in-game but not found: {{ ready.length }} farmable now, {{ gated.length }} gated, {{ unreachable.length }} unreachable now; new cards ignore the daily drop cap</span></div>
    <p class="note">Time assumes <input v-model.number="rollsPerHour" type="number" min="1" class="num" aria-label="card rolls per hour" @change="saveRolls" /> card rolls per hour (one per visible kill; measured ~12,000/h in a zone fight, not the summary's kills/h).
      One crusade run takes <input v-model.number="crusadeRunSec" type="number" min="0" class="num" aria-label="seconds per crusade run" @change="saveRun" /> seconds including the restart (blank = show runs instead of time).
      Crusade odds use your current Fight Bonus, {{ Math.round(energyFactor * 100) }}%, which resets to 100% daily and drops 2.2 per attempt to a floor of 20 († @17987265), so farm crusade cards right after the reset.</p>
    <p class="note"><b>What the ranking optimises:</b> first what the card does for you, then the cheapest expected time. Value = the card's level-1 bonus
      scored in the deck whose priorities (Decks tab) want it most, each bonus scaled so your best owned card of it counts 1.0 (a bonus you own no card of counts 1.0),
      rounded to 0.1 so near-equal bonuses tie and the quicker card goes first. Gated cards show what unlocks them instead of a time.</p>

    <h3>Plan, step by step</h3>
    <p class="note">Cards you can farm now, grouped by where they drop so one stop collects several (a crusade run rolls every stage it clears), most value first, then quickest.
      Times assume the farming deck for that stop is equipped (listed under the plan).</p>
    <div v-if="steps.farm.length" class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Farm</th><th>Collects</th><th>Deck</th><th class="num">Value</th><th class="num">For</th><th class="num">Total</th></tr></thead>
      <tbody>
        <tr v-for="(st, k) in steps.farm.slice(0, PLAN_ROWS)" :key="st.stop">
          <td class="num">{{ k + 1 }}</td><td>{{ st.where }}</td>
          <td><template v-for="(r, i) in st.cards" :key="r.id">{{ i ? ', ' : '' }}<Icon kind="card" :id="r.id" :name="r.name" /></template></td>
          <td>{{ st.kind === 'zone' ? 'zone farming pick' : 'crusade farming pick' }}</td>
          <td class="num">{{ fmt(st.value) }}</td><td class="num">{{ fmtHours(st.hours) }}</td><td class="num">{{ fmtHours(st.total) }}</td>
        </tr>
        <tr><td></td><td colspan="4"><b>Total</b><span v-if="steps.farm.length > PLAN_ROWS" class="muted"> ({{ steps.farm.length }} stops; the first {{ PLAN_ROWS }} shown)</span></td><td></td><td class="num"><b>{{ fmtHours(steps.farm.at(-1)!.total) }}</b></td></tr>
      </tbody>
    </table></div>
    <p v-else class="note">Nothing farmable now in zones or crusades.</p>
    <template v-if="steps.boss.length">
    <p class="note"><b>Boss runs, alongside:</b> raid and Asylum cards cost tickets/keys that regenerate on their own, so run these while you farm.
      One card roll per win at fixed odds (no card-drop bonus applies): raids 1 in 70 − 2 × tickets, Asylum 1 in 100/110/130/145 − tickets.
      Only difficulties the fight model calls a win count. "Covered in" = when your tickets/keys pay for this run and every one above it;
      keys spent here aren't spent on traces (Asylum page). Fight time is the modelled kill time only, not starting each run.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Run</th><th>Card</th><th class="num">Value</th><th class="num">Wins</th><th class="num">Cost</th><th class="num">Covered in</th><th class="num">Fight time</th></tr></thead>
      <tbody>
        <tr v-for="(st, k) in steps.boss" :key="st.stop">
          <td class="num">{{ k + 1 }}</td><td>{{ st.where }}</td><td><Icon kind="card" :id="st.cards[0]!.id" :name="st.cards[0]!.name" /></td>
          <td class="num">{{ fmt(st.value) }}</td><td class="num">{{ fmtKills(st.cards[0]!.kills) }}</td>
          <td class="num">{{ Math.ceil(st.pay!.amount) }} {{ st.pay!.pool === 'raid' ? 'tickets' : 'keys' }}</td>
          <td class="num">{{ st.pay!.readyIn ? fmtHours(st.pay!.readyIn) : 'now' }}</td><td class="num">{{ fmtHours(st.hours) }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>
    <div class="farm">
      <div v-for="f in farms" :key="f.label">
        <b>{{ f.label }}:</b> put these {{ f.picks.length }} in the deck for +{{ fmt(f.total) }}% card drop (deck {{ f.deck ?? '—' }} now gives +{{ fmt(f.now) }}%)
        <span v-if="f.factor < 0.999">→ about {{ Math.round((1 - f.factor) * 100) }}% fewer attempts.</span>
        <span v-else>— already optimal.</span>
        <div class="muted">{{ f.picks.map((c) => `${c.name} (${tabOf(c)})`).join(', ') }}</div>
      </div>
      <p class="muted small">Only these cards carry drop bonuses, so the other {{ data.slots - farmFight.picks.length }}+ slots stay free for damage cards. Skill drops (tilling, botany, apothecary, spelunking) don't use card bonuses.</p>
    </div>
    <details class="how"><summary>How the odds, gates and times are worked out</summary>
    <p>Zones roll once per real monster death: 1 in 170 × (1 + mode/3) for the first five fight modes († @31781147), 1 in 1500 × (1 + (mode − 10)/2) for
      Purgatory to Oblivion († @31812316), each ÷ (1 + Card Drop Chance/100) from your Fighting deck (+{{ fmt(deckBonus(9, 'CardDropChance')) }}% now).
      Crusades roll once per stage cleared: 1 in 250 × ceil(c/3) on stages 1-4 († @23368435), 500 × ceil(c/4) on the boss († @23380524),
      ÷ Fight Bonus ÷ (1 + (Card Drop + Crusade Card + gear card chance)/100). A stage can't be repeated, so each run is one roll per stage.
      Raid bosses: 1 in 70 − 2 × tickets per win († @19925267, @19938662, @19954658, @19969084); Asylum: 1 in 100/110/130/145 − tickets per win
      († @26901624, @26919565, @26935833, @26954655).</p>
    <p>Gates: a fight mode's button opens at fightsunlocked ≥ mode († @4277274-@4279517); Maelstrom and Oblivion are opened by special keys
      († @3864936-@3866025; where those keys drop is unverified, and so is Purgatory's own gate). You move up a stage once that stage's kill count
      reaches its requirement († @7633616); the furthest stage is taken as the highest with kills recorded (unverified: the next one may already be open; kill counts can reset, so a stage you once reached may be gated again).
      Crusades: unlocked once they have a difficulty, beatable when the crusade fight model wins at difficulty 1 (card odds don't depend on difficulty).
      Bosses: unlocked by beating the one before; the raid/Asylum fight models' verdict must be a win at that difficulty.</p>
    </details>
    <div class="places">
      <span v-for="[place, x] in groups" :key="place"><b>{{ place }}</b> {{ x.n }} <small>({{ x.ready }} farmable now)</small></span>
    </div>
    <h3>Every missing card, ranked</h3>
    <div class="tbl"><table class="list">
      <thead><tr><th>Card</th><th>Tab</th><th>Bonus at level 1</th><th class="num">Value</th><th>Where</th><th class="num">Odds per attempt</th><th class="num">Expected attempts</th><th>Time (expected · 50% · 90%), or what unlocks it</th><th>Drop boosts</th></tr></thead>
      <tbody>
        <tr v-for="r in ranked" :key="r.id" :class="{ locked: r.status === 'gated' }">
          <td><Icon kind="card" :id="r.id" :name="r.name" /></td><td class="tab" :title="tabTitle(byId.get(r.id)!)">{{ tabOf(byId.get(r.id)!) }}</td>
          <td>{{ fmtAdds(r.adds) }}<small v-if="r.deck"> · deck {{ r.deck }}</small></td><td class="num">{{ r.value ? fmt(r.value) : '—' }}</td>
          <td>{{ r.where }}</td>
          <td class="num">{{ oddsText(r.kills) }}</td>
          <td class="num">{{ fmtKills(r.kills) }} <small v-if="r.src?.kind === 'skill'">{{ r.src.per }}</small><small v-else-if="r.src?.kind === 'crusade'">runs</small><small v-else-if="r.src?.kind === 'boss'">wins</small></td>
          <td><template v-if="r.status === 'ready'">{{ r.hours != null ? fmtHours(r.hours) : '—' }}<small v-if="r.hours != null && r.kills != null && r.kills > 1" class="m"> · 50% by {{ fmtHours(timeAt(r.kills, r.hours, 0.5)!) }} · 90% by {{ fmtHours(timeAt(r.kills, r.hours, 0.9)!) }}</small></template><template v-else-if="r.status === 'gated'"><span class="st-warn">Gated:</span> {{ r.why }}</template><small v-else>{{ r.why }}</small></td>
          <td><small>{{ r.boosts }}</small></td>
        </tr>
      </tbody>
    </table></div>
    <h3>Unreachable now</h3>
    <div v-if="unreachable.length" class="tbl"><table class="list">
      <thead><tr><th>Card</th><th>Bonus at level 1</th><th>Why</th></tr></thead>
      <tbody>
        <tr v-for="r in unreachable" :key="r.id"><td><Icon kind="card" :id="r.id" :name="r.name" /></td><td>{{ fmtAdds(r.adds) }}</td><td>{{ r.why }}</td></tr>
      </tbody>
    </table></div>
    <p v-else class="note">None: every missing card has a source you can work toward.</p>
    </template>
    </template>
    <template v-if="!only && sec === 'reference'">
    <div class="sec-head"><h3>Collection</h3><span class="m">{{ owned.length }} / {{ data.cards.filter((c) => !c.hidden).length }} owned; Tab column is Main/Skull set, tab, row, column (hover for zones)</span></div>
    <input v-model="filter" type="search" placeholder="Filter by name, bonus or zone…" aria-label="Filter cards" />
    <div class="tbl"><table class="list">
      <thead><tr><th>Card</th><th>Tab</th><th class="num">Lv</th><th>Bonus</th><th>Adds</th><th>Decks</th><th>Drops in</th></tr></thead>
      <tbody>
        <tr v-for="c in collection" :key="c.id" :class="{ missing: c.level < 1 }">
          <td><Icon kind="card" :id="c.id" :name="c.name" /></td><td class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</td><td class="num">{{ c.level < 1 ? '—' : c.level }}</td><td>{{ bonusName(c.type) }}</td>
          <td>{{ fmtAdds(c.adds) }}</td><td>{{ c.decks.join(', ') || '—' }}</td><td>{{ dropText(c.id, c.zone) }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>
    <template v-if="only === 'bonus' || (!only && sec === 'reference')">
    <div v-if="!only" class="sec-head"><h3>By bonus</h3><span class="m">every owned card that gives one bonus, strongest first; passive cards count even when not equipped</span></div>
    <p class="note">
      <select :value="bonusPick" aria-label="Bonus type" @change="pickBonus(($event.target as HTMLSelectElement).value)">
        <option value="">Pick a bonus…</option>
        <option v-for="t in bonusTypes" :key="t" :value="t">{{ t }}</option>
      </select>
      <template v-if="bonusPick"> {{ byBonus.length }} cards</template>
    </p>
    <div v-if="byBonus.length" class="tbl"><table class="list">
      <thead><tr><th>Card</th><th class="num">Lv</th><th class="num">Now (equipped)</th><th class="num">Next level</th><th class="num">Max</th><th class="num">Passive</th><th>Decks</th></tr></thead>
      <tbody>
        <tr v-for="r in byBonus" :key="r.c.id">
          <td><Icon kind="card" :id="r.c.id" :name="r.c.name" /></td><td class="num">{{ r.c.level < 1 ? 0 : r.c.level }}</td>
          <td class="num">{{ r.now ? '+' + fmt(r.now) : '—' }}</td><td class="num">{{ r.next != null ? '+' + fmt(r.next) : '—' }}</td><td class="num">{{ r.max != null ? '+' + fmt(r.max) : '—' }}</td>
          <td class="num">{{ r.passive != null ? '+' + fmt(r.passive) + ' always' : '—' }}</td><td>{{ r.decks.join(', ') || '—' }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>
    <details v-if="!only" class="how"><summary>Sources</summary>
    <p>Bonuses are the game's own card calculation run on each deck (it reproduces every card bonus in your save).</p>
    </details>
    <template v-if="only === 'builds' || (!only && sec === 'builds')">
    <div v-if="!only" class="sec-head"><h3>Builds</h3><span class="m">the best deck of owned cards for each deck link vs the deck linked to it</span></div>
    <p class="note">Decks follow the deck links. Each link's first build weighs everything that link's activities read (guide {{ PHASE }} cards, else every bonus the activity reads); pick a variant to swap to on purpose. Card farming puts every drop card in first (they add into one roll), then fills with damage.</p>
    <div class="decks">
      <article v-for="lb in linkBuilds" :key="lb.link" :id="`build-link-${lb.link}`">
        <h3>{{ lb.name }} <small>link {{ lb.link }} · {{ lb.sel.deck ? `vs deck ${lb.sel.deck.deck} (${lb.sel.shared} of its cards already there)` : 'no deck holds this build yet' }}</small></h3>
        <select v-if="lb.vs.length > 1" class="linksel" :value="lb.sel.label" :aria-label="`${lb.name} build variant`" @change="pickVariant(lb.link, ($event.target as HTMLSelectElement).value)">
          <option v-for="v in lb.vs" :key="v.label" :value="v.label">{{ v.label }}</option>
        </select>
        <template v-for="b in [lb.sel]" :key="b.label">
        <ol><li v-for="c in inBookOrder(b.picks)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <small><span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span> · lv{{ c.level }} · {{ fmtAdds(c.adds) }}</small></li></ol>
        <p v-if="b.note" class="note">{{ b.note }}</p>
        <div v-if="b.deck && b.add.length" class="rec"><div>Swap out: <template v-if="b.remove.length"><ul class="cardlist"><li v-for="c in inBookOrder(b.remove)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></template><template v-else>nothing</template></div><div>In: <ul class="cardlist"><li v-for="c in inBookOrder(b.add)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></div></div>
        <div v-else-if="b.deck" class="rec muted">That deck already matches.</div>
        <div v-if="!b.deck" class="rec">Build it in a spare deck (no deck has {{ MIN_SHARED }}+ of these cards): <ul class="cardlist"><li v-for="c in inBookOrder(b.picks)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></div>
        <div v-if="b.link && b.deck && b.deck.link !== b.link" class="m">Deck {{ b.deck.deck }} is not linked to this activity ({{ b.linkedTo ? `the link is on deck ${b.linkedTo.deck}` : 'no deck has the link' }}): link deck {{ b.deck.deck }} when you use this build.</div>
        </template>
      </article>
    </div>
    <div class="sec-head"><h3>No link applies</h3><span class="m">compared with the selected deck</span></div>
    <div class="decks">
      <article v-for="b in specials" :key="b.label" :id="`build-${b.label}`">
        <h3>{{ b.label }} <small>{{ b.deck ? `vs deck ${b.deck.deck} (${b.shared} of its cards already there)` : 'no deck holds this build yet' }}</small></h3>
        <ol><li v-for="c in inBookOrder(b.picks)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <small><span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span> · lv{{ c.level }} · {{ fmtAdds(c.adds) }}</small></li></ol>
        <p v-if="b.note" class="note">{{ b.note }}</p>
        <div v-if="b.deck && b.add.length" class="rec"><div>Swap out: <template v-if="b.remove.length"><ul class="cardlist"><li v-for="c in inBookOrder(b.remove)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></template><template v-else>nothing</template></div><div>In: <ul class="cardlist"><li v-for="c in inBookOrder(b.add)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></div></div>
        <div v-else-if="b.deck" class="rec muted">That deck already matches.</div>
        <div v-if="!b.deck" class="rec">Build it in a spare deck (no deck has {{ MIN_SHARED }}+ of these cards): <ul class="cardlist"><li v-for="c in inBookOrder(b.picks)" :key="c.id"><Icon kind="card" :id="c.id" :name="c.name" /> <span class="tab" :title="tabTitle(c)">{{ tabOf(c) }}</span></li></ul></div>
        <div v-if="b.link && b.deck && b.deck.link !== b.link" class="m">Deck {{ b.deck.deck }} is not linked to this activity ({{ b.linkedTo ? `the link is on deck ${b.linkedTo.deck}` : 'no deck has the link' }}): link deck {{ b.deck.deck }} when you use this build.</div>
      </article>
    </div>
    </template>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.err { color: var(--bad); }
.decks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; margin-bottom: 20px; }
article { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--panel); min-width: 0; }
article.active { border-color: var(--accent); }
h3 { font-size: 16px; margin: 18px 0 6px; } h3 small { font-weight: 400; font-size: 13px; }
.sec-head h3 { margin: 0; }
article h3 { font-size: 15px; margin: 0 0 6px; }
h3 span { color: var(--muted); font-weight: 400; margin-left: 6px; }
.linksel { font-size: 12px; margin-left: 6px; }
h3 em { color: var(--accent); font-style: normal; font-size: 12px; margin-left: 6px; }
ol { margin: 0; padding-left: 22px; font-size: 13px; }
li { overflow-wrap: anywhere; }
td.emptyslot { color: var(--muted); font-style: italic; }
table.mini { min-width: 0; margin-top: 4px; }
.chip { display: inline-block; border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; margin: 1px 4px 1px 0; }
small { color: var(--muted); }
.tot { font-size: 13px; margin: 6px 0 0; overflow-wrap: anywhere; }
.prio { margin-top: 6px; font-size: 13px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.muted { color: var(--muted); }
button.link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
.weights { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr)); gap: 2px 10px; font-size: 12px; margin-top: 6px; max-height: 220px; overflow: auto; }
.weights select { font-size: 12px; }
.guide { font-size: 12px; margin-top: 6px; }
.guide summary { cursor: pointer; color: var(--muted); }
.guide span { display: inline-block; margin: 2px 8px 2px 0; }
.rec { font-size: 13px; margin-top: 6px; overflow-wrap: anywhere; }
input[type=search] { width: 100%; max-width: 360px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); margin: 6px 0 10px; }
tr.missing td { color: var(--muted); }
.small { font-size: 12px; }
td.tab { white-space: nowrap; color: var(--muted); }
tr.missing :deep(.icon) { filter: grayscale(1) opacity(.6); }
input.num { width: 90px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--panel); color: var(--text); }
.next { font-size: 14px; margin: 4px 0 10px; }
.farm { font-size: 13px; margin-bottom: 10px; display: grid; gap: 6px; }
.farm .muted { overflow-wrap: anywhere; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
tr.locked td { color: var(--muted); }
.places { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; margin-bottom: 8px; }
.cardlist { list-style: none; margin: 2px 0 6px 1em; padding: 0; }
.cardlist li { margin: 2px 0; }
.cardlist .tab { color: var(--muted); font-size: 13px; margin-left: 4px; }
</style>
