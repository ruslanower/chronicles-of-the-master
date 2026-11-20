import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { enemyAiDecide, masterNarrate } from "@/lib/master.functions";
import {
  advanceAct,
  applyMasterHp,
  checkOutcome,
  currentActor,
  retryAct,
  type GameState,
  type MasterReply,
} from "../engine";
import { parseEnemyAiResponse, type EnemyAiDecider, type EnemyDecision } from "../enemyAi";
import {
  masterChat,
  playHeroTurn,
  playOpeningEnemies,
  type HeroAction,
  type Narrator,
} from "../turn";
import { generateFallbackMasterReply } from "../fallbackNarrator";
import {
  decideEnemiesClientAi,
  getStoredAiKey,
  isFreeClientAiBackedOff,
  narrateClientAi,
} from "../clientAi";
import type { NarrateRequest } from "../prompt";
import { t } from "../i18n";
import { GameView } from "./GameView";
import type { ChatMsg } from "./ChatPanel";

/** Strip heavy static lore strings before sending state over the wire. */
function compactStateForAi(s: GameState): GameState {
  return {
    ...s,
    party: s.party.map((h) => ({
      ...h,
      inventory: h.inventory.map(({ lore: _lore, ...rest }) => rest),
    })),
    log: s.log.slice(-24),
  };
}

export function SoloGame({
  state,
  chat,
  onUpdate,
  onChat,
  onExit,
}: {
  state: GameState;
  chat: ChatMsg[];
  onUpdate: (s: GameState) => void;
  onChat: (m: ChatMsg[]) => void;
  onExit: () => void;
}) {
  const ask = useServerFn(masterNarrate);
  const askEnemyAi = useServerFn(enemyAiDecide);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const serverAiBackoffUntilRef = useRef<number>(0);
  const serverHasDedicatedAiRef = useRef<boolean | null>(null);
  const openingRunKeyRef = useRef<string>("");
  const latestStateRef = useRef<GameState>(state);
  latestStateRef.current = state;
  const lang = state.lang;

  const narrate: Narrator = useCallback(
    async (s: GameState, req: NarrateRequest): Promise<MasterReply> => {
      // 1. If the user configured a personal Gemini/Groq/OpenAI key in the browser, use it directly (<0.8s)
      if (getStoredAiKey()) {
        const direct = await narrateClientAi(s, req);
        if (direct) return direct;
      }

      // 2. Check server AI if not temporarily backed off
      if (Date.now() >= serverAiBackoffUntilRef.current) {
        try {
          const r = await ask({ data: { state: compactStateForAi(s), req } });
          if (r.ok && r.fromAi && r.reply) {
            serverHasDedicatedAiRef.current = true;
            return r.reply as MasterReply;
          }
          if (r.ok && !r.fromAi) {
            serverHasDedicatedAiRef.current = false;
            serverAiBackoffUntilRef.current = Date.now() + 60_000;
          }
        } catch {
          serverHasDedicatedAiRef.current = false;
          serverAiBackoffUntilRef.current = Date.now() + 60_000;
        }
      }

      // 3. For free-form actions and chat (or when browser free AI is responsive), query live browser AI
      if (req.kind === "free" || req.kind === "chat") {
        const clientReply = await narrateClientAi(s, req);
        if (clientReply) return clientReply;
      } else {
        const fastClientReply = await Promise.race([
          narrateClientAi(s, req),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1400)),
        ]);
        if (fastClientReply) return fastClientReply;
      }

      // 4. Instant, context-aware procedural Master
      return generateFallbackMasterReply(s, req);
    },
    [ask],
  );

  const decideEnemies: EnemyAiDecider = useCallback(
    async (s: GameState, enemyIds: string[]): Promise<Record<string, EnemyDecision>> => {
      if (!enemyIds.length) return {};

      // 1. User-configured browser AI key (fast & smart)
      if (getStoredAiKey()) {
        const direct = await decideEnemiesClientAi(s, enemyIds);
        if (Object.values(direct).some((d) => d.fromAi)) return direct;
      }

      // 2. Server AI if available and not backed off
      if (
        Date.now() >= serverAiBackoffUntilRef.current &&
        serverHasDedicatedAiRef.current !== false
      ) {
        try {
          const r = await askEnemyAi({ data: { state: compactStateForAi(s), enemyIds } });
          if (r.ok) {
            serverHasDedicatedAiRef.current = r.hasDedicatedAi;
            if (!r.hasDedicatedAi && !Object.values(r.decisions).some((d) => d.fromAi)) {
              serverAiBackoffUntilRef.current = Date.now() + 60_000;
            }
            if (Object.values(r.decisions).some((d) => d.fromAi)) {
              return r.decisions as Record<string, EnemyDecision>;
            }
          }
        } catch {
          serverHasDedicatedAiRef.current = false;
          serverAiBackoffUntilRef.current = Date.now() + 60_000;
        }
      }

      // 3. Free browser AI with crisp timeout if not backed off
      if (!isFreeClientAiBackedOff()) {
        const raced = await Promise.race([
          decideEnemiesClientAi(s, enemyIds),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1400)),
        ]);
        if (raced && Object.values(raced).some((d) => d.fromAi)) return raced;
      }

      // 4. Tactical utility AI fallback
      return parseEnemyAiResponse("", s, enemyIds);
    },
    [askEnemyAi],
  );

  const run = useCallback(
    async (f: () => Promise<GameState>) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        onUpdate(await f());
      } catch (e) {
        setError(e instanceof Error && e.message.length > 12 ? e.message : t("masterError", lang));
      } finally {
        setBusy(false);
      }
    },
    [busy, lang, onUpdate],
  );

  // Automatically execute opening / pending enemy AI turns (fixes Act I soft-lock when enemies win initiative)
  const actor = currentActor(state);
  useEffect(() => {
    if (busy || state.status !== "playing" || state.actReady) return;
    if (actor?.type !== "enemy") {
      openingRunKeyRef.current = "";
      return;
    }
    const key = `${state.actIndex}-${state.round}-${state.pos}-${state.log.length}`;
    if (openingRunKeyRef.current === key) return;
    openingRunKeyRef.current = key;
    void run(() =>
      playOpeningEnemies(
        latestStateRef.current,
        narrate,
        Math.random,
        Date.now(),
        decideEnemies,
        onUpdate,
        1050,
      ),
    );
  }, [actor?.type, busy, decideEnemies, narrate, onUpdate, run, state]);

  async function sendChat(text: string, toMaster: boolean) {
    const mine: ChatMsg = {
      id: `p${Date.now()}`,
      author: lang === "en" ? "You" : "Ви",
      kind: "player",
      toMaster,
      text,
    };
    const list = [...chat, mine].slice(-80);
    onChat(list);
    if (!toMaster) return;
    setChatBusy(true);
    try {
      const snapshot = latestStateRef.current;
      const out = await masterChat(snapshot, mine.author, text, narrate);
      const reply: ChatMsg = {
        id: `m${Date.now()}`,
        author: lang === "en" ? "Master" : "Майстер",
        kind: "master",
        text: out.reply,
      };
      onChat([...list, reply].slice(-80));

      // Apply only HP deltas to the latest state so a concurrent turn isn't clobbered
      const latest = latestStateRef.current;
      const partyDiff = out.state.party
        .map((h) => ({
          target: h.id,
          delta: h.hp - (snapshot.party.find((x) => x.id === h.id)?.hp ?? h.hp),
        }))
        .filter((c) => c.delta !== 0);
      const enemyDiff = out.state.enemies
        .map((e) => ({
          target: e.id,
          delta: e.hp - (snapshot.enemies.find((x) => x.id === e.id)?.hp ?? e.hp),
        }))
        .filter((c) => c.delta !== 0);
      const diff = [...partyDiff, ...enemyDiff];
      if (diff.length) {
        onUpdate(
          checkOutcome(applyMasterHp(latest, diff, { heroMin: -3, heroMax: 3, enemyMin: -3 })),
        );
      }
    } catch {
      setError(t("masterError", lang));
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <GameView
      state={state}
      lang={lang}
      mine="all"
      busy={busy}
      error={error}
      chat={chat}
      chatBusy={chatBusy}
      onAction={(heroId, a: HeroAction) =>
        void run(() =>
          playHeroTurn(
            latestStateRef.current,
            heroId,
            a,
            narrate,
            Math.random,
            Date.now(),
            onUpdate,
            decideEnemies,
            1100,
          ),
        )
      }
      onChat={(text, toMaster) => void sendChat(text, toMaster)}
      onNextAct={() =>
        void run(() =>
          playOpeningEnemies(
            advanceAct(latestStateRef.current),
            narrate,
            Math.random,
            Date.now(),
            decideEnemies,
            onUpdate,
            1050,
          ),
        )
      }
      onRetry={() =>
        void run(() =>
          playOpeningEnemies(
            retryAct(latestStateRef.current),
            narrate,
            Math.random,
            Date.now(),
            decideEnemies,
            onUpdate,
            1050,
          ),
        )
      }
      onExit={onExit}
    />
  );
}
