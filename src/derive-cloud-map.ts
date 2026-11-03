// Exact Steam Cloud save layout (is.bin) from the game's own loader: run the SceneEvents_2 listener that reads the
// cloud save (w.get / w.getJsonList), answering every key with a unique marker, then find where each marker landed.
// Output data/cloud-map.json: [key, kind, path...] rows — save layout data only, no game code. It ships with the app
// so the browser can rebuild a save from is.bin exactly. Usage: bun src/derive-cloud-map.ts
import { readFileSync, writeFileSync } from "fs";
import { compile, inert, loadBundle, matchBraces } from "./game-eval";

const src = loadBundle();
// The load is a state machine on contractLightingID: state 1 compares cloud vs local, state 8 applies the cloud
// values (1227 w.get calls), state 5 writes the save (addSaveEntry). We run state 8.
const fnStart = src.search(/\(function\(a,n,r,i\)\{(?:if\()?t\.wrapper\.enabled&&8==b\.engine\.getGameAttribute\("contractLightingID"\)/);
if (fnStart < 0) throw new Error("cloud loader (state 8) not found — game update?");
const loader = matchBraces(src, fnStart + 1);

const template = JSON.parse(readFileSync("data/save.json", "utf8")) as Record<string, unknown>;
const attrs = structuredClone(template) as Record<string, any>;
attrs.contractLightingID = 8;
// save.json stores Haxe maps unwrapped; the game code reads them as { h: … } (e.g. CustomLists.h.randolistNUMreal).
const rewrap = (v: unknown): unknown => Array.isArray(v) ? v.map(rewrap) : v && typeof v === "object" ? { h: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrap(x)])) } : v;
for (const [k, v] of Object.entries(attrs)) if (v && typeof v === "object" && !Array.isArray(v)) attrs[k] = rewrap(v);

// Markers: numbers far outside any game value, so they survive the Haxe casts unchanged; lists get unique objects.
const BASE = 7.3e15;
const keys: string[] = [];
const marker = (k: string) => { keys.push(k); return BASE + keys.length - 1; };
const listMarkers = new Map<object, string>();
const fakeStorage = {
  loadStatus: () => 1, saveStatus: () => 1,
  get: (k: string) => marker(k),
  getString: (k: string) => `\u0000marker:${marker(k)}`,
  getJsonList: (k: string) => { const o = [`\u0000list:${k}`]; listMarkers.set(o, k); keys.push(k); return o; },
};

// The listener closes over `w` (FirebaseStorage) and `t` (the actor): bind both through a scope-aware wrapper.
const wrapped = compile(`function(){ var w = this.w, t = this.t; return (${loader}).apply(null, arguments); }`, attrs) as Function;
wrapped.call({ w: fakeStorage, t: { wrapper: { enabled: true } } }, inert, inert, inert, inert);

// Walk the attributes and record where each marker ended up.
type Row = [key: string, kind: "num" | "str" | "list", ...path: (string | number)[]];
const rows: Row[] = [];
const seen = new Set<string>();
function walk(v: unknown, path: (string | number)[]) {
  if (typeof v === "number" && v >= BASE && v < BASE + keys.length && Number.isInteger(v - BASE)) {
    const k = keys[v - BASE]!; rows.push([k, "num", ...path]); seen.add(k); return;
  }
  if (typeof v === "string" && v.startsWith("\u0000marker:")) {
    const k = keys[+v.slice(8) - BASE]!; rows.push([k, "str", ...path]); seen.add(k); return;
  }
  if (Array.isArray(v)) {
    if (listMarkers.has(v)) { const k = listMarkers.get(v)!; rows.push([k, "list", ...path]); seen.add(k); return; }
    v.forEach((x, i) => walk(x, [...path, i]));
  } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k === "h" ? path : [...path, k]); // map .h is not part of the save path
}
for (const [k, v] of Object.entries(attrs)) walk(v, [k]);

const requested = new Set(keys);
writeFileSync("data/cloud-map.json", JSON.stringify(rows));
console.log(`data/cloud-map.json: ${rows.length} rows; ${requested.size} keys requested by the loader, ${seen.size} landed in a save path`);
const lost = [...requested].filter((k) => !seen.has(k));
if (lost.length) console.log(`  read but not stored directly (used in arithmetic or ignored): ${lost.slice(0, 12).join(", ")}${lost.length > 12 ? " …" : ""}`);
