<script setup lang="ts">
import { computed } from 'vue'
import { withDeckLinks } from '../cards-calc'
import { CRUSADES, materialName } from '../crusade'
import { BOOSTERS, boosterEV, crafts, deckSwaps, decks, deltaText, kind, lines, localOnly, lvReq, MUTATORS, name, need, owned, recipe, slotsMax, statText, thirdLineNeed, upgrades } from '../tinkering'
import Icon from './Icon.vue'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (k: string) => ((s.value?.[k] as number[] | undefined) ?? [])

const s = computed(() => (props.save ? withDeckLinks(props.save) : null))
const lv = computed(() => n(s.value?.TinkeringLV))
const bar = computed(() => (s.value ? n(s.value.TinkeringEXP) / Math.max(1, need(s.value, n(s.value.TinkeringREQ))) : 0))
const c = computed(() => (s.value ? crafts(s.value) : null))
const ds = computed(() => (s.value ? decks(s.value) : []))
const ups = computed(() => (s.value ? upgrades(s.value) : []))
const swaps = computed(() => new Map((s.value ? deckSwaps(s.value) : []).map((x) => [x.d, x])))
const times = (g: number) => `×${(Math.exp(g)).toPrecision(3)}`
const allText = (xs: { slot: number; to: number }[]) => xs.map((x) => `${SLOT_NAME[x.slot]}: ${name(x.to)}`).join(", ")
const route = computed(() => c.value?.route.slice(0, 8) ?? [])
const best = computed(() => c.value?.route[0] ?? null)
const linked = computed(() => ds.value.filter((d) => d.linkName))
const maxSlots = computed(() => (s.value ? slotsMax(s.value) : 5))
/** Which crusade drops a material, and from which difficulty (crusade.ts CRUSADES, the claim's drop table). */
const dropBy = (id: number) => Object.values(CRUSADES).flatMap((x) => x.drops.filter(([, m]) => m === id).map(([d]) => `${x.name}${d ? ` (difficulty ${d}+)` : ''}`)).join(', ')
const mats = computed(() => arr('CraftingMaterialsOwned').flatMap((q, id) => (id > 0 && (n(q) > 0 || n(arr('CraftingMaterialUNLOCKED')[id])) ? [{ id, q: n(q) }] : [])))
const SLOT_NAME: Record<number, string> = { 1: 'Weapon', 5: 'Helmet', 6: 'Shirt', 7: 'Pants', 2: 'Off-hand', 8: 'Pendant', 4: 'Pendant 2' }

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return i < units.length - 1 || x < 1e33 ? `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}` : x.toExponential(2)
}
const pct = (x: number) => `${+(100 * x).toFixed(x < 0.1 ? 1 : 0)}%`
const costText = (id: number) => {
  if (!s.value) return ''
  const r = recipe(s.value, id)
  return [...r.mats.map((m) => `${fmt(m.qty)} ${materialName(m.id)}`), ...(r.prev ? [`${r.prev.qty} ${name(r.prev.id)}`] : [])]
}
const madeText = (m: Map<number, number>) => [...m].map(([i, q]) => `${fmt(q)} ${name(i)}`).join(', ')
const SECTIONS = [['decks', 'Your tinker decks'], ['craft', 'What to craft next'], ['boosters', 'Booster upgrades'], ['materials', 'Materials held']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Tinkering</h2>
    <p>What your tinker gear gives, what to craft to open the next recipe, and which booster upgrades grow your gear the most.</p>
    <div v-if="s && c" class="tiles">
      <div class="tile"><b>Lv {{ lv }}</b><span>Tinkering level ({{ (100 * bar).toFixed(1) }}% to next)</span></div>
      <div class="tile"><b>{{ c.next ? `Lv ${c.next.lv}` : 'All open' }}</b><span>{{ c.next ? `next recipe: ${c.next.items.map(name).join(', ')}` : 'every recipe is unlocked' }}</span></div>
      <div class="tile"><b>{{ ds.length }} deck{{ ds.length === 1 ? '' : 's' }}</b><span>{{ linked.length ? `linked: ${linked.map((d) => `${d.d} → ${d.linkName}`).join(', ')}` : 'none linked: the equipped deck stays on everywhere' }}</span></div>
      <div class="tile"><b>{{ ups[0] ? `+${pct(ups[0].grow)}` : '—' }}</b><span>{{ ups[0] ? `best booster upgrade: every line of ${name(ups[0].id)} (expected)` : 'no booster upgrade beats your gear now' }}</span></div>
    </div>
  </div>
  <p v-if="!s || !c" class="note">Load a save to see Tinkering.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <li v-for="id in c.fresh" :key="'f' + id"><b>Craft one <Icon kind="gear" :id="id" :name="name(id)" /></b> ({{ kind(id) }}): unlocked, never crafted,
        and you hold what it costs. Crafted gear stays yours to equip.<ul><li v-for="m in costText(id)" :key="m">{{ m }}</li></ul></li>
      <li v-if="ups[0]"><b>{{ ups[0].what }} on <Icon kind="gear" :id="ups[0].id" :name="name(ups[0].id)" /></b> ({{ ups[0].cost }}): booster bonus
        +{{ fmt(ups[0].pct) }}% → expected +{{ fmt(ups[0].pct + ups[0].gain) }}%, so each of its lines grows about {{ pct(ups[0].grow) }}.</li>
      <li v-if="best && c.next"><b>Lv {{ c.next.lv }} ({{ c.next.items.map(name).join(', ') }}):</b>&nbsp;<template v-if="best.enough">craft {{ fmt(best.crafts) }} <Icon kind="gear" :id="best.id" :name="name(best.id)" /><template v-if="best.made.size"> (first {{ madeText(best.made) }})</template>; it takes {{ pct(best.use) }} of your {{ materialName(best.worst) }}.</template>
        <template v-else>not reachable with what you hold. The cheapest route, {{ fmt(best.crafts) }} × {{ name(best.id) }}<template v-if="best.made.size"> (first {{ madeText(best.made) }})</template>,
          needs {{ +best.use.toFixed(1) }}× your <Icon kind="material" :id="best.worst" :name="materialName(best.worst)" /> (you hold {{ pct(1 / best.use) }} of it; it drops from {{ dropBy(best.worst) || 'no crusade in the table' }}).</template></li>
    </ol>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'decks'">
    <div class="sec-head"><h3>Your tinker decks</h3><span class="m">7 gear slots each</span></div>
    <p v-if="localOnly(s)" class="warn">This save has no tinker deck list or deck links (a Steam Cloud save lacks both); only the gear equipped now is shown.</p>
    <details class="how"><summary>How decks and lines are worked out</summary>
    <p>A deck is 7 gear slots (a second pendant slot is bought with gems). A scene equips the deck linked to its activity
      († @22890216 for Tinkering, DeckLinkList[11 + deck]); an unlinked deck that you picked last stays on everywhere. Each line is the item's
      value × (1 + booster bonus) × (1 + <span title="Asylum shrine 2">Prodigious shrine</span>), the way the game totals your gear. Third lines open with Tunnel buildings.</p>
    </details>
    <template v-for="d in ds" :key="d.d">
      <div class="sec-head"><h4>Deck {{ d.d }}{{ d.selected ? ' (equipped now)' : '' }}</h4><span class="m">{{ d.linkName ? `linked to ${d.linkName}` : 'not linked' }}</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Slot</th><th>Item</th><th>Lines</th><th class="num">Booster bonus</th><th class="num">Booster slots used</th><th>Third line</th><th>Needs</th><th class="num">You have</th></tr></thead>
        <tbody>
          <tr v-for="x in d.slots.filter((x) => x.slot !== 4 || x.id || s!.SecondPendantSlotPurchased)" :key="x.slot">
            <td>{{ SLOT_NAME[x.slot] }}</td>
            <td><Icon v-if="x.id" kind="gear" :id="x.id" :name="name(x.id)" /><span v-else class="muted">empty</span></td>
            <td><template v-if="x.id"><span v-for="l in lines(s, x.id).filter((l) => l.on)" :key="l.t" class="line">{{ statText(l.t, l.v) }}</span></template></td>
            <td class="num">{{ x.id ? `+${fmt(n(arr('EquipmentBonusPct')[x.id]))}%` : '' }}</td>
            <td class="num">{{ x.id ? `${n(arr('EquipmentSlotsUsed')[x.id])} / ${maxSlots}` : '' }}</td>
            <template v-if="x.id && !n(arr('TinkerThirdLine')[x.id])"><td class="muted">{{ statText(lines(s, x.id)[2]!.t, lines(s, x.id)[2]!.v) }}</td>
              <td class="muted">{{ thirdLineNeed(s, x.id).building }} lv {{ thirdLineNeed(s, x.id).lv }}</td><td class="muted num">{{ thirdLineNeed(s, x.id).have }}</td></template>
            <td v-else colspan="3" class="muted">{{ x.id ? 'open' : '' }}</td>
          </tr>
        </tbody>
      </table></div>
      <div v-for="w in [swaps.get(d.d)]" :key="'w' + d.d" class="rec">
        <template v-if="!w?.goal">Not linked, so no goal to optimize for: link it to an activity to get suggestions.</template>
        <template v-else-if="!w.swaps.length">No better swap: every slot already holds your best owned gear for {{ d.linkName }}.</template>
        <template v-else><b>Suggested swaps for {{ d.linkName }}</b>
          <ol class="swaps"><li v-for="x in w.swaps.slice(0, 3)" :key="x.slot">Replace <Icon kind="gear" :id="x.from" :name="name(x.from)" v-if="x.from" /><span v-else>the empty slot</span> ({{ SLOT_NAME[x.slot] }})
            with <Icon kind="gear" :id="x.to" :name="name(x.to)" />: <b class="st-good">{{ times(x.gain) }}</b> <span class="muted">({{ x.delta.map((z) => deltaText(z.t, z.v)).join(', ') }})</span></li></ol>
          <div v-if="w.all.length > 1">All together ({{ allText(w.all) }}): <b class="st-good">{{ times(w.gain) }}</b></div>
        </template>
      </div>
    </template>
    <details class="how"><summary>How the swaps are ranked</summary>
    <p>A deck's goal is the gear stats its linked activity reads in the game's code (Crusades: Crusade EXP, Crusade Multiplier,
      Crusaders; All Combat: the fight stats plus Monster Cash, Card Chance and crusade-fight EXP). The gain is the factor on everything
      that activity reads multiplied together, every stat weighed alike: a % stat counts as its own ×(1 + total/100), Crusaders as
      a share of your crusader total, and on combat decks damage (one hit with crit) and max HP come from the fight model, so flat base
      damage counts for what it is next to the rest of your damage. Only gear you hold, each kind in its own slot, never the same
      pendant twice. Swaps that share a stat interact, so "all together" is picked one best swap at a time. Not priced (no total to
      weigh them against): max crusade energy and flat Ignore Defense.</p>
    </details>

    </template>

    <template v-else-if="sec === 'craft'">
    <div class="sec-head"><h3>What to craft next</h3><span class="m">ranked by reaching the next recipe with the smallest bite out of any one material</span></div>
    <p class="note">A craft click pays EXP for at most 10,000 crafts, so craft in clicks of 10,000 or fewer.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>That is what the wiki says
      Tinkering levels are for: they unlock recipes, and crafted gear stays yours. Per unlocked recipe: the crafts to level {{ c.next?.lv }}
      (each craft's EXP from the craft click's own code, † @22937974; the requirement grows ×1.3312 a level, † @23029288), the previous-tier
      copies those crafts use (crafted first when you lack them; those crafts earn EXP too, counted at today's rate), and the largest share of
      any one material that takes.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Recipe</th><th class="num">Crafts</th><th>Previous-tier copies to craft first</th><th>Biggest bite</th><th class="num">Share held</th></tr></thead>
      <tbody>
        <tr v-for="r in route" :key="r.id">
          <td><Icon kind="gear" :id="r.id" :name="name(r.id)" /></td><td class="num">{{ fmt(r.crafts) }}</td>
          <td>{{ madeText(r.made) || '—' }}</td>
          <td><Icon kind="material" :id="r.worst" :name="materialName(r.worst)" /></td>
          <td class="num" :class="r.enough ? 'st-good' : 'st-bad'">{{ pct(r.use) }}</td>
        </tr>
      </tbody>
    </table></div>
    <p class="note">Share held over 100% = you need more of that material than you hold. Recipes still locked: level
      {{ [...new Set(Array.from({ length: 60 }, (_, i) => i + 1).filter((id) => lvReq(id) > lv).map(lvReq))].sort((a, b) => a - b).join(', ') }}.</p>

    </template>

    <template v-else-if="sec === 'boosters'">
    <div class="sec-head"><h3>Booster upgrades</h3><span class="m">ranked by how much every line of an equipped item grows</span></div>
    <p class="note">Expected values, not promises: it is a gamble, and items listed together draw on the same booster stock.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>A booster adds to the item's booster bonus, which
      multiplies all its lines, so items with different stats compare. A booster in a free slot rolls U(0, 100) against its chance (plus card
      and mastery bonuses) and adds its base bonus × the mutator on success; the slot is used either way († @22981775). Full items are listed
      only when a reset (3 copies of the item, slots and bonus back to 0, † @22973232) and {{ maxSlots }} fresh boosters are expected to beat what
      the item has now.</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Item</th><th>Plan</th><th>Uses</th><th class="num">Booster bonus now</th><th class="num">Expected after</th><th class="num">Every line grows</th></tr></thead>
      <tbody>
        <tr v-for="u in ups" :key="u.id">
          <td><Icon kind="gear" :id="u.id" :name="name(u.id)" /></td><td>{{ u.what }}</td><td>{{ u.cost }}</td>
          <td class="num">+{{ fmt(u.pct) }}%</td><td class="num">+{{ fmt(u.pct + u.gain) }}%</td><td class="num st-good">+{{ pct(u.grow) }}</td>
        </tr>
        <tr v-if="!ups.length"><td colspan="6" class="muted">Nothing: every equipped item's slots are full and no reset is expected to beat it.</td></tr>
      </tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Booster</th><th class="num">Chance</th><th class="num">Base bonus</th><th class="num">Expected per slot</th><th class="num">Held</th><th>Mutator</th><th class="num">Multiplies by</th><th class="num">Held</th></tr></thead>
      <tbody>
        <tr v-for="(b, i) in BOOSTERS" :key="i">
          <td><Icon kind="gear" :id="61 + i" :name="name(61 + i)" /></td><td class="num">{{ b[0] }}%</td><td class="num">+{{ b[1] }}%</td>
          <td class="num">+{{ fmt(boosterEV(s, i + 1)) }}%</td><td class="num">{{ fmt(Math.floor(owned(s, 61 + i))) }}</td>
          <td><Icon kind="gear" :id="66 + i" :name="name(66 + i)" /></td><td class="num">{{ MUTATORS[i]![0] / 10 }}-{{ MUTATORS[i]![1] / 10 }} (mean {{ (MUTATORS[i]![0] + MUTATORS[i]![1]) / 20 }})</td>
          <td class="num">{{ fmt(Math.floor(owned(s, 66 + i))) }}</td>
        </tr>
      </tbody>
    </table></div>

    </template>

    <template v-else>
    <div class="sec-head"><h3>Materials held</h3><span class="m">and which crusade drops them</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Material</th><th class="num">Held</th><th>Dropped by</th></tr></thead>
      <tbody>
        <tr v-for="m in mats" :key="m.id"><td><Icon kind="material" :id="m.id" :name="materialName(m.id)" /></td><td class="num">{{ fmt(m.q) }}</td><td class="muted">{{ dropBy(m.id) }}</td></tr>
      </tbody>
    </table></div>

    </template>

    <details class="how"><summary>Sources</summary>
    <p>Computed from your save; every formula is from the game's code (Qno2x.js offsets in web/src/tinkering.ts) and checked
      in its tests. Not decoded or not counted: the charms (Safety Charm, Lucky Donut, Booster Genesis, Chaotic and Benign Mutator, booster
      page items 71-75) are left out of booster expectations (the Tunnel roll on ConstructLV 33 is in); third-line material costs are
      not ranked; TinkeringSetsOpen is only the deck panel's open/closed flag (reset when the screen opens), so there is nothing to show
      for it. Item names are the game's own (_EquipName).</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } h4 { font-size: 14px; }
.sec-head h3, .sec-head h4 { margin: 0; } .m { color: var(--muted); }
.warn { border-left: 3px solid var(--bad); padding: 6px 10px; background: var(--panel); margin-bottom: 10px; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
.deck { margin: 10px 0 4px; }
.rec { margin: 6px 0 14px; } .swaps { margin: 4px 0; padding-left: 20px; } .swaps li { margin: 3px 0; }
.line { display: inline-block; white-space: nowrap; margin-right: 12px; }
</style>
