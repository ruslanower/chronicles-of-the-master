import type { EnemyState, GameState, HeroState, Rng } from "./engine";
import { heroAC } from "./engine";
import { campaignFor } from "./i18n";

export type EnemyTacticId =
  "strike" | "heavy" | "brace" | "bolt" | "pin" | "evade" | "mandible" | "acid" | "carapace";

export type EnemyTacticDef = {
  id: EnemyTacticId;
  kind: "attack" | "aoe" | "stun" | "shield" | "heal_shield";
  dice?: string;
  bonusMod?: number;
  cooldown: number;
  ignoreShield?: boolean;
  name: Record<"uk" | "en", string>;
};

export type EnemyDecision = {
  enemyId: string;
  tactic: EnemyTacticId;
  targetId?: string;
  reason: string;
  bark?: string;
  fromAi?: boolean;
};

export type EnemyAiDecider = (
  state: GameState,
  enemyIds: string[],
) => Promise<Record<string, EnemyDecision>>;

const KNIGHT_TACTICS: EnemyTacticDef[] = [
  {
    id: "strike",
    kind: "attack",
    dice: "1d6",
    bonusMod: 0,
    cooldown: 0,
    name: { uk: "Удар алебардою", en: "Halberd Strike" },
  },
  {
    id: "heavy",
    kind: "attack",
    dice: "1d8",
    bonusMod: -1,
    cooldown: 2,
    name: { uk: "Нищівний пролом", en: "Crushing Cleave" },
  },
  {
    id: "brace",
    kind: "shield",
    cooldown: 2,
    name: { uk: "Стіна щитів", en: "Shield Wall" },
  },
];

const XBOW_TACTICS: EnemyTacticDef[] = [
  {
    id: "bolt",
    kind: "attack",
    dice: "1d8",
    bonusMod: 0,
    cooldown: 0,
    name: { uk: "Прицільний болт", en: "Aimed Bolt" },
  },
  {
    id: "pin",
    kind: "stun",
    dice: "1d6",
    bonusMod: 0,
    cooldown: 2,
    name: { uk: "Сковуючий постріл", en: "Pinning Shot" },
  },
  {
    id: "evade",
    kind: "shield",
    cooldown: 2,
    name: { uk: "Відступ у тінь", en: "Evasive Roll" },
  },
];

const ROACH_TACTICS: EnemyTacticDef[] = [
  {
    id: "mandible",
    kind: "attack",
    dice: "1d6",
    bonusMod: 0,
    cooldown: 0,
    name: { uk: "Укус жвалами", en: "Mandible Bite" },
  },
  {
    id: "acid",
    kind: "aoe",
    dice: "1d4",
    bonusMod: 1,
    cooldown: 2,
    ignoreShield: true,
    name: { uk: "Кислотний залп", en: "Acid Spray" },
  },
  {
    id: "carapace",
    kind: "heal_shield",
    cooldown: 2,
    name: { uk: "Хітиновий панцир", en: "Chitin Carapace" },
  },
];

export function getEnemyTactics(enemy: Pick<EnemyState, "key" | "attack">): EnemyTacticDef[] {
  if (enemy.key.startsWith("xbow")) return XBOW_TACTICS;
  if (enemy.key.startsWith("roach")) return ROACH_TACTICS;
  if (enemy.key.startsWith("knight")) return KNIGHT_TACTICS;
  return [
    {
      id: "strike",
      kind: "attack",
      dice: enemy.attack || "1d6",
      bonusMod: 0,
      cooldown: 0,
      name: { uk: "Атака", en: "Strike" },
    },
  ];
}

export function getAvailableTactics(enemy: EnemyState, visibleHeroCount: number): EnemyTacticDef[] {
  const cds = enemy.cooldowns ?? {};
  return getEnemyTactics(enemy).filter((t) => {
    if ((cds[t.id] ?? 0) > 0) return false;
    if (t.kind === "aoe" && visibleHeroCount < 2) return false;
    return true;
  });
}

function heroThreatScore(h: HeroState): number {
  let score = 0;
  // Healers & casters are high-priority tactical threats
  if (h.id === "hero_forest_druid") score += 6;
  if (h.id === "hero_astral_warlock") score += 5;
  if (h.id === "hero_illusionist") score += 4;
  if (h.id === "hero_shadow_elf") score += 4;
  score += Math.max(h.stats.str, h.stats.agi, h.stats.int, h.stats.cha);
  // Wounded heroes are attractive kill targets
  const hpRatio = h.hp / Math.max(1, h.maxHp);
  score += (1 - hpRatio) * 10;
  if (h.hp <= 7) score += 8;
  // Penalize hard-to-hit shielded tanks
  const ac = heroAC(h);
  score -= (ac - 12) * 1.4;
  if (h.status.shield > 0) score -= 3;
  return score;
}

/** Deterministic/utility tactical AI for enemies when LLM is unavailable or as validation fallback. */
export function chooseTacticalEnemyDecision(
  state: GameState,
  enemy: EnemyState,
  rng: Rng = Math.random,
): EnemyDecision {
  const en = state.lang === "en";
  const targets = state.party.filter((h) => h.hp > 0 && h.status.hidden <= 0);
  const tactics = getAvailableTactics(enemy, targets.length);
  const basic = tactics[0]!;

  if (!targets.length) {
    const defTactic = tactics.find((t) => t.kind === "shield" || t.kind === "heal_shield");
    if (defTactic) {
      return {
        enemyId: enemy.id,
        tactic: defTactic.id,
        reason: en ? "AI: bracing against unseen foes" : "ШІ: оборона проти невидимих цілей",
        fromAi: false,
      };
    }
    return {
      enemyId: enemy.id,
      tactic: basic.id,
      reason: en ? "AI: scanning shadows" : "ШІ: шукає прихованих героїв",
      fromAi: false,
    };
  }

  // Sort targets by tactical priority (with slight jitter so tied targets vary naturally)
  const scoredTargets = targets
    .map((h) => ({ hero: h, score: heroThreatScore(h) + rng() * 1.2 }))
    .sort((a, b) => b.score - a.score);
  const bestTarget = scoredTargets[0]!.hero;
  const finisherTarget = targets.find((h) => h.hp <= 6);
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0).length;
  const lowHp = enemy.hp <= enemy.maxHp * 0.45;
  const defTactic = tactics.find((t) => t.kind === "shield" || t.kind === "heal_shield");
  const aoeTactic = tactics.find((t) => t.kind === "aoe");
  const stunTactic = tactics.find((t) => t.kind === "stun");
  const heavyTactic = tactics.find((t) => t.id === "heavy");

  // 1. If a hero is critically low, prioritize finishing them off aggressively
  if (finisherTarget) {
    const attackTactic = heavyTactic && heroAC(finisherTarget) <= 13 ? heavyTactic : basic;
    return {
      enemyId: enemy.id,
      tactic: attackTactic.id,
      targetId: finisherTarget.id,
      reason: en
        ? `AI: finish wounded ${finisherTarget.name}`
        : `ШІ: добити пораненого (${finisherTarget.name})`,
      fromAi: false,
    };
  }

  // 2. Self-preservation / defensive stance if low HP and still facing multiple heroes or without shield
  if (
    lowHp &&
    defTactic &&
    enemy.status.shield <= 0 &&
    (targets.length >= 2 || aliveEnemies > 1) &&
    rng() < 0.7
  ) {
    return {
      enemyId: enemy.id,
      tactic: defTactic.id,
      reason: en ? "AI: defensive stance while wounded" : "ШІ: глуха оборона при пораненні",
      fromAi: false,
    };
  }

  // 3. AOE acid spray when multiple heroes are visible
  if (aoeTactic && targets.length >= 2) {
    return {
      enemyId: enemy.id,
      tactic: aoeTactic.id,
      reason: en ? "AI: area attack on clustered party" : "ШІ: масова атака по загону",
      fromAi: false,
    };
  }

  // 4. Control/pin highest-threat hero when party has >= 2 alive heroes
  if (stunTactic && targets.length >= 2 && bestTarget.status.stunned <= 0) {
    return {
      enemyId: enemy.id,
      tactic: stunTactic.id,
      targetId: bestTarget.id,
      reason: en
        ? `AI: suppress threat (${bestTarget.name})`
        : `ШІ: знерухомити загрозу (${bestTarget.name})`,
      fromAi: false,
    };
  }

  // 5. Heavy strike against squishy or unshielded high-threat target
  if (heavyTactic && (heroAC(bestTarget) <= 13 || enemy.hp <= enemy.maxHp / 2)) {
    return {
      enemyId: enemy.id,
      tactic: heavyTactic.id,
      targetId: bestTarget.id,
      reason: en
        ? `AI: heavy breach on ${bestTarget.name}`
        : `ШІ: пролом захисту (${bestTarget.name})`,
      fromAi: false,
    };
  }

  // 6. Standard tactical focus on highest-threat target
  const isHealer = bestTarget.id === "hero_forest_druid";
  const isWounded = bestTarget.hp < bestTarget.maxHp * 0.65;
  const reason = isHealer
    ? en
      ? "AI: focus party healer"
      : "ШІ: фокус на цілителя"
    : isWounded
      ? en
        ? "AI: press wounded target"
        : "ШІ: тиск на пораненого"
      : en
        ? `AI: target ${bestTarget.name}`
        : `ШІ: приціл по ${bestTarget.name}`;

  return {
    enemyId: enemy.id,
    tactic: basic.id,
    targetId: bestTarget.id,
    reason,
    fromAi: false,
  };
}

export function buildEnemyAiPrompt(state: GameState, enemyIds: string[]) {
  const en = state.lang === "en";
  const act = campaignFor(state.lang).acts[state.actIndex];
  const visibleHeroes = state.party.filter((h) => h.hp > 0 && h.status.hidden <= 0);
  const actingEnemies = enemyIds
    .map((id) => state.enemies.find((e) => e.id === id && e.hp > 0))
    .filter((e): e is EnemyState => Boolean(e));

  const langRule = en
    ? "Respond with reason & bark in English."
    : "Поля reason і bark пиши ВИКЛЮЧНО українською.";
  const instructions = `You are the TACTICAL ENEMY AI COMMANDER in a turn-based D&D RPG ("${act?.locationName ?? ""}").
Your job is to control the enemies intelligently so combat feels smart, reactive, and dangerous!
${langRule}
Tactical guidelines:
- Focus fire on wounded heroes (low HP) to knock them down, or pressure healers/casters (Druid, Warlock, Illusionist).
- Avoid wasting heavy low-hit attacks on high-AC shielded Guardians unless finishing them off.
- Use defensive tactics (brace, evade, carapace) when an enemy is wounded (<50% HP) and not already shielded.
- Use AOE ("acid") when 2+ heroes are visible, or control ("pin") on dangerous un-stunned heroes when 2+ heroes are alive.
- Return ONLY valid JSON with no markdown fences:
{
  "decisions": [
    {
      "enemyId": "e1",
      "tactic": "valid tactic id from that enemy's available list",
      "targetId": "hero id from visible heroes (omit for shield/aoe/self)",
      "reason": "2-5 words explaining the AI tactic",
      "bark": "short in-character battle line (max 8 words)"
    }
  ]
}`;

  const heroesDesc =
    visibleHeroes
      .map(
        (h) =>
          `- id="${h.id}" name="${h.name}" HP=${h.hp}/${h.maxHp} AC=${heroAC(h)}${h.status.shield > 0 ? " [SHIELDED]" : ""}${h.status.stunned > 0 ? " [STUNNED]" : ""} role="${h.role}"`,
      )
      .join("\n") || "(none visible — all heroes are hidden!)";

  const enemiesDesc = actingEnemies
    .map((e) => {
      const avail = getAvailableTactics(e, visibleHeroes.length)
        .map((t) => `${t.id} (${t.kind}${t.dice ? `, ${t.dice}` : ""})`)
        .join(", ");
      return `- id="${e.id}" name="${e.name}" HP=${e.hp}/${e.maxHp}${e.hp <= e.maxHp / 2 ? " [ENRAGED +1 hit]" : ""} AC=${e.ac}${e.status.shield > 0 ? "+3" : ""} availableTactics=[${avail}]`;
    })
    .join("\n");

  const recent = state.log
    .slice(-6)
    .map((l) => `${l.who}: ${l.text}`)
    .join("\n");

  const prompt = `ROUND: ${state.round}
ACTING ENEMIES:
${enemiesDesc}

VISIBLE HERO TARGETS:
${heroesDesc}

RECENT LOG:
${recent}`;

  return { instructions, prompt };
}

export function parseEnemyAiResponse(
  raw: string,
  state: GameState,
  enemyIds: string[],
  rng: Rng = Math.random,
): Record<string, EnemyDecision> {
  const out: Record<string, EnemyDecision> = {};
  const visibleHeroes = state.party.filter((h) => h.hp > 0 && h.status.hidden <= 0);

  try {
    const trimmed = raw.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { decisions?: unknown[] };
      if (Array.isArray(parsed.decisions)) {
        for (const item of parsed.decisions) {
          if (!item || typeof item !== "object") continue;
          const rec = item as Record<string, unknown>;
          const enemyId = typeof rec["enemyId"] === "string" ? rec["enemyId"] : "";
          if (!enemyIds.includes(enemyId)) continue;
          const enemy = state.enemies.find((e) => e.id === enemyId && e.hp > 0);
          if (!enemy) continue;

          const avail = getAvailableTactics(enemy, visibleHeroes.length);
          const rawTactic = typeof rec["tactic"] === "string" ? rec["tactic"] : "";
          const chosenTactic = avail.find((t) => t.id === rawTactic);
          if (!chosenTactic) continue;

          const rawTarget = typeof rec["targetId"] === "string" ? rec["targetId"] : "";
          const validTarget = visibleHeroes.find(
            (h) => h.id === rawTarget || h.name.toLowerCase() === rawTarget.toLowerCase(),
          );
          const needsSingleTarget = chosenTactic.kind === "attack" || chosenTactic.kind === "stun";
          if (needsSingleTarget && !validTarget && visibleHeroes.length > 0) continue;

          const rawReason =
            typeof rec["reason"] === "string" ? rec["reason"].trim().slice(0, 80) : "";
          const rawBark = typeof rec["bark"] === "string" ? rec["bark"].trim().slice(0, 120) : "";

          out[enemyId] = {
            enemyId,
            tactic: chosenTactic.id,
            ...(validTarget ? { targetId: validTarget.id } : {}),
            reason: rawReason || (state.lang === "en" ? "AI tactical move" : "ШІ-тактичний хід"),
            ...(rawBark ? { bark: rawBark } : {}),
            fromAi: true,
          };
        }
      }
    }
  } catch {
    // ignore malformed LLM JSON and fall back to utility tactical AI below
  }

  // Ensure every acting enemy has a valid tactical decision
  for (const enemyId of enemyIds) {
    if (!out[enemyId]) {
      const enemy = state.enemies.find((e) => e.id === enemyId && e.hp > 0);
      if (enemy) {
        out[enemyId] = chooseTacticalEnemyDecision(state, enemy, rng);
      }
    }
  }

  return out;
}
