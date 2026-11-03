# Realm: what RealmStuff holds

All Realm state is one save key, `RealmStuff`, a 50-slot array created at game start (`@20270186`: `[0]=1`, `[2]=10`, `[3]` = 180
empty barn slots, `[20]=86400`, `[31]=-1`, `[24]` = 100 trophies). Offsets are bytes in
`data/game/asar/distBuild/static/game/Qno2x.js`; most reads go through the `MinionInfo` custom block (ActorEvents_1488, branch named in
the table) and the Realm scene actor (ActorEvents_1490). Static tables (minions, traits, blessings, fruits, shrine and vending rows,
boss colour gates) are evaluated from the game by `bun src/derive-realm.ts` → `web/src/data/realm.json`. The **Realm** tab
(`web/src/realm.ts`, #23) reads them.

## Verified (game code; † in the tab)

| i | Meaning | Where | Receipt (2026-10-05) |
|---|---|---|---|
| 0 | **Realm Lv** | LvUp listener @30853486: while `[1] ≥ [2]`: `[0]+1`, `[1]−=[2]`, `[2]=2·[2]+5`; `perRealmLV` @6475499 | badge "Lv. 16" |
| 1 | Realm EXP toward next level | same | badge "218K" |
| 2 | EXP needed for next level; also scales Purple boss HP (`BossHPtot` tier 4 @6384443) | same | 491515 |
| 3 | Barn: 180 slots `[id, level, ?, evolution stage, coins spent, …]`, `"none"` = empty. Stage `s` caps level at `Evo(s)` = 10/50/200 until evolved (@6494516, `Evo` @6389528). Coins spent drive banish EXP (`BanishEXPgain` @6415061) and damage (`MinionDMG`) | ActorEvents_1488/1490 | barn screen: Hippo 24, Mountain 21, … Volcano 50 at stage 2 |
| 4 | Current boss HP left per colour tier (20 tiers; filled with `BossHPtot(afterlife, tier)` on each kill @6523694) | @6523570 | `[4][2]`=811751 vs bar "811K/841K" (yellow) |
| 5 | Coins (reset sets it to 0 or the Icecream Sammich amount @6764040) | @6764040 | "3568" on screen = 3.568e9 |
| 6 | Bosses beaten this run. **The game shows Afterlife `[6]+1`** (digit images `Afterlife0-9.png`, ActorEvents_1490 @6552727). Kill: `[6]+1`, then `[7]=[6]`, `[23]=max([23],[6])` (@6522988). Index into the BossHP table | @6522988, @6552727 | 13 → "Afterlife 14" |
| 7 | Copy of `[6]` for the boss whose HP is drawn (`_BossHPdisp` @6557349); zeroed with `[6]` on reset | @6523527 | 13 |
| 8 | Vending Machine item levels (16 items, `VendingInfo` order). Bonus = per-level × level; items 5–8 `100l/(l+25)`, 15 `50l/(l+35)` (`VendingBonus` @6418645). Items shown = last owned + 2; Bundled Broccoli (11) is never read as a bonus, so only its first level matters (it opens Vendi Bar); Icecream Sammich (10) has no VendingBonus read either: a Shrine reset (@6764000) sets `[5]` to `VendingCost(10, 17)` = 0.02 · 10 · 25^10 · 25^(level−1) coins (@6416528) | `VendingMachineItemsOwned` @6415859 | Wheat Chew 10 |
| 11 | Blessings held: map letter → picks (`MostBlessings` @6475743). Letters key `CustomMaps.Blessings` (`b` Penny Thought, `o` Barno, `e` Intellingo …) | | 10 types |
| 12 | Spirals (Shrine currency): spent by `ShrineUpgCost` @6760859, `+ShrineResetQTY` on reset @6762310 | | 1719 |
| 13 | Shrine upgrade levels (no unlock gate: all 8 rows on the Upgrades tab, two at a time behind a scroll bar; buy = level < max and Spirals ≥ cost, @6760065), `ShrineUpgrades` order: Dharma, Bhakti, Carnate, Ahisma, Taoism, Sahaja, Moksha, Nirvana (names: wiki; effects match). Cost = base·scale^level (@6420736). `[13][2]` adds barn slots, `[13][7]` away gains | @6420736, BarnSlots @6387440, away @20194777 | Dharma 10, Bhakti 31 |
| 14 | Cornucopia food bundles (spent by `CornucopiaUPG`, `+CornucopiaTurnInREWARD` @6765910) | | "2.5K" |
| 15 | Resources turned in per type (8) | @6766439 | ores 1.248e9 ("1.2B"), traces 1.19e6 ("1.1M") |
| 16 | Cornucopia turn-ins today (`[16]+1` per turn-in, 2/day) | @6765910 | 0 → "2 left" |
| 17 | Fruit slots (7): `[fruit, bonus1, value1, bonus2, value2, bonus3, value3]` | `FruitInfo` | Cherry, Watermelon |
| 18 | Cornucopia slot upgrades (`CornucopiaUPG` 0 cost `(10+25x+x³)·80^x` @6429502) | | 2 |
| 19 | Fruit rerolls bought today. Cost (`CornucopiaUPG` 1 @6430623) = 0 while `[40]` > 0 or `[19]` < Fruit Vendor (trait 40, "first { fruit reroll purchases each day are free"), else `50·7^([19] − FruitVendor)` food bundles; buying one rerolls a fruit bonus (`FruitBonusTypes`) and takes `[40]−1` if any, else `[19]+1` (@6776924); the daily reset sets it to 0 (@30851997) | @6430623, @6776924 | 0 |
| 20 | Banish/daily reset countdown, seconds (#2672). Set to 86400 when the Realm is created (@20270776). It runs only in the Realm screen's scene (SceneEvents_51): a 1 s `runPeriodically` subtracts 1 (@30851176) and, once below 0, adds 86400 and zeroes `[16]` (Cornucopia turn-ins), `[19]` and `[22]` (banishes used) (@30852055). Off the Realm screen it is frozen; on entry the scene credits `AwayTimeZone[24]` = now − `LastVisitedZone[24]` at 100% (@30845965; other screens scale this by `nonActiveZoneGainPercent`, e.g. @21252034, the Realm doesn't), and a 500 ms handler (@30848467) subtracts away = now − `QuitTime` + `AwayTimeZone[24]` from `[20]` when over 5 s (@30849224), then keeps `QuitTime` and `LastVisitedZone[24]` at now (@30848506). Net: the refill lands at `LastVisitedZone[24]` + `[20]`, a fixed wall-clock moment each day set by when the Realm started (not midnight, not a timezone); gaps ≤ 5 s are dropped, so it drifts only later. Caveat (code reading, not observed): the loader resets `QuitTime` to now except when the game was quit on the Realm screen (@20201546); relaunching into the Realm then counts the closed time twice (via `QuitTime` and via `LastVisitedZone[24]`), pulling the refill earlier. Wait text = `TimeHR([20])` (`Xhr_Ymin_Zsec`, @6444713): "Wait …_to" in the banish panel once `[22]` ≥ `TotalDailyBanishes` (@6696312); the same timer drives the Cornucopia bundle text (@6874155) and the fruit/reroll reset text (@6881366). On each reset, chance 3·`ConstructLV[45]` % to pull `QuitTime` back 1-3 h 5 s later (@30852121) = 1-3 h of away time off `[20]`; nothing else shortens it (no gem/shop/trait/item write). App: `banishRefill` (web/src/realm.ts); page shows "refill in 4h 47m (03:27 AM)" | | 17241 s at 22:40 PDT 2026-10-23, `LastVisitedZone[24]` 22:40:29 → refill 03:27 PDT |
| 22 | Banishes used today; limit `TotalDailyBanishes` = 6 + Trashite (@6415774, check @6636187). Trashite (trait 24, +5, unstackable) is unobtainable in this build: no `MinionDatabase` row carries it, `TraitList` (@6451390) adds only ancestors, family passives 7/1/7/53 and the Orb trait, and the Orb pool `randolist[3]` excludes 24; so the limit is 6. `[20]` (reset timer, see row 20) refills them once a day at a fixed wall-clock moment | | 0 |
| 21 | Per-minute coin-trait timer: −0.1 a tick, back to 60 when the per-minute coin traits fire (@6606285); see Coins below | | 24.7 |
| 23 | **Best bosses beaten** (best Afterlife reached = `[23]+1`). Choccy Coin, Burrito etc. "per best afterlife"; `smithing.ts` | @6523483 | 22 → reached 23 (Purple wall) |
| 24 | Trophy state per `TrophyInfo` row (68 rows: target, reward?, image, text): **−9 claimed** (TotalTrophies counts −9s, @6477517), **−1 not offered yet** (claiming row 9 opens 8, 10 opens 13, 12 opens 15 … by setting it to 0, @6787600), **≥ 0 progress** toward `TrophyInfo[i][0]` (`trophyprogress` Add/Sub/Total only moves values ≥ 0, @6459281) | @6459281, @6787600 | 25 claimed (fixture), 26 on the 2026-10-11 save; open: 15 unique minions 7/15, first 10 bosses within 6 min, Rainboppo, 100 blue dollar bills |
| 25 | Orb Tower expansions. Energy cap = `(10+10x)·2^x + Chagrin` (`OrbEnergyCap` @6437329); expansion costs the cap (`OrbCost` 0) | | 4 → cap 803 ("177/803") |
| 26 | Orb Tower energy (drawn `energy/cap`, clamped to cap @6935978) | | 177 |
| 30 | Orb "show boss HP" toggle (@6922947) | | 1 (on) |
| 27 | IdleOn crossover task step; `IdleOnCrossoverMaybe` is 1 while `[27]` < 11 (@6432936), image `IdleOnCrossover`+min([27],9) (@19268740). Not Realm progress | | 7 |
| 31 | Orb Tower trait id (`TraitTypes`), −1 none; joins every minion's trait list (`TraitList` @6451390). Reroll (@6925662): randolist[3] cut to traits a barn minion carries, plus 1, 5, 11, 13; each in id order rolls TraitChanceORB (@18599289), first hit wins, else 1 | | 1 = Flesh Wound |
| 32 | Orb "next banish keeps the minion" charges (cost 25, @6927394) | | 0 |
| 33 | Orb +10% all minion damage buys (`ALLDMG`, cost 75, @6931639) | | 0 |
| 34 | **Blessing rerolls left this run**: a Shrine reset sets it to Ahisma's level (`[13][3]`, @6762623); +Holy Roller (trait 42) per boss kill (@6613218); a reroll takes 1, Lucky Roll (trait 63) may refund it (@6748378) | | 0 (Ahisma 5) |
| 35 | Field plot levels (8): Full Blossom, Smol Savings, Juiced Fruit, Cash Genesis, Spare Charge, Level Cash, Level Slash, Afterlife Slam (`FieldCosts` @6423020; plots 1, 3–7 add traits 45+i) | | all 0 (Field locked) |
| 36 | **Flowers** (Field currency): generated by minions with `MinionFieldGen` (@6577229), spent by `FieldCosts` on a plot (@6932685) | | 0 |
| 37 | **Seconds into this run**: +0.1 a tick (@6604895) plus away time rewarded (@30848882); a Shrine reset zeroes it (@6764339). A trophy checks `[37]` < 315 | | 328933 (91 h) |
| 38 | Realm time-skip hours bought (Crystal Eye Shop item 3 = 1 h, the skip menu 3/6/…/100 h; each moves `QuitTime` back and adds the hours, @6791154, @6797650) | | 0 |
| 39 | Lord's Lair torches `[0..3]`, set on entering the Lair (SceneEvents_52 init @30855217): `[0]` Yellow = `DairyAisleAchievements[7]` (Golden Ice Cream), `[1]` Green = `FurthestMapleLV[15]` > 230 ("defeat the 15th Teehee in Oblivion"), `[2]` Red = `[23]` > 49 (Afterlife 50 boss), `[3]` Blue = `waterLV` > 1775 (H2O 1776). All four open family E (Torchy) in `SummonTypesUnlocked` (@6388361). `[4]` = 1 once `[6]` ≥ 100 (boss art past 99, @6530029) | | all 0 |
| 40 | Free fruit rerolls banked: +15 from Crystal Eye Shop item 6 (@6798105), spent before paid ones | | 0 |
| 41 | Crystal eyes (Crystal Eye Shop currency; `+600` per `eye_a` purchase @6799601) | | 110 |
| 42 | Crystal Eye Shop purchases; `[42][0]` adds 4 barn slots each (`BarnSlots`) | `CrystalShopCost` | |
| 44 | One-time tutorial flag: set to 1 on tapping the Realm hint while `waterLV` > 9 and `TutorialOVER` = 0 (@19396036) | | 1 |
| 45 | One-time flag: on first load adds a crystal-eye grant to `[41]` and sets itself to 1 (@30844729) | | 1 |
| 46 | Orb +10% coin gain buys (cost 50, @6930455) | | 7 |
| 47 | One-time flag for re-crediting bought gem packs (`g0*_pack`) on load (@18625533) | | 1 |

Barn slots = `min(180, round(3 + 4·[42][0] + Wheat Chew + Barno + Carnate))` = 13 here, matching 13 lit slots.

A minion's traits are its own plus every ancestor's (`TraitList` walks `MinionDatabase` field 7), plus family passives (Piggy and
Babby Egg lines: Coin Pressing; Ogre Spawn line: Field Bloomer) and the Orb trait. So a Volcano still deals Orange (Mountain's OJ Heart Stab).

## Coins (`RealmStuff[5]`): how they are earned

Every write to `[5]` in the bundle, decoded (`src/realm-coins.ts` runs the same blocks for the **Maximise coins** section):

| Offset | What | Effect |
|---|---|---|
| @6606285 / @6606733 | Realm-screen tick (100 ms, ActorEvents_1488; only gated on the actor being enabled) | `[21]` −0.1 a tick; at < 0 it resets to 60 and each barn minion with Coin Pressing (trait 7) adds `MinionCASH`, ×2 when `randomFloat() < MinionTraitALL(slot, 48)/100` |
| @6574387 | Away credit on return (`_AFKtime` += `AwayTimeRewarded` @30848882) | each Coin Pressing minion adds `MinionCASH · floor(sec·(1 + fruit 14%)/60)`, one 2× roll for the lot |
| @6586570 | Tapping the boss | +1 |
| @6613604 | Boss kill | × min(1.5, Boss Pilfer total) when > 1 |
| @6590500 | Spend refund (every ~1.66 s) | gives back min(50%, trait 44 + Nickel Back)% of what was spent since the last check |
| @6929004 | Orb button (OrbCost 4 = 40 energy, once) | adds back everything spent this session, capped at the most coins seen (`GenINFO[72]`) |
| @6527190 | Taoism (`[13][4]`) refund | compares coins with 0.15 × `GenINFO[52]`, which is 0 whenever it is checked (coins are never below 0), so it never fires; the only other write sets it to 1 |
| @6509750, @6649564, @6756426 | minion level, summon, vending | spends |
| @6763814 | Shrine reset | 0, or the Icecream Sammich amount |

**Coins do not depend on combat.** Nothing above reads boss HP or damage, so sitting on a boss the barn can't hurt (the Afterlife 23
Purple wall without a Rainboppo) earns the full rate. Off the Realm screen the tick does not run (two live reads 84 s apart on
another screen, 2026-10-15: `[5]` and `[21]` unchanged); that time is paid on return through the away credit at the same per-minute rate.

`MinionCASH` (@6406235) = (10·(25 + 3·Lv·1.014^Lv) + √coins spent on the minion) × AllCashBonus × (1 + Tax Collector·unique types/100)
× (1 + Smart Money·⌊Realm Lv/5⌋/100) × (1 + Gold Bless·top blessing count/100) × (1 + Smol Cash/100) × (1 + Level Cash·⌊Lv/100⌋/100).
AllCashBonus (@6403149) = (1 + min(500, smithing[95]^0.3)/100)^best × (1 + Make It Rain/100) × 1.3^`[42][2]` × 2^trait 72 ×
min(1.25, 1 + 0.6·Choccy Coin%)^best × (1 + Sahaja%)^best × (1 + (trait 19·100upgrades)^0.6/100) × Penny Thought × Dime Decisive ×
trophies × Banked Bygone × fruit (5, 12·Realm Lv) × 1.15^construction 43 × (1 + 10·`[46]`/100), with best = `[23]`.

**The 2× roll reads the slot, not Cash Genesis.** `MinionTraitALL` keys only on its first argument (@6441079), so
`MinionTraitALL(slot, 48)` is the barn total of trait number *slot*: slot 9 (trait 8, Make It Rain, which an Orb Make It Rain puts on
every minion) is a sure double. A drag swaps two occupied slots (@6643803), so the big earners can be moved there. Likely a game bug †.

## Stats section (`?tab=realm&section=bonuses`, Reference › Realm-wide bonuses; the other stats blocks are Economy › Coins, Damage, Blessings, Energy and Reference › Not shown in game; `section=stats` and `section=reference` still land on bonuses)

`src/realm-stats.ts` runs the game's blocks against the save and writes the result into `data/realm-combat.json` (`stats`); the
page shows each number with its source (block and offset) and, where the save holds the same quantity, the stored value with ✓.
Checked in `src/realm-stats.test.ts` on `fullSave()` and the live save:

- The 14 AllCashBonus factors multiply to the block's value, and × Tax Collector × Smart Money × Gold Bless × Smol Cash × Level Cash
  × the minion's base give every coin minion's `MinionCASH` (to 1e-9).
- `MostBlessings` = the largest count in `[11]`; `TotalTrophies` = the −9s in `[24]`; `UniqueBarnMinions` = distinct barn ids
  **+ Countinion** (`BlessingBonus(9)`, @6473500); `[22]` ≤ `TotalDailyBanishes`.
- Boss HP: every tier below the current one still equals `BossHPtot` (a kill refills `[4]`, hits only land on the current tier).
  Purple is skipped (its total scales with `[2]`).
- Orb energy `[26]` ≤ `OrbEnergyCap`, Realm screen only (clamped while drawn, @6935978).

Barn bonuses: per trait any barn minion carries (`TraitList` @6451390: own trait + every ancestor's), the barn total is
`MinionTraitALL` (@6441900): each carrier adds its `MinionTrait`; a TraitTypes[2] "no" trait stops after 1 + `DoubleStacksZZmax`
(= min(trait 41, 1) + VendingBonus 13) carriers. Tested: a stacking trait's total = the carriers' MinionTrait summed.
**Blessing totals** (`?tab=realm&section=blesstotals`, #2765): BlessingBonus(i) = picks × base; for randolist[4] letters × (1 + (Superblesser total + fruit 6)/100) × (1 + Bless Updog/100), two separate multiplications; Superblesser itself returns early, un-boosted. Coins: Penny/Dime/Banked are three separate AllCashBonus factors (multiply); Little/Mega/Eternal Damage add inside one factor.

Bless Updog (66) multiplies `BlessingBonus` × (1 + total/100) for the `randolist[4]` letters only (same gate as Superblesser,
@6482028): `_ b c d e f g h j k l m p q r s t w x y` (Dime Decisive, Penny Thought, Banked Bygone among them).

Evolving (@6627614, at the stage's level cap): the id becomes the parent's evo[0] or evo[1] and the stage goes up by 1; level and
coins spent are kept. Lizardman (MinionD3)'s parent is Gobbo (MinionD1), so it keeps Smol Cash and adds Bless Updog. The coin lever
"Gobbos → Lizardmen" (`realmCoins().evolveGobbos`) reruns MinionCASH on the evolved barn; on 2026-10-16 (15 Gobbos, 6 Lizardmen)
it was ×3.22 coins/h for 1.6e20 coins of level-ups.

Damage per minute per minion and colour is `minionDps` in `web/src/realm.ts` (the stage table's `tierDps` is its sum). From
`CreateDmg` (@6446043): a hit lands when its colour is the boss's current tier, **or on any colour while the tier is Pink (5)**,
except for 4 s after a mass event (`GenINFO[63]`, @6578702). Each hit then gets Crimsonile (Red) or Refractile (every other colour)
and a crit roll on the attacking minion's crit chance / crit damage.

- **White** (#2670): once any barn minion carries Pure Hearted (`MinionTraitALL(64)` > 0), every hit of every attack (the multihit
  loop, @6618955) adds `CreateDmg(whitedamage, 6, slot)`. `whitedamage` (@6389252) = `MinionInfo("LOG", GetPlayerDPS())` =
  0.434295·ln(max(1, x)) (@6389202), where `GetPlayerDPS` (@2637594) is your outside-Realm fight hit (the Fighting tab's number).
  So White per hit = log10(outside DPS) × (1 + Refractile) × crit, the same crit and Refractile as any non-Red hit; White HP is
  `BossHPtot(boss, 6)`. `src/realm-combat.ts` runs both blocks (`whiteHit`, `playerDps`); the stage table times White as
  `tierDps(6)` = Σ hits/s × whiteHit × Refractile × crit mean. On 2026-10-23: outside DPS 1.09e87, whiteHit 87.0.
- **Pink**: every colour lands, White included, but `RealmStuff[4][5]` is refilled to `BossHPtot(boss, 5)` every 5 s while Pink is
  the tier (`runPeriodically(5e3)` @6590004, refill @6592818). The stage table takes Pink as HP / every-colour DPS when 5 s of
  mean damage covers the HP, else blocked.
- **Rainbow** (tier 7, Afterlife 91+): Eternal (trait 71) adds a `MinionDMG` hit on colour 7 per hit (@6618955); timed like Red when a
  barn minion carries it, else blocked (Torchy).
- A mass event (`GenINFO[54]` > 60, @6580500..6581163) also fires White hits (× hits × an attack-speed factor); not modelled.
- **Purple** (tier 4, Afterlife 23+; #2671). HP = `RealmStuff[2]` (Realm EXP needed for the next level) × clamp(boss^0.7/100, 0.01, 0.4)
  (`BossHPtot` @6384443), fixed when the boss spawns (all 20 tiers set from `[6]`, @6523735). `[2]` starts at 10 (@20270249) and a
  level-up (`[1]` ≥ `[2]`, one a frame, @30852862) sets `[1]` −= `[2]`, `[2]` = 2·`[2]` + 5 (@30854301), so `[2]` = 15·2^(L−1) − 5:
  Realm Lv122 → 3.99e37, Purple 7.80e36 at Afterlife 71 (×0.196), 8.11e36 at 75. The ONLY Purple source is a banish with Banish Bop
  (trait 28, Rainboppo) in the barn: `CreateDmg(BanishEXPgain × ALLDMG, 4)` (@6637201, no crit, × Refractile; lands only while Purple
  or Pink is the tier). `BanishEXPgain` (@6415061) = (5 + (10·max(0, log10 s − 4))² + s^0.4) × (1 + Riftseeker/100) × (1 + Intellingo/100),
  s = coins spent on that minion (`[3][slot][4]`): the type and level don't matter, only s, and s^0.4 dominates. The same banish
  adds its EXP to `[1]`, so a Purple clear costs a fraction p(boss) of a Realm level and a level-up doubles every later boss's Purple:
  the wiki's "banish the minimum". Up to `TotalDailyBanishes` (6 + trait 24) a day (`[22]`); an Orb protect charge (`[32]`,
  OrbCost 3 = 25 energy, @6637575) keeps the minion, so one big-coin minion can be banished again and again.
  The stage table times Purple as n = ⌈HP / best banish⌉ protected banishes of the best minion (today's left first, then TotalDailyBanishes
  at each refill: the first when `[20]` runs out, then every 24 h; #2672); without protects, each minion once; else blocked, naming the coins one banish needs (`purpleSpentFor`).
  On the harness barn (wiki end-game, Lv200) the best banish is 8.5e23: Afterlife 71 needs 8.9e88 coins spent on one minion. The coin
  loop's post-reset grant puts Chonkoppo at Lv898 (2.08e87 spent, ×2.48 Riftseeker from the Rainboppo) = 1.73e36 a banish: 5 protected
  banishes a boss, Afterlife 71-75 in 4 days of banishes. Chonkoppo Lv918 (1.13e89 spent; Lv916 = 7.6e88 falls just short) one-shots
  71-75: ~14 min of the economy-tail barn's coins (8.1e87/min) after the grant. The wiki's "0 Purple damage" warning is the e123
  overflow past Realm Lv400 (a NaN-cost banish); not reached at Lv122.
Orb energy: each Charger minion adds `MinionORBCHARGE/60` at every 60 s payout (@6607522), so per hour = Σ `MinionORBCHARGE`; the
Orb panel shows 24× (@6718894).

## Barn compositions (wiki)

The Barn tab compares the barn with the wiki's Realm › Strategies compositions. Stage 16+ come from the wiki's tables
(`src/derive-realm.ts` → `realm.json` `compositions`). Stage 1-15 exist only as six screenshots ("by Stage 1", "by the end of
Stage 5/7/10/13/15"), saved in `data/wiki/images/` and transcribed by hand into `data/wiki/datasets/realm-early-compositions.json`
(each card prints name and level; `image` keeps the wiki File name). `autoStage` picks them by best Afterlife: ≤1, ≤5, ≤7, ≤10,
≤13, else ≤15 (#2675).

The end-game table's optional rows serve different goals, so the Barn tab has an "Optimise for" select (`GOALS` in
`web/src/realm.ts`, stored in localStorage `realm-goal`, default Coins). The goal turns its rows into counted ones (taken from the
Lizardman rest row, clamped to free barn slots; unstackable traits capped at BP+2): Coins = 12 Cinderduck, 8 Goose (none with Gold
Bless on the Orb Tower), 4 Pompeille, Crocodile any; Measured best = `ECONOMY_TAIL`; Damage = Pompeille, Spirals = Blaken Gold,
Rerolls = Everest (each BP+2); Energy = Crocodile, Food = Retiarius (stackable, no cap: left as "any"). The plan's rebuild step
uses the chosen set (#2676).

## Colour gates (BossHP table)

`CustomLists.BossHP[boss][tier]` is nonzero when that boss has the tier, so the first Afterlife needing each colour is:
Red 1, Orange 5, Yellow 10, **Blue 12**, Purple 23, **Pink 30**, White 47, Rainbow 91. (Gates: the Orb button shows when `[23]` ≥ `randolist[1][5]` = 11, i.e. Afterlife 12 reached, the first Blue boss; Shrine `[23]` ≥ `randolist[1][3]` = 16; Field `[23]` ≥ `randolist[1][6]` = 25; the list builds `GenINFO[37]` @6525147, clicks @6742387 / @6919860 / @6920135.) Tier → colour follows the wiki's order; Yellow (tier 2) matches the screen, Blue's HP has its own formula (laser), Purple's
scales with `[2]`. No minion is needed for Pink: `CreateDmg` lets any colour land on it (Big Bone's Pure Hearted deals White, colour 6, @6581220); tier 5 HP refills while it is the active tier (@6592818).

## Unverified / unused

| i | Seen | Notes |
|---|---|---|
| 9 | `[]` | only created empty at game start (@20270433); no other direct read or write |
| 10 | `[0,0,0,0,0]` | only filled with five 0s at start (@20272648); no other direct read or write |
| 28 | player name | |
| 29, 43, 48, 49 | 0 | no direct `RealmStuff[i]` reference in the bundle |

Outside `RealmStuff`: `Energy`/`EnergyMAX` are not the Orb Tower's (that is `[26]`/cap above), and `ShrineLevels`/`ShrineCurrencyOwned`
are the outside-Realm shrines (Shrines tab), not the Realm Shrine.
