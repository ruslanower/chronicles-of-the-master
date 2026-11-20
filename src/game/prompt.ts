import { campaignFor } from "./i18n";
import { ACT_PROGRESS_GOAL, currentActor, enemyAC, heroAC, type GameState } from "./engine";

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
  const activeHero = actor?.type === "hero" ? actor.hero : state.party[0];
  const heroName = activeHero?.name ?? "";
  const heroItems =
    activeHero?.inventory
      .filter(
        (it) => it.equipped || activeHero.used.filter((id) => id === it.id).length < (it.qty ?? 1),
      )
      .map((it) => `«${it.name}» (${it.bonus ?? ""})`)
      .join(", ") || "-";
  const lang = en
    ? "Reply ONLY in fluent, atmospheric English."
    : "Відповідай ВИКЛЮЧНО багатою, живою літературною українською мовою (без суржику, русизмів і кальок).";
  const instructions = `${c.worldRulesForAI}

You are a LIVE GAME MASTER and DIRECTOR (D&D style). ${lang}
Style: atmospheric, cinematic, 2–4 short sentences with concrete sensory details. Address heroes by their exact names. No markdown.
CRITICAL ACCURACY & REAL GAME MASTER RULES:
1. NEVER contradict resolved dice results: if the summary says ПРОМАХ / MISS, describe a miss or blocked blow; if ВЛУЧАННЯ / HIT or ПЕРЕМОЖЕНИЙ / DEFEATED, describe that exact impact.
2. For kind "mechanic" and "enemies", dice and HP were ALREADY applied by the game engine — return hpChanges: [], check: null, progress: false.
3. For kind "free", ACT AS A REAL, INTELLIGENT D&D GAME MASTER — DO NOT rubber-stamp nonsense!
   - Evaluate whether the player's action actually makes sense in this scene and moves toward the ACT GOAL.
   - If the player writes gibberish, random letters (like "В", "asd"), impossible god-mode ("kill everyone with my mind"), or absurd/toilet/troll nonsense that does NOT help the goal:
     * Set progress: false and check: null (DO NOT roll a check or advance the story!).
     * React in-character as a sharp, witty or strict Game Master: explain why that fails or looks foolish in front of enemies/NPCs, and optionally apply a small consequence (e.g. -1 or -2 HP embarrassment/counter-opportunity in combat).
   - If the player's action IS meaningful, tactical, or creative roleplay relevant to the scene:
     * Set progress: true.
     * Set check: { stat, dc } (dc 8–18 based on real difficulty; lower DC if using a relevant signature item, higher DC for risky stunts).
     * Only set actComplete: true when SCENE PROGRESS reaches ${ACT_PROGRESS_GOAL}/${ACT_PROGRESS_GOAL} or the final act goal is truly fulfilled.
4. Background characters (e.g. secret tavern guests) are atmosphere only — never make them the focus.
Output fields:
- narration: the story text (2–4 sentences in ${en ? "English" : "Ukrainian"}) directly reacting to EXACTLY what the player wrote.
- check: only for meaningful kind "free" when risky (otherwise null): stat (str/agi/int/cha) and dc (8–18).
- progress: boolean (true ONLY if a "free" action is meaningful and advances the act goal; false for nonsense, gibberish, or irrelevant actions).
- hpChanges: HP changes for "free" or "chat" (negative = damage, positive = healing, target = exact hero or enemy name). Empty [] for "mechanic" and "enemies".
- actComplete: true ONLY when the party completed all steps of the act goal.${act && state.actIndex === c.acts.length - 1 ? " This is the FINALE — deliver an epic ending when complete." : ""}
- suggestions: 3 short (max 8 words, in ${en ? "English" : "Ukrainian"}) concrete tactical/roleplay ideas for the current act.`;

  const party = state.party
    .map(
      (h) =>
        `${h.name} HP ${h.hp}/${h.maxHp} AC ${heroAC(h)}; STR ${h.stats.str} AGI ${h.stats.agi} INT ${h.stats.int} CHA ${h.stats.cha}${h.status.hidden ? "; hidden" : ""}${h.status.shield ? "; shielded" : ""}${h.status.stunned ? "; stunned" : ""}`,
    )
    .join("\n");
  const enemies =
    state.enemies
      .filter((e) => e.hp > 0)
      .map(
        (e) =>
          `${e.name} HP ${e.hp}/${e.maxHp} AC ${enemyAC(e)}${e.status.shield ? " [shielded]" : ""}${e.status.stunned ? " [stunned]" : ""}`,
      )
      .join(", ") || "-";
  const history = state.log
    .slice(-14)
    .map((e) => `${e.who}: ${e.text}`)
    .join("\n");
  let turn = "";
  if (req.kind === "mechanic")
    turn = `HERO ACTION (dice already resolved — narrate exactly this outcome):\n${req.summary}`;
  else if (req.kind === "free")
    turn = `${heroName} TRIES: «${req.text}»\nPre-rolled D20 (use only if you set a check): ${req.d20}. If the action succeeds against an enemy you may damage it via hpChanges (up to -8).`;
  else if (req.kind === "enemies")
    turn = `ENEMY AI TURN (dice already resolved — narrate these tactical enemy moves dramatically in 1–3 sentences):\n${req.summary.join("\n")}`;
  else
    turn = `OUT-OF-TURN MESSAGE from player ${req.from} to the Master: «${req.text}»\nAnswer as the director in 1–3 sentences. You may give a hint, or a small consequence (hpChanges ±1..3) if they deserve it. check = null, actComplete = false.`;

  const progressLine = `\nSCENE PROGRESS: ${state.actProgress ?? 0}/${ACT_PROGRESS_GOAL}`;

  const prompt = `SCENE: ${act?.title} — ${act?.locationName}
ACT GOAL: ${act?.objective}${progressLine}
ENEMIES: ${enemies}
PARTY:
${party}
ACTIVE HERO (${heroName}) ITEMS: ${heroItems}
RECENT EVENTS:
${history || "(start of act)"}

${turn}`;
  return { instructions, prompt };
}
