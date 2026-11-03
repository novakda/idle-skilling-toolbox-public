import { readFileSync } from "fs";
import { expect, test } from "bun:test";
import { existsSync } from "fs";
import { BUNDLE, blockHost, haxeMap, loadBundle } from "./game-eval";
import { realmCoins } from "./realm-coins";
import { ge, realmCombat, wrap } from "./realm-combat";
import { realmStats } from "./realm-stats";
import { fullSave } from "../web/src/test-save.test";
import { fresh } from "../web/src/screen-bound";

// The Stats section's numbers against the game's own blocks and the stored save.
// Run on fullSave() (the frozen fixture when present) and on the live data/save.json, which may be on any screen.
test.skipIf(!existsSync(BUNDLE))("realm stats: coin multipliers rebuild MinionCASH; computed values agree with the stored ones", async () => {
  check(await fullSave());
  if (existsSync("data/save.json")) check(await Bun.file("data/save.json").json());
}, 120_000); // runs the game blocks several times on two saves
// One slot's MinionDMG straight from the blocks: realmCombat would also rerun the whole coin planner (~seconds a call).
function minionDmg(save: any, slot: number) {
  const A: Record<string, any> = {}; for (const [k, v] of Object.entries(save)) A[k] = wrap(v);
  A.DNSM = haxeMap(); const H = blockHost(loadBundle(), A, { ge }) as any;
  H._customBlock_MinionInfo("MinionTraitALL", -1, 0);
  return Number(H._customBlock_MinionInfo("MinionDMG", slot, 0));
}
// Heavy calls (realmCoins, realmCombat, which runs realmCoins again) are made once per save and reused.
function check(save: any) {
  const s = realmStats(save), rs = save.RealmStuff, co = realmCoins(save);
  // The AllCashBonus factors multiply to the block's value, and with the MinionCASH factors rebuild every minion's MinionCASH.
  expect(s.allCash.reduce((t, x) => t * x.value, 1) / s.cash[0]!.value).toBeCloseTo(1, 9);
  const k = s.cash.reduce((t, x) => t * x.value, 1);
  for (const m of co.minions) {
    const base = 10 * (25 + 3 * m.level * 1.014 ** m.level) + m.spent ** 0.5;
    expect(m.cash / (base * k * s.levelCash.find((l) => l.slot === m.slot)!.value)).toBeCloseTo(1, 9);
  }
  // Always-current stored values (RealmStuff[11], [24], [3], [22]).
  const byName = (n: string) => [...s.blessingStats, ...s.bonuses, ...s.energy].find((x) => x.name === n)!;
  expect(byName("Top blessing count (Gold Bless reads it)").value).toBe(Math.max(0, ...Object.values(rs[11] as Record<string, number>)));
  expect(byName("Trophies claimed").value).toBe((rs[24] as number[]).filter((v) => v === -9).length);
  expect(byName("Unique minion types (Tax Collector)").value).toBe(new Set((rs[3] as any[][]).filter((x) => x[0] !== "none").map((x) => x[0])).size + Number(rs[11].i ?? 0)); // + Countinion, 1 a pick
  expect(rs[22]).toBeLessThanOrEqual(byName("Daily banishes").value);
  // Boss HP: a kill fills RealmStuff[4] with BossHPtot (@6523694) and hits only land on the current (highest live) tier, so every
  // tier below it is still full. Purple (4) is skipped: its total scales with RealmStuff[2], which moves after the kill.
  const c = realmCombat(save), cur = c.hpNow.reduce((m, h, t) => (h > 0 ? t : m), -1);
  for (let t = 0; t < cur; t++) if (t !== 4 && c.bosses[0]![t]! > 0) expect(c.hpNow[t]! / c.bosses[0]![t]!).toBeCloseTo(1, 9);
  // Damage: one more Bhakti level and one more Orb damage buy move every attacker's MinionDMG by exactly the ratio of
  // the listed Bhakti (1.08^Lv) and ALLDMG rows.
  const bumped = structuredClone(save);
  bumped.RealmStuff[13][1] = Number(rs[13][1]) + 1; bumped.RealmStuff[33] = Number(rs[33] ?? 0) + 1;
  const s2 = realmStats(bumped);
  const dmgRow = (x: typeof s) => x.bonuses.filter((b) => b.name === "Bhakti" || b.name.startsWith("+10% minion damage")).reduce((t, b) => t * b.value, 1);
  const a = c.minions.find((m) => m.dmg > 0);
  if (a) expect(minionDmg(bumped, a.slot) / a.dmg).toBeCloseTo(dmgRow(s2) / dmgRow(s), 9);
  // Barn bonuses: a stacking trait's barn total (MinionTraitALL) is every carrier's MinionTrait summed; an unstackable one
  // counts at most 1 + DoubleStacksZZmax carriers. Carriers = barn slots whose TraitList (own + ancestors) holds the trait.
  for (const b of s.barnTraits) {
    if (b.stacks) expect(b.total).toBeCloseTo(b.sum, 6);
    else expect(b.total).toBeLessThanOrEqual(b.sum * (1 + 1e-9));
  }
  const updog = s.barnTraits.find((b) => b.trait === 66), smol = s.barnTraits.find((b) => b.trait === 56);
  const n = (id: string) => (rs[3] as any[][]).filter((x) => x[0] === id).length;
  if (updog) expect(updog.carriers).toBe(n("MinionD3") + n("MinionD6") + n("MinionD7")); // Lizardman and its evolutions
  if (smol) expect(smol.carriers).toBeGreaterThanOrEqual(n("MinionD1") + n("MinionD3")); // Gobbo, and Lizardman through its parent
  // Gobbos → Lizardmen lever: its rate is realmCoins on the changed barn, and trying it leaves the save as it was.
  expect(co.perMin / c.coins.perMin).toBeCloseTo(1, 12); // an earlier run (in realmCombat) left the save as it was
  if (co.evolveGobbos) {
    const after = structuredClone(save);
    for (const x of after.RealmStuff[3]) if (x[0] === "MinionD1") { x[0] = "MinionD3"; x[1] = Math.max(50, x[1]); x[3] = 2; }
    expect(co.evolveGobbos.rate / realmCoins(after).perMin).toBeCloseTo(1, 9);
  }
  // Orb energy is clamped to the cap only while the Realm screen draws it (screen-bound.ts RealmStuff[26]).
  if (!fresh(save, "RealmStuff[26]")) return;
  expect(rs[26]).toBeLessThanOrEqual(byName("Energy cap").value);
}

// Blessing totals (#2765): picks × base, × Superblesser(+fruit 6) × Bless Updog only for randolist[4] letters; matches the game's BlessingBonus.
test.skipIf(!existsSync(BUNDLE))("realm stats: blessing totals apply Superblesser and Bless Updog to the gated letters only", () => {
  const save = structuredClone(JSON.parse(readFileSync("data/save.json", "utf8")));
  const t = realmStats(save).blessingTotals;
  expect(t.rows.length).toBeGreaterThan(0);
  for (const r of t.rows) expect(r.total).toBeCloseTo(r.expected, 6);
  expect(t.gate).toContain("b"); for (const k of ["a", "i", "n", "o", "u", "v", "z"]) expect(t.gate).not.toContain(k);
  // Made-up edit: 3 more Dime Decisive picks (gated) and 3 more Countinion picks (not gated).
  save.RealmStuff[11].q = 10; save.RealmStuff[11].i = 10; save.RealmStuff[11].v = 5;
  const u = realmStats(save).blessingTotals, q = u.rows.find((r) => r.key === "q")!, i = u.rows.find((r) => r.key === "i")!;
  expect(u.superblesser.mult).toBeCloseTo(1 + (5 * 10 + u.superblesser.fruit6) / 100, 9);
  expect(q.total).toBeCloseTo(10 * 25 * u.superblesser.mult * u.updog.mult, 6);
  expect(i.total).toBe(10);
});
