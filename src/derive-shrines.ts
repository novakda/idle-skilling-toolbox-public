// Shrine cost table from the game's own code: every shrine × level → both costs and currency slots.
// Output is derived game data, so it goes to data/game/ (gitignored, local only).
// Usage: bun src/derive-shrines.ts [--save data/save.json] [--max 60]
import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { compile, inert, loadBundle, matchBraces } from "./game-eval";

const { values } = parseArgs({
  options: { save: { type: "string", default: "data/save.json" }, max: { type: "string", default: "60" } },
});

// Names + currency groups: the game draws the 12 shrine names in this order (WRATH … BREWERY, @26557780-@26750305) and names the four
// currencies after the Asylum bosses (EMIGDALA, OCCULON, SCALLIUS, GORSHANK, @22260203-@22260507); slot numbers checked against the game below.
export const SHRINES = ["Wrath", "Prodigious", "Recoup", "Scavenge", "Heavy Cash", "Talent",
  "Eviscerate", "Hydrate", "Best Rest", "The Power", "Chain Level", "Brewery"];
export const CURRENCY: Record<number, string> = { 2: "Emigdala", 3: "Occulon", 4: "Scallius", 5: "Gorshank" };

const src = loadBundle();
const starts = new Set<number>();
for (let i = src.indexOf('setReserved("ShrineCost1"'); i >= 0; i = src.indexOf('setReserved("ShrineCost1"', i + 1))
  starts.add(src.lastIndexOf("(function(n,i,o,s){if(a.wrapper.enabled)", i));
const listeners = [...starts].map((s) => matchBraces(src, s + 1));
if (listeners.length !== 4) throw new Error(`expected 4 shrine-cost listeners, found ${listeners.length} — game update?`);

/** Run the game's cost listeners for one shrine at one level against `base` attributes. */
function cost(base: Record<string, unknown>, shrine: number, level: number) {
  const levels = [...((base.ShrineLevels as number[]) ?? Array(44).fill(0))];
  levels[shrine] = level;
  const a: Record<string, unknown> = { ...base, ShrineLevels: levels, ShrineSelected: shrine, ShrineCost1: undefined, ShrineCost2: undefined };
  for (const f of listeners) compile(f, a)(inert, inert, inert, inert);
  return { cost1: a.ShrineCost1 as number, cur1: a.ShrineCostCurrency1 as number, cost2: a.ShrineCost2 as number, cur2: a.ShrineCostCurrency2 as number };
}

const save = JSON.parse(readFileSync(values.save!, "utf8")) as Record<string, unknown>;
const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));

// Receipt 1: the last-selected shrine's saved cost must be reproduced by some shrine at its saved level.
const lv = save.ShrineLevels as number[];
const hit = SHRINES.findIndex((_, i) => { const c = cost(save, i + 1, lv[i + 1]!); return near(c.cost1, save.ShrineCost1 as number) && near(c.cost2, save.ShrineCost2 as number); });
if (hit < 0) throw new Error("no shrine reproduces the saved ShrineCost1/2 — formula extraction broke");

// Receipt 2: costs depend only on shrine + level. Same numbers from an empty save means the table is save-independent.
for (let s = 1; s <= 12; s++) {
  const a = cost(save, s, 7), b = cost({}, s, 7);
  if (!near(a.cost1, b.cost1) || !near(a.cost2, b.cost2)) throw new Error(`shrine ${s} cost depends on other save state`);
}

const max = Number(values.max);
const table = SHRINES.map((name, i) => ({
  id: i + 1, name,
  levels: Array.from({ length: max }, (_, level) => cost({}, i + 1, level)),
}));
writeFileSync("data/game/shrines.json", JSON.stringify({ currency: CURRENCY, shrines: table }));
// Static app data for the distributable build: costs depend only on shrine + level, never on the save.
writeFileSync("web/src/data/shrines.json", JSON.stringify({ currency: CURRENCY, shrines: table }));
console.log(`data/game/shrines.json: 12 shrines × ${max} levels; saved cost reproduced by shrine ${hit + 1} (${SHRINES[hit]})`);
