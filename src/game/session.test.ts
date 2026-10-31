import { describe, expect, it } from "vitest";
import { campaign } from "./data";
import { advanceAct, newGame, resolveTurn, restoreGame, type TurnReply } from "./session";

const reply: TurnReply = { narration: "Варта відступає.", check: { stat: "cha", dc: 12, success: false }, hpChanges: [], actComplete: false, suggestions: ["Втекти"] };
describe("campaign session", () => {
  it("creates a party of at most four heroes", () => {
    expect(newGame(campaign.heroes.map((h) => h.id)).party).toHaveLength(4);
  });
  it("commits a D20 action and rotates to the next living hero", () => {
    const state = newGame(campaign.heroes.slice(0, 2).map((h) => h.id));
    const next = resolveTurn(state, "action", "Прикриваю вихід", 20, reply);
    expect(next.turn).toBe(1);
    expect(next.progress).toBe(1);
    expect(next.log).toHaveLength(4);
    expect(next.log.at(-1)?.text).toBe(reply.narration);
  });
  it("natural one fails even with a sufficient stat bonus", () => {
    const next = resolveTurn(newGame(["hero_illusionist"]), "action", "Міраж", 1, { ...reply, check: { stat: "cha", dc: 2, success: true } });
    expect(next.progress).toBe(0);
  });
  it("dialogue commits no dice roll", () => {
    const next = resolveTurn(newGame(["hero_illusionist"]), "say", "Вітаю", null, { ...reply, check: null });
    expect(next.log.filter((e) => e.kind === "roll")).toHaveLength(0);
  });
  it("advances acts without losing hero health", () => {
    const state = newGame(["hero_illusionist"]);
    const hero = state.party[0];
    if (!hero) throw new Error("Expected hero");
    hero.hp = 10;
    expect(advanceAct(state).actIndex).toBe(1);
    expect(advanceAct(state).party[0]?.hp).toBe(10);
  });
  it("ends the campaign after the eighth act", () => {
    const state = { ...newGame(["hero_illusionist"]), actIndex: 7 };
    expect(resolveTurn(state, "say", "Свобода", null, { ...reply, check: null, actComplete: true }).status).toBe("victory");
  });
  it("restores committed progress and rejects corrupt snapshots", () => {
    const state = newGame(["hero_illusionist"]);
    expect(restoreGame(JSON.stringify({ version: 1, state, actReady: true }))?.actReady).toBe(true);
    expect(restoreGame(JSON.stringify({ version: 1, state: { ...state, actIndex: 99 }, actReady: false }))).toBeNull();
    expect(restoreGame("broken")).toBeNull();
  });
});