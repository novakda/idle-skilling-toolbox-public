// Card data from a loaded save + the static catalog (src/derive-card-catalog.ts) — no game code, no server.
// adds = catalog level contribution x save.CardBonusTOTAL (linear, verified; keys in a card's `unscaled` are not); deck totals are sums (additive,
// verified on real decks). KillPct/Tunnels are post-scaled by PotionLV[166] in the game: flagged, left unscaled.
type Adds = Record<string, number>
export type CatalogCard = { id: number; name: string; page: number; tab: number; row: number; col: number; zone: string | null; type: string; base: number; levels: Record<string, Adds>; unscaled?: string[] }
export type Catalog = { postScaled: string[]; tabLabels: Record<string, string>; upgradeCost: Record<number, number[]>; swapRates: number[]; cards: CatalogCard[] }

const SLOTS = 10
import globals from '../../data/card-globals.json'

const MAX_LEVEL = 5
// Foil Cards (ConstructLV[8]) at level T lets cards in these id ranges reach level 6 (card upgrade-button draw listener
// † @3034866: sets the aa15 flag, then allows an upgrade while level < 6 instead of < 5; aa15 is scratch state, absent
// from cloud saves). [first id, last id, foil level]
export const FOIL: [number, number, number][] = [[1, 16, 1], [31, 60, 2], [61, 86, 3], [91, 111, 4], [121, 137, 5], [361, 381, 6], [391, 411, 7], [421, 443, 8], [451, 475, 9], [481, 510, 10]]
/** Foil Bosses (ConstructLV[21]) at level j+1 does the same for set j (same listener, † @3038756 raid bosses, † @3040218
 *  Asylum bosses): 3 raid bosses each, then 4 Asylum bosses each. */
export const FOIL_BOSSES = [[151, 153], [154, 156], [157, 159], [160, 162], [271, 274], [275, 278], [279, 282], [283, 286]]
export const cardMaxLevel = (id: number, foil: number, bosses: number) =>
  FOIL.some(([a, b, t]) => id >= a && id <= b && foil >= t) || FOIL_BOSSES.some(([a, b], j) => id >= a! && id <= b! && bosses > j) ? 6 : MAX_LEVEL
// Link 9 'All Combat' (in-game name, the author 2026-10-23) is equipped by the zone fight screen (SceneEvents_9) and crusade fights
// (SceneEvents_32); raids (16) and Asylum (41) equip link 10; the Realm swaps no deck (DeckLinkList compares, access index).
// Entering a screen (e.g. SceneEvents_9 init @~31650000, runLater 10-20 ms): loop decks 1..11, and every deck whose link equals the
// screen's link is made CardDeckSelected; no else branch, no break. So with no linked deck the selected deck simply stays (and
// carries over to the next screen), and if two decks share a link the LAST one wins. Tinker decks (DeckLinkList[12..20]) work the same.
// Link 3 is Botany (the skill; Farming is the group, the author 2026-10-23).
// Link 8 is the Limbo deck: it covers all three Limbo activities (the author, in game, 2026-10-23), not only Spiriting/Summoning.
import bonusNames from '../../data/bonus-names.json'
/** The game's own wording for a card bonus (src/derive-bonus-names.ts, _TypeDescriptionMap @22276784), e.g. SkillPoints →
 *  "% perk points gained"; unknown keys fall back to the key. `amount` renders "+60.9% card drop chance". */
export const bonusName = (k: string) => ((bonusNames as Record<string, string>)[k] ?? k).replace(/^%/, '')
export const bonusAmount = (k: string, v: string) => { const t = (bonusNames as Record<string, string>)[k]; return t ? (t.startsWith('%') ? `+${v}% ${t.slice(1)}` : `+${v} ${t}`) : `${k} +${v}` }
export const LINKS: Record<number, string> = { 1: 'Training', 2: 'Tilling', 3: 'Botany', 4: 'Potions', 5: 'Crusades', 6: 'Mining',
  7: 'Smithing / Fishing', 8: 'Limbo', 9: 'All Combat', 10: 'Boss Looting', 11: 'Trek / Hatchery / Lab', 12: 'Spelunking' }

const scale = (a: Adds | undefined, m: number, keep?: string[]): Adds => Object.fromEntries(Object.entries(a ?? {}).map(([k, v]) => [k, +(v * (keep?.includes(k) ? 1 : m)).toPrecision(12)]))
const sum = (list: Adds[]): Adds => { const o: Adds = {}; for (const a of list) for (const [k, v] of Object.entries(a)) o[k] = +((o[k] ?? 0) + v).toPrecision(12); return o }

export function buildCards(save: Record<string, unknown>, catalog: Catalog) {
  const levels = (save.CardLevels as number[]) ?? []
  const cardMult = Number(save.CardBonusTOTAL ?? 1) // crop cards are unscaled (see derive-card-catalog)
  const equipped = (save.CardEquipped as number[]) ?? []
  const decks = Array.from({ length: Number(save.CardDecksOWNED ?? 0) }, (_, i) => {
    const d = i + 1, link = ((save.DeckLinkList as number[]) ?? [])[d] ?? 0
    return { deck: d, link, linkName: LINKS[link] ?? null, active: d === save.CardDeckSelected, cards: equipped.slice(SLOTS * i, SLOTS * d) }
  })
  const construct = (save.ConstructLV as number[]) ?? [], foil = Number(construct[8] ?? 0), bosses = Number(construct[21] ?? 0)
  const cards = catalog.cards.map((c) => {
    const level = levels[c.id] ?? -1, maxLevel = cardMaxLevel(c.id, foil, bosses), mult = c.type === 'CropsGained' ? 1 : cardMult
    return { ...c, level, maxLevel, hidden: level < 0,
      adds: level >= 1 ? scale(c.levels[level], mult, c.unscaled) : {},
      next: level >= 1 && level < maxLevel ? scale(c.levels[level + 1], mult, c.unscaled) : null,
      max: level >= 1 ? scale(c.levels[maxLevel], mult, c.unscaled) : {},
      decks: decks.filter((d) => d.cards.includes(c.id)).map((d) => d.deck) }
  })
  const byId = new Map(cards.map((c) => [c.id, c]))
  return {
    slots: SLOTS, maxLevel: Math.max(MAX_LEVEL, ...cards.map((c) => c.maxLevel)), tabLabels: catalog.tabLabels, upgradeCost: catalog.upgradeCost, swapRates: catalog.swapRates,
    decks: decks.map((d) => ({ ...d, totals: sum(d.cards.map((id) => byId.get(id)?.adds ?? {})) })),
    cards,
  }
}

/** The deck an activity runs with: the deck DeckLinkList links to it, else the selected one (the scenes only swap decks when
 *  a card deck (DeckLinkList[1..11]) is linked to them; an index past the owned decks, e.g. [12..20], is a tinker deck). */
/** The deck a build is compared with, by purpose rather than deck number (the author, 2026-10-23: 11 decks are fewer than the purposes,
 *  so decks and links get swapped around). Purpose = the deck's link: among decks linked to the build's activity (several can
 *  share a link) the one holding the most of its cards. No deck has the link, or a special with none: the deck holding the most
 *  of its cards if at least `min`, else null (build it in a spare deck). Ties go to the selected deck. */
export function deckForBuild<D extends { link: number; active: boolean; cards: number[] }>(decks: D[], picks: number[], link: number, min = 3) {
  const shared = (d: D) => picks.filter((id) => d.cards.includes(id)).length
  const most = (ds: D[]) => [...ds].sort((x, y) => shared(y) - shared(x) || +y.active - +x.active)[0]
  const onLink = link ? decks.filter((d) => d.link === link) : []
  const closest = most(decks)
  const deck = onLink.length ? most(onLink)! : closest && shared(closest) >= min ? closest : null
  return { deck, shared: deck ? shared(deck) : 0, linkedTo: onLink[0] ?? null }
}
export const deckFor = <D extends { link: number; active: boolean }>(decks: D[], link: number) =>
  decks.find((d) => d.link === link) ?? decks.find((d) => d.active)

export const passives = new Map(globals.passives.map((p) => [p.card, p]))
const byId = new WeakMap<Catalog, Map<number, CatalogCard>>()
/** Totals of the deck linked to `link` (else the selected deck): the same numbers as buildCards().decks[].totals, from the
 *  deck's 10 cards alone instead of every card in the catalog (cbonus runs once per fight stat; buildCards cost 60 ms a call). */
function deckTotals(save: Record<string, unknown>, catalog: Catalog, link?: number): Adds {
  let m = byId.get(catalog)
  if (!m) byId.set(catalog, (m = new Map(catalog.cards.map((c) => [c.id, c]))))
  const equipped = (save.CardEquipped as number[]) ?? [], links = (save.DeckLinkList as number[]) ?? [], owned = Number(save.CardDecksOWNED ?? 0)
  let deck = -1
  if (link != null) for (let d = 1; d <= owned; d++) if ((links[d] ?? 0) === link) { deck = d; break }
  if (deck < 0) for (let d = 1; d <= owned; d++) if (d === save.CardDeckSelected) { deck = d; break }
  if (deck < 0) return {}
  const levels = (save.CardLevels as number[]) ?? [], cardMult = Number(save.CardBonusTOTAL ?? 1)
  return sum(equipped.slice(SLOTS * (deck - 1), SLOTS * deck).map((id) => {
    const c = m!.get(id), level = c ? levels[c.id] ?? -1 : -1
    return c && level >= 1 ? scale(c.levels[level], c.type === 'CropsGained' ? 1 : cardMult, c.unscaled) : {}
  }))
}

/** A passive card's bonus at level `lv` (scaled by the card multiplier where the game scales it). */
export const passiveAt = (p: (typeof globals.passives)[number], lv: number, mult: number) =>
  ((lv >= 0 ? p.values[Math.min(lv, 6)] ?? 0 : 0) / p.div) * (p.scaled ? mult : 1)

/** Card bonuses as the game sees them (Cbonus<key>, CalculateBonusesTotalGlobal): totals of the deck the game equips
 *  for activity `link` (DeckLinkList; cloud saves need the Cards-tab pickers), else the selected deck; plus passive
 *  cards that always count; then potion 165/166 power transforms (card-globals.json, src/derive-card-globals.ts). */
export function cbonus(save: Record<string, unknown>, catalog: Catalog, link?: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(Object.entries(deckTotals(save, catalog, link)).map(([k, v]) => [`Cbonus${k}`, v]))
  const levels = (save.CardLevels as number[]) ?? [], mult = Number(save.CardBonusTOTAL ?? 1)
  for (const p of globals.passives) {
    // values[lv]: the game's card value at that level, measured in the dev sandbox (some are non-zero at level 0).
    out[p.key] = (out[p.key] ?? 0) + passiveAt(p, levels[p.card] ?? 0, mult)
  }
  const P = (save.PotionLV as number[]) ?? []
  for (const t of globals.transforms) {
    const lv = Number(P[t.potion] ?? 0), e = 1 + Math.min((1.25 * lv) / (lv + 175), 1), v = out[t.key] ?? 0
    out[t.key] = t.pow ? 100 * (Math.pow(1 + v / 100, e) - 1) : v * e
  }
  return out
}

/** Cloud saves lack DeckLinkList (the game keeps deck links locally): fill it from the Cards-tab pickers. */
export const DECK_LINKS_KEY = 'idle-skilling.cards.deckLinks'
export function withDeckLinks(save: Record<string, unknown>, links?: Record<number, number>): Record<string, unknown> {
  if (Array.isArray(save.DeckLinkList)) return save
  if (!links) try { links = JSON.parse(localStorage.getItem(DECK_LINKS_KEY) ?? '{}') } catch { /* private window / no storage */ }
  const l = links ?? {}
  return { ...save, DeckLinkList: Array.from({ length: 13 }, (_, d) => l[d] ?? 0) }
}

/** Pet screens (link 11: Trek / Hatchery / Lab) read one card bonus: a Hatchery/Trekking/Research level-up adds
 *  0.5·(1 + 0.1·AscentionLevel[11])·(1 + CbonusSkillPoints/100) skill points (Hatchery level-up @27686807; the Trek and Lab
 *  scenes read the same bonus). Best owned Skill Points cards for a deck linked there, vs the deck linked now. */
export const PET_LINK = 11
export function petLinkDeck(save: Record<string, unknown>, catalog: Catalog) {
  const b = buildCards(save, catalog), sp = (c: { adds: Adds }) => c.adds.SkillPoints ?? 0
  const cards = b.cards.filter((c) => c.level >= 1 && sp(c) > 0).sort((x, y) => sp(y) - sp(x)).slice(0, b.slots)
  const linked = b.decks.find((d) => d.link === PET_LINK) ?? null
  return { cards, total: cards.reduce((t, c) => t + sp(c), 0), linked, linkedTotal: linked?.totals.SkillPoints ?? 0 }
}

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []

/** ZoneTotalCardLV[1..4]: summed card levels per zone (cards 1-16, 31-60, 61-86, 91-111). */
export function zoneTotalCardLV(save: Save): number[] {
  const lv = (i: number) => n(arr(save, 'CardLevels')[i]), sum = (from: number, count: number) => Array.from({ length: count }, (_, i) => lv(from + i)).reduce((a, b) => a + b, 0)
  return [0, sum(1, 16), sum(31, 30), sum(61, 26), sum(91, 21)]
}
