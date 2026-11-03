# Contracts: what fails them

A contract is failed by setting `ContractProgress[i] = -1`; it stays failed until the next Ascend ("ascend to retry").
`ContractRank[i]` is the contract's rank, `ContractSelected` the selected contract board. Offsets are bytes in
`data/game/asar/distBuild/static/game/Qno2x.js`. `SceneEvents_2 @~20211442` sets several to -1 once on a game update
(migration, not gameplay); ignore it.

## Verified (code + in-game behaviour)

| i | Contract (wiki) | Fails when | Where |
|---|---|---|---|
| 17 | **Broken Forge**: reach a monster without crafting | any smithing craft; also if smithing items 0–69 total > 1 level at the check | SceneEvents_6 @31501216, ActorEvents_376 @8888718 (crafts), ActorEvents_938 @16409711 (level sum) |
| 22 | **Unskilled Kills**: reach a monster without using any perks | After an Ascend Fishing and Mining stay locked until their tree nodes are bought, so with 22 open the Fishing/Mining contracts (19, 20, 14) are an either/or with 22 (the plan shows the choice). spending a skill point on the first node of a skill tree (tree types 1–5) while it is level 0; every other node needs it, so any tree purchase fails it. In game: "perk tree was used … ascend to retry" | SceneEvents_1 @19439683 (skill tree click) |

Seen 2026-10-04: the author bought tree nodes; `ContractProgress[22]` 0 → -1, `[17]` stayed 0. An earlier answer here had the
two swapped (it called 17 Unskilled Kills); the display code near `ContractRank[17]` draws several contracts' text.

## Index → contract (†, code-read)

The board actor (ActorEvents_938, draw code @~16.07M–16.94M) reads `ContractRank`/`ContractProgress`/`ContractRequirement`
at `4*(ContractSelected-1)+k`, k = 1..4, and draws the contract names in board order (`"MONSTER_MADNESS_"` @16078400 …
`"SOLAR_FLARE_"` @16927301). So contract i is board ceil(i/4), slot (i-1)%4, and the order matches the wiki's tables 1–36
(data/wiki/datasets/contracts.json `_table`). Boards 1–9: Easy, Medium, Hard, Extreme, Insane, Regal, Ungodly, Cerebral,
Lavathian (names from the wiki). `ContractSelected` 10–14 are the merit-shop pages (@16942223 … 17188330, strings
"AUTO_PROGRESSION_1_", "USED_TO_UNLOCK_ASCENTION_PERKS_"…), so `ContractRank[37..56]` are merit-shop item levels, not
contracts; `ContractProgress` is never indexed past 36. Index 0 is unused. Rank 0–9 = F, D, C, B, A, S, SS, SSS, SSSS,
SSSS+ (wiki); the board draws `<NAME>_COMPLETE` once rank ≥ 10.

Reset: Ascend (SceneEvents_22 = the CREDITS scene, @20903937) sets `ContractProgress[14,16,17,19–24] = 0`; Rebirth
(@20973653, same scene; also resets TimeSinceAscention2 and TotalHarvestsAfterRebirth) resets 14–24 and 31–34. Turning a
binary contract in sets its progress back to 0 (ActorEvents_938 @17337149–17476046), except Deprived Raiding (21), which
is set to -1 on turn-in (@17391609): -1 on 21 means "failed or already turned in this Ascend".

## Fail conditions (†, code-read; not yet seen in game unless listed under Verified)

Only indices 14, 17, 19–24, 31–34 have a gameplay site that sets -1. Every other contract (1–13, 15, 16, 18, 25–30, 35,
36) can't be failed. (16 appears only in the one-off migration.) Script names come from the nearest preceding
`x["scripts.…"]`; scene numbers map to scene-N.scn names (30 = Contracts, 41 = Asylum fight, 16 = Raids, 22 = Credits).

| i | Contract | Fails when | Sites |
|---|---|---|---|
| 14 | Unfinanced Mining | `totalKills ≥ 2` (2+ monster kills this Ascend). Evaluated in the board's draw code, i.e. when the Extreme board is on screen; the same line copies OresMined into progress otherwise | ActorEvents_938 @16388358 |
| 19 | Fastest Rod in the West | `TimeSinceAscention ≥ 300` while progress is still 0 (Fishing scene draw, Contracts screen). Design_409 Multibuy init sets 19/20/23/24 to -1 **unconditionally** once past 300 s, so a catch not yet turned in is also lost | SceneEvents_7 @31552967, SceneEvents_30 @22744959, Multibuy @18618755 |
| 20 | Speed Mining | Same as 19, in the Mining scene | SceneEvents_5 @30446250, SceneEvents_30 @22745557, Multibuy @18618861 |
| 21 | Deprived Raiding | A level-up of the rank's skill while progress is 0. Rank → skill (display "DO_THIS_WITHOUT_LEVELING_…", per `aa` = rank): 0 Mining, 1 Fishing, 2 Summoning, 3 Attack, 4 Strength, 5 Endurance, 6 Smithing, 7 Strength, 8 Endurance, 9 Smithing. Sites check the same rank: Mining SceneEvents_5 @30334962 (r0), Fishing SceneEvents_7 @31579687 (r1), Summoning SceneEvents_28 @21528497 (r2), Attack SceneEvents_3 @22723070 (r3), Strength SceneEvents_0 @19369619/19370187 + SceneEvents_4 @26377841/26378409 (r4/r7), Endurance SceneEvents_0 @19364407/19364975 + SceneEvents_14 @19837816/19838384 (r5/r8), Smithing SceneEvents_6 @30927657/30928225 (r6/r9). Quirks: Tilling (SceneEvents_34, `farmingEXP`) @23535060, Apothecary (SceneEvents_37) @24937262, Trekking (SceneEvents_43) @27297216 and Research (SceneEvents_45, Lab) @29046717 level-ups also check rank 0, so at rank F they fail it too; SceneEvents_0's Attack site @19374287 checks rank 0 and progress 3 (looks like a transposed rank 3 / progress 0), so only the Attack Dojo scene fails rank B | listed |
| 23 | Monster Blitz | Reaching the target monster (ActorEvents_255, per `mapleLV`) after 300 s with progress 0 (≤ 300 s sets 1); also the 300 s checks on the Contracts screen and Multibuy as for 19 | ActorEvents_255 @7892560…7939736 (10), SceneEvents_30 @22745258, Multibuy @18618808 |
| 24 | Raid Rush | Killing the raid boss (SceneEvents_16 = Raids) after 300 s with progress 0; plus the Contracts screen / Multibuy 300 s checks | SceneEvents_16 @19932683…19978182 (10), SceneEvents_30 @22744660, Multibuy @18618702 |
| 31 | They See Me Hoein'… | Contracts screen opened with progress 0 and `TimeSinceAscention > 300` or `TimeSinceAscention2 > 300` (time since Rebirth). No check in the Tilling scene itself | SceneEvents_30 @22745856, @22746212 |
| 32 | Even Photosynthesis Needs RNG | A Botany harvest brings `TotalHarvestsAfterRebirth ≥ TotalHarvestsAllowed` while progress is 0 (board text "NO_MORE_HARVESTS._REBIRTH_TO_RETRY...") | ActorEvents_1120 @3289767, ActorEvents_1132 @3475523 |
| 33 | Ding Dong Ditcher | `TimeSinceAscention2 > 180` with progress 0: ticked every second in the Asylum fight (SceneEvents_41) and on the Contracts screen | SceneEvents_41 @27022453, SceneEvents_30 @22746568 |
| 34 | Ice Cream Curse | Contracts screen opened with `IceCream == 1` and progress 0. IceCream 2–8 are flavours (Mint … Molten Lava, `_GenINFO[5]` strings); 1 is what the game sets when the cone is taken away (@19806408, @19806665), so 1 = no ice cream held (inferred) | SceneEvents_30 @22746912 |

`SceneEvents_2 @~20211318` (`haveUplayedRecentUpdate4`) and @20234456 (`doOnce` 13, sets 31/32) are one-off migrations.

## Not resolved

- 34: that IceCream = 1 means "no ice cream" is inferred from the reset sites, not from a definition.
- 21 rank-0 Tilling/Apothecary/Trekking/Research sites and the SceneEvents_0 Attack check look like copy-paste in the game; recorded as the code reads.
- 14 and the time checks only fire where the code runs (board on screen, scene loaded); in practice that is soon after the event.

## Post-Ascend order (#25, web/src/contracts.ts `ascendPlan`)

Optimises contracts turned in per Ascend. Facts it rests on (†, code-read):

- Ascend clears exactly `ContractProgress[14,16,17,19–24]` (@20903937; test reads the indices from the game).
- Multibuy init (@18618755) sets 19/20/23/24 to -1 on any scene load once `TimeSinceAscention > 300` (test runs that line
  from the game against 300 and 301 s). So those four go first and are turned in before 5:00.
- **"Multibuy" is not the multibuy button.** Design_409 is a scene behavior placed on the 14 skill scenes with upgrade buttons (parsed from `assets/data/scene-N.mbs` behavior lists, #2727): mainnn1 (scene 0), Attack Dojo, Strength Mountain, Mining, Smithing, Fishing, Endurance Fields, Spiriting, Rune Summon, Tilling, Farming, Potions, Spelunking, Spelunking Construction. Its init runs on entering any of them, whether or not you multibuy. Not on Contracts, Cards, Raids, fights, Trek, Hatchery, Lab, Asylum, Codex, Gift Shop or Realm. It touches no other contract (its only other ContractProgress write is contract 4's gold tally). The game never says this; the board only shows the 5:00 rule.
- 17's level check (@16409711) sums `SmithingItemLevel[0..69]` into `ContractProgress[15]` (What Is This… Minecraft) and
  fails 17 when that sum > 1.
- `totalKills` is the sum of `MapleMonster[0..1499]` (ActorEvents_601 init) and is reset to 0 on Ascend (@20942079). Whether
  raid kills land in `MapleMonster` is unverified; the plan assumes they do.
- Holds from the Ascend until turn-in: no crafts (17), no tree node (22), no level-up of 21's skill, ≤ 1 kill (14).
  17, 22 and 21 don't fail each other, so after the 5-minute window they go in any order.
- 14 vs the window: 23 and 24 need kills inside 5:00, 17/22 need kills after, and 14 fails at the 2nd kill. With 23 or 24
  open the plan skips 14 for that Ascend (judgment, not code).
- After a Rebirth, the Contracts screen (needed to turn anything in) fails 33 past 180 s, 31 past 300 s, and 34 when no ice
  cream is held (@22745856–22746912), so 33 and 31 are finished before turn-ins and the ice cream is held.
- Attack/Strength/Endurance level in their gym scenes, not from monster kills, so 21's hold doesn't block fighting
  (inferred from the level-up sites; SceneEvents_0 also has Strength/Endurance sites, scene not identified).

Not decoded: each rank's target monster/boss for 17, 22, 23, 21, 24 (the sites are per rank in ActorEvents_255 and
SceneEvents_16; the board draws the name), and the ore target for 14 at each rank vs. what is minable in 5:00.

The Do next tab shows these steps (plus the skip note) while `TimeSinceAscention <= 300`; after that it lists failed
contracts, open ones whose fail condition the save already meets ("will fail"), and the selected board's traps.

## 19 Fastest Rod: target and odds (#2727, †)

- Progress 1 is set in the Fishing scene when `FishOnHook` equals the rank's fish (SceneEvents_7 @~31553000): F 5, D 15, C 17,
  B 26, A 10, S 28, SS 21, SSS 14, SSSS 23, SSSS+ 30 (`ROD_FISH`; the test reads it from the bundle). 26/28/30 are large-tier.
- After an Ascend: hook/rod 1, rod max 1 (rod max comes from SmithingItemLevel 7/23/39, Iron/Cobalt/Rainbow Rod, @9003965,
  wiped), wait 10-15 s, power 0. Hook clicks are free up to 6 at Fishing Lv ≥ 10·hook (@9010873) but change only HookLv: odds
  are recomputed on entering Fishing (@31530650), on a Fishing level-up (@31578223) or a power-upgrade click (ActorEvents_545
  @10614975, 250 gold after an Ascend); the wait only on the last two. `FunnyHatPurchased` is in neither reset block.
- `contract-plans.ts fastestRod` estimates the odds; the catch time reuses the measured 5.4 s cycle minus its wait (estimate).
