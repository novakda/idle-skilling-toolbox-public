<script setup lang="ts">
import { computed, ref } from 'vue'
import { buyList, perkPlan, type GameImpacts, type PerkRow } from '../perk-plan'

const props = defineProps<{ save: Record<string, unknown> | null }>()
// Combat-stat impacts from the game's own code (src/perk-impacts.ts, refreshed with the live save); absent off the author's machine.
const game = ref<GameImpacts | null>(null)
fetch('/data/perk-impacts.json').then((r) => (r.ok ? r.json() : null)).then((j) => { game.value = j }).catch(() => {})
const rows = computed(() => (props.save ? perkPlan(props.save, game.value) : []))
const num = (v: number) => (v >= 1e6 ? v.toExponential(2) : (+v.toPrecision(4)).toLocaleString())
const bal = computed(() => ({ AP: Number(props.save?.APtoSpend ?? 0), BP: Number(props.save?.BPtoSpend ?? 0) }))
// What to buy right now with the balance you hold (greedy by % gain per cost; perks.ts buyList).
const lockText = (l: NonNullable<PerkRow['lock']>) => ('need' in l ? `Locked: needs ${l.need}` : 'wiki' in l ? 'Locked behind a cyan key per the wiki (not checked in code)' : `Locked: needs key #${l.key} (you hold ${l.held})`)
const lockedTop = (cur: 'AP' | 'BP') => rows.value.filter((r) => r.currency === cur && r.lock && r.impact.length && r.next != null).slice(0, 6)
const shop = computed(() => ({ AP: buyList(rows.value, 'AP', bal.value.AP), BP: buyList(rows.value, 'BP', bal.value.BP) }))
</script>

<template>
  <div class="page-head">
    <h2>Perks</h2>
    <p>Which ascension (AP) and rebirth (BP) perk levels to buy next, ranked by % gain per point spent.</p>
    <div v-if="save" class="tiles">
      <div class="tile"><b>{{ num(bal.AP) }}</b><span>AP to spend</span></div>
      <div class="tile"><b>{{ shop.AP.buys.length }}</b><span>AP perks to buy now</span></div>
      <div class="tile"><b>{{ num(bal.BP) }}</b><span>BP to spend</span></div>
      <div class="tile"><b>{{ shop.BP.buys.length }}</b><span>BP perks to buy now</span></div>
    </div>
  </div>
  <p class="note">Ranked by best % gain per AP/BP, priced by re-running this app's formulas with one more level; † = from the game's own code.</p>
  <details class="how"><summary>How the ranking is worked out</summary>
  <p>Each perk's next level, priced by re-running this app's formulas with one more level. Ranked by best % gain per AP/BP.
    Perks that change no rate (unlocks, starting levels, crystals, tokens…) say what the next level gives, in italics; they rank below every % gain. Balance: {{ num(bal.AP) }} AP, {{ num(bal.BP) }} BP;
    "Buy now" / "After reset" = levels of that one perk you could buy if you spent everything on it; "after reset" adds what ascending (AP) or rebirthing (BP) now would pay.
    † = from the game's own code (combat, kills, cash, ores, fish, smithing EXP; data/perk-impacts.json, refreshed with the live save).</p>
  </details>
  <section v-for="cur in ['AP', 'BP'] as const" :key="'shop' + cur" class="shop">
    <div class="sec-head"><h3>Buy now with {{ num(bal[cur]) }} {{ cur }}</h3><span class="m">greedy, best % gain per {{ cur }} first</span></div>
    <div v-if="shop[cur].buys.length" class="tbl"><table class="list nosort">
      <thead><tr><th class="num">#</th><th>Perk</th><th class="num">Levels</th><th class="num">Spend</th><th>Gain (approx.)</th></tr></thead>
      <tbody><tr v-for="b in shop[cur].buys" :key="b.i"><td class="num">{{ b.i }}</td><td>{{ b.name ?? '(unnamed)' }}</td><td class="num">{{ b.from }} → {{ b.to }}</td>
        <td class="num">{{ num(b.spent) }}</td><td>+{{ (b.gain * 100).toFixed(1) }}% {{ b.output }}</td></tr></tbody>
    </table></div>
    <p v-else class="note">Nothing modelled is affordable yet.</p>
    <div v-if="lockedTop(cur).length" class="note">Skipped as locked 🔒:
      <ul><li v-for="r in lockedTop(cur)" :key="r.i"><b>{{ r.name }}</b>: {{ lockText(r.lock!) }}</li></ul></div>
    <p v-if="shop[cur].buys.length" class="note">{{ num(shop[cur].left) }} {{ cur }} left. Each next level goes to the best % gain per {{ cur }}, all outputs weighted equally (shift toward what you value more).</p>
  </section>
  <template v-for="cur in ['AP', 'BP'] as const" :key="cur">
    <div class="sec-head"><h3>{{ cur === 'AP' ? 'Ascension perks (AP)' : 'Rebirth perks (BP)' }}</h3><span class="m">every perk, next level priced</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Perk</th><th class="num">Level</th><th class="num">Next cost</th><th>Next level does</th><th class="num">Buy now</th><th class="num">After reset</th><th>Effect</th><th>Total now</th></tr></thead>
      <tbody>
        <tr v-for="r in rows.filter((x) => x.currency === cur)" :key="r.i" :class="{ muted: !r.impact.length }">
          <td class="num">{{ r.i }}</td><td>{{ r.name ?? '(unnamed)' }}</td>
          <td class="num">{{ r.level }}/{{ r.capped ? r.max : '∞' }}</td>
          <td class="num">{{ r.next == null ? 'max' : num(r.next) }}<span v-if="r.lock" class="lock" :title="lockText(r.lock)"> 🔒</span></td>
          <td v-if="r.impact.length">{{ r.impact.map((x) => `${x.change > 0 ? '+' : ''}${(x.change * 100).toFixed(2)}% ${x.output}${x.game ? ' †' : ''}`).join(', ') }}</td>
          <td v-else-if="r.next != null && r.label" class="label"><span class="kind">{{ r.label.kind }}</span> {{ r.label.text }}</td>
          <td v-else>{{ r.next == null ? '' : 'not modelled' }}</td>
          <td class="num" :class="{ 'st-good': r.affordable && !r.lock }">{{ r.affordable || '' }}</td><td class="num">{{ r.afterReset || '' }}</td>
          <td class="eff">{{ r.effect }}</td><td class="eff">{{ r.total }}</td>
        </tr>
      </tbody>
    </table></div>
  </template>
</template>

<style scoped>
h3 { font-size: 16px; }
.muted td:not([class*=st-]) { color: var(--muted); }
.eff { max-width: 320px; }
.label { font-style: italic; }
.kind { font-style: normal; font-size: 11px; padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; margin-right: 4px; }
.lock { cursor: help; }
.note { color: var(--muted); font-size: 13px; }
</style>
