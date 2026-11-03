import { expect, test } from "bun:test";
import { appendAscend } from "./history";

test("appendAscend: skips < 15 min of run time, appends after, and tags each run", async () => {
  const save = await Bun.file(new URL("../data/save.json", import.meta.url)).json();
  const path = `${process.env.TMPDIR ?? "/tmp"}/ascend-history-${process.pid}.json`;
  await appendAscend(save, path);
  await appendAscend({ ...save, TimeSinceAscention: save.TimeSinceAscention + 600 }, path); // +10 min: skipped
  await appendAscend({ ...save, TimeSinceAscention: save.TimeSinceAscention + 3600 }, path); // +1 h: kept
  await appendAscend({ ...save, TimesAscended: save.TimesAscended + 1, TimeSinceAscention: 60 }, path); // new run
  const h = await Bun.file(path).json();
  expect(h.map((x: any) => x.run)).toEqual([`${save.TimesAscended}-${save.NumberofTimesRebirth}`, `${save.TimesAscended}-${save.NumberofTimesRebirth}`, `${save.TimesAscended + 1}-${save.NumberofTimesRebirth}`]);
  expect(h[1].h - h[0].h).toBeCloseTo(1, 5);
  expect(h[0].rh).toBeCloseTo(save.TimeSinceAscention2 / 3600, 5); // rebirth clock, for #20
  expect(h[0].gold).toBe(Number(save.goldcoin)) // start-gold measurement (#2673)
  expect(h[0].dps === null || h[0].dps > 0).toBe(true) // GetPlayerDPS port; null only when a load-time input is missing
  await Bun.file(path).delete();
});
