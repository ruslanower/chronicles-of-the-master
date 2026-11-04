import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROLOGUE, prologueAudio } from "../prologue";
import { t, type Lang } from "../i18n";

/** ~1 minute illustrated intro with typed text and the Master's voice. */
export function Prologue({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);
  const [muted, setMuted] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const slide = PROLOGUE[i]!;
  const text = slide.text[lang];
  const last = i === PROLOGUE.length - 1;

  useEffect(() => {
    setChars(0);
    const id = setInterval(() => setChars((c) => (c >= text.length ? c : c + 1)), 45);
    return () => clearInterval(id);
  }, [text]);

  useEffect(() => {
    const a = new Audio(prologueAudio(lang, i));
    a.muted = muted;
    audio.current = a;
    a.onended = () => setTimeout(() => (last ? undefined : setI((x) => Math.min(x + 1, PROLOGUE.length - 1))), 900);
    void a.play().catch(() => undefined);
    return () => { a.pause(); a.onended = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, lang]);

  useEffect(() => { if (audio.current) audio.current.muted = muted; }, [muted]);

  return (
    <main className="relative flex min-h-dvh flex-col justify-end overflow-hidden bg-ink">
      {PROLOGUE.map((s, k) => <img key={s.image} src={s.image} alt="" width={1376} height={768} className={`pixel absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${k === i ? "animate-pan opacity-80" : "opacity-0"}`} />)}
      <div className="absolute inset-0 bg-fade-up" />
      <div className="scanlines absolute inset-0" />
      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <Button variant="outline" size="icon" aria-label={t("sound", lang)} aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        <Button variant="pixelGhost" onClick={onDone}>{t("skip", lang)} ▶▶</Button>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-12 md:pb-20">
        <div className="mb-5 flex gap-1.5">{PROLOGUE.map((_, k) => <span key={k} className={`h-1 flex-1 ${k <= i ? "bg-gold" : "bg-secondary"}`} />)}</div>
        <p className="story-copy min-h-40 text-xl leading-relaxed text-parchment md:text-2xl" style={{ textShadow: "2px 2px 0 var(--ink)" }} aria-live="polite">
          {text.slice(0, chars)}<span className="animate-blink text-gold">▌</span>
        </p>
        <div className="mt-6 flex justify-end">
          <Button variant="pixel" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? t("begin", lang) : t("next", lang)} →</Button>
        </div>
      </div>
    </main>
  );
}
