import { describe, expect, it, vi } from "vitest";
import {
  advance,
  advanceAct,
  currentActor,
  enemyAC,
  enemyAct,
  heroAC,
  newGame,
  resolveAbility,
  resolveItem,
  startAct,
  upcomingEnemyIds,
  useAbility,
  useItem,
} from "@/game/engine";
import { chooseTacticalEnemyDecision, parseEnemyAiResponse } from "@/game/enemyAi";
import { campaign, locationMobileSrc, locationSrc } from "@/game/data";
import { generateFallbackMasterReply } from "@/game/fallbackNarrator";
import { playHeroTurn, playOpeningEnemies } from "@/game/turn";
import {
  createRoomRecord,
  insertRoomMessage,
  loadRoom,
  loadRoomMessages,
  newCode,
  newToken,
  saveRoom,
  sha256,
  verifyPlayer,
} from "@/lib/rooms.server";

describe("Game engine, enemy AI & fallback narrator", () => {
  it("resolves attack abilities without misclassifying +bonus as healing and parses target/ability accurately", () => {
    const state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.7);
    const enemy = state.enemies[1]!; // Target second knight specifically
    const out = useAbility(state, "hero_kharakternyk", "saber", enemy.id, () => 0.75);
    expect(out.detail?.actionKind).toBe("attack");
    expect(out.detail?.hit).toBe(true);
    expect(out.state.lastEvents?.some((ev) => ev.kind === "dmg" || ev.kind === "crit")).toBe(true);

    const reply = generateFallbackMasterReply(out.state, {
      kind: "mechanic",
      summary: out.summary,
    });
    expect(reply.narration).not.toMatch(/цілюще|затягує рани/);
    expect(reply.narration).toContain(enemy.name);
    expect(reply.narration).toContain("Вовча Зоря");
  });

  it("does not misclassify a failed stun as a successful hit", () => {
    const state = newGame(["hero_illusionist"], "uk", {}, () => 0.7);
    const enemy = state.enemies[0]!;
    // rng = 0.05 -> D20 roll = 2 (+4 CHA = 6 < 12 -> FAIL)
    const out = resolveAbility(state, "hero_illusionist", "whisper", enemy.id, () => 0.05);
    expect(out.detail?.actionKind).toBe("stun");
    expect(out.detail?.hit).toBe(false);

    const reply = generateFallbackMasterReply(out.state, {
      kind: "mechanic",
      summary: out.summary,
    });
    expect(reply.narration).toMatch(/опирається|не піддається|встояв/);
  });

  it("produces defeated narration when an enemy reaches 0 HP", () => {
    let state = newGame(["hero_runic_guardian"], "uk", {}, () => 0.8);
    state = {
      ...state,
      enemies: state.enemies.map((e, idx) => (idx === 0 ? { ...e, hp: 2 } : e)),
    };
    const out = useAbility(
      state,
      "hero_runic_guardian",
      "hammer",
      state.enemies[0]!.id,
      () => 0.85,
    );
    expect(out.detail?.defeated).toBe(true);

    const reply = generateFallbackMasterReply(out.state, {
      kind: "mechanic",
      summary: out.summary,
    });
    expect(reply.narration).toMatch(/валиться|переможений|рухнув|падає|вибуває|долаючи/);
  });

  it("keeps hide and shield buffs active through enemy turns even when hero goes last in initiative", () => {
    let state = newGame(["hero_shadow_elf"], "uk", {}, () => 0.5);
    // Put hero LAST in turn order: [e1, e2, e3, hero_shadow_elf]
    state = {
      ...state,
      order: ["e1", "e2", "e3", "hero_shadow_elf"],
      pos: 3,
    };
    const hiddenOut = resolveAbility(state, "hero_shadow_elf", "smoke", "hero_shadow_elf");
    const afterHero = advance(hiddenOut.state);
    // Round wrapped to pos=0 (e1), yet hero MUST still be hidden until hero's own next turn!
    expect(afterHero.pos).toBe(0);
    expect(afterHero.party[0]!.status.hidden).toBe(1);

    // Enemy AI cannot attack the hidden hero and instead braces defensively (or searches if on cooldown)
    const e1Act = enemyAct(afterHero, "e1", undefined, () => 0.5);
    expect(e1Act.state.party[0]!.hp).toBe(afterHero.party[0]!.maxHp);
    expect(e1Act.summary).toMatch(/невидимих|нікого не бачить/);
    const e1Second = enemyAct(e1Act.state, "e1", undefined, () => 0.5);
    expect(e1Second.summary).toMatch(/нікого не бачить/);
  });

  it("allows healing abilities and multi-qty potions to revive unconscious allies", () => {
    let state = newGame(["hero_forest_druid", "hero_kharakternyk"], "uk", {}, () => 0.9);
    state = {
      ...state,
      party: state.party.map((h) =>
        h.id === "hero_kharakternyk" ? { ...h, hp: 0 } : { ...h, hp: 10 },
      ),
    };
    const healOut = resolveAbility(
      state,
      "hero_forest_druid",
      "calm",
      "hero_kharakternyk",
      () => 0.5,
    );
    expect(healOut.state.party[1]!.hp).toBeGreaterThan(0);

    // Multi-qty healing potion (qty: 2) can be used twice
    const healItem = state.party[0]!.inventory.find((i) => i.bonus?.includes("HP"));
    if (healItem) {
      const firstUse = resolveItem(
        healOut.state,
        "hero_forest_druid",
        healItem.id,
        "hero_kharakternyk",
      );
      expect(firstUse.state.lastEvents?.[0]?.kind).toBe("heal");
      if ((healItem.qty ?? 1) >= 2) {
        const secondUse = resolveItem(
          firstUse.state,
          "hero_forest_druid",
          healItem.id,
          "hero_forest_druid",
        );
        expect(secondUse.state.party[0]!.hp).toBeGreaterThan(10);
      }
    }
  });

  it("uses tactical Enemy AI to finish wounded heroes, defend when low HP, and validate LLM JSON", () => {
    let state = newGame(["hero_runic_guardian", "hero_forest_druid"], "uk", {}, () => 0.5);
    // Make druid critically wounded (4 HP) -> AI should prioritize finishing the wounded hero
    state = {
      ...state,
      party: state.party.map((h) => (h.id === "hero_forest_druid" ? { ...h, hp: 4 } : h)),
    };
    const decision = chooseTacticalEnemyDecision(state, state.enemies[0]!, () => 0.5);
    expect(decision.targetId).toBe("hero_forest_druid");

    // Wounded enemy with shield available can choose defensive stance and gain +3 AC
    const woundedEnemyState = {
      ...state,
      enemies: state.enemies.map((e, i) => (i === 0 ? { ...e, hp: 3 } : e)),
    };
    const shieldOut = enemyAct(
      woundedEnemyState,
      "e1",
      { enemyId: "e1", tactic: "brace", reason: "ШІ: глуха оборона", fromAi: true },
      () => 0.5,
    );
    expect(enemyAC(shieldOut.state.enemies[0]!)).toBe(shieldOut.state.enemies[0]!.ac + 3);
    expect(shieldOut.state.enemies[0]!.lastAiReason).toBe("ШІ: глуха оборона");

    // LLM JSON parser rejects targeting a hidden hero and falls back to tactical AI
    const hiddenPartyState = {
      ...state,
      party: state.party.map((h) =>
        h.id === "hero_forest_druid" ? { ...h, status: { ...h.status, hidden: 1 } } : h,
      ),
    };
    const parsed = parseEnemyAiResponse(
      JSON.stringify({
        decisions: [
          {
            enemyId: "e1",
            tactic: "heavy",
            targetId: "hero_forest_druid", // illegal: hidden!
            reason: "bad target",
          },
          {
            enemyId: "e2",
            tactic: "strike",
            targetId: "hero_runic_guardian",
            reason: "ШІ: тиск на щитоносця",
            bark: "Тримайте стрій!",
          },
        ],
      }),
      hiddenPartyState,
      ["e1", "e2"],
      () => 0.5,
    );
    expect(parsed["e1"]?.targetId).toBe("hero_runic_guardian");
    expect(parsed["e1"]?.fromAi).toBe(false);
    expect(parsed["e2"]?.fromAi).toBe(true);
    expect(parsed["e2"]?.bark).toBe("Тримайте стрій!");
  });

  it("completes non-combat acts (Acts IV–VII) after 3 successful free actions", async () => {
    let state = newGame(["hero_illusionist"], "uk", {}, () => 0.5);
    // Act IV (index 3) has no combat enemies, only the Roach King NPC
    state = startAct(state, 3, () => 0.5);
    expect(state.enemies.length).toBe(0);
    expect(state.actReady).toBe(false);

    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));

    for (let step = 0; step < 3; step++) {
      const actor = currentActor(state);
      expect(actor?.type).toBe("hero");
      state = await playHeroTurn(
        state,
        "hero_illusionist",
        { type: "free", text: "Переконати Тарганячого Короля словами" },
        narrate,
        () => 0.7,
      );
    }

    expect(state.actProgress).toBe(3);
    expect(state.actReady).toBe(true);
  });

  it("makes only 1 narrator request per ability turn even when enemies counterattack via AI", async () => {
    const state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.9);
    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));
    const decideEnemies = vi.fn(async (s, ids: string[]) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          {
            enemyId: id,
            tactic: "strike" as const,
            targetId: "hero_kharakternyk",
            reason: "ШІ: контратака",
            fromAi: true,
          },
        ]),
      ),
    );

    const next = await playHeroTurn(
      state,
      "hero_kharakternyk",
      { type: "ability", abilityId: "saber", targetId: state.enemies[0]!.id },
      narrate,
      () => 0.6,
      Date.now(),
      undefined,
      decideEnemies,
    );

    expect(narrate).toHaveBeenCalledTimes(1);
    expect(decideEnemies).toHaveBeenCalledTimes(1);
    expect(next.log.some((e) => e.kind === "master")).toBe(true);
    expect(next.log.some((e) => e.kind === "enemy" && e.text.includes("ШІ: контратака"))).toBe(
      true,
    );
  });

  it("runs playOpeningEnemies with Enemy AI when enemies win initiative", async () => {
    let state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.5);
    state = { ...state, order: ["e1", "e2", "hero_kharakternyk"], pos: 0 };
    expect(upcomingEnemyIds(state)).toEqual(["e1", "e2"]);

    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));
    const next = await playOpeningEnemies(state, narrate, () => 0.6);

    expect(currentActor(next)?.type).toBe("hero");
    expect(narrate).toHaveBeenCalledTimes(1);
    expect(next.log.some((e) => e.kind === "enemy")).toBe(true);
  });

  it("heals party members by +4 HP during short rest between acts and applies interlude choices", () => {
    let state = newGame(["hero_forest_druid"], "uk", {}, () => 0.5);
    state = {
      ...state,
      actReady: true,
      party: state.party.map((h) => ({ ...h, hp: 5 })),
    };
    const next = advanceAct(state, () => 0.5, Date.now(), "sewer_hatch");
    expect(next.actIndex).toBe(1);
    expect(next.party[0]!.hp).toBe(9);
    expect(next.actProgress).toBe(1);
    expect(next.log.some((e) => e.kind === "master" && e.text.includes("каналізацію"))).toBe(true);
  });

  it("emits immediate mechanical progress before narrator finishes and varies narration with hero/ability details", async () => {
    const state = newGame(["hero_kharakternyk"], "uk", {}, () => 0.9);
    const enemy = state.enemies[0]!;
    const progressStates: number[] = [];
    const narrate = vi.fn(async (s, req) => {
      expect(progressStates.length).toBeGreaterThan(0);
      return generateFallbackMasterReply(s, req);
    });

    const next = await playHeroTurn(
      state,
      "hero_kharakternyk",
      { type: "ability", abilityId: "saber", targetId: enemy.id },
      narrate,
      () => 0.75,
      Date.now(),
      (intermediate) => progressStates.push(intermediate.log.length),
    );

    const masterEntry = next.log.filter((e) => e.kind === "master").at(-1)?.text ?? "";
    expect(masterEntry).toContain(state.party[0]!.name);
    expect(masterEntry).toContain(enemy.name);

    const enemyInfoChat = generateFallbackMasterReply(next, {
      kind: "chat",
      from: "Гравець",
      text: "Хто наші вороги і скільки в них ХП?",
    });
    expect(enemyInfoChat.narration).toContain(enemy.name);
  });

  it("opens acts with an initial master narration and supports stealth/item progress in combat acts", async () => {
    let state = newGame(["hero_shadow_elf"], "uk", {}, () => 0.9);
    expect(state.log.some((e) => e.kind === "master")).toBe(true);
    state = {
      ...state,
      party: state.party.map((h) => ({ ...h, hp: 50, maxHp: 50 })),
      order: ["hero_shadow_elf", "e1", "e2", "e3"],
      pos: 0,
    };

    const narrate = vi.fn(async (s, req) => generateFallbackMasterReply(s, req));
    state = await playHeroTurn(
      state,
      "hero_shadow_elf",
      {
        type: "free",
        text: "Використовую «Димові Кульки «Сутінки»»: кидаю дим під ноги та тікаю в провулок",
      },
      narrate,
      () => 0.9,
    );
    expect(state.party[0]!.used).toContain("elf_item_5");
    expect(state.actProgress).toBe(1);

    // 2 more successful stealth/escape steps complete Act I without defeating knights to 0 HP
    for (let i = 0; i < 2; i++) {
      state = { ...state, pos: 0 };
      state = await playHeroTurn(
        state,
        "hero_shadow_elf",
        { type: "free", text: "Прослизнути через чорний хід у темний провулок" },
        narrate,
        () => 0.9,
      );
    }
    expect(state.actProgress).toBe(3);
    expect(state.actReady).toBe(true);
    expect(state.enemies.some((e) => e.hp > 0)).toBe(true);
  });

  it("maps every campaign act to both desktop and mobile location backgrounds", () => {
    for (const act of campaign.acts) {
      const desktop = locationSrc(act.bgType);
      const mobile = locationMobileSrc(act.bgType);
      expect(desktop).toMatch(/^\/game\/locations\/loc_\d+_.*\.webp$/);
      expect(mobile).toMatch(/^\/game\/locations\/loc_\d+_.*_mobile\.jpg$/);
    }
  });

  it("supports online room creation, player verification, state updates, and chat without SUPABASE_SERVICE_ROLE_KEY", async () => {
    const code = newCode();
    const playerId = crypto.randomUUID();
    const token = newToken();
    const created = await createRoomRecord(
      {
        code,
        lang: "uk",
        host_id: playerId,
        players: [{ id: playerId, name: "Руслан", heroId: "hero_kharakternyk", host: true }],
      },
      { player_id: playerId, room_code: code, token_hash: await sha256(token) },
    );
    expect(created).toBe(true);

    const verified = await verifyPlayer(code, playerId, token);
    expect(verified.code).toBe(code);
    expect(verified.players[0]?.name).toBe("Руслан");

    const updated = await saveRoom(code, verified.version, { phase: "playing" });
    expect(updated).toBe(true);
    const reloaded = await loadRoom(code);
    expect(reloaded?.phase).toBe("playing");

    await insertRoomMessage({
      room_code: code,
      author: "Руслан",
      kind: "player",
      to_master: true,
      text: "Вітаю, Майстре!",
    });
    const messages = await loadRoomMessages(code);
    expect(messages.some((m) => m.text === "Вітаю, Майстре!")).toBe(true);
  });
});
