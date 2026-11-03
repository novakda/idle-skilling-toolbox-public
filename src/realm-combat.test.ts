import { expect, test } from "bun:test";
import { existsSync } from "fs";
import { BUNDLE } from "./game-eval";
import { realmCombat } from "./realm-combat";
import { stageTable, tierDps } from "../web/src/realm";

const CAPTURE = "data/captures/2026-10-05/realm/attrs.json"; // live attributes at 10:22 (gitignored), Afterlife 14, yellow bar 811K/841K

test.skipIf(!existsSync(BUNDLE) || !existsSync(CAPTURE))("game-code combat reproduces the boss bar and its observed fall", async () => {
  const c = realmCombat(await Bun.file(CAPTURE).json());
  // BossHPtot(13, tier) is what the game stored in RealmStuff[4] when boss 13 died (Red, Orange untouched; Yellow max = bar's 841K).
  expect(c.bosses[0]![0]).toBeCloseTo(c.hpNow[0]!, 3);
  expect(c.bosses[0]![1]).toBeCloseTo(c.hpNow[1]!, 3);
  expect(Math.round(c.bosses[0]![2]! / 1e3)).toBe(842);
  // Observed: Yellow 811,751 (10:22:25) → 666,942 (10:32:57) = 229 DPS. Crits are 25% coin flips on 4 Hippos every ~18 s, so
  // 10 minutes carries ~±20% noise; the model (186.8) must sit within 35%.
  const model = tierDps(c, 2), observed = (811751 - 666942) / (632);
  expect(Math.abs(model / observed - 1)).toBeLessThan(0.35);
  const rows = stageTable(c, 23);
  expect(rows[0]!.afterlife).toBe(14);
  expect(rows.at(-1)!.blocker).toContain("Rainboppo");
});
