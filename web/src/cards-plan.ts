// Cards page model outside the component: the deck priorities (guide defaults or yours), the drop odds, the best
// farming decks, the ranked missing cards and the farming plan, so the Do next page shows the same plan as Cards.vue.
// Browser-kept settings (priorities, rolls/h, crusade run time, deck links) are read by cardSettings() for both.
import { buildCards, deckFor as linkedDeck, DECK_LINKS_KEY, LINKS, passiveAt, passives, withDeckLinks, type Catalog } from './cards-calc'
import { equipmentBonuses } from './bus'
import { cardValue, gates, missingCards, plan, rank, type Gates, type MissingCard, type Odds, type Sources } from './cards-missing'
import catalog from './data/card-catalog.json'
import cardSources from './data/card-sources.json'
import activityBonuses from './data/activity-bonuses.json'
import guideDecks from '../../data/guides/recommended-decks/decks.json'
import * as NX from './next-types'

type Save = Record<string, unknown>
export type Adds = Record<string, number>
export type Card = { id: number; name: string; page: number; tab: number; row: number; col: number; hidden: boolean; zone: string | null; type: string; level: number; decks: number[]; adds: Adds; next: Adds | null; max: Adds }
export type Deck = { deck: number; link: number; linkName: string | null; active: boolean; cards: number[]; totals: Record<string, number> }
export type Data = { slots: number; decks: Deck[]; cards: Card[]; tabLabels: Record<string, string>; upgradeCost: Record<number, number[]>; swapRates: number[]; maxLevel: number }
export type Weights = Record<number, Record<string, number>>

// ---- Browser-kept settings ----------------------------------------------------------------------------------------
export const WEIGHTS_KEY = 'idle-skilling.cards.weights'
export const ROLLS_KEY = 'idle-skilling.cards.rollsPerHour'
export const RUN_KEY = 'idle-skilling.cards.crusadeRunSec'
export type CardSettings = { weights: Weights; rollsPerHour: number; crusadeRunSec: number; links: Record<number, number> }
// Card rolls per hour = real monster deaths per hour. Measured live 2026-10-03 in The Bog: kill counter +781k/h
// ÷ ~54 counted kills per death (BonusKillperKill 4.85 × smithing/skill/ascension/secret/shrine multipliers) ≈ 14,400.
// Crusade run: a stage can't be repeated, so each run gives ONE roll at the target stage; ~3 s measured live 2026-10-03
// with src/crusade-timer.ts (boss-kill to boss-kill).
export const DEFAULTS: CardSettings = { weights: {}, rollsPerHour: 14400, crusadeRunSec: 3, links: {} }
/** Settings kept in this browser (each read in try/catch: private windows and SSR have no storage). */
export function cardSettings(): CardSettings {
  const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
  const json = (k: string) => { try { return JSON.parse(get(k) ?? '{}') ?? {} } catch { return {} } }
  const pos = (k: string, d: number) => { const v = Number(get(k)); return v > 0 ? v : d }
  return { weights: json(WEIGHTS_KEY), rollsPerHour: pos(ROLLS_KEY, DEFAULTS.rollsPerHour), crusadeRunSec: pos(RUN_KEY, DEFAULTS.crusadeRunSec), links: json(DECK_LINKS_KEY) }
}

// ---- Guide defaults ------------------------------------------------------------------------------------------------
// The "recommended decks" sheet (data/guides/recommended-decks/decks.json), Mid Game, mapped to deck links as agreed
// 2026-10-02. Weights 1-3 by how many recommended cards carry each bonus.
export type GuideCard = { loc: string; card: string; bonus: string }
export const PHASE = 'Mid Game'
export const GUIDE_SECTIONS: Record<number, string[]> = {
  // 9 = zone AND crusade fights (crusadefight15 equips link 9); 5 = the crusade map, where tinkering happens.
  9: ['Damage', 'Cash', 'Card Drop', 'Crusade'], 10: ['Damage'], 6: ['Mining'],
  7: ['Ascen./Rebirth/Fish'], // 7 = Fishing/Smithing; the guide has no Smithing section
  8: ['Spiriting', 'Summoning'], 3: ['Botany'], 4: ['Apothecary'], 5: ['Tinkering', 'Idle Crusaders'], 1: ['Train'],
}
// The guide's 'Idle Crus./Bot. Spd.' deck mixes two unrelated bonuses, so it is split into two builds (the author, 2026-10-23):
// 'Idle Crusaders' (InactiveCrusaders, read by the crusade map, link 5) and 'Botany speed cap' (MAXlBotanySpdUpgrades).
// The cap has NO link: Botany reads it from the deck equipped as you enter, before it swaps in the Botany-linked deck
// (botany-calc.ts speedCap), so that build is weighed on its own and compared with the selected deck.
// Bonuses every skill screen reads on level-up but that don't improve the activity itself: perk points (SkillPoints, "%_PERK_POINTS_
// GAINED") are awarded on any skill level-up, so they are left out of activity builds (the author, 2026-10-23: drop them).
const NOT_ACTIVITY = ['SkillPoints']
// Fight stats the crusade map (link 5) computes only to preview the selected crusade: the fight scene's init recomputes them
// from its own deck (link 9) before any hit lands (ConquestAttackReq set @23192226 † vs the map's copy @23997604 †; heal and seal
// uses likewise, 15-16 reads in each scene). So they're not Tinkering / Idle Crusaders bonuses (the author, 2026-10-24: why accuracy?).
// ponytail: hand list from comparing the two scenes' reads; CrusadeMulti stays (the map's stored reward % is used when claiming).
const PREVIEW_ONLY: Record<number, string[]> = { 5: ['HitChance', 'HealUses', 'SealUses'] }
export const ENTRY_SECTIONS: Record<string, { weights: Record<string, number>; note: string }> = {
  'Botany speed cap': { weights: { MAXlBotanySpdUpgrades: 1 },
    note: 'Counts the deck equipped when you ENTER Botany (the Botany-linked deck swaps in after the cap is read), and only matters while a pot is below the cap + 25: put these cards in the deck you walk in with.' },
}
/** A deck build: a variant of one link's build (group 'link') or a special no link applies to (link 0).
 *  `drop` cards go in first (their bonuses add into one roll), then the best by `w`. */
export type BuildSpec = { label: string; link: number; group: 'link' | 'special'; w: Adds; drop?: string[]; note?: string }
// Ascension/rebirth cards (SoulsKept, BPgainMisc) have no link: the menus swap no deck in, so the deck equipped when you open
// them counts. SoulstoKeepPercent = min(20 + CbonusSoulsKept, 100) is written when the ascend menu opens (SceneEvents_19 init
// @20186263; ascend.ts keepPercent) and applied by both resets (SceneEvents_22 @20905390 ascend, @20975348 rebirth).
// BP: BPreward[6] = … + min(CbonusBPgainMisc, 250) when the reset menu actor is created (ActorEvents_601 @10716214), paid
// into BPtoSpend on the Rebirth click (@12480775). ponytail: the builds don't stop at those caps (80% Souls Kept from cards, 250 BP).
const ASCEND_NOTE = 'Counts the deck equipped when you open the Ascend menu (it swaps no deck in): Souls Kept = 20% + these cards, max 100%. Equip it in a deck no activity is linked to, right before ascending (AP cards first: Ascend page pre-ascend deck).'
const REBIRTH_NOTE = 'Counts the deck equipped when you open the reset menu: BP on Rebirth cards (capped at 250 BP) and Souls Kept, as for Ascension.'
/** The bonuses Spelunking-page cards give (the game adds them into CbonusTunnels[0..9], unscaled; the guide has no Spelunking
 *  section, so the build weighs them equally). */
export const SPELUNK_BONUSES = ['MachineSpeed', 'SpelunkerSpeed', 'SpelunkerDig', 'BuildSpeed', 'ExtraTreasure', 'RareTreasure', 'LearnSpeed', 'SpelunkEXP', 'ConstructEXP', 'TunnelCardChance']
/** Every link whose deck takes cards from this guide section. */
export const linksOfSection = (sec: string) => Object.entries(GUIDE_SECTIONS).filter(([, ss]) => ss.includes(sec)).map(([l]) => +l)
// Bonuses each link's activity actually reads (src/derive-activity-bonuses.ts): guide weights only count where
// the activity reads the bonus, and core bonuses (read 3+ times there) get at least weight 1.
const activity = activityBonuses as unknown as Record<number, Record<string, number>>
const CORE_READS = 3
// Deck 7's guide section ("Ascen./Rebirth/Fish") includes ascension/rebirth cards, and neither has a deck link.
const GUIDE_EXCLUDE: Record<number, string[]> = { 7: ['SoulsKept', 'BPgainMisc'] }
const rawGuide = guideDecks as unknown as { sections: Record<string, Record<string, GuideCard[]>> }
const splitBy = (sec: Record<string, GuideCard[]>, re: RegExp) => Object.fromEntries(Object.entries(sec).map(([ph, cs]) => [ph, cs.filter((c) => re.test(c.bonus))]))
export const guide = { ...rawGuide, sections: Object.fromEntries(Object.entries(rawGuide.sections).flatMap(([name, sec]) => name !== 'Idle Crus./Bot. Spd.' ? [[name, sec]]
  : [['Idle Crusaders', splitBy(sec, /Crusaders/i)], ['Botany speed cap', splitBy(sec, /Pot Speed/i)]])) }

/** What one more level adds: the equipped gain, and a passive card's passive gain (it counts in or out of a deck). */
export function levelGain(c: Card, mult: number) {
  const equipped: Adds = Object.fromEntries(Object.entries(c.next ?? {}).map(([k, v]) => [k, v - (c.adds[k] ?? 0)]))
  const p = passives.get(c.id)
  return { equipped, passive: p ? { key: p.key.slice(6), gain: passiveAt(p, c.level + 1, mult) - passiveAt(p, c.level, mult) } : null }
}
/** Value of that level-up: equipped gain over the decks the card is in, plus the passive gain once, each scored with the
 *  deck priorities and the per-bonus normalisation of cardValue (the passive in the deck that values it most). */
export function levelValue(c: Card, mult: number, decks: { deck: number; w: Adds }[], maxAdd: Adds) {
  const g = levelGain(c, mult), score = (w: Adds, a: Adds) => Object.entries(a).reduce((s, [k, v]) => s + (w[k] ?? 0) * (v / (maxAdd[k] || 1)), 0)
  const passive = g.passive ? Math.max(0, ...decks.map((d) => score(d.w, { [g.passive!.key]: g.passive!.gain }))) : 0
  return decks.filter((d) => c.decks.includes(d.deck)).reduce((s, d) => s + score(d.w, g.equipped), passive)
}

// ---- Model without your priorities (the slow parts: buildCards and the gates' fight models) -------------------------
export function cardsModel(save: Save, links: Record<number, number>) {
  const linked = withDeckLinks(save, links)
  const data = buildCards(linked, catalog as unknown as Catalog) as unknown as Data
  const owned = data.cards.filter((c) => c.level >= 1)
  const byId = new Map(data.cards.map((c) => [c.id, c]))
  const byName = new Map(data.cards.map((c) => [c.name.toLowerCase(), c]))
  /** Card type -> the bonus key its adds use (learned from owned cards; e.g. FarmingExp -> BotanyExp). */
  const typeKey = new Map<string, string>()
  for (const c of owned) { const k = Object.keys(c.adds)[0]; if (k) typeKey.set(c.type, k) }
  /** Best owned add per bonus type, so each type's top card scores 1.0 and types become comparable. */
  const maxAdd: Adds = {}
  for (const c of owned) for (const [k, v] of Object.entries(c.adds)) maxAdd[k] = Math.max(maxAdd[k] ?? 0, v)
  // Weights for one link from the given guide sections (all of the link's sections for a deck, one for a build).
  function linkWeights(link: number, secs: string[]): Adds | null {
    const counts = new Map<string, number>()
    for (const g of secs.flatMap((sec) => guide.sections[sec]?.[PHASE] ?? [])) {
      const c = byName.get(g.card.toLowerCase()), k = c && (typeKey.get(c.type) ?? Object.keys(c.adds)[0])
      // Drop a guide bonus only when the code shows another activity reads it and this one does not;
      // bonuses no scene reads (e.g. tinker cost reduction, read in actor scripts) keep the guide's say.
      const here = (activity[link]?.[k ?? ''] ?? 0) > 0
      const elsewhere = Object.entries(activity).some(([l, ks]) => +l !== link && (ks[k ?? ''] ?? 0) > 0)
      if (k && (here || !elsewhere) && !GUIDE_EXCLUDE[link]?.includes(k)) counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const max = Math.max(1, ...counts.values())
    const w: Adds = Object.fromEntries([...counts].map(([k, n]) => [k, Math.round(1 + (2 * n) / max)]))
    for (const [k, reads] of Object.entries(activity[link] ?? {})) if (reads >= CORE_READS && !w[k]) w[k] = 1
    for (const k of NOT_ACTIVITY) delete w[k]
    for (const k of PREVIEW_ONLY[link] ?? []) delete w[k]
    return Object.keys(w).length ? w : null
  }
  /** One guide section's weights over all the links that use it (a build for it). */
  const sectionWeights = (sec: string): Adds => ENTRY_SECTIONS[sec]?.weights ?? Object.assign({}, ...linksOfSection(sec).map((l) => linkWeights(l, [sec])))
  /** Everything one link's activities read: its guide sections merged, else (no guide cards) every bonus the activity reads
   *  at weight 1 (Spelunking: its card bonuses; Tilling: also the crop cards the scene counts, tilling.ts cropCardsEquipped). */
  function buildWeights(link: number): Adds {
    if (link === 12) return Object.fromEntries(SPELUNK_BONUSES.map((k) => [k, 1]))
    const secs = GUIDE_SECTIONS[link] ?? []
    if (secs.some((sec) => guide.sections[sec]?.[PHASE]?.length)) return linkWeights(link, secs) ?? {}
    const w: Adds = Object.fromEntries(Object.keys(activity[link] ?? {}).filter((k) => !NOT_ACTIVITY.includes(k) && !(PREVIEW_ONLY[link] ?? []).includes(k)).map((k) => [k, 1]))
    // A crop card (id 300 + t) boosts only crop t on plots growing it (tilling.ts cropCardsEquipped), so it weighs the
    // share of planted plots growing that crop; crops nobody grows weigh 0 (the author, 2026-10-23: Ancient Dew while all plots grow Corn).
    if (link === 2) {
      const planted = ((save.PlantType as number[] | undefined) ?? []).slice(1).map(Number).filter((t) => t > 0)
      for (const c of owned.filter((c) => c.type === 'CropsGained')) {
        const share = planted.filter((t) => t === c.id - 300).length / Math.max(planted.length, 1)
        if (share > 0) for (const k of Object.keys(c.adds)) w[k] = share
      }
    }
    return w
  }
  const guideW = new Map(data.decks.map((d) => [d.deck, d.link ? buildWeights(d.link) : null]))
  const dmg = linkWeights(9, ['Damage']) ?? {}
  // Decks follow the deck links unless none applies (the author, 2026-10-23): one build per link, its first variant weighing
  // everything the link reads, then one variant per guide section of a multi-section link (Fighting's card farming replaces
  // its 'Card Drop' section); specials no link covers are compared with the selected deck.
  const variant = (link: number, label: string, w: Adds, drop?: string[], note = ''): BuildSpec => ({ label, link, group: 'link', w, drop, note })
  const FARM_NOTE = 'Farm cards at the lowest difficulty you can clear: difficulty doesn\'t change the card roll, it only raises enemy HP and defense. Higher difficulties pay more materials and crusade EXP and unlock extra drops (difficulty 15, 17, 27, 100).'
  const linkBuilds = Object.entries(LINKS).map(([l, name]) => {
    const link = +l, secs = (GUIDE_SECTIONS[link] ?? []).filter((sec) => guide.sections[sec]?.[PHASE]?.length && sec !== 'Card Drop')
    const combined = variant(link, secs.length > 1 ? 'Combined' : name, buildWeights(link), undefined,
      link === 7 ? 'Fish and Smithing cards only: the guide\'s Souls Kept / BP cards are the Ascension and Rebirth builds.' : '')
    const vs = secs.length > 1 ? secs.map((sec) => variant(link, sec, linkWeights(link, [sec]) ?? {}, undefined, sec === 'Crusade' ? 'Crusade fights equip the Fighting deck (crusadefight15).' : '')) : []
    // Botany (link 3): the speed cap is a variant of the Botany build (the author, 2026-10-23), though the game reads it from the deck
    // equipped as you enter Botany (ENTRY_SECTIONS note).
    if (link === 3) vs.push(variant(3, 'Botany', buildWeights(3)), ...Object.entries(ENTRY_SECTIONS).map(([label, e]) => variant(3, label, e.weights, undefined, e.note)))
    // Tilling (link 2): pick a crop, or 'Crops in game' = the crops your plots grow now, by share (the author, 2026-10-23).
    if (link === 2) vs.push(variant(2, 'Crops in game', buildWeights(2)),
      ...owned.filter((c) => c.type === 'CropsGained').sort((a, b) => a.id - b.id).map((c) => variant(2, c.name, Object.fromEntries(Object.keys(c.adds).map((k) => [k, 1])))))
    if (link === 9) vs.push(variant(9, 'Card farming: zone fights', dmg, ['CardDropChance']), variant(9, 'Card farming: crusade fights', dmg, ['CardDropChance', 'CrusadeCardChance'], FARM_NOTE))
    // Card collecting (the author, 2026-10-24): only rolls a deck bonus touches get one. Spelunking cards drop from bags at
    // TunnelCardChance; raid and Asylum card rolls take no bonus (cards-missing.ts expectedKills), so Boss Looting has none.
    if (link === 12) vs.push(variant(12, 'Card collecting: spelunk cards', buildWeights(12), ['TunnelCardChance'], 'Spelunking cards first, then the rest of the Spelunking build.'))
    return { link, name, variants: link === 3 || link === 2 ? vs : [combined, ...vs] }
  })
  const specials: BuildSpec[] = [
    { label: 'Ascension', link: 0, group: 'special', w: { SoulsKept: 1 }, drop: ['AP'], note: ASCEND_NOTE },
    { label: 'Rebirth', link: 0, group: 'special', w: { SoulsKept: 1 }, drop: ['BPgainMisc'], note: REBIRTH_NOTE },
  ]
  // Card drop chance from equipment: the save's value when present, else computed from the equipped items (cloud saves).
  const ebonus = (save.EbonusCardChance as number | undefined) ?? equipmentBonuses(save).scalar.EbonusCardChance ?? 0
  return { linked, data, owned, byId, byName, maxAdd, linkWeights, sectionWeights, guideW, linkBuilds, specials, ebonus, gate: gates(linked) as Gates }
}
export type CardsModel = ReturnType<typeof cardsModel>

/** The farming plan with your priorities: deck weights, odds, best farming decks, ranked missing cards, plan steps.
 *  Pass `model` to reuse cardsModel when only the settings changed (the component does). */
export function cardsPlan(save: Save, st: CardSettings = DEFAULTS, model: CardsModel = cardsModel(save, st.links)) {
  const { data, owned, maxAdd, guideW, ebonus, gate } = model
  const deckWeights = (d: Deck): Adds => st.weights[d.deck] ?? guideW.get(d.deck) ?? Object.fromEntries(Object.keys(d.totals).map((k) => [k, 1]))
  // Card Drop Chance while fighting comes from the deck linked to Fighting (link 9); crusade fights use that deck too.
  const deckBonus = (link: number, key: string) => linkedDeck(data.decks, link)?.totals[key] ?? 0
  const energy = Math.max(10, Math.min(Number(save.Energy ?? 100), 100)) / 100 // crusade scene entry raises Energy to ≥ 10 (@23145007 †)
  const odds: Odds = { cardDrop: deckBonus(9, 'CardDropChance'), crusadeCard: deckBonus(9, 'CrusadeCardChance'), ebonus, energy, rollsPerHour: st.rollsPerHour, crusadeRunSec: st.crusadeRunSec }
  const valueOf = (c: MissingCard) => cardValue(c, Number(save.CardBonusTOTAL ?? 1), data.decks.map((d) => ({ deck: d.deck, w: deckWeights(d) })), maxAdd)
  const cardsAll = data.cards as unknown as MissingCard[], src = cardSources as unknown as Sources
  const missing = rank(missingCards(cardsAll, src, gate, odds, valueOf))
  // ---- Best farming deck: top owned cards by the drop bonuses each roll reads (bonuses add across a deck).
  function bestDropDeck(keys: string[]) {
    const val = (c: Card) => keys.reduce((s, k) => s + (c.adds[k] ?? 0), 0)
    const picks = owned.filter((c) => val(c) > 0).sort((a, b) => val(b) - val(a)).slice(0, data.slots ?? 10)
    return { picks, total: picks.reduce((s, c) => s + val(c), 0) }
  }
  const fightDeck = linkedDeck(data.decks, 9)?.deck // crusade fights use the Fighting deck too
  const fb = bestDropDeck(['CardDropChance']), fNow = deckBonus(9, 'CardDropChance')
  const farmFight = { ...fb, now: fNow, deck: fightDeck, factor: (1 + fNow / 100) / (1 + fb.total / 100) }
  const cb = bestDropDeck(['CardDropChance', 'CrusadeCardChance']), cNow = fNow + deckBonus(9, 'CrusadeCardChance')
  const farmCrusade = { ...cb, now: cNow, deck: fightDeck, factor: (1 + (cNow + ebonus) / 100) / (1 + (cb.total + ebonus) / 100) }
  // The plan assumes the farming decks are equipped (zone stops: the zone pick; crusade stops: the crusade pick).
  const farmOdds: Odds = { ...odds, cardDrop: farmFight.total, crusadeCard: farmCrusade.total - farmFight.total }
  const steps = plan(missingCards(cardsAll, src, gate, farmOdds, valueOf), gate, farmOdds)
  const deckFor = (kind: string) => (kind === 'zone' ? farmFight : kind === 'crusade' ? farmCrusade : null)
  return { deckWeights, deckBonus, odds, missing, farmFight, farmCrusade, bestDropDeck, steps, deckFor }
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'cards', title: 'Cards', src: 'cards-plan.ts cardsPlan steps.farm', fn: (s) => {
    const p = cardsPlan(s, cardSettings()), swaps = new Set<string>()
    const items = p.steps.farm.slice(0, 3).map((st) => {
      const f = p.deckFor(st.kind)
      const swap = f && f.factor < 0.999 ? `first put ${f.picks.map((c) => c.name).join(', ')} in deck ${f.deck ?? '—'}, the Fighting deck (+${+f.total.toFixed(2)}% card drop, now +${+f.now.toFixed(2)}%)` : ''
      if (swap) swaps.add(swap)
      return { text: `Farm ${st.where} for ${st.cards.map((r) => r.name).join(', ')}`, why: `about ${NX.dur(st.hours * 3600)} (${NX.dur(st.total * 3600)} total so far)` + (swap ? `; ${swap}` : ''),
        cells: [st.where, st.cards.map((r) => r.name).join(', '), NX.dur(st.hours * 3600), NX.dur(st.total * 3600)] }
    })
    return { items, head: ['Farm', 'Collects', 'Time', 'Total so far'], note: [...swaps].map((w) => w[0]!.toUpperCase() + w.slice(1) + '.').join(' ') }
  }}
