<script setup lang="ts">
import { computed } from 'vue'
import { withDeckLinks } from '../cards-calc'
import { BONUS, buys, EFFECTS, pro, RIFTS, rifts, SOULS, spendPlan, SPEED_CAP, withRift, type Cost } from '../rift'
import Icon from './Icon.vue'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (k: string) => ((s.value?.[k] as number[] | undefined) ?? [])

const s = computed(() => (props.save ? withRift(withDeckLinks(props.save)) : null))
const rows = computed(() => (s.value ? rifts(s.value) : []))
const list = computed(() => (s.value ? buys(s.value) : []))
const pros = computed(() => (s.value ? pro(s.value) : []))
const plan = computed(() => (s.value ? spendPlan(s.value) : null))
const owned = computed(() => n(s.value?.RiftsOwned))
const open = computed(() => n(arr('ConstructLV')[10]) + n(arr('ConstructLV')[22]))
const sum = (f: (r: (typeof rows.value)[number]) => number) => rows.value.reduce((t, r) => t + f(r), 0)
const bests = computed(() => list.value.filter((b) => b.best))
const readyBests = computed(() => bests.value.filter((b) => b.affordable).length)
const sig = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 100 ? fmt(v) : String(+v.toPrecision(3)))
const proBuyable = computed(() => pros.value.filter((p) => p.affordable).length)
const proOpen = computed(() => pros.value.filter((p) => p.unlocked && p.owned).length)
// The game's frame for the rift picture (ActorEvents_835): 3 = Pro look, else by level (> 40: 2, > 20: 1).
const frameOf = (r: number) => (open.value >= r ? 3 : n(arr('RiftLVL')[r]) > 40 ? 2 : n(arr('RiftLVL')[r]) > 20 ? 1 : 0)
const name = (r: number) => (r === 9 ? 'Rift Rift' : `${RIFTS[r]} Rift`)
const souls = computed(() => SOULS.map((c, i) => ({ c, i, q: n(arr('SoulsTotal')[i]) })).filter((x) => x.i > 0 && x.q > 0))

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return i < units.length - 1 || v < 1e33 ? `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}` : v.toExponential(2)
}
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 60 ? `${+sec.toFixed(1)}s` : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const fmtCost = (c: Cost) => c.map(([k, q]) => `${fmt(q)} ${SOULS[k]}`).join(' + ')
// Plan table: one column per soul colour the plan spends or leaves.
const planSpent = computed(() => (plan.value?.steps ?? []).reduce((t, x) => t.map((q, c) => q + x.cost[c]!), Array<number>(9).fill(0)))
const planCols = computed(() => SOULS.map((_, c) => c).filter((c) => planSpent.value[c]! > 0 || (plan.value?.left[c] ?? 0) > 0))
const has = (c: Cost) => c.every(([k, q]) => n(arr('SoulsTotal')[k]) >= q)
const SECTIONS = [['plan', 'Plan'], ['rifts', 'Rifts'], ['buy', 'What to buy next'], ['pro', 'Pro upgrades']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Rift</h2>
    <p>What each rift earns and does, which soul upgrade raises each rift's own bonus fastest, and whether Pro levels are worth buying.</p>
    <div v-if="s" class="tiles">
      <div class="tile"><b>{{ owned }} of 9</b><span>rifts owned · Summoning lv {{ n(s.summonLVL) }}</span></div>
      <div class="tile"><b>{{ fmt(sum((r) => r.summonScreen)) }} / {{ fmt(sum((r) => r.summonAway)) }}</b><span>Summoning EXP/s on screen / per away second</span></div>
      <div class="tile"><b>{{ readyBests }} of {{ bests.length }}</b><span>rifts whose best buy you can afford now</span></div>
      <div class="tile"><b>{{ proOpen ? `${proBuyable} of ${proOpen}` : 'Locked' }}</b><span>{{ proOpen ? 'Pro upgrades affordable now' : `Pro upgrades (needs Rift Pro / God; you have ${open})` }}</span></div>
    </div>
  </div>
  <p v-if="!s" class="note">Load a save to see Rifts.</p>
  <template v-else>
    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <template v-if="plan && plan.steps.length">
    <h3>Plan, step by step</h3>
    <p class="note">How to spend the souls you hold now, one level at a time: each buy is the affordable one that makes its rift level up
      fastest (rift EXP speed gained) per share of your soul stock, re-priced after every level, until nothing is affordable. Within one rift
      that is the order in the table below; across rifts it treats every rift's levelling speed alike, since their bonuses don't compare
      (a Rift Rift level also lifts every rift, which this undervalues). Levels of one upgrade are grouped; any order of the whole set is
      affordable. What you can't afford yet is what the Spiriting plan farms for, and souls spent here don't go toward it.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Buy</th><th class="num">Levels</th><th class="num">Rift EXP speed</th><th v-for="c in planCols" :key="c" class="num">{{ SOULS[c] }}</th></tr></thead>
      <tbody>
        <tr v-for="(st, k) in plan.steps" :key="k">
          <td class="num">{{ k + 1 }}</td><td><Icon kind="rift" :id="`${st.r}-${frameOf(st.r)}`" :name="name(st.r)" /> {{ st.kind }}</td>
          <td class="num">{{ st.from }} → {{ st.to }}</td><td class="num">+{{ sig(st.riftPct) }}%</td>
          <td v-for="c in planCols" :key="c" class="num">{{ st.cost[c] ? fmt(st.cost[c]!) : '' }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr><td></td><td colspan="3"><b>Total spent</b></td><td v-for="c in planCols" :key="c" class="num"><b>{{ planSpent[c] ? fmt(planSpent[c]!) : '' }}</b></td></tr>
        <tr><td></td><td colspan="3">Left after the plan</td><td v-for="c in planCols" :key="c" class="num">{{ plan.left[c] ? fmt(plan.left[c]!) : '' }}</td></tr>
      </tfoot>
    </table></div>
    </template>
    <p v-else class="note"><b>Plan:</b> no value or speed level is affordable with the souls you hold; the Spiriting page plans what to farm.</p>
    </template>
    <template v-else-if="sec === 'rifts'">
    <div class="sec-head"><h3>Rifts</h3><span class="m">what each rift earns and does</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Rift</th><th class="num">Level</th><th class="num">Bar</th><th class="num">Value lv</th><th class="num" :title="`Speed upgrades stop at lv ${SPEED_CAP}`">Speed lv</th>
        <th class="num" title="anim speed × (1 + 5% per Summoning skill-tree level 35)">Speed</th><th class="num">Rift EXP per away s</th>
        <th class="num">Next level (away / on screen)</th><th class="num">Summoning EXP per away s</th><th>Bonus now</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.r">
          <td><Icon kind="rift" :id="`${r.r}-${frameOf(r.r)}`" :name="name(r.r)" /></td>
          <td class="num">{{ r.lv }}</td><td class="num">{{ Math.floor((100 * r.exp) / Math.max(1, r.req)) }}%</td>
          <td class="num">{{ r.value }}</td><td class="num">{{ r.speedLv }}<span v-if="r.speedLv >= SPEED_CAP" class="muted"> (max)</span></td>
          <td class="num">{{ fmt(r.speed) }}</td><td class="num">{{ fmt(r.riftExpAway) }}</td>
          <td class="num">{{ fmtT(r.toNextAway) }} / {{ fmtT(r.toNextScreen) }}</td><td class="num">{{ fmt(r.summonAway) }}</td>
          <td :title="`Qno2x.js ${EFFECTS[r.r]!.at}`">{{ EFFECTS[r.r]!.normal(r.lv, s) }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">The Gem Rift is not modelled. Rift levels also count toward a contract (total rift levels, @16419843).</p>
    <details class="how"><summary>How rift EXP is worked out</summary>
    <p>Each glyph cycle (10 frames) adds rift EXP and Summoning EXP. On screen the frame rate caps the speed at 60 frames/s;
      away credit is the full speed. A full bar levels the rift; the level is its bonus (last column).</p>
    </details>
    </template>

    <template v-else-if="sec === 'buy'">
    <div class="sec-head"><h3>What to buy next</h3><span class="m">one group per rift, best buy first; pick the bonus you want</span></div>
    <p class="note">Ranked by <b>how much of that rift's own bonus they add per day of away credit, per share of your soul stock spent</b>. Green = affordable now.</p>
    <p class="facts"><span><b>Souls held</b></span><span v-for="x in souls" :key="x.i">{{ x.c }} {{ fmt(x.q) }}</span></p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>For each rift, its value and speed upgrades ranked by how much of that rift's own bonus they add per day of away
      credit, per share of your soul stock spent (each cost ÷ the souls of that colour you hold, added up). A buy makes the rift
      earn rift EXP faster, so it reaches more levels per day (at today's requirement, which grows each level); each level is worth
      what its bonus adds per level. Bonuses of different rifts (damage, HP, AP…) don't compare, so there is one group per rift, best
      buy first. Summoning EXP is shown on the side, not ranked.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Bonus</th><th>Upgrade</th><th class="num">Cost</th><th class="num">Share of stock</th><th class="num">Levels/day gained</th>
        <th class="num">Bonus/day gained</th><th class="num">Summoning EXP/away s</th></tr></thead>
      <tbody>
        <tr v-for="b in list" :key="b.r + b.kind" :class="{ grp: b.best }">
          <td><template v-if="b.best"><Icon kind="rift" :id="`${b.r}-${frameOf(b.r)}`" :name="BONUS[b.r]!.label" /></template></td>
          <td>{{ b.kind }} lv {{ b.what.split(' lv ')[1] }}<span v-if="b.best && list.filter((x) => x.r === b.r).length > 1" class="muted"> (best)</span></td>
          <td class="num" :class="{ 'st-good': has(b.cost) }">{{ fmtCost(b.cost) }}</td>
          <td class="num">{{ Math.round(100 * b.share).toLocaleString('en-US') }}%</td>
          <td class="num">+{{ sig(b.levelsPerDay) }}</td>
          <td class="num">+{{ sig(b.bonusPerDay) }}{{ BONUS[b.r]!.unit }}</td>
          <td class="num">+{{ fmt(b.summon) }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">The Gold Coin bonus is capped at 60%; Water's is cached: the game applies the level from when you last opened the Water rift (H20BonusPercent), to gym lifters' away water; a Rift Rift level
      adds a level to every rift, so its gain is counted in levels on each rift.</p>
    </template>

    <template v-else>
    <div class="sec-head"><h3>Pro upgrades</h3><span class="m">Pink souls and treasures</span></div>
    <p class="note">
      <template v-if="!proOpen"><b>Not buyable yet.</b> Pro levels open per rift with the Rift Pro and Rift God construction upgrades
        (rift <i>r</i> needs their levels to add up to <i>r</i>; yours add up to {{ open }}).</template>
      <template v-else><b>{{ proBuyable ? `Yes: ${proBuyable} affordable now.` : 'Open, but none affordable yet.' }}</b></template>
      Pro levels cost Pink souls (you hold {{ fmt(n(arr('SoulsTotal')[8])) }}) and treasures, which no value or speed upgrade uses, so they
      never take souls from the What to buy list: buy them whenever you can.</p>
    <details class="how"><summary>How Pro levels scale</summary>
    <p>Each level adds less than the one before (the bonus scales with
      2P/(P + 100)), so the first levels are the cheapest gains; the cap is {{ pros[0]?.cap.toFixed(0) }} (raised by <span title="PotionLV[136], potion 137">Coca Prola</span>).</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Rift</th><th>Open</th><th class="num">Pro lv</th><th class="num">Next cost</th><th>Pro bonus now</th><th>After one level</th></tr></thead>
      <tbody>
        <tr v-for="p in pros" :key="p.r">
          <td><Icon kind="rift" :id="`${p.r}-${frameOf(p.r)}`" :name="name(p.r)" /></td>
          <td :class="p.unlocked ? 'st-good' : 'muted'">{{ p.unlocked ? 'yes' : `needs ${p.r}` }}</td>
          <td class="num">{{ p.P }} / {{ p.cap.toFixed(0) }}</td>
          <td class="num" :class="{ 'st-good': p.affordable }">{{ fmt(p.souls) }} Pink + {{ fmt(p.treasure) }} treasure {{ p.treasureId }}</td>
          <td :title="`Qno2x.js ${EFFECTS[p.r]!.at}`">{{ p.now }}</td><td>{{ p.next }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">Treasure names are not decoded (TreasureOwned index shown).</p>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>Computed from your save: the rift EXP bonus is recomputed the way the Limbo screen does on entry (Riftion potion,
      rift bricks, the Limbo-linked deck's cards).</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.m { color: var(--muted); }
tr.grp td { border-top: 2px solid var(--border); }
</style>
