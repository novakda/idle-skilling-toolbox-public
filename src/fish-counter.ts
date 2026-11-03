// Count active catches by fish tier, live, to test the fish roll (docs/resource-xp.md): the game rolls r = FishRNG/10 and
// takes large if r < FishChanceLARGE, else medium if r < FishChanceMEDIUM, else small. If MEDIUM is a cutoff (code
// reading) small is 100 − max(M, L)%; if it were a share (the screen) small would be 100 − M − L%.
// A catch = FishOnHook switches from its idle value (100·HookLv, e.g. 600) to a fish number 1-30 (the roll; ~5 s apart live).
// Read-only over CDP (src/live.ts). Usage: bun src/fish-counter.ts [--catches 200] [--port 9333]   — fish actively; Ctrl-C prints early.
import { parseArgs } from "util";
import { connectLive } from "./live";

const { values } = parseArgs({ options: { catches: { type: "string", default: "200" }, port: { type: "string", default: "9333" } } });
const want = +values.catches!;
const live = await connectLive(+values.port!);
await live.read(["FishOnHook"]); // hooks the engine

const READ = `(() => { const h = window.__iskEngine.gameAttributes.h; return JSON.stringify([h.fishingEXP, h.FishOnHook, h.FishRNG, h.FishChanceLARGE, h.FishChanceMEDIUM, h.CurrentlyViewedScreen]) })()`;
const tier = (f: number) => (f >= 25 ? "large" : f >= 15 ? "medium" : "small");
const n = { small: 0, medium: 0, large: 0 }, byRoll = { small: 0, medium: 0, large: 0 };
let prev = 0, L = 0, M = 0, total = 0;

function summary() {
  if (!total) return console.log("\nno catches seen (open the Fishing screen and fish)");
  const pct = (x: number) => `${((100 * x) / total).toFixed(1)}%`;
  console.log(`\n${total} catches · large ${pct(n.large)} · medium ${pct(n.medium)} · small ${pct(n.small)}`);
  console.log(`cutoff model (code): L ${L.toFixed(1)}% M ${Math.max(M - L, 0).toFixed(1)}% S ${(100 - Math.max(M, L)).toFixed(1)}%`);
  console.log(`share model (screen): L ${L.toFixed(1)}% M ${M.toFixed(1)}% S ${(100 - M - L).toFixed(1)}%`);
  console.log(`roll vs fish agree with the cutoff rule on ${total - mismatch}/${total} catches`);
}
let mismatch = 0;
process.on("SIGINT", () => { summary(); live.close(); process.exit(0); });

console.log(`counting catches — fish actively on the Fishing screen; stops after ${want} or Ctrl-C`);
while (total < want) {
  const [, fish, rng, l, m] = JSON.parse((await live.evaluate(READ)) as string) as number[];
  L = l; M = m;
  const isFish = (f: number) => f >= 1 && f <= 30;
  if (isFish(fish) && !isFish(prev)) {
    const t = tier(fish), r = rng / 10, want = r < l ? "large" : r < m ? "medium" : "small";
    n[t]++; byRoll[want]++; total++;
    if (t !== want) mismatch++;
    if (total % 10 === 0) console.log(`${total}: L ${n.large} M ${n.medium} S ${n.small}  (last fish ${fish}, r ${r})`);
  }
  prev = fish;
  await new Promise((r) => setTimeout(r, 50));
}
summary(); live.close(); process.exit(0);
