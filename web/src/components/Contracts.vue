<script setup lang="ts">
import { computed, ref } from 'vue'
import { ascendPlan, BOARDS, contracts } from '../contracts'
import { COLS, contractPlan, dur, num, ROD_FISHING_SECONDS, skillTraining } from '../contract-plans'
import StepsDialog from './StepsDialog.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const rows = computed(() => (props.save ? contracts(props.save) : []))
const sel = computed(() => Number(props.save?.ContractSelected ?? 0))
const count = (st: string) => rows.value.filter((r) => r.status === st).length
const plan = computed(() => ascendPlan(rows.value))
const since = computed(() => Number(props.save?.TimeSinceAscention ?? 0))
const ascendFailed = computed(() => rows.value.filter((r) => r.status === 'failed' && r.retry === 'Ascend').length)
const fmt = (sec: number) => (sec < 3600 ? `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : `${+(sec / 3600).toFixed(1)} h`)
// "What fails it": the first sentence shown, the rest (where and how it is checked) folded.
const firstSentence = (t: string) => { const k = t.indexOf('. '); return k < 0 ? [t, ''] : [t.slice(0, k + 1), t.slice(k + 2)] }
// Board picker: defaults to the board selected in game; 0 = all boards. Kept for this page view only.
const boardPick = ref<number | null>(null)
const board = computed(() => boardPick.value ?? (sel.value >= 1 && sel.value <= 9 ? sel.value : 0))
const shown = computed(() => (board.value ? rows.value.filter((r) => r.boardNo === board.value) : rows.value))
const pct = (r: { progress: number; required: number | null }) => (r.required && r.progress >= 0 ? Math.min(100, (100 * r.progress) / r.required) : null)
// Plan per contract (contract-plans.ts): one inline line, or steps in the shared StepsDialog.
// Fastest Rod: seconds actually fishing inside the 5:00, set from the author's own Ascend; kept in this browser.
const ROD_KEY = 'contracts.rodSeconds'
const rodSeconds = ref(Number((() => { try { return localStorage.getItem(ROD_KEY) } catch { return null } })()) || ROD_FISHING_SECONDS)
const setRod = (v: number) => { rodSeconds.value = Math.min(300, Math.max(0, v || 0)); try { localStorage.setItem(ROD_KEY, String(rodSeconds.value)) } catch { /* not persisted */ } }
const plans = computed(() => new Map(rows.value.map((r) => [r.i, props.save ? contractPlan(r, props.save, rodSeconds.value) : null])))
const skills = computed(() => (props.save ? skillTraining(props.save) : []))
const sci = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : String(+v.toFixed(1)))
</script>

<template>
  <div class="page-head">
    <h2>Contracts</h2>
    <p>What fails each contract, which ones you've failed, and what resets them.</p>
    <div v-if="rows.length" class="tiles">
      <div class="tile"><b :class="{ 'st-bad': count('failed') }">{{ count('failed') }}</b><span>failed</span></div>
      <div class="tile"><b>{{ count('open') }}</b><span>open</span></div>
      <div class="tile"><b>{{ count('complete') }}</b><span>complete</span></div>
      <div class="tile"><b>{{ rows.filter((r) => r.status === 'open' && r.fails).length }}</b><span>open that can fail</span></div>
    </div>
  </div>
  <section v-if="rows.length">
    <h3>Plan, step by step</h3>
    <label v-if="rows.some((r) => r.i === 19)" class="muted small">Fastest Rod: seconds spent fishing in the 5:00 after an Ascend
      <input type="number" min="0" max="300" step="10" :value="rodSeconds" style="width:5em" @change="setRod(Number(($event.target as HTMLInputElement).value))" /></label>
    <p class="note">{{ fmt(since) }} since your last Ascend †.
      <template v-if="since <= 300">The 5-minute contracts are still live: turn them in before 5:00.</template>
      <template v-else>{{ ascendFailed }} contract{{ ascendFailed === 1 ? '' : 's' }} stay failed until you Ascend; follow this order right after the next one.</template>
      The order maximises contracts turned in per Ascend (each turn-in is a rank). Only contracts below max rank are listed.</p>
    <ol class="do">
      <li v-for="(s, k) in plan.steps" :key="k"><b>{{ s.when }}:</b> <template v-if="s.list">Until each is turned in:
        <ul><li v-for="h in s.list" :key="h">{{ h }}</li></ul></template><template v-else>{{ s.text }}<br /></template>
        <small class="m">Why: {{ s.why }}<template v-if="s.unverified"> † Read in the game code, not yet seen in game.</template></small></li>
    </ol>
    <template v-for="(c, k) in plan.choices" :key="'c' + k">
      <div class="sec-head"><h3>Choose one this Ascend</h3><span class="m">skill tree vs 22 {{ rows[21]?.name }}</span></div>
      <ul class="do"><li v-for="s in [c.a, c.b]" :key="s.when"><b>{{ s.when }}:</b> {{ s.text }}<br /><small class="m">Why: {{ s.why }}</small></li></ul>
    </template>
    <p v-for="(s, k) in plan.skipped" :key="'s' + k" class="st-warn"><b>{{ s.when }}:</b> {{ s.text }}
      <small class="m">{{ s.why }} † unverified.</small></p>
    <template v-for="(s, k) in plan.rebirth" :key="'r' + k">
      <div class="sec-head"><h3>{{ s.when }}</h3></div>
      <table v-if="s.items?.length"><thead><tr><th>#</th><th>Contract</th><th>Do</th></tr></thead>
        <tbody><tr v-for="it in s.items" :key="it.id"><td class="num">{{ it.id }}</td><td>{{ it.name }}</td><td>{{ it.task }}</td></tr></tbody></table>
      <p>{{ s.text }}<br /><small class="m">Why: {{ s.why }} † Read in the game code, not yet seen in game.</small></p>
    </template>
    <div class="sec-head"><h3>All contracts</h3><span class="m">what fails each one</span></div>
    <p class="facts"><span><b>Selected board †</b> {{ BOARDS[sel - 1] ?? (sel > 9 ? `merit shop page ${sel - 9}` : 'none') }} (highlighted)</span>
      <label>Show board <select :value="board" @change="boardPick = Number(($event.target as HTMLSelectElement).value)">
        <option :value="0">All boards</option>
        <option v-for="(b, k) in BOARDS" :key="b" :value="k + 1">{{ b }} ({{ rows.filter((r) => r.boardNo === k + 1 && r.status === 'complete').length }}/4 complete)</option>
      </select></label></p>
    <details class="how"><summary>Sources, and what a failed contract means</summary>
    <p>What fails each contract, read from the game's code (docs/contracts.md). † = read in code, not yet seen in game; verified = seen in game.
      A failed contract (progress -1) stays failed until you Ascend (Cerebral/Lavathian: Rebirth). Contracts with no fail condition can't be failed.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Board</th><th>Contract</th><th>Rank †</th><th class="num">Progress / required †</th><th>What fails it</th><th>Status</th><th>Plan</th></tr></thead>
      <tbody><tr v-for="r in shown" :key="r.i" :class="[r.status, { sel: r.selected }]">
        <td class="num">{{ r.i }}</td><td>{{ r.board }}</td>
        <td><b>{{ r.name }}</b><br /><small class="m">{{ r.asks }} (wiki)</small></td>
        <td>{{ r.rankName }}</td><td class="num"><template v-if="r.status === 'complete'">complete</template><template v-else-if="r.progress === -1">failed (-1)</template>
          <template v-else>{{ sci(r.progress) }} / {{ r.required == null ? '?' : sci(r.required) }}<template v-if="pct(r) != null"><br /><small class="m">{{ pct(r)!.toFixed(pct(r)! < 10 ? 1 : 0) }}%</small>
          <span class="bar"><span :style="{ width: pct(r) + '%' }"></span></span></template></template></td>
        <td><template v-if="r.fails">{{ firstSentence(r.fails)[0] }} <small class="m">{{ r.confidence }}</small>
          <details v-if="firstSentence(r.fails)[1]"><summary class="m">checks</summary>{{ firstSentence(r.fails)[1] }}</details></template><span v-else class="m">can't fail</span></td>
        <td :class="{ 'st-bad': r.status === 'failed' || r.doomed }">{{ r.status === 'failed' ? `failed: ${r.retry} to retry` : r.doomed ? 'will fail: condition already met †' : r.status }}</td>
        <td><template v-for="p in [plans.get(r.i)]" :key="r.i"><StepsDialog v-if="p && 'rows' in p" label="Plan" :title="p.title" :cols="COLS" :rows="p.rows" /><small v-else-if="p" class="m">{{ p.inline }}</small></template></td></tr></tbody>
    </table></div>
    <details v-if="rows[1]?.status === 'open'" class="how"><summary>Skill Training breakdown (contract 2): {{ sci(rows[1]!.progress) }} / {{ rows[1]!.required == null ? '?' : sci(rows[1]!.required!) }}</summary>
      <p class="note">Every level gained in these skills adds 1 (24 increment sites in the game code). Rift, Construction, Spelunking, Botany and pet levels don't count.
        Levels/h is an ESTIMATE at today's requirement from the module that models the skill (it overstates a long run: the requirement grows every level).</p>
      <div class="tbl"><table class="list"><thead><tr><th>Skill</th><th class="num">Level</th><th class="num">Levels/h (estimate)</th><th class="num">Ascend restarts at</th></tr></thead>
        <tbody><tr v-for="k in skills" :key="k.lv"><td>{{ k.skill }} <small class="m">{{ k.lv }}</small></td><td class="num">{{ sci(k.level) }}</td>
          <td class="num">{{ k.levelsPerHour == null ? 'no rate modelled' : num(k.levelsPerHour) }}<template v-if="k.levelsPerHour"><br /><small class="m">1 level ≈ {{ dur(1 / k.levelsPerHour) }}</small></template></td>
          <td class="num">{{ k.start ?? 'kept' }}</td></tr></tbody></table></div>
    </details>
  </section>
  <p v-else class="muted">Load a save to see your contracts.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.bar { display: block; height: 4px; background: var(--border, #8884); border-radius: 2px; min-width: 60px; }
.bar > span { display: block; height: 100%; background: var(--accent); border-radius: 2px; }
h3 { font-size: 16px; } .sec-head h3 { margin: 0; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
.muted, .m { color: var(--muted); }
tr.sel td:first-child { box-shadow: inset 3px 0 var(--accent); }
tr.failed td:last-child { font-weight: bold; }
tr.complete td { color: var(--muted); }
</style>
