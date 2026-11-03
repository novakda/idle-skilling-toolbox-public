// Icon maps (src/derive-icons.ts) against the actual sprite sheets: each checked entry's sheet exists, divides evenly
// into its frame grid, and the frame it points at has pixels. Dev only: skipped without the local game files.
import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { frameOf, type Kind } from './game-icons'

const ASSETS = `${import.meta.dir}/../../data/game/asar/distBuild/static/game/assets/`

/** Decode an 8-bit RGBA, non-interlaced PNG (what every game sheet is) to { w, h, px }. */
function png(path: string) {
  const b = readFileSync(path), idat: Buffer[] = []
  let w = 0, h = 0
  for (let p = 8; p < b.length; ) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('not 8-bit RGBA') }
    if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = 4 * w, px = new Uint8Array(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[o + x - 4]! : 0, up = y ? px[o - stride + x]! : 0, ul = y && x >= 4 ? px[o - stride + x - 4]! : 0
      const pa = Math.abs(up - ul), pb = Math.abs(a - ul), pc = Math.abs(a + up - 2 * ul)
      px[o + x] = row[x]! + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : ul][f]!
    }
  }
  return { w, h, px }
}
/** Opaque pixels in the frame the map points at. */
function opaque(kind: Kind, name: string, id?: number | string) {
  const fr = frameOf(kind, name, id)
  expect(fr).not.toBeNull()
  const { w, h, px } = png(ASSETS + fr!.file)
  expect(w % fr!.across).toBe(0); expect(h % fr!.down).toBe(0)
  const fw = w / fr!.across, fh = h / fr!.down, x0 = (fr!.f % fr!.across) * fw, y0 = Math.floor(fr!.f / fr!.across) * fh
  let n = 0
  for (let y = y0; y < y0 + fh; y++) for (let x = x0; x < x0 + fw; x++) if (px[4 * (y * w + x) + 3]! > 0) n++
  return n
}

describe.skipIf(!existsSync(ASSETS))('icon maps against the game sheets', () => {
  test('pets: animation by pet name (sprite 1274)', () => {
    expect(frameOf('pet', 'polar king')!.file).toBe('graphics/1x/sprite-1274-6.png')
    for (const p of ['bear', 'polar king', 'occulon', 'poopy_g']) expect(opaque('pet', p)).toBeGreaterThan(20)
    expect(frameOf('pet', 'not a pet')).toBeNull()
  })
  test('bosses: raid select animations 1/3/5/7, Asylum select frames 1-4', () => {
    expect(frameOf('boss', 'King')!.file).toBe('graphics/1x/sprite-462-0.png') // animation named "1"
    expect(frameOf('boss', 'Demon')!.file).toBe('graphics/1x/sprite-462-6.png') // animation named "7"
    expect(frameOf('boss', 'Gorshank')).toMatchObject({ file: 'graphics/1x/sprite-1270-0.png', f: 4, across: 3, down: 3 })
    for (const b of ['King', 'Entertainer', 'Sentinel', 'Demon', 'Emigdala', 'Occulon', 'Scallius', 'Gorshank']) expect(opaque('boss', b)).toBeGreaterThan(100)
  })
  test('trek monsters: frame = monster number (sprite 1354, 13x13)', () => {
    expect(frameOf('monster', 'Monster 20', 20)).toMatchObject({ file: 'graphics/1x/sprite-1354-0.png', f: 20, across: 13, down: 13 })
    for (const m of [1, 20, 100, 157]) expect(opaque('monster', '', m)).toBeGreaterThan(20)
    expect(frameOf('monster', '', 158)).toBeNull()
  })
  test('skills: skill-bar icon frames by level key', () => {
    expect(frameOf('skill', 'Mining', 'miningLVL')).toMatchObject({ file: 'graphics/1x/sprite-153-0.png', f: 0 })
    expect(frameOf('skill', 'Construction', 'ConstructionLV')).toMatchObject({ file: 'graphics/1x/sprite-155-0.png', f: 5 })
    for (const k of ['miningLVL', 'FarmingLV', 'smithingLVL', 'ConstructionLV', 'fishingLVL', 'HerbloreLV', 'endLVL', 'summonLVL']) expect(opaque('skill', '', k)).toBeGreaterThan(50)
  })
  test('crops: Tilling screen animation "15", frame = crop id (sprite 1105, 7x6)', () => {
    expect(frameOf('crop', 'Dirt', 1)).toMatchObject({ file: 'graphics/1x/sprite-1105-0.png', f: 1, across: 7, down: 6 })
    for (let c = 1; c <= 40; c++) expect(opaque('crop', '', c)).toBeGreaterThan(20)
    expect(frameOf('crop', '', 41)).toBeNull()
  })
  test('rifts: actor "Rifts" animation = rift number, 4 frames (sprite 836, 2x2)', () => {
    expect(frameOf('rift', 'Power', '3-0')).toMatchObject({ file: 'graphics/1x/sprite-836-4.png', f: 0, across: 2, down: 2 })
    for (let r = 1; r <= 9; r++) for (let f = 0; f < 4; f++) expect(opaque('rift', '', `${r}-${f}`)).toBeGreaterThan(20)
  })
  test('tinkering items: actor "ConquestCraftingEquipments" frame = item id (sprite 1008, 9x8)', () => {
    expect(frameOf('gear', '', 44)!.file).toBe('graphics/1x/sprite-1008-0.png')
    for (let g = 1; g <= 70; g++) expect(opaque('gear', '', g)).toBeGreaterThan(20)
  })
})
