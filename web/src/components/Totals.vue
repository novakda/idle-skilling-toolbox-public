<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { STATS, adds, biggest, showTotal } from '../totals'
import { setParam } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const fmt = (v: number | null) => (v == null ? 'unknown' : Math.abs(v) < 1e6 ? String(+v.toFixed(3)) : v.toExponential(3))
// One row per stat; ?section=<stat id> opens that stat's sources (the accordion row) and is written back when you open one.
const q = new URLSearchParams(location.search).get('section')
const open = ref<string | null>(STATS.some((s) => s.id === q) ? q : null)
watch(open, (id) => setParam('section', id))
const toggle = (id: string) => { open.value = open.value === id ? null : id }
onMounted(() => { if (open.value) nextTick(() => document.getElementById(`total-${open.value}`)?.scrollIntoView({ block: 'start' })) })

const table = computed(() => (props.save ? STATS.map((st) => {
  const rows = st.rows(props.save!), total = st.total(rows, props.save!), top = biggest(rows)
  return { st, rows, total, top }
}) : []))
</script>

<template>
  <div class="page-head">
    <h2>Totals</h2>
    <p>Every computed effect the app can rebuild from the save, combined the way the game combines them. Open a row for each source.</p>
  </div>
  <p v-if="!save" class="note">Load a save first.</p>
  <div v-else class="tbl"><table class="list nosort totals">
    <thead><tr><th>Stat</th><th class="num">Total now</th><th>Biggest source</th><th>Cap / waste</th></tr></thead>
    <tbody>
      <template v-for="t in table" :key="t.st.id">
        <tr :id="`total-${t.st.id}`" class="stat" :class="{ open: open === t.st.id }">
          <td><button type="button" class="link" :aria-expanded="open === t.st.id" @click="toggle(t.st.id)">{{ open === t.st.id ? '▾' : '▸' }} {{ t.st.label }}</button></td>
          <td class="num"><b>{{ showTotal(t.st, t.total.value) }}</b></td>
          <td>{{ t.top ? `${t.top.name} ${adds(t.top)}` : '—' }}</td>
          <td :class="{ warn: t.total.flag }">{{ t.total.flag ?? '' }}</td>
        </tr>
        <tr v-if="open === t.st.id" class="detail"><td colspan="4">
          <div class="tbl"><table class="list">
            <thead><tr><th>Source</th><th>Where</th><th class="num">Value †</th><th>How it enters</th><th class="num">Adds</th></tr></thead>
            <tbody>
              <tr v-for="r in t.rows" :key="r.name">
                <td>{{ r.name }}</td><td>{{ r.where }}</td><td class="num">{{ fmt(r.value) }}</td><td>{{ r.how }}</td>
                <td class="num">{{ adds(r) }}</td>
              </tr>
            </tbody>
          </table></div>
          <p v-for="l in t.total.lines" :key="l" class="note">{{ l }}</p>
          <p class="note">{{ t.st.meaning }}</p>
        </td></tr>
      </template>
    </tbody>
  </table></div>
</template>

<style scoped>
.totals .stat button.link { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; }
.totals .stat.open td { border-bottom: 0; }
.totals .detail > td { padding: 4px 0 12px 16px; }
.totals td.warn { color: var(--warn); }
@media (max-width: 600px) { .totals .stat button.link { min-height: 44px; } }
</style>
