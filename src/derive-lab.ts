// Lab tank tables for the browser-side TankBonusLIST port (web/src/load-bonuses.ts), from SceneEvents_45:
//  - parts: P[i] = (min(lv,1) + 198*lv/(lv+1000)) * scale/100, lv = TankLVs[3*(tank-1)+slot]. Built by a sequence of
//    `aa2 = tank; aa3 = scale; ... PARTS[aa2 + 45*(slot-1)] = aa`, some inside branch loops (one write, several pairs).
//    Indices >= 161 are written by irregular loops and are not shipped.
//  - petBuff: the _PetBuffAmount list (splice order = pet id).
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE } from "./game-eval";
const G = readFileSync(BUNDLE, "utf8");
const start = G.indexOf("_TankBonusesListPARTS["), end = G.lastIndexOf("_TankBonusesListPARTS[") + 200;
const R = G.slice(start - 3000, end);
const tok = /setReserved\("(aa2|aa3)",([^)]*)\)|getGameAttribute\("TankLVs"\)\[3\*Math\.ceil\(b\.engine\.getGameAttribute\("aa2"\)-1\)\+(\d)\]|_TankBonusesListPARTS\[([^\]]{0,80})\]=(b\.engine\.getGameAttribute\("aa"\))?/g;
type Pair = { aa2: number | null; aa3: number | null };
let pending: Pair[] = [], last: Pair = { aa2: null, aa3: null }, slot: number | null = null;
const parts: Record<number, [tank: number, slot: number, scale: number]> = {};
for (const m of R.matchAll(tok)) {
  if (m[1]) {
    const v = m[2]!.trim(), num = /^[\d.e+]+$/.test(v) ? +v : null;
    if (m[1] === "aa2") { pending.push({ aa2: num, aa3: last.aa3 }); slot = null; } else if (pending.length) pending.at(-1)!.aa3 = num; else last = { ...last, aa3: num };
  } else if (m[3]) slot = +m[3];
  else {
    const expr = m[4]!.replace(/\|0$/, "").replace(/^0\|/, ""), pairs = pending.length ? pending : [last];
    pending = [];
    if (!m[5] || slot == null || !/^b\.engine\.getGameAttribute\("aa2"\)(\+\d+)?$/.test(expr)) continue;
    const off = +(expr.match(/\+(\d+)$/)?.[1] ?? 0);
    for (const p of pairs) if (p.aa2 != null && p.aa3 != null && p.aa2 + off < 161) parts[p.aa2 + off] = [p.aa2, slot, p.aa3];
    last = pairs.at(-1)!;
  }
}
const a = G.indexOf("this._PetBuffAmount=[]"), next = G.indexOf("this._PetBuffAmount=[]", a + 1), b = next > 0 ? next : G.length; // built once per scene that needs it; take the first
const petBuff = [...G.slice(a, b).matchAll(/_PetBuffAmount,[\w$]+=0\|b\.engine\.getGameAttribute\("aa"\);[\w$]+\.splice\([\w$]+,0,([\d.e+-]+)\)/g)].map((m) => +m[1]!);
// Spot checks against the wiki (Hatchery pet list: Zebra 19 = 30% brew speed, Ice Cream 28 = 50%) and known parts.
if (petBuff[19] !== 30 || petBuff[28] !== 50) throw new Error(`pet buff order off: [19]=${petBuff[19]} [28]=${petBuff[28]}`);
if (JSON.stringify(parts[33]) !== "[33,1,30]" || JSON.stringify(parts[112]) !== "[22,3,600]") throw new Error("tank parts parse drifted");
writeFileSync("web/src/data/lab.json", JSON.stringify({ parts, petBuff }));
console.log(`web/src/data/lab.json: ${Object.keys(parts).length} tank parts, ${petBuff.length} pet buffs`);
