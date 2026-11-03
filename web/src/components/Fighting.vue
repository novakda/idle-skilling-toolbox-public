<script setup lang="ts">
import { computed } from 'vue'
import { attacksPerSec, bestZones, damageParts, dpsSpeed, estimate, fightingDeck, fightStats, killReq, monsterName, strafe, zoneProgress } from '../fighting'
import { fmtTime } from '../realm'
const time = (sec: number) => (sec < 10 ? `${+sec.toFixed(3)}s` : fmtTime(sec))
import { inBookOrder, tabOf, tabTitle } from '../card-art'
import Icon from './Icon.vue'

const props = defineProps<{ save: Record<string, unknown> | null }>()
const sci = (v: number) => (!Number.isFinite(v) ? '∞' : Math.abs(v) >= 1e6 ? v.toExponential(2) : (Math.round(v * 100) / 100).toLocaleString())
const safe = <T,>(f: () => T, what: string): T | null => { try { return f() } catch (e) { console.warn(`fighting ${what}:`, e); return null } }
const zones = computed(() => (props.save ? safe(() => zoneProgress(props.save!), 'zones') : null))
const s = computed(() => props.save ?? {})
const deck = computed(() => (props.save ? safe(() => fightingDeck(props.save!), 'deck') : null))
// Every zone at every monster level, with the estimate at your current fight stats.
const table = computed(() => {
  const x = f.value
  if (!x || !zones.value) return null
  return safe(() => zones.value!.map((z) => {
    const row = (L: number) => ({ L, name: monsterName(z.m, L), req: killReq(z.m, L), e: estimate(x, z.m, L) })
    const at = z.here ?? (z.visited ? z.furthest : 0)
    return { ...z, at, now: row(at), levels: Array.from({ length: z.levels }, (_, L) => row(L)) }
  }), 'table')
})
const haste = computed(() => (props.save ? strafe(props.save) : null))
const best = computed(() => (f.value && props.save ? safe(() => bestZones(props.save!, f.value!), 'best') : null))
const verdict = (e: ReturnType<typeof estimate>) => !e.canFight ? (e.hit <= 0 ? 'no: ATK too low to hit' : 'one hit kills you') : e.dpsFactor <= 1 ? 'kills in one attack' : 'yes, several attacks'
const adds = (a: Record<string, number>) => Object.entries(a).map(([k, x]) => `+${sci(x)} ${k}`).join(', ') || '—'
const fs = computed(() => (props.save ? safe(() => fightStats(props.save!), 'stats') : null))
const f = computed(() => (fs.value && !('missing' in fs.value) ? fs.value : null))
const dmg = computed(() => {
  const x = f.value, m = Number(s.value.currentfightmode ?? 1)
  return x ? safe(() => ({ ...damageParts(x), spd: dpsSpeed(x.rd, m), aps: attacksPerSec(x.rd, x, m) }), 'damage') : null
})
</script>

<template>
  <div class="page-head">
    <h2>Fighting</h2>
    <p>Your fight zones, what your damage is made of, the Fighting deck, and every zone's monsters with an estimate of how you would do there.</p>
    <div v-if="zones" class="tiles">
      <div class="tile"><b>{{ zones.find((z) => z.here != null)?.name ?? '—' }}</b><span>zone now, level {{ s.mapleLV }}</span></div>
      <div class="tile"><b>{{ zones.filter((z) => z.unlocked).length }}/{{ zones.length }}</b><span>zones unlocked</span></div>
      <div class="tile"><b>{{ sci(Number(s.totalKills ?? 0)) }}</b><span>total kills</span></div>
      <div v-if="f" class="tile"><b>{{ sci(f.DPS) }}</b><span>DPS (Fighting deck)</span></div>
    </div>
    <p v-if="haste && !haste.unlocked" class="note"><b>Strafe is locked</b> (HasteUnlocked 0{{ haste.usedBefore ? ', though you have used it before' : '' }}). Get the key again from Mini Lava on the Portal screen: click him, wait for his line to finish (about 6 s), click again. Each click has a 4-in-537 chance (about 1 in 134) of "take this key"; the red "click on me one more time" line is a different roll and doesn't predict the key. The flag is kept only in the local save, so Ascend and Rebirth don't clear it, but losing or replacing the local save does.</p>
  </div>
  <section v-if="zones">
    <div class="sec-head"><h3>Zone progress</h3><span class="m">FurthestMapleLV, MapleMonster kills, fightsunlocked {{ s.fightsunlocked }}, hell key {{ Number(s.HellKeyGot ?? 0) > 0 ? 'yes' : 'no' }}</span></div>
    <div class="tbl"><table class="list">
      <thead><tr><th>Zone</th><th>Status</th><th class="num">Furthest level</th><th class="num">Kills there / needed</th><th class="num">Kills in zone</th><th>Next zone</th></tr></thead>
      <tbody><tr v-for="z in zones" :key="z.m" :class="{ muted: !z.unlocked }">
        <td><b>{{ z.name }}</b> <small class="muted">mode {{ z.m }}</small></td>
        <td>{{ !z.unlocked ? 'locked' : z.here != null ? `here (level ${z.here})` : z.visited ? 'visited' : 'not visited yet' }}</td>
        <td class="num">{{ z.visited ? z.furthest : '—' }}</td>
        <td class="num">{{ z.visited ? `${sci(z.atFurthest)} / ${sci(z.reqAtFurthest)}` : '—' }}</td>
        <td class="num">{{ sci(z.kills) }}</td>
        <td><template v-if="z.key == null">last zone</template>
          <template v-else>level {{ z.key }}, {{ sci(z.keyReq!) }} kills<span v-if="z.nextUnlocked" class="muted"> (next zone unlocked)</span><span v-else-if="z.unlocked" class="muted"> ({{ sci(z.keyKills!) }} so far)</span></template></td>
      </tr></tbody>
    </table></div>
    <p class="note">Kills are the game's per-level kill counters (MapleMonster; kill bonuses count more than one per monster). The next zone unlocks when a kill at the listed level finds that level's kill count met (kill handler, Qno2x.js @31788463 / @31819831). HaveyouBeenBeforeZone is per screen, not per fight zone, so "visited" here means a furthest level or kills in that zone. FarthestMapleLV (old single value) = {{ s.FarthestMapleLV }}.</p>

    <div class="sec-head"><h3>Damage</h3><span class="m">as the fight scene computes it, on the deck and tinker deck linked to Fighting</span></div>
    <p v-if="fs && 'missing' in fs" class="note">Damage needs {{ fs.missing }}, which this save doesn't have (cloud saves lack load-time values): load the local save.</p>
    <template v-else-if="f && dmg">
      <p class="facts">
        <span><b>DPS (one plain hit)</b> {{ sci(f.DPS) }}</span>
        <span><b>Attack speed</b> {{ dmg.aps.toFixed(2) }} attacks/s (dpsspeed {{ dmg.spd.toFixed(3) }}, cap 40)</span>
        <span><b>Crit chance</b> {{ +f.CriticalChance.toFixed(2) }}%<template v-if="f.CriticalChance >= 100"> (every hit crits)</template></span>
        <span><b>Crit damage</b> ×{{ sci(f.CriticalDamage) }}</span>
        <span><b>Hit chance here</b> {{ f.hitNow ?? '—' }}%</span>
        <span><b>Low roll (Mastery)</b> {{ f.Mastery }} × DPS<template v-if="f.DPS >= 1e7"> (unused: DPS ≥ 10M hits for full)</template></span>
        <span><b>Idle damage</b> +{{ sci(f.IdleDmgBonusPercent) }}% <small class="muted">(stored)</small></span>
        <span><b>Max HP</b> {{ sci(f.HPmax) }}, shields +{{ sci(f.ShieldPercentMAX) }}% <small class="muted">(stored)</small>, damage taken −{{ +(f.DR * 100).toFixed(1) }}%</span>
      </p>
      <div class="tbl"><table class="list">
        <thead><tr><th>Part of DPS</th><th class="num">Value</th><th>Source</th></tr></thead>
        <tbody>
          <tr><td>STR {{ dmg.str }} ×25 + ATK {{ dmg.atk }} ×8 + END {{ dmg.end }} ×2</td><td class="num">{{ sci(dmg.stats) }}</td><td class="muted">GetPlayerDPS</td></tr>
          <tr><td>+ SmithingBaseAttack (smithing items, Fighting-deck cards, potions)</td><td class="num">{{ sci(f.SmithingBaseAttack) }}</td><td class="muted">@31669863</td></tr>
          <tr><td class="sub">of which flat: cards {{ sci(dmg.flat.cards) }}, equipment {{ sci(dmg.flat.equipment) }}, potions {{ sci(dmg.flat.potions) }}; then × card base damage +{{ sci(dmg.cardBasePct) }}%</td><td></td><td></td></tr>
          <tr v-for="[label, v, src] in dmg.factors" :key="label"><td>× {{ label }}</td><td class="num">×{{ sci(v) }}</td><td class="muted">{{ src }}</td></tr>
        </tbody>
      </table></div>
      <p class="note">Also in the total, not listed: <span title="rift 3">Power rift</span>, merits, contracts, civilisation, <span title="ascension 40/44/49/62">Forgotten Tongue, H20 Kapow Kazam, Unspoken Words, Derelict Warcry</span>, event upgrades and Realm terms, and the ice-cream exponent (combat.ts getPlayerDPS). Attack speed, idle damage and shields are the values the fight scene last stored (smithingAttackSpeedBoost @31672712, IdleDmgBonusPercent @31675401, ShieldPercentMAX @31673752; not ported). The game stores DPS {{ sci(Number(s.DPS ?? 0)) }} from its last fight frame, which can differ from the line above when stats or decks changed since.</p>
    </template>

    <div class="sec-head"><h3>Fighting deck</h3><span class="m">{{ deck ? `deck ${deck.deck}, equipped by the fight scene (DeckLinkList = 9)` : '' }}</span></div>
    <p v-if="!deck" class="note">No deck is linked to Fighting (or this save has no deck links: cloud saves don't carry them; set them on the Cards tab). The fight then keeps whatever deck you entered with.</p>
    <div v-else class="tbl"><table class="list">
      <thead><tr><th>Card</th><th class="num">Level</th><th>Adds while fighting</th><th>Where (tab · row col)</th></tr></thead>
      <tbody><tr v-for="c in inBookOrder(deck.cards)" :key="c.id">
        <td><Icon kind="card" :id="c.id" :name="c.name" /></td><td class="num">{{ c.level }}</td><td>{{ adds(c.adds) }}</td>
        <td :title="tabTitle(c)">{{ tabOf(c) }}<small v-if="tabTitle(c)" class="muted"> ({{ tabTitle(c) }})</small></td>
      </tr>
      <tr v-if="!deck.cards.length"><td colspan="4" class="muted">The deck is empty.</td></tr></tbody>
    </table></div>
    <p v-if="deck" class="note">Deck totals: {{ adds(deck.totals) }}. Passive cards count on top of these whatever deck is on (cards-calc.ts).</p>

    <div class="sec-head"><h3>All zones and monsters</h3><span class="m">ESTIMATES at your current fight stats; open a zone for every level</span></div>
    <template v-if="table">
      <div class="tbl wide"><table class="list">
        <thead><tr><th>Zone · level</th><th>Monster</th><th class="num">HP</th><th class="num">Hits for</th><th class="num">Gold / kill</th><th class="num">Kills to advance</th><th>Can you beat it now? <small>(est.)</small></th><th class="num">Time / kill <small>(est.)</small></th><th class="num">DPS ×needed for 1 attack</th></tr></thead>
        <tbody><tr v-for="z in table" :key="z.m" :class="{ muted: !z.unlocked }">
          <td><b>{{ z.name }}</b> · {{ z.at }}<small class="muted">{{ z.here != null ? ' (now)' : z.visited ? ' (furthest)' : ' (start)' }}{{ z.unlocked ? '' : ', locked' }}</small></td>
          <td>{{ z.now.name }}</td><td class="num">{{ sci(z.now.e.HP) }}</td><td class="num">{{ sci(z.now.e.MD) }}</td><td class="num">{{ sci(z.now.e.gold) }}</td><td class="num">{{ sci(z.now.req) }}</td>
          <td :class="{ 'st-bad': !z.now.e.canFight }">{{ verdict(z.now.e) }}</td>
          <td class="num">{{ z.now.e.canFight ? time(z.now.e.secPerKill) : '—' }}</td>
          <td class="num">{{ z.now.e.hit <= 0 ? `ATK above ${Math.floor(z.now.e.req - 20)} first` : z.now.e.dpsFactor <= 1 ? 'enough' : '×' + sci(z.now.e.dpsFactor) }}</td>
        </tr></tbody>
      </table></div>
      <details v-for="z in table" :key="'d' + z.m">
        <summary><b>{{ z.name }}</b>: {{ z.levels.length }} monster levels{{ z.unlocked ? '' : ' (locked)' }}</summary>
        <div class="tbl wide"><table class="list">
          <thead><tr><th class="num">Lv</th><th>Monster</th><th class="num">HP</th><th class="num">Hits for</th><th class="num">ATK needed (100% hit)</th><th class="num">Gold / kill</th><th class="num">Kills to advance</th><th>Beat now? (est.)</th><th class="num">Time / kill (est.)</th><th class="num">Gold / min (est.)</th></tr></thead>
          <tbody><tr v-for="r in z.levels" :key="r.L">
            <td class="num">{{ r.L }}</td><td>{{ r.name }}</td><td class="num">{{ sci(r.e.HP) }}</td><td class="num">{{ sci(r.e.MD) }}</td><td class="num">{{ sci(r.e.req) }}</td>
            <td class="num">{{ sci(r.e.gold) }}</td><td class="num">{{ sci(r.req) }}</td><td :class="{ 'st-bad': !r.e.canFight }">{{ verdict(r.e) }}</td>
            <td class="num">{{ r.e.canFight ? time(r.e.secPerKill) : '—' }}</td><td class="num">{{ sci(r.e.goldPerMin) }}</td>
          </tr></tbody>
        </table></div>
      </details>
      <p class="note"><b>How these are worked out.</b> HP (mapleexpREQ @31775542 / @31804850, @31806955), gold per kill (defaultgold @31777695 / @31807360, @31809880), monster damage and the attack level it needs (combat.ts, @31780775 / @31811927), kills to advance (right arrow, ActorEvents_253 @7628828) and the monster name (the card that zone and level drop, ActorEvents_875 @15665419) are the game's formulas for any zone and level.
        The <b>estimates</b> run the game's own AFK formula (FightingCashPerMin @21682751, offline kills @31705994), which the game only applies to the zone you are in, with your current fight stats: monsters per minute = 60 × attacks/s × min(hit chance × average hit × (1 + 0.015·<span title="smithing item 32">Facestompers</span>)(1 + 0.1·<span title="ascension 6">Idle Torment</span>)(1 + idle damage) × (1 + crit chance × (crit damage − 1)) ÷ HP, 1) × (1 − damage taken ÷ (max HP × shields))^1.8, and zero when one monster hit takes all your HP.
        Time per kill = 1 ÷ (attacks/s × that min(...)), attack time only. "DPS ×needed" = HP ÷ average hit: how much more damage one-attack kills would take. Levels above the ones listed show the zone's glitch monster; levels stop at 99 (Oblivion 269). Oblivion has no stored value to check these against.</p>
    </template>

    <div class="sec-head"><h3>Best zone to fight</h3><span class="m">ESTIMATES: unlocked zones, each at its best level from 0 to your furthest</span></div>
    <div v-if="best" class="ranks">
      <div v-for="[title, list, unit] in ([['Gold / min', best.gold, 'gold'], ['Kills / min (kill credit)', best.kills, 'kills'], ['Card drops / min', best.cards, 'cards']] as const)" :key="title">
        <h4>{{ title }}</h4>
        <ol><li v-for="r in list" :key="r.m"><b>{{ r.name }}</b> lv {{ r.L }} <small class="muted">({{ r.name2 }})</small>: {{ sci(r.perMin) }} {{ unit }}</li></ol>
      </div>
    </div>
    <p class="note">Same estimate as the table above. Kills count the kill handler's per-kill credit (@31785544), which is what levels and keys need. Card drops are the per-kill chance (@31781330 / @31812491) × kills; drops of a card you can't use any more stop at CardDropsPerDayMAX ({{ s.CardDropsPerDayMAX }}) per zone per day (ActorEvents_875 @15672497), which this doesn't model. <b>No EXP ranking:</b> a fight kill gives no EXP in the game code (the kill handlers write gold, kill counts, unlocks and drops only). Rare drops (RareDropChancee {{ s.RareDropChancee }}%), event drops and Sparkle-coin rolls in the same handlers are not ranked: their rewards are set elsewhere and not ported.</p>
  </section>
  <p v-else class="muted">Load a save to see Fighting.</p>
</template>

<style scoped>
.note { color: var(--muted); font-size: 13px; margin: 0 0 10px; max-width: 900px; }
.muted { color: var(--muted); }
h3 { font-size: 16px; }
.tbl { max-width: 1000px; }
.tbl.wide { max-width: none; overflow-x: auto; }
summary { cursor: pointer; margin-bottom: 8px; }
.sub { padding-left: 2em; color: var(--muted); font-size: 13px; }
.ranks { display: flex; flex-wrap: wrap; gap: 8px 32px; }
.ranks h4 { margin: 4px 0; font-size: 14px; }
.ranks ol { margin: 0 0 8px; padding-left: 1.4em; }
</style>
