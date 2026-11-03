<script setup lang="ts">
import { computed } from 'vue'
import { withDeckLinks } from '../cards-calc'
import { RIFTS, SOULS } from '../rift'
import { JAR, levelCap, nextHire, optimal, raiseReq, riftNeeds, sequence, SKILLERS, stockpile, soulRates, spiritLevel, spiritRates, taskCap, TASK_MAX, upgrades, withSpirit, type Kind } from '../spiriting'
import Icon from './Icon.vue'
import { candyFor, candyText } from '../candy'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const emit = defineEmits<{ go: [view: string] }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const s = computed(() => (props.save ? withSpirit(withDeckLinks(props.save)) : null))
const a = (k: string) => (s.value?.[k] as number[] | undefined) ?? []
// Away credit is away time × your away gain % (nonActiveZoneGainPercent, @22600245 †); every rate here is per credited
// second, so H converts to per real hour away. Checked 2026-10-11: Orange and Yellow both came in at 0.389× the uncorrected model.
const pct = computed(() => (s.value ? n(s.value.nonActiveZoneGainPercent) / 100 || 1 : 1))
const H = computed(() => 3600 * pct.value)
const E = computed(() => (s.value ? spiritRates(s.value) : null))
const L = computed(() => (s.value ? spiritLevel(s.value) : null))
const day = computed(() => (s.value && E.value ? spiritLevel(s.value, 86400 * pct.value * E.value.away) : null))
const O = computed(() => (s.value ? optimal(s.value) : null))
const needs = computed(() => (s.value ? riftNeeds(s.value) : []))
const ups = computed(() => (s.value ? upgrades(s.value) : []))
const bestUp = computed(() => ups.value.find((u) => u.affordable && u.value > 0))
const hires = computed(() => (s.value ? [nextHire(s.value, 'cultist'), nextHire(s.value, 'acolyte')].filter((h) => h) : []))
const R = computed(() => (s.value ? soulRates(s.value) : null))
const COL = [1, 2, 3, 4, 5, 6, 7]
const changes = computed(() => {
  if (!O.value) return []
  const out: { kind: 'Cultist' | 'Acolyte'; i: number; from: number; to: number }[] = []
  for (const [kind, now, best] of [['Cultist', O.value.now.cult, O.value.best.cult], ['Acolyte', O.value.now.aco, O.value.best.aco]] as const)
    for (let i = 1; i <= SKILLERS; i++) if (now[i] !== best[i]) out.push({ kind, i, from: now[i]!, to: best[i]! })
  return out
})
// The same move for several spirits is one row; "all 8 Acolytes" when it covers every hired one of that kind, and one
// "all cultists and acolytes" row when both kinds make the same whole move.
const moves = computed(() => {
  if (!O.value) return []
  const hired = { Cultist: O.value.now.cult.filter((t) => t > 0).length, Acolyte: O.value.now.aco.filter((t) => t > 0).length }
  const m = new Map<string, { kind: 'Cultist' | 'Acolyte'; ids: number[]; from: number; to: number }>()
  for (const c of changes.value) { const k = `${c.kind}|${c.from}|${c.to}`; m.get(k)?.ids.push(c.i) ?? m.set(k, { kind: c.kind, ids: [c.i], from: c.from, to: c.to }) }
  const rows = [...m.values()].map((g) => ({ ...g, all: g.ids.length === hired[g.kind] }))
  if (rows.length === 2 && rows.every((r) => r.all) && rows[0]!.from === rows[1]!.from && rows[0]!.to === rows[1]!.to)
    return [{ who: `all ${changes.value.length} cultists and acolytes`, from: rows[0]!.from, to: rows[0]!.to }]
  return rows.map((r) => ({ from: r.from, to: r.to,
    who: r.all ? `all ${r.ids.length} ${r.kind}s` : r.ids.length > 1 ? `${r.kind}s ${r.ids.join(', ')}` : `${r.kind} ${r.ids[0]}` }))
})
const total = (v: number[]) => v.reduce((t, x) => t + x, 0)
const hoursTo = (gaps: [number, number][], souls: number[]) => Math.max(...gaps.map(([c, d]) => d / souls[c]! / H.value))
const rows = (kind: Kind) => {
  if (!s.value) return []
  const c = kind === 'cultist'
  return Array.from({ length: SKILLERS }, (_, k) => k + 1).filter((i) => n(a(c ? 'CultistLV' : 'AcolyteLV')[i]) > 0).map((i) => {
    const t = n(a(c ? 'CultistTASK' : 'AcolyteTASK')[i]), cap = taskCap(s.value!, kind, i)
    return {
      i, t, cap, hyper: n(s.value!.mtxCultandAco) >= i,
      lv: [n(a(c ? 'CultValueLV' : 'AcolyteLV')[i]), n(a(c ? 'CultSpeedLV' : 'AcolyteLV2')[i]), n(a(c ? 'CultLuckLV' : 'AcolyteLV3')[i])],
      bonus: n(a(c ? 'CultistSoulBonusPercent' : 'AcolyteSoulBonusPercent')[i]),
      exp: E.value!.rows.find((r) => r.kind === kind && r.i === i)!,
      // cultists: on-screen soul-fragment chance per cycle (capped 100%); acolytes: their share of the conversion chance
      chance: c ? Math.min(100 * 15 ** -(t - 1) * (1 + n(a('CultLuckLV')[i]) / 100) * (1 + n(a('CultistSoulBonusPercent')[i]) / 100), 100)
        : 5 * (1 + n(a('AcolyteLV3')[i]) / 100) * (1 + n(a('AcolyteSoulBonusPercent')[i]) / 100),
      next: cap < TASK_MAX[kind] ? raiseReq(cap, i) : null,
    }
  })
}
const cults = computed(() => rows('cultist'))
const acos = computed(() => rows('acolyte'))
const colour = (t: number) => (t ? `${SOULS[t]}` : '—')
const lvTxt = (L: number, cap: number) => (L >= cap ? `${L} (max)` : String(L))

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return i < units.length - 1 || v < 1e33 ? `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}` : v.toExponential(2)
}
const sig = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 100 ? fmt(v) : String(+v.toPrecision(3)))
const fmtT = (sec: number) => (!isFinite(sec) ? 'never' : sec < 60 ? `${+sec.toFixed(1)}s` : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const gapTxt = (g: [number, number][]) => g.map(([c, d]) => `${fmt(d)} ${SOULS[c]}`).join(' + ')
const soulsTxt = (v: number[]) => v.map((x, k) => (x > 0 ? `+${fmt(x)} ${SOULS[k]}` : '')).filter(Boolean).join(', ') || '—'
const stock = computed(() => (s.value ? stockpile(s.value) : null))
const SECTIONS = [['plan', 'Plan'], ['best', 'Best setup vs yours'], ['stockpile', 'Stockpile mode'], ['spirits', 'Cultists and acolytes'], ['level', 'Spiriting level'], ['upgrades', 'Upgrades']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
const tabs = computed(() => SECTIONS.filter(([id]) => id !== 'stockpile' || stock.value?.setups.length)) // no rotation, no tab
const plan = computed(() => (s.value ? sequence(s.value) : null))
// Time candy on the Spiriting screen: the plan's times are away-credit seconds, which candy gives at full rate.
const candy1 = computed(() => (s.value && plan.value?.steps[0]?.secs ? candyFor(s.value, plan.value.steps[0].secs) : null))
// "8 Red" / "5 Purple, 3 Yellow": a setup as colour counts, the way you'd set it in game
const counts = (v: number[]) => { const m = new Map<number, number>(); v.forEach((t) => t && m.set(t, (m.get(t) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).map(([t, k]) => `${k} ${colour(t)}`).join(', ') }
const riftName = (r: number) => (r === 9 ? 'Rift Rift' : `${RIFTS[r]} Rift`)
</script>

<template>
  <div class="page-head">
    <h2><Icon kind="skill" id="spiritLVL" name="Spiriting" /></h2>
    <p>The Limbo cultists and acolytes: which soul colour each should work for the souls your rift upgrades are short of, your Spiriting level, and the next upgrade.</p>
    <div v-if="L && E && day && R" class="tiles">
      <div class="tile"><b>Lv {{ L.lv }}</b><span>{{ Math.floor((100 * L.exp) / L.threshold) }}% to the next level</span></div>
      <div class="tile"><b>{{ fmtT(Math.max(0, L.threshold - L.exp) / (E.away * pct)) }}</b><span>to the next level away ({{ fmt(E.away) }} EXP/s)</span></div>
      <div class="tile"><b>{{ day.levels }} / {{ sig(day.levels * L.sp) }}</b><span>levels / perk points per day away</span></div>
      <div class="tile"><b>{{ fmt(H * total(R.souls)) }}</b><span>souls per hour away, all colours</span></div>
    </div>
  </div>
  <p v-if="!s" class="note">Load a save to see Spiriting.</p>
  <template v-else-if="O && L && R">
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="changes.length"><template v-if="moves.length === 1"><b>Reassign {{ moves[0]!.who }}</b>: <Icon kind="soul" :id="moves[0]!.from" :name="colour(moves[0]!.from)" /> → <b class="st-good"><Icon kind="soul" :id="moves[0]!.to" :name="colour(moves[0]!.to)" /></b>.</template>
        <template v-else><b>Reassign {{ changes.length }} of your spirits</b>:
        <ul><li v-for="c in moves" :key="c.who">{{ c.who[0]!.toUpperCase() + c.who.slice(1) }}: <Icon kind="soul" :id="c.from" :name="colour(c.from)" /> → <b class="st-good"><Icon kind="soul" :id="c.to" :name="colour(c.to)" /></b></li></ul></template>
        <template v-if="O.now.value > 1e-12">Rift upgrades you are short of become affordable {{ sig(O.best.value / O.now.value) }}× as fast</template>
        <template v-else>Rift upgrades your current colours can never afford (they make none of a colour those need) become reachable</template>
        ({{ fmt(H * total(O.now.souls)) }} → {{ fmt(H * total(O.best.souls)) }} souls/h). Re-check once those gaps close.
        <span class="note">Per real hour away, at your away gain ({{ sig(100 * pct) }}%). Checked in game 2026-10-11: Orange and Yellow gains
        matched the uncapped away formula scaled by your away gain.</span></li>
      <li v-else><b>Keep your cultists and acolytes where they are</b>: no reassignment closes your rift-upgrade gaps faster.</li>
      <li v-for="h in hires" :key="h!.kind"><b>Hire {{ h!.kind }} {{ h!.i }}</b> at Spiriting level {{ h!.lv }} for {{ fmt(h!.cost) }} gold coins{{ h!.ready ? ' (ready now)' : '' }}.</li>
      <li v-if="bestUp"><b>Upgrade {{ bestUp.kind }} {{ bestUp.i }} {{ bestUp.st }} (lv {{ bestUp.from }} → {{ bestUp.from + 1 }})</b> for
        <span class="st-good">{{ fmt(bestUp.cost) }}</span> gold coins: the most gap-closing per coin (+{{ sig(bestUp.sp) }} perk points/day).</li>
    </ol>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in tabs" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <template v-if="plan && plan.steps.length">
    <h3>Plan, step by step</h3>
    <p class="note">Every rift upgrade you can't afford yet, paid in order. Each step keeps one setup until it has paid everything it
      can, so you reassign as rarely as possible; then the best setup for what's left takes over. Times are real hours away at your
      away gain ({{ sig(100 * pct) }}%), from your current souls; today's list only (a bought level doesn't queue the next one).</p>
    <p v-if="candy1" class="note">Time candy with Spiriting selected (full rate): step 1 takes <b>{{ fmtT(candy1.secs) }}</b> of candy<template v-if="candy1.best">.
      Candy needed (from what you hold): <b>{{ candyText(candy1.best.pick) }}</b></template><template v-else>; you hold {{ fmtT(candy1.allHeld) }}, not enough</template>.
      Set step 1's colours first. Full-rate candy is checked on Tilling and Apothecary; on Spiriting it's assumed the same.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Cultists</th><th>Acolytes <span class="muted">(each also does the next colour)</span></th><th class="num">For</th><th>Pays for</th></tr></thead>
      <tbody>
        <tr v-for="(st, k) in plan.steps" :key="k">
          <td class="num">{{ k + 1 }}</td><td>{{ counts(st.cult) }}</td><td>{{ counts(st.aco) }}</td>
          <td class="num">{{ st.secs ? fmtT(st.secs / pct) : 'now' }}</td>
          <td><div v-for="(b, j) in st.buys" :key="j">{{ riftName(b.r) }} {{ b.kind }} {{ b.L }} → {{ b.L + 1 }}</div></td>
        </tr>
        <tr><td></td><td colspan="2"><b>Total</b></td><td class="num"><b>{{ fmtT(plan.steps.reduce((t, x) => t + x.secs, 0) / pct) }}</b></td><td></td></tr>
      </tbody>
    </table></div>
    <p v-if="plan.unreachable.length" class="note">No setup can reach: {{ plan.unreachable.map((b) => `${riftName(b.r)} ${b.kind}`).join(', ') }}.</p>
    </template>
    <p v-if="!(plan && plan.steps.length)" class="note">No plan: nothing is left that a setup can pay for.</p>
    </template>
    <template v-else-if="sec === 'best'">
    <div class="sec-head"><h3>Best setup vs yours</h3><span class="m">souls per real hour away</span></div>
    <p class="note">What "best" maximises: for each rift value/speed upgrade you can't afford yet (next level, souls you hold now), how
      soon your souls/h close its shortfall (1 ÷ hours, its slowest colour), added up.</p>
    <details class="how"><summary>How "best" is worked out</summary>
    <p>Souls only buy rift levels, so this favours
      the colours you are actually short of; raw soul counts would always say Red, since each colour down gives 15× the fragments.
      Each spirit stays within the colours its Spiriting level unlocks. Rates are per real hour away: credited time is away time × your away gain ({{ sig(100 * pct) }}%) (the game's away
      formula: fragment and conversion chances are not capped at 100% away, as they are on screen). Found by local search from
      your setup and from "all on one colour".</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Colour</th><th class="num">Held</th><th class="num">Souls/h now</th><th class="num">Souls/h best</th><th class="num">Change</th></tr></thead>
      <tbody>
        <tr v-for="k in COL" :key="k">
          <td>{{ SOULS[k] }} souls</td><td class="num">{{ fmt(n(a('SoulsTotal')[k])) }}</td>
          <td class="num">{{ fmt(H * O.now.souls[k]!) }}</td><td class="num">{{ fmt(H * O.best.souls[k]!) }}</td>
          <td class="num" :class="{ 'st-good': O.best.souls[k]! > O.now.souls[k]! }">{{ O.best.souls[k]! === O.now.souls[k]! ? '' : (O.best.souls[k]! > O.now.souls[k]! ? '+' : '') + fmt(H * (O.best.souls[k]! - O.now.souls[k]!)) }}</td>
        </tr>
        <tr><td><b>Total</b></td><td></td><td class="num"><b>{{ fmt(H * total(O.now.souls)) }}</b></td><td class="num"><b>{{ fmt(H * total(O.best.souls)) }}</b></td>
          <td class="num"><b>{{ fmt(H * (total(O.best.souls) - total(O.now.souls))) }}</b></td></tr>
      </tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Rift upgrade you can't afford</th><th>Short of</th><th class="num">Hours now</th><th class="num">Hours with best</th></tr></thead>
      <tbody>
        <tr v-for="b in needs" :key="b.r + b.kind">
          <td>{{ riftName(b.r) }} {{ b.kind }} lv {{ b.L }} → {{ b.L + 1 }}</td>
          <td>{{ gapTxt(b.gaps) }}</td>
          <td class="num">{{ fmtT(3600 * hoursTo(b.gaps, O.now.souls)) }}</td><td class="num">{{ fmtT(3600 * hoursTo(b.gaps, O.best.souls)) }}</td>
        </tr>
        <tr v-if="!needs.length"><td colspan="4" class="muted">You can afford every next rift upgrade now.</td></tr>
      </tbody>
    </table></div>
    <p class="note">These are the same buys the <a href="#" @click.prevent="emit('go', 'rift')">Rift page</a> ranks; it and the
      <a href="#" @click.prevent="emit('go', 'summoning')">Summoning page</a> say which to buy.</p>
    </template>

    <template v-else-if="sec === 'stockpile' && stock && stock.setups.length">
    <div class="sec-head"><h3>Stockpile mode</h3><span class="m">no target, keep everything coming</span></div>
    <p class="note"><b>Rotate full setups rather than mixing</b>: an acolyte colour's chance and its souls per conversion are each summed
      over the acolytes on it and then multiplied, so 8 together earn far more than 8 spread out (checked on this save: the best
      fixed mix found was about 4× slower than this rotation).</p>
    <details class="how"><summary>What stockpile mode measures</summary>
    <p>For when you just want every colour piling up in proportion to what it will be spent on: the souls the next
      {{ stock.levels }} levels of every rift upgrade cost. Measure: how often every upgrade could take those {{ stock.levels }} levels
      at once.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Cultists</th><th>Acolytes</th><th class="num">Share</th><th class="num">Per day</th></tr></thead>
      <tbody>
        <tr v-for="x in stock.setups" :key="x.t">
          <td>{{ counts(x.cult) }}</td><td>{{ counts(x.aco) }}</td>
          <td class="num">{{ Math.round(100 * x.share) }}%</td><td class="num">{{ fmtT(86400 * x.share) }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">Every rift upgrade +{{ stock.levels }} levels every <b>{{ fmtT(1 / (stock.rounds * pct)) }}</b> of real time away
      on this rotation; your current setup: {{ stock.now > 0 ? fmtT(1 / (stock.now * pct)) : 'never (it makes none of a colour some upgrade needs)' }}.
      Order doesn't matter for stockpiling; shares are searched in 5% steps.</p>
    </template>

    <template v-else-if="sec === 'spirits'">
    <div class="sec-head"><h3>Cultists</h3><span class="m">each rolls soul fragments of its colour</span></div>
    <details class="how"><summary>How cultists earn souls</summary>
    <p>Each cycle a cultist rolls Spirit EXP ({{ n(s.SpiritChance) / 10 }}%) and soul fragments of its colour: the chance
      falls 15× per colour up. Fragments fill a jar ({{ JAR.slice(1).join(', ') }} by colour, away); a full jar is a soul of that
      colour and one fragment of the next. Raising a colour needs Spiriting level 10 × colour + 2 × (spirit − 1).</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>#</th><th>Colour</th><th>Best</th><th class="num">Value / speed / luck lv</th><th class="num">Soul bonus</th><th class="num">Fragment chance (screen)</th>
        <th class="num">Spirit EXP/away s</th><th>Next colour at</th></tr></thead>
      <tbody>
        <tr v-for="c in cults" :key="c.i">
          <td>{{ c.i }}{{ c.hyper ? ' (hyper)' : '' }}</td><td>{{ colour(c.t) }}</td><td :class="{ 'st-good': O.best.cult[c.i] !== c.t }">{{ colour(O.best.cult[c.i]!) }}</td>
          <td class="num">{{ c.lv[0] }} / {{ lvTxt(c.lv[1]!, levelCap(s, 'speed')) }} / {{ lvTxt(c.lv[2]!, levelCap(s, 'luck')) }}</td>
          <td class="num">{{ fmt(c.bonus) }}%</td><td class="num">{{ sig(c.chance) }}%</td><td class="num">{{ fmt(c.exp.away) }}</td>
          <td>{{ c.next === null ? 'top colour' : c.t < c.cap ? `unlocked (up to ${colour(c.cap)})` : `Spiriting lv ${c.next}` }}</td>
        </tr>
      </tbody>
    </table></div>

    <div class="sec-head"><h3>Acolytes</h3><span class="m">each converts its colour and the next</span></div>
    <details class="how"><summary>How acolytes convert souls</summary>
    <p>An acolyte on a colour converts completed souls of that colour <b>and the next</b> into souls you can spend: it adds
      to both colours' conversion chance and souls per conversion. Away, an acolyte's Spirit EXP counts once per started 100 value
      levels (the game reads the value level as "owned").</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>#</th><th>Converts</th><th>Best</th><th class="num">Value / speed / luck lv</th><th class="num">Soul bonus</th><th class="num">Adds conversion chance</th>
        <th class="num">Spirit EXP/away s</th><th>Next colour at</th></tr></thead>
      <tbody>
        <tr v-for="c in acos" :key="c.i">
          <td>{{ c.i }}{{ c.hyper ? ' (hyper)' : '' }}</td><td>{{ colour(c.t) }} + {{ colour(c.t + 1) }}</td>
          <td :class="{ 'st-good': O.best.aco[c.i] !== c.t }">{{ colour(O.best.aco[c.i]!) }} + {{ colour(O.best.aco[c.i]! + 1) }}</td>
          <td class="num">{{ c.lv[0] }} / {{ lvTxt(c.lv[1]!, levelCap(s, 'speed')) }} / {{ lvTxt(c.lv[2]!, levelCap(s, 'luck')) }}</td>
          <td class="num">{{ fmt(c.bonus) }}%</td><td class="num">{{ sig(c.chance) }}%</td><td class="num">{{ fmt(c.exp.away) }}{{ c.exp.mult > 1 ? ` (${c.exp.mult}×)` : '' }}</td>
          <td>{{ c.next === null ? 'top colour' : c.t < c.cap ? `unlocked (up to ${colour(c.cap)})` : `Spiriting lv ${c.next}` }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'level'">
    <div class="sec-head"><h3>Spiriting level</h3><span class="m">Lv {{ L.lv }}</span></div>
    <div class="tbl"><table class="list">
      <tbody>
        <tr><td>EXP</td><td class="num">{{ fmt(L.exp) }} / {{ fmt(L.threshold) }}</td><td class="muted">requirement {{ fmt(L.req) }}, cut {{ +(100 * L.cut).toFixed(1) }}% by gift shop upgrade 20</td></tr>
        <tr><td>Each level gives</td><td class="num">{{ sig(L.sp) }} perk points</td><td class="muted">as Summoning: 0.5 × (1 + 10% per <span title="ascension perk 11">Skill Point Bonanza</span> level) × (1 + perk-point cards)</td></tr>
        <tr><td>Head start after a level</td><td class="num">{{ +(100 * L.shrine).toFixed(1) }}%</td><td class="muted">of the next requirement, from the <span title="Asylum shrine 6">Talent shrine</span></td></tr>
        <tr v-if="E"><td>On screen / away</td><td class="num">{{ fmt(E.screen) }} / {{ fmt(E.away) }} EXP/s</td><td class="muted">the frame rate caps spirits on screen; away credit runs at full speed</td></tr>
      </tbody>
    </table></div>
    <details class="how"><summary>How the requirement grows</summary>
    <p>The requirement grows 33% plus a level term each level and resets to 10 on ascending.</p>
    </details>
    </template>

    <template v-else-if="sec === 'upgrades'">
    <div class="sec-head"><h3>Upgrades</h3><span class="m">ranked by gap-closing per gold coin</span></div>
    <p class="note">Paid in gold coins (you hold {{ fmt(n(s.goldcoin)) }}). Green = affordable now.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Gap-closing per gold coin: the "best" measure on the first tab (per hour, at your current colours) gained per coin spent; perk points per day of away credit beside it.
      Speed stops at 81, luck at {{ levelCap(s, 'luck') }}.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Spirit</th><th>Upgrade</th><th class="num">Cost</th><th class="num">Souls/day added</th><th class="num">Perk points/day</th></tr></thead>
      <tbody>
        <tr v-for="u in ups" :key="u.kind + u.i + u.st">
          <td>{{ u.kind }} {{ u.i }}</td><td>{{ u.st }} lv {{ u.from }} → {{ u.from + 1 }}</td>
          <td class="num" :class="{ 'st-good': u.affordable }">{{ fmt(u.cost) }}</td>
          <td class="num">{{ soulsTxt(u.souls) }}</td>
          <td class="num">+{{ sig(u.sp) }}</td>
        </tr>
      </tbody>
    </table></div>
    </template>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.m { color: var(--muted); }
</style>
