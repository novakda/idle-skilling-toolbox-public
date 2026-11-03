// Realm coin income from the game's own code (#23, "maximise coins"). Coins have one income: every 60 s on the Realm screen
// (RealmStuff[21] counts down 0.1 a 100 ms tick, @6606285) each barn minion with Coin Pressing (trait 7) adds MinionCASH
// (@6406235), doubled when randomFloat() < MinionTraitALL(slot, 48)/100 (@6606733). MinionTraitALL keys on its first argument
// only (@6441079), so that roll reads the barn's total of the trait whose id is the minion's SLOT INDEX, not Cash Genesis (48):
// where a coin minion sits decides its 2× chance. Away time pays the same in whole minutes on return (@6574387). Nothing in it
// reads boss HP or damage. Each lever below re-runs the game's blocks with one change to the save, so gains are the game's formula.
import { loadBundle } from "./game-eval";
import { realmHost } from "./realm-combat";
import realm from "../web/src/data/realm.json";
import { barnPos } from "../web/src/realm";
import { FAMILIES, pathDown, stageOf } from "./realm-trophies";

type Save = Record<string, any>;
/** `steps`: a long lever's instructions as a table (the page opens it in a dialog); `do` stays a one-line summary. */
export type Steps = { cols: string[]; rows: (string | number)[][] };
export type CoinLever = { do: string; cost: number; currency: "coins" | "energy" | "spirals" | "none"; afford: boolean; rate: number; note?: string; steps?: Steps };
const R = realm as unknown as { minions: Record<string, { name: string }>; traits: Record<string, { name: string; value?: number }> };
const EVO = [10, 50, 200]; // MinionInfo "Evo": level cap per evolution stage
/** "Piggy → Hippo (evolve at Lv10) → Horn Hippo (at Lv50)": summon the family root, level to each stage cap, evolve. */
const evoPath = (id: string) => { const root = id.replace(/\d+$/, "0"), path = [root, ...pathDown(root, id)];
  return path.map((m, k) => (k === 0 ? R.minions[m]!.name : `${R.minions[m]!.name} (evolve at Lv${EVO[k - 1]})`)).join(" → "); };

export function realmCoins(save: Save, src = loadBundle()) {
  const { A, H, MI, fresh } = realmHost(save, src); // blocks cache in DNSM; fresh() after every change
  const rs = A.RealmStuff as any[];
  const minions = () => {
    fresh();
    return (rs[3] as any[][]).flatMap((s, slot) => {
      if (s[0] === "none") return [];
      const cash = MI("MinionCASH", slot), double = Math.min(1, Math.max(0, MI("MinionTraitALL", slot) / 100));
      return [{ slot, id: String(s[0]), name: R.minions[s[0]]?.name ?? String(s[0]), level: Number(s[1]), spent: Number(s[4]), cash, double, perMin: cash * (1 + double) }];
    });
  };
  const rate = () => minions().reduce((t, m) => t + m.perMin, 0);
  type Undo = () => void;
  /** Rate with the changes applied, then undone (last first). */
  const tryIt = (...changes: (() => Undo)[]) => { const undo = changes.map((c) => c()); const r = rate(); undo.reverse().forEach((u) => u()); fresh(); return r; };
  const set = (o: any, k: string | number, v: any) => (): Undo => { const old = o[k]; o[k] = v; return () => { o[k] = old; }; };

  const now = minions(), perMin = now.reduce((t, m) => t + m.perMin, 0), earners = now.filter((m) => m.cash > 0);
  fresh();
  const parts = {
    allCash: MI("AllCashBonus", 0), makeItRain: MI("MinionTraitALL", 8), smartMoney: MI("MinionTraitALL", 31), taxCollector: MI("MinionTraitALL", 32),
    goldBless: MI("MinionTraitALL", 39), smolCash: MI("MinionTraitALL", 56), bossPilfer: MI("MinionTraitALL", 37),
    refundPct: Math.min(50, MI("MinionTraitALL", 44) + Number(H._customBlock_BlessingBonus(11))), // share of each spend handed back (@6590500)
    awayPct: Number(H._customBlock_FruitBonusTypeT(14)), // away seconds × (1 + this/100) (@6574387)
  };
  const coins = Number(rs[5]), energy = Number(rs[26]), spirals = Number(rs[12]);
  const levers: CoinLever[] = [];
  const slotName = (slot: number) => R.minions[rs[3][slot][0]]?.name ?? String(rs[3][slot][0]);

  // 1. Put the biggest earners on the slots with the highest 2× chance (rearrangement inequality). A drag swaps two occupied
  //    slots (@6643803; an empty target is refused, "CantDragg"). Traits move with the minion, so each slot's chance stays.
  const arrange = (now: ReturnType<typeof minions>) => {
  const earners = now.filter((m) => m.cash > 0);
  const chance = new Map(now.map((m) => [m.slot, m.double]));
  const arr = (rs[3] as any[]).slice(), free = new Set(now.map((m) => m.slot)), moves: (string | number)[][] = [];
  const pairs: [number, number][] = [];
  for (const e of [...earners].sort((a, b) => b.cash - a.cash)) {
    const from = arr.indexOf(rs[3][e.slot]), top = Math.max(...[...free].map((x) => chance.get(x)!));
    const to = chance.get(from) === top && free.has(from) ? from : [...free].find((x) => chance.get(x) === top)!;
    free.delete(to);
    if (from !== to) { pairs.push([from, to]); moves.push([e.name, barnPos(from), barnPos(to), `${Math.round(100 * chance.get(from)!)}% → ${Math.round(100 * top)}%`]); [arr[from], arr[to]] = [arr[to], arr[from]]; }
  }
  const swap = (): Undo => { const before = (rs[3] as any[]).slice(); arr.forEach((x, i) => (rs[3][i] = x)); return () => before.forEach((x, i) => (rs[3][i] = x)); };
  // Coins after each drag, in order (the author 2026-10-21: "trim the drags"): the barn's rate × today's after drags 1..k, so the
  // dialog shows where the gain flattens. Swaps applied on the live barn one at a time, then undone.
  const before = (rs[3] as any[]).slice(), base = rate();
  pairs.forEach(([f, t], k) => { [rs[3][f], rs[3][t]] = [rs[3][t], rs[3][f]]; moves[k]!.push(`×${(rate() / base).toFixed(3)}`); });
  before.forEach((x, i) => (rs[3][i] = x)); fresh();
  return { moves, swap };
  };
  const { moves, swap } = arrange(now);
  if (moves.length) levers.push({ do: `Rearrange ${moves.length} minion${moves.length > 1 ? 's' : ''} in the barn, in the listed order (a drag swaps two minions, so later rows start where earlier drags left them)`, steps: { cols: ["Minion", "From", "To", "2× chance", "Coins × after this drag"], rows: moves }, cost: 0, currency: "none", afford: true, rate: tryIt(swap),
    note: "the 2× roll reads the barn total of the trait numbered like the slot †" });

  // 2. Spend the coins held on coin-minion levels, best gain per coin first. A level costs MinionUpgCost and adds that to the
  //    minion's coins spent (@6509750); MinionCASH = 10·(25 + 3·Lv·1.014^Lv) + √(coins spent), × the multipliers, so coins
  //    poured into a cheap minion pay most. ponytail: Doublepgrade / Gambol Hour procs and the spend refund are ignored.
  /** Equal marginal value (Lagrange): at the optimum every minion's last level buys the same coins/min per coin, λ. Each
   *  minion's level curve is tabulated once (cost and gain per level, up to its evolve cap or the budget), then λ is found by
   *  bisection so the levels it implies spend the budget. Mutates the barn to the chosen levels (the caller restores it);
   *  returns slot → [from Lv, to Lv] and the coins spent.
   *  ponytail: each curve is read with the other minions at their current levels, so barn-wide terms (total levels, trait 19)
   *  are frozen while tabulating; caches are cleared every 50 levels. Exact enough for a target barn, not to the coin. */
  const spendLevels = (on: { slot: number; double: number }[], budget: number) => {
    const curves = on.map((m) => {
      const s = rs[3][m.slot], lv0 = s[1], sp0 = s[4], steps: { c: number; r: number }[] = [];
      fresh(); let was = MI("MinionCASH", m.slot), cum = 0, r = Infinity;
      for (let n = 0; n < 100000 && s[1] < (EVO[s[3]] ?? Infinity); n++) {
        if (n % 50 === 49) fresh();
        const c = MI("MinionUpgCost", m.slot);
        if (!(cum + c <= budget)) break;
        s[1] += 1; s[4] += c; cum += c;
        const now = MI("MinionCASH", m.slot);
        r = Math.min(r, ((now - was) * (1 + m.double)) / c); // running min keeps the prefix rule exact
        if (!(r > 0)) break;
        steps.push({ c, r }); was = now;
      }
      s[1] = lv0; s[4] = sp0;
      return { m, lv0, steps };
    });
    const take = (lam: number) => curves.map((cv) => { let k = 0, cost = 0; while (k < cv.steps.length && cv.steps[k]!.r >= lam) cost += cv.steps[k++]!.c; return { k, cost }; });
    const total = (t: { cost: number }[]) => t.reduce((a, x) => a + x.cost, 0);
    let lo = Math.log(1e-300), hi = Math.log(Math.max(1e-300, ...curves.flatMap((cv) => cv.steps.map((x) => x.r))) * 2);
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (total(take(Math.exp(mid))) <= budget) hi = mid; else lo = mid; }
    const pick = take(Math.exp(hi)), plan = new Map<number, [number, number]>();
    // Top-up: the λ boundary leaves some coins over; buy the best next tabulated level that still fits, until none does.
    for (let left = budget - total(pick); ;) {
      let bi = -1;
      curves.forEach((cv, i) => { const st = cv.steps[pick[i]!.k]; if (st && st.c <= left && (bi < 0 || st.r > curves[bi]!.steps[pick[bi]!.k]!.r)) bi = i; });
      if (bi < 0) break;
      const st = curves[bi]!.steps[pick[bi]!.k]!; pick[bi]!.k++; pick[bi]!.cost += st.c; left -= st.c;
    }
    let spent = 0;
    curves.forEach((cv, i) => {
      const { k, cost } = pick[i]!; if (!k) return;
      const s = rs[3][cv.m.slot]; s[1] = cv.lv0 + k; s[4] += cost; spent += cost;
      plan.set(cv.m.slot, [cv.lv0, cv.lv0 + k]);
    });
    fresh();
    return { plan, spent };
  };
  const start = new Map(earners.map((m) => [m.slot, [m.level, m.spent]]));
  const { plan, spent: spentAll } = spendLevels(earners, coins);
  const end = new Map(earners.map((m) => [m.slot, [rs[3][m.slot][1], rs[3][m.slot][4]]]));
  const afterLevels = rate();
  const entries = (rs[3] as any[]).slice(); // the same slot objects the drag lever moves, so levels follow the minion
  const put = (v: Map<number, number[]>) => v.forEach(([lv, sp], slot) => { entries[slot][1] = lv; entries[slot][4] = sp; });
  put(start); fresh();
  const levels = (): Undo => { put(end); return () => put(start); };
  if (plan.size) levers.push({ do: `Spend your coins levelling ${plan.size} coin minion${plan.size > 1 ? 's' : ''}`, steps: { cols: ["Minion", "Barn (before any drag)", "From Lv", "To Lv"], rows: [...plan].map(([slot, [a, b]]) => [slotName(slot), barnPos(slot), a, b]) }, cost: spentAll, currency: "coins", afford: true, rate: afterLevels,
    note: "MinionCASH grows with √(coins spent on that minion) †" });

  // 3. Lil Chicken → Goose at Lv50: Goose carries Gold Bless (+250% coins per blessing you hold the most of) and lets an Orb
  //    reroll draw Gold Bless. ponytail: evolving modelled as keeping level and coins spent (stage + 1) †.
  const chick = earners.find((m) => m.id === "MinionC1");
  if (chick) {
    const s = rs[3][chick.slot]; let cost = 0;
    const toGoose = (): Undo => {
      const old = s.slice();
      for (fresh(); s[1] < 50; ) { const c = MI("MinionUpgCost", chick.slot); cost += c; s[1] += 1; s[4] += c; }
      s[0] = "MinionC3"; s[3] = Math.max(2, s[3]);
      return () => old.forEach((v: unknown, i: number) => (s[i] = v));
    };
    const r = tryIt(toGoose);
    levers.push({ do: `Level ${chick.name} Lv${chick.level} → 50 and evolve it into a Goose`, cost, currency: "coins", afford: cost <= coins, rate: r,
      note: "Goose also lets an Orb reroll draw Gold Bless" });
  }

  // 3b. Every Gobbo → Lizardman: Gobbo (MinionD1, stage 1) evolves at its Lv50 cap into MinionD1's evo[1] = Lizardman. The evolve
  //     click (@6627614) only rewrites the id and adds 1 to the stage: level and coins spent stay. Lizardman's parent is Gobbo, so
  //     it keeps Smol Cash (56) and adds Bless Updog (66, ×(1 + total/100) on the randolist[4] blessings, Dime Decisive among them).
  //     Cost: the level-ups to 50, MinionUpgCost per level (one Gobbo per distinct level, × how many sit at it).
  const gobbos = (rs[3] as any[][]).flatMap((s, slot) => (s[0] === "MinionD1" ? [slot] : []));
  let evolveGobbos: { count: number; cost: number; rate: number } | null = null;
  if (gobbos.length) {
    let cost = 0;
    const byLv = Map.groupBy(gobbos, (slot) => Number(rs[3][slot][1]));
    for (const [, slots] of byLv) {
      const s = rs[3][slots[0]!], lv0 = s[1];
      for (fresh(); s[1] < 50; ) { cost += MI("MinionUpgCost", slots[0]!) * slots.length; s[1] += 1; }
      s[1] = lv0;
    }
    const evolve = (): Undo => {
      const old = gobbos.map((slot) => rs[3][slot].slice());
      for (const slot of gobbos) { const s = rs[3][slot]; s[0] = "MinionD3"; s[1] = Math.max(50, s[1]); s[3] = 2; }
      return () => gobbos.forEach((slot, i) => old[i]!.forEach((v: unknown, j: number) => (rs[3][slot][j] = v)));
    };
    evolveGobbos = { count: gobbos.length, cost, rate: tryIt(evolve) };
    levers.push({ do: `Level all ${gobbos.length} Gobbos to Lv50 and evolve each into a Lizardman`, cost, currency: "coins", afford: cost <= coins, rate: evolveGobbos.rate,
      note: "keeps Smol Cash, adds Bless Updog (doubles Dime Decisive and most blessings); level and coins spent stay" });
  }

  // 3c. Fill the EMPTY barn slots with minion types not yet in the barn. Tax Collector (32) adds +% coins per UNIQUE type (CalcMisc
  //     UniqueBarnMinions, cached in DNSM so fresh() recounts). A type costs NewMinionPortal (flat per family, starts Lv1 @6650700)
  //     plus MinionUpgCost per level up to each evolve cap along the path root → type (an evolve keeps level and coins spent, stage + 1,
  //     @6627614). Cheapest first. ponytail: every new type is its own portal summon (evolving a spare into a type is not considered);
  //     MinionUpgCost is priced in the slot it will sit in, without the barn-wide reductions shifting as more minions arrive.
  const empties = (rs[3] as any[][]).slice(0, MI("BarnSlots")).flatMap((s, i) => (s[0] === "none" ? [i] : []));
  const climbTo = (slot: number, id: string) => { // build `id` from its family root in `slot`; returns the slot entry, the cost; leaves the slot as found
    const old = rs[3][slot], path = [id.replace(/\d+$/, "0"), ...pathDown(id.replace(/\d+$/, "0"), id)];
    const s = (rs[3][slot] = [path[0], 1, 0, 0, 0, 0, 0]); let cost = MI("NewMinionPortal", FAMILIES.indexOf(id[6]!));
    // MinionUpgCost (@6410500) reads the level straight from the barn; its cached terms (traits, unique types) change only on a
    // summon or evolve, so one fresh() per stage is the game's own value for every level (#2652).
    for (const next of path.slice(1)) { for (fresh(); s[1] < EVO[s[3]]!; ) { const c = MI("MinionUpgCost", slot); cost += c; s[1] += 1; s[4] += c; } s[0] = next; s[3] = stageOf(next); }
    rs[3][slot] = old; fresh();
    return { entry: s, cost };
  };
  const fillWith = (picks: { entry: any[]; cost: number }[]) => (): Undo => {
    const old = empties.map((i) => rs[3][i]); picks.forEach((p, k) => (rs[3][empties[k]!] = p.entry.slice())); fresh();
    return () => { empties.forEach((i, k) => (rs[3][i] = old[k])); };
  };
  let fillCands: { entry: any[]; cost: number }[] = [], fillCost = Infinity;
  let lizardComparison: { slots: number; cost: number; rate: number } | null = null; // reference point, not a lever
  if (empties.length) {
    const held = new Set((rs[3] as any[][]).map((s) => String(s[0])));
    const open = FAMILIES.slice(0, MI("SummonTypesUnlocked"));
    const cands = Object.keys(R.minions).filter((id) => open.includes(id[6]!) && !id.startsWith("MinionF") && !held.has(id))
      .map((id) => ({ id, ...climbTo(empties[0]!, id) })).sort((a, b) => a.cost - b.cost).slice(0, empties.length);
    if (cands.length) {
      const names = cands.map((c) => R.minions[c.id]!.name), cost = cands.reduce((t, c) => t + c.cost, 0), rate = tryIt(fillWith(cands));
      fillCands = cands; fillCost = cost;
      levers.push({ do: `Fill ${cands.length} empty barn slot${cands.length > 1 ? "s" : ""} with new minion types`, steps: { cols: ["Minion type", "Evolution path", "Cost (summon + levels)"], rows: cands.map((c, i) => [names[i]!, evoPath(c.id), c.cost >= 1e6 ? c.cost.toExponential(2) : Math.round(c.cost).toLocaleString()]) }, cost, currency: "coins", afford: cost <= coins, rate,
        note: "summon each at the Portal and level/evolve to the type; Tax Collector pays per unique type" });
    }
    // For comparison: the same slots filled with Lizardmen (MinionD3), 
    if (open.includes("D")) {
      const liz = climbTo(empties[0]!, "MinionD3"), n = empties.length, cost = liz.cost * n, rate = tryIt(fillWith(Array(n).fill(liz)));
      lizardComparison = { slots: n, cost, rate }; // one type repeated: only Lizardman's own traits count, no new Tax Collector types
    }
  }

  // 4. Orb Tower +10% coin gain (OrbCost 5 = 50 energy each, RealmStuff[46], @6930455): every buy the energy covers.
  fresh(); const orbBuy = MI("OrbCost", 5), buys = Math.floor(energy / orbBuy);
  levers.push({ do: `Orb Tower: buy +10% coin gain ×${Math.max(1, buys)} (${Number(rs[46])} → ${Number(rs[46]) + Math.max(1, buys)})`, cost: orbBuy * Math.max(1, buys), currency: "energy", afford: buys > 0,
    rate: tryIt(set(rs, 46, Number(rs[46]) + Math.max(1, buys))), note: "no buy cap (needs 4 expansions, @6930455); energy also pays the Blue laser and banish-protect" });
  // 5. Orb Tower trait (RealmStuff[31]) as each coin trait: the page adds the reroll odds (orbRerollOdds).
  for (const t of [8, 31, 39]) if (Number(rs[31]) !== t)
    levers.push({ do: `Orb Tower trait ${R.traits[t]?.name} (now ${R.traits[rs[31]]?.name ?? "none"})`, cost: 15, currency: "energy", afford: false, rate: tryIt(set(rs, 31, t)), note: `orb:${t}` });
  // 6. Vending Choccy Coin +1: AllCashBonus × min(1.25, 1 + 0.6·bonus%)^best afterlife (@6403149). Cost VendingCost(3).
  fresh(); const choccy = MI("VendingCost", 3);
  levers.push({ do: `Vending: Choccy Coin Lv${rs[8][3]} → ${Number(rs[8][3]) + 1}`, cost: choccy, currency: "coins", afford: choccy <= coins, rate: tryIt(set(rs[8], 3, Number(rs[8][3]) + 1)) });
  // 7. Shrine Sahaja +1: AllCashBonus × (1 + Sahaja%)^best afterlife. Cost ShrineUpgCost(5) Spirals.
  fresh(); const sahaja = MI("ShrineUpgCost", 5);
  if (Number(rs[13][5]) < MI("ShrineMaxLV", 5))
    levers.push({ do: `Shrine: Sahaja Lv${rs[13][5]} → ${Number(rs[13][5]) + 1}`, cost: sahaja, currency: "spirals", afford: sahaja <= spirals, rate: tryIt(set(rs[13], 5, Number(rs[13][5]) + 1)) });
  // 8. A new best Afterlife: Choccy Coin, Sahaja and smithing item 95 each multiply once per best afterlife (RealmStuff[23]).
  levers.push({ do: `Reach a new best Afterlife (${Number(rs[23]) + 2})`, cost: 0, currency: "none", afford: false, rate: tryIt(set(rs, 23, Number(rs[23]) + 1)), note: "Choccy Coin, Sahaja and smithing scale per best afterlife" });
  // 9. Smart Money pays per 5 Realm levels (perRealmLV(5) = floor(Lv/5)).
  if (parts.smartMoney > 0) { const next = 5 * (Math.floor(Number(rs[0]) / 5) + 1); levers.push({ do: `Realm Lv${next}`, cost: 0, currency: "none", afford: false, rate: tryIt(set(rs, 0, next)), note: "Smart Money: +% per 5 Realm Lv" }); }
  // 10. One more pick of each coin blessing (BlessingBonus 2/17/25): offered at random after a boss kill.
  for (const [k, nm] of [["b", "Penny Thought"], ["q", "Dime Decisive"], ["y", "Banked Bygone"]] as const) {
    const m = rs[11], had = k in m.h, old = m.h[k];
    levers.push({ do: `Pick ${nm} when a boss kill offers it`, cost: 0, currency: "none", afford: false, note: "blessing",
      rate: tryIt(() => { m.h[k] = Number(old ?? 0) + 1; return () => { if (had) m.h[k] = old; else delete m.h[k]; }; }) });
  }
  // Everything affordable now at once (slot drags + levels + Orb buys).
  const allNow = tryIt(swap, levels, set(rs, 46, Number(rs[46]) + buys), ...(fillCost <= coins ? [fillWith(fillCands)] : []));

  // Coin loadout: the empty slots filled with the new types (when affordable), then every remaining coin spent on levels across
  // all coin minions, new ones included, on the game's MinionCASH. One barn to aim for, not a ranked list of separate levers.
  // Fill (the author 2026-10-21): each empty slot, one at a time, with the type that raises coins most once the rest of the coins go on
  // levels: any unlocked type, new or a repeat. Candidates are ranked by the barn's rate with the type placed (Tax Collector's
  // unique count included), then the top 3 re-scored with the level spend. ponytail: greedy slot by slot, top-3 rescoring only.
  const pickFill = () => {
    if (!empties.length) return { picks: [] as { id: string; cost: number; gain: number }[], cost: 0, undo: () => {} };
    const open = FAMILIES.slice(0, MI("SummonTypesUnlocked"));
    const built = Object.keys(R.minions).filter((id) => open.includes(id[6]!) && !id.startsWith("MinionF")).map((id) => ({ id, ...climbTo(empties[0]!, id) }));
    const olds = empties.map((i) => rs[3][i]), picks: { id: string; cost: number; gain: number }[] = [];
    let left = coins;
    const withLevels = () => {
      const all = minions().filter((m) => m.cash > 0), snap = all.map((m) => [m.slot, rs[3][m.slot][1], rs[3][m.slot][4]] as const);
      spendLevels(all, left); const r = rate();
      for (const [slot, lv, sp] of snap) { rs[3][slot][1] = lv; rs[3][slot][4] = sp; }
      fresh(); return r;
    };
    for (const slot of empties) {
      const placed = (b: { entry: any[] }) => { rs[3][slot] = b.entry.slice(); const r = rate(); rs[3][slot] = olds[empties.indexOf(slot)]; fresh(); return r; };
      const base = rate();
      const top = built.filter((b) => b.cost <= left).map((b) => ({ b, r: placed(b) })).sort((x, y) => y.r - x.r).slice(0, 3);
      if (!top.length || top[0]!.r <= base) break;
      let best = top[0]!, bestR = -Infinity;
      for (const c of top) { rs[3][slot] = c.b.entry.slice(); left -= c.b.cost; const r = withLevels(); left += c.b.cost; rs[3][slot] = olds[empties.indexOf(slot)]; fresh(); if (r > bestR) { bestR = r; best = c; } }
      rs[3][slot] = best.b.entry.slice(); fresh(); left -= best.b.cost; picks.push({ id: best.b.id, cost: best.b.cost, gain: best.r / base });
    }
    return { picks, cost: picks.reduce((t, p) => t + p.cost, 0), undo: () => { empties.forEach((i, k) => (rs[3][i] = olds[k])); fresh(); } };
  };
  const loadout = (() => {
    const fill = pickFill(), filled = fill.picks.length > 0;
    const drag = arrange(minions()), undoDrag = drag.swap(); // after the fill, so new minions get the best 2× slots too
    fresh();
    const all = minions().filter((m) => m.cash > 0);
    const snap = all.map((m) => [m.slot, rs[3][m.slot][1], rs[3][m.slot][4]] as const);
    const { plan, spent } = spendLevels(all, coins - fill.cost);
    const orbUndo = buys > 0 ? set(rs, 46, Number(rs[46]) + buys)() : null; // the Orb +10% coin buys the energy covers
    const r = rate();
    orbUndo?.();
    const levels = [...plan].map(([slot, [a, b]]) => [slotName(slot), barnPos(slot), a, b]);
    for (const [slot, lv, sp] of snap) { rs[3][slot][1] = lv; rs[3][slot][4] = sp; }
    undoDrag(); fill.undo();
    return { rate: r, cost: fill.cost + spent, coins, orbBuys: buys, moves: drag.moves,
      fill: fill.picks.map((c) => [R.minions[c.id]!.name, evoPath(c.id), c.cost >= 1e6 ? c.cost.toExponential(2) : Math.round(c.cost).toLocaleString(), `×${c.gain.toFixed(2)}`]), fillCost: filled ? fill.cost : 0, levels };
  })();

  // Resetti (trait 29, Blaken Gold): ShrineResetQTY × (1 + Σ Resetti/100), +40 per carrier, additive (MinionTraitALL sums it;
  // checked 0-5 copies 2026-10-21). The reset wipes coins and minions, so a Blaken Gold built in an empty slot just before it
  // costs only coins the reset would take anyway. ponytail: every copy priced like the first (barn-wide cost shifts ignored).
  const resetti = (() => {
    if (!empties.length) return null;
    const per = MI("ShrineResetQTY") / (1 + MI("MinionTraitALL", 29) / 100) * (R.traits[29]?.value ?? 40) / 100;
    const cost = climbTo(empties[0]!, "MinionC14").cost;
    return { perCopy: per, cost, empties: empties.length, path: evoPath("MinionC14"), copies: Math.min(empties.length, Math.floor(coins / cost)) };
  })();

  return { perMin, coins, energy, spirals, minions: earners, parts, levers, allNow, evolveGobbos, lizardComparison, loadout, resetti };
}
export type RealmCoins = ReturnType<typeof realmCoins>;
