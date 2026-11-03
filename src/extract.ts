// Extract the Idle Skilling (Steam/Electron) save from Chromium localStorage → JSON.
// Usage: bun src/extract.ts [--out data/save.json] [--raw data/save.haxe] [--leveldb <dir>]
import { ClassicLevel } from "classic-level";
import { cpSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { parseArgs } from "util";
import { unserialize } from "./haxe";
import { appendAscend, appendHistory } from "./history";

const DEFAULT_LEVELDB = "/mnt/c/Users/<you>/AppData/Roaming/idle-skilling/Local Storage/leveldb";
const SAVE_KEY_SUFFIX = ":mySave";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "data/save.json" },
    raw: { type: "string" },
    leveldb: { type: "string", default: process.env.IDLE_SKILLING_LEVELDB ?? DEFAULT_LEVELDB },
  },
  strict: true,
});

// The running game holds LOCK (read fails with EIO), so read a snapshot copy instead.
const tmp = mkdtempSync("/tmp/idle-skilling-");
try {
  cpSync(values.leveldb!, tmp, { recursive: true, filter: (p) => !p.endsWith("/LOCK") });
  const db = new ClassicLevel<Buffer, Buffer>(tmp, { keyEncoding: "buffer", valueEncoding: "buffer" });
  let raw: string | undefined;
  for await (const [k, v] of db.iterator()) {
    if (!k.toString("latin1").endsWith(SAVE_KEY_SUFFIX)) continue;
    // Chromium localStorage value: 1-byte prefix, 0x01 = Latin-1, 0x00 = UTF-16LE.
    raw = v[0] === 1 ? v.subarray(1).toString("latin1") : v.subarray(1).toString("utf16le");
  }
  await db.close();
  if (!raw) throw new Error(`no key ending in '${SAVE_KEY_SUFFIX}' in ${values.leveldb}`);

  const save = unserialize(raw) as Record<string, unknown>;
  mkdirSync(dirname(values.out!), { recursive: true });
  writeFileSync(values.out!, JSON.stringify(save, null, 2));
  if (values.raw) writeFileSync(values.raw, raw);

  appendHistory(save);
  await appendAscend(save);
  console.log(`${values.out}: ${Object.keys(save).length} top-level keys from ${raw.length} chars`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
