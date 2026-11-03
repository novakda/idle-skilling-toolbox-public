// Parse data/wiki/raw/*.wikitext -> data/wiki/datasets/*.json
// Usage: bun scripts/wiki/parse.ts
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const OUT = "data/wiki";
type Page = { title: string; pageid: number; ns: number; timestamp: string; categories: string[]; raw: string };
const pages: Page[] = JSON.parse(readFileSync(`${OUT}/pages.json`, "utf8"));

// ---------- text helpers ----------
/** split s on sep at top level (outside [[ ]] and {{ }}) */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.substr(i, 2);
    if (two === "[[" || two === "{{") { depth++; cur += two; i++; continue; }
    if (two === "]]" || two === "}}") { depth = Math.max(0, depth - 1); cur += two; i++; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ""; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

const FILE_RE = /\[\[(?:File|Image):([^|\]]+)[^\]]*\]\]/gi;
function clean(s: string): string {
  let t = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "").replace(/<table-progress-tracking[^>]*>|<\/table-progress-tracking>/g, "");
  t = t.replace(FILE_RE, "");
  for (let n = 0; n < 6 && /\{\{[^{}]*\}\}/.test(t); n++)
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, body: string) => {
      const p = body.split("|");
      return p[0].trim().toLowerCase() === "color" ? (p[2] ?? "") : "";
    });
  t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1");
  t = t.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "");
  t = t.replace(/'{2,5}/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return t;
}
const images = (s: string) => [...s.matchAll(FILE_RE)].map((m) => m[1].trim());

/** numeric parse: returns number when the string is a clean number (commas allowed) */
function num(v: string): number | null {
  return /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$|^[+-]?\d+(\.\d+)?$/.test(v) ? Number(v.replace(/,/g, "")) : null;
}

// ---------- templates ----------
export function templateCalls(wt: string) {
  const calls: { template: string; params: Record<string, string> }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < wt.length - 1; i++) {
    const two = wt.substr(i, 2);
    if (two === "{{" && wt[i + 2] !== "{") { stack.push(i); i++; }
    else if (two === "}}" && stack.length) {
      const start = stack.pop()!;
      const parts = splitTop(wt.slice(start + 2, i), "|");
      const name = parts[0].trim();
      if (name && !name.startsWith("#") && !/^(PAGENAME|SITENAME|lc|uc|fullurl|!|!!)\b/i.test(name)) {
        const params: Record<string, string> = {};
        parts.slice(1).forEach((p, k) => {
          const eq = p.indexOf("=");
          if (eq > 0 && !/[\[{]/.test(p.slice(0, eq))) params[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
          else params[String(k + 1)] = p.trim();
        });
        calls.push({ template: name, params });
      }
      i++;
    }
  }
  return calls;
}

// ---------- tables ----------
type Cell = { hdr: boolean; text: string; imgs: string[]; colspan: number; rowspan: number };
const attr = (a: string, k: string) => Number(a.match(new RegExp(`${k}\\s*=\\s*"?(\\d+)`, "i"))?.[1] ?? 1);

function parseCells(line: string): Cell[] {
  const hdr = line[0] === "!";
  const body = line.slice(1);
  const segs = splitTop(body, hdr ? "!!" : "||").flatMap((x) => (hdr ? splitTop(x, "||") : [x]));
  return segs.map((seg) => {
    const p = splitTop(seg, "|");
    const [a, raw] = p.length > 1 ? [p[0], p.slice(1).join("|")] : ["", seg];
    return { hdr, text: clean(raw), imgs: images(raw), colspan: attr(a, "colspan"), rowspan: attr(a, "rowspan") };
  });
}

interface ParsedTable { section: string; caption: string; headers: string[]; rows: Record<string, unknown>[] }

function parseTableBody(lines: string[], section: string): ParsedTable[] {
  type Row = Cell[];
  const rows: Row[] = [];
  let caption = "";
  let cur: Row | null = null, last: Cell | null = null, depth = 0;
  for (const l of lines) {
    const t = l.trimStart();
    if (t.startsWith("{|")) { depth++; if (last) last.text += " "; continue; }
    if (t.startsWith("|}")) { depth--; continue; }
    if (depth > 0) { if (last && !/^\|-/.test(t)) last.text = (last.text + " " + clean(t.replace(/^[|!]+/, "").split("|").pop() ?? "")).trim(); continue; }
    if (t.startsWith("|+")) { caption = clean(t.slice(2).split("|").pop() ?? ""); continue; }
    if (t.startsWith("|-")) { cur = null; last = null; continue; }
    if (t.startsWith("|") || t.startsWith("!")) {
      if (!cur) { cur = []; rows.push(cur); }
      const cells = parseCells(t);
      cur.push(...cells); last = cells[cells.length - 1];
    } else if (last && t) { last.text = (last.text + " " + clean(t)).trim(); last.imgs.push(...images(t)); }
  }
  // expand spans into a grid, split into header blocks + data rows
  const occupied: Map<number, { left: number; cell: Cell }> = new Map();
  const grid: { hdr: boolean; cells: (Cell | null)[] }[] = [];
  for (const r of rows) {
    const out: (Cell | null)[] = [];
    let c = 0;
    const fillOcc = () => { while (occupied.get(c)?.left) { const o = occupied.get(c)!; out[c] = o.cell; o.left--; c++; } };
    for (const cell of r) {
      fillOcc();
      for (let k = 0; k < cell.colspan; k++) {
        out[c] = cell;
        if (cell.rowspan > 1) occupied.set(c, { left: cell.rowspan - 1, cell });
        c++;
      }
    }
    fillOcc();
    if (!r.length && !out.length) continue;
    grid.push({ hdr: r.length > 0 && r.every((x) => x.hdr), cells: out });
  }
  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < grid.length) {
    const hb: typeof grid = [];
    while (i < grid.length && grid[i].hdr) hb.push(grid[i++]);
    const data: typeof grid = [];
    while (i < grid.length && !grid[i].hdr) data.push(grid[i++]);
    const width = Math.max(0, ...hb.map((r) => r.cells.length), ...data.map((r) => r.cells.length));
    const headers: string[] = [];
    const seen = new Map<string, number>();
    for (let c = 0; c < width; c++) {
      const parts: string[] = [];
      for (const r of hb) { const tx = r.cells[c]?.text; if (tx && !parts.includes(tx)) parts.push(tx); }
      let h = parts.join(" / ") || `col${c + 1}`;
      const n = (seen.get(h) ?? 0) + 1; seen.set(h, n);
      headers.push(n > 1 ? `${h}_${n}` : h);
    }
    const out: Record<string, unknown>[] = [];
    for (const r of data) {
      const row: Record<string, unknown> = {};
      const imgs: string[] = [], seenCells = new Set<Cell>();
      let any = false;
      for (let c = 0; c < width; c++) {
        const cell = r.cells[c];
        if (!cell) continue;
        if (!seenCells.has(cell)) imgs.push(...cell.imgs); // once per cell (a colspan/rowspan cell fills several grid slots); repeats across cells stay (recipe slots: Sammatian, Sunburst, Sammatian)
        seenCells.add(cell);
        if (!cell.text || /^[<>]+$/.test(cell.text)) continue;
        any = true;
        const n = num(cell.text);
        row[headers[c]] = n ?? cell.text;
        if (n !== null && String(n) !== cell.text) row[`${headers[c]}_raw`] = cell.text;
      }
      if (any) { if (imgs.length) row._images = imgs; out.push(row); }
    }
    if (out.length) tables.push({ section, caption, headers, rows: out });
  }
  return tables;
}

export function parseTables(wt: string): ParsedTable[] {
  const lines = wt.split("\n");
  const res: ParsedTable[] = [];
  let section = "", depth = 0, buf: string[] = [], tsec = "";
  for (const l of lines) {
    const t = l.trimStart();
    if (depth === 0) {
      const h = l.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
      if (h) section = clean(h[2]);
      if (t.startsWith("{|")) { depth = 1; buf = [l]; tsec = section; }
      continue;
    }
    buf.push(l);
    if (t.startsWith("{|")) depth++;
    else if (t.startsWith("|}") && --depth === 0) res.push(...parseTableBody(buf.slice(1, -1), tsec));
  }
  return res;
}

export function sections(wt: string) {
  const out: { heading: string; level: number; text: string }[] = [];
  let cur = { heading: "", level: 1, text: "" };
  let depth = 0;
  for (const l of wt.split("\n")) {
    const t = l.trimStart();
    if (t.startsWith("{|")) depth++;
    if (depth === 0) {
      const h = l.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
      if (h) { out.push(cur); cur = { heading: clean(h[2]), level: h[1].length, text: "" }; continue; }
      if (!/^\s*\[\[Category:/i.test(l)) cur.text += l + "\n";
    }
    if (t.startsWith("|}")) depth = Math.max(0, depth - 1);
  }
  out.push(cur);
  return out.map((s) => ({ ...s, text: clean(s.text.replace(/\n/g, " ")) })).filter((s) => s.heading || s.text);
}

// ---------- main ---------- (only when run directly; to-tiddlywiki.ts imports the parsers)
if (import.meta.main) {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const groupOf = (p: Page) => (p.categories.includes("Zone") ? "zones" : slug(p.title.split("/")[0]));

  rmSync(`${OUT}/datasets`, { recursive: true, force: true });
  mkdirSync(`${OUT}/datasets`, { recursive: true });

  const datasets = new Map<string, { rows: any[]; pages: Set<string> }>();
  const pageRecords: any[] = [];
  const failures: { page: string; error: string }[] = [];
  let tableCount = 0;

  for (const p of pages) {
    const wt = readFileSync(p.raw, "utf8");
    try {
      const calls = templateCalls(wt);
      if (p.ns !== 0) {
        pageRecords.push({ title: p.title, ns: p.ns, categories: p.categories, templateCalls: calls.length });
        continue;
      }
      const tables = parseTables(wt);
      tableCount += tables.length;
      pageRecords.push({ title: p.title, categories: p.categories, timestamp: p.timestamp, sections: sections(wt), templateCalls: calls, tables: tables.length });
      if (p.title.startsWith("Header/") || !tables.length) continue;
      const g = groupOf(p);
      const ds = datasets.get(g) ?? { rows: [], pages: new Set() };
      datasets.set(g, ds); ds.pages.add(p.title);
      tables.forEach((t, ti) => t.rows.forEach((r) => ds.rows.push({ _page: p.title, _section: t.section, ...(t.caption ? { _caption: t.caption } : {}), _table: ti, ...r })));
    } catch (e) {
      failures.push({ page: p.title, error: String(e) });
    }
  }

  // template definitions dataset (ns 10): name, params used in body, categories
  const tmpl = pages.filter((p) => p.ns === 10 && !p.title.endsWith("/doc")).map((p) => {
    const wt = readFileSync(p.raw, "utf8");
    return { name: p.title.replace(/^Template:/, ""), params: [...new Set([...wt.matchAll(/\{\{\{([^|{}=]+)/g)].map((m) => m[1].trim()))], categories: p.categories };
  });
  writeFileSync(`${OUT}/datasets/templates.json`, JSON.stringify(tmpl, null, 1));
  writeFileSync(`${OUT}/datasets/pages_text.json`, JSON.stringify(pageRecords.filter((r) => r.ns === undefined), null, 1));

  const index: any[] = [
    { file: "templates.json", count: tmpl.length, fields: ["name", "params", "categories"], sourcePages: ["Template:*"] },
    { file: "pages_text.json", count: pageRecords.filter((r) => r.ns === undefined).length, fields: ["title", "categories", "timestamp", "sections", "templateCalls", "tables"], sourcePages: ["all ns0"] },
  ];
  for (const [g, ds] of [...datasets].sort()) {
    const fc = new Map<string, number>();
    for (const r of ds.rows) for (const k of Object.keys(r)) if (!k.startsWith("_")) fc.set(k, (fc.get(k) ?? 0) + 1);
    writeFileSync(`${OUT}/datasets/${g}.json`, JSON.stringify(ds.rows, null, 1));
    index.push({ file: `${g}.json`, count: ds.rows.length, fields: Object.fromEntries([...fc].sort((a, b) => b[1] - a[1])), sourcePages: [...ds.pages] });
  }
  writeFileSync(`${OUT}/datasets/index.json`, JSON.stringify({ generated: new Date().toISOString(), failures, datasets: index }, null, 1));
  console.log(`parsed ${pages.length} pages, ${tableCount} tables, ${datasets.size} table datasets, ${failures.length} failures`);
}
