import type { HeroDef } from "./data";

export type HeroState = HeroDef & { hp: number };
export type LogEntry = { id: number; who: string; kind: "master" | "say" | "action" | "roll" | "system"; text: string };

export type GameState = {
  party: HeroState[];
  actIndex: number;
  turn: number; // index into party
  log: LogEntry[];
  suggestions: string[];
  progress: number; // successful beats this act
  status: "playing" | "victory" | "defeat";
};

export const rollD20 = () => 1 + Math.floor(Math.random() * 20);

export const clampHp = (hp: number, max: number) => Math.max(0, Math.min(max, Math.round(hp)));

/** Next alive hero after `from`; returns -1 if none alive */
export function nextTurn(party: { hp: number }[], from: number): number {
  for (let k = 1; k <= party.length; k++) {
    const i = (from + k) % party.length;
    if ((party[i]?.hp ?? 0) > 0) return i;
  }
  return -1;
}

export function applyHp(party: HeroState[], changes: { target: string; delta: number }[]): HeroState[] {
  return party.map((h) => {
    const total = changes.filter((c) => c.target.trim() === h.name).reduce((s, c) => s + c.delta, 0);
    return total ? { ...h, hp: clampHp(h.hp + total, h.maxHp) } : h;
  });
}

export const rollTone = (d20: number) => (d20 === 20 ? "crit" : d20 === 1 ? "fumble" : "normal");
