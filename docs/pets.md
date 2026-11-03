# Pets: what the save holds, and where the author stands (#24)

Assessment from the live save of 2026-10-08 02:17 (`data/save.json`), the game bundle
(`data/game/asar/distBuild/static/game/Qno2x.js`), the wiki (`Hatchery`, `Trekking`, `Research`, `Builds`, `Gem_Shop`)
and the guides (Kyromyr notes "PET STUFF", bart902 "Missables"). Read-only: nothing was clicked in game.

Marks: **†** = read in game code. **wiki** / **guide** = from that source only. **inferred** = fits the save, not traced.
`web/src/pets.ts` (#15) already ports `PetGenes`, `PetValueTotals[11..29]` and `PetHPtot` and matches the stored values.

## 1. Save keys

### Inventory (one row per pet, index = inventory slot 1..N)
| Key | Meaning | Mark |
|---|---|---|
| `PetsOwned[i]` | species name in slot i; `"Nothing"` = empty. Hatch writes `PetsOwned[RS+1]` | † |
| `PetsOwnedINT[i]` | species id in slot i (70 = empty) | inferred (matches `PetIDlist` for all 29) |
| `PetValue1[i]` | pet level (attack power; summed into team HP: `PetValueTotals[11]`, `PetHPtot`) | † (`pets.ts`) |
| `PetAbility1/2/3[i]` | genes 1-3, ids below; `-1` = empty: the hatch bug reads `_GenePossibilities[length]` and stores N(undefined) − 1 (@28095827), 10% of second-gene rolls | † |
| `PetRarity[i]` | rarity of the pet in slot i | † (read with `RS+1` on hatch) |
| `PetStatus[i]` | 0 idle, 1 in a nest, 2 trekking, 3 in a capsule | inferred (agrees with `PetPositions` for all 29) |
| `PetInventoryOwned` | inventory size = 5 × this. +1 costs 200 gems (`sparklecoin`), up to 26 ("X_OF_26_SPACE_OWNED"). Wiki says 150; code says 200 | † |
| `PetIDlist` / `PetNameConverter` | species id → name. 0-45 bred species, 71-85 raid/asylum/secret pets | † |
| `PetUnlocked[id]` | species ever obtained (codex) | † (set on hatch/raid grant) |
| `PetLvl[k]` | pending raid-pet grant flag: `PetLvl[11]=1` gives species 71 (King) on the hatchery screen, etc. Not a level | † |

### Positions: `PetPositions[p]` = inventory slot placed at position p †
| p | What |
|---|---|
| 1-4 | trek **fighters**. 1-2 always, 3 at Trekking Lv15, 4 at Lv50 †. No direct slot picking: pets fill positions in the order you add them (the author, in game 2026-10-09) |
| 5, 6, 19, 20 | trek **supports**. Lv5 / Lv25 / Lv35 / Lv70, or the MTX slot pack `whichMTXpurchased[50]` ≥ 1..4 † |
| 7+2(n-1), 8+2(n-1) | the two parents in nest n (nest 1 = 7,8 … nest 5 = 15,16) † |
| 21.. | research capsules (`_TankSelected-111+20`, capsule tanks 112..) † |

`PetsFighting[p]` mirrors positions as names, `PetsFightingINT` as species ids.

### Hatchery
| Key | Meaning | Mark |
|---|---|---|
| `HatcheryLV`, `HatcheryEXP`, `HatcheryREQ` | level, EXP, EXP needed | † (save entries) |
| `NestLevelsVSE[3(n-1)+1/2/3]` | nest n Value / Speed / Size levels | † |
| `NestPrestige[n]` | prestiges. Each stat can be bought while level < 60·(prestige+1); prestige needs **all three** at that cap and sets them to 0, `MaxEggs[n]=3`, `NestAnimationSpeed[n]=1` (@28014400). Also: Σ prestiges of all nests × lab part 31 % → egg rarity multiplier `TankBonusLIST[5]` (@28455900); Nest 1 prestige 7 = Mastery task 176 | † |
| `MaxEggs[n]`, `NestAnimationSpeed[n]` | Size L → `min(3 + L^0.804/8.5, 20)`; each Speed buy at level L multiplies speed by `1 + 4/(1 + floor(L/7)/4)%` (@28016554). Both match the save for nests 1-5 | † |
| `EggsCreated[e+1+20(n-1)]` | eggs waiting in nest n (stride 20); value = egg rarity 1-5 (6+ = special egg: level `ceil(1.03·(best parent + 6))`, fixed gene pool; see Level below) | † |
| `GoldNestsPurchased` | golden nests bought (copied to `whichMTXpurchased[49]`); the k-th one bought makes Nest k golden: speed ×4, egg rarity ×3, new species ×3 | † |
| Nest upgrade cost | see §1b. Cash always; vessels from level 21; egg shells from level 31 | † |
| `PetCurrenciesOwned[11]` | mirror of `goldcoin` (cash) | † |
| `PetCurrenciesOwned[1..9]` | vessels by colour: monster drop types 1-4 from `_VesselTypes`; [1] green, [2] orange, [3] red, [4] yellow per the wiki drop icons | † indices / wiki colours |
| `PetCurrenciesOwned[12..16]` | **egg shells, rarity 1-5** (drop types 17-21). Trashing a pet of rarity r drops one shell of rarity r and one of each lower rarity (`TraceDropAmount` 1, @4447775); spent on nest levels ≥31 | † |
| `PetCurrenciesOwned[0]` (= −316) | a bug sink: below level 21 the vessel slot of a nest buy resolves to index 0 at cost 1, and the buy subtracts it anyway (@28017600). So −(paid nest levels bought at L ≤ 20). the author: 5 nests × 3 stats × 21 + Nest 1 before prestige 3 × 21 = 315; the save says 316, one unexplained | † mechanism / inferred count |
| `PetFlight[i]` | per-pet value; every write is 0 or a copy from another slot, nothing reads it for a stat (dead) | † |
| `PetsBreeding` | no code reads or writes it (dead save key) | † (absent from Qno2x.js) |
| `GeneticComboFound[1+3(g−1)+t−1]` | 1 once gene g reaches combo tier t (3/6/9 genes); unlocks that combo text in the codex. the author: [10], [13] = Boomerang and Life Leech tier 1. Found is permanent; the combo's effect is not: it comes from `PetGenes` (the current team), so removing the carriers removes it (the author, observed live 2026-10-26) | † |

### 1b. Breeding (all †, Qno2x.js byte offsets; pet scene)
Ported in `web/src/pets.ts` (`nestBreeding`, `geneOdds`, `nestUpgradeCost`) and shown on the Pets tab (Hatchery). Test: `web/src/pets.test.ts`
runs the game's own table setup, multiplier, hatch-odds, gene-odds, upgrade-cost and timer statements in the sandbox against the port.
Species ids below are `PetsOwnedINT` (the game maps parent names to the same ids, `_PetINDEX`). V/S/E = the nest's Value/Speed/Size levels.

- **Egg timer** (40 ms tick @28032601, lay @28037269): `NestAnimation[n] += min(NestAnimationSpeed[n] · SPEED, REQ/600)` per second while both
  parents sit in the nest; REQ = max over the two parents of `3600·1.42^(id−1)` s (raid/secret pets 7200). A lay takes REQ + 1% of the timer, so
  **an egg every ≈ 1.01·REQ / rate, never under ~10 min**. SPEED = TankBonusLIST[1] · golden ×4 · 1.4 per Incubation gene slot on either parent.
  The scene-open multiplier also has the Hatchery Lv5 (+25%) and Lv70 (+100%) milestones, but the refresh that runs right after opening
  (`RefreshPetScreen=1` @27621843, rebuild @27696775) drops them, so the running timer never uses them. Off-screen time is credited at the same rate
  when the screen opens (`AwayTimeRewarded`, @27647249).
- **Each lay** walks the nest's egg slots: an empty nest always gets a rarity-1 egg. Otherwise each waiting egg below rarity 5, in order, rolls to
  go up one rarity: `EGG[r]% · (1 + V^0.854/10.5) · RARITY`, EGG = 4 / 0.2 / 0.01 / 0.0001 for 1→2 … 4→5; the first success ends the lay. If none
  succeeds, the next empty slot (below MaxEggs) gets a new egg at `100% · (1 + V^0.854/10.5) · RARITY · 0.62^(eggs held)`. RARITY = TankBonusLIST[5] ·
  golden ×3. The nest screen shows that new-egg % (@27747502).
- **Species on hatch** (@28053205; one roll R): with P1 = min(BASE[hi] · B0 · NEW, 33)% (hi = higher parent id; **hi ≤ 3: P1 = 70 − 6·hi**):
  R < P1 → species **hi + 1** (capped at 38 + Σ DairyAisleAchievements[1..7]; it need not be new), else R < P1 + 15% → the higher parent, else
  the lower parent. BASE = `_NEWPETBaseChance`: 35, 26, 20, 16, 10, 7, 4, 2.5, 1.5, 1, 0.7, 0.5, 0.3, 0.2, 0.12, 0.07, **0.04 (id 17 eagle)**, 0.025 …
  (÷~1.6 per id). B0 = (1 + (egg rarity − 1)^(2.2 + TankBonusLIST[30]/5)) · (1 + 25% Hatchery Lv10 + 50% Lv30 milestone) · 1.25 per Discovery gene
  slot on either parent (@27700076). NEW = TankBonusLIST[16] · (1 + 150·P/(P+175) · HatcheryLV^0.82/25 %) · (1 + EbonusThree[9]%) · golden ×3, P = PotionLV[125].
  (The +15% is `min(min(BASE·B0, 33) + 100·(2.56/(|A−A| + 4.01) + 0.04)^1.8, P1 + 15)`: the code subtracts parent A from itself, so the first term is a
  flat ~49.7 and the cap always wins.) One raid/secret parent: 15% that one, 85% the other; two: 50/50.
- **Level** (rarity 1-5 hatch listener @28049476, roll @28084032-28090358; a, b = parent levels, r = egg rarity, m = higher parent id with
  ids > 70 counted as 0, via `id·floor((170 − id)/100)`): `ceil(randomInt(lo, hi) + 0.5 + r)` = **roll + r + 1** (randomInt is uniform over integers,
  inclusive, and swaps its ends if lo > hi), lo = trunc(min(a,b)·k + (r−1)/7·|max(a,b) − min(a,b)·k|), k = 0.7 + TankBonusLIST[20]/240;
  hi = trunc(min(max·(1 + r/100), max + max^(0.3 + m/130)·r) + (V / max(65 − m, 20))^1.5). Re-read and run in the sandbox 2026-10-15
  (`web/src/pet-breeding.test.ts`). Since k < 1 the mean child usually sits below the better parent; the gain comes from the top of the roll,
  which always clears the better parent, so levels have no ceiling.
  **Rarity ≥ 6 eggs** go to a separate listener (@28115390: the rarity-1-5 one only runs for `6 > rarity`). It rolls an older formula
  (no +r, no V term, lo = min + (r−1)/7·|a−b|, hi exponent 0.4 + m/100) and then overwrites it: level = **`ceil(1.03·(max(a,b) + 6))`** (@28141152).
  The `ceil(1.1·(max + 6))` line in the rarity-1-5 listener (@28090907) is dead: it sits behind `6 <= rarity` inside that branch.
  Planner: `web/src/pet-breeding.ts` (Pets → Hatchery → Breeding).
- **Genes** (@28094195; re-read 2026-10-29, #2764). Genes **inherit**: only gene 1 is fixed by species.
  - Gene 1 = the child species' own gene (`_specificGENE[child]`, @28063024 etc.), so it follows the species roll above (mostly the lower parent).
  - 2nd gene chance `(HatcheryLV − 19)/(HatcheryLV + 10)` × (1 + min(80·P/(P+175), 60)%), P = PotionLV[154] = **Genetea** (potion id 155; the author Lv 0, Hatchery 59: **58.0%**).
    Then d100: 1-24 a copy of gene 1, 25-34 the **−1 bug** (`_GenePossibilities[length]` = undefined, stored N(undefined) − 1), 35-39 nothing (pool[length] = undefined → 0),
    40-100 index i = randomInt(0, length) of the pool (inclusive, so 1 in length+1 gives nothing); if pool[i] equals gene 1 it takes pool[max(i − 1, 1)] instead.
  - 3rd gene (rolled only when the 2nd is > 0, so never after the −1 bug): `(HatcheryLV − 39)/(HatcheryLV + 28)` × (1 + min(50·P/(P+175), 40)%) (the author: 23.0%); d100:
    1-14 copy gene 1, 15-25 copy gene 2, 26-34 −1 bug, 35-39 nothing, else the pool, a pick equal to gene 1 or 2 shifted the same way (@28098000).
  - **Pool** (`_GenePossibilities`, built on the pet-screen refresh for the selected nest, @27716561: a 9-pass loop that adds each value once):
    parent A gene 1, B gene 1, A gene 2, B gene 2, A gene 3, B gene 3 (> 0 only, so −1 never enters), then the species gene of max(ids) + 1
    (if max(ids) ≥ 45: of min(ids) + 1 while min < 45), then of max(min(ids) − 1, 1) (only while max(ids) < 45). An egg of rarity > 5 replaces the pool
    with 9, 10, 20, 21, 22, 23, 24, 25, 26, 1 (@27735361). Since order decides the shift, **which parent is A** changes the odds
    (dart frog A + crow B puts Life Leech on ~2× as many dart frog children as the reverse).
  - Copies count: a pet can hold the same gene 2-3 times (24% / 14% / 11% copy branches); every copy counts in `PetGenes` and in nest effects.
  - Combos: tier = floor(team copies / 3), max 3, from `PetGenes` (the 8 trek positions + construct 41 etc.); `GeneticComboFound` is set
    once a tier is reached (@27258789) and never cleared, but the effect needs the copies fielded (one pet per species). Incubation and Discovery
    also work per copy on a nest parent (×1.4 egg speed, ×1.25 new-species odds), Ionize per capsule pet.
  - Planner: `web/src/pet-genes.ts` (Pets → Genes, tests `pet-genes.test.ts`): exact outcome enumeration per pair, census, fieldable copies
    (best pet per species, top open slots), ranked actions. The usefulness weights there are a judgement table, not game code.
- **Hatchery EXP** per hatch: `3·2^(r−1) · MasteryBonuses[11] · (1 + 270·P/(P+175)%) · ceil(randomInt(min + (r−1)/7·|a−b|, max·(1+r)) + 0.5)`, P = PotionLV[130].
- **Upgrade cost** of the next level at L (@27736384; Value/Speed/Size alike): cash `5000·1.32^L`; from L21 vessels of colour
  `min(ceil((L−20)/(45 + L^0.63)), 9)` (green to ~L81, then orange …) costing `10d + d³ + 1.02^d`, d = L − 20; from L31 egg shells of rarity
  `min(ceil((L−30)/120), 5)` costing `ceil(s · max(1 − TankBonusLIST[44]%, 0.2) · (1 + (rarity−1)/2))`, s = (L−30)/8 below L150 (general form in
  `nestUpgradeCost`). Each buy rolls once for free extra levels: x% for one, (x − 100)% for a second, x = min(250·P/(P+175), 200), P = PotionLV[153].

### Trekking
| Key | Meaning | Mark |
|---|---|---|
| `TrekkingLV/EXP/REQ` | level, EXP, needed. REQ grows `1.135·REQ + 50·floor(LV/5) + 3·LV^1.38 + …` | † |
| `PetDistanceLV` | furthest monster unlocked = `MonsterSelected + 5·(MonsterPageSelected−1)` (5 monsters per page) | † |
| `PetDistance`, `PetDistanceREQ`, `PetDistanceREQprev` | distance travelled; the next monster unlocks at REQ | † |
| `PetGenes[1..30]` | team gene counts. Fighters + supports, Gattaca (`ConstructLV[41]`), MTX pack, Dairy Aisle 10 | † (`pets.ts`) |
| `PetValueTotals`, `PetHPtot`, `PetHP` | team stats, max HP, current HP | † (`pets.ts`) |
| `PetRewardList[k]` | milestone flags: Hatchery 5/10/20/30/40/70/100/150 → k 1-8; Trekking 5/15/25/35/50/70/90/120 → 9-16; Research 10/20/40/70/100/150/250/400 → 17-24 | † |
| `PetAreaSelected` | which pets screen was open last (1 hatchery, 2 trekking, 3 research scene), **not** a trek zone | † |
| `DoubleVesselsBought`, `ArcaneCarpetsPurchased` | gem shop buys | † names |

Gene ids (`_GeneticNames`) †: 1 Fire Fist, 2 Curse Skull, 3 Healing, 4 Boomerang, 5 Life Leech, 6 Bubbler, 7 Snipe, 8 Radiation,
9 Rattlin Gun, 10 Zeus Bolt (attack moves, fighters only); 11 Health, 12 Perception, 13 Swiftness, 14 Incubation, 15 Loot,
16 Evasive, 17 Enthusiasm, 18 Discovery, 19 Defender, 20 Trekkery, 21 Snapzi, 22 Genesis, 23 SoulBound, 24 Ionize, 25 Respawn,
26 Abominable. Combo tier = floor(count/3), max 3, so 3/6/9 of a gene †.

### Research (the lab)
| Key | Meaning | Mark |
|---|---|---|
| `ResearchLV/EXP/REQ` | level, EXP, needed | † |
| `TankLVs[3(tank−1)+slot]` | level of each tank's bonus tier (slot 1-3). Tanks 1-5 green, 6-10 orange, 11-15 red, 16-20 yellow, 21-25 pink (`_MainStat1` names the colours) | † |
| `TankLVs[301..303]` | Lab Mainframe (tank 101) tiers 1-3: [301] = lab expansions | † |
| `TankLVs[3(T−1)+1..3]`, T = 102-110 | vats: 102 Grasseous, 103 Glycogen, 104 Visceral, 105 Cash Money, 106 Tool Shed, 107 Ecksdee, 108 Mutagen, 109 Risquious, 110 Satanic (`_TankNames`). Vat 102+c feeds tank colour c and is bought with vessel c+1 | † |
| `TankLVs[331..333]` | Shiny Vat (tank 111), sparklecoins, needs `MTXmysticVATowned` = 1 | † |
| `TankBonusLIST` | resulting bonuses ([52] = pet HP etc.) | † |
| `PetCapsuleLV[species]` | capsule passive level per **species**. The passive applies from this level whether or not that species is in a capsule now (`petBuff[id]·PetCapsuleLV[id]` in `tankBonuses`) | † |
| `OpenValues[t]` | 1 = tank t is "open" (earning RP). RP for a colour is split across its open tanks | † |
| `TankEXP[t]` | raw RP progress of tank t (1-80) | † |
| `TankPoints[t]` | RP of tank t (what the tank shows) | † |
| `TankRPinvest[3(t−1)+slot]` | RP invested in a tier (indices 15c+1..15c+15 = colour c) | † |
| `TankLVexp[3(t−1)+slot]` | a tier's progress toward its next level | † |
| `MTXmysticVATowned` | Mystic Vat purchase (opens the Shiny Vat) | † |
| `PetPassiveDays[species]` | capsule time in seconds (+0.5 per 0.5 s tick per capsule pet); passive Lv→Lv+1 costs 12 h·(Lv+1)^1.5 (matches the wiki's 12 h first level) | † |
| `PetCapsuleEXP` | not traced | unverified |

#### How Research works (all † from the lab scene in Qno2x.js, offsets are byte positions)
- **RP** (500 ms tick @28920600, open tanks only): `TankEXP[t] += 0.5 · COLOUR[c] · ALL · (1 + 3·DiamondPiping[t]) / (open tanks in colour c)`.
  - `ALL` = (1 + Dairy Aisle ach. 11) · (1 + 2%·TrainingPerk 12) · TankBonusLIST[10] · (1 + 25% Research Lv10 milestone + 50% Lv70 milestone) · (1 + SkillLevels[64]%) · (1 + 3%·PotionLV[102]).
  - `COLOUR[c]` = (1 + (0.2434·ln(RP invested in colour c + 1))^(2·TankBonusLIST[14])) · a colour tank bonus (green TankBonusLIST[6], yellow [29], pink [47]; none for orange/red) · **vat c tier 1** (1.042^L, softcapped ÷1.005 per level past 100/200/350/500/700, then ^0.8) · **every vat's tier 2** (1 − 0.04 + (1 + 198L/(L+1000))·4%) · (1 + 50%·Shiny tier 2).
  - `TankEXP` turns into `TankPoints` at 10·2^floor(log2(points+1)) EXP per point, so each doubling of RP costs twice as much per point.
- **Investing** (click a tier): if the tank's RP is more than the tier's investment, `TankRPinvest[tier]` = the tank's RP (it replaces, it doesn't add) and the tank's RP and `TankEXP` reset to 0 (from Research Lv250 there's a 24% chance to keep the RP).
- **Tier EXP** (same tick, all 240 tiers): `TankLVexp += 0.5 · TankBonusLIST[42] · (1 + 2·piping) · 2x³ · 1.05^(x²)`, x = log2(RP invested + 1).
- **Tier level-up** (`_customBlock_GetTankExpREQ`): needs (12·1.1^L + L^5.3 + 15·(L + floor(L/10))^1.7) · (1 + L/400) · (1 − min(0.35·P/(P+175), 0.34))^log10(green vessels + 10), P = PotionLV[155]. **Level-ups only run for the tank you have open in the lab** (the draw loop uses `_TankSelected`), so other tanks' tier EXP waits until you open them. Check on the author's live save: every tier sat just under its requirement (e.g. tank 9 tier 1: 9.55e11 of 9.76e11).
  - Multi-level: roll 0-100 against aa = min(TankBonusLIST[13], 170) + 20·(Research Lv20 milestone) + 40·(Lv150 milestone) + 200·piping + 25·Shiny tier 3 + Σ vat tier 3 (1 + 198L/(L+1000))·20%. Under aa → 2 levels, under aa−100 → 3 … up to 9 (Dairy Aisle ach. 11 makes the top case 15).
  - Chain upward: min(TankBonusLIST[35] + Mainframe tier 3 %, 38)% chance that a tier 2/3 level-up fills the tier below's EXP bar.
- **Research EXP comes only from tier level-ups.** Each level gained (from L to L+1) adds
  **(1.34 + L/1.6) · 1.005^L · (1 + 3^k) · max(ResearchExpMULTI, 1) · MasteryBonuses[11]**, k = colour number (green 1, orange 2, red 3, yellow 4, pink 5: ×4, ×10, ×28, ×82, ×244).
  `ResearchExpMULTI` = TankBonusLIST[9] · (1 + 50%·Shiny tier 1) · (1 + EbonusThree[11]%) · (1 + 2.5·P/(P+175)), P = PotionLV[130]. There is no time-based or per-RP Research EXP.
- **Research level-up**: Lv+1, EXP −= REQ, REQ = 1.11·REQ + 60·floor(Lv/5) + 4·Lv^1.32 + 15·Lv (new Lv), then EXP += 0.6%·ShrineLevels[6]·REQ.
- **Tank unlocks**: tank k (1-5) of colour page X opens at Research Lv base_k + 12(X−1) + extra terms; **pink tank 1 = Lv58 †**, pink 2-5 = 61/64/67/70.

#### Vessel upgrades (all †)
| Piece | Cost of the next level (L = current level) | Paid in | Unlocks |
|---|---|---|---|
| Mainframe tier 1, Expand The Lab | 10·3^L + 5·(L + max(L−4, 0)^1.5)^5, max 30 | vessel min(1 + floor(L/2), 9) | always |
| Mainframe tier 2 | 2·1.044^L + L^2.7 | min(max(ceil(L/55) − floor(L/99), 1), 9) | 5 expansions |
| Mainframe tier 3 | 5·1.044^L + L^3.2 | min(max(ceil(L/55) − floor(L/90) + floor(L/58) − floor(L/65), 1), 9) | Mainframe tier 2 Lv40 |
| Vat tier 1 | 1.044^L + L^1.8 | the vat's colour | when expanded to |
| Vat tier 2 | 2·1.044^L + L^2.4 | the vat's colour | vat tier 1 Lv50 |
| Vat tier 3 | 5·1.044^L + L^2.9 | the vat's colour | vat tier 2 Lv150 |
| Shiny tier 1/2/3 | 250 / 225 / 200 sparklecoins, 10 levels each | sparklecoin | Mystic Vat (MTX) |

Every vessel buy rolls 1-100 against odds and **spends the vessels even on a fail**. Odds: Mainframe tier 1 = max(5·ceil((105 − 100L/(L+40))/5), 50)%;
every other tier = max(58 + 2·ceil((105 − 100L/(L+80))/5), 50)%; both × (1 + TankBonusLIST[39]). Max level 1000 elsewhere.
Expansions alternate: from an even count the next one opens a new vat (until 9 vats), from an odd count a new capsule (until 12 expansions);
after that they add an all-tanks RP multiplier. Vats open = min(L,1) + floor((L−1)/2); capsules = floor(L/2).
Not decoded: the size of Mainframe tier 2's effect (PARTS[162]; the wiki says "all tanks bonuses level up faster").

## 2. Where the author stands (live save 2026-10-09 16:08)

Stage: 15 ascensions, H2O (`waterLV`) 151, Realm Lv19.

**Breeding (Hatchery Lv33, 28% to 34)**
- 5 of 6 nests (6th at Hatchery Lv50; nests open at Lv 0/5/10/20/30/50, `NEST_UNLOCK` in pets.ts). Levels V/S/E: N1 **0/0/0 of 120, prestige 1** (prestiged 2026-10-09), N2 53/43/42,
  N3 37/35/35, N4 32/31/32, N5 43/36/44. 1 golden nest (Nest 1).
- Inventory **34/35**, 0 eggs waiting. 22 of 34 pets have a 2nd gene; none has a 3rd (Hatchery Lv40, †/wiki).
- Nest parents: **N1 eagle (17, Boomerang, L41) + pencil**, so Nest 1 can breed Spore (18): **1.3% per rarity-1 egg, 7.2% rarity 3, 28% rarity 5** † · N2 penguin + panda (Fire Fist) ·
  N3 pencil + penguin (Healing×2) · N4 crow (Life Leech×2) + pencil · N5 dart frog (Curse Skull + Evasive) + pencil.
- Egg every † (live timer): N1 4.0 h, N2 1.8 h, N3 4.2 h, N4 4.5 h, N5 4.1 h. 2nd gene 32.6% per hatch †.
- Nest levels past 20 cost green vessels † (N2 Value 53 → 54: 36,269 green; cheapest, N4 Speed 31: 1,442 green + 1 rarity-1 shell). Held: 1,377 green;
  shells 1,113 / 485 / 40 (rarity 1/2/3).

**Trekking (Lv51, 80% to 52)**
- Rules (the author, in game 2026-10-09): **one pet per species per team**, and pets take positions in the order you add them.
- Fighters: eagle L37 (Boomerang + Life Leech), crow L39 (Life Leech×2), dart frog L33 (Curse Skull + Boomerang), panda L34 (Fire Fist×2).
  Supports: pencil L31 (Evasive + Boomerang), seagull (Perception), duck (Perception). Team HP 318.
- Gene counts: **Boomerang 3 and Life Leech 3 (both combo tier 1)**, Fire Fist 2, Perception 2, Curse Skull 1, Evasive 1.
- Sim at monster 18: **11.9 kills/min, 0 deaths/10 min** (was 5.2 and 13 on 2026-10-08). The tab's "Best fighters" search confirms no
  legal fighter set does better. Only remaining suggestion: King (Genesis) from Research Capsule 1 into a support, 12.6 kills/min at
  56% avg HP; skipped, it would leave the capsule.
- Frontier: monster 18; 365 distance to the next unlock. Red vessels start at monster 20 †; 0 held.

**Research (Lv57, 8% to 58)**
- Green/orange tanks (1-10): all three tiers, levels 166-224. Red/yellow (11-20): two tiers, 75-99. **Pink tanks unlock at Lv58** †.
- Lab expansions: 4 (`TankLVs[301]`) = 2 vats (Grasseous 166/96/0, Glycogen 135/83/0) + 2 capsules (King, Pencil) †.
- Vessels (live save 02:59): 1,377 green, 5,053 orange, 0 red, 375 sparklecoins, no Mystic Vat. Nothing was affordable then (26,135 orange on 2026-10-09: see §4 item 1).
  Next: Glycogen tier 1 = 7,167 orange (76% odds, orange RP ×74.0 → ×76.1), Grasseous tier 1 = 11,184 green (74%),
  5th expansion = 5,930 **red** (opens the Visceral vat), so red vessels (monster 20) gate the next lab expansion.
- Capsule passive levels: Poop 47 (Stinkyness: no use), Bear 24 (Fight Damage), Dart Frog 7, Duck 5, others 2-4, King 1, Demon 1.
- Milestones held: Research 10/20/40. Next: Lv70 = +50% all tank RP †.

## 3. Versus the guides

No source gives pet targets per ascension count or Realm level, so this compares against milestones and the guides' advice:
- bart902: "Always have focus on breeding pets and trekking. They are a big deal near the end of mid-game. Before that point, just
  focus on getting **Fire Fist and then Snipe** genes on your ground pets." the author has neither on a fighter. Fire Fist comes from
  Bear/Panda (he owns one Panda, L28, idle). Snipe comes from Bull Frog (24), Fungo, Plantz: 7+ species away.
- bart902: equip the pet card deck *before* opening the pets screen, or its bonuses don't load (linked decks break for Pets and Botany).
- Wiki Builds are endgame (raid/asylum pets, 9-gene combos). Out of reach; useful only for picking genes (Zeus Bolt, Respawn,
  Abominable, Loot/Discovery for vessels).

**Gaps:** (1) Fire Fist sits at 2, one short of a combo; (2) close milestones still open: Research 58 (Pink tanks),
Hatchery 40 (3rd gene), monster 20 (red vessels).

## 4. Do next (most leverage first)

1. **Spend orange vessels: Glycogen Vat tier 1.** 26,135 orange held, and each Glycogen tier-1 level is ~7.8K orange (76% odds,
   orange RP ×88 → ×90.6). The Pets tab → Research → "Buy now" lists the order.
2. **Third Fire Fist for a combo.** Fire Fist is at 2 (panda L34, Fire Fist×2). One more on any pet in the team makes 3. Breed for it:
   Nest 2 has a Fire Fist panda parent, and a 2nd gene is drawn from both parents' genes † (61% pool pick, 24% a copy of gene 1).
3. **Nest 1 to 20/20/20 with cash.** Below level 21 a nest level costs only cash † (5000·1.32^L: nothing for the author). Speed 20 ≈ ×1.9 egg
   rate, Value 20 makes eggs climb rarity ×2.2 more often (Spore odds ×2 at rarity 2, ×5.6 at rarity 3), Size 20 holds 4 eggs. Then watch for Spore.
4. **Hatch and trash as eggs arrive.** Idle pets (PetStatus 0) do nothing in game, so the Pets tab keeps an idle pet only for a
   role (rule from 2026-10-23, `petRoles` in `web/src/pets.ts`; it replaced "keep every 2-gene pet", which on a full inventory
   kept everything): (a) it is in a trek team that kills faster than the current one (quick options on load; the full best-team
   search once "Find best team" is clicked, ~15 s); (b) it is a better nest parent: same species with a parent's genes or more at
   a higher level, or Incubation (14, ×1.4 egg speed †) / Discovery (18, ×1.25 new-species odds †) that no parent of some nest has;
   (c) it is the only owned pet with a gene (placed pets count); (d) it is the last of its species, or the species' ONE spare:
   the highest-level idle one, and none when (a)-(c) already keep an idle pet of that species. Everything
   else is trash, least valuable first (level, rarity, most-shared genes), each naming the pets that keep the species.
   Swaps: the fastest better trek team, each (b) pet onto the weakest parent it beats, and a nest-gene pet in place of the
   lower-species parent where the other parent's species is at least its own (egg timer and new-species pick unchanged †).
   **Order, and the nest-swap rule:** changing a nest's parent clears that nest's waiting eggs (the author-observed 2026-10-23; the game
   code agrees: in the hatchery tick, a nest whose `PetPositions[2n+5]` or `[2n+6]` is empty zeroes every `EggsCreated` entry of
   that nest below 6 and keeps only special eggs, @28036354, in `SceneEvents_44` onWhenDrawing, nest n = 0..5). So the checklist is: trash now, trek swaps (no eggs
   involved), trash what those free, hatch (nests with a pending parent swap first), THEN the nest swap, then trash what it frees.
   A nest swap whose eggs do not all fit waits (or costs those eggs for the parent upgrade; the tab shows the count and rarities).
   The pets a swap displaces are re-judged by the same rule ("trash after swap"). Read the new species/level against the
   current fighters before trashing (a hatch upgraded the dart frog on 2026-10-09).
5. **Reach monster 20** for red vessels; the 5th lab expansion needs 5,930 red.
6. **Capsules:** passives stick to the species level †, so the capsule only decides what levels up. King (Pet Damage) is right for
   trekking. Swap the Pencil (Ores Mined) for a Crow (Fight Damage 25%/lvl, wiki) unless mining is the bottleneck.
7. **Gems, if wanted:** an Arcane Carpet (525) under the Duck makes Perception count 3 (instant combo, 2× effect, wiki). A 2nd golden
   nest is 375. Gattaca (Construction, Red Domain) Lv1 would add +1 Perception for free (†, `pets.ts`), but the domain needs Treasure #22 ×5.

## 5. Trek damage (all †, Qno2x.js byte offsets)

Ported in `web/src/pet-combat.ts`; the Pets tab (Trekking) ranks the current team against candidate swaps by kills/min.
Test: `web/src/pet-combat.test.ts` checks AllPetDmgMultiplier, MonsterHPtot and PetCooldownsREQ against the save, and runs the
game's own multiplier and monster-HP statements mid-fight (half HP, curse stacks, combos) against the port. Genes 6-10: the
game's fire loop and on-hit blocks run in the sandbox with a crafted fighter line-up carrying all five (Radiation stacks, Rattlin
Gun ramp, crit/Genesis stats, combos); fired values match per projectile and on-hit damage matches as an exact expectation over
every roll outcome. Boomerang: its hit block runs on one actor through repeated bounces (depth 6, every crit and bounce outcome,
tiers 0-2) and matches the chain formula exactly.

- **Cooldowns** (50 ms loop @27312868): `PetCooldowns[k] += 0.05·(1+PVT[7]%)/(1+PVT[27]%)` (1 per second; [7]/[27] are fight buffs, 0 at
  the start). Fires at `PetCooldownsREQ[k]` = base / (1 + PVT[17]%) (Enthusiasm). Bases (@27238988): Fire Fist 2.5 s, Curse Skull 2,
  Healing 4.2, Boomerang 3, Life Leech 3.75, Bubbler 5, Snipe 8, Radiation 3.25, Rattlin Gun 0.75, Zeus Bolt 1.5, basic attack 2.75.
- **Attack value**: each **fighter** (positions 1-4; supports never attack) adds its `PetValue1` once **per gene slot** holding the move
  (a Life Leech×2 Crow hits for 2× its level), × the move multiplier: basic 1 (any pet with a gene 1), Fire Fist 1.5 (combo 2.5/3.5/5.5),
  Boomerang 1.8, Life Leech 2, Bubbler 1 (@27372279), Snipe 12 + 4·2^tier·combo (@27388407), Rattlin Gun 0.25 + PVT[9]
  (@27408807), Zeus Bolt 2.5 + 0.25·2^tier·combo (@27421112) (@27315875, @27321100-27416157). Radiation adds a flat 1 per gene slot,
  not the level (@27395699). Each fighter fires its own projectile. Genesis: PVT[22]% chance of a copy 60 ms later × (1 + 0.5·tier);
  Radiation's and Healing's copies are ×1. Healing adds a flat 5 per gene slot (= 5% HP), not the level.
- **On hit** (ActorEvents_1349, @5063189-5121700): `MonsterHP −= value · AllPetDmgMultiplier · (1 − MonsterRespawn)`.
  Crit (moves 1, 4-11): randomInt(1,1000) ≤ PVT[12] → ×(1.5 + PVT[21]%). Boomerang (block @5071842): the crit multiplies the stored
  value (@5072818) before the damage (@5073312); then randomInt(1,1000) ≤ 330 + 70·tier (@5076477) sends it back (setX(422) @5076715)
  ×(1 + 0.34·tier) (@5077065), and it hits, crits and rolls again on the compounded value, with no cap. With c = 1 + p·(m − 1) the
  expected crit factor, b the bounce chance and bm the bounce multiplier, a projectile carrying v deals **v·c/(1 − b·bm·c)** in
  expectation (unbounded once b·bm·c ≥ 1: always at tier 3, at tier 2 once c ≥ 1.27). Before #37 the sim used v·c/(1 − b·bm).
  **Life Leech**: ×(1 + 0.1·tier(Health)) × (1 + 150·(1 − HP/HPmax)·tier/100), i.e. **+1.5% per 1% HP missing per tier** (the combo text says 3%), and heals `HPmax · value / MonsterHPtot`. Curse Skull deals nothing directly: its value is added
  to PVT[2] = +value% to all damage until the monster dies (curse combo: 15%·tier chance per hit of +10). Healing: 5%/gene (+2·tier%
  below half HP) × Health combo.
  - **Bubbler** (launch @5015480, hit @5089437): flies at 12/(1 + 0.2·tier) velocity = 120/(1 + 0.2·tier) px/s (Stencyl simple physics
    moves 10·velocity px/s: `moveActorBy(10/STEP_SIZE·xSpeed·ms·0.01)` @833660, STEP_SIZE 10 @499865) from x = 330 − 82·i (fighter i,
    0 = front; Genesis copy 324 − 82·i) and hits at x > 427; every 0.2 s in flight it grows by its launch value × (0.4 + 0.05·2^tier·combo)
    (27 timers). So the back fighter's bubble hits hardest: at tier 0, ×2.6/×3.8/×5.0/×6.6 for fighters 1-4 (the front one lands 8 ms after its 4th tick). Normal crit.
  - **Snipe** (@5095028): always crits (randomInt(1,1000) ≤ 1000) ×(1.5 + PVT[21]%), then randomInt(1,10) ≤ 5 − tier sets the value
    to 1 (a miss: 50% at tier 0, 20% at tier 3).
  - **Radiation** (@5101017): no damage; adds its value to PVT[8], and AllPetDmgMultiplier is × (1 + PVT[8]) (+100% per gene slot).
    Every damaging hit of any move (Boomerang only on its last bounce; not Curse Skull or Radiation) then clears PVT[8] unless
    randomInt(1,100) ≤ 25·tier(Radiation): without the combo the stacks boost exactly one hit.
  - **Rattlin Gun** (@5104317): normal crit; each hit raises PVT[9] by 0.02 + 0.01·tier (@5106010), so its multiplier ramps 25% → over
    the fight (0.75 s cooldown). PVT[1-10] reset when the next monster comes.
  - **Zeus Bolt** (@5110491): crits at 2·PVT[12] per 1000 for ×(1.5 + PVT[21]%)·(3 + 0.5·2^tier).
  - **Combo bonuses**: all five have code (unlike Evasive): Bubbler growth +0.05·2^tier per tick and slower flight; Snipe ×(12 + 4·2^tier)
    and fewer misses; Radiation 25·tier% keep chance; Rattlin Gun +1%·tier ramp; Zeus Bolt multiplier and crit multiplier.
- **AllPetDmgMultiplier** (draw listener @27307482, every frame): (1 + EbonusThree[13]%) · Rift 3 term · (1 + potion 142 term ·
  HP missing) · (1 + PVT[2]%) curse · Smithing item 87 term · (1 + 2·CardLevels[177]%) · MasteryBonuses[14] · (1 + PVT[8]) ·
  Abominable · (1 + 10%·Enthusiasm + 15%·tier) · (1 + ((200·Skill69 + 10)/(Skill69 + 100) + 100·(TankBonusLIST[51] − 1))%).
  On the author's 2026-10-08 save: 1.02 × 1.201 = 1.225 (matched that save). The 2026-10-15 save has CardLevels[177] = 0, so if the 1.02
  was card 177 at level 1, that factor is now 1; recheck before reusing the figure.
  Card 177 is not in the Cards catalogue (_CardBonusesALL 177 = "Nothing" @21979597; card text "+2%_PET_DAMAGE" per level @22433306;
  doOnce 33 inits CardLevels[177-179] to 0 @20249707). It is an event-shop card (ActorEvents_749, currency `_GOLD_BALLS`, not a paid pack):
  upgrade 7 rolls 10·(0.5 + level/300) in 1000 per purchase for 3 copies of 177 (CardLevelCustom 3, @14935922) and gives it
  guaranteed at the upgrade's last purchase (EVENTpurchasesMAX[7] = 200, @14937185). Sibling 178 = "+2 Hoops max gems" per level
  (cap min(24 + TankBonusLIST[54] + 2·lvl, 45) @4957782, 2 copies, upgrade 8 gives 178 or 179 at random @14939970); 179 = "+3% crypt rewards" per level (@22440887).
- **Evasive**: only `PVT[16] = min(4·count, 75)`, the chance (randomInt(1,100) < PVT[16], so 4 → 3%) that a monster attack does 0
  (@27430090). The combo text ("+10% damage per evasion", _ComboDescriptions 46-48) has no code: `PetGenes[16]` is read once (@27270373).
- **Monster** (id = MonsterSelected + 5·(page − 1)): `MonsterHPtot = (1 + id + 5·id^1.4 + 2·id)·(1 + ceil((id+1)/5)/2)^1.07·1.045^id/1.3 − 8`
  (@27241117). Attacks (@27428814+, one hit per cooldown, × PVT[19] Defender): ids 1-70 every 2 s for ceil(HPtot^0.83/70 + id/2 − 0.5);
  ids 10-120 every 3.5 s for HPtot^0.9/27; ids 25-150 every 2.5 s the monster heals (10 + √(page−1))%. Ids ≥ 35 add more types (not modelled).
- **Between fights** (@27284246, @27235762): a kill waits `1/(1 + PVT[25]%)` s, then refreshes the team stats (curse back to 0);
  **pet HP carries over**. At 0 HP the team spends 10 s reviving (+10%/s, then full, cooldowns reset).
- **Model limits** (inferred, not game behaviour): each roll is replaced by its average and projectile travel time is ignored (a hit
  lands in the step its move fires, in fighter order, original then Genesis copy). Bubbler's growth uses straight-line flight time; the
  game's frame timing can move a 0.2 s tick at an edge. Radiation stacks are tracked as their expected value and go to the next hit in
  that order; in game projectiles in flight overlap, and AllPetDmgMultiplier is recomputed once per frame, so hits in the same frame as
  a Radiation hit or reset see the old value. Rattlin Gun's multiplier is read when a volley fires, the ramp added per hit after.

## 6. Vessels from trekking (all †, ported in `web/src/pet-combat.ts` `vesselFarm`, Pets → Trekking "Vessels per hour")
- **Per kill** (kill handler @27287534): every kill of the selected monster while `PetHP > 0` pays, frontier or not (only distance
  is frontier-only). No random roll. Colour = `min(_VesselTypes[sel + 5·((page−1) mod 8)] + floor((page−1)/8), 2·sel − page mod 2, 9)`
  into `PetCurrenciesOwned[colour]`; amount = `(id + floor(id/10)² + floor(id/8)) · 1.06^floor(id/5) · (1 + PetValueTotals[15]/100) · _VesselMULTI`.
  `PetValueTotals[15]` = Loot gene (× Discovery combo), see §1. `_VesselTypes` (SceneEvents_43 init @27207618) for ids 1-40:
  green 1-4, 6, 7, 11, 13, 16, 21, 24, 26, 31, 33, 36; orange 5, 8-10, 12, 14, 15, 17-19, 23, 27, 29, 37; red 20, 22, 25, 28, 30, 32, 34, 38, 39; yellow 35, 40.
  (21 and 31 list orange but the `2·sel − page mod 2` cap makes the first monster of an odd page green.) Pages 9+ repeat the table one colour up, same cap.
- **_VesselMULTI** (pet scene init @27188109) = `(1 + whichMTXpurchased[53]) · TankBonusLIST[2] · (1 + EbonusThree[10]/100) · (1 + SkillLevels[63]/100)
  · (1 + 2·PotionLV[100]/100) · MasteryBonuses[20]`; `whichMTXpurchased[53]` is first raised to `DoubleVesselsBought`. EbonusThree[10] = Tinkering
  "Vessel Gain"; SkillLevels[63] = skill-tree "Vessel gain +1%". No card term. the author: 2.529 (lab 2.27 × mastery 1.11).
- **Away** (@27225189; same in the refresh path @27303384): `CalibrationValues[6] · amount · AwayTimeRewarded/3600` for the selected monster.
- **Calibration**: clicking a monster (or a frontier level-up) zeroes `CalibrationValues` and starts a 15 s count (`CountdownR = 15.5`, @27491528);
  damage dealt adds to CV[1], damage taken to CV[2] (heals subtract, uncapped, @5013454, @5087650). At the end (@27516161): CV3 = CV1, CV4 = CV2,
  `CV5 = 3600/(killTime + MonsterRespawnTime)` with killTime = 15·MonsterHPtot/CV3, `CV6 = CV5 · D/(D + 10)`, D = 15·PetHPtot/max(CV4, 1), and
  CV6 = 0 if `MonstersKilled[id]` is 0. So the away rate is one 15 s sample: clicking the monster again re-measures it.
- **Checked on the author's save** (2026-10-11): the stored CV5/CV6 (582.66 / 581.45 on monster 16) come out of the formula exactly; between two saves on
  monster 16, MonstersKilled[16] 81 → 147 and green 0.10 → 3,776.9 = 66 kills × 57.23 per kill (to 0.03%).
- **Model**: live kills/h from `simulateTrek`; away kills/h for monsters other than the selected one from a 15 s sim fed into the calibration formula.
  On monsters 16 and 20 that estimate ran 28-35% above the stored sample (the sim is an expected value; a 15 s sample is noisy), so "away" numbers
  for unselected monsters are marked "est.". Candy on the Pets screen is assumed to pay the away formula at full rate (candy verified on Tilling/Apothecary only).

## Buying pet inventory (how, confirmed in game 2026-10-08)
Not from the shop directly: the Decks tile there sells only card/tinker decks. Open the pet inventory, page to the **last**
page, click the buy-more button. The game opens the Crusade gem page with `BuyingCARDdeckSlots = 2` † and the side panel
reads "More Pet Inventory · 6 of 26 space owned · 200 gems". **Don't click any tile** (selecting one switches the panel
back to decks); press PURCHASE directly. +5 slots per buy, max 26 buys (130 slots) †.
