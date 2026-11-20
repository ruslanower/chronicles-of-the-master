import { itemHeal } from "./content";
import {
  ACT_PROGRESS_GOAL,
  advance,
  appendLog,
  appendMaster,
  applyMasterHp,
  checkOutcome,
  clamp,
  currentActor,
  d20,
  enemyAct,
  resolveAbility,
  resolveItem,
  runEnemies,
  upcomingEnemyIds,
  type CombatEvent,
  type GameState,
  type MasterReply,
  type Rng,
} from "./engine";
import type { EnemyAiDecider, EnemyDecision } from "./enemyAi";
import type { NarrateRequest } from "./prompt";
import { generateFallbackMasterReply } from "./fallbackNarrator";

export type HeroAction =
  | { type: "ability"; abilityId: string; targetId?: string | undefined }
  | { type: "item"; itemId: string; targetId?: string | undefined }
  | { type: "free"; text: string }
  | { type: "skip" };

export type Narrator = (state: GameState, req: NarrateRequest) => Promise<MasterReply>;

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

function applyReply(state: GameState, reply: MasterReply, kind: NarrateRequest["kind"]): GameState {
  let s = appendMaster(state, reply.narration);
  if (kind === "free" || kind === "chat") {
    const twist = kind === "chat";
    s = applyMasterHp(
      s,
      reply.hpChanges,
      twist
        ? { heroMin: -3, heroMax: 3, enemyMin: -3 }
        : { heroMin: -6, heroMax: 12, enemyMin: -8 },
    );
  }
  if (reply.suggestions.length) s = { ...s, suggestions: reply.suggestions.slice(0, 3) };
  const canCompleteEarly =
    kind === "free" &&
    ((s.actProgress ?? 0) >= ACT_PROGRESS_GOAL || s.enemies.every((e) => e.hp <= 0));
  if (reply.actComplete && canCompleteEarly && s.status === "playing") {
    s = s.actIndex >= 7 ? { ...s, status: "victory" } : { ...s, actReady: true };
  }
  return checkOutcome(s);
}

async function resolveAiEnemyDecisions(
  state: GameState,
  decideEnemies?: EnemyAiDecider,
): Promise<Record<string, EnemyDecision>> {
  if (!decideEnemies) return {};
  const ids = upcomingEnemyIds(state);
  if (!ids.length) return {};
  try {
    return await decideEnemies(state, ids);
  } catch {
    return {};
  }
}

/**
 * Step through consecutive enemy turns. When stepDelayMs > 0 and onProgress is provided,
 * each enemy acts visibly one-by-one with a pause so the player can watch every attack and roll.
 */
async function runEnemiesPaced(
  state: GameState,
  rng: Rng,
  now: number,
  decisions: Record<string, EnemyDecision>,
  onProgress?: (intermediate: GameState) => void,
  stepDelayMs = 0,
): Promise<{ state: GameState; summaries: string[] }> {
  if (stepDelayMs <= 0 || !onProgress) {
    const res = runEnemies(state, rng, now, decisions);
    if (res.summaries.length) onProgress?.(res.state);
    return res;
  }

  let s = state;
  const summaries: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    if (s.status !== "playing" || s.actReady) break;
    const a = currentActor(s);
    if (!a || a.type !== "enemy") break;
    if (a.enemy.hp > 0) {
      // Highlight the acting enemy before they strike
      onProgress({ ...s, lastEvents: [] });
      await sleep(Math.min(420, Math.round(stepDelayMs * 0.35)));
      const o = enemyAct(s, a.enemy.id, decisions[a.enemy.id], rng);
      s = checkOutcome(o.state);
      summaries.push(o.summary);
      onProgress(s);
      await sleep(stepDelayMs);
    }
    s = advance(s, now);
  }
  return { state: checkOutcome(s), summaries };
}

/**
 * Full hero turn: resolve the action, show the hero's hit/miss animation,
 * let Enemy AI run any enemy counter-turns with dramatic pacing, and let the Master narrate.
 */
export async function playHeroTurn(
  state: GameState,
  heroId: string,
  action: HeroAction,
  narrate: Narrator,
  rng: Rng = Math.random,
  now = Date.now(),
  onProgress?: (intermediate: GameState) => void,
  decideEnemies?: EnemyAiDecider,
  stepDelayMs = 0,
): Promise<GameState> {
  const actor = currentActor(state);
  if (state.status !== "playing" || state.actReady) throw new Error("not playing");
  if (!actor || actor.type !== "hero" || actor.hero.id !== heroId) throw new Error("not your turn");
  const hero = actor.hero;
  let s = state;

  if (action.type === "ability" || action.type === "item") {
    const o =
      action.type === "ability"
        ? resolveAbility(s, heroId, action.abilityId, action.targetId, rng)
        : resolveItem(s, heroId, action.itemId, action.targetId);

    // Emit the hero's mechanical result BEFORE advancing turn so the hero's lunge & target hit/miss animation play first!
    onProgress?.(o.state);
    const afterHero = advance(o.state, now);

    // Fetch enemy AI decisions concurrently while the hero's attack animation plays
    const [decisions] = await Promise.all([
      resolveAiEnemyDecisions(afterHero, decideEnemies),
      sleep(stepDelayMs > 0 ? Math.round(stepDelayMs * 0.85) : 0),
    ]);

    s = afterHero;
    const enemies = await runEnemiesPaced(s, rng, now, decisions, onProgress, stepDelayMs);
    s = enemies.state;

    const combinedSummary = enemies.summaries.length
      ? `${o.summary}\n---\n${enemies.summaries.join("\n")}`
      : o.summary;
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
    const lettersOnly = text.replace(/[^\p{L}]/gu, "");
    const en = s.lang === "en";
    if (lettersOnly.length < 3) {
      s = appendLog({ ...s, lastEvents: [], lastRoll: null }, hero.name, "action", text);
      s = appendMaster(
        s,
        en
          ? `The Master raises an eyebrow at ${hero.name}'s meaningless gesture ("${text}"). Describe a real, concrete action!`
          : `Майстер скептично хмуриться на незрозумілу репліку ${hero.name} («${text}»). Опишіть реальну, осмислену дію героя!`,
      );
      return s;
    }
    const roll = d20(rng);
    s = appendLog({ ...s, lastEvents: [], lastRoll: null }, hero.name, "action", text);
    onProgress?.(s);
    let reply: MasterReply;
    try {
      reply = await narrate(s, { kind: "free", text, d20: roll });
    } catch {
      reply = generateFallbackMasterReply(s, { kind: "free", text, d20: roll });
    }
    const usedItem = hero.inventory.find(
      (it) =>
        !it.equipped &&
        itemHeal(it.bonus) == null &&
        text.toLowerCase().includes(it.name.toLowerCase()) &&
        hero.used.filter((id) => id === it.id).length < (it.qty ?? 1),
    );
    if (usedItem) {
      s = {
        ...s,
        party: s.party.map((h) =>
          h.id === hero.id ? { ...h, used: [...h.used, usedItem.id] } : h,
        ),
      };
    }

    const freeEvents: CombatEvent[] = [];
    const allowsProgress = reply.progress !== false;
    if (reply.check && allowsProgress) {
      const bonus = hero.stats[reply.check.stat] ?? 0;
      const dc = clamp(reply.check.dc, 5, 20);
      const ok = roll === 20 || (roll !== 1 && roll + bonus >= dc);
      s = {
        ...s,
        lastRoll: {
          value: roll,
          bonus,
          total: roll + bonus,
          label: reply.check.stat.toUpperCase(),
        },
      };
      s = appendLog(
        s,
        "D20",
        "roll",
        `${roll} + ${bonus} = ${roll + bonus} • ${en ? "DC" : "Складність"} ${dc} • ${ok ? (en ? "Success" : "Успіх") : en ? "Fail" : "Невдача"}${roll === 20 ? " • CRIT!" : roll === 1 ? (en ? " • Critical fail!" : " • Критичний провал!") : ""}`,
      );
      if (!ok) {
        reply.hpChanges = reply.hpChanges.filter(
          (c) =>
            !s.enemies.some(
              (e) => e.id === c.target || e.name.toLowerCase() === c.target.trim().toLowerCase(),
            ),
        );
        const failTarget = s.enemies.find((e) => e.hp > 0)?.id ?? hero.id;
        freeEvents.push({
          id: `free-miss-${Date.now()}`,
          targetId: failTarget,
          attackerId: hero.id,
          text: en ? "MISS / FAIL" : "ПРОМАХ / НЕВДАЧА",
          kind: "miss",
        });
      } else if (!reply.hpChanges.some((c) => c.delta < 0)) {
        freeEvents.push({
          id: `free-ok-${Date.now()}`,
          targetId: hero.id,
          attackerId: hero.id,
          text: roll === 20 ? (en ? "CRIT SUCCESS!" : "КРИТ УСПІХ!") : en ? "SUCCESS!" : "УСПІХ!",
          kind: roll === 20 ? "crit" : "status",
        });
      }
      const isNonDamageObjectiveMove = !reply.hpChanges.some((c) => c.delta < 0);
      if (ok && (s.enemies.length === 0 || isNonDamageObjectiveMove)) {
        s = { ...s, actProgress: (s.actProgress ?? 0) + 1 };
      }
    } else if (!allowsProgress) {
      freeEvents.push({
        id: `free-invalid-${Date.now()}`,
        targetId: hero.id,
        attackerId: hero.id,
        text: en ? "NO EFFECT" : "БЕЗ ЕФЕКТУ",
        kind: "miss",
      });
    } else if (s.enemies.length === 0) {
      s = { ...s, actProgress: (s.actProgress ?? 0) + 1 };
    }
    if (freeEvents.length) {
      s = { ...s, lastEvents: freeEvents };
    }
    s = applyReply(s, reply, "free");
    onProgress?.(s);
    if (
      stepDelayMs > 0 &&
      s.status === "playing" &&
      !s.actReady &&
      s.enemies.some((e) => e.hp > 0)
    ) {
      await sleep(stepDelayMs);
    }
  } else {
    s = appendLog(s, hero.name, "system", s.lang === "en" ? "Skipped the turn" : "Пропустив хід");
  }

  s = advance(s, now);
  const decisions = await resolveAiEnemyDecisions(s, decideEnemies);
  const enemies = await runEnemiesPaced(s, rng, now, decisions, onProgress, stepDelayMs);
  s = enemies.state;
  if (enemies.summaries.length && s.status !== "victory") {
    onProgress?.(s);
    try {
      s = applyReply(
        s,
        await narrate(s, { kind: "enemies", summary: enemies.summaries }),
        "enemies",
      );
    } catch {
      s = applyReply(
        s,
        generateFallbackMasterReply(s, { kind: "enemies", summary: enemies.summaries }),
        "enemies",
      );
    }
  }
  return s;
}

/** Enemies act first at the start of an act if they won initiative. */
export async function playOpeningEnemies(
  state: GameState,
  narrate: Narrator,
  rng: Rng = Math.random,
  now = Date.now(),
  decideEnemies?: EnemyAiDecider,
  onProgress?: (intermediate: GameState) => void,
  stepDelayMs = 0,
): Promise<GameState> {
  const a = currentActor(state);
  if (!a || a.type !== "enemy") return state;
  const decisions = await resolveAiEnemyDecisions(state, decideEnemies);
  const r = await runEnemiesPaced(state, rng, now, decisions, onProgress, stepDelayMs);
  let s = r.state;
  if (r.summaries.length) {
    try {
      s = applyReply(s, await narrate(s, { kind: "enemies", summary: r.summaries }), "enemies");
    } catch {
      s = applyReply(
        s,
        generateFallbackMasterReply(s, { kind: "enemies", summary: r.summaries }),
        "enemies",
      );
    }
  }
  return s;
}

export async function masterChat(
  state: GameState,
  from: string,
  text: string,
  narrate: Narrator,
): Promise<{ state: GameState; reply: string }> {
  let reply: MasterReply;
  try {
    reply = await narrate(state, { kind: "chat", from, text: text.slice(0, 400) });
  } catch {
    reply = generateFallbackMasterReply(state, { kind: "chat", from, text: text.slice(0, 400) });
  }
  const s = applyMasterHp(state, reply.hpChanges, { heroMin: -3, heroMax: 3, enemyMin: -3 });
  return { state: checkOutcome(s), reply: reply.narration };
}
