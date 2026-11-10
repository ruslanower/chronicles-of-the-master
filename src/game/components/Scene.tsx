import { campaignFor, ROMAN, t, type Lang } from "../i18n";
import { heroSprite, locationSrc, sceneMood } from "../data";
import { ENCOUNTERS } from "../content";
import { currentActor, type GameState } from "../engine";
import { Particles } from "./Particles";

function Bar({ hp, max }: { hp: number; max: number }) {
  return <div className="hp-bar w-10 sm:w-16 md:w-24"><span style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} /></div>;
}

export function Scene({ state, lang, busy }: { state: GameState; lang: Lang; busy: boolean }) {
  const act = campaignFor(lang).acts[state.actIndex];
  if (!act) return null;
  const actor = currentActor(state);
  const npcs = state.enemies.length ? [] : (ENCOUNTERS[act.actNumber]?.npcs ?? []);
  return (
    <section className="game-scene relative overflow-hidden bg-ink select-none" aria-label={act.locationName}>
      <img src={locationSrc(act.bgType)} alt="" width={1376} height={768} className="pixel absolute inset-0 h-full w-full object-cover object-bottom md:object-center" />
      <div className="absolute inset-0 bg-fade-up opacity-60" />
      <Particles mood={sceneMood(act.bgType)} />
      <div className="relative z-10 px-3 pt-2 md:px-8 md:pt-4">
        <p className="font-display text-[0.45rem] sm:text-[0.55rem] text-gold">
          {lang === "en" ? "ACT" : "АКТ"} {ROMAN[act.actNumber]} / VIII{state.enemies.length ? ` • ${t("round", lang).toUpperCase()} ${state.round}` : ""}
        </p>
        <h2 className="mt-0.5 max-w-xl text-sm sm:text-lg md:text-2xl text-parchment leading-tight truncate">{act.locationName}</h2>
      </div>

      <div className="absolute bottom-2 left-0 z-10 flex w-[52%] items-end justify-center md:bottom-4 md:left-[2%] md:w-[50%]">
        {state.party.map((hero, i) => {
          const active = actor?.type === "hero" && actor.hero.id === hero.id;
          return (
            <div key={hero.id} className={`scene-unit relative flex flex-col items-center ${hero.hp <= 0 ? "opacity-40 grayscale" : ""} ${hero.status.hidden ? "opacity-50" : ""}`}>
              <img src={heroSprite(hero.classKey, busy && active ? "action" : "idle")} alt={hero.name} width={240} height={280} className={`pixel scene-hero object-contain ${active ? "animate-bob drop-shadow-[0_0_10px_var(--gold)] scale-105" : ""}`} />
              <div className="-mt-1 flex flex-col items-center gap-0.5">
                <span className={`scene-name whitespace-nowrap font-display text-[0.4rem] sm:text-[0.5rem] md:text-[0.55rem] rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}>P{i + 1}{hero.ownerName ? ` · ${hero.ownerName}` : ""}{active ? " ◀" : ""}</span>
                <Bar hp={hero.hp} max={hero.maxHp} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-2 right-0 z-10 flex w-[48%] items-end justify-center md:bottom-4 md:right-[2%] md:w-[48%]">
        {state.enemies.map((e) => {
          const active = actor?.type === "enemy" && actor.enemy.id === e.id;
          return (
            <div key={e.id} className={`scene-unit relative flex flex-col items-center ${e.hp <= 0 ? "opacity-0 transition-opacity duration-700" : ""} ${e.status.stunned ? "grayscale" : ""}`}>
              <img src={e.sprite} alt={e.name} width={240} height={280} className={`pixel scene-enemy object-contain ${active ? "animate-shake drop-shadow-[0_0_8px_var(--hp)]" : ""}`} />
              <div className="-mt-1 flex flex-col items-center gap-0.5">
                <span className={`scene-name whitespace-nowrap text-[0.5rem] sm:text-[0.6rem] md:text-xs rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}>{e.name}</span>
                <Bar hp={e.hp} max={e.maxHp} />
              </div>
            </div>
          );
        })}
        {npcs.map((n) => (
          <div key={n.sprite} className="scene-unit flex flex-col items-center">
            <img src={n.sprite} alt={n.name[lang]} width={240} height={280} className="pixel scene-enemy object-contain" />
            <span className="scene-name -mt-1 whitespace-nowrap text-[0.5rem] sm:text-[0.6rem] text-parchment md:text-xs rounded-xs">{n.name[lang]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
