// "Do next" tab: per page, the top actions that page already computes, most leverage first. Every item comes from a
// page's own function (named in `src`); a page whose advice lives only in its component says so instead.
import screenMap from './data/screens.json'
import shrineTable from './data/shrines.json'
import potionCatalog from './data/potion-catalog.json'
import discoveryStatic from './data/discovery-static.json'
import { awayPercent, bankedScreens } from './away'
import { claim, claimPick, rewards } from './codex'
import { incomeRates, shrineRows, type ShrineTable, type Snap } from './income'
import { discoveryTargets, type PotionStatic } from './potions-calc'
import { botanyPots, speedCap } from './botany-calc'
import { withDeckLinks } from './cards-calc'
import { cardSettings, cardsPlan } from './cards-plan'
import { ACTIVE_CATCH_SECONDS, awayFishing, fishing, upgrades } from './fishing'
import { gemShop, openItems, per100 } from './gems'
import { preAscendDeck, relevelNeed, resetAdvice, startGold, type AscendSnap } from './ascend'
import { buyList, perkPlan, type GameImpacts } from './perks'
import { realmState, resetCall, stageTable, fmtTime, type Combat } from './realm'
import { ascendPlan, contracts } from './contracts'
import { petsView } from './pets'
import { smithingAffordable, smithingCaps } from './smithing-caps'

type Save = Record<string, unknown>
/** cells: this item as a table row under the section's `head` (text/why stay as the plain-text form). */
export type Item = { text: string; why: string; cells?: string[]; sub?: { head: string[]; rows: string[][] } }
type Out = Item[] | { items: Item[]; head: string[]; note?: string }
/** items null = the page computes no recommendation outside its component; error = the computation threw.
 *  head (+ note, said once above the table) = render the items' cells as a table. */
export type Section = { view: string; title: string; src: string; items: Item[] | null; head?: string[]; note?: string; error?: boolean }
export type Extra = { history?: Snap[]; impacts?: GameImpacts | null; combat?: Combat | null; now?: number; ascendHistory?: AscendSnap[] }

const n = (v: unknown) => Number(v ?? 0) || 0
const sci = (v: number) => (!isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? v.toExponential(2) : (+v.toPrecision(4)).toLocaleString())
const dur = (sec: number) => (sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 172800 ? `${+(sec / 3600).toFixed(1)}h` : `${+(sec / 86400).toFixed(1)}d`)
const hrs = (h: number) => (h === 0 ? 'now' : !isFinite(h) ? 'no income seen' : dur(h * 3600))
const pct = (x: number) => `${+(100 * x).toFixed(1)}%`

const SECTIONS: [view: string, title: string, src: string, fn: ((s: Save, x: Extra) => Out) | null][] = [
  ['afk', 'AFK', 'away.ts bankedScreens', (s, x) => {
    const p = awayPercent(s) ?? 30
    // Codex (21) is left out: its away credit only runs down the daily-claim timer, and waiting loses nothing; see 'codex'.
    const items = bankedScreens(s, screenMap as Record<string, { names: string[]; reduced: boolean }>, p, x.now).filter((r) => r.k !== 21 && r.credited >= 60).slice(0, 4)
      .map((r) => ({ text: `Open ${r.name}`, why: `banks ${dur(r.credited)} (${r.reduced ? `${p}%` : 'full'} of ${dur(r.away)} away)`,
        cells: [r.name, dur(r.credited), r.reduced ? `${p}%` : 'full', dur(r.away)] }))
    return { items, head: ['Open', 'Banks', 'Rate', 'Away for'] }
  }],
  ['codex', 'Codex', 'codex.ts claim, rewards', (s, x) => {
    // Opening the Codex does two things: the daily pet claim (timer restarts at 86400 s on claim, so a ready claim doesn't
    // stack) and setting reached level-up reward flags, which the game reads instead of the level (codex.ts rewards).
    const c = claim(s, x.now), pick = claimPick(s), ready = c.ready ? [{ text: c.free <= 0 ? 'Daily pet ready, but the inventory is full' : pick ? `Claim the daily pet: ${pick.text}` : 'Claim the daily pet',
      why: `${pick && c.free > 0 ? pick.why + ' ' : ''}Ready for ${dur(-c.timer)}; one claim a day, a waiting claim doesn't stack (${c.free} free slot${c.free === 1 ? '' : 's'}).` }] : []
    return [...ready, ...rewards(s).filter((r) => r.pending).map((r) => ({ text: `Open the Codex to switch on ${r.skill} ${r.at}: ${r.bonus}`, why: 'reached, but inactive until the Codex sets its flag' }))]
  }],
  ['shrines', 'Shrines', 'income.ts shrineRows', (s, x) => {
    const rows = shrineRows(s, shrineTable as ShrineTable, incomeRates(x.history ?? [])?.perHour)
    const buy = rows.filter((r) => r.buyable > 0).sort((a, b) => b.buyable - a.buyable)
    if (buy.length) return buy.slice(0, 5).map((r) => ({ text: `Level ${r.name} +${r.buyable}`, why: `Lv ${r.lv} → ${r.lv + r.buyable} affordable now (spending on it alone)` }))
    return rows.filter((r) => r.wait !== undefined).sort((a, b) => a.wait! - b.wait!).slice(0, 3)
      .map((r) => ({ text: `Next: ${r.name} Lv ${r.lv + 1}`, why: isFinite(r.wait!) ? `affordable in ${hrs(r.wait!)}` : 'not affordable; no shrine income measured yet (needs saves 5+ min apart)' }))
  }],
  ['cards', 'Cards', 'cards-plan.ts cardsPlan steps.farm', (s) => {
    const p = cardsPlan(s, cardSettings()), swaps = new Set<string>()
    const items = p.steps.farm.slice(0, 3).map((st) => {
      const f = p.deckFor(st.kind)
      const swap = f && f.factor < 0.999 ? `first put ${f.picks.map((c) => c.name).join(', ')} in deck ${f.deck ?? '—'}, the Fighting deck (+${+f.total.toFixed(2)}% card drop, now +${+f.now.toFixed(2)}%)` : ''
      if (swap) swaps.add(swap)
      return { text: `Farm ${st.where} for ${st.cards.map((r) => r.name).join(', ')}`, why: `about ${dur(st.hours * 3600)} (${dur(st.total * 3600)} total so far)` + (swap ? `; ${swap}` : ''),
        cells: [st.where, st.cards.map((r) => r.name).join(', '), dur(st.hours * 3600), dur(st.total * 3600)] }
    })
    return { items, head: ['Farm', 'Collects', 'Time', 'Total so far'], note: [...swaps].map((w) => w[0]!.toUpperCase() + w.slice(1) + '.').join(' ') }
  }],
  ['potions', 'Potions', 'save PotionType + potions-calc.ts discoveryTargets', (s) => {
    const type = (s.PotionType as number[]) ?? [], idle = [1, 2, 3, 4, 5, 6].filter((c) => !n(type[c]))
    const d = discoveryStatic as { seedNames: string[]; flowerNames: string[] }
    const disc = discoveryTargets(s, potionCatalog as PotionStatic[]).filter((t) => t.chance > 0).sort((a, b) => b.chance - a.chance).slice(0, 3)
    return [
      ...(idle.length ? [{ text: `Start a brew in cauldron${idle.length > 1 ? 's' : ''} ${idle.join(', ')}`, why: 'idle on the Potions tab' }] : []),
      ...disc.map((t) => ({ text: `Discover ${t.name}: ${d.seedNames[t.seed!] ?? `seed ${t.seed}`} + ${d.flowerNames[t.flower!] ?? `flower ${t.flower}`}`, why: `${pct(t.chance)} per discovery brew` })),
    ]
  }],
  ['botany', 'Botany', 'botany-calc.ts botanyPots + speedCap', (s) => {
    const gold = n(s.goldcoin), cap = speedCap(withDeckLinks(s))
    const items = botanyPots(s).flatMap((p) => [
      ...(gold >= p.valueCost && p.valueCost > 0 ? [{ cost: p.valueCost, text: `Pot ${p.pot}: Value upgrade`, why: `+${+p.valueExpGain.toFixed(3)} EXP for ${sci(p.valueCost)} gold`, cells: [`${p.pot}`, 'Value', `+${+p.valueExpGain.toFixed(3)} EXP`, sci(p.valueCost)] }] : []),
      ...(gold >= p.speedCost && p.speedCost > 0 && p.speed < cap.buyBelow ? [{ cost: p.speedCost, text: `Pot ${p.pot}: Speed upgrade`, why: `+${+p.speedGainPct.toFixed(2)}% speed for ${sci(p.speedCost)} gold`, cells: [`${p.pot}`, 'Speed', `+${+p.speedGainPct.toFixed(2)}% speed`, sci(p.speedCost)] }] : []),
    ]).sort((a, b) => a.cost - b.cost).slice(0, 5).map(({ text, why, cells }) => ({ text, why: `${why} (each affordable on its own, cheapest first)`, cells }))
    return { items, head: ['Pot', 'Upgrade', 'Gain', 'Gold'], note: 'Each affordable on its own, cheapest first.' }
  }],
  ['fishing', 'Fishing', 'fishing.ts fishing + awayFishing + upgrades', (s) => {
    const f = fishing(s), p = awayPercent(s), out: Item[] = []
    if (p != null) {
      const ratio = awayFishing(s, p).perAwaySecond / (f.perCatch / ACTIVE_CATCH_SECONDS)
      if (ratio > 1) out.push({ text: 'Leave Fishing parked, visit only to collect', why: `away pays ${Math.round(ratio).toLocaleString()}× active fishing` })
    }
    for (const u of upgrades(s).filter((u) => (u.hook === f.hook + 1 && u.rod === f.rod) || (u.hook === f.hook && u.rod === f.rod + 1)))
      out.push({ text: u.rod > f.rod ? `Rod → ${u.rod}` : `Hook → ${u.hook}`, why: `+${(100 * u.gain).toFixed(0)}% active, +${(100 * u.awayGain).toFixed(0)}% away XP/catch` })
    return out
  }],
  ['gems', 'Gems', 'gems.ts gemShop + openItems', (s) => {
    const shop = gemShop(s), open = openItems(shop).filter((i) => per100(i) > 0)
    const ok = open.filter((i) => i.cost <= shop.gems)
    if (ok.length) return ok.slice(0, 3).map((i) => ({ text: `Buy ${i.name} (${i.cost} gems)`, why: `${i.next!.what}; +${(100 * per100(i)).toFixed(1)}% per 100 gems` }))
    return open.slice(0, 1).map((i) => ({ text: `Save for ${i.name} (${i.cost} gems, have ${shop.gems})`, why: `best per gem: ${i.next!.what}` }))
  }],
  ['ascend', 'Ascend', 'ascend.ts resetAdvice + preAscendDeck + startGold + relevelNeed', (s, x) => {
    const deck = preAscendDeck(s), skip = startGold(s), wait = startGold(s, false), short = relevelNeed(s).filter((r) => r.surplus < 0)
    // When to ascend / rebirth first, each with its evidence as a two-column table.
    const adv = resetAdvice(s, x.ascendHistory ?? [], perkPlan(s, x.impacts))
    return [
      ...[adv.ascend, adv.rebirth].map((a) => ({ text: a.line, why: a.evidence.map(([k, v]) => `${k}: ${v}`).join(' '), sub: { head: ['Evidence', ''], rows: a.evidence } })),
      ...(deck.cards.length ? [{ text: `Before ascending, equip deck ${deck.spare ?? 'any'}: ${deck.cards.map((c) => c.name).join(', ')}`,
        why: `souls kept ${deck.keep[0]}% → ${deck.keep[1]}%${deck.apNext > deck.apNow + 0.5 ? `, AP ${sci(deck.apNow)} → ${sci(deck.apNext)}` : ''}` }] : []),
      { text: 'Click Skip on the ascend credits', why: `start gold ${sci(skip.gold)} vs ${sci(wait.gold)} waiting them out` },
      ...(short.length ? [{ text: `Smithing re-level short on ${short.length} currenc${short.length > 1 ? 'ies' : 'y'}`, why: short.slice(0, 3).map((r) => `${r.label} −${sci(-r.surplus)}`).join(', ') + (short.length > 3 ? ', …' : ''),
        sub: { head: ['Currency', 'Short by'], rows: short.map((r) => [r.label, sci(-r.surplus)]) } }] : []),
    ]
  }],
  ['perks', 'Perks', 'perks.ts perkPlan + buyList', (s, x) => {
    const rows = perkPlan(s, x.impacts)
    return (['AP', 'BP'] as const).flatMap((cur) => {
      const bal = n(s[`${cur}toSpend`]), buys = buyList(rows, cur, bal).buys
      if (buys.length) return buys.slice(0, 3).map((b) => ({ text: `${cur}: ${b.name ?? `perk ${b.i}`} ${b.from} → ${b.to}`, why: `spend ${sci(b.spent)} ${cur}, +${(100 * b.gain).toFixed(1)}% ${b.output}` }))
      // Nothing affordable: the plan's top-ranked (best % per cost) unlocked perk, and whether the reset pays for it.
      const top = rows.find((r) => r.currency === cur && r.next != null && r.impact.length && !r.lock)
      return top ? [{ text: `${cur}: save for ${top.name ?? `perk ${top.i}`} Lv${top.level + 1} (${sci(top.next!)} ${cur}, have ${sci(bal)})`,
        why: `best % per ${cur}${top.afterReset ? `; ${cur === 'AP' ? 'ascending' : 'rebirthing'} now pays for ${top.afterReset} level(s)` : ''}` }] : []
    })
  }],
  ['realm', 'Realm', 'realm.ts realmState steps + resetCall', (s, x) => {
    const r = realmState(s)
    if (!r) return []
    const reset = x.combat ? resetCall(x.combat, stageTable(x.combat, r.bestReached), r.comp.stage === 'endgame') : null
    return [
      ...(reset ? [{ text: reset.reset ? 'Reset now (banish and spend coins first)' : `Push on: beat Afterlife ${r.afterlife}`,
        why: `reset pays ${sci(reset.now)} Spirals; beating the stage (${fmtTime(reset.sec)}) raises it to ${sci(reset.next)}` }] : []),
      ...r.steps.slice(0, 4).map((t) => ({ text: t, why: 'Realm next steps' })),
    ]
  }],
  ['contracts', 'Contracts', 'contracts.ts contracts, ascendPlan', (s) => {
    const rows = contracts(s)
    // Fresh = inside the 5 minutes after an Ascend, while the window contracts can still be turned in: show the order (#25).
    if (n(s.TimeSinceAscention) <= 300) {
      const p = ascendPlan(rows)
      return [...p.steps.filter((st) => st.ids.length), ...p.choices.flatMap((c) => [c.a, c.b]), ...p.skipped].map((st) => ({ text: `${st.when}: ${st.text}`, why: st.why }))
    }
    return [
      ...rows.filter((r) => r.status === 'failed').map((r) => ({ text: `${r.name} (${r.board}) failed`, why: `retry after the next ${r.retry}` })),
      ...rows.filter((r) => r.doomed).map((r) => ({ text: `${r.name} (${r.board}) will fail`, why: `condition already met: ${r.fails}` })),
      ...rows.filter((r) => r.selected && r.status === 'open' && r.fails).map((r) => ({ text: `Watch ${r.name} (${r.rankName})`, why: `fails on: ${r.fails}` })),
    ].slice(0, 5)
  }],
  ['smithing', 'Smithing', 'smithing-caps.ts smithingCaps, smithingAffordable', (s) => smithingCaps(s).map((c) => ({
    text: `Stop crafting ${c.name}: Lv ${c.level.toLocaleString()} is past its cap`,
    why: `${c.bonus} maxes at Lv ${c.cap.toLocaleString()}; further levels add nothing${c.note ? ` (${c.note})` : ''}` }))
    .concat(smithingAffordable(s).filter((a) => (a.to - a.level) / Math.max(a.level, 1) >= 0.05).slice(0, 3).map((a) => ({
      text: `Craft ${a.name}: Lv ${a.level.toLocaleString()} → ${a.to.toLocaleString()} (${a.crafts} crafts)`,
      why: `your materials cover it now (+${Math.round((100 * (a.to - a.level)) / Math.max(a.level, 1))}% levels); costed alone, other items on the same materials share them` })))],
  ['pets', 'Pets', 'pets.ts petsView (warnings, lab.ready, lab.buy, trash)', (s) => {
    const v = petsView(s), vname = (i: number) => v.lab.vessels.find((x) => x.v === i)?.name ?? `vessel ${i}`
    return [
      ...v.warnings.map((w) => ({ text: w, why: 'Pets warning' })),
      ...(v.lab.ready.length ? [{ text: `Open lab tank(s) ${[...new Set(v.lab.ready.map((r) => r.tank))].join(', ')}`, why: 'a tier level is waiting; Research EXP only runs for the open tank' }] : []),
      ...v.lab.buy.slice(0, 2).map((b) => ({ text: `Lab: ${b.name} tier ${b.slot} → Lv${b.level + 1}`, why: `${sci(b.cost)} ${vname(b.vessel)}, ${b.odds}% odds; ${b.gives}` })),
      ...(v.eggsWaiting > v.free && v.trash.length ? [{ text: `Trash ${Math.min(v.eggsWaiting - v.free, v.trash.length)} pet(s), starting with ${v.trash[0]!.pet.name} L${v.trash[0]!.pet.level}`, why: `frees slots for ${v.eggsWaiting} waiting eggs (heuristic, see Pets tab)` }] : []),
    ].slice(0, 5)
  }],
]

export function doNext(save: Save, extra: Extra = {}): Section[] {
  return SECTIONS.map(([view, title, src, fn]) => {
    if (!fn) return { view, title, src, items: null }
    try { const r = fn(save, extra); return Array.isArray(r) ? { view, title, src, items: r } : { view, title, src, ...r } } catch (e) { console.warn(`do next ${title}:`, e); return { view, title, src, items: [], error: true } }
  })
}
