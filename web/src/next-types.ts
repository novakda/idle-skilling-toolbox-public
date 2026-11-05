// Do Next's shared shapes and formatters (refactor step 8, #71). Each system module exports its own `next` section;
// do-next.ts only orders and runs them. Extra's fields are typed `unknown` here so core imports no system module;
// each section narrows the field it reads to its own module's type.

type Save = Record<string, unknown>
/** cells: this item as a table row under the section's `head` (text/why stay as the plain-text form). */
export type Item = { text: string; why: string; cells?: string[]; sub?: { head: string[]; rows: string[][] } }
export type Out = Item[] | { items: Item[]; head: string[]; note?: string }
/** items null = the page computes no recommendation outside its component; error = the computation threw.
 *  head (+ note, said once above the table) = render the items' cells as a table. */
export type Section = { view: string; title: string; src: string; items: Item[] | null; head?: string[]; note?: string; error?: boolean }
/** Inputs besides the save: shrine income history (income Snap[]), perk impacts (perks GameImpacts), Realm combat (realm
 *  Combat), ascend history (ascend AscendSnap[]), and the clock. */
export type Extra = { history?: unknown[]; impacts?: unknown; combat?: unknown; now?: number; ascendHistory?: unknown[] }
/** One Do Next section, exported by the module that computes it. */
export type NextSection = { view: string; title: string; src: string; fn: ((s: Save, x: Extra) => Out) | null }

export const n = (v: unknown) => Number(v ?? 0) || 0
export const sci = (v: number) => (!isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? v.toExponential(2) : (+v.toPrecision(4)).toLocaleString())
export const dur = (sec: number) => (sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
export const hrs = (h: number) => (h === 0 ? 'now' : !isFinite(h) ? 'no income seen' : dur(h * 3600))
export const pct = (x: number) => `${+(100 * x).toFixed(1)}%`
