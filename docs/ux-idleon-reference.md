# Idleon Toolbox as UX reference (#40)

Reference: https://github.com/Morta1/IdleonToolbox, `main` at **9cf5771b** (2026-10-12 00:34 +0300, "Live-verify Sneaking,
Caverns, Rift and Atom Collider"), read-only clone in `~/projects/ref/IdleonToolbox`. Also skimmed, **unmerged**:
`feat/settings-page-and-date-preferences` (06e9656f, 2026-04-08) and `feat/dashboard-alert-settings` (28ce1ec8, 2026-10-08;
mostly already on main).

Their repo is **GPL-3.0**. It is a design reference only: nothing here is copied (code, CSS, components, images or text).
Patterns are described in our words and rebuilt in Vue 3 + plain CSS. Their stack is Next.js + MUI + emotion, dark only.

Builds on docs/ux-direction.md (#33). Decisions: **adopt** (take as is), **adapt** (take the idea, fit our rules),
**reject**. ⚠ = conflicted with a standing decision; the author decided all six on 2026-10-11 (bottom of this file).

## Patterns

| # | Pattern | Where (their repo) | Decision | Why |
|---|---|---|---|---|
| 1 | App shell: top bar (logo, section links, quick search, account) + permanent left drawer ≥1200px, slide-in drawer behind a menu button below | `components/common/NavBar/index.jsx`, `NavBar/AppDrawer/index.jsx` | adopt (done) | Our sidebar + narrow-screen menu (ux-direction 1) already matches; no top bar needed for a single-section app. |
| 2 | Drawer nav: collapsible world groups, 32px icon + name per page, selected item tinted | `NavBar/AppDrawer/AccountDrawer.jsx`, `components/constants.jsx` (`PAGES`) | adopt (done, the author 2026-10-11) | One icon per sidebar item from the game thing that stands for the page (`NAV_ICONS`), label kept; no icon → label only. Our icons come from the player's install or the shipped art. |
| 3 | Quick search: Ctrl+K dialog over every page and tab, keyboard selection | `components/common/QuickSearch.jsx` | adapt (later) | Our sidebar filter covers it; a keyboard shortcut to focus the filter is the cheap part worth taking. |
| 4 | Page title: one 24px/600 h1 per page from a central table | `components/common/PageTitle.jsx` | adopt (done) | Our `.page-head` title. |
| 5 | Key numbers as small titled cards in a wrapping row under the title (muted 14px label, value under it) | `components/common/styles.jsx` `CardTitleAndValue`; `pages/account/world-4/breeding.jsx` | adopt (done) | Our flat `.tiles` (≤4). |
| 6 | Key number with an info icon that opens its breakdown | `components/common/Breakdown/CardWithBreakdown.jsx` (moved to common 2026-10-11) | adapt | Good: the number stays clean, the "why" is one click away. Ours: `<details>` "How it's worked out" (no drawer, no animation). |
| 7 | Breakdown drawer (redesigned 2026-10-10/11): right-side panel (bottom sheet on phones), total at top, search box, groups show their own total, lines sorted by size, zero sources dimmed behind a toggle, expand/collapse all, copy as text/image, pin sources | `components/common/Breakdown/Breakdown.tsx`, `breakdownView.ts`, `parsers/breakdown.ts` | adapt (later, the author 2026-10-11) | Inline `<details>` now. Follow-up: a static side panel (no animation) using the same model (tree of lines with a unit, groups that say how they combine, totals that add up). |
| 8 | Breakdown group naming rule: a group keeps a name only if it is the game's own name; otherwise "Group 1, 2…" | commit 424b72ea, `breakdownView.ts` | adopt | Same honesty rule as our "†/unverified": never invent game names. |
| 9 | Sub-tabs inside a page (Breeding → Pets / Territory / Upgrades / Arena; Pets → Shiny / Breedability / All), selected tab in the URL, strip scrolls sideways when tabs outgrow it | `components/common/Tabber.jsx`, `pages/account/world-4/breeding.jsx`, `Breeding/Pets/Pets.jsx` | adapt (Pets pilot) | Long pages become one area at a time. Ours: flat tab strip, `?section=`, no transitions. The "do this next" plan stays above the tabs. |
| 10 | Cards over tables: ~169 component files use cards, ~12 use tables; responsive card grid (min 18rem) | `components/common/AutoGrid.jsx`, `Breeding/Pets/Other.jsx` | reject (the author 2026-10-11) | Tables stay; a card grid only where items are never compared side by side. |
| 11 | Shared upgrade card (2026-10-11): fixed-size icon box, bold title + muted subtitle, body2 text, cost footer pinned under a divider so footers line up across a row | `components/common/UpgradeCard.jsx` (`CardHeader`, `CardIcon`, `IconValueRow`, `LabelValue`, `Muted`); used by Hole, Compass/Tesseract/Grimoire (`Misc/class-specific/MasterclassUpgradeCard.jsx`), Breeding upgrades | adapt | Card itself rejected (#10), but two parts carry over: the section header (bold title + muted subtitle on one line) and "bold label: value on one line" facts. Both used in the Pets pilot. |
| 12 | Meals / Kitchens cards (2026-10-11): one shared header, label/value on one line, removed hover tooltips that repeated what the card already showed, "Ready" instead of a frozen 00:00:00 | `components/account/Worlds/World4/Meals.jsx`, `Kitchens.jsx`, `components/common/MealIcon.jsx` | adopt (principles) | No duplicate hover copies; show a word when a number would mislead. |
| 13 | Tooltips: rich hover popovers (max 320px, tap delay on touch) for gene abilities, card effects, totals | `components/Tooltip.jsx`, `components/common/styles.jsx` | adapt | Their newest commits move info *out* of hovers into the card or the drawer. Ours: hover `title` for extras only; anything needed to decide stays visible. |
| 14 | Icons paired with names: often icon only + name in a tooltip (pet grid shows sprite + "Lv. 3", no name; dashboard alerts are icon tiles) | `Breeding/Pets/All.jsx`, `components/dashboard/Account.jsx` | reject (the author 2026-10-11) | Icons always beside their name on pages (ux-direction 5). Our `Icon.vue` keeps that. |
| 15 | Fallback when there is no icon: a letter badge | `components/dashboard/settings/LetterBadge.jsx` (also on the alerts branch) | reject | Our fallback is the name alone, which is already there. |
| 16 | Theme: dark only, background #141A21, panels #1C252E, 8px radius, blue accent (#2087e8, selected nav #99ccff), MUI default status colours, no text-transform | `styles/theme/darkTheme.js`, `styles/globals.css` | adopt (done, the author 2026-10-11) | Dark only, blue-grey surfaces, blue accent; our own values (picked by eye, AA-checked) in `web/src/style.css`. Status colours kept. |
| 17 | Status colour on state, not verdict: green border = being bred, red border = maxed; opacity .5–.6 for locked/unowned | `Breeding/Pets/Other.jsx`, `UpgradeCard.jsx` (`dimmed`) | adapt (the author 2026-10-11) | Dimming locked rows: adopt (we mute `tr.locked`). Colour for state: reject, colour is for verdicts only. |
| 18 | Density: 14px body2 text, 16px card padding, 8–16px gaps, 32px toggles, h1 24px | `darkTheme.js`, `UpgradeCard.jsx` | adopt | Same band as our medium density (14–15px text, 13px tables). |
| 19 | Per-list options persisted per viewer (Show all, Order by time, Apply threshold, Group by stat, filter by stat) in an "Options" box above the list | `Breeding/Pets/Other.jsx`, `components/common/useCheckbox.jsx` | adapt (later) | Useful for long lists; persist in localStorage as a convenience. Not in the pilot (behaviour unchanged). |
| 20 | Empty states that say why: "All X completed" + how to see them again | `components/common/EmptyState.jsx` | adopt | Pilot: "None." → "No safe trash candidate." |
| 21 | "What to do next": dashboard of alerts, one row per area (muted area label left, icon tiles right), each alert linking to the setting that controls it | `components/dashboard/Account.jsx`, `utility/dashboard/*` | adapt | Our Do next page: keep a grouped list with names, not icon tiles (#14). |
| 22 | Alert settings: dependent options indented under their parent (2026-10-10), "Edited" tag on values changed from default, one-line help with More | `components/dashboard/settings/OptionRow.jsx`, `TrackerCard.jsx`, `utility/dashboard/settingsModel.js` | adopt (when we have settings) | Clear and cheap. |
| 23 | Settings page (**unmerged**, feat/settings-page-and-date-preferences): section header (icon + title + one-line description), rows with label and description left, control right, stacking on phones; date/time format preference | `pages/settings.jsx` on that branch | adapt (later) | Fits About / load-save controls if they grow. |
| 24 | Buttons named by their exact effect: "Track my greenstacks" vs "Track missing greenstacks" replaced one ambiguous button (2026-10-11) | `pages/tools/material-tracker.jsx` (73e0e393) | adopt | Copy rule for our buttons. |
| 25 | Live countdown timers | `components/common/Timer` | reject | The save is a snapshot; a ticking clock implies live data. Static durations. |
| 26 | Mobile: tab strip scrolls when ≥4 tabs on medium screens, breakdown becomes a bottom sheet, 44px touch targets on phones | `Tabber.jsx`, `Breakdown.tsx`, `OptionRow.jsx` | adopt | Pilot: scrolling tab strip, 44px tabs and summaries ≤600px. |
| 27 | Number notation (1.2M / 3.4B style) | `utility/helpers` `notateNumber` | adapt (later) | Easier to read than our `1.23e+9`; a display-wide change, so its own issue. |
| 28 | Ads, Ko-fi, cookie banner, profile banner, page pins/favourites | `NavBar/index.jsx`, `common/favorites` | reject | Not relevant to a personal analysis tool. |

## Conflicts with docs/ux-direction.md: the author's decisions (2026-10-11)

1. **Theme (#16):** adopt their look, dark only, blue-grey, blue accent. Done app-wide (`web/src/style.css`).
2. **Cards vs lists (#10, #11):** tables stay; card grids only where items are never compared side by side.
3. **Icons (#14, #2):** always with their name on pages; plus an icon on each sidebar item (done), label kept.
4. **Game art:** may ship, behind `VITE_SHIP_GAME_ART` at build time, default `0` (README "Game art in the build").
5. **State colour (#17):** verdicts only; locked rows dimmed.
6. **Breakdowns (#7):** inline collapsed blocks now; a static side panel is a follow-up, not built.

## Pilot: Pets page

Applied (adopt/adapt rows only, no conflict touched): section tabs Hatchery / Trekking / Research / All pets with `?section=`
(#9, #26); section headers with a muted subtitle (#11); "label value" facts rows replacing the long `·`-joined lines (#11);
formula and source notes moved into collapsed "How … is worked out" / "Sources" blocks, with a one-line caveat kept beside each
estimate (#6, #13); pet icons with names in the plan's trash list (#14 as ours); empty state wording (#20). The plan and
warnings stay above the tabs. Data and calculations unchanged (`pets.ts` untouched). Shared CSS in `web/src/style.css` so
the next pages can reuse `.subtabs`, `.sec-head`, `.facts`, `details.how`.
