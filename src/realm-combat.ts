// Realm combat from the game's own code (#23): each barn minion's damage, crit, attack speed and multihit, the colour each hit
// lands on, the Orb Tower laser and energy income, banish Purple damage, and boss HP per colour tier, all by running the game's
// MinionInfo / BlessingBonus / BossHPtot blocks (ActorEvents_1488) against a save. Written to data/realm-combat.json (gitignored,
// dev only, like perk-impacts.json); the Realm tab's stage table turns it into time per stage. Refreshed by src/live-save.ts.
// Usage: bun src/realm-combat.ts [--save data/save.json]
import { existsSync, readFileSync, writeFileSync } from "fs";
import { DERIVED, fingerprint } from "./card-fingerprint";
import { blockHost, haxeMap, loadBundle, type Attrs } from "./game-eval";
import { realmCoins } from "./realm-coins";
import { realmStats } from "./realm-stats";
import { realmTrophies } from "./realm-trophies";
import { sprintPlans } from "./realm-sprint";
import { orbLoadout, purpleLoadout, purpleTargets } from "./realm-purple";
import { coinLoop } from "./realm-coinloop";

type Save = Record<string, any>;
// Haxe maps (RealmStuff[11] blessings, DNSM scratch) need keys()/exists; arrays stay arrays. keys() is a Haxe iterator
// (hasNext/next): MostBlessings walks RealmStuff[11] with it.
export const wrap = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(wrap);
  if (v && typeof v === "object") {
    const m: any = haxeMap(); for (const [k, x] of Object.entries(v)) m.h[k] = wrap(x);
    m.keys = () => { const ks = Object.keys(m.h); let i = 0; return { hasNext: () => i < ks.length, next: () => ks[i++] }; };
    return m;
  }
  return v;
};
// Stencyl's Utils (`ge`): the blocks call contains/mapCount; unbound it resolves to the inert proxy and every trait test passes.
export const ge = { contains: (a: unknown[] | null, t: unknown) => a != null && a.includes(t), mapCount: (m: { h: object }) => Object.keys(m.h).length };

/** The game's blocks over a copy of the save: `A` (the wrapped attributes), `H` (the block host), `MI` (MinionInfo as a number)
 *  and `fresh()`, which empties DNSM (the per-frame cache the blocks fill) and resets the all-minion trait cache, as the game
 *  does before a read. TraitList (@6451390) is memoised by minion id: it reads only the id's ancestry (MinionDatabase), the Orb
 *  trait [31] and the Field plots [35], nothing else reads its DNSM scratch, and every barn-wide block (MinionTraitALL, MinionTrait,
 *  so MinionCASH and MinionUpgCost) runs it once per slot: it was ~80% of a realm-combat refresh (#2652). */
export function realmHost(save: Save, src = loadBundle()) {
  const A: Attrs = {};
  for (const [k, v] of Object.entries(save)) A[k] = wrap(v);
  A.DNSM = haxeMap();
  const H = blockHost(src, A, { ge }) as any;
  const traitList = H._customBlock_TraitList as (slot: number) => number[], memo = new Map<string, number[]>();
  let orb: unknown, field: unknown[] = [];
  const stale = (rs: any[]) => { const f = rs[35] ?? []; if (rs[31] !== orb || f.length !== field.length) return true; for (let i = 0; i < f.length; i++) if (f[i] !== field[i]) return true; return false; };
  H._customBlock_TraitList = (slot: number) => {
    const rs = A.RealmStuff as any[], id = String(rs[3][slot][0]);
    if (stale(rs)) { memo.clear(); orb = rs[31]; field = [...(rs[35] ?? [])]; }
    let t = memo.get(id); if (!t) memo.set(id, (t = traitList(slot))); return t;
  };
  const MI = (k: string, a = 0, n = 0) => Number(H._customBlock_MinionInfo(k, a, n));
  const fresh = () => { A.DNSM = haxeMap(); MI("MinionTraitALL", -1); };
  return { A, H, MI, fresh };
}

export function realmCombat(save: Save, src = loadBundle()) {
  const { H, MI } = realmHost(save, src);
  MI("MinionTraitALL", -1); // resets the all-minion trait cache, as the game does before reading it
  const rs = save.RealmStuff as any[];
  const base = Number(H._customBlock_CalcMisc("BaseMinionAtkSpdSEC", 0, 0)); // 20 s
  const minions = (rs[3] as any[][]).flatMap((s, slot) => s[0] === "none" ? [] : [{
    slot, id: String(s[0]), level: Number(s[1]),
    attacks: MI("DoesMinionAttack", slot) > 0.1, orange: MI("MinionTrait", slot, 2) >= 1,
    dmg: MI("MinionDMG", slot), crit: MI("MinionCritChance", slot), critDmg: MI("MinionCritDmg", slot),
    atkSpeed: MI("MinionAtkSpeedPCT", slot), multihit: MI("MinionMultihit", slot),
    orbCharge: MI("MinionORBCHARGE", slot), banishExp: MI("BanishEXPgain", slot), spent: Number(s[4]), // coins spent on it (BanishEXPgain reads it)
  }]);
  const beaten = Number(rs[6]);
  // Boss HP per tier for this and the next bosses (BossHPtot(bosses beaten, tier)); Purple scales with RealmStuff[2].
  const bosses = Array.from({ length: 40 }, (_, k) => Array.from({ length: 8 }, (_, t) => Number(H._customBlock_BossHPtot(beaten + k, t, 0, "0"))));
  return {
    generated: new Date().toISOString(), beaten, baseAtkSec: base,
    redMult: 1 + Number(H._customBlock_BlessingBonus(7)) / 100, // CreateDmg: Red hits × (1 + Crimsonile); other colours × (1 + Refractile)
    otherMult: 1 + Number(H._customBlock_BlessingBonus(20)) / 100,
    allDmg: MI("ALLDMG", 0), // Orb +10% damage buys: MinionDMG and the laser already include it; a banish's Purple hit is BanishEXPgain × this
    // White (trait 64: whitedamage = log10 of your fight DPS a hit) and Eternal (trait 71: MinionDMG on tier 7) hits, attack tick @6618956.
    white: MI("MinionTraitALL", 64) > 0, eternal: MI("MinionTraitALL", 71) > 0,
    // One White hit (CreateDmg colour 6, per hit of every attack @6618955): MinionInfo "whitedamage" (@6389252) =
    // "LOG"(GetPlayerDPS()) = 0.434295·ln(max(1, outside fight DPS)) (@6389202, GetPlayerDPS @2637594). CreateDmg adds Refractile and the minion's crit.
    whiteHit: MI("whitedamage", 0), playerDps: Number(H._customBlock_GetPlayerDPS()),
    lemon: MI("MinionTraitALL", 23) >= 1, dual: MI("MinionTraitALL", 43) > 0, banishBop: MI("MinionTraitALL", 28) > 0.5,
    banishesLeft: Math.max(0, MI("TotalDailyBanishes", 0) - Number(rs[22])), banishesPerDay: MI("TotalDailyBanishes", 0),
    // Banish-protect (#2671): a protected banish deals its Purple and keeps the minion (RealmStuff[32] charges, @6637575); a charge
    // costs OrbCost 3 energy, buyable with 2 Orb expansions (RealmStuff[25]). Realm EXP [1] / needed [2]: Purple HP = [2] × p(boss)
    // at spawn (BossHPtot tier 4 @6384443, spawn @6523735) and a level-up sets [2] = 2·[2] + 5 (@30854301).
    protectCharges: Number(rs[32] ?? 0), protectBuy: Number(rs[25]) >= 2, protectCost: MI("OrbCost", 3),
    realmExp: Number(rs[1]), realmReq: Number(rs[2]),
    laserPerSec: MI("OrbLaserDmgPerSec", 0), laserCost: MI("OrbCost", 1), energy: Number(rs[26]), energyCap: MI("OrbEnergyCap", 0),
    // Spirals a reset pays now, every multiplier included (ShrineResetQTY @6421692: (5b+b²)·1.12^b × Resetti × Enlightenment × Avocado × construction 47).
    resetSpirals: MI("ShrineResetQTY", 0),
    coins: realmCoins(save, src),
    stats: realmStats(save, src),
    trophies: realmTrophies(save, src),
    minions, bosses, hpNow: (rs[4] as number[]).slice(0, 8).map(Number),
  };
}
export type RealmCombat = ReturnType<typeof realmCombat>;

/** Regenerates only when the save fields the Realm blocks read changed (a full run takes ~4.5 s, #2652); returns null when skipped. */
export function writeRealmCombat(save: Save, path = "data/realm-combat.json", force = false) {
  const fp = fingerprint(save, DERIVED["realm-combat.json"]!.fields);
  try { if (!force && existsSync(path) && JSON.parse(readFileSync(path, "utf8")).fingerprint === fp) return null; } catch { /* unreadable: regenerate */ }
  // Speed-trophy plans (src/realm-sprint.ts, ~2 s of the ~4.5 s a full write takes, #2652) are written here and not in every
  // realmCombat() call.
  const base = realmCombat(save);
  // End-game coin loop (~0.7 s): only past best Afterlife 50, where the wiki's end-game barn applies (src/realm-coinloop.ts).
  const loop = Number(save.RealmStuff?.[23]) + 1 >= 50 ? coinLoop(save, loadBundle()) : null;
  const r = { fingerprint: fp, ...base, sprint: sprintPlans(save), purple: purpleLoadout(save), purpleTargets: purpleTargets(save, undefined, base as any), orb: orbLoadout(save), coinLoop: loop };
  writeFileSync(path, JSON.stringify(r));
  return r;
}

if (import.meta.main) {
  const i = process.argv.indexOf("--save");
  const r = writeRealmCombat(JSON.parse(readFileSync(i > 0 ? process.argv[i + 1]! : "data/save.json", "utf8")), "data/realm-combat.json", process.argv.includes("--force"));
  if (!r) console.log("data/realm-combat.json: unchanged inputs, skipped");
  else console.log(`data/realm-combat.json: ${r.minions.length} minions, laser ${r.laserPerSec}/s, energy ${r.energy}/${r.energyCap}`);
}
