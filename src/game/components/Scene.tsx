import { campaignFor, ROMAN, t, type Lang } from "../i18n";
import { heroSprite, locationSrc, sceneMood } from "../data";
import { ENCOUNTERS } from "../content";
import { currentActor, type CombatEvent, type GameState } from "../engine";
import { Particles } from "./Particles";

function Bar({ hp, max }: { hp: number; max: number }) {
  return (
    <div className="hp-bar w-9 sm:w-16 md:w-24">
      <span style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} />
    </div>
  );
}

function FloatingEvents({ events }: { events: CombatEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="pointer-events-none absolute -top-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-0.5">
      {events.map((ev) => {
        const color =
          ev.kind === "crit"
            ? "text-gold border-gold bg-ink/95"
            : ev.kind === "dmg"
              ? "text-hp border-hp/70 bg-ink/90"
              : ev.kind === "heal"
                ? "text-toxin border-toxin/70 bg-ink/90"
                : ev.kind === "status"
                  ? "text-astral border-astral/70 bg-ink/90"
                  : "text-muted-foreground border-border bg-ink/85";
        return (
          <span
            key={ev.id}
            className={`animate-combat-pop whitespace-nowrap rounded-xs border px-1.5 py-0.5 font-display text-[0.45rem] sm:text-[0.55rem] shadow-md ${color}`}
          >
            {ev.text}
          </span>
        );
      })}
    </div>
  );
}

export function Scene({ state, lang, busy }: { state: GameState; lang: Lang; busy: boolean }) {
  const act = campaignFor(lang).acts[state.actIndex];
  if (!act) return null;
  const actor = currentActor(state);
  const npcs = state.enemies.length ? [] : (ENCOUNTERS[act.actNumber]?.npcs ?? []);
  const events = state.lastEvents ?? [];
  const roll = state.lastRoll;

  return (
    <section className="game-scene relative overflow-hidden bg-ink select-none" aria-label={act.locationName}>
      <img src={locationSrc(act.bgType)} alt="" width={1376} height={768} className="pixel absolute inset-0 h-full w-full object-cover object-bottom md:object-center" />
      <div className="absolute inset-0 bg-fade-up opacity-60" />
      <Particles mood={sceneMood(act.bgType)} />

      <div className="relative z-10 flex items-start justify-between gap-2 px-3 pt-2 md:px-8 md:pt-4">
        <div className="min-w-0">
          <p className="font-display text-[0.45rem] sm:text-[0.55rem] text-gold">
            {lang === "en" ? "ACT" : "АКТ"} {ROMAN[act.actNumber]} / VIII{state.enemies.length ? ` • ${t("round", lang).toUpperCase()} ${state.round}` : ""}
          </p>
          <h2 className="mt-0.5 max-w-xl text-sm sm:text-lg md:text-2xl text-parchment leading-tight truncate">{act.locationName}</h2>
        </div>

        {roll && (
          <div key={`${roll.value}-${roll.total}-${state.log.length}`} className="flex items-center gap-2 rounded-xs border border-gold/60 bg-ink/90 px-2.5 py-1.5 backdrop-blur-xs">
            <div className="dice-face animate-dice flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center font-display text-[0.6rem] sm:text-xs text-gold">
              {roll.value}
            </div>
            <div className="text-left leading-tight">
              <p className="font-display text-[0.42rem] text-muted-foreground">D20 {roll.label}</p>
              <p className="font-display text-[0.55rem] sm:text-xs text-parchment">
                {roll.value}{roll.bonus >= 0 ? `+${roll.bonus}` : roll.bonus} = <span className="text-gold">{roll.total}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-2 left-0 z-10 flex w-[54%] items-end justify-evenly px-1 md:bottom-4 md:left-[2%] md:w-[50%] md:justify-center">
        {state.party.map((hero, i) => {
          const active = actor?.type === "hero" && actor.hero.id === hero.id;
          const unitEvents = events.filter((ev) => ev.targetId === hero.id);
          const tookHit = unitEvents.some((ev) => ev.kind === "dmg" || ev.kind === "crit");
          return (
            <div key={hero.id} className={`scene-unit relative flex flex-col items-center ${hero.hp <= 0 ? "opacity-40 grayscale" : ""} ${hero.status.hidden ? "opacity-50" : ""}`}>
              <FloatingEvents events={unitEvents} />
              <img
                src={heroSprite(hero.classKey, busy && active ? "action" : "idle")}
                alt={hero.name}
                width={240}
                height={280}
                className={`pixel scene-hero object-contain ${active ? "animate-bob drop-shadow-[0_0_10px_var(--gold)] scale-105" : ""} ${tookHit ? "animate-shake brightness-125" : ""}`}
              />
              <div className="-mt-1 flex flex-col items-center gap-0.5">
                <span className={`scene-name whitespace-nowrap font-display text-[0.4rem] sm:text-[0.5rem] md:text-[0.55rem] rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}>
                  P{i + 1}{hero.ownerName ? ` · ${hero.ownerName}` : ""}{active ? " ◀" : ""}
                </span>
                <Bar hp={hero.hp} max={hero.maxHp} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-2 right-0 z-10 flex w-[46%] items-end justify-evenly px-1 md:bottom-4 md:right-[2%] md:w-[48%] md:justify-center">
        {state.enemies.map((e) => {
          const active = actor?.type === "enemy" && actor.enemy.id === e.id;
          const unitEvents = events.filter((ev) => ev.targetId === e.id);
          const tookHit = unitEvents.some((ev) => ev.kind === "dmg" || ev.kind === "crit");
          return (
            <div key={e.id} className={`scene-unit relative flex flex-col items-center ${e.hp <= 0 ? "opacity-0 transition-opacity duration-700" : ""} ${e.status.stunned ? "grayscale" : ""}`}>
              <FloatingEvents events={unitEvents} />
              <img
                src={e.sprite}
                alt={e.name}
                width={240}
                height={280}
                className={`pixel scene-enemy object-contain ${active || tookHit ? "animate-shake drop-shadow-[0_0_8px_var(--hp)]" : ""} ${tookHit ? "brightness-125" : ""}`}
              />
              <div className="-mt-1 flex flex-col items-center gap-0.5">
                <span className={`scene-name whitespace-nowrap text-[0.45rem] sm:text-[0.6rem] md:text-xs rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}>
                  {e.name}
                </span>
                <Bar hp={e.hp} max={e.maxHp} />
              </div>
            </div>
          );
        })}
        {npcs.map((n) => (
          <div key={n.sprite} className="scene-unit flex flex-col items-center">
            <img src={n.sprite} alt={n.name[lang]} width={240} height={280} className="pixel scene-enemy object-contain" />
            <span className="scene-name -mt-1 whitespace-nowrap text-[0.45rem] sm:text-[0.6rem] text-parchment md:text-xs rounded-xs">{n.name[lang]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
