// Public copy: the private data (data/save.json, data/game/, save fixtures) is not shipped. Tests whose file
// reads it are registered as skipped when it is absent, so `bun test` is green on a clean checkout.
import { mock } from "bun:test";
import * as real from "bun:test";
import { existsSync, readFileSync } from "fs";

const missing = !existsSync("data/save.json") || !existsSync("data/game");
const needsPrivate = new Map<string, boolean>();
const callerNeedsPrivate = () => {
  const file = new Error().stack?.split("\n").map((l) => l.match(/\(?(\/[^():]+\.test\.ts)/)?.[1]).find(Boolean);
  if (!file) return false;
  if (!needsPrivate.has(file)) needsPrivate.set(file, /save\.json|data\/game|getSave|fullSave|test-save|fixture-asylum/.test(readFileSync(file, "utf8")));
  return needsPrivate.get(file)!;
};
const wrap = (fn: any) => {
  const w: any = (...a: any[]) => (missing && callerNeedsPrivate() ? fn.skip(...a) : fn(...a));
  return new Proxy(w, { get: (_, k) => (typeof fn[k] === "function" ? fn[k].bind(fn) : fn[k]) });
};
mock.module("bun:test", () => ({ ...real, test: wrap(real.test), it: wrap(real.it) }));
