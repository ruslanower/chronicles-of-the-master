import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GameState } from "@/game/engine";
import type { RoomPlayer } from "./rooms.server";

const creds = { code: z.string().trim().toUpperCase().length(6), playerId: z.string().uuid(), token: z.string().min(20).max(80) };
const name = z.string().trim().min(1).max(24);
const lang = z.enum(["uk", "en"]);
type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name, lang }).parse(d))
  .handler(async ({ data }) => {
    const { admin, newCode, newToken, sha256 } = await import("./rooms.server");
    const db = await admin();
    const playerId = crypto.randomUUID();
    const token = newToken();
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const players: RoomPlayer[] = [{ id: playerId, name: data.name, heroId: null, host: true }];
      const { error } = await db.from("rooms").insert({ code, lang: data.lang, host_id: playerId, players } as never);
      if (error) continue;
      await db.from("room_secrets").insert({ player_id: playerId, room_code: code, token_hash: await sha256(token) });
      return { ok: true as const, code, playerId, token };
    }
    return fail("create failed");
  });

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ code: creds.code, name }).parse(d))
  .handler(async ({ data }) => {
    const { admin, loadRoom, newToken, saveRoom, sha256 } = await import("./rooms.server");
    for (let attempt = 0; attempt < 4; attempt++) {
      const room = await loadRoom(data.code);
      if (!room) return fail("not_found");
      if (room.phase !== "lobby" || room.players.length >= 4) return fail("full");
      const playerId = crypto.randomUUID();
      const token = newToken();
      const players = [...room.players, { id: playerId, name: data.name, heroId: null, host: false }];
      if (!(await saveRoom(room.code, room.version, { players }))) continue;
      const db = await admin();
      await db.from("room_secrets").insert({ player_id: playerId, room_code: room.code, token_hash: await sha256(token) });
      return { ok: true as const, code: room.code, playerId, token };
    }
    return fail("busy");
  });

export const pickHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ...creds, heroId: z.string().max(40).nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { verifyPlayer, saveRoom, loadRoom } = await import("./rooms.server");
    let room = await verifyPlayer(data.code, data.playerId, data.token);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (room.phase !== "lobby") return fail("started");
      if (data.heroId && room.players.some((p) => p.heroId === data.heroId && p.id !== data.playerId)) return fail("taken");
      const players = room.players.map((p) => (p.id === data.playerId ? { ...p, heroId: data.heroId } : p));
      if (await saveRoom(room.code, room.version, { players })) return { ok: true as const };
      room = (await loadRoom(data.code))!;
    }
    return fail("busy");
  });

export const startRoom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object(creds).parse(d))
  .handler(async ({ data }) => {
    const { verifyPlayer, saveRoom } = await import("./rooms.server");
    const { newGame } = await import("@/game/engine");
    const { playOpeningEnemies } = await import("@/game/turn");
    const { narrateServer } = await import("./master.server");
    const room = await verifyPlayer(data.code, data.playerId, data.token);
    if (room.host_id !== data.playerId) return fail("host_only");
    if (room.phase !== "lobby") return fail("started");
    const picked = room.players.filter((p) => p.heroId);
    if (!picked.length || picked.length !== room.players.length) return fail("need_hero");
    const owners = Object.fromEntries(picked.map((p) => [p.heroId!, { id: p.id, name: p.name }]));
    const langV = room.lang === "en" ? "en" : "uk";
    let state = newGame(picked.map((p) => p.heroId!), langV, owners);
    state = await playOpeningEnemies(state, narrateServer);
    if (!(await saveRoom(room.code, room.version, { phase: "playing", state, busy_until: null }))) return fail("busy");
    return { ok: true as const };
  });

const action = z.union([
  z.object({ type: z.literal("ability"), abilityId: z.string().max(40), targetId: z.string().max(40).optional() }),
  z.object({ type: z.literal("item"), itemId: z.string().max(60), targetId: z.string().max(40).optional() }),
  z.object({ type: z.literal("free"), text: z.string().trim().min(1).max(600) }),
]);

type Op = "turn" | "tick" | "nextAct" | "retry";

async function runRoomOp(data: { code: string; playerId: string; token: string }, op: Op, act?: z.infer<typeof action>) {
  const { verifyPlayer, claimRoom, saveRoom } = await import("./rooms.server");
  const engine = await import("@/game/engine");
  const { playHeroTurn, playOpeningEnemies } = await import("@/game/turn");
  const { narrateServer, masterErrorMessage } = await import("./master.server");
  const room = await verifyPlayer(data.code, data.playerId, data.token);
  const state = room.state as GameState | null;
  if (room.phase !== "playing" || !state) return fail("not_playing");
  const actor = engine.currentActor(state);

  // Validate before claiming the room.
  if (op === "turn") {
    if (!actor || actor.type !== "hero" || actor.hero.ownerId !== data.playerId) return fail("not_your_turn");
  } else if (op === "tick") {
    if (!actor || actor.type !== "hero" || state.status !== "playing" || state.actReady) return { ok: true as const };
    if (Date.now() < state.turnStartedAt + (engine.TURN_SECONDS + 2) * 1000) return { ok: true as const };
  } else if (op === "nextAct" && !state.actReady) return { ok: true as const };
  else if (op === "retry" && state.status !== "defeat") return { ok: true as const };

  const version = await claimRoom(room);
  if (version == null) return fail("busy");
  try {
    let next: GameState;
    if (op === "turn") next = await playHeroTurn(state, (actor as { hero: { id: string } }).hero.id, act!, narrateServer);
    else if (op === "tick") next = await playHeroTurn(state, (actor as { hero: { id: string } }).hero.id, { type: "skip" }, narrateServer);
    else if (op === "nextAct") next = await playOpeningEnemies(engine.advanceAct(state), narrateServer);
    else next = await playOpeningEnemies(engine.retryAct(state), narrateServer);
    await saveRoom(room.code, version, { state: next, busy_until: null });
    return { ok: true as const };
  } catch (e) {
    console.error(e);
    await saveRoom(room.code, version, { busy_until: null });
    const msg = e instanceof Error ? e.message : "";
    if (msg === "cooldown" || msg === "no target" || msg === "bad item" || msg === "not usable") return fail(msg);
    return fail(masterErrorMessage(e, state.lang));
  }
}

export const roomTurn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ...creds, action }).parse(d))
  .handler(({ data }) => runRoomOp(data, "turn", data.action));

export const roomTick = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object(creds).parse(d))
  .handler(({ data }) => runRoomOp(data, "tick"));

export const roomNextAct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object(creds).parse(d))
  .handler(({ data }) => runRoomOp(data, "nextAct"));

export const roomRetry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object(creds).parse(d))
  .handler(({ data }) => runRoomOp(data, "retry"));

export const roomChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ ...creds, text: z.string().trim().min(1).max(400), toMaster: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { verifyPlayer, admin, saveRoom, loadRoom } = await import("./rooms.server");
    const room = await verifyPlayer(data.code, data.playerId, data.token);
    const me = room.players.find((p) => p.id === data.playerId);
    const db = await admin();
    await db.from("room_messages").insert({ room_code: room.code, author: me?.name ?? "?", kind: "player", to_master: data.toMaster, text: data.text });
    if (!data.toMaster || !room.state) return { ok: true as const };
    const { masterChat } = await import("@/game/turn");
    const { narrateServer, masterErrorMessage } = await import("./master.server");
    try {
      const out = await masterChat(room.state, me?.name ?? "?", data.text, narrateServer);
      await db.from("room_messages").insert({ room_code: room.code, author: room.lang === "en" ? "Master" : "Майстер", kind: "master", text: out.reply });
      // Apply the Master's small consequences if nobody is mid-turn.
      const latest = await loadRoom(room.code);
      if (latest?.state && !(latest.busy_until && new Date(latest.busy_until).getTime() > Date.now())) {
        const { applyMasterHp, checkOutcome } = await import("@/game/engine");
        const diff = out.state.party.map((h) => ({ target: h.id, delta: h.hp - (room.state!.party.find((x) => x.id === h.id)?.hp ?? h.hp) })).filter((c) => c.delta);
        if (diff.length) await saveRoom(room.code, latest.version, { state: checkOutcome(applyMasterHp(latest.state, diff, { heroMin: -3, heroMax: 3, enemyMin: -3 })) });
      }
      return { ok: true as const };
    } catch (e) {
      console.error(e);
      return fail(masterErrorMessage(e, room.lang === "en" ? "en" : "uk"));
    }
  });
