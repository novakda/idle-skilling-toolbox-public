import { expect, test } from "bun:test";
import { buildIndex } from "./access-index";
import { classify } from "./access-query";

const G = (k: string) => `b.engine.getGameAttribute("${k}")`;
const src = `(function(){var D=function(){};D.__name__="scripts.X";D.prototype={
  draw:function(){var E=${G("RealmStuff")}[13];n.font=f;E[i+1];E=${G("Other")};E[6]},
  logic:function(){var t=${G("PotionLV")}[91];t=null==t?0:t;var E=${G("RealmStuff")};var q=function(){return E[2]};E[13][5]=1;this._GenINFO[52]=1},
  _customBlock_Info:function(t,a){if("Cost"==t){return ${G("RealmStuff")}[13][0|a]}}
};D.prototype.go=function(){D._customBlock_Info("Cost",k,0)};})();`; // module IIFE, like the bundle

test("aliases resolve per scope and end on reassignment", () => {
  const { recs, calls, branches } = buildIndex(src);
  const show = (r: (typeof recs)[0]) => `${r.attr}${JSON.stringify(r.path)} ${r.kind} ${r.fn} ${r.ui ? "UI" : "logic"}`;
  const got = recs.map(show);
  expect(got).toContain(`RealmStuff[13] alias draw UI`);
  expect(got).toContain(`RealmStuff[13,"?i+1"] read draw UI`); // via E
  expect(got).toContain(`Other[6] read draw UI`); // E reassigned: no longer RealmStuff[13]
  expect(got).toContain(`PotionLV[91] read logic logic`); // value alias, never subscripted
  expect(got).toContain(`RealmStuff[2] read logic>q logic`); // closure sees logic's E (whole RealmStuff)
  expect(got).toContain(`RealmStuff[13,5] write logic logic`);
  expect(got).toContain(`_GenINFO[52] write logic logic`);
  expect(recs.find((r) => r.attr === "RealmStuff" && r.path[1] === "?0|a")?.cls).toBe("scripts.X");
  expect(branches).toEqual([expect.objectContaining({ helper: "Info", key: "Cost" })]);
  expect(calls[0]).toMatchObject({ helper: "Info", key: "Cost", nums: [null, 0] });
});

test("classify against a queried element path", () => {
  expect(classify([13, 6], [13, 6], "read")).toBe("literal");
  expect(classify([13, 5], [13, 6], "read")).toBe(null);
  expect(classify([13, "?i"], [13, 6], "read")).toBe("computed");
  expect(classify([13], [13, 6], "pass")).toBe("container");
  expect(classify([13], [13, 6], "alias")).toBe(null);
  expect(classify([13], [13, 6], "length")).toBe(null);
});
