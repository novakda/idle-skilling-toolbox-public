// Static card catalog for the distributable app: every card's own contribution at every level, from the game's
// CalculateCardBonusTotals with CardBonusTOTAL = 1 and PotionLV[165] = PotionLV[166] = 0 (their power transforms are
// applied to totals by cbonus() in web/src/cards-calc.ts). The card calc reads only CardLevels,
// CardBonusTOTAL and PotionLV (instrumented 2026-10-02), and CardBonusTOTAL scales card contributions linearly
// (x2 -> x2.000, x1.37 -> x1.370), so in the browser: adds = catalog[id].levels[lv] * save.CardBonusTOTAL, except the keys
// a card lists in `unscaled` (measured here at CardBonusTOTAL 2: e.g. the equipped ApoDoublePotionChance branch adds the
// raw value).
// KillPct / Tunnels are post-scaled by PotionLV[166] in the game; those keys are flagged, not baked.
// Output web/src/data/card-catalog.json (app data, no game code). Usage: bun src/derive-card-catalog.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { blockHost, loadBundle } from "./game-eval";

const save = JSON.parse(readFileSync("data/save.json", "utf8")) as Record<string, any>;
const src = loadBundle();
const cards = JSON.parse(readFileSync("data/game/cards.json", "utf8")) as { cards: any[]; tabLabels: Record<string, string>; upgradeCost: unknown; swapRates: unknown };
const CB = Object.keys(save).filter((k) => k.startsWith("Cbonus"));
const MAX = 6; // level 6 exists behind aa15
const POST_SCALED = ["KillPct", "Tunnels"];

function run(holders: number[], levels: Record<number, number>, total = 1) {
  const a: Record<string, any> = structuredClone(save);
  for (const k of CB) a[k] = Array.isArray(a[k]) ? a[k].map(() => 0) : 0;
  a.CardBonusTOTAL = total;
  a.PotionLV = [...a.PotionLV]; a.PotionLV[165] = 0; a.PotionLV[166] = 0;
  a.CardLevels = [...a.CardLevels]; for (const [id, lv] of Object.entries(levels)) a.CardLevels[+id] = lv;
  (blockHost(src, a) as any)._customBlock_CalculateCardBonusTotals(holders);
  return a;
}
const empty = Array(10).fill(0);
// Passive cards (card-globals.json) count through their Cbonus whether equipped or not; their map value is not an equipped add.
const passive = new Set<number>(existsSync("web/src/data/card-globals.json") ? JSON.parse(readFileSync("web/src/data/card-globals.json", "utf8")).passives.map((p: any) => p.card) : []);
const t0 = Date.now();
const mapOnly = new Set<string>();
const catalog = cards.cards.map((c, i) => {
  const levels: Record<number, Record<string, number>> = {};
  for (let lv = 1; lv <= MAX; lv++) {
    // The baseline (empty deck) runs at the same card level: the calc's passive tail adds a passive card's value whether
    // or not it is equipped, so a save-level baseline would count the passive's level change as the card's deck value.
    const a = run([c.id, ...empty.slice(1)], { [c.id]: lv }), base = run(empty, { [c.id]: lv });
    const adds: Record<string, number> = {};
    for (const k of CB) { const d = (a[k] as number) - (base[k] as number); if (typeof a[k] === "number" && Math.abs(d) > 1e-9) adds[k.slice(6)] = +d.toPrecision(12); }
    // Crop cards (CropsGained) have no Cbonus: Tilling yield reads CardLevels directly, x(1 + k*lv/100) for the plot's crop,
    // unscaled by CardBonusTOTAL. k*lv is the card map's own value.
    if (c.type === "CropsGained") {
      const v = Number(((blockHost(src, base) as any)._customBlock_GetAllCardBonusesMap().h ?? {})[c.id]?.h?.Value ?? 0);
      if (v) adds[`${c.name} crop %`] = v;
    }
    // Spelunking-page cards (SpelunkerSpeed, TunnelCardChance, LearnSpeed, ...) have no Cbonus: only the card map holds {Type, Value},
    // read by the Spelunking scenes, unscaled by CardBonusTOTAL (same Value at 1 and 2, measured 2026-10-21). #2623
    if (!Object.keys(adds).length && !passive.has(c.id)) {
      const e = ((blockHost(src, base) as any)._customBlock_GetAllCardBonusesMap().h ?? {})[c.id]?.h;
      if (e && e.Type !== "Nothing" && Number(e.Value) > 0) { adds[e.Type] = Number(e.Value); mapOnly.add(e.Type); }
    }
    levels[lv] = adds;
  }
  // Keys the equipped branch adds unscaled: same value at CardBonusTOTAL 2 as at 1 (anything else must be exactly x2).
  const mapKeys = new Set(Object.keys(levels[MAX]!).filter((k) => mapOnly.has(k)));
  mapOnly.clear();
  const at2 = run([c.id, ...empty.slice(1)], { [c.id]: MAX }, 2), base2 = run(empty, { [c.id]: MAX }, 2), unscaled: string[] = [];
  unscaled.push(...mapKeys);
  for (const [k, v] of Object.entries(levels[MAX]!)) {
    if (mapKeys.has(k) || !(`Cbonus${k}` in at2)) continue; // crop % keys and map-only keys
    const d2 = (at2[`Cbonus${k}`] as number) - (base2[`Cbonus${k}`] as number);
    if (Math.abs(d2 - v) <= 1e-9 * Math.max(1, Math.abs(v))) unscaled.push(k);
    else if (Math.abs(d2 - 2 * v) > 1e-9 * Math.max(1, Math.abs(v))) throw new Error(`card ${c.id} ${k}: ${v} at CardBonusTOTAL 1, ${d2} at 2`);
  }
  if (i % 50 === 0) console.log(`  ${i}/${cards.cards.length} cards (${Math.round((Date.now() - t0) / 1000)}s)`);
  const { id, name, page, tab, row, col, zone, type, base: baseValue } = c;
  return { id, name, page, tab, row, col, zone, type, base: baseValue, levels, ...(unscaled.length ? { unscaled } : {}) };
});

writeFileSync("web/src/data/card-catalog.json", JSON.stringify({ postScaled: POST_SCALED, tabLabels: cards.tabLabels, upgradeCost: cards.upgradeCost, swapRates: cards.swapRates, cards: catalog }));
console.log(`web/src/data/card-catalog.json: ${catalog.length} cards x ${MAX} levels in ${Math.round((Date.now() - t0) / 1000)}s`);
