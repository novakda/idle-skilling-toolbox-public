// Live, read-only access to the running game over CDP.
// Launch the game with --remote-debugging-port=9333 (desktop shortcut "Idle Skilling (debug)").
// The Stencyl engine lives inside the bundle's closure, so we take one reference to it: a one-shot breakpoint
// in Engine.getGameAttribute (where `this` is the engine) stores `window.__iskEngine`, then is removed.
// Usage: bun src/live.ts [--port 9333] [--keys ShrineLevels,CardDeckSelected]
import { parseArgs } from "util";

const ENGINE_METHOD = /getGameAttribute:function\((\w+)\)\{/;

/** Haxe StringMap/IntMap serialize as { h: {...} } live; the save parser returns plain objects. Match that. */
export function unwrapMaps(v: unknown): any {
  if (Array.isArray(v)) return v.map(unwrapMaps);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    // Maps are { h } (plus __id__ on object-keyed maps).
    const src = keys.includes("h") && keys.every((k) => k === "h" || k === "__id__") ? (v as any).h : v;
    return Object.fromEntries(Object.entries(src).map(([k, x]) => [k, unwrapMaps(x)]));
  }
  return v;
}

export async function connectLive(port = 9333) {
  // Short timeout: under WSL mirrored networking a closed port can hang instead of refusing.
  const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json()) as { type: string; webSocketDebuggerUrl: string; id: string }[];
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error(`no page target on port ${port} — is the game running with --remote-debugging-port=${port}?`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map<number, (m: any) => void>();
  const events: ((m: any) => void)[] = [];
  const contexts: any[] = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.executionContextCreated") contexts.push(m.params.context);
    for (const f of events) f(m);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await send("Runtime.enable");
  await new Promise((r) => setTimeout(r, 300));
  // The game runs in an iframe (static/game/index.html); its default context is the one that has `lime`.
  let game: number | undefined;
  for (const c of contexts.filter((c) => c.auxData?.isDefault)) {
    const r = await send("Runtime.evaluate", { expression: "typeof window.lime", contextId: c.id, returnByValue: true });
    if (r.result?.result?.value === "object") game = c.id;
  }
  if (game === undefined) throw new Error("game frame not found");

  const evaluate = async (expression: string) => {
    const r = await send("Runtime.evaluate", { expression, contextId: game, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed");
    return r.result?.result?.value;
  };

  /** One-shot breakpoint at the end of the first match of `re` in the bundle; stores `expr` (evaluated there) as window[name]. */
  async function grab(name: string, re: RegExp, expr: string) {
    if (await evaluate(`!!window.${name}`)) return;
    const scripts: { url: string; scriptId: string }[] = [];
    events.push((m) => { if (m.method === "Debugger.scriptParsed") scripts.push(m.params); });
    await send("Debugger.enable");
    const bundle = scripts.find((s) => /static\/game\/Qno2x\.js$/.test(s.url));
    if (!bundle) throw new Error("game bundle script not found");
    const src = (await send("Debugger.getScriptSource", { scriptId: bundle.scriptId })).result.scriptSource as string;
    const m = re.exec(src);
    if (!m) throw new Error(`${re} not found in bundle — game update?`);
    const before = src.slice(0, m.index), lineNumber = before.split("\n").length - 1;
    const columnNumber = m.index - before.lastIndexOf("\n") - 1 + m[0].length;
    const paused = new Promise<any>((r) => events.push((e) => e.method === "Debugger.paused" && r(e.params)));
    const bp = await send("Debugger.setBreakpoint", { location: { scriptId: bundle.scriptId, lineNumber, columnNumber } });
    try {
      const p = await Promise.race([paused, new Promise((_, j) => setTimeout(() => j(new Error("breakpoint not hit in 10s")), 10_000))]);
      await send("Debugger.evaluateOnCallFrame", { callFrameId: p.callFrames[0].callFrameId, expression: `window.${name} = ${expr}, 1` });
    } finally {
      await send("Debugger.removeBreakpoint", { breakpointId: bp.result.breakpointId });
      await send("Debugger.resume");
      await send("Debugger.disable");
    }
    if (!(await evaluate(`!!window.${name}`))) throw new Error(`${name} hook failed`);
  }
  const hookEngine = () => grab("__iskEngine", ENGINE_METHOD, "this");

  /** Read game attributes by name (values cloned by JSON). */
  const read = async (keys: string[]) => {
    await hookEngine();
    return (await evaluate(`JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map((k) => [k, window.__iskEngine.getGameAttribute(k)])))`)
      .then((s: string) => unwrapMaps(JSON.parse(s)))) as Record<string, unknown>;
  };

  return { read, evaluate, hookEngine, grab, close: () => ws.close() };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { port: { type: "string", default: "9333" }, keys: { type: "string", default: "CardDeckSelected,CbonusCardDropChance,ShrineLevels" } } });
  const live = await connectLive(+values.port!);
  try { console.log(JSON.stringify(await live.read(values.keys!.split(",")), null, 1)); }
  finally { live.close(); }
}
