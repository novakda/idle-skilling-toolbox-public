import { expect, test } from "bun:test";
import { existsSync } from "fs";
import { BUNDLE } from "./game-eval";
import { purpleTargets } from "./realm-purple";
import { traitsOf } from "../web/src/modules/realm/realm";
import realm from "../web/src/data/realm.json";

const SAVE = "data/save.json";
test.skipIf(!existsSync(BUNDLE) || !existsSync(SAVE))("purple targets: a banish of the pick reaches the boss's Purple HP, never a Rainboppo", async () => {
  const r = purpleTargets(await Bun.file(SAVE).json());
  const names = new Set(Object.entries((realm as any).minions).filter(([id]) => traitsOf(id).has(28)).map(([, m]: any) => m.name));
  for (const b of r.rows) {
    expect(b.hp).toBeGreaterThan(0);
    const picks = b.best === "single" ? [b.single] : b.best === "multi" ? b.multi!.targets : [];
    for (const p of picks) expect(names.has(p!.name)).toBe(false);
    if (b.best === "multi") expect(b.multi!.targets.reduce((t: number, x: any) => t + x.exp, 0)).toBeGreaterThanOrEqual(b.hp);
  }
});
