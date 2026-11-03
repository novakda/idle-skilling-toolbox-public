// Load a player's save in the browser — no server, no game files. Formats:
//  - Steam Cloud file  Steam/userdata/<id>/1048370/remote/is.bin : base64 JSON, arrays flattened to Name0..NameN
//    (a partial overlay: ~513 of ~1408 keys)
//  - local save: the game's Chromium localStorage LevelDB write-ahead log
//    (%APPDATA%/idle-skilling/Local Storage/leveldb/<n>.log), holding the full "mySave" value (readLevelDbLog)
//  - Haxe-serialized string (the "mySave" value itself) : parsed with the shared unserializer
import { unserialize } from '../../src/haxe'
import saveMap from '../../data/save-map.json'
// Exact is.bin layout, read from the game's own cloud loader (src/derive-cloud-map.ts): [key, kind, ...path].
import cloudMap from '../../data/cloud-map.json'

type Save = Record<string, unknown>
export type Loaded = { save: Save; format: 'steam-cloud' | 'haxe' | 'json' | 'local'; present: number; total: number; missing: string[] }

/** Which keys are arrays, from the committed save-key schema (key names + shapes only). */
const SHAPES: Record<string, string> = Object.assign({}, ...Object.values(saveMap as Record<string, Record<string, string>>))
const isArrayKey = (k: string) => SHAPES[k]?.startsWith('array') ?? false

/** Rebuild a save from Steam Cloud entries using the game's own key -> path layout. */
export function fromCloud(flat: Record<string, unknown>): Save {
  const out: Save = {}
  for (const [key, kind, ...path] of cloudMap as [string, string, ...(string | number)[]][]) {
    if (!(key in flat)) continue
    let v = flat[key]
    if (kind === 'list' && typeof v === 'string') { try { v = JSON.parse(v) } catch { /* keep raw */ } }
    let node: any = out
    path.forEach((seg, i) => {
      if (i === path.length - 1) { node[seg] = v; return }
      node = node[seg] ??= typeof path[i + 1] === 'number' ? [] : {}
    })
  }
  return out
}

/** Fallback when no layout is known: regroup Name0..NameN only for names the schema says are arrays. */
export function regroup(flat: Record<string, unknown>): Save {
  const out: Save = {}
  for (const [k, v] of Object.entries(flat)) {
    const m = k.match(/^(.*?)(\d+)$/)
    if (m && isArrayKey(m[1]!) && !(k in SHAPES)) ((out[m[1]!] ??= []) as unknown[])[+m[2]!] = v
    else out[k] = v
  }
  return out
}

export function parseSave(text: string): Loaded {
  const t = text.trim()
  let save: Save, format: Loaded['format']
  if (t.startsWith('{')) { save = JSON.parse(t); format = 'json' }
  else if (/^o[yR]/.test(t)) { save = unserialize(t) as Save; format = 'haxe' }
  else {
    // is.bin ends with a stray character after the base64 padding (seen: a trailing "?"); strip it.
    const b64 = t.replace(/[^A-Za-z0-9+/=]+$/, '')
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
    save = fromCloud(JSON.parse(json)); format = 'steam-cloud'
  }
  const keys = Object.keys(SHAPES)
  const missing = keys.filter((k) => !(k in save))
  return { save, format, present: keys.length - missing.length, total: keys.length, missing }
}

// ---- Local save: the game's Chromium localStorage LevelDB. The newest "mySave" is in the write-ahead log (.log) or, right
// after a compaction, in a table file (.ldb). Every value carries a sequence number; the highest wins.
type Hit = { seq: number; value: Uint8Array }
const isSaveKey = (key: Uint8Array) => new TextDecoder('latin1').decode(key.subarray(Math.max(0, key.length - 6))) === 'mySave'
function varintAt(b: Uint8Array, pos: { i: number }) { let v = 0, shift = 0, x: number; do { x = b[pos.i++]!; v += (x & 0x7f) * 2 ** shift; shift += 7 } while (x & 0x80); return v }
const u64 = (b: Uint8Array, i: number) => b[i]! + b[i + 1]! * 2 ** 8 + b[i + 2]! * 2 ** 16 + b[i + 3]! * 2 ** 24 + b[i + 4]! * 2 ** 32 + b[i + 5]! * 2 ** 40 + b[i + 6]! * 2 ** 48 + b[i + 7]! * 2 ** 56

/** Write-ahead log: 32 KB blocks of records (7-byte header: crc32, length, type FULL=1/FIRST=2/MIDDLE=3/LAST=4), each a
 *  write batch (sequence 8, count 4, then put=1/delete=0 entries with varint-prefixed key/value). */
function logHits(bytes: Uint8Array): Hit[] {
  const BLOCK = 32768, records: Uint8Array[] = [], hits: Hit[] = []
  let frag: number[] | null = null
  for (let b = 0; b < bytes.length; b += BLOCK)
    for (let i = b; i + 7 <= Math.min(b + BLOCK, bytes.length); ) {
      const len = bytes[i + 4]! | (bytes[i + 5]! << 8), type = bytes[i + 6]!, data = bytes.subarray(i + 7, i + 7 + len)
      i += 7 + len
      if (type === 0 && len === 0) break // zero padding at a block's end
      if (type === 1) records.push(data)
      else if (type === 2) frag = [...data]
      else if (type === 3 && frag) frag.push(...data)
      else if (type === 4 && frag) { frag.push(...data); records.push(Uint8Array.from(frag)); frag = null }
    }
  for (const r of records) {
    const pos = { i: 12 }
    for (let seq = u64(r, 0); pos.i < r.length; seq++) {
      const tag = r[pos.i++]!, klen = varintAt(r, pos), key = r.subarray(pos.i, pos.i + klen); pos.i += klen
      if (tag !== 1) continue
      const vlen = varintAt(r, pos), value = r.subarray(pos.i, pos.i + vlen); pos.i += vlen
      if (isSaveKey(key)) hits.push({ seq, value })
    }
  }
  return hits
}

/** Snappy block decompression (LevelDB table blocks). */
function snappy(src: Uint8Array): Uint8Array {
  const pos = { i: 0 }, out = new Uint8Array(varintAt(src, pos))
  let i = pos.i, o = 0
  while (i < src.length) {
    const tag = src[i++]!, t = tag & 3
    if (t === 0) {
      let len = tag >> 2
      if (len >= 60) { const n = len - 59; len = 0; for (let k = 0; k < n; k++) len |= src[i++]! << (8 * k) }
      len += 1; out.set(src.subarray(i, i + len), o); i += len; o += len
      continue
    }
    let len: number, off: number
    if (t === 1) { len = ((tag >> 2) & 7) + 4; off = ((tag >> 5) << 8) | src[i++]! }
    else if (t === 2) { len = (tag >> 2) + 1; off = src[i]! | (src[i + 1]! << 8); i += 2 }
    else { len = (tag >> 2) + 1; off = (src[i]! | (src[i + 1]! << 8) | (src[i + 2]! << 16)) + src[i + 3]! * 2 ** 24; i += 4 }
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off]!
  }
  return out
}

/** Table file (.ldb): footer -> index block -> data blocks (prefix-compressed entries, optional Snappy). Internal keys
 *  end in 8 bytes: (sequence << 8) | type, type 1 = value. */
function tableHits(f: Uint8Array): Hit[] {
  const block = (off: number, size: number) => (f[off + size] === 1 ? snappy(f.subarray(off, off + size)) : f.subarray(off, off + size))
  const entries = (b: Uint8Array) => {
    const restarts = b[b.length - 4]! | (b[b.length - 3]! << 8) | (b[b.length - 2]! << 16) | (b[b.length - 1]! << 24)
    const end = b.length - 4 - 4 * restarts, out: { key: Uint8Array; value: Uint8Array }[] = [], pos = { i: 0 }
    let last = new Uint8Array(0)
    while (pos.i < end) {
      const shared = varintAt(b, pos), own = varintAt(b, pos), vlen = varintAt(b, pos)
      const key = new Uint8Array(shared + own); key.set(last.subarray(0, shared)); key.set(b.subarray(pos.i, pos.i + own), shared); pos.i += own
      out.push({ key, value: b.subarray(pos.i, pos.i + vlen) }); pos.i += vlen; last = key
    }
    return out
  }
  const foot = { i: f.length - 48 }
  varintAt(f, foot); varintAt(f, foot) // metaindex handle (unused)
  const index = block(varintAt(f, foot), varintAt(f, foot)), hits: Hit[] = []
  for (const { value: handle } of entries(index)) {
    const h = { i: 0 }
    for (const { key, value } of entries(block(varintAt(handle, h), varintAt(handle, h)))) {
      if (key.length < 8 || key[key.length - 8] !== 1) continue // type byte (low byte of the trailer): 1 = value
      if (isSaveKey(key.subarray(0, key.length - 8))) hits.push({ seq: Math.floor(u64(key, key.length - 8) / 256), value })
    }
  }
  return hits
}

const decodeValue = (v: Uint8Array) => (v[0] === 0 ? new TextDecoder('utf-16le').decode(v.subarray(1)) : new TextDecoder('latin1').decode(v.subarray(1)))

/** The newest "mySave" across LevelDB files (.log and/or .ldb), or null. Chromium values start with 0x01 (Latin-1) or 0x00 (UTF-16LE). */
export function readLevelDb(files: { name: string; bytes: Uint8Array }[]): string | null {
  const hits = files.flatMap((f) => (f.name.endsWith('.log') ? logHits(f.bytes) : f.name.endsWith('.ldb') ? tableHits(f.bytes) : []))
  const best = hits.filter((h) => h.value.length).sort((a, b) => b.seq - a.seq)[0]
  return best ? decodeValue(best.value) : null
}
/** Single write-ahead log (kept for callers/tests that have just the .log). */
export const readLevelDbLog = (bytes: Uint8Array) => readLevelDb([{ name: 'x.log', bytes }])

/** Whether the game would apply a cloud save over this local one (cloud loader, state 1): only when the cloud's
 *  CloudsaveTIMER is newer and it isn't behind on progress (more ascensions, or same ascensions and water level >=). */
export function cloudWins(local: Save, cloud: Save): boolean {
  const n = (v: unknown) => Number(v ?? 0)
  return n(cloud.CloudsaveTIMER) > n(local.CloudsaveTIMER) &&
    (n(cloud.TimesAscended) > n(local.TimesAscended) || (n(cloud.TimesAscended) === n(local.TimesAscended) && n(cloud.waterLV) >= n(local.waterLV)))
}

/** Real progress a Steam Cloud restore leaves empty on a fresh machine, even after visiting each screen (#19 test,
 *  docs/STATE-MODEL.md). Exported from a local save so a new machine can re-enter them (#21). */
export const LOCAL_ONLY = ['DeckLinkList', 'EquipmentbyDeckList', 'CropCardsEquipped', 'AutoAdvanceToggle', 'CalibrationTrek',
  'TrekkingBGselected', 'CraftingMaterialUNLOCKED', 'UpgradeUnlocked', 'TotalH2OTokens', 'TicketsToSpend', 'IsbossBunlocked', 'IsbossCunlocked', 'IsbossDunlocked', 'IsBossB2unlocked',
  'IsBossC2unlocked', 'IsbossD2unlocked', 'WeabooFightsUnlocked', 'SpecialKeysGot', 'iUsedSeal', 'LittleGuyProgression',
  'CardIDcustom', 'TotalKillContract5', 'FlowersGivenBONUS', 'HerbloreIngredient1qtyNumber', 'HerbloreIngredient2qtyBase'] as const

export function localOnlyBackup(save: Save): Record<string, unknown> {
  return Object.fromEntries(LOCAL_ONLY.filter((k) => k in save).map((k) => [k, save[k]]))
}
