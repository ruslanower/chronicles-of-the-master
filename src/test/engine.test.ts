import { describe, expect, it, vi } from "vitest";
import { advanceAct, currentActor, newGame, startAct, useAbility, useItem } from "@/game/engine";
import { generateFallbackMasterReply } from "@/game/fallbackNarrator";
import { playHeroTurn } from "@/game/turn";

describe("Game engine & fallback narrator", () => {
  it("resolves attack abilities without misclassifying +bonus as healing", () => {
    const state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.7);
    const enemy = state.enemies[0]!;
    const out = useAbility(state, "hero_kharakternyk", "saber", enemy.id, () => 0.75);
    expect(out.detail?.actionKind).toBe("attack");
    expect(out.detail?.hit).toBe(true);
    expect(out.state.lastEvents?.some((ev) => ev.kind === "dmg" || ev.kind === "crit")).toBe(true);

    const reply = generateFallbackMasterReply(out.state, { kind: "mechanic", summary: out.summary });
    expect(reply.narration).not.toMatch(/цілюще|затягує рани/);
  });

  it("produces defeated narration when an enemy reaches 0 HP", () => {
    let state = newGame(["hero_runic_guardian"], "uk", {}, () => 0.8);
    state = {
      ...state,
      enemies: state.enemies.map((e, idx) => (idx === 0 ? { ...e, hp: 2 } : e)),
    };
    const out = useAbility(state, "hero_runic_guardian", "hammer", state.enemies[0]!.id, () => 0.85);
    expect(out.detail?.defeated).toBe(true);

    const reply = generateFallbackMasterReply(out.state, { kind: "mechanic", summary: out.summary });
    expect(reply.narration).toMatch(/валиться|переможений|рухнув|падає/);
  });

  it("completes non-combat acts (Acts IV–VII) after 3 successful free actions", async () => {
    let state = newGame(["hero_illusionist"], "uk", {}, () => 0.5);
    // Act IV (index 3) has no combat enemies, only the Roach King NPC
    state = startAct(state, 3, () => 0.5);
    expect(state.enemies.length).toBe(0);
    expect(state.actReady).toBe(false);

    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));

    // Perform 3 successful charismatic actions (roll = 15 + CHA bonus >= DC 11)
    for (let step = 0; step < 3; step++) {
      const actor = currentActor(state);
      expect(actor?.type).toBe("hero");
      state = await playHeroTurn(state, "hero_illusionist", { type: "free", text: "Переконати Тарганячого Короля словами" }, narrate, () => 0.7);
    }

    expect(state.actProgress).toBe(3);
    expect(state.actReady).toBe(true);
  });

  it("makes only 1 narrator request per ability turn even when enemies counterattack", async () => {
    const state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.9);
    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));

    const next = await playHeroTurn(
      state,
      "hero_kharakternyk",
      { type: "ability", abilityId: "saber", targetId: state.enemies[0]!.id },
      narrate,
      () => 0.6,
    );

    expect(narrate).toHaveBeenCalledTimes(1);
    expect(next.log.some((e) => e.kind === "master")).toBe(true);
  });

  it("heals party members by +4 HP during short rest between acts", () => {
    let state = newGame(["hero_forest_druid"], "uk", {}, () => 0.5);
    state = {
      ...state,
      actReady: true,
      party: state.party.map((h) => ({ ...h, hp: 5 })),
    };
    const next = advanceAct(state, () => 0.5);
    expect(next.actIndex).toBe(1);
    expect(next.party[0]!.hp).toBe(9);
  });

  it("allows using healing items and records heal combat events", () => {
    let state = newGame(["hero_forest_druid"], "uk", {}, () => 0.5);
    state = {
      ...state,
      party: state.party.map((h) => ({ ...h, hp: 6 })),
    };
    const healItem = state.party[0]!.inventory.find((i) => i.bonus.includes("HP"));
    if (healItem) {
      const out = useItem(state, "hero_forest_druid", healItem.id);
      expect(out.state.party[0]!.hp).toBeGreaterThan(6);
      expect(out.state.lastEvents?.[0]?.kind).toBe("heal");
    }
  });
});
