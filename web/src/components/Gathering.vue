<script setup lang="ts">
import { computed, ref } from 'vue'
import { awayPercent } from '../away'
import { ACTIVE_CATCH_SECONDS, awayFishing, fishing } from '../fishing'
import { mining, smithingAwayPerSec, smithingCraftExp } from '../gathering'
import { smithingItems } from '../smithing-caps'
import Icon from './Icon.vue'

// One component, two sidebar pages (the game's CRAFT menu: Mining, Smithing, Fishing; Fishing has its own page).
const props = defineProps<{ save: Record<string, unknown> | null; skill: 'mining' | 'smithing' }>()
const pct = computed(() => (props.save ? awayPercent(props.save) : null))
const mine = computed(() => (props.save && pct.value != null ? mining(props.save, pct.value) : null))
const smith = computed(() => (props.save && pct.value != null ? { craft: smithingCraftExp(props.save), away: smithingAwayPerSec(props.save, pct.value) } : null))
const fish = computed(() => {
  const s = props.save
  if (!s || pct.value == null) return null
  const active = fishing(s).perCatch / ACTIVE_CATCH_SECONDS
  // Away fishing needs FishingTimeMin/Max and the screen odds, which only a local save stores.
  const away = s.FishingTimeMin != null ? awayFishing(s, pct.value).perAwaySecond : null
  return { active, away, fishPerCatch: s.FishGiven != null ? Number(s.FishGiven) : null }
})
const big = (x: number | null) => x == null ? '—' : !Number.isFinite(x) ? '∞' : x >= 1e15 ? x.toExponential(2).replace('e+', 'e') : x >= 1e12 ? `${+(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `${+(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `${+(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `${+(x / 1e3).toFixed(1)}K` : x.toFixed(x < 10 ? 2 : 0)
const ratio = (away: number | null, active: number | null) => away == null || !active ? '—' : away / active >= 10 ? `${Math.round(away / active).toLocaleString()}×` : `${Math.round(100 * away / active)}%`
const lv = (k: string) => Number(props.save?.[k] ?? 0)

// Smithing page: every anvil item, filterable and sortable (same pattern as Realm's blessings table).
type Col = 'item' | 'name' | 'level' | 'gain' | 'status'
const items = computed(() => (props.save && props.skill === 'smithing' ? smithingItems(props.save) : []))
const show = ref<'all' | 'craftable' | 'open' | 'done'>('open'), sort = ref<{ col: Col; desc: boolean }>({ col: 'item', desc: false })
const sortBy = (col: Col) => { sort.value = { col, desc: sort.value.col === col ? !sort.value.desc : col === 'level' || col === 'gain' } }
const gain = (r: { level: number; to: number }) => (r.to - r.level) / Math.max(r.level, 1)
const rows = computed(() => {
  const { col, desc } = sort.value, key = (r: (typeof items.value)[number]) => (col === 'gain' ? gain(r) : r[col])
  return items.value.filter((r) => show.value === 'all' || (show.value === 'craftable' ? r.crafts > 0 : show.value === 'open' ? r.worth : r.status !== 'open' && r.status !== 'locked'))
    .sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1) })
})
const arrow = (col: Col) => (sort.value.col === col ? (sort.value.desc ? ' ▼' : ' ▲') : '')
</script>

<template>
  <div class="page-head">
    <h2 v-if="skill === 'mining'">Mining</h2><h2 v-else>Smithing</h2>
    <p v-if="skill === 'mining'">Mining XP per second, on the screen and away, next to Smithing and Fishing, so you know which to leave running.</p>
    <p v-else>Smithing XP per craft on the screen, and what away time credits.</p>
    <div v-if="save && pct != null" class="tiles">
      <div class="tile"><b>{{ pct }}%</b><span>away gain</span></div>
      <template v-if="skill === 'mining'"><div class="tile"><b>{{ big(mine!.awayXp) }}</b><span>Mining XP/s away</span></div>
      <div class="tile"><b>{{ big(fish!.away) }}</b><span>Fishing XP/s away</span></div></template>
      <div class="tile"><b>{{ big(smith!.craft) }}</b><span>Smithing XP per craft</span></div>
      <template v-if="skill === 'smithing'"><div class="tile"><b>{{ lv('smithingLVL') }}</b><span>Smithing level</span></div>
      <div class="tile"><b>{{ items.filter((r) => r.crafts > 0).length }}</b><span>items you can craft now</span></div>
      <div class="tile"><b>{{ items.filter((r) => r.status === 'capped' || r.status === 'kit done').length }}</b><span>items maxed</span></div></template>
    </div>
  </div>
  <template v-if="save && pct != null && skill === 'mining'">
    <p class="note">Active = on that screen, per second. Away = per real second you spend elsewhere (the game credits away time × {{ pct }}%). † = formula read from the game code, not yet checked against a live run; Fishing rates are live-verified (Fishing tab).</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Skill</th><th class="num">Active XP/s</th><th class="num">Away XP/s</th><th class="num">Away vs active</th></tr></thead>
      <tbody>
        <tr><td><Icon kind="skill" id="miningLVL" name="Mining" /> Lv {{ lv('miningLVL') }}</td><td class="num">{{ big(mine!.activeXp) }} †</td><td class="num">{{ big(mine!.awayXp) }} †</td><td class="num">{{ ratio(mine!.awayXp, mine!.activeXp) }}</td></tr>
        <tr><td><Icon kind="skill" id="smithingLVL" name="Smithing" /> Lv {{ lv('smithingLVL') }}</td><td class="num">{{ big(smith!.craft) }} per craft †</td><td class="num">{{ big(smith!.away) }} †</td><td class="num muted">one craft = {{ big(smith!.craft / smith!.away / 3600) }} h away</td></tr>
        <tr><td><Icon kind="skill" id="fishingLVL" name="Fishing" /> Lv {{ lv('fishingLVL') }}</td><td class="num">{{ big(fish!.active) }}</td><td class="num">{{ big(fish!.away) }}</td><td class="num">{{ ratio(fish!.away, fish!.active) }}</td></tr>
      </tbody>
    </table></div>

    <div class="sec-head"><h3>Mining</h3><span class="m">per miner, on screen and away</span></div>
    <p class="note" v-if="mine!.xpBonus == null">Mining XP needs the local save (PbonusMiningExp isn't in Steam Cloud saves).</p>
    <p v-else class="facts"><span><b>XP bonus</b> +{{ big(mine!.xpBonus) }}% (Mining deck's cards, potions, equipment, perk)</span><span><b>XP chance</b> {{ mine!.miningChance / 10 }}% per mine</span>
      <span><b>Ore bonus</b> +{{ big(mine!.oreBonus) }}% (BonusOresCUMULATIVEpercent, as stored)</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Miner</th><th class="num">Mines/s on screen</th><th class="num">Active XP/s</th><th class="num">Away XP/s</th><th class="num">Active ores/s</th><th class="num">Away ores/s</th></tr></thead>
      <tbody>
        <tr v-for="m in mine!.miners" :key="m.m"><td class="num">{{ m.m }}</td><td class="num">{{ m.minesPerSec.toFixed(2) }}</td><td class="num">{{ big(m.activeXp) }}</td><td class="num">{{ big(m.awayXp) }}</td><td class="num">{{ big(m.activeOres) }}</td><td class="num">{{ big(m.awayOres) }}</td></tr>
        <tr class="b"><td class="num">all</td><td></td><td class="num">{{ big(mine!.activeXp) }}</td><td class="num">{{ big(mine!.awayXp) }}</td><td class="num">{{ big(mine!.activeOres) }}</td><td class="num">{{ big(mine!.awayOres) }}</td></tr>
      </tbody>
    </table></div>
    <p class="note">Not yet checked against a live run: a rough 2026-10-04 reading (docs/resource-xp.md, 4.1M XP/s at Lv 120) is 2.4× what this gives for that day's save; unresolved.</p>
    <details class="how"><summary>How mining rates are worked out</summary>
    <p>† On screen a miner animates like a Tilling farmer: speed × (1 + armor/40), capped by 60 fps (≥ 100 speed = 6.67 mines/s), 9 frames per mine; XP only lands on the miningChance roll. Away credit counts speed/9 with no armor term and no cap, and adds the rift bonus to ores.</p>
    </details>
  </template>
  <template v-if="save && pct != null && skill === 'smithing'">
    <div class="sec-head"><h3>Smithing</h3><span class="m">XP per craft, not a rate</span></div>
    <p>Active Smithing isn't a rate: each upgrade you buy on the selected anvil gives <b>{{ big(smith!.craft) }} XP</b> † ({{ lv('CraftingLvUps') }} level(s) per craft). Away, the game credits one craft per 1.8 s at SmithingExpGiven[1] = {{ ((save.SmithingExpGiven as number[]) ?? [])[1] ?? 0 }} XP each †, so away Smithing XP is negligible.</p>

    <div class="sec-head"><h3>Anvil items</h3><span class="m">all 96, next craft's cost against what you hold</span></div>
    <p class="note">"Craft now" runs your materials forward from the current level at the low end of levels per craft; each item is costed alone, so two items on the same material can't both get what's listed. Maxed = past a capped bonus, or a miner kit at 7 (all miners armed). Locked = page 11, which opens 2 items per Smithy Cert level. Knee = the level where the bonus reaches half its ceiling; past it each level buys less than half what the first ones did, so those rows are dimmed as "past knee". Items with no knee are linear or convex in level (cost growth is their only limit) or their formula isn't read yet. Highlighted rows (green edge, bold name) are still worth crafting: unlocked and below their knee or uncapped, whether or not you hold the materials. Timelesseum (94) is excluded; nothing in the game reads it. ⚠ panel = the game's own description of the item disagrees with the formula it applies; hover for both.</p>
    <div class="tbl wide"><table class="list">
      <caption class="m">Show <select v-model="show"><option value="all">all</option><option value="craftable">craftable now</option><option value="open">worth crafting</option><option value="done">maxed or past knee</option></select> · click a header to sort</caption>
      <thead><tr><th class="num sortable" @click="sortBy('item')">#{{ arrow('item') }}</th><th class="sortable" @click="sortBy('name')">Item{{ arrow('name') }}</th>
        <th class="num sortable" @click="sortBy('level')">Level{{ arrow('level') }}</th><th class="num">Knee (level / knee)</th><th>Next craft costs (you hold)</th>
        <th class="num sortable" @click="sortBy('gain')">Craft now{{ arrow('gain') }}</th><th class="sortable" @click="sortBy('status')">Status{{ arrow('status') }}</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.item" :class="{ muted: !r.worth, worth: r.worth }">
          <td class="num">{{ r.item }}<span class="muted"> p{{ r.page }}</span></td><td>{{ r.name }}<span v-if="r.panel" class="warn" :title="`In-game panel text is wrong: ${r.panel}`"> ⚠ panel</span></td>
          <td class="num">{{ r.level.toLocaleString() }}<span v-if="r.cap != null" class="muted"> / {{ r.cap.toLocaleString() }}</span></td>
          <td class="num" :title="r.knee ? `${r.knee.src}; ${Math.round(100 * r.knee.pctCeiling)}% of the ceiling` : 'no knee: linear/convex, or formula not read'">
            <template v-if="r.knee">{{ r.knee.knee.toLocaleString() }} · <b>{{ Math.round(100 * r.knee.pctKnee).toLocaleString() }}%</b><span class="muted"> ({{ Math.round(100 * r.knee.pctCeiling) }}% of ceiling)</span></template><span v-else class="muted">—</span></td>
          <td><span v-for="c in r.cost" :key="c.currency" class="cost" :class="{ short: c.owned < c.cost }">{{ c.label }} {{ big(c.cost) }} ({{ big(c.owned) }})</span></td>
          <td class="num"><template v-if="r.crafts">→ {{ r.to.toLocaleString() }} <span class="muted">({{ r.crafts }}×, +{{ Math.round(100 * gain(r)) }}%)</span></template><span v-else class="muted">—</span></td>
          <td>{{ r.status }}</td></tr>
      </tbody>
    </table></div>

  </template>
  <template v-if="save && pct != null && skill === 'mining'">
    <div class="sec-head"><h3>Fishing</h3><span class="m">summary; details on the Fishing page</span></div>
    <p>Active: one catch per ~{{ ACTIVE_CATCH_SECONDS }} s (measured live). Away: one catch per bite wait, no reel animation. Details and hook/rod upgrades on the Fishing tab.
      <span v-if="fish!.fishPerCatch != null">Fish per catch (FishGiven, as stored): <b>{{ big(fish!.fishPerCatch) }}</b>; away fish credit isn't traced.</span></p>
    <p v-if="fish!.away == null" class="note">Away fishing needs the local save (FishingTimeMin/Max aren't in Steam Cloud saves).</p>
  </template>
  <p v-if="save && pct == null" class="muted">Away % can't be computed for this save (a Realm fruit grants away gains; its multipliers aren't ported).</p>
  <p v-if="!save" class="muted">Load a save.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; }
.tbl { max-width: 760px; }
tr.b td { font-weight: 600; }
.tbl.wide { max-width: none; }
.sortable { cursor: pointer; user-select: none; }
.cost { white-space: nowrap; margin-right: 10px; }
.short { color: var(--bad, #d55); }
tr.worth td:first-child { box-shadow: inset 3px 0 0 var(--good, #4caf7d); }
tr.worth td:nth-child(2) { font-weight: 600; }
.warn { color: var(--warn, #d9a441); font-size: 12px; cursor: help; }
</style>
