import { campaign, entitySprite, heroSprite, locationSrc, ROMAN, sceneMood } from "../data";
import type { GameState } from "../rules";
import { Particles } from "./Particles";

export function GameScene({ state, busy }: { state: GameState; busy: boolean }) {
  const act = campaign.acts[state.actIndex];
  if (!act) return null;
  return (
    <section className="game-scene relative overflow-hidden bg-ink" aria-label={act.locationName}>
      <img src={locationSrc(act.bgType)} alt={act.locationName} width={1376} height={768} className="pixel absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-fade-up opacity-70" />
      <Particles mood={sceneMood(act.bgType)} />
      <div className="relative z-10 px-5 pt-5 md:px-8">
        <p className="font-display text-[0.55rem] text-gold">АКТ {ROMAN[act.actNumber]} / VIII</p>
        <h2 className="mt-3 max-w-xl text-xl text-parchment md:text-2xl">{act.locationName}</h2>
      </div>
      <div className="scene-party absolute bottom-10 left-[3%] z-10 flex w-[45%] items-end justify-center">
        {state.party.map((hero, i) => <div key={hero.id} className={`relative flex min-w-0 flex-1 flex-col items-center ${hero.hp <= 0 ? "opacity-40 grayscale" : i === state.turn ? "animate-bob" : ""}`}>
          <img src={heroSprite(hero.classKey, busy && i === state.turn ? "action" : "idle")} alt={hero.name} width={240} height={280} className="pixel scene-sprite object-contain" />
          <span className={`mt-1 font-display text-[0.5rem] ${i === state.turn ? "text-gold" : "text-parchment"}`}>P{i + 1}{i === state.turn ? " ◀" : ""}</span>
        </div>)}
      </div>
      <div className="absolute bottom-10 right-[4%] z-10 flex w-[38%] items-end justify-center gap-2 md:gap-6">
        {act.rightEntities.map((entity, i) => {
          const sprite = entitySprite(act.actNumber, i);
          return <div key={entity.name} className="flex min-w-0 flex-1 flex-col items-center">
            {sprite && <img src={sprite} alt={entity.name} width={240} height={280} className="pixel scene-sprite object-contain" />}
            <span className="scene-name mt-2 text-center text-xs text-parchment md:text-sm">{entity.name}</span>
          </div>;
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 border-t border-gold-deep/40 bg-ink/90 px-5 py-2 text-sm text-parchment md:px-8">✦ {act.objective}</div>
    </section>
  );
}