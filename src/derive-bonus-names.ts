// Card bonus display text from the game's own _TypeDescriptionMap (Qno2x.js @22276784: SkillPoints → "%_PERK_POINTS_GAINED"),
// keyed by both the card type and the bonus key a card's levels add (which can differ, e.g. MaxBotanySpdLV → MAXlBotanySpdUpgrades).
// Output web/src/data/bonus-names.json: key → "% perk points gained". Usage: bun src/derive-bonus-names.ts
import { readFileSync, writeFileSync } from "fs";

const src = readFileSync("data/game/asar/distBuild/static/game/Qno2x.js", "utf8");
const re = /_TypeDescriptionMap;null!=e\.(\w+)\?\w+\.setReserved\("\1","([^"]*)"\)/g;
const byType = new Map<string, string>();
for (let x; (x = re.exec(src)); ) byType.set(x[1]!, x[2]!);
const clean = (t: string) => t.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/^% /, "%");
const cat = JSON.parse(readFileSync("web/src/data/card-catalog.json", "utf8"));
const cards = (cat.cards ?? Object.values(cat).find(Array.isArray)) as { type: string; levels: Record<string, Record<string, number>> }[];
const out: Record<string, string> = {};
for (const [t, d] of byType) out[t] = clean(d);
for (const c of cards) for (const k of Object.keys(c.levels?.["1"] ?? {})) if (!out[k] && byType.has(c.type)) out[k] = clean(byType.get(c.type)!);
// Crop cards ("Macromato crop %") use CropsGained's template "%_CROPS_FOR_EVERY…", which the card screen completes; name the crop.
for (const k of Object.keys(out)) if (k.endsWith(" crop %")) out[k] = `%${k.slice(0, -7)} crops`;
if (Object.keys(out).length < 100) throw new Error(`only ${Object.keys(out).length} names: the game map moved`);
writeFileSync("web/src/data/bonus-names.json", JSON.stringify(out));
console.log(`${Object.keys(out).length} bonus names`);
