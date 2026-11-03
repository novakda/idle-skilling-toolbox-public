// Text the running game is drawing right now, with screen positions (CDP, read-only).
// Stencyl's G.drawString is inlined at every call site and caches each rendered string as a bitmap in the static
// G.drawnStringCache ("text:fontID:alpha:letterSpacing:SCALE" -> { img, lifetime }); a cache hit only blits img with
// graphics.beginBitmapFill(img) + drawRect(x, y). So we grab G once (breakpoint in G.visitStringCache), then wrap the
// OpenFL Graphics prototype's beginBitmapFill/drawRect for --ms, mapping each filled bitmap back to its cache key.
// One row per unique string (first position seen; floating numbers move). The wrappers pass through unchanged and are restored in a finally.
// Usage: bun src/screen-text.ts [--ms 500]
import { parseArgs } from "util";
import { connectLive } from "./live";

export async function screenText(live: Awaited<ReturnType<typeof connectLive>>, ms = 500) {
  await live.hookEngine();
  await live.grab("__iskG", /visitStringCache=function\(\)\{/, "d");
  const out = await live.evaluate(`new Promise((res) => {
    const G = window.__iskG, gp = Object.getPrototypeOf(window.__iskEngine.g.graphics);
    const fill = gp.beginBitmapFill, rect = gp.drawRect, seen = new Map();
    let byImg = new Map(), last = null;
    const keyOf = (img) => {
      if (!byImg.has(img)) { byImg = new Map(); for (const k of G.drawnStringCacheKeys) { const v = G.drawnStringCache.h[k]; if (v) byImg.set(v.img, k); } }
      return byImg.get(img);
    };
    try {
      gp.beginBitmapFill = function (img) { try { last = keyOf(img) ?? null; } catch {} return fill.apply(this, arguments); };
      gp.drawRect = function (x, y) {
        try { if (last != null) { const s = last.split(":").slice(0, -4).join(":"); if (!seen.has(s)) seen.set(s, { s, x: Math.round(x), y: Math.round(y) }); last = null; } } catch {}
        return rect.apply(this, arguments);
      };
    } catch (e) { gp.beginBitmapFill = fill; gp.drawRect = rect; throw e; }
    setTimeout(() => { gp.beginBitmapFill = fill; gp.drawRect = rect; res(JSON.stringify([...seen.values()])); }, ${ms});
  })`);
  const rows = JSON.parse(out) as { s: string; x: number; y: number }[];
  return rows.sort((a, b) => a.y - b.y || a.x - b.x);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { ms: { type: "string", default: "500" } } });
  const live = await connectLive();
  try { for (const r of await screenText(live, +values.ms!)) console.log(`${String(r.x).padStart(5)} ${String(r.y).padStart(5)}  ${r.s}`); }
  finally { live.close(); }
}
