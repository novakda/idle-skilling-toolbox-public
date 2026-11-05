<script setup lang="ts">
import { computed } from 'vue'
import { effect, giftPlan, giftShop, TABS } from './giftshop'
import Icon from '../../components/Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null; embedded?: boolean }>() // embedded: a tab of the Raids page
const g = computed(() => (props.save ? giftShop(props.save) : null))
const plans = computed(() => (props.save ? giftPlan(props.save) : []))

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}`
}
const sig = (v: number) => String(+v.toPrecision(3))
const tix = (t: number | null) => (t == null ? '—' : t === 0 ? 'now' : Math.ceil(t).toLocaleString('en-US'))
</script>

<template>
  <div class="page-head">
    <h2 v-if="!embedded">Gift shop</h2>
    <p>What each raid gift shop upgrade does at your level, what the next level costs in trophies, and which to buy next.</p>
    <div v-if="g" class="tiles">
      <div class="tile"><b>{{ fmt(g.held) }}</b><span>trophies held</span></div>
      <div class="tile"><b>{{ g.perTicket ? fmt(g.perTicket) : '—' }}</b><span>{{ g.perTicket ? `trophies per raid ticket (${g.from}, your best)` : 'trophies per ticket (no raid beaten yet)' }}</span></div>
      <div class="tile"><b :class="{ 'st-good': g.affordable > 0 }">{{ g.affordable }} of {{ g.open }}</b><span>next levels you can afford now</span></div>
      <div class="tile"><b>{{ fmt(g.spent) }}</b><span>trophies spent so far</span></div>
    </div>
  </div>
  <p v-if="!g" class="muted">Load a save.</p>
  <template v-else>
    <h3>Plan, step by step</h3>
    <p class="note">Per group, the next five levels in buying order: each is the most of that group's bonus per trophy at the level it is
      then (so a cheap upgrade gets bought until its rising cost lets the next one through), repeated levels of one upgrade merged. The
      groups boost different things and spend the same trophies, so each plan assumes you spend on that group alone; pick the bonus you
      want. "Raid tickets" is how many tickets of your best beaten raid ({{ g.from || 'none yet' }}) earn the trophies so far beyond the
      {{ fmt(g.held) }} you hold.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th>Group</th><th class="num">Step</th><th>Buy</th><th>Then</th><th class="num">Cost</th><th class="num">Gain</th><th class="num">Trophies so far</th><th class="num">Raid tickets so far</th></tr></thead>
      <tbody>
        <template v-for="p in plans" :key="p.title">
          <tr v-for="(st, k) in p.steps" :key="k" :class="{ grp: k === 0 }">
            <td>{{ k === 0 ? p.title : '' }}</td><td class="num">{{ k + 1 }}</td>
            <td><Icon v-if="st.skill" kind="skill" :id="st.skill" :name="st.name" /><template v-else>{{ st.name }}</template> lv {{ st.from }} → {{ st.to }}</td>
            <td>{{ effect(st.kind, st.to) }}</td>
            <td class="num">{{ fmt(st.cost) }}</td><td class="num">+{{ sig(st.gain) }}{{ p.unit }}</td>
            <td class="num" :class="{ 'st-good': st.total <= g.held }">{{ fmt(st.total) }}</td><td class="num">{{ tix(st.tickets) }}</td>
          </tr>
        </template>
      </tbody>
    </table></div>

    <div class="sec-head"><h3>All upgrades</h3><span class="m">ranked inside each group by gain per trophy</span></div>
    <p class="note">Green cost = affordable now.</p>
    <details class="how"><summary>What each group's gain means</summary>
    <p><b>Faster levelling</b>: each level cuts the EXP every level of that skill
      needs by 0.2 points (cap 50% at lv 250); the gain is how much faster you level (×1/(1 − cut)), the same unit for every skill.
      <b>Starting level</b>: +1 to the level that skill starts at after every ascend and rebirth; every buy is one level, so the cheapest
      ranks first. <b>Away lifting EXP</b>: +2% per level on the away EXP from that skill's lifters (skillers) only, not on time on screen.
      <b>Autocast</b>: casts a random unlocked attack or buff in the main fight every few seconds; the attacks and buffs upgrades only widen
      the choice, so they aren't ranked.</p>
    </details>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th>Group</th><th class="num">#</th><th>Upgrade</th><th>Tab</th><th class="num">Level</th><th>Now</th><th>Next level</th>
        <th class="num">Cost</th><th class="num">Gain</th><th class="num">Raid tickets to afford</th></tr></thead>
      <tbody>
        <template v-for="gr in g.groups" :key="gr.title">
          <tr v-for="(r, k) in gr.list" :key="r.i" :class="{ grp: k === 0 }">
            <td>{{ k === 0 ? gr.title : '' }}</td>
            <td class="num">{{ r.rank || '' }}</td>
            <td><Icon v-if="r.skill" kind="skill" :id="r.skill" :name="r.name" /><template v-else>{{ r.name }}</template></td>
            <td>{{ TABS[r.tab] }}</td>
            <td class="num">{{ r.L }}</td>
            <td>{{ r.now }}</td>
            <td :class="{ muted: r.maxed }">{{ r.next }}</td>
            <td class="num" :class="{ 'st-good': r.affordable, muted: r.maxed }">{{ r.maxed ? '—' : fmt(r.cost) }}</td>
            <td class="num">{{ r.gain == null ? '' : `+${sig(r.gain)}${gr.unit}` }}</td>
            <td class="num">{{ r.maxed ? '' : tix(r.tickets) }}</td>
          </tr>
        </template>
      </tbody>
    </table></div>
    <p class="note">"Raid tickets to afford" uses your best beaten raid's trophies per ticket, without the <span title="skill 16">Mark</span> bonus.</p>
    <details class="how"><summary>How trophies are worked out, and sources</summary>
    <p>Costs and effects are read from the game code (Qno2x.js: the shop's buy button and screen text, the level-up checks,
      the ascend and rebirth resets, the away-gains code and the autocast timer). Trophies come only from raids: a win pays
      ⌊(25·Q³)^(1 + Q/10)⌋ × difficulty² (Demon 50 instead of 25; Q = boss 1-4), so a run's trophies per ticket grow with the difficulty;
      with <span title="skill 16">Mark</span> on in the fight, × (1 + 20% per level of the <span title="skill-tree node 50">Mark</span> skill-tree node, yours {{ g.sl50 }}), not counted above. A death or time-out pays
      part (+1 of 25 per 4% of the boss's HP dealt). The Asylum pays no trophies. "Raid tickets to afford" uses your best beaten raid's
      trophies per ticket.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
tr.grp td { border-top: 2px solid var(--border); }
</style>
