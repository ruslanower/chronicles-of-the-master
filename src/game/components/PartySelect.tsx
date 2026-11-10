import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { heroSprite, type HeroDef, type Stats } from "../data";
import { ABILITIES } from "../content";
import { campaignFor, STAT_LABELS, t, type Lang } from "../i18n";

/** Hero grid + detail card. Used by solo party select (up to 4) and the online lobby (1 per player). */
export function HeroPicker({ lang, picked, taken = {}, onToggle }: { lang: Lang; picked: string[]; taken?: Record<string, string>; onToggle: (h: HeroDef) => void }) {
  const heroes = campaignFor(lang).heroes;
  const [focusId, setFocusId] = useState(heroes[0]!.id);
  const focus = heroes.find((h) => h.id === focusId) ?? heroes[0]!;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6">
        {heroes.map((h) => {
          const on = picked.includes(h.id);
          const order = picked.indexOf(h.id) + 1;
          const takenBy = taken[h.id];
          return (
            <Button variant="ghost" key={h.id} disabled={!!takenBy} onClick={() => { setFocusId(h.id); onToggle(h); }} onMouseEnter={() => setFocusId(h.id)} aria-pressed={on} aria-label={h.name}
              className={`pixel-frame group relative flex h-auto flex-col items-center whitespace-normal p-3 pt-6 text-left transition-transform hover:-translate-y-1 hover:bg-transparent focus-visible:bg-transparent disabled:opacity-50 ${on ? "pixel-frame-gold" : ""}`}>
              {on && <span className="absolute right-2 top-2 bg-gold px-2 py-1 font-display text-[0.55rem] text-primary-foreground">P{order}</span>}
              {takenBy && <span className="absolute left-2 top-2 bg-secondary px-2 py-1 text-[0.65rem] text-parchment">{t("taken", lang)}: {takenBy}</span>}
              <img src={heroSprite(h.classKey, on ? "action" : "idle")} alt={h.name} width={240} height={280} className={`pixel relative h-24 sm:h-32 md:h-40 w-auto object-contain ${on ? "animate-bob" : "grayscale-[40%] group-hover:grayscale-0"}`} />
              <p className="relative mt-3 text-center text-sm leading-tight text-parchment md:text-base">{h.name}</p>
            </Button>
          );
        })}
      </div>
      <aside className="pixel-frame h-fit p-5">
        <div className="flex items-center gap-4">
          <img src={heroSprite(focus.classKey, "front")} alt="" className="pixel h-24 w-auto" width={240} height={280} />
          <div><h2 className="font-display text-[0.65rem] leading-relaxed text-gold">{focus.name}</h2><p className="mt-1 text-sm text-muted-foreground">{focus.role}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {(Object.keys(STAT_LABELS[lang]) as (keyof Stats)[]).map((k) => <div key={k} className="bg-ink p-2"><p className="font-display text-[0.5rem] text-muted-foreground">{STAT_LABELS[lang][k]}</p><p className="font-display text-sm text-gold">+{focus.stats[k]}</p></div>)}
        </div>
        <p className="mt-3 font-display text-[0.5rem] text-hp">♥ HP {focus.maxHp}</p>
        <div className="mt-4 space-y-2">
          {(ABILITIES[focus.id] ?? []).map((a) => <div key={a.id}><p className="text-sm text-gold">✦ {a.name[lang]}{a.dice ? ` • ${a.dice}` : ""}</p><p className="text-xs leading-snug text-parchment/75">{a.desc[lang]}</p></div>)}
        </div>
      </aside>
    </div>
  );
}

export function PartySelect({ lang, onBack, onConfirm }: { lang: Lang; onBack: () => void; onConfirm: (ids: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (h: HeroDef) => setPicked((p) => (p.includes(h.id) ? p.filter((x) => x !== h.id) : p.length >= 4 ? p : [...p, h.id]));
  const start: ReactNode = (
    <Button variant="pixel" className="w-full" disabled={!picked.length} onClick={() => onConfirm(picked)}>
      {picked.length ? `${t("startAct1", lang)} • ${picked.length}/4` : t("pick14", lang)}
    </Button>
  );
  return (
    <main className="min-h-dvh bg-night px-4 py-8 pb-28 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <Button variant="pixelGhost" onClick={onBack}>{t("back", lang)}</Button>
          <p className="font-display text-[0.6rem] text-muted-foreground">{t("party", lang)} {picked.length}/4</p>
        </div>
        <h1 className="title-glow mt-8 text-center text-lg md:text-2xl">{t("gatherParty", lang)}</h1>
        <div className="mt-10"><HeroPicker lang={lang} picked={picked} onToggle={toggle} /></div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-ink/95 p-3 backdrop-blur"><div className="mx-auto max-w-md">{start}</div></div>
    </main>
  );
}
