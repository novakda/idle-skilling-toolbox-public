// Which card bonuses each deck link's activity actually reads: every getGameAttribute("Cbonus…") inside the
// scripts of the scenes that link equips for (scene ids per link read from each scene's init — see derive-sources).
// Output data/game/activity-bonuses.json: { link: { bonusKey: readCount } }. Usage: bun src/derive-activity-bonuses.ts
import { readFileSync, writeFileSync } from "fs";
import { loadBundle } from "./game-eval";

const ASSETS = "data/game/asar/distBuild/static/game/assets/data";
const src = loadBundle();
const sceneName = (n: number) => {
  try {
    const b = readFileSync(`${ASSETS}/scene-${n}.mbs`);
    for (let p = 0; p + 4 < b.length; p++) {
      const l = b.readUInt32BE(p);
      if (l < 3 || l > 60 || p + 4 + l > b.length) continue;
      const t = b.toString("latin1", p + 4, p + 4 + l);
      if (/^[A-Za-z][\w .'-]*$/.test(t)) return t;
    }
  } catch {}
  return null;
};
const regs = [...src.matchAll(/\w+\["scripts\.(\w+)"\]=/g)].map((m, i, a) => ({ name: m[1]!, start: m.index!, end: a[i + 1]?.index ?? src.length }));

const out: Record<number, Record<string, number>> = {};
for (const r of regs) {
  const m = r.name.match(/^SceneEvents_(\d+)$/);
  if (!m) continue;
  const seg = src.slice(r.start, r.end);
  // The scene's link id: the constant it compares DeckLinkList against when equipping a deck.
  const link = seg.match(/getGameAttribute\("DeckLinkList"\)\[a\+1\];if\((\d+)==/)?.[1];
  if (!link) continue;
  for (const x of seg.matchAll(/getGameAttribute\("Cbonus(\w+)"\)/g)) {
    const o = (out[+link] ??= {});
    o[x[1]!] = (o[x[1]!] ?? 0) + 1;
  }
  console.log(`link ${link.padStart(2)} ← ${sceneName(+m[1]!)}`);
}
writeFileSync("data/game/activity-bonuses.json", JSON.stringify(out, null, 1));
// Static app data for the distributable build (save-independent).
writeFileSync("web/src/data/activity-bonuses.json", JSON.stringify(out, null, 1));
console.log(`data/game/activity-bonuses.json: ${Object.keys(out).length} links; link 7 reads ${JSON.stringify(out[7])}`);
