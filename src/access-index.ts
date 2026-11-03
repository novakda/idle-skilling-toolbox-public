// Static access index of the game bundle (#2643): every read/write/call of a game attribute record, with scope-correct aliases,
// plus every `_customBlock_*("<Key>", …)` call site and every `"<Key>"==t` dispatch branch. Re-run after a game update.
// Query it with src/access-query.ts. Doc: docs/access-index.md.
// Usage: bun src/access-index.ts [--src data/game/asar/distBuild/static/game/Qno2x.js] [--out data/access-index.sqlite]
import { parse } from "acorn";
import { Database } from "bun:sqlite";
import { rmSync } from "fs";
import { parseArgs } from "util";

export const DEFAULT_SRC = "data/game/asar/distBuild/static/game/Qno2x.js";
export const DEFAULT_DB = "data/access-index.sqlite";

/** Calls/props that mark a function as drawing text/images or handling the mouse. */
const UI_RE = /\.font=|getTextWidth\(|drawRect\(|drawImage\(|GrowImgInstt|setText\(|drawString|mouseywithin|isMouse(?:Released|Pressed)|getMouse[XY]\(|setDrawingLayer\(|bringImagetoFront\(|setOrderForImage\(|addSaveEntry\(/g; // addSaveEntry = save writer: shown, not counted as UI
// Mouse listeners are click handlers. Draw listeners are not a UI signal by themselves: the game runs per-frame logic in them.
const UI_LISTENER = /^Mouse/;
const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "reverse", "sort", "fill"]);
/** Callees that only read a value: passing an alias to them is a read, not a hand-off of the container. */
const VALUE_CALLEE = /^(c\.__cast|f\.string|parseFloat|parseInt|isNaN|Math\.\w+|Std\.\w+)$/;

const CAST_ASSIGN = /null==\(([\w$]+)=((?:(?!null==)[^?])+?)\)\?0:"number"==typeof \1\?c\.__cast\(\1,[\w$]+\):"number"==typeof \1&&\(0\|\1\)===\1\?c\.__cast\(\1,[\w$]+\):"boolean"==typeof \1\?c\.__cast\(\1,[\w$]+\)\?1:0:"string"==typeof \1\?parseFloat\(\1\):parseFloat\(f\.string\(\1\)\)/g;
const CAST = /null==([\w$]+)\?0:"number"==typeof \1\?c\.__cast\(\1,[\w$]+\):"number"==typeof \1&&\(0\|\1\)===\1\?c\.__cast\(\1,[\w$]+\):"boolean"==typeof \1\?c\.__cast\(\1,[\w$]+\)\?1:0:"string"==typeof \1\?parseFloat\(\1\):parseFloat\(f\.string\(\1\)\)/g;
/** Collapse Haxe cast boilerplate to num(x) and b.engine.getGameAttribute to G, for display. */
export const clean = (s: string, max = 160) => {
  const t = s.replace(CAST_ASSIGN, "num($2)").replace(CAST, "num($1)").replace(/b\.engine\.getGameAttribute/g, "G");
  return t.length > max ? t.slice(0, max) + "…" : t;
};

type Seg = number | string; // number = literal index, "?expr" = computed, other strings = property (e.g. "h")
type Alias = { attr: string; path: Seg[]; src: string; off: number };
type Frame = {
  name: string; clsVar?: string; path: string; start: number; end: number; listener?: string; parent?: Frame;
  decl: Set<string>; alias: Map<string, Alias>; defs: Map<string, [number, number]>; kids: [number, number][];
  helper?: { name: string; param: string }; ui?: string; params?: string[];
};
export type Rec = {
  attr: string; path: Seg[]; kind: string; src: string; off: number; fn: string; clsVar?: string; cls?: string;
  fnStart: number; fnEnd: number; ui: string; via?: number; expr?: string; defs?: Record<string, string>;
};

export function buildIndex(src: string) {
  const recs: Rec[] = [], calls: any[] = [], branches: any[] = [], fns: Frame[] = [];
  const clsNames = new Map<string, string>(); // var → Haxe __name__
  const aliasRecByNode = new Map<any, Rec>();
  const stack: any[] = [];
  const text = (n: any) => src.slice(n.start, n.end);

  const patNames = (p: any): string[] =>
    !p ? [] : p.type === "Identifier" ? [p.name] : p.type === "AssignmentPattern" ? patNames(p.left)
      : p.type === "RestElement" ? patNames(p.argument) : p.type === "ArrayPattern" ? p.elements.flatMap(patNames)
      : p.type === "ObjectPattern" ? p.properties.flatMap((q: any) => patNames(q.value ?? q.argument)) : [];
  const isFn = (n: any) => n.type === "FunctionExpression" || n.type === "FunctionDeclaration" || n.type === "ArrowFunctionExpression";
  function children(n: any, f: (c: any) => void) {
    for (const k in n) {
      if (k === "type" || k === "start" || k === "end") continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === "string") f(c); }
      else if (v && typeof v.type === "string") f(v);
    }
  }
  /** Names declared in a function (params, var, inner function declarations, let/const) and its direct child function ranges. */
  function scan(fn: any, decl: Set<string>, kids: [number, number][]) {
    const visit = (n: any) => {
      if (n.type === "VariableDeclaration") for (const d of n.declarations) for (const x of patNames(d.id)) decl.add(x);
      if (n.type === "FunctionDeclaration") { decl.add(n.id.name); kids.push([n.start, n.end]); return; }
      if (isFn(n) || n.type === "ClassExpression") { kids.push([n.start, n.end]); return; }
      if (n.type === "CatchClause" && n.param) for (const x of patNames(n.param)) decl.add(x);
      children(n, visit);
    };
    if (fn.type === "Program") children(fn, visit); else visit(fn.body);
  }

  const top: Frame = { name: "<top>", path: "<top>", start: 0, end: src.length, decl: new Set(), alias: new Map(), defs: new Map(), kids: [] };
  let cur = top;
  const frameOf = (name: string) => { for (let f: Frame | undefined = cur; f; f = f.parent) if (f.decl.has(name)) return f; return top; };

  function uiOf(f: Frame): string {
    if (f.ui !== undefined) return f.ui;
    const sig = new Set<string>();
    if (f.listener && UI_LISTENER.test(f.listener)) sig.add("on" + f.listener); // not inherited: nested λs (runLater, sorters) are judged on their own
    if (f !== top) {
      // Own code only: nested functions are judged on their own.
      let at = f.start, own = "";
      for (const [s, e] of f.kids) { own += src.slice(at, s); at = e; }
      own += src.slice(at, f.end);
      for (const m of own.matchAll(UI_RE)) sig.add(m[0].replace(/[=(]$/, ""));
    }
    return (f.ui = [...sig].join(","));
  }

  function enterFrame(fn: any) {
    const parent = stack[stack.length - 2];
    let name = "λ", clsVar: string | undefined, listener: string | undefined;
    const memberName = (m: any) => (m.computed ? text(m.property) : m.property.name ?? m.property.value);
    if (parent?.type === "Property" && parent.value === fn) {
      name = parent.key.name ?? String(parent.key.value);
      // { … } is X.prototype = { … } or X.prototype = $extend(Base.prototype, { … })
      for (let i = stack.length - 3; i >= Math.max(0, stack.length - 6); i--) {
        const a = stack[i];
        if (a.type === "AssignmentExpression" && a.left.type === "MemberExpression") {
          const l = a.left;
          if (!l.computed && l.property.name === "prototype" && l.object.type === "Identifier") clsVar = l.object.name;
          break;
        }
      }
    } else if (parent?.type === "AssignmentExpression" && parent.right === fn && parent.left.type === "MemberExpression") {
      const l = parent.left;
      name = memberName(l);
      if (l.object.type === "Identifier") clsVar = l.object.name;
      else if (l.object.type === "MemberExpression" && l.object.object.type === "Identifier") clsVar = l.object.object.name;
    } else if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
      name = parent.id.name;
      if (!cur.parent?.parent) clsVar = name; // module-level `var X=function` is a Haxe class constructor; deeper ones are locals
    }
    else if (fn.id) name = fn.id.name;
    else if (parent?.type === "CallExpression" && parent.callee.type === "MemberExpression") {
      const m = /^add(\w+)Listener$/.exec(parent.callee.property.name ?? "");
      if (m) { listener = m[1]; name = "on" + listener; }
    }
    const f: Frame = { name, clsVar: clsVar ?? cur.clsVar, path: "", start: fn.start, end: fn.end, listener, parent: cur, decl: new Set(), alias: new Map(), defs: new Map(), kids: [] };
    f.path = cur === top || clsVar ? name : `${cur.path}>${name}`;
    f.params = fn.params.flatMap(patNames);
    for (const x of f.params!) f.decl.add(x);
    if (fn.type === "FunctionExpression" && fn.id) f.decl.add(fn.id.name);
    scan(fn, f.decl, f.kids);
    if (name.startsWith("_customBlock_") && fn.params[0]?.type === "Identifier") f.helper = { name: name.slice(13), param: fn.params[0].name };
    cur = f;
  }

  /** Root of an attribute access at node n (no climbing), or undefined. */
  function rootOf(n: any): Alias | undefined {
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression" && !n.callee.computed) {
      const p = n.callee.property.name, a0 = n.arguments[0];
      if (p === "getGameAttribute" && a0) return a0.type === "Literal" && typeof a0.value === "string"
        ? { attr: a0.value, path: [], src: "ga", off: a0.start + 1 }
        : { attr: "*", path: ["?" + clean(text(a0), 60)], src: "ga", off: a0.start };
      if (p === "getReserved" && a0 && isGA(n.callee.object)) return a0.type === "Literal"
        ? { attr: String(a0.value), path: [], src: "reserved", off: a0.start + 1 }
        : { attr: "*", path: ["?" + clean(text(a0), 60)], src: "reserved", off: a0.start };
      return;
    }
    if (n.type === "MemberExpression" && !n.computed) {
      const o = n.object, p = n.property.name;
      if (o.type === "MemberExpression" && !o.computed && o.property.name === "h" && isGA(o.object)) return { attr: p, path: [], src: "h", off: n.property.start };
      if (/^_[A-Za-z]/.test(p) && !p.startsWith("_customBlock_")) return { attr: p, path: [], src: "field", off: n.property.start };
      return;
    }
    if (n.type === "Identifier") {
      const a = frameOf(n.name).alias.get(n.name);
      if (a) return { ...a, off: n.start };
    }
  }
  const numLit = (a: any): number | null =>
    a.type === "Literal" && typeof a.value === "number" ? a.value
      : a.type === "UnaryExpression" && a.operator === "-" && a.argument.type === "Literal" && typeof a.argument.value === "number" ? -a.argument.value : null;
  const isGA = (n: any): boolean =>
    (n.type === "MemberExpression" && !n.computed && n.property.name === "gameAttributes") ||
    (n.type === "Identifier" && frameOf(n.name).alias.get(n.name)?.attr === "$GA");
  const seg = (m: any): Seg =>
    m.computed ? (m.property.type === "Literal" && typeof m.property.value === "number" ? m.property.value : "?" + clean(text(m.property))) : m.property.name;
  /** An alias-able value: a root followed only by subscripts (and Haxe map .h). */
  function chainOf(n: any): Alias | undefined {
    if (n.type === "MemberExpression" && (n.computed || n.property.name === "h")) {
      const c = chainOf(n.object);
      return c && { ...c, path: [...c.path, seg(n)] };
    }
    if (n.type === "MemberExpression" && !n.computed && n.property.name === "gameAttributes") return { attr: "$GA", path: [], src: "ga", off: n.start };
    return rootOf(n);
  }
  function identDefs(n: any): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    const visit = (x: any) => {
      if (x.type === "Identifier") {
        const f = frameOf(x.name), d = f.defs.get(x.name);
        if (d && !(x.name in out)) out[x.name] = clean(src.slice(d[0], d[1]), 100);
        else if (!d && f.params?.includes(x.name) && !(x.name in out)) out[x.name] = `param ${f.params.indexOf(x.name) + 1} of ${f.name}`;
      }
      if (x.type === "MemberExpression" && !x.computed) return visit(x.object);
      if (x.type === "CallExpression") return x.arguments.forEach(visit); // skip callees (c.__cast, f.string)
      if (!isFn(x)) children(x, visit);
    };
    visit(n);
    return Object.keys(out).length ? out : undefined;
  }

  /** n is a root at stack top: climb subscripts and classify the use. */
  function record(n: any, root: Alias) {
    // A field is an attribute record only when subscripted / mutated / aliased; plain `this._DRI` reads are not indexed.
    let i = stack.length - 1, node = n;
    const path = [...root.path];
    let kind = "", computedDefs: Record<string, string> | undefined, exprs: string[] = [];
    while (i > 0) {
      const p = stack[i - 1];
      if (p.type === "MemberExpression" && p.object === node) {
        if (p.computed || p.property.name === "h") {
          const s = seg(p);
          path.push(s);
          if (typeof s === "string" && s.startsWith("?")) { exprs.push(s.slice(1)); const d = identDefs(p.property); if (d) computedDefs = { ...computedDefs, ...d }; }
          node = p; i--; continue;
        }
        const prop = p.property.name;
        const g = stack[i - 2];
        if (MUTATORS.has(prop) && g?.type === "CallExpression" && g.callee === p) kind = "call:" + prop;
        else if (prop === "length") kind = "length";
        else if (g?.type === "CallExpression" && g.callee === p) kind = "call:" + prop;
        else kind = "prop:" + prop;
        break;
      }
      break;
    }
    const p = stack[i - 1];
    if (!kind) {
      if (p?.type === "AssignmentExpression" && p.left === node) kind = p.operator === "=" ? "write" : "write" + p.operator;
      else if (p?.type === "UpdateExpression") kind = "write" + p.operator;
      else if ((p?.type === "VariableDeclarator" && p.init === node && p.id.type === "Identifier") ||
        (p?.type === "AssignmentExpression" && p.right === node && p.operator === "=" && p.left.type === "Identifier")) kind = "alias";
      else if (p?.type === "CallExpression" && p.arguments.includes(node) && !VALUE_CALLEE.test(text(p.callee))) kind = "pass";
      else if (p?.type === "ForInStatement" || p?.type === "ForOfStatement") kind = "iter";
      else kind = "read";
    }
    if (root.src === "field" && path.length === 0 && kind === "read") return; // scalar field read: noise
    if (n.type === "Identifier" && node === n && kind === "read") return; // bare alias reference (Haxe cast temp): the alias record covers it
    if (root.src === "field" && kind.startsWith("prop:")) return; // e.g. this._actor.x
    const r: Rec = { attr: root.attr, path, kind, src: root.src, off: root.off, fn: cur.path, clsVar: cur.clsVar, fnStart: cur.start, fnEnd: cur.end, ui: uiOf(cur) };
    if (n.type === "Identifier") r.via = (frameOf(n.name).alias.get(n.name) as Alias).off;
    if (exprs.length) r.expr = exprs.join(" | ");
    if (computedDefs) r.defs = computedDefs;
    if (root.attr !== "$GA") recs.push(r);
    if (kind === "alias") aliasRecByNode.set(node, r);
  }

  function assignIdent(name: string, rhs: any | null) {
    const f = frameOf(name);
    const c = rhs && chainOf(rhs);
    if (c) {
      const r = aliasRecByNode.get(rhs);
      f.alias.set(name, { attr: c.attr, path: c.path, src: c.src, off: r?.off ?? c.off });
    } else f.alias.delete(name);
    if (rhs && rhs.end - rhs.start < 400) f.defs.set(name, [rhs.start, rhs.end]); else f.defs.delete(name);
    aliasRecByNode.clear();
  }

  function branchKeys(test: any, param: string, out: string[]) {
    if (test.type === "LogicalExpression" && test.operator === "||") { branchKeys(test.left, param, out); branchKeys(test.right, param, out); return; }
    if (test.type === "BinaryExpression" && (test.operator === "==" || test.operator === "===")) {
      const [a, b] = [test.left, test.right];
      const lit = a.type === "Literal" ? a : b.type === "Literal" ? b : null, id = lit === a ? b : a;
      if (lit && typeof lit.value === "string" && id.type === "Identifier" && id.name === param) out.push(lit.value);
    }
  }

  function walk(n: any) {
    stack.push(n);
    switch (n.type) {
      case "FunctionExpression": case "FunctionDeclaration": case "ArrowFunctionExpression": {
        const saved = cur;
        enterFrame(n);
        fns.push(cur);
        children(n.body.type ? { body: n.body } : n, walk);
        cur = saved; stack.pop(); return;
      }
      case "VariableDeclarator":
        if (n.init) walk(n.init);
        if (n.id.type === "Identifier") assignIdent(n.id.name, n.init);
        stack.pop(); return;
      case "AssignmentExpression":
        walk(n.right);
        if (n.left.type === "Identifier") {
          assignIdent(n.left.name, n.operator === "=" ? n.right : null);
        } else walk(n.left);
        if (n.left.type === "MemberExpression" && !n.left.computed && n.left.property.name === "__name__" && n.left.object.type === "Identifier" && n.right.type === "Literal")
          clsNames.set(n.left.object.name, String(n.right.value));
        stack.pop(); return;
      case "IfStatement":
        if (cur.helper) {
          const keys: string[] = [];
          branchKeys(n.test, cur.helper.param, keys);
          for (const key of keys) branches.push({ helper: cur.helper.name, key, start: n.start, end: n.consequent.end });
        }
        break;
      case "SwitchStatement":
        if (cur.helper && n.discriminant.type === "Identifier" && n.discriminant.name === cur.helper.param)
          for (const c of n.cases) if (c.test?.type === "Literal") branches.push({ helper: cur.helper.name, key: String(c.test.value), start: c.start, end: c.end });
        break;
      case "CallExpression": {
        const cal = n.callee;
        if (cal.type === "MemberExpression" && !cal.computed) {
          const p = cal.property.name as string, a0 = n.arguments[0];
          if (p?.startsWith("_customBlock_") && a0) {
            const lit = a0.type === "Literal" && typeof a0.value === "string";
            calls.push({
              helper: p.slice(13), key: lit ? a0.value : "?" + clean(text(a0), 80), off: lit ? a0.start + 1 : a0.start,
              nums: n.arguments.slice(1).map(numLit),
              args: clean(n.arguments.slice(1).map(text).join(","), 200),
              defs: n.arguments.slice(1).filter((a: any) => numLit(a) === null).reduce((o: any, a: any) => ({ ...o, ...identDefs(a) }), undefined),
              fn: cur.path, clsVar: cur.clsVar, fnStart: cur.start, fnEnd: cur.end, ui: uiOf(cur),
            });
          }
          if (p === "setReserved" && a0 && isGA(cal.object))
            recs.push({ attr: a0.type === "Literal" ? String(a0.value) : "*", path: [], kind: "write", src: "reserved", off: a0.start + 1, fn: cur.path, clsVar: cur.clsVar, fnStart: cur.start, fnEnd: cur.end, ui: uiOf(cur) });
        }
        const r = rootOf(n);
        if (r) record(n, r);
        break;
      }
      case "MemberExpression": {
        const r = rootOf(n);
        if (r) {
          const p = stack[stack.length - 2];
          const usedAsObj = p?.type === "MemberExpression" && p.object === n;
          const aliased = (p?.type === "VariableDeclarator" && p.init === n) || (p?.type === "AssignmentExpression" && p.right === n && p.left.type === "Identifier");
          if (r.src !== "field" || usedAsObj || aliased || (p?.type === "AssignmentExpression" && p.left === n)) record(n, r);
        }
        if (!n.computed) { walk(n.object); stack.pop(); return; } // property name is not a reference
        break;
      }
      case "Identifier": {
        const p = stack[stack.length - 2];
        const isRef = !(p?.type === "Property" && p.key === n && !p.computed) && !(p?.type === "LabeledStatement") &&
          !(p?.type === "BreakStatement" || p?.type === "ContinueStatement");
        if (isRef) { const r = rootOf(n); if (r) record(n, r); }
        break;
      }
      case "Property":
        if (!n.computed) { walk(n.value); stack.pop(); return; }
        break;
    }
    children(n, walk);
    stack.pop();
  }

  const t0 = performance.now();
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "script" }) as any;
  const parseMs = performance.now() - t0, parseRss = process.memoryUsage().rss;
  scan(ast, top.decl, top.kids);
  stack.push(ast);
  children(ast, walk);
  const walkMs = performance.now() - t0 - parseMs;

  // A container alias is used through subscripts; an alias nobody subscripts was a value read (Haxe `t=G("X")[5]` then num(t)).
  const usedVia = new Set(recs.map((r) => r.via).filter((v) => v !== undefined));
  for (const r of recs) {
    if (r.kind === "alias" && !usedVia.has(r.off)) r.kind = "read";
    if (r.src === "field" && r.kind === "read" && r.path.length === 0) r.kind = "drop"; // scalar field copied to a local
    r.cls = (r.clsVar && clsNames.get(r.clsVar)) ?? r.clsVar;
    delete r.clsVar;
  }
  const kept = recs.filter((r) => r.kind !== "drop");
  recs.length = 0; recs.push(...kept);
  for (const c of calls) { c.cls = (c.clsVar && clsNames.get(c.clsVar)) ?? c.clsVar; delete c.clsVar; }
  for (const f of fns) { uiOf(f); f.clsVar = (f.clsVar && clsNames.get(f.clsVar)) ?? f.clsVar; }
  return { recs, calls, branches, fns, stats: { parseMs, walkMs, parseRssMB: parseRss / 1e6 } };
}

export function writeDb(file: string, idx: ReturnType<typeof buildIndex>, meta: Record<string, string | number>) {
  rmSync(file, { force: true });
  const db = new Database(file);
  db.run(`create table acc(attr text, path text, kind text, src text, off int, fn text, cls text, fnStart int, fnEnd int, ui text, via int, expr text, defs text)`);
  db.run(`create table calls(helper text, key text, nums text, args text, defs text, off int, fn text, cls text, fnStart int, fnEnd int, ui text)`);
  db.run(`create table branches(helper text, key text, start int, end int)`);
  db.run(`create table meta(k text primary key, v text)`);
  db.run(`create table fns(start int, end int, fn text, cls text, ui text)`);
  const iF = db.prepare(`insert into fns values (?,?,?,?,?)`);
  const ia = db.prepare(`insert into acc values (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ic = db.prepare(`insert into calls values (?,?,?,?,?,?,?,?,?,?,?)`);
  const ib = db.prepare(`insert into branches values (?,?,?,?)`);
  const im = db.prepare(`insert into meta values (?,?)`);
  db.transaction(() => {
    for (const r of idx.recs) ia.run(r.attr, JSON.stringify(r.path), r.kind, r.src, r.off, r.fn, r.cls ?? null, r.fnStart, r.fnEnd, r.ui, r.via ?? null, r.expr ?? null, r.defs ? JSON.stringify(r.defs) : null);
    for (const c of idx.calls) ic.run(c.helper, c.key, JSON.stringify(c.nums), c.args, c.defs ? JSON.stringify(c.defs) : null, c.off, c.fn, c.cls ?? null, c.fnStart, c.fnEnd, c.ui);
    for (const b of idx.branches) ib.run(b.helper, b.key, b.start, b.end);
    for (const [k, v] of Object.entries(meta)) im.run(k, String(v));
    for (const f of idx.fns) iF.run(f.start, f.end, f.path, f.clsVar ?? null, f.ui ?? "");
  })();
  db.run(`create index acc_attr on acc(attr)`);
  db.run(`create index acc_via on acc(via)`);
  db.run(`create index calls_key on calls(key)`);
  db.run(`create index br_key on branches(key)`);
  db.run(`create index fns_start on fns(start)`);
  db.close();
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { src: { type: "string", default: DEFAULT_SRC }, out: { type: "string", default: DEFAULT_DB } } });
  const f = Bun.file(values.src!);
  const src = await f.text();
  const idx = buildIndex(src);
  const peak = process.memoryUsage().rss / 1e6;
  writeDb(values.out!, idx, { src: values.src!, size: src.length, mtime: new Date(f.lastModified).toISOString(), built: new Date().toISOString() });
  const s = idx.stats;
  console.log(`parse ${(s.parseMs / 1000).toFixed(1)} s (rss ${s.parseRssMB.toFixed(0)} MB) · walk ${(s.walkMs / 1000).toFixed(1)} s · peak rss ${peak.toFixed(0)} MB`);
  console.log(`${idx.fns.length} functions · ${idx.recs.length} accesses · ${idx.calls.length} _customBlock_ calls · ${idx.branches.length} key branches → ${values.out} (${(Bun.file(values.out!).size / 1e6).toFixed(1)} MB)`);
}
