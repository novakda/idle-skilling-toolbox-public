// MediaWiki wikitext (data/wiki/raw) -> TiddlyWiki tiddlers (tiddlywiki/tiddlers/generated). Issue #13.
// Usage: bun scripts/wiki/to-tiddlywiki.ts      (re-runnable: wipes and rewrites the generated folder; output is deterministic)
// Anything the converter can't express stays visible as a .mw-raw block holding the original markup; counts are printed.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { parseTables } from "./parse";

export const FANDOM = "https://idle-skilling.fandom.com/wiki/";
export const fandomUrl = (title: string) => FANDOM + encodeURI(title.replace(/ /g, "_")).replace(/\?/g, "%3F").replace(/#/g, "%23");

export type Ctx = {
  title: string;
  exists?: (title: string) => boolean;
  contentTemplates?: Set<string>; // Template:X pages without parameters/parser functions: transcluded as tiddlers
  entityTable?: (origTableWikitext: string) => string | null; // data-driven replacement for a top-level table
  raws: Record<string, number>; // constructs left as raw blocks
  notes: Record<string, number>; // constructs converted with a known simplification
  extra: { title: string; caption: string; text: string; parent: string }[]; // tab tiddlers
  data?: { title: string; page: string; text: string }[]; // set = simple tables become JSON data tiddlers drawn by <<data-table>>
};
export const newCtx = (title: string, extra: Partial<Ctx> = {}): Ctx => ({ title, raws: {}, notes: {}, extra: [], ...extra });

const bump = (bag: Record<string, number>, k: string) => void (bag[k] = (bag[k] ?? 0) + 1);
export const norm = (t: string) => {
  const s = t.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const tq = (s: string) => s.replace(/"""/g, '" ""'); // keep a """-quoted attribute closed
const prettyFile = (f: string) => f.replace(/\.(png|gif|jpe?g|webp|svg)$/i, "").replace(/_/g, " ").trim();
const IMG_OPT = /^(thumb|thumbnail|frame|framed|frameless|border|left|right|center|centre|none|upright.*|baseline|middle|sub|super|top|text-top|bottom|text-bottom|\d*x?\d+\s*px|link=.*|alt=.*|class=.*|page=.*|lang=.*)$/i;
const ATTRS = /^\s*(?:[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'|]+)\s*)*$/;
const attr = (a: string, k: string) => a.match(new RegExp(`\\b${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`, "i"))?.slice(1).find((x) => x != null) ?? "";
const KEEP_CSS = /^(color|text-align|font-weight|font-style|text-decoration|vertical-align|white-space)\s*:/i;
function cleanAttrs(a: string) {
  const out: string[] = [];
  for (const k of ["class", "colspan", "rowspan", "title"]) { const v = attr(a, k); if (v) out.push(`${k}="${v}"`); }
  const css = attr(a, "style").split(";").map((d) => d.trim()).filter((d) => KEEP_CSS.test(d));
  if (css.length) out.push(`style="${css.join(";")}"`);
  return out.length ? " " + out.join(" ") : "";
}

/** MediaWiki '' / ''' / ''''' on one line -> TiddlyWiki // and '' (unclosed runs close at end of line, as MediaWiki does). */
export function quotes(line: string): string {
  if (!line.includes("''")) return line;
  const open: ("b" | "i")[] = [];
  const mark = { b: "''", i: "//" };
  const toggle = (k: "b" | "i") => {
    const at = open.lastIndexOf(k);
    if (at < 0) { open.push(k); return mark[k]; }
    const above = open.splice(at); // close what's above, close k, reopen the rest
    above.shift();
    open.push(...above);
    return [...above].reverse().map((x) => mark[x]).join("") + mark[k] + above.map((x) => mark[x]).join("");
  };
  let out = line.replace(/'{2,}/g, (run) => {
    const n = run.length;
    if (n === 2) return toggle("i");
    if (n === 3) return toggle("b");
    if (n === 4) return "'" + toggle("b");
    const extra = "'".repeat(n - 5);
    if (open.includes("b") && open.includes("i")) return toggle(open[open.length - 1]) + toggle(open[open.length - 1]) + extra; // close both, innermost first
    return toggle("b") + toggle("i") + extra;
  });
  while (open.length) out += mark[open.pop()!];
  return out;
}

export function convert(wt: string, ctx: Ctx): string {
  const tw: string[] = [], og: string[] = [];
  const S = (t: string, o = "") => (tw.push(t), og.push(o || t), `${tw.length - 1}`);
  const unstash = (s: string, from: string[]) => { for (let n = 0; n < 20 && s.includes(""); n++) s = s.replace(/(\d+)/g, (_, i) => from[+i]); return s; };
  // a converted wrapper (link, span) keeps its whole source on its opening token; orig() drops the converted label between \ue020 and \ue021
  const orig = (s: string) => { let o = unstash(s, og); while (/\ue020[^\ue020\ue021]*\ue021/.test(o)) o = o.replace(/\ue020[^\ue020\ue021]*\ue021/g, ""); return o.replace(//g, "{{!}}").replace(//g, "{{{!}}"); };
  const raw = (o: string, construct: string) => {
    bump(ctx.raws, construct);
    const body = `<$text text="""${tq(o)}"""/>`;
    return o.includes("\n")
      ? S(`\n\n<pre class="mw-raw" title="Not converted: original MediaWiki markup (${construct})">${body}</pre>\n\n`, o)
      : S(`<span class="mw-raw" title="Not converted: original MediaWiki markup (${construct})">${body}</span>`, o);
  };
  const paramIds = new Set<string>();
  const params = new Map<string, string>();

  let s = wt.replace(/\r/g, "");
  const redirect = s.match(/^\s*#REDIRECT\s*\[\[([^\]|#]+)/i);
  if (redirect) { bump(ctx.notes, "redirect -> link"); return `Redirect to [[${norm(redirect[1])}]].`; }

  s = s.replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/__[A-Z]+__/g, "");
  s = s.replace(/\[\[\s*Category\s*:[^\]]*\]\]\n?/gi, ""); // categories become tags (pages.json)
  s = s.replace(/<includeonly>[\s\S]*?<\/includeonly>/g, "").replace(/<\/?(?:noinclude|onlyinclude)>/g, "");
  s = s.replace(/<\/?(?:table-progress-tracking|mainpage-[a-z-]+)\b[^>]*>|<section\b[^>]*\/>/g, () => (bump(ctx.notes, "Fandom-only wrapper tag removed"), ""));

  // literal / special tags
  s = s.replace(/<nowiki>([\s\S]*?)<\/nowiki>/g, (m, x) => S(`<$text text="""${tq(decode(x))}"""/>`, m));
  s = s.replace(/<pre>([\s\S]*?)<\/pre>/g, (m, x) => S("\n\n```\n" + decode(x).replace(/^\n|\n$/g, "") + "\n```\n\n", m));
  s = s.replace(/<math>[\s\S]*?<\/math>/g, (m) => raw(m, "math"));
  const refs: string[] = [];
  s = s.replace(/<ref\b[^>/]*\/>/g, (m) => raw(m, "ref reuse"));
  s = s.replace(/<ref\b[^>]*>([\s\S]*?)<\/ref>/g, (m, x) => (refs.push(x), S(`<sup class="mw-ref">[${refs.length}]</sup>`, m)));
  let refsAt = false;
  s = s.replace(/<references\s*\/>/g, () => ((refsAt = true), ""));
  s = s.replace(/<gallery[^>]*>([\s\S]*?)<\/gallery>/g, (_m, body: string) => {
    bump(ctx.notes, "gallery -> list of image names");
    return "\n" + body.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => "* [[" + (/^(File|Image):/i.test(l) ? l : "File:" + l) + "]]").join("\n") + "\n";
  });
  s = s.replace(/<tabber>([\s\S]*?)<\/tabber>/g, (m, body: string) => {
    const titles: string[] = [];
    for (const part of body.split(/\|-\|/)) {
      const eq = part.indexOf("=");
      const caption = part.slice(0, eq).trim();
      const title = `${ctx.title}/tab/${caption}`;
      titles.push(title);
      ctx.extra.push({ title, caption, parent: ctx.title, text: convert(part.slice(eq + 1), { ...ctx, title }) });
    }
    bump(ctx.notes, "tabber -> <<tabs>> + tab tiddlers");
    return S(`\n\n<<tabs "${titles.map((t) => `[[${t}]]`).join(" ")}" "${titles[0]}">>\n\n`, m);
  });
  s = s.replace(/<tabview[^>]*>([\s\S]*?)<\/tabview>/g, (m, body: string) => {
    const titles = body.split("\n").map((l) => l.split("|")[0].trim()).filter(Boolean).map(norm);
    bump(ctx.notes, "tabview -> <<tabs>> over the subpages");
    return S(`\n\n<<tabs "${titles.map((t) => `[[${t}]]`).join(" ")}" "${titles[0]}">>\n\n`, m);
  });

  // {{!}} and {{{!}} must survive template argument splitting, then become table syntax before the block pass
  s = s.replace(/\{\{\{!\}\}/g, "").replace(/\{\{!\}\}/g, "").replace(/\{\{!!\}\}/g, "");
  // template parameters (pages used as templates, e.g. Builds/Mining): {{{2}}} -> <<p2>>, declared with \parameters
  for (let n = 0; n < 5 && /\{\{\{[^{}|]+(?:\|[^{}]*)?\}\}\}/.test(s); n++)
    s = s.replace(/\{\{\{([^{}|]+)(?:\|([^{}]*))?\}\}\}/g, (m, name: string, def = "") => {
      const v = "p" + name.trim().replace(/\W/g, "_");
      if (!params.has(v)) params.set(v, def);
      const tok = S(`<<${v}>>`, m);
      paramIds.add(tok);
      return tok;
    });

  // internal links (before templates so their pipes don't split template arguments)
  const image = (file: string, opts: string[], m: string) => {
    bump(ctx.notes, "image -> name chip (no image)");
    const caption = opts.filter((o) => !IMG_OPT.test(o.trim())).join("|").trim();
    const name = prettyFile(file);
    const chip = S(`<span class="mw-img"${//.test(file) ? "" : ` title="Image on the original wiki: ${file.trim().replace(/"/g, "'")}"`}>${name}</span>`, m);
    return caption ? chip + S(" <span class=\"mw-img-caption\">", "\ue020") + caption + S("</span>", "\ue021") : chip;
  };
  const link = (m: string, inner: string, trail: string) => {
    const [t0, ...rest] = inner.split("|");
    let target = t0.trim();
    if (/^(File|Image|Media)\s*:/i.test(target)) return image(target.replace(/^[^:]+:/, ""), rest, m) + trail;
    if (target.startsWith(":")) target = target.slice(1);
    let label = rest.length ? rest.join("|").trim() : t0.trim().replace(/^:/, "");
    label += trail;
    const iw = target.match(/^w:c:([^:]+):(.*)$/i);
    if (iw) return S(`<a class="tc-tiddlylink-external" href="https://${iw[1]}.fandom.com/wiki/${encodeURI(iw[2].replace(/ /g, "_"))}" target="_blank" rel="noopener noreferrer">`, m + "\ue020") + label + S("</a>", "\ue021");
    const [pg, anchor] = target.split("#");
    let page = pg.trim() ? norm(pg) : ctx.title;
    if (anchor) bump(ctx.notes, "link #anchor dropped (links to the page)");
    const ns = page.match(/^([^:]+):/)?.[1];
    if (ns === "Category") page = norm(page.slice(page.indexOf(":") + 1)); // category -> its tag tiddler
    else if (ns && ns !== "Template" && !ctx.exists?.(page))
      return S(`<a class="tc-tiddlylink-external" href="${fandomUrl(page)}" target="_blank" rel="noopener noreferrer">`, m + "\ue020") + label + S("</a>", "\ue021");
    if (!/['{}<>\[\]|]/.test(label)) return S(label === page ? `[[${page}]]` : `[[${label}|${page}]]`, m);
    return S(`<$link to="""${tq(page)}""">`, m + "\ue020") + label + S("</$link>", "\ue021");
  };
  for (let n = 0; n < 3; n++) s = s.replace(/\[\[([^\[\]\n]+?)\]\]([a-z]*)/g, (m, inner, trail) => link(orig(m) === m ? m : orig(m), inner, trail)); // innermost first: captions can hold links

  // templates, innermost first
  const template = (m: string, body: string): string => {
    const parts = body.split("|");
    const name = norm(parts[0]);
    const args = parts.slice(1);
    const lname = name.toLowerCase();
    if (/^#if\s*:/i.test(name)) {
      const cond = name.replace(/^#if\s*:/i, "").trim();
      bump(ctx.notes, "{{#if}} on a parameter -> standalone branch");
      return (cond === "" || paramIds.has(cond) ? args[1] : args[0]) ?? "";
    }
    if (/^(lc|uc):/i.test(name)) { const v = parts[0].slice(3); return lname.startsWith("lc") ? v.toLowerCase() : v.toUpperCase(); }
    if (name.startsWith("#") || name.includes(":") && !name.startsWith(":")) return raw(orig(m), `parser function ${name.split(":")[0]}`);
    if (name.startsWith(":")) {
      bump(ctx.notes, "page transclusion -> {{tiddler}}");
      return S(`{{${norm(name.slice(1))}${args.length ? "|" + args.map((a) => a.trim()).join("|") : ""}}}`, orig(m));
    }
    switch (lname) {
      case "sitename": return "Idle Skilling Wiki";
      case "pagename": case "fullpagename": return S("{{!!title}}", m);
      case "citation needed": return S('<sup class="mw-cn">[citation needed]</sup>', m);
      case "clear": return "";
      case "fp icon": bump(ctx.notes, "{{FP icon}} -> link (icon dropped)"); return S(`<span class="fp-icon">[[${norm(args[1] ?? args[0])}]]</span>`, m);
      case "color": return S(`<span style="color:${(args[0] ?? "").trim()};">`, m + "\ue020") + (args[1] ?? "") + S("</span>", "\ue021");
      case "tl": return S(`<code>&#123;&#123;[[${norm(args[0] ?? "")}|Template:${norm(args[0] ?? "")}]]&#125;&#125;</code>`, m);
      case "documentation": case "doc": return ctx.exists?.(`${ctx.title}/doc`) ? S(`\n\n{{${ctx.title}/doc}}\n\n`, m) : "";
    }
    if (ctx.contentTemplates?.has(`Template:${name}`) && !args.length) {
      bump(ctx.notes, "content template -> {{Template:X}}");
      return S(`{{Template:${name}}}`, orig(m));
    }
    return raw(orig(m), `template ${name}`);
  };
  for (let n = 0; n < 30 && /\{\{(?!\{)[^{}]*?\}\}/.test(s); n++) s = s.replace(/\{\{(?!\{)([^{}]*?)\}\}/g, template);
  s = s.replace(/\{\{[\s\S]*?\}\}/g, (m) => raw(orig(m), "unbalanced braces"));

  // external links (fandom links to pages we have become internal links)
  s = s.replace(/\[((?:https?:)?\/\/[^\s\]]+)(?:[ \t]+([^\]\n]*))?\]/g, (m, url: string, label?: string) => {
    const local = url.startsWith(FANDOM) ? norm(decodeURIComponent(url.slice(FANDOM.length))) : "";
    if (local && ctx.exists?.(local)) return S(`[[${label?.trim() || local}|${local}]]`, m);
    if (!label?.trim()) return S(`[ext[${url}]]`, m);
    return S(`<a class="tc-tiddlylink-external" href="${url}" target="_blank" rel="noopener noreferrer">`, m + "\ue020") + label.trim() + S("</a>", "\ue021");
  });

  // inline HTML: keep what TiddlyWiki renders, drop Fandom styling, turn collapsibles into <details> / $reveal
  const stack: string[] = [];
  s = s.replace(/<div\b([^>]*)>|<\/div>/gi, (m, a?: string) => {
    if (a === undefined) return stack.pop() ?? "";
    const cls = attr(a, "class"), id = attr(a, "id");
    const toggle = cls.match(/mw-customtoggle-(\S+)/)?.[1];
    if (toggle && !wt.includes(`mw-customcollapsible-${toggle}`)) { stack.push(S("</span>")); return S("<span>", m); } // no target on the wiki either
    if (toggle) {
      const st = `$:/state/is/toggle/${ctx.title}/${toggle}`;
      bump(ctx.notes, "custom toggle -> $button + $reveal");
      stack.push(S("</$button>"));
      return S(`<$button class="tc-btn-invisible mw-toggle" set="""${tq(st)}""" setTo={{{ [[${st}]get[text]match[open]then[closed]else[open]] }}}>`, m);
    }
    if (/mw-customcollapsible-/.test(id)) {
      stack.push(S("\n\n</$reveal>\n\n"));
      return S(`\n\n<$reveal state="""${tq(`$:/state/is/toggle/${ctx.title}/${id.replace("mw-customcollapsible-", "")}`)}""" type="match" text="open">\n\n`, m);
    }
    if (/(^|\s)mw-collapsible(\s|$)/.test(cls)) {
      bump(ctx.notes, "collapsible -> <details>");
      stack.push(S("\n\n</details>\n\n"));
      return S(`\n\n<details class="mw-collapsible"${/mw-collapsed/.test(cls) ? "" : " open"}>\n\n<summary>\n\n${attr(a, "data-expandtext") || "Show / hide"}\n\n</summary>\n\n`, m);
    }
    stack.push(S("\n\n</div>\n\n"));
    return S(`\n\n<div${cleanAttrs(a)}>\n\n`, m);
  });
  s = s.replace(/<center\b[^>]*>/gi, (m) => S('\n\n<div class="mw-center">\n\n', m)).replace(/<\/center>/gi, (m) => S("\n\n</div>\n\n", m));
  s = s.replace(/<(span|p|font|big|small|u|s|b|i|sup|sub|code|blockquote|cite|hr|br)\b([^>]*?)(\/?)>/gi, (m, tag: string, a: string, self: string) =>
    S(`<${tag.toLowerCase()}${cleanAttrs(a)}${self || (/^(hr|br)$/i.test(tag) ? "/" : "")}>`, m));

  s = s.replace(//g, "{|").replace(//g, "|");
  // plain text that TiddlyWiki would read as markup: a < that starts no tag (<< is a macro call), // ,, ^^ ~~ __ @@ (inline formatting). URLs (://) are left alone.
  s = s.replace(/<(?![a-zA-Z\/!])/g, "&lt;").replace(/(?<!:)\/\//g, "/&#47;").replace(/,,/g, ",&#44;").replace(/\^\^/g, "^&#94;").replace(/~~/g, "~&#126;").replace(/__/g, "_&#95;").replace(/@@/g, "@&#64;");
  s = s.split("\n").map(quotes).join("\n");

  // ---------- block pass ----------
  const blocks = (text: string, top: boolean): string => {
    const L = text.split("\n");
    const out: string[] = [];
    const blank = () => { if (out.length && out[out.length - 1] !== "") out.push(""); };
    for (let i = 0; i < L.length; i++) {
      const t = L[i].trim();
      if (t.startsWith("{|")) {
        let depth = 0, j = i;
        for (; j < L.length; j++) {
          const u = L[j].trim();
          if (u.startsWith("{|")) depth++;
          else if (u.startsWith("|}") && --depth === 0) break;
        }
        blank(); out.push(table(L.slice(i, j + 1), top), ""); i = j;
        continue;
      }
      const h = t.match(/^(={1,6})\s*(.+?)\s*\1$/);
      if (h) { blank(); out.push("!".repeat(h[1].length) + " " + h[2]); continue; }
      if (/^-{4,}$/.test(t)) { blank(); out.push("---", ""); continue; }
      if (/^[*#:;]/.test(t)) {
        if (out.length && out[out.length - 1] !== "" && !/^[*#:;]/.test(out[out.length - 1])) out.push("");
        const dl = t.match(/^(;+)\s*([^:]*?)\s*:\s*(.+)$/);
        out.push(...(dl ? [`${dl[1]} ${dl[2]}`, `: ${dl[3]}`] : [t]));
        continue;
      }
      if (out.length && /^[*#:;]/.test(out[out.length - 1]) && t) out.push("");
      out.push(t);
    }
    return out.join("\n");
  };

  type Cell = { hdr: boolean; attrs: string; text: string };
  const table = (lines: string[], top: boolean): string => {
    const tAttrs = lines[0].trim().slice(2);
    let caption = "";
    const rows: Cell[][] = [];
    let row: Cell[] | null = null, cur: Cell | null = null;
    for (let k = 1; k < lines.length - 1; k++) {
      const line = lines[k], t = line.trim();
      if (t.startsWith("{|")) { // nested table: belongs to the current cell
        let depth = 0, j = k;
        for (; j < lines.length - 1; j++) { const u = lines[j].trim(); if (u.startsWith("{|")) depth++; else if (u.startsWith("|}") && --depth === 0) break; }
        const nested = lines.slice(k, j + 1).join("\n");
        if (cur) cur.text += "\n" + nested; else { row = [{ hdr: false, attrs: "", text: nested }]; rows.push(row); cur = row[0]; }
        k = j;
        continue;
      }
      if (t.startsWith("|+")) { caption = t.slice(2).split("|").pop()!.trim(); continue; }
      if (t.startsWith("|-")) { row = null; cur = null; continue; }
      if (t.startsWith("|") || t.startsWith("!")) {
        const hdr = t[0] === "!";
        const segs = t.slice(1).split(hdr ? /!!|\|\|/ : /\|\|/);
        if (!row) { row = []; rows.push(row); }
        for (const seg of segs) {
          const bar = seg.indexOf("|");
          const cell = bar >= 0 && ATTRS.test(seg.slice(0, bar)) ? { hdr, attrs: seg.slice(0, bar), text: seg.slice(bar + 1) } : { hdr, attrs: "", text: seg };
          row.push(cell);
          cur = cell;
        }
        continue;
      }
      if (cur) cur.text += "\n" + line;
      else if (t) { row = [{ hdr: false, attrs: "", text: line }]; rows.push(row); cur = row[0]; }
    }
    const cls = attr(tAttrs, "class"), id = attr(tAttrs, "id");
    let summary = caption;
    const width = Math.max(1, ...rows.map((r) => r.reduce((n, c) => n + (Number(attr(c.attrs, "colspan")) || 1), 0)));
    if (/(^|\s)mw-collapsible(\s|$)/.test(cls) && !summary && rows[0]?.length === 1 && rows[0][0].hdr && (Number(attr(rows[0][0].attrs, "colspan")) || 1) >= width && width > 1) {
      summary = rows.shift()![0].text.trim();
    }

    let body = top && ctx.entityTable ? ctx.entityTable(orig(lines.join("\n"))) : null;
    if (body) bump(ctx.notes, "table -> data-driven entity-table");
    if (!body) {
      // text on the marker line is inline in MediaWiki ("!#" is a header reading #, not a list); only following lines can start blocks
      const conv = rows.map((r) => r.map((c) => { const t = /^[ \t]*\n/.test(c.text) ? c.text.trim() : c.text.trim().replace(/^[*#:;!]/, (ch) => `&#${ch.charCodeAt(0)};`); const out = blocks(t, false).trim(); return { ...c, out, block: out.includes("\n") || /^(!|\*|#|;|:|---)/.test(out) }; }));
      const spans = conv.some((r) => r.some((c) => /\b(colspan|rowspan)\s*=/i.test(c.attrs)));
      const pipe = !spans && conv.every((r) => r.every((c) => !c.block && !c.out.includes("|") && !/^[~<>^,!]/.test(c.out) && !/^[<>~]$/.test(c.out)));
      const classes = ["mw-table", ...cls.split(/\s+/).filter((c) => c && !/^mw-/.test(c))].join(" ");
      // simple table (header row on top, header cells elsewhere only in column 1) -> data tiddler + shared procedure
      const simple = ctx.data && pipe && conv.length > 1 && conv[0].every((c) => c.hdr) && conv.slice(1).every((r) => r.every((c, i) => !c.hdr || i === 0)) && !conv.some((r) => r.some((c) => c.out.includes("<<")));
      if (simple) {
        const title = `${ctx.title}/table ${ctx.data!.length + 1}`;
        const key = (out: string) => { const t = out.replace(/<[^>]*>/g, "").replace(/\[\[([^|\]]*)(?:\|[^\]]*)?\]\]/g, "$1").trim(); return gameNumber(t) ?? t; };
        const width = Math.max(...conv.map((r) => r.length));
        const num = Array.from({ length: width }, (_, i) => { const ks = conv.slice(1).map((r) => r[i] ? key(unstash(r[i].out, tw)) : "").filter((k) => k !== "" && k !== "-"); return ks.length > 0 && ks.every((k) => typeof k === "number"); });
        const data: Record<string, string> = { head: JSON.stringify({ c: conv[0].map((c) => unstash(c.out, tw)), num }) };
        conv.slice(1).forEach((r, i) => (data[i] = JSON.stringify({ c: r.map((c) => unstash(c.out, tw)), s: r.map((c) => key(unstash(c.out, tw))), ...(r[0]?.hdr ? { h: 1 } : {}) })));
        ctx.data!.push({ title, page: ctx.title, text: JSON.stringify(data) });
        bump(ctx.notes, "table -> data tiddler + data-table");
        body = (caption && !summary ? `''${caption}''\n\n` : "") + `<$transclude $variable="data-table" src="""${tq(title)}""" state="""$:/state/is/table/${tq(title)}"""/>`;
      } else if (pipe) {
        body = [`|${classes}|k`, ...(caption && !summary ? [`|${caption}|c`] : []), ...conv.map((r) => "|" + r.map((c) => (c.hdr ? "!" : "") + (c.out || " ")).join("|") + "|")].join("\n");
      } else {
        bump(ctx.notes, "table -> HTML table (spans or block content)");
        const cell = (c: (typeof conv)[0][0]) => {
          const tag = c.hdr ? "th" : "td";
          const a = cleanAttrs(c.attrs.replace(/\bclass\s*=\s*("[^"]*"|\S+)/i, ""));
          return c.block ? `<${tag}${a}>\n\n${c.out}\n\n</${tag}>` : `<${tag}${a}>${c.out}</${tag}>`;
        };
        body = [`<table class="${classes}">`, ...(caption && !summary ? [`<caption>${caption}</caption>`] : []), ...conv.map((r) => `<tr>${r.map(cell).join("")}</tr>`), "</table>"].join("\n");
      }
    }
    if (/mw-customcollapsible-/.test(id)) {
      const st = `$:/state/is/toggle/${ctx.title}/${id.replace("mw-customcollapsible-", "")}`;
      return `<$reveal state="""${tq(st)}""" type="match" text="open">\n\n${body}\n\n</$reveal>`;
    }
    if (/(^|\s)mw-collapsible(\s|$)/.test(cls)) {
      bump(ctx.notes, "collapsible -> <details>");
      return `<details class="mw-collapsible"${/mw-collapsed/.test(cls) ? "" : " open"}>\n\n<summary>\n\n${summary || attr(tAttrs, "data-expandtext") || "Show table"}\n\n</summary>\n\n${body}\n\n</details>`;
    }
    return body;
  };

  let text = blocks(s, true);
  text = unstash(text, tw).replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  if (refs.length) {
    const list = refs.map((r) => "# " + convert(r, { ...ctx }).replace(/\s*\n+\s*/g, " ")).join("\n");
    bump(ctx.notes, "ref -> numbered note");
    text = refsAt ? text.replace("", "\n\n" + list + "\n\n") : text + "\n\n!! Notes\n\n" + list;
  }
  text = text.replace(//g, "");
  if (params.size) text = `\\parameters (${[...params].map(([k, d]) => `${k}:"${d.replace(/"/g, "")}"`).join(", ")})\n\n` + text;
  return text;
}

// ====================================================================================================================
// build
// ====================================================================================================================
type Page = { title: string; pageid: number; ns: number; timestamp: string; categories: string[]; raw: string };
type Tid = Record<string, string>;

/** Entity kinds made from dataset rows: one tiddler per thing, fields = the table's columns.
 *  A table joins a kind when every row has a name column (or, with imageName, an image to name it by) and the `need` columns;
 *  `sections` limits it to tables under those headings; `sectionField` copies the heading into a field (it also keeps
 *  same-named things under different headings from merging); `prefixField` keeps the name header's group ("Pet Rock family / Name"). Several entries may share a kind: their rows merge by name. */
export type Kind = { kind: string; plural: string; ds: string | string[]; name: string[]; need?: string[]; skip?: string[]; sections?: string[]; imageName?: boolean; sectionField?: string; prefixField?: string; rename?: Record<string, string>; alias?: Record<string, string>; facet: string; facetLabel: string };
const REALM = (n: string) => [`${n} / Name_2`];
export const KINDS: Kind[] = [
  { kind: "Monster", plural: "Monsters", ds: "zones", name: ["Monster_2", "Monsters_2", "Name", "Monster"], alias: { health: "hp", "card-bonus": "bonus" }, facet: "source-page", facetLabel: "zones" },
  { kind: "Card", plural: "Cards (all)", ds: ["cards", "botany"], name: ["Name"], need: ["Bonus", "Zone"], skip: ["Cards/By Bonus"], rename: { col5: "1 star", col6: "5 star", col7: "6 star" }, facet: "source-page", facetLabel: "card pages" },
  // the skill pages' "Cards" tables name a card and say what it does there; their Bonus text is longer than the card pages' one
  { kind: "Card", plural: "Cards (all)", ds: ["perks", "rebirth", "events"], name: ["Card_2"], alias: { bonus: "benefit" }, facet: "source-page", facetLabel: "card pages" },
  { kind: "Pet", plural: "Pets (all)", ds: "hatchery", name: ["Name"], need: ["ID"], facet: "genetic", facetLabel: "genetics" },
  { kind: "Gene", plural: "Genes", ds: "hatchery", name: ["Genetics / Genetic Name"], facet: "type", facetLabel: "types" },
  { kind: "Potion", plural: "Potions", ds: ["apothecary", "botany", "tilling", "resources"], name: ["Potion_2", "Botany Potions List / Potion_2"], facet: "section", facetLabel: "rarities" },
  { kind: "Crop", plural: "Crops", ds: ["tilling", "resources"], name: ["Crop Requirements / Crop_2"], facet: "section", facetLabel: "sections" },
  { kind: "Plant", plural: "Plants", ds: ["botany", "resources"], name: ["Plant Requirements / Plant_2"], facet: "section", facetLabel: "sections" },
  { kind: "Trinket", plural: "Trinkets", ds: "smithing", name: ["Item Name"], facet: "source-page", facetLabel: "tiers" },
  { kind: "Ore", plural: "Ores", ds: ["mining", "resources"], name: ["Ores_2"], facet: "section", facetLabel: "sections" },
  { kind: "Raid boss", plural: "Raid bosses", ds: "raids", name: ["Boss_2"], facet: "section", facetLabel: "sections" },
  { kind: "Crypt monster", plural: "Crypt monsters", ds: "crypt", name: ["Name"], facet: "section", facetLabel: "sections" },
  { kind: "Gem shop item", plural: "Gem shop items", ds: "gem_shop", name: ["Item_2", "Package_2"], facet: "section", facetLabel: "shop tabs" },
  { kind: "Construction upgrade", plural: "Construction upgrades", ds: "construction", name: ["Upgrade"], facet: "section", facetLabel: "domains" },
  { kind: "Fish", plural: "Fish", ds: ["fishing", "resources"], name: ["Name"], sections: ["Small Fish", "Medium Fish", "Large Fish"], need: ["Level Required"], facet: "section", facetLabel: "sizes" },
  { kind: "Treasure", plural: "Treasures", ds: ["spelunking", "resources"], name: ["Name"], sections: ["Treasure"], facet: "source-page", facetLabel: "pages" },
  { kind: "Spelunking perk", plural: "Spelunking perks", ds: "spelunking", name: ["Perk"], sections: ["Learn"], facet: "source-page", facetLabel: "pages" },
  { kind: "Perk", plural: "Perks", ds: "perks", name: ["Description", "Perk_2"], sectionField: "tree", facet: "tree", facetLabel: "trees" },
  { kind: "Training perk", plural: "Training perks", ds: "train", name: ["Effect"], sections: ["Training Perks"], facet: "source-page", facetLabel: "pages" },
  { kind: "Mastery task", plural: "Mastery tasks", ds: "mastery", name: Array.from({ length: 10 }, (_, i) => `${i + 1} Mastery Point${i ? "s" : ""} per Task / Task`), facet: "section", facetLabel: "sets" },
  { kind: "Arcade task", plural: "Arcade tasks", ds: "arcade", name: ["Task"], facet: "section", facetLabel: "task sets" },
  { kind: "Golden ball upgrade", plural: "Golden ball upgrades", ds: "arcade", name: ["Name"], sections: ["Golden Ball Upgrades"], facet: "section", facetLabel: "sections" },
  { kind: "Poker hand", plural: "Poker hands", ds: "arcade", name: ["Name"], sections: ["Poker Cards"], facet: "source-page", facetLabel: "pages" },
  { kind: "Asylum monster", plural: "Asylum monsters", ds: "asylum", name: ["Monster_2", "Boss"], facet: "section", facetLabel: "sections" },
  { kind: "Booster", plural: "Boosters and mutators", ds: ["boosters", "resources"], name: ["Name"], imageName: true, sections: ["Boosters", "Mutators", "Misc. Mutators"], facet: "section", facetLabel: "sections" },
  // Tinkering crafts the same boosters; its Effect column words them differently, so it lands in its own field and the rows merge
  { kind: "Booster", plural: "Boosters and mutators", ds: "tinkering", name: [], imageName: true, sections: ["Boosters and Mutators"], rename: { Effect: "Crafting effect" }, facet: "section", facetLabel: "sections" },
  { kind: "Tinkering item", plural: "Tinkering items", ds: "tinkering", name: [], imageName: true, sections: ["Weapons", "Helmets", "Shirts", "Pants", "Off-hands", "Pendants"], facet: "section", facetLabel: "slots" },
  { kind: "Fight skill", plural: "Fight skills", ds: "fight", name: [], imageName: true, sections: ["Attacks", "Buffs/Utility", "Special"], facet: "section", facetLabel: "types" },
  { kind: "Craft", plural: "Crafts", ds: ["fight", "rebirth", "mining"], name: ["Food_2", "Craft_2", "Name_2"], facet: "source-page", facetLabel: "pages" },
  { kind: "Event shop item", plural: "Event shop items", ds: "events", name: ["Item"], sections: ["Event Store"], facet: "source-page", facetLabel: "pages" },
  { kind: "Crystal", plural: "Crystals", ds: "crystals", name: ["Crystal Color_2"], sectionField: "skill", facet: "skill", facetLabel: "skills" },
  { kind: "Flame", plural: "Lord's Lair flames", ds: "lord_s_lair", name: ["Flame"], facet: "source-page", facetLabel: "pages" },
  { kind: "Realm minion", plural: "Realm minions", ds: "realm", name: [...REALM("Little Piggy family"), ...REALM("Pet Rock family"), ...REALM("Babby Egg family"), ...REALM("Ogre Spawn family"), ...REALM("Special Minions")], prefixField: "family", facet: "family", facetLabel: "families" },
  { kind: "Realm trait", plural: "Realm traits", ds: "realm", name: ["Full Trait list / Traits_3", "Traits given by the Orb Tower / Trait_2"], facet: "section", facetLabel: "sections" },
  { kind: "Blessing", plural: "Blessings", ds: "realm", name: REALM("Blessings list"), facet: "source-page", facetLabel: "pages" },
  { kind: "Shrine upgrade", plural: "Shrine upgrades", ds: "realm", name: REALM("Shrine upgrades"), facet: "source-page", facetLabel: "pages" },
  { kind: "Realm plot", plural: "Realm plots", ds: "realm", name: ["Plot list / Name"], facet: "source-page", facetLabel: "pages" },
  { kind: "Realm fruit", plural: "Realm fruits", ds: "realm", name: ["Fruit list / Fruit_2"], facet: "source-page", facetLabel: "pages" },
  { kind: "Vending machine goodie", plural: "Vending machine goodies", ds: "realm", name: ["Vending Machine goodies / Upgrade_2"], facet: "source-page", facetLabel: "pages" },
  { kind: "Crystal eye shop item", plural: "Crystal eye shop items", ds: "realm", name: ["Crystal Eye Shop / Name"], facet: "source-page", facetLabel: "pages" },
];

/** n-up layout: a table whose header run repeats with _2/_3 suffixes (Name | Level | Name_2 | Level_2: two things per row)
 *  -> one column block per thing. Else one block. The first block must hold a name column. */
export function nupBlocks(headers: string[], isName: (h: string) => boolean): string[][] {
  const base = (h: string) => h.replace(/_\d+$/, "");
  for (let p = 2; p * 2 <= headers.length; p++) {
    if (headers.length % p) continue;
    const b0 = headers.slice(0, p);
    if (!b0.some(isName)) continue;
    if (headers.every((h, i) => base(h) === base(headers[i % p]))) return Array.from({ length: headers.length / p }, (_, i) => headers.slice(i * p, i * p + p));
  }
  return [headers];
}

/** Rows of an n-up table -> one row per thing under the first block's headers, column-major (left column top to bottom,
 *  then the next column). Empty slots are dropped. Keys starting with _ (page, section, table) carry over. */
export function unpivot(rows: Record<string, any>[], blocks: string[][]): Record<string, any>[] {
  if (blocks.length < 2) return rows;
  const has = (r: Record<string, any>, h: string) => r[h] != null && String(r[h]).replace(/[\s\u200b]/g, "") !== ""; // zero-width-space filler cells count as empty
  return blocks.flatMap((b) => rows.flatMap((r) => {
    if (!b.some((h) => has(r, h))) return [];
    const v: Record<string, any> = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith("_") && k !== "_images"));
    b.forEach((h, j) => { if (has(r, h)) { v[blocks[0][j]] = r[h]; if (r[h + "_raw"] != null) v[blocks[0][j] + "_raw"] = r[h + "_raw"]; } });
    // ponytail: datasets keep one image list per row (column order), so it splits evenly across the row's things; an uneven split keeps none
    const present = blocks.filter((x) => x.some((h) => has(r, h))), imgs: string[] = r._images ?? [], per = imgs.length / present.length, at = present.indexOf(b) * per;
    if (Number.isInteger(per) && per > 0) v._images = imgs.slice(at, at + per);
    return [v];
  }));
}

/** Hand-written lists whose every line is exactly one link: [start line, end line) and the link targets. */
export function linkLists(text: string, min = 3): { start: number; end: number; targets: string[] }[] {
  const L = text.split("\n"), out: { start: number; end: number; targets: string[] }[] = [];
  const target = (l: string) => { const m = l.match(/^\*\s*\[\[([^\[\]]+)\]\]\s*$/); return m ? m[1].split("|").pop()!.trim() : null; };
  for (let i = 0; i < L.length; i++) {
    if (target(L[i]) == null) continue;
    let j = i;
    while (j < L.length && target(L[j]) != null) j++;
    if (j - i >= min) out.push({ start: i, end: j, targets: L.slice(i, j).map((l) => target(l)!) });
    i = j;
  }
  return out;
}
/** Game number text -> number for sorting: 784, 1,000, 2.5%, 5859K, 1.13B, 286QQ (K M B T, then Q QQ QQQ = 1e15 1e18 1e21, as the game prints them). */
export function gameNumber(v: string): number | null {
  const m = v.trim().match(/^([+-]?(?:\d{1,3}(?:,\d{3})+|\d*)(?:\.\d+)?)\s*(K|M|B|T|Q{1,3}|%)?$/i);
  if (!m || !/\d/.test(m[1])) return null;
  const pow: Record<string, number> = { K: 3, M: 6, B: 9, T: 12, Q: 15, QQ: 18, QQQ: 21 };
  return Number(m[1].replace(/,/g, "")) * 10 ** (pow[(m[2] ?? "").toUpperCase()] ?? 0);
}
const RESERVED = new Set(["title", "text", "tags", "type", "list", "caption", "created", "modified", "creator", "modifier", "color", "icon", "bag", "revision", "draft.of", "draft.title", "plugin-type", "module-type", "library", "name", "source", "section", "row", "entity"]);

/** Column header -> field name, after dropping header segments shared by the whole table ("Crop Requirements / ..."). */
export function fieldNames(headers: string[], nameCol: string | undefined, k: Kind) {
  const segs = headers.map((h) => h.split(" / "));
  let common = 0;
  while (segs.every((x) => x.length > common + 1 && x[common] === segs[0][common])) common++;
  const map = new Map<string, { field: string; label: string }>();
  for (const [i, h] of headers.entries()) {
    const label = k.rename?.[h] ?? segs[i].slice(common).join(" / ").replace(/_\d+$/, "");
    // the page keeps its header for the name column (Potion, Task) unless another column has that header too (Monster | Monster); explorers say Name
    if (h === nameCol) { map.set(h, { field: "name", label: headers.some((x, j) => j !== i && x.replace(/_\d+$/, "") === h.replace(/_\d+$/, "")) ? "Name" : label }); continue; }
    let f = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value";
    f = k.alias?.[f] ?? f;
    if (RESERVED.has(f)) f += "-value";
    for (let n = 2, base = f; [...map.values()].some((x) => x.field === f); n++) f = `${base}-${n}`; // repeated header (Material Costs | Material Costs): -2, -3
    map.set(h, { field: f, label });
  }
  return map;
}

if (import.meta.main) {
  const OUT = "tiddlywiki/tiddlers/generated";
  const pages: Page[] = JSON.parse(readFileSync("data/wiki/pages.json", "utf8"));
  const titles = new Set(pages.map((p) => p.title));
  const exists = (t: string) => titles.has(t);
  const wikitext = new Map(pages.map((p) => [p.title, readFileSync(p.raw, "utf8")]));
  const isCode = (wt: string) => /\{\{\{|\{\{\s*#|#invoke|<includeonly|<onlyinclude|<infobox|<templatedata/i.test(wt);
  const contentTemplates = new Set(pages.filter((p) => p.ns === 10 && !isCode(wikitext.get(p.title)!)).map((p) => p.title));
  const MAINT = new Set(["Pages with script errors", "Pages with broken file links"]);

  // ---------- entities from datasets ----------
  const ds = (name: string): any[] => JSON.parse(readFileSync(`data/wiki/datasets/${name}.json`, "utf8"));
  const entities: Tid[] = [];
  const tableIndex = new Map<string, { kind: Kind; table: number; fields: string[]; labels: string[] }>(); // page + first-row key
  // table key: the first row without images (the committed datasets were parsed with per-row image dedupe; the converter re-parses for images)
  const strip = (r: any) => Object.fromEntries(Object.entries(r).filter(([k]) => !["_page", "_section", "_table", "_caption", "_images"].includes(k)));
  const kindColumns = new Map<string, Map<string, string>>(); // kind -> field -> label (explorer columns)
  const kindState = new Map<string, { used: Set<string>; byKey: Map<string, Tid[]> }>(); // shared by KINDS entries of one kind
  const pageTables = new Map<string, ReturnType<typeof parseTables>>(); // column order (dataset rows skip empty cells)
  const merges: Record<string, number> = {};
  for (const k of KINDS) {
    const rows = [k.ds].flat().flatMap(ds);
    const groups = new Map<string, any[]>();
    for (const r of rows.filter((r) => !k.skip?.includes(r._page) && (!k.sections || k.sections.includes(r._section)))) groups.set(`${r._page}\u0000${r._table}`, [...(groups.get(`${r._page}\u0000${r._table}`) ?? []), r]);
    if (!kindState.has(k.kind)) kindState.set(k.kind, { used: new Set(), byKey: new Map() });
    const { used, byKey } = kindState.get(k.kind)!, cols = kindColumns.get(k.kind) ?? new Map<string, string>([["name", "Name"]]);
    kindColumns.set(k.kind, cols);
    const nameOf = (r: any): { col: string; name: string } | null => {
      const col = k.name.find((c) => r[c] != null && String(r[c]).trim() && r[c] !== "-");
      if (col) return { col, name: String(r[col]) };
      return k.imageName && r._images?.length ? { col: "", name: prettyFile(r._images[0]) } : null;
    };
    for (let g of groups.values()) {
      const page: string = g[0]._page;
      if (!pageTables.has(page)) pageTables.set(page, parseTables(wikitext.get(page)!));
      const pt = pageTables.get(page)![g[0]._table];
      if (pt.rows.length === g.length) g = g.map((r, i) => ({ ...r, _images: (pt.rows[i] as any)._images })); // images per cell, repeats kept
      const headers = pt.headers; // all columns, empty image columns too: they keep the repeat visible
      const blocks = nupBlocks(headers, (h) => k.name.includes(h));
      const vrows = unpivot(g, blocks);
      if (!vrows.length || !vrows.every((r) => nameOf(r) && (k.need ?? []).every((c) => r[c] != null))) continue; // whole tables only
      const cols0 = blocks[0].filter((h) => vrows.some((r) => r[h] != null)), tableName = cols0.find((h) => k.name.includes(h)), tmap = fieldNames(cols0, tableName, k);
      const fields = [...(tableName ? [] : ["name"]), ...(k.sectionField ? [k.sectionField] : []), ...(k.prefixField ? [k.prefixField] : []), ...cols0.map((h) => tmap.get(h)!.field)];
      // a thing named by its image: the name column takes the header of the image column (Item, Booster, Image)
      const imageHead = tableName ? "" : (blocks[0].find((h) => !vrows.some((r) => r[h] != null)) ?? "").split(" / ").pop()!.replace(/_\d+$/, "").replace(/^col\d+$/, "");
      const labels = [...(tableName ? [] : [imageHead || "Name"]), ...[k.sectionField, k.prefixField].filter(Boolean).map((f) => f!.charAt(0).toUpperCase() + f!.slice(1)), ...cols0.map((h) => tmap.get(h)!.label)];
      if (vrows.some((r) => r._images?.length)) { fields.push("wiki-images"); labels.push("Images"); }
      // the page's table, drawn from the kind's tiddlers; tables already showing the section/prefix (all rows alike) don't repeat it
      const drop = new Set([k.sectionField, k.prefixField].filter((f) => f && new Set(vrows.map((r) => (f === k.sectionField ? r._section || r._page : (nameOf(r)!.col.split(" / ").slice(0, -1).join(" / "))))).size < 2));
      tableIndex.set(`${page}\u0000${JSON.stringify(strip(g[0]))}`, { kind: k, table: g[0]._table, fields: fields.filter((f) => !drop.has(f)), labels: labels.filter((_, i) => !drop.has(fields[i])) });
      vrows.forEach((r, row) => {
        const { col: nameCol, name: rawName } = nameOf(r)!;
        const fmap = fieldNames(cols0, nameCol || undefined, k);
        const name = rawName.trim(), safe = name.replace(/[\[\]{}|]/g, "").trim(); // titles can't hold [ ] { } |; the name field keeps them ("[+%] Damage")
        const here = `[[${r._page}#${r._table}]]`, data: Tid = {};
        if (k.sectionField) data[k.sectionField] = r._section || r._page; // no heading: the page (Crystals/Mining)
        if (k.prefixField && nameCol.includes(" / ")) data[k.prefixField] = nameCol.slice(0, nameCol.lastIndexOf(" / "));
        for (const h of cols0) if (r[h] != null && h !== nameCol) data[fmap.get(h)!.field] = String(r[h + "_raw"] ?? r[h]); // as printed: "2.000", "+17", "1,000"
        for (const [f, label] of [...[k.sectionField, k.prefixField].filter(Boolean).map((f) => [f!, f!.charAt(0).toUpperCase() + f!.slice(1)]), ...cols0.map((h) => [fmap.get(h)!.field, fmap.get(h)!.label])])
          if (data[f] != null && !cols.has(f)) cols.set(f, label);
        const addData = (t: Tid) => { for (const [f, v] of Object.entries(data)) if (t[f] == null) { t[f] = v; const num = gameNumber(v); if (num !== null) t[`n-${f}`] = String(num); } }; // n-<field>: sort key for the tables
        // one tiddler per thing: a row naming an existing entity of this kind, from another table, with no field that disagrees, joins it
        const same = (byKey.get(name.toLowerCase()) ?? []).find((e) => !e["in-tables"].includes(here) && Object.entries(data).every(([f, v]) => e[f] == null || e[f] === v));
        if (same) {
          same["in-tables"] += " " + here;
          addData(same);
          const had = same["wiki-images"]?.split(", ") ?? [], imgs = [...had, ...new Set((r._images ?? []).filter((i: string) => !had.includes(i)))]; // keep every table's images (Tinkering's material icons on a Booster)
          if (imgs.length) same["wiki-images"] = imgs.join(", ");
          merges[k.kind] = (merges[k.kind] ?? 0) + 1;
          return;
        }
        let title = `${safe} (${k.kind.toLowerCase()})`;
        if (used.has(title)) title = `${safe} (${k.kind.toLowerCase()} · ${r._section || r._page})`;
        for (let n = 2; used.has(title); n++) title = `${safe} (${k.kind.toLowerCase()} · ${r._section || r._page} ${n})`;
        used.add(title);
        const t: Tid = { title, tags: `[[${k.kind}]]`, entity: k.kind, name, "source-page": r._page, "source-table": String(r._table), row: String(row), section: r._section ?? "", source: fandomUrl(r._page), "in-tables": here };
        byKey.set(name.toLowerCase(), [...(byKey.get(name.toLowerCase()) ?? []), t]);
        addData(t);
        if (r._images?.length) t["wiki-images"] = r._images.join(", ");
        entities.push(t);
      });
    }
  }
  // links between entities: a row showing another entity's own image (its first) uses it (potion -> crop, trinket -> ore,
  // pet -> gene). A card uses its monster: card zone "Grasslands-3" / "TheMist-21+" names the monster's page, matched there
  // by name (spaces and case ignored, zone word dropped: "Desert Glitch") or as a numbered series ("Glitch 1".."Glitch 84").
  // ponytail: event and crusade cards (150 of 377) stay unlinked; the wiki has no monster tables for those zones.
  // The entity view lists `uses`, and "used by" is its reverse.
  const sq = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byIcon = new Map<string, string[]>(), monsByPage = new Map<string, Tid[]>();
  for (const t of entities) {
    const icon = t["wiki-images"]?.split(", ")[0];
    if (icon) byIcon.set(icon, [...(byIcon.get(icon) ?? []), t.title]);
    if (/monster|boss/i.test(t.entity)) monsByPage.set(sq(t["source-page"]), [...(monsByPage.get(sq(t["source-page"])) ?? []), t]);
  }
  const cardMonsters = (c: Tid): string[] => {
    const raid = c.zone?.match(/^Raid\.(\w+)-\d+$/)?.[1]; // "Raid.King-3": the King boss at every difficulty (which one drops X/Y/Z isn't on the wiki)
    if (raid) return entities.filter((x) => x.entity === "Raid boss" && x.name.endsWith(` ${raid}`)).map((x) => x.title);
    const page = sq(c.zone?.match(/^(.*?)[- ]?\d+\+?$/)?.[1] ?? ""), on = monsByPage.get(page) ?? [];
    const nm = sq(c.name), bare = page && nm.startsWith(page) ? nm.slice(page.length) : nm;
    const exact = on.filter((x) => [nm, bare].includes(sq(x.name)));
    return (exact.length ? exact : on.filter((x) => /\d+$/.test(x.name) && sq(x.name.replace(/\s*\d+$/, "")) === bare)).map((x) => x.title);
  };
  for (const t of entities) {
    const uses = new Set([...(t["wiki-images"]?.split(", ").slice(1).flatMap((i) => byIcon.get(i) ?? []) ?? []), ...(t.entity === "Card" ? cardMonsters(t) : [])]);
    uses.delete(t.title);
    if (uses.size) t.uses = [...uses].map((x) => `[[${x}]]`).join(" ");
  }
  const entityTable = (page: string) => (origWt: string): string | null => {
    if ((origWt.match(/^\s*\{\|/gm) ?? []).length > 1) return null; // nested tables (e.g. Apothecary certification lists) stay as converted markup
    const tables = parseTables(origWt);
    if (!tables.length) return null;
    const parts: string[] = [];
    for (const t of tables) {
      const hit = tableIndex.get(`${page}\u0000${JSON.stringify(strip(t.rows[0]))}`);
      if (!hit) return null;
      const { fields, labels } = hit;
      const q = (xs: string[]) => xs.map((x) => (/[\s\]]/.test(x) || !x ? `[[${x}]]` : x)).join(" ");
      parts.push(`<$transclude $variable="entity-table" filter="""[tag[${hit.kind.kind}]contains:in-tables[${page}#${hit.table}]]""" fields="""${q(fields)}""" labels="""${q(labels)}""" state="""$:/state/is/table/${page}/${hit.table}"""/>`);
    }
    return parts.join("\n\n");
  };

  // ---------- hierarchy: the home page's navigation boxes ----------
  const home = wikitext.get("Idle Skilling Wiki")!;
  const groups: { name: string; members: string[] }[] = [];
  for (const m of home.matchAll(/<big><center>([^<]+)<\/center><\/big>([\s\S]*?)<\/div><\/div>/g))
    groups.push({ name: m[1].trim(), members: [...m[2].matchAll(/\{\{FP icon\|[^|}]*\|([^|}]+)\}\}/g)].map((x) => norm(x[1])) });
  const parentOf = new Map<string, string>();
  for (const g of groups) for (const mm of g.members) if (mm !== g.name) parentOf.set(mm, g.name);
  const WIKI = ["Idle Skilling Wiki", "Changelog", "Idle Skilling Staff"];

  const tiddlers: Tid[] = [];
  const raws: Record<string, Record<string, number>> = { ns0: {}, ns10: {}, ns14: {} };
  const notes: Record<string, number> = {};
  for (const p of pages) {
    const wt = wikitext.get(p.title)!;
    const ctx = newCtx(p.title, { exists, contentTemplates, entityTable: p.ns === 0 ? entityTable(p.title) : undefined, data: p.ns === 0 ? [] : undefined });
    ctx.raws = raws[`ns${p.ns}`];
    ctx.notes = notes;
    let text: string;
    if (p.ns === 10 && isCode(wt)) {
      bump(notes, "code template -> source shown as code");
      text = (exists(`${p.title}/doc`) ? `{{${p.title}/doc}}\n\n` : "") + "!! Template source\n\nMediaWiki template code; the converter expands the templates the wiki's pages use.\n\n```\n" + wt.trim() + "\n```";
    } else text = convert(wt, ctx);
    const tags = new Set(p.categories.filter((c) => !MAINT.has(c)));
    const slash = p.title.lastIndexOf("/");
    const parent = slash > 0 && exists(p.title.slice(0, slash)) ? p.title.slice(0, slash) : "";
    const redirect = /^\s*#REDIRECT/i.test(wt);
    if (parent) tags.add(parent);
    else if (groups.some((g) => g.name === p.title)) tags.add("Contents"); // a section of the home page nav (Farming is a redirect page, still the section)
    else if (redirect) tags.add("Redirects");
    else if (p.title.startsWith("Header/")) tags.add("Navigation headers");
    else if (p.ns === 10) tags.add("Wiki templates");
    else if (p.ns === 14) tags.add("Wiki category pages");
    else if (parentOf.has(p.title)) tags.add(parentOf.get(p.title)!);
    else if (p.categories.includes("Zone")) tags.add("Fight");
    else if (WIKI.includes(p.title)) tags.add("Wiki");
    else tags.add("More pages");
    tags.delete(p.title);
    const t: Tid = { title: p.title, tags: [...tags].map((x) => `[[${x}]]`).join(" "), source: fandomUrl(p.title), "wiki-modified": p.timestamp ?? "", "wiki-pageid": String(p.pageid), "wiki-namespace": ["main", "", "", "", "", "", "", "", "", "", "Template", "", "", "", "Category"][p.ns] };
    if (parent) t.caption = p.title.slice(slash + 1);
    t.text = text;
    tiddlers.push(t);
    for (const x of ctx.extra) tiddlers.push({ title: x.title, caption: x.caption, "tab-of": x.parent, source: fandomUrl(x.parent), text: x.text });
    for (const x of ctx.data ?? []) tiddlers.push({ title: x.title, type: "application/json", tags: "[[Table data]]", "source-page": x.page, source: fandomUrl(x.page), text: x.text });
  }

  // structure tiddlers: section nodes, category tags, entity explorers, datasets
  const all = new Set(tiddlers.map((t) => t.title));
  const node = (title: string, tags: string, text: string, extra: Tid = {}) => { if (!all.has(title)) { all.add(title); tiddlers.push({ title, tags, ...extra, text }); } };
  const order = groups.map((g) => g.name);
  node("Contents", "", "The sections of the original wiki's main page, then everything else.", { list: [...order, "More pages", "Data and tools", "Wiki"].map((x) => `[[${x}]]`).join(" ") });
  for (const g of groups) node(g.name, "Contents", `A section of the original wiki's main page navigation.`);
  node("More pages", "Contents", "Wiki pages that aren't in the main page navigation.");
  node("Data and tools", "Contents", "Filterable lists built from the wiki's tables, the raw datasets, and calculators.");
  node("Table data", "[[Data and tools]]", "One JSON data tiddler per simple wiki table; the page draws it with the data-table procedure (click a column to sort).\n\n<<list-links filter:\"[tag[Table data]]\">>");
  node("Wiki", "Contents", "The wiki itself: home page, changelog, staff, templates, categories.");
  node("Redirects", "Wiki", "Wiki page names that redirect to another page.");
  node("Navigation headers", "Wiki", "Header rows the wiki transcludes at the top of related pages.");
  node("Wiki templates", "Wiki", "The wiki's MediaWiki templates (source and documentation).");
  node("Wiki category pages", "Wiki", "The wiki's category description pages.");
  node("Categories", "Wiki", "Every category used on the wiki. Each is a tag here.");
  for (const c of new Set(pages.flatMap((p) => p.categories).filter((c) => !MAINT.has(c))))
    node(c, "Categories", "A category on the original wiki; pages in it carry this tag." + (exists(`Category:${c}`) ? `\n\n{{Category:${c}}}` : ""), { "wiki-category": "yes" });
  for (const k of KINDS) {
    const mine = entities.filter((e) => e.entity === k.kind), n = mine.length;
    const cols = [...kindColumns.get(k.kind)!].filter(([f]) => f === "name" || mine.filter((e) => e[f] && e[f] !== "-").length >= n / 10); // columns most rows have
    const q = (xs: string[]) => xs.map((x) => (/[\s\]]/.test(x) ? `[[${x}]]` : x)).join(" ");
    node(k.kind, "[[Data and tools]]", `${n} ${k.plural.toLowerCase().replace(" (all)", "")} from the wiki's tables. Filter, pick a ${k.facetLabel.replace(/s$/, "")}, click a column to sort.\n\n<$transclude $variable="explorer" kind="""${k.kind}""" fields="""${q(cols.map((c) => c[0]))} source-page""" labels="""${q(cols.map((c) => c[1]))} Page""" facet="${k.facet}" facetLabel="${k.facetLabel}"/>`, { caption: k.plural, "entity-kind": "yes" });
  }
  const dsIndex = JSON.parse(readFileSync("data/wiki/datasets/index.json", "utf8")).datasets as { file: string; count: number; sourcePages: string[] }[];
  const datasets: Tid[] = dsIndex.filter((d) => !["templates.json", "pages_text.json"].includes(d.file)).map((d) => ({
    title: `Data/${d.file.replace(/\.json$/, "")}`, type: "application/json", tags: "Datasets", "source-pages": d.sourcePages.map((x) => `[[${x}]]`).join(" "), rows: String(d.count),
    // a data dictionary (row index -> row JSON): TiddlyWiki caches the parse, so getindex + jsonget stay cheap per cell
    text: JSON.stringify(Object.fromEntries(ds(d.file.replace(/\.json$/, "")).map((r, i) => [i, JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith("_") || k === "_page" || k === "_section")))]))),
  }));

  // ---------- hand lists -> tag lists ----------
  // A page's list of 3+ links, one link per line, whose targets are exactly the members of one tag becomes that tag's live list.
  // Set equality only: the live list shows the tag's order (its list field, then titles), not the hand order.
  const tagList = (s = "") => [...s.matchAll(/\[\[([^\]]+)\]\]|(\S+)/g)].map((m) => m[1] ?? m[2]);
  const members = new Map<string, Set<string>>();
  for (const t of [...tiddlers, ...entities]) for (const tag of tagList(t.tags)) members.set(tag, (members.get(tag) ?? new Set()).add(t.title));
  const lists = { replaced: 0, kept: 0 }, listPages: string[] = [];
  for (const t of tiddlers.filter((t) => t["wiki-namespace"] === "main" || t["tab-of"])) {
    const L = t.text.split("\n");
    for (const run of linkLists(t.text).reverse()) {
      const want = new Set(run.targets);
      const tag = [...members].filter(([tag, m]) => m.size === want.size && [...want].every((x) => m.has(x)) && !/[\]"]/.test(tag)).map(([tag]) => tag).sort()[0];
      if (!tag) { lists.kept++; continue; }
      L.splice(run.start, run.end - run.start, `<<list-links filter:"[tag[${tag}]]">>`);
      lists.replaced++;
      listPages.push(`${t.title} -> [tag[${tag}]]`);
    }
    t.text = L.join("\n");
  }

  // ---------- write ----------
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}/pages`, { recursive: true });
  const fileOf = (t: string) => t.replace(/[^\w.-]+/g, "_").slice(0, 100) + "_" + Bun.hash(t).toString(36).slice(0, 6) + ".tid";
  for (const t of tiddlers) {
    const head = Object.entries(t).filter(([k, v]) => k !== "text" && v !== "").map(([k, v]) => `${k}: ${v.replace(/\n/g, " ")}`).join("\n");
    writeFileSync(`${OUT}/pages/${fileOf(t.title)}`, head + "\n\n" + t.text + "\n");
  }
  writeFileSync(`${OUT}/entities.json`, JSON.stringify(entities, null, 0));
  writeFileSync(`${OUT}/datasets.json`, JSON.stringify(datasets, null, 0));

  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const pageTids = tiddlers.filter((t) => t["wiki-pageid"]).length;
  console.log(`pages in dump: ${pages.length}  page tiddlers: ${pageTids}  tab tiddlers: ${tiddlers.filter((t) => t["tab-of"]).length}  structure tiddlers: ${tiddlers.length - pageTids - tiddlers.filter((t) => t["tab-of"]).length}`);
  console.log(`entity tiddlers: ${entities.length} (${[...kindState.keys()].map((k) => `${k} ${entities.filter((e) => e.entity === k).length}${merges[k] ? `+${merges[k]} merged` : ""}`).join(", ")})  dataset tiddlers: ${datasets.length}`);
  for (const [ns, o] of Object.entries(raws)) console.log(`raw blocks ${ns}: ${sum(o)}`, JSON.stringify(Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]))));
  console.log("converted with a simplification:", JSON.stringify(Object.fromEntries(Object.entries(notes).sort((a, b) => b[1] - a[1]))));
  console.log(`hand link lists: ${lists.replaced} replaced by a tag list, ${lists.kept} kept (no tag with exactly those members)`, JSON.stringify(listPages));
  if (pageTids !== pages.length) { console.error("COUNT MISMATCH"); process.exit(1); }
}
