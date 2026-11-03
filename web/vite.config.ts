import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { DERIVED, fingerprint } from '../src/card-fingerprint.ts'
import { ASSETS, sheetList } from './src/icon-files.ts'

// Dev-only: serve ../data/*.json so the app reads the freshly extracted save without bundling it.
const ROOT = resolve(__dirname, '..')
const DATA = resolve(ROOT, 'data')
const SAVE = resolve(DATA, 'save.json')
const FRESH_MS = 5_000 // live reads are cheap; the on-disk fallback just re-reads the last save write

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    {
      // VITE_SHIP_GAME_ART=1 (env or web/.env): bundle the icon sheets the app uses under game-art/, copied from the local
      // game files; default 0 ships none and icons come from the player's own install (docs/ux-direction.md).
      name: 'ship-game-art',
      apply: 'build',
      generateBundle() {
        if (loadEnv(mode, __dirname, 'VITE_').VITE_SHIP_GAME_ART !== '1') return
        const json = (f: string) => JSON.parse(readFileSync(resolve(__dirname, 'src/data', f), 'utf8'))
        const files = sheetList(json('icon-maps.json'), Object.keys(json('realm.json').minions))
        const src = resolve(DATA, 'game/asar', ASSETS)
        const missing = files.filter((f) => !existsSync(resolve(src, f)))
        if (missing.length) throw new Error(`VITE_SHIP_GAME_ART=1 but ${missing.length} sheets are missing under ${src} (first: ${missing[0]}); run the asar extract first`)
        for (const f of files) this.emitFile({ type: 'asset', fileName: `game-art/${f}`, source: readFileSync(resolve(src, f)) })
      },
    },
    {
      name: 'local-data',
      configureServer(server) {
        // Realm numbers are explicit: GET status = current save's fingerprint vs the cached file's; POST recalc forces a regeneration.
        const RC = resolve(DATA, 'realm-combat.json'); let recalc: Promise<unknown> | null = null
        server.middlewares.use('/api/realm-recalc', (req, res) => {
          const send = (code: number, o: object) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) }
          const fpNow = () => fingerprint(JSON.parse(readFileSync(SAVE, 'utf8')), DERIVED['realm-combat.json']!.fields)
          try {
            if (req.method !== 'POST') return send(200, { fingerprint: fpNow(), cachedAt: existsSync(RC) ? statSync(RC).mtimeMs : null })
            if (recalc) return send(409, { ok: false, error: 'recalc already running' })
            const t0 = Date.now()
            recalc = new Promise((ok, no) => execFile('bun', ['src/realm-combat.ts', '--force'], { cwd: ROOT, timeout: 90_000 }, (e) => (e ? no(e) : ok(null))))
            recalc.then(() => send(200, { ok: true, ms: Date.now() - t0, generated: statSync(RC).mtimeMs, fingerprint: fpNow() }), (e) => send(500, { ok: false, error: String(e).slice(0, 300) })).finally(() => { recalc = null })
          } catch (e) { send(500, { ok: false, error: String(e).slice(0, 300) }) }
        })
        server.middlewares.use('/data', (req, res, next) => {
          const file = resolve(DATA, '.' + (req.url ?? '').split('?')[0])
          const png = file.startsWith(resolve(DATA, 'game/asar') + '/') && file.endsWith('.png') // game art, local only
          if (!file.startsWith(DATA + '/') || !(file.endsWith('.json') || png)) return next()
          // Page load refreshes a stale save: live from the running game over CDP when it's up (src/live-save.ts,
          // exits 2 if not reachable), otherwise from the on-disk save. Both append currency history.
          if (file === SAVE && !(req.url ?? '').includes('stale=1') && ((req.url ?? '').includes('fresh=1') || !existsSync(SAVE) || Date.now() - statSync(SAVE).mtimeMs > FRESH_MS)) {
            // Never fall back to the on-disk extract here: it overwrote save.json with stale data (#2650). Serve the existing save and say so.
            try { execFileSync('bun', ['src/live-save.ts'], { cwd: ROOT, stdio: 'ignore', timeout: 90_000 }) }
            catch (e) { console.warn('[local-data] live read failed, serving last save:', String(e).slice(0, 300)); if (existsSync(SAVE)) res.setHeader('X-Save-Live-Failed', String(statSync(SAVE).mtimeMs)); else { try { execFileSync('bun', ['src/extract.ts'], { cwd: ROOT, stdio: 'ignore', timeout: 30_000 }) } catch { /* nothing to serve */ } } }
          }
          // Derived files carry a fingerprint of the save fields they depend on; re-run the generator when it changed.
          const rel = file.slice(DATA.length + 1), spec = DERIVED[rel]
          if (spec && existsSync(SAVE) && existsSync(file)) {
            try {
              const fp = fingerprint(JSON.parse(readFileSync(SAVE, 'utf8')), spec.fields)
              if (JSON.parse(readFileSync(file, 'utf8')).fingerprint !== fp)
                execFileSync('bun', [spec.script], { cwd: ROOT, stdio: 'ignore', timeout: 60_000 })
            } catch (e) { console.warn('[local-data] re-derive failed, serving previous', rel, String(e).slice(0, 300)) }
          }
          if (!existsSync(file)) return next()
          res.setHeader('Content-Type', png ? 'image/png' : 'application/json')
          if (!png) res.setHeader('Cache-Control', 'no-store') // Reload save refetches these; a cached copy would show the old save
          res.end(readFileSync(file))
        })
      },
    },
  ],
}))
