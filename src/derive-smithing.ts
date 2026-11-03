// Smithing upgrade costs for the browser-side port (web/src/smithing.ts), from the smithing scene's draw listener
// (SceneEvents_6): for the item on the selected anvil it sets SmithingCost1Currency / SmithingCost2Currency (material ids)
// and writes SmithingCost1[cur1] / SmithingCost2[cur2] = k · [PbonusSmithTotalCostRedux] · base^(level / e), where base is
// either a constant or max(b - PbonusSmithingScalingRedux/div, floor), floor = smithingEXPONENTIALlowerbound (+ add) or a
// constant. Each parsed cost is checked against the game's own statement, compiled and run on random inputs.
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE } from "./game-eval";

const G = readFileSync(BUNDLE, "utf8");
const start = G.indexOf('["scripts.SceneEvents_6"]='), end = G.indexOf('["scripts.', start + 30);
let s = G.slice(start, end)
  .replace(/null==([\w$]+)\?0:"number"==typeof \1\?c\.__cast\(\1,k\):"number"==typeof \1&&\(0\|\1\)===\1\?c\.__cast\(\1,l\):"boolean"==typeof \1\?c\.__cast\(\1,h\)\?1:0:"string"==typeof \1\?parseFloat\(\1\):parseFloat\(f\.string\(\1\)\)/g, "NUM($1)")
  .replace(/b\.engine\.getGameAttribute\("(\w+)"\)/g, "$$$1");

/** One cost: [currency, k, redux (0/1), b, div (0 = b is the base itself), floor (number), floorIsLB (0/1), e]. */
type Cost = [cur: number, k: number, redux: number, b: number, div: number, floor: number, floorIsLB: number, e: number];
const items: Record<number, Cost[]> = {};
const heads = [...s.matchAll(/if\((\d+)==\$SmithingAnvilItem\[0\|\$SmithingAnvilSelected\]\)/g)];
heads.forEach((h, i) => {
  const body = s.slice(h.index!, heads[i + 1]?.index ?? s.length);
  const cur: Record<string, number> = {};
  for (const m of body.matchAll(/null!=e\.SmithingCost([12])Currency\?[\w$]+\.setReserved\("SmithingCost\1Currency",(\d+)\)/g)) cur[m[1]!] = +m[2]!;
  if (!cur[1]) return; // the duplicate block for 83 only draws text
  const costs: Cost[] = [];
  for (const m of body.matchAll(/var ([\w$]+)=\$SmithingCost([12]),[\w$]+=0\|\$SmithingCost\2Currency,([^;]*);\1\[[\w$]+\]=([^;]*?)(?=;|,a\._|,[\w$]+=\$)/g)) {
    const [, , which, decls, assign] = m as unknown as string[];
    const t = `${decls};${assign}`;
    const k = +(t.match(/([\d.e]+)\*\$PbonusSmithTotalCostRedux/)?.[1] ?? assign!.match(/^([\d.e]+)\*Math\.pow/)?.[1] ?? NaN);
    const mx = t.match(/Math\.max\(([\d.]+)-\$PbonusSmithingScalingRedux\/(\d+),(\$smithingEXPONENTIALlowerbound(?:\+([\d.]+))?|[\d.]+)\)/);
    const lit = assign!.match(/Math\.pow\(([\d.]+),/);
    const e = +(assign!.match(/\)\)\/([\d.]+)\)$/)?.[1] ?? 1);
    const c: Cost = mx
      ? [cur[which!]!, k, +/\$PbonusSmithTotalCostRedux/.test(t), +mx[1]!, +mx[2]!, mx[3]!.startsWith("$") ? +(mx[4] ?? 0) : +mx[3]!, +mx[3]!.startsWith("$"), e]
      : [cur[which!]!, k, +/\$PbonusSmithTotalCostRedux/.test(t), +lit![1]!, 0, 0, 0, e];
    // The game's statement, run as written.
    const game = new Function("R", "S", "LB", "L", `const NUM=Number,$SmithingItemLevel=[L],$SmithingAnvilItem=[0],$SmithingAnvilSelected=0,$PbonusSmithTotalCostRedux=R,$PbonusSmithingScalingRedux=S,$smithingEXPONENTIALlowerbound=LB;var ${decls};return ${assign}`);
    for (let n = 0; n < 20; n++) {
      const R = Math.random(), S = 5 * Math.random(), LB = 1 + 0.03 * Math.random(), L = Math.floor(200 * Math.random()) + 1;
      const [, k2, r, b, div, fl, isLB, e2] = c, base = div ? Math.max(b - S / div, isLB ? LB + fl : fl) : b;
      const want = game(R, S, LB, L) as number, got = k2 * (r ? R : 1) * Math.pow(base, L / e2);
      if (!(Math.abs(got / want - 1) < 1e-12)) throw new Error(`item ${h[1]} cost${which} parse mismatch: ${got} vs ${want} (${assign})`);
    }
    costs.push(c);
  }
  if (costs.length !== (cur[2] ? 2 : 1)) throw new Error(`item ${h[1]}: ${costs.length} costs parsed, currencies ${JSON.stringify(cur)}`);
  items[+h[1]!] = costs;
});
if (Object.keys(items).length < 96) throw new Error(`only ${Object.keys(items).length} smithing items parsed — game update?`);
writeFileSync("web/src/data/smithing.json", JSON.stringify(items));
console.log(`web/src/data/smithing.json: ${Object.keys(items).length} items`);

// Item names (#2674): the title each item's draw block writes at (260, 266) on the anvil panel, e.g. 56 → DRAGONEYE_CHARM
// (`if(56==$SmithingAnvilItem[...]){…getTextWidth("DRAGONEYE_CHARM"`, SceneEvents_6 @31203462). Index = SmithingItemLevel index.
const UPPER = new Set(["AP", "BP", "EXP"]);
const names: Record<number, string> = {};
for (const h of s.matchAll(/if\((\d+)==\$SmithingAnvilItem\[0\|\$SmithingAnvilSelected\]\)\{var [\w$]+=p\.getFont\(\d+\)/g)) {
  const body = s.slice(h.index!, h.index! + 1400);
  const t = body.match(/n\.x\+260\*n\.scaleX,[\w$]+=n\.y\+266\*n\.scaleY[\s\S]*?getTextWidth\("([A-Z0-9_']+)"/)?.[1];
  if (t && !names[+h[1]!]) names[+h[1]!] = t.split("_").map((w) => (UPPER.has(w) ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
}
if (Object.keys(names).length < 96) throw new Error(`only ${Object.keys(names).length} smithing item names found — game update?`);
writeFileSync("web/src/data/smithing-names.json", JSON.stringify(names));
console.log(`web/src/data/smithing-names.json: ${Object.keys(names).length} names`);
