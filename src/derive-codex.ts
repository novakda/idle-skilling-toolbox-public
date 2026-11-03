// Codex lists for the browser-side port (web/src/codex.ts, #45), read by running the Codex scene's own init (SceneEvents_46,
// init † @29050781) in the sandbox. Writes web/src/data/codex.json:
//  - name[id]: _PetINDEXtoNAME (species ids, as PetUnlocked / PetCapsuleLV index them);
//  - gene[id]: _specificGENE, the gene a species carries (its codex page, and the gene of a claimed copy);
//  - buffType[id], buffAmount[id]: _PetBuffType / _PetBuffAmount, the capsule passive per species;
//  - genes[g] = [name, type, line1, line2, line3]: _GeneticNames, _GeneticType, _geneticDescriptionLine1/2, _GeneticDescriptionLine3;
//  - combos[1 + 3(g − 1) + t − 1] = [line1, line2]: _ComboDescriptionsLine1/2 (gene g, combo tier t);
//  - rewards[k] = [level text, bonus]: _TaskDescription / _TaskBonus, k 1-24. The scene hides four bonuses as "???" until
//    their level; the init is run with every level at 999 so all texts come out.
// web/src/codex.test.ts runs the same init and compares.
import { writeFileSync } from "fs";
import { BUNDLE, compile, inert, loadBundle, matchBraces } from "./game-eval";

export function codexInit(src: string, attrs: Record<string, unknown>) {
  const at = src.indexOf("init:function", src.indexOf('"scripts.SceneEvents_46"')) + 5;
  const host: Record<string, any> = new Proxy({}, { get: (t: any, k: string) => (k in t ? t[k] : inert) });
  (compile(matchBraces(src, at), attrs) as Function).call(host);
  return host;
}
const tidy = (s: unknown) => String(s).replace(/_+/g, " ").trim().toLowerCase();

if (import.meta.main) {
  const h = codexInit(loadBundle(BUNDLE), { HatcheryLV: 999, TrekkingLV: 999, ResearchLV: 999, PetRewardList: [], PetUnlocked: [], PetLvl: [], PetsOwned: [], PetIDlist: [], PetClaimTimer: 0, RightNowZone: [], LastVisitedZone: [], HaveyouBeenBeforeZone: [] });
  const ids = (h._PetINDEXtoNAME as string[]).map((_, i) => i);
  const out = {
    name: h._PetINDEXtoNAME as string[], gene: h._specificGENE as number[], buffType: (h._PetBuffType as string[]), buffAmount: h._PetBuffAmount as (number | string)[],
    genes: (h._GeneticNames as string[]).map((g, i) => [g, h._GeneticType[i], h._geneticDescriptionLine1[i], h._geneticDescriptionLine2[i], h._GeneticDescriptionLine3[i] ?? "_"].map(tidy)),
    combos: (h._ComboDescriptionsLine1 as string[]).map((l, i) => [l, h._ComboDescriptionsLine2[i]].map(tidy)),
    rewards: (h._TaskDescription as string[]).slice(0, 25).map((l, i) => [l, h._TaskBonus[i]].map(tidy)),
  };
  if (out.genes.length !== 27 || out.combos.length !== 79 || out.rewards[24]![1] !== "+100% capsule exp" || ids.length < 86) throw new Error("codex lists drifted");
  writeFileSync("web/src/data/codex.json", JSON.stringify(out));
  console.log(`web/src/data/codex.json: ${out.genes.length - 1} genes, ${out.combos.length - 1} combos, 24 rewards`);
}
