// Fetch all wikitext from the Idle Skilling fandom wiki via MediaWiki API.
// Usage: bun scripts/wiki/fetch.ts [--test]   (--test = 5 pages only)
import { mkdirSync, writeFileSync } from "node:fs";

const API = "https://idle-skilling.fandom.com/api.php";
const UA = "idle-skilling-toolbox-wikifetch/1.0 (personal dataset build; contact: see README)";
const OUT = "data/wiki";
const test = process.argv.includes("--test");
let last = 0;

async function api(params: Record<string, string>): Promise<any> {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await Bun.sleep(wait);
  last = Date.now();
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status === 403) {
    console.error(`ABORT: HTTP ${res.status} on ${url}`);
    process.exit(2);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

export const safe = (t: string) => t.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");

mkdirSync(`${OUT}/raw`, { recursive: true });
const NS: Record<number, string> = { 0: "", 10: "Template", 14: "Category" };
const pages: { title: string; pageid: number; ns: number }[] = [];
for (const ns of [0, 10, 14]) {
  let cont: Record<string, string> = {};
  do {
    const j = await api({ action: "query", list: "allpages", apnamespace: String(ns), aplimit: "500", ...cont });
    for (const p of j.query.allpages) pages.push({ title: p.title, pageid: p.pageid, ns });
    cont = j.continue ? { apcontinue: j.continue.apcontinue } : {};
    console.log(`enumerated ns${ns}: ${pages.length} total`);
  } while (Object.keys(cont).length);
  if (test) break;
}
const todo = test ? pages.slice(0, 5) : pages;

const meta = new Map<string, any>();
for (let i = 0; i < todo.length; i += 50) {
  const batch = todo.slice(i, i + 50);
  const titles = batch.map((p) => p.title).join("|");
  const j = await api({ action: "query", prop: "revisions", rvprop: "content|timestamp", rvslots: "main", titles });
  for (const p of j.query.pages) {
    if (p.missing) continue;
    const rev = p.revisions?.[0];
    const path = `${OUT}/raw/${p.ns ? NS[p.ns] + "__" : ""}${safe(p.title)}.wikitext`;
    writeFileSync(path, rev?.slots?.main?.content ?? "");
    meta.set(p.title, { title: p.title, pageid: p.pageid, ns: p.ns, timestamp: rev?.timestamp, categories: [] as string[], raw: path });
  }
  console.log(`wikitext ${Math.min(i + 50, todo.length)}/${todo.length}`);
}
// categories, batched
for (let i = 0; i < todo.length; i += 50) {
  const titles = todo.slice(i, i + 50).map((p) => p.title).join("|");
  let cont: Record<string, string> = {};
  do {
    const j = await api({ action: "query", prop: "categories", cllimit: "max", titles, ...cont });
    for (const p of j.query.pages) for (const c of p.categories ?? []) meta.get(p.title)?.categories.push(c.title.replace(/^Category:/, ""));
    cont = j.continue?.clcontinue ? { clcontinue: j.continue.clcontinue } : {};
  } while (Object.keys(cont).length);
  console.log(`categories ${Math.min(i + 50, todo.length)}/${todo.length}`);
}
writeFileSync(`${OUT}/pages.json`, JSON.stringify([...meta.values()], null, 1));
console.log(`done: ${meta.size} pages (fetched ${new Date().toISOString()})`);
