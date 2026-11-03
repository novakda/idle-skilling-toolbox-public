import { expect, test } from 'bun:test'
import { cloudWins, LOCAL_ONLY, localOnlyBackup, parseSave, readLevelDb, readLevelDbLog, regroup } from './save-load'

test('steam cloud regroup keeps scalar look-alikes', () => {
  // CardLevels is an array in the schema; aa2/aa3 are real scalar keys and must stay scalar
  const out = regroup({ CardLevels0: 0, CardLevels1: 2, aa2: 5, aa3: 7, ShrineCost1: 1.5 })
  expect(out.CardLevels).toEqual([0, 2])
  expect(out.aa2).toBe(5)
  expect(out.ShrineCost1).toBe(1.5)
})

test('detects formats', () => {
  const b64 = btoa(JSON.stringify({ CardLevels0: 1, aa2: 3 }))
  expect(parseSave(b64).format).toBe('steam-cloud')
  expect(parseSave(b64).save.CardLevels).toEqual([1])
  expect(parseSave(b64 + '?').save.CardLevels).toEqual([1]) // trailing junk as in real is.bin
  // collision resolved by the game's layout: key LifterLV2 is LifterLV[2], not a LifterLV2 array
  expect((parseSave(btoa(JSON.stringify({ LifterLV2: 329 }))).save.LifterLV as number[])[2]).toBe(329)
  expect(parseSave('oy1:ai5g').format).toBe('haxe')
  expect(parseSave('{"a":1}').format).toBe('json')
})

test('reads the latest mySave from a LevelDB log, across block fragments', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const varint = (n: number) => { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7 } o.push(n); return o }
  const batch = (seq: number, key: string, value: string) => [seq, ...new Array(11).fill(0), 1, ...varint(key.length), ...enc(key), ...varint(value.length + 1), 1, ...enc(value)]
  // Write records into 32 KB blocks the way LevelDB does: fragments with 7-byte headers, zero-padded block tails.
  const log: number[] = []
  const write = (rec: number[]) => {
    let off = 0, first = true
    while (true) {
      const room = 32768 - (log.length % 32768)
      if (room < 7) { log.push(...new Array(room).fill(0)); continue }
      const n = Math.min(rec.length - off, room - 7), last = off + n === rec.length
      log.push(0, 0, 0, 0, n & 255, n >> 8, first && last ? 1 : first ? 2 : last ? 4 : 3, ...rec.slice(off, off + n))
      off += n; first = false
      if (last) return
    }
  }
  write(batch(1, '_file://\u0000\u0001mySave', 'old'))
  write(batch(2, '_file://\u0000\u0001other', 'x'))
  const big = 'y' + 'a'.repeat(70000) // spans three blocks
  write(batch(3, '_file://\u0000\u0001mySave', big))
  expect(readLevelDbLog(Uint8Array.from(log))).toBe(big)
  expect(readLevelDbLog(new Uint8Array(0))).toBeNull()
})

test('cloud save applies only when the game would apply it', () => {
  const local = { CloudsaveTIMER: 100, TimesAscended: 13, waterLV: 120 }
  expect(cloudWins(local, { CloudsaveTIMER: 90, TimesAscended: 14, waterLV: 130 })).toBe(false) // older
  expect(cloudWins(local, { CloudsaveTIMER: 110, TimesAscended: 13, waterLV: 119 })).toBe(false) // behind on water
  expect(cloudWins(local, { CloudsaveTIMER: 110, TimesAscended: 13, waterLV: 120 })).toBe(true)
  expect(cloudWins(local, { CloudsaveTIMER: 110, TimesAscended: 14, waterLV: 1 })).toBe(true)
})

// Real LevelDB files (personal data, gitignored) when a backup exists: .ldb tables (Snappy) and the .log all decode, and
// the newest sequence wins.
import { existsSync, readdirSync, readFileSync } from 'fs'
const backups = existsSync('data') ? readdirSync('data').filter((d) => d.startsWith('backup-leveldb-')) : []
test.skipIf(!backups.length)('reads every table and log file in a real leveldb backup', () => {
  const dir = `data/${backups.at(-1)}`, files = readdirSync(dir).filter((f) => /\.(log|ldb)$/.test(f)).map((name) => ({ name, bytes: new Uint8Array(readFileSync(`${dir}/${name}`)) }))
  for (const f of files) expect(Object.keys(parseSave(readLevelDb([f])!).save).length).toBeGreaterThan(1000)
  const newestTable = files.filter((f) => f.name.endsWith('.ldb')).sort((a, b) => a.name.localeCompare(b.name)).at(-1)!
  expect(readLevelDb(files.filter((f) => f.name.endsWith('.ldb')))).toBe(readLevelDb([newestTable]))
})

test('localOnlyBackup: every LOCAL_ONLY key is in the real save and gets exported', async () => {
  const save = await Bun.file(new URL('../../data/save.json', import.meta.url)).json()
  expect(LOCAL_ONLY.filter((k) => !(k in save))).toEqual([])
  expect(localOnlyBackup(save).DeckLinkList).toEqual(save.DeckLinkList)
})
