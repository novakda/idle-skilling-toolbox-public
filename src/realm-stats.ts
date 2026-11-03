// Realm "Stats" (#23): every number the Realm scene computes, read by running the game's own blocks (MinionInfo, CalcMisc,
// BlessingBonus, FruitBonusTypeT in ActorEvents_1488) against a save. Offsets are bytes in Qno2x.js. `stored` is the save's
// copy of the same quantity where one exists, so the page can mark agreement. Written into data/realm-combat.json (`stats`).
import { loadBundle } from "./game-eval";
import { realmHost } from "./realm-combat";
import realm from "../web/src/data/realm.json";

type Save = Record<string, any>;
export type Stat = { name: string; value: number; src: string; level?: number; stored?: number; check?: "=" | "≤"; note?: string };
const R = realm as unknown as {
  minions: Record<string, { name: string }>; traits: Record<string, { name: string; text: string }>;
  blessings: Record<string, { name: string; value: number; text: string }>;
  shrine: { name: string; text: string }[]; vending: { name: string; text: string }[];
};
const N = (v: unknown) => Number(v ?? 0) || 0;
// Shrine reads (RealmStuff[13][i]); Moksha's read is not a literal [13][6] anywhere, so its source is open.
const SHRINE_SRC = ["blessing offer @6614569", "fight damage @2638948, MinionDMG @6398413", "BarnSlots @6387790", "reset → [34] @6762649",
  "refund roll @6527704", "AllCashBonus @6404452", "† no literal [13][6] read found", "away gains @20194544"];
// Game text: "{" is the value, "}" the multiplier 1 + value/100, "@@@…" a number drawn elsewhere.
const num = (v: number) => +v.toFixed(3);
const txt = (t: string, v: number) => t.replace(/@+/g, "the bonus").replace(/\{/g, String(+v.toFixed(2))).replace(/\}/g, String(+(1 + v / 100).toFixed(3)));
const FIELD = ["Full Blossom", "Smol Savings", "Juiced Fruit", "Cash Genesis", "Spare Charge", "Level Cash", "Level Slash", "Afterlife Slam"];
const ORB_COST = ["expansion", "laser shot", "trait reroll", "banish protect", "refund coins", "+10% coin gain", "+10% minion damage"];

export function realmStats(save: Save, src = loadBundle()) {
  const { H, MI } = realmHost(save, src);
  const CM = (k: string, a = 0) => Number(H._customBlock_CalcMisc(k, a, 0));
  const BB = (i: number) => Number(H._customBlock_BlessingBonus(i));
  const FB = (i: number) => Number(H._customBlock_FruitBonusTypeT(i));
  const TA = (t: number) => MI("MinionTraitALL", t);
  MI("MinionTraitALL", -1);
  const rs = save.RealmStuff as any[], best = N(rs[23]), realmLv = N(rs[0]);
  const barn = (rs[3] as any[][]).flatMap((s, slot) => (s[0] === "none" ? [] : [{ slot, id: String(s[0]), level: N(s[1]) }]));

  // AllCashBonus (@6403146), factor by factor in the order the game multiplies them; product = the block's value.
  const allCash: Stat[] = [
    { name: "Smithing item 95, per best afterlife", value: (1 + Math.min(Math.max(0, N(save.SmithingItemLevel?.[95])) ** 0.3, 500) / 100) ** best, src: "AllCashBonus @6403146", level: N(save.SmithingItemLevel?.[95]) },
    { name: "Make It Rain (trait 8)", value: 1 + TA(8) / 100, src: "MinionTraitALL(8)" },
    { name: "Crystal Eye Shop item 2", value: 1.3 ** N(rs[42]?.[2]), src: "1.3^RealmStuff[42][2]", level: N(rs[42]?.[2]) },
    { name: "Trait 72", value: 2 ** TA(72), src: "2^MinionTraitALL(72)" },
    { name: "Choccy Coin, per best afterlife", value: Math.min(1.25, 1 + 0.6 * MI("VendingBonus", 3) / 100) ** best, src: "VendingBonus(3) @6418645", level: N(rs[8]?.[3]) },
    { name: "Sahaja, per best afterlife", value: (1 + N(rs[13]?.[5]) / 100) ** best, src: "RealmStuff[13][5] @6404452", level: N(rs[13]?.[5]) },
    { name: "100upgrades (trait 19)", value: 1 + Math.max(0, TA(19) * CM("100upgrades")) ** 0.6 / 100, src: "CalcMisc 100upgrades @6473716" },
    { name: "Penny Thought", value: 1 + BB(2) / 100, src: "BlessingBonus(2) @6480153" },
    { name: "Dime Decisive", value: 1 + BB(17) / 100, src: "BlessingBonus(17)" },
    { name: "Trophies", value: 1 + CM("TotalTrophyReward") * Math.max(1, Math.min(10, 1 + TA(65))) / 100, src: "CalcMisc TotalTrophyReward @6478194 × trait 65" },
    { name: "Banked Bygone", value: 1 + BB(25) / 100, src: "BlessingBonus(25)" },
    { name: "Fruit: coins + coins per Realm Lv", value: 1 + (FB(5) + FB(12) * realmLv) / 100, src: "FruitBonusTypeT(5), (12) @6468897" },
    { name: "Construction 43", value: Math.max(1, 1.15 ** N(save.ConstructLV?.[43])), src: "1.15^ConstructLV[43]", level: N(save.ConstructLV?.[43]) },
    { name: "Orb Tower +10% coin buys", value: Math.max(1, 1 + 10 * N(rs[46]) / 100), src: "RealmStuff[46]", level: N(rs[46]) },
  ];
  // MinionCASH (@6406232) = (10·(25 + 3·Lv·1.014^Lv) + √coins spent) × AllCashBonus × these × Level Cash (per minion).
  const cash: Stat[] = [
    { name: "AllCashBonus (product above)", value: MI("AllCashBonus"), src: "MinionInfo AllCashBonus @6403146" },
    { name: "Tax Collector × unique minions", value: 1 + TA(32) * CM("UniqueBarnMinions") / 100, src: "MinionTraitALL(32) × CalcMisc UniqueBarnMinions @6472833", note: `${TA(32)}% × ${CM("UniqueBarnMinions")}` },
    { name: "Smart Money × ⌊Realm Lv/5⌋", value: 1 + TA(31) * CM("perRealmLV", 5) / 100, src: "MinionTraitALL(31) × perRealmLV(5) @6475465", note: `${TA(31)}% × ${CM("perRealmLV", 5)}` },
    { name: "Gold Bless × top blessing count", value: 1 + TA(39) * CM("MostBlessings") / 100, src: "MinionTraitALL(39) × MostBlessings @6475746", note: `${TA(39)}% × ${CM("MostBlessings")}` },
    { name: "Smol Cash", value: 1 + TA(56) / 100, src: "MinionTraitALL(56)" },
  ];
  const levelCash = barn.map((m) => ({ slot: m.slot, value: 1 + MI("MinionTrait", m.slot, 50) * Math.floor(m.level / 100) / 100 }));
  const coinOther: Stat[] = [
    { name: "Boss Pilfer: coins × on a boss kill", value: Math.min(1.5, TA(37)), src: "MinionTraitALL(37) @6613604", note: "applies only when > 1" },
    { name: "Spend refund %", value: Math.min(50, TA(44) + BB(11)), src: "trait 44 + Nickel Back @6590500" },
    { name: "Away time bonus % (fruit 14)", value: FB(14), src: "FruitBonusTypeT(14) @6574387" },
    { name: "Taoism refund chance %", value: N(rs[13]?.[4]), src: SHRINE_SRC[4]!, note: "compares with GenINFO[52] = 0, looks like it never fires †" },
  ];

  // Blessings: RealmStuff[11] letter → picks. BlessingBonus(i) reads Letter2Number[i] (i = 0 for "_", else a=1 … z=26).
  const held = (rs[11] ?? {}) as Record<string, number>;
  const blessings = Object.entries(R.blessings).map(([k, b]) => {
    const i = k === "_" ? 0 : k.charCodeAt(0) - 96;
    return { key: k, name: b.name, count: N(held[k]), value: BB(i), text: b.text };
  });
  const top = Math.max(0, ...Object.values(held).map(N));
  const blessingStats: Stat[] = [
    { name: "Top blessing count (Gold Bless reads it)", value: CM("MostBlessings"), src: "CalcMisc MostBlessings @6475746", stored: top, check: "=" },
    { name: "Blessing types held", value: blessings.filter((b) => b.count > 0).length, src: "RealmStuff[11] keys" },
    { name: "Blessing picks held", value: blessings.reduce((t, b) => t + b.count, 0), src: "Σ RealmStuff[11]" },
    { name: "Blessing types offered after a kill", value: 10 + N(rs[13]?.[0]), src: `10 + Dharma (${SHRINE_SRC[0]})` },
    { name: "Double blessing chance %", value: MI("ShrineDoubleBlessingPCT"), src: "ShrineDoubleBlessingPCT @6422898 (trait 35 + fruit 4)" },
    { name: "Blessing bonus multiplier (Superblesser + fruit 6)", value: 1 + (BB(22) + FB(6)) / 100, src: "BlessingBonus @6480153, applies to randolist[4] blessings" },
    { name: "Blessing rerolls left this run", value: N(rs[34]), src: "RealmStuff[34]" },
  ];

  // Blessing totals (#2765). BlessingBonus(i) @6480153 = picks × CustomMaps.Blessings[letter][1]; for letters in randolist[4] it is then
  // × (1 + (BlessingBonus(22) + fruit 6)/100) (Superblesser, @6482028) and × (1 + MinionTraitALL(66)/100) (Bless Updog, @6482874) - two
  // separate multiplications. Superblesser (22) returns picks × value un-boosted, before that gate. The game call gives each total.
  const gate = new Set((save.CustomLists?.randolist?.[4] ?? []).map(String));
  const superPct = BB(22), fruit6 = FB(6), updogPct = TA(66);
  const superMult = 1 + (superPct + fruit6) / 100, updogMult = 1 + updogPct / 100;
  const BCAT: Record<string, string> = { b: "coins", q: "coins", y: "coins", _: "damage", l: "damage", w: "damage", g: "damage", h: "damage", j: "damage", m: "damage", r: "damage",
    t: "damage", f: "damage", c: "cost", s: "cost", d: "speed", a: "energy", e: "exp", k: "cashback", p: "spirals" };
  const totalsRows = blessings.filter((b) => b.count > 0).map((b) => {
    const i = b.key === "_" ? 0 : b.key.charCodeAt(0) - 96, base = N(save.CustomMaps?.Blessings?.[b.key]?.[1] ?? R.blessings[b.key]?.value);
    const instant = ["n", "u", "z"].includes(b.key), gated = gate.has(String(i)), raw = b.count * base;
    const expected = raw * (gated ? superMult * updogMult : 1);
    return { key: b.key, name: b.name, cat: instant ? "instant" : (BCAT[b.key] ?? "other"), count: b.count, base, raw, gated, superMult: gated ? superMult : 1, updogMult: gated ? updogMult : 1,
      total: b.value, expected, instant, text: instant ? b.text.replace(/\{/g, String(base)) + " per pick (applied when picked, no standing bonus)" : txt(b.text, b.value) };
  });
  const sumOf = (keys: string[]) => totalsRows.filter((r) => keys.includes(r.key)).reduce((t, r) => t + r.total, 0);
  const blessingTotals = {
    superblesser: { picks: N(held.v), perPick: N(save.CustomMaps?.Blessings?.v?.[1] ?? R.blessings.v?.value), pct: superPct, fruit6, mult: superMult },
    updog: { total: updogPct, mult: updogMult, carriers: barn.filter((m) => (H._customBlock_TraitList(m.slot) as unknown[]).map(Number).includes(66)).map((m) => m.id) },
    gate: [...gate].map(Number).sort((a, b) => a - b).map((i) => (i === 0 ? "_" : String.fromCharCode(96 + i))),
    rows: totalsRows,
    // How the game combines blessings (call sites of BlessingBonus).
    groups: [
      { label: "Coins from all sources", combined: (1 + sumOf(["b"]) / 100) * (1 + sumOf(["q"]) / 100) * (1 + sumOf(["y"]) / 100),
        how: "multiply: AllCashBonus has one (1 + x/100) factor each for Penny Thought, Dime Decisive and Banked Bygone @6403146" },
      { label: "Total minion damage", combined: 1 + sumOf(["_", "l", "w"]) / 100,
        how: "add: Little Damage + Mega Damage + Eternal Damage sit in one (1 + (a + b + c)/100) factor (MinionDMG); Crimsonile, the type blessings and Refractile are separate factors on top" },
    ],
  };

  // Realm-wide bonuses.
  const bonuses: (Stat & { group: string })[] = [
    ...R.shrine.map((u, i) => ({ group: "Shrine", name: u.name, level: N(rs[13]?.[i]), value: i === 1 ? 1.08 ** N(rs[13]?.[i]) : N(rs[13]?.[i]), src: SHRINE_SRC[i]!,
      note: i === 1 ? "×1.08 per level" : txt(u.text, N(rs[13]?.[i])) })),
    ...R.vending.map((v, i) => ({ group: "Vending", name: v.name, level: N(rs[8]?.[i]), value: MI("VendingBonus", i), src: `VendingBonus(${i}) @6418645`, note: txt(v.text, MI("VendingBonus", i)) + (i === 3 ? ` (code: min(1.25, 1 + 0.6·${MI("VendingBonus", 3)}%) = ${+Math.min(1.25, 1 + 0.6 * MI("VendingBonus", 3) / 100).toFixed(3)}x, AllCashBonus @6403146)` : "") })),
    ...FIELD.map((p, i) => ({ group: "Field", name: p, level: N(rs[35]?.[i]), value: MI("FieldTraitBonusQTY", i), src: `FieldTraitBonusQTY(${i}) @6424559`, note: "trait strength the plot gives (7^level scaling); applies once the plot is levelled †" })),
    ...((rs[17] as any[][]) ?? []).filter((f) => f[0] !== "none").flatMap((f) => [1, 3, 5].filter((j) => f[j] !== "none").map((j) => ({
      group: "Fruit", name: String(f[j]).replace(/^%_/, "").replace(/_/g, " "), value: N(f[j + 1]), src: `RealmStuff[17] (${f[0]})`, note: "%" }))),
    ...Array.from({ length: 18 }, (_, k) => k + 1).filter((t) => FB(t)).map((t) => ({ group: "Fruit total", name: String(save.CustomMaps?.FruitBonusTypes?.[t]?.[0] ?? t).replace(/^%_/, "").replace(/_/g, " "), value: FB(t), src: `FruitBonusTypeT(${t}) @6468897`, note: "% (all fruit, × All Fruit Bonuses)" })),
    { group: "Orb Tower", name: "+10% minion damage buys (ALLDMG)", level: N(rs[33]), value: MI("ALLDMG"), src: "ALLDMG @6389582" },
    { group: "Orb Tower", name: "+10% coin gain buys", level: N(rs[46]), value: Math.max(1, 1 + 10 * N(rs[46]) / 100), src: "RealmStuff[46] in AllCashBonus" },
    { group: "Trophies", name: "Trophies claimed", value: CM("TotalTrophies"), src: "CalcMisc TotalTrophies @6477165", stored: ((rs[24] as number[]) ?? []).filter((v) => v === -9).length, check: "=" },
    { group: "Trophies", name: "Trophy coin bonus %", value: CM("TotalTrophyReward"), src: "CalcMisc TotalTrophyReward @6478194" },
    { group: "Barn", name: "Barn slots", value: MI("BarnSlots"), src: "BarnSlots @6387440", stored: barn.length, check: "≤", note: "stored = slots in use" },
    { group: "Barn", name: "Unique minion types (Tax Collector)", value: CM("UniqueBarnMinions"), src: "CalcMisc UniqueBarnMinions @6472833", stored: new Set(barn.map((m) => m.id)).size + BB(9), check: "=", note: `stored = distinct ids in the barn (${new Set(barn.map((m) => m.id)).size}) + Countinion (${BB(9)})` },
    { group: "Barn", name: "Daily banishes", value: MI("TotalDailyBanishes"), src: "TotalDailyBanishes @6415774", stored: N(rs[22]), check: "≤", note: "stored = used today" },
  ];

  // Energy: Orb Tower cap, income (each Charger minion adds ORBCHARGE/60 at every 60 s payout, @6607522), costs.
  const regen = barn.reduce((t, m) => t + MI("MinionORBCHARGE", m.slot), 0);
  const energy: Stat[] = [
    { name: "Energy cap", value: MI("OrbEnergyCap"), src: "OrbEnergyCap @6437329: (10 + 10x)·2^x + Chagrin", stored: N(rs[26]), check: "≤", note: "stored = energy held [26]" },
    { name: "Energy per hour (on the Realm screen)", value: regen, src: "Σ MinionORBCHARGE @6408129, /60 a payout @6607522", note: "the Orb panel shows 24× this per day" },
    { name: "Hours to fill", value: regen > 0 ? Math.max(0, MI("OrbEnergyCap") - N(rs[26])) / regen : Infinity, src: "cap − held, ÷ per hour" },
    { name: "Laser damage per second (Blue)", value: MI("OrbLaserDmgPerSec"), src: "OrbLaserDmgPerSec @6437914: 10·(2 + x/4)^x × ALLDMG" },
    ...ORB_COST.map((c, i) => ({ name: `Cost: ${c}`, value: MI("OrbCost", i), src: `OrbCost(${i}) @6438497` })),
  ];

  const other: Stat[] = [
    { name: "Spirals a Shrine reset pays now", value: MI("ShrineResetQTY"), src: "ShrineResetQTY @6421692" },
    { name: "Realm EXP to next level", value: N(rs[2]) - N(rs[1]), src: "RealmStuff[2] − [1], LvUp @30853486" },
    { name: "Seconds into this run", value: N(rs[37]), src: "RealmStuff[37]" },
    { name: "Base attack period (s)", value: CM("BaseMinionAtkSpdSEC"), src: "CalcMisc BaseMinionAtkSpdSEC @6477127" },
  ];
  // Barn bonuses: per trait any barn minion carries (own + ancestors, TraitList @6451390), the barn total from MinionTraitALL
  // (aggregation @6441900). TraitTypes[2] "no" = unstackable: the loop stops after 1 + DoubleStacksZZmax carriers
  // (min(trait 41, 1) + VendingBonus 13).
  const types = save.CustomMaps?.TraitTypes ?? {};
  const stackMax = Math.min(TA(41), 1) + MI("VendingBonus", 13);
  const carriers = new Map<number, number[]>();
  for (const m of barn) for (const t of (H._customBlock_TraitList(m.slot) as unknown[]).map(Number)) carriers.set(t, [...(carriers.get(t) ?? []), m.slot]);
  const EFFECT: Record<number, (v: number) => string> = {
    56: (v) => `coins ×${num(1 + v / 100)} (MinionCASH @6407752)`,
    66: (v) => `listed blessings (randolist[4], incl. Dime Decisive, Penny Thought, Banked Bygone) ×${num(1 + v / 100)} (BlessingBonus @6482874)`,
    8: (v) => `coins ×${num(1 + v / 100)} (AllCashBonus)`,
  };
  const barnTraits = [...carriers.entries()].sort((a, b) => a[0] - b[0]).map(([t, slots]) => {
    const stacks = types[t]?.[2] !== "no", total = TA(t);
    // sum = each carrier's own MinionTrait; the barn total equals it for a stacking trait.
    const sum = slots.reduce((a, slot) => a + MI("MinionTrait", slot, t), 0);
    return { trait: t, name: R.traits[t]?.name ?? String(t), carriers: slots.length, slots, stacks, sum,
      rule: stacks ? "stacks" : `max ${1 + stackMax} carriers`, total, effect: EFFECT[t]?.(total) ?? txt(R.traits[t]?.text ?? "", total) };
  });
  return { allCash, cash, levelCash, barnTraits, stackMax, coinOther, blessings, blessingStats, blessingTotals, bonuses, energy, other };
}
export type RealmStats = ReturnType<typeof realmStats>;
