<script setup lang="ts">
import { computed, ref } from 'vue'
import { heavyCash } from './heavycash'

const props = defineProps<{ save: Record<string, unknown> | null; embedded?: boolean }>() // embedded: the dialog on the Asylum shrines tab
const mode = ref<number | null>(null), level = ref<number | null>(null)   // null = the current monster
const sel = computed(() => (props.save && (mode.value != null || level.value != null)
  ? { mode: mode.value ?? Number(props.save.currentfightmode), level: level.value ?? Number(props.save.mapleLV) } : undefined))
const h = computed(() => (props.save ? heavyCash(props.save, sel.value) : null))
const fmt = (v: number | null | undefined) => v == null || !isFinite(v) ? '—' : v === 0 ? '0' : Math.abs(v) >= 1e6 || Math.abs(v) < 0.01 ? v.toExponential(3).replace('e+', 'e') : String(+v.toFixed(3))
</script>

<template>
  <div class="page-head">
    <h2 v-if="!embedded">Heavy Cash</h2>
    <p>The Asylum shrine that trades attack speed for cash: every toggle click multiplies cash per kill by (1.25 + level/200) and, in the zone-2 fights, idle attack rate by 0.8.</p>
    <div v-if="h" class="tiles">
      <div class="tile"><b>{{ h.level }}</b><span>shrine level (max toggle {{ Math.min(h.level, 50) }})</span></div>
      <div class="tile"><b>{{ h.toggle }}</b><span>toggle now</span></div>
      <div class="tile"><b>{{ h.current ? 'current' : 'selected' }}</b><span>mode {{ h.mode }}, level {{ h.monsterLevel }}, zone {{ h.zone }}</span></div>
    </div>
  </div>
  <p v-if="!h" class="note">Load a save first.</p>
  <template v-else>
    <p class="note">Monster: <label>mode <input type="number" min="1" :value="mode ?? save!.currentfightmode" @input="mode = Number(($event.target as HTMLInputElement).value)" style="width:5em"></label>
      <label> level <input type="number" min="0" :value="level ?? save!.mapleLV" @input="level = Number(($event.target as HTMLInputElement).value)" style="width:5em"></label>
      <button v-if="sel" @click="mode = level = null">current monster</button></p>
    <p v-if="!h.covered" class="note">This zone/mode's cash formula is not ported (zone 2 mode 20 and zone types 3+); showing the current monster only.</p>
    <p class="note">Away cash/h is shown for the current monster only.</p>
    <details class="how"><summary>How cash/h is worked out</summary>
    <p>"Cash/h vs 0" is cash per kill times kill rate: in zone 2 the toggle-0 rate is already ×2 (level above 1), each click ×0.8. Away cash/h (current monster, the AFK panel's 40 hits/s cap included) is shown for the current monster only; zone 1 has no speed penalty.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Toggle</th><th class="num">Cash ×</th><th class="num">Attack rate ×</th><th class="num">Cash / kill</th><th class="num">Cash/h vs toggle 0</th><th class="num">Away cash/h</th></tr></thead>
      <tbody>
        <tr v-for="r in h.rows" :key="r.t" :class="{ ready: r.t === h.toggle }">
          <td class="num">{{ r.t }}</td><td class="num">{{ fmt(r.cashMult) }}</td><td class="num">{{ fmt(r.speedMult) }}</td>
          <td class="num">{{ fmt(r.cash) }}</td><td class="num">{{ fmt(r.rate) }}</td><td class="num">{{ fmt(r.away?.cash) }}</td>
        </tr>
      </tbody>
    </table></div>
  </template>
</template>
