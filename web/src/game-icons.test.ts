// The asar reader against the player's real install, when it's on this machine (dev only; skipped otherwise).
import { test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { frameOf, NAV_ICONS, neededFiles, readAsar } from './game-icons'

const ASAR = '/mnt/c/Program Files (x86)/Steam/steamapps/common/Idle Skilling/resources/app.asar'
const LOCAL = `${import.meta.dir}/../../data/game/asar/distBuild/static/game/assets/`

test.skipIf(!existsSync(ASAR))('reads every needed sheet out of the installed app.asar, byte-identical to the extracted files', async () => {
  const { build, file } = await readAsar(Bun.file(ASAR))
  expect(build).toMatch(/^\d+-\d+$/)
  const need = neededFiles()
  const missing = need.filter((p) => !file(p))
  expect(missing).toEqual([])
  const png = new Uint8Array(await file(frameOf('card', 'x', 1)!.file)!.arrayBuffer())
  expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG')
  if (existsSync(LOCAL)) for (const p of need.slice(0, 5))
    expect(Buffer.from(await file(p)!.arrayBuffer()).equals(Buffer.from(await Bun.file(LOCAL + p).arrayBuffer()))).toBe(true)
})

test('rejects a file that is not an asar', async () => {
  await expect(readAsar(new Blob(['not an archive at all']))).rejects.toThrow('not an asar')
})

test('every sidebar icon resolves to a frame in a sheet we copy or ship', () => {
  const need = new Set(neededFiles())
  for (const [page, [kind, id]] of Object.entries(NAV_ICONS)) {
    const f = frameOf(kind, String(id), id)
    expect([page, f && need.has(f.file)]).toEqual([page, true])
  }
})
