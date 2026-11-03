// Trace a value shown on screen back to the game attributes it is computed from ("run the maze backward").
// 1. live: wrap the cached-string blit (see src/screen-text.ts) and capture the JS stack when <text> is drawn;
//    the first Qno2x.js frame is the draw listener's bundle offset.
// 2. static: the attributes read just before that offset are what the draw formats (nearest first).
// 3. static: for each, find its writers (S.h.X= / setReserved("X" / setGameAttribute("X") and the attributes and
//    coefficients read in the expression feeding the write; repeat --depth levels.
// Read-only: the two wraps pass through and are restored after --ms. Usage:
//   bun src/trace-value.ts --text 9860K [--depth 2] [--ms 600]
import { parseArgs } from "util";
import { connectLive } from "./live";

const BUNDLE = "data/game/asar/distBuild/static/game/Qno2x.js";
// The minifier expands every numeric read into the same cast ladder; collapse it so the formula is readable.
const CAST = /null==\(a=([^)]+)\)\?0:"number"==typeof a\?c\.__cast\(a,k\):"number"==typeof a&&\(0\|a\)===a\?c\.__cast\(a,l\):"boolean"==typeof a\?c\.__cast\(a,h\)\?1:0:"string"==typeof a\?parseFloat\(a\):parseFloat\(f\.string\(a\)\)/g;
// Menu/paging state gates WHICH panel draws; it is not part of any value's formula, so don't follow it.
const UI_STATE = /^(Description|APmenu|.*Selected|.*IsOn$|.*Page$|CurrentlyViewedScreen)/;
const READ = /getGameAttribute\("([A-Za-z0-9_]+)"\)(\[\d+\])?/g;

export async function drawOffset(text: string, ms = 600): Promise<number | null> {
  const live = await connectLive();
  try {
    await live.hookEngine();
    await live.grab("__iskG", /visitStringCache=function\(\)\{/, "d");
    const stack = await live.evaluate(`new Promise((res) => {
      const G = window.__iskG, gp = Object.getPrototypeOf(window.__iskEngine.g.graphics), fill = gp.beginBitmapFill, rect = gp.drawRect;
      let last = null, stack = null;
      const keyOf = (img) => { for (const k of G.drawnStringCacheKeys) { const v = G.drawnStringCache.h[k]; if (v && v.img === img) return k; } };
      try {
        gp.beginBitmapFill = function (img) { try { last = keyOf(img) || null; } catch {} return fill.apply(this, arguments); };
        gp.drawRect = function () { try { if (!stack && last && last.split(":").slice(0, -4).join(":") === ${JSON.stringify(text)}) stack = new Error().stack; last = null; } catch {} return rect.apply(this, arguments); };
      } catch (e) { gp.beginBitmapFill = fill; gp.drawRect = rect; throw e; }
      setTimeout(() => { gp.beginBitmapFill = fill; gp.drawRect = rect; res(stack || ""); }, ${ms});
    })`) as string;
    const m = /Qno2x\.js:\d+:(\d+)/.exec(stack);
    return m ? +m[1]! : null;
  } finally { live.close(); }
}

/** Attributes read in src[from, to), nearest to `to` first, deduplicated. */
export function readsBefore(src: string, to: number, span: number): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const m of [...src.slice(Math.max(0, to - span), to).matchAll(READ)].reverse()) {
    const k = m[1]! + (m[2] ?? "");
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}

/** Writers of attribute `name`, each with the attributes and coefficients in the expression feeding it. */
export function writers(src: string, name: string, span = 1500) {
  const re = new RegExp(`(?:\\.h\\.${name}=|setReserved\\("${name}",|setGameAttribute\\("${name}",)`, "g");
  // The game writes each attribute twice in a row (setReserved / h.X= branches); keep one per site.
  return [...src.matchAll(re)].filter((m, i, all) => i === 0 || m.index! - all[i - 1]!.index! > 80).map((m) => {
    // ponytail: a fixed window before the write, not a parsed expression; nearby unrelated reads can appear.
    const expr = src.slice(Math.max(0, m.index! - span), m.index!).replace(CAST, "N($1)");
    const tail = expr.slice(Math.max(0, expr.lastIndexOf(";", expr.length - 2) - 600));
    const terms = [...tail.matchAll(/(\d+(?:\.\d+)?\*)?(?:b\.engine\.)?getGameAttribute\("([A-Za-z0-9_]+)"\)(\[\d+\])?/g)]
      .map((t) => `${t[1] ?? ""}${t[2]}${t[3] ?? ""}`);
    return { at: m.index!, reads: [...new Set(terms)].filter((t) => !UI_STATE.test(t.replace(/^\d+(?:\.\d+)?\*/, ""))) };
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { text: { type: "string" }, depth: { type: "string", default: "2" }, ms: { type: "string", default: "600" } } });
  if (!values.text) { console.error("usage: bun src/trace-value.ts --text <string as shown, _ for spaces>"); process.exit(2); }
  const src = await Bun.file(BUNDLE).text();
  const at = await drawOffset(values.text, +values.ms!);
  if (at == null) { console.error(`"${values.text}" was not drawn in ${values.ms} ms — is it on screen? (screen-text shows exact strings)`); process.exit(1); }
  const drawn = readsBefore(src, at, 2500);
  console.log(`"${values.text}" drawn at bundle offset ${at}`);
  console.log(`  reads just before the draw (nearest first): ${drawn.filter((d) => !UI_STATE.test(d)).slice(0, 6).join(", ") || "none"}`);
  const done = new Set<string>();
  const walk = (name: string, level: number) => {
    const base = name.replace(/\[\d+\]$/, "");
    if (level > +values.depth! || done.has(base)) return;
    done.add(base);
    for (const w of writers(src, base))
      console.log(`${"  ".repeat(level + 1)}${base} written at ${w.at} from: ${w.reads.join(" ") || "(no attribute reads nearby)"}`);
    for (const w of writers(src, base)) for (const r of w.reads) walk(r.replace(/^\d+(?:\.\d+)?\*/, ""), level + 1);
  };
  // Scratch attributes (aa, aa2, aa3…) are reused everywhere, so a global writer search is noise. For each value the
  // draw reads, the write that matters is the nearest one BEFORE the draw, inside the same draw code.
  for (const d of drawn.filter((d) => !UI_STATE.test(d)).slice(0, 4)) {
    const base = d.replace(/\[\d+\]$/, "");
    const local = writers(src, base).filter((w) => w.at < at && at - w.at < 60_000).at(-1);
    if (local) console.log(`  ${d} last written before the draw at ${local.at} (${at - local.at} chars earlier) from: ${local.reads.join(" ") || "(no attribute reads nearby)"}`);
  }
  const first = drawn.find((d) => !UI_STATE.test(d) && !/^aa\d*$/.test(d));
  if (first) walk(first, 0);
  process.exit(0);
}
