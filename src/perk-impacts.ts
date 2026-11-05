// Perk impacts from the game's own combat code (#6): the stats combat perks feed (DPS, crit, accuracy, idle damage/speed,
// skill cooldowns) are stored values no web/src formula recomputes, so the Perks tab can't price those perks. Here the
// main fight scene's (SceneEvents_9) code recomputes them: its 30 ms stat callback (SmithingBaseAttack,
// MedallionDamageBoost, YourCritChance/YourCriticalDamage, IdleDmgBonusPercent, smithingAttackSpeedBoost…), then its
// draw listener (DPS = Be.GetPlayerDPS(), CriticalChance, MonsterHitRequirement). Each perk below max gets +1 level and
// the relative change of each stat is written to data/perk-impacts.json (gitignored, served by the dev server).
// Same for the rate perks whose stats are stored: kills per kill (BonusKillperKill), monster cash (SmithingBonusCash ->
// defaultgold), ores (BonusOresCUMULATIVEpercent, Mining scene), fish per catch (FishGiven, Fishing scene init) and
// smithing EXP per craft (the craft handler's EXP add, Smithing scene).
// Usage: bun src/perk-impacts.ts [--save data/save.json]
import { readFileSync, writeFileSync } from "fs";
import { blockHost, compile, inert, loadBundle, matchBraces, type Attrs } from "./game-eval";
import { idleHitsPerSec, idleMult } from "../web/src/fight-away";
import { cbonus, type Catalog } from "../web/src/cards-calc";
import catalog from "../web/src/data/card-catalog.json";
import perks from "../web/src/data/perks.json";

type Save = Record<string, any>;
// save.json stores Haxe maps unwrapped; game code reads them as { h: … } (as in src/derive-cloud-map.ts).
const rewrap = (v: unknown): unknown => Array.isArray(v) ? v.map(rewrap) : v && typeof v === "object" ? { h: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewrap(x)])) } : v;

const fn = (src: string, at: number, what: string) => { if (at < 0) throw new Error(`${what} not found — game update?`); return matchBraces(src, src.indexOf("function", at)); };
const find = (src: string, needle: string, from: number, what: string) => { const at = src.indexOf(needle, from); if (at < 0 || from < 0) throw new Error(`${what} not found — game update?`); return at; };
/** Refill the shared attribute table from a save (maps rewrapped, top-level arrays copied: game code writes into them). */
const fill = (A: Attrs, save: Save) => {
  for (const k of Object.keys(A)) delete A[k];
  for (const [k, v] of Object.entries(save)) A[k] = v && typeof v === "object" && !Array.isArray(v) ? rewrap(v) : Array.isArray(v) ? [...v] : v;
};

/** Compile the game's stat code once; the returned function evaluates it for any save. */
export function fightStats(src = loadBundle()) {
  const scene = src.indexOf('"scripts.SceneEvents_9"');
  const statsFn = fn(src, src.indexOf("runLater(30,(function(t){", scene), "SceneEvents_9 stat callback");
  const dpsFn = fn(src, src.indexOf("this.addWhenDrawingListener(null,(function(t,n,r,i){if(a.wrapper.enabled)if(n=b.engine,t=Be._customBlock_GetPlayerDPS()", scene), "SceneEvents_9 DPS listener");
  const cdFn = fn(src, src.indexOf("p.runPeriodically(50,", src.indexOf('"scripts.Design_101_101_MiningBoostCooldowns"')), "cooldown ticker");
  // The second 30 ms callback: BonusKillperKill (kills per kill: perk 65, contract card, training perk 15, tank 15, mastery 6).
  const killsFn = fn(src, src.indexOf('runLater(30,(function(t){t=b.engine;var a=b.engine.getGameAttribute("AscentionLevel")[65]', scene), "SceneEvents_9 kills callback");
  // The zone draw listeners (zone type 1 and 2, each gated on FightZoneTYPE): defaultgold = cash per kill, from SmithingBonusCash.
  const zone = 'addWhenDrawingListener(null,(function(t,n,r,i){if(a.wrapper.enabled&&1==b.engine.getGameAttribute("FightOn")&&(14==';
  const zone1 = src.indexOf(zone, scene), zoneFns = [fn(src, zone1, "zone listener 1"), fn(src, src.indexOf(zone, zone1 + 1), "zone listener 2")];
  // PbonusCashSUM as the scene's init sets it (PbonusCash3 @31629909 .. PbonusCashSUM @31633224), which is what the stat
  // callback's SmithingBonusCash reads 30 ms later. The stored PbonusCashSUM can't be used: any mouse release on the fight
  // scene rewrites it 30 ms later (@31888509) as Π(1 + PbonusCash1..4/100), treating PbonusCash4 (a multiplier, 1 when
  // potions 86/126 are 0) as a percent (×1.01 on the author's save) and dropping potion 132; SmithingBonusCash isn't recomputed
  // then. That was the ×1.0100 (#32).
  const cash3 = src.indexOf(".h.PbonusCash3=", scene);
  const cashFn = `function(){${src.slice(src.lastIndexOf("var ", src.lastIndexOf('getGameAttribute("PotionLV")[70]', cash3)), src.indexOf(";", src.indexOf(".h.PbonusCashSUM=", cash3)) + 1)}}`;
  // One attribute table, refilled per save, so the 30 KB of game code compiles once.
  const A: Attrs = {};
  const host = blockHost(src, A);
  const run = [statsFn, killsFn, dpsFn, cdFn, ...zoneFns, cashFn].map((f) => compile(f, A, { D: host, Be: host, t: { wrapper: { enabled: true } } }) as Function);
  return (save: Save) => {
    fill(A, save);
    run[6]!();
    run[0]!(inert);
    run[1]!(inert);
    run[2]!(inert, inert, inert, inert);
    A.SkillCooldownTimer = 0;
    run[3]!(inert); // one 50 ms tick: how far every skill cooldown advances
    const cd = Number(A.SkillCooldownTimer);
    run[4]!(inert, inert, inert, inert); run[5]!(inert, inert, inert, inert);
    const zt = Number(A.FightZoneTYPE) || 1, L3 = Number(A.AscentionLevel?.[3] ?? 0);
    // dpsspeed (seconds per idle hit), from the zone's draw listener (SceneEvents_9 ~31775000 / ~31804000): 2·zt²/(1+0.1·perk 3);
    // zone 2 with shrine 5 > 1 also halves it by Heavy Cash (÷ 2·0.8^min(toggles,50)), which no perk touches.
    const dpsspeed = 2 * zt ** 2 / (1 + 0.1 * L3) / (zt === 2 && Number(A.ShrineLevels?.[5]) > 1 ? 2 * 0.8 ** Math.min(Number(A.HeavyCashToggle), 50) : 1);
    return {
      DPS: Number(A.DPS), CriticalChance: Number(A.YourCritChance), CriticalDamage: Number(A.YourCriticalDamage),
      MonsterHitRequirement: Number(A.MonsterHitRequirement), IdleDmgBonusPercent: Number(A.IdleDmgBonusPercent),
      smithingAttackSpeedBoost: Number(A.smithingAttackSpeedBoost), dpsspeed, cooldownTick: cd,
      idleMult: idleMult(A), idleHitsPerSec: idleHitsPerSec({ ...A, dpsspeed }, zt),
      BonusKillperKill: Number(A.BonusKillperKill), SmithingBonusCash: Number(A.SmithingBonusCash), defaultgold: Number(A.defaultgold),
    };
  };
}
export type FightStats = ReturnType<ReturnType<typeof fightStats>>;

/** Skill-scene rates from those scenes' own code: Mining's 50 ms init callback (BonusOresCUMULATIVEpercent), Fishing's
 *  scene-init FishGiven statements, and Smithing's craft-EXP chain (run with smithingEXP = 0, so it returns one craft's EXP). */
export function skillStats(src = loadBundle()) {
  const mining = fn(src, find(src, "runLater(50,(function(t){t=b.engine.gameAttributes,null!=e.ShowDescription", src.indexOf('"scripts.SceneEvents_5"'), "Mining ore callback"), "Mining ore callback");
  // Fishing: statements from smithingFishingPower's fish multiplier through the second FishGiven write (scene init, not a callback).
  const fish7 = src.indexOf('"scripts.SceneEvents_7"'), fishMid = find(src, ',.72))/50-1+1,', fish7, "Fishing FishGiven");
  const fishEnd = src.indexOf(";", src.indexOf(".h.FishGiven=", src.indexOf(".h.FishGiven=", fishMid) + 1)) + 1;
  const fishing = `function(){${src.slice(src.lastIndexOf("var ", fishMid), fishEnd)}}`;
  // Smithing: the craft handler's if/else-if chain on smithingLVL; every branch adds EXP × (1 + (perk 33 + 3·perk 37)/100).
  const craft = find(src, 'if(b.engine.getGameAttribute("SmithingItemsYouOwn")[47]=', src.indexOf('"scripts.SceneEvents_6"'), "Smithing craft EXP");
  let end = craft;
  do { const b = src.indexOf("{", end); end = b + matchBraces(src, b).length; } while (src.startsWith("else", end));
  const smithing = `function(){${src.slice(craft, end)}}`;
  const A: Attrs = {}, host = blockHost(src, A);
  const [mine, fishFn, smithFn] = [mining, fishing, smithing].map((f) => compile(f, A, { D: host, Be: host }) as Function);
  return (save: Save) => {
    // The Mining scene equips its linked deck (6) before the callback; stored Cbonus* are whatever deck is on now.
    fill(A, { ...save, ...cbonus(save, catalog as unknown as Catalog, 6) }); mine!(inert);
    const ores = Number(A.BonusOresCUMULATIVEpercent);
    // Fishing reads the stored Cbonus* (the deck on when the scene loaded), which is what its stored FishGiven used.
    fill(A, save); fishFn!();
    const fish = Number(A.FishGiven);
    fill(A, { ...save, smithingEXP: 0 }); smithFn!();
    return { BonusOresCUMULATIVEpercent: ores, FishGiven: fish, smithingEXPperCraft: Number(A.smithingEXP) };
  };
}
export type SkillStats = ReturnType<ReturnType<typeof skillStats>>;

// Output label → stat; higher is better for all (accuracy = 1 / hit requirement). Away kills/h and cash/h are
// proportional to BonusKillperKill and defaultgold (web/src/fight-away.ts awayGainsPerHour), so their % change is the stat's.
type Stats = FightStats & SkillStats;
const OUTPUTS: [string, (s: Stats) => number][] = [
  ["DPS", (s) => s.DPS],
  ["crit chance", (s) => s.CriticalChance],
  ["crit damage", (s) => s.CriticalDamage],
  ["accuracy", (s) => 1 / s.MonsterHitRequirement],
  ["idle damage", (s) => s.idleMult],
  ["idle attack speed", (s) => s.idleHitsPerSec],
  ["skill cooldown speed", (s) => s.cooldownTick],
  ["away kills/h", (s) => s.BonusKillperKill],
  ["away cash/h", (s) => s.defaultgold],
  ["ores mined", (s) => 1 + s.BonusOresCUMULATIVEpercent / 100],
  ["fish per catch", (s) => s.FishGiven],
  ["smithing EXP/craft", (s) => s.smithingEXPperCraft],
];

export function perkStats(src = loadBundle()) {
  const f = fightStats(src), k = skillStats(src);
  return (save: Save): Stats => ({ ...f(save), ...k(save) });
}

export function perkImpacts(save: Save, stats = perkStats()) {
  const base = stats(save), lv: number[] = save.AscentionLevel ?? [], out: Record<number, { output: string; change: number }[]> = {};
  for (const p of perks as { i: number; max: number }[]) {
    if ((lv[p.i] ?? 0) >= p.max) continue;
    const next = [...lv]; next[p.i] = (lv[p.i] ?? 0) + 1;
    const s = stats({ ...save, AscentionLevel: next });
    const rows = OUTPUTS.flatMap(([output, f]) => { const a = f(base), b = f(s); return Number.isFinite(a) && Number.isFinite(b) && a && Math.abs(b / a - 1) > 1e-9 ? [{ output, change: b / a - 1 }] : []; });
    if (rows.length) out[p.i] = rows;
  }
  return { generated: new Date().toISOString(), save: `${save.TimesAscended ?? 0}-${save.NumberofTimesRebirth ?? 0}`, levels: lv, perks: out };
}

export function writePerkImpacts(save: Save, path = "data/perk-impacts.json") {
  const r = perkImpacts(save);
  writeFileSync(path, JSON.stringify(r));
  return r;
}

if (import.meta.main) {
  const i = process.argv.indexOf("--save");
  const t = performance.now();
  const r = writePerkImpacts(JSON.parse(readFileSync(i > 0 ? process.argv[i + 1]! : "data/save.json", "utf8")));
  console.log(`data/perk-impacts.json: ${Object.keys(r.perks).length} perks move a game-code stat (${Math.round(performance.now() - t)} ms)`);
  for (const [k, rows] of Object.entries(r.perks)) console.log(`  ${k}: ${rows.map((x) => `${x.output} ${(100 * x.change).toFixed(3)}%`).join(", ")}`);
}
