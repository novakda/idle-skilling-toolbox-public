// Game icons (#36), cut in the browser from the game's own sprite sheets. Where the sheets come from, first match wins:
//  1. the player's own install: they pick Idle Skilling's resources/app.asar (sidebar, "Load game icons"); only the sheets
//     the maps below use are copied out of it into IndexedDB, keyed by the game build, so they survive reloads;
//  2. a build made with VITE_SHIP_GAME_ART=1: the same sheets bundled under game-art/ (vite.config.ts copies them from
//     data/game/asar at build time; default 0 = not shipped, docs/ux-direction.md, README "Game art in the build");
//  3. dev only: the local extracted files (data/game/asar, served by the dev server);
//  4. none: names only.
// Nothing is uploaded.
import { reactive, ref } from 'vue'
import maps from './data/icon-maps.json' // src/derive-icons.ts: pets, bosses, trek monsters, skills, crops, rifts, crusades, materials, tinkering items
import discovery from './data/discovery-static.json'
import realm from './data/realm.json'
import { ASSETS, g, sheetList, type IconMaps } from './icon-files'

/** One frame of a sheet: `file` under the game's assets folder, laid out `across` x `down` (frame 0 top-left, row-major),
 *  as in the game's MbsAnimation records (resources.mbs). A single image is across = down = 1, f = 0. */
export type Frame = { file: string; f: number; across: number; down: number }
export type Kind = 'pet' | 'boss' | 'monster' | 'skill' | 'crop' | 'rift' | 'crusade' | 'material' | 'gear' | 'nav' | 'card' | 'potion' | 'seed' | 'flower' | 'minion' | 'soul' | 'skull' | 'blessing'

const MAPS = maps as unknown as IconMaps
const sp = discovery.sprite

/** The frame for a game thing, or null when it isn't mapped. `id`: card id, potion id, seed/flower index, minion id, trek
 *  monster number, skill level key (e.g. "miningLVL"), crop id, rift "r-frame", crusade 1-13, material id, tinkering item id (gear); pets and bosses are
 *  looked up by name. */
export function frameOf(kind: Kind, name: string, id?: number | string): Frame | null {
  if (kind in MAPS) {
    const e = MAPS[kind]![kind === 'pet' ? name.replace(/ /g, '_') : String(id ?? name)]
    return e ? { file: e[0], f: e[1], across: e[2], down: e[3] } : null
  }
  if (id == null) return null
  const n = Number(id)
  switch (kind) {
    case 'card': return { file: g(870), f: n, across: 24, down: 24 } // sprite 870, frame = card id (0 = the "?" card)
    case 'potion': return { file: g(1144), f: n - 1, across: 14, down: 13 } // reveal: setCurrentFrame(NewPotionID - 1)
    case 'seed': case 'flower': // PotionIngredients: seed s = frame s, flower f = frame f + 20 (ActorEvents_1172)
      return { file: g(1173), f: (kind === 'seed' ? sp.seedFrame : sp.flowerFrame) + n, across: sp.cols, down: 9 }
    case 'minion': return { file: `data/${id}.png`, f: 0, across: 1, down: 1 }
    // the letter on a blessing choice: Blessing<N>.png, N = the key's place in Letter2Number (_, a, b, …), @6614992
    case 'blessing': return { file: `data/Blessing${n}.png`, f: 0, across: 1, down: 1 }
    case 'soul': return { file: g(798), f: n, across: 3, down: 3 } // minisouls (ActorEvents_797): setCurrentFrame(AcolyteTASK), frame = soul colour 1-8
  }
  return null
}

/** Sidebar icons (the author 2026-10-11, #40): page id -> the game thing that stands for it; pages without one show the label only. */
export const NAV_ICONS: Record<string, [Kind, string | number]> = {
  mining: ['skill', 'miningLVL'], smithing: ['skill', 'smithingLVL'], fishing: ['skill', 'fishingLVL'], tilling: ['skill', 'FarmingLV'], botany: ['skill', 'HerbloreLV'],
  spiriting: ['skill', 'spiritLVL'], summoning: ['skill', 'summonLVL'], construction: ['skill', 'ConstructionLV'], spelunk: ['skill', 'SpelunkerLV'],
  training: ['skill', 'atkLVL'], potions: ['skill', 'ApothecaryLV'], pets: ['skill', 'HatcheryLV'], rift: ['rift', '1-0'], cards: ['card', 1],
  raids: ['boss', 'King'], asylum: ['boss', 'Emigdala'], crusade: ['crusade', 1], tinker: ['gear', 1], realm: ['nav', 'realm'], contracts: ['nav', 'contracts'],
}

export { ASSETS }
export const neededFiles = () => sheetList(MAPS, Object.keys(realm.minions))
export async function readAsar(asar: Blob) {
  const head = new DataView(await asar.slice(0, 16).arrayBuffer())
  if (asar.size < 16 || head.getUint32(0, true) !== 4) throw new Error('not an asar archive (pick resources/app.asar)')
  const start = 8 + head.getUint32(4, true), len = head.getUint32(12, true)
  const tree = JSON.parse(await asar.slice(16, 16 + len).text())
  const file = (path: string): Blob | null => {
    let node = tree
    for (const seg of (ASSETS + path).split('/')) node = node?.files?.[seg]
    if (node?.offset == null) return null
    const at = start + Number(node.offset)
    return asar.slice(at, at + node.size, 'image/png')
  }
  // ponytail: build id = archive size + header size; there is no version string in the bundle. Any update changes both.
  return { build: `${asar.size}-${len}`, file }
}

// ---- IndexedDB cache: one record, the latest picked build: { build, name, files: { path: Blob } }.
type Cached = { build: string; name: string; files: Record<string, Blob> }
const idb = <T>(run: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readonly') => new Promise<T>((ok, fail) => {
  const open = indexedDB.open('game-icons', 1)
  open.onupgradeneeded = () => open.result.createObjectStore('build')
  open.onerror = () => fail(open.error)
  open.onsuccess = () => { const r = run(open.result.transaction('build', mode).objectStore('build')); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error) }
})

/** Sheets bundled with this build (VITE_SHIP_GAME_ART=1 at build time). */
const SHIPPED = import.meta.env?.VITE_SHIP_GAME_ART === '1'
/** What the icons come from, for the sidebar: '' = none. */
export const iconSource = ref('')
let cached: Cached | null = null
const sheets = new Map<string, Promise<ImageBitmap | null>>()
const urls = reactive(new Map<string, string | null>())

async function blobFor(file: string): Promise<Blob | null> {
  if (cached) return cached.files[file] ?? null
  if (SHIPPED) { const r = await fetch(`${import.meta.env.BASE_URL}game-art/${file}`); if (r.ok) return r.blob() }
  if (import.meta.env?.DEV) { const r = await fetch(`/data/game/asar/${ASSETS}${file}`); return r.ok ? r.blob() : null }
  return null
}
const sheet = (file: string) => {
  if (!sheets.has(file)) sheets.set(file, blobFor(file).then((b) => (b ? createImageBitmap(b) : null)).catch(() => null))
  return sheets.get(file)!
}
async function cut(fr: Frame, key: string) {
  const bmp = await sheet(fr.file)
  if (!bmp) return
  const w = bmp.width / fr.across, h = bmp.height / fr.down
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d')!.drawImage(bmp, (fr.f % fr.across) * w, Math.floor(fr.f / fr.across) * h, w, h, 0, 0, w, h)
  urls.set(key, c.toDataURL())
}
/** The frame as an image URL (reactive; null until cut, or when there is no source). */
export function iconUrl(fr: Frame): string | null {
  const key = `${fr.file}#${fr.f}`
  if (!urls.has(key)) { urls.set(key, null); void cut(fr, key) }
  return urls.get(key) ?? null
}
function use(c: Cached | null) {
  cached = c; sheets.clear(); urls.clear()
  iconSource.value = c ? `${c.name} (build ${c.build}, ${Object.keys(c.files).length} sheets)` : SHIPPED ? 'game art shipped with this build' : import.meta.env?.DEV ? 'local game files (dev)' : ''
}

/** Copy the needed sheets out of the player's app.asar into IndexedDB and switch the icons to them. */
export async function loadIcons(asar: File) {
  const { build, file } = await readAsar(asar)
  const files: Record<string, Blob> = {}
  // Copy into memory: a Blob slice of the picked File can't be stored once the File is gone.
  for (const p of neededFiles()) { const b = file(p); if (b) files[p] = new Blob([await b.arrayBuffer()], { type: 'image/png' }) }
  if (!files[g(870)]) throw new Error('no game sheets found in this archive; pick Idle Skilling/resources/app.asar')
  const c = { build, name: asar.name, files }
  try { await idb((s) => s.clear(), 'readwrite'); await idb((s) => s.put(c, 'latest'), 'readwrite') } catch { /* this session only */ }
  use(c)
}
export async function forgetIcons() {
  try { await idb((s) => s.clear(), 'readwrite') } catch { /* nothing stored */ }
  use(null)
}
// Startup: a build cached earlier, if any.
use(null)
if (typeof indexedDB !== 'undefined') idb<Cached | undefined>((s) => s.get('latest')).then((c) => c && use(c)).catch(() => {})
