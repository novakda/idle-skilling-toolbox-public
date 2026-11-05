// Where a missing card drops, as text (refactor step 9, #72): the drop table (data/card-sources.json) and its labels.
// Split from cards-missing.ts so the card producer and the apothecary can name a source without the farming model;
// it reads only core data (crusade names, raid tiers).
import cardSources from '../../data/card-sources.json'
import { CRUSADES } from '../../crusade-data'
import { TIERS } from '../../raid-data'

export type Source = { kind: 'zone'; mode: number; stages: [number, number] } | { kind: 'crusade'; conquest: number; stages: [number, number] }
  | { kind: 'boss'; boss: string; tickets: number } | { kind: 'skill'; skill: string; detail: string; chance: number | null; per: string }
export type Sources = { modeNames: Record<number, string>; sources: Record<number, Source[]> }
/** Raid (A-D) and Asylum (A2-D2) bosses by drop-table key: queue index and ticket base. */
export const BOSS: Record<string, { raid: boolean; i: number; n: number }> = {
  A: { raid: true, i: 0, n: 0 }, B: { raid: true, i: 1, n: 0 }, C: { raid: true, i: 2, n: 0 }, D: { raid: true, i: 3, n: 0 },
  A2: { raid: false, i: 0, n: 100 }, B2: { raid: false, i: 1, n: 110 }, C2: { raid: false, i: 2, n: 130 }, D2: { raid: false, i: 3, n: 145 },
}

const stageText = ([lo, hi]: [number, number]) => (hi >= 200 ? `stage ${lo + 1}+` : lo === hi ? `stage ${lo + 1}` : `stages ${lo + 1}–${hi + 1}`)
export const nameOf = (names: Record<number, string>, m: number) => names[m] ?? `mode ${m}`
export function sourceText(src: Source, names: Record<number, string>): string {
  if (src.kind === 'zone') return `${nameOf(names, src.mode)} ${stageText(src.stages)}`
  if (src.kind === 'crusade') return `Crusade ${src.conquest} ${CRUSADES[src.conquest]?.name ?? ''} ${stageText(src.stages)}`.replace('  ', ' ')
  if (src.kind === 'skill') return `${src.skill}: ${src.detail}`
  const b = BOSS[src.boss]!, tier = (b.raid ? TIERS.raid : TIERS.asylum).tiers.find((t) => t[1] === src.tickets)
  const boss = (b.raid ? ['King', 'Entertainer', 'Sentinel', 'Demon'] : ['Emigdala', 'Occulon', 'Scallius', 'Gorshank'])[b.i]
  return `${b.raid ? 'Raid' : 'Asylum'} ${boss} ${tier?.[0] || 'base'}`
}

// Where a card drops: the game's own drop table (card-sources.json, e.g. Crusade 15 Father of All stage 5) before the wiki's
// zone label, which names crusade cards after fight zones ("Crus.LunarIsle-5").
const SRC = cardSources as unknown as { modeNames: Record<number, string>; sources: Record<string, Source[]> }
export function dropText(id: number, zone: string | null | undefined) {
  const src = SRC.sources[String(id)]?.[0]
  if (src) return sourceText(src, SRC.modeNames)
  return `${zone ?? '?'}${zone === 'Apothecary-1' ? ' (brewing potions 1-8)' : ''} (wiki)`
}
