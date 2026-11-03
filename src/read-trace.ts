// Live read-tracer (#2643): wraps chosen game-attribute arrays in a counting Proxy over CDP, for --seconds, then restores them.
// The Proxy forwards every get/set unchanged (it never writes a value), so the game and its save see the same array.
// Restore puts the original array back only if the slot still holds our Proxy (the game may have replaced it meanwhile);
// a page-side timer restores on its own if this CLI dies. Each read's call site comes from Error().stack: the bundle is one
// line, so the column is the byte offset, which is resolved against data/access-index.sqlite (src/access-index.ts).
// Usage: bun src/read-trace.ts [--seconds 60] [--watch RealmStuff.13] [--watch PotionLV:91] [--stacks 3] [--port 9333]
//   --watch ATTR[.i.j][:k,l]  wrap ATTR[i][j] (an array); count reads of all its indices, or only k,l
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { parseArgs } from "util";
import { DEFAULT_DB } from "./access-index";
import { connectLive } from "./live";

export type Watch = { spec: string; attr: string; path: number[]; only: number[] | null };
export function parseWatch(spec: string): Watch {
  const [lhs, only] = spec.split(":");
  const [attr, ...path] = lhs!.split(".");
  return { spec, attr: attr!, path: path.map(Number), only: only ? only.split(",").map(Number) : null };
}

/** Page-side installer. Returns "ok" or an error string. */
const install = (watches: Watch[], seconds: number, nStacks: number) => `(() => {
  const old = window.__iskTrace;
  if (old && !old.done) return "a trace is already running (" + Math.round((old.until - Date.now()) / 1000) + " s left)";
  const h = window.__iskEngine.gameAttributes.h;
  const T = { done: false, budget: 200000, until: Date.now() + ${seconds * 1000}, screen0: h.CurrentlyViewedScreen, watches: [] };
  for (const w of ${JSON.stringify(watches)}) {
    let parent = h, key = w.attr;
    for (const i of w.path) { parent = parent?.[key]; key = i; }
    const orig = parent?.[key];
    if (!Array.isArray(orig)) { T.watches.push({ spec: w.spec, error: "not an array: " + typeof orig }); continue; }
    const only = w.only && new Set(w.only.map(String));
    const W = { spec: w.spec, parent, key, orig, counts: {}, sites: {}, stacks: {} };
    W.proxy = new Proxy(orig, { get(t, k) {
      if (!T.done && typeof k === "string" && (only ? only.has(k) : /^\\d+$/.test(k))) {
        W.counts[k] = (W.counts[k] || 0) + 1;
        if (T.budget-- > 0) {
          const L = Error.stackTraceLimit; Error.stackTraceLimit = 8;
          const st = new Error().stack; Error.stackTraceLimit = L;
          const fr = st.split("\\n").slice(2).map((l) => /at (?:(.*?) \\()?(\\S*?):(\\d+):(\\d+)\\)?$/.exec(l)).filter(Boolean)
            .map((m) => ({ fn: m[1] || "", file: m[2].split("/").pop(), col: +m[4] }));
          const g = fr.find((f) => f.file === "Qno2x.js");
          const site = g ? g.col : 0, sk = k + "@" + site;
          W.sites[sk] = (W.sites[sk] || 0) + 1;
          const s = W.stacks[k] || (W.stacks[k] = []);
          if (s.length < ${nStacks} && !s.some((x) => x.site === site)) s.push({ site, frames: fr.slice(0, 4).map((f) => f.fn + "@" + f.file + ":" + f.col) });
        }
      }
      return Reflect.get(t, k);
    } });
    parent[key] = W.proxy;
    T.watches.push(W);
  }
  T.restore = () => {
    T.done = true; clearTimeout(T.timer);
    return T.watches.map((W) => W.error ? W.spec + ": " + W.error
      : W.parent[W.key] === W.proxy ? (W.parent[W.key] = W.orig, W.spec + ": restored")
      : W.spec + ": slot replaced by the game meanwhile (nothing to restore)");
  };
  T.timer = setTimeout(T.restore, ${(seconds + 30) * 1000});
  window.__iskTrace = T;
  return "ok";
})()`;

const RESULT = `JSON.stringify((() => { const T = window.__iskTrace; return { screen0: T.screen0, screen1: window.__iskEngine.gameAttributes.h.CurrentlyViewedScreen,
  watches: T.watches.map((W) => ({ spec: W.spec, error: W.error, counts: W.counts, sites: W.sites, stacks: W.stacks })), budgetLeft: T.budget }; })())`;

if (import.meta.main) {
  const { values: v } = parseArgs({
    options: {
      seconds: { type: "string", default: "60" }, watch: { type: "string", multiple: true }, stacks: { type: "string", default: "3" },
      port: { type: "string", default: "9333" }, db: { type: "string", default: DEFAULT_DB },
    },
  });
  const watches = (v.watch?.length ? v.watch : ["RealmStuff.13", "PotionLV:91"]).map(parseWatch);
  const seconds = +v.seconds!;
  const live = await connectLive(+v.port!);
  await live.hookEngine();
  const r = await live.evaluate(install(watches, seconds, +v.stacks!));
  if (r !== "ok") { console.error(r); live.close(); process.exit(1); }
  let restored = false;
  const restore = async () => { if (restored) return; restored = true; console.log((await live.evaluate(`window.__iskTrace.restore()`)).join("\n")); };
  process.on("SIGINT", async () => { await restore(); live.close(); process.exit(130); });
  console.log(`tracing ${watches.map((w) => w.spec).join(", ")} for ${seconds} s …`);
  for (let t = 0; t < seconds; t += 10) await new Promise((res) => setTimeout(res, Math.min(10, seconds - t) * 1000));
  const res = JSON.parse(await live.evaluate(RESULT));
  await restore();
  live.close();

  const screens = existsSync("web/src/data/screens.json") ? JSON.parse(await Bun.file("web/src/data/screens.json").text()) : {};
  const scr = (id: number) => `${id} ${screens[id]?.names?.[0] ?? "?"}`;
  console.log(`screen: ${scr(res.screen0)} → ${scr(res.screen1)}${res.budgetLeft <= 0 ? "  (stack budget exhausted: later sites uncounted)" : ""}`);
  const db = existsSync(v.db!) ? new Database(v.db!, { readonly: true }) : null;
  const fnAt = db?.query(`select fn, cls, ui from fns where start <= ?1 and end >= ?1 order by end - start limit 1`);
  const accNear = db?.query(`select off, path, kind from acc where attr = ?2 and off <= ?1 and off > ?1 - 400 order by off desc limit 1`);
  const where = (col: number, attr: string) => {
    if (!col) return "(no game frame: a CDP evaluate, e.g. another tool reading the save)";
    const off = col - 1, f = fnAt?.get(off) as any, a = accNear?.get(off, attr) as any;
    return `@${off}${f ? ` ${(f.cls ?? "").replace(/^scripts\./, "")} ${f.fn} ${f.ui ? "UI" : "logic"}` : ""}${a ? ` ≈ access @${a.off} ${attr}${JSON.stringify(JSON.parse(a.path))} ${a.kind}` : ""}`;
  };
  for (const w of res.watches) {
    if (w.error) { console.log(`${w.spec}: ${w.error}`); continue; }
    const attr = parseWatch(w.spec).attr;
    const idx = Object.keys(w.counts).map(Number).sort((a, b) => a - b);
    console.log(`\n${w.spec}: ${idx.length ? idx.map((i) => `[${i}]×${w.counts[i]}`).join(" ") : "no reads"}`);
    for (const [sk, n] of Object.entries(w.sites as Record<string, number>).sort((a, b) => b[1] - a[1])) {
      const [i, col] = sk.split("@");
      console.log(`  [${i}] ×${n}  ${where(+col!, attr)}`);
    }
    for (const i of idx) for (const s of w.stacks[i] ?? [])
      console.log(`  stack [${i}]: ${s.frames.map((f: string) => { const c = +f.split(":").pop()!; return f.includes("Qno2x.js") ? where(c, attr).split(" ≈")[0] : f; }).join("  ←  ")}`);
  }
}
