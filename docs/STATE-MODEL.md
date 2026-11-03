# f(save) → game state

A Steam Cloud save (`is.bin`) carries ~513 of the ~1408 keys in a full local save. Everything else the game rebuilds
at load or while playing. `bun src/state-gaps.ts <is.bin>` classifies the 895 missing keys from the game code and
writes the dependency graph to `data/game/state-gaps.json`. The classification is heuristic: aliased writes are missed,
and per-frame transients land in "derived".

| Class | Count | Meaning | Plan |
|---|---|---|---|
| UI / handler scratch | ~162 | selections, positions, RNG, `aa*` temps, animation | never needed |
| constant resets | ~63 | literal values set at init (costs, flags) | ship as a table only when a page needs one |
| derived | ~582 | computed from other keys | ported by priority, below |
| local-only state | ~20 seen | real progress the cloud never gets. Fresh-machine restore (#19, all screens visited) left empty: `DeckLinkList`, `EquipmentbyDeckList`, `CropCardsEquipped`, `AutoAdvanceToggle`, `CraftingMaterialUNLOCKED`, `UpgradeUnlocked`, `TotalH2OTokens`, `TicketsToSpend`, `IsbossB/C/Dunlocked` (raid bosses 2-4) and `IsBoss{B,C}2unlocked`/`IsbossD2unlocked` (Asylum bosses 2-4, #30; raids reset to boss 1, difficulty 1 seen in-game), `WeabooFightsUnlocked`, `SpecialKeysGot`, `iUsedSeal`, `LittleGuyProgression`, `CardIDcustom`, `TotalKillContract5`, planting/herblore bonuses; trek position resets until reselected; `CrusadeEXPearned` untested | ask the player (pickers), or a local backup |

## Done (verified against a full save)
away % (`nonActiveZoneGainPercent`) · `MasteryBonuses` (39/39) · `EbonusThree` + every scalar `Ebonus*` · 6 `Pbonus*`
(potion speed, flower speed/given, overgrowth, exotic, max flower speed) · Botany speed cap · `HerbloreSpeedBOOST3` ·
max card level (Foil Cards) · `MTXcauldronBonus2x` · `ShrineCurrencyOwned` (from asylum traces) · combat (#15, `web/src/combat.ts`):
`SkillBonusdmgPCT`, `MonsterDamageReduction`, `PlayerHPmax`, `HealthSmithingBoost`, `ZoneTotalCardLV`, `PbonusMaxHP`, regular-zone
`MonstersDamage` + `MonsterHitRequirement` and the HUD hit chance; raid, Asylum and Conquest (crusade fight) `MonstersDamage` and
the fight-start `PlayerHPmax` (#32: game statements run in the sandbox, raid hits = wiki table, Conquest = one stored value from live captures) · pets (#15, `web/src/pets.ts`): `PetGenes`, `PetValueTotals`
[11..29], `PetHPtot`, `TankBonusLIST[52]` · smithing (#15, `web/src/smithing.ts`): `SmithingBaseAttack` (Fighting deck),
`SmithingCost1/2` (per item, `src/derive-smithing.ts` → `web/src/data/smithing.json`), `smithingEXPONENTIALlowerbound`,
`PbonusSmithTotalCostRedux` (both copies), `PbonusSmithingScalingRedux`, `PbonusBaseDmg` · main-fight stats by running the game's
own SceneEvents_9 code (`src/perk-impacts.ts`, #6): `DPS`, `YourCritChance`/`CriticalChance`, `YourCriticalDamage`, `MonsterHitRequirement`,
`IdleDmgBonusPercent`, `smithingAttackSpeedBoost`, `MedallionDamageBoost`, `dpsspeed` (exact on a save taken in the main fight scene;
raids store GetPlayerDPS ÷ TicketsToSpend, the Asylum also × 70/(3·AsylumBlock+70), Conquest ÷ defence) · raid/Asylum player side (#35,
`web/src/combat.ts` + `raids.ts`, each against the scene's own statements in the sandbox): `GetPlayerDPS` as TS (needs the stored
`PbonusDamageSUM`, `TankBonusLIST[8]`; null on cloud saves or with a fight-damage Realm fruit), the raid deck (link 10), the scenes'
`Mastery`, `MedallionDamageBoost`, `SmithingBaseAttack` (older copy), `YourCritChance`/`YourCriticalDamage` (needs stored `PbonusCritDmg`),
`SkillBonusdmgPCT`, skill-hit `MonsterHitRequirement`, boss HP (`mapleexpREQ`), `AsylumBlock` decay, six damage skills' hits, the cooldown
ticker, raid boss windup timing, the run timer. Not decoded: Asylum boss attacks (projectile volleys) and healing · rate stats by running the game's code (same file): `BonusKillperKill` (SceneEvents_9 second 30 ms callback),
`defaultgold` and `SmithingBonusCash` (zone draw listeners and the 30 ms stat callback, exact; the old ×1.0100 was the stored
`PbonusCashSUM`: a mouse release on the fight scene rewrites it @31888509 with `PbonusCash4`, a multiplier, read as a percent and
potion 132 dropped, while `SmithingBonusCash` keeps the init's value, so the sandbox reruns the init's `PbonusCashSUM` first, #32), `BonusOresCUMULATIVEpercent` (Mining 50 ms callback, Mining-linked deck's cards), `FishGiven` (Fishing scene init)

## Priority order
Ranking: unblocks a built page first, then fan-out (how many game reads depend on it), then pages on the roadmap.

**P0 (blocks current pages)**
1. `TankBonusLIST` [11], [22]: lab tanks; brew boost and Botany speed (#2)
2. `Cbonus*` per linked deck: generic "deck linked to activity N" totals; brew (link 4), Botany (link 3) (#14)
3. Botany per-pot and overgrowth bonuses + growth tick: `FlowersGivenBONUS`, `FlowersExpGivenBONUS`, `FlowersExoticBONUS`, `FlowersTimerBONUS`, `Overgrowth*bonus` (#9)
4. Brew boost `PotionBrewSpeedBOOST` (#8) and cauldron crystals `PotionGemSPEED`/`PotionGEMSinUSE` (needs `GemBonuses`)

**P1 (cross-system, high fan-out)**
5. Remaining `Pbonus*` (~38): one block, mostly k·PotionLV (#4 follow-up)
6. Combat stats (#15): done (raid/Asylum/Conquest `MonstersDamage` #32; Conquest's per-crusade inputs `ConquestBaseDMG/MobDMG/BossDMG`,
   HP, DEF, attack requirement and boss attack timing, plus `CrusadeEXPperday`, `ConquestRewardPCT`, `TotalCrusaders` and the claim's EXP and
   materials: #31, `web/src/crusade.ts`). `Hitchance` is the per-attack RNG roll and
   `OverallStats` a per-screen summary (miners/lifters), so neither is a combat stat to port
7. Pets (#15): done. `PetValueTotals[1..10]` are battle buffs the pet-attack actor adds mid-fight (zeroed on screen refresh), and
   `GlobalPetAttackType`/`GlobalPetAttackValue` are the queue of attacks fired (slot `_PetAttackIterization`: ability id, PetValue1 ×
   per-ability multiplier), read by the battle actor, so neither is a stat to port
8. Ascend/rebirth rewards `APreward`, `BPreward`, needed for #10 (#16)
9. Smithing (#15): done. Stored `SmithingCost1/2` hold the last-drawn item per material slot (only the selected anvil's
   entries are current); stored `SmithingBaseAttack` depends on the deck equipped when a scene last wrote it

**P2 (per-system, for future pages)**
Tilling `SeedsGivenBONUS`/`FarmingExpGivenBONUS` · Mining crystals `MiningGem*` · Fishing `FishingTimeMax/Min` ·
Limbo `CultistSoulBonusPercent`/`AcolyteSoulBonusPercent`/`SoulConversionChanceTOTAL` · Asylum `AsylumTraceExtraBonus`/`TraceDropAmount` ·
`ZoneTotalCardLV` · Tinkering costs · Rift · Contracts `ContractRequirement` · player level `mapleLV`/`mapleexpREQ`

**Never:** UI scratch, combat per-frame transients (`DamageNumberino`, `CriticalRoll`, particles), ad/MTX UI timers.

Every port: compare to the full save's stored value, and leave a `bun test` check behind (`web/src/*.test.ts`).
