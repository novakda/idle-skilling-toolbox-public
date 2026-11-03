import { nextTick, type App } from 'vue'

// Click-to-sort for every table.list header (opt out with class "nosort"; tables with their own th.sortable keep theirs).
// Rows are reordered in the DOM, so before any component re-renders the original order is put back (Vue patches the DOM it
// expects) and the sort is re-applied after the flush. Total rows stay at the bottom; blank/— cells sort last both ways.

const SUF: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, Qa: 1e15, Qi: 1e18 }, DUR: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
const NUM = /^[+\-−]?[×x]?(\d[\d,]*\.?\d*|\.\d+)(e[+-]?\d+)?\s*(K|M|B|T|Qa|Qi)?\s*[%×x]?$/

// A cell's sort key: a number when the text reads as one (1,234 · 1.2e15 · 2.4K · 35% · ×1.5 · 3.2h · 1d 4h · 12:05, a range by
// its top end), else the text; null for blank/—/? so it goes last.
export function sortKey(raw: string): number | string | null {
  const t = raw.replace(/\s+/g, ' ').replace(/[\s†*★☆✓✗]+$/, '').trim()
  if (!t || /^[—–\-?]+$/.test(t)) return null
  const top = t.split(/ [–→] /).pop()!.split(/ \/ /)[0]!.trim() // "a – b" / "a → b" by the top end; "x / y" by x
  const m = top.match(NUM)
  if (m) return parseFloat(top.replace(/^[+×x]/, '').replace('−', '-').replace(/,/g, '')) * (m[3] ? SUF[m[3]]! : 1)
  if (/^(\d+(\.\d+)?\s?[dhms] ?)+$/.test(top)) return [...top.matchAll(/(\d+(?:\.\d+)?)\s?([dhms])/g)].reduce((s, [, n, u]) => s + +n! * DUR[u!]!, 0)
  if (/^\d+:\d\d$/.test(top)) { const [a, b] = top.split(':'); return +a! * 60 + +b! }
  return t
}

export function compareKeys(a: number | string | null, b: number | string | null, desc: boolean): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'number' ? -1 : typeof b === 'number' ? 1
    : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  return desc ? -c : c
}

type State = { col: number; desc: boolean; orig: [HTMLTableSectionElement, Node[]][] | null }
const sorted = new Map<HTMLTableElement, State>()

// The cell covering column `col` (colspans counted); a cell spanning several columns has no single value.
function cellAt(row: HTMLTableRowElement, col: number): HTMLTableCellElement | null {
  let x = 0
  for (const c of row.cells) { if (col < x + c.colSpan) return c.colSpan > 1 ? null : c; x += c.colSpan }
  return null
}
const isTotal = (r: HTMLTableRowElement) => [...r.cells].slice(0, 2).some((c) => /^Total\b/.test(c.textContent!.trim()))

function apply(table: HTMLTableElement, st: State) {
  st.orig = []
  for (const tb of table.tBodies) {
    if (tb.querySelector('[rowspan]')) continue
    const nodes = [...tb.childNodes], rows = [...tb.rows], pin = rows.filter(isTotal)
    const keyed = rows.filter((r) => !pin.includes(r)).map((r) => ({ r, k: sortKey(cellAt(r, st.col)?.textContent ?? '') }))
    keyed.sort((a, b) => compareKeys(a.k, b.k, st.desc)) // stable: ties keep the page's order
    st.orig.push([tb, nodes])
    for (const r of [...keyed.map((x) => x.r), ...pin]) tb.appendChild(r)
  }
  const ths = table.tHead?.rows[table.tHead.rows.length - 1]?.cells ?? []
  let x = 0
  for (const th of ths) { if (x === st.col) th.setAttribute('aria-sort', st.desc ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort'); x += th.colSpan }
}

function restore() {
  for (const [table, st] of sorted) {
    if (!table.isConnected) { sorted.delete(table); continue }
    for (const [tb, nodes] of st.orig ?? []) for (const n of nodes) if (n.parentNode === tb) tb.appendChild(n)
    st.orig = null
  }
}

let pending = false
export function installTableSort(app: App) {
  app.mixin({
    beforeUpdate() {
      if (!sorted.size || pending) return
      restore(); pending = true
      nextTick(() => { pending = false; for (const [t, st] of sorted) if (t.isConnected) apply(t, st) })
    },
  })
  document.addEventListener('click', (e) => {
    const th = (e.target as Element).closest?.('table.list:not(.nosort) > thead > tr:last-child > th') as HTMLTableCellElement | null
    if (!th || th.colSpan > 1 || (e.target as Element).closest('a, button, input, select, summary')) return
    const table = th.closest('table')!
    if (table.querySelector(':scope > thead th.sortable')) return
    let col = 0
    for (let c = th.previousElementSibling as HTMLTableCellElement | null; c; c = c.previousElementSibling as HTMLTableCellElement | null) col += c.colSpan
    const old = sorted.get(table)
    if (old) for (const [tb, nodes] of old.orig ?? []) for (const n of nodes) if (n.parentNode === tb) tb.appendChild(n)
    const st: State = { col, desc: old?.col === col ? !old.desc : th.classList.contains('num'), orig: null }
    sorted.set(table, st); apply(table, st)
  })
}
