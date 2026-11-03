<script setup lang="ts">
import { computed } from 'vue'
import { arcade, arcadeRank, PORTALS, SET_BONUS } from '../arcade'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const a = computed(() => (props.save ? arcade(props.save) : null))
const rank = computed(() => (a.value ? arcadeRank(a.value) : []))
const open = computed(() => a.value?.tasks.filter((t) => !t.done) ?? [])
const done = computed(() => a.value?.tasks.filter((t) => t.done).length ?? 0)
const mins = (s: number) => (s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`)
const f1 = (x: number) => x.toFixed(1)
</script>

<template>
  <div class="page-head">
    <h2>Arcade</h2>
    <p>Pachinko balls, the 3 task sets that speed them up, and what to spend golden balls on. † = from the game's code; unmarked = wiki.</p>
    <div v-if="a" class="tiles">
      <div class="tile"><b>{{ a.balls }}</b><span>balls in hand</span></div>
      <div class="tile"><b>{{ a.pending }}</b><span>balls waiting to collect{{ a.full ? ' (full)' : '' }} †</span></div>
      <div class="tile"><b>{{ f1(a.gold) }}</b><span>golden balls</span></div>
      <div class="tile"><b>{{ done }}/{{ a.tasks.length }}</b><span>tasks done</span></div>
    </div>
  </div>
  <template v-if="a">
    <h3>Ball income</h3>
    <p>A ball every <b>{{ mins(a.recharge) }}</b> †, so a full 8h bank is {{ Math.floor(28800 / a.recharge) }} balls †. Banked now {{ mins(a.banked) }}<template v-if="!a.full">, next ball in {{ mins(a.secsToNext) }}</template>. {{ a.launched }} balls launched in total †.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Ball-rate bonus †</th><th class="num">%</th><th>Made of</th></tr></thead>
      <tbody>
        <tr><td>Tasks</td><td class="num">{{ f1(a.rate.taskPct) }}</td><td>{{ a.rate.tasks[0] }} × {{ SET_BONUS[0] }} (set 1) + {{ a.rate.tasks[1] }} × {{ SET_BONUS[1] }} (set 2) + {{ a.rate.tasks[2] }} × {{ SET_BONUS[2] }} (set 3)</td></tr>
        <tr><td>Cards</td><td class="num">{{ f1(a.rate.cardPct) }}</td><td>Pachinko-ball card bonus, capped at 100</td></tr>
        <tr><td>Research tank 53</td><td class="num">{{ f1(a.rate.tankPct) }}</td><td>capped at 160</td></tr>
        <tr><td><b>Total</b></td><td class="num"><b>{{ f1(a.rate.pct) }}</b></td><td>2700 s ÷ (1 + total/100) per ball</td></tr>
      </tbody>
    </table></div>
    <p class="note">The wiki says 2 / 3 / 5% per task; the game's code gives 1.8 / 2.7 / 4.5, which matches your saved timer exactly. Buying balls: 100 for 275 gems (wiki) = 2.75 gems a ball; the wiki puts the gems a ball returns at about 0.46.</p>

    <h3>Golden-ball shop</h3>
    <p>You have {{ f1(a.gold) }} golden balls. Landings pay 1 / 3 / 5 / 15 / 50 / 200 by portal tier (wiki). Each % below is of a different income, so it ranks bang per golden ball, not which income matters more to you.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Upgrade</th><th>Per level</th><th class="num">Level †</th><th class="num">Next cost †</th><th class="num">Next level adds †</th><th class="num">Per golden ball</th><th class="num">Levels you can afford</th></tr></thead>
      <tbody>
        <tr v-for="u in a.upgrades" :key="u.idx" :class="{ dim: u.maxed }">
          <td>{{ u.name }}</td><td>{{ u.per }}</td><td class="num">{{ u.level }}/{{ u.max }}</td>
          <td class="num" :class="{ 'st-good': !u.maxed && u.cost <= a.gold }">{{ u.maxed ? '' : +u.cost.toFixed(2) }}</td>
          <td class="num">{{ u.gain !== undefined ? `+${(100 * u.gain).toFixed(2)}% of the total` : u.idx === 6 ? '+2 base BP' : '' }}</td>
          <td class="num">{{ u.gain !== undefined ? `${(100 * u.gain / u.cost).toFixed(3)}%` : '' }}</td>
          <td class="num">{{ u.canBuy || '' }}</td>
        </tr>
      </tbody>
    </table></div>
    <p v-if="rank.length">Best per golden ball right now: <b>{{ rank.map((u) => u.name).join(', then ') }}</b>. Rebirth counts as +2 on your base BP per rebirth. Every cost climbs a little each level, so the order shifts as you buy.</p>
    <p class="note">Damage assumes the game's ×(1 + 3·level/100) term at @2644383 is your damage multiplier; the code does not name it. Kills adds to a term holding your Ascension perk 65. Fall-event upgrades (levels 7, 8) only exist while the event runs{{ a.event ? ' (it is running)' : '' }}.</p>

    <div class="sec-head"><h3>Open tasks</h3><span class="m">{{ open.length }} left; each is a flag the game re-checks when it loads</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Set</th><th>Task †</th><th>Needs (wiki)</th><th class="num">Ball rate</th></tr></thead>
      <tbody>
        <tr v-for="t in open" :key="t.i"><td>{{ t.set }}</td><td>{{ t.name }}</td><td>{{ t.req }}</td><td class="num">+{{ SET_BONUS[t.set - 1] }}%</td></tr>
      </tbody>
    </table></div>
    <p class="note">Progress is done / not done only: the save stores a 0/1 flag per task, and the app does not recompute each task's condition. Done tasks: {{ a.tasks.filter((t) => t.done).map((t) => t.name).join(', ') || 'none' }}.</p>

    <h3>Portals (wiki)</h3>
    <div class="tbl"><table class="list">
      <thead><tr><th>Portal</th><th class="num">Golden balls</th><th>Where the ball ends up</th></tr></thead>
      <tbody><tr v-for="p in PORTALS" :key="p.name"><td>{{ p.name }}</td><td class="num">{{ p.gold }}</td><td>{{ p.rows }}</td></tr></tbody>
    </table></div>
    <p class="note">King's Ransom (1/27,814 a ball): 1500 gems and a ball cascade. Poker cards: a portal marked with the card icon gives one of 52 cards every 22h; 5 cards pay 5 to 10,000 gems by hand. Not read from the save: the landing counts and card cooldown are in it, but their layout is not decoded.</p>
  </template>
  <p v-else class="muted">Load a save.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; }
.muted, .m, .dim td:not([class*=st-]) { color: var(--muted); }
.tbl { max-width: 960px; }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
</style>
