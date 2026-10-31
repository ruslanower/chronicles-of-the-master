import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TitleScreen } from "@/game/components/TitleScreen";
import { PartySelect } from "@/game/components/PartySelect";
import { GamePlay } from "@/game/components/GamePlay";
import { newGame, restoreGame, SAVE_KEY } from "@/game/session";
import type { GameState } from "@/game/rules";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Хроніки Майстра: Корона Чорної Зірки — гра" },
    { name: "description", content: "Зберіть загін повстанців і пройдіть вісім актів темного фентезі. Піксельний світ, D20 і Майстер, який реагує на ваш вибір." },
    { property: "og:title", content: "Хроніки Майстра: Корона Чорної Зірки" },
    { property: "og:description", content: "Ваша пригода проти Залізної Варти починається в таємній таверні. Зберіть загін і змініть долю королівства." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});

function Index() {
  const [screen, setScreen] = useState<"title" | "party" | "game">("title");
  const [state, setState] = useState<GameState | null>(null);
  const [actReady, setActReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const saved = raw ? restoreGame(raw) : null;
      if (saved) { setState(saved.state); setActReady(saved.actReady); }
    } catch { setSaveError(true); }
  }, []);
  function update(next: GameState, ready: boolean) {
    setState(next); setActReady(ready);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: next, actReady: ready })); setSaveError(false); }
    catch { setSaveError(true); }
  }
  return <>
    {screen === "title" && <TitleScreen onStart={() => setScreen("party")} onContinue={state ? () => setScreen("game") : undefined} />}
    {screen === "party" && <PartySelect onBack={() => setScreen("title")} onConfirm={(heroes) => { update(newGame(heroes.map((h) => h.id)), false); setScreen("game"); }} />}
    {screen === "game" && state && <GamePlay state={state} actReady={actReady} onUpdate={update} onExit={() => setScreen("title")} />}
    {saveError && <p role="alert" className="fixed bottom-3 left-3 z-50 max-w-xs border border-border bg-ink p-3 text-sm text-hp">Браузер не дозволяє зберегти пригоду. Не закривайте цю вкладку.</p>}
  </>;
}
