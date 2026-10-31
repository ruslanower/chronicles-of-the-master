import keyArt from "@/assets/key-art.jpg";
import { Button } from "@/components/ui/button";
import { campaign } from "../data";
import { Particles } from "./Particles";

export function TitleScreen({ onStart, onContinue }: { onStart: () => void; onContinue?: (() => void) | undefined }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <img
        src={keyArt}
        alt="Замок узурпатора під Чорною Зіркою"
        width={1920}
        height={1088}
        className="pixel absolute inset-0 h-full w-full animate-pan object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-fade-up" />
      <Particles mood="rain" />
      <div className="scanlines absolute inset-0" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-end px-6 pb-16 text-center md:justify-center md:pb-0">
        <p className="mb-6 font-display text-[0.55rem] text-parchment/80 md:text-xs">
          ТІНЬОВИЙ ЗАКОЛОТ • РОЗДІЛ ПЕРШИЙ
        </p>
        <h1 className="title-glow text-2xl leading-relaxed md:text-5xl md:leading-[1.4]">
          Хроніки Майстра
        </h1>
        <h2 className="mt-3 font-display text-xs text-astral drop-shadow md:text-base" style={{ textShadow: "2px 2px 0 var(--ink)" }}>
          Корона Чорної Зірки
        </h2>
        <p className="mt-8 max-w-xl text-lg leading-snug text-parchment/90 md:text-xl">{campaign.subtitle.split(".")[0]}.</p>

        <div className="mt-10 flex flex-col gap-5 sm:flex-row">
          <Button variant="pixel" onClick={onStart}>
            ▶ Нова пригода
          </Button>
          {onContinue && (
            <Button variant="pixelGhost" onClick={onContinue}>
              Продовжити
            </Button>
          )}
        </div>

        <div className="mt-10 flex gap-6 font-display text-[0.5rem] text-muted-foreground md:text-[0.6rem]">
          <span>8 АКТІВ</span>
          <span>•</span>
          <span>1–4 ГЕРОЇ</span>
          <span>•</span>
          <span>{campaign.duration}</span>
        </div>
        <p className="mt-6 animate-blink font-display text-[0.5rem] text-gold">ВАШ ВИБІР — ВАША ІСТОРІЯ</p>
      </div>
    </main>
  );
}
