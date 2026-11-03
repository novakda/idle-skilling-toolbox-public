import { ref, watch } from 'vue'

/** Set or clear one query parameter in the address bar without reloading or adding a history entry. */
export function setParam(key: string, value: string | null) {
  const u = new URL(location.href)
  if (value == null) u.searchParams.delete(key); else u.searchParams.set(key, value)
  history.replaceState(history.state, '', u)
}

// Page sections as tabs (docs/ux-idleon-reference.md #9, the Pets pattern): ?section=<id> opens one directly, else the
// first; picking a tab writes it back to ?section= so the address can be bookmarked or shared.
// Section ids a merge removed, per page: an old ?section= link lands on the tab that now holds it (like App.vue's MOVED).
export const SECTION_ALIASES = {
  realm: { guide: 'bosses', buildings: 'shrine', stats: 'bonuses', reference: 'bonuses', progress: 'plan', economy: 'coins' },
  cards: { decks: 'plan', collection: 'reference', bonus: 'reference' },
  asylum: { heavycash: 'shrines' },
  pets: { all: 'inventory', reference: 'inventory' },
} as const

export function sectionRef<T extends string>(ids: readonly T[], aliases: Partial<Record<string, T>> = {}) {
  const q = new URLSearchParams(location.search).get('section') ?? ''
  const asked = (aliases[q] ?? q) as T
  const sec = ref<T>(ids.includes(asked) ? asked : ids[0]!)
  if (aliases[q]) setParam('section', sec.value)
  watch(sec, (id) => setParam('section', id))
  return sec
}
