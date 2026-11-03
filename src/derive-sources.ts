// Where each card comes from, by running the dropped-card actor's own init (ActorEvents_875) for every
// fight zone × stage, boss × tickets, and crusade × stage. Output: data/game/card-sources.json (local only).
// Usage: bun src/derive-sources.ts
import { readFileSync, writeFileSync } from "fs";
import { compile, inert, loadBundle, matchBraces } from "./game-eval";

const src = loadBundle();
const reg = src.indexOf('x["scripts.ActorEvents_875"]=');
const initAt = src.indexOf("init:function(){", reg);
if (reg < 0 || initAt < 0) throw new Error("card drop actor not found — game update?");
const initSrc = matchBraces(src, initAt + "init:".length);

type Source =
  | { kind: "zone"; mode: number; stages: [number, number] }
  | { kind: "boss"; boss: string; tickets: number }
  | { kind: "crusade"; conquest: number; stages: [number, number] }
  | { kind: "skill"; skill: string; detail: string; chance: number | null; per: string };

/** Run init with the given game state; returns the card id it picks. */
function cardFor(state: Record<string, unknown>): number | undefined {
  const values: Record<string, unknown> = {};
  const actor = new Proxy({}, {
    get: (_t, p) =>
      p === "setValue" ? (_b: string, k: string, v: unknown) => { values[k] = v; }
      : p === "getValue" ? (_b: string, k: string) => values[k]
      : p === "getX" ? () => 0
      : inert,
  });
  const attrs = { IsPlayerAlive: 1, CardLevels: Array(800).fill(5), CardDropsPerDay: Array(30).fill(0), CardDropsPerDayMAX: 40, ...state };
  // Everything except `actor` (listener registration, wrapper, ...) is UI plumbing: inert.
  (compile(initSrc, attrs) as Function).call(new Proxy({}, { get: (_t, p) => (p === "actor" ? actor : p === "wrapper" ? { enabled: true } : inert) }));
  return values._IDcard as number | undefined;
}

const BOSSES = ["A", "B", "C", "D", "A2", "B2", "C2", "D2"];
const MODES = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15];
const sources = new Map<number, Source[]>();
const add = (id: number | undefined, s: Source) => { if (id) sources.set(id, [...(sources.get(id) ?? []), s]); };

// Zones: walk stages, collapsing runs of stages that give the same card into one range. The right arrow stops at stage 99,
// Oblivion (mode 15) at 269 (ActorEvents_253 @7631307).
for (const mode of MODES) {
  let run: { id: number; lo: number; hi: number } | null = null;
  for (let lv = 0; lv <= (mode === 15 ? 269 : 99); lv++) {
    const id = cardFor({ currentfightmode: mode, mapleLV: lv, CurrentlyViewedScreen: 0 })!;
    if (run && run.id === id) { run.hi = lv; continue; }
    if (run) add(run.id, { kind: "zone", mode, stages: [run.lo, run.hi] });
    run = { id, lo: lv, hi: lv };
  }
  if (run) add(run.id, { kind: "zone", mode, stages: [run.lo, run.hi] });
}
// Bosses: the ticket counts the code checks (1/3/10 for the first set, 1/3/14/45 for the second).
for (const boss of BOSSES)
  for (const tickets of [1, 3, 10, 14, 45]) {
    const id = cardFor({ [`Boss${boss}isActive`]: 1, TicketsToSpend: tickets });
    if (id) add(id, { kind: "boss", boss, tickets });
  }
// Crusades: CurrentlyViewedScreen 14 is the crusade screen. There are 15 (crusade.ts COUNT); beyond that the init's card
// formula runs on into the Asylum boss cards, which are not crusade drops.
for (let conquest = 1; conquest <= 15; conquest++)
  for (let lv = 0; lv <= 4; lv++)
    add(cardFor({ CurrentlyViewedScreen: 14, ConquestSelected: conquest, mapleLV: lv }), { kind: "crusade", conquest, stages: [lv, lv] });

// Skill drops go through CardIDcustom -> actor 919. Each rule below is transcribed from the code it cites;
// chance is per action (harvest/brew), from the roll randomInt(1, N) < X, i.e. (X - 1) / N.
for (let t = 0; t <= 22; t++) // Tilling harvest, ActorEvents_1093 / SceneEvents_34: rng(1,1e7) < 82 - 4*PlantType -> 300 + PlantType
  if (82 - 4 * t > 1) add(300 + t, { kind: "skill", skill: "Tilling", detail: `crop type ${t}`, chance: (81 - 4 * t) / 1e7, per: "harvests" });
for (let f = 1; f <= 24; f++) // Botany harvest (flower types start at 1: Weeds = type 1 = card 331), ActorEvents_1128: rng(1,1.2e6) < (122 - 5*FlowerType) * 2^overgrowth -> 330 + min(type,24)
  add(330 + f, { kind: "skill", skill: "Botany", detail: `flower type ${f}`, chance: (121 - 5 * f) / 1.2e6, per: "harvests at overgrowth 0 (halves with each overgrowth level)" });
const POTION_TIERS: [number, number, number][] = [[0, 8, 323], [9, 18, 324], [19, 30, 325], [31, 43, 326], [44, 56, 327], [57, 69, 328], [70, 82, 329], [83, 168, 330]];
for (const [lo, hi, id] of POTION_TIERS) // Apothecary brew, SceneEvents_37: rng(1,1e8) < 300 - 3*PotionType, card by potion tier
  add(id, { kind: "skill", skill: "Apothecary", detail: `potion types ${lo}–${hi}`, chance: (299 - 3 * lo) / 1e8, per: "brews of the tier's lowest potion" });
for (let d = 1; d <= 28; d++) // Spelunking, SceneEvents_49: treasure depth d (each step deeper on rng < 916297/1e6, capped by RaidDropType) -> 540 + d + floor(d/15)
  add(540 + d + Math.floor(d / 15), { kind: "skill", skill: "Spelunking", detail: `treasure depth ${d} (needs RaidDropType ≥ ${d})`, chance: null, per: "runs" });

// Construction (SceneEvents_50): levelling construction #15 / #39 rolls rng(1,100) < 2 per level-up, guaranteed at level 100.
add(555, { kind: "skill", skill: "Construction", detail: "level construction #15 (guaranteed at level 100)", chance: 1 / 100, per: "level-ups" });
add(570, { kind: "skill", skill: "Construction", detail: "level construction #39 (guaranteed at level 100)", chance: 1 / 100, per: "level-ups" });
// Event shop buy handler (ActorEvents_749, only while an event runs). Buying upgrade 7 or 8 rolls rng(1,N) < 2 for four cards
// (@14937669 / @14938152 / @14938634 / @14939117 for upgrade 7; the same four again for 8): 169 1/90, 171 1/400, 175 1/40, 176 1/600.
// Upgrade 7 also rolls 177 at 10*(.5+L/300)/1000 (@14935871) and upgrade 8 gives 178 or 179 at 10*(1+L/100)/1000 (@14940012), both
// guaranteed when the upgrade reaches EVENTpurchasesMAX; any purchase rolls 174 at 10*(1+L/25)/1000 (@14944412). L = that upgrade's level, 0 here.
const EVENT_ROLLS: [number, number, string][] = [[169, 1 / 90, "upgrade 7 or 8"], [171, 1 / 400, "upgrade 7 or 8"], [175, 1 / 40, "upgrade 7 or 8"], [176, 1 / 600, "upgrade 7 or 8"],
  [177, 0.005, "upgrade 7 (guaranteed at its max)"], [178, 0.005, "upgrade 8 (guaranteed at its max)"], [179, 0.005, "upgrade 8 (guaranteed at its max)"], [174, 0.01, "any upgrade"]];
for (const [id, chance, up] of EVENT_ROLLS) add(id, { kind: "skill", skill: "Event", detail: `event shop, ${up} (time-limited)`, chance, per: "event purchases" });
// Secretkeeper (166): SceneEvents_2 init grants it once SecretsFound[3] >= 1 (@20210322); that slot is written by SceneEvents_10 (@19763898).
add(166, { kind: "skill", skill: "Secret", detail: "find secret 4 (SecretsFound[3])", chance: null, per: "once" });
// No code path ever sets these: 167 Spooktober is a one-time migration (uEarnedSpookCard when EventCurrency > 1000 at update 2, @20209766);
// 168, 170, 172, 355-360 and the 30 "Glitch" cards (382-390, 412-420, 444-450, 476-480) are only read, never written (access index), and the
// drop actor and CardIDcustom sites above never produce them. They stay without a source on purpose (web/src/cards-missing.test.ts).
// Qoxzul (SceneEvents_9 drawing listener @31847536): fighting Grasslands (mode 1) at mapleLV >= 99 turns the monster into the 666
// special; each kill then rolls rng(1, floor(170*(1+mode/3)/(1+CardDropChance%/100))) == 1 -> card 173 at Lv1, only while unowned (@31850063).
add(173, { kind: "skill", skill: "Fighting", detail: "Grasslands stage 100+ special monster, once (odds scale with Card Drop Chance)", chance: 1 / Math.floor(170 * (1 + 1 / 3)), per: "kills at 0% Card Drop Chance" });

// Receipt: every zone card the wiki places in a main zone should have a zone source here.
const cards = JSON.parse(readFileSync("data/game/cards.json", "utf8")).cards as { id: number; zone: string | null; hidden: boolean }[];
const mainZone = cards.filter((c) => !c.hidden && c.zone && /^(Grasslands|Desert|Mountains|TheMist|Dungeon|Purgatory|TheBog|LunarIsle|Maelstrom|Oblivion)-\d+$/.test(c.zone));
const covered = mainZone.filter((c) => sources.get(c.id)?.some((s) => s.kind === "zone")).length;

// Name each fight mode by the wiki zone most of its cards come from.
const zoneOf = new Map(cards.map((c) => [c.id, c.zone?.replace(/-\d+\+?$/, "") ?? null]));
const modeNames: Record<number, string> = {};
for (const mode of MODES) {
  const n = new Map<string, number>();
  for (const [id, ss] of sources) if (ss.some((x) => x.kind === "zone" && x.mode === mode)) { const z = zoneOf.get(id); if (z) n.set(z, (n.get(z) ?? 0) + 1); }
  modeNames[mode] = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `mode ${mode}`;
}

writeFileSync("data/game/card-sources.json", JSON.stringify({ modeNames, sources: Object.fromEntries(sources) }));
// Static app data for the distributable build (save-independent).
writeFileSync("web/src/data/card-sources.json", JSON.stringify({ modeNames, sources: Object.fromEntries(sources) }));
// Coverage of the cards the game shows that the skill tabs hold (Main 6, Skull 4).
const skillTab = cards.filter((c: any) => !c.hidden && ((c.page === 1 && c.tab === 6) || (c.page === 2 && c.tab === 4)));
console.log(`skill-tab cards with a source: ${skillTab.filter((c) => sources.has(c.id)).length}/${skillTab.length}`);
const kinds = [...sources.values()].flat().reduce((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {} as Record<string, number>);
console.log("modes:", JSON.stringify(modeNames));
console.log(`data/game/card-sources.json: ${sources.size} cards with a source ${JSON.stringify(kinds)}; wiki main-zone cards covered ${covered}/${mainZone.length}`);
