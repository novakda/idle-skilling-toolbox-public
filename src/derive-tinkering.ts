// Tinkering recipes for the browser-side port (web/src/tinkering.ts), read from the game (#31). Writes web/src/data/tinkering.json:
//  - name[id], ids 1-70 (60 gear, boosters 61-65, mutators 66-70): the item's _EquipName in ActorEvents_997 († @18297543),
//    one `if(id==EquipmentSelected)` block per item;
//  - lvReq[id]: CraftingEquipmentTinkeringLvReq, a game-attribute default (game.mbs) no code writes, so it is read from the
//    local save; every save carries the same list;
//  - recipe[id] = [[material, tier, k, c] ×2, [previous-tier item, qty]]: the cost block ActorEvents_1007 runs 20 ms after an
//    item is picked († @2562585). It sets the tier base costs (Common 260, Uncommon 90, Rare 20 × max(1 − card cost
//    reduction/100, 0.1); Epic 10, Legendary 5, Pearlescent 2), then per item TinkeringCostCurrency[1..3] and
//    TinkeringCost[1..3], each material cost = round(k · base[tier] − c). k and c are measured by running that block in the
//    sandbox with Math.round as identity and the base costs pinned (all 0, then one tier at a time at 1), so the tier is the
//    one that moves the cost and k is how far; a literal cost (boosters, mutators) has tier −1, k 0, c = −cost.
//    web/src/tinkering.test.ts runs the real block against the port.
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE, compile, matchBraces } from "./game-eval";

const src = readFileSync(BUNDLE, "utf8");
const TIERS = ["CommonBaseCost", "UncommonBaseCost", "RareBaseCost", "EpicBaseCost", "LegendaryBaseCost", "PearlBaseCost"];

const nameAt = src.indexOf('_EquipName="WOODEN_SPEAR"');
const name: Record<number, string> = {};
for (const m of src.slice(nameAt - 2000, nameAt + 200000).matchAll(/_EquipName="(\w+)"/g)) {
  const ids = [...src.slice(nameAt - 2000 + m.index! - 800, nameAt - 2000 + m.index!).matchAll(/(\d+)==b\.engine\.getGameAttribute\("EquipmentSelected"\)/g)];
  if (ids.length) name[+ids.at(-1)![1]!] ??= m[1]!.replace(/_+/g, " ").toLowerCase().replace(/\b\w+/g, (w) => (/^[ivx]+$/.test(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)));
}

/** The cost block as a function of EquipmentSelected, with the base costs read through `pin` when given. */
export function costBlock() {
  const at = src.lastIndexOf("function(t)", src.indexOf("n=260*Math.max("));
  return matchBraces(src, at);
}
function run(id: number, pin?: (k: string) => number) {
  const attrs: Record<string, unknown> = { EquipmentSelected: id, TinkeringCost: [0, 0, 0, 0], TinkeringCostCurrency: [0, 0, 0, 0] };
  const view = new Proxy(attrs, { get: (t, k: string) => (pin && TIERS.includes(k) ? pin(k) : t[k]) });
  (compile(costBlock(), view) as () => void)();
  return { cost: attrs.TinkeringCost as number[], cur: attrs.TinkeringCostCurrency as number[] };
}

if (import.meta.main) {
  const save = JSON.parse(readFileSync("data/save.json", "utf8"));
  const round = Math.round;
  Math.round = (x: number) => x; // measure k and c unrounded
  const recipe: Record<number, [number, number, number, number][] | [number, number][]> = {};
  try {
    for (let id = 1; id <= 70; id++) {
      // All base costs 0 gives −c; then each tier alone at 1 shows which tier a cost reads (the one that moves it) and k.
      const a = run(id, () => 0), one = TIERS.map((T) => run(id, (k) => (k === T ? 1 : 0)))
      const mats = [1, 2].map((j) => {
        const t = one.findIndex((o) => o.cost[j] !== a.cost[j]), c = -a.cost[j]!
        return t < 0 ? [a.cur[j]!, -1, 0, c] : [a.cur[j]!, t, +(one[t]!.cost[j]! - a.cost[j]!).toFixed(9), +c.toFixed(9)];
      });
      recipe[id] = [...mats, [a.cur[3]!, a.cost[3]!]] as never;
    }
  } finally { Math.round = round; }
  const lvReq = save.CraftingEquipmentTinkeringLvReq as number[];
  if (Object.keys(name).length !== 70 || lvReq?.length !== 71) throw new Error(`names ${Object.keys(name).length}, lvReq ${lvReq?.length}`);
  writeFileSync("web/src/data/tinkering.json", JSON.stringify({ name, lvReq, recipe }));
  console.log("web/src/data/tinkering.json: 70 recipes");
}
