// Contracts tab (#22): every contract, its rank and progress, and what fails it. Code reads and offsets are in docs/contracts.md.
// Contract i sits on board ceil(i/4), slot (i-1)%4: the board actor (ActorEvents_938) reads ContractRank[4*(ContractSelected-1)+k], k=1..4,
// and draws the names below in that order †. ContractProgress[i] = -1 is failed; the game clears it on Ascend (14-24) or Rebirth (14-34) †.
type Save = Record<string, unknown>

// Board names: wiki tier names; the game spells out only the last three (UNGODLY/CEREBRAL/LAVATHIAN_CONTRACT @11959798/@12001615/@12076921).
export const BOARDS = ['Easy', 'Medium', 'Hard', 'Extreme', 'Insane', 'Regal', 'Ungodly', 'Cerebral', 'Lavathian']
export const RANKS = ['F', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'SSSS', 'SSSS+'] // wiki; rank 10 = the board draws "COMPLETE" †
/** Deprived Raiding: the skill you must not level, by ContractRank[21] (display strings "DO_THIS_WITHOUT_LEVELING_…" †). */
export const DEPRIVED_SKILL = ['Mining', 'Fishing', 'Summoning', 'Attack', 'Strength', 'Endurance', 'Smithing', 'Strength', 'Endurance', 'Smithing']

export type Confidence = 'verified' | '†' | 'none'
/** [name (game string), what the wiki says it asks, what fails it or null, confidence of the fail condition]. Index = array index + 1. */
const C: [string, string, string | null, Confidence?][] = [
  ['Monster Madness', 'Defeat a particular monster N times in one Ascension', null],
  ['Skill Training', 'Level up your skills N total times', null],
  ["That's a Lotta Damage", 'Deal N damage in one idle attack', null],
  ['Buy Yourself Something Nice', 'Spend N gold on upgrades', null],
  ['Monster Slayer', 'Defeat N monsters (Grasslands to Dungeon)', null],
  ['One Trick Pony', 'Level a particular skill to N', null],
  ['Supreme Skillers', 'Upgrade Training Skillers N times', null],
  ['Smith This Smath That', 'Craft a particular trinket N times in one Ascension', null],
  ['Theater Terrors', 'Defeat a particular boss N times', null],
  ['Pickpocket Pro', 'Pick up N item drops', null],
  ['Catch of the Day', 'Catch N fish in one attempt', null],
  ['Soul Hoarder', 'Own N of a particular soul at once', null],
  ['Glitched Out', 'Reach a particular Glitch monster', null],
  ['Unfinanced Mining', 'Mine N ore without killing a monster', 'Killing 2 or more monsters this Ascend (totalKills ≥ 2; arcade-reward kills count). Checked whenever the Extreme board is on screen.', '†'],
  ['What Is This... Minecraft', 'Craft N smithing items in one Ascension', null],
  ['Rifty Business', 'Level Summoning Rifts N times in one Ascension', null],
  ['Broken Forge', 'Reach a particular monster without crafting', 'Any smithing craft, or smithing items 0-69 totalling more than 1 level.', 'verified'],
  ['Card Collector', 'Reach a total card level of N', null],
  ['Fastest Rod in the West', 'Catch a particular fish within 5 min of Ascending', 'Not caught and turned in by 5:00 after Ascend. Fails on the Fishing screen, the Contracts screen, or any scene load (Multibuy) once 300 s pass; the Multibuy check fails it even if caught but not turned in.', '†'],
  ['Speed Mining', 'Mine a particular ore with a given miner within 5 min of Ascending', 'Not done and turned in by 5:00 after Ascend. Same three checks as Fastest Rod (Mining screen instead of Fishing).', '†'],
  ['Deprived Raiding', 'Defeat a particular boss without levelling a particular skill', 'A level-up of the rank\'s skill (see Skill). At rank F, Tilling, Apothecary, Trekking and Research level-ups also fail it. Turning it in also sets -1, so it can\'t be redone this Ascend.', '†'],
  ['Unskilled Kills', 'Reach a particular monster without using any perks', 'Buying any skill-tree (perk tree) node: the first node of trees 1-5 at level 0, which every other node needs.', 'verified'],
  ['Monster Blitz', 'Reach a particular monster within 5 min of Ascending', 'Reaching the monster after 5:00, or not done and turned in by 5:00 (Contracts screen / scene load).', '†'],
  ['Raid Rush', 'Defeat a particular raid boss within 5 min of Ascending', 'Killing the raid boss after 5:00, or not done and turned in by 5:00 (Contracts screen / scene load).', '†'],
  ['Banishing Behemoths', 'Defeat a post-Dungeon monster N times in one Ascension', null],
  ['Crusade Conquistador', 'Defeat a Crusade boss at difficulty N', null],
  ['Potion Pro', 'Reach a combined level for a potion colour', null],
  ['Planting! At the Disco', 'Grow a particular plant faster than N', null],
  ['Skull Duggeridoo', 'Reach N skull tiers in Fighting', null],
  ['You Call That a Knife', 'Own N excess Tinkering equipment', null],
  ["They See Me Hoein'... They Hatin", 'Harvest N of a Tilling crop within 5 min of Rebirth', 'Opening the Contracts screen more than 5:00 after Rebirth (or Ascend) without it done. Rebirth to retry.', '†'],
  ['Even Photosynthesis Needs RNG', 'Get a particular new seed within N harvests in one Rebirth', 'Running out of harvests: Botany harvests since Rebirth reach the allowed count before the seed. Rebirth to retry.', '†'],
  ['Ding Dong Ditcher', 'Defeat a nightmare asylum boss within 3 min of Rebirth', 'Not done by 3:00 after Rebirth (ticks while in the Asylum fight; also checked on the Contracts screen). Rebirth to retry.', '†'],
  ['Ice Cream Curse', 'Reach an enemy while holding the cursed ice cream', 'Opening the Contracts screen while not holding an ice cream (IceCream = 1) before it is done. Rebirth to retry.', '†'],
  ['Perk Pusher', 'Save up N perk points at once', null],
  ['Solar Flare', 'Reach N stars of Solar damage', null],
]

export type Status = 'failed' | 'complete' | 'open'
export interface ContractRow {
  i: number; board: string; boardNo: number; name: string; asks: string; rank: number; rankName: string; progress: number
  /** ContractRequirement[i]: the target for the current rank, as the board draws it (ActorEvents_938 †); null when unset. */
  required: number | null
  fails: string | null; confidence: Confidence; status: Status; selected: boolean; retry: 'Ascend' | 'Rebirth' | null
  /** Open, progress 0, and the save already meets the fail condition: the game sets -1 the next time that check runs †. */
  doomed: boolean
}

/** Ascend (CREDITS scene, SceneEvents_22 @20903937 †) sets these ContractProgress to 0; Rebirth (@20973653) the same plus 31-34. */
export const ASCEND_RESET = [14, 16, 17, 19, 20, 21, 22, 23, 24]
/** Multibuy init (Design_409 @18618755 †) sets these to -1 on any scene load once TimeSinceAscention > 300, done or not. */
export const WINDOW = [19, 20, 23, 24]

/** Fail conditions that can be read off the save alone (the rest fire on an action: a craft, a tree node, a level-up). */
function doomed(i: number, s: Save): boolean {
  const n = (k: string) => Number(s[k] ?? 0), t = n('TimeSinceAscention'), t2 = n('TimeSinceAscention2')
  if (i === 14) return n('totalKills') >= 2 // ActorEvents_938 @16388358 †
  if (WINDOW.includes(i)) return t > 300
  if (i === 31) return t > 300 || t2 > 300 // SceneEvents_30 @22745856 †
  if (i === 32) return n('TotalHarvestsAfterRebirth') >= n('TotalHarvestsAllowed') // ActorEvents_1120 @3289767 †
  if (i === 33) return t2 > 180 // SceneEvents_41 @27022453 †
  if (i === 34) return n('IceCream') === 1 // SceneEvents_30 @22746912 †
  return false
}

export function contracts(save: Save): ContractRow[] {
  const rank = (save.ContractRank as number[]) ?? [], prog = (save.ContractProgress as number[]) ?? [], req = (save.ContractRequirement as number[]) ?? []
  const sel = Number(save.ContractSelected ?? 0)
  return C.map(([name, asks, fails, conf], k) => {
    const i = k + 1, r = Number(rank[i] ?? 0), p = Number(prog[i] ?? 0), b = Math.ceil(i / 4)
    return {
      i, board: BOARDS[b - 1]!, boardNo: b, name, asks, rank: r, rankName: RANKS[r] ?? 'complete', progress: p,
      required: Number(req[i]) > 0 ? Number(req[i]) : null,
      fails: i === 21 && r < 10 ? `Don't level ${DEPRIVED_SKILL[r]}. ${fails}` : fails, confidence: fails ? conf ?? '†' : 'none',
      status: r >= 10 ? 'complete' : p === -1 ? 'failed' : 'open', selected: b === sel,
      retry: p === -1 ? (i >= 31 ? 'Rebirth' : 'Ascend') : null,
      doomed: r < 10 && p === 0 && doomed(i, save),
    }
  })
}

export interface Step { when: string; ids: number[]; text: string; why: string; unverified: boolean; items?: { id: number; name: string; task: string }[]; list?: string[] }
/** 19 Fastest Rod: the fish whose bite (FishOnHook) sets progress 1, by ContractRank[19] (Fishing scene SceneEvents_7 @~31553000 †).
 *  Fish 1-14 are the small tier, 15-24 medium, 25-30 large (docs/resource-xp.md). */
export const ROD_FISH = [5, 15, 17, 26, 10, 28, 21, 14, 23, 30]
/** Skill-tree unlock nodes a contract needs after an Ascend (SkillLevels reset to 0 @ascend; skilltree.ts names). */
export const TREE_NEED: Record<number, string> = {
  19: 'Unlock the Endurance Fields, then Unlock Fishing (tree 3)', 20: 'Unlock the Attack Dojo, then Unlock Mining (tree 1)', 14: 'Unlock the Attack Dojo, then Unlock Mining (tree 1)',
}

/**
 * #25: the order to do the contracts an Ascend resets, so nothing done early fails one still open. Optimises the number of
 * contracts turned in per Ascend (each turn-in is a rank). Only open (rank < 10) contracts appear; their current -1 is ignored
 * because the Ascend clears it. Rebirth-only contracts (31-34) follow as their own block.
 */
export function ascendPlan(rows: ContractRow[]): { steps: Step[]; skipped: Step[]; rebirth: Step[]; choices: { a: Step; b: Step }[] } {
  const open = (i: number) => rows[i - 1]!.rank < 10
  const name = (i: number) => rows[i - 1]!.name
  const tag = (ids: number[]) => ids.some((i) => rows[i - 1]!.confidence === '†')
  const steps: Step[] = [], skipped: Step[] = [], rebirth: Step[] = []
  // Fishing and Mining need skill-tree unlock nodes after an Ascend, and any node fails 22 Unskilled Kills: with 22 open,
  // those contracts and 22 are an either/or (22's monster first, then the nodes, rarely fits inside 5:00).
  const treeIds = (ids: number[]) => ids.filter((i) => open(i) && TREE_NEED[i])
  const choices: { a: Step; b: Step }[] = []
  const win = WINDOW.filter(open)
  // 14 needs < 2 kills until its ore is mined; 23 (reach a monster) and 24 (raid boss) need kills inside 5:00, and 17/22 need kills too.
  const skip14 = open(14) && (open(23) || open(24))
  const conflict = open(22) ? treeIds([19, 20, ...(skip14 ? [] : [14])]) : []
  const winNow = win.filter((i) => !conflict.includes(i))
  const nodes = (ids: number[]) => [...new Set(ids.map((i) => TREE_NEED[i]))].join('; ')
  const holds: string[] = []
  if (open(14) && !skip14) holds.push('no more than 1 monster kill (14 Unfinanced Mining)')
  if (open(17)) holds.push('no smithing crafts (17 Broken Forge)')
  if (open(22)) holds.push(`no skill-tree (perk tree) nodes (22 Unskilled Kills)${conflict.length ? ', unless you take option A below' : ''}`)
  if (open(21)) holds.push(`no ${DEPRIVED_SKILL[rows[20]!.rank]} level-ups (21 Deprived Raiding)`)
  const held = [14, 17, 22, 21].filter((i) => open(i) && !(i === 14 && skip14))
  if (holds.length) steps.push({ when: 'From the Ascend', ids: held, text: `Until each is turned in: ${holds.join('; ')}.`, list: holds,
    why: 'Each of these sets the contract to -1 on the spot: smithing craft @8888718/@31501216, item levels > 1 @16409711, first tree node @19439683, the skill\'s level-up sites (docs/contracts.md), kills @16388358.', unverified: tag(held) })
  const need = treeIds(winNow)
  // 19: hook clicks change HookLv only; the odds and the bite wait are recomputed on a Fishing power upgrade click
  // (ActorEvents_545 @10614975), a Fishing level-up (@31578223) or, odds only, entering Fishing (@31530650) †.
  const rod = winNow.includes(19) ? ` 19: catch fish ${ROD_FISH[rows[18]!.rank]}. In Fishing, click the hook up to 6 (free, needs Fishing Lv ≥ 10× hook), then buy one Fishing power upgrade (250 gold) so the game recomputes the odds and bite wait; then stay on Fishing until it bites.` : ''
  if (winNow.length) steps.push({ when: '0:00-5:00', ids: winNow, text: `${winNow.map((i) => `${i} ${name(i)}`).join(', ')}: do each and turn it in before 5:00.${need.length ? ` ${need.join('/')} need${need.length === 1 ? 's' : ''} the skill tree first: ${nodes(need)}.` : ''}${rod}`,
    why: 'Past 300 s any scene load (Multibuy @18618755) sets all four to -1 even if done but not turned in; the Fishing/Mining/Contracts screens check too (@31552967, @30446250, @22744959).', unverified: tag(win) })
  if (open(14) && !skip14 && !conflict.includes(14)) steps.push({ when: 'Before any kill', ids: [14], text: '14 Unfinanced Mining: mine the ore target before you fight, then turn it in.',
    why: 'totalKills (the sum of per-monster kills, ActorEvents_601 init) ≥ 2 fails it whenever the Extreme board is drawn (@16388358).', unverified: true })
  const after = [22, 17, 21].filter(open)
  if (after.length) steps.push({ when: 'Then, any order', ids: after, text: `${after.map((i) => `${i} ${name(i)}`).join(', ')}: they don't fail each other; turn each in as soon as it's done to lift its hold.`,
    why: 'None of their fail actions (tree node, craft, one skill\'s level-up) is needed by another; 17 and 22 only ask you to reach a monster.', unverified: tag(after) })
  if (conflict.length) choices.push({
    a: { when: 'Option A', ids: conflict, text: `Take ${conflict.map((i) => `${i} ${name(i)}`).join(', ')}: buy ${nodes(conflict)}${conflict.some((i) => WINDOW.includes(i)) ? ' and turn in before 5:00' : ''}. This fails 22 ${name(22)}; it waits for the next Ascend.`,
      why: 'Fishing and Mining are locked after an Ascend until their tree nodes are bought (SkillLevels reset); the first node of a tree fails 22 (@19439683).', unverified: false },
    b: { when: 'Option B', ids: [22], text: `Take 22 ${name(22)}: buy no tree nodes until you reach its target monster and turn it in. Skip ${conflict.map((i) => `${i} ${name(i)}`).join(', ')} this Ascend${conflict.some((i) => WINDOW.includes(i)) ? ` (${conflict.length > 1 ? 'their' : 'its'} 5:00 will have passed)` : ''}.`,
      why: 'Both in one Ascend only works if 22\'s monster falls inside the first minutes, then the nodes and the catch/ore before 5:00.', unverified: false },
  })
  steps.push({ when: 'After that', ids: [], text: 'Free play: crafting (8 Smith This Smath That, 15 Minecraft), perk tree, any skill.', why: 'All holds are lifted.', unverified: false })
  if (skip14) skipped.push({ when: 'This Ascend', ids: [14], text: `Skip 14 Unfinanced Mining: it forbids the kills ${[23, 24].filter(open).join(' and ')} need inside 5:00, and 17/22 after.`,
    why: 'Doing 14 first costs those contracts unless its ore target fits in the first minutes; it can be retried every Ascend. Raid kills counting toward totalKills is unverified.', unverified: true })
  const rb = [33, 31, 32, 34].filter(open)
  const RB: [number, string][] = [[33, 'Beat the nightmare Asylum boss within 3:00.'], [31, 'Finish the Tilling harvest within 5:00.'],
    [34, 'Hold the cursed ice cream whenever you open the Contracts screen.'], [32, 'Get the seed before your Botany harvests run out.']]
  if (rb.length) rebirth.push({ when: 'After a Rebirth', ids: rb, items: RB.filter(([i]) => open(i)).map(([id, task]) => ({ id, name: name(id), task })),
    text: 'Turning in 19/20/23/24 needs the Contracts screen, which fails 31/33/34 if their time is up or no ice cream is held, so finish 33 and 31 first.',
    why: 'Contracts screen checks @22745856 (31), @22746568 (33), @22746912 (34); Asylum tick @27022453; harvest count @3289767.', unverified: true })
  return { steps, skipped, rebirth, choices }
}
