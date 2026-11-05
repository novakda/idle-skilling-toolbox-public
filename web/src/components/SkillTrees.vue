<script setup lang="ts">
import { computed } from 'vue'
import { capParts, refundPct, skillTotal, TREES } from '../skilltree'
import { skillBuys, skillPlan } from '../skill-plan'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const rows = computed(() => (props.save ? skillPlan(props.save) : []))
const points = computed(() => Number(props.save?.Skillpoints ?? 0))
const cap = computed(() => (props.save ? capParts(props.save) : null))
const plan = computed(() => skillBuys(rows.value, Math.floor(points.value)))
const refund = computed(() => (props.save ? refundPct(props.save) : 0))
const open = computed(() => rows.value.filter((r) => r.next != null && !r.lock).length)
const fmt = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(2)}%`
const capText = (c: number) => (c === Infinity ? '∞' : String(c))
// One tab per tree; ?section=red (first word of the tree name) opens it.
const treeId = (t: string) => t.split(' ')[0]!.toLowerCase()
const sec = sectionRef(TREES.map(treeId))
</script>

<template>
  <div class="page-head">
    <h2>Skill trees</h2>
    <p>Each perk's level against its cap, and where the next perk point does the most for you.</p>
    <div v-if="save && cap" class="tiles">
      <div class="tile"><b>{{ Math.floor(points) }}</b><span>perk points to spend</span></div>
      <div class="tile"><b>{{ Math.ceil(5 + cap.overcharge + cap.bobby) }}</b><span>perk cap (most perks)</span></div>
      <div class="tile"><b>{{ open }}</b><span>perks you can still level</span></div>
      <div class="tile"><b>{{ +refund.toFixed(1) }}%</b><span>chance a point comes back</span></div>
    </div>
  </div>
  <p v-if="!save" class="note">Load a save to see the skill trees.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol v-if="plan.buys.length" class="steps">
      <li v-for="b in plan.buys" :key="b.i">{{ TREES[Math.ceil(b.i / 10) - 1] }}: <b>{{ b.name }}</b> {{ b.from }} → {{ b.to }} for {{ b.spent }} points:
        about {{ fmt(b.gain) }} {{ b.output }}.</li>
    </ol>
    <p v-else class="note">No open perk with a modelled gain is affordable with {{ Math.floor(points) }} points.</p>
    <p class="note">Ranking optimises the largest % rise in any one modelled rate per perk point, all rates weighted equally (lean toward the
      ones you care about). A perk's gain is treated as a fixed step, so repeat levels count a little less each. {{ plan.left }} points left over.
      Refunds ({{ +refund.toFixed(1) }}% per level, TankBonusLIST[4]) are not counted, so you will usually get a bit further.</p>

    <details v-if="cap" class="how"><summary>How the perk cap is worked out</summary>
    <p>Most perks: 5 + Skilltree Overcharge {{ cap.overcharge }} (AP perk 12, to 5; All Star, BP perk 63, adds one more per level,
      to 5; you have {{ cap.allStar }}) + Tressii Brew Bobby {{ +cap.bobby.toFixed(2) }} (min(45·P/(P+175), 35), P = its potion level) = up to 50.
      Multicraft (19), Poison (25) and Overgrowth time redux (60) leave Bobby out (up to 15). Unlock nodes cap at 1; the Infinity tree has no cap,
      and each level costs one point more than the last.</p>
    </details>

    <div class="subtabs" role="tablist">
      <button v-for="t in TREES" :key="t" role="tab" :aria-selected="sec === treeId(t)" @click="sec = treeId(t)">{{ t }}</button>
    </div>
    <template v-for="(t, k) in TREES" :key="t">
      <template v-if="sec === treeId(t)">
      <div class="sec-head"><h3>{{ t }}</h3><span class="m">{{ rows.filter((x) => x.tree === k + 1 && x.next != null && !x.lock).length }} perks you can still level</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th class="num">#</th><th>Perk</th><th>Per level</th><th class="num">Level</th><th>Total now †</th><th class="num">Next costs</th><th>Next level does</th></tr></thead>
        <tbody>
          <tr v-for="r in rows.filter((x) => x.tree === k + 1)" :key="r.i" :class="{ muted: r.next == null || !!r.lock }">
            <td class="num">{{ r.i }}</td><td>{{ r.name }}</td><td>{{ r.per }}</td>
            <td class="num">{{ r.level }}/{{ capText(r.cap) }}</td><td>{{ skillTotal(save, r.i, r.level) }}</td>
            <td class="num">{{ r.next == null ? 'max' : r.next }}</td>
            <td v-if="r.lock">Locked: {{ r.lock }}</td>
            <td v-else-if="r.impact.length">{{ r.impact.map((x) => `${fmt(x.change)} ${x.output}`).join(', ') }}</td>
            <td v-else>{{ r.next == null ? '' : 'not modelled' }}</td>
          </tr>
        </tbody>
      </table></div>
      </template>
    </template>
    <details class="how"><summary>Sources</summary>
    <p>Caps, costs, prerequisites and Infinity locks from the game's skill-tree buy code (Qno2x.js offsets in web/src/skilltree.ts, run in
      skilltree.test.ts). Per-level text from the wiki, checked slot by slot against the game code (CODE in web/src/skilltree.ts, with offsets): 16 are corrected,
      3, 51, 53 and 60 have capped or conditional totals, and the rest match. "Next level does" re-runs this
      app's own formulas with one more level; "not modelled" means none of them reads that perk yet.</p>
    </details>
  </template>
</template>

<style scoped>
h3 { font-size: 16px; }
.muted td:not([class*=st-]) { color: var(--muted); }
.note { color: var(--muted); font-size: 13px; }
.steps li { margin: 2px 0; }
</style>
