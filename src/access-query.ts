// Query the static access index (src/access-index.ts → data/access-index.sqlite). Named flags only.
//   bun src/access-query.ts --attr RealmStuff --path 13.6      every access that could read RealmStuff[13][6]
//   bun src/access-query.ts --attr PotionLV --index 91         same, one level
//   bun src/access-query.ts --attr GenINFO --path 52 --cls ActorEvents_1488   actor fields (this._GenINFO) too
//   bun src/access-query.ts --key ShrineUpgCost                dispatch branch(es), accesses inside, call sites
//   bun src/access-query.ts --key MinionTraitALL --arg 70      call sites whose 1st argument after the key is 70 or computed
//   bun src/access-query.ts --key MinionTrait --arg 70 --argpos 2   … 2nd argument after the key
// Options: --limit N (rows per section, default 40), --db file. Ends with a verdict line.
import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { parseArgs } from "util";
import { DEFAULT_DB } from "./access-index";

type Row = { attr: string; path: string; kind: string; src: string; off: number; fn: string; cls: string | null; fnStart: number; fnEnd: number; ui: string; via: number | null; expr: string | null; defs: string | null };
type Seg = number | string;

export type Match = "literal" | "computed" | "container" | null;
/** How an access with index path `p` relates to the queried element path `q`. */
export function classify(p: Seg[], q: number[], kind: string): Match {
  let computed = false;
  for (let i = 0; i < q.length; i++) {
    if (i >= p.length) return kind === "alias" || kind === "length" ? null : "container";
    const s = p[i]!;
    if (typeof s === "number") { if (s !== q[i]) return null; }
    else if (s.startsWith("?")) computed = true;
    else return null; // a property like .h: not an array element path
  }
  return kind === "alias" ? null : computed ? "computed" : "literal";
}
export const isWrite = (k: string) => k.startsWith("write") || /^call:(push|pop|shift|unshift|splice|reverse|sort|fill)$/.test(k);
const fmtPath = (p: Seg[]) => p.map((s) => (typeof s === "number" ? `[${s}]` : s.startsWith("?") ? `[${s.slice(1)}]` : `.${s}`)).join("");
const short = (c: string | null) => (c ?? "?").replace(/^scripts\./, "");

if (import.meta.main) {
  const { values: v } = parseArgs({
    options: {
      attr: { type: "string" }, path: { type: "string" }, index: { type: "string" }, key: { type: "string" }, arg: { type: "string" }, argpos: { type: "string", default: "1" },
      helper: { type: "string" }, cls: { type: "string" }, limit: { type: "string", default: "40" }, db: { type: "string", default: DEFAULT_DB },
    },
  });
  if (!existsSync(v.db!)) { console.error(`no index at ${v.db} — run: bun src/access-index.ts`); process.exit(1); }
  const db = new Database(v.db!, { readonly: true });
  const limit = +v.limit!;
  const meta = Object.fromEntries((db.query(`select k, v from meta`).all() as { k: string; v: string }[]).map((m) => [m.k, m.v]));
  if (existsSync(meta.src!) && new Date(Bun.file(meta.src!).lastModified).toISOString() !== meta.mtime)
    console.log(`WARNING: ${meta.src} changed since the index was built — re-run: bun src/access-index.ts`);
  const branches = db.query(`select helper,key,start,end from branches order by start`).all() as { helper: string; key: string; start: number; end: number }[];
  const keyAt = (off: number) => branches.find((b) => b.start <= off && off < b.end);
  const callersOf = (b: { helper: string; key: string }) => db.query(`select ui from calls where helper = ? and key = ?`).all(b.helper, b.key) as { ui: string }[];
  /** Logic code inside a "<Key>"==t branch whose every call site is UI is UI too (one level). */
  const uiOf = (r: { off: number; ui: string }) => {
    const ui = r.ui.split(",").filter((x) => x && x !== "addSaveEntry").join(",");
    if (ui) return ui;
    const b = keyAt(r.off);
    const cs = b ? callersOf(b) : [];
    return cs.length && cs.every((c) => c.ui) ? `all ${cs.length} ${b!.key} callers UI` : "";
  };
  const where = (r: { off: number; fn: string; cls: string | null; ui: string }) => {
    const b = keyAt(r.off), ui = uiOf(r);
    return `${short(r.cls)} ${r.fn}${b ? ` {${b.helper}:${b.key}}` : ""}  ${ui ? `UI(${ui.split(",").slice(0, 3).join(",")})` : r.ui.includes("addSaveEntry") ? "logic(save fn)" : "logic"}`;
  };
  const line = (r: Row) => {
    const defs = r.defs ? "  " + Object.entries(JSON.parse(r.defs)).map(([k, x]) => `${k}=${x}`).join("; ") : "";
    return `  @${r.off} ${r.kind.padEnd(10)} ${r.attr}${fmtPath(JSON.parse(r.path))}  ${where(r)}${r.via ? `  via alias @${r.via}` : ""}${defs}`;
  };
  const section = (title: string, rows: Row[]) => {
    if (!rows.length) return;
    console.log(`${title} (${rows.length}):`);
    for (const r of rows.slice(0, limit)) console.log(line(r));
    if (rows.length > limit) console.log(`  … ${rows.length - limit} more (--limit)`);
  };

  if (v.attr) {
    const rows = (db.query(`select * from acc where attr in (?, ?)`).all(v.attr, "_" + v.attr) as Row[])
      .filter((r) => !v.cls || (r.cls ?? "").includes(v.cls));
    const qs = v.path ?? v.index;
    if (!qs) {
      const by = new Map<string, number>();
      for (const r of rows) { const k = fmtPath(JSON.parse(r.path).slice(0, 1)) || "(whole)"; by.set(k, (by.get(k) ?? 0) + 1); }
      console.log(`${v.attr}: ${rows.length} accesses by first index:`, [...by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(" "));
      process.exit(0);
    }
    const q = qs.split(".").map(Number);
    const sel = { literal: [] as Row[], computed: [] as Row[], container: [] as Row[] };
    for (const r of rows) { const m = classify(JSON.parse(r.path), q, r.kind); if (m) sel[m].push(r); }
    const reads = (rs: Row[]) => rs.filter((r) => !isWrite(r.kind));
    const isSave = (r: Row) => !uiOf(r) && r.ui.includes("addSaveEntry");
    const logic = (rs: Row[]) => reads(rs).filter((r) => !uiOf(r) && !isSave(r));
    const label = `${v.attr}${q.map((i) => `[${i}]`).join("")}`;
    section("LITERAL", sel.literal);
    section("COMPUTED INDEX (could be this element)", sel.computed);
    section("CONTAINER (whole array/record used: element unknown)", sel.container.filter((r) => !isWrite(r.kind)));
    section("CONTAINER WRITES (init/push/replace)", sel.container.filter((r) => isWrite(r.kind)));
    const lr = logic(sel.literal), lc = logic(sel.computed), lw = logic(sel.container);
    const ui = reads(sel.literal).length - lr.length, uc = reads(sel.computed).length - lc.length;
    const w = sel.literal.filter((r) => isWrite(r.kind)).length;
    const verdict = !lr.length && !lc.length && !lw.length ? "no logic read"
      : [lr.length && `${lr.length} logic read${lr.length > 1 ? "s" : ""} (${lr.map((r) => "@" + r.off).join(" ")})`,
         lc.length && `${lc.length} computed-index logic candidate${lc.length > 1 ? "s" : ""} to inspect`,
         lw.length && `${lw.length} whole-container logic use${lw.length > 1 ? "s" : ""} to inspect`].filter(Boolean).join(" · ");
    const saves = reads([...sel.literal, ...sel.computed, ...sel.container]).filter(isSave).length;
    console.log(`VERDICT ${label}: ${verdict}${saves ? ` (+${saves} in save writers)` : ""}  [literal: ${lr.length} logic + ${ui} UI reads, ${w} writes · computed: ${lc.length} logic + ${uc} UI · container: ${lw.length} logic]`);
  } else if (v.key) {
    const bs = branches.filter((b) => b.key === v.key && (!v.helper || b.helper === v.helper));
    for (const b of bs) {
      console.log(`BRANCH ${b.helper}:"${b.key}" @${b.start}–${b.end} (${b.end - b.start} B)`);
      const inner = db.query(`select * from acc where off >= ? and off < ? order by off`).all(b.start, b.end) as Row[];
      for (const r of inner) console.log(`  @${r.off} ${r.kind.padEnd(8)} ${r.attr}${fmtPath(JSON.parse(r.path))}${r.defs ? "  " + r.defs : ""}`);
    }
    if (!bs.length) console.log(`no "${v.key}"==t branch indexed`);
    const calls = (db.query(`select * from calls where key = ? ${v.helper ? "and helper = ?" : ""} order by off`).all(...[v.key, v.helper].filter(Boolean) as string[]) as any[]);
    const arg = v.arg === undefined ? undefined : +v.arg, pos = +v.argpos! - 1;
    const nth = (c: any) => JSON.parse(c.nums)[pos] as number | null | undefined;
    const lit = arg === undefined ? calls : calls.filter((c) => nth(c) === arg);
    const comp = arg === undefined ? [] : calls.filter((c) => nth(c) === null);
    const show = (title: string, cs: any[]) => {
      console.log(`${title} (${cs.length}):`);
      for (const c of cs.slice(0, limit)) console.log(`  @${c.off} ${c.helper}("${c.key}",${c.args})  ${where(c)}${c.defs ? "  " + Object.entries(JSON.parse(c.defs)).map(([k, x]) => `${k}=${x}`).join("; ") : ""}`);
      if (cs.length > limit) console.log(`  … ${cs.length - limit} more (--limit)`);
    };
    show(arg === undefined ? "CALL SITES" : `CALL SITES with arg#${pos + 1} = ${arg}`, lit);
    if (arg !== undefined) show(`CALL SITES with computed arg#${pos + 1} (could be ${arg})`, comp);
    const lg = (cs: any[]) => cs.filter((c) => !c.ui).length;
    console.log(`VERDICT ${v.key}${arg !== undefined ? `(${arg})` : ""}: ${bs.length} branch(es) · ${lit.length} call sites (${lg(lit)} logic)` +
      (arg !== undefined ? ` · ${comp.length} computed-arg candidates (${lg(comp)} logic) to inspect` : ""));
  } else {
    console.error("need --attr NAME [--path a.b | --index i] [--cls C]  or  --key KEY [--arg N [--argpos K]] [--helper H]");
    process.exit(2);
  }
}
