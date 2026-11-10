import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { masterNarrate } from "@/lib/master.functions";
import { advanceAct, retryAct, type GameState, type MasterReply } from "../engine";
import { masterChat, playHeroTurn, playOpeningEnemies, type HeroAction, type Narrator } from "../turn";
import { generateFallbackMasterReply } from "../fallbackNarrator";
import { getStoredAiKey, narrateClientAi } from "../clientAi";
import type { NarrateRequest } from "../prompt";
import { t } from "../i18n";
import { GameView } from "./GameView";
import type { ChatMsg } from "./ChatPanel";

export function SoloGame({ state, chat, onUpdate, onChat, onExit }: { state: GameState; chat: ChatMsg[]; onUpdate: (s: GameState) => void; onChat: (m: ChatMsg[]) => void; onExit: () => void }) {
  const ask = useServerFn(masterNarrate);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const serverHasAiRef = useRef<boolean | null>(null);
  const lang = state.lang;

  const narrate: Narrator = useCallback(async (s: GameState, req: NarrateRequest): Promise<MasterReply> => {
    // 1. If the user configured a personal Gemini/Groq/OpenAI key in the browser, use it directly (<0.8s)
    if (getStoredAiKey()) {
      const direct = await narrateClientAi(s, req);
      if (direct) return direct;
    }

    // 2. Check server AI if we haven't learned that the server has no AI key / is offline
    if (serverHasAiRef.current !== false) {
      try {
        const r = await ask({ data: { state: s, req } });
        if (r.ok && r.fromAi && r.reply) {
          serverHasAiRef.current = true;
          return r.reply as MasterReply;
        }
        if (r.ok && !r.fromAi) {
          serverHasAiRef.current = false;
        }
      } catch {
        serverHasAiRef.current = false;
      }
    }

    // 3. For free-form actions and chat (or when browser free AI is responsive), query live browser AI
    if (req.kind === "free" || req.kind === "chat") {
      const clientReply = await narrateClientAi(s, req);
      if (clientReply) return clientReply;
    } else {
      // For standard combat mechanics, race browser AI with a short 1.4s window so combat stays lightning-fast
      const fastClientReply = await Promise.race([
        narrateClientAi(s, req),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1400)),
      ]);
      if (fastClientReply) return fastClientReply;
    }

    // 4. Instant, context-aware procedural Master with hero names, ability names, damage & 15+ distinct lines
    return generateFallbackMasterReply(s, req);
  }, [ask]);

  async function run(f: () => Promise<GameState>) {
    if (busy) return;
    setBusy(true); setError("");
    try { onUpdate(await f()); }
    catch (e) { setError(e instanceof Error && e.message.length > 12 ? e.message : t("masterError", lang)); }
    finally { setBusy(false); }
  }

  async function sendChat(text: string, toMaster: boolean) {
    const mine: ChatMsg = { id: `p${Date.now()}`, author: lang === "en" ? "You" : "Ви", kind: "player", toMaster, text };
    const list = [...chat, mine].slice(-80);
    onChat(list);
    if (!toMaster) return;
    setChatBusy(true);
    try {
      const out = await masterChat(state, mine.author, text, narrate);
      const reply: ChatMsg = { id: `m${Date.now()}`, author: lang === "en" ? "Master" : "Майстер", kind: "master", text: out.reply };
      onChat([...list, reply].slice(-80));
      onUpdate(out.state);
    } catch { setError(t("masterError", lang)); }
    finally { setChatBusy(false); }
  }

  return (
    <GameView
      state={state} lang={lang} mine="all" busy={busy} error={error} chat={chat} chatBusy={chatBusy}
      onAction={(heroId, a: HeroAction) => run(() => playHeroTurn(state, heroId, a, narrate, Math.random, Date.now(), onUpdate))}
      onChat={sendChat}
      onNextAct={() => run(() => playOpeningEnemies(advanceAct(state), narrate))}
      onRetry={() => run(() => playOpeningEnemies(retryAct(state), narrate))}
      onExit={onExit}
    />
  );
}
