import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DERIVED, fingerprint } from "./card-fingerprint";
import { writeRealmCombat } from "./realm-combat";

const fields = DERIVED["realm-combat.json"]!.fields;
test("realm-combat fingerprint ignores unrelated keys, tracks Realm ones", () => {
  const s = { RealmStuff: [1], ConstructLV: [2], Money: 5 };
  expect(fingerprint({ ...s, Money: 6 }, fields)).toBe(fingerprint(s, fields));
  expect(fingerprint({ ...s, RealmStuff: [2] }, fields)).not.toBe(fingerprint(s, fields));
});
test("writeRealmCombat skips when the file's fingerprint matches", () => {
  const save = { RealmStuff: [1], Money: 1 }, p = join(mkdtempSync(join(tmpdir(), "rc-")), "rc.json");
  writeFileSync(p, JSON.stringify({ fingerprint: fingerprint(save, fields) }));
  const m = statSync(p).mtimeMs;
  expect(writeRealmCombat({ ...save, Money: 2 }, p)).toBeNull(); // would throw on the bare save if it tried to regenerate
  expect(statSync(p).mtimeMs).toBe(m);
});
