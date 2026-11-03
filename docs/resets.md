# Ascend vs Rebirth: what resets, what is kept

Source: `data/game/asar/distBuild/static/game/Qno2x.js` (raw byte offsets, line is 1 long).
Both flows go through scene 22: `SceneEvents_22.init` branches on `APmenuSelected`
(`1` = Ascend, `2` = Rebirth), runs one reset block, sets `AreYouAscending=false`, calls `saveGame`.
Cross-checked against the wiki pages Ascension and Rebirth (agree everywhere noted below).

## Which block is which

| | Ascend | Rebirth |
|---|---|---|
| Menu flag | `APmenuSelected==1` | `APmenuSelected==2` |
| Award click handler | `APtoSpend = APtoSpend + reward` @12469725 (read @12465692) | `BPtoSpend = BPtoSpend + reward` @12480775 (read @12476543) |
| Reset block (scene 22) | `if(1==APmenuSelected)` @~20900963 .. `AreYouAscending=false` @20952873 | `if(2==APmenuSelected)` @~20956359 .. `AreYouAscending=false` @21022359 |
| Fade colour (cosmetic) | 0,102,204 | 0,153,0 |

Evidence: both award handlers (@12465xxx / @12475xxx) test `APmenuSelected` 1 vs 2 and write AP vs BP
respectively; scene 22 tests the same flag. Rebirth block also writes `NumberofTimesRebirth+1`.
Rebirth = Ascend reset + extra (farming/herblore/potions, skill levels incl. farming/herblore/apothecary,
ores/fish owned, unspent AP). Block 2 is a strict superset of block 1, plus the items below.

Note: `APtoSpend` is the unspent-AP **balance** (reward is added at click time), so rebirth's write to it
is the "wipe unspent AP" step.

## ASCEND (block 1, ~@20900963-20952873)

### 1. Reset to constant
- **Fighting**: `fightsunlocked=1`, `FarthestMapleLV=0`, `mapleLV=0`, `mapleLVmax=0`, `MaplePlayerLV=1`, `mapleexp/MaplexpTOTAL=0`, `mapleexpREQ=100`, `mapleextotalREQ=50`, `totalKills=0`, `DeathKills=0`, `PlayerHP/PlayerHPmax=100`, `DPS=5`, `dpsspeed=1.73`, `MonstersDamage=5`, `MonsterHitRequirement=5`, `CriticalChance=10`, `CriticalDamage=1.25`, `Hitchance=100`, `HandoWeapon=1`, `FightZoneTYPE=1`, `FightingCashPerMin=0`, `HaveyouBeenBeforeZone[0..49]=0`, `FurthestMapleLV[0..49]=0`, `MapleMonster[..]=0`, `RaidBossKilled[0..3]=0`, Raid counters (`RaidBossNumber/Queue/TotalTime/Dkills`=0), `OfflineGains/OverallStats[0..49]=0`, boss active/unlocked flags false.
- **Currency**: `goldcoin=0`, `goldfromkill=0`, `GoldcoinPreAscend` set to `goldcoin` (see section 2), `TicketsToSpend=0`, `Skillpoints=0`.
- **Combat skills (EXP/REQ)**: `atk/str/end EXP=0`, `REQ=3`, chance 200; `smithingEXP=0`, `smithingREQ=3`; `miningEXP=0`, `miningREQ=10`, `miningChance=150`; `fishingEXP=0`, `fishingREQ=10`; `summonEXP=0`, `summonREQ=10`; `spiritEXP=0`, `SpiritREQ=10`; `waterEXP=0`, `waterEXPrequired=100`, `waterLVreq=0`. Level itself: see section 2.
- **Skill tree / training**: `SkillLevels[0..99]=0` (also `SelectedSkill/SkillActive/SkillTime[0..99]`), `TrainingPerkLevels[0..19]=0`.
- **Fishing**: `FishingRodLv/Max=1`, `HookLv/Max=1`, `FshUpgradePowerLV/2/3=0`, `FishPowerCost=250/5e4/2e6`, `FishingTimeMin/Max=10/15`, `TotalFishCaught=0`, `FishChance S/M/L=98/2/0`, `FishingExpGiven=1`, `expgiven[0..22]` reset to defaults.
- **Mining / forge**: `MinersOwned=1`, `MinerLV[0..11]` (idx1=1 else 0), `MinerLV2` same, `MinerArmor[0..9]=0`, `MinerSpeedCost/MinerValueCost` to base costs, `RockLV[1]=1` rest 0, `RockLVmax=0`, `OresMined=0`, `DoubleOres=0`, `MiningExpGiven[1..50]=5`, `OresGiven[1..50]=1`, `ForgeUses/ForgeUsesMAX=[0,3,4,6]`, `ForgeToNextUse[0..29]=0`.
- **Smithing**: `AnvilsOwned=1`, `SmithingItemLevel[0..80]=0`, `SmithingItemsYouOwn[0..149]=0`, `smithing1B/Smithing2B/SmithingAnvilItem/SmithingCost1/2[0..99]=0`, `SmithingUsesCost=[0,10,20,30]`, `SmithingBaseAttack/BonusCash/FishingPower/AttackSpeedBoost/RepSpeedBoost=0`, `CraftingLvUps=1`.
- **Lifting**: `LiftersOwned=1`, `LifterLV` ([2]=1 else 0), `LifterLV2`, `LiftingReps/GrowLifterzzz/LiftersOwnedAtkStrEnd[0..49]=0`, `totalreps=0`.
- **Summoning / spiriting** (loop i=0..49): `SoulsOwned[i]=0`, `CultistsOwned/AcolytesOwned/RiftsOwned=1`, Cultist/Acolyte/Rift level, task, speed, value arrays back to 1/0, `RiftEXP=0`, `RiftExpREQ=25`, `RiftItemsYouOwn=0`, `GlyphsGiven/SoulsGiven/SoulsGivenAco/SummonExpGiven/SpiritExpGiven*=1`, `SummonChance/SpiritChance=100`.
- **Contracts**: `ContractProgress[14,16,17,19..24]=0`, `ReachedKeymaster[1..4]=0`, `AsylumBellBEST[1..4]=0`. (`ContractRank` NOT touched.)
- **Misc**: `H2OTokenRefunds=1`, `AscentionLockComplete=1`, `riftopen=0`, `WaterGiven[0..22]` defaults, `Mastery=.2`, `TimeSinceAscention=0`, many UI/animation vars.

### 2. Set to a computed start value
- Combat/skill levels: `atkLVL, strLVL, endLVL, miningLVL, smithingLVL, fishingLVL, summonLVL, spiritLVL` =
  `1 + GiftShopLevels[g] + min(max(100*(MasteryBonuses[16]-1),0),20) + ContractRank[44] + AscentionLevel[24] + (TankBonusLIST[46]-1)`
  with g = atk 1, str 3, end 5, mining 7, smithing 9, fishing 11, spirit 19, summon 21.
  (AscentionLevel[24] = "Skill Max" perk, +1 start level per skill; MasteryBonuses[16] term capped at +20.)
- `waterLV = 1 + ceil(1.5*ShrineLevels[8] + (TankBonusLIST[46]-1))`.
- `RiftLVL[1] = AscentionLevel[21] + 1` ("Rift Kickstarter"); `RiftLVL[0]=1`.
- `SoulsTotal[i] = SoulsTotal[i] * SoulstoKeepPercent/100`, `SoulstoKeepPercent = min(20 + CbonusSoulsKept, 100)` (set @20186347). Wiki: "keep 20% of souls".
- `GoldcoinPreAscend` is zeroed then set to the pre-reset `goldcoin` (verified: live save's value = the gold in the 2026-10-03 ascend capture). Scene 22 is the credits; it pays the next run's start gold `max(min(2500·2^TimesAscended, 250000), GoldcoinPreAscend × keep)`: clicking **Skip** (ActorEvents_958, from the 2nd ascend, 5 s in) uses keep = `min((PbonusStartingCash+0.8)/100, 0.99)` @17777134; waiting out the 24 s timer uses `min((PbonusStartingCash+0.6)/100, 0.3)` @21120286. `PbonusStartingCash = (5·[PotionLV[45]≥1] + 0.5·PotionLV[45]) × (0.02·PotionLV[94] + VendingBonus(5)/100 + 1)`. See web/src/ascend.ts.
- `TotalKillContract5 += totalKills`; `TotalPlayTime += TimeSinceAscention`; `WeabooFightsUnlocked = fightsunlocked` (pre-reset value, preserved record).
- `APcoupons += 1` with chance `TankBonusLIST[7]`% (rolled 1..100 into `SparklecoinRng1000`).

### 3. Notably KEPT
AP spent perks (`AscentionLevel`), `APtoSpend` balance (reward already added), `MasteryBonuses`/Mastery points/tasks, `ContractRank`, `GiftShopLevels` (raid gift shop), Cards, Secrets, Crusades, Pets, Construction, Research tanks (`TankBonusLIST`),
**Ores and fish owned (`OresOwned`, `FishOwned`) and all Farming / Botany / Herblore / Apothecary state** (farming/herblore/apothecary levels, plots, seeds, flowers, potions, cauldrons are not written in this block), `sparklecoin`, `NumberofTimesRebirth`, BP, 20%+ of Souls.

## REBIRTH (block 2, ~@20956359-21022359)

Everything in the Ascend lists above (same constants, same start-level formulas; the summon/spirit formulas appear to lack the `TankBonusLIST[46]-1` term, minor, verify if it matters), plus:

### 1. Extra resets to constant
- **Ores / fish owned**: `OresOwned[1..30]=0`, `FishOwned[1..30]=0`, `ExtraOresDisplay=0`, `OverLevels[1..30]=0`.
- **Farming / Tilling**: `farmingEXP=0`, `farmingREQ=50`, `FarmersOwned=1`, `SeedsOwned/SeedsUnlocked[1..40]=0`, per-farmer arrays (`FarmerLV1/2`, `PlantPlot*lv`, `PlantLevel`, `PlantexpRANK`, `PlantType/Max`, `SeedsGiven`, `FarmingExpGiven`, `FarmerArmor`) to base, `FarmerValueCost/SpeedCost`, `PlantexpRANKreq` to base tables, `TotalHarvestsAfterRebirth=0`.
- **Botany / Herblore**: `HerbloreEXP=0`, `HerbloreREQ=10`, flowers owned/unlocked [1..48]=0, `HerbPotexpRANK`, `HerbloreLV1/2`, `HerblorePotLevel`, ingredient qty arrays, `HerbloreValueCost/SpeedCost`, `HerbPotexpRANKreq` to base.
- **Potions / Apothecary**: `ApothecaryEXP=0`, `ApothecaryREQ=10`, `PotsOwned=1`, `CauldronsOwned=1`, `PotionIngredient1/2`, `PotionType`, `CauldronLV1/2`, `ApothecaryValueCost/SpeedCost` to base.
  **Potion levels survive**: neither block writes `PotionLV` (its only writes in the game are one-time initialisations: SceneEvents_2 @20205587 / @20245828, ActorEvents_119 @3867976). A rebirth resets the apothecary level, EXP and cauldrons (the brewing), not the potion bonuses. ascend.test.ts checks this against the bundle.
- **Unspent AP**: see section 2.
- **Contracts**: additionally `ContractProgress[31..34]=0`.
- `GoldcoinPreAscend=0` (not preserved), `BPmtxscrollBought=0`, `TimeSinceAscention2=0`, `TimeSinceAscention=1`, `TotalHarvestsAfterRebirth=0`, `IceCreamACCEPTED=0`.

### 2. Computed start values (differences from Ascend)
- `FarmingLV = 1 + AscentionLevel[56] + ContractRank[44] + AscentionLevel[24] + (TankBonusLIST[46]-1) + min(max(100*(MasteryBonuses[16]-1),0),20)`;
  `HerbloreLV` same with `AscentionLevel[57]`; `ApothecaryLV` same with `AscentionLevel[58]`.
- `APtoSpend = 7 * MasteryPerksUnlocked[52] / 100 * APtoSpend` (unspent AP wiped except 7% per level of Mastery perk 52; wiki says "resets all unspent AP", it omits this perk).
- `NumberofTimesRebirth += 1`; `sparklecoin +150 / +100 / +50` on the 1st / 2nd / 3rd rebirth only.
- `IceCream = IceCreamACCEPTED` (preserved), `IceCreamACCEPTED=0`.
- Skill levels (atk etc.) use the same formula; wiki says Rebirth resets all skill levels except Crusades/Pets/Construction, consistent with levels being recomputed from the same perk sources.

### 3. Notably KEPT
Everything Ascend keeps except: unspent AP (mostly wiped), ores/fish owned and farming/botany/herblore/apothecary progress (wiped). Still kept: potion levels (`PotionLV`), `AscentionLevel` perks, BP perk tree, `ContractRank`, Cards, Secrets, Crusades, Pets, Construction, `GiftShopLevels`, Mastery, `TankBonusLIST`, souls at keep %, `sparklecoin`.

## Ascend vs rebirth vs keep going (#2669)

The Ascend page's "Keep going, ascend or rebirth" table (web/src/ascend.ts `resetCompare`) sets what each pays and buys
(perks.ts buyList) against what it wipes (this file) and an **estimate** of the time back: the hour of this run when BP
term 5 (map progress) first reached 95% of today's (ascend), and the hour of this rebirth cycle when BP terms 1-3
(tilling plants/overlevels, botany flowers/pots, seeds) did (rebirth), from data/ascend-history.json. The verdict follows
`resetAdvice`; its plan line uses BP term 4: unspent AP caps it at 1500 base BP from about 5.05e9 AP held
(`AP_HOLD`), so ascending, holding that much, and rebirthing once back at today's progress pays more BP than rebirthing
mid-run, and the rest of the AP still buys perks. After an ascend the BP reward falls (map term, smithing item 70 and
skill 65's +1.5%/level all reset) until those are rebuilt.

### Climb back with what a reset buys (#2673)

`climbBack` (ascend.ts) redoes the "back to here" climb with the perks the reset buys (buyList levels added to
`AscentionLevel`), keeping the old estimate beside it.

- **Map climb (ascend and rebirth).** Modelled exactly: the kill rate at the target frontier monster, uncapped,
  attacks/s × average hit / monster HP × survival^1.8 × kills credited per kill (fighting.ts `estimate`, the game's AFK
  formula @21682751 / @31705994; monster HP = mapleexpREQ @31804850), before vs after the buys. Estimate: the climb is
  damage-walled, so frontier monster HP tracks your rebuilt damage; ×N kill rate reaches each wall when your damage was 1/N
  of the last climb's there, i.e. at the first snapshot whose frontier HP (BP term 5 decoded to zone and stage,
  `mapFrontier`) was ≥ target HP / N. At today's stats the frontier is far below the one-hit wall (Oblivion 29 is one-shot
  10^38 times over, attack speed at its 40/s cap), so Idle Whirlwind (attack speed) and HP perks add nothing here; damage
  perks do, but the last climb's frontier HP rose about 10^41 over the run and steeply at the end, so ×20 damage saves
  about an hour.
- **Farm climb (rebirth).** Estimate: each BP term's curve over the cycle runs at its bought rate (time ∝ 1/rate). Botany
  growth from Mystic Botany (perk 48, botany-calc `botanyPots`, @24238487) speeds term 2 (highest flower); no bought
  perk changes tilling (tilling.ts reads no perk but 54, a potion price), so plant levels and seeds keep their pace and
  seeds set the rebirth's pace.
- **Not modelled (size not determinable from the save and snapshots):** start gold (Skip keeps 99%: GoldcoinPreAscend is
  set to goldcoin @20926350 on an ascend, 0 @20995718 on a rebirth; today it is ~10^63× last run's start, and buys lifter
  levels at once), progress kept since the last climb started (potions, cards, pets, construction, mastery, contract
  ranks, Realm/vending: snapshots store AP/BP only, so their growth during the run is unknown), smithing re-crafts (ore
  shortages slow it; bought ore and smithing-EXP perks speed it after a rebirth). All of these only make the climb faster,
  except ore shortages.

## Uncertain / not verified
- Only `setReserved` writes and `G("X")[i]=v` array writes in the two blocks were read. State reset elsewhere (e.g. in the award handler, in other scenes' `init`, or lazily by derived getters) is not covered.
- Meaning of `WeabooFightsUnlocked`, `SparklecoinRng1000` is inferred from names only.
- `HaveyouBeenBeforeZone` is reset by a 0..49 loop and a 0..14 explicit list; ores/fish loops are 1..30.
- Block ranges are approximate raw offsets (the file was normalised for reading; start offsets of `if(1==...)`/`if(2==...)` come from `rg -ob APmenuSelected`).

## Strafe (Haste) key: kept, but local-save only

Neither block writes `HasteUnlocked` (its only writers: Mini Lava's key @4551958 in ActorEvents_1303; readers: the
Strafe button ActorEvents_1285 @4489938, which shows locked frame "5" while it is 0). It is **not** in the cloud save list
(`addSaveEntry` in SceneEvents_2; `FlailingME`, Lava's dialog state, is @20641415), so it survives only in the local
`mySave` SharedObject (`p.saveGame` writes every attribute). A lost or replaced local save brings it back as 0. Regain:
Portal screen, click Mini Lava while `FlailingME==2`; each click rolls `randomInt(4,540)` (@4531239) and resets to 2 after
6 s; rolls 4-7 give the key (4/537). Roll 8 is the red threat line (font 1234, mastery task 62), not a key predictor.
