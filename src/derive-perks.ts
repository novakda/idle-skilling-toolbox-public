// Ascension (AP) and rebirth (BP) perk table from the game's own purchase code: every perk × level → cost, plus max level.
// Source: scripts.ActorEvents_689 (the perk "buy" button). Its three click listeners (Qno2x.js @13310961 AP 1–20,
// @13346257 AP 21–32/67/68, @13421705 BP 33–66) each test `ascentionSelected`, check a per-perk cap on
// `AscentionLevel[i]`, then `APtoSpend`/`BPtoSpend >= cost(level)`, subtract and level up. We run them, not transcribe them.
// AP perks 1–11, 13–16, 20–28 have no cap in code: for those `capped:false` and `max` is where the cost overflows to Infinity.
// Some BP caps read other state (`maxDependsOn`); `max` is the cap for the given save.
// Output is derived game data, so it goes to data/game/ (gitignored, local only).
// Usage: bun src/derive-perks.ts [--save data/save.json]
import { existsSync, readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";
import { compile, inert, loadBundle, matchBraces } from "./game-eval";

const LISTENERS = ["@13310961", "@13346257", "@13421705"]; // documentation; located by content below
export const AP = [...Array.from({ length: 32 }, (_, i) => i + 1), 67, 68];
export const BP = Array.from({ length: 34 }, (_, i) => i + 33);

export type Perk = { i: number; name: string | null; currency: "AP" | "BP"; max: number; capped: boolean;
  maxDependsOn?: string[]; cost: number[]; effect?: string; source: { name: string; effect?: string } };

/** The three click listeners of the perk buy button: the MouseOverActor listeners that spend AP/BP on AscentionLevel. */
function listeners(src: string) {
  const out: string[] = [];
  for (const m of src.matchAll(/this\.addMouseOverActorListener\(this\.actor,\(function\(a,n\)/g)) {
    const f = matchBraces(src, m.index! + "this.addMouseOverActorListener(this.actor,(".length);
    // APmenuSelected marks the ascend/rebirth award handler (ActorEvents_615), which adds AP/BP instead of spending it.
    if (/ascentionSelected/.test(f) && /(AP|BP)toSpend",\w+\)/.test(f) && /AscentionLevel/.test(f) && !/APmenuSelected/.test(f)) out.push(f);
  }
  if (out.length !== LISTENERS.length) throw new Error(`expected ${LISTENERS.length} perk-buy listeners, found ${out.length} — game update?`);
  return out;
}

/** Buy-simulator: `buy(i, level, wallet)` → amount spent, or null if the click does nothing. */
export function simulator(base: Record<string, unknown>, src = loadBundle()) {
  const a: Record<string, unknown> = { ...base };
  const fns = listeners(src).map((f) => compile(f, a));
  return (i: number, level: number, wallet: number) => {
    const lv = [...((base.AscentionLevel as number[]) ?? [])];
    while (lv.length < 100) lv.push(0);
    lv[i] = level;
    Object.assign(a, { AscentionLevel: lv, ascentionSelected: i, aa: 0, APtoSpend: wallet, BPtoSpend: wallet });
    for (const f of fns) f(5, inert); // 5 = mouse released over the actor
    if (lv[i] === level) return null;
    return wallet - ((a.APtoSpend as number) < wallet ? (a.APtoSpend as number) : (a.BPtoSpend as number));
  };
}

/** Cost of level n→n+1: the smallest power-of-ten wallet that buys it, minus what is left (exact for wallet ≤ 10×cost).
 *  `e` is the exponent to start the search from (the previous level's), since costs move slowly between levels. */
function costAt(buy: ReturnType<typeof simulator>, i: number, level: number, e: number) {
  while (e > 0 && buy(i, level, 10 ** (e - 1)) !== null) e--;
  for (; e <= 308; e++) { const c = buy(i, level, 10 ** e); if (c !== null) return { c, e }; }
  return { c: Infinity, e };
}

const LIMIT = 20000; // uncapped perks stop where the cost formula overflows to Infinity (~1–7k levels)
function perkCosts(buy: ReturnType<typeof simulator>, i: number) {
  const cost: number[] = [];
  let e = 0;
  while (cost.length < LIMIT && buy(i, cost.length, Number.MAX_VALUE) !== null) {
    const r = costAt(buy, i, cost.length, e);
    cost.push(Number(r.c.toPrecision(14))); e = r.e; // drop the wallet-subtraction ulp (10-8.9=1.0999…)
  }
  // Unbuyable with the largest finite wallet: a hard cap in code, or the cost overflowed to Infinity.
  // An Infinity wallet passes `Infinity >= Infinity`, so it still buys an overflowed level but never a capped one.
  return { cost, max: cost.length, capped: buy(i, cost.length, Infinity) === null };
}

function wikiEffects(file: string) {
  const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
  const norm = (s: string) => s.toLowerCase().replace(/h20/g, "h2o").replace(/[^a-z0-9+]/g, "");
  const map = new Map<string, string>();
  for (let r = 0; r + 1 < rows.length; r++) {
    const [x, y] = [rows[r]!, rows[r + 1]!];
    if (x._table !== y._table) continue;
    for (const k of Object.keys(x)) if (!k.startsWith("_") && typeof x[k] === "string" && typeof y[k] === "string" && !map.has(norm(x[k] as string)))
      map.set(norm(x[k] as string), y[k] as string);
  }
  return (name: string) => map.get(norm(name)) ?? map.get(norm(WIKI_ALIAS[name] ?? ""));
}
// Spelling differences between Kyromyr's sheet and the wiki (same perk, checked by effect text).
const WIKI_ALIAS: Record<string, string> = { "Trinket Tinkerer": "Trinket Tinkering", "Mountain Collector": "Mountains Collector",
  "Apothecary Canary": "Apocathery Canary", "H20 Kapow Kazam": "H2O Kapow Kazaw", "Wasnt Aiming For Ya": "Wasnt aiming for ya", "H20 Moneybags": "H2O Money Bags" };

/** Perk names by index from Kyromyr's cost sheets: the header lists the perk index of each cost column. */
export function kyromyr(kind: "ascension" | "rebirth") {
  const j = JSON.parse(readFileSync(`data/guides/kyromyr-notes/${kind}-perk-cost.json`, "utf8"));
  const idx = (j.notes[0] as string).split(" | ").slice(7).map(Number);
  const t = j.tables[0];
  const cols = (t.fields as string[]).slice(7);
  if (cols.length !== idx.length) throw new Error(`${kind} sheet: ${cols.length} columns vs ${idx.length} indices`);
  const names = cols.map((c) => c.replace(/_2$/, ""));
  // Column 0 header is the first row's Name ("H2O Accuracy Boost_2"); its real name is that row's Name cell's header.
  names[0] = (t.fields as string[])[1]!;
  const rows = t.rows as Record<string, unknown>[];
  return idx.map((i, k) => ({ i, name: names[k]!, max: rows[0]![cols[k]!] as number,
    cost: rows.slice(1).map((r) => r[cols[k]!]).filter((v): v is number => typeof v === "number") }));
}

/** Perk names as the game draws them: the perk panel title draws (Qno2x.js @11312981 H2O_ACCURACY_BOOST, AP 1, to
 *  @12384357 BP 47) titles each perk with `if (N == ascentionSelected) … drawString("TITLE")` centred at 165, e.g.
 *  12 SKILLTREE_OVERCHARGE @11433910, 41 EXTRA_H20_TOKENS @11945391, 52 CONTRACT_SHOP_5 @12102200, 63 ALL_STAR @12230209.
 *  N is AscentionLevel's index. Lock tiles (N = 100·k) are skipped. Raw titles (UPPER_SNAKE); see title() for display. */
export function gameNames(src = loadBundle()) {
  const out = new Map<number, string>();
  for (const m of src.matchAll(/165-\w+\.font\.getTextWidth\("([^"]+)"\)\/b\.SCALE\/2/g)) {
    const sel = [...src.slice(m.index! - 4000, m.index!).matchAll(/(\d+)==b\.engine\.getGameAttribute\("ascentionSelected"\)/g)].at(-1);
    if (sel && +sel[1]! < 100 && !out.has(+sel[1]!)) out.set(+sel[1]!, m[1]!);
  }
  return out;
}
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]/g, "");
/** Display form of a game title: Kyromyr's spelling when it is the same words (keeps "AP", "H20"), else Title Case. */
export const title = (raw: string, sheet?: string) => sheet && squash(sheet) === squash(raw) ? sheet
  : raw.toLowerCase().split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");

export function derivePerks(save: Record<string, unknown>) {
  const src = loadBundle();
  const buy = simulator(save, src);
  const lv = (save.AscentionLevel as number[]) ?? [];
  const withLv = (k: number) => { const a = [...lv]; while (a.length < 100) a.push(0); a[k] = 1e4; return a; };
  // Caps that read other state: rerun with each input raised and see which perks' caps move.
  // New Heights (61) and slot 69 raise some BP caps; lab tank 94 (TankLVs[94]) and SmithingItemLevel[83] raise 38 and 48.
  const DEPS: [string, Record<string, unknown>][] = [
    ["AscentionLevel[61]", { AscentionLevel: withLv(61) }], ["AscentionLevel[69]", { AscentionLevel: withLv(69) }],
    ["TankLVs", { TankLVs: Array(500).fill(1e6) }], ["SmithingItemLevel", { SmithingItemLevel: Array(500).fill(1e6) }],
  ];
  const raised = DEPS.map(([k, patch]) => [k, simulator({ ...save, ...patch }, src)] as const);
  // Kyromyr's names only for the wiki effect lookup (the wiki uses his spellings); displayed names are the game's.
  const sheet = new Map([...kyromyr("ascension"), ...kyromyr("rebirth")].map((p) => [p.i, p.name]));
  const drawn = gameNames(src);
  const fx = { AP: wikiEffects("data/wiki/datasets/ascension.json"), BP: wikiEffects("data/wiki/datasets/rebirth.json") };
  return [...AP, ...BP].map((i): Perk => {
    const currency = AP.includes(i) ? "AP" : "BP";
    const { cost, max, capped } = perkCosts(buy, i);
    const raw = drawn.get(i), sh = sheet.get(i);
    const name = raw ? title(raw, sh) : null;
    const effect = sh ? fx[currency](sh) : name ? fx[currency](name) : undefined;
    const p: Perk = { i, name, currency, max, capped, cost, source: { name: raw ? "game" : "none" } };
    // Receipt: costs read only the perk's own level, never the raised inputs.
    if (raised.some(([, b]) => b(i, 0, 1e12) !== buy(i, 0, 1e12))) throw new Error(`perk ${i} cost depends on other state`);
    const deps = capped ? raised.filter(([, b]) => b(i, max, Number.MAX_VALUE) !== null).map(([k]) => k) : [];
    if (deps.length) p.maxDependsOn = deps;
    if (effect) { p.effect = effect; p.source.effect = "wiki"; }
    return p;
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { save: { type: "string", default: "data/save.json" } } });
  const save = existsSync(values.save!) ? JSON.parse(readFileSync(values.save!, "utf8")) : {};
  const perks = derivePerks(save);
  const lv = (save.AscentionLevel as number[]) ?? [];
  const over = perks.filter((p) => (lv[p.i] ?? 0) > p.max);
  if (over.length) throw new Error(`save levels above derived max: ${over.map((p) => `${p.i}=${lv[p.i]}>${p.max}`).join(", ")}`);
  // Receipt: Kyromyr's tables, every perk × level both cover.
  let match = 0; const bad: string[] = [];
  for (const k of [...kyromyr("ascension"), ...kyromyr("rebirth")]) {
    const p = perks.find((x) => x.i === k.i)!;
    k.cost.forEach((c, L) => {
      if (L >= p.cost.length) return;
      if (Math.abs(c - p.cost[L]!) <= 1e-5 * Math.max(1, Math.abs(c))) match++; else bad.push(`${k.i} L${L}: sheet ${c} game ${p.cost[L]}`);
    });
  }
  writeFileSync("data/game/perks.json", JSON.stringify(perks));
  // App copy: uncapped cost tables cut to 600 levels (overflow tail is noise), 6 significant digits. ponytail: 600 cap, raise if a player passes it.
  const web = perks.map((p) => ({ ...p, cost: p.cost.slice(0, p.capped ? p.cost.length : 600).map((c) => +c.toPrecision(6)) }));
  writeFileSync("web/src/data/perks.json", JSON.stringify(web));
  console.log(`data/game/perks.json: ${perks.length} perks; Kyromyr ${match} match, ${bad.length} mismatch; save levels all ≤ max`);
  for (const b of bad.slice(0, 20)) console.log("  ", b);
}
