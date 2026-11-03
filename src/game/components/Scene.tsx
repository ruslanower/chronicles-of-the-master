import { campaignFor, ROMAN, t, type Lang } from "../i18n";
import { heroSprite, locationSrc, sceneMood } from "../data";
import { ENCOUNTERS } from "../content";
import { currentActor, type GameState } from "../engine";
import { Particles } from "./Particles";

function Bar({ hp, max }: { hp: number; max: number }) {
  return <div className="hp-bar w-16 md:w-24"><span style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} /></div>;
}

export function Scene({ state, lang, busy }: { state: GameState; lang: Lang; busy: boolean }) {
  const act = campaignFor(lang).acts[state.actIndex];
  if (!act) return null;
  const actor = currentActor(state);
  const npcs = state.enemies.length ? [] : (ENCOUNTERS[act.actNumber]?.npcs ?? []);
  return (
    <section className="game-scene relative overflow-hidden bg-ink" aria-label={act.locationName}>
      <img src={locationSrc(act.bgType)} alt="" width={1376} height={768} className="pixel absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-fade-up opacity-60" />
      <Particles mood={sceneMood(act.bgType)} />
      <div className="relative z-10 px-4 pt-4 md:px-8 md:pt-5">
        <p className="font-display text-[0.55rem] text-gold">{lang === "en" ? "ACT" : "АКТ"} {ROMAN[act.actNumber]} / VIII{state.enemies.length ? ` • ${t("round", lang).toUpperCase()} ${state.round}` : ""}</p>
        <h2 className="mt-2 max-w-xl text-lg text-parchment md:text-2xl">{act.locationName}</h2>
      </div>

      <div className="absolute bottom-3 left-0 z-10 flex w-[56%] items-end justify-center md:bottom-5 md:left-[2%] md:w-[52%]">
        {state.party.map((hero, i) => {
          const active = actor?.type === "hero" && actor.hero.id === hero.id;
          return (
            <div key={hero.id} className={`scene-unit relative flex flex-col items-center ${hero.hp <= 0 ? "opacity-40 grayscale" : ""} ${hero.status.hidden ? "opacity-50" : ""}`}>
              <img src={heroSprite(hero.classKey, busy && active ? "action" : "idle")} alt={hero.name} width={240} height={280} className={`pixel scene-hero object-contain ${active ? "animate-bob drop-shadow-[0_0_10px_var(--gold)]" : ""}`} />
              <div className="-mt-1 flex flex-col items-center gap-1">
                <span className={`scene-name whitespace-nowrap font-display text-[0.45rem] md:text-[0.55rem] ${active ? "text-gold" : "text-parchment"}`}>P{i + 1}{hero.ownerName ? ` · ${hero.ownerName}` : ""}{active ? " ◀" : ""}</span>
                <Bar hp={hero.hp} max={hero.maxHp} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-3 right-0 z-10 flex w-[44%] items-end justify-center md:bottom-5 md:right-[3%] md:w-[42%]">
        {state.enemies.map((e) => {
          const active = actor?.type === "enemy" && actor.enemy.id === e.id;
          return (
            <div key={e.id} className={`scene-unit relative flex flex-col items-center ${e.hp <= 0 ? "opacity-0 transition-opacity duration-700" : ""} ${e.status.stunned ? "grayscale" : ""}`}>
              <img src={e.sprite} alt={e.name} width={240} height={280} className={`pixel scene-enemy object-contain ${active ? "animate-shake" : ""}`} />
              <div className="-mt-1 flex flex-col items-center gap-1">
                <span className={`scene-name whitespace-nowrap text-[0.6rem] md:text-xs ${active ? "text-gold" : "text-parchment"}`}>{e.name}</span>
                <Bar hp={e.hp} max={e.maxHp} />
              </div>
            </div>
          );
        })}
        {npcs.map((n) => (
          <div key={n.sprite} className="scene-unit flex flex-col items-center">
            <img src={n.sprite} alt={n.name[lang]} width={240} height={280} className="pixel scene-enemy object-contain" />
            <span className="scene-name -mt-1 whitespace-nowrap text-[0.6rem] text-parchment md:text-xs">{n.name[lang]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
