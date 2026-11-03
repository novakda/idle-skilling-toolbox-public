// AFK screens: each scene's init credits away time as (now - LastVisitedZone[K]) * nonActiveZoneGainPercent/100
// and then stamps LastVisitedZone[K] = now. K is read from that code per scene, so the mapping is the game's own.
// Output data/game/screens.json: { K: sceneName[] }. Usage: bun src/derive-screens.ts
import { readFileSync, writeFileSync } from "fs";
import { loadBundle } from "./game-eval";

const ASSETS = "data/game/asar/distBuild/static/game/assets/data";
const sceneName = (n: number) => {
  try {
    const b = readFileSync(`${ASSETS}/scene-${n}.mbs`);
    for (let p = 0; p + 4 < b.length; p++) {
      const l = b.readUInt32BE(p);
      if (l < 3 || l > 60 || p + 4 + l > b.length) continue;
      const t = b.toString("latin1", p + 4, p + 4 + l);
      if (/^[A-Za-z][\w .'-]*$/.test(t)) return t.replace(/\d+(REAL)?$/, "").replace(/^maz/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^mainnn$/, "Main").replace(/^spelz /, "").replace(/^a Realm$/, "Realm");
    }
  } catch {}
  return `scene ${n}`;
};
const src = loadBundle();
const regs = [...src.matchAll(/\w+\["scripts\.(\w+)"\]=/g)].map((m, i, a) => ({ name: m[1]!, start: m.index!, end: a[i + 1]?.index ?? src.length }));
// AwayTimeZone[K] = (RightNowZone[K] - LastVisitedZone[K]) * HaveyouBeenBeforeZone[K], and on most screens also
// * nonActiveZoneGainPercent/100; some (e.g. Spelunking, Construction, Hatchery) credit away time in full.
const screens: Record<number, { names: string[]; reduced: boolean }> = {};
for (const r of regs) {
  const m = r.name.match(/^SceneEvents_(\d+)$/);
  if (!m) continue;
  const seg = src.slice(r.start, r.end);
  for (const x of seg.matchAll(/getGameAttribute\("LastVisitedZone"\)\[(\d+)\]/g)) {
    const k = +x[1]!;
    // The statement that consumes LastVisitedZone[K] for the away credit runs until the next LastVisitedZone write.
    const stmt = seg.slice(x.index!, x.index! + 700);
    if (!new RegExp(`AwayTimeZone|\\[${k}\\]=\\(|HaveyouBeenBeforeZone"\\)\\[${k}\\]`).test(seg.slice(Math.max(0, x.index! - 400), x.index! + 400))) continue;
    const e = (screens[k] ??= { names: [], reduced: false });
    if (/nonActiveZoneGainPercent/.test(stmt.slice(0, 320))) e.reduced = true;
    const n = sceneName(+m[1]!).replace(/^./, (ch) => ch.toUpperCase()); // the game names one scene "fighting"
    if (!e.names.includes(n)) e.names.push(n);
  }
}
writeFileSync("data/game/screens.json", JSON.stringify(screens, null, 1));
writeFileSync("web/src/data/screens.json", JSON.stringify(screens)); // static app data
console.log(`data/game/screens.json: ${Object.keys(screens).length} AFK screens — ` + Object.entries(screens).map(([k, v]) => `${k}:${v.names.join("/")}${v.reduced ? "(30.5%)" : "(full)"}`).join("  "));
