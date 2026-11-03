// The tail of _customBlock_CalculateCardBonusTotals, after the equipped-deck loop: passive cards that always count,
// then power/multiply transforms by potions 165/166. Parsed into web/src/data/card-globals.json for cbonus() in
// web/src/cards-calc.ts. Throws on any statement it doesn't recognize.
import { readFileSync, writeFileSync } from "fs";
import { BUNDLE, blockHost, matchBraces } from "./game-eval";
const src = readFileSync(BUNDLE, "utf8");
const fn = matchBraces(src, src.indexOf("_customBlock_CalculateCardBonusTotals:function"));
const first = fn.search(/_CardBonusesALL\w*,[\w$]+=null!=e\[\d+\]/);
const tail = fn.slice(fn.lastIndexOf("var ", first));
const passives: { key: string; card: number; scaled: boolean; div: number; values?: number[] }[] = [];
const transforms: { key: string; potion: number; pow: boolean }[] = [];
// Each statement group: var X=b.engine,Y=GA("Cbonus...") ... setReserved("Cbonus...",...)
for (const m of tail.matchAll(/var [\w$]+=b\.engine,[\w$]+=(?:1\+)?b\.engine\.getGameAttribute\("(Cbonus\w+)"\)([\s\S]*?)setReserved\("(Cbonus\w+)"/g)) {
  const [, key, body] = m as unknown as [string, string, string, string];
  if (key !== m[3]) throw new Error(`group reads ${key} but writes ${m[3]}`);
  const card = body.match(/null!=e\[(\d+)\]/), potion = body.match(/PotionLV"\)\[(\d+)\]/);
  if (card) passives.push({ key, card: +card[1]!, scaled: body.includes('getGameAttribute("CardBonusTOTAL")'), div: /\)\/3\*/.test(body) ? 3 : 1 });
  else if (potion) transforms.push({ key, potion: +potion[1]!, pow: body.includes("Math.pow") });
  else throw new Error(`unrecognized statement for ${key}: ${body.slice(0, 200)}`);
}
const groups = (tail.match(/setReserved\("Cbonus\w+"/g) ?? []).length;
if (groups !== passives.length + transforms.length) throw new Error(`parsed ${passives.length + transforms.length} of ${groups} writes`);
// A passive card's raw value at levels 0-6, from the game's own card map (some are non-zero at level 0, e.g.
// 15*ceil(L^(0.37L)), and some types never appear in the equipped-card catalog).
const save = JSON.parse(readFileSync("data/save.json", "utf8"));
for (const p of passives) p.values = Array.from({ length: 7 }, (_, lv) => {
  const a = structuredClone(save); a.CardLevels = [...a.CardLevels]; a.CardLevels[p.card] = lv;
  const map = (blockHost(src, a) as any)._customBlock_GetAllCardBonusesMap();
  return Number((map.h ?? map)[p.card]?.h?.Value ?? 0);
});
writeFileSync("web/src/data/card-globals.json", JSON.stringify({ passives, transforms }));
console.log(`web/src/data/card-globals.json: ${passives.length} passive cards, ${transforms.length} transforms`);
