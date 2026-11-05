<script setup lang="ts">
import { computed, ref } from 'vue'
import { attackPeriod, barnPos, coinPlan, coinsPerHour, damageStats, fmtTime, minionGuide, realmPlan, realmState, resetCall, stageTable, ECONOMY_TAIL, GOALS, STAGES, stageImage, statMatch, TIERS, type Combat, type Stat, type StageKey } from './realm'
import REALM_DATA from '../../data/realm.json'

const props = defineProps<{ save: Record<string, unknown> | null }>()
// Progression stage: Auto (from the save) or a manual pick, remembered per browser.
const STAGE_KEY = 'realm-stage'
// A stored key no longer in STAGES (e.g. the old 'early', split by #2675) falls back to Auto.
const stagePick = ref<StageKey | ''>((() => { try { const v = localStorage.getItem(STAGE_KEY); return STAGES.some((s) => s.key === v) ? (v as StageKey) : '' } catch { return '' } })())
const setStage = (v: string) => { stagePick.value = v as StageKey | ''; try { v ? localStorage.setItem(STAGE_KEY, v) : localStorage.removeItem(STAGE_KEY) } catch { /* storage blocked */ } }
// What the end-game optional rows optimise for (#2676), remembered per browser; default Coins.
const GOAL_KEY = 'realm-goal'
const goalPick = ref<string>((() => { try { const v = localStorage.getItem(GOAL_KEY); return GOALS.some((g) => g.key === v) ? v! : 'coins' } catch { return 'coins' } })())
const setGoal = (v: string) => { goalPick.value = v; try { localStorage.setItem(GOAL_KEY, v) } catch { /* storage blocked */ } }
const r = computed(() => { try { return props.save ? realmState(props.save, stagePick.value || null, goalPick.value) : null } catch (e) { console.warn('realm:', e); return null } })
const sci = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : Math.round(v).toLocaleString())
const mult = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toFixed(2)) // a gain factor: 2 decimals, short form when huge
const fill = (t: string, v: number | string) => t.replace(/[{}\]]/g, String(v))
const guide = computed(() => { try { return props.save ? minionGuide(props.save) : [] } catch (e) { console.warn('minion guide:', e); return [] } })
// Combat numbers come from the game's own code (src/realm-combat.ts, refreshed with the live save); absent off the author's machine.
type PTarget = { name: string; pos: string; loss: number; add?: number; exp?: number }
type PurpleTargets = { bop: boolean; banishes: number; coins: number; rows: { afterlife: number; hp: number; needSpent: number; single: (PTarget & { add: number }) | null; alt: PTarget[]; multi: { n: number; loss: number; targets: PTarget[] } | null; best: 'single' | 'multi' | null }[]
  sequence: { afterlife: number; hp: number; stop?: string; best?: 'single' | 'multi' | 'protected'; wait?: number; saves?: number | null; targets?: PTarget[]; poured?: number; banishes?: number; protects?: number; rateLeft?: number; stepLoss?: number }[]
  protect: { charges: number; energy: number; cost: number; canBuy: boolean; total: number; regen: number; cap: number; timed: boolean; upfront: { buy: number; wait: number; fits: boolean } | null } }
const pct = (v: number) => `${(100 * v).toFixed(v < 0.01 ? 2 : 0)}%`
type Purple = { walls: { afterlife: number; hp: number }[]; slots: number; banishes: number; coins: number; full: number; fullHit: number; riftseeker: number; minHippos: number | null; minCoins: number | null; hitsPerWall: number[] }
const combat = ref<(Combat & { trophies?: TrophyCalc; sprint?: SprintPlan[]; purple?: Purple | null; purpleTargets?: PurpleTargets; orb?: { slots: number; cap: number; energy: number; perHourNow: number; lizard: number; other: number; fullLizards: number; fullOther: number; costs: { laser: number; protect: number; coinBuy: number }; flowers: { perOgre: number; full: number; now: number; held: number; summon: number } } }) | null>(null)
// realm-combat.json re-derives on fetch when the save's Realm fingerprint changed (~9 s); Recalc forces it. `stale` = fingerprints still differ.
const rc = ref<{ fingerprint: string; cachedAt: number | null } | null>(null), busy = ref(false), rcErr = ref('')
const loadCombat = () => Promise.all([
  fetch('/data/realm-combat.json').then((x) => (x.ok ? x.json() : null)).then((j) => { combat.value = j }).catch(() => {}),
  fetch('/api/realm-recalc').then((x) => (x.ok ? x.json() : null)).then((j) => { rc.value = j }).catch(() => {}),
])
loadCombat()
const stale = computed(() => !!rc.value && (!combat.value || (combat.value as { fingerprint?: string }).fingerprint !== rc.value.fingerprint))
const cachedAt = computed(() => (rc.value?.cachedAt ? new Date(rc.value.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null))
async function recalc() {
  busy.value = true; rcErr.value = ''
  try {
    const x = await fetch('/api/realm-recalc', { method: 'POST' }), j = await x.json()
    if (!j.ok) rcErr.value = j.error ?? 'failed'
    else await loadCombat()
  } catch (e) { rcErr.value = String(e) } finally { busy.value = false }
}
const reset = computed(() => (combat.value && stages.value.length ? resetCall(combat.value, stages.value, r.value?.comp.stage === 'endgame') : null))
const stages = computed(() => { try { return combat.value && r.value ? stageTable(combat.value, r.value.bestReached, r.value.banishes.resetIn) : [] } catch (e) { console.warn('stage table:', e); return [] } })
// Drags needed for 90% of the rearrange's coin gain (the dialog's last column is × after each drag, in order).
const dragsFor90 = computed(() => {
  const m = coins.value?.loadout?.moves; if (!m?.length) return 0
  const v = m.map((r) => Number(String(r[4]).slice(1))), tot = v.at(-1)! - 1
  return tot > 0 ? v.findIndex((x) => x - 1 >= 0.9 * tot) + 1 : 0
})
// Vending affordability: next-level price from the game's VendingCost on the save as it is now (src/realm-coinloop.ts, dev only,
// end game) and how many levels the coins you hold buy, each level ×scale dearer (VendingInfo row).
const vendCost = (i: number) => combat.value?.coinLoop?.vendCosts?.[i] ?? null
const vendBuys = (i: number) => {
  const c0 = vendCost(i), scale = REALM_DATA.vending[i]?.scale ?? 0
  if (c0 == null || !(scale > 1) || !r.value) return 0
  let left = r.value.coins, c = c0, k = 0
  while (c <= left && k < 999) { left -= c; c *= scale; k++ }
  return k
}
const plan = computed(() => (r.value ? realmPlan(r.value, reset.value, stages.value, combat.value?.coins?.resetti, combat.value?.coinLoop) : []))
// Plan tab shows each step once: drop checks the step-by-step plan or the coin plan already carries.
const others = computed(() => {
  if (!r.value) return []
  const inPlan = new Set(plan.value.map((p) => p.do)), gate = r.value.nextGate && plan.value.some((p) => p.buys.includes(`Afterlife ${r.value!.nextGate!.first} wall`))
  const orbRows = coinRows.value.some((l) => l.do.startsWith('Orb Tower trait'))
  return r.value.steps.filter((s) => (s !== r.value!.shrineStep || !reset.value) && !inPlan.has(s) && !(gate && /^\w+ (wall|gate) at Afterlife /.test(s)) && !(orbRows && s === r.value!.reroll?.text))
})
const coins = computed(() => combat.value?.coins ?? null)
// Boss table: the leading run of bosses that each fall in under a second folds into one row (#2614 layout review).
const quickStages = computed(() => { const out = []; for (const s of stages.value) { if (s.sec < 1 && s.afterlife !== r.value?.afterlife) out.push(s); else if (out.length) break } return out })
const slowStages = computed(() => quickStages.value.length > 1 ? stages.value.filter((s) => !quickStages.value.includes(s)) : stages.value)
/** The all-in barn's lines, same base minion together (most-bought base first), in the dialog. */
const groupedRows = (p: SprintPlan) => {
  const rows = sprintRow({ ...p, steps: p.allIn!.steps }).steps!.rows, n = new Map<string, number>()
  for (const r of rows) n.set(String(r[0]), (n.get(String(r[0])) ?? 0) + 1)
  return [...rows].sort((a, b) => n.get(String(b[0]))! - n.get(String(a[0]))! || String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2])))
}
/** The all-in barn's base summons, same base grouped: '12× Piggy, 5× Pet Rock'. Buy order barely matters with a reset's coins
 *  (everything is bought in the first seconds), so grouping by base makes the Portal clicks faster. */
const summons = (p: SprintPlan) => {
  const n = new Map<string, number>()
  for (const r of sprintRow({ ...p, steps: p.allIn!.steps }).steps!.rows) n.set(String(r[0]), (n.get(String(r[0])) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`).join(', ')
}
const coinRows = computed(() => (coins.value && r.value ? coinPlan(coins.value, r.value) : []))
const CUR = { coins: 'coins', energy: 'Orb energy', spirals: 'Spirals', none: '' } as const
const planSec = computed(() => plan.value.reduce((t, x) => t + (x.sec ?? 0), 0))
const fam = ref('all'), show = ref('all')
const families = computed(() => [...new Set(guide.value.map((g) => g.family))])
const guideRows = computed(() => guide.value.filter((g) => (fam.value === 'all' || g.family === fam.value) && (show.value === 'all' || g.state.kind === show.value)))
import Icon from '../../components/Icon.vue'
import StepsDialog from '../../components/StepsDialog.vue'
import { sprintRow, trophyRows, uniqueRoute, type SprintPlan, type TrophyCalc } from './realm-trophies'
import { SECTION_ALIASES, sectionRef } from '../../section'
const hrs = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
// Banishes refill when RealmStuff[20] runs out (game clock, not midnight): "in 4h 47m (03:27)", clock time from the save's QuitTime.
const refill = computed(() => {
  if (!r.value) return ''
  const s = r.value.banishes.resetIn, q = Number(props.save?.QuitTime)
  return hrs(s) + (q > 0 ? ` (${new Date((q + s) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : '')
})
// Two levels (#2586 follow-up): ?section= holds the subtab id; its third field is the top-level tab that holds it.
const TABS = [['progress', 'Progress'], ['minions', 'Minions'], ['economy', 'Economy'], ['buildings', 'Buildings'], ['reference', 'Reference']] as const
const SECTIONS = [['plan', 'Plan', 'progress'], ['bosses', 'Bosses', 'progress'], ['purple', 'Purple', 'progress'], ['trophies', 'Trophies', 'progress'], ['barn', 'Barn', 'minions'], ['minions', 'All minions', 'minions'], ['traits', 'Traits', 'minions'], ['loadouts', 'Loadouts', 'minions'], ['coins', 'Coins', 'economy'], ['damage', 'Damage', 'economy'], ['blessings', 'Blessings', 'economy'], ['blesstotals', 'Blessing totals', 'economy'], ['energy', 'Energy', 'economy'], ['shrine', 'Shrine', 'buildings'], ['vending', 'Vending', 'buildings'], ['field', 'Field', 'buildings'], ['orb', 'Orb Tower', 'buildings'], ['cornucopia', 'Cornucopia', 'buildings'], ['torches', 'Torches', 'buildings'], ['bonuses', 'Realm-wide bonuses', 'reference'], ['hidden', 'Not shown in game', 'reference']] as const
const sec = sectionRef(SECTIONS.map(([id]) => id), SECTION_ALIASES.realm)
const tab = computed(() => SECTIONS.find(([id]) => id === sec.value)![2])
// Subtabs fed by the game-computed stats model (realm-combat.json's stats).
const STATS: string[] = ['coins', 'damage', 'blessings', 'blesstotals', 'energy', 'bonuses', 'hidden']
// Stats section: game-computed numbers (src/realm-stats.ts via realm-combat.json).
const st = computed(() => combat.value?.stats ?? null)
// Blessings table: letter = BlessingN.png with N the key's Letter2Number index; click a header to sort, toggle again to reverse.
const LETTERS = '_abcdefghijklmnopqrstuvwxyz'
type BlessCol = 'letter' | 'name' | 'count' | 'value' | 'text'
const blessShow = ref<'all' | 'held' | 'missing'>('all'), blessSort = ref<{ col: BlessCol; desc: boolean }>({ col: 'count', desc: true })
const sortBless = (col: BlessCol) => { blessSort.value = { col, desc: blessSort.value.col === col ? !blessSort.value.desc : col === 'count' || col === 'value' } }
const blessRows = computed(() => {
  const { col, desc } = blessSort.value, key = (b: { key: string; name: string; count: number; value: number; text: string }) => (col === 'letter' ? LETTERS.indexOf(b.key) : b[col])
  return (st.value?.blessings ?? []).filter((b) => blessShow.value === 'all' || (blessShow.value === 'held') === b.count > 0)
    .slice().sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))) * (desc ? -1 : 1) })
})
const BT_ORDER = ['coins', 'damage', 'cost', 'speed', 'cashback', 'exp', 'energy', 'spirals', 'other', 'instant']
const btRows = computed(() => (st.value?.blessingTotals.rows ?? []).slice().sort((a, b) => BT_ORDER.indexOf(a.cat) - BT_ORDER.indexOf(b.cat) || b.total - a.total))
const updogCarriers = computed(() => Object.entries((st.value?.blessingTotals.updog.carriers ?? []).reduce((m: Record<string, number>, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})).map(([id, n]) => `${R_MINION(id)} ×${n}`).join(', '))
const R_MINION = (id: string) => (REALM_DATA as any).minions?.[id]?.name ?? id
const arrow = (col: BlessCol) => (blessSort.value.col === col ? (blessSort.value.desc ? ' ▼' : ' ▲') : '')
const dmg = computed(() => { try { return combat.value ? damageStats(combat.value, stages.value) : null } catch (e) { console.warn('damage stats:', e); return null } })
const DMG_COLS = [0, 1, 2, 5, 6, 7] // tiers a minion's hits can land on (Blue = laser, Purple = banish)
const num = (v: number | null | undefined) => v == null ? 'never' : Math.abs(v) >= 1e6 ? v.toExponential(2) : Number.isInteger(v) ? v.toLocaleString() : (+v.toFixed(3)).toLocaleString()
const mark = (s: Stat) => { const m = statMatch(s); return m == null ? '' : m ? '✓' : '✗' }
const coinMin = computed(() => coins.value?.minions.map((m) => ({ ...m, lvCash: st.value?.levelCash.find((l) => l.slot === m.slot)?.value ?? 1,
  hour: m.perMin * 60 * (1 + coins.value!.parts.awayPct / 100) })) ?? [])
const perHour = computed(() => coins.value ? coinsPerHour(coins.value) : null)
const trophies = computed(() => (props.save ? trophyRows(props.save, combat.value) : []))
const route = computed(() => (combat.value?.trophies ? uniqueRoute(combat.value.trophies) : []))
const STATUS = { claimed: 'claimed', ready: 'ready to claim', open: 'offered', locked: 'not offered yet', never: 'unobtainable' } as const
const bonusGroups = computed(() => st.value ? [...new Set(st.value.bonuses.map((b) => b.group!))] : [])
</script>

<template>
  <div class="page-head">
    <h2>Realm</h2>
    <p>Where you are against the wiki's Realm guide, how long each boss takes with your barn, and when to reset.</p>
    <div v-if="r" class="tiles">
      <div class="tile"><b>{{ r.afterlife }}</b><span>Afterlife (best {{ r.bestReached }})</span></div>
      <div class="tile"><b>{{ r.realmLv }}</b><span>Realm level</span></div>
      <div class="tile"><b>{{ sci(r.spirals) }}</b><span>Spirals</span></div>
      <div class="tile"><b :class="{ 'st-good': reset?.reset }">{{ reset ? (reset.reset ? 'reset now' : 'push on') : '—' }}</b><span>reset verdict</span></div>
    </div>
  </div>
  <section v-if="r">
    <p v-if="rc" class="rcbar"><span class="m">Realm numbers from {{ cachedAt ?? 'never' }}</span>
      <button :disabled="busy" @click="recalc">{{ busy ? 'Recalculating… ~5 s' : 'Recalc' }}</button>
      <span v-if="stale && !busy" class="rcstale">Save changed since these were computed — Recalc to update</span>
      <span v-if="rcErr" class="st-bad">{{ rcErr }}</span></p>
    <h3>Do this next</h3>
    <p v-if="plan.length" class="next"><b>{{ plan[0]!.do }}</b><template v-if="plan[0]!.buys">: {{ plan[0]!.buys }}</template>.</p>

    <div class="subtabs" role="tablist">
      <button v-for="[id, label] in TABS" :key="id" role="tab" :aria-selected="tab === id" @click="sec = SECTIONS.find((s) => s[2] === id)![0]">{{ label }}</button>
    </div>
    <div class="subtabs sub" role="tablist">
      <button v-for="[id, label] in SECTIONS.filter((s) => s[2] === tab)" :key="id" role="tab" :aria-selected="sec === id" @click="sec = id">{{ label }}</button>
    </div>

    <template v-if="sec === 'plan'">
    <template v-if="plan.length > 1">
      <h3>Plan, step by step</h3>
      <p v-if="reset?.endgame" class="note">End game (wiki, Stage 50 and beyond): keep pushing, reset once a reset pays over 235T Spirals, spend them maxing the remaining Shrine upgrades, rebuild the end-game barn. Times are the game's stage times † where known; rebuilding and levelling are not modelled.</p>
      <p v-else class="note">Optimises reaching the next colour wall by the wiki's reset loop: reset once a stage takes over 2 h, spend Spirals on the
        Shrine goal (cheapest level first), rebuild the barn, push. Times are the game's stage times † where known; rebuilding and levelling are not modelled.</p>
      <div class="tbl"><table class="list nosort">
        <thead><tr><th class="num">Step</th><th>Do</th><th class="num">Takes</th><th>Buys</th></tr></thead>
        <tbody><tr v-for="(st, k) in plan" :key="k"><td class="num">{{ k + 1 }}</td><td>{{ st.do }}</td>
          <td class="num">{{ st.sec == null ? '—' : st.sec ? fmtTime(st.sec) : 'now' }}</td><td class="m">{{ st.buys }}</td></tr>
          <tr><td></td><td><b>Total (known steps)</b></td><td class="num"><b>{{ planSec ? fmtTime(planSec) : 'now' }}</b></td><td></td></tr></tbody>
      </table></div>
    </template>
    <h3 v-if="others.length">Other checks</h3>
    <ol v-if="others.length" class="steps"><li v-for="s in others" :key="s">
      <template v-if="s === r.reroll?.text">{{ r.reroll.intro }}
        <div class="tbl"><table class="list">
          <thead><tr><th>Coin trait</th><th class="num">Chance a roll</th><th class="num">Rerolls</th><th class="num">Energy</th><th>Can't come up until</th></tr></thead>
          <tbody><tr v-for="t in r.reroll.rows" :key="t.name"><td>{{ t.name }}</td><td class="num">{{ t.pct }}</td><td class="num">{{ t.rerolls }}</td><td class="num">{{ t.energy }}</td><td>{{ t.until }}</td></tr></tbody>
        </table></div>{{ r.reroll.outro }}</template>
      <template v-else>{{ s }}</template></li></ol>
    </template>

    <template v-else-if="sec === 'bosses'">
    <div class="sec-head"><h3>Where you are</h3><span class="m">wiki phase {{ r.phase }}</span></div>
    <p class="facts"><span><b>Afterlife</b> {{ r.afterlife }} † (best reached {{ r.bestReached }} †)</span>
      <span><b>Realm Lv</b> {{ r.realmLv }} † ({{ sci(r.exp) }} / {{ sci(r.need) }} EXP †<template v-if="r.realmLv < 20">; Lv20 in {{ sci(r.toLv20) }}</template>)</span>
      <span><b>Coins</b> {{ sci(r.coins) }} †</span><span><b>Spirals</b> {{ sci(r.spirals) }} †</span><span><b>Crystal eyes</b> {{ r.crystals }} †</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Colour</th><th>First boss †</th><th>You deal it</th><th class="num">This boss HP left †</th><th>How (wiki)</th></tr></thead>
      <tbody><tr v-for="t in r.tiers" :key="t.colour" :class="{ gate: t === r.nextGate, future: t.first > r.bestReached && t !== r.nextGate }">
        <td><i class="sw" :class="t.colour.toLowerCase()"></i>{{ t.colour }}</td><td>Afterlife {{ t.first }}</td>
        <td :class="t.can ? 'st-good' : 'st-bad'">{{ t.can ? 'yes' : 'no' }}</td>
        <td class="num">{{ t.first <= r.afterlife && t.hp > 0 ? sci(t.hp) : t.first <= r.afterlife ? 'cleared' : '' }}</td><td class="m">{{ t.how }}</td></tr></tbody>
    </table></div>
    <p class="note">Pink has no source of its own: while Pink is the boss's tier every colour lands (CreateDmg @6446043).</p>
    <details class="how"><summary>How "You deal it" is worked out</summary>
    <p>A barn minion's own or inherited trait (an evolved minion keeps its ancestors' traits †), or the Orb Tower laser for Blue.</p>
    </details>

    <div class="sec-head"><h3>Time to beat each boss</h3><span class="m">your barn as it is now</span></div>
    <template v-if="stages.length">
      <p class="note">Barn exactly as it is now: no levelling, no new minions, no blessings picked, watching the Realm screen.</p>
      <div class="tbl wide"><table class="list">
        <thead><tr><th class="num">Afterlife</th><th>Per tier: HP † · your DPS † · time</th><th class="num">Total</th><th>Blocker</th></tr></thead>
        <tbody><tr v-if="quickStages.length > 1"><td class="num">{{ quickStages[0]!.afterlife }}–{{ quickStages.at(-1)!.afterlife }}</td><td class="m">every tier under a second</td><td class="num"><b>{{ fmtTime(quickStages.reduce((t, s) => t + s.sec, 0)) }}</b></td><td></td></tr>
          <tr v-for="s in slowStages" :key="s.afterlife" :class="{ gate: !Number.isFinite(s.sec) }">
          <td class="num">{{ s.afterlife }}<small v-if="s.afterlife === r.afterlife" class="m"> (now, HP left)</small></td>
          <td><span v-for="t in s.tiers" :key="t.colour" class="tier"><i class="sw" :class="t.colour.toLowerCase()"></i>{{ sci(t.hp) }} · {{ t.colour === 'Purple' ? 'banish' : sci(t.dps) + '/s' }} · <b>{{ fmtTime(t.sec) }}</b></span></td>
          <td class="num"><b>{{ fmtTime(s.sec) }}</b></td><td :class="{ 'st-bad': s.blocker && !Number.isFinite(s.sec) }">{{ s.blocker ?? '' }}</td></tr></tbody>
      </table></div>
      <details class="how"><summary>How the boss times are worked out</summary>
      <p>Every number is the game's code †:
        minion damage, crit, attack speed and multihit (MinionInfo), which hits land on which colour (CreateDmg), boss HP (BossHPtot), the Blue laser and its energy.
        Tiers fall highest colour first. A second "if coins keep levelling minions" column is left out: it needs a buy-order model, not just the cost formula.</p>
      </details>
    </template>
    <p v-if="reset && !(reset.now > 0)" class="next"><b>Push on:</b> you just reset, so a reset pays nothing until you beat a boss this run. Rebuild the barn (Barn tab: the composition for your stage) and push.</p>
    <p v-else-if="reset" class="next"><b>{{ reset.reset ? 'Reset now' : 'Push on' }}:</b> a reset pays <b>{{ sci(reset.now) }} Spirals</b> † (every multiplier, the game's ShrineResetQTY).
      Beating Afterlife {{ r.afterlife }} first ({{ fmtTime(reset.sec) }}) raises it to {{ sci(reset.next) }}.
      <template v-if="reset.endgame">{{ reset.reset ? 'Over the wiki\'s end-game 235T: reset to max the remaining Shrine upgrades. Banish and spend your coins first: the reset wipes minions and coins.' : 'End game: the wiki says keep pushing until a reset pays over 235T Spirals.' }}</template>
      <template v-else>{{ reset.reset ? 'The wiki\'s reset loop resets once a stage takes more than 2 h. Banish and spend your coins first: the reset wipes minions and coins.' : 'Under 2 h, so the wiki says take the stage.' }}</template></p>
    <p v-else class="note">Needs data/realm-combat.json (dev only: click Recalc above, or bun src/realm-combat.ts --force).</p>

    <div class="sec-head"><h3>Against the wiki's progression guide</h3><span class="m">you are in {{ r.phase }} (best Afterlife {{ r.bestReached }})</span></div>
    <p class="note">The wiki's Strategies section as a checklist. Status from the save †; targets are the wiki's.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Wiki stage</th><th>Milestone</th><th>Status</th><th>You</th></tr></thead>
      <tbody><tr v-for="p in r.progress" :key="p.item" :class="{ future: !p.done && !p.due }">
        <td class="m">{{ p.when }}</td><td>{{ p.item }}</td>
        <td :class="p.done ? 'st-good' : p.due ? 'st-warn' : ''">{{ p.done ? 'done' : p.due ? 'to do' : 'later' }}</td><td class="m">{{ p.have }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'purple'">
    <p class="note">Purple takes damage only from banishes, and a banish deals damage from the coins spent on the banished minion, whatever its type. So each Purple boss below names the minion whose banish costs you the least coin income. Its traits leave with it. A Shrine reset wipes the barn anyway, so a banish just before a reset costs nothing.</p>
    <template v-if="combat?.purpleTargets">
      <p v-if="!combat.purpleTargets.bop" class="warn">No Rainboppo (Banish Bop) in the barn: Purple takes no damage until you have one.</p>
      <p class="facts"><span><b>Banishes left today</b> {{ combat.purpleTargets.banishes }}<template v-if="refill">, refill in {{ refill }}</template></span><span><b>Coins</b> {{ sci(combat.purpleTargets.coins) }}</span></p>
      <h3>The run in order</h3>
      <p class="facts"><span><b>Protect charges</b> {{ combat.purpleTargets.protect.charges }} held<template v-if="combat.purpleTargets.protect.canBuy"> + {{ combat.purpleTargets.protect.total - combat.purpleTargets.protect.charges }} from {{ Math.floor(combat.purpleTargets.protect.energy) }} Orb energy ({{ combat.purpleTargets.protect.cost }} each)</template><template v-else> (buying needs 2 Orb expansions)</template></span><span v-if="combat.purpleTargets.protect.regen > 0"><b>Orb charge</b> {{ combat.purpleTargets.protect.regen.toFixed(1) }}/h: one protect every {{ fmtTime(3600 * combat.purpleTargets.protect.cost / combat.purpleTargets.protect.regen) }} of waiting</span></p>
      <p class="note">The bosses one after another: what each banish removes is gone for the next boss, poured coins leave the purse, and today's banishes count down. A protect charge (Orb Tower, before the banish) keeps the banished minion, so protected banishes come first and cost only energy. Between Purple bosses the Orb charges while the other colours are fought, and Blue's laser spends from the same energy. When the energy is short, the step waits for the Orb rather than sacrifice a minion. Coins earned between bosses are not counted.</p>
      <p v-if="combat.purpleTargets.protect.upfront && combat.purpleTargets.protect.upfront.wait > 0" class="facts"><span><b>Or wait once</b> {{ fmtTime(combat.purpleTargets.protect.upfront.wait) }} before the run and buy all {{ combat.purpleTargets.protect.upfront.buy }} protect charges up front: bought charges are kept, while unspent energy goes to Blue's laser between bosses.<template v-if="!combat.purpleTargets.protect.upfront.fits"> (more than the Orb's energy cap holds: buy as it fills)</template></span></p>
      <ol class="steps"><li v-for="q in combat.purpleTargets.sequence" :key="q.afterlife">
        <template v-if="q.stop">Afterlife {{ q.afterlife }} ({{ sci(q.hp) }} Purple HP): <b>stop</b>, {{ q.stop }}.</template>
        <template v-else>Afterlife {{ q.afterlife }}: <template v-if="q.poured! > 0">pour {{ sci(q.poured!) }} coins into {{ q.targets![0]!.name }} ({{ q.targets![0]!.pos }}), then </template><template v-if="q.best === 'protected'"><template v-if="q.wait! > 0">wait {{ fmtTime(q.wait!) }} for the Orb to charge<template v-if="q.saves != null"> (saves the {{ pct(q.saves) }} coin income a sacrifice would cost)</template>, then </template>protect, then banish <b>{{ q.targets![0]!.name }}</b> ({{ q.targets![0]!.pos }}){{ q.banishes! > 1 ? ` ×${q.banishes}, protecting before each` : '' }}: it stays in the barn.</template><template v-else>banish {{ q.targets!.map((t) => `${t.name} (${t.pos})`).join(' + ') }} (no protect left). Coin income after: {{ pct(q.rateLeft!) }} of today's.</template></template>
      </li></ol>
      <h3>Each boss on today's barn</h3>
      <table class="tbl"><thead><tr><th>Afterlife</th><th class="num">Purple HP</th><th class="num">Coins spent needed (1 banish)</th><th>Sacrifice (no protect)</th><th class="num">Coins/min lost</th></tr></thead>
        <tbody><tr v-for="b in combat.purpleTargets.rows" :key="b.afterlife"><td>{{ b.afterlife }}</td><td class="num">{{ sci(b.hp) }}</td><td class="num">{{ sci(b.needSpent) }}</td>
          <td v-if="b.best === 'single'"><b>{{ b.single!.name }}</b> ({{ b.single!.pos }})<template v-if="b.single!.add > 0">: pour in {{ sci(b.single!.add) }} coins first</template>, 1 banish<span v-if="b.alt.length" class="m"> · else {{ b.alt.map((a) => `${a.name} (${a.pos})`).join(', ') }}</span></td>
          <td v-else-if="b.best === 'multi'">{{ b.multi!.n }} banishes: {{ b.multi!.targets.map((t) => `${t.name} (${t.pos})`).join(' + ') }}</td>
          <td v-else class="m">out of reach: no target or set of today's banishes deals enough</td>
          <td class="num">{{ b.best === 'single' ? pct(b.single!.loss) : b.best === 'multi' ? pct(b.multi!.loss) : '—' }}</td></tr></tbody></table>
      <p class="note">Coins/min lost = the drop in the barn's coin rate (game MinionCASH) with that minion gone, as a share of today's. One-banish picks need the coins to fit what you hold and the minion's evolve cap; several banishes use only coins already spent on each target. Each row is worked out on today's barn: a minion banished for one boss is gone for the next. †</p>
    </template>
    <p v-else class="note">Needs data/realm-combat.json (dev only: click Recalc above, or bun src/realm-combat.ts --force).</p>
    </template>

    <template v-else-if="sec === 'trophies'">
    <div class="sec-head"><h3>Trophies</h3><span class="m">{{ r.trophies.claimed }} / {{ r.trophies.total }} claimed †</span></div>
    <p class="note">Every trophy's requirement as the game code checks it (offset in Qno2x.js), read against your save. A claim offers the next
      trophy in its chain; the panel lists the first four offered. Times assume today's barn and coin rate.</p>
    <div class="tbl wide"><table class="list">
      <thead><tr><th class="num">#</th><th>Trophy</th><th>Status</th><th class="num">Progress</th><th>Next step</th><th>Estimate</th><th>Code check</th></tr></thead>
      <tbody><tr v-for="t in trophies.filter((t) => t.status !== 'claimed')" :key="t.i"><td class="num">{{ t.i }}</td><td>{{ t.text }}</td>
        <td :class="{ 'st-good': t.status === 'ready', 'st-warn': t.status === 'open' }">{{ STATUS[t.status] }}</td>
        <td class="num">{{ t.have == null ? '—' : `${sci(t.have)} / ${sci(t.target)}` }}</td><td>{{ t.next }}<StepsDialog v-if="t.steps" :title="t.steps.title" :cols="t.steps.cols" :rows="t.steps.rows" /></td><td class="m">{{ t.eta }}</td><td class="m">{{ t.rule }} {{ t.at }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'barn'">
    <div class="sec-head"><h3>Barn</h3><span class="m">{{ r.minions.length }} / {{ r.slots }} slots †</span></div>
    <p><label>Progression stage
      <select :value="stagePick" @change="setStage(($event.target as HTMLSelectElement).value)">
        <option value="">Auto: {{ STAGES.find((s) => s.key === r!.comp.stageAuto)!.label }}</option>
        <option v-for="s in STAGES" :key="s.key" :value="s.key">{{ s.label }}</option>
      </select></label>
      <label v-if="r.comp.rows.some((c) => c.optional || c.pick)"> Optimise for
      <select :value="goalPick" @change="setGoal(($event.target as HTMLSelectElement).value)">
        <option v-for="g in GOALS" :key="g.key" :value="g.key">{{ g.label }}</option>
      </select></label>
      <small class="m"> Auto reads best Afterlife {{ r.bestReached }}, Realm Lv{{ r.realmLv }} and the Shrine goal; BP (Bagged Pancakes) = {{ r.comp.bp }}. The plan's rebuild step follows this choice.</small></p>
    <div class="tbl"><table class="list nosort">
      <thead><tr><th>Wiki composition: {{ r.comp.label }}</th><th>Level</th><th>You have</th><th>Why (wiki)</th></tr></thead>
      <tbody><tr v-if="stageImage(r.comp.stage)"><td colspan="4" class="m">Transcribed from the wiki image <a :href="`https://idle-skilling.fandom.com/wiki/File:${stageImage(r.comp.stage)!.replace(/ /g, '_')}`" target="_blank" rel="noopener">{{ stageImage(r.comp.stage) }}</a> (Realm › Strategies › Stage 1-15; the wiki has no table for these). Counts and levels are the screenshot's barn.</td></tr>
        <tr v-for="c in r.comp.rows" :key="c.id + c.count" :class="{ m: c.optional && !c.pick }">
        <td>{{ c.count === 999 ? 'rest' : c.pick && c.optional ? `for ${c.pick}: any (no cap)` : c.optional ? (c.count ? `optional, up to ${c.count}` : 'optional, any') : (c.pick ? `for ${c.pick}: ` : '') + c.count + '×' }} <b>{{ c.name }}</b> <small class="m">{{ c.path }}</small></td><td>{{ c.level || '—' }}</td>
        <td :class="{ 'st-bad': !c.optional && c.have.length < Math.min(c.count, 1) }"><span v-for="m in c.have" :key="m.slot">{{ m.name }} Lv{{ m.level }}<small v-if="m.id !== c.id" class="m"> (Lv{{ m.cap }} to evolve)</small>; </span><template v-if="!c.have.length">none</template></td><td class="m">{{ c.note }}</td></tr>
        <tr v-if="r.comp.extra.length"><td class="m">Not in the composition</td><td></td><td class="m" colspan="2"><span v-for="m in r.comp.extra" :key="m.slot">{{ m.name }} Lv{{ m.level }}; </span></td></tr></tbody>
    </table></div>
    <details v-if="r.comp.stage === 'endgame'"><summary>Measured alternative: economy tail (coins ×{{ ECONOMY_TAIL.coins }}, DPS ×{{ ECONOMY_TAIL.dps }}, White ×{{ ECONOMY_TAIL.white }})</summary>
      <p class="m">Replace {{ ECONOMY_TAIL.replaces }} of the Lizardmen with the minions below, summoned last so they sit at the end of the barn (earlier slots keep their index, which the coin doubler reads, #2645).
        Measured {{ ECONOMY_TAIL.measured }} on your save at Afterlife 71 with the game's own code: coins ×{{ ECONOMY_TAIL.coins }}, Red+Orange DPS ×{{ ECONOMY_TAIL.dps }}.
        These don't attack ({{ ECONOMY_TAIL.attackers[0] }} → {{ ECONOMY_TAIL.attackers[1] }} attackers), but they lift every attacker's crit damage and multihit, and crits apply to White hits, so White tiers clear ×{{ ECONOMY_TAIL.white }} faster ({{ ECONOMY_TAIL.whiteSec[0] }} s vs {{ ECONOMY_TAIL.whiteSec[1] }} s over Afterlife 71-75). It beats the Lizardman fill on coins, Red/Orange and White; Purple (banishing) is unaffected.</p>
      <div class="tbl"><table class="list"><thead><tr><th>Minion</th><th>Count</th><th>You have</th></tr></thead>
        <tbody><tr v-for="[nm, n] in ECONOMY_TAIL.swap" :key="nm"><td><b>{{ nm }}</b></td><td class="num">{{ n }}</td><td class="num">{{ r.minions.filter((m) => m.name === nm).length }}</td></tr></tbody></table></div>
    </details>
    <details><summary>Every minion †</summary>
      <div class="tbl"><table class="list"><thead><tr><th class="num">Barn</th><th>Minion</th><th class="num">Level</th><th>Path</th><th class="num">Coins spent</th></tr></thead>
        <tbody><tr v-for="m in r.minions" :key="m.slot"><td class="num">{{ barnPos(m.slot) }}</td><td>{{ m.name }}</td><td class="num">{{ m.level }} / {{ m.cap }}</td><td class="m">{{ m.path }}</td><td class="num">{{ sci(m.spent) }}</td></tr></tbody></table></div>
    </details>
    </template>

    <template v-else-if="sec === 'minions'">
    <div class="sec-head"><h3>Every minion and how to get it</h3><span class="m">grouped by evolution line (indent = one evolution)</span></div>
    <p class="note"><label>Family <select v-model="fam"><option value="all">all</option><option v-for="f in families" :key="f">{{ f }}</option></select></label>
      <label>Show <select v-model="show"><option value="all">all</option><option value="owned">owned</option><option value="next">next from what you own</option><option value="reachable">reachable now</option><option value="locked">locked</option></select></label></p>
    <details class="how"><summary>Sources and how colours are read</summary>
    <p>† = game code (MinionDatabase, TraitTypes, SummonTypesUnlocked); "wiki" column is the wiki's note.
      An evolved minion keeps every ancestor's trait †, so colours include inherited ones. Evolution choice: at the level shown you pick one of the two branches.</p>
    </details>
    <div class="tbl wide"><table class="list guide">
      <thead><tr><th>Minion</th><th>Family</th><th>How to get it</th><th>Family unlock</th><th>Damage †</th><th>Trait †</th><th>Wiki</th><th>You</th></tr></thead>
      <tbody><tr v-for="g in guideRows" :key="g.id" :class="g.state.kind">
        <td :style="{ paddingLeft: 8 + 14 * g.depth + 'px' }"><b><Icon kind="minion" :id="g.id" :name="g.name" /></b></td><td class="m">{{ g.family }}</td>
        <td>{{ g.how }}<small v-if="g.disagree" class="st-warn"> ({{ g.disagree }})</small></td><td class="m">{{ g.unlock }}</td>
        <td>{{ g.colours.join(', ') }}</td><td class="m">{{ g.trait }}</td><td class="m">{{ g.wiki }}<div v-if="g.gameSays" class="game-says"><b>Game code:</b> {{ g.gameSays }}</div></td>
        <td>{{ g.state.kind === 'next' ? 'next' : g.state.kind }}: {{ g.state.text }}</td></tr></tbody>
    </table></div>

    <template v-if="combat?.trophies">
      <h4>60 unique minion types: the route</h4>
      <p class="facts"><span><b>{{ combat.trophies.unique }}</b> / 60 now</span><span><b>{{ combat.trophies.need }}</b> more types</span>
        <span><b>{{ combat.trophies.slots }}</b> barn slots, {{ combat.trophies.free }} empty</span><span><b>{{ combat.trophies.banish.length }}</b> banishes ({{ combat.trophies.banishLeft }} of {{ combat.trophies.banishMax }} left today)</span>
        <span><b>{{ sci(combat.trophies.cost) }}</b> coins, {{ combat.trophies.levelUps.toLocaleString() }} level-ups</span></p>
      <p class="note">Each distinct minion id in the barn counts once, and each Countinion pick counts one more (CalcMisc UniqueBarnMinions @6472833).
        Spare copies are evolved into a missing descendant first (no slot needed); the rest are summoned (portal price per family @6389447, Lv1) and levelled
        (MinionUpgCost @6410500) to the stage the target needs. Slots come from banishing spares, the one whose loss costs the fewest coins first
        (barn total {{ sci(combat.trophies.cashLoss) }} of {{ sci(combat.trophies.cashPerMin) }} coins/min goes with them, before the new minions' own bonuses).
        A Shrine reset empties the barn and the Countinion picks, so finish first.</p>
      <p>{{ route.length }} steps, banishes first.<StepsDialog title="60 unique minion types: the route" :cols="['Do', 'Coins']" :rows="route.map((x) => [x.do, x.cost ? sci(x.cost) : ''])" /></p>
    </template>
    </template>

    <template v-else-if="sec === 'traits'">
    <div class="sec-head"><h3>Traits</h3><span class="m">{{ r.traitRows.filter((t) => t.held).length }} of {{ r.traitRows.length }} held †</span></div>
    <p class="note">Held = the carriers the game's MinionTraitALL counts: barn minions whose trait list (own, ancestors', family passive, Orb trait, Field plots) has it;
      an unstackable trait stops at 1 + Stackability (max 1) + Bagged Pancakes carriers. Total = held × value. "Each carrier" traits are read per minion, not as a total.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">#</th><th>Trait</th><th>Effect</th><th class="num">Held †</th><th>Total now †</th></tr></thead>
      <tbody><tr v-for="t in r.traitRows" :key="t.id" :class="{ dim: !t.held }"><td class="num">{{ t.id }}</td><td>{{ t.name }}</td>
        <td class="m">{{ fill(t.text, t.v) }}</td>
        <td class="num">{{ t.held }}<template v-if="t.carriers > t.held"> of {{ t.carriers }}</template><template v-if="!t.stack"> (unstackable)</template></td>
        <td>{{ t.effect }}<div v-if="t.slotNote" class="m">{{ t.slotNote }}</div></td></tr></tbody>
    </table></div>
    <p class="note">Game bug †: the 2× coin roll (@6606617, away @6574275) asks for MinionTraitALL(slot, 48), but that block reads only its first argument, so a Coin Pressing minion in barn slot k doubles with chance = the barn total of trait k. Cash Genesis (48) is never read. The same roll at @6575191 sits outside the Coin Pressing test, in the Orb-charge path, and its doubled value is reassigned before the Orb-charge use, so it pays no coins.</p>
    <p v-if="coins?.evolveGobbos" class="next"><b>{{ coins.evolveGobbos.count === 1 ? 'Your last Gobbo' : `All ${coins.evolveGobbos.count} Gobbos` }} → Lizardman:</b>
      {{ num(perHour!.screen) }} → <b>{{ num(coins.evolveGobbos.rate * 60) }}</b> coins an hour on the Realm screen (×{{ mult(coins.evolveGobbos.rate / coins.perMin) }}, the game's MinionCASH on the changed barn).
      Costs {{ num(coins.evolveGobbos.cost) }} coins in level-ups to Lv50 ({{ coins.evolveGobbos.cost <= coins.coins ? 'you can afford it now' : 'more than you hold' }}).
      Evolving keeps level and coins spent; a Lizardman keeps Smol Cash through its Gobbo parent and adds Bless Updog. Unique minion types drop by one (Gobbo), which only Tax Collector and Major Wound read.</p>
    </template>

    <template v-else-if="sec === 'loadouts'">
    <p class="note">A target barn per goal, worked out on the game's own formulas from this save. Your barn holds one loadout at a time.</p>
    <div class="sec-head"><h3>Coin loadout</h3><span v-if="coins?.loadout" class="m">×{{ mult(coins.loadout.rate / coins.perMin) }} coins/min</span></div>
    <template v-if="coins?.loadout">
      <p class="facts"><span><b>Now</b> {{ sci(coins.perMin) }}/min</span><span><b>With this loadout</b> {{ sci(coins.loadout.rate) }}/min †</span>
        <span><b>Cost</b> {{ sci(coins.loadout.cost) }} of {{ sci(coins.loadout.coins) }} coins</span><span v-if="coins.loadout.orbBuys"><b>Orb +10% coin buys</b> {{ coins.loadout.orbBuys }}×</span></p>
      <ol class="steps">
        <li v-if="coins.loadout.fill.length">Fill {{ coins.loadout.fill.length }} empty slots ({{ sci(coins.loadout.fillCost) }} coins), each with the type that adds the most coins once the rest are spent on levels: new types count for Tax Collector, repeats add their traits again (Scissarus and Lizardman carry Bless Updog, which multiplies the coin blessings).
          <StepsDialog title="Empty-slot fill" :cols="['Minion type', 'Evolution path', 'Cost (summon + levels)', 'Coins × from this slot']" :rows="coins.loadout.fill" /></li>
        <li v-if="coins.loadout.moves?.length">Rearrange {{ coins.loadout.moves.length }} minions so the biggest earners sit on the slots with the highest 2× chance (in the listed order: each drag swaps two minions).<template v-if="dragsFor90"> The first {{ dragsFor90 }} give 90% of the gain.</template>
          <StepsDialog title="Rearrange" :cols="['Minion', 'From', 'To', '2× chance', 'Coins × after this drag']" :rows="coins.loadout.moves" /></li>
        <li v-if="coins.loadout.levels.length">Level {{ coins.loadout.levels.length }} coin minions with the rest of the coins, each to the level where its last level pays as well as every other's.
          <StepsDialog title="Levels" :cols="['Minion', 'Barn (after the drags)', 'From Lv', 'To Lv']" :rows="coins.loadout.levels" /></li>
        <li v-if="coins.loadout.orbBuys">Spend Orb energy on {{ coins.loadout.orbBuys }} +10% coin buys.</li>
      </ol>
    </template>
    <p v-else class="note">Needs data/realm-combat.json with the coin model (dev only: click Recalc above, or bun src/realm-combat.ts --force).</p>
    <div class="sec-head"><h3>Speed trophies loadout</h3><span class="m">the coins a reset starts with, spent on speed †</span></div>
    <div v-if="combat?.sprint?.some((p) => p.allIn)" class="tbl"><table class="list">
      <thead><tr><th>Trophy</th><th>Goal</th><th class="num">Fewest buys (9 in 10 within)</th><th class="num">All-in (9 in 10 within)</th><th class="num">Coins</th><th>Summon first (grouped)</th><th>Barn</th></tr></thead>
      <tbody><tr v-for="p in combat.sprint.filter((p) => p.allIn)" :key="p.trophy">
        <td>#{{ p.trophy }}</td><td>{{ p.bosses }} bosses in {{ p.limit }} s</td>
        <td class="num">{{ p.times.map((t) => Math.round(t.p90) + ' s').join(' · ') }}</td>
        <td class="num"><b>{{ p.allIn!.times.map((t) => Math.round(t.p90) + ' s').join(' · ') }}</b></td>
        <td class="num">{{ sci(p.allIn!.cost) }}</td>
        <td>{{ summons(p) }}</td>
        <td><StepsDialog :title="`#${p.trophy} all-in barn`" :cols="sprintRow({ ...p, steps: p.allIn!.steps }).steps!.cols" :rows="groupedRows(p)" /></td></tr></tbody>
    </table></div>
    <p class="note">Times are the game's fight rules simulated from just after a Shrine reset, with your measured buying pace (first buy at 12 s, 0.5 s a summon or evolve, 7 levels/s held, 7 s between minion lines); a minion fights once its line is bought. The trophy clock starts at the reset and a dead boss waits for your portal click, so buy the attackers first and click the portal every kill instead of buying everything before the first boss. The first 20 bosses end before Purple (Afterlife 23), so Purple doesn't limit these.</p>
    <div class="sec-head"><h3>Orb power loadout</h3><span class="m">energy an hour on the Realm screen</span></div>
    <template v-if="combat?.orb">
      <p>Orb charge doesn't depend on level or coins: each minion gives a flat {{ combat.orb.other }}/h (Spare Charge), and a Lizard-line minion (Lizard, Crocodile, Iguana and their evolutions) {{ combat.orb.lizard }}/h. So the loadout is every slot a Lizard (Babby Egg → Lizard Lv10).</p>
      <p class="facts"><span><b>Now</b> {{ +combat.orb.perHourNow.toFixed(1) }}/h</span><span><b>All {{ combat.orb.slots }} slots Lizards</b> {{ +combat.orb.fullLizards.toFixed(1) }}/h ({{ Math.round(24 * combat.orb.fullLizards).toLocaleString() }} a day)</span>
        <span><b>Any other full barn</b> {{ +combat.orb.fullOther.toFixed(1) }}/h</span><span><b>Cap</b> {{ combat.orb.cap.toLocaleString() }} ({{ Math.floor(combat.orb.energy) }} held)</span></p>
      <p class="note">Energy buys: laser shot {{ combat.orb.costs.laser }}, banish-protect {{ combat.orb.costs.protect }}, +10% coin gain {{ combat.orb.costs.coinBuy }}. Even the Purple loadout's Horn Hippo barn charges {{ Math.round(24 * combat.orb.fullOther).toLocaleString() }} a day, far more than its protects need.</p>
    </template>
    <div class="sec-head"><h3>Flowers loadout</h3><span class="m">for the Field</span></div>
    <template v-if="combat?.orb?.flowers">
      <p>Flowers don't depend on level or coins either: each Ogre-family minion (Ogre Spawn and every evolution) makes {{ sci(combat.orb.flowers.perOgre) }} an hour (Field Bloomer); nothing else makes any. So the loadout is every slot a plain Ogre Spawn, the cheapest at {{ sci(combat.orb.flowers.summon) }} coins a summon.</p>
      <p class="facts"><span><b>Now</b> {{ sci(combat.orb.flowers.now) }}/h</span><span><b>All {{ combat.orb.slots }} slots Ogre Spawns</b> {{ sci(combat.orb.flowers.full) }}/h</span><span><b>Held</b> {{ sci(combat.orb.flowers.held) }}</span></p>
    </template>
    <div class="sec-head"><h3>Purple loadout</h3><span class="m">for the Afterlife walls past your best</span></div>
    <template v-if="combat?.purple">
      <p>Purple only takes Banish Bop hits, each the banished minion's Realm EXP gain. That gain grows with the coins spent on the
        minion (to the 0.4 power) times Riftseeker, which <b>stacks</b>: every Horn Hippo-line minion adds +150%.</p>
      <ol class="steps">
        <li>Keep one <b>Rainboppo</b> (Banish Bop; one is enough, it doesn't stack).</li>
        <li>Fill the other {{ combat.purple.full }} slots with <b>Horn Hippos</b> (Piggy → Hippo Lv10 → Horn Hippo Lv50): Riftseeker +{{ combat.purple.riftseeker.toLocaleString() }}%.</li>
        <li>Pour coins into one banish target: at least {{ combat.purple.minCoins ? sci(combat.purple.minCoins) : '—' }} to one-shot Afterlife {{ combat.purple.walls[0].afterlife }}'s Purple (you have {{ sci(combat.purple.coins) }}). Banish-protect it with Orb energy so you can banish it again.</li>
      </ol>
      <div class="tbl"><table class="list"><thead><tr><th>Afterlife</th><th class="num">Purple HP</th><th class="num">One banish (full barn, all coins)</th><th class="num">Banishes needed</th></tr></thead>
        <tbody><tr v-for="(w, i) in combat.purple.walls" :key="w.afterlife"><td>{{ w.afterlife }}</td><td class="num">{{ sci(w.hp) }}</td><td class="num">{{ sci(combat.purple.fullHit) }}</td><td class="num">{{ combat.purple.hitsPerWall[i] }} of {{ combat.purple.banishes }} a day</td></tr></tbody></table></div>
      <p class="note">With all coins in the target, {{ combat.purple.minHippos ?? '—' }} Horn Hippos are the fewest that one-shot Afterlife {{ combat.purple.walls[0].afterlife }}. Purple HP grows with your Realm level (it scales with the EXP needed for the next level), and banishing adds Realm EXP. Costs of the Horn Hippos (~1e8 each) are left out.</p>
    </template>
    </template>

    <template v-else-if="sec === 'coins'">
    <div class="sec-head"><h3>Maximise coins</h3><span v-if="coins" class="m">{{ sci(coins.perMin) }} a minute now †</span></div>
    <template v-if="coins">
      <p class="facts"><span><b>Coin rate</b> {{ sci(coins.perMin) }}/min, {{ sci(coins.perMin * 60) }}/h †</span><span><b>Coins held</b> {{ sci(coins.coins) }} † ({{ 60 * coins.coins / coins.perMin > 3.15e9 ? 'over a century' : fmtTime(60 * coins.coins / coins.perMin) }} of income)</span>
        <span><b>Coin minions</b> {{ coins.minions.length }} of {{ r.minions.length }}</span><span><b>Orb energy</b> {{ Math.floor(coins.energy) }} †</span></p>
      <p class="next"><b>Farming a boss you can't damage works.</b> Coins never depend on fighting: every 60 s on the Realm screen each Coin Pressing minion pays its
        coins/min whatever the boss is doing, and time off the screen is paid in whole minutes when you come back. Parked on any boss<template v-if="r.nextGate?.colour === 'Purple'">, the Afterlife {{ r.nextGate.first }} Purple wall included,</template> you keep
        {{ sci(coins.perMin * 60) }} coins an hour †. Only a kill adds more: Boss Pilfer multiplies held coins on a kill<template v-if="!coins.parts.bossPilfer"> (no minion has it)</template>.</p>

      <p class="note">Each row is the game's coin code run again with that one change on your save †: "rate after" is exact for the change, not an estimate.
        Rows you can do now come first, biggest gain first; then what to save or wait for. Gains multiply.</p>
      <div class="tbl wide"><table class="list nosort">
        <thead><tr><th class="num">Step</th><th>Do</th><th class="num">Cost</th><th class="num">Rate after (/min)</th><th class="num">Gain</th><th>Now?</th><th>Note</th></tr></thead>
        <tbody><tr v-for="(l, k) in coinRows" :key="l.do" :class="{ future: !l.afford }"><td class="num">{{ k + 1 }}</td><td>{{ l.do }}<StepsDialog v-if="l.steps" :title="l.do" :cols="l.steps.cols" :rows="l.steps.rows" /></td>
          <td class="num">{{ l.cost ? `${sci(l.cost)} ${CUR[l.currency]}` : l.currency === 'none' && !l.afford ? '—' : 'free' }}</td>
          <td class="num">{{ sci(l.rate) }}</td><td class="num"><b>×{{ mult(l.gain) }}</b></td>
          <td :class="l.afford ? 'st-good' : ''">{{ l.afford ? 'yes' : l.currency === 'none' || l.note.startsWith("can't") ? 'later' : 'save up' }}</td><td class="m">{{ l.note }}</td></tr>
          <tr><td></td><td><b>Every "yes" row together</b></td><td></td><td class="num"><b>{{ sci(coins.allNow) }}</b></td><td class="num"><b>×{{ mult(coins.allNow / coins.perMin) }}</b></td><td></td><td class="m">drags + levels + Orb buys, run together †</td></tr>
          <tr><td></td><td>Stay on this boss with the Realm open, or come back later: income does not stop at a wall</td><td class="num">free</td><td class="num">{{ sci(coins.perMin) }}</td><td class="num">×1.00</td><td class="st-good">yes</td><td class="m">{{ sci(coins.perMin * 60) }} an hour, fed back into levels</td></tr></tbody>
      </table></div>
      <p v-if="coins.lizardComparison" class="note">For comparison, not a step: filling the same {{ coins.lizardComparison.slots }} slots with Lizardmen instead would cost {{ sci(coins.lizardComparison.cost) }} coins for {{ sci(coins.lizardComparison.rate) }}/min (×{{ mult(coins.lizardComparison.rate / coins.perMin) }}); one type repeated adds no Tax Collector types.</p>

      <div class="sec-head"><h4>Coin minions †</h4><span class="m">coins a minute each, before and after the 2× roll</span></div>
      <div class="tbl"><table class="list">
        <thead><tr><th>Minion</th><th class="num">Barn</th><th class="num">Level</th><th class="num">Coins spent on it</th><th class="num">Coins/min</th><th class="num">2× chance</th><th class="num">Average/min</th></tr></thead>
        <tbody><tr v-for="m in coins.minions" :key="m.slot"><td>{{ m.name }}</td><td class="num">{{ barnPos(m.slot) }}</td><td class="num">{{ m.level }}</td><td class="num">{{ sci(m.spent) }}</td>
          <td class="num">{{ sci(m.cash) }}</td><td class="num">{{ Math.round(100 * m.double) }}%</td><td class="num">{{ sci(m.perMin) }}</td></tr></tbody>
      </table></div>
      <p class="facts"><span><b>All-coin multiplier</b> ×{{ sci(coins.parts.allCash) }} †</span><span><b>Make It Rain</b> +{{ sci(coins.parts.makeItRain) }}%</span>
        <span><b>Smart Money</b> +{{ coins.parts.smartMoney }}% per 5 Realm Lv</span><span><b>Gold Bless</b> +{{ coins.parts.goldBless }}% per top blessing</span>
        <span><b>Smol Cash</b> +{{ sci(coins.parts.smolCash) }}%</span><span><b>Tax Collector</b> +{{ coins.parts.taxCollector }}% per minion type</span>
        <span><b>Spend refund</b> {{ +coins.parts.refundPct.toFixed(1) }}%</span><span><b>Away bonus</b> +{{ coins.parts.awayPct }}%</span></p>
      <details class="how"><summary>How coins are earned (game code)</summary>
      <p>The only income: every 60 s on the Realm screen (RealmStuff[21] counts down 0.1 a 100 ms tick, @6606285) each minion with Coin Pressing
        (Piggy and Babby Egg lines) adds <code>MinionCASH</code> (@6406235) = (10·(25 + 3·Lv·1.014^Lv) + √coins spent on it) × AllCashBonus × (1 + Tax Collector·types) ×
        (1 + Smart Money·⌊Realm Lv/5⌋) × (1 + Gold Bless·top blessing count) × (1 + Smol Cash) × (1 + Level Cash·⌊Lv/100⌋). AllCashBonus (@6403149) holds Make It Rain,
        Choccy Coin and Sahaja (each to the power of best afterlife), Penny Thought / Dime Decisive / Banked Bygone blessings, trophies, fruit, Orb +10% buys and more.</p>
      <p>The 2× roll (@6606733) calls <code>MinionTraitALL(slot, 48)</code>, but that block reads only its first argument (@6441079): the chance is the barn's total of
        the trait whose number is the minion's slot index, so slot 9 (trait 8, Make It Rain, which the Orb gives every minion) is a sure double. Probably a game bug †.</p>
      <p>Away (@6574387): seconds off the Realm screen are added on return (@30848882), × (1 + fruit away bonus), and each coin minion pays MinionCASH × whole minutes, one 2× roll
        for the lot. Off the screen the counter is frozen: two reads 84 s apart with the game on another screen showed the same coins and the same minute timer.
        A boss tap gives 1 coin (@6586570); Boss Pilfer multiplies coins held by up to 1.5 on a kill (@6613604). Everything else that writes the coin count spends it
        (levels, vending, summons) or hands some back (spend refund @6590500, Orb undo @6929004); a Shrine reset zeroes it (@6763814).</p>
      </details>
    </template>
    <p v-else class="note">Needs data/realm-combat.json with the coin model (dev only: click Recalc above, or bun src/realm-combat.ts --force).</p>
    </template>

    <template v-else-if="sec === 'shrine'">
    <div class="sec-head"><h3>Shrine</h3><span v-if="r.shrineUnlocked" class="m">{{ sci(r.spirals) }} Spirals †</span></div>
    <div v-if="r.shrineUnlocked" class="tbl"><table class="list">
      <thead><tr><th>Upgrade</th><th class="num">Level †</th><th class="num">Wiki target</th><th class="num">Next cost †</th><th>Effect</th><th>Total now †</th></tr></thead>
      <tbody><tr v-for="s in r.shrine" :key="s.i">
        <td>{{ s.name }}</td><td class="num">{{ s.level }} / {{ s.max }}<b v-if="r.plan[s.name!]"> → {{ r.plan[s.name!]![1] }}</b></td>
        <td class="num" :class="{ 'st-warn': s.goal && s.level < s.goal[0] }">{{ s.goal ? (s.goal[0] === s.goal[1] ? s.goal[0] : `${s.goal[0]}–${s.goal[1]}`) : '' }}<s v-if="s.dead" title="The wiki's target, but the game never uses this level, so the plan skips it">{{ s.dead[0] }}–{{ s.dead[1] }}</s></td>
        <td class="num">{{ s.next == null ? 'max' : sci(s.next) }}</td><td class="m">{{ fill(s.text, '#') }}</td><td>{{ s.effect }}</td></tr></tbody>
    </table></div>
    <p v-else class="note">Opens after beating Afterlife 16.</p>
    <p v-if="r.shrineUnlocked" class="note">No upgrade is locked † (any row is buyable when its level is below max and you hold the cost). The Upgrades tab shows two rows at a time; drag its scroll bar down to reach Carnate onward.
      A reset now pays at least {{ sci(r.resetBase) }} Spirals † before multipliers (Enlightenment blessings, Resetti, Avocado; not ported).</p>
    <p class="note">Wiki: rush Dharma to Lv7 (Enlightenment blessing) before your third reset; reset once a stage takes more than ~2 hours. Dharma {{ r.shrine[0]!.level }} → {{ r.blessingTypes }} blessing types.
      Blessings held †: <span v-for="b in r.blessings" :key="b.key">{{ b.name }} ×{{ b.count }}; </span></p>
    </template>

    <template v-else-if="sec === 'vending'">
    <div class="sec-head"><h3>Vending Machine</h3><span class="m">you hold {{ sci(r.coins) }} coins †<template v-if="r.vending.some((_v, i) => vendBuys(i) > 0)"> · {{ r.vending.filter((v, i) => vendBuys(i) > 0 && v.flag !== 'avoid').length }} worth buying now</template></span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Item</th><th class="num">Level †</th><th class="num">Bonus †</th><th class="num">Next level costs †</th><th class="num">You can buy</th><th>Wiki</th><th>Effect</th><th>Total now †</th></tr></thead>
      <tbody><tr v-for="(v, i) in r.vending" :key="v.name" :class="{ buyable: vendBuys(i) > 0 && v.flag !== 'avoid', 'buyable-avoid': vendBuys(i) > 0 && v.flag === 'avoid' }"><td>{{ v.name }}</td><td class="num">{{ v.level }}</td><td class="num">{{ v.bonus }}</td>
        <td class="num">{{ vendCost(i) == null ? '—' : sci(vendCost(i)!) }}</td>
        <td class="num"><span v-if="vendCost(i) == null" class="m">—</span>
          <span v-else-if="vendBuys(i) > 0" :class="v.flag === 'avoid' ? 'badge warn' : 'badge good'">{{ v.flag === 'avoid' ? `${vendBuys(i)} (avoid)` : `buy ${vendBuys(i)}` }}</span>
          <span v-else class="m">short: {{ sci(vendCost(i)! / Math.max(r.coins, 1)) }}× your coins</span></td>
        <td :class="{ 'st-bad': v.flag === 'avoid' }">{{ v.flag }}</td><td class="m">{{ fill(v.text, '#') }}</td><td>{{ v.effect }}<small v-if="v.capNote" :class="v.flag === 'avoid' ? 'st-bad' : 'm'"> {{ v.capNote }}</small></td></tr></tbody>
    </table></div>
    <p class="note">Wiki warning: any cost reduction (Vendi Bar, Che Cheapo, Coconut, Smol Savings) lowers minion damage, because minion coin output scales with level-up cost.</p>
    </template>

    <template v-else-if="sec === 'field'">
    <div class="sec-head"><h3>Field</h3></div>
    <p v-if="!r.fieldUnlocked" class="note">Opens after beating Afterlife 25 (best: {{ r.best }} beaten). Wiki order then: Full Blossom first, Juiced Fruit, Cash Genesis, Spare Charge; skip Smol Savings (cost reduction).</p>
    <div v-else class="tbl"><table class="list">
      <thead><tr><th>Plot</th><th class="num">Level †</th><th>Wiki target</th></tr></thead>
      <tbody><tr v-for="f in r.field" :key="f.name"><td>{{ f.name }}</td><td class="num">{{ f.level }}</td>
        <td :class="f.avoid ? 'st-bad' : f.goal && f.level < f.goal ? 'st-warn' : ''">{{ f.avoid ? 'avoid (cost reduction)' : f.goal ?? '' }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'orb'">
    <div class="sec-head"><h3>Orb Tower</h3></div>
    <p class="facts"><span><b>Energy</b> {{ Math.floor(r.orb.energy) }} / {{ r.orb.cap }} †</span><span><b>Expansions</b> {{ r.orb.expansions }} †</span>
      <span><b>Trait</b> {{ r.orb.traitName }} †<template v-if="r.realmLv < 20 && r.orb.trait !== 22"> <span class="st-warn">(wiki: Riftseeker until Realm Lv20)</span></template></span>
      <span><b>+10% coin bought</b> {{ r.orb.coinBuys }}× †</span><span><b>Banish-protect charges</b> {{ r.orb.protects }} †</span>
      <span><b>Banishes today</b> {{ r.banishes.used }} / {{ r.banishes.max }} † · refill in {{ refill }}</span></p>
    <details class="how" open><summary>Trait reroll odds for this barn (15 energy a reroll)</summary>
      <p>The pool is 16 fixed traits. A trait can roll only if a barn minion carries it (own, ancestor, family passive, or the current Orb trait); Flesh Wound, Targeter, Clenched Fist and Powerful Fist are always in. Each allowed trait then rolls once at its base chance, lowest id first, and the first hit wins; if all miss you get Flesh Wound. So a trait's real odds are its base chance times the chance everything before it missed. Traits outside the pool, such as Charger, can never be rolled.</p>
      <div class="tbl"><table class="list">
        <thead><tr><th class="num">Id</th><th>Trait</th><th class="num">Base</th><th class="num">This barn</th><th class="num">Rerolls</th><th class="num">Energy</th><th>Carried by</th></tr></thead>
        <tbody><tr v-for="t in r.orbOdds" :key="t.id" :class="{ dim: t.status === 'blocked', coin: [8, 31, 39].includes(t.id) }">
          <td class="num">{{ t.id }}</td><td>{{ t.name }}</td><td class="num">{{ +(100 * t.base).toFixed(1) }}%</td>
          <td class="num">{{ t.p ? +(100 * t.p).toFixed(2) + '%' : 'blocked' }}</td><td class="num">{{ t.p ? '~' + Math.round(1 / t.p) : '—' }}</td><td class="num">{{ t.p ? '~' + Math.round(15 / t.p).toLocaleString() : '—' }}</td><td>{{ t.carriedBy }}</td></tr></tbody>
      </table></div>
    </details>

    <div class="sec-head"><h4>This run †</h4><span class="m">{{ hrs(r.run.seconds) }} in</span></div>
    <p class="facts"><span><b>Blessing rerolls left</b> {{ r.run.blessingRerolls }} (Ahisma gives {{ r.run.rerollsPerRun }} a run)</span>
      <span><b>Realm time skips bought</b> {{ r.run.timeSkipHours }} h</span><span><b>Flowers</b> {{ sci(r.run.flowers) }}</span></p>
    </template>

    <template v-else-if="sec === 'cornucopia'">
    <div class="sec-head"><h3>Cornucopia</h3></div>
    <p class="facts"><span><b>Food bundles</b> {{ sci(r.cornucopia.food) }} †</span><span><b>Turn-ins left today</b> {{ r.cornucopia.turnInsLeft }} of 2 †</span>
      <span><b>Fruit rerolls today</b> {{ r.run.fruitRerollsToday }} †, next {{ r.run.fruitRerollCost ? sci(r.run.fruitRerollCost) + ' food bundles' : 'free' }} † ({{ r.run.freeFruitRerolls }} free banked †)</span></p>
    <p v-if="!r.cornucopia.fruits.length"><b>Fruits †:</b> none</p>
    <div v-else class="tbl"><table class="list">
      <thead><tr><th>Fruit †</th><th>Bonuses</th></tr></thead>
      <tbody><tr v-for="f in r.cornucopia.fruits" :key="f.name"><td>{{ f.name }}</td><td>{{ f.bonuses.join(', ') }}</td></tr></tbody>
    </table></div>
    <div v-if="r.cornucopia.turnedIn.some((c) => c.total)" class="tbl"><table class="list">
      <thead><tr><th>Resource</th><th class="num">Turned in so far †</th></tr></thead>
      <tbody><tr v-for="c in r.cornucopia.turnedIn.filter((c) => c.total)" :key="c.label"><td>{{ c.label }}</td><td class="num">{{ sci(c.total) }}</td></tr></tbody>
    </table></div>
    </template>

    <template v-else-if="sec === 'torches'">
    <div class="sec-head"><h3>Lord's Lair torches</h3><span class="m">Torchy, Rainbow damage</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Torch</th><th>Lit †</th><th>Needs †</th><th>You</th></tr></thead>
      <tbody><tr v-for="t in r.torches" :key="t.torch"><td>{{ t.torch }}</td><td :class="t.lit ? 'st-good' : t.ready ? 'st-warn' : ''">{{ t.lit ? 'lit' : t.ready ? 'ready: visit the Lair' : 'no' }}</td>
        <td class="m">{{ t.need }}</td><td class="m">{{ t.have }}</td></tr></tbody>
    </table></div>
    <p class="note">Each torch is checked when you enter the Lord's Lair †; all four open the Torchy family †.</p>
    </template>

    <template v-if="STATS.includes(sec)">
    <template v-if="st && coins && dmg">
    <p class="note">The Realm's numbers as the game computes them: every row runs the game's own function (Source: function and byte offset in
      Qno2x.js) against your save. Where the save holds the same quantity, Stored shows it with ✓ when it agrees (= equal, ≤ within the limit).
      In this section † marks what is not in game code (unknown or inferred).</p>

    <template v-if="sec === 'coins'">
    <div class="sec-head"><h3>Coins</h3></div>
    <p class="facts"><span><b>Total coins per hour</b> {{ num(perHour!.screen) }} on the Realm screen</span><span><b>Away</b> {{ num(perHour!.away) }} an hour</span>
      <span class="m">all {{ coinMin.length }} coin minions, 2× rolls averaged</span></p>
    <div class="tbl"><table class="list">
      <thead><tr><th class="num">Barn</th><th>Coin minion</th><th class="num">Lv</th><th class="num">MinionCASH / min</th><th class="num">2× chance</th><th class="num">Level Cash ×</th><th class="num">Expected / min</th><th class="num">Per hour away</th></tr></thead>
      <tbody><tr v-for="m in coinMin" :key="m.slot"><td class="num">{{ barnPos(m.slot) }}</td><td>{{ m.name }}</td><td class="num">{{ m.level }}</td><td class="num">{{ num(m.cash) }}</td>
        <td class="num">{{ Math.round(100 * m.double) }}%</td><td class="num">{{ num(m.lvCash) }}</td><td class="num">{{ num(m.perMin) }}</td><td class="num">{{ num(m.hour) }}</td></tr>
        <tr><td></td><td><b>Total</b></td><td></td><td class="num">{{ num(coinMin.reduce((t, m) => t + m.cash, 0)) }}</td><td></td><td></td><td class="num"><b>{{ num(coins.perMin) }}</b></td><td class="num"><b>{{ num(coinMin.reduce((t, m) => t + m.hour, 0)) }}</b></td></tr></tbody>
    </table></div>
    <p class="note">Payout every 60 s on the Realm screen (@6606285): each Coin Pressing minion adds MinionCASH, ×2 when a roll beats the barn total of the trait numbered like its slot (@6606733).
      Away: MinionCASH × whole minutes × (1 + fruit 14%) on return, with the same 2× roll (@6574387). Coins held: {{ num(coins.coins) }} (RealmStuff[5]).</p>
    <h4>MinionCASH multipliers (@6406232)</h4>
    <p class="note">MinionCASH = (10·(25 + 3·Lv·1.014^Lv) + √coins spent) × AllCashBonus × Tax Collector × Smart Money × Gold Bless × Smol Cash × Level Cash. The AllCashBonus rows multiply to the block's own value (checked in src/realm-stats.test.ts).</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Multiplier</th><th class="num">Level</th><th class="num">×</th><th>Source</th><th>Note</th></tr></thead>
      <tbody><tr v-for="x in st.allCash" :key="x.name"><td><small class="m">AllCashBonus:</small> {{ x.name }}</td><td class="num">{{ x.level ?? '' }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}</td><td class="m">{{ x.note ?? '' }}</td></tr>
        <tr v-for="x in st.cash" :key="x.name" :class="{ gate: x.name.startsWith('AllCash') }"><td>{{ x.name }}</td><td class="num"></td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}</td><td class="m">{{ x.note ?? '' }}</td></tr></tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Other coin effect</th><th class="num">Value</th><th>Source</th><th>Note</th></tr></thead>
      <tbody><tr v-for="x in st.coinOther" :key="x.name"><td>{{ x.name }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}</td><td class="m">{{ x.note ?? '' }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else-if="sec === 'damage'">
    <div class="sec-head"><h3>Damage</h3><span class="m">per minute, against Afterlife {{ dmg.afterlife }}</span></div>
    <div class="tbl wide"><table class="list">
      <thead><tr><th class="num">Barn</th><th>Minion</th><th class="num">Lv</th><th class="num">Hit</th><th class="num">Crit</th><th class="num">Attack every</th>
        <th v-for="t in DMG_COLS" :key="t" class="num"><i class="sw" :class="TIERS[t]!.toLowerCase()"></i>{{ TIERS[t] }}{{ t === 5 ? ' (any)' : '' }}</th><th class="num">Banish (Purple)</th></tr></thead>
      <tbody><tr v-for="m in dmg.minions" :key="m.slot" :class="{ future: !m.attacks }"><td class="num">{{ barnPos(m.slot) }}</td><td>{{ m.name }}</td><td class="num">{{ m.level }}</td>
        <td class="num">{{ m.attacks ? num(m.dmg) : '—' }}</td><td class="num">{{ m.attacks ? `${num(m.crit)}% × ${num(m.critDmg)}` : '' }}</td><td class="num">{{ m.attacks ? fmtTime(attackPeriod(combat!.baseAtkSec, m.atkSpeed)) : '' }}</td>
        <td v-for="t in DMG_COLS" :key="t" class="num">{{ t === 6 && combat?.white ? '†' : m.dpm[t] ? num(m.dpm[t]) : '' }}</td><td class="num">{{ combat?.banishBop ? num(m.banishExp * (combat.allDmg ?? 1) * combat.otherMult) : '' }}</td></tr>
        <tr><td></td><td><b>Total / min</b></td><td></td><td></td><td></td><td></td><td v-for="t in DMG_COLS" :key="t" class="num"><b>{{ dmg.total[t] ? num(dmg.total[t]) : '0' }}</b></td><td></td></tr></tbody>
    </table></div>
    <p class="note">Hit = MinionDMG; per minute = hits × mean multihit ÷ attack period × crit mean, × (1 + Crimsonile) on Red, × (1 + Refractile) on the rest (CreateDmg @6446043).
      Yellow = Lemonhearted crits. Pink: CreateDmg lets every hit land while Pink is the boss's tier (except 4 s after a mass event, GenINFO[63]); its HP refills (@6592818), time not modelled †.
      White = log10 of your fight DPS a hit (whitedamage @6389249), not run here †. Blue is the Orb Tower laser: {{ num(combat!.laserPerSec * 60) }} a minute while firing, {{ combat!.laserCost }} energy per 10 s shot.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Afterlife {{ dmg.afterlife }} tier</th><th class="num">Full HP (BossHPtot)</th><th class="num">Left (RealmStuff[4])</th><th></th><th class="num">Your damage / min</th><th class="num">Time to kill</th><th>Wall / missing</th></tr></thead>
      <tbody><tr v-for="b in dmg.boss" :key="b.t" :class="{ future: b.done }"><td><i class="sw" :class="b.colour.toLowerCase()"></i>{{ b.colour }}</td><td class="num">{{ num(b.full) }}</td>
        <td class="num">{{ b.done ? 'beaten' : num(b.left) }}</td><td :class="b.untouched ? 'st-good' : ''">{{ b.untouched ? '✓ full' : '' }}</td>
        <td class="num">{{ b.dpm == null ? '†' : b.t === 4 ? `${num(b.dpm)} a banish` : num(b.dpm) }}</td><td class="num">{{ b.done ? '—' : b.sec == null ? 'later' : fmtTime(b.sec) }}</td>
        <td :class="{ 'st-bad': b.blocker && !Number.isFinite(b.sec ?? 0) }">{{ b.blocker ?? '' }}</td></tr></tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Colour</th><th class="num">First Afterlife needing it</th><th>You deal it</th><th>How</th></tr></thead>
      <tbody><tr v-for="t in r.tiers" :key="t.colour" :class="{ gate: !t.can && t.first <= r.bestReached + 1 }"><td><i class="sw" :class="t.colour.toLowerCase()"></i>{{ t.colour }}</td><td class="num">{{ t.first }}</td>
        <td :class="t.can ? 'st-good' : 'st-bad'">{{ t.can ? 'yes' : 'missing' }}</td><td class="m">{{ t.how }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else-if="sec === 'blessings'">
    <div class="sec-head"><h3>Blessings</h3><span class="m">{{ st.blessings.filter((b) => b.count).length }} types held</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Blessing number</th><th class="num">Value</th><th>Source</th><th class="num">Stored</th><th></th></tr></thead>
      <tbody><tr v-for="x in st.blessingStats" :key="x.name"><td>{{ x.name }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}</td>
        <td class="num">{{ x.stored == null ? '' : num(x.stored) }}</td><td :class="mark(x) === '✓' ? 'st-good' : 'st-bad'">{{ mark(x) }}</td></tr></tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <caption class="m">Show <select v-model="blessShow"><option value="all">all</option><option value="held">held</option><option value="missing">missing</option></select> · click a header to sort</caption>
      <thead><tr><th class="sortable" @click="sortBless('letter')">Letter{{ arrow('letter') }}</th><th class="sortable" @click="sortBless('name')">Blessing{{ arrow('name') }}</th>
        <th class="num sortable" @click="sortBless('count')">Picks{{ arrow('count') }}</th><th class="num sortable" @click="sortBless('value')">Bonus now{{ arrow('value') }}</th>
        <th class="sortable" @click="sortBless('text')">Effect (BlessingBonus @6480153){{ arrow('text') }}</th></tr></thead>
      <tbody><tr v-for="b in blessRows" :key="b.key" :class="{ future: !b.count }"><td><Icon kind="blessing" name="" :id="LETTERS.indexOf(b.key)" /></td><td>{{ b.name }}</td><td class="num">{{ b.count }}</td><td class="num">{{ num(b.value) }}</td>
        <td class="m">{{ b.text.replace(/\{/g, String(+b.value.toFixed(2))).replace(/\}/g, String(+(1 + b.value / 100).toFixed(3))) }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else-if="sec === 'blesstotals'">
    <div class="sec-head"><h3>Blessing totals</h3><span class="m">every held blessing, multipliers applied (game's BlessingBonus)</span></div>
    <p class="facts"><span><b>Superblesser</b> {{ st.blessingTotals.superblesser.picks }} picks × {{ st.blessingTotals.superblesser.perPick }} = +{{ num(st.blessingTotals.superblesser.pct) }}%{{ st.blessingTotals.superblesser.fruit6 ? ' + fruit 6 ' + num(st.blessingTotals.superblesser.fruit6) + '%' : '' }} → ×{{ num(st.blessingTotals.superblesser.mult) }} on every boosted blessing</span>
      <span><b>Bless Updog</b> (trait 66) +{{ num(st.blessingTotals.updog.total) }}% → ×{{ num(st.blessingTotals.updog.mult) }} on top, from {{ st.blessingTotals.updog.carriers.length }} carriers: {{ updogCarriers }}</span></p>
    <p class="note">Both multiply a blessing's picks × base value, one after the other (BlessingBonus @6480153 / @6482028 / @6482874), and only for the gated letters (randolist[4]): {{ st.blessingTotals.gate.join(' ') }}. Not boosted: a i n o u v z. Boosted total = picks × base × Superblesser × Bless Updog.</p>
    <div class="tbl"><table class="list">
      <thead><tr><th>Type</th><th>Blessing</th><th class="num">Picks</th><th class="num">Base / pick</th><th class="num">Picks × base</th><th class="num">× Superblesser</th><th class="num">× Bless Updog</th><th class="num">Total</th><th>Effect</th></tr></thead>
      <tbody><tr v-for="b in btRows" :key="b.key"><td class="m">{{ b.cat }}</td><td>{{ b.name }}</td><td class="num">{{ b.count }}</td><td class="num">{{ b.base }}</td><td class="num">{{ num(b.raw) }}</td>
        <td class="num">{{ b.gated ? num(b.superMult) : 'not boosted' }}</td><td class="num">{{ b.gated ? num(b.updogMult) : 'not boosted' }}</td><td class="num">{{ b.instant ? '' : num(b.total) }}</td><td class="m">{{ b.text }}</td></tr></tbody>
    </table></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Stacks across blessings</th><th class="num">Combined</th><th>How the game combines them</th></tr></thead>
      <tbody><tr v-for="g in st.blessingTotals.groups" :key="g.label"><td>{{ g.label }}</td><td class="num">×{{ num(g.combined) }}</td><td class="m">{{ g.how }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else-if="sec === 'energy'">
    <div class="sec-head"><h3>Energy</h3><span class="m">Orb Tower</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Energy</th><th class="num">Value</th><th>Source</th><th class="num">Stored</th><th></th></tr></thead>
      <tbody><tr v-for="x in st.energy" :key="x.name"><td>{{ x.name }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}<template v-if="x.note"> · {{ x.note }}</template></td>
        <td class="num">{{ x.stored == null ? '' : num(x.stored) }}</td><td :class="mark(x) === '✓' ? 'st-good' : 'st-bad'">{{ mark(x) }}{{ x.check && x.stored != null ? ' ' + x.check : '' }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else-if="sec === 'bonuses'">
    <div class="sec-head"><h3>Realm-wide bonuses</h3></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Group</th><th>Bonus</th><th class="num">Level</th><th class="num">Value</th><th>Effect</th><th>Source</th><th class="num">Stored</th><th></th></tr></thead>
      <tbody v-for="g in bonusGroups" :key="g"><tr v-for="x in st.bonuses.filter((b) => b.group === g)" :key="g + x.name" :class="{ future: x.level === 0 && x.group !== 'Field' }">
        <td class="m">{{ g }}</td><td>{{ x.name }}</td><td class="num">{{ x.level ?? '' }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.note ?? '' }}</td><td class="m">{{ x.src }}</td>
        <td class="num">{{ x.stored == null ? '' : num(x.stored) }}</td><td :class="mark(x) === '✓' ? 'st-good' : 'st-bad'">{{ mark(x) }}{{ x.check && x.stored != null ? ' ' + x.check : '' }}</td></tr></tbody>
    </table></div>
    </template>
    <template v-else>
    <div class="sec-head"><h3>Not shown in game</h3></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Number</th><th class="num">Value</th><th>Source</th></tr></thead>
      <tbody><tr v-for="x in st.other" :key="x.name"><td>{{ x.name }}</td><td class="num">{{ num(x.value) }}</td><td class="m">{{ x.src }}</td></tr>
        <tr v-for="m in dmg.minions.filter((m) => m.orbCharge)" :key="'oc' + m.slot"><td>{{ m.name }} ({{ barnPos(m.slot) }}): energy per hour</td><td class="num">{{ num(m.orbCharge) }}</td><td class="m">MinionORBCHARGE @6408129</td></tr></tbody>
    </table></div>
    </template>
    </template>
    <p v-else class="note">Needs data/realm-combat.json with the stats model (dev only: click Recalc above, or bun src/realm-combat.ts --force).</p>
    </template>

    <details class="how"><summary>Sources</summary>
    <p>Your Realm against the wiki's progression guide (Realm › Strategies). † = read from the save by the game's own code (docs/realm.md); targets and advice are the wiki's.</p>
    </details>
  </section>
  <p v-else class="muted">Load a save with Realm progress to see where you are in the Realm.</p>
</template>

<style scoped>
tr.buyable td { background: color-mix(in srgb, var(--good, #3fb950) 14%, transparent); }
tr.buyable-avoid td { background: color-mix(in srgb, var(--warn, #d29922) 8%, transparent); }
.badge { display: inline-block; padding: 1px 7px; border-radius: 9px; font-weight: 600; font-size: 12px; }
.badge.good { background: var(--good, #3fb950); color: #0d1117; }
.badge.warn { border: 1px solid var(--warn, #d29922); color: var(--warn, #d29922); }
.rcbar { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin: 0 0 .5rem; font-size: .85em; }
.rcstale { color: var(--warn, #d9a441); }
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
.muted, .m { color: var(--muted); }
h3 { font-size: 16px; margin: 18px 0 6px; } h4 { font-size: 14px; }
.sec-head h3 { margin: 0; }
.subtabs.sub { margin-top: 0; } .subtabs.sub button { font-size: 13px; }
.tbl { max-width: 900px; } .tbl.wide { max-width: none; }
tr.gate td { font-weight: bold; }
tr.future td { color: var(--muted); }
.steps li { margin-bottom: 4px; }
i.sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; border: 1px solid var(--border); }
.red { background: #d9534f; } .orange { background: #f0883e; } .yellow { background: #f2d43d; } .blue { background: #4a8fe0; }
.purple { background: #9b59d0; } .pink { background: #f08ad0; } .white { background: #fff; } .rainbow { background: linear-gradient(90deg, red, orange, yellow, green, blue, violet); }
.tier { display: inline-block; margin-right: 14px; white-space: nowrap; }
table.guide td { font-size: 12px; }
tr.locked td { opacity: 0.6; }
tr.dim td { opacity: .7; }
.game-says { margin-top: .25em; color: var(--warn, #e6b450); }
tr.coin td:nth-child(2) { font-weight: bold; color: var(--good, #38d39f); }
select { font: inherit; font-size: 12px; margin: 0 8px 0 4px; }
.sortable { cursor: pointer; user-select: none; }
</style>
