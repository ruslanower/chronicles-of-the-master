import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Crown,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  MessageCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { campaignFor, ROMAN, t, type Lang } from "../i18n";
import { heroSprite } from "../data";
import { ACT_PROGRESS_GOAL, currentActor, TURN_SECONDS, type GameState } from "../engine";
import { getStoredAiKey, setStoredAiKey } from "../clientAi";
import {
  isSoundMuted,
  playAttackSound,
  playClickSound,
  playCritSound,
  playDefeatSound,
  playHealSound,
  playMissSound,
  playVictorySound,
  setSoundMuted,
} from "../sound";
import type { HeroAction } from "../turn";
import { Scene } from "./Scene";
import { TurnPanel } from "./TurnPanel";
import { ChatPanel, type ChatMsg } from "./ChatPanel";

type Props = {
  state: GameState;
  lang: Lang;
  /** hero ids this browser controls; "all" for solo */
  mine: string[] | "all";
  busy: boolean;
  error: string;
  chat: ChatMsg[];
  chatBusy: boolean;
  timed?: boolean;
  onAction: (heroId: string, a: HeroAction) => void;
  onChat: (text: string, toMaster: boolean) => void;
  onNextAct: () => void;
  onRetry: () => void;
  onExit: () => void;
  onTimeout?: () => void;
  canAdvance?: boolean;
};

function useCountdown(startedAt: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return Math.max(0, Math.ceil(TURN_SECONDS - (now - startedAt) / 1000));
}

export function GameView(p: Props) {
  const { state, lang } = p;
  const [journal, setJournal] = useState(false);
  const [aiModal, setAiModal] = useState(false);
  const [aiKeyInput, setAiKeyInput] = useState(() => getStoredAiKey());
  const [muted, setMuted] = useState(() => isSoundMuted());
  const act = campaignFor(lang).acts[state.actIndex];
  const actor = currentActor(state);
  const heroTurn = actor?.type === "hero" ? actor.hero : null;
  const myTurn = !!heroTurn && (p.mine === "all" || p.mine.includes(heroTurn.id));
  const playing = state.status === "playing" && !state.actReady;
  const left = useCountdown(state.turnStartedAt, !!p.timed && playing && !!heroTurn);
  const { onTimeout } = p;
  const lastSoundKeyRef = useRef("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.log.length]);

  useEffect(() => {
    if (!p.timed || !playing || !heroTurn || left > 0 || !onTimeout) return undefined;
    const tId = setTimeout(onTimeout, 1000);
    const intervalId = setInterval(onTimeout, 3000);
    return () => {
      clearTimeout(tId);
      clearInterval(intervalId);
    };
  }, [p.timed, playing, heroTurn, left, onTimeout]);

  useEffect(() => {
    const evKey = (state.lastEvents ?? []).map((ev) => ev.id).join("|");
    const statusKey = `${state.status}-${state.actReady}-${state.actIndex}`;
    const fullKey = `${statusKey}:${evKey}`;
    if (lastSoundKeyRef.current === fullKey) return;
    lastSoundKeyRef.current = fullKey;
    if (state.status === "victory") playVictorySound();
    else if (state.status === "defeat") playDefeatSound();
    else if (state.actReady) playVictorySound();
    else if (state.lastEvents?.some((ev) => ev.kind === "crit")) playCritSound();
    else if (state.lastEvents?.some((ev) => ev.kind === "dmg")) playAttackSound();
    else if (state.lastEvents?.some((ev) => ev.kind === "miss")) playMissSound();
    else if (state.lastEvents?.some((ev) => ev.kind === "heal")) playHealSound();
  }, [state.status, state.actReady, state.actIndex, state.lastEvents]);

  if (!act) return null;

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    if (!next) playClickSound();
  }

  return (
    <main className="min-h-dvh bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 md:px-8 md:py-3">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" aria-label={t("mainMenu", lang)} onClick={p.onExit}>
            <ArrowLeft />
          </Button>
          <div>
            <p className="font-display text-[0.55rem] text-gold">
              {t("gameTitle", lang).toUpperCase()}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("gameSubtitle", lang)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={lang === "en" ? "AI Master Settings" : "Налаштування ШІ-Майстра"}
            title={lang === "en" ? "AI Master Settings" : "Налаштування ШІ-Майстра"}
            onClick={() => {
              setAiKeyInput(getStoredAiKey());
              setAiModal(true);
            }}
          >
            <Sparkles className={`h-4 w-4 ${getStoredAiKey() ? "text-gold" : "text-astral"}`} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("sound", lang)}
            aria-pressed={!muted}
            onClick={toggleMute}
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 text-gold" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={t("chat", lang)}
            onClick={() => document.getElementById("chat")?.scrollIntoView({ behavior: "smooth" })}
          >
            <MessageCircle />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("journal", lang)}
            onClick={() => setJournal(true)}
          >
            <BookOpen />
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px]">
        <Scene state={state} lang={lang} busy={p.busy} />

        {state.order.length > 1 && (
          <div
            className="flex items-center gap-2 overflow-x-auto border-y border-border bg-ink px-3 py-2 md:px-8"
            aria-label={t("initiative", lang)}
          >
            <span className="shrink-0 font-display text-[0.5rem] text-muted-foreground">
              {t("initiative", lang).toUpperCase()}
            </span>
            {state.order.map((id, i) => {
              const h = state.party.find((x) => x.id === id);
              const e = state.enemies.find((x) => x.id === id);
              const hp = h?.hp ?? e?.hp ?? 0;
              const cur = i === state.pos;
              return (
                <div
                  key={id}
                  className={`flex shrink-0 items-center gap-1 border px-2 py-1 text-xs ${cur ? "border-gold text-gold" : "border-border text-muted-foreground"} ${hp <= 0 ? "opacity-30 line-through" : ""}`}
                >
                  <img
                    src={h ? heroSprite(h.classKey, "front") : e?.sprite}
                    alt=""
                    width={240}
                    height={280}
                    className="pixel h-6 w-5 object-contain"
                  />
                  <span className={e ? "text-hp" : ""}>
                    {(h?.name ?? e?.name ?? "").split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-5 p-3 md:p-6 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-5">
            <section aria-label={t("story", lang)}>
              <div className="flex flex-wrap items-center justify-between gap-2 border border-border bg-ink/60 p-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span>
                    <span className="text-gold">{t("actGoal", lang)}:</span> {act.objective}
                  </span>
                </div>
                {(!state.enemies.length || (state.actProgress ?? 0) > 0) && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {Array.from({ length: ACT_PROGRESS_GOAL }, (_, idx) => (
                      <span
                        key={idx}
                        className={`h-2 w-5 rounded-xs border border-gold/50 ${idx < (state.actProgress ?? 0) ? "bg-gold" : "bg-ink"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-1">
                {campaignFor(lang).acts.map((a, i) => (
                  <span
                    key={a.actNumber}
                    className={`h-1.5 flex-1 ${i < state.actIndex ? "bg-gold" : i === state.actIndex ? "bg-gold/50" : "bg-secondary"}`}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <h2 className="font-display text-[0.6rem] text-gold">
                  {t("masterTells", lang)} •{" "}
                  {lang === "en" ? "CHRONICLE OF ACTIONS" : "ІСТОРІЯ ДІЙ ТА СЛІВ МАЙСТРА"}
                </h2>
                <span className="font-display text-[0.5rem] text-muted-foreground">
                  {state.log.length} {lang === "en" ? "entries" : "записів"}
                </span>
              </div>

              <div
                className="mt-2.5 max-h-72 md:max-h-96 space-y-2.5 overflow-y-auto rounded-xs border border-border bg-ink/55 p-3 md:p-4"
                aria-live="polite"
              >
                {state.log.map((e, idx) => {
                  const isLatestMaster =
                    e.kind === "master" &&
                    idx === state.log.map((x) => x.kind).lastIndexOf("master");
                  if (e.kind === "master") {
                    return (
                      <div
                        key={e.id}
                        className={`rounded-xs border-l-3 border-gold bg-card/75 p-3 transition-colors ${isLatestMaster ? "ring-1 ring-gold/40" : "opacity-90"}`}
                      >
                        <p className="mb-1 flex items-center gap-1.5 font-display text-[0.52rem] text-gold">
                          <span>👑 {e.who}</span>
                        </p>
                        <p className="story-copy text-base sm:text-lg leading-relaxed text-parchment">
                          {e.text}
                        </p>
                      </div>
                    );
                  }
                  if (e.kind === "action") {
                    return (
                      <div
                        key={e.id}
                        className="rounded-xs border-l-3 border-astral bg-astral/10 px-3 py-2"
                      >
                        <p className="font-display text-[0.5rem] text-astral">🗡 {e.who}</p>
                        <p className="story-copy mt-0.5 text-sm sm:text-base text-parchment">
                          «{e.text}»
                        </p>
                      </div>
                    );
                  }
                  if (e.kind === "enemy") {
                    return (
                      <div
                        key={e.id}
                        className="rounded-xs border-l-3 border-hp bg-hp/10 px-3 py-2"
                      >
                        <p className="font-display text-[0.5rem] text-hp">⚔️ {e.who}</p>
                        <p className="story-copy mt-0.5 text-sm text-parchment">{e.text}</p>
                      </div>
                    );
                  }
                  if (e.kind === "roll") {
                    return (
                      <div
                        key={e.id}
                        className="rounded-xs border border-gold/30 bg-ink/80 px-3 py-1.5 text-xs sm:text-sm text-gold"
                      >
                        🎲 {e.text}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={e.id}
                      className="py-1 text-center font-display text-[0.52rem] text-muted-foreground"
                    >
                      ✦ {e.who}: {e.text} ✦
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </section>

            {state.status !== "playing" ? (
              <div className="border-t border-gold-deep pt-5">
                <Crown className="mb-3 h-8 w-8 text-gold" />
                <h2 className="title-glow text-lg">
                  {state.status === "victory" ? t("victory", lang) : t("defeat", lang)}
                </h2>
                <p className="mt-2 text-parchment">
                  {state.status === "victory" ? t("victoryText", lang) : t("defeatText", lang)}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {state.status === "defeat" && (
                    <Button variant="pixel" disabled={p.busy} onClick={p.onRetry}>
                      <RotateCcw />
                      {t("retryAct", lang)}
                    </Button>
                  )}
                  <Button variant="pixelGhost" onClick={p.onExit}>
                    {t("mainMenu", lang)}
                  </Button>
                </div>
              </div>
            ) : state.actReady ? (
              <div className="border-t border-gold-deep pt-5">
                <p className="mb-4 text-gold">{t("actDone", lang)}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="pixel"
                    disabled={p.busy || p.canAdvance === false}
                    onClick={p.onNextAct}
                  >
                    {p.busy ? <LoaderCircle className="animate-spin" /> : null}
                    {t("continueAct", lang)} {ROMAN[state.actIndex + 2]} →
                  </Button>
                  {p.canAdvance === false && (
                    <span className="text-sm text-muted-foreground">{t("waitHost", lang)}</span>
                  )}
                </div>
              </div>
            ) : myTurn && heroTurn ? (
              <>
                {p.timed && (
                  <p
                    className={`flex items-center gap-2 text-sm ${left <= 10 ? "text-hp" : "text-muted-foreground"}`}
                  >
                    <Timer className="h-4 w-4" />
                    {t("timeLeft", lang)}: {left}
                    {t("seconds", lang)}
                  </p>
                )}
                <TurnPanel
                  key={`${heroTurn.id}-${state.log.length}`}
                  state={state}
                  hero={heroTurn}
                  lang={lang}
                  busy={p.busy}
                  onAction={(a) => p.onAction(heroTurn.id, a)}
                />
              </>
            ) : (
              <div className="flex items-center gap-3 border border-border bg-card/40 p-4 text-parchment">
                <LoaderCircle className="h-5 w-5 animate-spin text-astral" />
                <span>
                  {actor?.type === "enemy"
                    ? `${t("enemiesAct", lang)} (${actor.enemy.name})`
                    : p.busy
                      ? t("masterThinking", lang)
                      : `${t("waitingFor", lang)}: ${heroTurn?.ownerName ?? ""} (${heroTurn?.name ?? ""})`}
                  {p.timed && heroTurn ? ` • ${left}${t("seconds", lang)}` : ""}
                </span>
              </div>
            )}
            {p.error && (
              <p role="alert" className="text-sm text-hp">
                {p.error}
              </p>
            )}
          </div>

          <aside className="space-y-5">
            <div className="border border-border bg-card/40 p-4">
              <h2 className="mb-3 font-display text-[0.55rem] text-muted-foreground">
                {t("party", lang)}
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {state.party.map((h) => (
                  <div
                    key={h.id}
                    className={`flex items-center gap-3 border-l-2 py-1 pl-2 ${heroTurn?.id === h.id ? "border-gold bg-gold/5" : "border-transparent"}`}
                  >
                    <img
                      src={heroSprite(h.classKey, "front")}
                      alt=""
                      width={240}
                      height={280}
                      className="pixel h-12 w-10 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm ${heroTurn?.id === h.id ? "text-gold" : "text-parchment"}`}
                      >
                        {h.name}
                      </p>
                      {h.ownerName && <p className="truncate text-xs text-astral">{h.ownerName}</p>}
                      <progress
                        className="game-hp mt-1 w-full"
                        value={h.hp}
                        max={h.maxHp}
                        aria-label={`HP ${h.name}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        ♥ {h.hp}/{h.maxHp}
                        {h.hp <= 0 ? ` • ${t("unconscious", lang)}` : ""}
                        {h.status.hidden ? ` • ${t("hidden", lang)}` : ""}
                        {h.status.shield ? ` • ${t("shielded", lang)}` : ""}
                        {h.status.stunned ? ` • ${t("stunned", lang)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ChatPanel messages={p.chat} lang={lang} busy={p.chatBusy} onSend={p.onChat} />
          </aside>
        </div>
      </div>

      {journal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setJournal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("journal", lang)}
            className="pixel-frame max-h-[85dvh] w-full max-w-3xl overflow-y-auto p-5 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xs text-gold">{t("journal", lang).toUpperCase()}</h2>
              <Button variant="ghost" onClick={() => setJournal(false)}>
                {t("close", lang)}
              </Button>
            </div>
            <div className="space-y-4">
              {state.log.map((e) => (
                <div key={e.id} className="border-l-2 border-border pl-4">
                  <p
                    className={`mb-1 text-xs ${e.kind === "master" ? "text-gold" : e.kind === "enemy" ? "text-hp" : "text-muted-foreground"}`}
                  >
                    {e.who}
                  </p>
                  <p className="story-copy leading-relaxed text-parchment">{e.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {aiModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          onClick={() => setAiModal(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={lang === "en" ? "AI Master Settings" : "Налаштування ШІ-Майстра"}
            className="pixel-frame w-full max-w-lg space-y-4 p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xs text-gold">
                {lang === "en" ? "AI MASTER ENGINE" : "РУШІЙ ШІ-МАЙСТРА"}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setAiModal(false)}>
                {t("close", lang)}
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-parchment">
              {lang === "en"
                ? "By default, both the Game Master and enemy tactics use built-in AI (Pollinations + tactical engine). For ultra-fast (<0.5s) LLM roleplay & enemy AI, paste a free Google Gemini (AIza...) or Groq (gsk_...) API key below:"
                : "За замовчуванням і Майстер, і тактика супротивників керуються вбудованим ШІ (Pollinations + тактичний рушій). Для надшвидкої (<0.5 с) генерації історії та ШІ-рішень ворогів вставте ключ Google Gemini (AIza...) або Groq (gsk_...):"}
            </p>
            <Input
              type="password"
              value={aiKeyInput}
              onChange={(e) => setAiKeyInput(e.target.value)}
              placeholder={
                lang === "en"
                  ? "AIza... (Gemini) or gsk_... (Groq)"
                  : "AIza... (Gemini) або gsk_... (Groq)"
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gold underline"
              >
                {lang === "en"
                  ? "Get free Gemini API key →"
                  : "Отримати безкоштовний ключ Gemini →"}
              </a>
              <div className="flex gap-2">
                {aiKeyInput && (
                  <Button
                    variant="pixelGhost"
                    size="sm"
                    onClick={() => {
                      setAiKeyInput("");
                      setStoredAiKey("");
                    }}
                  >
                    {lang === "en" ? "Clear" : "Очистити"}
                  </Button>
                )}
                <Button
                  variant="pixel"
                  size="sm"
                  onClick={() => {
                    setStoredAiKey(aiKeyInput);
                    setAiModal(false);
                  }}
                >
                  {lang === "en" ? "Save" : "Зберегти"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
