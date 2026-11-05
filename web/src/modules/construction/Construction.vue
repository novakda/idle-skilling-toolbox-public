<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildPlan, builders, builderSpeed, DOMAINS, EFFECTS, expPerHour, lv, machines, name, plan, prereq, task, treasureName, unlocks, wikiEffect, type Row } from './construction'
import Icon from '../../components/Icon.vue'
import { sectionRef } from '../../section'

const props = defineProps<{ save: Record<string, unknown> | null }>()
defineEmits<{ go: [view: string] }>()
const n = (v: unknown) => Number(v ?? 0) || 0
const s = computed(() => props.save)
const p = computed(() => (s.value ? plan(s.value) : null))
const bs = computed(() => (s.value ? builders(s.value).map((k) => ({ k, level: lv(s.value!, 50 + k), speed: builderSpeed(s.value!, k), on: task(s.value!, k) })) : []))
const speed = computed(() => bs.value.reduce((t, b) => t + b.speed, 0))
const idle = computed(() => bs.value.filter((b) => !b.on).length)
const ms = computed(() => (s.value ? machines(s.value) : []))
const xpH = computed(() => (s.value ? expPerHour(s.value) : 0))
const left = computed(() => (s.value ? Math.max(n(s.value.ConstructionREQ) - n(s.value.ConstructionEXP), 0) : 0))
const top = computed(() => p.value?.next.find((r) => r.c!.enough || r.via) ?? p.value?.next[0] ?? null)
const topUnlock = computed(() => p.value?.next.find((r) => r.unlock) ?? null)
const lockedDomain = computed(() => (s.value ? DOMAINS.find((d) => lv(s.value!, d.flag) < 1) : undefined))
const goal = ref<number | null>(null)
const bp = computed(() => (s.value ? buildPlan(s.value, goal.value ?? undefined) : null))
const byDomain = computed(() => DOMAINS.map((d) => ({ ...d, unlocked: s.value ? lv(s.value, d.flag) >= 1 : false, rows: p.value?.all.filter((r) => d.ids.includes(r.i)) ?? [] })))

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) < 1e3) return String(+x.toFixed(2))
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No']
  const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(x)) / 3))
  return i < units.length - 1 || x < 1e33 ? `${+(x / 10 ** (i * 3)).toFixed(2)}${units[i]}` : x.toExponential(2)
}
const hrs = (h: number) => (!Number.isFinite(h) ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${+h.toFixed(1)} h` : `${+(h / 24).toFixed(1)} d`)
const effect = (i: number, L: number) => (EFFECTS[i] ? EFFECTS[i]!.now(s.value!, L) : null)
const missing = (r: Row) => r.c!.parts.filter((x) => x.held < x.q).map((x) => `${fmt(x.q)} ${x.name} (you have ${fmt(x.held)})`).join(', ')
const viaText = (v: { from: number; to: number; take: number; give: number }[]) => v.map((x) => `${fmt(x.take)} ${treasureName(x.from)} → ${fmt(x.give)} ${treasureName(x.to)}`).join(', ')
const machineHours = (v: { give: number }[]) => v.reduce((t, x) => t + x.give, 0) / Math.max(ms.value.reduce((t, m) => t + m.speed, 0), 1e-9)
const SECTIONS = [['plan', 'Plan'], ['next', 'What to build next'], ['buildings', 'Buildings'], ['workers', 'Builders and machines']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id))
</script>

<template>
  <div class="page-head">
    <h2><Icon kind="skill" name="Construction" id="ConstructionLV" /></h2>
    <p>What each building does now and next, what it costs to start, what it feeds elsewhere, and what to build next.</p>
    <div v-if="s && p" class="tiles">
      <div class="tile"><b>Lv {{ n(s.ConstructionLV) }}</b><span>Construction: {{ fmt(left) }} EXP to go, {{ hrs(left / Math.max(xpH, 1e-9)) }} at {{ fmt(xpH) }} EXP/h</span></div>
      <div class="tile"><b>{{ bs.length }} builders</b><span>{{ fmt(speed) }} build points/h together · {{ idle ? `${idle} idle` : 'all working' }}</span></div>
      <div class="tile"><b>{{ ms.length }} machines</b><span>{{ ms.filter((m) => m.running).length }} running</span></div>
      <div class="tile"><b>{{ top ? name(top.i) : '—' }}</b><span>{{ top ? `build next: level ${top.L + 1}, ${hrs(top.hours)} with every builder` : 'nothing to build' }}</span></div>
    </div>
  </div>
  <p v-if="!s || !p" class="note">Load a save to see Construction.</p>
  <template v-else>
    <h3>Do this next</h3>
    <ol class="do">
      <li v-if="idle && !p.inProgress.length"><b>Your {{ idle }} builder{{ idle > 1 ? 's are' : ' is' }} idle</b> and nothing is being built: every hour idle is {{ fmt(speed) }} build points lost.</li>
      <li v-for="r in p.inProgress" :key="'p' + r.i"><b>{{ name(r.i) }} level {{ r.L + 1 }}</b> is under way: {{ fmt(r.progress) }} / {{ fmt(r.c?.req ?? 0) }} build points{{ r.c && r.progress >= r.c.req ? ' — done, click it to finish' : `, ${hrs(r.hours)} left with every builder` }}.</li>
      <li v-if="top"><b>Build {{ name(top.i) }} level {{ top.L + 1 }}</b>
        <template v-if="top.c!.enough">: you hold the start cost; {{ hrs(top.hours) }} with every builder on it.</template>
        <template v-else-if="top.via">: first set a machine to turn {{ viaText(top.via) }} (about {{ hrs(machineHours(top.via)) }} with your machines), then start it; {{ hrs(top.hours) }} with every builder.</template>
        <template v-else>: not affordable yet ({{ missing(top) }}).</template>
        {{ top.unlock ? `It unlocks: ${top.unlock}.` : `Stat only: ${effect(top.i, top.L + 1) ?? wikiEffect(top.i)}.` }}</li>
      <li v-if="topUnlock && topUnlock !== top"><b>Next unlock, {{ name(topUnlock.i) }} level {{ topUnlock.L + 1 }}</b> ({{ topUnlock.unlock }}):
        <template v-if="topUnlock.via">machine first: {{ viaText(topUnlock.via) }}.</template><template v-else>missing {{ missing(topUnlock) }}.</template></li>
      <li v-for="m in ms.filter((m) => m.inName && !m.running)" :key="'m' + m.m">Machine {{ m.m }} is set to turn {{ m.inName }} into {{ m.outName }}, but you hold no {{ m.inName }}.</li>
      <li v-if="lockedDomain"><b>{{ lockedDomain.name }} domain</b> opens when you show its Sentinel more than {{ lockedDomain.more }} {{ treasureName(lockedDomain.treasure) }} (you have {{ fmt(n((s.TreasureOwned as number[])?.[lockedDomain.treasure])) }}); the treasure is not taken.</li>
    </ol>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in SECTIONS" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <template v-if="bp && bp.plan">
    <h3>Plan, step by step</h3>
    <p class="note">The build order to one goal: every building on its prerequisite chain, each to level 1 (one level opens the next).
      The tree fixes the order, so the plan optimises only the choice of goal: by default the end of a domain tree with the
      <b>fewest build hours</b> to it, open domains first. Times are real hours with all {{ bs.length }} builders on the step (builders
      keep building while you're away: full rate traced for the screen's own catch-up tick, unverified for the credit on entering it); gathering a start cost you're short of is not timed. "You have" counts what the steps
      before it take.
      Goal: <select v-model="goal"><option :value="null">nearest ({{ name(bp.goals[0]!.goal) }})</option>
        <option v-for="g in bp.goals" :key="g.goal" :value="g.goal">{{ name(g.goal) }} ({{ g.domain.name }}, {{ hrs(g.hours) }})</option></select></p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th class="num">Step</th><th>Build</th><th>Start cost</th><th class="num">Build time</th><th class="num">Running total</th><th>Unlocks</th></tr></thead>
      <tbody>
        <tr v-if="bp.plan.sentinel"><td class="num">0</td><td colspan="5">Open the {{ bp.plan.domain.name }} domain: show its Sentinel more than {{ bp.plan.domain.more }}
          {{ treasureName(bp.plan.domain.treasure) }} (you have {{ fmt(n((s.TreasureOwned as number[])?.[bp.plan.domain.treasure])) }}; not taken).</td></tr>
        <tr v-for="(st, k) in bp.plan.steps" :key="st.i">
          <td class="num">{{ k + 1 }}</td><td>{{ name(st.i) }} level 1</td>
          <td><span v-for="x in st.parts" :key="x.c" class="part" :class="x.held < x.q ? 'st-bad' : ''">{{ x.check ? 'needs ' : '' }}{{ fmt(x.q) }} {{ x.name }}<small v-if="x.q < 0" class="m"> (the game's own formula goes negative here: it does not block the build, and starting it adds {{ -x.q }} to your stock, since the game floors the cost and then subtracts it, † @30634899, @30637654, @30638393)</small> <small class="m">have {{ fmt(x.held) }}</small></span></td>
          <td class="num">{{ hrs(st.hours) }}</td><td class="num">{{ hrs(st.total) }}</td><td><div v-for="u in (st.unlock ?? '—').split('; ')" :key="u">{{ u }}</div></td>
        </tr>
        <tr><td></td><td colspan="2"><b>Total</b>{{ bp.plan.steps.some((x) => x.short) ? ', once the start costs in red are gathered' : '' }}</td>
          <td class="num"><b>{{ hrs(bp.plan.hours) }}</b></td><td colspan="2"></td></tr>
      </tbody>
    </table></div>
    </template>
    <p v-if="!(bp && bp.plan)" class="note">No build plan: every domain tree is built.</p>
    </template>
    <template v-else-if="sec === 'next'">
    <div class="sec-head"><h3>What to build next</h3><span class="m">levels that unlock something first, then stat-only levels</span></div>
    <p class="note">Stat-only levels are not weighed against each other: their stats differ.</p>
    <details class="how"><summary>How the ranking is worked out</summary>
    <p>Ranked by <b>what Construction is built for</b>: the wiki's "pay the cost and assign Builders to build an upgrade and
      unlock new ones". Levels that unlock something (a building, a builder, a machine, a Pro rift, Crusades 14-15, a card set, tinker
      lines, a slot, a gene, new crops/flowers/potions) come first, then stat-only levels; within each, what you can start now, then what a
      machine can make affordable from spare higher treasure (1 of a treasure = 3 of the one below, † @30725586), then the rest; then
      fewest hours with all {{ bs.length }} builders on it (builders on one building add up, † @30699566).</p>
    </details>
    <div class="tbl"><table class="list">
      <thead><tr><th>Building</th><th class="num">Next</th><th>Unlocks</th><th>Start cost</th><th class="num">Build points</th><th class="num">Time</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="r in p.next" :key="r.i">
          <td>{{ name(r.i) }}</td><td class="num">{{ r.L + 1 }}</td><td><div v-for="u in (r.unlock ?? '—').split('; ')" :key="u">{{ u }}</div></td>
          <td><span v-for="x in r.c!.parts" :key="x.c" class="part" :class="x.held < x.q ? 'st-bad' : ''">{{ x.check ? 'needs ' : '' }}{{ fmt(x.q) }} <Icon v-if="x.icon" :kind="x.icon.kind" :id="x.icon.id" :name="x.name" /><template v-else>{{ x.name }}</template><small v-if="x.q < 0" class="m"> (the game's own formula goes negative here: it does not block the build, and starting it adds {{ -x.q }} to your stock, since the game floors the cost and then subtracts it, † @30634899, @30637654, @30638393)</small> <small class="m">have {{ fmt(x.held) }}</small></span></td>
          <td class="num">{{ fmt(r.c!.req) }}</td><td class="num">{{ hrs(r.hours) }}</td>
          <td :class="r.c!.enough ? 'st-good' : r.via ? 'st-warn' : 'st-bad'">{{ r.c!.enough ? 'can start' : r.via ? `machine: ${viaText(r.via)}` : 'short' }}</td>
        </tr>
        <tr v-if="!p.next.length"><td colspan="7" class="muted">Nothing to pick: every open building is maxed or under way.</td></tr>
      </tbody>
    </table></div>

    </template>

    <template v-else-if="sec === 'buildings'">
    <div class="sec-head"><h3>Buildings</h3><span class="m">by domain tree</span></div>
    <p class="note">Effects marked † are ported from the game's code (offset in web/src/construction.ts); the rest show the wiki's text,
      not checked.</p>
    <details class="how"><summary>How buildings open and what a start cost takes</summary>
    <p>A building opens once the one before it in its domain tree is level 1 (Foil Cards after Machinery; Mining Mind, Bucketeers,
      Big Boy Bags, Boostio and Brew Bobby after the one two above). Start costs are taken when you start a level; "needs" are checked, not taken.</p>
    </details>
    <template v-for="d in byDomain" :key="d.name">
      <div class="sec-head"><h4>{{ d.name }} domain</h4><span class="m">{{ d.unlocked ? 'open' : `locked: show the Sentinel more than ${d.more} ${treasureName(d.treasure)}` }}</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Building</th><th class="num">Level</th><th>Effect now</th><th>Next level</th><th>Next start cost</th><th class="num">Build points</th><th>Feeds</th></tr></thead>
        <tbody>
          <tr v-for="r in d.rows" :key="r.i" :class="{ dim: !r.open }">
            <td>{{ name(r.i) }}<div v-if="!r.open" class="m">after {{ prereq(r.i) === d.flag ? 'the domain opens' : name(prereq(r.i)) }}</div></td>
            <td class="num">{{ r.L }} / {{ r.max }}</td>
            <td><template v-if="effect(r.i, r.L)">{{ effect(r.i, r.L) }} <span class="m">{{ EFFECTS[r.i]!.at.startsWith('†') ? '†' : '' }}</span></template><span v-else class="m">wiki: {{ wikiEffect(r.i) }}</span></td>
            <td><template v-if="r.L >= r.max" ><span class="m">max</span></template><template v-else>{{ effect(r.i, r.L + 1) ?? '' }}<span v-if="unlocks(r.i, r.L)" class="m">{{ effect(r.i, r.L + 1) ? ' · ' : '' }}{{ unlocks(r.i, r.L) }}</span></template></td>
            <td><template v-if="r.c"><span v-for="x in r.c.parts" :key="x.c" class="part" :class="x.held < x.q ? 'st-bad' : ''">{{ x.check ? 'needs ' : '' }}{{ fmt(x.q) }} <Icon v-if="x.icon" :kind="x.icon.kind" :id="x.icon.id" :name="x.name" /><template v-else>{{ x.name }}</template><small v-if="x.q < 0" class="m"> (the game's own formula goes negative here: it does not block the build, and starting it adds {{ -x.q }} to your stock, since the game floors the cost and then subtracts it, † @30634899, @30637654, @30638393)</small></span></template></td>
            <td class="num">{{ r.c ? fmt(r.c.req) : '' }}</td>
            <td><a v-if="EFFECTS[r.i]?.page" href="#" @click.prevent="$emit('go', EFFECTS[r.i]!.page!)">{{ EFFECTS[r.i]!.feeds }}</a>
              <span v-else class="m">{{ EFFECTS[r.i]?.feeds ?? 'Construction / Spelunking' }}</span></td>
          </tr>
        </tbody>
      </table></div>
    </template>

    </template>

    <template v-else>
    <div class="sec-head"><h3>Builders and machines</h3><span class="m">{{ fmt(speed) }} build points/h together</span></div>
    <p class="note">Builder and machine upgrade costs are not decoded.</p>
    <details class="how"><summary>How build points and machine output are worked out</summary>
    <p>A builder adds build points every 100 ms at its speed/36,000 to the building it is on, up to that level's build points
      († @30699566): 60 × (1 + Iron Throne/50) × 1.32^builder level × (1 + Construction level × 2%) (iodized builders: more, † @2688326),
      × card and Attack Speed Pro rift bonuses. A machine turns 1 of a treasure into 3 of the one below per step, at its speed per hour
      († @2692003); with Pink Printer it can print pink souls.</p>
    </details>
    <div class="cols">
      <div class="tbl"><table class="list narrow">
        <thead><tr><th>Builder</th><th class="num">Level</th><th class="num">Build points/h</th><th>Working on</th></tr></thead>
        <tbody><tr v-for="b in bs" :key="b.k"><td>{{ b.k }}</td><td class="num">{{ b.level }}</td><td class="num">{{ fmt(b.speed) }}</td>
          <td :class="b.on ? '' : 'st-warn'">{{ b.on ? name(b.on) : 'idle' }}</td></tr></tbody>
      </table></div>
      <div class="tbl"><table class="list narrow">
        <thead><tr><th>Machine</th><th class="num">Level</th><th>Turns</th><th class="num">Output/h</th><th>Status</th></tr></thead>
        <tbody><tr v-for="m in ms" :key="m.m"><td>{{ m.m }}</td><td class="num">{{ m.level }}</td>
          <td>{{ m.inName ? `${m.inName} → ${m.outName}` : 'not set' }}</td><td class="num">{{ fmt(m.speed) }}</td>
          <td :class="m.running ? 'st-good' : 'st-warn'">{{ m.running ? `takes ${fmt(m.speed * m.per)} ${m.inName}/h` : m.inName ? `no ${m.inName} held` : 'idle' }}</td></tr>
          <tr v-if="!ms.length"><td colspan="5" class="muted">No machines yet (Machinery adds one per level).</td></tr></tbody>
      </table></div>
    </div>

    </template>

    <details class="how"><summary>Sources</summary>
    <p>Computed from your save; formulas from the game's code (Qno2x.js offsets in web/src/construction.ts), per-level costs
      from the game's own cost code run per level (src/derive-construction.ts), checked in construction.test.ts. Construction EXP comes
      only from Sitty Chair, Iron Throne, Ni Ni Shrubbery and Chandelier (and keeps accruing while away; see AFK). Not decoded: the wiki-only
      effects above, Pink Printer levels 2-5, builder and machine upgrade costs, fish and vessel names (shown by number), and card bonuses to
      Construction (CbonusTunnels is read as the save stores it). Treasure icons: none (the cost icons are scene actors not mapped yet);
      crop, flower and crusade-material icons are the game's.</p>
    </details>
  </template>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); font-size: 12px; }
h3 { font-size: 16px; margin: 18px 0 6px; } h4 { font-size: 14px; }
.sec-head h3, .sec-head h4 { margin: 0; } .sec-head h4 { font-weight: 600; }
h2 :deep(.icon) { height: 24px; }
.do { margin: 0 0 10px; padding-left: 20px; }
.do li { margin: 4px 0; }
.deck { margin: 10px 0 4px; }
.part { display: block; }
tr.dim td { opacity: .7; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
table.list.narrow { min-width: 0; }
</style>
