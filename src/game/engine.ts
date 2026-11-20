import { campaignFor, heroName } from "./i18n";
import type { Lang } from "./prologue";
import type { HeroDef, Stats } from "./data";
import { ABILITIES, ENCOUNTERS, itemHeal } from "./content";
import { chooseTacticalEnemyDecision, getEnemyTactics, type EnemyDecision } from "./enemyAi";
import { getInterludeForAct } from "./interludes";

export type Rng = () => number;
export type Status = {
  hidden: number;
  stunned: number;
  shield: number;
  hiddenBy?: string;
  shieldBy?: string;
};
export type HeroState = HeroDef & {
  hp: number;
  status: Status;
  cooldowns: Record<string, number>;
  used: string[];
  ownerId?: string;
  ownerName?: string;
};
export type EnemyState = {
  id: string;
  key: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  attack: string;
  bonus: number;
  sprite: string;
  status: Status;
  cooldowns?: Record<string, number>;
  lastAiReason?: string;
  lastAiBark?: string;
};
export type LogKind = "master" | "action" | "roll" | "system" | "enemy";
export type LogEntry = { id: number; who: string; kind: LogKind; text: string };

export type CombatEvent = {
  id: string;
  targetId: string;
  attackerId?: string;
  text: string;
  kind: "dmg" | "crit" | "miss" | "heal" | "status";
};

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
  actProgress?: number;
  lastEvents?: CombatEvent[];
  lastRoll?: { value: number; bonus: number; total: number; label: string } | null;
};

export type MasterReply = {
  narration: string;
  check: { stat: keyof Stats; dc: number } | null;
  hpChanges: { target: string; delta: number }[];
  actComplete: boolean;
  progress?: boolean;
  suggestions: string[];
};

export const MAX_LOG = 150;
export const TURN_SECONDS = 60;
export const ACT_PROGRESS_GOAL = 3;
const noStatus = (): Status => ({ hidden: 0, stunned: 0, shield: 0 });

export function rollDice(spec: string, rng: Rng = Math.random) {
  const m = spec.match(/^(\d+)d(\d+)$/);
  const n = m ? Number(m[1]) : 1;
  const sides = m ? Number(m[2]) : 6;
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(rng() * sides));
  return { total: rolls.reduce((a, b) => a + b, 0), rolls };
}
export const d20 = (rng: Rng = Math.random) => rollDice("1d20", rng).total;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Math.round(v)));

function pushLog(state: GameState, who: string, kind: LogKind, text: string): GameState {
  const id = (state.log.at(-1)?.id ?? 0) + 1;
  return { ...state, log: [...state.log, { id, who, kind, text }].slice(-MAX_LOG) };
}
const L = (state: GameState, uk: string, en: string) => (state.lang === "en" ? en : uk);
export const heroAC = (h: HeroState) => 10 + h.stats.agi + (h.status.shield > 0 ? 3 : 0);
export const enemyAC = (e: EnemyState) => e.ac + (e.status.shield > 0 ? 3 : 0);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function newGame(
  ids: string[],
  lang: Lang,
  owners: Record<string, { id: string; name: string }> = {},
  rng: Rng = Math.random,
  now = Date.now(),
): GameState {
  const heroes = campaignFor(lang).heroes;
  const party = ids.slice(0, 4).flatMap((id) => {
    const h = heroes.find((x) => x.id === id);
    if (!h) return [];
    const o = owners[id];
    return [
      {
        ...structuredClone(h),
        status: noStatus(),
        cooldowns: {},
        used: [],
        ...(o ? { ownerId: o.id, ownerName: o.name } : {}),
      },
    ];
  });
  const base: GameState = {
    version: 2,
    lang,
    party,
    enemies: [],
    actIndex: 0,
    order: [],
    pos: 0,
    round: 1,
    log: [],
    suggestions: [],
    status: "playing",
    actReady: false,
    turnStartedAt: now,
    actProgress: 0,
    lastEvents: [],
    lastRoll: null,
  };
  return startAct(base, 0, rng, now);
}

/** Set up an act: spawn enemies, roll initiative for everyone, build the turn order. */
export function startAct(
  state: GameState,
  actIndex: number,
  rng: Rng = Math.random,
  now = Date.now(),
): GameState {
  const act = campaignFor(state.lang).acts[actIndex];
  if (!act) return state;
  const enc = ENCOUNTERS[act.actNumber] ?? { enemies: [], npcs: [] };
  const enemies: EnemyState[] = enc.enemies.map((e, i) => ({
    id: `e${i + 1}`,
    key: e.key,
    name: e.name[state.lang],
    hp: e.hp,
    maxHp: e.hp,
    ac: e.ac,
    attack: e.attack,
    bonus: e.bonus,
    sprite: e.sprite,
    status: noStatus(),
    cooldowns: {},
  }));
  const party = state.party.map((h) => ({ ...h, status: noStatus(), cooldowns: {} }));
  let s: GameState = {
    ...state,
    actIndex,
    party,
    enemies,
    round: 1,
    pos: 0,
    actReady: false,
    actProgress: 0,
    lastEvents: [],
    lastRoll: null,
    suggestions: act.sandboxHints.slice(0, 3),
    turnStartedAt: now,
  };
  s = pushLog(s, L(s, "Майстер", "Master"), "system", act.title);
  s = pushLog(s, L(s, "Майстер", "Master"), "master", `${act.locationName}. ${act.objective}`);
  if (enemies.length) {
    const rolls = [
      ...party
        .filter((h) => h.hp > 0)
        .map((h) => ({ id: h.id, name: h.name, v: d20(rng) + h.stats.agi })),
      ...enemies.map((e) => ({ id: e.id, name: e.name, v: d20(rng) + 1 })),
    ].sort((a, b) => b.v - a.v);
    s = { ...s, order: rolls.map((r) => r.id) };
    s = pushLog(
      s,
      "D20",
      "roll",
      `${L(s, "Черговість", "Initiative")}: ${rolls.map((r) => `${r.name} ${r.v}`).join(" • ")}`,
    );
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
const alive = (state: GameState, id: string) =>
  (state.party.find((h) => h.id === id)?.hp ?? state.enemies.find((e) => e.id === id)?.hp ?? 0) > 0;

function expireCasterBuffs(st: Status, actorId: string): Status {
  let next = st;
  if (st.hidden > 0 && (!st.hiddenBy || st.hiddenBy === actorId)) {
    const val = Math.max(0, st.hidden - 1);
    next = { ...next, hidden: val };
    if (val === 0) delete next.hiddenBy;
  }
  if (st.shield > 0 && (!st.shieldBy || st.shieldBy === actorId)) {
    const val = Math.max(0, st.shield - 1);
    next = { ...next, shield: val };
    if (val === 0) delete next.shieldBy;
  }
  return next;
}

function tickCooldowns(cds: Record<string, number> | undefined): Record<string, number> {
  if (!cds) return {};
  return Object.fromEntries(Object.entries(cds).map(([k, v]) => [k, Math.max(0, v - 1)]));
}

/** Move to the next combatant that can act; handles new rounds, buff expiration, and stun skips. */
export function advance(state: GameState, now = Date.now()): GameState {
  let s = checkOutcome(state);
  if (s.status !== "playing" || s.actReady || !s.order.length) return s;
  for (let guard = 0; guard < s.order.length * 3; guard++) {
    let pos = s.pos + 1;
    if (pos >= s.order.length) {
      pos = 0;
      s = {
        ...s,
        round: s.round + 1,
        party: s.party.map((h) => ({ ...h, cooldowns: tickCooldowns(h.cooldowns) })),
        enemies: s.enemies.map((e) => ({ ...e, cooldowns: tickCooldowns(e.cooldowns) })),
      };
    }
    s = { ...s, pos };
    const id = s.order[pos]!;
    // Expire any hidden/shield buffs anchored to this actor's turn cycle
    s = {
      ...s,
      party: s.party.map((h) => ({ ...h, status: expireCasterBuffs(h.status, id) })),
      enemies: s.enemies.map((e) => ({ ...e, status: expireCasterBuffs(e.status, id) })),
    };
    if (!alive(s, id)) continue;
    const enemy = s.enemies.find((e) => e.id === id);
    const hero = s.party.find((h) => h.id === id);
    const st = enemy?.status ?? hero?.status;
    if (st && st.stunned > 0) {
      s = enemy
        ? {
            ...s,
            enemies: s.enemies.map((e) =>
              e.id === id ? { ...e, status: { ...e.status, stunned: e.status.stunned - 1 } } : e,
            ),
          }
        : {
            ...s,
            party: s.party.map((h) =>
              h.id === id ? { ...h, status: { ...h.status, stunned: h.status.stunned - 1 } } : h,
            ),
          };
      s = pushLog(
        s,
        enemy?.name ?? hero?.name ?? "",
        "system",
        L(s, "оглушений і пропускає хід", "is stunned and skips the turn"),
      );
      continue;
    }
    return { ...s, turnStartedAt: now };
  }
  return s;
}

/** Peek which alive enemies will act consecutively from the current position before the next hero turn. */
export function upcomingEnemyIds(state: GameState): string[] {
  if (state.status !== "playing" || state.actReady || !state.order.length) return [];
  const ids: string[] = [];
  let simPos = state.pos;
  const enemyStuns = new Map(state.enemies.map((e) => [e.id, e.status.stunned]));
  const heroStuns = new Map(state.party.map((h) => [h.id, h.status.stunned]));

  for (let i = 0; i < state.order.length * 2; i++) {
    const id = state.order[simPos]!;
    const hero = state.party.find((h) => h.id === id);
    if (hero) {
      if (hero.hp > 0) {
        const st = heroStuns.get(id) ?? 0;
        if (st > 0) {
          heroStuns.set(id, st - 1);
        } else {
          break;
        }
      }
    } else {
      const enemy = state.enemies.find((e) => e.id === id);
      if (enemy && enemy.hp > 0) {
        const st = enemyStuns.get(id) ?? 0;
        if (st > 0) {
          enemyStuns.set(id, st - 1);
        } else if (!ids.includes(id)) {
          ids.push(id);
        }
      }
    }
    simPos = (simPos + 1) % state.order.length;
  }
  return ids;
}

export function checkOutcome(state: GameState): GameState {
  if (state.status !== "playing") return state;
  if (state.party.every((h) => h.hp <= 0)) return { ...state, status: "defeat" };
  if (state.enemies.length && state.enemies.every((e) => e.hp <= 0) && !state.actReady) {
    const last = state.actIndex === campaignFor(state.lang).acts.length - 1;
    return last ? { ...state, status: "victory" } : { ...state, actReady: true };
  }
  if ((state.actProgress ?? 0) >= ACT_PROGRESS_GOAL && !state.actReady) {
    const last = state.actIndex === campaignFor(state.lang).acts.length - 1;
    return last ? { ...state, status: "victory" } : { ...state, actReady: true };
  }
  return state;
}

const setEnemy = (s: GameState, id: string, f: (e: EnemyState) => EnemyState): GameState => ({
  ...s,
  enemies: s.enemies.map((e) => (e.id === id ? f(e) : e)),
});
const setHero = (s: GameState, id: string, f: (h: HeroState) => HeroState): GameState => ({
  ...s,
  party: s.party.map((h) => (h.id === id ? f(h) : h)),
});

export type OutcomeDetail = {
  actionKind: "attack" | "aoe" | "stun" | "heal" | "hide" | "shield" | "item";
  hit?: boolean;
  crit?: boolean;
  defeated?: boolean;
  amount?: number;
};

export type Outcome = { state: GameState; summary: string; detail?: OutcomeDetail };

/** Resolve a hero ability mechanically. Throws on an invalid choice. */
export function resolveAbility(
  state: GameState,
  heroId: string,
  abilityId: string,
  targetId: string | undefined,
  rng: Rng = Math.random,
): Outcome {
  const hero = state.party.find((h) => h.id === heroId);
  const ab = ABILITIES[heroId]?.find((a) => a.id === abilityId);
  if (!hero || !ab) throw new Error("bad ability");
  if ((hero.cooldowns[ab.id] ?? 0) > 0) throw new Error("cooldown");
  const bonus = hero.stats[ab.stat];
  const abName = ab.name[state.lang];
  let s = setHero({ ...state, lastEvents: [], lastRoll: null }, heroId, (h) => ({
    ...h,
    cooldowns: { ...h.cooldowns, [ab.id]: ab.cooldown },
  }));
  const enemy = s.enemies.find((e) => e.id === targetId && e.hp > 0);
  const consciousAlly = s.party.find((h) => h.id === (targetId ?? heroId) && h.hp > 0);
  const healableAlly = s.party.find((h) => h.id === (targetId ?? heroId));
  let summary = "";
  let detail: OutcomeDetail = { actionKind: ab.kind };
  const events: CombatEvent[] = [];
  const evId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (ab.kind === "attack") {
    if (!enemy) throw new Error("no target");
    const r = d20(rng);
    const ac = enemyAC(enemy);
    const hit = r === 20 || (r !== 1 && r + bonus >= ac);
    s = { ...s, lastRoll: { value: r, bonus, total: r + bonus, label: abName } };
    if (hit) {
      const dmg = rollDice(ab.dice ?? "1d6", rng).total * (r === 20 ? 2 : 1) + bonus;
      s = setEnemy(s, enemy.id, (e) => ({ ...e, hp: Math.max(0, e.hp - dmg) }));
      const left = s.enemies.find((e) => e.id === enemy.id)!.hp;
      const defeated = left <= 0;
      detail = { actionKind: "attack", hit: true, crit: r === 20, defeated, amount: dmg };
      events.push({
        id: evId(),
        targetId: enemy.id,
        attackerId: hero.id,
        text: r === 20 ? `КРИТ! -${dmg}` : `-${dmg}`,
        kind: r === 20 ? "crit" : "dmg",
      });
      summary = L(
        s,
        `${hero.name}: «${abName}» по ${enemy.name}. D20 ${r}${signed(bonus)} проти захисту ${ac} — ВЛУЧАННЯ${r === 20 ? " (КРИТ!)" : ""}, шкода ${dmg}. ${defeated ? `${enemy.name} ПЕРЕМОЖЕНИЙ.` : `HP ворога ${left}/${enemy.maxHp}.`}`,
        `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs defence ${ac} — HIT${r === 20 ? " (CRIT!)" : ""}, ${dmg} damage. ${defeated ? `${enemy.name} is DEFEATED.` : `Enemy HP ${left}/${enemy.maxHp}.`}`,
      );
    } else {
      detail = { actionKind: "attack", hit: false, crit: false };
      events.push({
        id: evId(),
        targetId: enemy.id,
        attackerId: hero.id,
        text: L(s, "ПРОМАХ", "MISS"),
        kind: "miss",
      });
      summary = L(
        s,
        `${hero.name}: «${abName}» по ${enemy.name}. D20 ${r}${signed(bonus)} проти захисту ${ac} — ПРОМАХ${r === 1 ? " (критичний провал)" : ""}.`,
        `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs defence ${ac} — MISS${r === 1 ? " (critical fail)" : ""}.`,
      );
    }
  } else if (ab.kind === "aoe") {
    const targets = s.enemies.filter((e) => e.hp > 0);
    if (!targets.length) throw new Error("no target");
    const dmg = rollDice(ab.dice ?? "1d6", rng).total + bonus;
    s = {
      ...s,
      enemies: s.enemies.map((e) => (e.hp > 0 ? { ...e, hp: Math.max(0, e.hp - dmg) } : e)),
    };
    const defeatedTargets = s.enemies.filter(
      (e) => targets.some((t) => t.id === e.id) && e.hp <= 0,
    );
    const anyDefeated = defeatedTargets.length > 0;
    detail = { actionKind: "aoe", hit: true, defeated: anyDefeated, amount: dmg };
    for (const t of targets) {
      events.push({
        id: evId(),
        targetId: t.id,
        attackerId: hero.id,
        text: `-${dmg}`,
        kind: "dmg",
      });
    }
    const defeatNote = anyDefeated
      ? L(
          s,
          ` ${defeatedTargets.map((e) => e.name).join(", ")} ПЕРЕМОЖЕНИЙ.`,
          ` ${defeatedTargets.map((e) => e.name).join(", ")} DEFEATED.`,
        )
      : "";
    summary = L(
      s,
      `${hero.name}: «${abName}» — шкода ${dmg} кожному ворогу (${targets.map((e) => e.name).join(", ")}).${defeatNote}`,
      `${hero.name}: "${abName}" — ${dmg} damage to every enemy (${targets.map((e) => e.name).join(", ")}).${defeatNote}`,
    );
  } else if (ab.kind === "stun") {
    if (!enemy) throw new Error("no target");
    const r = d20(rng);
    const ok = r === 20 || (r !== 1 && r + bonus >= 12);
    s = { ...s, lastRoll: { value: r, bonus, total: r + bonus, label: abName } };
    if (ok) s = setEnemy(s, enemy.id, (e) => ({ ...e, status: { ...e.status, stunned: 1 } }));
    detail = { actionKind: "stun", hit: ok, crit: r === 20 };
    events.push({
      id: evId(),
      targetId: enemy.id,
      attackerId: hero.id,
      text: ok ? L(s, "ОГЛУШЕНИЙ!", "STUNNED!") : L(s, "ОПІР", "RESIST"),
      kind: ok ? "status" : "miss",
    });
    summary = L(
      s,
      `${hero.name}: «${abName}» на ${enemy.name}. D20 ${r}${signed(bonus)} проти 12 — ${ok ? "УСПІХ, ворог пропустить хід" : "НЕВДАЧА"}.`,
      `${hero.name}: "${abName}" on ${enemy.name}. D20 ${r}${signed(bonus)} vs 12 — ${ok ? "SUCCESS, the enemy will skip a turn" : "FAIL"}.`,
    );
  } else if (ab.kind === "heal") {
    if (!healableAlly) throw new Error("no target");
    const amt = rollDice(ab.dice ?? "1d6", rng).total + bonus;
    const revived = healableAlly.hp <= 0;
    s = setHero(s, healableAlly.id, (h) => ({ ...h, hp: Math.min(h.maxHp, h.hp + amt) }));
    detail = { actionKind: "heal", hit: true, amount: amt };
    events.push({ id: evId(), targetId: healableAlly.id, text: `+${amt} HP`, kind: "heal" });
    summary = L(
      s,
      `${hero.name}: «${abName}» лікує ${healableAlly.name} на ${amt} HP${revived ? " (повернуто до бою!)" : ""}.`,
      `${hero.name}: "${abName}" heals ${healableAlly.name} for ${amt} HP${revived ? " (revived!)" : ""}.`,
    );
  } else if (ab.kind === "hide") {
    if (!consciousAlly) throw new Error("no target");
    s = setHero(s, consciousAlly.id, (h) => ({
      ...h,
      status: { ...h.status, hidden: 1, hiddenBy: heroId },
    }));
    detail = { actionKind: "hide", hit: true };
    events.push({
      id: evId(),
      targetId: consciousAlly.id,
      text: L(s, "ТІНЬ", "HIDDEN"),
      kind: "status",
    });
    summary = L(
      s,
      `${hero.name}: «${abName}» — ${consciousAlly.name} стає невидимим для ворогів до кінця раунду.`,
      `${hero.name}: "${abName}" — ${consciousAlly.name} becomes invisible to enemies until the round ends.`,
    );
  } else {
    s = {
      ...s,
      party: s.party.map((h) => ({
        ...h,
        status: { ...h.status, shield: 1, shieldBy: heroId },
      })),
    };
    detail = { actionKind: "shield", hit: true };
    for (const h of s.party.filter((x) => x.hp > 0)) {
      events.push({ id: evId(), targetId: h.id, text: "+3 AC", kind: "status" });
    }
    summary = L(
      s,
      `${hero.name}: «${abName}» — загін отримує +3 до захисту на раунд.`,
      `${hero.name}: "${abName}" — the party gains +3 defence for the round.`,
    );
  }
  s = { ...s, lastEvents: events };
  s = pushLog(s, hero.name, "action", abName);
  s = pushLog(s, "D20", "roll", summary);
  return { state: s, summary, detail };
}

export function resolveItem(
  state: GameState,
  heroId: string,
  itemId: string,
  targetId?: string,
): Outcome {
  const hero = state.party.find((h) => h.id === heroId);
  const item = hero?.inventory.find((i) => i.id === itemId);
  const usedCount = hero ? hero.used.filter((id) => id === itemId).length : 0;
  const maxQty = item?.qty ?? 1;
  if (!hero || !item || usedCount >= maxQty) throw new Error("bad item");
  const heal = itemHeal(item.bonus);
  if (heal == null) throw new Error("not usable");
  const ally = state.party.find((h) => h.id === (targetId ?? heroId)) ?? hero;
  let s = setHero({ ...state, lastEvents: [], lastRoll: null }, heroId, (h) => ({
    ...h,
    used: [...h.used, itemId],
  }));
  s = setHero(s, ally.id, (h) => ({ ...h, hp: Math.min(h.maxHp, h.hp + heal) }));
  s = {
    ...s,
    lastEvents: [
      { id: `item-${Date.now()}`, targetId: ally.id, text: `+${heal} HP`, kind: "heal" },
    ],
  };
  const summary = L(
    s,
    `${hero.name} використовує «${item.name}»: ${ally.name} +${heal} HP.`,
    `${hero.name} uses "${item.name}": ${ally.name} +${heal} HP.`,
  );
  s = pushLog(s, hero.name, "action", item.name);
  s = pushLog(s, "D20", "roll", summary);
  return { state: s, summary, detail: { actionKind: "item", hit: true, amount: heal } };
}

export const useAbility = resolveAbility;
export const useItem = resolveItem;

/** Find a combatant by name (either language), id, or unique prefix. */
function findTarget(state: GameState, target: string) {
  const t = target.trim().toLowerCase();
  if (!t) return null;
  const hero = state.party.find(
    (h) =>
      h.id === target ||
      h.name.toLowerCase() === t ||
      heroName(h.id, "uk").toLowerCase() === t ||
      heroName(h.id, "en").toLowerCase() === t,
  );
  if (hero) return { hero };
  const enemy = state.enemies.find((e) => e.id === target || e.name.toLowerCase() === t);
  if (enemy) return { enemy };
  // Partial match fallback on alive units if LLM abbreviated a name
  const fuzzyHero = state.party.find(
    (h) => h.name.toLowerCase().includes(t) || t.includes(h.name.toLowerCase()),
  );
  if (fuzzyHero) return { hero: fuzzyHero };
  const fuzzyEnemy = state.enemies.find(
    (e) => e.hp > 0 && (e.name.toLowerCase().includes(t) || t.includes(e.name.toLowerCase())),
  );
  return fuzzyEnemy ? { enemy: fuzzyEnemy } : null;
}

/** Apply HP changes proposed by the Master, within safe limits. */
export function applyMasterHp(
  state: GameState,
  changes: MasterReply["hpChanges"],
  limits: { heroMin: number; heroMax: number; enemyMin: number },
): GameState {
  let s = state;
  const actor = currentActor(state);
  const attackerId = actor?.type === "hero" ? actor.hero.id : undefined;
  const isCrit = state.lastRoll?.value === 20;
  const events = [...(s.lastEvents ?? [])];
  for (const c of changes.slice(0, 6)) {
    if (!Number.isFinite(c.delta) || c.delta === 0) continue;
    const f = findTarget(s, c.target);
    if (f?.hero) {
      const clamped = clamp(c.delta, limits.heroMin, limits.heroMax);
      if (clamped !== 0) {
        s = setHero(s, f.hero.id, (h) => ({ ...h, hp: clamp(h.hp + clamped, 0, h.maxHp) }));
        events.push({
          id: `m-${Date.now()}-${f.hero.id}`,
          targetId: f.hero.id,
          text: clamped > 0 ? `+${clamped} HP` : `${clamped}`,
          kind: clamped > 0 ? "heal" : "dmg",
        });
      }
    } else if (f?.enemy) {
      const clamped = clamp(c.delta, limits.enemyMin, 0);
      if (clamped < 0) {
        s = setEnemy(s, f.enemy.id, (e) => ({ ...e, hp: clamp(e.hp + clamped, 0, e.maxHp) }));
        events.push({
          id: `m-${Date.now()}-${f.enemy.id}`,
          targetId: f.enemy.id,
          ...(attackerId ? { attackerId } : {}),
          text: isCrit ? `КРИТ! ${clamped}` : `${clamped}`,
          kind: isCrit ? "crit" : "dmg",
        });
      }
    }
  }
  return { ...s, lastEvents: events };
}

/** Execute a tactical AI turn for a single enemy (LLM decision or utility AI). */
export function enemyAct(
  state: GameState,
  enemyId: string,
  decision?: EnemyDecision,
  rng: Rng = Math.random,
): Outcome {
  const enemy = state.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0) return { state, summary: "" };

  const visibleTargets = state.party.filter((h) => h.hp > 0 && h.status.hidden <= 0);
  const chosen = decision ?? chooseTacticalEnemyDecision(state, enemy, rng);
  const tactics = getEnemyTactics(enemy);
  const tactic =
    tactics.find((t) => t.id === chosen.tactic && (enemy.cooldowns?.[t.id] ?? 0) <= 0) ??
    tactics[0]!;
  const tacticName = tactic.name[state.lang];
  const aiTag = chosen.reason ? ` [${chosen.reason}]` : "";
  const barkSuffix = chosen.bark ? ` «${chosen.bark}»` : "";

  let s = setEnemy(state, enemy.id, (e) => ({
    ...e,
    cooldowns:
      tactic.cooldown > 0
        ? { ...(e.cooldowns ?? {}), [tactic.id]: tactic.cooldown }
        : (e.cooldowns ?? {}),
    lastAiReason: chosen.reason,
    ...(chosen.bark ? { lastAiBark: chosen.bark } : {}),
  }));
  const events: CombatEvent[] = [];
  const evId = () => `ea-${Date.now()}-${enemy.id}-${Math.random().toString(36).slice(2, 5)}`;

  // Defensive / self-sustain AI tactics
  if (tactic.kind === "shield" || tactic.kind === "heal_shield") {
    const healAmt = tactic.kind === "heal_shield" ? 2 : 0;
    s = setEnemy(s, enemy.id, (e) => ({
      ...e,
      hp: Math.min(e.maxHp, e.hp + healAmt),
      status: { ...e.status, shield: 1, shieldBy: enemy.id },
    }));
    events.push({
      id: evId(),
      targetId: enemy.id,
      attackerId: enemy.id,
      text: healAmt > 0 ? `+3 AC +${healAmt} HP` : "+3 AC",
      kind: "status",
    });
    const summary = L(
      s,
      `${enemy.name}${aiTag} застосовує «${tacticName}» (+3 до захисту${healAmt > 0 ? `, +${healAmt} HP` : ""}).${barkSuffix}`,
      `${enemy.name}${aiTag} uses "${tacticName}" (+3 defence${healAmt > 0 ? `, +${healAmt} HP` : ""}).${barkSuffix}`,
    );
    return { state: pushLog({ ...s, lastEvents: events }, enemy.name, "enemy", summary), summary };
  }

  if (!visibleTargets.length) {
    const summary = L(
      s,
      `${enemy.name} шукає героїв, але нікого не бачить.${barkSuffix}`,
      `${enemy.name} searches for the heroes but sees no one.${barkSuffix}`,
    );
    return { state: pushLog({ ...s, lastEvents: events }, enemy.name, "enemy", summary), summary };
  }

  const enraged = enemy.hp <= enemy.maxHp / 2;
  const atkBonus = enemy.bonus + (enraged ? 1 : 0) + (tactic.bonusMod ?? 0);

  // AOE AI tactic (e.g. Roach Guard Acid Spray)
  if (tactic.kind === "aoe") {
    let hitCount = 0;
    const hitLines: string[] = [];
    for (const target of visibleTargets) {
      const r = d20(rng);
      const baseAc = tactic.ignoreShield ? 10 + target.stats.agi : heroAC(target);
      const hit = r === 20 || (r !== 1 && r + atkBonus >= baseAc);
      s = { ...s, lastRoll: { value: r, bonus: atkBonus, total: r + atkBonus, label: tacticName } };
      if (hit) {
        hitCount++;
        const dmg = rollDice(tactic.dice ?? "1d4", rng).total * (r === 20 ? 2 : 1) + 1;
        s = setHero(s, target.id, (h) => ({ ...h, hp: Math.max(0, h.hp - dmg) }));
        events.push({
          id: evId(),
          targetId: target.id,
          attackerId: enemy.id,
          text: r === 20 ? `КРИТ! -${dmg}` : `-${dmg}`,
          kind: r === 20 ? "crit" : "dmg",
        });
        hitLines.push(`${target.name} -${dmg} HP`);
      } else {
        events.push({
          id: evId(),
          targetId: target.id,
          attackerId: enemy.id,
          text: L(s, "УХИЛЕННЯ", "DODGE"),
          kind: "miss",
        });
      }
    }
    const summary =
      hitCount > 0
        ? L(
            s,
            `${enemy.name}${enraged ? " (у люті)" : ""}${aiTag} застосовує «${tacticName}» — влучання по загону (${hitLines.join(", ")}).${barkSuffix}`,
            `${enemy.name}${enraged ? " (enraged)" : ""}${aiTag} uses "${tacticName}" — hits party (${hitLines.join(", ")}).${barkSuffix}`,
          )
        : L(
            s,
            `${enemy.name}${aiTag} застосовує «${tacticName}» — усі герої ухилилися (промах).${barkSuffix}`,
            `${enemy.name}${aiTag} uses "${tacticName}" — all heroes dodge (miss).${barkSuffix}`,
          );
    return { state: pushLog({ ...s, lastEvents: events }, enemy.name, "enemy", summary), summary };
  }

  // Single-target attack or pinning stun shot
  const target = visibleTargets.find((h) => h.id === chosen.targetId) ?? visibleTargets[0]!;
  const r = d20(rng);
  const ac = heroAC(target);
  const hit = r === 20 || (r !== 1 && r + atkBonus >= ac);
  s = { ...s, lastRoll: { value: r, bonus: atkBonus, total: r + atkBonus, label: tacticName } };
  let summary = "";

  if (hit) {
    const extraDmg = tactic.id === "heavy" ? 2 : 1;
    const dmg = rollDice(tactic.dice ?? enemy.attack, rng).total * (r === 20 ? 2 : 1) + extraDmg;
    s = setHero(s, target.id, (h) => ({ ...h, hp: Math.max(0, h.hp - dmg) }));
    const left = s.party.find((h) => h.id === target.id)!.hp;
    let stunNote = "";
    // Apply stun only if party has >= 2 conscious heroes left so solo 1-hero games aren't unfairly stun-locked
    const consciousCount = s.party.filter((h) => h.hp > 0).length;
    if (tactic.kind === "stun" && left > 0 && consciousCount >= 2 && target.status.stunned <= 0) {
      s = setHero(s, target.id, (h) => ({ ...h, status: { ...h.status, stunned: 1 } }));
      events.push({
        id: evId(),
        targetId: target.id,
        attackerId: enemy.id,
        text: L(s, "ОГЛУШЕНИЙ!", "STUNNED!"),
        kind: "status",
      });
      stunNote = L(s, " Ціль оглушена!", " Target stunned!");
    }
    events.push({
      id: evId(),
      targetId: target.id,
      attackerId: enemy.id,
      text: r === 20 ? `КРИТ! -${dmg}` : `-${dmg}`,
      kind: r === 20 ? "crit" : "dmg",
    });
    summary = L(
      s,
      `${enemy.name}${enraged ? " (у люті)" : ""}${aiTag} — «${tacticName}» по ${target.name}: D20 ${r}${signed(atkBonus)} проти захисту ${ac} — влучання, шкода ${dmg}${left <= 0 ? `. ${target.name} падає без свідомості!` : ` (HP ${left}/${target.maxHp})`}.${stunNote}${barkSuffix}`,
      `${enemy.name}${enraged ? " (enraged)" : ""}${aiTag} — "${tacticName}" on ${target.name}: D20 ${r}${signed(atkBonus)} vs defence ${ac} — hit, ${dmg} damage${left <= 0 ? `. ${target.name} falls unconscious!` : ` (HP ${left}/${target.maxHp})`}.${stunNote}${barkSuffix}`,
    );
  } else {
    events.push({
      id: evId(),
      targetId: target.id,
      attackerId: enemy.id,
      text: L(s, "УХИЛЕННЯ", "DODGE"),
      kind: "miss",
    });
    summary = L(
      s,
      `${enemy.name}${aiTag} — «${tacticName}» по ${target.name}: D20 ${r}${signed(atkBonus)} проти захисту ${ac} — промах.${barkSuffix}`,
      `${enemy.name}${aiTag} — "${tacticName}" on ${target.name}: D20 ${r}${signed(atkBonus)} vs defence ${ac} — miss.${barkSuffix}`,
    );
  }

  return { state: pushLog({ ...s, lastEvents: events }, enemy.name, "enemy", summary), summary };
}

/** Backwards-compatible wrapper for enemy attack. */
export function enemyAttack(state: GameState, enemyId: string, rng: Rng = Math.random): Outcome {
  return enemyAct(state, enemyId, undefined, rng);
}

/** Run every consecutive enemy turn until it's a hero's turn again. */
export function runEnemies(
  state: GameState,
  rng: Rng = Math.random,
  now = Date.now(),
  decisions: Record<string, EnemyDecision> = {},
): { state: GameState; summaries: string[] } {
  let s = state;
  const summaries: string[] = [];
  for (let guard = 0; guard < 20; guard++) {
    if (s.status !== "playing" || s.actReady) break;
    const a = currentActor(s);
    if (!a || a.type !== "enemy") break;
    if (a.enemy.hp > 0) {
      const o = enemyAct(s, a.enemy.id, decisions[a.enemy.id], rng);
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

/** Short rest between acts: conscious heroes recover +4 HP, unconscious heroes revive with 4 HP, plus optional interlude choice effect. */
export function advanceAct(
  state: GameState,
  rng: Rng = Math.random,
  now = Date.now(),
  choiceId?: string,
): GameState {
  if (!state.actReady || state.status !== "playing") return state;
  const targetActIndex = state.actIndex + 1;
  const interlude = getInterludeForAct(targetActIndex);
  const chosen = choiceId ? interlude?.choices.find((c) => c.id === choiceId) : undefined;
  const hpBonus = chosen?.effect.partyHpDelta ?? 0;

  const restedParty = state.party.map((h) => {
    const baseHp = h.hp <= 0 ? Math.min(h.maxHp, 4) : Math.min(h.maxHp, h.hp + 4);
    return {
      ...h,
      hp: clamp(baseHp + hpBonus, 1, h.maxHp),
    };
  });

  let s = startAct({ ...state, party: restedParty, actReady: false }, targetActIndex, rng, now);
  s = pushLog(
    s,
    L(s, "Табір", "Camp"),
    "system",
    L(
      s,
      "Короткий привал між актами: загін відновлює +4 HP.",
      "Short rest between acts: party recovers +4 HP.",
    ),
  );

  if (chosen) {
    if (chosen.effect.startProgress) {
      s = { ...s, actProgress: (s.actProgress ?? 0) + chosen.effect.startProgress };
    }
    if (chosen.effect.partyHidden || chosen.effect.partyShield) {
      s = {
        ...s,
        party: s.party.map((h) => ({
          ...h,
          status: {
            ...h.status,
            ...(chosen.effect.partyHidden ? { hidden: 1, hiddenBy: h.id } : {}),
            ...(chosen.effect.partyShield ? { shield: 1, shieldBy: h.id } : {}),
          },
        })),
      };
    }
    s = pushLog(s, L(s, "Вибір загону", "Party Choice"), "master", chosen.effect.logNote[s.lang]);
  }
  return s;
}

/** After defeat: heal everyone and replay the current act from its start. */
export function retryAct(state: GameState, rng: Rng = Math.random, now = Date.now()): GameState {
  if (state.status !== "defeat") return state;
  return startAct(
    { ...state, status: "playing", party: state.party.map((h) => ({ ...h, hp: h.maxHp })) },
    state.actIndex,
    rng,
    now,
  );
}
