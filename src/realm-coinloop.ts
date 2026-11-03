// End-game coin loop (#2614): after a Shrine reset the Icecream Sammich grant ([5]) dwarfs what the barn costs, so the play is
// rebuild the end-game barn, put every coin left into Chonkoppo (the only minion whose levels keep compounding), then buy vending
// as coins come in. Built with the game's own blocks on the save as a reset leaves it (afterReset): summon + MinionUpgCost per level,
// then MinionCASH via realmCoins. Measured 2026-10-23: rebuild ≈ 1e-30 of the grant, Chonkoppo to ~Lv904, the economy tail ×379 coins.
// ponytail: the barn is the wiki end-game core + economy tail at Lv200 in that order; no compounding of reinvested coins is modelled.
import { realmHost } from "./realm-combat";
import { afterReset } from "./realm-sprint";
import { realmCoins } from "./realm-coins";
import realm from "../web/src/data/realm.json";
import { CHOCCY_CAP, ECONOMY_TAIL } from "../web/src/realm";

type Save = Record<string, any>;
const R = realm as unknown as { minions: Record<string, { name: string; parent: string | null }>; vending: { name: string }[] };
const EVO = [10, 50, 200];
const id = (nm: string) => Object.keys(R.minions).find((k) => R.minions[k]!.name === nm)!;
const lineage = (m: string) => { const p: string[] = []; for (let x: string | null = m; x; x = R.minions[x]!.parent) p.unshift(x); return p; };
// Wiki end-game counted rows (Torchy needs the Lord's Lair, left out), then the measured economy tail, Lizardman in the rest.
const CORE: [string, number][] = [["Phaser Duck", 2], ["Stork", 1], ["Crikeydile", 3], ["Purpback", 10], ["Scissarus", 4], ["Musculor", 3],
  ["Corruptor", 3], ["Big Bone", 1], ["Rainboppo", 1], ["Chonkoppo", 1]];

export function coinLoop(save: Save, src: string) {
  const work = structuredClone(save);
  const { A, H, MI, fresh } = realmHost(work, src);
  // Every item's next-level price on the save as it is now (blessings like Che Cheapo cut prices and a reset clears them): the
  // Vending table's 'affordable now'.
  const lvNow = (A.RealmStuff as any[])[8] as number[], vendCosts = R.vending.slice(0, lvNow.length).map((_, i) => (fresh(), MI("VendingCost", i)));
  afterReset(work, H, A);
  const rs = A.RealmStuff as any[], barn = rs[3] as any[][], grant = Number(rs[5]), slots = MI("BarnSlots");
  const tailN = ECONOMY_TAIL.swap.reduce((a, [, n]) => a + n, 0), coreN = CORE.reduce((a, [, n]) => a + n, 0);
  const rows: [string, number][] = [...CORE, ["Lizardman", Math.max(0, slots - coreN - tailN)], ...ECONOMY_TAIL.swap];
  let slot = 0, rebuild = 0, chonk = -1;
  for (const [nm, n] of rows) for (let c = 0; c < n && slot < slots; c++) {
    const path = lineage(id(nm)), s = barn[slot] = [path[0], 1, 0, 0, 0, 0, 0];
    const lvl = (to: number) => { fresh(); while (s[1] < to) { const x = MI("MinionUpgCost", slot); s[1] += 1; s[4] += x; rebuild += x; } };
    for (let k = 1; k < path.length; k++) { lvl(EVO[k - 1]!); s[0] = path[k]; s[3] += 1; }
    lvl(200); if (nm === "Chonkoppo") chonk = slot; slot++;
  }
  if (chonk < 0 || rebuild > grant) return null;
  const c = barn[chonk]!; let left = grant - rebuild; fresh();
  for (;;) { const x = MI("MinionUpgCost", chonk); if (!(x <= left)) break; left -= x; c[1] += 1; c[4] += x; }
  const chonkLevel = c[1] as number; // what the grant buys; the Purple target below levels further
  const built = { ...save, RealmStuff: [...save.RealmStuff] }; built.RealmStuff[3] = barn.map((x) => [...x]); built.RealmStuff[5] = left;
  const perMin = realmCoins(built, src).perMin;
  // Purple at your best Afterlife (#2671): banish damage = BanishEXPgain(coins spent) × ALLDMG (@6637201, @6415061), Purple HP is
  // BossHPtot(best, 4) (@6384443, fixed by RealmStuff[2]). Keep levelling Chonkoppo past the grant until ONE banish kills that
  // boss; report the level and the extra coins (time at the post-grant rate). Blessings are cleared by the reset (no Refractile).
  const purpleHp = Number(H._customBlock_BossHPtot(Number(rs[23] ?? 0), 4, 0, "0"));
  const hit = () => { fresh(); return MI("BanishEXPgain", chonk) * MI("ALLDMG", 0); };
  let extra = 0, guard = 0;
  while (purpleHp > 0 && hit() < purpleHp && guard++ < 400) { fresh(); const x = MI("MinionUpgCost", chonk); extra += x; c[1] += 1; c[4] += x; }
  const purple = purpleHp > 0 ? { afterlife: Number(rs[23] ?? 0) + 1, hp: purpleHp, level: c[1] as number, extra, minutes: perMin > 0 ? extra / perMin : Infinity, reached: hit() >= purpleHp } : null;
  // Next useful vending buys, cheapest first: skip Choccy past its cap, Broccoli past Lv1, Vendi Bar (cost cut = damage cut) and
  // Wheat Chew once the barn is at 180 slots.
  const lv = rs[8] as number[];
  const all = R.vending.slice(0, lv.length).map((v, i) => ({ i, name: v.name, level: Number(lv[i]), cost: (fresh(), MI("VendingCost", i)) }))
  const vend = [...all]
    .filter((v) => !(v.i === 3 && v.level >= CHOCCY_CAP) && !(v.i === 11 && v.level >= 1) && v.name !== "Vendi Bar" && !(v.i === 0 && slots >= 180))
    .sort((a, b) => a.cost - b.cost).slice(0, 3).map((v) => ({ ...v, minutes: perMin > 0 ? v.cost / perMin : Infinity }));
  return { grant, rebuild, chonkLevel, left, perMin, vend, vendCosts, purple, tail: ECONOMY_TAIL.swap };
}
