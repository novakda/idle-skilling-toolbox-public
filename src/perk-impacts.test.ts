import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { BUNDLE, blockHost, loadBundle } from "./game-eval";
import { fightStats, perkImpacts, skillStats } from "./perk-impacts";

// A full save captured on the main fight scene (SceneEvents_9 wrote its stored stats): `cp data/save.json
// data/fixture-fight.json` while fighting. Saves taken in raids/Conquest/asylum hold those scenes' DPS formulas instead.
const FIXTURE = "data/fixture-fight.json";

test.skipIf(!existsSync(BUNDLE) || !existsSync(FIXTURE))("game combat code reproduces the stored fight stats", () => {
  const save = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const s = fightStats()(save);
  for (const k of ["DPS", "CriticalChance", "CriticalDamage", "MonsterHitRequirement", "IdleDmgBonusPercent", "smithingAttackSpeedBoost", "dpsspeed"] as const)
    expect(s[k] / save[k]).toBeCloseTo(1, 2);
  // The 0.2775 regression: D._customBlock_* calls must reach real blocks, not the inert proxy.
  const rewrapped = Object.fromEntries(Object.entries(save).map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? { h: v } : v]));
  expect(typeof (blockHost(loadBundle(), rewrapped) as any)._customBlock_MinionInfo("VendingBonus", 1, 0)).toBe("number");
  // H2O Damage Boost (perk 5) moves DPS by its own formula: (1+.005·water·(L+1))/(1+.005·water·L).
  const L = save.AscentionLevel[5], w = save.waterLV;
  expect(perkImpacts(save).perks[5]!.find((r) => r.output === "DPS")!.change).toBeCloseTo((1 + 0.005 * w * (L + 1)) / (1 + 0.005 * w * L) - 1, 9);
});

test.skipIf(!existsSync(BUNDLE) || !existsSync(FIXTURE))("game skill/kill/cash code reproduces the stored rates; rate perks move them by their formulas", () => {
  const save = JSON.parse(readFileSync(FIXTURE, "utf8")), lv = save.AscentionLevel as number[];
  const f = fightStats()(save), k = skillStats()(save);
  expect(f.BonusKillperKill / save.BonusKillperKill).toBeCloseTo(1, 9);
  expect(k.BonusOresCUMULATIVEpercent / save.BonusOresCUMULATIVEpercent).toBeCloseTo(1, 9); // with the Mining-linked deck's cards
  expect(k.FishGiven / save.FishGiven).toBeCloseTo(1, 9);
  // Zone listener: defaultgold from SmithingBonusCash exactly. SmithingBonusCash exactly too, once PbonusCashSUM is the scene
  // init's (#32: the stored one was rewritten by a click with PbonusCash4 read as a percent, ×1.0100 on this fixture).
  expect((f.defaultgold / f.SmithingBonusCash) / (save.defaultgold / save.SmithingBonusCash)).toBeCloseTo(1, 9);
  expect(f.SmithingBonusCash / save.SmithingBonusCash).toBeCloseTo(1, 12);
  // The stored PbonusCashSUM is the click handler's form (@31888509), not the init's.
  expect([1, 2, 3, 4].reduce((p, i) => p * (1 + save[`PbonusCash${i}`] / 100), 100) - 100).toBeCloseTo(save.PbonusCashSUM, 6);
  const r = perkImpacts(save).perks, ch = (i: number, o: string) => r[i]?.find((x) => x.output === o)?.change;
  const L = (i: number) => lv[i] ?? 0, eu2 = save.EventUpgradeLevels[2];
  expect(ch(65, "away kills/h")).toBeCloseTo((1 + (10 * (L(65) + 1) + 0.5 * eu2) / 100) / (1 + (10 * L(65) + 0.5 * eu2) / 100) - 1, 9);
  expect(ch(10, "away cash/h")).toBeCloseTo((1 + 0.5 * (L(10) + 1)) / (1 + 0.5 * L(10)) - 1, 9);
  expect(ch(38, "ores mined")).toBeCloseTo((1 + 0.1 * (L(38) + 1)) / (1 + 0.1 * L(38)) - 1, 9);
  expect(ch(38, "fish per catch")).toBeCloseTo((1 + 0.1 * (L(38) + 1)) / (1 + 0.1 * L(38)) - 1, 9);
  const xp = (a: number, b: number) => 1 + (a + 3 * b) / 100;
  expect(ch(37, "smithing EXP/craft")).toBeCloseTo(xp(L(33), L(37) + 1) / xp(L(33), L(37)) - 1, 9);
});
