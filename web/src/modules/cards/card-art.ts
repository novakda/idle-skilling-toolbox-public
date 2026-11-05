// Card position in the card book, shared by the Cards and Ascend tabs. (Card art: game-icons.ts.)
import catalog from '../../data/card-catalog.json'

type Pos = { page: number; tab: number; row: number; col: number }
/** Where the card sits in the card book: "Main 6 · r2 c10". */
export const tabOf = (c: Pos) => `${c.page === 2 ? 'Skull' : 'Main'} ${c.tab} · r${c.row} c${c.col}`
/** Card-book order (the author, 2026-10-24): Main/Skull set, then tab, row, column, so a loadout reads in the order you click it in. */
export const inBookOrder = <T extends Pos>(cs: readonly T[]) => [...cs].sort((a, b) => a.page - b.page || a.tab - b.tab || a.row - b.row || a.col - b.col)
/** The tab's name, when the catalog has one. */
export const tabTitle = (c: Pos) => (catalog.tabLabels as Record<string, string>)[`${c.page}.${c.tab}`] || ''
