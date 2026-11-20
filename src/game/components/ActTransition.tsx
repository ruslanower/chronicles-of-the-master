import { useEffect, useRef, useState } from "react";
import { Gauge, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { heroSprite, locationMobileSrc, locationSrc, sceneMood } from "../data";
import type { HeroState } from "../engine";
import { t, type Lang } from "../i18n";
import { getInterludeForAct, interludeAudioSrc } from "../interludes";
import { playClickSound, setMusicMood } from "../sound";
import { Particles } from "./Particles";

const SPEEDS = [1.0, 1.25, 1.5] as const;

/**
 * Animated interlude scene between acts with Master's voiceover,
 * marching hero silhouettes, and strategic party choices with clear consequences.
 */
export function ActTransition({
  targetActIndex,
  party,
  lang,
  busy,
  canChoose = true,
  onConfirm,
  onCancel,
}: {
  targetActIndex: number;
  party: HeroState[];
  lang: Lang;
  busy?: boolean;
  canChoose?: boolean;
  onConfirm: (choiceId?: string) => void;
  onCancel?: () => void;
}) {
  const interlude = getInterludeForAct(targetActIndex);
  const [chars, setChars] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1.15);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => interlude?.choices[0]?.id);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const en = lang === "en";

  const narration = interlude?.narration[lang] ?? "";

  useEffect(() => {
    setMusicMood("none");
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    setChars(0);
    if (!narration) return;
    const stepMs = Math.max(14, Math.round(28 / speed));
    const id = setInterval(() => setChars((c) => (c >= narration.length ? c : c + 1)), stepMs);
    return () => clearInterval(id);
  }, [narration, speed]);

  useEffect(() => {
    if (!interlude) return;
    const speakFallback = () => {
      if (muted || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(interlude.narration[lang]);
        utter.lang = lang === "en" ? "en-US" : "uk-UA";
        utter.rate = speed;
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore speech synthesis errors
      }
    };

    const a = new Audio(interludeAudioSrc(lang, targetActIndex));
    a.muted = muted;
    a.preservesPitch = true;
    a.playbackRate = speed;
    audioRef.current = a;
    a.onerror = () => speakFallback();
    void a.play().catch(() => speakFallback());

    return () => {
      a.pause();
      a.onerror = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetActIndex, lang]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.preservesPitch = true;
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
    if (muted && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [muted]);

  if (!interlude) {
    onConfirm(undefined);
    return null;
  }

  function toggleSpeed() {
    const curIdx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const nextIdx = (curIdx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx]!);
  }

  const chosenObj = interlude.choices.find((c) => c.id === selectedId) ?? interlude.choices[0];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-ink p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={interlude.title[lang]}
    >
      {/* Animated background location */}
      <picture className="pointer-events-none fixed inset-0 block h-full w-full opacity-45">
        <source media="(max-width: 767px)" srcSet={locationMobileSrc(interlude.bgType)} />
        <img
          src={locationSrc(interlude.bgType)}
          alt=""
          className="pixel h-full w-full animate-pan object-cover object-center"
        />
      </picture>
      <div className="pointer-events-none fixed inset-0 bg-fade-up opacity-90" />
      <Particles mood={sceneMood(interlude.bgType)} />

      {/* Top Controls */}
      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between gap-2">
        <span className="font-display text-[0.55rem] sm:text-xs text-gold">
          ✦ {interlude.title[lang]}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 font-display text-[0.55rem] text-gold border-border bg-ink/85"
            onClick={toggleSpeed}
          >
            <Gauge className="mr-1 h-3.5 w-3.5 text-gold" />
            {speed}x
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border bg-ink/85"
            aria-label={t("sound", lang)}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-hp" />
            ) : (
              <Volume2 className="h-4 w-4 text-gold" />
            )}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 mx-auto my-auto flex w-full max-w-4xl flex-col gap-3 py-3">
        {/* Animated Scene Preview with Marching Heroes */}
        <div className="pixel-frame relative aspect-[16/7] sm:aspect-[21/7] w-full overflow-hidden bg-ink">
          <picture className="absolute inset-0 block h-full w-full">
            <source media="(max-width: 767px)" srcSet={locationMobileSrc(interlude.bgType)} />
            <img
              src={locationSrc(interlude.bgType)}
              alt=""
              className="pixel h-full w-full animate-pan object-cover object-center"
            />
          </picture>
          <div className="absolute inset-0 bg-fade-up opacity-65" />
          <div className="absolute bottom-2 left-4 flex items-end gap-1 sm:gap-3">
            {party.map((h, idx) => (
              <img
                key={h.id}
                src={heroSprite(h.classKey, "action")}
                alt={h.name}
                style={{ animationDelay: `${idx * 180}ms` }}
                className="pixel animate-bob h-16 sm:h-24 md:h-28 w-auto object-contain drop-shadow-[0_0_8px_var(--gold)]"
              />
            ))}
          </div>
          <div className="absolute right-3 top-2 rounded-xs border border-gold/50 bg-ink/85 px-2 py-1 font-display text-[0.45rem] sm:text-[0.55rem] text-gold">
            {en ? "NEXT SCENE" : "НАСТУПНА СЦЕНА"}
          </div>
        </div>

        {/* Master's Voiceover Narrative */}
        <div className="pixel-frame pixel-frame-gold bg-ink/92 p-3.5 sm:p-5">
          <p className="mb-1.5 font-display text-[0.52rem] text-gold">
            👑 {en ? "MASTER TELLS WHAT AWAITS:" : "МАЙСТЕР РОЗПОВІДАЄ, ЩО ЧЕКАЄ ПОПЕРЕДУ:"}
          </p>
          <p className="story-copy text-sm sm:text-base md:text-lg leading-relaxed text-parchment">
            {narration.slice(0, chars)}
            {chars < narration.length && <span className="animate-blink text-gold">▌</span>}
          </p>
        </div>

        {/* Interactive Choice Cards with Consequences Explanation */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 font-display text-[0.55rem] sm:text-[0.6rem] text-gold">
            <Sparkles className="h-3.5 w-3.5 text-astral" />
            {en
              ? "PARTY CHOICE — PICK YOUR APPROACH (CONSEQUENCES EXPLAINED):"
              : "ВИБІР ЗАГОНУ — ОБЕРІТЬ ШЛЯХ (З ПОЯСНЕННЯМ НАСЛІДКІВ):"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {interlude.choices.map((c, idx) => {
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!canChoose || busy}
                  onClick={() => {
                    playClickSound();
                    setSelectedId(c.id);
                  }}
                  style={{ animationDelay: `${idx * 120}ms` }}
                  className={`pixel-frame flex flex-col justify-between gap-2 p-3 sm:p-4 text-left transition-all duration-200 ${active ? "pixel-frame-gold -translate-y-0.5 bg-card" : "bg-ink/85 opacity-85 hover:opacity-100"}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[0.6rem] sm:text-xs text-gold">
                        {c.icon} {c.title[lang]}
                      </span>
                      {active && (
                        <span className="rounded-xs bg-gold px-1.5 py-0.5 font-display text-[0.45rem] text-ink">
                          ✓ {en ? "CHOSEN" : "ОБРАНО"}
                        </span>
                      )}
                    </div>
                    <p className="story-copy mt-2 text-xs sm:text-sm leading-snug text-parchment/90">
                      <span className="text-astral font-medium">
                        {en ? "What happens: " : "Що буде: "}
                      </span>
                      {c.consequence[lang]}
                    </p>
                  </div>
                  <div className="pt-1">
                    <span className="inline-block rounded-xs border border-gold/40 bg-gold/10 px-2 py-0.5 font-display text-[0.48rem] text-gold">
                      {c.badge[lang]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between gap-3 pt-2">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            ← {t("back", lang)}
          </Button>
        ) : (
          <div />
        )}
        <Button
          variant="pixel"
          disabled={!canChoose || busy}
          onClick={() => {
            playClickSound();
            onConfirm(chosenObj?.id);
          }}
          className="px-5 py-2.5 text-xs sm:text-sm"
        >
          {en ? `Proceed with "${chosenObj?.title[lang] ?? ""}" →` : `Рушати далі →`}
        </Button>
      </footer>
    </div>
  );
}
