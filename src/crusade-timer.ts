// Time crusade runs live: seconds per run for the Cards tab's crusade farm time (#10).
// Read-only over CDP (see src/live.ts). A run ends when `crusadebosskilled` goes 0 → 1 (stage-5 boss dead,
// same tick as the CrusadeDropsz card roll); the gap between two of those is one full run, restart included.
// Polls every 100 ms; runs are ~3 s, so a 1 s poll misses whole stages (measured 2026-10-03).
// Usage: bun src/crusade-timer.ts [--runs 10] [--port 9333]   — play crusades; Ctrl-C prints the summary early.
import { parseArgs } from "util";
import { connectLive } from "./live";

const { values } = parseArgs({ options: { runs: { type: "string", default: "10" }, port: { type: "string", default: "9333" } } });
const want = +values.runs!;
const live = await connectLive(+values.port!);
await live.read(["crusadebosskilled"]); // hooks the engine

const READ = `(() => { const h = window.__iskEngine.gameAttributes.h; return JSON.stringify([h.crusadebosskilled, h.Energy, h.ConquestSelected]) })()`;
const kills: number[] = [];
let prev: number | undefined, energy0: number | undefined, energy = 0, conquest: unknown;

function summary() {
  const gaps = kills.slice(1).map((t, i) => (t - kills[i]) / 1000);
  if (!gaps.length) return console.log("\nno complete run timed (need two boss kills)");
  const sorted = [...gaps].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  console.log(`\n${gaps.length} runs · average ${avg.toFixed(2)} s · median ${med.toFixed(2)} s · range ${sorted[0].toFixed(2)}–${sorted.at(-1)!.toFixed(2)} s`);
  if (energy0 !== undefined) console.log(`energy ${energy0} → ${energy} (${((energy0 - energy) / gaps.length).toFixed(2)} per run)`);
  console.log(`enter ${med.toFixed(1)} as seconds per run on the Cards tab (median: one slow restart doesn't skew it)`);
}
process.on("SIGINT", () => { summary(); live.close(); process.exit(0); });

console.log(`timing crusade runs (conquest ${conquest ?? "?"}) — play; stops after ${want} runs or Ctrl-C`);
while (kills.length <= want) {
  const [boss, e, c] = JSON.parse(await live.evaluate(READ) as string) as [number, number, unknown];
  energy = e; conquest = c; energy0 ??= e;
  if (prev === 0 && boss === 1) {
    kills.push(Date.now());
    if (kills.length > 1) console.log(`run ${kills.length - 1}: ${((kills.at(-1)! - kills.at(-2)!) / 1000).toFixed(2)} s  (conquest ${c}, energy ${e.toFixed(1)})`);
  }
  prev = boss;
  await new Promise((r) => setTimeout(r, 100));
}
summary(); live.close(); process.exit(0);
