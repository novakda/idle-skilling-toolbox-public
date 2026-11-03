// Realm trophies (#2592): each TrophyInfo row's requirement as the game code checks it, read against the save, with the next
// step. RealmStuff[24][i]: -9 claimed, -1 not offered yet, >= 0 progress (trophyprogress @6459294 only moves values >= 0).
// Claiming (@6787600, needs progress >= target) offers TrophyInfo[i][2] (`next`), plus 9→8, 10→13, 12→15, 16→18, 22→23; the
// panel lists the first four offered rows (@6526023). Offsets are bytes in Qno2x.js. Numbers that need the game's blocks (the
// unique-minion route, boss HP) come from src/realm-trophies.ts via realm-combat.json.
import { barnPos, DATA, fmtTime, stageTable, tierDps, type Combat } from './realm'

export type UniqueStep = { kind: 'evolve' | 'summon'; target: string; from: string; slot?: number; level?: number; path: string[]; cost: number; levelUps: number }
export type TrophyCalc = {
  slots: number; used: number; free: number; unique: number; countinion: number; distinct: number; need: number; missing: string[]
  coins: number; banishMax: number; banishLeft: number; families: number
  steps: UniqueStep[]; banish: { slot: number; id: string; level: number; cashPerMin: number }[]; banishShort: number; days: number
  cost: number; levelUps: number; cashPerMin: number; cashLoss: number; sprint: { bosses: number; hp: number[] }[]; sammich: number
}
export type SprintStep = { minion: string; action: string; cost: number; left: number; colour: string }
export type SprintTime = { bosses: number; limit: number; median: number; p90: number }
/** A speed trophy's fewest-buys plan after a Shrine reset (src/realm-sprint.ts). `found` false: nothing in the search clears it
 *  (`why`). Times are model estimates over seeded random runs (crits, multihits). */
export type SprintPlan = {
  trophy: number; bosses: number; limit: number; found: boolean; why?: string; steps: SprintStep[]; levelUps: number; cost: number
  startCoins: number; slots: number; used: number; times: SprintTime[]; success: number; energyNeed: number; energyHave: number; searched: number
  allIn?: { steps: SprintStep[]; levelUps: number; cost: number; times: SprintTime[]; success: number } // reset's coins spent on speed
}
type Kind = 'tap' | 'event' | 'boss' | 'speed' | 'unique' | 'coins' | 'level' | 'state' | 'never'
/** Requirement per row as the code checks it. `boss`: RealmStuff[6] (bosses beaten this run) >= n; `speed`: [6] >= n while
 *  [37] (seconds into the run) < sec; `coins`: RealmStuff[5] held >= n; `unique`: CalcMisc UniqueBarnMinions >= n. */
type Rule = { kind: Kind; rule: string; at: string; n?: number; sec?: number }
const ev = (rule: string, at: string): Rule => ({ kind: 'event', rule, at })
const boss = (n: number, at: string, total = 0): Rule => ({ kind: 'boss', n, at,
  rule: total ? `bosses beaten this run [6] − ${total} ≥ target (Total, set while [6] > ${total})` : `bosses beaten this run [6] > ${n - 1}` })
const speed = (n: number, sec: number, at: string): Rule => ({ kind: 'speed', n, sec, at, rule: `[6] > ${n - 1} while seconds into the run [37] < ${sec}` })
const NEVER = (why: string): Rule => ({ kind: 'never', rule: why, at: '' })
const RULES: Record<number, Rule> = {
  0: { kind: 'tap', rule: '+1 per tap on the boss', at: '@6586135' },
  1: ev('summon a Piggy (MinionA0) from the portal', '@6650572'),
  2: boss(1, '@6594636, kill @6614221'), 3: ev('+1 per minion level-up (any minion)', '@6509626'),
  4: ev('+1 per banish', '@6636240'), 5: ev('evolve any minion', '@6629471'), 6: boss(2, '@6594909, kill @6614309'),
  7: ev('click a Coin Pressing (trait 7) icon', '@6635688'), 8: ev('Wheat Chew (vending 0) level > 0', '@6593809, buy @6758461'),
  9: boss(3, '@6595182'), 10: ev('a Mountain (MinionB1) in barn slots 1-90, or evolve into one', '@6593313, @6630393'),
  11: ev('Choccy Coin (vending 3) level > 0', '@6594085, buy @6758521'), 12: boss(7, '@6595455'),
  13: { kind: 'coins', n: 1e5, rule: 'floor(coins [5] / 1000) ≥ 100', at: '@6602844' },
  14: { kind: 'level', n: 10, rule: 'Realm Lv [0] ≥ 10', at: '@6600162' }, 15: ev('+1 per Cornucopia turn-in', '@6768128'),
  16: ev('a Lil Chicken (MinionC1) in barn slots 1-90, or evolve into one', '@6593419, @6630713'),
  17: ev('Cornucopia slot upgrades [18] ≥ 2', '@6594360, buy @6769972'), 18: ev('evolve a stage-1 minion (its 2nd evolution)', '@6629774'),
  19: boss(11, '@6595730'), 20: { kind: 'unique', n: 15, rule: 'CalcMisc UniqueBarnMinions ≥ 15', at: '@6600480' },
  21: boss(16, '@6596005'), 22: ev('fire the Orb Tower laser', '@6922385'), 23: speed(5, 315, '@6601221'),
  24: { kind: 'level', n: 20, rule: 'Realm Lv [0] ≥ 20', at: '@6600438' }, 25: speed(10, 375, '@6601732'),
  26: ev('a Rainboppo (MinionA11) in barn slots 1-90, or evolve into one', '@6593526, @6631032'), 27: speed(15, 435, '@6602244'),
  28: boss(25, '@6596280'), 29: speed(20, 495, '@6602756'), 30: ev('evolve a stage-2 minion (its 3rd evolution)', '@6630078'),
  31: { kind: 'unique', n: 40, rule: 'CalcMisc UniqueBarnMinions ≥ 40', at: '@6600571' },
  32: { kind: 'unique', n: 60, rule: 'CalcMisc UniqueBarnMinions ≥ 60 (distinct barn ids + Countinion picks)', at: '@6600662' },
  33: boss(50, '@6596555'), 34: boss(55, '@6596876', 50), 35: boss(60, '@6597385', 55), 36: boss(70, '@6597894', 60),
  37: boss(80, '@6598403', 70), 38: boss(90, '@6598912', 80), 66: boss(99, '@6599421', 90),
  39: NEVER('no trophyprogress call writes row 39: it is offered after row 66 but can never fill'),
  64: NEVER('"Filler": no writer, and no row offers it'), 65: NEVER('"Filler": no writer, and no row offers it'),
  67: NEVER('no writer, and no row offers it (Shrine reset @6762200 does not touch [24])'),
}
// Rows 40-63: the loop @6603171 sets row 40+t to floor(coins / (1000^(2+t) − 0.01)), so 100 = 1e(8+3t) coins held.
for (let t = 0; t < 24; t++) RULES[40 + t] = { kind: 'coins', n: 10 ** (8 + 3 * t), rule: `floor(coins [5] / 1000^${2 + t}) ≥ 100`, at: '@6603171' }
export const TROPHY_RULES = RULES
const SPECIAL: Record<number, number> = { 9: 8, 10: 13, 12: 15, 16: 18, 22: 23 } // extra rows a claim offers (@6787600)
/** Row that offers row i when claimed. */
export const offeredBy = (i: number) => {
  const s = Object.entries(SPECIAL).find(([, to]) => to === i)
  return s ? +s[0] : DATA.trophies.findIndex((t) => (t as { next?: number }).next === i)
}

const name = (id: string) => DATA.minions[id]?.name ?? id
const sci = (v: number) => (Math.abs(v) >= 1e6 ? v.toExponential(2) : Math.round(v).toLocaleString())
const TIER = ['Red', 'Orange', 'Yellow', 'Blue', 'Purple', 'Pink', 'White', 'Rainbow']

export type TrophyRow = { i: number; text: string; target: number; status: 'claimed' | 'ready' | 'open' | 'locked' | 'never'; have: number | null
  rule: string; at: string; next: string; eta: string; steps?: { title: string; cols: string[]; rows: (string | number)[][] } }

export function trophyRows(save: Record<string, unknown>, c: (Combat & { trophies?: TrophyCalc; sprint?: SprintPlan[] }) | null): TrophyRow[] {
  const rs = (save.RealmStuff as any[]) ?? [], st: number[] = rs[24] ?? [], coins = Number(rs[5]) || 0, beaten = Number(rs[6]) || 0
  const tc = c?.trophies ?? null
  const perHour = c?.coins ? c.coins.perMin * 60 : 0
  const stages = c?.minions ? stageTable(c, 120) : []
  return DATA.trophies.map((t, i) => {
    const rule = RULES[i] ?? NEVER('no rule'), v = Number(st[i] ?? -1)
    const status = v === -9 ? 'claimed' : rule.kind === 'never' ? 'never' : v < 0 ? 'locked' : v >= t.target ? 'ready' : 'open'
    const row: TrophyRow = { i, text: t.text, target: t.target, status, have: v >= 0 ? v : null, rule: rule.rule, at: rule.at, next: '', eta: '' }
    if (status === 'claimed') return row
    if (status === 'never') { row.next = 'Cannot be earned in this build.'; return row }
    const by = offeredBy(i), gate = status === 'locked' && by >= 0 ? `Offered once you claim #${by} (${DATA.trophies[by]!.text}). ` : ''
    if (status === 'ready') { row.next = 'Claim it: tap it on the Realm trophy panel.'; row.eta = 'now'; return row }
    if (rule.kind === 'coins') {
      row.next = gate + `Hold ${sci(rule.n!)} coins (you hold ${sci(coins)}); progress reads coins held, so spending lowers it. Claim while you hold them.`
      row.eta = coins >= rule.n! ? 'now' : perHour > 0 ? `${fmtTime(((rule.n! - coins) / perHour) * 3600)} at today's ${sci(perHour)}/h (levelling raises it)` : ''
    } else if (rule.kind === 'boss') {
      const rows = stages.filter((s) => s.afterlife <= rule.n!), sec = rows.reduce((a, s) => a + s.sec, 0), stop = rows.find((s) => !Number.isFinite(s.sec))
      row.next = gate + `Beat ${rule.n} bosses in one run (Afterlife ${rule.n! + 1} on screen); this run is at ${beaten}.` + (stop ? ` Blocked at Afterlife ${stop.afterlife}: ${stop.blocker}.` : '')
      // stageTable does not run Pink (any colour lands, HP refills, @6592818), so a Pink stop is the model's edge, not a wall.
      if (stop?.blocker?.startsWith('Pink')) row.next = row.next.replace(/ Blocked at .*$/, ` Pink tiers from Afterlife ${stop.afterlife} are not modelled.${rule.n! >= 47 && !(rs[3] ?? []).some((x: unknown[]) => x[0] === 'MinionD14') ? ' White (Afterlife 47 on) needs a Big Bone: Flesh Ogre to Lv200, then evolve right.' : ''}`)
      row.eta = beaten >= rule.n! ? 'now' : stop?.blocker?.startsWith('Pink') ? `${fmtTime(rows.filter((x) => x.afterlife < stop.afterlife).reduce((a, x) => a + x.sec, 0))} to Afterlife ${stop.afterlife - 1}, then Pink (not modelled)` : stop ? 'blocked' : rows.length && rows.at(-1)!.afterlife >= rule.n! ? `${fmtTime(sec)} with today's barn` : 'beyond the boss model'
    } else if (rule.kind === 'speed') {
      const sp = tc?.sprint.find((s) => s.bosses === rule.n)
      const hp = sp ? sp.hp.map((h, k) => (h > 0 ? `${TIER[k]} ${sci(h)} (${sci(h / rule.sec!)}/s)` : '')).filter(Boolean).join(', ') : ''
      row.next = gate + `Shrine reset, stay on the Realm screen ([37] runs only there, plus away time) and beat Afterlife 1-${rule.n} within ${rule.sec} s. ` +
        `The reset empties the barn except Cooloar-family minions and starts coins at the Icecream Sammich amount${tc ? ` (${sci(tc.sammich)})` : ''}. ` +
        (hp ? `Boss HP to clear (DPS needed): ${hp}${c?.minions ? `; today's barn does Red ${sci(tierDps(c, 0))}/s, Orange ${sci(tierDps(c, 1))}/s, Yellow ${sci(tierDps(c, 2))}/s` : ''}. ` : '') + 'Claim each speed trophy the moment it fills: the next one is offered at 0 and keeps counting in the same run.'
      row.eta = `one reset run (${Math.ceil(rule.sec! / 60)} min)`
      const plan = c?.sprint?.find((p) => p.trophy === i)
      if (plan) Object.assign(row, sprintRow(plan))
      if (plan?.found) row.next += ` "Show steps": the fewest buys the model finds (estimate), in order, right after the reset; the time you spend clicking them, the portal and the laser is not modelled.`
    } else if (rule.kind === 'unique' && tc) {
      const ev = tc.steps.filter((s) => s.kind === 'evolve').length, su = tc.steps.length - ev
      row.next = gate + `${tc.unique} / ${rule.n} (${tc.distinct} distinct barn minions + ${tc.countinion} Countinion picks). ` +
        (rule.n === 60 ? `${ev ? `Evolve ${ev} spare cop${ev === 1 ? 'y' : 'ies'} and s` : 'S'}ummon ${su} new minion${su === 1 ? '' : 's'}${tc.banish.length ? `, banishing ${tc.banish.length} spare${tc.banish.length === 1 ? '' : 's'} for slots` : ''}: see the route below. Do it before a Shrine reset (it empties the barn and the Countinion picks).` : '')
      row.eta = rule.n === 60 ? `${sci(tc.cost)} coins (${tc.cost <= coins ? 'affordable now' : `${fmtTime(((tc.cost - coins) / Math.max(perHour, 1e-9)) * 3600)} of income`}), ${tc.days ? `${tc.days} more day${tc.days > 1 ? 's' : ''} of banishes` : 'today\'s banishes cover it'}` : ''
    } else row.next = gate + rule.rule + '.'
    return row
  })
}

/** The 60-unique route as numbered steps. */
export function uniqueRoute(tc: TrophyCalc) {
  const out: { do: string; cost: number }[] = []
  for (const b of tc.banish) out.push({ do: `Banish the spare ${name(b.id)} Lv${b.level} (${barnPos(b.slot)}; the barn earns ${sci(b.cashPerMin)} coins/min less)`, cost: 0 })
  for (const s of tc.steps) out.push({ cost: s.cost, do: s.kind === 'evolve'
    ? `Spare ${name(s.from)} Lv${s.level} (${barnPos(s.slot!)}): ${s.path.map(name).join(' → ')}, ${s.levelUps} level-ups`
    : `Summon a ${name(s.from)}: ${s.path.map(name).join(' → ')}, ${s.levelUps} level-ups` })
  return out
}

const secs = (s: number) => (Number.isFinite(s) ? `${Math.round(s)} s` : 'over twice the limit')
/** A speed trophy's plan as dialog rows plus a one-line estimate. */
export function sprintRow(p: SprintPlan): Pick<TrophyRow, 'eta' | 'steps'> {
  if (!p.found) return { eta: `Model estimate: no plan. ${p.why}.` }
  const times = p.times.map((t) => `${t.bosses} bosses in ~${secs(t.median)} (9 runs in 10 within ${secs(t.p90)}) of ${t.limit} s`).join('; ')
  const blue = p.energyNeed ? ` Blue: ${p.energyNeed} Orb energy for the laser shots, you hold ${Math.floor(p.energyHave)}${p.energyHave < p.energyNeed ? ': charge the Orb before resetting' : ''}.` : ''
  return {
    eta: `Model estimate: ${p.steps.length} actions (${p.levelUps} level-ups), ${sci(p.cost)} of the ${sci(p.startCoins)} coins a reset starts with, ` +
      `${p.used} of ${p.slots} barn slots. ${times}; ${Math.round(100 * p.success)}% of simulated runs make ${p.times.length > 1 ? 'all of them' : 'it'}.${blue}`,
    steps: { title: `#${p.trophy}: first ${p.bosses} bosses within ${p.limit} s of a Shrine reset — fewest buys (model estimate)`,
      cols: ['Base minion', 'Evolution steps', 'Final minion', 'Cost', 'Coins left', 'Colour it covers'],
      rows: sprintLines(p.steps).map((l) => [name(l.base), l.evo.join('; ') || '—', `${name(l.last.minion)} Lv${l.level}`,
        sci(l.cost), sci(l.last.left), l.last.colour]) },
  }
}

/** Groups a plan's buy rows into one line per summoned minion: "summon" opens a line, "level to X" and "evolve" extend it. */
function sprintLines(steps: SprintStep[]) {
  const out: { base: string; evo: string[]; level: number; cost: number; last: SprintStep }[] = []
  for (const s of steps) {
    if (s.action === 'summon') { out.push({ base: s.minion, evo: [], level: 1, cost: s.cost, last: s }); continue }
    const l = out.at(-1)!
    l.cost += s.cost; l.last = s
    if (s.action.startsWith('evolve')) l.evo.push(`Lv${l.level}: evolve ${s.action.slice(7)} → ${name(s.minion)}`)
    else l.level = Number(s.action.replace('level to ', ''))
  }
  return out
}
