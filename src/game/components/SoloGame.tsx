import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { masterNarrate } from "@/lib/master.functions";
import { advanceAct, retryAct, type GameState, type MasterReply } from "../engine";
import { masterChat, playHeroTurn, playOpeningEnemies, type HeroAction, type Narrator } from "../turn";
import { generateFallbackMasterReply } from "../fallbackNarrator";
import type { NarrateRequest } from "../prompt";
import { t } from "../i18n";
import { GameView } from "./GameView";
import type { ChatMsg } from "./ChatPanel";

export function SoloGame({ state, chat, onUpdate, onChat, onExit }: { state: GameState; chat: ChatMsg[]; onUpdate: (s: GameState) => void; onChat: (m: ChatMsg[]) => void; onExit: () => void }) {
  const ask = useServerFn(masterNarrate);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const lang = state.lang;

  const narrate: Narrator = useCallback(async (s: GameState, req: NarrateRequest): Promise<MasterReply> => {
    try {
      const r = await ask({ data: { state: s, req } });
      if (r.ok && r.reply) return r.reply as MasterReply;
    } catch (e) {
      console.warn("SoloGame masterNarrate call error, using local fallback:", e);
    }
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
      onAction={(heroId, a: HeroAction) => run(() => playHeroTurn(state, heroId, a, narrate))}
      onChat={sendChat}
      onNextAct={() => run(() => playOpeningEnemies(advanceAct(state), narrate))}
      onRetry={() => run(() => playOpeningEnemies(retryAct(state), narrate))}
      onExit={onExit}
    />
  );
}
