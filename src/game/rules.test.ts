import { describe, expect, it } from "vitest";
import { applyHp, clampHp, nextTurn, rollD20 } from "./rules";

describe("game rules", () => {
  it("d20 stays within 1..20", () => {
    for (let i = 0; i < 500; i++) {
      const r = rollD20();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(20);
    }
  });
  it("hp never exceeds max or drops below 0", () => {
    expect(clampHp(40, 30)).toBe(30);
    expect(clampHp(-5, 30)).toBe(0);
  });
  it("turn skips fallen heroes", () => {
    expect(nextTurn([{ hp: 5 }, { hp: 0 }, { hp: 3 }], 0)).toBe(2);
    expect(nextTurn([{ hp: 0 }, { hp: 0 }], 0)).toBe(-1);
  });
  it("hp changes apply by hero name", () => {
    const party = [{ name: "A", hp: 10, maxHp: 20 }, { name: "B", hp: 10, maxHp: 20 }] as never;
    const out = applyHp(party, [{ target: "B", delta: -4 }]);
    expect(out[0]?.hp).toBe(10);
    expect(out[1]?.hp).toBe(6);
  });
});
