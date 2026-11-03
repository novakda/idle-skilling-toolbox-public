// Every CustomLists data function in the game (`VT.Name=function(){return …}`) evaluated to JSON.
// Derived game data → data/game/lists.json (gitignored, local only). Usage: bun src/derive-lists.ts
import { writeFileSync } from "fs";
import { compile, loadBundle, matchBraces } from "./game-eval";

const src = loadBundle();
// The list holder is whatever var the CustomLists class binds; find it from a known list.
const holder = src.match(/(\w+)\.ShrineUpgrades=function\(\)\{return/)?.[1];
if (!holder) throw new Error("CustomLists holder not found — game update?");

const lists: Record<string, unknown> = {};
const failed: Record<string, string> = {};
for (const m of src.matchAll(new RegExp(`\\b${holder}\\.(\\w+)=function\\(\\)\\{`, "g"))) {
  const name = m[1]!;
  try {
    lists[name] = compile(matchBraces(src, m.index! + m[0].length - "function(){".length), {})();
  } catch (e) {
    failed[name] = String(e).slice(0, 160);
  }
}

// Second form: constructors build arrays with `this._List.splice(i,0,value)`. A constructor sits just
// before its class registration, so each call belongs to the NEXT registered script.
const regs = [...src.matchAll(/\w+\["scripts\.(\w+)"\]=/g)].map((m) => ({ at: m.index!, name: m[1]! }));
const owner = (at: number) => { let lo = 0, hi = regs.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (regs[mid]!.at < at) lo = mid + 1; else hi = mid; } return regs[lo]?.name ?? "?"; };
/** End of a call argument starting at `i`: first `)` at depth 0 outside strings. */
const argEnd = (i: number) => { let d = 0, q: string | null = null; for (; i < src.length; i++) { const c = src[i]!; if (q) { if (c === q && src[i - 1] !== "\\") q = null; } else if (c === '"' || c === "'") q = c; else if ("([{".includes(c)) d++; else if (")]}".includes(c)) { if (d === 0) return i; d--; } } return -1; };
const spliced: Record<string, unknown[]> = {};
for (const m of src.matchAll(/this\._(\w+)\.splice\((\d+),0,/g)) {
  const start = m.index! + m[0].length, end = argEnd(start);
  const key = `${owner(m.index!)}.${m[1]}`;
  try { (spliced[key] ??= [])[+m[2]!] = compile(src.slice(start, end), {}); }
  catch (e) { failed[`${key}[${m[2]}]`] = String(e).slice(0, 160); }
}
Object.assign(lists, spliced);

writeFileSync("data/game/lists.json", JSON.stringify(lists));
const n = Object.keys(lists).length;
console.log(`data/game/lists.json: ${n} lists via holder '${holder}', ${Object.keys(failed).length} failed`);
for (const [k, v] of Object.entries(failed)) console.log(`  FAIL ${k}: ${v}`);
