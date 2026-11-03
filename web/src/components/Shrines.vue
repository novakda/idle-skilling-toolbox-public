<script setup lang="ts">
import { computed, ref } from 'vue'
import HeavyCash from './HeavyCash.vue'
import { incomeRates, shrineOwned, shrineRows, type ShrineTable as Table, type Snap } from '../income'

const props = defineProps<{ save: Record<string, unknown>; embedded?: boolean }>() // embedded: a tab of the Asylum page

// Static app data (src/derive-shrines.ts writes it): shrine costs depend only on shrine + level.
import shrineTable from '../data/shrines.json'
const table = ref<Table | null>(shrineTable as Table)
const error = ref('')
// Heavy Cash's planner (formerly its own page) opens from its row in a native <dialog>.
const hcDlg = ref<HTMLDialogElement | null>(null)

const history = ref<Snap[]>([])
if (import.meta.env.DEV) fetch('/data/history.json').then((r) => (r.ok ? r.json() : [])).then((h: Snap[]) => (history.value = h)).catch(() => {})
const rates = computed(() => incomeRates(history.value))
function fmtHours(h: number): string {
  if (h === 0) return 'now'
  if (!isFinite(h)) return 'no income seen'
  return h < 1 ? `${Math.ceil(h * 60)}m` : h < 48 ? `${+h.toFixed(1)}h` : `${+(h / 24).toFixed(1)}d`
}

const owned = computed(() => shrineOwned(props.save))
const curName = (slot: number) => table.value?.currency[slot] ?? `currency ${slot}`
const rows = computed(() => (table.value ? shrineRows(props.save, table.value, rates.value?.perHour) : []))

const waits = computed(() => rows.value.map((r) => r.wait).filter((w): w is number => w !== undefined && w > 0))

function fmt(n: number | undefined): string {
  if (n === undefined || !isFinite(n)) return '—'
  if (n === 0) return '0'
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']
  const i = Math.min(units.length - 1, Math.max(0, Math.floor(Math.log10(Math.abs(n)) / 3)))
  return i === 0 ? String(+n.toFixed(1)) : `${+(n / 10 ** (i * 3)).toFixed(2)}${units[i]}`
}
</script>

<template>
  <div class="page-head">
    <h2 v-if="!embedded">Shrines</h2>
    <h3 v-else>Shrines</h3>
    <p>What the next level of each shrine costs, which you can buy now, and how long until the rest.</p>
    <div class="tiles">
      <div class="tile"><b>{{ rows.filter((r) => r.buyable > 0).length }}</b><span>shrines you can level now</span></div>
      <div class="tile"><b>{{ rows.filter((r) => !r.next).length }}/{{ rows.length }}</b><span>at max level</span></div>
      <div class="tile"><b>{{ waits.length ? fmtHours(Math.min(...waits)) : '—' }}</b><span>soonest next level</span></div>
    </div>
  </div>
  <p v-if="error" class="err">{{ error }}</p>
  <p class="note">"Buyable" spends only on that shrine.
    <template v-if="rates"> Income measured over the last {{ +rates.hours.toFixed(1) }}h of saves.</template>
    <template v-else> Income needs two saves 5+ min apart — reload this page later (each load re-reads the save).</template></p>
  <div v-if="table" class="tbl"><table class="list">
    <thead>
      <tr><th>Shrine</th><th class="num">Lv</th><th class="num">Next cost</th><th class="num">Second cost</th><th class="num">Buyable now</th><th class="num">Next level in</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.id" :class="{ ready: r.buyable > 0 }">
        <td>{{ r.id }}. {{ r.name }}<button v-if="/heavy cash/i.test(r.name)" type="button" class="hc-btn" @click="hcDlg?.showModal()">Details</button></td>
        <td class="num">{{ r.lv }} / {{ r.max }}</td>
        <td v-if="r.next" class="num">{{ fmt(r.next.cost1) }} {{ curName(r.next.cur1) }} <small>(have {{ fmt(owned[r.next.cur1]) }})</small></td>
        <td v-else class="num">max</td>
        <td v-if="r.next" class="num">{{ fmt(r.next.cost2) }} {{ curName(r.next.cur2) }} <small>(have {{ fmt(owned[r.next.cur2]) }})</small></td>
        <td v-else class="num">—</td>
        <td class="num" :class="{ 'st-good': r.buyable > 0 }">{{ r.buyable ? `+${r.buyable}` : '—' }}</td>
        <td class="num">{{ r.wait === undefined ? '—' : fmtHours(r.wait) }}</td>
      </tr>
    </tbody>
  </table></div>
  <dialog ref="hcDlg" class="hc-dlg">
    <div class="sec-head"><h3>Heavy Cash</h3><button type="button" @click="hcDlg?.close()">Close</button></div>
    <HeavyCash :save="save" embedded />
  </dialog>
  <details class="how"><summary>Sources</summary>
  <p>Costs come from the game's own shrine code, run locally (they reproduce the cost in your save).</p>
  </details>
</template>

<style scoped>
.hc-btn { margin-left: .5em; font-size: .85em; }
.hc-dlg { width: min(1000px, 95vw); max-height: 88vh; overflow: auto; background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 8px; }
.hc-dlg::backdrop { background: rgb(0 0 0 / .45); }
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.err { color: var(--bad); }
small { color: var(--muted); }
</style>
