<script setup lang="ts">
import { computed, ref } from 'vue'
import { botanyBoosts, botanyGrowth, botanyHarvest, botanyPots, grayDrankPerLevelUp, speedCap, tierPerks } from '../botany-calc'
import { awayPercent } from '../away'
import { withDeckLinks } from '../cards-calc'
import discoveryStatic from '../data/discovery-static.json'
import Icon from './Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const names = (discoveryStatic as { flowerNames: string[] }).flowerNames
const n = (v: unknown) => Number(v ?? 0) || 0

const withLinks = computed(() => (props.save ? withDeckLinks(props.save) : null))
const pots = computed(() => (props.save ? botanyPots(props.save) : []))
const boosts = computed(() => (withLinks.value ? botanyBoosts(withLinks.value) : null))
const growth = computed(() => (withLinks.value && boosts.value ? botanyGrowth(withLinks.value, boosts.value.speed, awayPercent(withLinks.value) ?? 30) : []))
// Cloud saves don't carry each pot's planting bonuses or the amounts fed: recompute from amounts the player sets.
const remembered = (k: string) => { try { return Number(localStorage.getItem(k)) || 1000 } catch { return 1000 } }
const fedSeeds = ref(remembered('idle-skilling.botany.fedSeeds')), fedFlowers = ref(remembered('idle-skilling.botany.fedFlowers'))
const remember = (k: string, v: number) => { try { localStorage.setItem(k, String(v)) } catch { /* not persisted */ } }
const plantingKnown = computed(() => Array.isArray(props.save?.FlowersGivenBONUS))
const harvest = computed(() => (withLinks.value && boosts.value
  ? botanyHarvest(withLinks.value, boosts.value, plantingKnown.value ? undefined : { seeds: fedSeeds.value, flowers: fedFlowers.value }) : []))
const fmtT = (sec: number) => (!isFinite(sec) ? '—' : sec < 60 ? `${+sec.toFixed(1)}s` : sec < 3600 ? `${Math.ceil(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const cap = computed(() => (withLinks.value ? speedCap(withLinks.value) : null))
const gray = computed(() => (props.save ? grayDrankPerLevelUp(props.save) : 0))
const perks = computed(() => (props.save ? tierPerks(props.save) : null))
const gold = computed(() => n(props.save?.goldcoin))
const level = computed(() => n(props.save?.HerbloreLV))
const progress = computed(() => n(props.save?.HerbloreEXP) / Math.max(1, n(props.save?.HerbloreREQ)))
const flowers = computed(() =>
  ((props.save?.flowersOwned as number[] | undefined) ?? []).map((q, i) => ({ i, name: names[i] ?? `#${i}`, q: n(q) })).filter((f) => f.i > 0 && f.q > 0),
)
const buyable = computed(() => pots.value.reduce((k, p) => k + +(gold.value >= p.valueCost) + +(gold.value >= p.speedCost), 0))

function fmt(v: number): string {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) < 1e3) return String(+v.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(v)) / 3))
  return i < units.length - 1 || v < 1e33 ? `${+(v / 10 ** (i * 3)).toFixed(2)}${units[i]}` : v.toExponential(2)
}
</script>

<template>
  <div class="page-head">
    <h2>Botany</h2>
    <p>Each pot's upgrades and what they cost, what a harvest pays now, and when the next overgrowth lands.</p>
    <div v-if="save" class="tiles">
      <div class="tile"><b>{{ level }}</b><span>Botany level ({{ (progress * 100).toFixed(1) }}% to next)</span></div>
      <div class="tile"><b>{{ fmt(gold) }}</b><span>gold</span></div>
      <div class="tile"><b>{{ buyable }}</b><span>pot upgrades affordable</span></div>
      <div class="tile"><b>×{{ fmt(boosts?.speed ?? 0) }}</b><span>growth speed</span></div>
    </div>
  </div>
  <p v-if="!save" class="note">Load a save to see Botany.</p>
  <template v-else>
    <div class="sec-head"><h3>Pots</h3><span class="m">multipliers computed from your save</span></div>
    <p class="facts"><span><b>Speed</b> ×{{ fmt(boosts?.speed ?? 0) }}</span><span><b>Flowers</b> ×{{ fmt(boosts?.flower ?? 0) }}</span><span><b>EXP</b> ×{{ fmt(boosts?.exp ?? 0) }}</span>
      <span><b>Tier perks alone</b> ×{{ fmt(perks!.speedBoost) }} / ×{{ fmt(perks!.flowerBoost) }} / ×{{ fmt(perks!.expBoost) }}</span><span><b>Pots adding their levels to their own speed</b> {{ perks!.potSpeedFromLevels }}</span></p>
    <div class="tbl"><table class="list">
      <thead>
        <tr><th class="num">Pot</th><th>Plant</th><th class="num">Tier</th><th class="num">Value lv</th><th class="num">next: +EXP</th><th class="num">cost</th><th class="num">Speed lv</th><th class="num">next: speed</th><th class="num">cost</th>
          <th class="num" title="Flowers and Botany EXP from harvesting this pot now (all multipliers, current overgrowth)">harvest now: flowers / EXP</th><th class="num" title="Pot-specific speed multiplier (HerbloreSpeedBOOST3)">pot speed</th><th class="num" title="Progress to the next overgrowth level">OG bar</th><th class="num" title="Time to the next overgrowth level while you watch the Botany screen">next OG (watching)</th><th class="num" title="Time to the next overgrowth level while away, at your away %">next OG (away)</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in pots" :key="p.pot">
          <td class="num">{{ p.pot }}</td>
          <td><Icon v-if="names[p.plant]" kind="flower" :id="p.plant" :name="names[p.plant]!" /><template v-else>—</template><span v-if="p.overgrowth" class="muted"> · OG {{ p.overgrowth }}</span></td>
          <td class="num">{{ p.tier }}</td>
          <td class="num">{{ p.value }}</td><td class="num">+{{ +p.valueExpGain.toFixed(3) }}</td>
          <td class="num" :class="{ 'st-good': gold >= p.valueCost }">{{ fmt(p.valueCost) }}</td>
          <td class="num">{{ p.speed }}<span v-if="cap && p.speed >= cap.buyBelow" class="muted"> (max)</span></td>
          <td class="num">+{{ +p.speedGainPct.toFixed(2) }}%</td>
          <td class="num" :class="{ 'st-good': gold >= p.speedCost }">{{ fmt(p.speedCost) }}</td>
          <td class="num">{{ harvest[p.pot - 1] ? `${fmt(harvest[p.pot - 1]!.flowers)} / ${fmt(harvest[p.pot - 1]!.exp)}` : '—' }}</td>
          <td class="num">×{{ +p.potSpeed.toFixed(2) }}</td>
          <td class="num">{{ growth[p.pot - 1] ? Math.round(growth[p.pot - 1]!.progress * 100) + '%' : '—' }}</td>
          <td class="num">{{ growth[p.pot - 1] ? fmtT(growth[p.pot - 1]!.watching) : '—' }}</td>
          <td class="num">{{ growth[p.pot - 1] ? fmtT(growth[p.pot - 1]!.away) : '—' }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">Green cost = affordable now. Both upgrades add +0.02 flowers per harvest; value adds EXP, speed shortens growth.
      <template v-if="cap">Speed upgrades can be bought up to lv {{ Math.ceil(cap.buyBelow) }}; enter Botany from a screen whose deck has Disciple B / Lunardyl (MaxBotanySpdLV) cards. </template>
      <template v-if="plantingKnown">Planting bonuses come from your save.</template>
      <template v-else>This save doesn't record what each pot was fed at planting; harvests assume
        <label><input v-model.number="fedSeeds" type="number" min="0" class="num" @change="remember('idle-skilling.botany.fedSeeds', fedSeeds)" /> seeds</label> and
        <label><input v-model.number="fedFlowers" type="number" min="0" class="num" @change="remember('idle-skilling.botany.fedFlowers', fedFlowers)" /> flowers</label>
        per pot (the game's default is 1000 each). Load your local save (.log) for exact values.</template></p>
    <details v-if="cap" class="how"><summary>How the speed cap is worked out</summary>
    <p>Max speed lv {{ +cap.max.toFixed(2) }} + 25:
      120 base, +10 per tier-5 pot, +{{ +cap.potions.toFixed(2) }} potions, +{{ cap.cards }} cards, +{{ cap.perk }} Tilling perk. The game counts the cap cards on the deck that was on when you
      entered Botany, not the Botany deck.
      The only way past the cap is Gray Drank: each Botany level-up gives every pot +1 speed and value, uncapped
      (now {{ +gray.toFixed(2) }} levels per level-up on average).</p>
    </details>
    <div class="sec-head"><h3>Flowers owned</h3></div>
    <div class="tbl flowers"><table class="list">
      <thead><tr><th>Flower</th><th class="num">Owned</th></tr></thead>
      <tbody><tr v-for="f in flowers" :key="f.name"><td><Icon kind="flower" :id="f.i" :name="f.name" /></td><td class="num">{{ fmt(f.q) }}</td></tr></tbody>
    </table></div>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; }
.tbl.flowers { max-width: 420px; } .flowers table.list { min-width: 0; }
</style>
