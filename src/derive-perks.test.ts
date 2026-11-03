import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { BUNDLE } from "./game-eval";
import { derivePerks, gameNames, simulator } from "./derive-perks";

// Kyromyr's sheet values (data/guides/kyromyr-notes/*-perk-cost.json): [perk, level, cost of level→level+1].
const SHEET: [number, number, number][] = [
  [1, 0, 1], [1, 2, 2.016666667], [2, 0, 17], [12, 2, 278.4375], [24, 2, 608], [32, 1, 350000],
  [33, 0, 10], [33, 2, 2.666666667], [36, 1, 10], [65, 2, 8],
];

test.skipIf(!existsSync(BUNDLE))("perk costs come from the game's buy button and match Kyromyr", () => {
  const buy = simulator({});
  for (const [i, L, c] of SHEET) {
    let spent: number | null = null;
    for (let w = 1; spent === null; w *= 10) spent = buy(i, L, w);
    expect(spent).toBeCloseTo(c, 5);
  }
  // Hard caps in code: Skilltree Overcharge 5, Counterfeit Tickets 20, Skull Crusher 40 (sheet says 50), one-shot contracts 1.
  expect(buy(12, 5, Number.MAX_VALUE)).toBeNull();
  expect(buy(17, 19, Number.MAX_VALUE)).not.toBeNull();
  expect(buy(17, 20, Number.MAX_VALUE)).toBeNull();
  expect(buy(65, 40, Number.MAX_VALUE)).toBeNull();
  expect(buy(43, 1, Number.MAX_VALUE)).toBeNull();
});

test.skipIf(!existsSync(BUNDLE) || !existsSync("data/save.json"))("every saved AscentionLevel is within its derived max", () => {
  const save = JSON.parse(readFileSync("data/save.json", "utf8"));
  const perks = derivePerks(save);
  expect(perks).toHaveLength(68);
  for (const p of perks) expect(save.AscentionLevel[p.i] ?? 0).toBeLessThanOrEqual(p.max);
}, 60_000);

// Names are the game's own perk-panel titles, keyed by AscentionLevel index (gameNames, Qno2x.js @11312981-@12384357).
test.skipIf(!existsSync(BUNDLE))("perk names: the app's table matches the game's title draw at every AscentionLevel index", async () => {
  const names = gameNames();
  // Pins: the BP_LOCKS gate of All Star (@12533322) reads AscentionLevel[41] and [52]; 12 is the AP perk All Star raises.
  expect(names.get(12)).toBe("SKILLTREE_OVERCHARGE");
  expect(names.get(41)).toBe("EXTRA_H20_TOKENS");
  expect(names.get(52)).toBe("CONTRACT_SHOP_5");
  expect(names.get(62)).toBe("DERELICT_WARCRY");
  expect(names.get(63)).toBe("ALL_STAR");
  const web = (await import("../web/src/data/perks.json")).default as { i: number; name: string | null }[];
  for (const p of web) expect(p.name && squashed(p.name), `perk ${p.i}`).toBe(squashed(names.get(p.i) ?? "?"));
});
const squashed = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]/g, "");
