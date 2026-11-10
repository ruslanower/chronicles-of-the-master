import { useEffect, useRef, useState } from "react";
import { Gauge, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROLOGUE, prologueAudio } from "../prologue";
import { t, type Lang } from "../i18n";

const SPEEDS = [1.0, 1.25, 1.5] as const;

/** Illustrated cinematic intro with typed text and the Master's voice. */
export function Prologue({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1.25); // Default to brisk, engaging 1.25x
  const audio = useRef<HTMLAudioElement | null>(null);
  const slide = PROLOGUE[i]!;
  const text = slide.text[lang];
  const last = i === PROLOGUE.length - 1;

  useEffect(() => {
    setChars(0);
    const stepMs = Math.max(14, Math.round(28 / speed));
    const id = setInterval(() => setChars((c) => (c >= text.length ? c : c + 1)), stepMs);
    return () => clearInterval(id);
  }, [text, speed]);

  useEffect(() => {
    const a = new Audio(prologueAudio(lang, i));
    a.muted = muted;
    a.playbackRate = speed;
    audio.current = a;
    a.onended = () => setTimeout(() => (last ? undefined : setI((x) => Math.min(x + 1, PROLOGUE.length - 1))), 300);
    void a.play().catch(() => undefined);
    return () => {
      a.pause();
      a.onended = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, lang]);

  useEffect(() => {
    if (audio.current) {
      audio.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    if (audio.current) audio.current.muted = muted;
  }, [muted]);

  function toggleSpeed() {
    const curIdx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const nextIdx = (curIdx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx]!);
  }

  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-ink select-none">
      {PROLOGUE.map((s, k) => (
        <img
          key={s.image}
          src={s.image}
          alt=""
          width={1376}
          height={768}
          className={`pixel absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${k === i ? "animate-pan opacity-85" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-fade-up opacity-90" />
      <div className="scanlines absolute inset-0" />

      {/* Top action controls */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 md:right-6 md:top-6 md:gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-2.5 font-display text-[0.6rem] text-gold border-border bg-ink/80 backdrop-blur-sm"
          onClick={toggleSpeed}
          title={lang === "en" ? "Voiceover speed" : "Швидкість озвучки"}
        >
          <Gauge className="mr-1 h-3.5 w-3.5 text-gold" />
          {speed}x
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 border-border bg-ink/80 backdrop-blur-sm"
          aria-label={t("sound", lang)}
          aria-pressed={!muted}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-gold" />}
        </Button>
        <Button variant="pixelGhost" size="sm" className="h-9 text-[0.65rem] px-3 bg-ink/80 backdrop-blur-sm" onClick={onDone}>
          {t("skip", lang)} ▶▶
        </Button>
      </div>

      {/* Slide text card: fully optimized for mobile and desktop */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-8 md:px-6 md:pb-16">
        <div className="pixel-frame pixel-frame-gold bg-ink/90 backdrop-blur-md p-4 sm:p-6 md:p-8">
          <div className="mb-3 md:mb-5 flex items-center justify-between gap-2">
            <div className="flex flex-1 gap-1.5">
              {PROLOGUE.map((_, k) => (
                <span key={k} className={`h-1.5 flex-1 transition-colors ${k <= i ? "bg-gold" : "bg-secondary"}`} />
              ))}
            </div>
            <span className="font-display text-[0.55rem] text-muted-foreground ml-2">
              {i + 1}/{PROLOGUE.length}
            </span>
          </div>

          <p
            className="story-copy min-h-24 sm:min-h-32 text-base sm:text-lg md:text-2xl leading-relaxed text-parchment"
            style={{ textShadow: "1px 1px 0 var(--ink)" }}
            aria-live="polite"
          >
            {text.slice(0, chars)}
            <span className="animate-blink text-gold">▌</span>
          </p>

          <div className="mt-4 md:mt-6 flex items-center justify-between gap-3">
            <div className="text-[0.65rem] text-muted-foreground font-display">
              {i > 0 && (
                <button
                  type="button"
                  className="hover:text-gold transition-colors py-1 px-2"
                  onClick={() => setI((prev) => Math.max(0, prev - 1))}
                >
                  ← {lang === "en" ? "Back" : "Назад"}
                </button>
              )}
            </div>
            <Button variant="pixel" className="text-xs sm:text-sm px-5 py-2.5 h-auto" onClick={() => (last ? onDone() : setI(i + 1))}>
              {last ? t("begin", lang) : t("next", lang)} →
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
