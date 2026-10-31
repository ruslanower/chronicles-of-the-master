import { describe, expect, it } from "vitest";
import { campaign } from "./data";
import { newGame, retryAct } from "./session";

describe("retry act after defeat", () => {
  it("heals the party to full and keeps the same act", () => {
    const base = newGame(campaign.heroes.slice(0, 2).map((h) => h.id));
    const fallen = { ...base, actIndex: 3, status: "defeat" as const, party: base.party.map((h) => ({ ...h, hp: 0 })) };
    const next = retryAct(fallen);
    expect(next.status).toBe("playing");
    expect(next.actIndex).toBe(3);
    expect(next.party.every((h) => h.hp === h.maxHp)).toBe(true);
  });
  it("does nothing while still playing", () => {
    const s = newGame([campaign.heroes[0]!.id]);
    expect(retryAct(s)).toBe(s);
  });
});
