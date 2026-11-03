// Potion discovery odds from the game's brew code (ActorEvents_1174, normal cauldrons):
//   id = max(round(1.9*seed + 2.4*flower - 4 + s*(4 - sqrt(16 - r))), 1),  r = randomInt(1,16), s = ±1 (randomInt(1,2))
// Ingredients from the picker (ActorEvents_1172): seed IDs 1-21 (SeedsOwned), flower IDs 1-24 (flowersOwned); must own > 0.
// Dark-mode cauldrons use a different branch (ids 122-169); not modelled until DarkModeEnabled is unlocked.
// Verified 2026-10-02: per-pair distributions match the infodoc guide's P DISCOVERY grid exactly (its D = flower, E = seed).
// Output data/game/discovery.json. Usage: bun src/derive-discovery.ts
import { readFileSync, writeFileSync } from "fs";
import { DERIVED, fingerprint } from "./card-fingerprint";

const save = JSON.parse(readFileSync("data/save.json", "utf8")) as Record<string, any>;
const potions = JSON.parse(readFileSync("data/game/potions.json", "utf8")).potions as { id: number; name: string; discovered: boolean }[];
const SEEDS = 21, FLOWERS = 24;
// Names from the game's own lists: seed s = Plants[s] (1 = Dirt), flower f = FlowerNames[f] (1 = Weeds).
const lists = JSON.parse(readFileSync("data/game/lists.json", "utf8")) as Record<string, (string | null)[]>;
const title = (x: string | null | undefined) => (x ?? "").toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const seedNames = Array.from({ length: SEEDS + 1 }, (_, i) => title(lists["SceneEvents_35.Plants"]?.[i]));
const flowerNames = Array.from({ length: FLOWERS + 1 }, (_, i) => title(lists["SceneEvents_37.FlowerNames"]?.[i]));

/** Exact outcome distribution for one seed+flower pair: 16 r-values x 2 signs, equally likely. */
export function outcomes(seed: number, flower: number): Map<number, number> {
  const m = new Map<number, number>();
  for (let r = 1; r <= 16; r++)
    for (const sign of [1, -1]) {
      const id = Math.max(Math.round(1.9 * seed + 2.4 * flower - 4 + sign * (4 - Math.sqrt(16 - r))), 1);
      m.set(id, (m.get(id) ?? 0) + 1 / 32);
    }
  return m;
}

const ownSeed = (s: number) => (save.SeedsOwned?.[s] ?? 0) > 0;
const ownFlower = (f: number) => (save.flowersOwned?.[f] ?? 0) > 0;
const best = new Map<number, { seed: number; flower: number; chance: number }>();
for (let s = 1; s <= SEEDS; s++)
  for (let f = 1; f <= FLOWERS; f++) {
    if (!ownSeed(s) || !ownFlower(f)) continue;
    for (const [id, p] of outcomes(s, f)) if (p > (best.get(id)?.chance ?? 0)) best.set(id, { seed: s, flower: f, chance: p });
  }

// Best pair ignoring ownership, so unreachable potions can say what they need. Flower IDs above 24 are
// not pickable in normal mode, so anything beyond the max normal outcome needs dark mode or another source.
const bestAny = new Map<number, { seed: number; flower: number; chance: number }>();
for (let s = 1; s <= SEEDS; s++) for (let f = 1; f <= FLOWERS; f++)
  for (const [id, p] of outcomes(s, f)) if (p > (bestAny.get(id)?.chance ?? 0)) bestAny.set(id, { seed: s, flower: f, chance: p });

const targets = potions.filter((p) => !p.discovered).map((p) => ({ id: p.id, name: p.name, ...(best.get(p.id) ?? { seed: null, flower: null, chance: 0 }), needs: best.has(p.id) ? null : bestAny.get(p.id) ?? null }));
// Icons: sprite sheet 1173 "PotionIngredients", 10 x 9 frames of 42x40; the picker shows seed s as frame s and
// flower f as frame f + 20 (ActorEvents_1172 setCurrentFrame).
const sprite = { url: "/data/game/asar/distBuild/static/game/assets/graphics/1x/sprite-1173-0.png", cols: 10, w: 42, h: 40, seedFrame: 0, flowerFrame: 20 };
writeFileSync("web/src/data/discovery-static.json", JSON.stringify({ sprite, seedNames, flowerNames }));
writeFileSync("data/game/discovery.json", JSON.stringify({ fingerprint: fingerprint(save, DERIVED["game/discovery.json"]!.fields), sprite, seedNames, flowerNames, targets }));
const reach = targets.filter((t) => t.chance > 0);
console.log(`data/game/discovery.json: ${targets.length} undiscovered, ${reach.length} reachable by normal brewing; best chances ${reach.slice(0, 6).map((t) => `#${t.id} ${Math.round(t.chance * 100)}%`).join(", ")}`);
