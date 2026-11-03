// Cards from the game's own code: catalog, what each owned card adds at its level, and the equipped deck.
// Save-dependent derived data → data/game/cards.json (gitignored). Usage: bun src/derive-cards.ts
import { readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { blockHost, loadBundle } from "./game-eval";
import { cardFingerprint } from "./card-fingerprint";

const { values } = parseArgs({ options: { save: { type: "string", default: "data/save.json" } } });
const save = JSON.parse(readFileSync(values.save!, "utf8")) as Record<string, any>;
const src = loadBundle();
const lists = JSON.parse(readFileSync("data/game/lists.json", "utf8")) as Record<string, unknown[]>;
const NAMES = lists["SceneEvents_3.Names"] as (string | null)[];
if (!NAMES) throw new Error("card names list missing — run bun src/derive-lists.ts");

const CBONUS = Object.keys(save).filter((k) => k.startsWith("Cbonus"));
const zeroed = () => {
  const a = structuredClone(save);
  for (const k of CBONUS) a[k] = Array.isArray(a[k]) ? a[k].map(() => 0) : 0;
  return a;
};
const near = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b);

/** Run CalculateCardBonusTotals with `holders` equipped (optionally overriding card levels); returns the Cbonus attrs it produced plus the card map. */
function run(holders: number[], levelOverride?: Record<number, number>) {
  const attrs = zeroed();
  if (levelOverride) { attrs.CardLevels = [...attrs.CardLevels]; for (const [id, lv] of Object.entries(levelOverride)) attrs.CardLevels[+id] = lv; }
  const host: any = blockHost(src, attrs);
  host._customBlock_CalculateCardBonusTotals(holders);
  return { attrs, map: host._CardBonusesALL.h as Record<string, { h: { Type: string; Value: number } }> };
}

// Receipt: the real deck must reproduce every Cbonus value stored in the save.
const real = run(save.CardHolderWhichCard);
// Keys also written by non-card scripts can legitimately differ: ShieldChargePCT is hard-set to 0.5 by a fight actor (ActorEvents_342).
const EXTERNAL = new Set(["CbonusShieldChargePCT"]);
const bad = CBONUS.filter((k) => !EXTERNAL.has(k) && !near(real.attrs[k], save[k]));
if (bad.length) throw new Error(`card calc mismatch on ${bad.length}/${CBONUS.length}: ${bad.slice(0, 5).join(", ")}`);

const title = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const levels = save.CardLevels as number[];
// Decks are 10 slots: the game reads deck d as CardEquipped[10*(d-1) + n]. DeckLinkList[d] is the activity
// a deck is linked to; each scene equips the deck carrying its link id (ids read from the scenes' init code).
const SLOTS = 10;
const LINKS: Record<number, string> = { 1: "Training", 2: "Tilling", 3: "Botany", 4: "Potions", 5: "Crusades", 6: "Mining",
  7: "Smithing / Fishing", 8: "Limbo", 9: "All Combat", 10: "Boss Looting", 11: "Trek / Hatchery / Lab", 12: "Spelunking" };
const equipped = save.CardEquipped as number[];
const decks = Array.from({ length: save.CardDecksOWNED as number }, (_, i) => {
  const d = i + 1, link = (save.DeckLinkList as number[])[d] ?? 0;
  return { deck: d, link, linkName: LINKS[link] ?? null, active: d === save.CardDeckSelected, cards: equipped.slice(SLOTS * i, SLOTS * d) };
});
const holders = decks.find((d) => d.active)?.cards ?? [];
if (JSON.stringify(holders) !== JSON.stringify((save.CardHolderWhichCard as number[]).slice(0, SLOTS)))
  throw new Error("active deck does not match CardHolderWhichCard — deck layout assumption broke");
const empty = holders.map(() => 0);
// The calc also adds bonuses from non-card sources; an empty deck isolates them so cards show only their own part.
const baseline = run(empty).attrs;

// Drop zone per card name, from the wiki card pages (rows carry Zone + Name).
const wiki = JSON.parse(readFileSync("data/wiki/datasets/cards.json", "utf8"));
const zoneOf = new Map<string, string>();
const wikiMax = new Map<string, number>(); // the wiki's max-level bonus column, for the level-cap check
for (const r of (Array.isArray(wiki) ? wiki : wiki.rows) as Record<string, string>[])
{
  if (r.Name && r.Zone) zoneOf.set(r.Name.toLowerCase(), r.Zone);
  const mx = parseFloat(String(r.col6 ?? ""));
  if (r.Name && isFinite(mx)) wikiMax.set(r.Name.toLowerCase(), mx);
}

// Cards cap at level ${MAX_LEVEL}: bonuses explode past it in the game's formula, and the wiki's "max" column equals
// the level-5 value (checked below across every card the wiki lists).
const MAX_LEVEL = 5;
const soloAdds = (n: number, lv: number) => {
  // Baseline at the same level: passive cards count in the calc's tail whether equipped or not (see derive-card-catalog).
  const { attrs } = run([n, ...empty.slice(1)], { [n]: lv }), base = run(empty, { [n]: lv }).attrs;
  const out: Record<string, number> = {};
  for (const k of CBONUS) {
    const d = (attrs[k] as number) - (base[k] as number);
    if (typeof attrs[k] === "number" && Math.abs(d) > 1e-9) out[k.slice(6)] = +d.toPrecision(12);
  }
  return out;
};

// Where the card screen shows a card: slot + 1 + 60*(tab-1) + Qcard, tabs 1-6. Qcard toggles 0/360 = the main tab set
// vs the skull tab set. Tabs 1-3 of a set hold main zones (two per tab); tabs 4-6 are crusades/specials/skills.
// The visual grid has gaps, so slot is a position in the 60-card range, not an on-screen cell.
// The grid is 15 columns x 4 rows; ids with no card leave gaps (checked cell-for-cell against a screenshot of Main tab 6).
// Crop cards (Type CropsGained, ids 301-320) have no Cbonus: equipping one sets CropCardsEquipped[id-300], and each
// plot growing crop id-300 yields x(1 + value/100) (Tilling yield code, ~"CropCardsEquipped"),PlantType). Keyed per crop.
const cropAdds = (n: number, lv: number) => {
  const v = Number(run([], { [n]: lv }).map[n]?.h.Value ?? 0);
  return v ? { [`${title(NAMES[n])} crop %`]: v } : {};
};
const planted = [...new Set((save.PlantType as number[]).slice(1).filter((t) => t > 0))].map((t) => title(NAMES[300 + t]));

const where = (id: number) => { const page = id > 360 ? 2 : 1, i = id - 1 - (page - 1) * 360, slot = i % 60; return { page, tab: Math.floor(i / 60) + 1, row: Math.floor(slot / 15) + 1, col: (slot % 15) + 1 }; };

const cards = Object.entries(real.map).map(([id, v]) => {
  const n = +id, level = levels[n] ?? -1;
  let adds: Record<string, number> = {};
  // ponytail: solo contribution; a few bonuses (KillPct, Tunnels) are post-scaled by PotionLV, so
  // solo numbers are exact per card but not strictly additive across a deck.
  const solo = v.h.Type === "CropsGained" ? cropAdds : soloAdds;
  if (level >= 1) adds = solo(n, level);
  const next = level >= 1 && level < MAX_LEVEL ? solo(n, level + 1) : null;
  const max = level >= 1 ? solo(n, MAX_LEVEL) : {}; // only owned cards show max-level value
  const name = title(NAMES[n]);
  // Level -1 = not shown in the game (unreleased); 0 = shown as "?" (not found yet).
  return { id: n, name, ...where(n), hidden: level < 0, zone: zoneOf.get(name.toLowerCase()) ?? null, type: v.h.Type, base: v.h.Value, level,
    decks: decks.filter((d) => d.cards.includes(n)).map((d) => d.deck), adds, next, max };
});

// What each deck gives while its activity runs: the game's calc on that deck, minus non-card baseline.
const deckTotals = decks.map((d) => {
  const { attrs } = run(d.cards);
  const crops = cards.filter((c) => c.type === "CropsGained" && d.cards.includes(c.id)).flatMap((c) => Object.entries(c.adds));
  return Object.fromEntries([...CBONUS.flatMap((k) => { const v = (attrs[k] as number) - (baseline[k] as number); return typeof attrs[k] === "number" && Math.abs(v) > 1e-9 ? [[k.slice(6), +v.toPrecision(12)]] : []; }), ...crops]);
});
// Level-cap receipt: the wiki's max column vs the game's level-${MAX_LEVEL} value, per card.
let capHit = 0, capChecked = 0;
for (const c of cards) {
  const w = wikiMax.get(c.name.toLowerCase()), v = Object.values(c.max)[0];
  if (w === undefined || v === undefined) continue;
  capChecked++;
  if (Math.abs(w - v) <= 0.01 * Math.max(1, Math.abs(v))) capHit++;
}
// Level-up cost per current level, in spare-dupe tiers 1-5 (CardUpgradeCOST[1..5]), read from the card screen's
// ternary chain; and the one-way tier swap rates (n of tier t -> 1 of tier t+1) from the swap buttons.
const costAt = src.indexOf('"CardUpgradeCOST")[1]=3');
const chain = src.slice(costAt - 400, costAt + 15000);
const upgradeCost: Record<number, number[]> = {};
let lv: number | null = null;
for (const m of chain.matchAll(/(\d+)==\(null==\(t=b\.engine\.getGameAttribute\("CardLevels"\)|getGameAttribute\("CardUpgradeCOST"\)\[(\d)\]=([\d.e+]+)/g)) {
  if (m[1] !== undefined) lv = +m[1];
  else if (lv !== null) (upgradeCost[lv] ??= [0, 0, 0, 0, 0, 0])[+m[2]!] = +m[3]!;
}
const swapRates = [...src.matchAll(/(\d)==b\.engine\.getGameAttribute\("SwapTypeChosen"\)\)\{var \w+=b\.engine\.getGameAttribute\("CardsOwnedbyTypeEXCESS"\)\[\d\];if\((\d+)<=/g)]
  .reduce((r, m) => ((r[+m[1]!] = +m[2]!), r), [0] as number[]);
if (Object.keys(upgradeCost).length < 4 || swapRates.length !== 5) throw new Error(`card cost extraction broke: ${JSON.stringify({ upgradeCost, swapRates })}`);
// Receipt: the cost the game stored for the last-selected card must equal our row for its level.
const selLv = levels[save.CardSelected] ?? 0;
if (upgradeCost[selLv] && JSON.stringify(upgradeCost[selLv]!.slice(1, 6)) !== JSON.stringify((save.CardUpgradeCOST as number[]).slice(1, 6)))
  throw new Error(`upgrade cost for level ${selLv} disagrees with the save`);
const maxLevel = save.aa15 === 1 ? 6 : MAX_LEVEL; // the card screen allows level 6 only when aa15 is unlocked

// The tab buttons are icons, so label each tab by its main wiki zones: those holding >=15% of the tab's cards,
// in card order. The threshold drops strays from duplicate card names on the wiki.
const tabLabels: Record<string, string> = {};
const byTab = new Map<string, string[]>();
for (const c of [...cards].sort((x, y) => x.id - y.id)) {
  // Stage variants ("Maelstrom-25+", "Dungeon 17+") recur across many tabs, so they don't label a tab.
  const k = `${c.page}.${c.tab}`, z = c.zone && !/\d+\+$/.test(c.zone) ? c.zone.replace(/-\d+$/, "") : null;
  if (z) byTab.set(k, [...(byTab.get(k) ?? []), z]);
}
for (const [k, zs] of byTab) {
  const n = new Map<string, number>();
  for (const z of zs) n.set(z, (n.get(z) ?? 0) + 1);
  tabLabels[k] = [...new Set(zs)].filter((z) => n.get(z)! / zs.length >= 0.15).join(" / ");
}

const totals = Object.fromEntries(CBONUS.filter((k) => typeof save[k] === "number" && save[k] !== 0).map((k) => [k.slice(6), save[k]]));
writeFileSync("data/game/cards.json", JSON.stringify({ fingerprint: cardFingerprint(save), tabLabels, upgradeCost, swapRates, maxLevel, slots: SLOTS, decks: decks.map((d, i) => ({ ...d, totals: deckTotals[i] })), totals, planted, cards }));
const owned = cards.filter((c) => c.level >= 1).length;
console.log(`level cap ${MAX_LEVEL}: wiki max column matches the game at level ${MAX_LEVEL} for ${capHit}/${capChecked} cards`);
console.log(`data/game/cards.json: ${cards.length} cards (${owned} owned), ${decks.length} decks (${decks.filter((d) => d.link).length} linked); all ${CBONUS.length} Cbonus values reproduced`);
