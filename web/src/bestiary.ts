// Bestiary (#2591): every monster the game's tables let us enumerate, one row each, with where it appears, its HP and
// gold, and the card it drops. Monster = card: a zone monster's name is its card's (ActorEvents_875, fighting.ts
// monsterName), so the rows are web/src/data/card-sources.json (derive-sources.ts, which runs that card actor's own init)
// joined to the existing ports: fighting.ts for zones, raids.ts for raid and Asylum bosses, crusade.ts for crusades.
// Static columns come from those; the save-dependent ones (gold, kills, furthest stage) are filled by progress().
import sources from './data/card-sources.json'
import catalog from './data/card-catalog.json'
import { base, monsterGold, monsterHP, ZONES } from './fighting'
import { BOSSES, bossHP, TIERS } from './raids'
import { CRUSADES, stageHP, stats } from './crusade'

type Save = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const arr = (s: Save, k: string) => (s[k] as number[] | undefined) ?? []
const cardName = new Map((catalog as { cards: { id: number; name: string }[] }).cards.map((c) => [c.id, c.name]))
const nameOf = (id: number) => cardName.get(id) || `card ${id}`

export type Kind = 'zone' | 'special' | 'raid' | 'asylum' | 'crusade'
export type Monster = {
  kind: Kind; name: string; where: string; card: number; cardName: string
  /** zone mode and 0-based stage range (mapleLV; shown +1, like the Cards page) */
  m?: number; stages?: [number, number]
  /** raid / Asylum boss slot (0-3) and TicketsToSpend */
  boss?: number; T?: number
  /** crusade and stage (0-3 mobs, 4 boss) */
  c?: number; L?: number
  /** HP with skill 16 off (on: ×5 in zones and raids, ×7 Asylum B-D), at the stage range's ends */
  hp: [number, number]
}

/** Qoxzul: Grasslands at mapleLV ≥ 99 (stage 100) turns the monster into this special. Its drawing listener (SceneEvents_9
 *  @31847536) writes a fixed mapleexpREQ @31848281 (×(1 + 4·skill 16)), defaultgold 666 @31848862 and MonstersDamage 666666
 *  @31848964; a kill rolls card 173 once (@31850063). */
export const QOXZUL_HP = ((Math.floor(Math.pow(20, 2.2) * Math.pow(1.05, 19) * 86.66666666666666) + 4550) * Math.pow(40, 4)
  + 16e3 * Math.pow(1.26, 16 + 1.8) * (Math.pow(2, Math.pow(5, 2.2) - 1) - 1)) / 1.6 * 15
export const QOXZUL_GOLD = 666

const zoneName = (m: number) => ZONES.find((z) => z.m === m)!.name
const stageText = ([lo, hi]: [number, number]) => (lo === hi ? `stage ${lo + 1}` : `stages ${lo + 1}–${hi + 1}`)

function build(): Monster[] {
  const rows: Monster[] = []
  for (const [id, ss] of Object.entries(sources.sources as Record<string, { kind: string; [k: string]: any }[]>))
    for (const s of ss) {
      const card = Number(id), cn = nameOf(card)
      if (s.kind === 'zone') {
        // Grasslands stage 100 is Qoxzul (below), not the card's monster.
        const stages: [number, number] = [s.stages[0], s.mode === 1 ? Math.min(s.stages[1], 98) : s.stages[1]]
        rows.push({ kind: 'zone', name: cn, where: `${zoneName(s.mode)} ${stageText(stages)}`, card, cardName: cn, m: s.mode, stages,
          hp: [monsterHP({}, s.mode, stages[0]), monsterHP({}, s.mode, stages[1])] })
      } else if (s.kind === 'boss') {
        const type = s.boss.endsWith('2') ? 'asylum' : 'raid', boss = 'ABCD'.indexOf(s.boss[0]), T = s.tickets as number
        const tier = TIERS[type].tiers.find((t) => t[1] === T)![0] || 'base', h = bossHP(type, boss, T)
        rows.push({ kind: type, name: BOSSES[type][boss]![0], where: `${type === 'raid' ? 'Raid' : 'Asylum'} ${tier} (×${T} tickets)`, card, cardName: cn, boss, T, hp: [h, h] })
      } else if (s.kind === 'crusade') {
        const c = s.conquest as number, L = s.stages[0] as number, h = stageHP(stats({}, c, 1), c)[L]!
        rows.push({ kind: 'crusade', name: cn, where: `Crusade ${c} (${CRUSADES[c]!.name}) ${L === 4 ? 'boss' : `stage ${L + 1}`}`, card, cardName: cn, c, L, hp: [h, h] })
      }
    }
  rows.push({ kind: 'special', name: nameOf(173), where: 'Grasslands stage 100', card: 173, cardName: nameOf(173), m: 1, stages: [99, 99], hp: [QOXZUL_HP, QOXZUL_HP] })
  return rows
}
export const BESTIARY = build()

/** Kill-count skulls under a monster's name on the fight screen. The kills line (fight scene, one block per tier) sets
 *  stazzImageKILLS by chained tests on the monster's MapleMonster kills: `99999>kills` → 0 (@7666605, write @7666682),
 *  `999999.9>` → 1 (@7668026, @7668106), `9999999.9>` → 2 (@7669491, @7669573), `99999999.9>` → 3 (@7670997, @7671080), anything
 *  higher → 4 (@7672504, @7672589; the later branches keep 4). ActorEvents_1235 then shows its frame 30 + tier (@4287274), which
 *  is what icon-maps.json "skull" holds (derive-icons.ts). `at` is the round number the game's text and the wiki use. Tier 0 is the plain white skull the game draws under 100K. Note the
 *  game's own edge: exactly 99,999 kills already shows Bronze. Names are the game's own (Skull Duggeridoo contract text
 *  GET_BRONZE_SKULLS_ON_ @16773311 … GET_DIAMOND_SKULLS_ON_ @16779504); that contract counts >99999.9 / 999999.9 / 9999999.9 /
 *  99999999.9 kills (@22747858 ff.). The wiki's Fight page gives the same 100K / 1M / 10M / 100M. */
export const SKULLS = [
  { tier: 0, name: 'No skull', min: 0, at: 0 },
  { tier: 1, name: 'Bronze', min: 99999, at: 1e5 },
  { tier: 2, name: 'Silver', min: 999999.9, at: 1e6 },
  { tier: 3, name: 'Gold', min: 9999999.9, at: 1e7 },
  { tier: 4, name: 'Diamond', min: 99999999.9, at: 1e8 },
] as const
export const skullTier = (kills: number) => SKULLS.reduce((t, s) => (kills >= s.min ? s.tier : t), 0)

/** The save-dependent columns: gold per kill at the range ends (zones), crusade HP up to your highest difficulty, and your
 *  kills / furthest stage / best difficulty beaten as the save has them. */
export function progress(save: Save, r: Monster) {
  if (r.kind === 'zone' || r.kind === 'special') {
    const [lo, hi] = r.stages!, mm = arr(save, 'MapleMonster'), f = n(arr(save, 'FurthestMapleLV')[r.m!])
    let kills = 0 // kill handlers write MapleMonster[mapleLV + base(m)] (@31783908, @31819357)
    for (let L = lo; L <= hi; L++) kills += n(mm[base(r.m!) + L])
    const gold: [number, number] | null = r.kind === 'special' ? [QOXZUL_GOLD, QOXZUL_GOLD] : save.SmithingBonusCash == null ? null : [monsterGold(save, r.m!, lo), monsterGold(save, r.m!, hi)]
    return { gold, hp: r.hp, kills, seen: f >= lo ? `stage ${Math.min(f, hi) + 1}` : null }
  }
  if (r.kind === 'crusade') {
    const top = n(arr(save, 'ConquestDifficultyLV')[r.c!])
    return { gold: null, hp: top > 1 ? [r.hp[0], stageHP(stats({}, r.c!, top), r.c!)[r.L!]!] as [number, number] : r.hp, kills: null, seen: top ? `difficulty ${top} open` : null }
  }
  const best = n(arr(save, 'RaidBossKilled')[(r.kind === 'raid' ? 0 : 4) + r.boss!]), k = `RaidBoss${'ABCD'[r.boss!]}kills`
  return { gold: null, hp: r.hp, kills: r.kind === 'raid' && k in save ? n(save[k]) : null, seen: best >= r.T! ? 'beaten' : null }
}
