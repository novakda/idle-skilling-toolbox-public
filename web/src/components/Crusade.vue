<script setup lang="ts">
import { computed } from 'vue'
import { withDeckLinks } from '../cards-calc'
import { brokenMaterials, CLOSE, CRUSADES, daysTo, HORIZON, materialName, perVictory, placement, SPECIALS, totalCrusaders, verdicts, withCrusade } from '../crusade'
import Icon from './Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (k: string) => ((s.value?.[k] as number[] | undefined) ?? [])

const s = computed(() => (props.save ? withCrusade(withDeckLinks(props.save)) : null))
const p = computed(() => (s.value ? placement(s.value) : null))
const v = computed(() => (s.value ? verdicts(s.value) : null))
const lv = computed(() => n(s.value?.ConquestLV))
const total = computed(() => (s.value ? totalCrusaders(s.value) : 0))
const gift = computed(() => 1 - Math.min(n(arr('GiftShopLevels')[30]) / 5, 50) / 100)
const bar = computed(() => n(s.value?.ConquestEXP) / Math.max(1, n(s.value?.ConquestREQ) * gift.value))
// The next crusade to open, by level (crusades 14-15 open elsewhere).
const next = computed(() => Object.entries(CRUSADES).map(([c, k]) => ({ c: +c, ...k })).find((k) => k.unlock != null && k.unlock > lv.value) ?? null)
const risky = computed(() => p.value?.rows.filter((r) => r.nanRisk) ?? [])
const broken = computed(() => (s.value ? brokenMaterials(s.value) : []))
const rowsV = computed(() => (v.value && !('missing' in v.value) ? v.value.rows : []))
const bestRow = computed(() => rowsV.value.find((r) => r.c === p.value?.best.c))

/** The moves, each on top of the one before, with Crusade EXP/day and days to the next crusade. */
const steps = computed(() => {
  if (!s.value || !p.value || !next.value) return []
  const P = p.value, S = s.value, to = next.value.unlock!, out = []
  const days = (perDay: number) => daysTo(S, to, perDay)
  out.push({ what: 'Today (crusades whose own difficulty is 0 counted as paying nothing)', perDay: P.now, days: days(P.now) })
  const atTop = P.rows.reduce((t, r) => t + r.perDay * r.expAtTop, 0)
  if (P.rows.some((r) => r.active && r.d < r.top)) out.push({ what: 'Set every crusade with crusaders to its highest unlocked difficulty (mob panel, up to the map\'s number)', perDay: atTop, days: days(atTop) })
  if (P.rows.some((r) => r.active && r.c !== P.best.c)) out.push({ what: `Put all ${P.total} crusaders on ${P.best.name} (difficulty ${P.best.top})`, perDay: P.then, days: days(P.then) })
  const w = bestRow.value?.bestWin
  if (w && w.d > P.best.top) {
    const perDay = 12 * P.total * perVictory(S, P.best.c, w.d).exp
    out.push({ what: `Beat ${P.best.name} up to difficulty ${w.d} (one win raises it by 1) and set it there`, perDay, days: days(perDay) })
  }
  return out
})

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return i < units.length - 1 || x < 1e33 ? `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}` : x.toExponential(2)
}
const days = (d: number) => (!Number.isFinite(d) ? '—' : d < 1 ? `${+(d * 24).toFixed(1)} h` : `${+d.toFixed(1)} d`)
const secs = (x: number) => (!Number.isFinite(x) ? '—' : x < 10 ? `${+x.toFixed(2)} s` : x < 120 ? `${Math.round(x)} s` : `${Math.floor(x / 60)}m ${Math.round(x % 60)}s`)
const cls = (w: string) => (w === 'win' ? 'st-good' : w === 'close' ? 'st-warn' : 'st-bad')
const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(', ')
</script>

<template>
  <div class="page-head">
    <h2>Crusade</h2>
    <p>Where to put your crusaders, which crusade difficulties you can beat, and how fast you reach the next crusade.</p>
    <div v-if="s && p" class="tiles">
      <div class="tile"><b>Lv {{ lv }}</b><span>Crusade level ({{ (100 * bar).toFixed(1) }}% to next){{ next ? ` · ${next.name} opens at ${next.unlock}` : '' }}</span></div>
      <div class="tile"><b>{{ p.total }} / {{ total }}</b><span>crusaders fielded / owned</span></div>
      <div class="tile"><b>{{ fmt(p.now) }}</b><span>Crusade EXP a day from claims{{ next && steps[0] ? ` · lv ${next.unlock} in ${days(steps[0].days)}` : '' }}</span></div>
      <div class="tile"><b :class="{ 'st-bad': risky.length }">{{ risky.length }}</b><span>crusades whose own difficulty (mob panel) is 0: a claim wipes your Crusade EXP</span></div>
    </div>
  </div>
  <p v-if="!s || !p" class="note">Load a save to see Crusades.</p>
  <template v-else>
    <div v-if="risky.length || broken.length" class="warn">
      <p v-if="risky.length"><b>{{ names(risky) }}: this crusade's own difficulty is 0. Set it before you claim again.</b> Click the
        crusade's mob to see and change it; the map shows your highest unlocked difficulty instead (ConquestDifficultyLV), which a claim
        does not use. A claim pays each crusade at its own difficulty (ConquestDifficultyselected[crusade], † @17976149, @17977093). That value is
        local-only, and a Steam Cloud restore leaves it at 0. At 0, R = 77 and (1 + (R/100 − 1)^0.7) is NaN; one claim click adds every
        crusade's victories, so the whole click's EXP becomes NaN, and the crusade bar then resets NaN to 0 (ActorEvents_988 † @17893273).
        Both steps were run in the game's own code. Raise it with the mob panel's arrow, up to the map's number, which also pays the most.</p>
      <p v-if="broken.length">This save holds NaN, not a count, for {{ broken.map(materialName).join(' and ') }}. That is what a crusade-2 claim at
        difficulty 0 does to its two base drops (its quantity term goes below zero too, checked in the game's code); that this is how
        it happened here is not proven. What the game does with a NaN material later is not decoded.</p>
    </div>

    <h3>Do this next</h3>
    <p class="note">Ranked by <b>days to the next crusade</b>{{ next ? ` (${next.name}, level ${next.unlock})` : '' }}. That is what the wiki says crusade
      levels are for: every level adds a crusader, and new crusades bring new Tinkering materials. Each line includes the ones above it.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Move</th><th class="num">Crusade EXP a day</th><th class="num">Days to level {{ next?.unlock }}</th></tr></thead>
      <tbody>
        <tr v-for="(x, i) in steps" :key="i"><td>{{ x.what }}</td><td class="num">{{ fmt(x.perDay) }}</td><td class="num" :class="{ 'st-good': i > 0 }">{{ days(x.days) }}</td></tr>
      </tbody>
    </table></div>
    <details class="how"><summary>How the days are worked out</summary>
    <p>Every crusader adds 12 victories a day wherever it sits († @18145998), so for EXP all of them belong on the crusade whose
      victory pays the most. Days count your EXP now and the requirement growth of each level (×1.35, more from level 50/70/80 †).
      Materials are a different reason to spread crusaders: they don't compare across crusades, so they're listed per crusade below.</p>
    </details>

    <div class="sec-head"><h3>Crusaders</h3><span class="m">EXP and materials per crusade</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Crusade</th><th class="num">Crusaders</th><th class="num" title="Set = the crusade's own difficulty (click its mob; ConquestDifficultyselected), what claims pay at. Highest = the map's number (ConquestDifficultyLV).">Difficulty set (mob) / highest (map)</th><th class="num">Victories to claim</th>
        <th class="num">EXP per victory (set / highest)</th><th class="num">EXP a day</th><th>Materials per crusader a day, at the highest difficulty</th></tr></thead>
      <tbody>
        <tr v-for="r in p.rows" :key="r.c">
          <td><Icon kind="crusade" :id="r.c" :name="r.name" /></td><td class="num">{{ r.active }}</td>
          <td class="num" :class="{ 'st-bad': r.nanRisk, 'st-warn': !r.nanRisk && r.d < r.top }">{{ r.d }} / {{ r.top }}</td>
          <td class="num">{{ Math.floor(r.unclaimed) }}</td>
          <td class="num"><span :class="{ 'st-bad': r.nanRisk }">{{ r.nanRisk ? 'NaN' : fmt(r.expPerVictory) }}</span> / {{ fmt(r.expAtTop) }}</td>
          <td class="num">{{ r.nanRisk ? 'NaN' : fmt(r.perDay * r.expPerVictory) }}</td>
          <td><span v-for="m in r.matsAtTop" :key="m.id" class="mat"><Icon kind="material" :id="m.id" :name="materialName(m.id)" /> {{ fmt(12 * m.qty) }}</span></td>
        </tr>
      </tbody>
    </table></div>
    <details class="how"><summary>How EXP and materials per victory are worked out</summary>
    <p>From the claim's own code († @17977066): EXP per victory = (1 + (R/100 − 1)^0.7)·11.5·crusade points·your EXP bonuses
      (cards and gear of the deck linked to crusades, potions, contract 51, skill 43), R = (100 + 15·(d − 1))·1.1^(d − 1)·crusade multis. Materials
      are added as chance × quantity, no roll; drop slots 3-5 open at difficulty 7, 17 and 27. The crusade pane's "EXP per day" uses R with mastery
      bonus 30 and without contract 51, so it differs from what a claim pays. Pearlescent materials (ids 81-89) are named by id: the wiki's
      Pearlescent art is numbered out of id order.</p>
    </details>

    <div class="sec-head"><h3>Can you beat it?</h3><span class="m">each crusade at its highest unlocked difficulty</span></div>
    <p v-if="v && 'missing' in v" class="warn">Not computable from this save: {{ v.missing }} (load-time values a Steam Cloud save doesn't carry; load the local save).</p>
    <template v-else-if="v">
      <div class="tbl"><table class="list">
        <thead><tr><th>Crusade</th><th class="num">Highest unlocked</th><th>There: kill / you die</th><th class="num">Highest you win</th>
          <th class="num">EXP per victory there</th><th>Boss extras not modelled</th></tr></thead>
        <tbody>
          <tr v-for="r in rowsV" :key="r.c">
            <td><Icon kind="crusade" :id="r.c" :name="r.name" /></td><td class="num">{{ r.top }}</td>
            <td :class="cls(r.front.verdict)"><b>{{ r.front.verdict }}</b> {{ secs(r.front.ttk) }} / {{ r.front.die < HORIZON ? secs(r.front.die) : 'not before the kill' }}</td>
            <td class="num" :class="{ 'st-good': r.bestWin && r.bestWin.d > r.top }">{{ r.bestWin ? r.bestWin.d : '—' }}</td>
            <td class="num">{{ r.bestWin ? `${fmt(perVictory(s, r.c, r.bestWin.d).exp)} (×${+(perVictory(s, r.c, r.bestWin.d).exp / r.expAtTop).toFixed(2)})` : '—' }}</td>
            <td class="muted">{{ r.c === 10 ? 'modelled: heals 20% when its attacks run out' : SPECIALS[r.c] ?? '' }}</td>
          </tr>
        </tbody>
      </table></div>
      <p class="note">A win raises a crusade's highest difficulty by 1 when you fight at it († @23377918), so "highest you win" is how far
        repeated wins can take it. Win = the boss dies with {{ 100 * CLOSE }}% of the time before you'd die to spare; close = within
        {{ 100 * CLOSE }}%; no = later. Crusades have no time limit; a fight longer than {{ HORIZON / 60 }} minutes counts as no.</p>
      <details class="how"><summary>How the fight is modelled</summary>
      <p>The model, from the fight scene's code (SceneEvents_32 †): four mob stages and the boss, each with its HP. You attack only
        with skills ({{ v.skills.join(', ') }}), cast as each cooldown ends (one point = {{ v.cdSec.toFixed(2) }} s); a hit is your damage
        ({{ fmt(v.base) }}, deck linked to crusades) ÷ the crusade's DEF, × hit chance and average crit. Mobs hit every 2 − 0.1·crusade·(1 + stage/8)
        seconds, 3% harder each hit; the boss throws its weapon on a timer while it has attacks, 7% harder each throw. Hits empty your shield
        ({{ v.shieldPct }}% of {{ fmt(v.hpMax) }} HP) first with no carry-over, then HP, after {{ (100 * v.reduction).toFixed(1) }}% damage
        reduction; food heals HP on its cooldowns.</p>
      </details>
      <p class="note">Not decoded or not counted: buff skills and the heal/seal buttons (you press those), the Banana, Icicle and Leech skills,
        the boss extras in the last column (except crusade 10's heal), the 60 fps frame timing, and crusades 14-15's unlock. The select screen's
        Details pane shows other base HP for crusades 1-5 than the fight uses; the table uses the fight's.</p>
    </template>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.m { color: var(--muted); }
.warn { border-left: 3px solid var(--bad); padding: 6px 10px; background: var(--panel); margin-bottom: 10px; }
.warn p { margin: 4px 0; }
.mat { white-space: nowrap; margin-right: 10px; }
</style>
