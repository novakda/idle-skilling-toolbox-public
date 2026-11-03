// Write data/save.json straight from the running game (CDP, read-only) — same shape as src/extract.ts.
// Exits 2 when the game isn't reachable, so callers can fall back to the on-disk save.
// Usage: bun src/live-save.ts [--port 9333] [--out data/save.json]; --check: only print which screen-bound values (web/src/
// screen-bound.ts) are stale in --out, no game needed.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { connectLive } from "./live";
import { appendAscend, appendHistory } from "./history";

const { values } = parseArgs({ options: { port: { type: "string", default: "9333" }, out: { type: "string", default: "data/save.json" }, check: { type: "boolean" } } });

/** One line: the screen the save was taken on and the registry values stale in it (Mastery and Spiriting judged by their models). */
async function staleLine(save: Record<string, any>) {
  const [{ staleKeys }, { masteryBonuses }, { withSpirit }, { withDeckLinks }, screens] = await Promise.all([import("../web/src/screen-bound"),
    import("../web/src/load-bonuses"), import("../web/src/spiriting"), import("../web/src/cards-calc"), import("../web/src/data/screens.json")]);
  const sp = withSpirit(withDeckLinks(save)), scene = ["SpiritChance", "CultistEventBonusPercent", "CultistSoulBonusPercent", "AcolyteSoulBonusPercent"];
  const stale = staleKeys(save, { MasteryBonuses: masteryBonuses(save), ...Object.fromEntries(scene.map((k) => [k, sp[k]])) });
  const id = save.CurrentlyViewedScreen, name = (screens.default as Record<string, { names: string[] }>)[id]?.names[0] ?? "?";
  return `taken on screen ${id} (${name}); stale: ${stale.join(", ") || "none"}`;
}
if (values.check) { console.log(`${values.out}: ${await staleLine(JSON.parse(readFileSync(values.out!, "utf8")))}`); process.exit(0); }

let live;
try { live = await connectLive(+values.port!); }
catch { console.error(`game not reachable on port ${values.port}`); process.exit(2); }
try {
  // The engine's attribute table is the save; take every key it holds.
  const keys = JSON.parse(await live.evaluate("JSON.stringify(Object.keys(window.__iskEngine ? window.__iskEngine.gameAttributes.h : {}))") as string) as string[];
  const names = keys.length ? keys : existsSync(values.out!) ? Object.keys(JSON.parse(readFileSync(values.out!, "utf8"))) : [];
  const save = await live.read(names.length ? names : ["CardLevels"]);
  // read() hooks the engine first, so a cold start returns only the probe key; re-read with the real key list.
  const full = Object.keys(save).length > 1 ? save : await live.read(JSON.parse(await live.evaluate("JSON.stringify(Object.keys(window.__iskEngine.gameAttributes.h))") as string));
  writeFileSync(values.out!, JSON.stringify(full, null, 2));
  appendHistory(full);
  await appendAscend(full);
  // Perk impacts from the game's combat code (#6) for the Perks tab; skipped where the extracted bundle is absent.
  try { (await import("./perk-impacts")).writePerkImpacts(full); }
  catch (e) { console.error(`data/perk-impacts.json not refreshed: ${(e as Error).message}`); }
  // Realm numbers are recalculated on demand (Realm page "Recalc"); only bootstrap a missing file.
  try { if (!existsSync("data/realm-combat.json")) (await import("./realm-combat")).writeRealmCombat(full); }
  catch (e) { console.error(`data/realm-combat.json not refreshed: ${(e as Error).message}`); }
  console.log(`${values.out}: ${Object.keys(full).length} keys live from the running game`);
  try { console.log(await staleLine(full)); } catch (e) { console.error(`stale check failed: ${(e as Error).message}`); }
} finally { live.close(); }
