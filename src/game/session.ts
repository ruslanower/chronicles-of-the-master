import { z } from "zod";
import { campaign, type Stats } from "./data";
import { applyHp, nextTurn, type GameState } from "./rules";

export type TurnReply = {
  narration: string;
  check: { stat: keyof Stats; dc: number; success: boolean } | null;
  hpChanges: { target: string; delta: number }[];
  actComplete: boolean;
  suggestions: string[];
};
export const SAVE_KEY = "chronicles-black-star-v1";
export const opening = "Дубові двері здригаються від удару. За ними брязкають кайдани Залізної Варти. «Жодному чаклуну не втекти!» — гарчить капітан. Ліхтар гасне, а біля чорного ходу ще лишається вузька смуга світла. Ваш загін має лише мить.";

export function newGame(ids: string[]): GameState {
  const party = ids.slice(0, 4).flatMap((id) => {
    const hero = campaign.heroes.find((h) => h.id === id);
    return hero ? [structuredClone(hero)] : [];
  });
  return { party, actIndex: 0, turn: 0, log: [{ id: 1, who: "Майстер", kind: "master", text: opening }], suggestions: campaign.acts[0]?.sandboxHints.slice(0, 3) ?? [], progress: 0, status: "playing" };
}

export function resolveTurn(state: GameState, mode: "say" | "action", text: string, d20: number | null, reply: TurnReply): GameState {
  const hero = state.party[state.turn];
  if (!hero) return state;
  const party = applyHp(state.party, reply.hpChanges.filter((c) => Number.isFinite(c.delta)).map((c) => ({ ...c, delta: Math.max(-6, Math.min(12, c.delta)) })));
  const next = nextTurn(party, state.turn);
  const success = d20 !== null && reply.check ? d20 === 20 || (d20 !== 1 && d20 + hero.stats[reply.check.stat] >= reply.check.dc) : false;
  const id = (state.log.at(-1)?.id ?? 0) + 1;
  const entries: GameState["log"] = [{ id, who: hero.name, kind: mode, text }];
  if (d20 !== null) entries.push({ id: id + 1, who: "D20", kind: "roll", text: reply.check ? `${d20} + ${hero.stats[reply.check.stat]} = ${d20 + hero.stats[reply.check.stat]} • Складність ${reply.check.dc} • ${success ? "Успіх" : "Невдача"}${d20 === 20 ? " • Критичний успіх!" : d20 === 1 ? " • Критичний провал!" : ""}` : `Кидок: ${d20}` });
  entries.push({ id: id + 2, who: "Майстер", kind: "master", text: reply.narration });
  return { ...state, party, turn: next < 0 ? state.turn : next, log: [...state.log, ...entries].slice(-150), suggestions: reply.suggestions.slice(0, 3), progress: state.progress + (success ? 1 : 0), status: next < 0 ? "defeat" : reply.actComplete && state.actIndex === campaign.acts.length - 1 ? "victory" : "playing" };
}

export function advanceAct(state: GameState): GameState {
  const act = campaign.acts[state.actIndex + 1];
  if (!act || state.status !== "playing") return state;
  return { ...state, actIndex: state.actIndex + 1, progress: 0, suggestions: act.sandboxHints.slice(0, 3), log: [...state.log, { id: (state.log.at(-1)?.id ?? 0) + 1, who: "Майстер", kind: "system", text: act.title }] };
}

const snapshot = z.object({
  version: z.literal(1),
  state: z.object({
    party: z.array(z.object({ id: z.string(), hp: z.number().finite().nonnegative() })).min(1).max(4),
    actIndex: z.number().int().min(0).max(campaign.acts.length - 1),
    turn: z.number().int().min(0).max(3),
    log: z.array(z.object({ id: z.number(), who: z.string(), kind: z.enum(["master", "say", "action", "roll", "system"]), text: z.string() })).max(150),
    suggestions: z.array(z.string()).max(3), progress: z.number().nonnegative(),
    status: z.enum(["playing", "victory", "defeat"]),
  }),
  actReady: z.boolean(),
});
export function restoreGame(raw: string): { state: GameState; actReady: boolean } | null {
  try {
    const saved = snapshot.parse(JSON.parse(raw));
    const party = saved.state.party.flatMap((row) => {
      const hero = campaign.heroes.find((h) => h.id === row.id);
      return hero ? [{ ...structuredClone(hero), hp: Math.min(row.hp, hero.maxHp) }] : [];
    });
    if (party.length !== saved.state.party.length || saved.state.turn >= party.length || new Set(party.map((h) => h.id)).size !== party.length) return null;
    return { state: { ...saved.state, party }, actReady: saved.actReady };
  } catch { return null; }
}

/** After defeat: heal the party to full and replay the current act from its start. */
export function retryAct(state: GameState): GameState {
  if (state.status !== "defeat") return state;
  const act = campaign.acts[state.actIndex];
  const party = state.party.map((h) => ({ ...h, hp: h.maxHp }));
  return { ...state, party, turn: 0, progress: 0, status: "playing", suggestions: act?.sandboxHints.slice(0, 3) ?? [], log: [...state.log, { id: (state.log.at(-1)?.id ?? 0) + 1, who: "Майстер", kind: "system" as const, text: `Ліхтар спалахує знову. ${act?.title ?? ""}` }].slice(-150) };
}
