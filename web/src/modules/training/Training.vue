<script setup lang="ts">
import { computed } from 'vue'
import { ARENAS, activeReps, arenaOf, awayReps, expPerRep, levelCost, options, rates, spend, speedCost, SPEED_MAX, toLevel, waterPerRep, type Arena } from './training'
import Icon from '../../components/Icon.vue'
import { candyFor, candyText } from '../candy/candy'
import { sectionRef } from '../../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const s = computed(() => props.save)
const at = (k: string, i: number) => n((s.value?.[k] as number[] | undefined)?.[i])
const lifterName = (i: number) => arenaOf(i).names[arenaOf(i).ids.indexOf(i)]!
const gold = computed(() => n(s.value?.goldcoin))
const away = computed(() => n(s.value?.nonActiveZoneGainPercent))
const screens = computed(() => (s.value ? ARENAS.map((a) => ({ a, r: rates(s.value!, a), left: toLevel(s.value!, a) })) : []))
// Time candy with one training screen selected: full-rate away credit, so the away rate without the away-% cut.
const awayFrac = computed(() => Math.max(Number(s.value?.nonActiveZoneGainPercent ?? 0) / 100, 1e-9))
const candy = computed(() => (s.value ? screens.value.map((x) => ({ x, c: candyFor(s.value!, x.left / Math.max(x.r.away / awayFrac.value, 1e-9)) })) : []))
const opts = computed(() => (s.value ? options(s.value) : []))
const top = computed(() => opts.value[0] ?? null)
const plan = computed(() => (s.value ? spend(s.value) : null))
const owned = (a: Arena) => a.ids.filter((i) => at('LifterLV', i) > 0)

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return i < units.length - 1 || x < 1e33 ? `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}` : x.toExponential(2)
}
const hrs = (h: number) => (!Number.isFinite(h) ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`)
const pct = (x: number) => `${+(100 * x).toPrecision(3)}%`
const modeText = (m: string) => (m === 'away' ? 'away' : 'on screen')
// Tabs: the ranking, then one per screen (id = the skill it trains).
const SECTIONS = [['ranked', 'Lifter levels ranked'], ['attack', 'Attack Dojo'], ['strength', 'Strength Mountain'], ['endurance', 'Endurance Fields']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Training</h2>
    <p>What Attack Dojo, Strength Mountain and Endurance Fields train, how fast, and which lifter level to buy next.</p>
    <div v-if="s" class="tiles">
      <div v-for="x in screens" :key="x.a.screen" class="tile">
        <b><Icon kind="skill" :id="x.a.lvl" :name="`${x.a.skill} ${n(s[x.a.lvl])}`" /></b>
        <span>{{ x.a.name }}: {{ fmt(x.r.best * 3600) }} EXP/h {{ modeText(x.r.mode) }}, next level in {{ hrs(x.left / Math.max(x.r.best, 1e-9) / 3600) }}</span>
      </div>
      <div class="tile"><b>{{ fmt(gold) }} gold</b><span>{{ top ? `next best level: ${lifterName(top.i)} ${top.L + 1}, ${fmt(top.cost)} gold` : 'no lifters yet' }}</span></div>
    </div>
  </div>
  <p v-if="!s" class="note">Load a save to see Training.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="top"><b>Buy {{ lifterName(top.i) }} level {{ top.L + 1 }}</b> ({{ arenaOf(top.i).name }}) for {{ fmt(top.cost) }} gold:
        +{{ pct(top.pct) }} {{ arenaOf(top.i).skill }} EXP/h, the most per gold of any lifter.
        <template v-if="plan && plan.bought.size">Your {{ fmt(gold) }} gold would buy {{ [...plan.bought.values()].reduce((t, k) => t + k, 0) }} lifter levels in this order
          ({{ fmt(gold - plan.left) }} gold): {{ ARENAS.map((a) => `${a.skill} +${pct(plan!.gain.get(a.screen) ?? 0)}`).join(', ') }} EXP/h.
          Gold has other uses; this is only what it is worth here.</template></li>
    </ol>
    <div class="tbl"><table class="list">
      <thead><tr><th>Screen</th><th>Do</th><th class="num">On screen EXP/h</th><th class="num">Away EXP/h</th><th class="num">Candy to next level</th><th>Candy needed</th></tr></thead>
      <tbody><tr v-for="y in candy" :key="y.x.a.screen"><td>{{ y.x.a.name }}</td><td>{{ y.x.r.mode === 'away' ? 'leave it and come back' : 'stay on it' }}</td>
        <td class="num">{{ fmt(y.x.r.active * 3600) }}</td><td class="num">{{ fmt(y.x.r.away * 3600) }}</td><td class="num">{{ hrs(y.c.secs / 3600) }}</td>
        <td>{{ y.c.best ? candyText(y.c.best.pick) : 'not enough held' }}</td></tr></tbody>
    </table></div>
    <p class="note">Away is at your {{ away }}% away gains. Time candy: select the screen first; it runs at full rate, not your away %.
      Full-rate candy is checked on Tilling and Apothecary; on training screens it's assumed the same.</p>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'ranked'">
    <div class="sec-head"><h3>Lifter levels ranked</h3><span class="m">% more of the screen's skill EXP per hour, per gold</span></div>
    <p class="note">Across screens this weighs +1% Attack the same as +1% Strength or Endurance.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Ranked by <b>% more of the screen's skill EXP per hour, per gold</b>, at the rate the screen pays most in (on screen or away).
      A level adds EXP per rep only; speed levels stop at
      {{ SPEED_MAX }}. The buy button repeats per click with the multi-purchase toggle.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Lifter</th><th>Screen</th><th class="num">Next level</th><th class="num">Gold</th><th class="num">+EXP/h</th><th class="num">Levels the gold buys</th></tr></thead>
      <tbody>
        <tr v-for="o in opts" :key="o.i">
          <td>{{ lifterName(o.i) }}</td><td>{{ arenaOf(o.i).name }}</td><td class="num">{{ o.L + 1 }}</td>
          <td class="num" :class="o.cost <= gold ? '' : 'st-bad'">{{ fmt(o.cost) }}</td><td class="num">{{ pct(o.pct) }}</td>
          <td class="num">{{ plan?.bought.get(o.i) ?? 0 }}</td>
        </tr>
        <tr v-if="!opts.length"><td colspan="6" class="muted">No lifters on these screens yet.</td></tr>
      </tbody>
    </table></div>

    </template>

    <template v-for="x in screens" :key="'s' + x.a.screen">
      <template v-if="sec === x.a.skill.toLowerCase()">
      <div class="sec-head"><h3>{{ x.a.name }}</h3><span class="m">trains <Icon kind="skill" :id="x.a.lvl" :name="x.a.skill" /></span></div>
      <p class="facts"><span><b>{{ x.a.skill }} level</b> {{ n(s[x.a.lvl]) }}: {{ fmt(n(s[x.a.exp])) }} EXP, {{ fmt(x.left) }} to go (requirement {{ fmt(n(s[x.a.req])) }}
        less the gift-shop cut)</span><span><b>On screen</b> {{ fmt(x.r.active * 3600) }} EXP/h and {{ fmt(x.r.water.active * 3600) }} water EXP/h</span>
        <span><b>Away</b> {{ fmt(x.r.away * 3600) }} and {{ fmt(x.r.water.away * 3600) }}/h</span><span><b>Potion bonus</b> {{ fmt(n(s[x.a.pbonus])) }}% (on screen only)</span></p>
      <div class="tbl"><table class="list">
        <thead><tr><th>Lifter</th><th class="num">Level</th><th class="num">Speed</th><th class="num">EXP/rep</th><th class="num">Water/rep</th>
          <th class="num">Reps/s on screen</th><th class="num">Reps/s away</th><th class="num">Next level</th><th class="num">Next speed</th></tr></thead>
        <tbody>
          <tr v-for="(i, k) in x.a.ids" :key="i" :class="{ dim: !at('LifterLV', i) }">
            <td>{{ x.a.names[k] }}</td>
            <template v-if="at('LifterLV', i)">
              <td class="num">{{ at('LifterLV', i) }}</td><td class="num">{{ at('LifterLV2', i) }} / {{ SPEED_MAX }}</td>
              <td class="num">{{ fmt(expPerRep(s, i)) }}</td><td class="num">{{ fmt(waterPerRep(s, i)) }}</td>
              <td class="num">{{ fmt(activeReps(s, i)) }}</td><td class="num">{{ fmt(awayReps(s, i) * away / 100) }}</td>
              <td class="num">{{ fmt(levelCost(i, at('LifterLV', i))) }}</td>
              <td class="num">{{ at('LifterLV2', i) >= SPEED_MAX ? 'max' : fmt(speedCost(i, at('LifterLV2', i))) }}</td>
            </template>
            <td v-else colspan="8" class="muted">not hired ({{ owned(x.a).length }} of 5 hired)</td>
          </tr>
        </tbody>
      </table></div>
      </template>
    </template>

    <details class="how"><summary>How the rates are worked out, and sources</summary>
    <p>Computed from your save; formulas from the game's code (Qno2x.js offsets in web/src/training.ts), checked in
      training.test.ts by running the game's own rep, buy, away and level-up code. On screen a lifter moves at most 60 frames a second
      (the game advances one frame per draw), so speed past that cap only helps away. Every lifter here rolls against your Strength
      chance on screen, whatever it trains (a game quirk); away credit uses the screen's own skill chance, with no 1000 cap and no potion
      bonus, and the Endurance Fields away credit counts frames per rep with Strength Mountain's numbers. Away rates are per real second
      at your away-gains %. A level-up on a skill's own screen sets the requirement to 1.222× plus a little; the other two skills level
      with 1.2× there. Not covered: the main-screen gym lifters, the hire button's cost (it also needs an H2O level), and what H2O levels unlock.
      Lifter icons: none mapped; skill icons are the game's.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); font-size: 12px; font-weight: normal; }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
tr.dim td { opacity: .7; }
</style>
