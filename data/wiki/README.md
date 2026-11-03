# Idle Skilling wiki dataset

Source: https://idle-skilling.fandom.com (MediaWiki API, api.php; wikitext via prop=revisions, categories via prop=categories).
Fetched: 2026-10-02. Pages: 201 (namespace:count 0:117 10:75 14:9; 0=main, 10=Template, 14=Category). Images list not fetched (file names are kept per row in `_images`).

Rebuild: `bun run wiki:fetch` (<=1 req/s, aborts on 429/403), then `bun run wiki:parse`.

Layout: `raw/<title>.wikitext` (ns10 prefixed `Template__`, ns14 `Category__`; "/" becomes "_"), `pages.json`, `datasets/`.

## Datasets (datasets/index.json has fields + source pages)
Wiki content is almost entirely wikitables, not infobox templates (the only infobox templates are unused Fandom boilerplate). So each dataset is the rows of all tables from one page family: pages in Category:Zone -> `zones`; "Foo/Bar" pages -> `foo`; otherwise one dataset per page. Every row has `_page`, `_section`, `_table` (index within page), optional `_caption`, `_images`, plus columns keyed by header.

| file | rows | source pages |
|---|---|---|
| templates.json | 41 | Template:* |
| pages_text.json | 117 | all ns0 |
| apothecary.json | 161 | Apothecary |
| arcade.json | 127 | Arcade |
| ascension.json | 18 | Ascension |
| asylum.json | 46 | Asylum |
| boosters.json | 15 | Boosters |
| botany.json | 77 | Botany |
| builds.json | 2 | Builds/Trekking |
| cards.json | 833 | Cards, Cards/Grasslands, Cards/Desert, ... (18 pages) |
| construction.json | 40 | Construction |
| contracts.json | 219 | Contracts |
| crafting.json | 1 | Crafting |
| crusades.json | 90 | Crusades, Crusades/Grasslands, Crusades/Desert, ... (7 pages) |
| crypt.json | 67 | Crypt |
| crystals.json | 16 | Crystals/Mining, Crystals/Apothecary |
| dairy_aisle.json | 11 | Dairy Aisle |
| events.json | 31 | Events |
| fight.json | 47 | Fight |
| fishing.json | 21 | Fishing |
| gem_shop.json | 69 | Gem Shop |
| hatchery.json | 88 | Hatchery |
| limbo.json | 1 | Limbo |
| lord_s_lair.json | 4 | Lord's Lair |
| mastery.json | 231 | Mastery |
| mining.json | 26 | Mining |
| perks.json | 79 | Perks |
| raids.json | 120 | Raids |
| realm.json | 352 | Realm |
| rebirth.json | 19 | Rebirth |
| research.json | 52 | Research |
| resources.json | 470 | Resources |
| secrets.json | 3 | Secrets |
| smithing.json | 124 | Smithing, Smithing/Novice, Smithing/Adept, ... (13 pages) |
| spelunking.json | 42 | Spelunking |
| spiriting.json | 24 | Spiriting |
| summoning.json | 30 | Summoning |
| tilling.json | 71 | Tilling |
| tinkering.json | 85 | Tinkering |
| train.json | 32 | Train |
| trekking.json | 237 | Trekking |
| zones.json | 1183 | Desert, Dungeon, Grasslands, ... (11 pages) |

Number rule: clean numerics (commas allowed, leading +/-) become numbers; when the number differs from the source text a `<col>_raw` sibling keeps the original (e.g. "+10"). Anything with %, units, k/m suffixes etc. stays a string. `pages_text.json` holds per-page sections (plain text) and template invocations ({template, params}) for ns0.

## Known gaps / caveats
- Parse failures: none. Header-less or multi-row-header tables get joined headers ("A / B") or `colN`; duplicate headers get `_2` suffix (e.g. zone tables: `Monsters` is an image column, monster name lands in `Monsters_2`).
- Smithing tables: the wiki header row is shifted vs data (column "Amt." actually holds the bonus value, "Bonus per Level" the stat name). Kept as published.
- Wide matrix pages (trekking, contracts, realm, crusades, resources) have hundreds of sparse fields; treat as grids, not records.
- Row/colspan are expanded by value copy; nested tables are flattened to text; mid-table header rows start a new table block.
- Prose is only in pages_text.json (plain text, not entity-structured). Redirects not enumerated. Navigation/banner rows (">>>") dropped; Header/* pages excluded from datasets.

## TiddlyWiki mirror (#13)
`bun run wiki:tw` converts the raw dump to tiddlers (`scripts/wiki/to-tiddlywiki.ts` -> `tiddlywiki/tiddlers/generated/`, gitignored)
and builds the single-file wiki `tiddlywiki/output/index.html` (open it in a browser). `bun run wiki:tw:serve` serves the
folder on http://127.0.0.1:8087 instead. Hand-made tiddlers (theme, procedures, view templates, tools) live in
`tiddlywiki/tiddlers/system/`. Text is CC BY-SA 3.0 from the Fandom wiki; no images.
