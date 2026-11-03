// White-screen watcher (docs/white-screen.md): logs which path a white screen took. Read-only over CDP, no Debugger.
//   renderer died      → Inspector.targetCrashed, or the socket drops and the page target leaves /json/list
//   WebGL context lost → canvas webglcontextlost/restored (renderer alive, canvas blank)
// plus a heap/DOM sample every --every seconds, so a slow climb toward the renderer limit shows up.
// Usage: bun src/crash-watch.ts [--port 9333] [--every 60] [--out data/crash-log.jsonl]   (runs until Ctrl-C; reattaches after a relaunch)
// ⚠ While this is attached the game window will not close (observed 2026-10-26: close worked the moment it was stopped;
//   cause not traced). Stop it (Ctrl-C) before closing the game.
import { appendFileSync } from "fs";
import { parseArgs } from "util";

const { values } = parseArgs({ options: { port: { type: "string", default: "9333" }, every: { type: "string", default: "60" }, out: { type: "string", default: "data/crash-log.jsonl" } } });
const port = Number(values.port), every = Number(values.every) * 1000, out = values.out!;
const log = (event: string, data: object = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), event, ...data });
  appendFileSync(out, line + "\n");
  console.log(line);
};
const targets = async () => {
  try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json()) as { type: string; id: string; url: string; webSocketDebuggerUrl: string }[]; }
  catch { return null; }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Installed in every frame; reports the game canvas's WebGL context events through the binding.
const HOOK = `(() => { if (window.__iskCrashHook) return 'already'; window.__iskCrashHook = 1;
  const hook = (c) => { for (const e of ['webglcontextlost', 'webglcontextrestored']) c.addEventListener(e, () => window.__iskCrashLog?.(e + ' ' + c.width + 'x' + c.height)); };
  document.querySelectorAll('canvas').forEach(hook);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.tagName === 'CANVAS' && hook(n)))).observe(document, { childList: true, subtree: true });
  return document.querySelectorAll('canvas').length + ' canvas' })()`;

async function watch(page: { id: string; webSocketDebuggerUrl: string }) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map<number, (m: any) => void>(), contexts: number[] = [];
  const send = (method: string, params: object = {}) => new Promise<any>((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return; }
    if (m.method === "Inspector.targetCrashed") log("renderer-crashed", { target: page.id });
    else if (m.method === "Inspector.detached") log("detached", { reason: m.params.reason });
    else if (m.method === "Runtime.bindingCalled" && m.params.name === "__iskCrashLog") log("webgl", { what: m.params.payload });
    else if (m.method === "Runtime.executionContextCreated") { contexts.push(m.params.context.id); send("Runtime.evaluate", { expression: HOOK, contextId: m.params.context.id }); }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await send("Inspector.enable");
  await send("Performance.enable");
  await send("Runtime.addBinding", { name: "__iskCrashLog" });
  await send("Runtime.enable"); // replays existing contexts, which installs HOOK in each
  await sleep(500);
  log("attached", { target: page.id, contexts: contexts.length });
  const timer = setInterval(async () => {
    const r = await send("Performance.getMetrics");
    const m = Object.fromEntries((r.result?.metrics ?? []).map((x: { name: string; value: number }) => [x.name, x.value]));
    log("sample", { heapUsedMB: +(m.JSHeapUsedSize / 2 ** 20).toFixed(1), heapTotalMB: +(m.JSHeapTotalSize / 2 ** 20).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents });
  }, every);
  await closed;
  clearInterval(timer);
  const list = await targets();
  log("socket-closed", { cdpUp: list !== null, pageStillListed: !!list?.some((t) => t.id === page.id) });
}

log("start", { port, everySec: every / 1000 });
for (;;) {
  const page = (await targets())?.find((t) => t.type === "page");
  if (!page) { await sleep(10_000); continue; } // game not running (or not on this port): wait for a relaunch
  try { await watch(page); } catch (e) { log("error", { message: String(e) }); }
  await sleep(5_000);
}
