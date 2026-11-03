// Equipment stat table from _customBlock_GetPrimStatMapGLOBAL: item id -> two fixed stats + a Tinker third line
// worth k * floor((99 + TinkerThirdLine[id]) / 100). For the browser-side EbonusThree/Ebonus port (web/src/load-bonuses.ts).
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE, matchBraces } from "./game-eval";
const src = readFileSync(BUNDLE, "utf8");
const fn = matchBraces(src, src.indexOf("_customBlock_GetPrimStatMapGLOBAL:function"));
const items: Record<number, { t1: string; v1: number; t2: string; v2: number; t3?: string; k?: number }> = {};
for (const m of fn.matchAll(/MakeEquipmentStats1and2GLOBALL\((\d+),"(\w+)",([\d.e+]+),"(\w+)",([\d.e+]+)\)/g))
  items[+m[1]!] = { t1: m[2]!, v1: +m[3]!, t2: m[4]!, v2: +m[5]! };
for (const m of fn.matchAll(/_customBlock_thirdline\((\d+),\w+,"(\w+)",(?:([\d.e+]+)\*)?Math\.floor\(\(99\+/g))
  Object.assign(items[+m[1]!]!, { t3: m[2]!, k: m[3] ? +m[3] : 1 });
const bad = Object.entries(items).filter(([, v]) => v.t3 === undefined).map(([k]) => k);
if (Object.keys(items).length !== 60 || bad.length) throw new Error(`parsed ${Object.keys(items).length} items; no third line: ${bad}`);
writeFileSync("web/src/data/equipment.json", JSON.stringify(items)); // static app data
console.log(`web/src/data/equipment.json: ${Object.keys(items).length} items`);
