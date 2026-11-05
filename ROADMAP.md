# Roadmap

Where the toolbox is going, as of 2026-11-03. Issue numbers (#NN) refer to the project's tracker; the history of what was built
and when lives in the tracker's Roadmap issue (#12) and the git log.

## What the toolbox is for

Load your save; see what to do next and why, across the systems that gate progress; one click to the detail behind each
suggestion. It replaces jumping between the wiki, community sheets and several tools with one place computed from your own
save. It is also a lab for dashboards, data-driven views and ways of organizing dense information, and the baseline for
building the same app in other stacks to compare them (see README).

## Where it stands

It grew fast: 37 pages in 15 groups, about 31k lines and 580 commits in its first month. Coverage became the goal; only 14 pages
feed Do Next, and cross-system math lives in several places. A dependency map built from the game's own code (28 systems,
441 connections) showed what matters most and how the systems feed each other. The plan below follows from it (#62).

## Done: modular refactor (#62, 2026-11-03 to 11-04)

The feature freeze is over. The layering is in, and a boundary test (`web/src/deps.test.ts`) fails on any new
cross-module import or any import cycle.
The module graph is acyclic: the five bonus producers (mastery-bonuses, equipment-bonuses, pet-lab, potion-bonuses,
ascend-rewards) are their own layer under the bus. Each system's logic, tests and page live in `web/src/modules/<sys>/`
(moved with `scripts/move-module.ts`); the layers (core, producers, bus, combat and away engines, views, Do Next, Totals)
stay at the top of `web/src`.

| Step | What | Issue | Status |
|---|---|---|---|
| 0 | Boundary test: module map, allowlist of today's cross-module imports that only shrinks | #63 | done |
| 1 | Move misplaced helpers (card zone levels, potion level costs, smithing currencies, name lists, animation timing) | #64 | done |
| 2 | Pets ↔ pet-combat file cycle | #65 | folded into step 10 |
| 3 | Split `load-bonuses.ts` into one producer per system; one `vendingBonus` | #66 | done |
| 4 | `bus.ts`: decoded state, then computed bonuses, memoised per save; move the 26 importers over | #67 | done |
| 5 | Split cards into the bonus producer and the planner | #68 | done |
| 6 | Fight simulator out of `raids.ts` into a combat engine | #69 | done |
| 7 | Split `away.ts` into the away engine and per-system gains | #70 | done |
| 7a | Take `backup-guide.ts` out of core (all of core's imports of other modules come from it) | #74 | done |
| 7b | Pages into their own layer, so a page's imports stop tying its logic module into the cycle | #75 | done |
| 8 | Do Next becomes a registry: each module exports its own next actions | #71 | done |
| 9 | Planners and reference views into their own layer | #72 | done |
| 10 | One folder per module (`state`, `bonuses`, `rates`, `next` + page), smallest first | #73 | done |

Target layering, bottom to top: core → state + bonus producers → bus → engines (combat, away) → system modules → views
(Do Next, Totals, planners, reference) → pages.

## Now: focus on the MVP

- **MVP systems (the hubs):** Fighting, Cards, Smithing, Training, Potions, Ascend. Full modules with Do Next actions; they carry
  most of the game's cross-system influence, so getting them right makes every other suggestion right.
- **Reference group:** the other pages move to a Reference section of the navigation. They stay, without new features, until a
  planning question needs one.
- **First-visit and trust (from studying other community tools):**
  - Each tab explains itself and shows its main panel on a bundled sample save, labelled Example, when no save is loaded (#57).
  - Always-visible status: app version, the game version the formulas were checked against, and which save is loaded (#58).
  - Patch notes on the home page, each entry linking to the tab it changed (#59).
- **Open feature ideas:** "you can afford this now" alerts (#55), cost to max per currency (#54), rate and
  time-to-next wherever a page shows only a cost (#56), the remaining page gaps (#48), a rebirth verdict from the previous
  cycle's curve (#20).

## Later

- **Game systems diagram** (#61): the dependency map as a readable diagram, possibly an interactive page.
- **Give back to the wiki** (#60): code-verified corrections, with evidence, for the Idle Skilling Wiki's editors.
- **Computational wiki** (#13): a wiki whose tables are computed from one record per thing.
- **Rosetta Stone study:** the same app, or a slice of it, in other stacks (React, Tauri, WebAssembly, and possibly ServiceNow or
  Power Platform), using the game's own formulas so the comparison isolates implementation.
- **Learning:** use the toolbox's simulations as material for statistics and linear algebra (Monte Carlo, optimization).

## Not planned

- Anything that needs the game's art, code, or a running game: the public build works only from a save file the player loads.
- Content from community guide sheets without their authors' permission.
