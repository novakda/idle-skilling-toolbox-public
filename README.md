# idle-skilling-toolbox

Tooling + (planned) webapp for **Idle Skilling** (Steam), in the spirit of Idleon Efficiency / Idleon Toolbox.

An unofficial fan tool, not affiliated with or endorsed by the game's developer. Your save is read in your
browser and never uploaded. Licence: MIT for the project's code (see `LICENSE` and `NOTICE`).

## Credits

- **Idle Skilling** is made by Lavaflame2. Game formulas, tables and rules in this project were derived from the
  game; the game and its art belong to its developer. No game art is included or bundled.
- **Idle Skilling Wiki** (https://idle-skilling.fandom.com), Fandom contributors: `data/wiki/` and perk effect
  text (see `NOTICE`, CC BY-SA 3.0).
- Community guide sheets (Kyromyr's Idle Skilling Notes, the Idle Skilling Infodoc by SGResponse, the
  "IdleSkilling recommended Decks" sheet and others) were used to cross-check values during development. The sheets
  are **not** included, and nothing in the app is copied from them.
- The wiki fetcher's User-Agent has a placeholder contact ("contact: see README"); put your own in before running
  `bun run wiki:fetch`.

## Private data not included

`data/save.json`, save fixtures, `data/game/` (extracted game code and derived files), `data/captures/` and
`data/guides/` are not part of this copy. Tests that need them are skipped automatically (`test-preload.ts`); the
`derive` / `extract` scripts need them and a local game install.

## Save extraction

The Steam build is an Electron app. The save lives in Chromium localStorage
(`%APPDATA%\idle-skilling\Local Storage\leveldb`), key `…index.html:mySave`, as a
**Haxe-serialized** string. `src/extract.ts` snapshots the LevelDB (the running game holds
`LOCK`), reads the key, and unserializes it to JSON.

```bash
bun run extract                 # → data/save.json
bun src/extract.ts --raw data/save.haxe --out data/save.json
IDLE_SKILLING_LEVELDB=<dir> bun run extract
```

Works while the game is running. `data/save.*` is gitignored (personal data).

## Wiki dataset

`data/wiki/` — content from idle-skilling.fandom.com via the MediaWiki API (`bun run wiki:fetch`, `bun run wiki:parse`).

## Save-key map (from the game code)

The game is Stencyl 4.0.2 / Haxe 4.0.2 compiled to one JS bundle inside `app.asar`. `src/code-map.ts`
groups every save key by the game script that reads/writes it (`getGameAttribute("…")`), naming scripts
from Stencyl's metadata: `ActorEvents_N` → actor type N+1 in `resources.mbs`; `SceneEvents_N` → the name
in `scene-N.mbs`.

```bash
bun run map:extract   # unpack app.asar into data/game/asar (gitignored), then map
bun run map           # → data/save-map.json (key names + shapes only)
```

Extracted game code stays in `data/game/` and is never committed.

## Game formulas, run for real

`src/game-eval.ts` compiles snippets of the game's own bundle against a mocked Stencyl engine, so tool
numbers come from the game's code rather than transcriptions of it. `bun run derive` builds the shrine
cost table (12 shrines × 60 levels) into `data/game/shrines.json` and refuses to write unless it
reproduces the cost stored in your save. The web app's **Shrines** tab reads it.

`bun src/derive-lists.ts` evaluates every static data list in the game (89 lists: `VT.*` data functions
plus constructor-built `this._List.splice(...)` arrays, keyed `Script.List`) into `data/game/lists.json`.

The dev server re-extracts the save on page load when it's over a minute old, and `extract` appends
shrine-currency snapshots to `data/history.json` (gitignored) whenever they change. That history is
the income rate behind the Shrines tab's "Next level in".

### Cards

`src/derive-cards.ts` runs the game's `CalculateCardBonusTotals` block (with every custom block it calls,
compiled on demand) and refuses to write unless it reproduces all 101 `Cbonus*` values in the save.
Decks are 10 slots (`CardEquipped[10·(d−1)+n]`); `DeckLinkList[d]` is the activity a deck is linked to,
read from each scene's init code. The **Cards** tab shows each deck's bonuses, same-bonus swaps, empty-slot
fills, and the collection with drop zones from the wiki. `bun run derive` rebuilds lists → shrines → cards.

## Live game access (CDP, read-only)

Launch with `--remote-debugging-port=9333` (desktop shortcut "Idle Skilling (debug)"). `src/live.ts`
finds the game iframe and takes one reference to the Stencyl engine: a one-shot breakpoint inside
`Engine.getGameAttribute` stores `window.__iskEngine`, then is removed and the game resumes. Reads go
through `getGameAttribute`; nothing is written. `bun src/live.ts --keys ShrineLevels,CardDeckSelected`

The dev server prefers live data: on page load it runs `src/live-save.ts` (all game attributes read live,
written as `data/save.json`) and falls back to `src/extract.ts` when the game isn't reachable (2 s timeout).
Derived files (`data/game/*.json`) still need `bun run derive` to pick up deck or level changes.

## Distribution constraint (the author, 2026-10-02)

Live game access (CDP, the debug-port shortcut, `src/live*.ts`) and anything that reads the local game install
(`data/game/`, the sandbox in `src/game-eval.ts`) are **development tools only**. A distributed build must work
**only from a save file the user loads** — no debug port, no game files.

Where the app stands today: the production build stands alone. Every tab is computed in the browser from the loaded
save (`web/src/save-load.ts` reads `is.bin`, Haxe or JSON) plus static tables shipped in `web/src/data/` (card and
potion catalogs, shrines, card sources, activity bonuses, screens, discovery). Game art (unless built with
`VITE_SHIP_GAME_ART=1`, below), the startup save fetch and income history (`history.json`) stay dev-only (`import.meta.env.DEV`).

Game icons (#36): a player can pick their own install's `resources/app.asar` under "Load game icons"; the browser
copies only the icon sheets out of it into IndexedDB (nothing is uploaded) and cuts icons from them
(`web/src/game-icons.ts`). Without any source, every icon falls back to the name, which is always shown.
Basis and rules: `docs/ux-direction.md`.

### Game art in the build (the author, 2026-10-11, #40)

`VITE_SHIP_GAME_ART` decides at build time whether the icon sheets ship. **Default `0`: no game art in the build**
(the behaviour above). Set it in the environment or in `web/.env`:

```
cd web && VITE_SHIP_GAME_ART=1 bunx vite build
```

With `1`, the build copies the ~160 sheets the app uses (about 1.1 MB, list in `web/src/icon-files.ts`) from
`data/game/asar/distBuild/static/game/assets/` into `dist/game-art/`, and icons work without the player loading their
install (a picked install still wins). The build fails if any sheet is missing locally. Default is `0` so a deploy only
carries game art when someone asks for it; flip it for a deploy that should.

Cloud saves lack values the game only keeps locally or computes at load:
- Away gain % (`nonActiveZoneGainPercent`) is ported (`web/src/away.ts`, matches the game on a real save). The one
  gap is a Realm fruit granting away gains, whose multipliers aren't ported; then the Potions tab asks for it.
- Deck links (`DeckLinkList`) never reach the cloud, so the Cards tab has per-deck link pickers.
- Brew speed boost (`PotionBrewSpeedBOOST[1]`) is entered on the Potions tab. Formula (potions scene init; reproduces
  7.2476 on a real save): `max((1+PbonusPotionSpeed/100)(1+EbonusThree[14]/100)(1+CbonusBrewSpeed/100)·MasteryBonuses[18]
  ·(1+(12·TrainingPerkLevels[6]+25·TrainingPerkLevels[10])/100)(1+SkillLevels[56]/10)(1+8·AscentionLevel[59]/100)
  ·TankBonusLIST[22]·(1+(0.4·SkillLevels[66])^0.6·ApothecaryLV/375), 1)`. Not ported because four inputs are themselves
  load-time values absent from cloud saves: `PbonusPotionSpeed` = 5·PotionLV[24] (easy), `EbonusThree[14]` (writer
  not located), `MasteryBonuses[18]` (2 s periodic loop over 200 mastery tasks), `TankBonusLIST[22]` (Realm lab tanks).
