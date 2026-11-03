# Smithing (anvil) item bonus curves: census of items 1–96

Source: `data/game/asar/distBuild/static/game/Qno2x.js` (the `BUNDLE` of `src/game-eval.ts`). `@N` is a byte offset in that file,
scene names are the enclosing `["scripts.X"]=` block. Every `getGameAttribute("SmithingItemLevel")` occurrence (1149) was
enumerated: 591 constant-index reads (listed per item in the appendix), 320 anvil-selected-item reads (cost / craft / panel,
index = `SmithingAnvilItem[SmithingAnvilSelected]`, all verified to derive from that attribute), 72 smithing-menu page-slot
reads (ActorEvents_410, display only), and 5 whole-array loops (save/load SceneEvents_2, ascend reset SceneEvents_22 loop
0..80, contract sum ActorEvents_938). There are no other spellings of the attribute in the bundle. `L` = the item's level.

Shape classes: `linear` · `convex` · `soft-cap` (A·L/(L+B), give B) · `concave-hard-cap` (min(c·L^p, cap)) ·
`hard-cap-linear` · `step/unlock` · `unread`. The knee = level where the bonus reaches half its ceiling.

Also read: the anvil panel text for each item (SceneEvents_6, `a._BonusDisp`). It is display-only, and where it
disagrees with the code that applies the bonus, the applied formula is used here and the panel is noted.

## Counts

| class | n | items |
|---|---|---|
| linear | 59 | 1–12, 15–18, 20–28, 32–36, 39–46, 48–52, 56–66, 68, 69, 73, 74, 78 |
| hard-cap-linear | 11 | 13, 14, 19, 29, 30, 37, 38, 53, 54, 67, 75 |
| concave-hard-cap | 10 | 70, 71, 72, 76, 77, 79, 80, 85, 95, 96 |
| soft-cap | 8 | 83, 86, 87, 88, 89, 91, 92, 93 |
| convex | 4 | 81, 82, 84, 90 |
| step/unlock | 3 | 31, 47, 55 |
| unread | 1 | 94 |

## Items with a ceiling: knee and cap level

Numbers come from bisection on the formulas as the game writes them (rounding/floor included). External bonuses
(Cbonus…, potions) are taken as 0.

| item | name | formula (cited) | ceiling | knee (½ ceiling) | cap level |
|---|---|---|---|---|---|
| 13, 29, 37, 53 | Rep-speed items | level itself clamped: `5e4<L && (L=5e4)` SceneEvents_2 @20241588, SceneEvents_6 @30898385; bonus (0.5·L13 + L29 + 2·L37 + 3·L53)/100 @30892118 | L = 50,000 | 25,000 | 50,000 |
| 14, 30, 38, 54 | DR items | `min(90, L14/12 + L30/8 + L38/6 + L54/3 + CbonusDR)/100` SceneEvents_16 @19881264, _32 @23153890, _9 @31704119 | shared 90% | alone: 540 / 360 / 270 / 135 | alone: 1080 / 720 / 540 / 270 (shared cap: they use up one 90) |
| 19 | Blacksmith Pills | `pow(1−min(.001·P90,.98), min(L,25))` cost multiplier (see below) | L = 25 | 13 (in log-cost) | 25 |
| 31, 47, 55 | Mining kits | `L > a` for miner a = 0..6 (SceneEvents_5 @30260478) | 7 miners | — | 7 |
| 67 | (shield food) | `min(ceil(min(L/4·(1+CbonusCyberneticFOOD/100), 2500)), missing)` SceneEvents_41 @26980420, _9 @31867133 | 2500 shield/bite | 4,997 | 9,997 (lower when the Cbonus is above 0) |
| 70 | (BP on rebirth) | `min(round(L^0.8), 1000)` ActorEvents_601 @10715836 | 1000 | 2,362 | 5,620 (toolbox CAPS has 5624, which ignores the round) |
| 71 | (botany speed) | `×(1 + min(round(10·L^0.91)/100, 60))` SceneEvents_36 @24236736, @24791704 | +60 (×61) | 528 | 1,130 |
| 72 | (crystal G/O/P/B) | `+min(round(15·√L)/10, 15)`, 16 reads, Design_565_565_CrystalIntegration @18701285… | 15 | 25 | 100 |
| 75 | (shield food) | `min(ceil(min(L·(1+C/100), 4000)), missing)` SceneEvents_41 @26983450, _9 @31870163 | 4000 | 2,000 | 4,000 |
| 76 | (kills per kill) | `min(0.2·√L, 9)`, ActorEvents_601 @11044990, SceneEvents_9 @31708107 and more | 9 | 507 | 2,025 |
| 77 | (rift XP req) | `req·(1.45 − min(min(floor(10·(L+1)^0.23 − 10), 70)/70·0.16, 0.24))` SceneEvents_28 @21531334; rift 9 copy `1.64 − …·0.26, 0.34` @21535246 | 70 (−16% / −26% req) | 691 | 8,442 |
| 79 | (tilling exp) | `×(1 + min(round(10·L^0.88)/100, 40))` SceneEvents_34 @23485700, @23502933, @23537560, @23724939, @23738382 | +40 | 412 | 906 |
| 80 | (crystal Y/R/Pu/Bl) | `+min(round(10·√L)/10, cap)`: cap **10** in the PotionGem blocks (@18694347, @18765905); cap **15** in the MiningGem blocks (@18723654, @18790795) | 10 or 15 | 25 / 56 | 100 / 224 |
| 83 | (max mystic lvs) | `200 + ceil(400·L/(L+1500))` ActorEvents_601 @12332016, ActorEvents_689 @13389806, @13453273 | +400 | **B = 1500** | — |
| 85 | (minion atk spd) | `min(50, 5·max(0,L)^0.12)` ActorEvents_1485 @6408657 | 50 | 667,960 | 215,443,470 |
| 86 | (double brew) | `600·L/(L+2500)` SceneEvents_37 @24952722 (+ step: L > 0.5 adds rolls j = 9..14, @24956543) | 600 | **B = 2500** | — |
| 87 | (pet dmg) | `1 + 400·L/(L+2000)·1.15^min(L/2000, 8)/100` SceneEvents_43 @27308176 | 1223.6% | 8,964 | exponent stops at 16,000 (88.9% of ceiling there) |
| 88 | (traces) | `1 + 400·L/(L+1500)·1.6^min(L/2000, 9)/100` SceneEvents_41 @26904788 (8 copies) | 27,488% | 15,445 | exponent stops at 18,000 (92.3%) |
| 89 | Slamacow Trinket | `Medallion^(1 + (0.96·L/(L+2500))²)` SceneEvents_9 @31690094 | +0.9216 exponent | **6,036** (the squared term's half point; B = 2500) | — |
| 91 | (build speed) | `aa6 *= 3 + 200·L/(L+3000)·1.15^min(L/1000, 14)/100` ActorEvents_1012 @2688547 | 1415% | 10,796 | exponent stops at 14,000 (82.4%) |
| 92 | Snapped Time | `SmithCash^((0.96·L/(L+2200))²)` SceneEvents_9 @31690700 | 0.9216 exponent | **5,312** (B = 2200) | — |
| 93 | One Swing Pick | `(1 + 3·L/(L+1500)·1.085^min(L/1000, 15))^CoolCashStars` SceneEvents_34 @23474942 (6 copies), SceneEvents_5 @30253113 | 10.2 per star | 8,497 | exponent stops at 15,000 (90.9%) |
| 95 | (realm coins) | `AllCashBonus: (1 + min(max(0,L)^0.3, 500)/100)^RealmStuff[23]` ActorEvents_1485 @6402446 | 500 | 98,431,333 | 992,125,658 |
| 96 | (minion dmg) | `(1 + min(200, 9·L^0.15)/100)^max(0, RealmStuff[23]−50)` ActorEvents_1485 @6399741 | 200 | 9,369,505 | 951,882,279 |

Items 87, 88, 91 and 93 are soft-caps multiplied by a growth term whose exponent is capped. They still grow after the
exponent stops, only through the L/(L+B) factor.

## Per-item census

| # | name | shape | formula as written (main copy) | locations, and copies that disagree |
|---|---|---|---|---|
| 1 | — | linear | medallion +0.5·L%; PbonusCash2 0.2·P64·L | medallion SceneEvents_16 @19875698 (floor), _16/_41 @19905205, _32 @23151267/@23181323, _51 @30840704, _9 @31686163; PbonusCash2 _37 @25973862, _9 @31624931; step: L≥100 gives Mastery task 49 (ActorEvents_376 @8884509) |
| 2 | Base dmg | linear | 5·L base dmg; also ×L2 on item 58's term (1000+50·P83·L2)·L58 | SceneEvents_9 @31662288, _16/_41 @19889510, _51 @30832186, _32 @23161544; old copy _16 @19878180 has no cross term |
| 3 | food | linear | heal min(3·L·(1+0.2·SL27)·(1+Cheal), missing HP); L>0 also gates item 67 | _16 @19983855, _41 @26978833, _9 @31865546; contract ActorEvents_938 @16258599 |
| 4 | cash | linear | +0.02·L cash | ActorEvents_121 @3958690, _9 @31677061; old _16 @19886806 multiplicative (1+.02L) |
| 5 | exp chance | linear | atk/str/end chance 200+L+… | SceneEvents_0 @19274938/@19277540/@19278779, _6 @30893638 |
| 6 | HP | linear | 10·L HP; PbonusBaseDmg 2·P67/100·10·L | _16 @19894989 (+@19883857), _37 @25966501 |
| 7 | fishing power | linear (+step) | 5·L power; FishingRodLvMAX 2 when L>0 | ActorEvents_545 @10608246, _7 @31522799; step ActorEvents_416 @9004249 |
| 8 | crit dmg | linear | +0.75·L% | _16 @19900253, _9 @31675427 |
| 9 | medallion | linear (+step) | +0.75·L% (+PbonusCash2); L≥1e4 gives Mastery 85 | as item 1; ActorEvents_376 @8885545 |
| 10 | base dmg | linear | 10·L | as item 2 |
| 11 | food | linear | heal 15·L; gates 75 | _16 @19985474, _9 @31868574 |
| 12 | cash | linear | +0.03·L (old _16 copy: ×(1+.05L)) | as item 4 |
| 13 | rep speed | hard-cap-linear | (0.5·L)/100 rep speed, L clamped at 50,000 | _6 @30892118; clamp _2 @20241588, _6 @30898385 |
| 14 | DR | hard-cap-linear | L/12 inside min(90,…) | _16 @19881264, _9 @31704119; contract @16260131 |
| 15 | fish | linear | ×(1+0.03·L) FishGiven | ActorEvents_545 @10609309, _7 @31524862 |
| 16 | idle atk spd | linear | +1e-4·L smithingAttackSpeedBoost (kill rate later capped at 40/s, @11044990) | _16 @19896504, _9 @31671418; old _16 @19885793 |
| 17 | medallion | linear | +1.25·L% | as item 1 |
| 18 | base dmg | linear | L·(25+3·P16) | as item 2 |
| 19 | Blacksmith Pills | hard-cap-linear (log-linear) | cost ×(1−min(.001·P90,.98))^min(L,25) | see the Blacksmith Pills section |
| 20 | gold/min | linear | 30·L gold per minute away; PbonusCash4 5·P86·L/100 | ~20 copies (SceneEvents_0/3/4/5/7/9/14/27/31/34/35/36, ActorEvents_121); **_6 @30934567 uses 10·L** (others 30); PbonusCash4 _37 @25978857 |
| 21 | exp chance | linear | 2·L | as item 5 |
| 22 | HP | linear | 50·L | as item 6 |
| 23 | fishing power | linear (+step) | 15·L; rod max 3 | as item 7 |
| 24 | crit chance | linear | +0.25·L% (old copies floor) | _16 @19898861, _9 @31673775 |
| 25 | medallion | linear | +2·L% | as item 1 |
| 26 | base dmg | linear (+step) | 50·L; L≥5e6 gives Mastery 138 | as item 2; @8886624 |
| 27 | food | linear | heal 50·L | _16 @19987094, _9 @31871602 |
| 28 | cash | linear | +0.06·L | as item 4; @31691151 |
| 29 | rep speed | hard-cap-linear | L/100, clamp 50,000 | as item 13 |
| 30 | DR | hard-cap-linear | L/8 inside min(90) | as item 14 |
| 31 | Void Mining Kit | step/unlock | miner a armor 10 if L>a (a<7) | SceneEvents_5 @30260478; panel _6 @31073375 |
| 32 | idle dmg | linear | ×(1+0.015·L) dmg (inside min(kill-fraction,1) in away/kill-rate formulas) | ActorEvents_121 @3970865, ActorEvents_601 @11044990 and more; _9 @31707369…@31864150 (≈30 reads) |
| 33 | medallion | linear | +3.5·L% | as item 1 |
| 34 | base dmg | linear | L·(100+15·P27) | as item 2 |
| 35 | secrets | linear | +0.02·L per Secret (kills/fish/AP); PbonusFlowerSpeed min(2·P71,200)·L | ActorEvents_601 @11044990, @11293455; _9 @31783751; _37 @25984284; ActorEvents_121 @3950751 |
| 36 | gold/min | linear | 200·L (_6: 50·L) | as item 20 |
| 37 | rep speed | hard-cap-linear | 2·L/100, clamp 50,000 | as item 13 |
| 38 | DR | hard-cap-linear | L/6 inside min(90) | as item 14 |
| 39 | fishing power | linear (+step) | 50·L; rod max 4 | as item 7 |
| 40 | crit dmg | linear | +2.5·L% | as item 8 |
| 41 | medallion | linear | +5·L%; PbonusCash3 0.5·P70·L | as item 1; _37 @25977333, _9 @31886823 |
| 42 | base dmg | linear | 250·L | as item 2 |
| 43 | food | linear | heal 200·L | _16 @19988717 (4 scenes) |
| 44 | cash | linear | +0.1·L (old _16: ×(1+.2L)) | as item 4 |
| 45 | exp chance | linear | 5·L | as item 5 |
| 46 | HP | linear | 350·L | as item 6 |
| 47 | Dubaroo Kit | step/unlock | miner armor 20 if L>a | @30260478; panel @31153779 |
| 48 | idle atk spd | linear | 4e-4·L | as item 16 |
| 49 | medallion | linear | +8·L% | as item 1 |
| 50 | base dmg | linear | L·(500+60·P54) | as item 2 |
| 51 | food | linear | heal 400·L | _16 @19990340 (4 scenes) |
| 52 | gold/min | linear | 1000·L (_6: 250·L) | as item 20 |
| 53 | rep speed | hard-cap-linear | 3·L/100, clamp 50,000 | as item 13 |
| 54 | DR | hard-cap-linear | L/3 inside min(90) | as item 14 |
| 55 | Manifestation Kit | step/unlock | miner armor 30 if L>a | @30260478; panel @31192861 |
| 56 | crit chance | linear | +0.75·L% | as item 24 |
| 57 | medallion | linear | +15·L% | as item 1 |
| 58 | base dmg | linear | L·(1000+50·P83·L2) | as item 2 |
| 59 | AP | linear | ×(1+0.02·L) AP | ActorEvents_601 @11293455, ActorEvents_613 @12465666, ActorEvents_867 @15608528 |
| 60 | gold/min | linear | 2500·L (_6: 1000·L) | as item 20 |
| 61 | exp chance | linear | 8·L | as item 5 |
| 62 | HP | linear | 1000·L | as item 6 |
| 63 | fish | linear | ×(…+0.2·L) | as item 15 |
| 64 | idle atk spd | linear | 8e-4·L | as item 16 |
| 65 | medallion | linear | +35·L% | _16/_41 @19905205, _51, _9 |
| 66 | base dmg | linear (+step) | 100·L·miningLVL; L≥999,999,999 gives Mastery 163 | as item 2; @8887707 |
| 67 | shield food | hard-cap-linear | min(L/4, 2500) | see the ceiling table; TasksComplete[18] step L≥1 SceneEvents_25 @21148719 |
| 68 | cash | linear | +0.4·L | ActorEvents_121 @3958690, _9 @31677061 |
| 69 | mining exp | linear | ×(1+5·L/100) | SceneEvents_5 @30259290 (only read) |
| 70 | BP | concave-hard-cap (p 0.8) | min(round(L^0.8),1000) | @10715836 (only read) |
| 71 | botany | concave-hard-cap (p 0.91) | see the ceiling table | @24236736, @24665324, @24791704, @24826780 |
| 72 | crystals | concave-hard-cap (p 0.5) | see the ceiling table (panel shows min(0.4·√L, 20): disagrees) | 16 reads Design_565 |
| 73 | medallion | linear | +100·L% (newest copies ×(1+TankBonus54·Trekking/100)) | _16/_41/_32 (100·L), _51 @30840704, _9 @31686163 (Tank54 term) |
| 74 | base dmg | linear | 1e4·L·(1+ln-kills^(2+(P96·0.2√L76/800)^0.1)/20) | as item 2 |
| 75 | shield food | hard-cap-linear | min(L, 4000) | see the ceiling table |
| 76 | kills/kill | concave-hard-cap (p 0.5) | min(0.2√L,9); **also** an uncapped term (P96·0.2·√L/800)^0.1 in item 74's exponent (0 when P96 = 0) | ActorEvents_601, SceneEvents_9 (20 reads); base dmg copies |
| 77 | rift xp | concave-hard-cap (p 0.23) | see the ceiling table (panel says "−70% XP", the real effect is −16%/−26%) | SceneEvents_28 @21531334, @21535246 |
| 78 | HP | linear | 1e4·L | _16 @19894989 (4 scenes) |
| 79 | tilling | concave-hard-cap (p 0.88) | see the ceiling table | SceneEvents_34 (5 reads) |
| 80 | crystals | concave-hard-cap (p 0.5) | cap 10 or 15 by block | see the ceiling table |
| 81 | medallion | convex | 2500·L·(STR/100)·2.23^min(L/1000,15) (exponent stops at L 15,000, linear after) | _51 @30840704, _9 @31686163 |
| 82 | base dmg | convex | 15000·L·2^min(L/1000,15)·(…)^ConquestDiff15 (exponent stops at 15,000) | _51 @30832186, _9 @31662288 (not in _32 @23161544) |
| 83 | mystic lvs | soft-cap, B=1500 | 200+ceil(400L/(L+1500)) | see the ceiling table |
| 84 | cash | convex | L·(SpelunkerLV/2)·2.39^min(L/1000,15) (panel: 500·L·2.41^…) | _9 @31677061, @31691151 |
| 85 | minion spd | concave-hard-cap (p 0.12) | see the ceiling table | @6408657, panel @31350044 |
| 86 | double brew | soft-cap, B=2500 | see the ceiling table | @24952722, @24956543 |
| 87 | pet dmg | soft-cap, B=2000 (×capped exp) | see the ceiling table (panel: 500·…·1.25^…) | @27308176 |
| 88 | traces | soft-cap, B=1500 (×capped exp) | see the ceiling table (panel: exponent cap 10) | SceneEvents_41 (13 reads) |
| 89 | Slamacow | soft-cap (squared), B=2500 | see the ceiling table | @31690094 |
| 90 | base dmg | convex (power 6) | RealmStuff[23]·L·1e16·(L/1000)^5, uncapped | _32 @23166278, _51 @30838583, _9 @31667767 |
| 91 | build spd | soft-cap, B=3000 (×capped exp) | see the ceiling table (panel 1.16^) | @2688547 |
| 92 | Snapped Time | soft-cap (squared), B=2200 | see the ceiling table (panel: B=2000) | @31690700 |
| 93 | One Swing Pick | soft-cap, B=1500 (×capped exp) | see the ceiling table | SceneEvents_34, _5 |
| 94 | — | **unread** | panel only: `95·L/(L+1500)` "% CHANCE TO TRIGGER A…" | only constant read is the zeroing at SceneEvents_2 @20257772 |
| 95 | realm coins | concave-hard-cap (p 0.3) | see the ceiling table | @6402446 |
| 96 | minion dmg | concave-hard-cap (p 0.15) | see the ceiling table | @6399741, panel @31427314 |

## Blacksmith Pills (item 19)

Every read of `SmithingItemLevel[19]` in the bundle (4 constant-index reads, plus the generic craft/cost/loop reads):

1. `PbonusSmithTotalCostRedux = (1−min(.0025·P7,.9))·(1−min(.005·P28,.95))·(1−min(.01·P55,.98))·(1−min(.001·P90,.98))^min(L19, 25) / (1+.02·P94+vending)`.
   Three copies: SceneEvents_37 @25992445, SceneEvents_9 @31643514, SceneEvents_6 @30890287. The SceneEvents_6 copy also has
   `×(1−min(MasteryBonuses[17]−1,.99))` and leaves out the vending term. All three use `min(L, 25)`.
2. Anvil panel, SceneEvents_6 @31022218/@31023814: `if (floor(L19) == 0)` shows "MAY CAUSE FEVER DREAMS", otherwise "CONSUME ONE
   AT A TIME". It is text only. The same block sets item 19's own cost: `2000·2.5^L` in currencies 24 and 26, with no cost
   reduction.
3. Generic reads: craft `L += CraftingLvUps` (ActorEvents_376 @8881923), save/load loops (SceneEvents_2), and the ascend reset
   `for i<81: SmithingItemLevel[i]=0` (SceneEvents_22 @20951298, @21020784). Ascending therefore zeroes item 19.

`PbonusSmithTotalCostRedux` is the only place L19 feeds into anything. It multiplies the k-term of every smithing cost (175
reads of that attribute). **No use of item 19 grows past L = 25.** At L ≈ 1,016,022, levels 26 onward do nothing.

**"Number of pills crafted" is not stored anywhere else.** Potion 90's description (SceneEvents_37 @~25566600) reads
"-min(floor(P90)/10, 98)% REDUCED TOTAL SMITHING COST FOR EACH BLACKSMITH PILL CRAFTED", and the code backs it with
SmithingItemLevel[19] directly. No pill-related game attribute exists: the only strings are BLACKSMITH_PILLS and PILL_CRAFTED,
both of them UI text. The load-bonuses.ts formula is correct.

## Unread

- **94**: no bonus code reads `SmithingItemLevel[94]`. The only constant-index access is the reset to 0 in SceneEvents_2
  @20257772. No dynamic read resolves to it either: every computed-index read is the anvil-selected item, the menu page slot,
  or a whole-array loop. The panel advertises `95·L/(L+1500)` % "chance to trigger a …". That is either a dead item or applied
  under some other name not found here.

## Discrepancies with the toolbox

- `smithing-caps.ts` KNEE_CURVES[89] uses `L/(L+2500)` (knee 2500). The game adds `(0.96·L/(L+2500))²` to the exponent (fighting.ts
  squares it correctly), so the half-ceiling level is **6036**. Item 92 has the same shape with B = 2200 and a knee of 5312. It is not in KNEE_CURVES.
- CAPS[70] = 5624. The game rounds `L^0.8`, so 1000 is reached at **5620**. CAPS[80] = 225, but the cap-15 copies reach 15 at **224**.
- Caps the toolbox does not encode: 13/29/37/53 (level clamped at 50,000), 14/30/38/54 (shared `min(90)`), 67 (≈9997), 71 (1130),
  75 (4000), 85, 95, 96 (very high), 83/86/87/88/91/92/93 (soft caps).
- The toolbox's linear sets hold up against the current copies: smithing.ts base attack (2…90 plus the item-2 × item-58 cross term), fighting.ts
  medallion (1…81 plus 89), load-bonuses 19/35, gathering 69, tilling 79/86/93, rift 77, and kits cap at 7.

## Appendix: every constant-index read per item

| item | scene and offsets |
|---|---|
| 1 | ActorEvents_376 @8884706; SceneEvents_16 @19875715 @19905224; SceneEvents_32 @23151286 @23181342; SceneEvents_37 @25974879; SceneEvents_41 @26876848; SceneEvents_51 @30840723; SceneEvents_9 @31625948 @31686182 |
| 2 | SceneEvents_16 @19878197 @19889527 @19892334; SceneEvents_32 @23161563 @23164538; SceneEvents_41 @26858198 @26861005; SceneEvents_51 @30833121 @30835928; SceneEvents_6 @31215467; SceneEvents_9 @31662305 @31665112 |
| 3 | ActorEvents_412 @9000853; ActorEvents_938 @16258999; SceneEvents_16 @19984255 @19984585; SceneEvents_32 @23383961 @23384291; SceneEvents_41 @26979233 @26979563 @26980580; SceneEvents_50 @30573428 @30824595; SceneEvents_9 @31865946 @31866276 @31867293 |
| 4 | ActorEvents_121 @3958709; SceneEvents_16 @19886825 @19901652; SceneEvents_32 @23158492 @23174817; SceneEvents_41 @26870323; SceneEvents_9 @31677080 @31691422 |
| 5 | SceneEvents_0 @19276372 @19277559 @19278798; SceneEvents_6 @30894019 @30895136 @30896305 |
| 6 | SceneEvents_16 @19883876 @19895006; SceneEvents_32 @23168158; SceneEvents_37 @25967487; SceneEvents_41 @26863677; SceneEvents_9 @31618556 @31669907 |
| 7 | ActorEvents_416 @9004649; ActorEvents_545 @10608263 @10617732 @10627356; SceneEvents_7 @31522816 @31570074 |
| 8 | SceneEvents_16 @19882570 @19900272; SceneEvents_32 @23155196 @23173437; SceneEvents_41 @26868943; SceneEvents_9 @31675446 |
| 9 | ActorEvents_376 @8885755; SceneEvents_16 @19875966 @19905474; SceneEvents_32 @23151551 @23181592; SceneEvents_37 @25975129; SceneEvents_41 @26877098; SceneEvents_51 @30840973; SceneEvents_9 @31626198 @31686432 |
| 10 | SceneEvents_16 @19878447 @19889763; SceneEvents_32 @23161813; SceneEvents_41 @26858434; SceneEvents_51 @30833357; SceneEvents_9 @31662541 |
| 11 | ActorEvents_412 @9000769; SceneEvents_16 @19985874 @19986203; SceneEvents_32 @23385580 @23385909; SceneEvents_41 @26982261 @26982590 @26983609; SceneEvents_9 @31868974 @31869303 @31870322 |
| 12 | ActorEvents_121 @3958959; SceneEvents_16 @19887093 @19901902; SceneEvents_32 @23158760 @23175067; SceneEvents_41 @26870573; SceneEvents_9 @31677330 @31691672 |
| 13 | SceneEvents_2 @20241595 @20241848; SceneEvents_6 @30892487 @30898785 @30899014 |
| 14 | ActorEvents_938 @16260531; SceneEvents_16 @19881283; SceneEvents_32 @23153909; SceneEvents_9 @31704138 |
| 15 | ActorEvents_545 @10610616 @10620210 @10629834; SceneEvents_7 @31526241 @31572546 |
| 16 | SceneEvents_16 @19885812 @19896523; SceneEvents_32 @23157213 @23169688; SceneEvents_41 @26865194; SceneEvents_9 @31671437 |
| 17 | SceneEvents_16 @19876218 @19905724; SceneEvents_32 @23151817 @23181842; SceneEvents_37 @25975379; SceneEvents_41 @26877348; SceneEvents_51 @30841223; SceneEvents_9 @31626448 @31686682 |
| 18 | SceneEvents_16 @19878699 @19890000; SceneEvents_32 @23162064; SceneEvents_41 @26858671; SceneEvents_51 @30833594; SceneEvents_9 @31662778 |
| 19 | SceneEvents_37 @25993522; SceneEvents_6 @30890687 @31025189; SceneEvents_9 @31644591 |
| 20 | ActorEvents_121 @3994409 @4168616; SceneEvents_0 @19385081 @19390150; SceneEvents_14 @19853970 @19859043; SceneEvents_27 @21278033; SceneEvents_3 @22735629 @22740700; SceneEvents_31 @23016620; SceneEvents_32 @23361819; SceneEvents_34 @23500999 @23837727; SceneEvents_35 @24160086; SceneEvents_36 @24746584; SceneEvents_37 @25978876; SceneEvents_4 @26392728 @26397801; SceneEvents_5 @30291486 @30443941; SceneEvents_6 @30929143 @30934967; SceneEvents_7 @31584147 @31591874; SceneEvents_9 @31629945 @31752300 @31772029 |
| 21 | SceneEvents_0 @19276622 @19277809 @19279048; SceneEvents_6 @30894260 @30895377 @30896546 |
| 22 | SceneEvents_16 @19884126 @19895244; SceneEvents_32 @23168408; SceneEvents_37 @25967752; SceneEvents_41 @26863915; SceneEvents_9 @31618821 @31670157 |
| 23 | ActorEvents_416 @9004301; ActorEvents_545 @10608499 @10617982 @10627606; SceneEvents_7 @31523052 @31570324 |
| 24 | ActorEvents_938 @16262067; SceneEvents_16 @19885099 @19898880; SceneEvents_32 @23156500 @23172045; SceneEvents_41 @26867551; SceneEvents_9 @31673794 |
| 25 | SceneEvents_16 @19876472 @19905975; SceneEvents_32 @23152085 @23182093; SceneEvents_37 @25975630; SceneEvents_41 @26877599; SceneEvents_51 @30841474; SceneEvents_9 @31626699 @31686933 |
| 26 | ActorEvents_376 @8886835; SceneEvents_16 @19878953 @19890465; SceneEvents_32 @23162557; SceneEvents_41 @26859136; SceneEvents_51 @30834059; SceneEvents_9 @31663243 |
| 27 | ActorEvents_412 @9000664; SceneEvents_16 @19987494 @19987825; SceneEvents_32 @23387200 @23387531; SceneEvents_41 @26985289 @26985620; SceneEvents_9 @31872002 @31872333 |
| 28 | ActorEvents_121 @3959712; SceneEvents_16 @19887635 @19902655; SceneEvents_32 @23159299 @23175820; SceneEvents_41 @26871326; SceneEvents_9 @31678706 @31693048 |
| 29 | ActorEvents_938 @16263605; SceneEvents_2 @20241911 @20242164; SceneEvents_6 @30892739 @30899084 @30899313 |
| 30 | SceneEvents_16 @19881549; SceneEvents_32 @23154175; SceneEvents_9 @31704404 |
| 31 | SceneEvents_5 @30261228; SceneEvents_6 @31076730 |
| 32 | ActorEvents_121 @3971265; ActorEvents_246 @7577709 @7588815; ActorEvents_601 @11003513 @11045938 @11070644 @11096481; ActorEvents_938 @16265138; SceneEvents_28 @21681486; SceneEvents_9 @31707769 @31712165 @31715743 @31751352 @31754993 @31759389 @31763363 @31782602 @31797083 @31799375 @31813048 @31828241 @31840892 @31857455 @31858357 @31860416 @31861390 @31862086 @31863030 @31863693 @31864550 |
| 33 | ActorEvents_938 @16266673; SceneEvents_16 @19876723 @19906226; SceneEvents_32 @23152350 @23182344; SceneEvents_37 @25975881; SceneEvents_41 @26877850; SceneEvents_51 @30841725; SceneEvents_9 @31626950 @31687184 |
| 34 | SceneEvents_16 @19879219 @19890702; SceneEvents_32 @23162808; SceneEvents_41 @26859373; SceneEvents_51 @30834296; SceneEvents_9 @31663480 |
| 35 | ActorEvents_121 @3951151; ActorEvents_545 @10610379 @10619959 @10629583; ActorEvents_601 @11047692 @11072398 @11295175; ActorEvents_613 @12467327 @12471449; ActorEvents_867 @15612004; SceneEvents_10 @19769687 @19770240 @19773126 @19773672; SceneEvents_15 @19865160 @19865674; SceneEvents_24 @21136946 @21137463; SceneEvents_37 @25984849; SceneEvents_7 @31525990 @31572295 @31583772; SceneEvents_9 @31635918 @31709523 @31713919 @31756747 @31761143 @31785251 @31787506 @31816472 @31818727 @31846727 @31852095 |
| 36 | ActorEvents_121 @3994660 @4168868; SceneEvents_0 @19385332 @19390406; SceneEvents_14 @19854221 @19859299; SceneEvents_27 @21278285; SceneEvents_3 @22735880 @22740956; SceneEvents_31 @23016876; SceneEvents_32 @23362075; SceneEvents_34 @23501265 @23837983; SceneEvents_35 @24160342; SceneEvents_36 @24746840; SceneEvents_37 @25979127; SceneEvents_4 @26392979 @26398057; SceneEvents_5 @30291737 @30444197; SceneEvents_6 @30929399 @30935219; SceneEvents_7 @31584384 @31592130; SceneEvents_9 @31630196 @31752566 @31772285 |
| 37 | SceneEvents_2 @20242227 @20242480; SceneEvents_6 @30892988 @30899383 @30899612 |
| 38 | SceneEvents_16 @19881814; SceneEvents_32 @23154440; SceneEvents_9 @31704669 |
| 39 | ActorEvents_416 @9003943; ActorEvents_545 @10608736 @10618233 @10627857; SceneEvents_7 @31523289 @31570575 |
| 40 | SceneEvents_16 @19882836 @19900522; SceneEvents_32 @23155462 @23173687; SceneEvents_41 @26869193; SceneEvents_9 @31675696 |
| 41 | SceneEvents_16 @19876976 @19906477; SceneEvents_32 @23152617 @23182595; SceneEvents_37 @25976132 @25977594; SceneEvents_41 @26878101; SceneEvents_51 @30841976; SceneEvents_9 @31627201 @31628663 @31687435 @31887061 |
| 42 | SceneEvents_16 @19879486 @19891167; SceneEvents_32 @23163301; SceneEvents_41 @26859838; SceneEvents_51 @30834761; SceneEvents_9 @31663945 |
| 43 | ActorEvents_412 @9000559; SceneEvents_16 @19989117 @19989447; SceneEvents_32 @23388823 @23389153; SceneEvents_41 @26986912 @26987242; SceneEvents_9 @31873625 @31873955 |
| 44 | ActorEvents_121 @3959210; SceneEvents_16 @19887367 @19902153; SceneEvents_32 @23159030 @23175318; SceneEvents_41 @26870824; SceneEvents_9 @31677581 @31691923 |
| 45 | SceneEvents_0 @19276873 @19278060 @19279299; SceneEvents_6 @30894502 @30895619 @30896788 |
| 46 | ActorEvents_938 @16268211; SceneEvents_16 @19884377 @19895495; SceneEvents_32 @23168659; SceneEvents_37 @25968018; SceneEvents_41 @26864166; SceneEvents_9 @31619087 @31670408 |
| 47 | SceneEvents_5 @30260941; SceneEvents_6 @31157129 |
| 48 | SceneEvents_16 @19886080 @19896774; SceneEvents_32 @23157481 @23169939; SceneEvents_41 @26865445; SceneEvents_9 @31671688 |
| 49 | SceneEvents_16 @19877227 @19906728; SceneEvents_32 @23152882 @23182846; SceneEvents_37 @25976383; SceneEvents_41 @26878352; SceneEvents_51 @30842227; SceneEvents_9 @31627452 @31687686 |
| 50 | SceneEvents_16 @19879753 @19891404; SceneEvents_32 @23163552; SceneEvents_41 @26860075; SceneEvents_51 @30834998; SceneEvents_9 @31664182 |
| 51 | ActorEvents_412 @9000449; SceneEvents_16 @19990740 @19991073; SceneEvents_32 @23390446 @23390779; SceneEvents_41 @26988535 @26988868; SceneEvents_9 @31875248 @31875581 |
| 52 | ActorEvents_121 @3994911 @4169121; ActorEvents_938 @16269750; SceneEvents_0 @19385583 @19390663; SceneEvents_14 @19854472 @19859556; SceneEvents_27 @21278538; SceneEvents_3 @22736131 @22741213; SceneEvents_31 @23017133; SceneEvents_32 @23362332; SceneEvents_34 @23501532 @23838240; SceneEvents_35 @24160599; SceneEvents_36 @24747097; SceneEvents_37 @25979378; SceneEvents_4 @26393230 @26398314; SceneEvents_5 @30291988 @30444454; SceneEvents_6 @30929656 @30935471; SceneEvents_7 @31584621 @31592387; SceneEvents_9 @31630447 @31752833 @31772542 |
| 53 | SceneEvents_2 @20242543 @20242796; SceneEvents_6 @30893243 @30899682 @30899911 |
| 54 | SceneEvents_16 @19882079; SceneEvents_32 @23154705; SceneEvents_9 @31704934 |
| 55 | SceneEvents_5 @30260654; SceneEvents_6 @31196229 |
| 56 | SceneEvents_16 @19885366 @19899131; SceneEvents_32 @23156767 @23172296; SceneEvents_41 @26867802; SceneEvents_9 @31674045 |
| 57 | SceneEvents_16 @19877478 @19906979; SceneEvents_32 @23153147 @23183097; SceneEvents_37 @25976634; SceneEvents_41 @26878603; SceneEvents_51 @30842478; SceneEvents_9 @31627703 @31687937 |
| 58 | ActorEvents_938 @16271288; SceneEvents_16 @19880020 @19891869; SceneEvents_32 @23164045; SceneEvents_41 @26860540; SceneEvents_51 @30835463; SceneEvents_9 @31664647 |
| 59 | ActorEvents_601 @11294679; ActorEvents_613 @12466859 @12470953; ActorEvents_867 @15611536 |
| 60 | ActorEvents_121 @3995162 @4169374; SceneEvents_0 @19385834 @19390920; SceneEvents_14 @19854723 @19859813; SceneEvents_27 @21278791; SceneEvents_3 @22736382 @22741470; SceneEvents_31 @23017390; SceneEvents_32 @23362589; SceneEvents_34 @23501799 @23838497; SceneEvents_35 @24160856; SceneEvents_36 @24747354; SceneEvents_37 @25979629; SceneEvents_4 @26393481 @26398571; SceneEvents_5 @30292239 @30444711; SceneEvents_6 @30929913 @30935724; SceneEvents_7 @31584849 @31592644; SceneEvents_9 @31630698 @31753100 @31772799 |
| 61 | SceneEvents_0 @19277124 @19278311 @19279550; SceneEvents_6 @30894742 @30895859 @30897028 |
| 62 | SceneEvents_16 @19884628 @19895746; SceneEvents_32 @23168910; SceneEvents_37 @25968285; SceneEvents_41 @26864417; SceneEvents_9 @31619354 @31670659 |
| 63 | ActorEvents_545 @10610853 @10620461 @10630085; SceneEvents_7 @31526492 @31572797 |
| 64 | ActorEvents_938 @16272828; SceneEvents_16 @19886348 @19897025; SceneEvents_32 @23157749 @23170190; SceneEvents_41 @26865696; SceneEvents_9 @31671939 |
| 65 | SceneEvents_16 @19907230; SceneEvents_32 @23183348; SceneEvents_41 @26878854; SceneEvents_51 @30843323; SceneEvents_9 @31688782 |
| 66 | ActorEvents_376 @8887918; SceneEvents_16 @19892570; SceneEvents_32 @23164788; SceneEvents_41 @26861241; SceneEvents_51 @30836164; SceneEvents_9 @31665348 |
| 67 | SceneEvents_25 @21149630; SceneEvents_41 @26980820 @26981142; SceneEvents_9 @31867533 @31867855 |
| 68 | ActorEvents_121 @3959461; SceneEvents_16 @19902404; SceneEvents_32 @23175569; SceneEvents_41 @26871075; SceneEvents_9 @31677832 @31692174 |
| 69 | SceneEvents_5 @30259690 |
| 70 | ActorEvents_601 @10715884 |
| 71 | SceneEvents_36 @24239648 @24668246 @24793552 @24828628 |
| 72 | Design_565_565_CrystalIntegration @18701685 @18702299 @18702955 @18703628 @18726800 @18727444 @18728130 @18728817 @18768931 @18769545 @18770201 @18770858 @18793821 @18794435 @18795091 @18795748 |
| 73 | SceneEvents_16 @19907481; SceneEvents_32 @23183599; SceneEvents_41 @26879105; SceneEvents_51 @30843574; SceneEvents_9 @31689033 |
| 74 | SceneEvents_16 @19892852; SceneEvents_32 @23165084; SceneEvents_41 @26861523; SceneEvents_51 @30836446; SceneEvents_9 @31665630 |
| 75 | SceneEvents_25 @21149891; SceneEvents_41 @26983850 @26984170; SceneEvents_9 @31870563 @31870883 |
| 76 | ActorEvents_601 @11046676 @11071382; SceneEvents_16 @19893569; SceneEvents_32 @23165843; SceneEvents_37 @25589787; SceneEvents_41 @26862240; SceneEvents_50 @30573308 @30824475; SceneEvents_51 @30837163; SceneEvents_6 @31284301; SceneEvents_9 @31666347 @31708507 @31712903 @31755731 @31760127 @31784235 @31786490 @31815456 @31817711 @31845723 |
| 77 | SceneEvents_28 @21532402 @21539748 |
| 78 | SceneEvents_16 @19896092; SceneEvents_32 @23169256; SceneEvents_41 @26864763; SceneEvents_9 @31671005 |
| 79 | SceneEvents_34 @23491268 @23508456 @23542143 @23726069 @23738782 |
| 80 | Design_565_565_CrystalIntegration @18699059 @18699714 @18700372 @18701028 @18724054 @18724739 @18725427 @18726113 @18766305 @18766960 @18767618 @18768274 @18791195 @18791850 @18792508 @18793164 |
| 81 | SceneEvents_2 @20257083; SceneEvents_51 @30842729 @30843024; SceneEvents_9 @31688188 @31688483 |
| 82 | SceneEvents_2 @20257136; SceneEvents_51 @30837466 @30837703; SceneEvents_9 @31666650 @31666887 |
| 83 | ActorEvents_601 @12332033 @12332270; ActorEvents_689 @13390092 @13390343 @13453559 @13453810; SceneEvents_2 @20257189 |
| 84 | SceneEvents_2 @20257242; SceneEvents_9 @31678083 @31678383 @31692425 @31692725 |
| 85 | ActorEvents_1485 @6409057; SceneEvents_2 @20257295; SceneEvents_6 @31352393 |
| 86 | SceneEvents_2 @20257348; SceneEvents_37 @24953309 @24953560 @24956550 |
| 87 | SceneEvents_2 @20257401; SceneEvents_43 @27309504 @27309741 @27309969 |
| 88 | SceneEvents_2 @20257454; SceneEvents_41 @26905188 @26905425 @26905662 @26923120 @26923357 @26923589 @26939388 @26939625 @26939857 @26958209 @26958446 @26958678 |
| 89 | SceneEvents_2 @20257507; SceneEvents_9 @31690101 @31690426 @31690677 |
| 90 | SceneEvents_2 @20257560; SceneEvents_32 @23166408 @23166678; SceneEvents_51 @30838983 @30839253; SceneEvents_9 @31668167 @31668437 |
| 91 | ActorEvents_1012 @2688588 @2688829 @2689070; SceneEvents_2 @20257613 |
| 92 | SceneEvents_2 @20257666; SceneEvents_9 @31691100 @31693299 @31693550 |
| 93 | SceneEvents_2 @20257719; SceneEvents_34 @23475342 @23475593 @23475844 @23626260 @23626511 @23626762; SceneEvents_5 @30256695 @30256932 @30257160 |
| 94 | SceneEvents_2 @20257772 |
| 95 | ActorEvents_1485 @6403175; SceneEvents_2 @20257825 |
| 96 | ActorEvents_1485 @6400911; SceneEvents_2 @20257878; SceneEvents_6 @31429552 |

Computed-index reads:
- anvil-selected item (cost/craft/panel): ActorEvents_376, ActorEvents_384, SceneEvents_6 (320 reads)
- page-slot k+8·(page−1) (smithing menu): ActorEvents_410 (72 reads)
- loop index ss: ActorEvents_938 (1 reads)
- loop index Vt: SceneEvents_2 (1 reads)
- loop index _u: SceneEvents_2 (1 reads)
- loop index Ul: SceneEvents_22 (1 reads)
- loop index ym: SceneEvents_22 (1 reads)
