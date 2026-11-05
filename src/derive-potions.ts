// Potion overview: the game's potion list joined with the save's levels and bonus text written from the game's own code
// (web/src/potion-formulas.ts; CORRECTIONS below for potions that don't scale linearly). No third-party guide text.
// Index i = game name PotionsNames[i] = save PotionLV[i] = potion id i+1.
// Output data/game/potions.json (local only). Usage: bun src/derive-potions.ts
import { readFileSync, writeFileSync } from "fs";
import { DERIVED, fingerprint } from "./card-fingerprint";
import { POTION_FORMULAS, potionGroup } from "../web/src/modules/potions/potion-formulas";

const save = JSON.parse(readFileSync("data/save.json", "utf8")) as Record<string, any>;
const names = JSON.parse(readFileSync("data/game/lists.json", "utf8"))["SceneEvents_38.PotionsNames"] as (string | null)[];
const title = (s: string | null | undefined) => (s ?? "").toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const levels = save.PotionLV as number[];

// Text for potions that don't scale linearly (or have no formula), by potion id. From the Pbonus block
// (Qno2x.js @25947870) and each potion's tooltip draw code (@25250406-@25947870); web/src/potion-formulas.ts has the
// formulas and potion-formulas.test.ts checks them against both. L = potion level, C = L/(L+175).
const CORRECTIONS: Record<number, string> = {
  23: "+10% tilling exp, +1% tilling speed", // speed: 10·PotionLV[22]/1000 in tillingSpeedBoost (web/src/tilling.ts)
  33: "+1 plant pot speed upgrade cap per 3 levels, +1 base (doubles from level 502)",
  59: "+1 plant pot speed upgrade cap per 2 levels, +1 base (doubles from level 502)",
  ...Object.fromEntries(Array.from({ length: 15 }, (_, k) => [107 + k, "unused slot (no tooltip, no effect)"])),
  8: "-0.25% smithing cost (max 90%)",
  11: "-0.5% potion brewing cost (max 90%)",
  15: "+5% botany exp",
  29: "-0.5% smithing cost (max 95%)",
  30: "+2% double brew chance (max 200% at level 100)",
  34: "+12% crop gains",
  35: "+1500 base damage",
  36: "+4% crusade exp",
  41: "+30% botany exp",
  43: "-0.025% per-craft smithing cost increase (max 2.5%)",
  46: "+0.5% cash kept on ascending, +5% base (doubles from level 502)",
  53: "+0.45% tilling exp per tilling level",
  56: "-1% smithing cost (max 98%)",
  58: "+10% AP",
  62: "+100% botany exp",
  64: "-2% potion brewing cost (max 95%)",
  69: "-0.03% per-craft smithing cost increase (max 2.5%)",
  72: "+2% plant growth speed per Enigmatic Booster level (max 200%)",
  78: "+3% plant growth speed per botany level",
  79: "+1.2 spiriting luck upgrade cap (rounded down)",
  82: "-0.04% per-craft smithing cost increase (max 3%)",
  86: "-0.08% per-craft smithing cost increase (max 4.7%)",
  90: "+200·L/(L+200)% chance for a tunnels card",
  91: "-0.1% smithing cost per Blacksmith Pill, up to 25 pills (max 98%)",
  // PotionLV[91] is read only by Lab tank 27's text (@28303511): at tank value ≥ 70 (level ≥ 535) with level ≥ 1 it grants pet #83 "bob" (@27664510).
  92: "no stat; at level 1+ unlocks the Bob pet once Lab tank 27 reaches level 535",
  // CardBonusTOTAL = 1 + min(0.015·T·L^0.85, 3.5·T), T = min(1 + tank 42 level/1000, 2) (@22249268); the tooltip says +1%/level.
  94: "+1.5·L^0.85% card bonus (max 350%), ×1-2 by Lab tank 42",
  95: "+2% potion bonus (multiplies most potion bonuses)",
  96: "levels up every red, orange and yellow potion each time it levels up",
  97: "Oberon Obliterator kill boost raised to a power (grows with smith item 76)",
  98: "70·L/(50+L)% chance a STR level-up keeps its EXP req",
  99: "+1.5 max cauldron speed upgrade levels",
  100: "70·L/(50+L)% chance an Apothecary level-up keeps its EXP req",
  101: "+2% Trekking vessel gain",
  102: "70·L/(50+L)% chance an H2O level-up keeps its EXP req",
  103: "+3% RP gain for all tanks",
  104: "levels up every green, cyan and purple potion each time it levels up",
  105: "+5·L/(50+L)% chain level chance",
  106: "levels up every demon and godly potion once each time it levels up",
  ...Object.fromEntries(Array.from({ length: 15 }, (_, k) => [107 + k, "unused slot (no tooltip, no effect)"])),
  122: "+800·C% new-flower chance after a failed discovery (highest plant only)",
  123: "240·C% chance a Fishing level-up raises all 3 power upgrades",
  124: "×(1 + 1.7·C) tilling exp per new crop type",
  125: "+50·C% spelunking exp per power of 10 gold skulls",
  126: "+150·C% new-pet hatch chance per (Hatchery level^0.82 / 25)",
  127: "+75·C% permanent cash per 10 raid tickets collected",
  128: "+250·C% damage per treasure with 1M+ owned; ×(1 + 1.7·C) per skull",
  129: "×(1 + 2.5·C) mastery perks a, c, f, n",
  130: "240·C% chance a Mining level-up raises all six miners",
  131: "+275·C% exp for all 3 pet skills",
  132: "×(1 + 2.5·C, max 3) eggshell chain value",
  133: "×(1 + 0.45·C) cash, applied once per FarthestMonster^0.6",
  134: "+250·C% spelunk learning rate",
  135: "+75·C% permanent damage per 10 asylum keys collected",
  136: "+250·C% spelunker speed per 10 spelunking levels",
  137: "Pro Rift bonus upgrade cap 30 + 100·C (max 100)",
  138: "240·C% chance a Tilling level-up raises all six tillers",
  139: "×(1 + 2.5·C) mastery perks b, g, h, i, j, D",
  140: "dig-down after a tunnel end grows by (depth ratio / 2)^(0.45 + 0.33·C)",
  141: "240·C% chance a Botany level-up raises all pots",
  142: "×(1.021 + 0.045·C) machine speed per Construction level",
  143: "+65.6·C% pet damage per 25% team HP missing",
  144: "10 + 75·C% Crackin Yolk eggshell chain chance (max 40%)",
  145: "smithing cost rises at least 2.5 − 1.52·C% per craft",
  146: "-70·C% brewing crop cost per power of 10 Saharan Foals (max 40%)",
  147: "60·C% chance a rift level-up also levels the rift to its left (max 40%)",
  148: "+110·C% spelunk treasure per 10 spelunking levels",
  149: "+300·C% crusade materials per crusade level above 160; +3250·C% crusade exp",
  150: "+100·C% extra levels when a spelunker absorbs",
  151: "learn traits level up by 9 + ⌈6.5·C⌉ per absorb (max 15)",
  152: "240·C% chance an Apothecary level-up raises all cauldrons",
  153: "+200·C% tunnel card chance",
  154: "250·C% chance a nest upgrade levels twice (max 200%)",
  155: "+80·C% chance to hatch a 2-gene pet (max 60%); +50·C% for 3 genes (max 40%)",
  156: "-35·C% tank level-up reqs per power of 10 green vessels (max 34%)",
  157: "+40·C% ores and fish per 50 arcade balls launched",
  158: "×(1 + 3.5·C, max 4) damage, applied once per H2O level^0.34",
  159: "+45·C perk tree upgrade cap (max 35)",
  160: "×(1 + 1.15·C, max 2) flower gain per certified fish",
  161: "×(1 + 0.85·C) brew speed per certified flower",
  162: "×(1 + 1.9·C) crop gain per certified ore",
  163: "×(1 + 0.49·C) spelunk speed per certified crop",
  164: "×(1.05 + 0.13·C, max 1.162) Doom Gauntlet per final-crusade difficulty level",
  165: "×(1 + 1.2·C, max 2) ores",
  166: "ore, fish, botany, potion, crusade and limbo card bonuses ^(1 + 1.25·C, max 2)",
  167: "cash, kills, tunnels and damage card bonuses ^(1 + 1.25·C, max 2)",
  168: "Badonkadonk (#157) boost ^(1 + 1.25·C, max 2)",
  169: "at level 1+, Forewordi (#133) also applies +1 time per 5 aberrant monsters",
};

// Per-level text for linear potions: the formula's template filled with its value at level 1.
const num = (v: number) => String(+v.toPrecision(4));
const linear = (id: number) => {
  const f = POTION_FORMULAS[id];
  if (!f) return null;
  const a = f.v(1);
  return [2, 10, 100].every((n) => Math.abs(f.v(n) - n * a) < 1e-9 * Math.max(1, n * a)) ? f.t.replace("{}", num(a)) : null;
};
const potions = names.map((n, i) => {
  const id = i + 1, grp = potionGroup(id);
  return {
    id, name: title(n), level: levels[i] ?? 0, discovered: (levels[i] ?? 0) > 0,
    bonus: CORRECTIONS[id] ?? linear(id),
    group: grp.length > 1 ? grp.map((j) => `${title(names[j - 1])} [#${j}]`).join(", ") : null,
  };
}).filter((p) => p.name);
const missing = potions.filter((p) => p.bonus == null).map((p) => p.id);
if (missing.length) throw new Error(`potions with no bonus text: ${missing.join(", ")}`);

writeFileSync("data/game/potions.json", JSON.stringify({ fingerprint: fingerprint(save, DERIVED["game/potions.json"]!.fields), nextDiscovery: save.NewPotionID, potions }));
// Static app data: names, bonus text and stacking groups (save-independent).
writeFileSync("web/src/data/potion-catalog.json", JSON.stringify(potions.map(({ id, name, bonus, group }) => ({ id, name, bonus, group }))));
console.log(`data/game/potions.json: ${potions.length} potions, ${potions.filter((p) => p.discovered).length} discovered; bonus text from game formulas`);
