import { campaignFor } from "./i18n";
import { currentActor, type GameState } from "./engine";

export type NarrateRequest =
  | { kind: "mechanic"; summary: string }
  | { kind: "free"; text: string; d20: number }
  | { kind: "enemies"; summary: string[] }
  | { kind: "chat"; from: string; text: string };

/** Builds the Master's instructions + prompt from the game state (server-side only use). */
export function buildMasterPrompt(state: GameState, req: NarrateRequest) {
  const c = campaignFor(state.lang);
  const act = c.acts[state.actIndex];
  const en = state.lang === "en";
  const actor = currentActor(state);
  const heroName = actor?.type === "hero" ? actor.hero.name : "";
  const lang = en ? "Reply ONLY in English." : "Відповідай ВИКЛЮЧНО українською.";
  const instructions = `${c.worldRulesForAI}

You are a LIVE GAME MASTER and DIRECTOR (D&D style). ${lang}
Style: atmospheric, cinematic, 2–4 short sentences with concrete sensory details. Address heroes by name. No markdown.
You actively shape events: you may help clever or kind ideas, and punish rude, reckless or foolish behaviour with consequences. Occasionally add a twist (a trap, an ally, an alarm).
Background characters (e.g. secret tavern guests) are just atmosphere — never make them the focus.
Output fields:
- narration: the story text.
- check: only for kind "free" when the action is risky (otherwise null): stat (str/agi/int/cha) and dc (8 easy … 18 very hard). Talking, looking around or simple actions need NO check.
- hpChanges: HP changes (negative = damage, positive = healing). target = exact hero or enemy name. Keep it small (1–6). For "mechanic" and "enemies" the dice were already resolved — return [] unless adding a tiny twist.
- actComplete: true only when the party truly achieved the act goal (by force, cunning, escape or diplomacy).${act && state.actIndex === c.acts.length - 1 ? " This is the FINALE — an epic ending when complete." : ""}
- suggestions: 3 short (max 8 words) ideas for the next actions.`;

  const party = state.party.map((h) => `${h.name} HP ${h.hp}/${h.maxHp}; STR ${h.stats.str} AGI ${h.stats.agi} INT ${h.stats.int} CHA ${h.stats.cha}${h.status.hidden ? "; hidden" : ""}`).join("\n");
  const enemies = state.enemies.filter((e) => e.hp > 0).map((e) => `${e.name} HP ${e.hp}/${e.maxHp}`).join(", ") || "-";
  const history = state.log.slice(-14).map((e) => `${e.who}: ${e.text}`).join("\n");
  let turn = "";
  if (req.kind === "mechanic") turn = `HERO ACTION (dice already resolved — narrate exactly this outcome):\n${req.summary}`;
  else if (req.kind === "free") turn = `${heroName} TRIES: «${req.text}»\nPre-rolled D20 (use only if you set a check): ${req.d20}. If the action succeeds against an enemy you may damage it via hpChanges (up to -8).`;
  else if (req.kind === "enemies") turn = `ENEMY TURN (dice already resolved — narrate these attacks dramatically in 1–3 sentences):\n${req.summary.join("\n")}`;
  else turn = `OUT-OF-TURN MESSAGE from player ${req.from} to the Master: «${req.text}»\nAnswer as the director in 1–3 sentences. You may give a hint, or a small consequence (hpChanges ±1..3) if they deserve it. check = null, actComplete = false.`;

  const prompt = `SCENE: ${act?.title} — ${act?.locationName}
ACT GOAL: ${act?.objective}
ENEMIES: ${enemies}
PARTY:
${party}
RECENT EVENTS:
${history || "(start of act)"}

${turn}`;
  return { instructions, prompt };
}
