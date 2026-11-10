import { advance, appendLog, appendMaster, applyMasterHp, checkOutcome, clamp, currentActor, d20, runEnemies, useAbility, useItem, type GameState, type MasterReply, type Rng } from "./engine";
import type { NarrateRequest } from "./prompt";
import { generateFallbackMasterReply } from "./fallbackNarrator";

export type HeroAction =
  | { type: "ability"; abilityId: string; targetId?: string | undefined }
  | { type: "item"; itemId: string; targetId?: string | undefined }
  | { type: "free"; text: string }
  | { type: "skip" };

export type Narrator = (state: GameState, req: NarrateRequest) => Promise<MasterReply>;

function applyReply(state: GameState, reply: MasterReply, kind: NarrateRequest["kind"]): GameState {
  let s = appendMaster(state, reply.narration);
  const twist = kind === "mechanic" || kind === "enemies" || kind === "chat";
  s = applyMasterHp(s, reply.hpChanges, twist ? { heroMin: -3, heroMax: 3, enemyMin: -3 } : { heroMin: -6, heroMax: 12, enemyMin: -8 });
  if (reply.suggestions.length) s = { ...s, suggestions: reply.suggestions.slice(0, 3) };
  if (reply.actComplete && kind !== "chat" && s.status === "playing") {
    s = s.actIndex >= 7 ? { ...s, status: "victory" } : { ...s, actReady: true };
  }
  return checkOutcome(s);
}

/**
 * Full hero turn: resolve the action, run any enemy counter-turns, and let the Master narrate
 * in a single combined roundtrip for fast pacing.
 */
export async function playHeroTurn(
  state: GameState,
  heroId: string,
  action: HeroAction,
  narrate: Narrator,
  rng: Rng = Math.random,
  now = Date.now(),
  onProgress?: (intermediate: GameState) => void,
): Promise<GameState> {
  const actor = currentActor(state);
  if (state.status !== "playing" || state.actReady) throw new Error("not playing");
  if (!actor || actor.type !== "hero" || actor.hero.id !== heroId) throw new Error("not your turn");
  const hero = actor.hero;
  let s = state;

  if (action.type === "ability" || action.type === "item") {
    const o = action.type === "ability" ? useAbility(s, heroId, action.abilityId, action.targetId, rng) : useItem(s, heroId, action.itemId, action.targetId);
    s = advance(o.state, now);
    const enemies = runEnemies(s, rng, now);
    s = enemies.state;
    // Immediately emit the mechanical result so HP bars, floating damage, and D20 rolls appear with 0ms delay!
    onProgress?.(s);
    const combinedSummary = enemies.summaries.length ? `${o.summary}\n---\n${enemies.summaries.join("\n")}` : o.summary;
    let reply: MasterReply;
    try {
      reply = await narrate(s, { kind: "mechanic", summary: combinedSummary });
    } catch {
      reply = generateFallbackMasterReply(s, { kind: "mechanic", summary: combinedSummary });
    }
    return applyReply(s, reply, "mechanic");
  }

  if (action.type === "free") {
    const text = action.text.trim().slice(0, 600);
    if (!text) throw new Error("empty");
    const roll = d20(rng);
    s = appendLog({ ...s, lastEvents: [], lastRoll: null }, hero.name, "action", text);
    onProgress?.(s);
    let reply: MasterReply;
    try {
      reply = await narrate(s, { kind: "free", text, d20: roll });
    } catch {
      reply = generateFallbackMasterReply(s, { kind: "free", text, d20: roll });
    }
    if (reply.check) {
      const bonus = hero.stats[reply.check.stat] ?? 0;
      const dc = clamp(reply.check.dc, 5, 20);
      const ok = roll === 20 || (roll !== 1 && roll + bonus >= dc);
      const en = s.lang === "en";
      s = { ...s, lastRoll: { value: roll, bonus, total: roll + bonus, label: reply.check.stat.toUpperCase() } };
      s = appendLog(
        s,
        "D20",
        "roll",
        `${roll} + ${bonus} = ${roll + bonus} • ${en ? "DC" : "Складність"} ${dc} • ${ok ? (en ? "Success" : "Успіх") : en ? "Fail" : "Невдача"}${roll === 20 ? " • CRIT!" : roll === 1 ? (en ? " • Critical fail!" : " • Критичний провал!") : ""}`,
      );
      if (!ok) reply.hpChanges = reply.hpChanges.filter((c) => !s.enemies.some((e) => e.name === c.target));
      if (ok && s.enemies.length === 0) {
        s = { ...s, actProgress: (s.actProgress ?? 0) + 1 };
      }
    } else if (s.enemies.length === 0) {
      s = { ...s, actProgress: (s.actProgress ?? 0) + 1 };
    }
    s = applyReply(s, reply, "free");
  } else {
    s = appendLog(s, hero.name, "system", s.lang === "en" ? "Skipped the turn" : "Пропустив хід");
  }

  s = advance(s, now);
  const enemies = runEnemies(s, rng, now);
  s = enemies.state;
  if (enemies.summaries.length && s.status !== "victory") {
    onProgress?.(s);
    try {
      s = applyReply(s, await narrate(s, { kind: "enemies", summary: enemies.summaries }), "enemies");
    } catch {
      s = applyReply(s, generateFallbackMasterReply(s, { kind: "enemies", summary: enemies.summaries }), "enemies");
    }
  }
  return s;
}

/** Enemies act first at the start of an act if they won initiative. */
export async function playOpeningEnemies(state: GameState, narrate: Narrator, rng: Rng = Math.random, now = Date.now()): Promise<GameState> {
  const a = currentActor(state);
  if (!a || a.type !== "enemy") return state;
  const r = runEnemies(state, rng, now);
  let s = r.state;
  if (r.summaries.length) {
    try {
      s = applyReply(s, await narrate(s, { kind: "enemies", summary: r.summaries }), "enemies");
    } catch {
      s = applyReply(s, generateFallbackMasterReply(s, { kind: "enemies", summary: r.summaries }), "enemies");
    }
  }
  return s;
}

export async function masterChat(state: GameState, from: string, text: string, narrate: Narrator): Promise<{ state: GameState; reply: string }> {
  let reply: MasterReply;
  try {
    reply = await narrate(state, { kind: "chat", from, text: text.slice(0, 400) });
  } catch {
    reply = generateFallbackMasterReply(state, { kind: "chat", from, text: text.slice(0, 400) });
  }
  const s = applyMasterHp(state, reply.hpChanges, { heroMin: -3, heroMax: 3, enemyMin: -3 });
  return { state: checkOutcome(s), reply: reply.narration };
}
