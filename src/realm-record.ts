// Records what happens in the Realm after a Shrine reset, read-only over CDP (same channel as live-save.ts), so the speed-trophy
// model can use real buy timing: how fast summons, levels (hold-to-repeat accelerates) and evolves happen, and the pauses for
// switching to the toolbox and back. Waits for a reset (run seconds [37] drop), then polls every 250 ms and writes one JSON line
// per change to data/realm-recordings/<reset time>.jsonl: barn diffs (summon / level / evolve per slot), kills ([6]) and
// screen switches. Stops at boss 20, after 10 minutes, or on Ctrl-C.
// Usage: bun src/realm-record.ts [--port 9333] [--minutes 10] [--now]  (--now: start recording at once, no reset wait)
import { appendFileSync, mkdirSync } from "fs";
import { parseArgs } from "util";
import { connectLive } from "./live";

const { values } = parseArgs({ options: { port: { type: "string", default: "9333" }, minutes: { type: "string", default: "10" }, now: { type: "boolean" } } });
const live = await connectLive(+values.port!);
await live.read(["RealmStuff"]); // hooks the engine
type Snap = { t: number; run: number; bosses: number; coins: number; scr: number; barn: [string, number, number][] };
const SNAP = `(()=>{const h=window.__iskEngine.gameAttributes.h, r=h.RealmStuff; return JSON.stringify({t:Date.now(), run:+r[37], bosses:+r[6], coins:+r[5], scr:+h.CurrentlyViewedScreen, barn:r[3].map(s=>[String(s[0]),+s[1],+s[3]])})})()`;
const snap = async () => JSON.parse(String(await live.evaluate(SNAP))) as Snap;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let prev = await snap();
if (!values.now) {
  console.log(`waiting for a Shrine reset (run ${prev.run.toFixed(0)} s, ${prev.bosses} bosses now)…`);
  for (;;) { await sleep(250); const s = await snap(); if (s.run < prev.run - 1) { prev = s; break; } prev = s; }
}
mkdirSync("data/realm-recordings", { recursive: true });
const file = `data/realm-recordings/${new Date(prev.t).toISOString().replace(/[:.]/g, "-")}.jsonl`;
const t0 = prev.t, log = (o: object) => appendFileSync(file, JSON.stringify({ ms: Date.now() - t0, ...o }) + "\n");
log({ ev: "start", run: prev.run, bosses: prev.bosses, coins: prev.coins, scr: prev.scr, barn: prev.barn.filter((b) => b[0] !== "none").length });
console.log(`recording → ${file}`);
const stopAt = Date.now() + 60_000 * +values.minutes!;
while (Date.now() < stopAt) {
  await sleep(250);
  let s: Snap;
  try { s = await snap(); } catch { log({ ev: "read-failed" }); continue; }
  if (s.scr !== prev.scr) log({ ev: "screen", from: prev.scr, to: s.scr });
  if (s.bosses !== prev.bosses) log({ ev: "kill", bosses: s.bosses, run: s.run });
  s.barn.forEach((b, i) => {
    const p = prev.barn[i]!;
    if (b[0] === p[0] && b[1] === p[1] && b[2] === p[2]) return;
    const kind = p[0] === "none" ? "summon" : b[0] === "none" ? "gone" : b[0] !== p[0] ? "evolve" : "level";
    log({ ev: kind, slot: i, id: b[0], from: p[1], to: b[1], stage: b[2] });
  });
  prev = s;
  if (s.bosses >= 20) { log({ ev: "stop", why: "boss 20" }); break; }
}
console.log(`done: ${file}`);
process.exit(0);
