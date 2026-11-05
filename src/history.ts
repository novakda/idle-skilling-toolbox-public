import { existsSync, readFileSync, writeFileSync } from "fs";

/** Currency history for income rates (time-to-afford). Only appends when the values actually changed. */
export function appendHistory(save: Record<string, unknown>, path = "data/history.json", keep = 2000) {
  const hist: { t: number; shrine: number[] }[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const shrine = (save.ShrineCurrencyOwned as number[]) ?? [];
  if (JSON.stringify(hist.at(-1)?.shrine) === JSON.stringify(shrine)) return;
  hist.push({ t: Date.now(), shrine });
  writeFileSync(path, JSON.stringify(hist.slice(-keep)));
}

/** Ascend/rebirth snapshots (#10): what ascending/rebirthing would pay at this point in the run, so the AFK panel's
 *  recent-vs-average verdict works without reloading the page an hour apart. Appends when the run clock moved ≥ 15 min. */
export async function appendAscend(save: Record<string, unknown>, path = "data/ascend-history.json", keep = 2000) {
  const { ascendGain } = await import("../web/src/bus");
  const { getPlayerDPS } = await import("../web/src/combat");
  let g;
  try { g = ascendGain(save); } catch { return; } // save lacks ascend inputs
  const run = `${save.TimesAscended ?? 0}-${save.NumberofTimesRebirth ?? 0}`; // changes on every ascend/rebirth
  // gold (goldcoin) and dps (GetPlayerDPS @2637594, combat.ts port) let a later run measure how much faster the climb back is
  // from start gold and progress kept (#2673); null when a load-time input is missing (cloud saves).
  const hist: { t: number; run: string; h: number; rh: number; ap: number; bp: number; AP: number[]; BP: number[]; gold?: number; dps?: number | null }[] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const last = hist.at(-1);
  if (last && last.run === run && g.hours - last.h < 0.25) return;
  const d = getPlayerDPS(save as any);
  hist.push({ t: Date.now(), run, h: g.hours, rh: g.rebirthHours, ap: g.ap, bp: g.bp, AP: g.AP, BP: g.BP, gold: Number(save.goldcoin ?? 0), dps: typeof d === "number" ? d : null });
  writeFileSync(path, JSON.stringify(hist.slice(-keep)));
}
