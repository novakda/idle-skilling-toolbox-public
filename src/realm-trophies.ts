// Realm trophies (RealmStuff[24]) that need the game's blocks to plan: the 60-unique-minions route (MinionUpgCost per level,
// NewMinionPortal, BarnSlots, TotalDailyBanishes, CalcMisc UniqueBarnMinions) and the boss HP a post-reset speed run must clear
// (BossHPtot). The trophy rules themselves and the per-trophy next step are in web/src/realm-trophies.ts. Written into
// data/realm-combat.json (`trophies`) by src/realm-combat.ts.
import { loadBundle } from "./game-eval";
import { realmHost } from "./realm-combat";
import realm from "../web/src/data/realm.json";
import type { TrophyCalc, UniqueStep } from "../web/src/modules/realm/realm-trophies";

type Save = Record<string, any>;
const M = (realm as unknown as { minions: Record<string, { name: string; evo: string[]; parent: string | null }> }).minions;
const EVO = [10, 50, 200]; // MinionInfo "Evo" @6389528: the level a stage must reach before it can evolve
export const FAMILIES = ["A", "B", "C", "D", "E"]; // MinionSummonNames order; SummonTypesUnlocked @6388062 returns how many are open
export const stageOf = (id: string) => { let s = 0; for (let p = M[id]?.parent; p; p = M[p]?.parent) s++; return s; };
/** id → descendant: the ids in between, root side first, ending at the descendant (empty when not a descendant). */
export function pathDown(from: string, to: string): string[] {
  const up: string[] = [];
  for (let m: string | null = to; m; m = M[m]?.parent ?? null) { if (m === from) return up.reverse(); up.push(m); }
  return [];
}

export function realmTrophies(save: Save, src = loadBundle()): TrophyCalc {
  const { A, H, MI, fresh } = realmHost(save, src);
  const CM = (k: string) => Number(H._customBlock_CalcMisc(k, 0, 0));
  fresh();
  const rs = A.RealmStuff as any[], barn = rs[3] as any[][];
  const slots = MI("BarnSlots"), unique = CM("UniqueBarnMinions"), countinion = Number(save.RealmStuff[11]?.i ?? 0);
  const banishMax = MI("TotalDailyBanishes"), banishLeft = Math.max(0, banishMax - Number(rs[22])), coins = Number(rs[5]);
  const families = MI("SummonTypesUnlocked");

  // Level-up cost (MinionUpgCost @6410500 depends on the family, the level and barn-wide reductions) from a minion's state to a
  // descendant: level to Evo(stage), evolve (id → next on the path, stage + 1, level kept, @6627614), repeat. Run in a scratch
  // slot past BarnSlots (UniqueBarnMinions is already cached in DNSM, so it does not count the scratch minion).
  const scratch = barn.findLastIndex((s) => s[0] === "none");
  const climb = (id: string, level: number, to: string) => {
    const steps = pathDown(id, to), old = barn[scratch];
    const s = barn[scratch] = [id, level, 0, stageOf(id), 0, 0, 0];
    let cost = 0, ups = 0;
    for (const next of steps) {
      for (; s[1] < EVO[s[3]]!; s[1]++, ups++) cost += MI("MinionUpgCost", scratch);
      s[0] = next; s[3]++;
    }
    barn[scratch] = old;
    return { cost, ups };
  };

  // What the barn holds, per id.
  const held = new Map<string, { slot: number; level: number; cash: number }[]>();
  for (let slot = 0; slot < barn.length; slot++) {
    const s = barn[slot]!;
    if (s[0] === "none") continue;
    held.set(s[0], [...(held.get(s[0]) ?? []), { slot, level: Number(s[1]), cash: MI("MinionCASH", slot) }]);
  }
  const all = Object.keys(M).filter((id) => FAMILIES.slice(0, families).includes(id[6]!) && !id.startsWith("MinionF"));
  const missing = all.filter((id) => !held.has(id));
  // Spares: every copy past the first of an id (the one kept earns the most coins).
  const spares = [...held.values()].flatMap((cs) => [...cs].sort((a, b) => b.cash - a.cash).slice(1).map((c) => ({ ...c, id: barn[c.slot]![0] as string })));
  const need = Math.max(0, 60 - unique);

  // 1. Evolve a spare into a missing descendant: no slot, no banish. Cheapest pairs first, each spare and target once.
  const pairs = spares.flatMap((sp) => missing.filter((t) => pathDown(sp.id, t).length).map((t) => ({ sp, t, ...climb(sp.id, sp.level, t) })))
    .sort((a, b) => a.cost - b.cost);
  const usedSp = new Set<number>(), got = new Set<string>(), steps: UniqueStep[] = [];
  for (const p of pairs) {
    if (steps.length >= need || usedSp.has(p.sp.slot) || got.has(p.t)) continue;
    usedSp.add(p.sp.slot); got.add(p.t);
    steps.push({ kind: "evolve", target: p.t, from: p.sp.id, slot: p.sp.slot, level: p.sp.level, path: [p.sp.id, ...pathDown(p.sp.id, p.t)], cost: p.cost, levelUps: p.ups });
  }
  // 2. Summon a root (NewMinionPortal @6389447: a flat price per family, starts at Lv1 @6650700) and climb to a missing id.
  const summons = missing.filter((t) => !got.has(t)).map((t) => {
    const root = t.replace(/\d+$/, "0"), c = climb(root, 1, t);
    return { kind: "summon" as const, target: t, from: root, path: [root, ...pathDown(root, t)], cost: MI("NewMinionPortal", FAMILIES.indexOf(t[6]!)) + c.cost, levelUps: c.ups };
  }).sort((a, b) => a.cost - b.cost);
  for (const s of summons) { if (steps.length >= need) break; steps.push(s); }

  // 3. Slots for the summons: empty ones first, then banish spares nobody evolves, lowest coin earner first.
  const used = barn.slice(0, slots).filter((s) => s[0] !== "none").length, free = Math.max(0, slots - used);
  const summonN = steps.filter((s) => s.kind === "summon").length, banishN = Math.max(0, summonN - free);
  // A spare's cost to coins is the barn's MinionCASH total without it: a non-earner can still carry a multiplier trait
  // (Lizardman's Bless Updog), so its own MinionCASH is not enough. Banished one by one, cheapest loss first.
  const barnCash = () => { fresh(); let t = 0; for (let k = 0; k < slots; k++) if (barn[k]![0] !== "none") t += MI("MinionCASH", k); return t; };
  const base = barnCash(), gone: [number, any[]][] = [], banish: TrophyCalc["banish"] = [];
  let pool = spares.filter((s) => !usedSp.has(s.slot)), was = base;
  while (banish.length < banishN && pool.length) {
    const loss = pool.map((s) => { const e = barn[s.slot]!; barn[s.slot] = ["none", 0, 0, 0, 0, 0, 0]; const r = was - barnCash(); barn[s.slot] = e; return { s, r }; })
      .sort((a, b) => a.r - b.r)[0]!;
    gone.push([loss.s.slot, barn[loss.s.slot]!]); barn[loss.s.slot] = ["none", 0, 0, 0, 0, 0, 0]; was -= loss.r;
    banish.push({ slot: loss.s.slot, id: loss.s.id, level: loss.s.level, cashPerMin: loss.r });
    pool = pool.filter((s) => s !== loss.s);
  }
  for (const [k, e] of gone) barn[k] = e;
  fresh();
  const days = banishN <= banishLeft ? 0 : Math.ceil((banishN - banishLeft) / banishMax);

  // Speed trophies (rows 23, 25, 27, 29): bosses 1..N within S seconds of a reset. HP per colour tier of those bosses.
  const sprint = [5, 10, 15, 20].map((n) => ({ bosses: n, hp: Array.from({ length: 8 }, (_, t) =>
    Array.from({ length: n }, (_, k) => Number(H._customBlock_BossHPtot(k, t, 0, "0"))).reduce((a, b) => a + b, 0)) }));

  return {
    slots, used, free, unique, countinion, distinct: held.size, need, missing, coins, banishMax, banishLeft, families,
    steps, banish, banishShort: Math.max(0, banishN - banish.length), days, cashPerMin: base, cashLoss: base - was,
    cost: steps.reduce((t, s) => t + s.cost, 0), levelUps: steps.reduce((t, s) => t + s.levelUps, 0),
    sprint, sammich: MI("VendingCost", 10, 17),
  };
}
