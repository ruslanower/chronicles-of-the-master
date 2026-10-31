import { useState } from "react";
import { Button } from "@/components/ui/button";
import { campaign, heroSprite, STAT_LABEL, type HeroDef, type Stats } from "../data";

export function PartySelect({ onBack, onConfirm }: { onBack: () => void; onConfirm: (heroes: HeroDef[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [focus, setFocus] = useState<HeroDef | undefined>(campaign.heroes[0]);
  if (!focus) return null;

  const toggle = (h: HeroDef) => {
    setFocus(h);
    setPicked((p) => (p.includes(h.id) ? p.filter((x) => x !== h.id) : p.length >= 4 ? p : [...p, h.id]));
  };

  return (
    <main className="min-h-dvh bg-night px-4 py-8 pb-28 md:px-10 lg:pb-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Button variant="pixelGhost" onClick={onBack}>
            ◀ Назад
          </Button>
          <p className="font-display text-[0.6rem] text-muted-foreground">ЗАГІН {picked.length}/4</p>
        </div>
        <h1 className="title-glow mt-8 text-center text-lg md:text-2xl">Зберіть загін повстанців</h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {campaign.heroes.map((h) => {
              const on = picked.includes(h.id);
              const order = picked.indexOf(h.id) + 1;
              return (
                <Button variant="ghost"
                  key={h.id}
                  onClick={() => toggle(h)}
                  onMouseEnter={() => setFocus(h)}
                  aria-pressed={on}
                  aria-label={h.name}
                  className={`pixel-frame group relative h-auto hover:bg-transparent focus-visible:bg-transparent whitespace-normal flex flex-col items-center p-4 pt-6 text-left transition-transform hover:-translate-y-1 ${on ? "pixel-frame-gold" : ""}`}
                >
                  {on && (
                    <span className="absolute right-2 top-2 bg-gold px-2 py-1 font-display text-[0.55rem] text-primary-foreground">
                      P{order}
                    </span>
                  )}
                  <img
                    src={heroSprite(h.classKey, on ? "action" : "idle")}
                    alt={h.name}
                    className={`pixel relative h-32 w-auto object-contain md:h-40 ${on ? "animate-bob" : "grayscale-[40%] group-hover:grayscale-0"}`}
                    width={240}
                    height={280}
                  />
                  <p className="relative mt-3 text-center text-base leading-tight text-parchment">{h.name}</p>
                </Button>
              );
            })}
          </div>

          <aside className="pixel-frame h-fit p-6">
            <div className="flex items-center gap-4">
              <img src={heroSprite(focus.classKey, "front")} alt="" className="pixel h-24 w-auto" width={240} height={280} />
              <div>
                <h2 className="font-display text-[0.7rem] leading-relaxed text-gold">
                  {focus.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{focus.role}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-2 text-center">
              {(Object.keys(STAT_LABEL) as (keyof Stats)[]).map((k) => (
                <div key={k} className="bg-ink p-2">
                  <p className="font-display text-[0.5rem] text-muted-foreground">{STAT_LABEL[k]}</p>
                  <p className="font-display text-sm text-gold">+{focus.stats[k]}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 font-display text-[0.5rem] text-hp">♥ HP {focus.maxHp}</p>
            <div className="mt-5 space-y-3">
              {focus.skills.map((s) => (
                <div key={s.name}>
                  <p className="text-base text-gold">✦ {s.name}</p>
                  <p className="text-sm leading-snug text-parchment/75">{s.desc}</p>
                </div>
              ))}
            </div>
            <Button variant="pixel"
              className="mt-8 w-full"
              disabled={!picked.length}
              onClick={() => onConfirm(campaign.heroes.filter((h) => picked.includes(h.id)).sort((a, b) => picked.indexOf(a.id) - picked.indexOf(b.id)))}
            >
              Почати Акт I
            </Button>
          </aside>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ink/95 p-3 backdrop-blur lg:hidden">
          <Button variant="pixel" className="w-full" disabled={!picked.length} onClick={() => onConfirm(campaign.heroes.filter((h) => picked.includes(h.id)).sort((a, b) => picked.indexOf(a.id) - picked.indexOf(b.id)))}>
            {picked.length ? `Почати Акт I • ${picked.length}/4` : "Оберіть 1–4 героїв"}
          </Button>
        </div>
      </div>
    </main>
  );
}
