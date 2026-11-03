// #21 restore side: turn a local-only backup (save-load.ts localOnlyBackup) into steps to redo by hand in game.
// Only plain reading of the saved values; nothing is written to the game.
import { LINKS } from './cards-calc'
import { BOSSES } from './raids'
import { name as gearName } from './tinkering'
import catalog from './data/card-catalog.json'

const cardName = new Map((catalog.cards as { id: number; name: string }[]).map((c) => [c.id, c.name]))
const on = (a: unknown) => (Array.isArray(a) ? a.flatMap((v, i) => (v ? [i] : [])) : [])

export type GuideLine = { what: string; value: string; redo: 'set' | 're-earn' }

export function backupGuide(k: Record<string, any>): GuideLine[] {
  const out: GuideLine[] = []
  const links = (k.DeckLinkList as number[] | undefined) ?? []
  links.forEach((l, d) => { if (d && l) out.push({ what: `Deck ${d} link`, value: LINKS[l] ?? `activity ${l}`, redo: 'set' }) })
  const eq = (k.EquipmentbyDeckList as number[] | undefined) ?? []
  // EquipmentbyDeckList[8(d − 1) + slot] (tinkering.ts decks): name the deck, not the flat index.
  const byDeck: string[][] = []
  eq.forEach((e, f) => { if (f && e) (byDeck[Math.ceil(f / 8)] ??= []).push(gearName(e)) })
  byDeck.forEach((g, d) => { if (g) out.push({ what: `Tinker deck ${d} equipment`, value: g.join(', '), redo: 'set' }) })
  const crops = on(k.CropCardsEquipped).map((i) => cardName.get(300 + i) ?? `crop card ${300 + i}`)
  if (crops.length) out.push({ what: 'Crop cards equipped', value: crops.join(', '), redo: 'set' })
  if (k.CalibrationTrek != null) out.push({ what: 'Trekking zone', value: `${k.CalibrationTrek} (background ${k.TrekkingBGselected ?? '?'})`, redo: 'set' })
  const auto = on(k.AutoAdvanceToggle)
  if (auto.length) out.push({ what: 'Auto-advance (AFK) on', value: `toggles ${auto.join(', ')}`, redo: 'set' })
  for (const [mode, list] of [['Raid', BOSSES.raid], ['Asylum', BOSSES.asylum]] as const) {
    const got = list.filter(([, key]) => key && k[key]).map(([name]) => name)
    if (got.length) out.push({ what: `${mode} bosses unlocked`, value: got.join(', '), redo: 're-earn' })
  }
  for (const [key, what] of [['TotalH2OTokens', 'H2O tokens'], ['TicketsToSpend', 'Tickets'], ['WeabooFightsUnlocked', 'Weaboo fights unlocked'],
    ['LittleGuyProgression', 'Little guy progression']] as const) if (k[key]) out.push({ what, value: String(k[key]), redo: 're-earn' })
  for (const [key, what] of [['CraftingMaterialUNLOCKED', 'Crafting materials unlocked'], ['UpgradeUnlocked', 'Upgrades unlocked']] as const)
    if (on(k[key]).length) out.push({ what, value: `${on(k[key]).length}`, redo: 're-earn' })
  return out
}
