// Read-only Botany state for the AutoHotkey macros (IdleSkillingHotkeys Hotkeys/Botany.ahk), one JSON line:
// { selectedPot, pots: [{ pot, plant, state, og }], owned: flowersOwned[] }. Pots are 1-based like the game.
// plant = FlowerType[pot] (0 = empty). state: empty | growing | ready, where ready = at least one full growth bar
// (HerbloreAnimationOVERGROWTH >= 1; see botanyGrowth in web/src/botany-calc.ts). Nothing is written to the game.
// Usage: bun src/botany-state.ts [--port 9333]
import { parseArgs } from "util";
import { connectLive } from "./live";

const { values } = parseArgs({ options: { port: { type: "string", default: "9333" } } });
const live = await connectLive(+values.port!);
try {
  const s = (await live.read(["PotsOwned", "PotSelected", "FlowerType", "HerbloreAnimationOVERGROWTH", "flowersOwned", "FlowerTypeSELECTED"])) as Record<string, any>;
  const pots = Array.from({ length: Number(s.PotsOwned) || 14 }, (_, i) => {
    const pot = i + 1, plant = Number(s.FlowerType?.[pot]) || 0, og = Number(s.HerbloreAnimationOVERGROWTH?.[pot]) || 0;
    return { pot, plant, state: plant === 0 ? "empty" : og >= 1 ? "ready" : "growing", og };
  });
  console.log(JSON.stringify({ selectedPot: s.PotSelected, pots, owned: s.flowersOwned ?? [], sel: s.FlowerTypeSELECTED ?? [] }));
} finally {
  live.close();
}
