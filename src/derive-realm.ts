// Realm static data from the game's own tables → web/src/data/realm.json (Realm tab, #23; docs/realm.md).
// CustomMaps (`sU.*` in Qno2x.js): MinionDatabase, TraitTypes, Blessings, FruitInfo. CustomLists (data/game/lists.json,
// bun src/derive-lists.ts first): ShrineUpgrades, VendingInfo, BossHP. Usage: bun src/derive-realm.ts
import { readFileSync, writeFileSync } from "fs";
import { compile, loadBundle, matchBraces } from "./game-eval";

const src = loadBundle();
const map = (name: string): Record<string, string[]> => {
  const at = src.search(new RegExp(`\\w+\\.${name}=function\\(\\)\\{var t=new`));
  if (at < 0) throw new Error(`CustomMaps.${name} not found — game update?`);
  return (compile(matchBraces(src, src.indexOf("function", at)), {})() as { h: Record<string, string[]> }).h;
};
const lists = JSON.parse(readFileSync("data/game/lists.json", "utf8"));
const label = (s: string) => s.replace(/_/g, " ");

// MinionDatabase row: name, trait id, evolution A, evolution B, (cost), parent, …
const minions = Object.fromEntries(Object.entries(map("MinionDatabase")).map(([id, r]) =>
  [id, { name: label(r[0]!), trait: +r[1]!, evo: [r[4], r[5]].filter((e) => e !== "none"), parent: r[7] === "none" ? null : r[7] }]));
const traits = Object.fromEntries(Object.entries(map("TraitTypes")).map(([i, r]) => [i, { name: label(r[1]!), value: +r[0]!, text: label(r[3]!), stack: r[2] !== "no" }]));
const blessings = Object.fromEntries(Object.entries(map("Blessings")).map(([k, r]) => [k, { name: label(r[0]!), value: +r[1]!, text: label(r[2]!) }]));
// TrophyInfo row: target, reward (unverified), next row offered when this one is claimed (0 = none, claim @6787600), text.
// RealmStuff[24][i] tracks row i (docs/realm.md).
const trophies = Object.values(map("TrophyInfo")).map((r) => ({ target: +r[0]!, next: +r[2]!, text: label(r[3]!) }));
const fruits = Object.fromEntries(Object.entries(map("FruitInfo")).map(([k, r]) => [k, label(r[0]!)]));
// ShrineUpgrades row: ?, max level, effect, cost base, cost scale (ShrineUpgCost = base·scale^level). Names: wiki order, which matches the effects.
const SHRINE_NAMES = ["Dharma", "Bhakti", "Carnate", "Ahisma", "Taoism", "Sahaja", "Moksha", "Nirvana"];
const shrine = (lists.ShrineUpgrades as string[][]).map((r, i) => ({ name: SHRINE_NAMES[i], max: +r[1]!, text: label(r[2]!), base: +r[3]!, scale: +r[4]! }));
const vending = (lists.VendingInfo as string[][]).map((r) => ({ name: label(r[0]!), per: +r[1]!, base: +r[2]!, scale: +r[3]!, text: label(r[4]!) }));
// First Afterlife (boss row + 1) whose health bar has each colour tier.
const boss = lists.BossHP as number[][];
const tierFirst = Array.from({ length: 8 }, (_, t) => boss.findIndex((row) => +row[t]! > 0) + 1);

// Wiki minion tables (Realm › Minions list and their mutations): name → prerequisite + notes. Wiki text, not game data.
const wikiText = readFileSync("data/wiki/raw/Realm.wikitext", "utf8");
const listAt = wikiText.indexOf("====Minions list and their mutations====");
const wiki: Record<string, { prereq: string; note: string }> = {};
for (const row of wikiText.slice(listAt, wikiText.indexOf("==Vending Machine==", listAt)).split("|-")) {
  const cells = row.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("|}")).map((l) => l.slice(1).replace(/\[\[File:[^\]]*\]\]/g, "").replace(/<\/?u>|'''|<br\/>/g, "").trim());
  if (cells.length >= 3 && cells[1] && !cells[1].startsWith("!")) wiki[cells[1]] = { prereq: cells.length >= 5 ? cells[3]! : "", note: cells.at(-1)! };
}

// Wiki composition tables (Strategies): every collapsible table titled "... composition". Each row's mutation path is
// resolved to a game minion id by walking the evo tree from the root by name (ALIAS covers wiki names the game spells
// differently). Wiki text, not game data; rows the walk can't resolve keep id null and are listed at derive time.
const ALIAS: Record<string, string> = { "little piggy": "piggy", duck: "ducko", purpbacks: "purpback", crikeydale: "crikeydile" };
const same = (a: string, b: string) => (ALIAS[a.toLowerCase()] ?? a.toLowerCase()) === b.toLowerCase();
function resolvePath(path: string): string | null {
  const steps = path.split("->").map((x) => x.trim()).filter(Boolean);
  let cur = Object.keys(minions).find((id) => !minions[id]!.parent && same(steps[0]!, minions[id]!.name));
  for (const st of steps.slice(1)) {
    if (!cur) return null;
    cur = (minions[cur]!.evo ?? []).find((e: string) => minions[e] && same(st, minions[e]!.name));
  }
  return cur ?? null;
}
const clean = (c: string) => c.replace(/\[\[File:[^\]]*\]\]/g, "").replace(/<\/?u>|'''|<br\s*\/?>/g, "").replace(/\s+/g, " ").trim();
type CompRow = { amount: string; level: string; path: string; id: string | null; note: string; fill: boolean };
const compositions: { title: string; section: string; image?: string; rows: CompRow[] }[] = [];
const unresolved: string[] = [];
for (const m of wikiText.matchAll(/\{\|[^\n]*\n! colspan="\d+" \|'''([^']*composition[^']*)'''([\s\S]*?)\n\|\}/g)) {
  const section = [...wikiText.slice(0, m.index).matchAll(/^={3,4} ?([^=]+?) ?={3,4}\s*$/gm)].at(-1)?.[1] ?? "";
  const blocks = m[2]!.split("\n|-");
  const head = (blocks.find((b) => b.includes("\n!")) ?? "").split("\n").filter((l) => l.startsWith("!")).map((l) => clean(l.slice(1)).toLowerCase());
  const col = (h: string) => head.findIndex((x) => x.startsWith(h));
  const rows: CompRow[] = [];
  let fill = false;
  for (const b of blocks) {
    if (/Remaining slots/.test(b) && /colspan/.test(b)) { fill = true; continue; }
    const cells: string[] = [];
    for (const l of b.split("\n")) {
      if (l.startsWith("|") && !l.startsWith("|}")) cells.push(l.slice(1));
      else if (cells.length && l.trim() && !l.startsWith("!")) cells[cells.length - 1] += " " + l;
    }
    const c = cells.map(clean), path = c[col("mutation")] ?? "";
    if (cells.length < 3 || !path) continue;
    const id = resolvePath(path);
    if (!id) unresolved.push(`${m[1]}: ${path}`);
    rows.push({ amount: c[col("amount")] ?? "", level: col("level") >= 0 ? c[col("level")]! : "", path, id, note: col("note") >= 0 ? c[col("note")]! : "", fill });
  }
  compositions.push({ title: m[1]!, section, rows });
}
// Stage 1-15: the wiki shows these only as screenshots, transcribed by hand into data/wiki/datasets/realm-early-compositions.json
// (images in data/wiki/images/). Same row shape as the tables, plus `image` = the wiki File name for provenance.
const early = JSON.parse(readFileSync("data/wiki/datasets/realm-early-compositions.json", "utf8")) as { compositions: { title: string; image: string; rows: Omit<CompRow, "id" | "fill">[] }[] };
for (const c of early.compositions) compositions.push({ title: c.title, section: "Stage 1-15", image: c.image, rows: c.rows.map((x) => {
  const id = resolvePath(x.path);
  if (!id) unresolved.push(`${c.title}: ${x.path}`);
  return { ...x, id, fill: false };
}) });
if (unresolved.length) console.warn(`compositions: ${unresolved.length} unresolved paths:\n  ${unresolved.join("\n  ")}`);

writeFileSync("web/src/data/realm.json", JSON.stringify({ wiki, minions, traits, blessings, fruits, shrine, vending, tierFirst, trophies, compositions }));
console.log(`web/src/data/realm.json: ${Object.keys(minions).length} minions, ${Object.keys(wiki).length} wiki rows, ${Object.keys(traits).length} traits, ${Object.keys(blessings).length} blessings, tiers first at ${tierFirst.join(",")}`);
