<script setup lang="ts">
import { computed, ref } from 'vue'
import { bagTier, canBuy, hired, learnGain, MIN_REQ, nextSteps, PERK_FX, PERKS, plan, pointsFor, SLOTS, STATUS, treasureName, upgradeGain, type Buy, type Spelunker } from './spelunking'
import Icon from '../../components/Icon.vue'
import { sectionRef } from '../../section'
import { simulate, type Sim } from './spelunk-sim'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const s = computed(() => props.save)
const p = computed(() => (s.value && hired(s.value).length ? plan(s.value) : null))
const left = computed(() => (s.value ? Math.max(n(s.value.SpelunkerREQ) - n(s.value.SpelunkerEXP), 0) : 0))
const deepest = computed(() => (p.value ? p.value.all.reduce((m, x) => (x.target > m.target ? x : m)) : null))
const soonest = computed(() => p.value?.all[0] ?? null)
const ready = (x: Spelunker) => x.atTarget || x.st === 0
const digging = computed(() => p.value?.all.filter((x) => x.st === 1 && !x.atTarget) ?? [])
const ups = computed(() => (s.value && p.value ? p.value.allUps.map((u) => ({ ...u, gain: upgradeGain(s.value!, u.k, u.u) }))
  .sort((a, b) => Number(b.c.ok) - Number(a.c.ok) || Number(a.u === 2) - Number(b.u === 2) || b.gain - a.gain) : []))
// The loop simulation (spelunk-sim.ts) takes a few seconds, so it runs on demand. ponytail: on the main thread; a Web Worker if
// the wait gets in the way.
const checkEvery = ref(0), sim = ref<Sim | null>(null), simBusy = ref(false), simFor = ref(-1)
function runSim() {
  if (!s.value) return
  simBusy.value = true
  setTimeout(() => { try { sim.value = simulate(s.value!, { checkEvery: checkEvery.value }); simFor.value = checkEvery.value } finally { simBusy.value = false } }, 30)
}
const simT = (h: number) => (h < 48 ? `${+h.toFixed(1)} h` : h < 24 * 730 ? `${+(h / 24).toFixed(1)} d` : `${(h / 8766).toPrecision(3)} years`)
const topUp = computed(() => ups.value.find((u) => u.c.ok && u.u !== 2) ?? null)

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return i < units.length - 1 || x < 1e33 ? `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}` : x.toExponential(2)
}
const hrs = (h: number | null) => (h == null || !Number.isFinite(h) ? '—' : h <= 0 ? 'now' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`)
const pct = (x: number) => `${+x.toPrecision(3)}%`
const bag = (v: number) => (bagTier(v) ? `${treasureName(bagTier(v))} (tier ${bagTier(v)}, ${fmt(v)})` : `none yet (${fmt(v)} of 100)`)
const when = (x: Spelunker) => (x.atTarget ? 'now' : x.st === 0 ? 'now' : x.st === 1 ? hrs(x.hours) : x.learnHours != null ? hrs(x.learnHours) : '—')
const tripPerks = (x: Spelunker) => (s.value && x.bar != null ? Array.from({ length: 14 }, (_, j) => j + 1).filter((q) => learnGain(s.value!, x.bar!, q)) : [])
// ---- #2653: Can buy / Next steps, toward the next Construction domain (spelunking.ts gate/route/canBuy/nextSteps).
const BUY_SORTS = { bang: ['Bang for buck (gate hours saved per stock)', (a: Buy, b: Buy) => b.bang - a.bang || b.growth / (b.share || 1e-9) - a.growth / (a.share || 1e-9)],
  saved: ['Gate hours saved', (a: Buy, b: Buy) => b.saved - a.saved], growth: ['Growth gain', (a: Buy, b: Buy) => b.growth - a.growth],
  share: ['Cheapest (stock share)', (a: Buy, b: Buy) => a.share - b.share] } as const
const buySort = ref<keyof typeof BUY_SORTS>('bang')
const buys = computed(() => (s.value && p.value ? [...canBuy(s.value)].sort((a, b) => Number(a.status === 'short') - Number(b.status === 'short') || BUY_SORTS[buySort.value][1](a, b)) : []))
const steps = computed(() => (s.value && p.value ? nextSteps(s.value) : null))
const convText = (c: Record<number, number>, to: number | null) => Object.entries(c).map(([u, x]) => `${+x.toPrecision(3)} ${treasureName(+u)}`).join(' + ') + (to ? ` → ${treasureName(to)} in a machine` : '')
const STATUS_TXT = { now: 'can buy', convert: 'machine first', short: 'short' } as const
const SECTIONS = [['spelunkers', 'Spelunkers'], ['buy', 'Can buy'], ['next', 'Next steps'], ['timeline', 'Timeline'], ['upgrades', 'Upgrades'], ['perks', 'Perks']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2><Icon kind="skill" name="Spelunking" id="SpelunkerLV" /></h2>
    <p>How deep each spelunker is, what its perks do now and at the next level, and which one needs you next.</p>
    <div v-if="s && p" class="tiles">
      <div class="tile"><b>Lv {{ n(s.SpelunkerLV) }}</b><span>Spelunking: {{ fmt(left) }} EXP to go (opening bags gives EXP)</span></div>
      <div class="tile"><b>{{ p.all.length }} of {{ SLOTS }} spelunkers</b><span>{{ p.all.filter((x) => x.st === 1).length }} digging · {{ p.all.filter((x) => x.st === 2).length }} learning · {{ p.all.filter((x) => x.st === 0).length }} home</span></div>
      <div class="tile"><b>{{ deepest ? fmt(deepest.target) : '—' }}</b><span>deepest dig target (spelunker {{ deepest?.k }})</span></div>
      <div class="tile"><b>{{ soonest ? when(soonest) : '—' }}</b><span>{{ soonest ? `spelunker ${soonest.k} needs you next` : '' }}</span></div>
    </div>
  </div>
  <p v-if="!s || !p" class="note">Load a save with Spelunking unlocked to see this page.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <template v-for="x in p.all" :key="'d' + x.k">
        <li v-if="x.atTarget"><b class="st-good">Spelunker {{ x.k }} is at its dig target</b> ({{ fmt(x.target) }}): bring it home for
          {{ x.bags.count > 1 ? `${x.bags.count} bags, the first` : 'a bag' }} {{ bag(x.bagNow) }}, or Dig Down to raise the target by
          {{ fmt(x.dig) }} (depth restarts at 0, so this trip's bag is given up).</li>
        <li v-else-if="x.st === 0"><b class="st-good">Spelunker {{ x.k }} is home</b>: send it digging, or learning (Spelunking 7+) to level its perks.</li>
        <li v-else-if="x.st === 2"><b>Spelunker {{ x.k }} is learning</b>: bar {{ x.bar!.toFixed(2) }}; ending the trip now levels
          {{ tripPerks(x).length }} of 14 perks.<template v-if="x.nextPerk"> {{ PERKS[x.nextPerk] }} joins at bar {{ MIN_REQ[x.nextPerk] }}, in {{ hrs(x.learnHours) }}.</template></li>
      </template>
      <li v-if="digging[0]">Spelunker {{ digging[0].k }} reaches its target in <b>{{ hrs(digging[0].hours) }}</b>; its bag then: {{ bag(digging[0].bagAtTarget) }}.</li>
      <li v-if="topUp"><b>Buy Spelunker {{ topUp.k }}'s {{ topUp.name }} level {{ topUp.level + 1 }}</b>: +{{ pct(100 * topUp.gain) }} bag value per hour
        for {{ fmt(topUp.c.gold) }} gold and {{ fmt(topUp.c.amount) }} {{ treasureName(topUp.c.tier) }}.</li>
      <li v-else-if="ups[0]">No upgrade is affordable. The best, <b>Spelunker {{ ups[0].k }}'s {{ ups[0].name }}</b> (+{{ pct(100 * ups[0].gain) }}
        {{ ups[0].u === 2 ? 'Dig Down' : 'bag value/h' }}), needs {{ fmt(ups[0].c.amount) }} {{ treasureName(ups[0].c.tier) }} (you have {{ fmt(ups[0].c.held) }})
        and {{ fmt(ups[0].c.gold) }} gold; Construction's machines turn 1 of a treasure into 3 of the one below.</li>
      <li v-if="p.hire">Spelunker {{ p.hire.k }} can be hired at Spelunking {{ p.hire.level }}{{ n(s.SpelunkerLV) >= p.hire.level ? '' : ` (you are ${n(s.SpelunkerLV)})` }}
        for {{ fmt(p.hire.gold) }} gold{{ n(s.goldcoin) > p.hire.gold ? '' : ` (you have ${fmt(n(s.goldcoin))})` }} and {{ fmt(p.hire.amount) }} {{ treasureName(p.hire.tier) }}
        (you have {{ fmt(p.hire.held) }}).<span :class="p.hire.ok ? 'st-good' : 'st-bad'"> {{ p.hire.ok ? 'You can hire now.' : '' }}</span></li>
    </ol>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'spelunkers'">
    <div class="sec-head"><h3>Spelunkers</h3><span class="m">ordered by when each one next needs you</span></div>
    <details class="how"><summary>How the order and bags are worked out</summary>
    <p>At its target or home first, then the soonest to arrive: the actions
      differ in kind (a bag, a deeper target, perk levels), so the page orders by time rather than weighing them. A digger adds its depth
      per hour until the target (every 50 ms and while away, † @29964600, @29950000); a bag is worth depth × value († @30082348) and holds
      treasure of tier ⌊log10 value⌋ − 1.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Spelunker</th><th>Status</th><th class="num">Depth / target</th><th class="num">Depth/h</th><th class="num">Ready in</th><th>Bag now</th><th>Bag at target</th><th class="num">Dig Down</th><th class="num">Value</th><th class="num">Speed</th><th class="num">Dig</th></tr></thead>
      <tbody>
        <tr v-for="x in p.all" :key="x.k">
          <td>{{ x.k }}</td>
          <td :class="ready(x) ? 'st-good' : ''">{{ x.atTarget ? 'at target' : STATUS[x.st] ?? `moving (${x.st})` }}</td>
          <td class="num">{{ x.st === 2 ? `${fmt(x.depth)} learn pts` : `${fmt(x.depth)} / ${fmt(x.target)} (${Math.min(100, Math.floor((100 * x.depth) / x.target))}%)` }}</td>
          <td class="num">{{ x.st === 2 ? `${fmt(x.learn)} learn` : fmt(x.speed) }}</td>
          <td class="num">{{ when(x) }}</td>
          <td><template v-if="x.st !== 1">—</template><template v-else-if="bagTier(x.bagNow)">{{ treasureName(bagTier(x.bagNow)) }}<br /><small class="m">tier {{ bagTier(x.bagNow) }}, value {{ fmt(x.bagNow) }}</small></template><template v-else>{{ bag(x.bagNow) }}</template></td>
          <td><template v-if="bagTier(x.bagAtTarget)">{{ treasureName(bagTier(x.bagAtTarget)) }}<br /><small class="m">tier {{ bagTier(x.bagAtTarget) }}, value {{ fmt(x.bagAtTarget) }}</small></template><template v-else>{{ bag(x.bagAtTarget) }}</template></td>
          <td class="num">+{{ fmt(x.dig) }}</td>
          <td class="num">{{ x.V }}</td><td class="num">{{ x.S }}</td><td class="num">{{ x.D }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'buy'">
    <div class="sec-head"><h3>Can buy</h3><span class="m">every Spelunking purchase, ranked by hours it takes off reaching the {{ steps?.gate.domain ?? 'next' }} domain</span></div>
    <p class="note"><template v-if="steps">The gate: Construction's <b>{{ steps.gate.domain }}</b> domain opens when you hold more than {{ steps.gate.more }}
      {{ treasureName(steps.gate.tier) }} (treasure {{ steps.gate.tier }}; you have {{ fmt(steps.gate.held) }}). It holds {{ steps.gate.opens.join(', ') }}.</template>
      <b>Gate hours</b> = time until the fastest spelunker brings home a bag whose expected {{ steps ? treasureName(steps.gate.tier) : 'gate treasure' }} covers the need
      (reach its target, Dig Down as often as needed, items per bag and the rare-step chance from the game's blocks). <b>Share</b> = the treasure it costs ÷
      what you hold of that tier, counting higher tiers a machine turns into it (1 of tier u = 3^(u − t)), never the gate's tier or above.
      <b>Bang for buck</b> = gate hours saved ÷ share (hours per whole stock); purchases that don't move the gate rank after, by growth ÷ share.
      Gold is not a limit at these costs. The card row counts while that deck is selected (the game selects a deck linked to Spelunking when you open its screen).</p>
    <div class="bar"><label>Sort <select v-model="buySort"><option v-for="(o, k) in BUY_SORTS" :key="k" :value="k">{{ o[0] }}</option></select></label>
      <span class="muted">{{ buys.filter((b) => b.status !== 'short').length }} of {{ buys.length }} payable now or after a machine</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Buy</th><th>Cost</th><th class="num">Share</th><th class="num">Growth</th><th class="num">Gate hours</th><th class="num">Saved</th><th class="num">Bang</th><th>Status</th></tr></thead>
      <tbody><tr v-for="b in buys" :key="b.id">
        <td>{{ b.what }}<br v-if="b.detail" /><small v-if="b.detail" class="m">{{ b.detail }}</small></td>
        <td>{{ b.tier ? `${fmt(b.amount)} ${treasureName(b.tier)}` : 'free' }}<small v-if="b.tier" class="m"> (hold {{ fmt(n((s!.TreasureOwned as number[])[b.tier])) }})</small></td>
        <td class="num">{{ b.tier ? pct(100 * b.share) : '—' }}</td>
        <td class="num">+{{ pct(100 * b.growth) }} <small class="m">{{ b.growthOf }}</small></td>
        <td class="num">{{ hrs(b.before) }} → {{ hrs(b.after) }}</td>
        <td class="num" :class="b.saved > 0 ? 'st-good' : b.saved < 0 ? 'st-bad' : ''">{{ b.saved ? `${b.saved > 0 ? '−' : '+'}${hrs(Math.abs(b.saved))}` : '0' }}</td>
        <td class="num">{{ Number.isFinite(b.bang) ? fmt(b.bang) : 'free' }}</td>
        <td :class="b.status === 'short' ? 'st-bad' : 'st-good'">{{ STATUS_TXT[b.status] }}</td>
      </tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'next'">
    <div class="sec-head"><h3>Next steps</h3><span class="m">a greedy plan to the {{ steps?.gate.domain ?? 'next' }} domain</span></div>
    <p v-if="!steps" class="note">Every Construction domain is open.</p>
    <template v-else>
    <p class="note">Greedy: link the card deck if it helps, then keep buying the purchase with the best bang for buck (as on Can buy), paying from what is left
      after the steps before it, until nothing takes hours off; then send the fastest spelunker down. Hours are the gate time after each step.
      Machine conversions run at the machine's speed (minutes for these amounts); set a machine's input to the higher treasure and output to the one you pay.</p>
    <ol class="do">
      <li v-for="(x, i) in steps.steps" :key="i"><b>{{ x.what }}</b><template v-if="x.levels > 1"> ({{ x.levels }} levels)</template>:
        <template v-if="x.tier">{{ fmt(x.amount) }} {{ treasureName(x.tier) }}<template v-if="Object.keys(x.conv).length">, made from {{ convText(x.conv, x.tier) }}</template></template>
        <template v-else>{{ x.detail }}</template>. Gate in <b>{{ hrs(x.hours) }}</b>.</li>
      <template v-if="steps.route">
        <li v-for="(l, i) in steps.route.legs" :key="'l' + i">Spelunker {{ steps.route.k }}
          <template v-if="i === 0">reaches its target {{ fmt(l.target) }} at <b>{{ hrs(l.hours) }}</b></template>
          <template v-else>Dig Down → target {{ fmt(l.target) }}, reached at <b>{{ hrs(l.hours) }}</b></template>:
          bag {{ bag(l.bag) }}, ~{{ +l.expected.toFixed(2) }} {{ treasureName(steps.gate.tier) }} expected<template v-if="i === steps.route.legs.length - 1">
          — <b class="st-good">bring it home</b> and click the {{ steps.gate.domain }} Sentinel on the Construction screen.</template><template v-else> — not enough, Dig Down.</template></li>
      </template>
      <li v-else>No spelunker reaches it within 40 Dig Downs at current speed.</li>
    </ol>
    <p class="note">Without these purchases: {{ steps.start ? `${hrs(steps.start.hours)} (spelunker ${steps.start.k}, ${steps.start.digs} Dig Downs)` : 'not reachable' }}.
      Treasure the plan converts is gone for other uses: hiring spelunker {{ p.hire?.k }} takes {{ p.hire ? `${fmt(p.hire.amount)} ${treasureName(p.hire.tier)} and Spelunking ${p.hire.level}` : '—' }};
      you will hold {{ fmt(n((steps.save.TreasureOwned as number[])[p.hire?.tier ?? 0])) }} {{ p.hire ? treasureName(p.hire.tier) : '' }} after it.</p>
    </template>
    </template>

    <template v-else-if="sec === 'timeline'">
    <div class="sec-head"><h3>Timeline if you reinvest</h3><span class="m">every trip's treasure buys the next best upgrade (expected values)</span></div>
    <p>
      <label>Check in every <select v-model.number="checkEvery"><option :value="0">moment it's ready</option><option :value="4">4 h</option><option :value="8">8 h</option><option :value="12">12 h</option><option :value="24">24 h</option></select></label>
      <button :disabled="simBusy || !s" @click="runSim">{{ simBusy ? 'Simulating…' : sim ? 'Re-run' : 'Simulate' }}</button>
      <span v-if="sim && simFor !== checkEvery" class="m"> (shown: every {{ simFor ? simFor + ' h' : 'moment' }})</span>
    </p>
    <template v-if="sim">
      <p class="note">{{ sim.gate.domain }} gate in <b>{{ sim.hours != null && Number.isFinite(sim.hours) ? simT(sim.hours) : 'not within the simulated span' }}</b>, against {{ simT(sim.baseline) }} with no reinvestment. {{ sim.trips }} trips home, {{ sim.digs }} Dig Downs.</p>
      <div class="tbl"><table class="list nosort"><thead><tr><th class="num">After</th><th>Date</th><th>Milestone</th></tr></thead>
        <tbody><tr v-for="m in sim.milestones" :key="m.what + m.hours"><td class="num">{{ simT(m.hours) }}</td><td>{{ m.date }}</td><td>{{ m.what }}</td></tr></tbody></table></div>
      <div class="tbl"><table class="list nosort"><thead><tr><th>Bought along the way</th><th class="num">From</th><th class="num">Until</th></tr></thead>
        <tbody><tr v-for="b in sim.bought" :key="b.id"><td>{{ b.what }}<template v-if="b.levels > 1"> ({{ b.levels }} buys)</template></td><td class="num">{{ simT(b.first) }}</td><td class="num">{{ simT(b.last) }}</td></tr></tbody></table></div>
      <p class="m">Expected values, so real bags vary. Held fixed: learners, perks, hiring, gold income, Spelunking EXP; machine and build time count as instant. Fast check-ins matter: once spelunker 1 is quick its trips are short, so each wait between check-ins is lost time.</p>
    </template>
    </template>

    <template v-else-if="sec === 'upgrades'">
    <div class="sec-head"><h3>Upgrades</h3><span class="m">ranked by % more bag value per hour, affordable first</span></div>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Bag value per hour = value × depth/h, the bag a trip brings home. Dig does
      not change that number (it makes Dig Down deeper: its gain is in Dig Down amount), so it is listed after. Gold cost (SpelunkCost1a-3a) and treasure cost
      (1b-3b) are the game's blocks; affordable means gold above the cost and treasure at least the amount, rounded down († @30220300).</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Spelunker</th><th>Upgrade</th><th class="num">Level</th><th class="num">Gain</th><th class="num">Gold</th><th>Treasure</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="u in ups" :key="`${u.k}-${u.u}`">
          <td>{{ u.k }}</td><td>{{ u.name }}</td><td class="num">{{ u.level }} → {{ u.level + 1 }}</td>
          <td class="num">+{{ pct(100 * u.gain) }} {{ u.u === 2 ? 'Dig Down' : 'bag value/h' }}</td>
          <td class="num">{{ fmt(u.c.gold) }}</td>
          <td :class="u.c.held < Math.floor(u.c.amount) ? 'st-bad' : ''">{{ fmt(u.c.amount) }} {{ treasureName(u.c.tier) }} ({{ fmt(u.c.held) }})</td>
          <td :class="u.c.ok ? 'st-good' : 'st-bad'">{{ u.c.ok ? 'can buy' : 'short' }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else>
    <div class="sec-head"><h3>Perks</h3><span class="m">14 per spelunker, in the game's order</span></div>
    <p class="note">Effects are read from the formulas that use each perk (offsets in web/src/spelunking.ts); the card's own text sometimes differs.</p>
    <details class="how"><summary>How learning levels perks</summary>
    <p>Each spelunker has 14 perks. A learning trip can level a perk once the learn bar reaches its threshold (tier t of
      the bar takes 1,440·t learning points, † @2665447); ending the trip adds a random 1-to-m levels to every perk at or under the bar
      (m grows with the bar, at most 9-15 with potions 150-151, † @30130165). Perks are not chosen, so they are listed in the game's order.</p>
    </details>
    <template v-for="x in p.all" :key="'p' + x.k">
      <div class="sec-head"><h4>Spelunker {{ x.k }}</h4><span class="m">learns {{ fmt(x.learn) }} points/h<template v-if="x.bar != null">, bar now {{ x.bar.toFixed(2) }}</template></span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Perk</th><th class="num">Level</th><th>Applies to</th><th>Now</th><th>Next level</th><th class="num">Learn bar</th><th class="num">Learning to reach it</th></tr></thead>
        <tbody>
          <tr v-for="(L, j) in x.perks" :key="j" :class="{ dim: PERK_FX[j + 1]!.dead }">
            <td>{{ PERKS[j + 1] }}</td><td class="num">{{ L }}</td><td>{{ PERK_FX[j + 1]!.scope }}</td>
            <td><template v-if="PERK_FX[j + 1]!.dead"><span class="m">{{ PERK_FX[j + 1]!.dead }}</span></template>
              <template v-else>+{{ pct(PERK_FX[j + 1]!.pct(L)) }} {{ PERK_FX[j + 1]!.what }} <span class="m">{{ PERK_FX[j + 1]!.at }}</span></template></td>
            <td>{{ PERK_FX[j + 1]!.dead ? '—' : `+${pct(PERK_FX[j + 1]!.pct(L + 1))}` }}</td>
            <td class="num">{{ MIN_REQ[j + 1] }}</td>
            <td class="num">{{ hrs(pointsFor(MIN_REQ[j + 1]!) / x.learn) }}</td>
          </tr>
        </tbody>
      </table></div>
    </template>

    </template>

    <details class="how"><summary>Sources</summary>
    <p>Computed from your save; formulas ported from the game's code (Qno2x.js offsets in web/src/spelunking.ts) and
      checked in spelunking.test.ts by running the game's own blocks and listeners. Not shown: items per bag and Spelunking EXP per bag
      (they depend on the bag being opened), the rare-tier roll odds, and treasure icons (not mapped yet). Obol Blessing has no reader in
      the code; Diggy Hole feeds a term the game clamps away.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); font-size: 12px; }
h3 { font-size: 16px; margin: 18px 0 6px; } h4 { font-size: 14px; }
.sec-head h3, .sec-head h4 { margin: 0; }
h2 :deep(.icon) { height: 24px; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
.deck { margin: 10px 0 4px; }
tr.dim td { opacity: .7; }
</style>
