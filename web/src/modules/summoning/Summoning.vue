<script setup lang="ts">
import { computed } from 'vue'
import { withDeckLinks } from '../cards/cards-calc'
import { RIFTS, SOULS, withRift, type Cost } from '../rift/rift'
import { nextRift, runes, summonBuys, summoning } from './summoning'
import Icon from '../../components/Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const emit = defineEmits<{ go: [view: string] }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const s = computed(() => (props.save ? withRift(withDeckLinks(props.save)) : null))
const S = computed(() => (s.value ? summoning(s.value) : null))
const list = computed(() => (s.value ? summonBuys(s.value) : []))
const best = computed(() => list.value.find((b) => b.affordable))
const next = computed(() => (s.value ? nextRift(s.value) : null))
const rune = computed(() => (s.value ? runes(s.value) : null))
const name = (r: number) => (r === 9 ? 'Rift Rift' : `${RIFTS[r]} Rift`)
// Rift picture frame as on the Rift page: 3 = Pro look, else by level (> 40: 2, > 20: 1).
const frameOf = (r: number) => {
  const c = (s.value?.ConstructLV as number[] | undefined) ?? [], lv = n((s.value?.RiftLVL as number[] | undefined)?.[r])
  return n(c[10]) + n(c[22]) >= r ? 3 : lv > 40 ? 2 : lv > 20 ? 1 : 0
}
const has = (c: Cost) => c.every(([k, q]) => n((s.value?.SoulsTotal as number[] | undefined)?.[k]) >= q)

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return i < units.length - 1 || v < 1e33 ? `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}` : v.toExponential(2)
}
const sig = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 100 ? fmt(v) : String(+v.toPrecision(3)))
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 60 ? `${+sec.toFixed(1)}s` : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const fmtCost = (c: Cost) => c.map(([k, q]) => `${fmt(q)} ${SOULS[k]}`).join(' + ')
</script>

<template>
  <div class="page-head">
    <h2>Summoning</h2>
    <p>The Rune Summon screen: your Summoning level, what each level gives, which rift upgrade raises it fastest, and the next rift to summon.</p>
    <div v-if="S" class="tiles">
      <div class="tile"><b>Lv {{ S.lv }}</b><span>{{ Math.floor((100 * S.exp) / S.threshold) }}% to the next level</span></div>
      <div class="tile"><b>{{ fmtT(S.toNextAway) }}</b><span>to the next level on away credit ({{ fmt(S.away) }} EXP/s)</span></div>
      <div class="tile"><b>{{ S.levelsPerDay }} / {{ sig(S.skillPointsPerDay) }}</b><span>levels / perk points per day of away credit</span></div>
      <div class="tile"><b>{{ n(s!.RiftsOwned) }} of 9</b><span>rifts summoned</span></div>
    </div>
  </div>
  <p v-if="!S" class="note">Load a save to see Summoning.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="next"><b>Summon {{ name(next.rift) }}</b> for
        <span :class="{ 'st-good': next.affordable }">{{ fmtCost(next.cost) }}</span>{{ next.affordable ? ' (affordable now)' : '' }}.</li>
      <li v-if="best"><b>Buy <Icon kind="rift" :id="`${best.r}-${frameOf(best.r)}`" :name="name(best.r)" /> {{ best.what }}</b> for
        <span class="st-good">{{ fmtCost(best.cost) }}</span>: +{{ sig(best.spPerDay) }} perk points per day, the most per share of souls.</li>
      <li v-else>No rift upgrade is affordable now.</li>
    </ol>

    <div class="sec-head"><h3>Summoning level</h3><span class="m">what each level gives</span></div>
    <div class="tbl"><table class="list">
      <tbody>
        <tr><td>EXP</td><td class="num">{{ fmt(S.exp) }} / {{ fmt(S.threshold) }}</td><td class="muted">requirement {{ fmt(S.req) }}, cut {{ +(100 * S.cut).toFixed(1) }}% by gift shop upgrade 22</td></tr>
        <tr><td>Each level gives</td><td class="num">{{ sig(S.sp) }} perk points</td><td class="muted">0.5 × (1 + 10% per <span title="ascension perk 11">Skill Point Bonanza</span> level) × (1 + perk-point cards)</td></tr>
        <tr><td>Head start after a level</td><td class="num">{{ +(100 * S.shrine).toFixed(1) }}%</td><td class="muted">of the next requirement, from the <span title="Asylum shrine 6">Talent shrine</span></td></tr>
        <tr><td>On screen / away</td><td class="num">{{ fmt(S.screen) }} / {{ fmt(S.away) }} EXP/s</td><td class="muted">the frame rate caps rifts on screen; away credit runs at full speed</td></tr>
      </tbody>
    </table></div>
    <details class="how"><summary>How the requirement grows</summary>
    <p>The requirement grows by 30% plus a level term each level and resets to 10 on ascending. Summoning levels also count
      toward total skill level and a contract.</p>
    </details>

    <div class="sec-head"><h3>Summoning EXP by rift</h3><span class="m">in rift order</span></div>
    <p class="note">Each glyph cycle has a chance ({{ n(s!.SummonChance) / 10 }}%) to give that rift's Summoning EXP. The
      rifts' own bonuses are on the <a href="#" @click.prevent="emit('go', 'rift')">Rift page</a>.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Rift</th><th class="num">EXP per cycle</th><th class="num">EXP per away s</th><th class="num">EXP per s on screen</th><th class="num">Share</th></tr></thead>
      <tbody>
        <tr v-for="r in S.rifts" :key="r.r">
          <td><Icon kind="rift" :id="`${r.r}-${frameOf(r.r)}`" :name="name(r.r)" /></td>
          <td class="num">{{ fmt(r.perCycle) }}</td><td class="num">{{ fmt(r.away) }}</td><td class="num">{{ fmt(r.screen) }}</td>
          <td class="num">{{ (100 * r.share).toFixed(1) }}%</td>
        </tr>
      </tbody>
    </table></div>

    <div class="sec-head"><h3>Rift upgrades for Summoning</h3><span class="m">ranked by perk points per day of away credit, per share of your soul stock spent</span></div>
    <p class="note">Green = affordable now. To rank the same buys by each rift's own bonus, see the Rift page.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Share of soul stock: each cost ÷ the souls of that colour you hold, added up. Extra levels per day use today's requirement, which grows each level. Perk points compare across rifts,
      so this is one list.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Rift</th><th>Upgrade</th><th class="num">Cost</th><th class="num">Share of stock</th><th class="num">Summoning EXP/away s</th>
        <th class="num">Levels/day</th><th class="num">Perk points/day</th></tr></thead>
      <tbody>
        <tr v-for="b in list" :key="b.r + b.kind">
          <td><Icon kind="rift" :id="`${b.r}-${frameOf(b.r)}`" :name="name(b.r)" /></td><td>{{ b.what }}</td>
          <td class="num" :class="{ 'st-good': has(b.cost) }">{{ fmtCost(b.cost) }}</td>
          <td class="num">{{ Math.round(100 * b.share).toLocaleString('en-US') }}%</td>
          <td class="num">+{{ fmt(b.summon) }}</td><td class="num">+{{ sig(b.levelsPerDay) }}</td><td class="num">+{{ sig(b.spPerDay) }}</td>
        </tr>
      </tbody>
    </table></div>

    <div class="sec-head"><h3>Runes</h3><span class="m">saved, never read</span></div>
    <p class="note">Your save holds a rune level {{ rune!.lv }} ({{ fmt(rune!.exp) }} / {{ fmt(rune!.req) }} EXP), but the game only loads and
      saves these values; nothing reads them, so there are no runes to collect and no rune bonuses in this version.</p>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
</style>
