<script setup lang="ts">
import { computed } from 'vue'
import { crypt, RES, TRANSITION } from './crypt'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const c = computed(() => (props.save ? crypt(props.save) : null))
const sim = computed(() => (c.value && 'sim' in c.value ? c.value : null))
const sh = (v: number) => !Number.isFinite(v) ? '∞' : v >= 1e6 ? v.toExponential(2).replace('e+', 'e') : v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()
const dur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
const t = (x: number | null | undefined) => (x == null ? '—' : `${x.toFixed(1)} s`)
</script>

<template>
  <div class="page-head">
    <h2>Crypt</h2>
    <p>The daily 60-second Crypt run: how far your skills get you through its 67 monsters, and what the kills drop.</p>
    <div v-if="c" class="tiles">
      <div class="tile"><b :class="!c.unlocked ? 'st-bad' : c.inRun ? 'st-warn' : c.wait > 0 ? '' : 'st-good'">{{ !c.unlocked ? 'locked' : c.inRun ? `in run, ${c.timeLeft} s left` : c.wait > 0 ? dur(c.wait) : 'ready' }}</b><span>{{ !c.unlocked ? 'unlock The Bog first' : c.wait > 0 && !c.inRun ? 'until the next run' : 'daily run' }}</span></div>
      <template v-if="sim">
        <div class="tile"><b>{{ sim.sim.kills }}</b><span>kills per run (expected)</span></div>
        <div class="tile"><b>{{ sim.sim.rows[sim.sim.furthest]!.name }}</b><span>furthest monster (level {{ sim.sim.furthest }})</span></div>
        <div class="tile"><b>{{ sh(sim.drops.gems) }}</b><span>gems per run</span></div>
        <div class="tile"><b>{{ sh(sim.drops.keys) }}</b><span>Asylum keys per run</span></div>
        <div class="tile"><b>{{ sh(sim.drops.balls) }}</b><span>pachinko balls per run</span></div>
      </template>
    </div>
  </div>
  <template v-if="c">
    <p v-if="'missing' in c" class="warn">Not computable from this save: {{ c.missing }} (load-time values a Steam Cloud save doesn't carry; load the local save).</p>
    <template v-if="sim">
      <div class="sec-head"><h3>Run plan</h3><span class="m">what you can and can't choose</span></div>
      <ul class="plan">
        <li><b>You can't sit on a monster.</b> Every kill moves you to the next one (up to the last, level 66), and the level arrows are off in the Crypt. Every kill drops the same, whichever monster it is (only gold grows, ×1.22 a level), so the only thing that matters is how many kills you fit in 60 s. More kills give more of everything. No monster favours one resource over another.</li>
        <li><b>Cast your skills.</b> The Crypt has no auto-attack. Only skills do damage ({{ sim.skills.join(', ') }}), cast as each cooldown ends (or by autocast). The monsters never hit you.</li>
        <li><b>Mark (skill 16) is {{ sim.mark ? 'on' : 'off' }}.</b> It makes Crypt monsters 5× tougher. {{ sim.mark ? 'Off' : 'On' }}: {{ sim.toggled.kills }} kills, reaching level {{ sim.toggled.furthest }} (now {{ sim.sim.kills }}, level {{ sim.sim.furthest }}).{{ sim.mark && sim.toggled.kills > sim.sim.kills ? ' Turn it off before you enter.' : '' }}</li>
        <li v-if="sim.gold != null"><b>Gold</b> per kill is the gold of the zone-type-2 monster you were fighting just before you entered (now {{ sh(sim.gold0!) }}, {{ sim.from!.m }}-{{ sim.from!.L }}) × 1.22<sup>level+1</sup>. Enter from your best-gold monster. ≈{{ sh(sim.gold) }} gold this run.</li>
        <li><b>The Vault shares the timer.</b> Entering the Crypt sets it to 24 h, which locks the Vault too. Entering the Vault sets it to 1 h, which locks the Crypt. The 25-gem skip only works while under 1 h is left.</li>
      </ul>

      <div class="sec-head"><h3>Drops per run</h3><span class="m">expected, for {{ sim.sim.kills }} kills</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Drop</th><th class="num">Per run</th></tr></thead>
        <tbody><tr v-for="[k, label] in RES" :key="k"><td>{{ label }}</td><td class="num">{{ sh(sim.drops[k]) }}</td></tr></tbody>
      </table></div>
      <p class="note">Rare rolls this run: {{ sh(sim.rares) }} (pity step {{ sim.step.toFixed(3) }} a kill, starting at {{ sh(sim.pity) }}). Candy coupons come only from the rare ladder (1 rare roll in 100).</p>
      <details class="how"><summary>How drops work</summary>
      <p>Every kill rolls 1-1000: 650-874 gives a pachinko drop (+3 balls), 875-924 one gem, 925-1000 two gems. A pity counter also climbs by
        0.9 × (1 + 2% per pet-capsule level 75 + 3% per level of card 179, capped at ×1.15) every kill. When 10 × the counter is at least that same roll,
        the counter resets and a second roll picks a rare drop: 4 keys (20%), 10 gems (17%), 5×3 balls (15%), 2 h candy (12%), 13×3 balls (10%), 10 keys (6%),
        1 key (5%), and smaller chances of candy (4 h to 72 h), AP and BP coupons, 3 balls, or a candy coupon (1%). No cards drop. The expectation is
        exact over the counter's states. A drop that spawns in the run's last ~1.6 s may not be collected; that isn't modelled.</p>
      </details>

      <div class="sec-head"><h3>Monsters</h3><span class="m">HP and when you reach and kill each one</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th class="num">Lv</th><th>Monster</th><th class="num">HP</th><th class="num">Reached</th><th class="num">Killed</th><th class="num">Skill hits</th></tr></thead>
        <tbody>
          <tr v-for="r in sim.sim.rows" :key="r.L" :class="{ muted: r.reachedAt == null }"><td class="num">{{ r.L }}</td><td>{{ r.name }}</td><td class="num">{{ sh(r.hp) }}</td>
            <td class="num">{{ t(r.reachedAt) }}</td><td class="num">{{ r.kills.length > 1 ? `${r.kills.length}×` : t(r.kills[0]) }}</td><td class="num">{{ r.reachedAt == null ? '' : r.hits }}</td></tr>
        </tbody>
      </table></div>
      <p class="note">Your average skill hit before the skill's own multiplier is {{ sh(sim.sim.hitAvg) }} (Fighting-deck DPS × average crit). Mastery tasks:
        <span v-for="k in sim.tasks" :key="k.label" :class="k.done ? 'st-good' : ''">{{ k.label }} (level {{ k.L }}) {{ k.done ? 'done' : 'not yet' }} · </span></p>
      <details class="how"><summary>How the run is worked out</summary>
      <p>Crypt HP is the zone-type-2 monster formula at zone 20, ÷ (1 + 10<sup>92</sup>) × 25<sup>1.2·(level+1)</sup>, ×5 with Mark. The wiki's HP table matches the mantissas but uses different suffixes.
        Damage uses the Raids page's skill model on the Fighting deck: every damage skill you own is cast at the start and again the moment its cooldown
        ends ({{ sim.cdSec.toFixed(2) }} s per cooldown point). Each hit is your fight DPS × the skill's multiplier × average crit, and always lands (the Crypt's
        hit requirement is 0). Damage left over after a kill is lost, and so is every hit in the {{ TRANSITION }} s change to the next monster. The run
        ends at 61 s: the 60 s timer ticks once a second, and at 0 the next tick ends the run on the Singularity screen.
        Not modelled: buff skills, autocast's random picks, skills still on cooldown when you enter, and the Banana, Icicle and Leech skills.</p>
      </details>
    </template>
  </template>
</template>
