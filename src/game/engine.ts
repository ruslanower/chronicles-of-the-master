import { campaignFor, heroName } from "./i18n";
import type { Lang } from "./prologue";
import type { HeroDef, Stats } from "./data";
import { ABILITIES, ENCOUNTERS, itemHeal } from "./content";

export type Rng = () => number;
export type Status = { hidden: number; stunned: number; shield: number };
export type HeroState = HeroDef & { hp: number; status: Status; cooldowns: Record<string, number>; used: string[]; ownerId?: string; ownerName?: string };
export type EnemyState = { id: string; key: string; name: string; hp: number; maxHp: number; ac: number; attack: string; bonus: number; sprite: string; status: Status };
export type LogKind = "master" | "action" | "roll" | "system" | "enemy";
export type LogEntry = { id: number; who: string; kind: LogKind; text: string };

export type GameState = {
  version: 2;
  lang: Lang;
  party: HeroState[];
  enemies: EnemyState[];
  actIndex: number;
  order: string[];
  pos: number;
  round: number;
  log: LogEntry[];
  suggestions: string[];
  status: "playing" | "victory" | "defeat";
  actReady: boolean;
  turnStartedAt: number;
};

export type MasterReply = {
  narration: string;
  check: { stat: keyof Stats; dc: number } | null;
  hpChanges: { target: string; delta: number }[];
  actComplete: boolean;
  suggestions: string[];
};

export const MAX_LOG = 150;
export const TURN_SECONDS = 60;
const noStatus = (): Status => ({ hidden: 0, stunned: 0, shield: 0 });

export function rollDice(spec: string, rng: Rng = Math.random) {
  const m = spec.match(/^(\d+)d(\d+)$/);
  const n = m ? Number(m[1]) : 1;
  const sides = m ? Number(m[2]) : 6;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(rng() * sides));
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}
export const d20 = (rng: Rng = Math.random) => rollDice("1d20", rng).total;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function pushLog(state: GameState, who: string, kind: LogKind, text: string): GameState {
  const id = (state.log.at(-1)?.id ?? 0) + 1;
  return { ...state, log: [...state.log, { id, who, kind, text }].slice(-MAX_LOG) };
}
const L = (state: GameState, uk: string, en: string) => (state.lang === "en" ? en : uk);
export const heroAC = (h: HeroState) => 10 + h.stats.agi + (h.status.shield > 0 ? 3 : 0);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function newGame(ids: string[], lang: Lang, owners: Record<string, { id: string; name: string }> = {}, rng: Rng = Math.random, now = Date.now()): GameState {
  const heroes = campaignFor(lang).heroes;
  const party = ids.slice(0, 4).flatMap((id) => {
    const h = heroes.find((x) => x.id === id);
    if (!h) return [];
    const o = owners[id];
    return [{ ...structuredClone(h), status: noStatus(), cooldowns: {}, used: [], ...(o ? { ownerId: o.id, ownerName: o.name } : {}) }];
  });
  const base: GameState = { version: 2, lang, party, enemies: [], actIndex: 0, order: [], pos: 0, round: 1, log: [], suggestions: [], status: "playing", actReady: false, turnStartedAt: now };
  return startAct(base, 0, rng, now);
}

/** Set up an act: spawn enemies, roll initiative for everyone, build the turn order. */
export function startAct(state: GameState, actIndex: number, rng: Rng = Math.random, now = Date.now()): GameState {
  const act = campaignFor(state.lang).acts[actIndex];
  if (!act) return state;
  const enc = ENCOUNTERS[act.actNumber] ?? { enemies: [], npcs: [] };
  const enemies: EnemyState[] = enc.enemies.map((e, i) => ({ id: `e${i + 1}`, key: e.key, name: e.name[state.lang], hp: e.hp, maxHp: e.hp, ac: e.ac, attack: e.attack, bonus: e.bonus, sprite: e.sprite, status: noStatus() }));
  const party = state.party.map((h) => ({ ...h, status: noStatus(), cooldowns: {} }));
  let s: GameState = { ...state, actIndex, party, enemies, round: 1, pos: 0, actReady: false, suggestions: act.sandboxHints.slice(0, 3), turnStartedAt: now };
  s = pushLog(s, L(s, "Майстер", "Master"), "system", act.title);
  if (enemies.length) {
    const rolls = [
      ...party.filter((h) => h.hp > 0).map((h) => ({ id: h.id, name: h.name, v: d20(rng) + h.stats.agi })),
      ...enemies.map((e) => ({ id: e.id, name: e.name, v: d20(rng) + 1 })),
    ].sort((a, b) => b.v - a.v);
    s = { ...s, order: rolls.map((r) => r.id) };
    s = pushLog(s, "D20", "roll", `${L(s, "Черговість", "Initiative")}: ${rolls.map((r) => `${r.name} ${r.v}`).join(" • ")}`);
  } else {
    s = { ...s, order: party.filter((h) => h.hp > 0).map((h) => h.id) };
  }
  return s;
}

export type Actor = { type: "hero"; hero: HeroState } | { type: "enemy"; enemy: EnemyState };
export function currentActor(state: GameState): Actor | null {
  const id = state.order[state.pos];
  const hero = state.party.find((h) => h.id === id);
  if (hero) return { type: "hero", hero };
  const enemy = state.enemies.find((e) => e.id === id);
  return enemy ? { type: "enemy", enemy } : null;
}
const alive = (state: GameState, id: string) => (state.party.find((h) => h.id === id)?.hp ?? state.enemies.find((e) => e.id === id)?.hp ?? 0) > 0;

/** Move to the next combatant that can act; handles new rounds and stun skips. */
export function advance(state: GameState, now = Date.now()): GameState {
  let s = checkOutcome(state);
  if (s.status !== "playing" || s.actReady || !s.order.length) return s;
  for (let guard = 0; guard < s.order.length * 3; guard++) {
    let pos = s.pos + 1;
    if (pos >= s.order.length) {
      pos = 0;
      const tick = (st: Status): Status => ({ ...st, hidden: Math.max(0, st.hidden - 1), shield: Math.max(0, st.shield - 1) });
      s = {
        ...s,
        round: s.round + 1,
        party: s.party.map((h) => ({ ...h, status: tick(h.status), cooldowns: Object.fromEntries(Object.entries(h.cooldowns).map(([k, v]) => [k, Math.max(0, v - 1)])) })),
        enemies: s.enemies.map((e) => ({ ...e, status: tick(e.status) })),
      };
    }
    s = { ...s, pos };
    const id = s.order[pos]!;
    if (!alive(s, id)) continue;
    const enemy = s.enemies.find((e) => e.id === id);
    const hero = s.party.find((h) => h.id === id);
    const st = enemy?.status ?? hero?.status;
    if (st && st.stunned > 0) {
      s = enemy
        ? { ...s, enemies: s.enemies.map((e) => (e.id === id ? { ...e, status: { ...e.status, stunned: e.status.stunned - 1 } } : e)) }
        : { ...s, party: s.party.map((h) => (h.id === id ? { ...h, status: { ...h.status, stunned: h.status.stunned - 1 } } : h)) };
      s = pushLog(s, enemy?.name ?? hero?.name ?? "", "system", L(s, "оглушений і пропускає хід", "is stunned and skips the turn"));
      continue;
    }
    return { ...s, turnStartedAt: now };
  }
  return s;
}

export function checkOutcome(state: GameState): GameState {
  if (state.status !== "playing") return state;
  if (state.party.every((h) => h.hp <= 0)) return { ...state, status: "defeat" };
  if (state.enemies.length && state.enemies.every((e) => e.hp <= 0) && !state.actReady) {
    const last = state.actIndex === campaignFor(state.lang).acts.length - 1;
    return last ? { ...state, status: "victory" } : { ...state, actReady: true };
  }
  return state;
}

const setEnemy = (s: GameState, id: string, f: (e: EnemyState) => EnemyState): GameState => ({ ...s, enemies: s.enemies.map((e) => (e.id === id ? f(e) : e)) });
const setHero = (s: GameState, id: string, f: (h: HeroState) => HeroState): GameState => ({ ...s, party: s.party.map((h) => (h.id === id ? f(h) : h)) });

export type Outcome = { state: GameState; summary: string };

/** Resolve a hero ability mechanically. Throws on an invalid choice. */
export function useAbility(state: GameState, heroId: string, abilityId: string, targetId: string | undefined, rng: Rng = Math.random): Outcome {
  const hero = state.party.find((h) => h.id === heroId);
  const ab = ABILITIES[heroId]?.find((a) => a.id === abilityId);
  if (!hero || !ab) throw new Error("bad ability");
  if ((hero.cooldowns[ab.id] ?? 0) > 0) throw new Error("cooldown");
  const bonus = hero.stats[ab.stat];
  const abName = ab.name[state.lang];
  let s = setHero(state, heroId, (h) => ({ ...h, cooldowns: { ...h.cooldowns, [ab.id]: ab.cooldown } }));
  const enemy = s.enemies.find((e) => e.id === targetId && e.hp > 0);
  const ally = s.party.find((h) => h.id === (targetId ?? heroId) && h.hp > 0);
  let summary = "";
  if (ab.kind === "attack") {
    if (!enemy) throw new Error("no target");
    const r = d20(rng);
    const hit = r === 20 || (r !== 1 && r + bonus >= enemy.ac);
    if (hit) {
      const dmg = rollDice(ab.dice ?? "1d6", rng).total * (r === 20 ? 2 : 1) + bonus;
      s = setEnemy(s, enemy.id, (e) => ({ ...e, hp: Math.max(0, e.hp - dmg) }));
      const left = s.enemies.find((e) => e.id === enemy.id)!.hp;
      summary = L(s, `${hero.name}: «${abName}» по ${enemy.name}. D20 ${r}${signed(bonus)} проти захисту ${enemy.ac} — ВЛУЧАННЯ${r === 20 ? " (КРИТ!)" : ""}, шкода ${dmg}. ${left <= 0 ? `${enemy.name} ПЕРЕМОЖЕНИЙ.` : `HP ворога ${left}/${enemy.maxHp}.`}`, `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs defence ${enemy.ac} — HIT${r === 20 ? " (CRIT!)" : ""}, ${dmg} damage. ${left <= 0 ? `${enemy.name} is DEFEATED.` : `Enemy HP ${left}/${enemy.maxHp}.`}`);
    } else {
      summary = L(s, `${hero.name}: «${abName}» по ${enemy.name}. D20 ${r}${signed(bonus)} проти захисту ${enemy.ac} — ПРОМАХ${r === 1 ? " (критичний провал)" : ""}.`, `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs defence ${enemy.ac} — MISS${r === 1 ? " (critical fail)" : ""}.`);
    }
  } else if (ab.kind === "aoe") {
    const targets = s.enemies.filter((e) => e.hp > 0);
    if (!targets.length) throw new Error("no target");
    const dmg = rollDice(ab.dice ?? "1d6", rng).total + bonus;
    s = { ...s, enemies: s.enemies.map((e) => (e.hp > 0 ? { ...e, hp: Math.max(0, e.hp - dmg) } : e)) };
    summary = L(s, `${hero.name}: «${abName}» — шкода ${dmg} кожному ворогу (${targets.map((e) => e.name).join(", ")}).`, `${hero.name}: "${abName}" — ${dmg} damage to every enemy (${targets.map((e) => e.name).join(", ")}).`);
  } else if (ab.kind === "stun") {
    if (!enemy) throw new Error("no target");
    const r = d20(rng);
    const ok = r === 20 || (r !== 1 && r + bonus >= 12);
    if (ok) s = setEnemy(s, enemy.id, (e) => ({ ...e, status: { ...e.status, stunned: 1 } }));
    summary = L(s, `${hero.name}: «${abName}» на ${enemy.name}. D20 ${r}${signed(bonus)} проти 12 — ${ok ? "УСПІХ, ворог пропустить хід" : "НЕВДАЧА"}.`, `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs 12 — ${ok ? "SUCCESS, the enemy will skip a turn" : "FAIL"}.`);
  } else if (ab.kind === "heal") {
    if (!ally) throw new Error("no target");
    const amt = rollDice(ab.dice ?? "1d6", rng).total + bonus;
    s = setHero(s, ally.id, (h) => ({ ...h, hp: Math.min(h.maxHp, h.hp + amt) }));
    summary = L(s, `${hero.name}: «${abName}» лікує ${ally.name} на ${amt} HP.`, `${hero.name}: "${abName}" heals ${ally.name} for ${amt} HP.`);
  } else if (ab.kind === "hide") {
    if (!ally) throw new Error("no target");
    s = setHero(s, ally.id, (h) => ({ ...h, status: { ...h.status, hidden: 1 } }));
    summary = L(s, `${hero.name}: «${abName}» — ${ally.name} стає невидимим для ворогів до кінця раунду.`, `${hero.name}: "${abName}" — ${ally.name} becomes invisible to enemies until the round ends.`);
  } else {
    s = { ...s, party: s.party.map((h) => ({ ...h, status: { ...h.status, shield: 1 } })) };
    summary = L(s, `${hero.name}: «${abName}» — загін отримує +3 до захисту на раунд.`, `${hero.name}: "${abName}" — the party gains +3 defence for the round.`);
  }
  s = pushLog(s, hero.name, "action", abName);
  s = pushLog(s, "D20", "roll", summary);
  return { state: s, summary };
}

export function useItem(state: GameState, heroId: string, itemId: string, targetId?: string): Outcome {
  const hero = state.party.find((h) => h.id === heroId);
  const item = hero?.inventory.find((i) => i.id === itemId);
  if (!hero || !item || hero.used.includes(itemId)) throw new Error("bad item");
  const heal = itemHeal(item.bonus);
  if (heal == null) throw new Error("not usable");
  const ally = state.party.find((h) => h.id === (targetId ?? heroId) && h.hp > 0) ?? hero;
  let s = setHero(state, heroId, (h) => ({ ...h, used: [...h.used, itemId] }));
  s = setHero(s, ally.id, (h) => ({ ...h, hp: Math.min(h.maxHp, h.hp + heal) }));
  const summary = L(s, `${hero.name} використовує «${item.name}»: ${ally.name} +${heal} HP.`, `${hero.name} uses "${item.name}": ${ally.name} +${heal} HP.`);
  s = pushLog(s, hero.name, "action", item.name);
  s = pushLog(s, "D20", "roll", summary);
  return { state: s, summary };
}

/** Find a combatant by name (either language) or id. */
function findTarget(state: GameState, target: string) {
  const t = target.trim().toLowerCase();
  const hero = state.party.find((h) => h.id === target || h.name.toLowerCase() === t || heroName(h.id, "uk").toLowerCase() === t || heroName(h.id, "en").toLowerCase() === t);
  if (hero) return { hero };
  const enemy = state.enemies.find((e) => e.id === target || e.name.toLowerCase() === t);
  return enemy ? { enemy } : null;
}

/** Apply HP changes proposed by the Master, within safe limits. */
export function applyMasterHp(state: GameState, changes: MasterReply["hpChanges"], limits: { heroMin: number; heroMax: number; enemyMin: number }): GameState {
  let s = state;
  for (const c of changes.slice(0, 6)) {
    if (!Number.isFinite(c.delta)) continue;
    const f = findTarget(s, c.target);
    if (f?.hero) s = setHero(s, f.hero.id, (h) => ({ ...h, hp: clamp(h.hp + clamp(c.delta, limits.heroMin, limits.heroMax), 0, h.maxHp) }));
    else if (f?.enemy) s = setEnemy(s, f.enemy.id, (e) => ({ ...e, hp: clamp(e.hp + clamp(c.delta, limits.enemyMin, 0), 0, e.maxHp) }));
  }
  return s;
}

/** Enemy picks a visible hero and attacks. */
export function enemyAttack(state: GameState, enemyId: string, rng: Rng = Math.random): Outcome {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy) return { state, summary: "" };
  const targets = state.party.filter((h) => h.hp > 0 && h.status.hidden <= 0);
  if (!targets.length) {
    const summary = L(state, `${enemy.name} шукає героїв, але нікого не бачить.`, `${enemy.name} searches for the heroes but sees no one.`);
    return { state: pushLog(state, enemy.name, "enemy", summary), summary };
  }
  const target = targets[Math.floor(rng() * targets.length)]!;
  const r = d20(rng);
  const ac = heroAC(target);
  const hit = r === 20 || (r !== 1 && r + enemy.bonus >= ac);
  let s = state;
  let summary: string;
  if (hit) {
    const dmg = rollDice(enemy.attack, rng).total * (r === 20 ? 2 : 1) + 1;
    s = setHero(s, target.id, (h) => ({ ...h, hp: Math.max(0, h.hp - dmg) }));
    const left = s.party.find((h) => h.id === target.id)!.hp;
    summary = L(s, `${enemy.name} атакує ${target.name}: D20 ${r}+${enemy.bonus} проти захисту ${ac} — влучання, шкода ${dmg}${left <= 0 ? `. ${target.name} падає без свідомості!` : ` (HP ${left}/${target.maxHp})`}.`, `${enemy.name} attacks ${target.name}: D20 ${r}+${enemy.bonus} vs defence ${ac} — hit, ${dmg} damage${left <= 0 ? `. ${target.name} falls unconscious!` : ` (HP ${left}/${target.maxHp})`}.`);
  } else {
    summary = L(s, `${enemy.name} атакує ${target.name}: D20 ${r}+${enemy.bonus} проти захисту ${ac} — промах.`, `${enemy.name} attacks ${target.name}: D20 ${r}+${enemy.bonus} vs defence ${ac} — miss.`);
  }
  return { state: pushLog(s, enemy.name, "enemy", summary), summary };
}

/** Run every consecutive enemy turn until it's a hero's turn again. */
export function runEnemies(state: GameState, rng: Rng = Math.random, now = Date.now()): { state: GameState; summaries: string[] } {
  let s = state;
  const summaries: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    if (s.status !== "playing" || s.actReady) break;
    const a = currentActor(s);
    if (!a || a.type !== "enemy") break;
    if (a.enemy.hp > 0) {
      const o = enemyAttack(s, a.enemy.id, rng);
      s = o.state;
      summaries.push(o.summary);
    }
    s = advance(s, now);
  }
  return { state: checkOutcome(s), summaries };
}

export function appendMaster(state: GameState, text: string): GameState {
  return pushLog(state, L(state, "Майстер", "Master"), "master", text);
}
export function appendLog(state: GameState, who: string, kind: LogKind, text: string): GameState {
  return pushLog(state, who, kind, text);
}

export function advanceAct(state: GameState, rng: Rng = Math.random, now = Date.now()): GameState {
  if (!state.actReady || state.status !== "playing") return state;
  return startAct({ ...state, actReady: false }, state.actIndex + 1, rng, now);
}

/** After defeat: heal everyone and replay the current act from its start. */
export function retryAct(state: GameState, rng: Rng = Math.random, now = Date.now()): GameState {
  if (state.status !== "defeat") return state;
  return startAct({ ...state, status: "playing", party: state.party.map((h) => ({ ...h, hp: h.maxHp })) }, state.actIndex, rng, now);
}
