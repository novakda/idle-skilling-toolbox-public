<script setup lang="ts">
import { computed, ref } from 'vue'
import { doNext } from '../do-next'
import type { Snap } from '../income'
import type { GameImpacts } from '../perk-plan'
import type { Combat } from '../realm'
import type { AscendSnap } from '../ascend'

const props = defineProps<{ save: Record<string, unknown> | null }>()
defineEmits<{ go: [view: string] }>()
// Same optional data the Shrines, Perks and Realm tabs fetch (dev only / absent off the author's machine).
const history = ref<Snap[]>([]), impacts = ref<GameImpacts | null>(null), combat = ref<Combat | null>(null), ascendHistory = ref<AscendSnap[]>([])
const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
if (import.meta.env.DEV) get('/data/history.json').then((h) => { history.value = h ?? [] })
get('/data/perk-impacts.json').then((j) => { impacts.value = j })
get('/data/realm-combat.json').then((j) => { combat.value = j })
get('/data/ascend-history.json').then((j) => { ascendHistory.value = j ?? [] })
const sections = computed(() => (props.save ? doNext(props.save, { history: history.value, impacts: impacts.value, combat: combat.value, ascendHistory: ascendHistory.value }) : []))
const withItems = computed(() => sections.value.filter((s) => s.items?.length))
</script>

<template>
  <div class="page-head">
    <h2>Do next</h2>
    <p>What to do now: each page's own top recommendations, most leverage first.</p>
    <div v-if="save" class="tiles">
      <div class="tile"><b>{{ withItems.reduce((n, s) => n + s.items!.length, 0) }}</b><span>recommendations</span></div>
      <div class="tile"><b>{{ withItems.length }}/{{ sections.length }}</b><span>pages with something to do</span></div>
      <div class="tile"><b :class="{ 'st-bad': sections.some((s) => s.error) }">{{ sections.filter((s) => s.error).length }}</b><span>pages that failed</span></div>
    </div>
  </div>
  <template v-if="save">
    <p class="note">Click a heading to open that page; the source function is in small print.</p>
    <section v-for="s in sections" :key="s.view">
      <div class="sec-head"><h3><a href="#" @click.prevent="$emit('go', s.view)">{{ s.title }}</a></h3><span class="m">{{ s.src }}</span></div>
      <p v-if="s.error" class="warn">Unavailable: this page's computation failed on this save (see console).</p>
      <p v-else-if="s.items === null" class="note">No recommendation computed outside this page yet (its logic lives in the component); open it.</p>
      <p v-else-if="!s.items.length" class="note">Nothing to do right now.</p>
      <template v-else-if="s.head">
        <p v-if="s.note" class="note">{{ s.note }}</p>
        <div class="tbl"><table class="list nosort">
          <thead><tr><th v-for="h in s.head" :key="h">{{ h }}</th></tr></thead>
          <tbody><tr v-for="(i, k) in s.items" :key="k"><td v-for="(c, j) in i.cells" :key="j">{{ c }}</td></tr></tbody>
        </table></div>
      </template>
      <ol v-else><li v-for="(i, k) in s.items" :key="k">{{ i.text }}<template v-if="!i.sub"> <span class="m">— {{ i.why }}</span></template>
        <div v-else class="tbl sub"><table class="list nosort">
          <thead><tr><th v-for="h in i.sub.head" :key="h">{{ h }}</th></tr></thead>
          <tbody><tr v-for="(r, j) in i.sub.rows" :key="j"><td v-for="(c, m) in r" :key="m">{{ c }}</td></tr></tbody>
        </table></div></li></ol>
    </section>
  </template>
  <p v-else class="muted">Load a save to see what to do next.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 8px; }
.muted, .m { color: var(--muted); }
.m { font-size: 12px; font-weight: normal; }
.warn { border-left: 3px solid var(--bad); padding: 4px 10px; background: var(--panel); font-size: 13px; }
h3 { font-size: 15px; }
.sec-head { margin: 14px 0 4px; }
h3 a { color: var(--accent); text-decoration: none; }
ol { margin: 0 0 6px; padding-left: 22px; font-size: 13px; max-width: 1000px; }
li { margin-bottom: 2px; }
.sub { max-width: 900px; margin: 4px 0 6px; } .sub table.list { min-width: 0; }
</style>
