# UX direction (#33)

From the author's reactions, 2026-10-09. Model: **ServiceNow lists, forms and dashboards for functional UX. The app hints at the game; it
does not adopt its look** (the author, 2026-10-09). The bar for polish is Idleon Toolbox (liked: consistent with community tools, well maintained). The
Factorio calculator was liked for its icons and for feeling like an app, not a wiki. GOV.UK was a no (built for reading,
this app is for analysis); lichess a no (contrast).

## Keep
- ~~Follow the OS for light/dark (as now). The warm neutral palette and the single green accent stay.~~ Superseded
  2026-10-11 (#40): **dark only**, blue-grey surfaces, one blue accent, after Idleon Toolbox's look; tokens in
  `web/src/style.css`, every text colour WCAG AA on its surface. Status green / amber / red stay.
- Medium density (as now).

## Change
1. **Left sidebar, grouped**, with a filter box on top (ServiceNow's filter navigator). Proposed groups:
   - Overview: Do next, AFK
   - Progress: Ascend, Perks, Realm, Contracts, Gems
   - Skills: Gathering, Fishing, Botany, Potions
   - Cards: Cards, By bonus, Builds, Shrines
   - Combat: Raids, Pets
   - About
   On narrow screens it collapses to a menu button. The save status and the load-save control move into the sidebar footer.
2. **Page = list/form pattern.** Each page opens with a header: title, one line on what it answers, and up to four key
   numbers (ServiceNow's dashboard tiles, kept flat). Then the "do this" item if there is one, then the tables.
3. **Tables like a ServiceNow list.** Sticky header row, numbers right-aligned in tabular figures, row hover, tight
   14px rows. Wide tables scroll inside their own box; the page never scrolls sideways.
4. **Status colour only where it means something:** green / amber / red for verdicts (win / close / no, trash, ready
   to prestige), muted everywhere else.
5. **Icons are functional, not decoration** (the author, 2026-10-09). Many game items, crops, monsters, skills, cards and
   potions appear in the game only as an icon, with no text, so the icon is how a player recognises them. The app
   shows that icon (16–24px) **always paired with its name**, because the game often never shows the name. Icons appear
   only where they identify a game thing; no themed backgrounds, frames, fonts or colours from the game.
   **Added 2026-10-11 (#40):** each sidebar item gets the icon of the game thing that stands for its page (map in
   `web/src/game-icons.ts` `NAV_ICONS`), label always kept; pages with no such thing show the label alone.

## Never
Frosted glass, glows or heavy shadows · hero banners or marketing copy · animations and transitions.

## Icons: where they come from (decided 2026-10-09; game-art line superseded 2026-10-11)
- **the author's local copy:** the game's own sprites from the local install (`data/game/asar/.../assets`), cut from the sheets
  the way `web/src/card-art.ts` already does for cards. Every icon has a text name beside it, so nothing depends on it.
- **Shared build (other players), superseded 2026-10-11 (#40):** game art may ship, behind the build setting
  `VITE_SHIP_GAME_ART` (default `0` = not shipped; `1` bundles the sheets from `data/game` into `game-art/`; README
  "Game art in the build"). With it off, the rule below still holds. Original 2026-10-09 rule: no game art ships. The player points the app at **their own** game install
  (a folder/file picker, like picking the save files), and icons are cut from that copy in the browser at load time.
  Nothing is redistributed. Without it, names only. Basis (2026-10-09 research): no licence or Lavaflame2 statement
  exists; Idleon Toolbox and the wiki ship sprites by tolerated practice only, and the wiki's CC BY-NC tag can't
  license art it doesn't own.

## Decisions on the Idleon Toolbox conflicts (the author, 2026-10-11, #40)
Answers to the six questions in docs/ux-idleon-reference.md:
1. Theme: Idleon Toolbox's look, dark only, blue-grey, blue accent (replaces OS light/dark + warm neutrals + green accent).
2. Layout: tables stay; a card grid only where items are never compared side by side.
3. Icons: always with their name on pages (unchanged); plus one icon per sidebar item, label kept.
4. Game art: may ship, behind `VITE_SHIP_GAME_ART` (default 0); off = icons from the player's own install.
5. State colour: verdicts only; locked rows dimmed (unchanged).
6. Breakdowns: inline collapsed `<details>` blocks now. **Follow-up:** a static side panel (no animation) for
   breakdowns longer than a paragraph; not built yet.

## Scope
CSS tokens in `web/src/style.css`, the nav in `App.vue`, one shared page-header and table style. No component library,
no framework change. One tab converted first (Pets) for review before the rest.

## Sequences (the author, 2026-10-11)
Where the answer is a series of moves rather than one, the page shows it as a numbered plan: each step's setup or action,
how long it takes, and what it buys or unlocks, with the total. Keep steps few and merge identical ones (each switch costs
the player clicks). Reference: the Spiriting page's "Plan, step by step" (dd025ac).

## Game menu → sidebar (the author, 2026-10-15: "In general we want the menu structure to match the game's")
The sidebar groups are the game's top-menu buttons, in the game's order. Offsets are bytes in `Qno2x.js`; scene numbers
are `kf.get().scenes.h[N]` (names from `assets/data/scene-N.mbs`); a button actor `ActorEvents_N` draws sprite N+1.

- **Two menu pages.** The circular-arrows button (ActorEvents_79 @15184269, ActorEvents_831 @15360254) flips
  `MenuSelectedToggle` 1 ↔ 2. Six slots, each actor shows one button per page (sprites 68/90/88/34/477/1473):

  | Slot (x) | Page 1 | Page 2 | Actor |
  |---|---|---|---|
  | 79 | TRAIN → Main, Attack Dojo, Strength Mountain, Endurance Fields | LIMBO → Spiriting, Rune Summon, Contracts | 67 @13225832 |
  | 149 | FIGHT → fighting (scene 9) | CRUSADE → crusade pages 10 / 8 / 6 | 89 @15745932 |
  | 219 | PERKS → skill trees (scene 1, `SkillTreeType`) | CARDS (scene 29) | 87 @15652800 |
  | 289 | CRAFT → Mining, Smithing, Fishing (scenes 5/6/7) | FARMING → Tilling, Farming, Potions (34/36/37) | 33 @8752283 |
  | 359 | PORTAL (scene 13) | PETS → Hatchery, Trek, Lab (44/43/45) | 476 @9298928 |
  | ~429 | TUNNELS → Spelunking / Construction (49/50) | REALM (scene 51) | 1472 @6382033 |

- **Sub-tabs** (the 3-4 skill buttons top right, ActorEvents_125 @4294950, sprite 126) per screen range: Train 1-4,
  Craft 5-8 (`SkillingArenaSelected`), Limbo 9-13 (`LimboArenaSelected` → scenes 27/28/30), Crusade 14
  (`ConquestPageSelected` 10 = crusades, 7/8 = tinkering, 5/6 = boosters), Farming 15-17 (Tilling, Potions, Farming),
  Pets 18-20 (Hatchery, Trek, Lab).
- **Portal** (SceneEvents_13 @19792671; buttons ActorEvents_472 @9283933, 604 @12405561): Raids (hell, scene 12), Asylum
  (39), Ascend (19 AP / 38 BP menus), Mastery (48, @19806960), secret rooms. Gift shop opens from the raid/asylum screens
  (ActorEvents_579: scenes 17/40); Heavy Cash is an Asylum shrine.
- **Codex** (scene 46) opens from the Pets screens (@27452589, @27735965; Lab @28974093).
- **Gem shop** (scene 21) has no menu-bar button, so Gems sits in the Overview group (#2586; was Toolbox). It opens from the gem-counter HUD
  button (ActorEvents_14 @6046775, click @6052151; bottom-left, shows `sparklecoin` and the starter-pack icon) on every
  screen, and as a deep link to one item from buy-with-gems buttons elsewhere (e.g. ActorEvents_1025 @2710271, SceneEvents_29
  @22590005, `MTXshopMenu`/`MTXbuyableSELECTED` set first). The Pets screens 18-20 open it on `MTXshopMenu` 8.
- The tutorial's "THERE_ARE_FOUR_DIFFERENT_SKILLING_ZONES" (@20663740) means the four TRAIN arenas: "THE_FIRST_ONE_HAS
  SKILLERS FOR EACH SKILL TYPE" (@20664979), "THE_OTHER_THREE_SPECIALIZE_IN_A_SINGLE_SKILL_TYPE" (@20666235).

Sidebar: Overview (Do next, AFK, Gems) · Train (Training) · Fight (Fighting, Bestiary: every monster, #2591) · **Craft** (Mining, Smithing, Fishing) ·
Portal (Raids, Asylum, Gift shop, Heavy Cash) · **Progression** (Ascend, AP/BP perks, Mastery, Skill trees: the Portal's
progression screens plus the PERKS button, #2586) · Tunnels (Spelunking, Construction) · Limbo (Spiriting, Summoning, Contracts, Rift) · Crusade
(Crusade, Tinkering) · Cards · Farming (Tilling, Potions, Botany) · Pets (Pets, Codex) · Realm · Toolbox (About). Trekking
lives on the Pets page (the game's Trek screen 20); the filter finds it there, not on Codex.
The old Gathering page is split into Mining and Smithing (same component, `skill` prop); `?tab=gathering` opens Mining.
