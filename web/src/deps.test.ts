// Module boundaries (#63, step 0 of the refactor epic #62). Maps every web/src file to a proposed module, then fails on:
// - a NEW import between two modules (not in ALLOWED: today's edges, which the refactor removes one by one),
// - a STALE entry in ALLOWED (the edge is gone: delete it, so the list only ever shrinks),
// - a module import cycle larger than MAX_CYCLE (ratchet it down as steps land; 1 = acyclic).
// Analysis behind the map: modules-proposal.md in the refactor epic. Regenerate ALLOWED: `bun test src/deps.test.ts` prints the current list on failure.
import { expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// file (basename without extension) → module. First match wins.
const MODULE: [string, RegExp][] = [
  ['shell', /^(main|App)$/],
  ['views', /^(backup-guide|contract-plans|bestiary|skill-plan|perk-plan|ascend)$/], // L5 views (#74); planners and reference views join in step 9 (#72)
  ['core', /^(anim|next-types|crusade-data|raid-data|save-load|screen-bound|section|table-sort|names|game-icons|icon-files|level-total|Icon|StepsDialog|About)$/],
  ['producers', /^(mastery-bonuses|equipment-bonuses|pet-lab|potion-bonuses|ascend-rewards)$/], // L1 bonus producers (step 10, #73)
  ['bus', /^bus$/], ['totals', /^(totals|Totals)$/],
  ['donext', /^(do-next|DoNext)$/],
  ['away', /^(away|Afk)$/],
  ['cards', /^(cards-calc|card-art|card-sources)$/], ['cardplan', /^(cards-plan|cards-missing|Cards)$/],
  ['potions', /^(potions-calc|potion-formulas|alchemy|apothecary-exp|Potions)$/],
  ['botany', /^(botany-calc|Botany)$/], ['tilling', /^(tilling|tilling-away|Tilling)$/],
  ['combat', /^(combat|fight-sim)$/], ['fighting', /^(fighting|fight-away|crypt|bestiary|Fighting|Crypt|Bestiary)$/],
  ['training', /^(training|Training)$/],
  ['gathering', /^(gathering|smithing|smithing-caps|fishing|Gathering|Fishing)$/],
  ['raids', /^(raids|giftshop|Raids|GiftShop)$/],
  ['asylum', /^(asylum|heavycash|income|Asylum|Shrines|HeavyCash)$/],
  ['ascend', /^(perks|Ascend|Perks)$/], ['mastery', /^(mastery|Mastery)$/], ['skilltrees', /^(skilltree|SkillTrees)$/],
  ['spelunking', /^(spelunking|spelunk-sim|Spelunking)$/], ['construction', /^(construction|Construction)$/],
  ['spiriting', /^(spiriting|Spiriting)$/], ['summoning', /^(summoning|Summoning)$/], ['rift', /^(rift|Rift)$/],
  ['contracts', /^(contracts|contract-plans|Contracts)$/],
  ['crusade', /^(crusade|Crusade)$/], ['tinkering', /^(tinkering|Tinkering)$/],
  ['pets', /^(pets|pet-|trek-|codex|Pets|PetCells|Codex)/],
  ['realm', /^(realm|Realm)/], ['gems', /^(gems|Gems)$/], ['candy', /^(candy|Candy)$/], ['arcade', /^(arcade|Arcade)$/],
]
const modOf = (f: string) => MODULE.find(([, re]) => re.test(f))?.[0] ?? '?'

/** module → modules it imports, from the import lines of every non-test .ts/.vue file in web/src. */
export function moduleGraph(dir = import.meta.dir) {
  const files: [string, string][] = []
  for (const f of readdirSync(dir)) if (/\.(ts|vue)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.d.ts')) files.push([f.replace(/\.(ts|vue)$/, ''), join(dir, f)])
  for (const f of readdirSync(join(dir, 'components'))) if (f.endsWith('.vue')) files.push([f.replace(/\.vue$/, ''), join(dir, 'components', f)])
  // Step 10 (#73): modules/<sys>/ holds a module's logic, tests and page; the folder names the module.
  const folder: Record<string, string> = {}
  const mods = join(dir, 'modules')
  if (existsSync(mods)) for (const m of readdirSync(mods)) for (const f of readdirSync(join(mods, m)))
    if (/\.(ts|vue)$/.test(f) && !f.endsWith('.test.ts')) { const id = f.replace(/\.(ts|vue)$/, ''); files.push([id, join(mods, m, f)]); if (f.endsWith('.ts')) folder[id] = m }
  // Step 7b (#75): pages (components/*.vue and module pages, except core UI like Icon) form their own top layer, so a
  // page's imports are not counted as its logic module's.
  const pages = new Set(files.filter(([, p]) => p.endsWith('.vue') && /\/(components|modules)\//.test(p)).map(([id]) => id).filter((id) => modOf(id) !== 'core'))
  const mod = (id: string) => (pages.has(id) ? 'pages' : folder[id] ?? modOf(id))
  const known = new Set(files.map(([id]) => id)), unmapped = files.map(([id]) => id).filter((id) => mod(id) === '?')
  const edges = new Set<string>()
  for (const [id, path] of files) {
    for (const m of readFileSync(path, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (m[1]!.endsWith('.json')) continue
      const t = m[1]!.split('/').pop()!.replace(/\.(ts|vue)$/, '')
      if (known.has(t) && mod(t) !== mod(id)) edges.add(`${mod(id)} -> ${mod(t)}`)
    }
  }
  return { edges: [...edges].sort(), unmapped }
}

/** Size of the largest strongly connected component (1 = no cycle). */
function largestCycle(edges: string[]) {
  const adj: Record<string, string[]> = {}
  for (const e of edges) { const [a, b] = e.split(' -> ') as [string, string]; (adj[a] ??= []).push(b); adj[b] ??= [] }
  let i = 0, best = 1
  const I: Record<string, number> = {}, L: Record<string, number> = {}, st: string[] = [], on = new Set<string>()
  const visit = (x: string) => {
    I[x] = L[x] = i++; st.push(x); on.add(x)
    for (const y of adj[x]!) { if (I[y] === undefined) { visit(y); L[x] = Math.min(L[x]!, L[y]!) } else if (on.has(y)) L[x] = Math.min(L[x]!, I[y]!) }
    if (L[x] === I[x]) { let n = 0, y; do { y = st.pop()!; on.delete(y); n++ } while (y !== x); best = Math.max(best, n) }
  }
  for (const x of Object.keys(adj)) if (I[x] === undefined) visit(x)
  return best
}

const MAX_CYCLE = 1 // acyclic since step 10a (#73): 25 on 2026-11-03; 24 step 6, 22 step 7a, 19 step 7b, 14/12/6 step 9, 1 step 10a
// 177 module→module import edges after step 7b (2026-11-04). History: 191 on 2026-11-03; steps 1-7a moved helpers and
// split producers, which made some bus-internal reads visible (see git log of this file); step 7b counts pages as their own
// layer. Remove entries as refactor steps delete the edges; never add, except when a split makes an existing hidden
// dependency visible. Regenerate: `bun test src/deps.test.ts` prints the current list on failure.
const ALLOWED: string[] = [
  'arcade -> bus', 'ascend -> core', 'asylum -> combat', 'asylum -> core', 'asylum -> fighting', 'asylum -> raids',
  'away -> cards', 'away -> core', 'away -> realm', 'botany -> bus', 'botany -> cards', 'botany -> core', 'bus -> producers',
  'bus -> realm', 'candy -> away', 'candy -> cards', 'candy -> potions', 'candy -> tilling', 'candy -> training',
  'cardplan -> asylum', 'cardplan -> bus', 'cardplan -> cards', 'cardplan -> core', 'cardplan -> crusade', 'cardplan -> raids',
  'cards -> core', 'combat -> bus', 'combat -> cards', 'combat -> gathering', 'combat -> realm', 'construction -> cards',
  'construction -> core', 'construction -> crusade', 'construction -> pets', 'construction -> tilling',
  'construction -> tinkering', 'contracts -> core', 'crusade -> bus', 'crusade -> cards', 'crusade -> combat', 'crusade -> core',
  'crusade -> gathering', 'donext -> asylum', 'donext -> away', 'donext -> botany', 'donext -> cardplan', 'donext -> contracts',
  'donext -> core', 'donext -> gathering', 'donext -> gems', 'donext -> pets', 'donext -> potions', 'donext -> realm',
  'donext -> views', 'fighting -> bus', 'fighting -> cards', 'fighting -> combat', 'fighting -> core', 'fighting -> gathering',
  'gathering -> away', 'gathering -> bus', 'gathering -> cards', 'gathering -> core', 'gems -> away', 'gems -> bus',
  'gems -> core', 'gems -> gathering', 'gems -> tilling', 'mastery -> bus', 'pages -> arcade', 'pages -> asylum', 'pages -> away',
  'pages -> botany', 'pages -> bus', 'pages -> candy', 'pages -> cardplan', 'pages -> cards', 'pages -> construction',
  'pages -> contracts', 'pages -> core', 'pages -> crusade', 'pages -> donext', 'pages -> fighting', 'pages -> gathering',
  'pages -> gems', 'pages -> mastery', 'pages -> pets', 'pages -> potions', 'pages -> raids', 'pages -> realm', 'pages -> rift',
  'pages -> skilltrees', 'pages -> spelunking', 'pages -> spiriting', 'pages -> summoning', 'pages -> tilling',
  'pages -> tinkering', 'pages -> totals', 'pages -> training', 'pages -> views', 'pets -> away', 'pets -> bus', 'pets -> core',
  'potions -> ascend', 'potions -> bus', 'potions -> cards', 'potions -> core', 'potions -> skilltrees', 'producers -> cards',
  'producers -> core', 'producers -> realm', 'raids -> bus', 'raids -> cards', 'raids -> combat', 'raids -> core', 'realm -> core',
  'rift -> bus', 'rift -> cards', 'rift -> core', 'shell -> cards', 'shell -> core', 'shell -> pages', 'shell -> views',
  'skilltrees -> core', 'spelunking -> cardplan', 'spelunking -> cards', 'spelunking -> construction', 'spiriting -> bus',
  'spiriting -> cards', 'spiriting -> core', 'spiriting -> rift', 'spiriting -> summoning', 'summoning -> cards',
  'summoning -> rift', 'tilling -> bus', 'tilling -> cards', 'tilling -> core', 'tilling -> potions', 'tinkering -> bus',
  'tinkering -> cards', 'tinkering -> crusade', 'tinkering -> fighting', 'totals -> botany', 'totals -> bus', 'totals -> cards',
  'totals -> combat', 'totals -> construction', 'totals -> core', 'totals -> fighting', 'totals -> mastery', 'totals -> realm',
  'totals -> rift', 'totals -> skilltrees', 'totals -> spelunking', 'training -> core', 'training -> raids', 'views -> ascend',
  'views -> asylum', 'views -> away', 'views -> botany', 'views -> bus', 'views -> cards', 'views -> combat', 'views -> contracts',
  'views -> core', 'views -> crusade', 'views -> fighting', 'views -> gathering', 'views -> potions', 'views -> raids',
  'views -> rift', 'views -> skilltrees', 'views -> spiriting', 'views -> summoning', 'views -> tilling', 'views -> tinkering',
  'views -> training',
]

test('every web/src file maps to a module', () => {
  expect(moduleGraph().unmapped).toEqual([])
})

test('no new cross-module imports, and no stale allowlist entries', () => {
  const { edges } = moduleGraph(), allowed = new Set(ALLOWED)
  const added = edges.filter((e) => !allowed.has(e)), stale = ALLOWED.filter((e) => !edges.includes(e))
  if (added.length || stale.length) console.log(`current edges (${edges.length}):\n${JSON.stringify(edges)}`)
  expect({ added, stale }).toEqual({ added: [], stale: [] })
})

test('the largest module import cycle does not grow', () => {
  expect(largestCycle(moduleGraph().edges)).toBeLessThanOrEqual(MAX_CYCLE)
})
