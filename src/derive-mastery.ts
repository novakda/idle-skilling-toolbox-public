// Mastery tables for the browser (web/src/load-bonuses.ts MasteryBonuses port, web/src/mastery.ts page). The perk lists come
// from the mastery scene's init (SceneEvents_48 @29744779; lists.json files its splices under SceneEvents_49), the task
// names from ActorEvents_1376's ID-4 branch (filed as ActorEvents_1379). Task rewards are read off every grant site in the
// bundle: `MasteryTasksComplete[i]=1` followed by `MasteryPointsOwned+k`.
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE } from "./game-eval";
const L = JSON.parse(readFileSync("data/game/lists.json", "utf8"));
const src = readFileSync(BUNDLE, "utf8");
const grants: Record<number, { pts: number; at: number }> = {};
for (const m of src.matchAll(/MasteryTasksComplete"\)\[(\d+)\]=1/g)) {
  const pts = src.slice(m.index!, m.index! + 400).match(/MasteryPointsOwned"\)\+(\d+)/)?.[1];
  if (pts && !grants[+m[1]!]) grants[+m[1]!] = { pts: +pts, at: m.index! };
}
const names: string[] = L["ActorEvents_1379.MasteryTaskNames"];
const out = {
  type: L["SceneEvents_49.type"], bonusAmount: L["SceneEvents_49.bonusAmount"], names: L["SceneEvents_49.typeNAMES"],
  cost: L["SceneEvents_49.UpgradeCost"],
  // [name, points, offset of the first grant site]; index = task number (0 unused)
  tasks: names.map((name, i) => [name, grants[i]?.pts ?? null, grants[i]?.at ?? null]),
};
writeFileSync("web/src/data/mastery.json", JSON.stringify(out)); // static app data
console.log(`web/src/data/mastery.json: ${out.type.length} mastery perks, ${out.names.length} bonus types, ${Object.keys(grants).length} task grants`);
