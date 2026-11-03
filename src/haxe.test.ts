import { expect, test } from "bun:test";
import { unserialize } from "./haxe";
test("haxe tokens", () => {
  expect(unserialize("oy1:ai5y1:bd1.5e+3y1:caznu2i-3hy1:dR0g")).toEqual({ a: 5, b: 1500, c: [0, null, null, null, -3], d: "a" });
  expect(unserialize("y8:a%20b%21")).toBe("a b!");
});
