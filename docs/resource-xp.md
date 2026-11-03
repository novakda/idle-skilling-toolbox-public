# Does the resource you gather change XP?

From the game code (Qno2x.js, 2026-10-04). Short answer: **Fishing yes, Botany yes (by plant tier), Tilling and Mining no.**

| Skill | XP per harvest/catch | Depends on the resource? |
|---|---|---|
| Tilling | `FarmingExpGiven[farmer] × FarmingExpGivenBONUS[farmer]`, on a `farmingChance`/1000 roll | **No.** XP is per farmer (value upgrades: `+1 + floor(L/3)/10 + floor(L/10)/2` each). The bonus is plot levels (+0.25 per plot at level 2+), armor 40 (+0.25), `PbonusTillingExp`, water level. `PlantType` never enters it. |
| Tilling yield | `R × (1 + armor/10·0.25) × SeedsGivenBONUS[plot]` | **Yes.** Crops 1 and 11 use a simple formula (Farming LV, water LV); the rest scale with log(gold) and log(owned seeds of other crops). Farmer armor matching the crop group gives ×1.1 (crops 2-4 armor 0, 5-7 armor 10, 8-10 armor 20, 15-17 armor 30, at plot level 2-5); armor 40 ×1.25 on any crop. Crop cards ×(1 + k·lv/100) on their own crop only. |
| Botany | `FlowersExpGiven[pot] × FlowersExpGivenBONUS[pot] × HerbloreExpBOOST × OG-bonus^(OG-1) × …` | **Yes, by plant tier.** `FlowersExpGivenBONUS` is fixed at planting: plant 1 `1.26^(0.43·ln(seeds+1))`; plants 2-12 `1.21^… × 1.25^(0.43·ln(flowers+1))`; 13+ `1.23^… × 1.3^…` (see `PLANTING` in web/src/botany-calc.ts). Higher-tier plants pay more XP for the same seeds/flowers fed. |
| Mining | `MiningExpGiven[miner] × MiningGemEXP[miner] × (1 + BonusMiningExpCUMUpercent/100 + rift)`, on a `miningChance` roll | **No.** Per miner (same value-upgrade formula as farmers), not per ore. |
| Fishing | `(5f + 15·⌊f/15⌋·(f−14) + 75·⌊f/25⌋·(f−25)) × ((100 + smithingFishingPower)/100)^0.7 × 2^FunnyHatPurchased`, f = fish number | **Yes, strongly.** Fish 1 = 5, 10 = 50, 14 = 70, 15 = 90, 20 = 190, 25 = 290, 30 = 1,005 base XP. Jumps at fish 15 and 25, so higher fish are worth far more. You don't pick the fish: each catch is rolled (below); hooks and rods shift the tier odds. |

## Fishing: which fish you catch

Each active catch rolls r = randomInt(1,1000)/10, then: r < `FishChanceLARGE` → fish 25..min(25+⌊LV/15⌋, 30); else r < `FishChanceMEDIUM` → fish 15..min(15+⌊LV/8⌋, 24); else fish 1..min(4+⌊LV/6⌋, 14). Uniform within the tier.

- `FishChanceLARGE = min((Hook²/12 + (Rod−1)³/12) · (LV+20)/35, 45)`
- `FishChanceMEDIUM = min((2·Hook + 4·Rod) · (LV+25)/50, 100 − LARGE, 45)`; the screen shows SMALL = 100 − MEDIUM − LARGE.

**The roll treats MEDIUM as a cutoff, not a share**, so the real medium odds are MEDIUM − LARGE and small is 100 − max(MEDIUM, LARGE). With MEDIUM capped at 45, small stays at 55% forever; hook/rod upgrades only move medium catches into large. **Verified live 2026-10-04** (`bun src/fish-counter.ts`, 100 active catches): large 22% / medium 24% / small 54% vs cutoff model 24.5 / 20.5 / 55 and screen 24.5 / 45 / 30.5; every catch's fish matched its roll under the cutoff rule (100/100). Away gains (`FishGiven`) may use the chances differently; not traced.

the author's save (LV 142, hook 6, rod 4): shown L 24.3 / M 45 / S 30.7, real L 24.2% / M 20.7% / S 55.1%, base 195 XP per catch (× 1,010 multiplier; the stored last catch, 45,460 = fish 9 × 1,010.22, checks the formula).

| Upgrade | Real L / M / S | Base XP/catch |
|---|---|---|
| now (hook 6, rod 4) | 24% / 21% / 55% | 195 |
| hook 7 | 29% / 16% / 55% | 215 (+10%) |
| hook 8 | 35% / 10% / 55% | 237 (+21%) |
| rod 5 | 39% / 6% / 55% | 251 (+28%) |
| hook 7 + rod 5 | 44% / 1% / 55% | 270 (+38%) |
| ceiling (large 45%) | 45% / 0% / 55% | 275 (+41%) |

One rod level ≈ 2.5 hook levels; the whole hook/rod track tops out at +41% fishing XP.

## Fishing warp (PAI #2422)

The warp is actor 527 (ActorEvents_527), unlocked by `SkillLevels[24]` > 0 (the author's save: 10).

- **Odds:** every 1 s while the line is waiting for a bite (`FishingState` 3), roll randomInt(1,100); < 25 spawns a warp (24% per check) at a random spot over the water. It fades at 2 s and is gone at 3 s.
- **Effect when clicked:** `FishingComplete += SkillLevels[24]`, i.e. the current wait jumps ahead by that many seconds (10 s for the author). The bite comes once `FishingComplete > FishingTimeo + 0.8`. Nothing else: no XP, fish, or odds change. Its look is `min(level, 6)`.
- **Worth it?** Only when the wait is long. The wait is `FishingTimeo` (random between FishingTimeMin and FishingTimeMax, which fishing power shrinks) + 0.8 s; the author's live `FishingTimeo` is ~0.16 s, so each wait is under 1 s of a ~5 s catch cycle (the rest is the reel/catch animation, which warps don't touch). At that speed a warp saves under 1 s per catch at best, and usually spawns after the bite already came. Early on (base wait 10-15 s) a +level-second skip is a real speedup.

## Away fishing (not rolled)

Away fishing doesn't roll catches. Opening Fishing credits `OfflineGains[7]` (scene-init code near "OfflineGains")[7]):
`Σ tier avgXP × (FishChance<tier>/100) × AwayTimeRewarded / ((FishingTimeMin + FishingTimeMax)/2) × (100 + power)/100 × (1 + 0.5·SecretEarned[3] + 0.02·SmithingItemLevel[35]) × 2^FunnyHat`.

Compared with active fishing it uses the **screen's** odds (medium 45%), counts a catch per bite **wait only** (the author: ~0.16 s, so ~6.4 catches/s vs ~1 per 5.4 s active), applies power **without** the ^0.7, adds two multipliers, and overstates the large-tier average (805 vs a true 567.5).

**Live 2026-10-04 (controlled):** left Fishing 16:51:52, back after 327 s: fishingEXP +4.906e9. Predicted = formula × AwayTimeRewarded with AwayTimeRewarded = 327 s × 30.5% (nonActiveZoneGainPercent) = **4.95e9, within 1%**. The ×(1 + TankBonusLIST[12]/100) seen at one credit site (Fishing scene init, likely the load-game path) is **not** applied on a screen switch.

the author's rate: ~1.5e7 XP per away second vs ~3.7e4 XP/s fishing actively, so **~410×**. (An earlier uncontrolled test, departure time unknown, suggested ~900×; it fits ~16 min away.) Practical upshot: leave Fishing and come back to collect; don't fish actively.

## Away credit on other screens (same away code, CurrentlyViewedScreen 2-8)

- **Attack Dojo / Strength Mountain / Endurance Fields (2-4):** Σ lifters `floor(animationspeed/frames·6000)/6000 × expgiven × (1+Pbonus…Exp) × (1 + LifterLV·PotionLV[73]/1000) × chance/1000 × AwayTimeRewarded`, plus water `× (1+H20BonusPercent)(1+PbonusGymH20)·TankBonusLIST[38]`. Shape of the active rep rate.
- **Mining (5):** Σ miners `floor(MinerAnimationSpeed/9·6000)/6000 × MiningExpGiven × miningChance/1000 × MiningGemEXP × AwayTimeRewarded`. Shape of the active rate.
- **Smithing (6):** `AwayTimeRewarded/1.8 × SmithingExpGiven[1] × (1 + 0.2·SkillLevels[14])`: one craft per 1.8 s.
- **Fishing (7):** the outlier above (catch per bite wait, no reel animation): ~410× active.
- **Fighting (8):** separate system, not traced.

**Mining live 2026-10-04:** active 73 s = 4.13e6 XP/s (lv 120); 209 s away then back: credit ≈ 6e7 (estimated: XP 24 s after re-entry minus that much active mining), i.e. ~3e5 per real away second, **~7% of playing**, below even the 30.5% rate (rough; the watcher missed the exact credit tick). Static reading for the gyms: same per-rep shape, so at most ~30%. Only Fishing is better left than played. Tilling, Botany and the other screens credit away time in their own scene code, not traced here.

## Tilling away (own scene code)

Away credit: Σ farmers `FarmingAnimationSpeed/10 × (1 + armor/40) × FarmingSpeedBOOST × AwayTimeRewarded × FarmingExpGiven × (0.25·round(armor/10) + 1) × FarmingExpGivenBONUS` (owned farmers), then `× (1 + TankBonusLIST[36]/100)`. Unlike active harvests it has **no `farmingChance` roll** (active XP only lands on randomInt(1,1000) ≤ farmingChance: 100 → 10%) and adds an armor term to XP.

**Live 2026-10-04:** active ≈ 3.0e6 XP/s (87 s on Tilling, lv 86); 224 s away → +6.35e9 = 2.84e7 per real away second vs 2.69e7 predicted (30.5% of away time), so **~9× playing it**. Tilling, like Fishing, is better left than played.

## Tilling active: the 60 fps cap

On screen, a 10 ms timer (SceneEvents_34) adds `0.01 × anim × (1 + armor/40) × FarmingSpeedBOOST` to each farmer's counter; each draw (60 fps) advances the farmer one frame if the counter is ≥ 1 and **zeroes it, losing the overflow**. A harvest is 9 frames (FarmerAnimation 1 → 10, ActorEvents_1093). Draws get 2, 2, 1 timer ticks in turn, so a farmer's real frame rate is a step function of its nominal speed: **≥ 100 → 60 frames/s (6.67 harvests/s), 50–100 → 40 (4.44/s)**, lower steps below that. Away credit uses the nominal speed with no cap.

**Live 2026-10-04** (60 s probe on Tilling, 59.9 fps): farmers 1–2 (speed 101.5) 6.65 harvests/s; farmers 3–8 (63–89) 4.42–4.43/s; 3.03e6 XP/s vs 2.98e6 from `activeTilling()` in web/src/away.ts (the old uncapped estimate said 5.15e6). Away/active = 9.3×.

**So:** farmer speed upgrades do nothing for active Tilling until a farmer crosses 100; farmers 3–8 sit at 63–89, so the next step is 40 → 60 frames/s (+50%) for each one that reaches 100. Away Tilling gets every bit of speed.

**What moves a farmer:** speed levels (FarmerLV2) cap at 81 (each ×(1 + 8/(1+⌊LV/4⌋/3)/100), cost ×1.12), and the author's 8 are all maxed. What's left: `FarmingSpeedBOOST` = (1 + 0.1 per plot at level 2+) × (1 + PbonusTillingExp/1000), PbonusTillingExp = (10·potion 22 + 0.45·potion 52·FarmingLV)(1 + 0.02·potion 94); and armor. Armor 10/20/30 need the farmer's plot at level 2/4/5; **armor 40 needs a Mystical Tiller per farmer** (picker: `MTXmysticTillersPurchased ≥ farmer`). the author owns 2, so tiller #3 (150 gems) puts farmer 3 at 40: speed 88.8 → 101.5, Tilling XP away +4.4%, on screen +6.3%, its crop ×1.14. Priced in the Gems tab.

## Botany away

Away time advances each pot's growth bar at the on-screen per-second rate (`floor(anim·6000)/100 × (1 + tier/4) × HerbloreSpeedBOOST × potSpeed / 60`) times the away %; harvests and their XP follow the normal rules (modelled in web/src/botany-calc.ts `botanyGrowth`). So Botany away ≈ **30.5% of playing**. Filling a bar doesn't harvest: it adds an overgrowth level (growth time ×5, flowers ×2, per the wiki); XP and flowers come when you harvest a pot by hand. Live 2026-10-04: 217 s on the Botany screen without harvesting → HerbloreEXP +0. So for Botany the away question is only growth speed (30.5% away), and when to harvest is your call.

**Summary:** Fishing ~410× and Tilling ~9× better away (live); Mining ~7% (live) and Botany ~30% (code) of playing; gyms ≤ ~30% (code).
