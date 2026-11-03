<script setup lang="ts">
import { computed, ref } from 'vue'
import { BESTIARY, progress, SKULLS, skullTier } from '../bestiary'
import Icon from './Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const filter = ref('')
const sh = (v: number) => (!Number.isFinite(v) ? '∞' : v >= 1e6 ? v.toExponential(2).replace('e+', 'e') : Math.round(v).toLocaleString())
const range = (r: [number, number] | null) => (!r ? '—' : r[0] === r[1] ? sh(r[0]) : `${sh(r[0])} – ${sh(r[1])}`)
const skull = (k: number) => SKULLS[skullTier(k)]!
const KIND = { zone: 'Zone', special: 'Special', raid: 'Raid boss', asylum: 'Asylum boss', crusade: 'Crusade' }
const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return BESTIARY.filter((r) => !q || `${r.name} ${r.where} ${r.cardName} ${KIND[r.kind]}`.toLowerCase().includes(q))
    .map((r) => ({ r, p: props.save ? progress(props.save, r) : null, i: BESTIARY.indexOf(r) }))
    .sort((a, b) => { const x = key(a), y = key(b); return x === y ? a.i - b.i : x == null ? 1 : y == null ? -1 : (x < y ? -1 : 1) * (sort.value.desc ? -1 : 1) })
})
// Click a header to sort (same pattern as Realm's blessings): ranges sort by their top end, unknowns (—) last either way.
type Col = 'name' | 'kind' | 'where' | 'hp' | 'gold' | 'kills' | 'seen'
type Row = { r: (typeof BESTIARY)[number]; p: ReturnType<typeof progress> | null; i: number }
const sort = ref<{ col: Col | null; desc: boolean }>({ col: null, desc: false })
const sortBy = (col: Col) => { sort.value = { col, desc: sort.value.col === col ? !sort.value.desc : ['hp', 'gold', 'kills'].includes(col) } }
const key = ({ r, p, i }: Row): string | number | null => {
  switch (sort.value.col) {
    case null: return i
    case 'name': return r.name.toLowerCase()
    case 'kind': return KIND[r.kind]
    case 'where': return i // table order is the game's zone/stage order; alphabetical would scramble it
    case 'hp': return (p?.hp ?? r.hp)?.[1] ?? null
    case 'gold': return p?.gold?.[1] ?? null
    case 'kills': return p?.kills ?? null
    case 'seen': return p?.seen ?? null
  }
}
const arrow = (col: Col) => (sort.value.col === col ? (sort.value.desc ? ' ▼' : ' ▲') : '')
</script>

<template>
  <div class="page-head">
    <h2>Bestiary</h2>
    <p>Every monster the game's tables list: fight zones, Qoxzul, raid and Asylum bosses, and crusades. Where each appears, its HP and gold, the card it drops, and how far you've got.</p>
  </div>
  <div class="sec-head"><h3>Monsters</h3><span class="m">{{ rows.length }} of {{ BESTIARY.length }}; click a header to sort; a range is the first to last stage the monster covers; — means unknown or not applicable</span></div>
  <div class="legend" aria-label="Skull legend"><b>Kill skulls</b>
    <span v-for="s in SKULLS" :key="s.tier" class="muted"><Icon kind="skull" :id="s.tier" :name="s.name" /> {{ s.tier ? `${s.at.toLocaleString()} kills` : `under ${SKULLS[1].at.toLocaleString()}` }}</span>
  </div>
  <input v-model="filter" type="search" placeholder="Filter by monster, zone or card…" aria-label="Filter monsters" />
  <div class="tbl"><table class="list">
    <thead><tr><th class="sortable" @click="sortBy('name')">Monster{{ arrow('name') }}</th><th class="sortable" @click="sortBy('kind')">Kind{{ arrow('kind') }}</th><th class="sortable" @click="sortBy('where')">Where{{ arrow('where') }}</th><th class="num sortable" @click="sortBy('hp')" title="Mark (skill 16) off; at the first and last stage of the range">HP{{ arrow('hp') }}</th>
      <th class="num sortable" @click="sortBy('gold')" title="Gold per kill (defaultgold) at the first and last stage, with your save's SmithingBonusCash, ascension and Mark (skill 16)">Gold / kill{{ arrow('gold') }}</th>
      <th class="num sortable" @click="sortBy('kills')" title="Zones: MapleMonster kill credit over the stage range. Raids: the boss's kill counter, all difficulties together">Your kills{{ arrow('kills') }}</th>
      <th class="sortable" @click="sortBy('seen')" title="Zones: furthest stage reached (FurthestMapleLV) within the range. Raid/Asylum: beaten on this difficulty (RaidBossKilled). Crusades: highest difficulty open (ConquestDifficultyLV)">Progress{{ arrow('seen') }}</th></tr></thead>
    <tbody>
      <tr v-for="{ r, p } in rows" :key="r.kind + r.card + r.where">
        <td>{{ r.name }} <small class="muted">#{{ r.card }}<template v-if="r.cardName !== r.name"> · drops {{ r.cardName }}</template></small></td>
        <td class="muted">{{ KIND[r.kind] }}</td><td>{{ r.where }}</td>
        <td class="num">{{ range(p?.hp ?? r.hp) }}</td><td class="num" :class="{ muted: !p?.gold }">{{ range(p?.gold ?? null) }}</td>
        <td class="num" :class="{ muted: p?.kills == null }"><Icon v-if="p?.kills != null" kind="skull" :id="skullTier(p.kills)" :name="''" :title="skull(p.kills).name" /> {{ p?.kills == null ? '—' : sh(p.kills) }}</td><td :class="{ muted: !p?.seen }">{{ p?.seen ?? '—' }}</td>
      </tr>
      <tr v-if="!rows.length"><td colspan="7" class="muted">No monster matches “{{ filter }}”.</td></tr>
    </tbody>
  </table></div>
  <details class="how"><summary>Where the numbers come from</summary>
  <p>Rows are the card table (derive-sources.ts runs the dropped-card actor, ActorEvents_875, for every zone stage, boss
    difficulty and crusade stage): a zone monster is named after its card. Zone HP and gold are the fight scene's
    formulas (fighting.ts), shown at the first and last stage the monster covers; skill 16 multiplies HP ×5. Grasslands
    stage 100 is Qoxzul, whose drawing listener writes a fixed HP, 666 gold and a 666,666 hit (@31847536), and drops its
    card once. Raid and Asylum boss HP is raids.ts bossHP (Asylum Z at bell 0; Gorshank phase 1, phase 2 ×4). Crusade HP
    is the crusade fight's stage HP at difficulty 1, up to the highest difficulty you have open. Raids, the Asylum and
    crusades pay no gold per kill. Realm bosses are on the Realm page.</p>
  </details>
</template>

<style scoped>
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; margin: 4px 0; }
.sortable { cursor: pointer; user-select: none; }
input[type=search] { width: 100%; max-width: 360px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); margin: 6px 0 10px; }
</style>
