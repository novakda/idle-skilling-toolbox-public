// Away gain % (nonActiveZoneGainPercent): the game computes it at load (SceneEvents_2 init), so cloud saves lack it.
// Ported formula: unascended 100 + cards + shrine/2; ascended 28 + cards + realm terms + min(shrine/2 + 5*perk125, 90),
// realm terms = fruit 16 "%_Away_gains_outside_Realm" (realm.ts fruitBonus) + Corn Can vending (2/level) + RealmStuff[13][7]*floor(realm level/10).
// The away engine (refactor step 7, #70): away %, banked time per screen. Idle fighting gains are in fight-away.ts,
// Tilling's in tilling-away.ts.
import { cbonus, type Catalog } from './cards-calc'
import catalog from './data/card-catalog.json'
import { fruitBonus } from './realm'
import screenMap from './data/screens.json'
import * as NX from './next-types'

const n = (v: unknown) => Number(v ?? 0) || 0

/** The game's load-time away gain % (@20193413); the stored value when the save has it. */
export function awayPercent(save: Record<string, unknown>): number | null {
  if (save.nonActiveZoneGainPercent != null) return n(save.nonActiveZoneGainPercent)
  const cards = n(cbonus(save, catalog as unknown as Catalog).CbonusAwayScreenProgress) // selected deck at load
  const shrine = n((save.ShrineLevels as number[] | undefined)?.[9])
  if (n(save.TimesAscended) < 1) return 100 + cards + 0.5 * shrine
  const capped = Math.min(0.5 * shrine + 5 * n((save.MasteryPerksUnlocked as number[] | undefined)?.[125]), 90)
  const realm = (save.RealmStuff as any[] | undefined) ?? []
  if (!realm.length) return 28 + cards + capped
  return 28 + cards + fruitBonus(save, 16) + 2 * n(realm[8]?.[9]) + n(realm[13]?.[7]) * Math.floor(n(realm[0]) / 10) + capped
}

/** Away vs playing, measured live 2026-10-04 (docs/resource-xp.md). Ratios shift as you level; re-measure with src/fish-counter / a watcher. */
export const LEAVE_OR_PLAY: { screen: string; ratio: number; how: 'live' | 'code' | 'save'; verdict?: string }[] = [
  { screen: 'Fishing', ratio: 410, how: 'live' },
  { screen: 'Tilling', ratio: 9, how: 'live' },
  { screen: 'Botany', ratio: 0.3, how: 'live', verdict: 'harvest by hand' }, // XP only on manual harvest (live: 217 s on screen → +0); away grows bars at 30.5%
  { screen: 'Attack Dojo / Strength Mountain / Endurance Fields', ratio: 0.3, how: 'code' },
  { screen: 'Mining', ratio: 0.07, how: 'live' },
]

/** Screens that bank away time, most credited first: (now - LastVisitedZone[K]), times awayPct/100 on "reduced" screens
 *  (Afk tab table; mapping from src/derive-screens.ts). */
export function bankedScreens(save: Record<string, unknown>, screens: Record<string, { names: string[]; reduced: boolean }>, awayPct: number, now = Date.now() / 1000) {
  const last = (save.LastVisitedZone as number[]) ?? [], been = (save.HaveyouBeenBeforeZone as number[]) ?? []
  return Object.entries(screens)
    .filter(([k]) => been[+k] && last[+k]! > 1e9)
    .map(([k, s]) => {
      const away = Math.max(0, now - last[+k]!)
      return { k: +k, name: s.names.join(' / '), away, credited: s.reduced ? away * (awayPct / 100) : away, reduced: s.reduced }
    })
    .sort((a, b) => b.credited - a.credited)
}

/** Do Next section (refactor step 8, #71): moved from do-next.ts. */
export const next: NX.NextSection = { view: 'afk', title: 'AFK', src: 'away.ts bankedScreens', fn: (s, x) => {
    const p = awayPercent(s) ?? 30
    // Codex (21) is left out: its away credit only runs down the daily-claim timer, and waiting loses nothing; see 'codex'.
    const items = bankedScreens(s, screenMap as Record<string, { names: string[]; reduced: boolean }>, p, x.now).filter((r) => r.k !== 21 && r.credited >= 60).slice(0, 4)
      .map((r) => ({ text: `Open ${r.name}`, why: `banks ${NX.dur(r.credited)} (${r.reduced ? `${p}%` : 'full'} of ${NX.dur(r.away)} away)`,
        cells: [r.name, NX.dur(r.credited), r.reduced ? `${p}%` : 'full', NX.dur(r.away)] }))
    return { items, head: ['Open', 'Banks', 'Rate', 'Away for'] }
  }}
