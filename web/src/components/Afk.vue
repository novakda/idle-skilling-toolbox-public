<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import screenMap from '../data/screens.json'
import { awayPercent, bankedScreens, LEAVE_OR_PLAY } from '../away'
import { statPages } from '../fight-away'
import { activeTilling, awayTillingPerSecond } from '../tilling-away'
import { awayFishing } from '../fishing'
import { ascendGain } from '../bus'
import { resetTarget } from '../income'
import Icon from './Icon.vue'
import { sectionRef } from '../section'

// Away time is credited when a screen is opened: (now - LastVisitedZone[K]), times nonActiveZoneGainPercent/100
// on "reduced" screens, in full on the others. Mapping read from each scene's init (src/derive-screens.ts).
type Screen = { names: string[]; reduced: boolean }
const props = defineProps<{ save: Record<string, unknown> | null }>()
const screens = ref<Record<string, Screen> | null>(screenMap as Record<string, Screen>)
// Away % is computed at load and absent from cloud saves: derived from the save (away.ts), else the value entered
// on the Potions tab.
const storedAway = (() => { try { return Number(localStorage.getItem('idle-skilling.awayPct')) || 30 } catch { return 30 } })()

const pct = computed(() => (props.save && awayPercent(props.save)) ?? storedAway)
const rows = computed(() => (props.save ? bankedScreens(props.save, screens.value ?? {}, pct.value) : []))
// Ascend/rebirth: what they pay now, and how fast this run is still earning. Snapshots are keyed by the run's own
// clock (TimeSinceAscention), so they need no wall clock and start over when a new run begins.
type Snap = { h: number; ap: number; bp: number; AP?: number[]; BP?: number[] }
const SNAPS = 'idle-skilling.ascendSnaps'
const snaps = ref<Snap[]>((() => { try { return JSON.parse(localStorage.getItem(SNAPS) ?? '[]') } catch { return [] } })())
const gain = computed(() => (props.save ? ascendGain(props.save) : null))
watch(gain, (g) => {
  if (!g) return
  const last = snaps.value.at(-1), list = last && g.hours < last.h ? [] : snaps.value // new run: drop the old one
  const keep = last && Math.abs(g.hours - last.h) < 0.01 ? list.slice(0, -1) : list // same moment: refresh it
  snaps.value = [...keep, { h: g.hours, ap: g.ap, bp: g.bp, AP: g.AP, BP: g.BP }].slice(-200)
  try { localStorage.setItem(SNAPS, JSON.stringify(snaps.value)) } catch { /* not persisted */ }
}, { immediate: true })
// Snapshots the save writers record (src/history.ts appendAscend → data/ascend-history.json), so the verdict works
// without reloading the page an hour apart. Only snapshots tagged with this run count (TimesAscended-NumberofTimesRebirth).
const fileSnaps = ref<(Snap & { run?: string })[]>([])
fetch('/data/ascend-history.json').then((r) => (r.ok ? r.json() : [])).then((all) => { fileSnaps.value = all }).catch(() => {})
const runSnaps = computed(() => {
  const now = gain.value?.hours ?? Infinity
  const run = `${props.save?.TimesAscended ?? 0}-${props.save?.NumberofTimesRebirth ?? 0}`
  const merged = [...fileSnaps.value.filter((x) => x.run === run && x.h <= now + 0.01), ...snaps.value].sort((a, b) => a.h - b.h)
  return merged.filter((x, i) => i === 0 || x.h - merged[i - 1]!.h > 0.01 || i === merged.length - 1)
})
// Reset rule target: best AP/(h + downtime) of the previous run (its file snapshots), else of this run so far.
// Downtime = minutes a reset costs you (re-setting skills, gear); a knob, saved per browser.
const DOWN = 'idle-skilling.resetDownMin'
const downMin = ref((() => { try { return Number(localStorage.getItem(DOWN) ?? 5) } catch { return 5 } })())
watch(downMin, (v) => { try { localStorage.setItem(DOWN, String(v)) } catch { /* not persisted */ } })
const apTarget = computed(() => {
  const g = gain.value
  if (!g) return null
  const prevRun = `${Number(props.save?.TimesAscended ?? 0) - 1}-${props.save?.NumberofTimesRebirth ?? 0}`
  const prev = fileSnaps.value.filter((x) => x.run === prevRun).map((x) => ({ h: x.h, v: x.ap }))
  return resetTarget(prev, [...runSnaps.value, { h: g.hours, ap: g.ap }].map((x) => ({ h: x.h, v: x.ap })), (downMin.value || 0) / 60)
})
// Rebirth: BP over the rebirth cycle's own clock (TimeSinceAscention2), not this ascend run's.
const bpTarget = computed(() => (gain.value ? resetTarget([], [{ h: gain.value.rebirthHours, v: gain.value.bp }], (downMin.value || 0) / 60) : null))
// Recent rate: latest snapshot vs the newest one at least an hour older (else the oldest).
const recent = computed(() => {
  const s = runSnaps.value, b = s.at(-1)
  if (!b || s.length < 2) return null
  const a = [...s].reverse().find((x) => b.h - x.h >= 1) ?? s[0]!
  const dh = b.h - a.h
    // Per component, in multiplied points per hour (null when either snapshot predates component tracking).
  const per = (x?: number[], y?: number[], m = 1) => (x && y ? y.map((v, i) => ((v - (x[i] ?? 0)) * m) / dh) : null)
  return dh > 0 ? { dh, ap: (b.ap - a.ap) / dh, bp: (b.bp - a.bp) / dh,
    AP: per(a.AP, b.AP, gain.value?.apMulti), BP: per(a.BP, b.BP, gain.value?.bpMulti) } : null
})
const big = (v: number) => Math.round(v).toLocaleString()
// Component labels in the game's order (APreward[1..5], BPreward[1..6]; see ascensionRewards).
const AP_PARTS = ['Total kills', 'Skiller reps', 'Ores mined', 'Fish caught', 'Total skill level']
const BP_PARTS = ['Tiller + pot perk levels', 'Flowers discovered', 'Unspent tilling crops', 'Unspent AP', 'Highest monster reached', 'Smithing, cards, event']
// BP caps per component (code + wiki Rebirth page agree). Flowers: min(top², 1500) but only 24 exist, so 576.
// Map's cap steps up by zone (26 → 70 → 180 → 350 → 650 → 5000); smithing 1000 + cards 250 + 2/arcade level uncapped.
const mapCap = computed(() => {
  const f = Number(props.save?.fightsunlocked ?? 0), hell = Number(props.save?.HellKeyGot ?? 0) === 1
  if (!hell) return f === 5 ? 26 : 0
  return ({ 15: 5000, 14: 650, 13: 350, 12: 180 } as Record<number, number>)[f] ?? 70
})
const BP_CAPS = computed(() => ['1,250', '576', '750', '1,500', `${big(mapCap.value)} (this zone; 5,000 max)`, '1,250 + event'])
const fmt = (sec: number) => (sec < 60 ? `${Math.round(sec)}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
// The game's stats panel (4 pages), from the save; matches the game's draw code (stat-pages.test.ts).
const stats = computed(() => { try { return props.save ? statPages(props.save) : null } catch (e) { console.warn('stats panel:', e); return null } })
const awayRates = computed(() => {
  const s = props.save, p = s ? awayPercent(s) : null
  return s && p != null ? { Fishing: awayFishing(s, p).perAwaySecond, Tilling: awayTillingPerSecond(s, p) } as Record<string, number> : {}
})
// Active Tilling: each farmer moves at most one frame per 60 fps draw, in steps (speed ≥ 100 → 60 frames/s, 50–100 → 40, …).
const tilling = computed(() => props.save ? activeTilling(props.save) : null)
// The speed that reaches the next step: a farmer needing k 10 ms ticks per frame (k = ceil(100/speed)) steps up at 100/(k−1).
// Speed levels cap at 81 (all maxed on a typical late save), so the levers are armor 40 (one Mystical Tiller per farmer) and FarmingSpeedBOOST.
const howTo100 = (i: number, speed: number) => {
  if (speed >= 100) return ''
  const armor = Number((props.save?.FarmerArmor as number[] | undefined)?.[i + 1] ?? 0)
  if (armor < 40 && speed * 2 / (1 + armor / 40) >= 100) return `Mystical Tiller (armor 40 → ${(speed * 2 / (1 + armor / 40)).toFixed(0)})`
  return `FarmingSpeedBOOST +${(100 * (100 / speed - 1)).toFixed(0)}%`
}
const nextStep = (speed: number) => { const k = Math.ceil(100 / speed); return k > 1 ? 100 / (k - 1) : null }
// Skill icon per screen (level keys, src/derive-icons.ts); unmapped screens show the name only.
const SCREEN_SKILL: Record<string, string> = { Fishing: 'fishingLVL', Tilling: 'FarmingLV', Botany: 'HerbloreLV', Mining: 'miningLVL' }
const leaveOrPlay = computed(() => LEAVE_OR_PLAY.map((r) => r.screen === 'Tilling' && tilling.value?.xpPerSec && awayRates.value.Tilling
  ? { ...r, ratio: +(awayRates.value.Tilling / tilling.value.xpPerSec).toFixed(1), how: 'save' as const } : r))
// Header verdict: the same comparison the ascend paragraph below makes.
const ascendCall = computed(() => (recent.value && apTarget.value ? (recent.value.ap < apTarget.value.rate ? 'ascend now' : 'keep going') : null))
const STAT_TITLES = { damage: 'Damage', health: 'Health', away: 'Away gains', potions: 'Potions' } as const
const SECTIONS = [['ascend', 'Ascend / rebirth'], ['banked', 'Banked time'], ['leave', 'Leave or play'], ['stats', 'Stats panel']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>AFK</h2>
    <p>Which screens have away time banked, which to leave or play, and what an ascend or rebirth pays right now.</p>
    <div v-if="save" class="tiles">
      <div class="tile"><b>{{ pct }}%</b><span>away gain</span></div>
      <div class="tile"><b>{{ gain ? big(gain.ap) : '—' }}</b><span>AP if you ascend now</span></div>
      <div class="tile"><b>{{ gain ? big(gain.bp) : '—' }}</b><span>BP if you rebirth now</span></div>
      <div class="tile"><b :class="{ 'st-good': ascendCall === 'ascend now' }">{{ ascendCall ?? '—' }}</b><span>ascend verdict (AP/h)</span></div>
    </div>
  </div>
  <div class="subtabs" role="tablist">
    <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
  </div>
  <template v-if="sec === 'ascend'">
  <section v-if="gain" class="ascend">
    <div class="sec-head"><h3>Ascend / rebirth</h3><span class="m">this run {{ fmt(gain.hours * 3600) }}</span></div>
    <p class="facts"><span><b>Ascend now</b> {{ big(gain.ap) }} AP ({{ big(gain.apBase) }} × {{ +gain.apMulti.toFixed(1) }})</span>
      <span><b>Over the run</b> {{ big(gain.ap / Math.max(gain.hours, 0.01)) }} AP/h</span>
      <span><b>Rebirth now</b> {{ big(gain.bp) }} BP ({{ big(gain.bpBase) }} × {{ +gain.bpMulti.toFixed(2) }})</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th>AP from</th><th class="num">base</th><th class="num">× {{ +gain.apMulti.toFixed(1) }}</th><th v-if="recent?.AP" class="num">/h now</th><th>BP from</th><th class="num">base</th><th class="num">cap</th><th class="num">× {{ +gain.bpMulti.toFixed(2) }}</th><th v-if="recent?.BP" class="num">/h now</th></tr></thead>
      <tbody><tr v-for="i in 6" :key="i">
        <template v-if="i <= 5"><td>{{ AP_PARTS[i - 1] }}</td><td class="num">{{ big(gain.AP[i]!) }}</td><td class="num">{{ big(gain.AP[i]! * gain.apMulti) }}</td><td v-if="recent?.AP" class="num">{{ big(recent.AP[i]!) }}</td></template><template v-else><td></td><td></td><td></td><td v-if="recent?.AP"></td></template>
        <td>{{ BP_PARTS[i - 1] }}</td><td class="num">{{ big(gain.BP[i]!) }}</td><td class="num">{{ BP_CAPS[i - 1] }}</td><td class="num">{{ big(Math.round(gain.BP[i]!) * gain.bpMulti) }}</td><td v-if="recent?.BP" class="num">{{ +recent.BP[i]!.toFixed(1) }}</td>
      </tr></tbody>
    </table></div>
    <div v-if="recent" class="tbl"><table class="list">
      <thead><tr><th>Rate</th><th class="num">Last {{ fmt(recent.dh * 3600) }} of the run</th><th class="num">Compared with</th><th>Verdict</th></tr></thead>
      <tbody>
        <tr><td>AP/h</td><td class="num">{{ big(recent.ap) }}</td>
          <td class="num"><template v-if="apTarget">{{ big(apTarget.rate) }} <small class="muted">best a run pays counting the reset ({{ apTarget.from }})</small></template><template v-else>—</template></td>
          <td :class="{ 'st-good': apTarget && recent.ap < apTarget.rate }">{{ !apTarget ? '' : recent.ap < apTarget.rate ? 'below: ascending around now maximizes AP per hour of play' : 'at or above: the run is still worth continuing for AP' }}</td></tr>
        <tr><td>BP/h</td><td class="num">{{ +recent.bp.toFixed(1) }}</td>
          <td class="num"><template v-if="bpTarget">{{ +bpTarget.rate.toFixed(1) }} <small class="muted">this rebirth's average over {{ fmt(gain.rebirthHours * 3600) }}</small></template><template v-else>—</template></td>
          <td :class="{ 'st-good': bpTarget && recent.bp < bpTarget.rate }">{{ !bpTarget ? '' : recent.bp < bpTarget.rate ? 'below: a rebirth now maximizes BP per hour (it also resets farming, botany and potions)' : 'at or above: no rebirth hurry' }}</td></tr>
      </tbody>
    </table></div>
    <p v-else class="note">Load the save again later in this run to see the recent AP rate (it compares snapshots from this browser and from each save refresh, data/ascend-history.json).</p>
    <p class="note">Reset downtime <input v-model.number="downMin" type="number" min="0" step="1" style="width:4em"> min, counted against each run. The target uses the previous run's curve when its snapshots exist; later runs start stronger, so it errs toward ascending late.</p>
  </section>
  <p v-else class="muted">Load a save to see what an ascend or rebirth pays.</p>
  </template>
  <template v-else-if="sec === 'banked'">
  <div class="sec-head"><h3>Banked time</h3><span class="m">open the top screens to claim</span></div>
  <p class="note">Skill screens bank away time and credit it when you open them. Your away gain is {{ pct }}% on most screens; some credit away time in full.</p>
  <div v-if="rows.length" class="tbl"><table class="list">
    <thead><tr><th>Screen</th><th class="num">Since last visit</th><th class="num">Banked when opened</th><th>Rate</th></tr></thead>
    <tbody>
      <tr v-for="r in rows" :key="r.k"><td>{{ r.name }}<small v-if="r.k === 21" class="muted"> (Codex: only runs down the daily pet-claim timer, which restarts at 24 h on claim, so a ready claim doesn't stack)</small></td><td class="num">{{ fmt(r.away) }}</td><td class="num b">{{ fmt(r.credited) }}</td><td class="muted">{{ r.reduced ? `${pct}%` : 'full' }}</td></tr>
    </tbody>
  </table></div>
  <p v-else class="muted">Loading…</p>
  </template>
  <section v-else-if="sec === 'leave'">
    <div class="sec-head"><h3>Leave or play</h3><span class="m">away credit vs playing the screen</span></div>
    <p class="note">Fishing and Tilling pay more away: park them and visit only to collect.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Screen</th><th>Away vs playing</th><th>Verdict</th><th class="num">Away XP per second away</th></tr></thead>
      <tbody><tr v-for="r in leaveOrPlay" :key="r.screen"><td><Icon kind="skill" :id="SCREEN_SKILL[r.screen]" :name="r.screen" /></td><td>{{ r.screen === 'Botany' ? 'grows at ~30% away' : r.ratio >= 1 ? `${r.ratio}×` : `~${Math.round(r.ratio * 100)}%` }} <small class="muted">({{ r.how }})</small></td><td><b>{{ r.verdict ?? (r.ratio >= 1 ? 'leave' : 'play') }}</b></td><td class="num">{{ awayRates[r.screen] ? big(awayRates[r.screen]!) : '' }}</td></tr></tbody>
    </table></div>
    <details class="how"><summary>Why Fishing and Tilling pay more away</summary>
    <p>Their away formulas skip the reel animation / the 10% XP roll.</p>
    </details>
    <template v-if="tilling?.farmers.length">
      <div class="sec-head"><h4>Tilling farmers on screen</h4><span class="m">{{ big(tilling.xpPerSec) }} XP/s playing</span></div>
      <p class="note">Speed between steps does nothing while you watch; away credit uses all of it.</p>
      <div class="tbl"><table class="list">
        <thead><tr><th class="num">Farmer</th><th class="num">Speed</th><th class="num">Harvests/s on screen</th><th class="num">Next step at</th><th>How</th></tr></thead>
        <tbody><tr v-for="(f, i) in tilling.farmers" :key="i"><td class="num">{{ i + 1 }}</td><td class="num">{{ f.speed.toFixed(1) }}</td><td class="num">{{ f.harvestsPerSec.toFixed(2) }}</td>
          <td class="num">{{ nextStep(f.speed)?.toFixed(0) ?? 'top step' }}</td><td>{{ howTo100(i, f.speed) }}</td></tr></tbody>
      </table></div>
      <details class="how"><summary>How farmer speed steps work</summary>
      <p>On the Tilling screen a farmer moves at most one frame per draw (60 fps), so speed counts in steps: 100+ runs at 60 frames/s, 50–100 at 40.</p>
      </details>
    </template>
  </section>
  <section v-else-if="stats">
    <div class="sec-head"><h3>Stats panel</h3><span class="m">the game's 4 stat pages</span></div>
    <p class="note">Same numbers as the in-game panel, from your save. Card and deck terms use the deck that was active when the game saved.</p>
    <div class="grid">
      <div v-for="(t, k) in STAT_TITLES" :key="k" class="tbl"><table class="list">
        <thead><tr><th colspan="2">{{ t }}</th></tr></thead>
        <tbody><tr v-for="[l, v] in stats[k]" :key="l"><td>{{ l }}</td><td class="num">{{ v }}</td></tr></tbody>
      </table></div>
    </div>
  </section>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; } h4 { font-size: 14px; }
.tbl { max-width: 900px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; align-items: start; }
.grid .tbl { margin: 0; } .grid table.list { min-width: 0; }
td.b { font-weight: 600; }
</style>
