// The stats panel (APmenuSelected 1, DescriptionToShow 1; pages DAMAGE / HEALTH / AWAY GAINS PER HOUR / POTIONS,
// DescriptionStatPage 1-4) rendered by running the game's own draw listeners against a recording draw context.
// Reads the attributes the listeners touch from the live game (CDP, read-only) unless --attrs <json> is given.
// Usage: bun src/stat-pages.ts [--page 3] [--attrs snapshot.json] [--dump snapshot.json]
import { parseArgs } from "util";
import { compile, inert, loadBundle, matchBraces, type Attrs } from "./game-eval";

const HEAD = /\(function\(n,\w,\w,\w\)\{if\(a\.wrapper\.enabled&&1==b\.engine\.getGameAttribute\("APmenuSelected"\)/g;

/** The panel's 4 page listeners, in page order. */
export function pageListeners(src = loadBundle()): string[] {
  const out: string[] = [];
  for (const h of src.matchAll(HEAD)) {
    const f = matchBraces(src, h.index! + 1);
    const m = /(\d)==b\.engine\.getGameAttribute\("DescriptionStatPage"\)/.exec(f.slice(0, 600));
    if (m && /DescriptionToShow"\)\)/.test(f.slice(0, 300))) out[+m[1]! - 1] = f;
  }
  if (out.filter(Boolean).length !== 4) throw new Error(`expected 4 stat-page listeners, found ${out.filter(Boolean).length} — game update?`);
  return out;
}

/** Attribute names a listener reads. */
export const attrNames = (f: string) => [...new Set([...f.matchAll(/getGameAttribute\("(\w+)"\)/g)].map((m) => m[1]!))];

/** Run one page listener; returns the drawn strings as rows (sorted by y, then x). */
export function renderPage(f: string, attrs: Attrs, page: number): string[] {
  const a: Attrs = { ...structuredClone(attrs), APmenuSelected: 1, DescriptionToShow: 1, DescriptionsIsOn: 1, DescriptionStatPage: page };
  const drawn: { x: number; y: number; s: string }[] = [];
  let at = [0, 0];
  const font: any = {
    ID: 0, letterSpacing: 0, fontScale: 1, getTextWidth: () => 1,
    font: { getTextWidth: () => 1, getFontHeight: () => 1, renderToImg: (_i: unknown, s: string) => drawn.push({ x: at[0]!, y: at[1]!, s }) },
  };
  const n = { font, defaultFont: font, drawActor: false, x: 0, y: 0, scaleX: 1, scaleY: 1, alpha: 1, graphics: inert,
    mtx: { identity() {}, translate: (x: number, y: number) => (at = [x, y]) } };
  const p = new Proxy({}, { get: (_t, k) => (k === "getFont" ? () => font : inert) });
  const d = { drawnStringCache: { h: { hasOwnProperty: () => false } }, drawnStringCacheKeys: [] }; // never a cache hit: every string reaches renderToImg
  compile(f, a, { p, d, a: { wrapper: { enabled: true }, actor: inert } })(n, inert, inert, inert);
  const rows = new Map<number, typeof drawn>();
  for (const x of drawn) rows.set(x.y, [...(rows.get(x.y) ?? []), x]);
  return [...rows.keys()].sort((x, y) => x - y).map((y) => rows.get(y)!.sort((u, v) => u.x - v.x).map((x) => x.s).join("  "));
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { page: { type: "string" }, attrs: { type: "string" }, dump: { type: "string" } } });
  const fs = pageListeners();
  let attrs: Attrs;
  if (values.attrs) attrs = await Bun.file(values.attrs).json();
  else {
    const { connectLive } = await import("./live");
    const live = await connectLive();
    try { attrs = await live.read([...new Set(fs.flatMap(attrNames))]); } finally { live.close(); }
  }
  if (values.dump) await Bun.write(values.dump, JSON.stringify(attrs));
  for (const [i, f] of fs.entries()) if (!values.page || +values.page === i + 1) console.log(`--- page ${i + 1}\n${renderPage(f, attrs, i + 1).join("\n")}`);
}
