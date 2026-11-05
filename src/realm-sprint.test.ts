import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { BUNDLE, blockHost, loadBundle } from "./game-eval";
import { ge, wrap } from "./realm-combat";
import { afterReset, replayPlan, runTime, SPRINTS, sprintPlans, timeIt } from "./realm-sprint";
import { sammichStart } from "../web/src/modules/realm/realm";
import { sprintRow } from "../web/src/modules/realm/realm-trophies";

// The fight rules the timing rests on: every timer is 0 at scene load, so all minions fire together on the first tick; a tier
// that falls is left on the next tick, before that tick's attacks; overflow is lost; each kill adds a 2.5 s portal fade.
test("speed-run timing: one volley per tier, fades counted", () => {
  const f = (colour: 0 | 1) => ({ period: 20.1, dmg: 1e9, crit: 0, critDmg: 1, multihit: 0, colour });
  const fight = { fighters: [f(1), f(0)], dual: false, lemon: false, redMult: 1, otherMult: 1, laser: 0 };
  const r = runTime(fight, [[1, 1, 0, 0]], 1, Math.random);
  expect(r[0]).toBeCloseTo(3.4 + 20.2 + 2.5, 6); // Orange falls at tick 0 (the Red hit is wasted), Red at the next volley, tick 201
  const two = runTime(fight, [[1, 0, 0, 0], [5, 0, 0, 0]], 2, Math.random);
  expect(two[0]).toBeCloseTo(6, 9); expect(two[1]).toBeCloseTo(8.6, 9); // Red only: dies to the first volley
  expect(runTime(fight, [[1, 1, 1, 0]], 1, Math.random)[0]).toBe(Infinity); // Yellow without Lemonhearted and crits never falls
});

// A Shrine reset keeps only Cooloar-family minions (@6762790), packed to the front, and starts coins at the Icecream Sammich price.
test.skipIf(!existsSync(BUNDLE))("Shrine reset: what it keeps", async () => {
  const save = JSON.parse(readFileSync("data/fixture-save.json", "utf8"));
  save.RealmStuff[3][7] = ["MinionF2", 1, 0, 0, 0, 0, 0];
  const A: Record<string, any> = {};
  for (const [k, v] of Object.entries(save)) A[k] = wrap(v);
  const H = blockHost(loadBundle(), A, { ge });
  expect(afterReset(save, H, A)).toBe(1);
  const rs = A.RealmStuff;
  expect(rs[3][0][0]).toBe("MinionF2"); expect(rs[3].length).toBe(180);
  expect(rs[3].slice(1).every((s: unknown[]) => s[0] === "none")).toBe(true);
  expect(rs[5]).toBeCloseTo(sammichStart(Number(save.RealmStuff[8][10])) > 10 ? sammichStart(Number(save.RealmStuff[8][10])) : 0, -40);
  expect([rs[6], rs[7], rs[37], Object.keys(rs[11].h).length]).toEqual([0, 0, 0, 0]);
  expect(rs[13]).toEqual(save.RealmStuff[13]); // Shrine levels stay
  // The reset code at the cited offsets.
  const b = readFileSync(BUNDLE), at = (o: number, s: string) => expect(b.subarray(o, o + s.length).toString("latin1")).toBe(s);
  at(6762790, 'indexOf("MinionF")'); at(6763826, '[5]=0,10<D._customBlock_MinionInfo("VendingCost",10,17)'); at(6764293, "[11]=new kn");
});

// Each plan, rebuilt from its own rows on the post-reset save: the colours are covered, it fits the coins and the slots, and the
// model's times beat every limit it claims in at least 9 runs in 10.
test.skipIf(!existsSync(BUNDLE) || !existsSync("data/save.json"))("speed trophies: the plans are feasible in the model", async () => {
  const save = await Bun.file("data/save.json").json(), src = loadBundle();
  const plans = sprintPlans(save, src);
  expect(plans.map((p) => p.trophy)).toEqual([25, 27, 29]);
  for (const p of plans.filter((p) => p.found)) {
    const r = replayPlan(save, p.steps, src);
    expect(r.steps).toEqual(p.steps); // the rows rebuild to the same costs
    expect(r.cost).toBeLessThanOrEqual(r.startCoins); expect(p.steps.at(-1)!.left).toBeGreaterThanOrEqual(0);
    expect(p.used).toBeLessThanOrEqual(p.slots);
    const f = r.fight;
    expect(f.fighters.some((m) => m.colour === 0 || f.dual)).toBe(true); // Red
    if (p.bosses >= 5) expect(f.fighters.some((m) => m.colour === 1 || f.dual)).toBe(true); // Orange from Afterlife 5
    if (p.bosses >= 10) expect(f.lemon && f.fighters.some((m) => m.crit > 0)).toBe(true); // Yellow from Afterlife 10: crits + Lemonhearted
    if (p.bosses >= 12) expect(p.energyNeed).toBeGreaterThan(0); // Blue from Afterlife 12: laser shots
    const goals = p.trophy === 29 && p.times.length === 3 ? SPRINTS : SPRINTS.filter((s) => s.trophy === p.trophy);
    const t = timeIt(f, r.hp, goals);
    expect(t.success).toBeGreaterThanOrEqual(0.9);
    for (const x of t.times) expect(x.p90).toBeLessThan(x.limit);
    expect(t.times).toEqual(p.times);
    const row = sprintRow(p);
    expect(row.steps!.rows.length).toBe(p.steps.filter((s) => s.action === 'summon').length); // one row per minion line (099d710)
    expect(row.eta).toStartWith("Model estimate:");
  }
}, 120_000);
