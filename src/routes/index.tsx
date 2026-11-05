import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TitleScreen } from "@/game/components/TitleScreen";
import { PartySelect } from "@/game/components/PartySelect";
import { Prologue } from "@/game/components/Prologue";
import { SoloGame } from "@/game/components/SoloGame";
import type { ChatMsg } from "@/game/components/ChatPanel";
import { newGame, type GameState } from "@/game/engine";
import { t, type Lang } from "@/game/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Хроніки Майстра: Корона Чорної Зірки — гра" },
      { name: "description", content: "Зберіть загін повстанців, грайте з друзями онлайн і пройдіть вісім актів темного фентезі з ШІ-Майстром." },
      { property: "og:title", content: "Хроніки Майстра: Корона Чорної Зірки" },
      { property: "og:description", content: "Онлайн-пригода з D20, уміннями героїв і живим Майстром гри." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SAVE_KEY = "chronicles-black-star-v2";
type Save = { version: 2; state: GameState; chat: ChatMsg[] };

function Index() {
  const [lang, setLang] = useState<Lang>("uk");
  const [screen, setScreen] = useState<"title" | "prologue" | "party" | "game">("title");
  const [state, setState] = useState<GameState | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const l = localStorage.getItem("chronicles-lang");
    if (l === "en" || l === "uk") setLang(l);
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const saved = raw ? (JSON.parse(raw) as Save) : null;
      if (saved?.version === 2 && saved.state?.version === 2 && Array.isArray(saved.state.party)) { setState(saved.state); setChat(saved.chat ?? []); }
    } catch { /* ignore broken save */ }
  }, []);

  function persist(s: GameState, c: ChatMsg[]) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state: s, chat: c })); setSaveError(false); }
    catch { setSaveError(true); }
  }
  const changeLang = (l: Lang) => { setLang(l); localStorage.setItem("chronicles-lang", l); };

  return <>
    {screen === "title" && <TitleScreen lang={lang} onLang={changeLang} onStart={() => setScreen("prologue")} onContinue={state ? () => setScreen("game") : undefined} />}
    {screen === "prologue" && <Prologue lang={lang} onDone={() => setScreen("party")} />}
    {screen === "party" && <PartySelect lang={lang} onBack={() => setScreen("title")} onConfirm={(ids) => { const s = newGame(ids, lang); setState(s); setChat([]); persist(s, []); setScreen("game"); }} />}
    {screen === "game" && state && <SoloGame state={state} chat={chat} onUpdate={(s) => { setState(s); persist(s, chat); }} onChat={(c) => { setChat(c); if (state) persist(state, c); }} onExit={() => setScreen("title")} />}
    {saveError && <p role="alert" className="fixed bottom-3 left-3 z-50 max-w-xs border border-border bg-ink p-3 text-sm text-hp">{t("saveError", lang)}</p>}
  </>;
}
