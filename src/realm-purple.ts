// Purple loadout (scope #2614): Purple (tier 4) only takes Banish Bop hits (trait 28, Rainboppo; unstackable), each one
// the banished minion's BanishEXPgain (@6636612). BanishEXPgain (@6415061) = (5 + (10·max(0, log10(spent) − 4))² + spent^0.4)
// × (1 + Riftseeker total/100) × (1 + Intellingo/100). Riftseeker (trait 22, +150 a carrier) STACKS (TraitTypes "yes") and
// every Horn Hippo-line minion carries it (Horn Hippo, Rainboppo, Hippemo), so the loadout is: one Rainboppo, the rest of the
// barn Horn Hippos, the coins in one banish target. Purple HP is BossHPtot(k, 4) and scales with Realm EXP needed ([2]).
// Each number below re-runs the game's blocks on the changed barn.
// ponytail: summon/level costs of the Horn Hippos are not subtracted (~1e8 each, nothing next to the target's coins); the
// target is banish-protected with Orb energy to keep it (PROTECT_COST): modelled in purpleTargets().sequence, not here.
import { loadBundle } from "./game-eval";
import { realmHost } from "./realm-combat";
import realm from "../web/src/data/realm.json";
import { barnPos, tierDps, traitsOf, type Combat } from "../web/src/modules/realm/realm";

type Save = Record<string, any>;
export function purpleLoadout(save: Save, src = loadBundle()) {
  const { A, H, MI, fresh } = realmHost(save, src);
  const rs = A.RealmStuff as any[], best = Number(rs[23]), coins = Number(rs[5]);
  fresh();
  const slots = MI("BarnSlots"), banishes = MI("TotalDailyBanishes");
  // the next Purple tiers past your best (a boss with no Purple tier has 0 HP there)
  const walls: { afterlife: number; hp: number }[] = [];
  for (let k = best; k < best + 60 && walls.length < 3; k++) { const hp = Number(H._customBlock_BossHPtot(k, 4, 0, "0")); if (hp > 0) walls.push({ afterlife: k + 1, hp }); }
  if (!walls.length) return null;
  const blank = () => ["none", 0, "none", 0, 0, 0, 0];
  /** Banish EXP of a target holding `spent` coins, with one Rainboppo and n Horn Hippos in the barn. */
  const hit = (n: number, spent: number) => {
    const barn = rs[3] as any[][];
    for (let i = 0; i < barn.length; i++) barn[i] = blank();
    barn[0] = ["MinionA0", 1, "none", 0, spent, 0, 0]; // the target: a Piggy holding the coins (any minion works)
    barn[1] = ["MinionA11", 200, "none", 3, 1e6, 0, 0];
    for (let i = 0; i < n; i++) barn[2 + i] = ["MinionA5", 50, "none", 2, 1e6, 0, 0];
    fresh();
    // the hit lands as CreateDmg(BanishEXPgain × ALLDMG, 4): × (1 + Refractile) on a non-Red colour
    return { exp: MI("BanishEXPgain", 0) * MI("ALLDMG") * (1 + Number(H._customBlock_BlessingBonus(20)) / 100), riftseeker: MI("MinionTraitALL", 22) };
  };
  const full = Math.max(0, slots - 2), wall = walls[0]!;
  const top = hit(full, coins);
  // fewest Horn Hippos that one-shot the next wall with all coins in the target
  let lo = 0, hi = full;
  if (top.exp >= wall.hp) { while (lo < hi) { const mid = (lo + hi) >> 1; if (hit(mid, coins).exp >= wall.hp) hi = mid; else lo = mid + 1; } }
  const minHippos = top.exp >= wall.hp ? lo : null;
  // fewest coins in the target that one-shot it with a full barn of Horn Hippos (bisection in log space)
  let cl = 0, ch = Math.log10(Math.max(10, coins));
  if (top.exp >= wall.hp) for (let i = 0; i < 60; i++) { const m = (cl + ch) / 2; if (hit(full, 10 ** m).exp >= wall.hp) ch = m; else cl = m; }
  const minCoins = top.exp >= wall.hp ? 10 ** ch : null;
  return { walls, slots, banishes, coins, full, fullHit: top.exp, riftseeker: top.riftseeker, minHippos, minCoins,
    hitsPerWall: walls.map((w) => Math.ceil(w.hp / top.exp)) };
}

/** Orb power loadout: MinionORBCHARGE (@6408132) = (Charger trait 4 + Spare Charge 49) × (1 + fruit 9 bonus), per minion, an
 *  hour. Neither term depends on level or coins spent, so the loadout is just "every slot a Lizard-line minion". */
export function orbLoadout(save: Save, src = loadBundle()) {
  const { A, MI, fresh } = realmHost(save, src);
  const rs = A.RealmStuff as any[], barn = rs[3] as any[][];
  fresh();
  const slots = MI("BarnSlots"), cap = MI("OrbEnergyCap"), energy = Number(rs[26]);
  let perHourNow = 0; barn.forEach((s, i) => { if (s[0] !== "none") perHourNow += MI("MinionORBCHARGE", i); });
  const probe = (id: string) => { const old = barn[0]; barn[0] = [id, 10, "none", 1, 0, 0, 0]; fresh(); const v = MI("MinionORBCHARGE", 0); barn[0] = old; return v; };
  const lizard = probe("MinionC8"), other = probe("MinionA2");
  // Flowers: MinionFieldGen (@6438481) = 100 × Field Bloomer (trait 53, the Ogre-family passive) × (1 + FieldTraitBonusQTY/100),
  // an hour per minion; also flat in level and coins, so the flower loadout is every slot an Ogre-family minion.
  const gen = (id: string) => { const old = barn[0]; barn[0] = [id, 1, "none", 0, 0, 0, 0]; fresh(); const v = MI("MinionFieldGen", 0); barn[0] = old; return v; };
  fresh();
  let flowersNow = 0; barn.forEach((s, i) => { if (s[0] !== "none") flowersNow += MI("MinionFieldGen", i); });
  const perOgre = gen("MinionD0");
  const flowers = { perOgre, full: slots * perOgre, now: flowersNow, held: Number(rs[36]), summon: MI("NewMinionPortal", 3) };
  return { slots, cap, energy, perHourNow, lizard, other, fullLizards: slots * lizard, fullOther: slots * other, flowers,
    costs: { laser: MI("OrbCost", 1), protect: MI("OrbCost", 3), coinBuy: MI("OrbCost", 5) } };
}

/** Purple tab (the author 2026-10-21): every Purple boss ahead and the barn minion to pour coins into and banish for it. A banish
 *  deals BanishEXPgain (@6415061) from the TARGET's coins spent (s[4]) only; its type does not matter, so the best target is
 *  the one whose loss costs the fewest coins/min (its traits leave with it, Bless Updog etc. included) and that can take the
 *  coins: a minion short of its final stage stops at its evolve cap (EVO 10/50/200), a final-stage one has no level cap.
 *  Rainboppos (Banish Bop, trait 28) are never targets: without one Purple takes no damage.
 *  ponytail: one target per boss; several banishes on one boss = that many targets, each priced on its own (greedy). */
export function purpleTargets(save: Save, src = loadBundle(), combat?: Combat) {
  const { A, H, MI, fresh } = realmHost(save, src);
  const rs = A.RealmStuff as any[], barn = rs[3] as any[][], coins = Number(rs[5]);
  const EVO = [10, 50, 200], M = (realm as any).minions as Record<string, { name: string; evo: string[] }>;
  const rate = () => { fresh(); let t = 0; barn.forEach((s, i) => { if (s[0] !== "none") t += MI("MinionCASH", i) * (1 + Math.min(1, Math.max(0, MI("MinionTraitALL", i) / 100))); }); return t; };
  fresh();
  const bop = MI("MinionTraitALL", 28) > 0.5, banishes = Math.max(0, MI("TotalDailyBanishes") - Number(rs[22]));
  type Cand = { slot: number; id: string; name: string; spent: number; room: number; loss: number; exp: number };
  /** Every banish target in the barn as it stands: coin rate lost without it, coins it can still take, its banish damage now. */
  const survey = () => {
    const base = rate();
    // A banish hits Purple for CreateDmg(BanishEXPgain × ALLDMG, 4): colour ≠ Red, so × (1 + Refractile, BlessingBonus 20).
    fresh(); const dmgMult = MI("ALLDMG") * (1 + Number(H._customBlock_BlessingBonus(20)) / 100);
    const cands: Cand[] = barn.flatMap((s, slot) => {
      if (s[0] === "none" || traitsOf(String(s[0])).has(28)) return [];
      const old = s.slice(); barn[slot] = ["none", 0, "none", 0, 0, 0, 0]; const loss = base - rate(); barn[slot] = old; fresh();
      // coins it can still take: unlimited at its final stage, else the cost of levels up to its evolve cap
      let room = Infinity;
      if (M[s[0]]?.evo?.length) { room = 0; const sv = s.slice(); for (fresh(); s[1] < EVO[s[3]]!; ) { const c = MI("MinionUpgCost", slot); room += c; s[1] += 1; s[4] += c; } barn[slot] = sv; fresh(); }
      return [{ slot, id: String(s[0]), name: M[s[0]]?.name ?? String(s[0]), spent: Number(s[4]), room, loss, exp: MI("BanishEXPgain", slot) * dmgMult }];
    });
    // EXP depends on the target only through its coins spent (the multipliers are barn-wide), so one bisection per HP gives the
    // coins spent every target needs; a target's add is that minus what it has already spent.
    const probe = cands[0]?.slot ?? 0, s0 = barn[probe]!, sp0 = s0[4];
    const at = (sp: number) => { s0[4] = sp; fresh(); const v = MI("BanishEXPgain", probe) * dmgMult; s0[4] = sp0; return v; };
    const needSpent = (hp: number) => { let lo = 0, hi = 10; while (at(10 ** hi) < hp && hi < 400) hi += 10;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(10 ** m) >= hp) hi = m; else lo = m; } fresh(); return 10 ** hi; };
    return { base, cands, needSpent };
  };
  const row = (c: Cand, base: number, extra: Record<string, unknown> = {}) => ({ name: c.name, pos: barnPos(c.slot), loss: c.loss / base, ...extra });
  /** The cheapest way to put `hp` Purple damage in: one banish with coins poured in first (the add must fit `coinsLeft` and the
   *  target's evolve cap), or several banishes on coins already spent, best EXP per coin/min lost first, within `banishLeft`.
   *  ponytail: greedy ratio, losses summed as if independent (removing two minions can cost more than the two apart). */
  const choose = (hp: number, sv: ReturnType<typeof survey>, coinsLeft: number, banishLeft: number) => {
    const { base, cands } = sv, S = sv.needSpent(hp);
    const single = banishLeft < 1 ? [] : cands.map((c) => ({ c, add: Math.max(0, S - c.spent) })).filter((x) => x.add <= Math.min(coinsLeft, x.c.room))
      .sort((a, b) => a.c.loss - b.c.loss || a.add - b.add);
    const byRatio = [...cands].sort((a, b) => b.exp / Math.max(a.loss, 1e-300) - a.exp / Math.max(b.loss, 1e-300));
    const picked: Cand[] = []; let sum = 0;
    for (const c of byRatio) { if (picked.length >= banishLeft) break; picked.push(c); sum += c.exp; if (sum >= hp) break; }
    const multi = sum >= hp ? { n: picked.length, loss: picked.reduce((t, c) => t + c.loss, 0) / base, targets: picked.map((c) => row(c, base, { exp: c.exp })), slots: picked.map((c) => c.slot) } : null;
    const a = single[0];
    return { needSpent: S, single: a ? row(a.c, base, { add: a.add }) : null, singleSlot: a?.c.slot, alt: single.slice(1, 3).map((x) => row(x.c, base, { add: x.add })), multi,
      best: (a && (!multi || a.c.loss / base <= multi.loss) ? "single" : multi ? "multi" : null) as "single" | "multi" | null };
  };
  const beaten = Number(rs[6]), best = Number(rs[23]), walls: { afterlife: number; hp: number }[] = [];
  for (let k = beaten; k < best + 40 && walls.length < 10; k++) { const hp = Number(H._customBlock_BossHPtot(k, 4, 0, "0")); if (hp > 0) walls.push({ afterlife: k + 1, hp }); }
  // Each boss on today's barn, independently.
  const sv0 = survey();
  const rows = walls.map((w) => { const c = choose(w.hp, sv0, coins, banishes); const { singleSlot: _, ...o } = c; return { ...w, ...o, multi: o.multi && { ...o.multi, slots: undefined } }; });
  // The run in order (the author 2026-10-21, "sequence the run"): each boss's banishes leave the barn before the next is planned, the
  // poured coins leave the purse, today's banishes count down. ponytail: no coin income between bosses (conservative).
  // Banish-protect (Orb Tower, OrbCost 3 = 25 energy a charge, RealmStuff[32]; buyable once the Orb has 2 expansions,
  // RealmStuff[25] ≥ 2, no charge cap): a protected banish deals its damage and keeps the minion, so one big target can hit
  // boss after boss for nothing but energy. ponytail: no energy income between bosses (Lizards' Charger refills it).
  fresh();
  const protCost = MI("OrbCost", 3), canBuy = Number(rs[25]) >= 2, charges = Number(rs[32]), energy = Number(rs[26]);
  // Energy income (the author 2026-10-21): the Orb charges per hour (Σ MinionORBCHARGE) while each boss's other colours are fought, up to
  // OrbEnergyCap; Blue's laser spends laserCost a 10 s shot. Times need the combat model (tierDps); without it, no income.
  // ponytail: Red/Orange/Yellow/Blue only (Pink+ ignored), dps from today's barn even after banishes, energy not spent on protects
  // stays for Blue first.
  const regen = barn.reduce((t, s2, i) => t + (s2[0] !== "none" ? MI("MinionORBCHARGE", i) : 0), 0), cap = MI("OrbEnergyCap");
  const between = (k: number) => { // seconds fighting boss k's non-Purple tiers, and the laser energy Blue takes
    if (!combat) return { sec: 0, laser: 0 };
    const hp = (t: number) => Number(H._customBlock_BossHPtot(k, t, 0, "0")); let sec = 0, laser = 0;
    for (const t of [0, 1, 2]) { const h = hp(t); if (h > 0) { const d = tierDps(combat, t); sec += d > 0 ? h / d : 0; } }
    const hb = hp(3); if (hb > 0 && combat.laserPerSec > 0) { const shots = Math.ceil(hb / (10 * combat.laserPerSec)); laser = shots * combat.laserCost; sec += hb / combat.laserPerSec; }
    return { sec, laser };
  };
  let energyLeft = energy, chargesLeft = charges, prevK = beaten - 1;
  const protectsNow = () => chargesLeft + (canBuy ? Math.floor(energyLeft / protCost) : 0);
  let protectLeft = protectsNow();
  const sequence: any[] = []; let coinsLeft = coins, banishLeft = banishes;
  const saved = barn.map((s) => s.slice());
  for (const w of walls) {
    let gained = 0;
    // bosses before this one in full; this boss's Blue and below come after its Purple (tiers fall top-down), so next time
    for (let k = prevK + 1; k <= w.afterlife - 2; k++) { const b = between(k); const add = regen * b.sec / 3600; gained += add; energyLeft = Math.min(cap, Math.max(0, energyLeft + add - b.laser)); }
    prevK = w.afterlife - 2; protectLeft = protectsNow();
    const sv = survey(), base0 = sv.base;
    // Protected first: the fewest banishes (then the least poured) that one target can deal, kept afterwards. When the energy
    // falls short but the Orb can buy charges, WAIT for it (the author 2026-10-21, "model waiting"): the step says how long, and what
    // the sacrifice it replaces would have cost. ponytail: always waits rather than sacrifice; the cap bounds what one wait holds.
    const S = sv.needSpent(w.hp), canWait = canBuy && regen > 0;
    const lim = Math.min(canWait ? Infinity : protectLeft, banishLeft);
    const opts = banishLeft < 1 ? [] : sv.cands.flatMap((c) => {
      const add = Math.max(0, S - c.spent), one = add <= Math.min(coinsLeft, c.room) ? [{ c, n: 1, add }] : [];
      const n = Math.ceil(w.hp / Math.max(c.exp, 1e-300)); return [...one, ...(n <= lim ? [{ c, n, add: 0 }] : [])];
    }).filter((o) => o.n <= lim && (o.n - chargesLeft) * protCost <= cap).sort((a, b) => a.n - b.n || a.add - b.add || a.c.loss - b.c.loss);
    const o = opts[0];
    if (o) {
      const need = Math.max(0, (o.n - chargesLeft) * protCost - energyLeft), wait = need > 0 ? (need / regen) * 3600 : 0;
      const instead = wait > 0 ? choose(w.hp, sv, coinsLeft, banishLeft) : null;
      energyLeft += need;
      const s = barn[o.c.slot]!; s[4] = Number(s[4]) + o.add; coinsLeft -= o.add; banishLeft -= o.n;
      const fromCharges = Math.min(chargesLeft, o.n); chargesLeft -= fromCharges; energyLeft -= (o.n - fromCharges) * protCost; protectLeft = protectsNow();
      sequence.push({ ...w, best: "protected", targets: [row(o.c, base0)], poured: o.add, banishes: o.n, protects: o.n, energyAfter: energyLeft, gained, wait,
        saves: instead?.best === "single" ? instead.single!.loss : instead?.best === "multi" ? instead.multi!.loss : null, rateLeft: rate() / sv0.base, stepLoss: 0 });
      continue;
    }
    const c = choose(w.hp, sv, coinsLeft, banishLeft);
    if (!c.best) { sequence.push({ ...w, stop: banishLeft < 1 ? "no banishes left today" : protectLeft < 1 ? "nothing left in the barn reaches it, and no protect charges left" : "nothing left in the barn reaches it" }); break; }
    const slots = c.best === "single" ? [c.singleSlot!] : c.multi!.slots;
    if (c.best === "single") { const s = barn[c.singleSlot!]!; s[4] = Number(s[4]) + c.single!.add!; coinsLeft -= c.single!.add!; }
    for (const sl of slots) barn[sl] = ["none", 0, "none", 0, 0, 0, 0];
    banishLeft -= slots.length; const after = rate();
    sequence.push({ ...w, best: c.best, targets: c.best === "single" ? [c.single] : c.multi!.targets, poured: c.best === "single" ? c.single!.add : 0,
      banishes: slots.length, protects: 0, energyAfter: energyLeft, gained, rateLeft: after / sv0.base, stepLoss: 1 - after / base0 });
  }
  saved.forEach((s, i) => (barn[i] = s)); fresh();
  // Buy every charge the run uses before starting it: bought charges are kept, while energy left in the Orb goes to Blue's
  // laser between bosses, so one wait up front replaces the per-boss waits (and is never longer than their sum).
  const protects = sequence.reduce((t, q) => t + (q.protects ?? 0), 0), toBuy = Math.max(0, protects - charges);
  const upfront = canBuy && regen > 0 && toBuy > 0 ? { buy: toBuy, wait: Math.max(0, toBuy * protCost - energy) / regen * 3600, fits: toBuy * protCost <= cap } : null;
  return { bop, banishes, coins, rows, sequence, protect: { charges, energy, cost: protCost, canBuy, total: charges + (canBuy ? Math.floor(energy / protCost) : 0), regen, cap, timed: !!combat, upfront } };
}
