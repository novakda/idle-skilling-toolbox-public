// Module boundaries (#63, step 0 of the refactor epic #62). Maps every web/src file to a proposed module, then fails on:
// - a NEW import between two modules (not in ALLOWED: today's edges, which the refactor removes one by one),
// - a STALE entry in ALLOWED (the edge is gone: delete it, so the list only ever shrinks),
// - a module import cycle larger than MAX_CYCLE (ratchet it down as steps land; 1 = acyclic).
// Analysis behind the map: modules-proposal.md in the refactor epic. Regenerate ALLOWED: `bun test src/deps.test.ts` prints the current list on failure.
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// file (basename without extension) → module. First match wins.
const MODULE: [string, RegExp][] = [
  ['shell', /^(main|App)$/],
  ['core', /^(anim|save-load|screen-bound|section|table-sort|names|game-icons|icon-files|level-total|backup-guide|Icon|StepsDialog|About)$/],
  ['bus', /^bus$/], ['totals', /^(totals|Totals)$/],
  ['donext', /^(do-next|DoNext)$/],
  ['away', /^(away|Afk)$/],
  ['cards', /^(cards-calc|card-art)$/], ['cardplan', /^(cards-plan|cards-missing|Cards)$/],
  ['potions', /^(potion-bonuses|potions-calc|potion-formulas|alchemy|apothecary-exp|Potions)$/],
  ['botany', /^(botany-calc|Botany)$/], ['tilling', /^(tilling|tilling-away|Tilling)$/],
  ['combat', /^(combat|fight-sim)$/], ['fighting', /^(fighting|fight-away|crypt|bestiary|Fighting|Crypt|Bestiary)$/],
  ['training', /^(training|Training)$/],
  ['gathering', /^(gathering|equipment-bonuses|smithing|smithing-caps|fishing|Gathering|Fishing)$/],
  ['raids', /^(raids|giftshop|Raids|GiftShop)$/],
  ['asylum', /^(asylum|heavycash|income|Asylum|Shrines|HeavyCash)$/],
  ['ascend', /^(ascend|ascend-rewards|perks|Ascend|Perks)$/], ['mastery', /^(mastery|mastery-bonuses|Mastery)$/], ['skilltrees', /^(skilltree|SkillTrees)$/],
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
  const known = new Set(files.map(([id]) => id)), unmapped = files.map(([id]) => id).filter((id) => modOf(id) === '?')
  const edges = new Set<string>()
  for (const [id, path] of files) {
    for (const m of readFileSync(path, 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (m[1]!.endsWith('.json')) continue
      const t = m[1]!.split('/').pop()!.replace(/\.(ts|vue)$/, '')
      if (known.has(t) && modOf(t) !== modOf(id)) edges.add(`${modOf(id)} -> ${modOf(t)}`)
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

const MAX_CYCLE = 24 // modules in the largest import cycle (25 on 2026-11-03, 24 after step 6); target 1 after step 7 (#70)
// 216 module→module import edges (191 on 2026-11-03; step 1 removed 6; step 3 added 13; step 5 renamed 5 and added 5, see below; step 6 moved 13 and added 10; step 7 moved 1 and added 3 → 216). Remove entries as refactor steps
// delete the edges; never add, except when a split makes an existing hidden dependency visible.
const ALLOWED: string[] = [
  'arcade -> bus', 'ascend -> asylum', 'ascend -> away', 'ascend -> botany', 'ascend -> bus', 'ascend -> cards', 'ascend -> core',
  'ascend -> fighting', 'ascend -> gathering', 'ascend -> rift', 'ascend -> skilltrees', 'asylum -> core',
  'asylum -> raids', 'away -> asylum', 'away -> bus', 'away -> cards', 'away -> core', 'away -> fighting', 'away -> gathering',
  'away -> realm', 'botany -> away', 'botany -> bus', 'botany -> cards', 'botany -> core', 'bus -> mastery', 'bus -> realm', 'candy -> away', 'candy -> cards', 'candy -> potions', 'candy -> tilling', 'candy -> training',
  'construction -> cards',
  'construction -> core', 'construction -> crusade', 'construction -> pets', 'construction -> tilling', 'construction -> tinkering',
  'contracts -> away', 'contracts -> cards', 'contracts -> core', 'contracts -> crusade', 'contracts -> fighting',
  'contracts -> gathering', 'contracts -> potions', 'contracts -> spiriting', 'contracts -> summoning', 'contracts -> tilling',
  'contracts -> tinkering', 'contracts -> training', 'core -> cards', 'core -> raids', 'core -> tinkering', 'crusade -> bus',
  'crusade -> cards', 'crusade -> core', 'crusade -> gathering', 'donext -> ascend',
  'donext -> asylum', 'donext -> away', 'donext -> botany', 'donext -> cards', 'donext -> contracts', 'donext -> gathering',
  'donext -> gems', 'donext -> pets', 'donext -> potions', 'donext -> realm', 'fighting -> bus', 'fighting -> cards',
  'fighting -> core', 'fighting -> crusade', 'fighting -> gathering', 'fighting -> raids', 'fighting -> realm', 
  'gathering -> away', 'gathering -> bus', 'gathering -> cards', 'gathering -> core', 'gems -> away',
  'gems -> bus', 'gems -> gathering', 'mastery -> bus', 'mastery -> core', 'pets -> away', 'pets -> bus', 'pets -> candy',
  'pets -> cards', 'pets -> core', 'potions -> ascend', 'potions -> away', 'potions -> bus', 'potions -> candy', 'potions -> cards',
  'potions -> core', 'potions -> skilltrees', 'raids -> bus', 'raids -> cards', 'raids -> core',
  'realm -> core', 'rift -> bus', 'rift -> cards', 'rift -> core', 'shell -> arcade',
  'shell -> ascend', 'shell -> asylum', 'shell -> away', 'shell -> botany', 'shell -> candy', 'shell -> cards',
  'shell -> construction', 'shell -> contracts', 'shell -> core', 'shell -> crusade', 'shell -> donext', 'shell -> fighting',
  'shell -> gathering', 'shell -> gems', 'shell -> mastery', 'shell -> pets', 'shell -> potions', 'shell -> raids',
  'shell -> realm', 'shell -> rift', 'shell -> skilltrees', 'shell -> spelunking', 'shell -> spiriting', 'shell -> summoning',
  'shell -> tilling', 'shell -> tinkering', 'shell -> training', 'skilltrees -> ascend', 'skilltrees -> away', 'skilltrees -> botany',
  'skilltrees -> core', 'skilltrees -> crusade', 'skilltrees -> gathering', 'skilltrees -> rift',
  'skilltrees -> spiriting', 'skilltrees -> tilling', 'skilltrees -> tinkering', 'spelunking -> cards', 'spelunking -> construction',
  'spelunking -> core', 'spiriting -> bus', 'spiriting -> candy', 'spiriting -> cards', 'spiriting -> core',
  'spiriting -> rift', 'spiriting -> summoning', 'summoning -> cards', 'summoning -> core', 'summoning -> rift', 'tilling -> away',
  'tilling -> bus', 'tilling -> candy', 'tilling -> cards', 'tilling -> core', 'tilling -> potions', 'tinkering -> bus',
  'tinkering -> cards', 'tinkering -> core', 'tinkering -> crusade', 'tinkering -> fighting', 'training -> candy',
  'training -> core', 'training -> raids',
  // Step 3 (#66): load-bonuses.ts split into producers. These reads already happened inside the one bus file; the split names
  // them (producer → producer in bus order, bus → each producer via the re-export barrel). Step 4 orders them in bus.ts.
  'ascend -> mastery', 'ascend -> pets', 'ascend -> potions', 'bus -> ascend', 'bus -> gathering', 'bus -> pets', 'bus -> potions',
  'mastery -> realm', 'pets -> realm', 'potions -> gathering', 'potions -> mastery', 'potions -> pets', 'potions -> realm',
  // Step 5 (#68): cards split into the producer (cards-calc, card-art: imports nothing) and the planner (cards-plan, cards-missing,
  // Cards.vue). The planner's edges were cards -> asylum/bus/core/crusade/raids; its users were already counted as -> cards.
  'cardplan -> asylum', 'cardplan -> bus', 'cardplan -> cards', 'cardplan -> core', 'cardplan -> crusade', 'cardplan -> raids', 'donext -> cardplan', 'potions -> cardplan', 'shell -> cardplan', 'spelunking -> cardplan',
  // Step 6 (#69): the fight simulator moved from raids.ts to fight-sim.ts, and combat.ts + fight-sim.ts became the combat engine
  // module (out of fighting). totals is a view, mapped apart from the bus, which leaves the bus importing only producers.
  'ascend -> combat', 'asylum -> combat', 'combat -> bus', 'combat -> cards', 'combat -> gathering', 'combat -> realm', 'crusade -> combat', 'fighting -> combat', 'raids -> combat', 'shell -> totals', 'skilltrees -> combat', 'totals -> botany', 'totals -> bus', 'totals -> cards', 'totals -> combat', 'totals -> construction', 'totals -> core', 'totals -> fighting', 'totals -> mastery', 'totals -> realm', 'totals -> rift', 'totals -> skilltrees', 'totals -> spelunking',
  // Step 7 (#70): away.ts split into the away engine (away %, banked time), fight-away.ts (fighting) and tilling-away.ts
  // (tilling); callers now name the module they actually use.
  'ascend -> tilling', 'asylum -> fighting', 'away -> tilling', 'gems -> tilling',
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
