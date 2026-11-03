<script setup lang="ts">
import { computed } from 'vue'
import { ACTIVE_CATCH_SECONDS, awayFishing, fishing, upgrades } from '../fishing'
import { awayPercent } from '../away'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const f = computed(() => (props.save ? fishing(props.save) : null))
const ups = computed(() => (props.save ? upgrades(props.save) : []))
const away = computed(() => { const pct = props.save ? awayPercent(props.save) : null; return props.save && pct != null ? { pct, ...awayFishing(props.save, pct) } : null })
const activePerSec = computed(() => (f.value ? f.value.perCatch / ACTIVE_CATCH_SECONDS : 0))
const warp = computed(() => Number(((props.save?.SkillLevels as number[]) ?? [])[24] ?? 0))
const p = (x: number) => `${(100 * x).toFixed(1)}%`
const big = (x: number) => (x >= 1e9 ? `${+(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `${+(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `${+(x / 1e3).toFixed(1)}K` : x.toFixed(0))
</script>

<template>
  <div class="page-head">
    <h2>Fishing</h2>
    <p>Why away fishing beats fishing, the real catch odds, and which hook and rod upgrades pay.</p>
    <div v-if="f" class="tiles">
      <div class="tile"><b>{{ f.lv }}</b><span>Fishing level</span></div>
      <div class="tile"><b>{{ big(f.perCatch) }}</b><span>XP per catch</span></div>
      <div class="tile"><b>{{ away ? big(away.perAwaySecond) : '—' }}</b><span>XP per second away</span></div>
      <div class="tile"><b>{{ away ? Math.round(away.perAwaySecond / activePerSec).toLocaleString() + '×' : '—' }}</b><span>away vs active</span></div>
    </div>
  </div>
  <template v-if="f">
    <p class="facts"><span><b>Fishing Lv</b> {{ f.lv }}</span><span><b>Hook</b> {{ f.hook }}</span><span><b>Rod</b> {{ f.rod }}</span>
      <span><b>XP per catch</b> {{ big(f.perCatch) }} on average ({{ f.base.toFixed(0) }} base × {{ Math.round(f.multi).toLocaleString() }})</span></p>
    <section v-if="away" class="away">
      <div class="sec-head"><h3>Away fishing beats fishing</h3><span class="m">verified live</span></div>
      <p>Leave Fishing and come back: the game credits <b>{{ big(away.perAwaySecond) }} XP per second away</b> ({{ away.pct }}% of away time), vs <b>{{ big(activePerSec) }} XP/s</b> fishing actively (one catch per ~{{ ACTIVE_CATCH_SECONDS }} s). That's <b>{{ Math.round(away.perAwaySecond / activePerSec).toLocaleString() }}×</b>. An hour away: {{ big(away.perAwaySecond * 3600) }} XP.</p>
      <details class="how"><summary>How away fishing is worked out</summary>
      <p>Away credit isn't rolled: it counts one catch per bite wait ({{ away.catchesPerSecond.toFixed(1) }}/s, no reel animation), uses the screen's odds, and applies fishing power in full. Verified live: 327 s away gave +4.91B, formula 4.95B.</p>
      </details>
    </section>
    <div class="sec-head"><h3>Active fishing</h3><span class="m">real catch odds per tier</span></div>
    <p class="note">You don't pick the fish: each catch rolls a tier. The game checks large first, then treats the medium chance as a cutoff, so the fishing screen's medium and small odds are wrong. The real ones are below (verified live: 100 catches, every one matched).</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Tier</th><th class="num">Fish</th><th class="num">Screen says</th><th class="num">Real</th></tr></thead>
      <tbody>
        <tr v-for="(t, k) in f.tiers" :key="k"><td>{{ k }}</td><td class="num">{{ t.fish[0] }}–{{ t.fish[1] }}</td><td class="num muted">{{ f.shown[k].toFixed(1) }}%</td><td class="num b">{{ p(t.p) }}</td></tr>
      </tbody>
    </table></div>
    <div class="sec-head"><h3>Hook and rod upgrades</h3><span class="m">gain vs your current hook and rod</span></div>
    <p class="note">Medium caps at 45, so small stays at {{ p(f.tiers.small.p) }}; upgrades only turn medium catches into large ones, up to large 45%. Away credit uses the screen's odds instead, where upgrades also shrink small, so they help away fishing more.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Hook</th><th class="num">Rod</th><th class="num">Real large</th><th class="num">Base XP/catch</th><th class="num">Active vs now</th><th class="num">Away vs now</th></tr></thead>
      <tbody>
        <tr v-for="u in ups" :key="`${u.hook}-${u.rod}`"><td class="num">{{ u.hook }}</td><td class="num">{{ u.rod }}</td><td class="num">{{ p(u.large) }}<span v-if="u.capped" class="muted"> (cap)</span></td><td class="num">{{ u.base.toFixed(0) }}</td><td class="num">+{{ (100 * u.gain).toFixed(0) }}%</td><td class="num">+{{ (100 * u.awayGain).toFixed(0) }}%</td></tr>
      </tbody>
    </table></div>
    <div class="sec-head"><h3>Warps</h3></div>
    <p v-if="warp">While the line waits for a bite, each second has a 24% chance to show a warp for 3 s. Clicking it skips {{ warp }} s of the wait; no XP, fish or odds change. With a short wait (under ~1 s once fishing power is high) it saves little.</p>
    <p v-else class="muted">Warps need skill slot 24 (SkillLevels[24]) at level 1+.</p>
  </template>
  <p v-else class="muted">Load a save.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; }
.tbl { max-width: 760px; }
td.b { font-weight: 600; }
</style>
