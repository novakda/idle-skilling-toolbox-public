# Trekking loadouts (#2756)

Offsets are bytes in `data/game/asar/distBuild/static/game/Qno2x.js` (pet scene SceneEvents_43 unless noted). **†** = read in game code.
Trek combat, vessels and distance are already in `docs/pets.md` §5-6; this covers loadouts and the four focuses.
Port: `web/src/trek-loadouts.ts`; tab: Pets → Trek loadouts; tests: `web/src/trek-loadouts.test.ts`.

## What a loadout is
- A saved trek team, like a card deck. `LoadoutArray[k + 8·(L−1)]` = inventory slot at loadout L's k-th place (L 1-4,
  k 1-8 → positions 1-6, 19, 20 = 4 fighters, 4 supports), `LoadoutSelected` = the active one †. The save loader reads
  `LoadoutArray0..32` (`w.get("LoadoutArray"+fS)` @20398219), so 4 loadouts.
- Placing a pet writes it into the selected loadout too (`LoadoutArray[aa7 + 8·(LoadoutSelected−1)]`, aa7 19/20 → 7/8, @4446659) †, so the
  selected loadout always mirrors the team, as an edited deck does.
- Selecting loadout L (4 button handlers @27492677, @27496504, @27500331, @27504158): the previous loadout's trekking pets go
  back to idle, then each of L's pets is placed **only if its `PetStatus` is 0 (idle)** †. A nest parent or capsule pet in a
  loadout is skipped. Clicking also resets calibration (`CountdownR = 15.5`). Trashing a pet zeroes its loadout entries (@4452646) †.
- Limits: the open trek slots (Trekking Lv / slot pack, `TREK_SLOTS` in `pets.ts` †) and one pet per species (the author, in game).
  Genes count from all 8 positions (`petGenes`), attack genes fire from fighters only.
- No set bonus: unlike a card set, nothing reads `LoadoutArray` for a stat (its 46 uses are load/save, placement, selection and trash) †; a loadout's effect is its pets' genes and levels.

## The four focuses (per-kill payout × kills/min)
Every kill while `PetHP > 0` (kill handler @27284246):
| Focus | Per kill | Team-dependent part | Where |
|---|---|---|---|
| Fight | — (kills/min) | levels, attack genes, Enthusiasm, … (`simulateTrek`) | docs/pets.md §5 |
| Loot | vessels = base(id)·(1 + PVT[15]/100)·_VesselMULTI | Loot gene, × Discovery combo | @27287534 † |
| EXP | Trekking EXP = (id + ⌊id/10⌋² + ⌊id/8⌋)·1.08^⌊id/5⌋ · (1 + PVT[20]/100) · TankBonusLIST[25] · MasteryBonuses[11] · (1 + 200·P/(P+175)/100), P = PotionLV[130] | Trekkery gene (PVT[20] = 20·G20·(1 + tier·TrekkingLV/100)) | @27289245 † |
| Travel | distance = (1 + PVT[14])·(1 + PVT[13])·(1 + tier(G20)·TrekkingLV/100)·account terms | Incubation combo tier (PVT[14]), Swiftness (PVT[13]), Trekkery tier | @27287121 †, **frontier monster only** |

Loot, EXP and fight are scored on the selected monster; travel on the frontier (`PetDistanceLV`), the only monster that pays distance.
The EXP statement is checked against the game's own code in the sandbox (`trek-loadouts.test.ts`), with a fingerprint that fails
if it moves or changes shape. No `derive-*.ts`: nothing here is a static table; every input is in the save.

## Optimizer
`bestTeam` (`pet-combat.ts`, shared with Pets → Trekking "Find best team"): brute-force one role's open slots with the other role
fixed, alternate until stable, from the current team and each saved loadout; pool = idle + trekking pets, best level per
species + gene set, unknown (-1) genes out. A second search with nest parents allowed reports a nest pet that would beat it
(not placed: the loadout would skip it). "What would improve it next": the focus payout with one more of each relevant gene,
kills/min held fixed, and whether an owned pet could supply it.

Inferred / not verified: the search is a local optimum (alternating roles); sims are expected values (gaps < ~5% are ties);
`MasteryBonuses[11]` is read through `current()` (model when stale), like the distance formula.
