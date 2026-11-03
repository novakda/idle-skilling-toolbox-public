<script setup lang="ts">
import { computed } from 'vue'
import { awayPercent } from '../away'
import { withDeckLinks } from '../cards-calc'
import { cropName, cropPlan, cropUnlockLevel, farmers, goldBuys, maxCrop, plots, withTilling } from '../tilling'
import potionCatalog from '../data/potion-catalog.json'
import discoveryStatic from '../data/discovery-static.json'
import Icon from './Icon.vue'
import { candyFor, candyText } from '../candy'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (k: string) => ((s.value?.[k] as number[] | undefined) ?? [])
// Tiller type by FarmerArmor (the crop-group perks pair armor 0/10/20/30 with Serf/Peasant/Plantera/Noble; 40 = Mystical).
const TILLER: Record<number, string> = { 0: 'Serf', 10: 'Peasant', 20: 'Plantera', 30: 'Noble', 40: 'Mystical' }

const s = computed(() => (props.save ? withTilling(withDeckLinks(props.save)) : null))
const computedPct = computed(() => (s.value ? awayPercent(s.value) : null))
const pct = computed(() => computedPct.value ?? 30)
const rows = computed(() => (s.value ? farmers(s.value, pct.value) : []))
const buys = computed(() => (s.value ? goldBuys(s.value, pct.value) : []))
const plotRows = computed(() => (s.value ? plots(s.value) : []))
const gold = computed(() => n(s.value?.goldcoin))
const level = computed(() => n(s.value?.FarmingLV))
const progress = computed(() => n(s.value?.farmingEXP) / Math.max(1, n(s.value?.farmingREQ)))
const sum = (f: (r: (typeof rows.value)[number]) => number) => rows.value.reduce((t, r) => t + f(r), 0)
const xpActive = computed(() => sum((r) => r.xpPerHarvest * r.harvestsPerSec))
const xpAway = computed(() => sum((r) => r.awayXpPerSec))
const seedsAvg = computed(() => (rows.value.length ? sum((r) => r.seedsPerHarvest) / rows.value.length : 0))
const top = computed(() => buys.value[0])
const unlocked = computed(() => arr('SeedsUnlocked').filter((u, c) => c > 0 && n(u) > 0).length)
const crops = computed(() => {
  const owned = arr('SeedsOwned'), out = []
  for (let c = 1; c <= 40; c++) {
    if (!n(arr('SeedsUnlocked')[c]) && !n(owned[c])) continue
    const growing = rows.value.filter((r) => r.crop === c)
    const uses = [c === 1 ? 'small + medium plot upgrades' : '', c === 11 ? 'medium + large plot upgrades' : '', c === n(s.value?.MysteryFarmingResourceCostCurrency) ? 'large plot upgrades' : '',
      c >= 5 && c <= 7 ? 'yield (corn group owned)' : '', c >= 8 && c <= 10 ? 'yield (cabbage group owned)' : '', c === 20 ? 'yield (owned)' : ''].filter(Boolean)
    out.push({ c, owned: n(owned[c]), active: growing.reduce((t, r) => t + r.seedsPerHarvest * r.harvestsPerSec, 0), away: growing.reduce((t, r) => t + r.awayCropsPerSec, 0),
      card: n(arr('CardLevels')[300 + c]), uses: uses.join(', ') })
  }
  return out
})
// ---- Which crop to grow: cropPlan() in tilling.ts (what it optimises is said on the page)
const potionName = (T: number) => (potionCatalog as { id: number; name: string }[]).find((p) => p.id === T)?.name ?? `potion ${T}`
const flowerName = (f: number) => (discoveryStatic as { flowerNames: string[] }).flowerNames[f] ?? `flower ${f}`
const plan = computed(() => (s.value ? cropPlan(s.value, pct.value) : null))
// Time candy on Tilling credits at full rate (docs/candy.md): the plan's real away time × away % in candy time.
const candy = computed(() => (s.value && plan.value ? candyFor(s.value, plan.value.steps.reduce((t, x) => t + x.secs, 0) * pct.value / 100) : null))
const first = computed(() => plan.value?.steps[0])
const plotList = computed(() => rows.value.map((r) => r.f))
const changesOf = (to: number[], from: number[]) => plotList.value.filter((p) => to[p] !== from[p]).map((p) => ({ p, from: from[p]!, to: to[p]! }))
const firstChanges = computed(() => (plan.value && first.value ? changesOf(first.value.plan, plan.value.now) : []))
// "Packed Clay on plots 1-8": a setup grouped by crop, the way you'd read it off the Tilling screen
const setup = (v: number[]) => { const m = new Map<number, number[]>(); for (const p of plotList.value) m.set(v[p]!, [...(m.get(v[p]!) ?? []), p]); return [...m].map(([c, ps]) => ({ c, ps: ps.join(', ') })) }
const plotPlan = computed(() => plotList.value.map((p) => {
  const m = maxCrop(s.value!, p), now = n(arr('PlantType')[p]), to = first.value?.plan[p] ?? now
  return { p, now, to, max: m.max, nextLv: m.byLevel < m.max || m.max >= 40 ? null : cropUnlockLevel(m.max, p), canUnlock: m.byLevel > m.unlocked }
}))
const payTxt = (x: { T: number; L: number; levels: number }) => `${potionName(x.T)} lv ${x.L} → ${x.L + 1}${x.levels > 1.005 ? ` (≈${+x.levels.toFixed(2)} levels)` : ''}`
const has = (cost: [number, number][]) => cost.every(([c, q]) => n(arr('SeedsOwned')[c]) >= q)

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return i < units.length - 1 || v < 1e33 ? `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}` : v.toExponential(2)
}
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 60 ? `${+sec.toFixed(1)}s` : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const pctOf = (gain: number, base: number) => (base ? `+${+((100 * gain) / base).toFixed(3)}%` : '—')
const SECTIONS = [['plan', 'Plan'], ['potions', 'Potion crops'], ['farmers', 'Farmers'], ['buy', 'Gold upgrades'], ['plots', 'Plot upgrades'], ['crops', 'Reference']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Tilling</h2>
    <p>Which crop each plot should grow for your potion levels, what each farmer earns, which gold upgrade buys the most Tilling XP, and what the plot upgrades cost.</p>
    <div v-if="s" class="tiles">
      <div class="tile"><b>{{ level }}</b><span>Tilling level ({{ (progress * 100).toFixed(1) }}% to next)</span></div>
      <div class="tile"><b>{{ fmt(xpActive) }} / {{ fmt(xpAway) }}</b><span>XP/s on screen / per away second</span></div>
      <div class="tile"><b>{{ fmt(seedsAvg) }}</b><span>crops per harvest (farmer average)</span></div>
      <div class="tile"><b>{{ top ? `Farmer ${top.f} ${top.kind}` : '—' }}</b><span>{{ top ? `next best buy: ${fmt(top.cost)} gold` : 'no gold upgrade left' }}</span></div>
    </div>
  </div>
  <p v-if="!s" class="note">Load a save to see Tilling.</p>
  <template v-else>
    <template v-if="plan">
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="!plan.needs.length"><b>Keep every plot as it is</b>: no cauldron is brewing a potion level that costs crops.</li>
      <li v-else-if="!first"><b>Keep every plot as it is</b>: you already hold the crops for the next level of every potion in your cauldrons.</li>
      <li v-else-if="!firstChanges.length"><b>Keep every plot as it is</b>: it is already the fastest setup for the crops your potions are short of
        (covered in {{ fmtT(first.secs) }} away).</li>
      <li v-else-if="setup(first.plan).length === 1"><b>Set every plot to <Icon kind="crop" :id="first.plan[plotList[0]!]!" :name="cropName(first.plan[plotList[0]!]!)" /></b>
        (now: {{ setup(plan.now).map((g) => `${cropName(g.c)} on ${g.ps}`).join('; ') }}). That covers the crops for
        {{ first.pays.map(payTxt).join(', ') }} in <b>{{ fmtT(first.secs) }}</b> of real time away.
        <span class="note">Use the + / − arrows on each plot, or click the crop in the Tilling crop list to set it on every plot that has unlocked it.</span></li>
      <li v-else><b>Change {{ firstChanges.length }} plot{{ firstChanges.length > 1 ? 's' : '' }}</b>:
        <template v-for="(c, k) in firstChanges" :key="c.p">{{ k ? '; ' : '' }}plot {{ c.p }} {{ cropName(c.from) }} → <b class="st-good"><Icon kind="crop" :id="c.to" :name="cropName(c.to)" /></b></template>; keep the rest
        (now: {{ setup(plan.now).map((g) => `${cropName(g.c)} on ${g.ps}`).join('; ') }}). That covers the crops for
        {{ first.pays.map(payTxt).join(', ') }} in <b>{{ fmtT(first.secs) }}</b> of real time away.
        <span class="note">Use the + / − arrows on each plot, or click a crop in the Tilling crop list to set it on every plot that has unlocked it.</span></li>
      <li v-if="candy && candy.secs > 0">Or use time candy with the Tilling screen selected: <b>{{ fmtT(candy.secs) }}</b> of candy covers these crops
        (candy runs at full rate; real time away runs at {{ +pct.toFixed(1) }}%). <template v-if="candy.best">Candy needed (from what you hold): <b>{{ candyText(candy.best.pick) }}</b>.</template>
        <template v-else>You hold {{ fmtT(candy.allHeld) }} of candy, not enough.</template> Candy on Tilling doesn't fill brew bars: candy the Apothecary for those.</li>
      <li v-if="plan.ready.length">Crops already held for (each still needs its brew bar full):
        <ul><li v-for="(x, k) in plan.ready" :key="k">{{ payTxt(x) }}</li></ul></li>
    </ol>
    <p class="note">What this optimises: <b>the soonest time you hold the crops for the next level of every potion brewing in your cauldrons</b>
      (a potion whose brew bar is full waits there until you hold its crop and flower price). Crops are gathered automatically: every
      harvest, on screen or away, goes straight into your stock. Times are real time away at your away gain ({{ +pct.toFixed(1) }}%),
      from the crops you hold now; today's levels only (a paid level doesn't queue the next).</p>

    </template>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <template v-if="plan && plan.steps.length > 1">
    <h3>Plan, step by step</h3>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Setup</th><th class="num">For</th><th>Covers</th></tr></thead>
      <tbody>
        <tr v-for="(st, k) in plan.steps" :key="k">
          <td class="num">{{ k + 1 }}</td>
          <td><div v-for="g in setup(st.plan)" :key="g.c"><Icon kind="crop" :id="g.c" :name="cropName(g.c)" /> on {{ g.ps }}</div></td>
          <td class="num">{{ fmtT(st.secs) }}</td><td><div v-for="(x, j) in st.pays" :key="j">{{ payTxt(x) }} (at {{ fmtT(x.at) }})</div></td>
        </tr>
        <tr><td></td><td><b>Total</b></td><td class="num"><b>{{ fmtT(plan.steps.reduce((t, x) => t + x.secs, 0)) }}</b></td><td></td></tr>
      </tbody>
    </table></div>
    </template>
    <p v-if="!(plan && plan.steps.length > 1)" class="note">No multi-step plan: Do this next covers it.</p>
    </template>
    <template v-else-if="sec === 'potions'">
    <template v-if="plan">
    <div class="sec-head"><h3>Potion levels waiting on crops</h3><span class="m">what the plan above covers</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Cauldron</th><th>Potion</th><th>Crop</th><th class="num">Price</th><th class="num">Held</th><th class="num" title="When the plan has the crops covered (real time away)">Crops in</th><th class="num" title="The level also needs this cauldron's brew bar full; brewing runs on the Apothecary, not Tilling (time candy on Tilling doesn't fill it)">Brew bar</th>
        <th>Flower (Botany)</th><th class="num" title="One payment can buy several levels: the cauldron's multi-level roll">Levels per payment</th></tr></thead>
      <tbody>
        <tr v-for="x in plan.needs" :key="x.c">
          <td class="num">{{ x.c }}</td><td><Icon kind="potion" :id="x.T" :name="potionName(x.T)" /> <small class="muted">lv {{ x.L }} → {{ x.L + 1 }}</small></td>
          <td><Icon kind="crop" :id="x.crop" :name="cropName(x.crop)" /></td><td class="num">{{ fmt(x.qty) }}</td>
          <td class="num">{{ fmt(n(arr('SeedsOwned')[x.crop])) }}</td>
          <td class="num">{{ plan.ready.some((y) => y.c === x.c) ? 'now' : fmtT(plan.steps.flatMap((st) => st.pays).find((y) => y.c === x.c)?.at ?? Infinity) }}</td>
          <td class="num" :class="{ 'st-good': x.brew >= 1 }">{{ x.brew >= 1 ? 'full' : Math.floor(100 * x.brew) + '%' }}</td>
          <td><Icon kind="flower" :id="x.flower" :name="flowerName(x.flower)" /> <small :class="n(arr('flowersOwned')[x.flower]) >= x.flowerQty ? 'muted' : 'st-bad'">{{ fmt(x.flowerQty) }}
            ({{ n(arr('flowersOwned')[x.flower]) >= x.flowerQty ? 'held' : 'short' }})</small></td>
          <td class="num">{{ +x.levels.toFixed(2) }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">A level needs three things at once: the crop price, the flower price, and a full brew bar. This page plans the
      crops only; the brew bar fills on the Apothecary (time candy on Tilling doesn't advance it).</p>
    <details class="how"><summary>How the price is worked out</summary>
    <p>Price = what the game checks you hold before the level (it is then taken, except
      {{ plan.needs[0] ? Math.round(plan.needs[0].free * 100) : 0 }}% of the time your shrine makes it free).</p>
    </details>

    <p v-if="plan.unreachable.length" class="note">No plot can grow the crop for: {{ plan.unreachable.map(payTxt).join(', ') }}.</p>


    <div class="sec-head"><h4>Per plot</h4><span class="m">step 1 of the plan, plot by plot</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Plot</th><th>Growing</th><th>Set to</th><th title="Highest crop this plot can be set to now">Can grow up to</th><th>Next crop</th></tr></thead>
      <tbody>
        <tr v-for="r in plotPlan" :key="r.p">
          <td class="num">{{ r.p }}</td><td><Icon kind="crop" :id="r.now" :name="cropName(r.now)" /></td>
          <td><template v-if="r.to === r.now"><span class="muted">keep</span></template><b v-else class="st-good"><Icon kind="crop" :id="r.to" :name="cropName(r.to)" /></b></td>
          <td><Icon kind="crop" :id="r.max" :name="cropName(r.max)" /></td>
          <td>{{ r.canUnlock ? `${cropName(r.max)} unlocks now (press + on the plot)` : r.nextLv != null ? `${cropName(r.max + 1)} at Tilling lv ${r.nextLv}` : '—' }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>
    </template>

    <template v-if="sec === 'farmers'">
    <div class="sec-head"><h3>Farmers</h3><span class="m">what each farmer earns</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Tiller</th><th>Crop</th><th class="num" title="Plot rank (PlantLevel); past 7 the plot gains overlevels">Rank</th>
        <th class="num">Value lv</th><th class="num" title="Speed upgrades stop at lv 81">Speed lv</th><th class="num" title="anim speed × (1 + armor/40) × Tilling speed boost">Speed</th>
        <th class="num" title="On screen, 9 frames per harvest at the 60 fps step the speed reaches">Harvests/s</th><th class="num" title="Speed where the on-screen frame rate steps up next (100 = the 60 fps ceiling)">Next step</th>
        <th class="num" title="Expected, including the second payout from the skill-tree roll">Crops/harvest</th><th class="num" title="Expected: EXP lands on 1 roll in 1000/farmingChance">XP/harvest</th><th class="num">Away XP/s</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.f">
          <td class="num">{{ r.f }}</td><td>{{ TILLER[r.armor] ?? `armor ${r.armor}` }}</td>
          <td><Icon kind="crop" :id="r.crop" :name="cropName(r.crop)" /></td>
          <td class="num">{{ r.rank }}<span v-if="arr('OverLevels')[r.f]" class="muted"> +{{ arr('OverLevels')[r.f] }}</span></td>
          <td class="num">{{ r.value }}</td><td class="num">{{ r.speedLv }}<span v-if="r.speedLv >= 81" class="muted"> (max)</span></td>
          <td class="num">{{ fmt(r.speed) }}</td><td class="num">{{ r.harvestsPerSec.toFixed(2) }}</td>
          <td class="num">{{ r.nextStep ? `${fmt(r.nextStep.speed)} → ${r.nextStep.harvestsPerSec.toFixed(2)}/s` : 'max' }}</td>
          <td class="num">{{ fmt(r.seedsPerHarvest) }}</td><td class="num">{{ fmt(r.xpPerHarvest) }}</td><td class="num">{{ fmt(r.awayXpPerSec) }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'buy'">
    <div class="sec-head"><h3>What to buy next</h3><span class="m">gold upgrades ranked by Tilling XP per away second gained per gold</span></div>
    <p class="note">Green cost = affordable now. Plot upgrades cost crops, not gold, so they are on their own tab.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Away Tilling earns several times what playing it does (see AFK), so gains are counted per away second.
      Each row re-runs the Tilling formulas with that one level bought.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Upgrade</th><th class="num">Cost (gold)</th><th class="num">Away XP/s</th><th class="num">On screen XP/s</th><th class="num">Crops/s on screen</th></tr></thead>
      <tbody>
        <tr v-for="b in buys.slice(0, 10)" :key="b.f + b.kind">
          <td class="num">{{ b.f }}</td><td>Farmer {{ b.f }} {{ b.what }}</td>
          <td class="num" :class="{ 'st-good': gold >= b.cost }">{{ fmt(b.cost) }}</td>
          <td class="num">+{{ fmt(b.away) }} <span class="muted">{{ pctOf(b.away, xpAway) }}</span></td>
          <td class="num">+{{ fmt(b.active) }}</td><td class="num">+{{ fmt(b.seeds) }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'plots'">
    <div class="sec-head"><h3>Plot upgrades</h3><span class="m">paid in crops</span></div>
    <p class="note">Green = you hold the crops for it now.</p>
    <details class="how"><summary>How plot ranks work</summary>
    <p>Small, medium and large upgrades add plot rank EXP every second on the Tilling screen (and the same per credited away
      second). A full bar ranks the plot up to 7 (rank 2+ adds +0.25 Tilling EXP to every farmer and +10% Tilling speed; higher ranks unlock
      the yield terms), then each fill is an overlevel.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Plot</th><th>Crop</th><th class="num">Rank</th><th class="num">Bar</th><th class="num">Rank EXP/s</th><th class="num">Next rank (on screen)</th>
        <th class="num">Small lv · cost</th><th class="num">Medium lv · cost</th><th class="num">Large lv · cost</th></tr></thead>
      <tbody>
        <tr v-for="p in plotRows" :key="p.p">
          <td class="num">{{ p.p }}</td><td><Icon kind="crop" :id="p.crop" :name="cropName(p.crop)" /></td>
          <td class="num">{{ p.rank }}<span v-if="p.over" class="muted"> +{{ p.over }}</span></td>
          <td class="num">{{ Math.round(p.progress * 100) }}%</td><td class="num">{{ fmt(p.perSec) }}</td><td class="num">{{ fmtT(p.toNext) }}</td>
          <td v-for="u in [p.small, p.medium, p.large]" :key="u.gain" class="num" :class="{ 'st-good': has(u.cost) }"
            :title="`+${fmt(u.gain)} rank EXP/s`">{{ u.lv }} · {{ u.cost.map(([c, q]) => `${fmt(q)} ${cropName(c)}`).join(' + ') }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else>
    <div class="sec-head"><h3>Crops</h3><span class="m">{{ unlocked }} of 40 crops unlocked</span></div>
    <p class="note">"Used for" lists only the uses decoded from the game code here.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Crop</th><th class="num">Owned</th><th class="num">Grown/s on screen</th><th class="num">Grown per away s</th><th class="num">Card lv</th><th>Used for</th></tr></thead>
      <tbody>
        <tr v-for="c in crops" :key="c.c">
          <td><Icon kind="crop" :id="c.c" :name="cropName(c.c)" /></td><td class="num">{{ fmt(c.owned) }}</td>
          <td class="num">{{ c.active ? fmt(c.active) : '—' }}</td><td class="num">{{ c.away ? fmt(c.away) : '—' }}</td>
          <td class="num">{{ c.card > 0 ? c.card : '—' }}</td><td>{{ c.uses || '—' }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>

    <p v-if="computedPct == null || !arr('TankBonusLIST').length" class="note">
      <template v-if="computedPct == null">Away % couldn't be computed (a Realm fruit grants it); away numbers assume 30%.</template>
      <template v-if="!arr('TankBonusLIST').length">This save has no lab tank list, so the away Tilling tank bonus (tank 36) counts as 0.</template></p>
    <details class="how"><summary>Sources</summary>
    <p>Computed from your save: per-harvest crop and EXP bonuses, Tilling speed boost and the Tilling potion bonuses are
      recomputed the way the Tilling screen does on entry (crop cards from the Tilling-linked deck).</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; }
h4 { font-size: 14px; margin: 12px 0 6px; }
.sec-head h3, .sec-head h4 { margin: 0; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
</style>
