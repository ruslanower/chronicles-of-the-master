import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { heroSprite, type HeroDef, type Stats } from "../data";
import { ABILITIES } from "../content";
import { campaignFor, STAT_LABELS, t, type Lang } from "../i18n";
import { playClickSound } from "../sound";

/** Hero grid + detail card. Used by solo party select (up to 4) and the online lobby (1 per player). */
export function HeroPicker({
  lang,
  picked,
  taken = {},
  onToggle,
}: {
  lang: Lang;
  picked: string[];
  taken?: Record<string, string>;
  onToggle: (h: HeroDef) => void;
}) {
  const heroes = campaignFor(lang).heroes;
  const [focusId, setFocusId] = useState(heroes[0]!.id);
  const focus = heroes.find((h) => h.id === focusId) ?? heroes[0]!;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:gap-8">
      {/* Focused Hero Detail Card: displayed ABOVE grid on mobile for instant feedback, and as right sticky sidebar on desktop */}
      <aside className="pixel-frame pixel-frame-gold order-1 h-fit p-3.5 sm:p-5 lg:order-2 lg:sticky lg:top-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src={heroSprite(focus.classKey, "front")}
            alt=""
            className="pixel h-16 sm:h-24 w-auto shrink-0 object-contain"
            width={240}
            height={280}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[0.6rem] sm:text-[0.65rem] leading-relaxed text-gold">
                {focus.name}
              </h2>
              <span className="font-display text-[0.5rem] text-hp">♥ HP {focus.maxHp}</span>
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">{focus.role}</p>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
          {(Object.keys(STAT_LABELS[lang]) as (keyof Stats)[]).map((k) => (
            <div key={k} className="bg-ink p-1.5 sm:p-2">
              <p className="font-display text-[0.45rem] sm:text-[0.5rem] text-muted-foreground">
                {STAT_LABELS[lang][k]}
              </p>
              <p className="font-display text-xs sm:text-sm text-gold">+{focus.stats[k]}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 sm:mt-4 grid gap-1.5 sm:space-y-2">
          {(ABILITIES[focus.id] ?? []).map((a) => (
            <div key={a.id} className="rounded-xs bg-ink/50 px-2.5 py-1.5 sm:bg-transparent sm:p-0">
              <p className="text-xs sm:text-sm text-gold">
                ✦ {a.name[lang]}
                {a.dice ? ` • ${a.dice}` : ""}
              </p>
              <p className="text-[0.7rem] sm:text-xs leading-snug text-parchment/75">
                {a.desc[lang]}
              </p>
            </div>
          ))}
        </div>
      </aside>

      {/* Hero Selection Grid */}
      <div className="order-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:order-1">
        {heroes.map((h) => {
          const on = picked.includes(h.id);
          const order = picked.indexOf(h.id) + 1;
          const takenBy = taken[h.id];
          return (
            <Button
              variant="ghost"
              key={h.id}
              disabled={!!takenBy}
              onClick={() => {
                playClickSound();
                setFocusId(h.id);
                onToggle(h);
              }}
              onMouseEnter={() => setFocusId(h.id)}
              aria-pressed={on}
              aria-label={h.name}
              className={`pixel-frame group relative flex h-auto flex-col items-center whitespace-normal p-2.5 pt-5 sm:p-3 sm:pt-6 text-left transition-transform hover:-translate-y-1 hover:bg-transparent focus-visible:bg-transparent disabled:opacity-50 ${on ? "pixel-frame-gold" : ""}`}
            >
              <span className="absolute left-2 top-1.5 font-display text-[0.45rem] text-hp/90">
                ♥{h.maxHp}
              </span>
              {on && (
                <span className="absolute right-2 top-1.5 bg-gold px-1.5 py-0.5 font-display text-[0.5rem] text-primary-foreground">
                  P{order}
                </span>
              )}
              {takenBy && (
                <span className="absolute right-1.5 top-1.5 bg-secondary px-1.5 py-0.5 text-[0.6rem] text-parchment">
                  {t("taken", lang)}: {takenBy}
                </span>
              )}
              <img
                src={heroSprite(h.classKey, on ? "action" : "idle")}
                alt={h.name}
                width={240}
                height={280}
                className={`pixel relative h-20 sm:h-32 md:h-40 w-auto object-contain ${on ? "animate-bob" : "grayscale-[35%] group-hover:grayscale-0"}`}
              />
              <p className="relative mt-2 text-center text-xs sm:text-sm leading-tight text-parchment md:text-base font-medium">
                {h.name}
              </p>
              <p className="mt-0.5 line-clamp-1 text-center text-[0.65rem] text-muted-foreground">
                {h.role}
              </p>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function PartySelect({
  lang,
  onBack,
  onConfirm,
}: {
  lang: Lang;
  onBack: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (h: HeroDef) =>
    setPicked((p) =>
      p.includes(h.id) ? p.filter((x) => x !== h.id) : p.length >= 4 ? p : [...p, h.id],
    );
  const start: ReactNode = (
    <Button
      variant="pixel"
      className="w-full"
      disabled={!picked.length}
      onClick={() => {
        playClickSound();
        onConfirm(picked);
      }}
    >
      {picked.length ? `${t("startAct1", lang)} • ${picked.length}/4` : t("pick14", lang)}
    </Button>
  );
  return (
    <main className="min-h-dvh bg-night px-3 py-4 pb-24 sm:px-6 sm:py-8 sm:pb-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Button variant="pixelGhost" size="sm" onClick={onBack}>
            {t("back", lang)}
          </Button>
          <p className="font-display text-[0.55rem] sm:text-[0.6rem] text-gold">
            {t("party", lang)} {picked.length}/4
          </p>
        </div>
        <h1 className="title-glow mt-4 sm:mt-6 text-center text-base sm:text-lg md:text-2xl">
          {t("gatherParty", lang)}
        </h1>
        <div className="mt-4 sm:mt-8">
          <HeroPicker lang={lang} picked={picked} onToggle={toggle} />
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ink/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-md">{start}</div>
      </div>
    </main>
  );
}
