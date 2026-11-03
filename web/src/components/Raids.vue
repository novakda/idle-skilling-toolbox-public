<script setup lang="ts">
import { computed } from 'vue'
import { CLOSE, raids, TIERS, verdicts } from '../raids'
import Icon from './Icon.vue'
import { sectionRef } from '../section'
import GiftShop from './GiftShop.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const r = computed(() => (props.save ? raids(props.save) : null))
const v = computed(() => (props.save ? verdicts(props.save) : null))
const secs = (x: number) => !Number.isFinite(x) ? '∞' : x < 1 ? '<1 s' : x < 120 ? `${Math.round(x)} s` : mins(x)
const cls = (w: string) => w === 'win' ? 'st-good' : w === 'close' ? 'st-warn' : 'st-bad'
const yes = (u: boolean | null) => u == null ? 'unknown (cloud save)' : u ? 'unlocked' : 'locked'
const mins = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
const sh = (v: number) => !Number.isFinite(v) ? '∞' : v >= 1e6 ? v.toExponential(1).replace('e+', 'e') : Math.round(v).toLocaleString()
const cells = computed(() => (v.value && !('missing' in v.value) ? v.value.rows!.flatMap((row) => row.cells) : []))
const per = (ds: { hit: number; hits: number }[], k: 'hit' | 'hits') => ds.map((d) => sh(d[k])).join(' / ')
const SECTIONS = [['beat', 'Can you beat it?'], ['bosses', 'Bosses'], ['costs', 'Costs'], ['giftshop', 'Gift shop']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Raids</h2>
    <p>Can you beat each raid and Asylum boss on each difficulty, and how many runs your tickets buy.</p>
    <div v-if="r" class="tiles">
      <div class="tile"><b>{{ r.tickets.raid }}</b><span>raid tickets (next in {{ mins(r.nextRaidTicketIn) }})</span></div>
      <div class="tile"><b>{{ r.tickets.asylum }}</b><span>Asylum tickets</span></div>
      <div class="tile"><b :class="{ 'st-good': cells.length && cells.every((c) => c.verdict === 'win') }">{{ cells.length ? `${cells.filter((c) => c.verdict === 'win').length}/${cells.length}` : '—' }}</b><span>fights you win</span></div>
      <div class="tile"><b :class="{ 'st-bad': cells.some((c) => c.verdict === 'no') }">{{ cells.length ? cells.filter((c) => c.verdict === 'no').length : '—' }}</b><span>fights you lose</span></div>
    </div>
  </div>
  <template v-if="r">
    <p v-if="r.localOnlyMissing" class="warn">Only a Steam Cloud save is loaded: raid and Asylum boss unlocks are local-only and not in it, so they show as unknown.
      Load the local save (all .log/.ldb files), or check a local-only backup (About tab). After a cloud restore the game shows only the first boss until they're re-earned.</p>
    <p class="facts"><span><b>Raid tickets</b> ~{{ r.raidTicketsPerHour.toFixed(2) }}/h †</span></p>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'costs'">
    <div class="sec-head"><h3>Costs</h3><span class="m">tickets per run and runs you can afford</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Mode</th><th>Difficulty</th><th class="num">Tickets taken †</th><th class="num">Difficulty multiplier †</th><th class="num">Run time †</th><th class="num">Runs you can afford</th></tr></thead>
      <tbody>
        <tr v-for="t in TIERS.raid.tiers" :key="'r' + t[0]"><td>Raid</td><td>{{ t[0] }}</td><td class="num">{{ t[2] }}</td><td class="num">×{{ t[1] }}</td><td class="num">{{ t[3] }} min</td><td class="num">{{ Math.floor(r.tickets.raid / t[2]) }}</td></tr>
        <tr v-for="t in TIERS.asylum.tiers" :key="'a' + t[0]"><td>Asylum</td><td>{{ t[0] || 'base' }}</td><td class="num">{{ t[2] }}</td><td class="num">×{{ t[1] }}</td><td class="num">{{ t[3] }} min</td><td class="num">{{ Math.floor(r.tickets.asylum / t[2]) }}</td></tr>
      </tbody>
    </table></div>
    <p class="note">The Asylum ticket timer isn't traced.</p>
    <details class="how"><summary>How tickets and multipliers work</summary>
    <p>The multiplier column is the game's TicketsToSpend value; the fight scenes scale the boss's hit by it (Bosses tab). Asylum Y and Z take half and a third of it in tickets (7 and 15). Raid tickets: 1 per 2 h, minus 7% per level of mastery perk 80, with a 5%-per-level chance of 2 from ascension perk 17.</p>
    </details>
    </template>

    <template v-else-if="sec === 'bosses'">
    <div class="sec-head"><h3>Bosses</h3><span class="m">unlocks, the boss's hit, and how many hits kill you</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Mode</th><th>Boss</th><th>Status</th><th>Unlocked by</th><th>Previous boss, best beaten †</th><th class="num">Kills</th><th class="num">Hit, by difficulty †</th><th class="num">Hits to kill you</th></tr></thead>
      <tbody>
        <tr v-for="b in r.bosses" :key="b.type + b.name"><td>{{ b.type === 'raid' ? 'Raid' : 'Asylum' }}</td><td><Icon kind="boss" :name="b.name" /></td>
          <td :class="{ muted: b.unlocked == null }">{{ b.key ? yes(b.unlocked) : 'always open' }}</td><td>{{ b.needs ?? '' }}</td><td>{{ b.prevBest ?? '' }}</td><td class="num">{{ b.kills ?? '' }}</td>
          <td class="num">{{ per(b.damage, 'hit') }}</td><td class="num">{{ per(b.damage, 'hits') }}</td></tr>
      </tbody>
    </table></div>
    <p class="note">Hits to kill you counts no healing, and boss specials that raise one hit aren't counted.</p>
    <details class="how"><summary>How unlocks are read</summary>
    <p>Each boss unlocks the first time you beat the one before it, on any difficulty (the win handler sets the flag; the wiki says the same for raids). "Best beaten" is RaidBossKilled, the highest difficulty won on that boss.</p>
    </details>
    <details class="how"><summary>How the hit and hits to kill you are worked out</summary>
    <p>Hit = the boss's MonstersDamage, which each fight scene rewrites every frame: raids base × multiplier (King 2500, Entertainer 1250,
      Sentinel 12K, Demon 100K), Asylum base × multiplier^1.8 (200K, 600K, 5M, Gorshank 80M) †. Shown with skill 16 off (on, every hit is ×5) and the Demon
      and Gorshank in phase 1 (phase 2: Demon ×0.5, Gorshank 200M base). At Z the Asylum bell multiplies the hit by 5.06 per ring (1.5⁴); shown at the bell
      the fight starts with (your best, AsylumBellBEST). With a bell rung, Gorshank Z's hit multiplies again every frame in the game code, so it shows ∞.
      Hits to kill you: your HP at the start of the fight ({{ sh(r.startHP) }}, the fight scenes' own HP formula) plus your shield ({{ r.shieldPct }}% of it),
      each hit reduced by your damage reduction ({{ (100 * r.reduction).toFixed(1) }}%), with no healing. Boss specials that raise one hit, or Gorshank's
      phase-2 attack that keeps raising it, aren't counted. Conquest damage is ported too (#32) but has no page.</p>
    </details>
    </template>

    <template v-else-if="sec === 'giftshop'"><GiftShop :save="save" embedded /></template>

    <template v-else>
    <div class="sec-head"><h3>Can you beat it?</h3><span class="m">every raid and Asylum boss on every difficulty</span></div>
    <p v-if="v && 'missing' in v" class="warn">Not computable from this save: {{ v.missing }}{{ /Pbonus|Tank/.test(String(v.missing)) ? ' (load-time values a Steam Cloud save doesn\'t carry; load the local save)' : '' }}.</p>
    <template v-else-if="v">
      <div class="tbl"><table class="list">
        <thead><tr><th>Mode</th><th>Boss</th><th v-for="i in 4" :key="i">{{ ['Daydream / base', 'Chaotic / X', 'Nightmare / Y', 'Z'][i - 1] }}</th></tr></thead>
        <tbody>
          <tr v-for="row in v.rows" :key="row.type + row.name"><td>{{ row.type === 'raid' ? 'Raid' : 'Asylum' }}</td><td><Icon kind="boss" :name="row.name" /></td>
            <td v-for="c in row.cells" :key="c.difficulty" :class="cls(c.verdict)" :title="`kill ${secs(c.ttk)} · time limit ${secs(c.limit)} · you die at ${secs(c.die)}`">
              <b>{{ c.verdict }}</b> {{ secs(c.ttk) }} / {{ secs(Math.min(c.limit, c.die)) }}{{ c.die < c.limit ? ' ☠' : '' }}</td>
            <td v-for="i in 4 - row.cells.length" :key="'none' + i" class="muted">—</td></tr>
        </tbody>
      </table></div>
      <p class="note">Each cell: expected time to kill / the deadline (the run's time limit, or ☠ when the boss's hits kill you first). Win = kill with
        {{ 100 * CLOSE }}% of the deadline to spare; close = within {{ 100 * CLOSE }}% either side; no = later.</p>
      <details class="how"><summary>How time to kill is worked out</summary>
      <p>Raids and the Asylum have no auto-attack,
        so the model casts every damage skill you own ({{ v.skills.join(', ') }}) the moment its cooldown ends (one cooldown point = {{ v.cdSec.toFixed(2) }} s for
        you) and averages the dice: hit chance from the boss's attack requirement, crit chance × crit damage, and the low-damage random roll. Your
        hit is GetPlayerDPS ÷ difficulty ({{ sh(v.base) }} before that), with the deck linked to Boss Looting; Asylum hits also shrink while the boss's block
        wears off (×70/(3·block+70)). Boss HP and run length (minutes·60 + 1 s) are from the fight scenes; the Sentinel is immune half the time.</p>
      </details>
      <p class="note">Not counted: buff skills (crit, HP, rage, haste, the windup freeze), the Banana, Icicle and Leech skills (their damage depends on where
        they fly), bell rings during a fight (Z is shown at your best bell), and boss specials in raids. A raid's first-hit timing and the Sentinel's 5 s
        on/off window are taken from the fight start.</p>
      <p class="note"><b>Asylum survival</b> (when ☠ is the deadline) is <b>unverified against live fights</b> except one: Scallius Z with Mark on, a death in game on 2026-10-11, is a death here.</p>
      <details class="how"><summary>How Asylum survival is worked out</summary>
      <p>† Each boss throws a volley every attack cycle (Emigdala 2 s at base to 0.12 s at Z,
        the others 2.3-3.5 s at base to 0.74-1.1 s at Z), plus random extra volleys; every projectile hits you (you never move), for a multiple of the boss's hit
        (Scallius's volley of up to 7 projectiles, 7-40× each, 1 cycle in 3) and some also take flat shield points (Emigdala's laser, Scallius's hovering orbs,
        Occulon's 31, Gorshank's 36). Shield first (no carry-over), then HP. Gorshank enrages in phase 2 (×(1.4 + T/20) every 0.6 s) and at Z its
        37 drops you to 1 HP. You get back: food (shield points from <span title="smithing items 67 and 75">Cyber F Series and Cyber J Series</span> while HP is full, flat HP otherwise), the shield recharge,
        and the heal skill (¼ of max HP a second for 5 s, cast whenever HP is down). Random volleys are averaged, so a real run can die sooner or
        later; projectile flight times are estimates, the Seal skill (once per Conquest reset), Leech heals and Gorshank's 38 healing the boss
        aren't counted.</p>
      </details>
    </template>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>† = read from the game code (Qno2x.js). Boss and difficulty names are the wiki's.</p>
    </details>
  </template>
  <p v-else class="muted">Load a save.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.warn { border-left: 3px solid var(--bad); padding: 6px 10px; background: var(--panel); }
</style>
