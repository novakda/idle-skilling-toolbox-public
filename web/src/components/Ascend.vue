<script setup lang="ts">
import { computed, ref } from 'vue'
import { levelsPerCraft, preAscendDeck, relevelNeed, resetAdvice, resetCompare, soulsKept, startGold, type AscendSnap } from '../ascend'
import { ascendGain } from '../load-bonuses'
import { perkPlan, type GameImpacts } from '../perks'
import { apNodeNext } from '../skilltree'
import { SOULS } from '../rift'
import { inBookOrder, tabOf, tabTitle } from '../card-art'
import Icon from './Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const gain = computed(() => { try { return props.save ? ascendGain(props.save) : null } catch { return null } })
// When to ascend / rebirth (ascend.ts resetAdvice): save snapshots for the recent rate, game perk impacts for what it buys.
const snaps = ref<AscendSnap[]>([]), impacts = ref<GameImpacts | null>(null)
const get = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null)
get('/data/ascend-history.json').then((j) => { snaps.value = j ?? [] })
get('/data/perk-impacts.json').then((j) => { impacts.value = j })
const advice = computed(() => { try { return props.save ? resetAdvice(props.save, snaps.value, perkPlan(props.save, impacts.value)) : null } catch (e) { console.warn('reset advice:', e); return null } })
// Keep going vs ascend vs rebirth: what each pays and buys against what it wipes and the time back (ascend.ts resetCompare).
const compare = computed(() => { try { return props.save && advice.value ? resetCompare(props.save, snaps.value, perkPlan(props.save, impacts.value), advice.value) : null } catch (e) { console.warn('reset compare:', e); return null } })
const CMP_ROWS = [['pays', 'Pays'], ['buys', 'Buys'], ['wipes', 'Wipes'], ['keeps', 'Keeps'], ['back', 'Back to here']] as const
const CALL = { now: 'now', wait: 'wait', unknown: '—' } as const
const big = (v: number) => Math.round(v).toLocaleString()
const sci = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : big(v))
// Ascend readiness: what carries over (ascend.ts) and the deck to hold while ascending.
const ready = computed(() => {
  const s = props.save
  if (!s || !gain.value) return null
  try {
    const deck = preAscendDeck(s), step = levelsPerCraft(s)
    const need = relevelNeed(s), need1 = new Map(relevelNeed(s, 1).map((r) => [r.currency, r.need]))
    return { deck, step, skill19: Number((s.SkillLevels as number[] | undefined)?.[19] ?? 0), shrine3: Number((s.ShrineLevels as number[] | undefined)?.[3] ?? 0),
      ores: need.map((r) => ({ ...r, need1: need1.get(r.currency) ?? 0 })), short: need.filter((r) => r.surplus < 0).length,
      // Ascend zeroes skill 19, so crafts add 1 level each until it is bought back: the count you face first.
      short1: need.filter((r) => r.owned < (need1.get(r.currency) ?? 0)).length,
      souls: soulsKept(s, deck.keep[1]!), skip: startGold(s), wait: startGold(s, false) }
  } catch (e) { console.warn('ascend readiness:', e); return null }
})
// Before-you-ascend checklist (docs/resets.md): what an ascend zeroes or keeps only in part, in the order to do it.
// done: true / false, or null when there's nothing to check (do it every time).
const checklist = computed(() => {
  const s = props.save, r = ready.value
  if (!s || !r) return []
  // The game shows Math.floor(Skillpoints); slot 37 is the only spend that pays at the press. White/pink = SoulsTotal[7]/[8].
  const sp = Math.floor(Number(s.Skillpoints ?? 0)), ap37 = apNodeNext(s), slots = r.deck.cards.length
  const souls = (s.SoulsTotal as number[] | undefined) ?? [], white = Number(souls[7] ?? 0), pink = Number(souls[8] ?? 0)
  const sel = Number(s.CardDeckSelected ?? 0), eq = ((s.CardEquipped as number[] | undefined) ?? []).slice(slots * (sel - 1), slots * sel)
  const deckOn = slots > 0 && r.deck.cards.every((c) => eq.includes(c.id))
  const short = r.ores.filter((o) => o.surplus < 0).sort((a, b) => a.surplus / Math.max(a.need, 1) - b.surplus / Math.max(b.need, 1))
  const lost = r.souls.reduce((t, x) => t + x.banked - x.kept, 0)
  return [
    { done: short.length === 0, text: short.length ? `Gather ores, fish and materials: short on ${short.length} to re-craft smithing back${r.step > 1 ? ` (${r.short1} at 1 level per craft, until the multicraft skill-tree node is bought back)` : ''}.` : 'Ores, fish and materials cover re-crafting smithing back.',
      detail: short.length ? 'They are kept through the ascend; smithing items reset to 0. Fish names are the wiki\'s, order unverified.' : '',
      sub: short.map((o) => ({ label: o.label, have: sci(o.owned), need: sci(o.need), short: sci(-o.surplus) })) },
    ap37 != null && sp >= ap37
      ? { done: false, text: `Spend perk points on tree slot 37 (AP on ascend, +4% per level): next level costs ${ap37}, you have ${sp}.`, detail: 'Every other tree level resets to 0 with the points; slot 37 pays out at the press.' }
      : { done: true, text: 'No perk points worth spending before ascending.', detail: `${ap37 == null ? 'Slot 37 (AP on ascend) is maxed or locked' : `Slot 37 needs ${ap37}`}; the ${sp} unspent points and every tree level reset to 0.` },
    { done: white + pink < 1, text: white + pink >= 1 ? 'Spend white and pink souls on constructions and rift Pro levels; keep the other colours.' : 'No white or pink souls to spend; keep the other colours.',
      detail: `Constructions and Pro levels survive the ascend; rift levels and upgrades reset, so souls spent on rifts now are lost entirely instead of ${r.deck.keep[1]}% kept. White ${sci(white)}, pink ${sci(pink)}.${lost > 0 ? ` ${sci(lost)} souls (${100 - r.deck.keep[1]!}%) are lost to the ascend either way.` : ''}` },
    { done: null, text: `Collect gold: the next run starts with ${+(r.skip.keep * 100).toFixed(1)}% of what you hold (Skip).`, detail: `Now ${sci(Number(s.goldcoin ?? 0))} held → ${sci(r.skip.gold)} start gold. Every coin you add before ascending is worth ${r.skip.keep.toFixed(3)} at the start.` },
    ...(slots ? [{ done: deckOn, text: deckOn ? 'Ascend deck is equipped.' : `Equip the ascend deck (deck ${r.deck.spare ?? 'any'}), then open the Ascend menu.`, detail: `Souls kept ${r.deck.keep[0]}% → ${r.deck.keep[1]}%; cards listed below.` }] : []),
    { done: null, text: 'Press Ascend, then click Skip on the credits.', detail: `Skip keeps ${+(r.skip.keep * 100).toFixed(1)}% of your gold; waiting them out keeps ${+(r.wait.keep * 100).toFixed(1)}%.` },
  ]
})
</script>

<template>
  <div class="page-head">
    <h2>Ascend</h2>
    <p>When to ascend or rebirth and why, what an ascend carries over, the deck to hold while you press it, and whether you can re-craft your smithing back.</p>
    <div v-if="ready && gain" class="tiles">
      <div v-if="advice" class="tile"><b :class="{ 'st-good': advice.ascend.call === 'now' }">{{ CALL[advice.ascend.call] }}</b><span>ascend</span></div>
      <div v-if="advice" class="tile"><b :class="{ 'st-good': advice.rebirth.call === 'now' }">{{ CALL[advice.rebirth.call] }}</b><span>rebirth</span></div>
      <div class="tile"><b>{{ big(ready.deck.apNext) }}</b><span>AP, deck equipped</span></div>
      <div class="tile"><b>{{ ready.deck.keep[1] }}%</b><span>souls kept</span></div>
      <div class="tile"><b>{{ sci(ready.skip.gold) }}</b><span>start gold (Skip)</span></div>
      <div class="tile"><b :class="{ 'st-bad': ready.short }">{{ ready.short }}/{{ ready.ores.length }}</b><span>short to re-craft<template v-if="ready.step > 1"> ({{ ready.short1 }} at 1/craft)</template></span></div>
    </div>
  </div>
<section v-if="compare">
    <div class="sec-head"><h3>Keep going, ascend or rebirth</h3><span class="m">what each unlocks against what it costs to regain</span></div>
    <p class="next"><b>{{ compare.verdict }}</b></p>
    <div class="tbl cmp"><table class="list">
      <thead><tr><th></th><th v-for="o in compare.options" :key="o.key" :class="{ pick: o.key === compare.pick }">{{ o.title }}<template v-if="o.key === compare.pick"> ✓</template></th></tr></thead>
      <tbody><tr v-for="[k, label] in CMP_ROWS" :key="k"><th>{{ label }}</th><td v-for="o in compare.options" :key="o.key" :class="{ pick: o.key === compare.pick }">{{ o[k] }}</td></tr></tbody>
    </table></div>
    <p v-if="compare.plan" class="next"><b>Plan:</b> {{ compare.plan }}</p>
    <p class="note">"Back to here" is an estimate from the save snapshots: when this run first reached today's map progress (ascend), and when this rebirth cycle's tilling and botany reached today's BP terms (rebirth). "With what it buys" redoes that climb with the perks the reset buys: the map climb as damage-walled (×N kill rate at the frontier reaches each wall when your rebuilt damage was 1/N of the last climb's there), the farm terms at their bought growth rate.</p>
    <details v-if="compare.climb.factors.length">
      <summary><b>What makes the climb back faster (or slower)</b></summary>
      <div class="tbl cmp"><table class="list">
        <thead><tr><th>Factor</th><th>After an ascend</th><th>After a rebirth</th></tr></thead>
        <tbody><tr v-for="f in compare.climb.factors" :key="f.what"><th>{{ f.what }}<br><small class="muted">{{ f.kind }}</small></th><td>{{ f.ascend }}</td><td>{{ f.rebirth }}</td></tr></tbody>
      </table></div>
      <p class="note">modelled = the game's formula, applied exactly; estimate = game formulas plus an assumption about the climb (stated in the row); not modelled = direction known, size not determinable from the save and snapshots.</p>
    </details>
  </section>
<section v-if="advice">
    <h3>Do this next</h3>
    <template v-for="a in [advice.ascend, advice.rebirth]" :key="a.line">
      <p class="next"><b>{{ a.line }}</b></p>
      <div class="tbl why"><table class="list"><tbody><tr v-for="[k, v] in a.evidence" :key="k"><th>{{ k }}</th><td>{{ v }}</td></tr></tbody></table></div>
    </template>
  </section>
<section v-if="ready">
    <div class="sec-head"><h3>Before you ascend</h3><span class="m">in order; ✓ = already done on this save</span></div>
    <ol class="check">
      <li v-for="(c, i) in checklist" :key="i" :class="{ ok: c.done === true }"><span class="box">{{ c.done === true ? '✓' : '☐' }}</span> <b>{{ c.text }}</b><span v-if="c.detail" class="muted"> {{ c.detail }}</span>
        <div v-if="'sub' in c && c.sub?.length" class="tbl sub"><table class="list">
          <thead><tr><th>Collect</th><th class="num">More</th><th class="num">Have</th><th class="num">Need</th></tr></thead>
          <tbody><tr v-for="x in c.sub" :key="x.label"><td>☐ {{ x.label }}</td><td class="num">{{ x.short }}</td><td class="num">{{ x.have }}</td><td class="num">{{ x.need }}</td></tr></tbody>
        </table></div></li>
    </ol>
    <div v-if="ready.deck.cards.length" class="sec-head"><h3>Equip before ascending</h3><span class="m">deck {{ ready.deck.spare ?? 'any' }}<template v-if="ready.deck.spare">, no activity linked to it</template></span></div>
    <div v-if="ready.deck.cards.length" class="tbl deck"><table class="list">
      <thead><tr><th>Card</th><th class="num">Level</th><th>Where (tab · row col)</th></tr></thead>
      <tbody><tr v-for="c in inBookOrder(ready.deck.cards)" :key="c.id">
        <td><Icon kind="card" :id="c.id" :name="c.name" /></td><td class="num">{{ c.level }}</td>
        <td :title="tabTitle(c)">{{ tabOf(c) }}<small v-if="tabTitle(c)" class="muted"> ({{ tabTitle(c) }})</small></td>
      </tr></tbody>
    </table></div>
    <p v-if="ready.deck.cards.length">Souls kept {{ ready.deck.keep[0] }}% → <b>{{ ready.deck.keep[1] }}%</b>;
      <template v-if="ready.deck.apNext > ready.deck.apNow + 0.5">AP {{ big(ready.deck.apNow) }} → <b>{{ big(ready.deck.apNext) }}</b>.</template>
      <template v-else>AP unchanged ({{ big(ready.deck.apNow) }}): no owned card adds AP while equipped<template v-if="ready.deck.cbAP[0]! > 0"> (Gorshank's {{ +ready.deck.cbAP[0]!.toFixed(1) }}% is a passive, already counted; equipped it adds AP from level 4)</template>.</template></p>
    <p v-else>No owned card raises AP or souls kept when equipped.</p>
    <p class="note">Select the deck, then open the Ascend menu: souls kept is set when that menu opens (it shows "you keep X% of your souls"), AP is read when you press Ascend. Opening a screen with a linked deck swaps decks.</p>
    <div class="sec-head"><h3>Start gold</h3><span class="m">{{ sci(Number(save?.goldcoin ?? 0)) }} held now</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>On the credits</th><th class="num">Start gold</th><th class="num">Of what you hold</th></tr></thead>
      <tbody><tr><td>Click Skip</td><td class="num">{{ sci(ready.skip.gold) }}</td><td class="num">{{ +(ready.skip.keep * 100).toFixed(1) }}%</td></tr>
        <tr><td>Let them run out</td><td class="num">{{ sci(ready.wait.gold) }}</td><td class="num">{{ +(ready.wait.keep * 100).toFixed(1) }}% (that path caps at 30%)</td></tr></tbody>
    </table></div>
    <p class="note">Each extra coin held at ascend starts the next run with {{ ready.skip.keep.toFixed(3) }} coins (Skip).</p>
    <div class="sec-head"><h3>Souls</h3><span class="m">the banked souls rifts spend; ascend keeps {{ ready.deck.keep[1] }}% with the deck above, conversion progress resets</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Soul type</th><th class="num">Banked</th><th class="num">Kept</th></tr></thead>
      <tbody><tr v-for="r in ready.souls" :key="r.i"><td :title="`SoulsTotal[${r.i}]`">{{ SOULS[r.i] ? `${SOULS[r.i]} souls` : `Type ${r.i}` }}</td><td class="num">{{ sci(r.banked) }}</td><td class="num">{{ sci(r.kept) }}</td></tr></tbody>
    </table></div>
    <details>
      <summary><b>Smithing re-level:</b> ores, fish and materials are kept, items 1–80 reset to 0. {{ ready.short }} of {{ ready.ores.length }} currencies short of re-crafting everything back.</summary>
      <p class="note">Expected cost at {{ ready.step }} level(s) per craft (<span title="skill-tree node 19">multicraft</span> at {{ ready.skill19 }}; it resets too, so "1/craft" is the cost until you buy it back), {{ Math.min(15 * ready.shrine3, 1000) / 10 }}% of crafts free (<span title="Asylum shrine 3">Recoup shrine</span>).</p>
      <div class="tbl"><table class="list">
        <thead><tr><th>Currency</th><th class="num">Held</th><th class="num">Need</th><th class="num">Need at 1/craft</th><th class="num">Surplus</th></tr></thead>
        <tbody><tr v-for="r in ready.ores" :key="r.currency"><td>{{ r.label }}</td><td class="num">{{ sci(r.owned) }}</td><td class="num">{{ sci(r.need) }}</td><td class="num muted">{{ sci(r.need1) }}</td>
          <td class="num" :class="{ 'st-bad': r.surplus < 0 }">{{ r.surplus < 0 ? `short ${sci(-r.surplus)}` : sci(r.surplus) }}</td></tr></tbody>
      </table></div>
    </details>
  </section>
<p v-else class="muted">Load a local save to see what an ascend carries over.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; }
.tbl { max-width: 760px; }
.tbl.cmp { max-width: 1200px; margin-bottom: 8px; } .cmp th, .cmp td { vertical-align: top; text-align: left; } .cmp td { width: 33%; } .cmp .pick { background: var(--good-bg); }
.tbl.why { max-width: 980px; margin-bottom: 10px; } .why th { text-align: left; white-space: nowrap; vertical-align: top; }
summary { cursor: pointer; margin-bottom: 8px; }
.check { list-style: none; padding-left: 0; max-width: 820px; }
.check li { margin: 6px 0; }
.check li.ok b { color: var(--muted); font-weight: 500; }
.box { display: inline-block; width: 1.2em; }
.sub { margin: 4px 0 0 1.6em; } .sub table.list { min-width: 0; }
</style>
