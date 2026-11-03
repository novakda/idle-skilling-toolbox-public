<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { setParam } from './section'
import { cloudWins, LOCAL_ONLY, localOnlyBackup, parseSave, readLevelDb } from './save-load'
import { backupGuide, type GuideLine } from './backup-guide'
import { DECK_LINKS_KEY } from './cards-calc'
import { forgetIcons, frameOf, iconSource, iconUrl, loadIcons, NAV_ICONS } from './game-icons'
import Cards from './components/Cards.vue'
import Potions from './components/Potions.vue'
import Afk from './components/Afk.vue'
import Botany from './components/Botany.vue'
import Tilling from './components/Tilling.vue'
import Rift from './components/Rift.vue'
import Summoning from './components/Summoning.vue'
import Spiriting from './components/Spiriting.vue'
import Construction from './components/Construction.vue'
import Spelunking from './components/Spelunking.vue'
import Training from './components/Training.vue'
import Fishing from './components/Fishing.vue'
import Gathering from './components/Gathering.vue'
import Raids from './components/Raids.vue'
import Asylum from './components/Asylum.vue'
import Crypt from './components/Crypt.vue'
import Codex from './components/Codex.vue'
import Mastery from './components/Mastery.vue'
import Crusade from './components/Crusade.vue'
import Tinkering from './components/Tinkering.vue'
import Gems from './components/Gems.vue'
import Candy from './components/Candy.vue'
import Arcade from './components/Arcade.vue'
import Perks from './components/Perks.vue'
import SkillTrees from './components/SkillTrees.vue'
import Ascend from './components/Ascend.vue'
import Fighting from './components/Fighting.vue'
import Bestiary from './components/Bestiary.vue'
import Realm from './components/Realm.vue'
import Contracts from './components/Contracts.vue'
import Pets from './components/Pets.vue'
import About from './components/About.vue'
import DoNext from './components/DoNext.vue'
import Totals from './components/Totals.vue'

type Save = Record<string, unknown>
const save = ref<Save | null>(null)
const error = ref('')
const loadedInfo = ref('')
type View = 'donext' | 'afk' | 'shrines' | 'cards' | 'bonus' | 'builds' | 'potions' | 'botany' | 'tilling' | 'rift' | 'summoning' | 'spiriting' | 'construction' | 'spelunk' | 'training' | 'fishing' | 'gathering' | 'mining' | 'smithing' | 'fighting' | 'bestiary' | 'raids' | 'asylum' | 'crypt' | 'giftshop' | 'heavycash' | 'crusade' | 'tinker' | 'gems' | 'candy' | 'arcade' | 'ascend' | 'perks' | 'skilltrees' | 'realm' | 'contracts' | 'codex' | 'pets' | 'mastery' | 'totals' | 'about'
const view = ref<View>('cards')
// Sidebar groups follow the game's own top menu, in its order (docs/ux-direction.md "Game menu → sidebar"): page 1
// TRAIN FIGHT PERKS CRAFT PORTAL TUNNELS, page 2 LIMBO CRUSADE CARDS FARMING PETS REALM. Toolbox-only pages sit first and
// last. #2586: the Portal's progression screens (Ascend, AP/BP perks, Mastery) and the PERKS button's Skill trees form one
// Progression group after Portal; a Gems group (gem shop, candy, arcade: the gem economy, opened from the HUD on every screen) follows Overview. The filter
// matches a page or its group name.
const GROUPS: { name: string; pages: [View, string][] }[] = [
  { name: 'Overview', pages: [['donext', 'Do next'], ['afk', 'AFK']] },
  { name: 'Gems', pages: [['gems', 'Gem shop'], ['candy', 'Candy'], ['arcade', 'Arcade']] }, // the HUD gem button's shop, time candy, and the arcade
  { name: 'Train', pages: [['training', 'Training']] },
  { name: 'Fight', pages: [['fighting', 'Fighting'], ['crypt', 'Crypt'], ['bestiary', 'Bestiary']] },
  { name: 'Craft', pages: [['mining', 'Mining'], ['smithing', 'Smithing'], ['fishing', 'Fishing']] }, // the game's CRAFT button
  { name: 'Portal', pages: [['raids', 'Raids'], ['asylum', 'Asylum']] },
  { name: 'Progression', pages: [['ascend', 'Ascend'], ['perks', 'AP/BP perks'], ['mastery', 'Mastery'], ['skilltrees', 'Skill trees']] },
  { name: 'Tunnels', pages: [['spelunk', 'Spelunking'], ['construction', 'Construction']] },
  { name: 'Limbo', pages: [['spiriting', 'Spiriting'], ['summoning', 'Summoning'], ['contracts', 'Contracts'], ['rift', 'Rift']] },
  { name: 'Crusade', pages: [['crusade', 'Crusade'], ['tinker', 'Tinkering']] },
  { name: 'Cards', pages: [['cards', 'Cards']] },
  { name: 'Farming', pages: [['tilling', 'Tilling'], ['potions', 'Potions'], ['botany', 'Botany']] },
  { name: 'Pets', pages: [['pets', 'Pets'], ['codex', 'Codex']] },
  { name: 'Realm', pages: [['realm', 'Realm']] },
  { name: 'Toolbox', pages: [['totals', 'Totals'], ['about', 'About']] },
]
// ?tab=<page id> opens that page (e.g. a bookmark or a test tab); unknown ids are ignored.
const tab = new URLSearchParams(location.search).get('tab')
// Former pages that are now a tab of another page (Shrines under Asylum; Gift shop under Raids; Heavy Cash as a dialog on Asylum shrines; By bonus and Builds under Cards) or were split
// (Gathering into Mining and Smithing): old links land there.
const MOVED: Partial<Record<View, View>> = { shrines: 'asylum', giftshop: 'raids', heavycash: 'asylum', bonus: 'cards', builds: 'cards', gathering: 'mining' }
const moved = MOVED[tab as View]
if (moved) { view.value = moved; setParam('tab', moved); setParam('section', tab) }
else if (GROUPS.some((g) => g.pages.some(([id]) => id === tab))) view.value = tab as View
// Changing page writes ?tab= and drops the old page's ?section= (watch runs before the new page renders and reads it).
let nextSection: string | null = null // a link that targets a tab on another page (go('shrines'))
watch(view, (id) => { setParam('section', nextSection); nextSection = null; setParam('tab', id) })
const navIcon = (id: View) => { const e = NAV_ICONS[id], f = e && frameOf(e[0], String(e[1]), e[1]); return f ? iconUrl(f) : null }
const filter = ref('')
// Game areas that span several pages (#47: Limbo is a hub, not a page), so the filter finds them by the area's name.
const AREAS: Partial<Record<View, string>> = { mining: 'craft', smithing: 'craft anvil', fishing: 'craft', spiriting: 'limbo', rift: 'limbo rune summon', summoning: 'limbo rune summon', contracts: 'limbo',
  ascend: 'portal', perks: 'portal', mastery: 'portal', skilltrees: 'perks', pets: 'hatchery trek trekking research lab', codex: 'capsule',
  bestiary: 'bestiary monster enemy', crypt: 'vault' }
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return GROUPS.map((g) => ({ ...g, pages: g.name.toLowerCase().includes(q) ? g.pages : g.pages.filter(([id, l]) => `${l} ${AREAS[id] ?? ''}`.toLowerCase().includes(q)) })).filter((g) => g.pages.length)
})
const current = computed(() => GROUPS.flatMap((g) => g.pages).find(([id]) => id === view.value)?.[1])
const navOpen = ref(false) // narrow screens: the sidebar is behind the menu button
function go(id: View) {
  const to = MOVED[id]
  if (to) { nextSection = id; id = to }
  view.value = id; navOpen.value = false
}

// Dev only: the dev server serves the live/extracted save. A distributed build works only from a loaded file.
// "Reload save" asks for fresh=1: the server re-reads the game now instead of serving a save younger than FRESH_MS.
const reloading = ref(false), isDev = import.meta.env.DEV, saveGen = ref(0)
function loadDevSave(fresh = false, stale = false) {
  reloading.value = true
  let failedAt: string | null = null
  return fetch(`/data/save.json${fresh ? `?fresh=1&t=${Date.now()}` : stale ? '?stale=1' : ''}`)
    .then((r) => { failedAt = r.headers.get('X-Save-Live-Failed'); return r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} — run "bun run extract" first`)) })
    .then((s: Save) => { save.value = s; error.value = ''; if (fresh) saveGen.value++; loadedInfo.value = stale ? 'last save on disk; reading the game…' : failedAt ? `live read failed; showing save from ${new Date(+failedAt).toLocaleTimeString()}` : `read from the game ${new Date().toLocaleTimeString()}` })
    .catch((e: Error) => (error.value = e.message))
    .finally(() => (reloading.value = false))
}
// First paint from the last save on disk, then the live read replaces it (no blank page while the game is read).
if (import.meta.env.DEV) loadDevSave(false, true).finally(() => loadDevSave())

// Local save (LevelDB .log/.ldb files, all ~1408 keys) is preferred. A cloud is.bin (~513 keys) loaded on top of a local
// save is applied as an overlay, the way the game applies a cloud restore; a local save always replaces a cloud-only one.
const loadedFormat = ref<string>('')
// Local-only backup (#21): the progress a cloud restore loses, as a JSON download. Needs a local save (cloud lacks them).
function downloadBackup() {
  if (!save.value) return
  const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), keys: localOnlyBackup(save.value) }, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `idle-skilling-local-only-${new Date().toLocaleDateString('sv')}.json`; a.click()
  URL.revokeObjectURL(a.href)
}
// Restore side: read a backup back as steps to redo in game; deck links also fill the Cards-tab pickers.
const guide = ref<GuideLine[] | null>(null)
async function loadBackup(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  const keys = JSON.parse(await f.text()).keys ?? {}
  guide.value = backupGuide(keys)
  const links = Object.fromEntries(((keys.DeckLinkList as number[]) ?? []).flatMap((l, d) => (d && l ? [[d, l]] : [])))
  try { localStorage.setItem(DECK_LINKS_KEY, JSON.stringify(links)) } catch { /* not persisted */ }
}
async function loadFile(ev: Event) {
  const files = [...((ev.target as HTMLInputElement).files ?? [])]
  if (!files.length) return
  const names = files.map((f) => f.name).join(', ')
  try {
    const db = files.filter((f) => /\.(log|ldb)$/.test(f.name))
    if (db.length) {
      const text = readLevelDb(await Promise.all(db.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))
      if (!text) throw new Error('no save in these files; select every .log and .ldb file in the leveldb folder')
      const r = parseSave(text)
      save.value = r.save; loadedFormat.value = 'local'
      loadedInfo.value = `local save (${names}): ${r.present} of ${r.total} save fields`
    } else {
      const r = parseSave(await files[0]!.text())
      if (r.format === 'steam-cloud' && loadedFormat.value.startsWith('local') && save.value) {
        // Same rule as the game's cloud loader: apply the cloud only if it is newer and not behind on progress.
        if (cloudWins(save.value, r.save)) {
          save.value = { ...save.value, ...r.save }; loadedFormat.value = 'local+cloud'
          loadedInfo.value = `local save + ${names} overlaid (${Object.keys(r.save).length} cloud fields, newer than local)`
        } else loadedInfo.value = `kept the local save: ${names} is older or behind (the game would ignore it too)`
      } else {
        save.value = r.save; loadedFormat.value = r.format
        loadedInfo.value = `${names}: ${r.format}, ${r.present} of ${r.total} save fields${r.format === 'steam-cloud' ? ' (cloud saves are partial; load the local save for everything)' : ''}`
      }
    }
    error.value = ''
  } catch (e) { error.value = `Could not read ${names}: ${String(e).slice(0, 140)}` }
}

// Game icons from the player's own install (#36): read in the browser, kept in IndexedDB, never uploaded.
const iconError = ref('')
async function pickIcons(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0]
  if (!f) return
  iconError.value = ''
  try { await loadIcons(f) } catch (e) { iconError.value = `Could not read ${f.name}: ${String(e).slice(0, 140)}` }
}
</script>

<template>
  <div class="app">
    <div class="topbar">
      <button class="menu" :aria-expanded="navOpen" aria-controls="side" @click="navOpen = !navOpen">☰ Menu</button>
      <b>{{ current }}</b>
    </div>
    <aside id="side" class="side" :class="{ open: navOpen }">
      <div class="brand">Idle Skilling Toolbox</div>
      <input v-model="filter" type="search" placeholder="Filter pages" aria-label="Filter pages" @keydown.enter="shown[0]?.pages[0] && go(shown[0].pages[0][0])" />
      <nav>
        <template v-for="g in shown" :key="g.name">
          <h3 v-if="g.name">{{ g.name }}</h3>
          <button v-for="[id, label] in g.pages" :key="id" :aria-current="view === id ? 'page' : undefined" @click="go(id)"><span v-if="iconSource" class="ni"><img v-if="navIcon(id)" :src="navIcon(id)!" alt="" /></span>{{ label }}</button>
        </template>
        <p v-if="!shown.length" class="muted">No page matches.</p>
      </nav>
      <footer>
        <div v-if="save" class="ok">Save loaded · {{ Object.keys(save).length }} keys</div>
        <div v-else-if="error" class="err">{{ error }}</div>
        <div v-else class="muted">No save loaded</div>
        <button v-if="isDev" class="file" :disabled="reloading" title="Re-read the save from the running game (or the save files on disk) and refresh every page." @click="loadDevSave(true)">{{ reloading ? 'Reloading…' : 'Reload save' }}</button>
        <label class="file" title="Best: select all .log and .ldb files in %APPDATA%\idle-skilling\Local Storage\leveldb (complete save). Fallback: Steam Cloud is.bin in Steam/userdata/&lt;id&gt;/1048370/remote (partial).">Load save <input type="file" multiple accept=".log,.ldb,.bin,.json,.txt" @change="loadFile" /></label>
        <div v-if="loadedInfo" class="muted">{{ loadedInfo }}</div>
        <label class="file" title="Optional. Icons are cut from your own copy of the game, in this browser; nothing is uploaded. Pick Steam/steamapps/common/Idle Skilling/resources/app.asar (Steam: right-click the game, Manage, Browse local files).">Load game icons <input type="file" accept=".asar" @change="pickIcons" /></label>
        <div v-if="iconError" class="err">{{ iconError }}</div>
        <div v-else-if="iconSource" class="muted">Icons: {{ iconSource }}</div>
        <div v-else class="muted">No icons (names only)</div>
        <button v-if="iconSource && !iconSource.endsWith('(dev)')" class="link" @click="forgetIcons">Forget icons</button>
      </footer>
    </aside>
    <main>
      <p v-if="!save && !error" class="muted hint">Load your save to begin (sidebar, "Load save"): select all files in %APPDATA%\idle-skilling\Local Storage\leveldb (complete), or the Steam Cloud is.bin (partial).</p>
      <div :key="saveGen" style="display: contents"><!-- a fresh reload remounts the page so its derived files (realm-combat, perk-impacts, …) are fetched again -->
      <section v-if="view === 'donext'" class="page"><DoNext :save="save" @go="go($event as View)" /></section>
      <section v-else-if="view === 'afk'" class="page"><Afk :save="save" /></section>
      <section v-else-if="view === 'cards'" class="page"><Cards :save="save" /></section>
      <section v-else-if="view === 'potions'" class="page"><Potions :save="save" /></section>
      <section v-else-if="view === 'botany'" class="page"><Botany :save="save" /></section>
      <section v-else-if="view === 'tilling'" class="page"><Tilling :save="save" /></section>
      <section v-else-if="view === 'rift'" class="page"><Rift :save="save" /></section>
      <section v-else-if="view === 'spiriting'" class="page"><Spiriting :save="save" @go="go($event as View)" /></section>
      <section v-else-if="view === 'summoning'" class="page"><Summoning :save="save" @go="go($event as View)" /></section>
      <section v-else-if="view === 'construction'" class="page"><Construction :save="save" @go="go($event as View)" /></section>
      <section v-else-if="view === 'spelunk'" class="page"><Spelunking :save="save" /></section>
      <section v-else-if="view === 'training'" class="page"><Training :save="save" /></section>
      <section v-else-if="view === 'fishing'" class="page"><Fishing :save="save" /></section>
      <section v-else-if="view === 'mining'" class="page"><Gathering :save="save" skill="mining" /></section>
      <section v-else-if="view === 'smithing'" class="page"><Gathering :save="save" skill="smithing" /></section>
      <section v-else-if="view === 'raids'" class="page"><Raids :save="save" /></section>
      <section v-else-if="view === 'asylum'" class="page"><Asylum :save="save" /></section>
      <section v-else-if="view === 'crypt'" class="page"><Crypt :save="save" /></section>
      <section v-else-if="view === 'codex'" class="page"><Codex :save="save" /></section>
      <section v-else-if="view === 'mastery'" class="page"><Mastery :save="save" /></section>
      <section v-else-if="view === 'crusade'" class="page"><Crusade :save="save" /></section>
      <section v-else-if="view === 'tinker'" class="page"><Tinkering :save="save" /></section>
      <section v-else-if="view === 'gems'" class="page"><Gems :save="save" /></section>
      <section v-else-if="view === 'candy'" class="page"><Candy :save="save" /></section>
      <section v-else-if="view === 'arcade'" class="page"><Arcade :save="save" /></section>
      <section v-else-if="view === 'ascend'" class="page"><Ascend :save="save" /></section>
      <section v-else-if="view === 'fighting'" class="page"><Fighting :save="save" /></section>
      <section v-else-if="view === 'bestiary'" class="page"><Bestiary :save="save" /></section>
      <section v-else-if="view === 'perks'" class="page"><Perks :save="save" /></section>
      <section v-else-if="view === 'skilltrees'" class="page"><SkillTrees :save="save" /></section>
      <section v-else-if="view === 'realm'" class="page"><Realm :save="save" /></section>
      <section v-else-if="view === 'contracts'" class="page"><Contracts :save="save" /></section>
      <section v-else-if="view === 'pets'" class="page"><Pets :save="save" /></section>
      <section v-else-if="view === 'totals'" class="page"><Totals :save="save" /></section>
      <section v-else class="page">
        <About />
        <h3 class="sub">Local-only backup</h3>
          <p v-if="save" class="muted">A Steam Cloud restore on a new machine loses {{ LOCAL_ONLY.length }} local-only values (card links, trek position, AFK toggles, raid unlocks…).
            <button :disabled="!('DeckLinkList' in save)" @click="downloadBackup">Download local-only backup</button>
            <span v-if="!('DeckLinkList' in save)">(load the local save; the cloud file doesn't have them)</span></p>
          <p class="muted">New machine? <label>Load a backup <input type="file" accept=".json" @change="loadBackup" /></label></p>
          <div v-if="guide" class="tbl"><table class="list">
            <thead><tr><th>Redo in game</th><th>Was</th><th>How</th></tr></thead>
            <tbody><tr v-for="g in guide" :key="g.what"><td>{{ g.what }}</td><td>{{ g.value }}</td><td class="m">{{ g.redo === 'set' ? 'set it again' : 're-earn by playing' }}</td></tr></tbody>
          </table></div>
      </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app { display: grid; grid-template-columns: 200px minmax(0, 1fr); min-height: 100vh; }
.topbar { display: none; }
.side { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 8px; padding: 12px 10px; border-right: 1px solid var(--border); background: var(--panel); }
.brand { font-weight: 700; font-size: 15px; padding: 0 4px; }
.side input[type=search] { width: 100%; padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; font-size: 14px; }
nav { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
nav h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 10px 4px 2px; font-weight: 600; }
nav button { text-align: left; background: none; border: 0; border-radius: 4px; color: var(--text); padding: 3px 8px; cursor: pointer; font: inherit; font-size: 14px; }
nav button { display: flex; align-items: center; gap: 6px; }
.ni { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.ni img { max-width: 20px; max-height: 20px; object-fit: contain; image-rendering: pixelated; }
nav button:hover { background: var(--bg); }
nav button[aria-current=page] { color: var(--accent); background: var(--bg); font-weight: 600; box-shadow: inset 3px 0 var(--accent); }
footer { border-top: 1px solid var(--border); padding-top: 8px; font-size: 13px; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.file { color: var(--muted); }
.file input { font-size: 12px; max-width: 100%; }
.link { align-self: start; background: none; border: 0; padding: 0; color: var(--muted); text-decoration: underline; cursor: pointer; font: inherit; font-size: 12px; }
main { min-width: 0; }
.hint { margin: 12px 16px 0; }
.ok { color: var(--accent); } .muted { color: var(--muted); font-size: 13px; } .err { color: var(--bad); }
.page { padding: 12px 16px; min-width: 0; }
.sub { font-size: 16px; margin: 20px 0 6px; }
.m { color: var(--muted); font-size: 13px; }
@media (max-width: 800px) {
  .app { grid-template-columns: minmax(0, 1fr); }
  .topbar { display: flex; gap: 12px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--panel); }
  .menu { font: inherit; background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 4px 10px; cursor: pointer; }
  .side { display: none; position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 8px 16px 12px; }
  .side.open { display: flex; }
  .brand { display: none; }
}
</style>
