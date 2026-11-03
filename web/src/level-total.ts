// Per-level wiki text × level → total text: "+10% damage per…" × 7 → "+70% damage per…". Scales every signed number
// ("+10", "−0.1", "-2%") and every "<k>n" (perks.json: "+10n%" = 10 per level); unsigned numbers ("per every 10 levels") stay.
// No signed number → '' (unlock notes, "—", "see Next"), never a guess. Prefer an exact game formula where the caller has one.
const N = /(\d+(?:\.\d+)?)n\b/g, S = /([+\-−])(\d+(?:\.\d+)?)/g
const fmt = (v: number) => String(+v.toPrecision(10))

/** Total effect text at `level`, or '' when the text has nothing to scale (or level < 1). */
export function levelTotal(text: string | null | undefined, level: number): string {
  if (!text || !(level > 0)) return ''
  const hasN = N.test(text); N.lastIndex = 0
  const out = hasN ? text.replace(N, (_, x) => fmt(+x * level)) : text.replace(S, (_, sg, x) => `${sg}${fmt(+x * level)}`)
  return out === text ? '' : out
}

/** Sum of the first scaled number across (text, level) pairs, when every pair says the same thing after the number
 *  (the rest of the line: "% ore gains"; "per every 10 ATT levels" variants don't mix); else ''. Used for additive potion groups. */
export function sumTotals(items: [string | null | undefined, number][]): string {
  let sum = 0, unit: string | null = null, sign = ''
  for (const [text, level] of items) {
    if (!(level > 0) || !text) continue
    const m = /([+\-−])(\d+(?:\.\d+)?)([^\n]*)/.exec(text.replace(/(\d)n\b/, '$1'))
    if (!m) return ''
    const u = m[3]!
    if (unit != null && u !== unit) return ''
    unit = u; sign = m[1]!; sum += (m[1] === '+' ? 1 : -1) * +m[2]! * level
  }
  return unit == null ? '' : `${sum < 0 ? '−' : sign === '+' || sum > 0 ? '+' : ''}${fmt(Math.abs(sum))}${unit}`
}
