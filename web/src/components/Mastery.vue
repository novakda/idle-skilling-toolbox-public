<script setup lang="ts">
import { computed } from 'vue'
import { MAX_LV, mastery } from '../mastery'
import { sectionRef } from '../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const m = computed(() => (props.save ? mastery(props.save) : null))
const fmt = (x: number) => (Math.abs(x) >= 1e6 ? x.toExponential(2) : String(+x.toFixed(2)))
const bonus = (v: number, pct: boolean) => `+${fmt(v)}${pct ? '%' : ''}`
const afford = computed(() => m.value?.plan.filter((x) => x.kind === 'perk' && !x.short).length ?? 0)
const tracked = computed(() => (m.value ? m.value.missingTasks.filter((t) => t.need != null && !t.met).sort((a, b) => b.frac! - a.frac! || b.pts - a.pts) : []))
const untracked = computed(() => (m.value ? m.value.missingTasks.filter((t) => t.need == null && !t.instant) : []))
const missingPts = computed(() => m.value?.missingTasks.reduce((t, x) => t + x.pts, 0) ?? 0)
const passCost = computed(() => -(m.value?.plan.filter((x) => x.kind === 'perk').reduce((t, x) => t + x.delta, 0) ?? 0))
const SECTIONS = [['plan', 'Plan'], ['perks', 'Perks'], ['tasks', 'Tasks'], ['how', 'Reference']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2>Mastery</h2>
    <p>The Portal's Mastery screen: tasks pay points, points buy perk levels in three trees.</p>
    <div v-if="m" class="tiles">
      <div class="tile"><b>{{ m.points.owned }}</b><span>points held †</span></div>
      <div class="tile"><b>{{ 200 - m.missingTasks.length }} / 200</b><span>tasks done †</span></div>
      <div v-for="t in m.trees" :key="t.id" class="tile"><b>{{ t.owned }} / {{ t.size }}</b><span>tree {{ t.id }} perks owned, tier {{ t.tier }} †</span></div>
    </div>
  </div>
  <p v-if="!m" class="note">Load a save to see Mastery.</p>
  <template v-else>
    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <h3>Plan, step by step</h3>
    <p class="note">First the tasks that need only a tap, then tasks your save already meets (the Mastery screen checks them when it opens),
      then perk levels for one full pass of every tree. Perk bonuses are different stats (damage, cash, nest speed…), so they are not
      weighed against each other: the order is cheapest first, which buys the most perks per point and opens the next perk in each chain.
      "Per point" is the bonus divided by the cost, comparable only within one stat. This pass costs {{ passCost }} points;
      the {{ m.missingTasks.length }} open tasks pay {{ missingPts }} in all.</p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Do</th><th class="num">Points</th><th class="num">After</th><th class="num">Still to earn</th><th>Why</th></tr></thead>
      <tbody><tr v-for="(x, k) in m.plan" :key="k" :class="{ dim: x.short > 0 }"><td class="num">{{ k + 1 }}</td><td>{{ x.text }}</td>
        <td class="num" :class="x.delta > 0 ? 'st-good' : ''">{{ x.delta > 0 ? '+' : '' }}{{ x.delta }}</td><td class="num">{{ x.after }}</td>
        <td class="num">{{ x.short || '' }}</td><td>{{ x.why }}</td></tr>
        <tr v-if="!m.plan.length"><td colspan="6" class="muted">Every tree is at level {{ MAX_LV }}.</td></tr></tbody>
    </table></div>
    <p class="note">{{ afford }} perk level{{ afford === 1 ? '' : 's' }} affordable after the task steps. For the rest, earn points from the
      tasks closest to done (Tasks tab). Points on hand stay through ascend and rebirth.</p>
    <p v-if="!m.points.doubled" class="note">Not counted: the real-money Premium Pack (premiumpack_1 † @3279499) doubles every task's points,
      past ones too: +{{ m.points.unclaimedDouble }} points on this save †. The other doubler flag, 2xMasteryGem, is never set by this build's code †.</p>
    </template>

    <template v-else-if="sec === 'perks'">
    <div class="sec-head"><h3>Perks</h3><span class="m">level 0-{{ MAX_LV }}; amounts as the game applies them (<span title="PotionLV[128], potion 129">Diet Masty</span> and <span title="Realm vending 7">Cane Sugar Soda</span> scaling)</span></div>
    <div v-for="t in m.trees" :key="t.id">
      <h3>Tree {{ t.id }} <small class="m">perks {{ t.from }}-{{ t.to }}, tier {{ t.tier }} †</small></h3>
      <div class="tbl"><table class="list">
        <thead><tr><th class="num">#</th><th>Bonus</th><th class="num">Per level</th><th class="num">Lv</th><th class="num">Now</th><th class="num">Next level</th><th class="num">Cost</th><th>State</th></tr></thead>
        <tbody><tr v-for="p in m.perks.filter((x) => x.tree === t.id)" :key="p.i" :class="{ dim: !p.lv && !p.buyable }">
          <td class="num">{{ p.i }}</td><td>{{ p.name }}{{ p.capstone ? ' (capstone)' : '' }}{{ p.i === 43 ? ' × Hatchery LV' : '' }}{{ p.merit ? ' · +1 green merit per buy' : '' }}</td>
          <td class="num">{{ bonus(p.amount, p.pct) }}</td><td class="num">{{ p.lv }}</td><td class="num">{{ p.lv ? bonus(p.now, p.pct) : '' }}</td>
          <td class="num">{{ p.lv < MAX_LV ? bonus(p.next, p.pct) : '' }}</td><td class="num">{{ p.cost }}</td>
          <td :class="p.buyable ? 'st-good' : ''">{{ p.buyable ? (p.cost <= m.points.owned ? 'buy now' : 'next in line') : p.why }}</td></tr></tbody>
      </table></div>
    </div>
    </template>

    <template v-else-if="sec === 'tasks'">
    <div class="sec-head"><h3>Open tasks with progress</h3><span class="m">closest to done first; read from your save the way the game's check reads it</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Task</th><th class="num">Points</th><th>Checks</th><th class="num">You</th><th class="num">Needs</th><th class="num">Done</th></tr></thead>
      <tbody><tr v-for="t in tracked" :key="t.i"><td class="num">{{ t.i }}</td><td>{{ t.name }}</td><td class="num">{{ t.pts }}</td><td>{{ t.what }}</td>
        <td class="num">{{ fmt(t.cur!) }}</td><td class="num">{{ fmt(t.need!) }}</td><td class="num">{{ Math.floor(100 * t.frac!) }}%</td></tr>
        <tr v-if="!tracked.length"><td colspan="7" class="muted">None.</td></tr></tbody>
    </table></div>
    <div class="sec-head"><h3>Other open tasks</h3><span class="m">progress not read from the save †; by task number</span></div>
    <p class="note">Their checks run inside other screens (a fight, a catch, a rebirth timer…). The game's own task names say what to do.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Task</th><th class="num">Page</th><th class="num">Points</th><th>Grant site</th></tr></thead>
      <tbody><tr v-for="t in untracked" :key="t.i" :class="{ dim: !m.pageUnlocked(t.page) }"><td class="num">{{ t.i }}</td><td>{{ t.name }}</td><td class="num">{{ t.page }}</td>
        <td class="num">{{ t.pts }}</td><td class="m">@{{ t.at }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else>
    <h3>How Mastery works</h3>
    <ul class="how-list">
      <li><b>Tasks.</b> 200 tasks in 10 pages of 20. Task i pays ⌈i/20⌉ points once (task 33 pays 1 †). Page p of the list opens at p + 1
        fights unlocked, page 10 with DairyAisleAchievements[1] († @29933598, @29937054). Completing a task isn't tied to its page being open.</li>
      <li><b>Points.</b> {{ m.points.earned }} earned from your done tasks = {{ m.points.spent }} spent on perk levels + {{ m.points.owned }} held ✓.</li>
      <li><b>Perks.</b> Tree 1 is perks 1-43, tree 2 44-80, tree 3 81-125. Each perk needs the one before it; branches start at 21 (off 4),
        36 (off 29), 53 (off 46), 67 (off 58), 101 (off 88), 113 (off 104) († @29916538). A level costs the perk's cost every time.</li>
      <li><b>Tiers.</b> A tree's tier is its average perk level rounded up to 0.01 († @29833022). You can raise a perk only to ⌊tier⌋ + 1, and the
        tree's first perk only when the whole tree is level, so each pass raises every perk by one. The buy stops at tier {{ MAX_LV }} († @29919606).</li>
      <li><b>Bonuses.</b> Each level adds the per-level amount. Damage, cash and gathering types multiply, the rest add (MasteryBonuses, ported in
        load-bonuses.ts and checked against the stored values). Capstone 20 multiplies damage, 35 cash, 43 damage × Hatchery LV.</li>
      <li><b>Capstone names</b> show "?????" in game until the perk before them is owned; the names here are the ones the game reveals († @29897822).</li>
    </ul>
    <p class="note">Sources: Qno2x.js offsets in web/src/mastery.ts; tables from the mastery scene (src/derive-mastery.ts). Tree names, the screen wording of
      the three tap tasks, and progress for tasks marked † are not read from code.</p>
    </template>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); font-size: 12px; font-weight: normal; }
h3 { font-size: 16px; margin: 18px 0 6px; } .sec-head h3 { margin: 0; }
.how-list li { margin: 6px 0; }
tr.dim td { opacity: .7; }
</style>
