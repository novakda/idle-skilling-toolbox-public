// Code-derived save-key map: which game script reads/writes each save key.
// Needs the local extracted build (data/game/, gitignored): bun src/code-map.ts --extract
// Writes data/save-map.json ({ group: { key: shape } }) — key names + shapes only, no values.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { execFileSync } from "child_process";
import { parseArgs } from "util";

const ASAR = "/mnt/c/Program Files (x86)/Steam/steamapps/common/Idle Skilling/resources/app.asar";
const GAME = "data/game";
const ASSETS = `${GAME}/asar/distBuild/static/game/assets/data`;
const BUNDLE = `${GAME}/asar/distBuild/static/game/Qno2x.js`;

const { values } = parseArgs({
  options: {
    extract: { type: "boolean", default: false },
    asar: { type: "string", default: process.env.IDLE_SKILLING_ASAR ?? ASAR },
    save: { type: "string", default: "data/save.json" },
    out: { type: "string", default: "data/save-map.json" },
  },
});

if (values.extract) {
  mkdirSync(GAME, { recursive: true });
  execFileSync("bunx", ["@electron/asar", "extract", values.asar!, `${GAME}/asar`], { stdio: "inherit" });
}

/** Each length-prefixed (u32 BE) name-like string in an MBS buffer, with its offset. */
function* mbsNames(b: Buffer, from = 0) {
  for (let p = from; p + 4 < b.length; p++) {
    const len = b.readUInt32BE(p);
    if (len < 2 || len > 60 || p + 4 + len > b.length) continue;
    const s = b.toString("latin1", p + 4, p + 4 + len);
    if (/^[A-Za-z][\w .'-]*$/.test(s)) yield { p, s };
  }
}

/** Actor-type id → name from resources.mbs. Record layout (BE): id u32, flag u8, ptr u32, len u32, name. */
export function readResourceNames(b: Buffer): Map<number, string> {
  const ids = new Map<number, string>();
  for (const { p, s } of mbsNames(b, 9)) {
    const id = b.readUInt32BE(p - 9);
    if (id > 0 && id < 100000) ids.set(id, s);
  }
  return ids;
}

/** Scene id → name: the first name-like string in scene-N.mbs. */
export function readSceneNames(dir: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const f of readdirSync(dir)) {
    const m = f.match(/^scene-(\d+)\.mbs$/);
    const first = m && mbsNames(readFileSync(`${dir}/${f}`)).next().value;
    if (first) out.set(+m[1]!, first.s);
  }
  return out;
}

/** Script classes as [name, start, end) segments of the bundle, split at each `x["scripts.Name"]=` registration. */
// ponytail: a class's constructor sits just before its registration, so it lands in the previous
// segment; constructors rarely touch game attributes. Brace-match per class if that misattributes.
export function scriptSegments(src: string) {
  const regs = [...src.matchAll(/\w+\["scripts\.(\w+)"\]=/g)];
  return regs.map((m, i) => ({ name: m[1]!, start: m.index!, end: regs[i + 1]?.index ?? src.length }));
}

export function label(cls: string, actors: Map<number, string>, scenes: Map<number, string>): string {
  const ae = cls.match(/^ActorEvents_(\d+)$/);
  if (ae) return actors.get(+ae[1]! + 1) ?? cls; // ActorEvents_N belongs to actor type N+1 (528/529 verified)
  const se = cls.match(/^SceneEvents_(\d+)$/);
  if (se) return scenes.has(+se[1]!) ? `scene:${scenes.get(+se[1]!)}` : cls;
  const design = cls.match(/^Design_\d+_\d+_(\w+)$/);
  return design ? design[1]! : cls;
}

if (import.meta.main) {
  const src = readFileSync(BUNDLE, "utf8");
  const actors = readResourceNames(readFileSync(`${ASSETS}/resources.mbs`));
  const scenes = readSceneNames(ASSETS);
  const save = JSON.parse(readFileSync(values.save!, "utf8")) as Record<string, unknown>;

  // key → { group → reference count }
  const refs = new Map<string, Map<string, number>>();
  for (const seg of scriptSegments(src)) {
    const group = label(seg.name, actors, scenes);
    for (const m of src.slice(seg.start, seg.end).matchAll(/[gs]etGameAttribute\("([^"]+)"/g)) {
      const per = refs.get(m[1]!) ?? new Map<string, number>();
      per.set(group, (per.get(group) ?? 0) + 1);
      refs.set(m[1]!, per);
    }
  }

  const shape = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? `array[${v.length}]` : typeof v);
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(save)) {
    // Primary owner = the script that touches the key most; ties go to the first seen.
    const per = refs.get(k);
    const group = per ? [...per].sort((a, b) => b[1] - a[1])[0]![0] : "unreferenced";
    (out[group] ??= {})[k] = shape(v);
  }
  writeFileSync(values.out!, JSON.stringify(out, null, 2));
  const n = Object.keys(save).length, un = Object.keys(out.unreferenced ?? {}).length;
  console.log(`${values.out}: ${n} keys → ${Object.keys(out).length - (un ? 1 : 0)} script groups, ${un} unreferenced`);
  console.log(Object.entries(out).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)
    .slice(0, 25).map(([g, ks]) => `${g}:${Object.keys(ks).length}`).join("  "));
}
