// Capture the screen the game is showing, for tracing later (e.g. before an ascend locks it again):
// data/captures/<YYYY-MM-DD>/<name>/{screen.png, text.json, attrs.json}. Read-only over CDP.
// Usage: bun src/capture.ts --name botany        (run with the screen open; text.json feeds trace-value --text)
import { mkdirSync } from "fs";
import { parseArgs } from "util";
import { connectLive } from "./live";
import { screenText } from "./screen-text";

const { values } = parseArgs({ options: { name: { type: "string" }, port: { type: "string", default: "9333" } } });
if (!values.name) { console.error("usage: bun src/capture.ts --name <screen>"); process.exit(2); }
const dir = `data/captures/${new Date().toLocaleDateString("en-CA")}/${values.name.replace(/[^\w-]/g, "_")}`;
mkdirSync(dir, { recursive: true });

const live = await connectLive(+values.port!);
try {
  const text = await screenText(live);
  const keys = JSON.parse(await live.evaluate("JSON.stringify(Object.keys(window.__iskEngine.gameAttributes.h))") as string) as string[];
  const attrs = await live.read(keys);
  const list = await (await fetch(`http://127.0.0.1:${values.port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
  const ws = new WebSocket(list.find((t) => t.type === "page")!.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const png = await new Promise<string>((r) => { ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id === 1) r(m.result.data); }; ws.send(JSON.stringify({ id: 1, method: "Page.captureScreenshot", params: { format: "png" } })); });
  ws.close();
  await Bun.write(`${dir}/screen.png`, Buffer.from(png, "base64"));
  await Bun.write(`${dir}/text.json`, JSON.stringify(text, null, 1));
  await Bun.write(`${dir}/attrs.json`, JSON.stringify(attrs));
  console.log(`${dir}: ${text.length} strings, ${Object.keys(attrs).length} attributes, screenshot`);
} finally { live.close(); }
process.exit(0);
