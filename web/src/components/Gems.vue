<script setup lang="ts">
import { computed } from 'vue'
import { gemPlan, gemShop, openItems, per100 } from '../gems'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const shop = computed(() => (props.save ? gemShop(props.save) : null))
const open = computed(() => (shop.value ? openItems(shop.value) : []))
const maxed = computed(() => shop.value?.items.filter((i) => i.owned >= i.max).map((i) => i.name) ?? [])
const affordable = computed(() => open.value.filter((i) => i.next && i.cost <= (shop.value?.gems ?? 0)).length)
const plan = computed(() => (shop.value ? gemPlan(shop.value) : []))
const cap = (m: number) => (m === Infinity ? '∞' : m)
</script>

<template>
  <div class="page-head">
    <h2>Gems</h2>
    <p>What to buy in the gem shop: every open item ranked by boost per 100 gems.</p>
    <div v-if="shop" class="tiles">
      <div class="tile"><b>{{ shop.gems }}</b><span>gems</span></div>
      <div class="tile"><b>{{ affordable }}</b><span>items you can afford</span></div>
      <div class="tile"><b>{{ maxed.length }}</b><span>items maxed</span></div>
    </div>
  </div>
  <template v-if="shop">
    <p>The doublers are the strongest buys per gem: Funny Hat (fishing XP ×2, and away fishing is your biggest XP source) and 2x AP each double a whole income for 100 gems; 2x BP does for 350.</p>
    <template v-if="plan.length">
    <h3>Plan, step by step</h3>
    <p class="note">Buy in this order: every item the app can price, once, best boost per 100 gems first, with the gems it takes so far.
      Keep the order rather than skipping ahead to something cheaper. Funny Hat's ×2 doesn't shrink with copies, so after you buy one it
      is still the best per gem; repeat step 1 instead if fishing XP is what you want.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Buy</th><th class="num">Cost</th><th class="num">Gems so far</th><th class="num">Still to earn</th><th>Does</th></tr></thead>
      <tbody>
        <tr v-for="(x, k) in plan" :key="x.item.name"><td class="num">{{ k + 1 }}</td><td>{{ x.item.name }}</td><td class="num">{{ x.item.cost }}</td>
          <td class="num" :class="{ 'st-good': !x.short }">{{ x.total }}</td><td class="num">{{ x.short || 'have it' }}</td><td>{{ x.item.next?.what }}</td></tr>
      </tbody>
    </table></div>
    <div class="sec-head"><h3>Every open item</h3><span class="m">ranked by boost per 100 gems</span></div>
    </template>
    <div class="tbl"><table class="list">
      <thead><tr><th>Item</th><th class="num">Cost</th><th class="num">Owned</th><th class="num">Boost per 100 gems</th><th>Next one does</th></tr></thead>
      <tbody>
        <tr v-for="i in open" :key="i.name" :class="{ dim: !i.next }"><td>{{ i.name }}</td><td class="num" :class="{ 'st-good': i.cost <= shop.gems }">{{ i.cost }}</td><td class="num">{{ i.owned }}/{{ cap(i.max) }}</td><td class="num">{{ per100(i) ? `+${(100 * per100(i)).toFixed(1)}%` : '' }}</td><td>{{ i.next?.what ?? '' }}</td></tr>
      </tbody>
    </table></div>
    <p class="note">Green cost = affordable now. Each % is of a different income, so it compares bang for gem, not which income matters more to you.</p>
    <div><b>Maxed</b><template v-if="!maxed.length"> none</template><ul v-else><li v-for="m in maxed" :key="m">{{ m }}</li></ul></div>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>2x AP/BP apply from the next ascend/rebirth (the multiplier is 1 + purchases, so the 2nd copy is ×1.5). Ranked by boost per 100 gems. Unpriced items sit at the bottom. Costs from the wiki gem shop table.</p>
    </details>
  </template>
  <p v-else class="muted">Load a save.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; }
.muted, .dim td:not([class*=st-]) { color: var(--muted); }
.tbl { max-width: 860px; }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.muted, .m { color: var(--muted); }
</style>
