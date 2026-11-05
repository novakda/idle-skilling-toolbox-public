<script setup lang="ts">
import { computed } from 'vue'
import { asylum, asylumDecks } from './asylum'
import { CLOSE, TIERS } from '../raids/raids'
import shrineTable from '../../data/shrines.json'
import Icon from '../../components/Icon.vue'
import Shrines from './Shrines.vue'
import { SECTION_ALIASES, sectionRef } from '../../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const a = computed(() => (props.save ? asylum(props.save, Date.now() / 1000) : null))
const top = computed(() => a.value?.plan[0] ?? null)
// ponytail: reruns asylum() once per owned deck (~0.6 s for 2 decks); memoise per save if it shows up on page loads.
const decks = computed(() => (props.save ? asylumDecks(props.save) : null))
const locked = computed(() => a.value?.bosses.find((b) => b.unlocked === false) ?? null)
// Shrines each trace pays for (cost1 = a boss trace, cost2 = a skill trace; currency slot = trace index + 1).
const usedBy = (i: number) => shrineTable.shrines.filter((s) => s.levels[0]!.cur1 === i + 2 || s.levels[0]!.cur2 === i + 2).map((s) => s.name).join(', ')

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}`
}
const secs = (x: number) => !Number.isFinite(x) ? '∞' : x < 1 ? '<1 s' : x < 120 ? `${Math.round(x)} s` : `${Math.floor(x / 60)}m ${Math.round(x % 60)}s`
const cls = (w: string) => w === 'win' ? 'st-good' : w === 'close' ? 'st-warn' : 'st-bad'
// A run harder than the boss's best beaten (RaidBossKilled stores the difficulty's T): the verdict is the damage race only.
const untested = (r: { boss: number; T: number }) => r.T > (a.value?.bosses[r.boss]?.bestT ?? 0)
const hrs = (x: number) => (x < 3600 ? `${Math.ceil(x / 60)}m` : x < 172800 ? `${+(x / 3600).toFixed(1)}h` : `${+(x / 86400).toFixed(1)}d`)
const run = (r: { name: string; difficulty: string; mark: number }) => `${r.name} ${r.difficulty}${r.mark ? ', Mark on' : ''}`
// Can you beat it (Raids page grid): one row per boss and Mark setting, one cell per difficulty.
const grid = computed(() => {
  const rows = new Map<string, { name: string; mark: number; cells: NonNullable<typeof a.value>['runs'] }>()
  for (const r of a.value?.runs ?? []) {
    const k = `${r.boss}-${r.mark}`
    if (!rows.has(k)) rows.set(k, { name: r.name, mark: r.mark, cells: [] })
    rows.get(k)!.cells.push(r)
  }
  return [...rows.values()]
})
// The Little Guy (Asylum actor 118, LittleGuyProgression 0..5): shows him each resource in turn; nothing is taken.
// Thresholds are the game's strict `>` checks (Qno2x.js); step 5 drops MiscDropID 3 and unlocks Vamp (skill 15, key 5).
const LITTLE_GUY = [
  { what: 'Tilling traces', key: 'AsylumTracesOwned', i: 9, over: 9000 },
  { what: 'Warpium (ore 17)', key: 'OresOwned', i: 17, over: 1e9 },
  { what: 'Fyrelings (flower 13)', key: 'flowersOwned', i: 13, over: 8e6 },
  { what: 'Spare orange star cards (kept)', key: 'CardsOwnedbyTypeEXCESS', i: 5, over: 4 },
  { what: 'Botany traces', key: 'AsylumTracesOwned', i: 8, over: 3e6 },
]
const littleGuy = computed(() => {
  if (!props.save) return null
  const done = Number(props.save.LittleGuyProgression) || 0
  return { done, steps: LITTLE_GUY.map((s, k) => {
    const held = Number((props.save![s.key] as number[] | undefined)?.[s.i]) || 0
    return { ...s, need: s.over + 1, held, state: k < done ? 'done' : k === done ? (held > s.over ? 'ready' : 'now') : 'later' }
  }) }
})
// Z rows' per-bell breakdown (asylum.ts bellRow), shown up to one past the farm bell / best bell / highest win.
const bellRows = computed(() => (a.value?.runs ?? []).filter((r) => r.bells).map((r) => ({
  ...r, shown: r.bells!.slice(0, Math.min(Math.max(r.farm ?? -1, r.bell, r.maxBell ?? -1) + 2, r.bells!.length)),
})))
const SECTIONS = [['plan', 'Plan'], ['beat', 'Can you beat it?'], ['runs', 'Every run'], ['bosses', 'Bosses'], ['keys', 'Keys'], ['traces', 'Traces'], ['shrines', 'Asylum shrines'], ['littleguy', 'Little Guy']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id), SECTION_ALIASES.asylum)
</script>

<template>
  <div class="page-head">
    <h2>Asylum</h2>
    <p>Your keys and traces, which bosses you can beat, and which run to spend keys on next.</p>
    <div v-if="a" class="tiles">
      <div class="tile"><b>{{ fmt(a.keys.held) }}</b><span>keys{{ a.keys.waiting ? ` (+${fmt(a.keys.waiting)} waiting on the Asylum screen)` : '' }}, next in {{ secs(a.keys.nextIn) }}</span></div>
      <div class="tile"><b>{{ fmt(a.keys.perDay) }}</b><span>keys a day</span></div>
      <div class="tile"><b>{{ a.bosses.filter((b) => b.unlocked !== false).length }}/4</b><span>bosses open</span></div>
      <div class="tile"><b>{{ top ? fmt(top.perKey) : '—' }}</b><span>{{ top ? `${top.name} traces per key, ${run(top)}` : 'no winning run' }}</span></div>
    </div>
  </div>
  <p v-if="!a" class="note">Load a save to see the Asylum.</p>
  <template v-else>
    <p v-if="a.missing" class="warn">Fights not computable from this save: {{ a.missing }} (load-time values a Steam Cloud save doesn't carry; load the local save).</p>

    <h3>Do this next</h3>
    <ul class="do">
      <li v-if="top"><b>{{ run(top) }}</b>: about {{ fmt(top.perRun) }} {{ top.name }} traces a win ({{ fmt(top.perKey) }} per key);
        {{ top.short > 0 ? `${top.runs} run${top.runs > 1 ? 's' : ''} (${top.taken * top.runs} keys) buy` : 'you already hold enough for' }}
        {{ top.shrine }} level {{ top.shrineLv }}{{ top.skillShort > 0 ? `, which also needs ${fmt(top.skillShort)} more ${top.skillTrace} traces (they drop from the skill itself, not the Asylum)` : '' }}.
        <template v-if="a.keys.held < top.taken"> You have {{ fmt(a.keys.held) }} keys; it takes {{ top.taken }}.</template>
        <span v-if="untested(top)" class="note">Harder than you've beaten on {{ top.name }}: the survival model averages the dice and isn't checked against a live win here. Try one run before spending keys on it.</span></li>
      <li v-if="a.tryNext.length">Worth trying once (harder than you've beaten; you should kill the boss before the time limit and before it kills you, on averaged dice):
        <ul><li v-for="(t, i) in a.tryNext.slice(0, 4)" :key="i">{{ run(t) }}</li></ul></li>
      <li v-if="locked"><b>{{ locked.name }} is locked</b>: {{ locked.needs }}.</li>
      <li v-if="!top && !a.missing">No Asylum fight is a clear win yet; see the table below for the closest.</li>
    </ul>

    <p v-if="decks" class="facts"><span><b>Tinker deck</b> {{ decks.fights }}
      {{ decks.linked ? '(linked to Boss Looting)' : '(none linked to Boss Looting, so the deck you have on when you enter)' }}</span></p>
    <p v-if="decks?.differ.length" class="note">Another deck changes these verdicts:
      <template v-for="(x, i) in decks.differ" :key="i">{{ i ? '; ' : '' }}{{ run(x) }} ({{ x.verdicts.map((v, d) => `deck ${d + 1} ${v}`).join(', ') }})</template>.
      Survival model only; switch decks or link one to Boss Looting before entering.</p>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <h3>Plan, step by step</h3>
    <div v-if="a.plan.length" class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Run</th><th class="num">Runs</th><th>Buys</th><th class="num">Keys</th><th class="num">Keys so far</th><th>Ready in</th></tr></thead>
      <tbody><tr v-for="(p, k) in a.plan" :key="p.boss">
        <td class="num">{{ k + 1 }}</td><td><b v-if="!k">{{ run(p) }}</b><template v-else>{{ run(p) }}</template><span v-if="untested(p)" class="muted"> untested (best beaten {{ a.bosses[p.boss]?.best }})</span></td>
        <td class="num">{{ p.short > 0 ? p.runs : 'none' }}</td><td>{{ p.shrine }} level {{ p.shrineLv }}</td>
        <td class="num">{{ p.spend ? fmt(p.spend) : '—' }}</td><td class="num">{{ p.spend ? fmt(p.keysSoFar) : '—' }}</td>
        <td>{{ !p.spend ? '—' : p.waitSec > 0 ? hrs(p.waitSec) : 'keys in hand' }}</td></tr></tbody>
    </table></div>
    <p class="note">Ranked by <b>keys to your next shrine level</b>, fewest first: per boss, the winning run with the most of that boss's traces
      per key spent (net of the keys a win can drop back), against the cheapest next shrine level paid in that trace. Shrine levels aren't
      weighed against each other. Keys so far add up the steps in order; "keys ready in" is real time at {{ fmt(a.keys.perDay) }} keys a day.</p>
    </template>
    <template v-else-if="sec === 'beat'">
    <div class="sec-head"><h3>Can you beat it?</h3><span class="m">every open boss on every difficulty{{ a.markLv ? ', Mark off and on' : '' }}</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Boss</th><th v-for="t in TIERS.asylum.tiers" :key="t[0]">{{ t[0] || 'base' }}</th></tr></thead>
      <tbody>
        <tr v-for="row in grid" :key="row.name + row.mark"><td><Icon kind="boss" :name="row.name" />{{ row.mark ? ', Mark on' : '' }}</td>
          <td v-for="c in row.cells" :key="c.T" :class="cls(c.verdict)" :title="`kill ${secs(c.ttk)} · time limit ${secs(c.limit)} · you die at ${secs(c.die)}`">
            <b>{{ c.verdict }}</b> {{ secs(c.ttk) }} / {{ secs(Math.min(c.limit, c.die)) }}{{ c.die < c.limit ? ' ☠' : '' }}<span v-if="untested(c)" class="muted"> *</span>
            <div v-if="c.maxBell != null" class="muted">{{ c.maxBell < 0 ? 'no bell wins' : `wins up to bell ${c.maxBell}` }} (best {{ c.bell }})</div></td></tr>
        <tr v-if="!grid.length"><td colspan="5" class="muted">No open boss to fight.</td></tr>
      </tbody>
    </table></div>
    <p class="note">Each cell: expected time to kill / the deadline (the run's time limit, or ☠ when the boss's hits kill you first). Win = kill with
      {{ 100 * CLOSE }}% of the deadline to spare; close = within {{ 100 * CLOSE }}% either side; no = later. * = harder than your best beaten on that boss.
      Z is at your best bell; the line under it is the highest bell that still wins. Same model as the Raids page; Checked against live fights: Scallius Z with Mark on was a death (2026-10-11); Occulon Z at bell 8, Mark off, was a win (2026-10-22).</p>
    <div class="sec-head"><h3>The bell at Z</h3><span class="m">each boss{{ a.markLv ? ' and Mark setting' : '' }}, bell by bell; open a row</span></div>
    <details v-for="z in bellRows" :key="`${z.boss}-${z.mark}`" class="bell">
      <summary><Icon kind="boss" :name="z.name" />{{ z.mark ? ', Mark on' : '' }}:
        <template v-if="z.farm != null"><b>farm bell {{ z.farm }}</b>{{ z.farm > z.bell ? ` (ring ${z.farm - z.bell}× from your best ${z.bell})` : ' (your best)' }},
          {{ fmt(z.bells![z.farm]!.perDay) }} traces a day</template>
        <span v-else class="st-bad">no winning bell from your best ({{ z.bell }}) up</span></summary>
      <div class="tbl"><table class="list nosort">
        <thead><tr><th class="num">Bell</th><th>Verdict</th><th class="num">Kill / deadline</th><th class="num">Traces a win</th><th class="num">Per key</th><th class="num">A day at your keys</th><th class="num">Per fight-hour</th></tr></thead>
        <tbody><tr v-for="b in z.shown" :key="b.bell" :class="{ muted: b.bell < z.bell }">
          <td class="num">{{ b.bell }}{{ b.bell === z.bell ? ' (best)' : '' }}</td>
          <td :class="cls(b.verdict)"><b>{{ b.verdict }}</b>{{ b.bell === z.farm ? ' · farm' : '' }}</td>
          <td class="num">{{ secs(b.ttk) }} / {{ secs(Math.min(z.limit, b.die)) }}{{ b.die < z.limit ? ' ☠' : '' }}</td>
          <td class="num">{{ fmt(b.perRun) }}</td><td class="num">{{ fmt(b.perKey) }}</td><td class="num">{{ fmt(b.perDay) }}</td><td class="num">{{ fmt(b.perFightHour) }}</td></tr></tbody>
      </table></div>
    </details>
    <p class="note">The bell only exists at Z †. A fight starts at your best bell (the bell of your last Z win); click it to ring it up a bell, to 11 at most,
      which wipes the damage dealt so far but not the timer, so ring it at the start. A win saves the bell it ended on as your new best, and only
      ascension or rebirth puts it back to 0: bells below your best (greyed) can't be picked. Each ring: boss HP ×5⁴, boss hits ×1.5⁴
      (Gorshank's keep multiplying, so any bell kills you there), traces ×1.23⁴ ≈ {{ (1.23 ** 4).toFixed(2) }}; the 15 keys, the time limit and the other
      drops stay the same. So <b>farm</b> = the highest bell that still wins from your best up: keys run out long before fight time does
      ({{ fmt(a.keys.perDay) }} keys a day), so traces per key decide it. Per fight-hour (a win's traces back to back with the 3 s entrance, keys banked) only matters if you're short of time, not keys;
      once the kill takes longer than the entrance it falls about {{ Math.round(625 / 1.23 ** 4) }}× a ring (HP ×625, traces ×2.29).</p>
    </template>
    <template v-else-if="sec === 'bosses'">
    <div class="sec-head"><h3>Bosses</h3><span class="m">unlocks, best beaten, traces held</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Boss</th><th>Status</th><th>Best beaten †</th><th class="num">Best bell</th><th class="num">Traces held</th></tr></thead>
      <tbody>
        <tr v-for="b in a.bosses" :key="b.name"><td><Icon kind="boss" :name="b.name" /></td>
          <td :class="{ muted: b.unlocked == null }">{{ b.unlocked == null ? 'unknown (cloud save)' : b.unlocked ? (b.needs ? 'unlocked' : 'always open') : `locked: ${b.needs}` }}</td>
          <td>{{ b.best ?? 'not yet' }}</td><td class="num">{{ b.bell }}</td><td class="num">{{ fmt(b.traces) }}</td></tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'runs'">
    <div class="sec-head"><h3>Every run</h3><span class="m">verdict and traces per key for each boss, difficulty and Mark</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Run</th><th class="num">Keys</th><th>Verdict</th><th class="num">Kill / time limit</th><th class="num">You die at</th><th class="num">Traces a win</th><th class="num">Keys back</th><th class="num">Traces per key</th></tr></thead>
      <tbody>
        <tr v-for="r in a.runs" :key="`${r.boss}${r.T}${r.mark}`"><td>{{ run(r) }}</td><td class="num">{{ r.taken }}</td>
          <td :class="cls(r.verdict)"><b>{{ r.verdict }}</b></td><td class="num">{{ secs(r.ttk) }} / {{ secs(r.limit) }}</td><td class="num">{{ Number.isFinite(r.die) ? `${secs(r.die)}${r.die < r.limit ? ' ☠' : ''}` : 'survive' }}</td>
          <td class="num">{{ fmt(r.perRun) }}</td><td class="num">{{ r.keysBack.toFixed(2) }}</td><td class="num">{{ fmt(r.perKey) }}</td></tr>
        <tr v-if="!a.runs.length"><td colspan="8" class="muted">No open boss to fight.</td></tr>
      </tbody>
    </table></div>
    <p class="note">Verdict (Raids page model, #35): win only if the expected kill lands before both the time limit and your death, with {{ 100 * CLOSE }}%
      to spare; close = within {{ 100 * CLOSE }}% either side. "You die at" = when the boss's projectile volleys break your shield and HP, net of food,
      shield recharge and the heal skill (survive = not within the time limit). Random volleys are averaged and some flight times are estimates
      (unverified); checked against one live fight: Scallius Z with Mark on was a death in game (2026-10-11) and is a ☠ loss here.</p>
    <details class="how"><summary>How Mark, the bell and traces a win are worked out</summary>
    <p>Mark (skill 16,
      level {{ a.markLv }}) multiplies boss HP (Emigdala ×5, the others ×7) and boss hits ×5 †, and the trace drops by 1 + 0.2 × its level †. Z is
      shown at your best bell (the fight starts there; "Can you beat it?" breaks Z down bell by bell and picks the one to farm).</p>
    <p>Traces a win †: a guaranteed T² × 0.4-1.6 (avg 1) of the boss's trace, × 1.23⁴ per bell ring, × your trace bonus^0.8
      ({{ a.extraBonus.toFixed(3) }}) × the <span title="smithing item 88">Sacrificial Altar</span> bonus; plus min(⌈T^0.8⌉, 20) rolls (1, 3, 9, 20) that each give a bonus trace drop
      (no trace bonus) about 30% of the time and a key about 4% of the time. T = 1, 3, 14, 45 for base, X, Y, Z. The other rolls (coupons, a gear piece,
      pachinko balls, sparkle coins) and the pet and card drops aren't counted.</p>
    </details>
    </template>

    <template v-else-if="sec === 'shrines'"><Shrines v-if="save" :save="save" embedded /></template>
    <template v-else-if="sec === 'littleguy' && littleGuy">
    <div class="sec-head"><h3>Little Guy</h3><span class="m">{{ littleGuy.done >= 5 ? 'done: Vamp unlocked' : `step ${littleGuy.done + 1} of 5` }}</span></div>
    <p class="note">The small creature right of Gorshank. Click him and he asks to see a resource; have more than he asks and he moves to the next.
      He only checks: nothing is taken, the star cards stay. After step 5 he drops a key that unlocks <b>Vamp</b> on the special skill bar (key 5):
      3 leeches that hit and heal you (shield first), 35 s cooldown, 7 s duration †. Using it once completes the mastery task "Use the vampire attack move".</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Show him</th><th class="num">Needs</th><th class="num">You have</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="(s, k) in littleGuy.steps" :key="k"><td class="num">{{ k + 1 }}</td><td>{{ s.what }}</td><td class="num">{{ fmt(s.need) }}</td><td class="num">{{ fmt(s.held) }}</td>
          <td :class="s.state === 'done' || s.state === 'ready' ? 'st-good' : s.state === 'now' ? 'st-warn' : ''">{{ s.state === 'done' ? 'done' : s.state === 'ready' ? 'ready: click him' : s.state === 'now' ? 'next' : 'later' }}</td></tr>
      </tbody>
    </table></div>
    <p class="note">Short on orange stars? The Cards screen swaps spares up one way (5 white → 1 green, 4 green → 1 blue, 3 blue → 1 purple, 2 purple → 1 orange).
      The wiki's older list asks 1,500 tilling traces for step 1; the current game code checks more than 9,000.</p>
    </template>
    <template v-else-if="sec === 'keys'">
    <div class="sec-head"><h3>Keys</h3><span class="m">{{ fmt(a.keys.perDay) }} a day</span></div>
    <p class="facts"><span><b>A key every</b> {{ secs(a.keys.interval) }} †</span><span><b>Keys per payout</b> {{ fmt(a.keys.each) }}</span>
      <span v-if="a.keys.double"><b>Doubled</b> {{ Math.round(100 * a.keys.double) }}% of the time</span></p>
    <p class="note">The timer counts while you're away: opening the Asylum screen adds the time since you last opened it †, and keys are paid out there.</p>
    </template>

    <template v-else>
    <div class="sec-head"><h3>Traces</h3><span class="m">held, where they drop, what they buy</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Trace</th><th class="num">Held</th><th>From</th><th>Spent on (shrines)</th></tr></thead>
      <tbody>
        <tr v-for="(t, i) in a.traces" :key="t.name"><td>{{ t.name }}</td><td class="num">{{ fmt(t.held) }}</td>
          <td>{{ t.boss ? 'winning this Asylum boss †' : `${t.name} (the skill) †` }}</td><td>{{ usedBy(i) }}</td></tr>
      </tbody>
    </table></div>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>† = read from the game code (Qno2x.js). Boss names are the wiki's.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.bell summary { cursor: pointer; padding: 4px 0; } .bell .tbl { margin: 4px 0 8px; }
.warn { border-left: 3px solid var(--bad); padding: 6px 10px; background: var(--panel); }
</style>
