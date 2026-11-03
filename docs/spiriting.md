# Spiriting

How the Limbo cultists and acolytes make souls, as the Spiriting page (`web/src/spiriting.ts`) models it. Code offsets are
Qno2x.js (†); the wiki is `data/wiki/raw/Spiriting.wikitext`.

## Mechanics

- **Cultists work one colour.** Each cultist farms fragments of its task colour (up to Blue). A full set (12 Red, 15 Orange,
  19 Yellow, 19 Green, 20 Blue, 21 Purple, 21 White) transmutes into one fragment of the next colour. That chain is the only
  source of Purple and White fragments (wiki; `soulRates`, `frags[k+1] += done[k]`, away block @21259174 †).
- **Acolytes work two adjacent colours.** Each acolyte on colour t adds to the conversion chance and the souls per conversion of
  colour t **and** t + 1; acolytes' chances add up (wiki; `conversion`, @15138095 / @15141040 †).
- **Cap only on screen.** The wiki says the acolyte success rate caps at 100%. The on-screen roll does (@21476030 †); the away
  credit does not, so away gains can exceed what the screen shows.
- **Away credit is away time × the away gain %** (`nonActiveZoneGainPercent`, @22600245 †; 30.5% on the author's save 2026-10-11).

## In-game check (2026-10-11)

Baseline at 17:55 (`data/captures/spirit-check-20261011.json`), credit landed on opening Spiriting ~0.75 h later. Orange gained
404.1M and Yellow 21.3M, both exactly 0.389× the per-credit-second model. Same ratio for both colours, so the uncapped away
formula holds; the factor is the away gain (0.389 vs 0.305 fits ~57 min since actually leaving the screen). The page now shows
real hours away.

## What the setup optimiser does

It ranks setups by Σ 1/(hours until each unaffordable rift upgrade is affordable). Gaps that close in minutes dominate, so the
answer is a sequence, not a permanent setup: on 2026-10-11 it was all Red (~10 min, Water and Power), then Blue cultists +
Purple acolytes (~1 h, the White gaps), then Green (Health, Rift value). The page shows the first step and says to re-check.
