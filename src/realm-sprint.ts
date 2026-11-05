// Realm speed trophies 25, 27, 29 (#2592): first 10 / 15 / 20 bosses inside 375 / 435 / 495 s of a Shrine reset ([6] > n−1
// while [37] < sec, @6601732 / @6602244 / @6602756). Finds the barn with the fewest buy actions (summon, level to X, evolve)
// that clears them from the post-reset state, then the lowest coin cost, and times it with the game's own fight rules.
//
// What a Shrine reset (@6762200, ActorEvents_1488) does, in order: [12] += ShrineResetQTY (@6762563), [34] = Ahisma [13][3];
// every barn slot whose id is not "MinionF…" (Cooloar family) is emptied (@6762790), the survivors are packed to the front
// (@6763482); [5] = VendingCost(10, 17) (Icecream Sammich) when > 10, else 0 (@6763826); [6] = [7] = 0 (@6764014); [4] = the
// first boss's HP (@6764239); [11] (blessings) = empty map and [37] = 0 (@6764293); reload with a 0.9 s fade out + 2.5 s fade in
// (@6764530). Nothing else in RealmStuff is written: Realm Lv/EXP, Shrine levels [13], vending [8], best afterlife [23],
// trophies [24], Orb expansions/energy/trait/buys [25] [26] [31] [33] [46], Crystal shop [42], Field [35], fruits [17] all stay.
//
// Fight rules the timing uses (ActorEvents_1488 tick, 100 ms):
// - The tier hit is GenINFO[12], the highest tier with HP left at scene init (@6522566); a tick first steps it down one tier
//   when its HP is ≤ 0 (@6612731), then runs the attacks. CreateDmg (@6446043) subtracts from that tier only, no overflow.
// - A hit lands when its colour is the tier, or, with Lemonhearted (trait 23) in the barn, when it crits on Yellow.
//   Each CreateDmg rolls its own crit (MinionCritChance), × MinionCritDmg. Dual Damage (43) adds the other colour's hit.
// - Every minion's attack timer is 0 when the scene loads (GenINFO[5][i][9], @6556219) and runs down while transitioning but
//   cannot fire (@6616700): so all minions fire together on the first tick after the fade in, then every attackPeriod.
// - A dead boss (GenINFO[12] = −1) waits for a portal click; the click reloads the scene, 2 s fade out + 0.5 s fade in
//   (@6641753), and the reload's init adds the kill to [6] (@6522988). [37] runs every tick (@6604895), fades included.
// - Blue (tier 3) only takes the Orb laser: OrbCost(1) energy a shot (@6921936), 0.5 s charge, then OrbLaserDmgPerSec each
//   second for 10 s (@6611576). A reload ends it, so every boss with Blue costs one shot.
// ponytail: estimates, not the game: no click or reaction time (portal, laser, buys, the blessing pick after a kill), no
// blessings picked during the run (they only add damage), laser hits after 0.6 s. Pink (Afterlife 30+) is not in these runs.
import { loadBundle } from "./game-eval";
import { realmHost, wrap } from "./realm-combat";
import realm from "../web/src/data/realm.json";
import { attackPeriod } from "../web/src/modules/realm/realm";
import type { SprintPlan, SprintStep } from "../web/src/modules/realm/realm-trophies";

type Save = Record<string, any>;
const M = (realm as unknown as { minions: Record<string, { name: string; trait: number; evo: string[]; parent: string | null }> }).minions;
const EVO = [10, 50, 200]; // level cap per stage (MinionInfo "Evo" @6389528); stage 3 has none
const FAMILIES = ["A", "B", "C", "D"];
export const SPRINTS = [{ trophy: 25, bosses: 10, limit: 375 }, { trophy: 27, bosses: 15, limit: 435 }, { trophy: 29, bosses: 20, limit: 495 }];
const RESET_FADE = 3.4, PORTAL_FADE = 2.5, LASER_DELAY = 0.6, RUNS = 400, MAX_LINES = 4, MAX_ROWS = 24;
/** Buying takes time (measured on the author's run, 2026-10-21, src/realm-record.ts): first buy 12.1 s after the reset, ~0.5 s per
 *  summon or evolve click, held level buttons ~7 levels/s (median; up to 25), and ~7 s of pause per minion line (deciding,
 *  switching to the toolbox and back: 289 s of >2 s gaps over 41 lines). A minion joins the fight when its line is done.
 *  ponytail: a line fights only once complete (it would chip in while being levelled), and barn-wide traits (Lemonhearted,
 *  Dual Damage, crit buffs) count from the start, not from when their carrier is bought. */
export const BUY = { first: 12.1, click: 0.5, levelsPerSec: 7, linePause: 7, repeatPause: 2 }; // repeatPause: the same line again (no switch; estimated, not measured)

/** A minion's traits: its own and every ancestor's (TraitList @6451390). */
const traits = (id: string) => { const t: number[] = []; for (let m: string | null = id; m; m = M[m]!.parent) t.push(M[m]!.trait); return t; };
const lineage = (id: string) => { const p: string[] = []; for (let m: string | null = id; m; m = M[m]!.parent) p.unshift(m); return p; };

/** The save as a Shrine reset leaves it (see the header). */
export function afterReset(save: Save, H: any, A: Record<string, any>) {
  const rs = A.RealmStuff as any[], blank = () => ["none", 0, "none", 0, 0, 0, 0];
  const kept = (rs[3] as any[][]).filter((s) => String(s[0]).includes("MinionF"));
  rs[3] = [...kept, ...Array.from({ length: 180 - kept.length }, blank)];
  const sammich = Number(H._customBlock_MinionInfo("VendingCost", 10, 17));
  rs[5] = sammich > 10 ? sammich : 0; rs[6] = 0; rs[7] = 0; rs[11] = wrap({}); rs[37] = 0;
  return kept.length;
}

type Fighter = { period: number; dmg: number; crit: number; critDmg: number; multihit: number; colour: 0 | 1; joinAt: number };
type Fight = { fighters: Fighter[]; dual: boolean; lemon: boolean; redMult: number; otherMult: number; laser: number };

/** Small seeded PRNG (mulberry32) so every run of the planner times the same fights. */
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Seconds from the reset to each kill being counted ([6] = k + 1, fades included) in one random run; Infinity from the first
 *  boss past `cap` or with a tier that can never fall. */
export function runTime(f: Fight, hp: number[][], n: number, rand: () => number, cap = Infinity) {
  let t = RESET_FADE;
  const splits: number[] = Array(n).fill(Infinity);
  const periods = f.fighters.map((x) => Math.round(x.period * 10)), laserAt = Math.round(LASER_DELAY * 10);
  const lands = [0, 1, 2, 3].map((tier) => tier === 3 ? f.laser > 0 : tier === 2 ? f.lemon && f.fighters.some((m) => m.crit > 0) : f.fighters.some((m) => f.dual || m.colour === tier));
  const cols = f.dual ? 2 : 1; // hits per swing: own colour, then the other with Dual Damage (same rand() order as before #2652)
  for (let b = 0; b < n; b++) {
    const h = hp[b]!.slice(0, 4), next = periods.map(() => 0); // every timer is 0 at scene load
    let cur = 3; while (cur >= 0 && !(h[cur]! > 0)) cur--;
    let tick = 0;
    for (;;) {
      if (h[cur]! <= 0) { cur--; if (cur < 0) break; } // one tier per tick, before the attacks (@6612731)
      if ((h[cur]! > 0 && !lands[cur]) || t + tick / 10 > cap) return splits;
      if (cur === 3 && tick >= laserAt && (tick - laserAt) % 10 === 0) h[3]! -= f.laser;
      for (let i = 0; i < periods.length; i++) {
        if (next[i] !== tick) continue;
        const m = f.fighters[i]!;
        if (t + tick / 10 < m.joinAt) { next[i] = Math.max(tick + 1, Math.ceil((m.joinAt - t) * 10)); continue; } // not bought yet
        next[i] = tick + periods[i]!;
        const p = Math.min(m.crit, 100) / 100, mh = m.multihit / 100;
        let hits = 1;
        if (rand() < mh) { hits = 2; if (rand() < mh - 1) hits = 3; if (rand() < mh - 2) hits = 4; if (rand() < mh - 3) hits = 5; }
        for (let k = 0; k < hits; k++) for (let c = 0; c < cols; c++) {
          const col = c === 0 ? m.colour : 1 - m.colour, crit = rand() < p;
          if (col === cur || (crit && f.lemon && cur === 2)) h[cur]! -= m.dmg * (col === 0 ? f.redMult : f.otherMult) * (crit ? m.critDmg : 1);
        }
      }
      let soon = cur !== 3 ? Infinity : tick + 1 <= laserAt ? laserAt : laserAt + Math.ceil((tick + 1 - laserAt) / 10) * 10;
      for (let i = 0; i < next.length; i++) if (next[i]! < soon) soon = next[i]!;
      tick = h[cur]! <= 0 ? tick + 1 : soon;
    }
    t += tick / 10 + PORTAL_FADE;
    splits[b] = t;
  }
  return splits;
}

/** Over RUNS seeded runs: median and 90th-percentile time to each goal, and the share of runs that meet every goal. */
export function timeIt(f: Fight, hp: number[][], goals: { bosses: number; limit: number }[], runs = RUNS) {
  const n = Math.max(...goals.map((g) => g.bosses)), cap = Math.max(...goals.map((g) => g.limit)), rand = rng(n * 7919);
  const all = Array.from({ length: runs }, () => runTime(f, hp, n, rand, cap));
  const at = (g: { bosses: number }) => all.map((r) => r[g.bosses - 1]!).sort((a, b) => a - b);
  return {
    times: goals.map((g) => { const ts = at(g); return { bosses: g.bosses, limit: g.limit, median: ts[runs >> 1]!, p90: ts[Math.floor(runs * 0.9)]! }; }),
    success: all.filter((r) => goals.every((g) => r[g.bosses - 1]! < g.limit)).length / runs,
  };
}

export type Line = { id: string; level: number }; // summon the root of id, climb to id, end at level
const startLv = (stage: number) => (stage === 0 ? 1 : EVO[stage - 1]!);
const rowsOf = (l: Line) => { const s = lineage(l.id).length - 1; return 1 + 2 * s + (l.level > startLv(s) ? 1 : 0); };

const role = (id: string) => {
  const t = traits(id), out: string[] = [];
  if (t.includes(0) || t.includes(2)) out.push(t.includes(2) ? "Orange" : "Red");
  if (t.includes(43)) out.push("Orange from Red and back (Dual Damage)");
  if (t.includes(23)) out.push("Yellow: crits land on Yellow (Lemonhearted)");
  if ([5, 6, 18, 26, 58, 68].some((x) => t.includes(x)) && (t.includes(0) || t.includes(2))) out.push("crits");
  if ([14, 15, 16, 55, 62].some((x) => t.includes(x))) out.push("attack speed");
  return out.join(", ") || "none (only a step on the way)";
};

/** The post-reset save on the game's blocks: buy lines into it (`build`) and read its fight stats. */
function model(save: Save, src: string) {
  const { A, H, MI, fresh } = realmHost(save, src);
  const kept = afterReset(save, H, A), rs = A.RealmStuff as any[], barn = rs[3] as any[][];
  fresh();
  const startCoins = Number(rs[5]), slots = MI("BarnSlots"), families = MI("SummonTypesUnlocked");
  const laser = MI("OrbLaserDmgPerSec"), shotCost = MI("OrbCost", 1), energyHave = Number(rs[26]);
  const base = Number(H._customBlock_CalcMisc("BaseMinionAtkSpdSEC", 0, 0));
  const hp = Array.from({ length: 20 }, (_, k) => Array.from({ length: 4 }, (_, t) => Number(H._customBlock_BossHPtot(k, t, 0, "0"))));

  /** Seconds after the reset at which each line is bought and fighting (BUY timing, lines in buy order). */
  const joins = (lines: Line[]) => { let t = BUY.first; return lines.map((l, j) => {
    const st = lineage(l.id).length - 1, climbed = Array.from({ length: st }, (_, k) => EVO[k]! - startLv(k)).reduce((a, b) => a + b, 0) + Math.max(0, l.level - startLv(st));
    const same = j > 0 && lines[j - 1]!.id === l.id && lines[j - 1]!.level === l.level;
    t += (same ? BUY.repeatPause : BUY.linePause) + BUY.click * (1 + st) + climbed / BUY.levelsPerSec; return t; }); };
  /** Buys the lines in order into the post-reset barn: the dialog rows, their cost, and the barn's fight stats. */
  const build = (lines: Line[]) => {
    for (let k = kept; k < barn.length; k++) barn[k] = ["none", 0, "none", 0, 0, 0, 0];
    let left = startCoins, cost = 0, levelUps = 0;
    const steps: SprintStep[] = [];
    lines.forEach((l, j) => {
      const slot = kept + j, path = lineage(l.id);
      fresh(); const c = MI("NewMinionPortal", FAMILIES.indexOf(l.id[6]!)); // NewMinionPortal @6389447, Lv1 stage 0 (@6650700)
      const s = barn[slot] = [path[0], 1, 0, 0, 0, 0, 0];
      left -= c; cost += c;
      steps.push({ minion: path[0]!, action: "summon", cost: c, left, colour: role(path[0]!) });
      const levelTo = (to: number) => {
        let c = 0;
        fresh(); while (s[1] < to) { const x = MI("MinionUpgCost", slot); c += x; s[1] += 1; s[4] += x; levelUps++; } // @6509750; the cost reads the level live, its cached terms only change on a summon/evolve
        left -= c; cost += c;
        steps.push({ minion: s[0], action: `level to ${to}`, cost: c, left, colour: role(s[0]) + (s[0] === path.at(-1) ? " (more damage)" : "") });
      };
      for (let k = 1; k < path.length; k++) {
        levelTo(EVO[k - 1]!);
        const side = M[path[k - 1]!]!.evo.indexOf(path[k]!) === 0 ? "left" : "right";
        s[0] = path[k]; s[3] += 1; // evolve (@6627614): id and stage change, level and coins spent stay
        steps.push({ minion: path[k]!, action: `evolve ${side}`, cost: 0, left, colour: role(path[k]!) });
      }
      if (l.level > s[1]) levelTo(l.level);
    });
    const fight = fightOf(lines.length, joins(lines));
    return { steps, cost, levelUps, fight, left };
  };
  const fightOf = (n: number, join?: number[]): Fight => {
    fresh();
    const fighters: Fighter[] = [];
    for (let slot = 0; slot < kept + n; slot++) if (barn[slot]![0] !== "none" && MI("DoesMinionAttack", slot) > 0.1)
      fighters.push({ period: attackPeriod(base, MI("MinionAtkSpeedPCT", slot)), dmg: MI("MinionDMG", slot), crit: MI("MinionCritChance", slot),
        critDmg: MI("MinionCritDmg", slot), multihit: MI("MinionMultihit", slot), colour: MI("MinionTrait", slot, 2) >= 1 ? 1 : 0,
        joinAt: slot < kept ? 0 : join?.[slot - kept] ?? 0 });
    return { fighters, dual: MI("MinionTraitALL", 43) > 0, lemon: MI("MinionTraitALL", 23) >= 1,
      redMult: 1 + Number(H._customBlock_BlessingBonus(7)) / 100, otherMult: 1 + Number(H._customBlock_BlessingBonus(20)) / 100, laser };
  };
  return { build, fightOf, joins, hp, kept, barn, rs, startCoins, slots, families, laser, shotCost, energyHave };
}

/** A plan's rows back into lines (summon starts one, evolve moves its id, level to X sets its level). */
export function linesOf(steps: SprintStep[]): Line[] {
  const out: Line[] = [];
  for (const s of steps) {
    if (s.action === "summon") out.push({ id: s.minion, level: 1 });
    else if (s.action.startsWith("evolve")) out.at(-1)!.id = s.minion;
    else out.at(-1)!.level = Number(s.action.replace("level to ", ""));
  }
  return out;
}
/** Rebuilds a plan's barn on the post-reset save: its rows, cost and fight, for checking a plan against the model. */
export function replayPlan(save: Save, steps: SprintStep[], src = loadBundle()) {
  const m = model(save, src);
  return { ...m.build(linesOf(steps)), hp: m.hp, startCoins: m.startCoins, slots: m.slots, kept: m.kept };
}

/** Plans for trophies 25, 27, 29 from the save with a Shrine reset applied. */
export function sprintPlans(save: Save, src = loadBundle()): SprintPlan[] {
  const { build, fightOf, joins, hp, kept, barn, rs, startCoins, slots, families, laser, shotCost, energyHave } = model(save, src);

  // Search: one Lemonhearted line (Yellow needs it from boss 10) plus up to MAX_LINES − 1 other lines, every minion id of the
  // open families as an end point, attackers below stage 3 with or without a "level to the stage cap" row. Row totals
  // ascending; the first total with a plan that meets the goals in ≥ 90% of runs wins, then its levels are lowered as far as
  // that holds and the lowest-cost plan is kept. Quick stats place each line straight at its level with the coins spent it
  // takes alone; the kept plan is rebuilt in buy order for exact costs and timed again.
  const lemonLine = (id: string) => traits(id).includes(23);
  const attacker = (id: string) => traits(id).includes(0) || traits(id).includes(2);
  const stageOf = (id: string) => lineage(id).length - 1;
  const capOf = (id: string) => EVO[stageOf(id)]!;
  const spent = new Map<string, { spent: number; cost: number }>();
  const alone = (l: Line) => {
    const k = `${l.id}@${l.level}`;
    if (!spent.has(k)) { const b = build([l]); spent.set(k, { spent: Number(barn[kept]![4]), cost: b.cost }); }
    return spent.get(k)!;
  };
  // Buy order: attackers first so the fight starts while the rest is bought, the Lemonhearted line last, and identical lines
  // back to back (one switch, then repeats; the author 2026-10-21: switching between minions costs time).
  const ordered = (ls: Line[]) => [...ls].sort((a, b) => Number(lemonLine(a.id)) - Number(lemonLine(b.id)) || Number(attacker(b.id)) - Number(attacker(a.id))
    || a.id.localeCompare(b.id) || b.level - a.level);
  const quick = (lines: Line[]) => {
    lines = ordered(lines);
    const sp = lines.map((l) => alone(l).spent);
    for (let k = kept; k < barn.length; k++) barn[k] = ["none", 0, "none", 0, 0, 0, 0];
    lines.forEach((l, j) => { barn[kept + j] = [l.id, l.level, 0, stageOf(l.id), sp[j], 0, 0]; });
    return fightOf(lines.length, joins(lines));
  };
  const ids = Object.keys(M).filter((id) => FAMILIES.slice(0, families).includes(id[6]!));
  const opts: Line[] = ids.flatMap((id) => [{ id, level: startLv(stageOf(id)) }, ...(attacker(id) && stageOf(id) < 3 ? [{ id, level: capOf(id) }] : [])])
    .filter((l) => (attacker(l.id) || lemonLine(l.id) || stageOf(l.id) > 0) && alone(l).cost <= startCoins);
  const lemons = opts.filter((l) => lemonLine(l.id)), rest = opts.filter((l) => !lemonLine(l.id));
  const CRIT = [5, 6, 18, 26, 58, 68], orbCrit = CRIT.includes(Number(rs[31]));
  const free = slots - kept;

  const plan = (trophy: number, goals: { bosses: number; limit: number }[], from: number): SprintPlan => {
    const g = goals.at(-1)!;
    const blue = hp.slice(0, g.bosses).reduce((t, h) => t + (h[3]! > 0 ? Math.ceil(h[3]! / (10 * laser)) : 0), 0);
    const head = { trophy, bosses: g.bosses, limit: g.limit, startCoins, slots, energyNeed: blue * shotCost, energyHave };
    const needOrange = g.bosses >= 5;
    let searched = 0;
    const ok = (f: Fight, runs: number) => timeIt(f, hp, goals, runs).success >= 0.9;
    const passes = (lines: Line[]) => { searched++; const f = quick(lines); return ok(f, 40) && ok(f, RUNS); };
    for (let R = from; R <= MAX_ROWS; R++) {
      const hits: Line[][] = [];
      const pick = (from: number, chosen: Line[], rows: number) => {
        if (rows === R) {
          const all = [...chosen];
          const t = all.flatMap((l) => traits(l.id));
          if (needOrange && !t.includes(2) && !t.includes(43)) return;
          if (!orbCrit && !all.some((l) => attacker(l.id) && traits(l.id).some((x) => CRIT.includes(x))) && !t.some((x) => [6, 58, 68].includes(x))) return;
          if (all.length > free) return;
          if (passes(all)) hits.push(all);
          return;
        }
        if (chosen.length >= MAX_LINES) return;
        for (let i = from; i < rest.length; i++) if (rows + rowsOf(rest[i]!) <= R) pick(i, [rest[i]!, ...chosen], rows + rowsOf(rest[i]!));
      };
      for (const L of lemons) if (rowsOf(L) <= R) pick(0, [L], rowsOf(L));
      if (!hits.length) continue;
      // Lowest levels that still pass, per levelled line (binary search, most expensive line first), then the cheapest plan.
      const best = hits.map((lines) => {
        lines = lines.map((l) => ({ ...l }));
        for (const l of [...lines].filter((l) => l.level > startLv(stageOf(l.id))).sort((a, b) => alone(b).cost - alone(a).cost)) {
          let lo = startLv(stageOf(l.id)) + 1, hi = l.level;
          while (lo < hi) { const mid = (lo + hi) >> 1; l.level = mid; if (passes(lines)) hi = mid; else lo = mid + 1; }
          l.level = hi;
        }
        // Buy order: attackers first, so the fight starts while the rest is bought; the Lemonhearted line last.
        lines = ordered(lines);
        const b = build(lines);
        return { lines, b, t: timeIt(b.fight, hp, goals) };
      }).filter((x) => x.t.success >= 0.9 && x.b.cost <= startCoins).sort((a, b) => a.b.steps.length - b.b.steps.length || a.b.cost - b.b.cost)[0];
      if (!best) continue;
      return { ...head, found: true, steps: best.b.steps, levelUps: best.b.levelUps, cost: best.b.cost, used: kept + best.lines.length,
        times: best.t.times, success: best.t.success, searched };
    }
    return { ...head, found: false, why: `no barn of up to ${MAX_LINES} minion lines and ${MAX_ROWS} actions, bought with the ${startCoins.toExponential(2)} coins a reset starts with, clears it in 90% of runs`,
      steps: [], levelUps: 0, cost: 0, used: kept, times: [], success: 0, searched };
  };
  // 25 and 27 on their own goal; 29 with all three, since claiming each the moment it fills offers the next at 0 in the same
  // run (@6787600), so one run can earn all three (else 29 alone). A plan for all three also meets 27's goal, so that search
  // starts at 27's action count.
  const [p25, p27] = [plan(25, [SPRINTS[0]!], 3), plan(27, [SPRINTS[1]!], 3)];
  const all = plan(29, SPRINTS, p27.found ? p27.steps.length : 3);
  const plans = [p25, p27, all.found ? all : plan(29, [SPRINTS[2]!], 3)];

  // All-in (damage loadout for the trophies): start from the fewest-buys barn and spend the reset's coins on speed. Local search:
  // each round tries every move (evolve a line one stage deeper, raise a line 25% up to its stage cap, add an attacker line),
  // keeps those the coins and slots cover, and takes the one with the lowest 90th-percentile time to the last goal.
  // ponytail: greedy local search with 40-run timings per candidate; a different start or a two-move lookahead could do better.
  const fastest = (p: SprintPlan, goals: { bosses: number; limit: number }[]) => {
    if (!p.found) return undefined;
    const score = (lines: Line[]) => {
      if (lines.length > free || lines.reduce((t, l) => t + alone(l).cost, 0) > startCoins) return Infinity;
      return timeIt(quick(lines), hp, goals, 40).times.at(-1)!.p90;
    };
    let cur = linesOf(p.steps), best = score(cur);
    const adds = rest.filter((l) => attacker(l.id) && stageOf(l.id) === 3);
    for (let round = 0; round < 60; round++) {
      const moves: Line[][] = [];
      cur.forEach((l, i) => {
        const swap = (n: Line) => moves.push(cur.map((x, j) => (j === i ? n : x)));
        if (stageOf(l.id) < 3 && attacker(l.id)) for (const c of M[l.id]!.evo) swap({ id: c, level: startLv(stageOf(c)) });
        const cap = EVO[stageOf(l.id)] ?? Infinity, up = Math.min(cap, Math.max(l.level + 1, Math.ceil(l.level * 1.25)));
        if (up > l.level) swap({ ...l, level: up });
      });
      if (cur.length < free) for (const a of adds) moves.push([...cur, a]);
      let pick: Line[] | null = null, pickScore = best;
      for (const m of moves) { const sc = score(m); if (sc < pickScore) { pick = m; pickScore = sc; } }
      if (!pick) break;
      cur = pick; best = pickScore;
    }
    const b = build(ordered(cur)), t = timeIt(b.fight, hp, goals);
    if (b.cost > startCoins) return undefined;
    return { steps: b.steps, levelUps: b.levelUps, cost: b.cost, times: t.times, success: t.success };
  };
  plans.forEach((p, i) => { p.allIn = fastest(p, i === 2 && all.found ? SPRINTS : [SPRINTS[i]!]); });
  return plans;
}
