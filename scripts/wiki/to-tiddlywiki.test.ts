import { expect, test } from "bun:test";
import { parseTables } from "./parse";
import { readFileSync } from "node:fs";
import { convert, fieldNames, gameNumber, KINDS, linkLists, newCtx, nupBlocks, quotes, unpivot } from "./to-tiddlywiki";

const exists = (t: string) => ["Gem Shop", "Pet", "Header/Pets", "Trekking"].includes(t);
const run = (wt: string, title = "Test") => {
  const ctx = newCtx(title, { exists });
  return { text: convert(wt, ctx), ctx };
};

test("simple table -> TiddlyWiki pipe table, links inside cells", () => {
  const { text } = run(`{| class="article-table"\n! Name !! Odds\n|-\n| [[Pet|Slime]] || 35%\n|}`);
  expect(text).toBe("|mw-table article-table|k\n|!Name|!Odds|\n|[[Slime|Pet]]|35%|");
});

test("table with colspan or multi-line cells -> HTML table, block content kept as blocks", () => {
  const { text } = run(`{|\n! colspan="2" | Header\n|-\n|\n* one\n* two\n| plain\n|}`);
  expect(text).toContain('<th colspan="2">Header</th>');
  expect(text).toContain("<td>\n\n* one\n* two\n\n</td><td>plain</td>");
});

test("!# in a header cell is the text #, not a numbered list", () => {
  expect(run(`{|\n!#\n!Fish\n|}`).text).toBe("|mw-table|k\n|!&#35;|!Fish|");
});

test("collapsible table -> <details>, its full-width header row becomes the summary", () => {
  const { text } = run(`{| class="article-table mw-collapsible mw-collapsed"\n! colspan="2" | Botany Card List\n|-\n| a || b\n|}`);
  expect(text).toStartWith('<details class="mw-collapsible">\n\n<summary>\n\nBotany Card List\n\n</summary>');
  expect(text).toContain("|a|b|");
  expect(text).not.toContain(" open");
});

test("custom toggle -> $button + $reveal sharing one state tiddler", () => {
  const { text } = run(`<div class="mw-customtoggle-X wikia-menu-button">Show</div>\n{| id="mw-customcollapsible-X" class="mw-collapsible mw-collapsed"\n| a\n|}`, "Page");
  expect(text).toContain('<$button class="tc-btn-invisible mw-toggle" set="""$:/state/is/toggle/Page/X"""');
  expect(text).toContain('<$reveal state="""$:/state/is/toggle/Page/X""" type="match" text="open">');
});

test("templates: page transclusion, parameters, unknown template kept visible as raw", () => {
  expect(run("{{:Header/Pets}}").text).toBe("{{Header/Pets}}");
  expect(run("{{:Builds/Mining|Ore gain|Green}}").text).toBe("{{Builds/Mining|Ore gain|Green}}");
  expect(run("Gem: [[File:{{{2}}}_gem.png|18px]] for {{{1}}}").text).toBe('\\parameters (p2:"", p1:"")\n\nGem: <span class="mw-img"><<p2>> gem</span> for <<p1>>');
  const { text, ctx } = run("before {{Mystery|x=1}} after");
  expect(text).toBe('before <span class="mw-raw" title="Not converted: original MediaWiki markup (template Mystery)"><$text text="""{{Mystery|x=1}}"""/></span> after');
  expect(ctx.raws).toEqual({ "template Mystery": 1 });
});

test("{{#if}} on a parameter takes the standalone branch, {{!}} survives argument splitting", () => {
  const { text } = run(`{{#if: {{{1|}}} | {{{!}} class="a" | {{{!}} class="b"}}\n| x\n|}`);
  expect(text).toBe("\\parameters (p1:\"\")\n\n|mw-table b|k\n|x|"); // a page used as a template declares its parameters
});

test("links: anchors, link trails, underscores, categories dropped, external links", () => {
  expect(run("[[Gem_Shop#Pets|Gem Shop]]").text).toBe("[[Gem Shop]]");
  expect(run("two [[Pet]]s").text).toBe("two [[Pets|Pet]]");
  expect(run("x\n[[Category:Pets]]").text).toBe("x");
  expect(run("[https://example.com Example ''site'']").text).toBe('<a class="tc-tiddlylink-external" href="https://example.com" target="_blank" rel="noopener noreferrer">Example //site//</a>');
  expect(run("[[File:Hatchery Pet.png|thumb|144px|A pet slime.]]").text).toBe('<span class="mw-img" title="Image on the original wiki: Hatchery Pet.png">Hatchery Pet</span> <span class="mw-img-caption">A pet slime.</span>');
});

test("headings, lists, bold/italic, and text TiddlyWiki would misread", () => {
  expect(run("== Nest ==\ntext\n* a\n*b").text).toBe("!! Nest\ntext\n\n* a\n*b");
  expect(quotes("'''bold''' and ''it'' and '''''both'''''")).toBe("''bold'' and //it// and ''//both//''");
  expect(quotes("'''unclosed")).toBe("''unclosed''");
  expect(run("a <<< b, x//y").text).toBe("a &lt;&lt;&lt; b, x/&#47;y");
});

test("game numbers for sorting", () => {
  expect([gameNumber("784"), gameNumber("1,000"), gameNumber("2.5%"), gameNumber("5859K"), gameNumber("1.13B"), gameNumber("286QQ"), gameNumber("-")]).toEqual([784, 1000, 2.5, 5859000, 1130000000, 2.86e20, null]);
});

test("every page in the dump becomes a tiddler; conversion is deterministic; raw blocks counted", () => {
  const pages = JSON.parse(readFileSync("data/wiki/pages.json", "utf8")) as { title: string; raw: string }[];
  const proc = Bun.spawnSync(["bun", "scripts/wiki/to-tiddlywiki.ts"]);
  const out = proc.stdout.toString();
  expect(proc.exitCode).toBe(0);
  expect(out).toContain(`pages in dump: ${pages.length}  page tiddlers: ${pages.length} `);
  const raws = [...out.matchAll(/raw blocks (ns\d+): (\d+)/g)].map((m) => `${m[1]}=${m[2]}`);
  console.log(`pages ${pages.length}, raw blocks ${raws.join(" ")}`);
  const again = Bun.spawnSync(["bun", "scripts/wiki/to-tiddlywiki.ts"]).stdout.toString();
  expect(again).toBe(out);
  const sample = pages.find((p) => p.title === "Hatchery")!;
  const a = convert(readFileSync(sample.raw, "utf8"), newCtx("Hatchery"));
  expect(convert(readFileSync(sample.raw, "utf8"), newCtx("Hatchery"))).toBe(a);
});

test("simple table with data on -> JSON data tiddler drawn by data-table; numeric columns flagged", () => {
  const ctx = newCtx("Page", { exists, data: [] });
  const text = convert(`{| class="article-table"\n! Name !! Cost\n|-\n! [[Pet|Slime]]\n| 2.5K\n|-\n| Bat || 300\n|}`, ctx);
  expect(text).toBe(`<$transclude $variable="data-table" src="""Page/table 1""" state="""$:/state/is/table/Page/table 1"""/>`);
  const d = JSON.parse(ctx.data![0].text);
  expect(JSON.parse(d.head)).toEqual({ c: ["Name", "Cost"], num: [false, true] });
  expect(JSON.parse(d[0])).toEqual({ c: ["[[Slime|Pet]]", "2.5K"], s: ["Slime", 2500], h: 1 });
  expect(JSON.parse(d[1]).s).toEqual(["Bat", 300]);
});

test("n-up tables: repeated header runs split into one block per thing; other tables stay whole", () => {
  const isName = (h: string) => h === "Name";
  expect(nupBlocks(["Name", "Level", "Name_2", "Level_2"], isName)).toEqual([["Name", "Level"], ["Name_2", "Level_2"]]);
  expect(nupBlocks(["Img", "Name", "Level", "Img_2", "Name_2", "Level_2"], isName)).toEqual([["Img", "Name", "Level"], ["Img_2", "Name_2", "Level_2"]]);
  expect(nupBlocks(["Name", "Level", "Cost"], isName)).toEqual([["Name", "Level", "Cost"]]);
  expect(nupBlocks(["Rod", "Smithing", "Hook", "Fishing"], isName)).toEqual([["Rod", "Smithing", "Hook", "Fishing"]]); // no name column: left alone
});

test("unpivot: column-major, empty and zero-width slots dropped, row images split evenly, printed form (_raw) kept", () => {
  const rows = [
    { _page: "P", Name: "Boot", Level: 1, Name_2: "Herring", Level_2: 2, Level_2_raw: "2.000", _images: ["boot.png", "herring.png"] },
    { _page: "P", Name: "Can", Level: 1, Name_2: "​", _images: ["can.png"] },
  ];
  expect(unpivot(rows, [["Name", "Level"], ["Name_2", "Level_2"]])).toEqual([
    { _page: "P", Name: "Boot", Level: 1, _images: ["boot.png"] },
    { _page: "P", Name: "Can", Level: 1, _images: ["can.png"] },
    { _page: "P", Name: "Herring", Level: 2, Level_raw: "2.000", _images: ["herring.png"] },
  ]);
  expect(unpivot(rows, [["Name", "Level", "Name_2", "Level_2"]])).toBe(rows);
});

test("field names: repeated headers get -2, the name column keeps its header unless repeated", () => {
  const k = KINDS[0];
  const m = fieldNames(["Item", "Material Costs", "Material Costs_2"], "Item", k);
  expect([...m.values()]).toEqual([{ field: "name", label: "Item" }, { field: "material-costs", label: "Material Costs" }, { field: "material-costs-2", label: "Material Costs" }]);
  expect(fieldNames(["Monster", "Monster_2"], "Monster_2", k).get("Monster_2")).toEqual({ field: "name", label: "Name" });
});

test("hand link lists: runs of 3+ one-link lines, targets after the |", () => {
  expect(linkLists("intro\n* [[A]]\n* [[Label|B]]\n*[[C]]\ntext\n* [[D]]\n* [[E]]")).toEqual([{ start: 1, end: 4, targets: ["A", "B", "C"] }]);
  expect(linkLists("* [[A]] and more\n* [[B]]\n* [[C]]")).toEqual([]); // commentary after the link: not a pure list
});

test("raw blocks show the original markup, not the converted label of a link inside", () => {
  expect(run("{{Mystery|x=[[Lord's Lair]]}}").text).toContain(`<$text text="""{{Mystery|x=[[Lord's Lair]]}}"""/>`);
});

test("parse: a row's images keep repeats across cells (recipe slots), once per spanning cell", () => {
  const [t] = parseTables(`{|\n! colspan="2" | Potion !! Slot !! Slot\n|-\n| [[File:P.png]] || Pride || [[File:S.png]] || [[File:S.png]]\n|-\n| colspan="2" | [[File:Q.png]] Wide || x || y\n|}`);
  expect(t.rows.map((r) => r._images)).toEqual([["P.png", "S.png", "S.png"], ["Q.png"]]);
});
