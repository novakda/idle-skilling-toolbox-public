<script setup lang="ts">
import { computed } from 'vue'
import { claimPick, codex, geneName, petName } from './codex'
import Icon from '../../components/Icon.vue'
import { sectionRef } from '../../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const c = computed(() => (props.save ? codex(props.save) : null))
const days = (sec: number) => `${+(sec / 86400).toFixed(2)} d`
const hrs = (sec: number) => (sec < 3600 ? `${Math.ceil(sec / 60)} min` : `${+(sec / 3600).toFixed(1)} h`)
const pct = (x: number) => `${Math.round(100 * x)}%`
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const names = (ids: number[]) => ids.map(petName).join(', ')
const combosTotal = computed(() => (c.value ? c.value.genes.length * 3 : 0))
const held = computed(() => c.value?.rewards.filter((r) => r.held).length ?? 0)
/** What to take with the daily claim (codex.ts claimPick). */
const pick = computed(() => (props.save ? claimPick(props.save) : null))
const SECTIONS = [['next', 'Closest to the next tier'], ['rewards', 'Level-up rewards'], ['species', 'Species'], ['genes', 'Genetics and combos']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Codex</h2>
    <p>What the pet Codex has recorded, the bonuses it grants, and what is closest to its next tier.</p>
    <div v-if="c" class="tiles">
      <div class="tile"><b>{{ c.recorded }} / {{ c.species.length }}</b><span>species recorded †</span></div>
      <div class="tile"><b>{{ c.unlockedGenes }} / {{ c.genes.length }}</b><span>genetics unlocked †</span></div>
      <div class="tile"><b>{{ c.combosFound }} / {{ combosTotal }}</b><span title="Found stays found; the bonus only applies while the team carries the genes">combos found †</span></div>
      <div class="tile"><b>{{ held }} / 24</b><span>level-up rewards switched on †</span></div>
    </div>
  </div>
  <p v-if="!c" class="note">Load a save to see the Codex.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="c.next.pending.length" class="st-warn"><b>Open the Codex once</b> to switch on {{ c.next.pending.map((r) => `${r.skill} ${r.at}: ${r.bonus}`).join('; ') }}.
        The game only sets these when the Codex opens, and reads the flag, not your level †.</li>
      <li v-if="c.claim.ready"><b>Claim today's free pet</b> (Codex, any recorded species: a level 1 copy with that species' gene).
        <template v-if="c.claim.free <= 0"> Your inventory is full: free a slot first.</template>
        <template v-else-if="pick"> Suggested: {{ pick.text }}. <small class="m">{{ pick.why }} †</small></template></li>
      <li v-else>Free pet claim in {{ hrs(c.claim.wait) }} (the timer only runs down from your last Codex visit †).</li>
      <li v-if="c.next.rewards[0]"><b>{{ c.next.rewards[0].skill }} {{ c.next.rewards[0].at }}</b> is the nearest reward: {{ c.next.rewards[0].bonus }},
        {{ c.next.rewards[0].at - c.next.rewards[0].lv }} levels away (Lv {{ c.next.rewards[0].lv }}, {{ pct(c.next.rewards[0].pct) }} into it).</li>
      <li v-if="c.next.capsules[0]"><b>{{ cap(c.next.capsules[0].name) }}</b> is the capsule pet nearest its next level: {{ days(c.next.capsules[0].left) }} on the lab screen,
        then {{ c.next.capsules[0].text }} → {{ c.next.capsules[0].nextText }}.</li>
    </ol>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'next'">
    <div class="sec-head"><h3>Closest to the next tier</h3><span class="m">each list ranked by how soon it unlocks, closest first</span></div>
    <p class="note">The three are not weighed against each other: their bonuses are different stats.</p>
    <div class="grid">
      <div class="tbl"><table class="list">
        <thead><tr><th>Level-up reward</th><th class="num">At</th><th class="num">You</th><th>Bonus</th></tr></thead>
        <tbody><tr v-for="r in c.next.rewards" :key="r.k"><td><Icon kind="skill" :id="`${r.skill}LV`" :name="r.skill" /></td><td class="num">{{ r.at }}</td>
          <td class="num">{{ r.lv }} <small class="m">+{{ pct(r.pct) }}</small></td><td>{{ r.bonus }}{{ r.unread ? ' (no code reads it †)' : '' }}</td></tr>
          <tr v-if="!c.next.rewards.length"><td colspan="4" class="muted">All 24 reached.</td></tr></tbody>
      </table></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Gene combo</th><th class="num">Team genes</th><th class="num">Short</th><th>Recorded carriers (claimable)</th></tr></thead>
        <tbody><tr v-for="g in c.next.combos" :key="g.id"><td>{{ cap(g.name) }} → combo {{ g.tier + 1 }}</td><td class="num">{{ g.count }}</td>
          <td class="num">{{ g.toNext }}</td><td>{{ names(g.recordedCarriers) || '—' }}</td></tr>
          <tr v-if="!c.next.combos.length"><td colspan="4" class="muted">No team genes below combo 3.</td></tr></tbody>
      </table></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Capsule pet</th><th class="num">Lv</th><th class="num">Days left</th><th>Next level</th></tr></thead>
        <tbody><tr v-for="x in c.next.capsules" :key="x.id"><td><Icon kind="pet" :name="x.name" /></td><td class="num">{{ x.lv }}</td>
          <td class="num">{{ days(x.left) }}</td><td>{{ x.text }} → {{ x.nextText }}</td></tr>
          <tr v-if="!c.next.capsules.length"><td colspan="4" class="muted">No pets in capsules.</td></tr></tbody>
      </table></div>
    </div>
    <details class="how"><summary>How capsule days left are counted</summary>
    <p>On the lab screen a capsule banks one day per day, bonus or not †; away it banks ×{{ +c.awayRate.toFixed(2) }}, the product of †:</p>
    <ul><li v-for="(r, i) in c.away.rows" :key="i">×{{ +r.factor.toFixed(3) }} {{ r.what }}</li></ul>
    <p>Empty capsules bank their days on poop †.</p>
    </details>
    </template>

    <template v-else-if="sec === 'rewards'">
    <div class="sec-head"><h3>Level-up rewards</h3><span class="m">{{ held }} / 24 switched on †</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Skill</th><th class="num">Level</th><th>Bonus</th><th>State</th></tr></thead>
      <tbody><tr v-for="r in c.rewards" :key="r.k" :class="{ dim: !r.reached }"><td>{{ r.skill }}</td><td class="num">{{ r.at }}</td><td>{{ r.bonus }}</td>
        <td :class="r.pending ? 'st-warn' : ''">{{ r.held ? 'on' : r.pending ? 'reached: open the Codex' : r.reached ? 'reached' : `${r.at - r.lv} levels to go` }}{{ r.unread ? ' · no code reads it †' : '' }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'species'">
    <div class="sec-head"><h3>Species</h3><span class="m">in the Codex's order</span></div>
    <details class="how"><summary>How the passive is worked out</summary>
    <p>The passive is what the Codex prints: amount × capsule level; a pet's passive grows only while it sits in a
      lab capsule. Six species carry a different amount in the lab's copy of the list, and the lab's is the one applied (marked "applies").</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Species</th><th>Gene</th><th class="num">Capsule Lv</th><th>Passive now</th><th>Capsule</th></tr></thead>
      <tbody><tr v-for="x in c.species" :key="x.id" :class="{ dim: !x.recorded }"><td class="num">{{ x.id }}</td>
        <td><Icon v-if="x.recorded" kind="pet" :name="x.name" /><template v-else>{{ x.name }} <small class="m">not recorded</small></template></td>
        <td>{{ cap(geneName(x.gene)) }}</td><td class="num">{{ x.lv }}</td>
        <td>{{ x.lv ? x.text : '—' }}<small v-if="x.labAmount != null" class="m"> (applies {{ x.labAmount }} per level, not {{ x.amount }} †)</small></td>
        <td>{{ x.inCapsule ? `in a capsule, ${days(x.left)} to Lv ${x.lv + 1}` : '' }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else>
    <div class="sec-head"><h3>Genetics and combos</h3><span class="m">unlocked once a recorded species carries the gene †</span></div>
    <p class="note">A combo is recorded once your team holds 3 / 6 / 9 of the gene, and stays recorded †.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Gene</th><th>Type</th><th>Does</th><th class="num">Team</th><th>Combos (✓ recorded)</th><th>Carried by</th></tr></thead>
      <tbody><tr v-for="g in c.genes" :key="g.id" :class="{ dim: !g.unlocked }"><td>{{ cap(g.name) }}</td><td>{{ g.type }}</td><td>{{ g.desc }}</td><td class="num">{{ g.count }}</td>
        <td><div v-for="k in g.combos" :key="k.t">{{ k.found ? '✓' : '·' }} {{ k.t * 3 }}: {{ k.text }}</div></td><td>{{ names(g.carriers) }}</td></tr></tbody>
    </table></div>
    <p class="note">Combo texts are the game's own and are not checked against the fight code.</p>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>Computed from your save; rules from the game's code (Qno2x.js offsets in web/src/codex.ts), checked in codex.test.ts by running the Codex
      init and the lab's capsule tick. Not covered: which unread rewards (23, 24) do anything, and the gene-slot and fighter/support-spot rewards are applied
      from the skill level elsewhere (not read from the Codex flag). Combo texts are the game's own and are not checked against the fight code.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); font-size: 12px; font-weight: normal; }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
tr.dim td { opacity: .7; }
</style>
