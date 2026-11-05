// "Do next" tab: per page, the top actions that page already computes, most leverage first. Every item comes from a
// page's own function (named in `src`); a page whose advice lives only in its component says so instead.
// Since step 8 (#71) each module exports its own `next` section; this file only orders and runs them.
import { next as afkNext } from './away'
import { next as codexNext } from './modules/pets/codex'
import { next as shrinesNext } from './modules/asylum/income'
import { next as cardsNext } from './modules/cardplan/cards-plan'
import { next as potionsNext } from './modules/potions/potions-calc'
import { next as botanyNext } from './modules/botany/botany-calc'
import { next as fishingNext } from './modules/gathering/fishing'
import { next as gemsNext } from './modules/gems/gems'
import { next as ascendNext } from './ascend'
import { next as perksNext } from './perk-plan'
import { next as realmNext } from './modules/realm/realm'
import { next as contractsNext } from './modules/contracts/contracts'
import { next as smithingNext } from './modules/gathering/smithing-caps'
import { next as petsNext } from './modules/pets/pets'
import type { Extra, NextSection, Section } from './next-types'

type Save = Record<string, unknown>
export type { Extra, Item, Section } from './next-types'

// Display order on the Do Next tab.
const SECTIONS: NextSection[] = [afkNext, codexNext, shrinesNext, cardsNext, potionsNext, botanyNext, fishingNext,
  gemsNext, ascendNext, perksNext, realmNext, contractsNext, smithingNext, petsNext]

export function doNext(save: Save, extra: Extra = {}): Section[] {
  return SECTIONS.map(({ view, title, src, fn }) => {
    if (!fn) return { view, title, src, items: null }
    try { const r = fn(save, extra); return Array.isArray(r) ? { view, title, src, items: r } : { view, title, src, ...r } } catch (e) { console.warn(`do next ${title}:`, e); return { view, title, src, items: [], error: true } }
  })
}
