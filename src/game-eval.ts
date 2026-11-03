// Run snippets of the game's own compiled code against a mocked Stencyl engine.
// "Cheat fair": the numbers come from the game's formulas, not from transcriptions of them.
import { readFileSync } from "fs";

export const BUNDLE = "data/game/asar/distBuild/static/game/Qno2x.js";

/** Brace-match from the first `{` at/after `from`, skipping string literals. */
export function matchBraces(src: string, from: number): string {
  let depth = 0, q: string | null = null;
  for (let i = src.indexOf("{", from); i < src.length; i++) {
    const c = src[i]!;
    if (q) { if (c === q && src[i - 1] !== "\\") q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(from, i + 1);
  }
  throw new Error(`unbalanced braces from ${from}`);
}

/** A do-nothing value that absorbs any property access or call (UI/draw code we don't care about). */
/** Haxe StringMap/IntMap shape: entries live on `.h`; reserved-name variants share it. */
export function haxeMap() {
  const h: Record<string, unknown> = {};
  return {
    h,
    get: (k: string) => h[k], set: (k: string, v: unknown) => { h[k] = v; }, exists: (k: string) => k in h,
    getReserved: (k: string) => h[k], setReserved: (k: string, v: unknown) => { h[k] = v; }, existsReserved: (k: string) => k in h,
    remove: (k: string) => delete h[k], keys: () => Object.keys(h)[Symbol.iterator](),
  };
}

export const inert: any = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : inert),
  apply: () => inert,
  // `new <unknown>` in data code is almost always a Haxe map, so hand back a working one.
  construct: () => haxeMap(),
});

export type Attrs = Record<string, unknown>;

// Words that cannot be parameter names (keywords, plus the sloppy-mode specials).
const RESERVED = new Set(("break case catch class const continue debugger default delete do else enum export extends false finally for function if import in " +
  "instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval").split(" "));

/**
 * Compile a game function body with free identifiers bound to a fake engine.
 * `b.engine` reads/writes `attrs`; everything else unknown resolves to `inert`.
 * Every identifier-shaped token in the source that is not a global becomes a parameter (bound value or `inert`): the same
 * resolution a `with (proxy)` scope gave, but as plain locals, so a block runs ~10× faster (extra parameters that are only
 * property names, string contents or `1e5` exponents are never read and cost nothing).
 */
export function compile(fnSrc: string, attrs: Attrs, extra: Record<string, unknown> = {}) {
  const engine = {
    getGameAttribute: (k: string) => attrs[k],
    gameAttributes: { h: attrs, setReserved: (k: string, v: unknown) => (attrs[k] = v) },
  };
  const bound: Record<string, unknown> = {
    b: { engine },
    e: {}, // Haxe's reserved-name table: empty, so writes take the `.h[k]=v` path
    a: { wrapper: { enabled: true } },
    c: { __cast: (v: unknown) => v },
    f: { string: String },
    ...extra, // closure names a snippet needs real values for (e.g. a draw context)
  };
  const names = [...new Set(fnSrc.match(/[A-Za-z_$][\w$]*/g) ?? [])].filter((n) => !RESERVED.has(n) && !(n in globalThis));
  // Sloppy-mode Function, as the minified code expects.
  return new Function(...names, `return (${fnSrc});`)(...names.map((n) => (n in bound ? bound[n] : inert))) as (...a: unknown[]) => unknown;
}

export const loadBundle = (path = BUNDLE) => readFileSync(path, "utf8");

/**
 * A stand-in `this` for custom blocks: any `this._customBlock_X` is compiled on first use (property or
 * assignment form) and bound to the same host, so blocks can call each other; other fields are plain.
 */
export function blockHost(src: string, attrs: Attrs, extra: Record<string, unknown> = {}) {
  const host: Record<string, unknown> = {};
  return new Proxy(host, {
    get(t, p, receiver) {
      if (typeof p !== "string" || p in t || !p.startsWith("_customBlock_")) return t[p as string];
      const prop = src.indexOf(`${p}:function`);
      const assign = src.search(new RegExp(`\\.${p}=function`));
      const at = prop >= 0 ? prop + p.length + 1 : assign >= 0 ? src.indexOf("function", assign) : -1;
      if (at < 0) throw new Error(`block ${p} not found`);
      // `D` and `Be` are the bundle's static block holders (`D._customBlock_MinionInfo(…)`): route them back here,
      // or their calls hit `inert` and silently read as 0 (GetPlayerDPS lost its Vending multiplier that way).
      return (t[p] = (compile(matchBraces(src, at), attrs, { ...extra, D: receiver, Be: receiver }) as Function).bind(receiver));
    },
  });
}
