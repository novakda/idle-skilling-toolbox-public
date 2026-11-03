// Construction buildings for the browser-side port (web/src/construction.ts), read from the game (#31). Writes
// web/src/data/construction.json:
//  - name[i]: ActorEvents_1379.ConstructionNames (data/game/lists.json), title-cased; i = the ConstructLV index;
//  - max[i]: the scene init's _ConstructLvMAX (SceneEvents_50 † @30494547; 100 unless set);
//  - cost[i][L] = [currency 1, amount 1, currency 2, amount 2, build points] to start level L + 1: the four whenUpdated
//    listeners of SceneEvents_50 († @30575914, @30585655, @30592740, @30600589) set _CostTypes[1] / aa12 and
//    _CostTypes[2] / aa11 for the selected building from its level alone, run here in the sandbox per level; the build points
//    are _customBlock_ConstructBuildREQ († @2687565) with aa = building, aa15 = _CostTypes[1], aa2 = level, as the
//    complete-build click calls it († @30663410);
//  - treasure[t], t = 1-28: the treasure card names (SceneEvents_3.Names 541-570) without the two Construction cards,
//    555 Iron Throne and 570 Chandelier (handed out by those buildings, † @30667178);
//  - ore[o]: the ore name the mining scene draws for RockLV o (SceneEvents_5);
//  - flower[f]: SceneEvents_37.FlowerNames;
//  - wiki[i]: the wiki's effect text for the building (data/wiki/datasets/construction.json), by name.
// web/src/construction.test.ts runs the listeners and the build-REQ block against this table.
import { readFileSync, writeFileSync } from "fs";
import { blockHost, BUNDLE, compile, matchBraces } from "./game-eval";

const root = new URL("..", import.meta.url).pathname;
const src = readFileSync(root + BUNDLE, "utf8");
const lists = JSON.parse(readFileSync(root + "data/game/lists.json", "utf8")) as Record<string, (string | number)[]>;
const title = (s: string) => s.replace(/_+/g, " ").trim().toLowerCase().replace(/\b\w/g, (w) => w.toUpperCase());

const scene = src.indexOf('"scripts.SceneEvents_50"'), sceneEnd = src.indexOf('"scripts.SceneEvents_51"', scene);
/** The four cost listeners: `addWhenUpdatedListener(null,(function(t,n){ … 0<ConstructSelected&&51>ConstructSelected …`. */
export function costListeners() {
  const out: string[] = [];
  for (let i = src.indexOf("addWhenUpdatedListener(null,(function(t,n){", scene); i > 0 && i < sceneEnd; i = src.indexOf("addWhenUpdatedListener(null,(function(t,n){", i + 1)) {
    const fn = matchBraces(src, src.indexOf("function(t,n)", i))
    if (fn.includes('0<b.engine.getGameAttribute("ConstructSelected")&&51>b.engine.getGameAttribute("ConstructSelected")')) out.push(fn)
  }
  if (out.length !== 4) throw new Error(`cost listeners: ${out.length}`)
  return out
}
/** Run the listeners for building i at level L: [cur1, amount1, cur2, amount2, build points]. */
export function runCost(i: number, L: number, fns = costListeners()) {
  const host = { wrapper: { enabled: true }, _CostTypes: [0, 0, 0], _DummyVar: 0, _ItemsOWNED: Array(110).fill(0), _ConstructLvMAX: Array(60).fill(100) }
  const attrs: Record<string, any> = { ConstructSelected: i, ConstructLV: Object.assign(Array(80).fill(0), { [i]: L }), ConstructTasks: Array(82).fill(0), aa11: 0, aa12: 0 }
  for (const fn of fns) (compile(fn, attrs, { a: host }) as Function)(0, 0)
  const t1 = host._CostTypes[1]!, t2 = host._CostTypes[2]!
  Object.assign(attrs, { aa: i, aa15: t1, aa2: L })
  const req = (blockHost(src, attrs) as any)._customBlock_ConstructBuildREQ() as number
  return [t1, attrs.aa12 as number, t2, attrs.aa11 as number, req]
}

if (import.meta.main) {
  const names = lists["ActorEvents_1379.ConstructionNames"] as string[]
  const name: Record<number, string> = {}, max: Record<number, number> = {}, cost: Record<number, number[][]> = {}
  const maxAt = src.indexOf("this._ConstructLvMAX[2]=", scene)
  const caps = Object.fromEntries([...src.slice(maxAt, src.indexOf(";", maxAt)).matchAll(/_ConstructLvMAX\[(\d+)\]=(\d+)/g)].map((m) => [+m[1]!, +m[2]!]))
  const fns = costListeners()
  names.forEach((nm, i) => {
    if (nm === "ERROR_LOL") return
    name[i] = title(nm); max[i] = caps[i] ?? 100
    cost[i] = Array.from({ length: max[i]! }, (_, L) => runCost(i, L, fns))
    if (cost[i]!.flat().some((x) => !Number.isFinite(x))) throw new Error(`building ${i}: non-finite cost`)
  })
  const cards = lists["SceneEvents_3.Names"] as string[]
  const treasure = [""].concat(cards.slice(541, 571).filter((_, k) => k !== 14 && k !== 29).map(title))
  if (treasure.length !== 29) throw new Error(`treasures ${treasure.length}`)
  const mining = src.slice(src.indexOf('"scripts.SceneEvents_5"'), src.indexOf('"scripts.SceneEvents_6"'))
  const ore: string[] = [""]
  for (const m of mining.matchAll(/getGameAttribute\("RockLV"\)\[m\+1\];if\((\d+)==\(null==[\w$][^{]*\{[\s\S]{0,3000}?getTextWidth\("([A-Z_ ]+)"/g)) ore[+m[1]!] ??= title(m[2]!)
  if (ore.length !== 21 || ore.slice(1).some((x) => !x)) throw new Error(`ores ${ore.length}`)
  const flower = (lists["SceneEvents_37.FlowerNames"] as string[]).map((x, i) => (i ? title(x) : ""))
  // The wiki's effect text per building (data/wiki/datasets/construction.json), matched by name; shown only where the
  // effect isn't decoded, and marked as the wiki's.
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "")
  const rows = JSON.parse(readFileSync(root + "data/wiki/datasets/construction.json", "utf8")) as { Upgrade: string; Effect: string }[]
  const wiki = Object.fromEntries(Object.entries(name).map(([i, nm]) => [i, rows.find((r) => key(r.Upgrade) === key(nm))?.Effect ?? ""]))
  writeFileSync(root + "web/src/data/construction.json", JSON.stringify({ name, max, cost, treasure, ore, flower, wiki }))
  console.log(`web/src/data/construction.json: ${Object.keys(name).length} buildings, ${Object.values(cost).flat().length} levels`)
}
