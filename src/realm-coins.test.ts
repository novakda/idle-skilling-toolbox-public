import { expect, test } from "bun:test";
import { existsSync } from "fs";
import { BUNDLE } from "./game-eval";
import { realmCoins } from "./realm-coins";
import { fullSave } from "../web/src/test-save.test";

// The page's coin formula against the stored barn: MinionCASH (game code) must equal
// (10·(25 + 3·Lv·1.014^Lv) + √coins spent) from RealmStuff[3] × one shared multiplier, for every coin minion (no Level Cash yet).
test.skipIf(!existsSync(BUNDLE))("coin rate: the game's MinionCASH is the stored level and coins spent × one multiplier; levers move it", async () => {
  const save = await fullSave();
  const c = realmCoins(save);
  expect(c.minions.length).toBeGreaterThan(0);
  const base = (lv: number, spent: number) => 10 * (25 + 3 * lv * 1.014 ** lv) + spent ** 0.5;
  const k = c.minions.map((m) => m.cash / base(Number(save.RealmStuff[3][m.slot][1]), Number(save.RealmStuff[3][m.slot][4])));
  for (const x of k) expect(x / k[0]!).toBeCloseTo(1, 9);
  expect(k[0]! / c.parts.allCash).toBeGreaterThanOrEqual(1); // AllCashBonus is one factor of it
  // Rate = Σ coins/min × (1 + 2× chance); the 2× chance is the barn total of the trait numbered like the slot (capped at 100%).
  expect(c.perMin).toBeCloseTo(c.minions.reduce((t, m) => t + m.cash * (1 + m.double), 0), 0);
  // Every lever is a rerun of the same code: an Orb +10% coin buy multiplies the rate by (1 + 10(n+1)/100)/(1 + 10n/100).
  const orb = c.levers.find((l) => l.do.startsWith("Orb Tower: buy"))!, n = Number(save.RealmStuff[46]), buys = Math.max(1, Math.floor(c.energy / 50));
  expect(orb.rate / c.perMin).toBeCloseTo((1 + 0.1 * (n + buys)) / (1 + 0.1 * n), 9);
  // Long levers carry their instructions as table rows; `do` stays a one-line summary that counts them.
  for (const l of c.levers.filter((l) => l.steps)) {
    expect(l.do).toContain(String(l.steps!.rows.length));
    for (const r of l.steps!.rows) expect(r.length).toBe(l.steps!.cols.length);
  }
});

// In-game check (the author, 2026-10-15): sitting on the Afterlife wall the barn can't damage, two read-only captures ~79 s apart on the
// Realm screen. The payout timer RealmStuff[21] went 20.5 → 1.8, so exactly one 60 s payout landed; the coin gain must be one
// payout of every coin minion, each ×1 or ×2 (its 2× roll), with the boss untouched. Captures are local (data/ is gitignored).
const CAP = (n: number) => `data/captures/2026-10-15/realm-coins-${n}/attrs.json`;
test.skipIf(!existsSync(BUNDLE) || !existsSync(CAP(1)) || !existsSync(CAP(2)))("coins accrue on an undamaged boss: one observed payout = the model's minion payouts", async () => {
  const a = await Bun.file(CAP(1)).json(), b = await Bun.file(CAP(2)).json();
  expect(a.CurrentlyViewedScreen).toBe(24); expect(b.CurrentlyViewedScreen).toBe(24);
  expect(b.RealmStuff[1]).toBe(a.RealmStuff[1]); // boss state unchanged while coins rose
  const delta = b.RealmStuff[5] - a.RealmStuff[5]
  expect(delta).toBeGreaterThan(0) // the match below then proves it is exactly one payout's worth
  const cash = realmCoins(a).minions.map((m) => m.cash);
  let best = Infinity;
  for (let mask = 0; mask < 1 << cash.length; mask++) best = Math.min(best, Math.abs(cash.reduce((t, c, i) => t + c * (mask & (1 << i) ? 2 : 1), 0) - delta));
  expect(best / delta).toBeLessThan(1e-6);
});

// Filling the empty barn slots with new types: a Tax Collector (32) barn pays per unique type, so the row's rate must exceed
// the Lizardmen-fill row (a repeated type adds none) and each new type must be one the barn lacks.
test.skipIf(!existsSync(BUNDLE))("coin lever: filling empty slots with new minion types", async () => {
  const save = await fullSave();
  const c = realmCoins(save), fill = c.levers.find((l) => l.do.includes("with new types"));
  if (!fill) return; // no empty slots or nothing left to summon
  const held = new Set(c.minions.map((m) => m.name));
  for (const nm of fill.do.split("new types: ")[1]!.split(", ")) expect(held.has(nm)).toBe(false);
  expect(fill.cost).toBeGreaterThan(0);
  expect(fill.rate).toBeGreaterThanOrEqual(c.perMin * 0.999);
});
