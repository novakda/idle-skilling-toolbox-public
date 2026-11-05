<script setup lang="ts">
import { computed } from 'vue'
import { bestCandyUse, CANDY_SECS, candyGoals, candyHeld } from './candy'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const held = computed(() => (props.save ? candyHeld(props.save) : []))
const hours = computed(() => held.value.reduce((t, c) => t + c.count * CANDY_SECS[c.type]! / 3600, 0))
// nonActiveZoneGainPercent: the away-gain % every off-screen skill earns at (game attribute, read ×% /100 wherever away gains pay).
const away = computed(() => Number(props.save?.nonActiveZoneGainPercent ?? 0) || 0)
const goals = computed(() => (props.save ? candyGoals(props.save).sort((a, b) => a.secs - b.secs) : []))
const uses = computed(() => Object.entries(CANDY_SECS).map(([k, secs]) => ({ hours: Math.round(secs / 3600), count: held.value.find((c) => c.type === +k)?.count ?? 0, best: bestCandyUse(goals.value, secs) })))
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const untraced = computed(() => { const o = (props.save?.CandyOwned as number[] | undefined) ?? []; return [6, 7].filter((k) => Number(o[k] ?? 0) > 0).map((k) => ({ k, n: Number(o[k]) })) })
</script>

<template>
  <div class="page-head">
    <h2>Candy</h2>
    <p>Time candy you hold and what it is worth. A candy credits its time to the screen you have selected, at the full rate of watching that screen.</p>
    <div class="tiles">
      <div class="tile"><b>{{ held.reduce((t, c) => t + c.count, 0) }}</b><span>candies</span></div>
      <div class="tile"><b>{{ Math.round(hours) }} h</b><span>of full-rate time</span></div>
      <div class="tile"><b>{{ away }}%</b><span>your away gains</span></div>
    </div>
  </div>
  <div class="tbl"><table class="list">
    <thead><tr><th>Candy</th><th class="num">Held</th><th class="num">Total time</th></tr></thead>
    <tbody>
      <tr v-for="c in held" :key="c.type"><td>{{ c.hours }} h candy</td><td class="num">{{ c.count }}</td><td class="num">{{ c.count * c.hours }} h</td></tr>
      <tr v-if="!held.length"><td colspan="3" class="m">No traced candy held.</td></tr>
      <tr v-for="u in untraced" :key="u.k"><td class="m">Type {{ u.k }} (duration not traced in the game code)</td><td class="num">{{ u.n }}</td><td class="num">—</td></tr>
    </tbody>
  </table></div>
  <h3>Best use for each candy</h3>
  <p class="m">Ranked by real time saved. Candy pays the watching rate, and with away gains at {{ away }}% an hour away already pays more than an hour watching, so on most screens a candy hour saves {{ (100 / Math.max(away, 1e-9)).toFixed(2) }} real hours. The candy counts only up to the milestone. Spelunking isn't in the candy menu (its 14 areas skip screen 22), so it can't take candy. What each milestone is worth to you isn't weighed.</p>
  <div class="tbl"><table class="list">
    <thead><tr><th>Candy</th><th class="num">Held</th><th>Best use</th><th class="num">That milestone needs</th><th class="num">Candy used</th><th class="num">Real time saved</th></tr></thead>
    <tbody>
      <tr v-for="u in uses" :key="u.hours" :class="{ m: !u.count }"><td>{{ u.hours }} h candy</td><td class="num">{{ u.count }}</td>
        <td>{{ u.best?.use ?? 'nothing to finish' }}</td><td class="num">{{ u.best ? fmtT(u.best.secs) : '—' }}</td><td class="num">{{ u.best ? Math.round(u.best.used * 100) + '%' : '—' }}</td><td class="num">{{ u.best ? fmtT(u.best.savedHours * 3600) : '—' }}</td></tr>
    </tbody>
  </table></div>
  <details><summary>All milestones a candy can finish ({{ goals.length }})</summary>
    <div class="tbl"><table class="list"><thead><tr><th>Milestone</th><th class="num">Full-rate time</th><th class="num">Real h per candy h</th></tr></thead>
      <tbody><tr v-for="g in goals" :key="g.use"><td>{{ g.use }}</td><td class="num">{{ fmtT(g.secs) }}</td><td class="num">{{ +g.rate.toFixed(2) }}</td></tr></tbody></table></div>
  </details>
  <h3>How candy pays</h3>
  <ul>
    <li>Using a candy sets the away time to 2, 4, 8, 24 or 72 h (+1 s) and credits it to the screen you have selected only (@14753950 to @14755282 †). Each screen needs its own candy.</li>
    <li>Checked in game on 2026-10-11 (Tilling, then Apothecary): candy time pays at the full rate of watching, not cut by the away-gain %. Candy on Tilling makes crops but does not advance the Apothecary brew bars; candy Tilling, then candy Apothecary, works.</li>
    <li v-if="away > 100">Your away gains are now {{ away }}%, so time away already pays {{ (away / 100).toFixed(1) }}× watching. If candy still pays only the watching rate, a candy hour is worth about {{ (100 / away).toFixed(2) }} h away, and candy is best kept for screens that don't earn while you're away (brew bars, timers). That 2026-10-11 check was at 30.5% away gains; re-check one candy at today's rate before relying on this.</li>
    <li>The Potions and Tilling pages pick the cheapest candy set for a goal from what you hold.</li>
  </ul>
</template>
