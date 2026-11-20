import { campaignFor, ROMAN, t, type Lang } from "../i18n";
import { heroSprite, locationMobileSrc, locationSrc, sceneMood } from "../data";
import { ENCOUNTERS } from "../content";
import { currentActor, enemyAC, type CombatEvent, type GameState } from "../engine";
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
    <div className="pointer-events-none absolute -top-7 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-0.5">
      {events.map((ev) => {
        const color =
          ev.kind === "crit"
            ? "text-gold border-gold bg-ink/95 shadow-[0_0_12px_var(--gold)]"
            : ev.kind === "dmg"
              ? "text-hp border-hp bg-ink/95 shadow-[0_0_10px_var(--hp)]"
              : ev.kind === "heal"
                ? "text-toxin border-toxin/80 bg-ink/95"
                : ev.kind === "status"
                  ? "text-astral border-astral/80 bg-ink/95"
                  : "text-parchment border-astral/70 bg-ink/95";
        return (
          <span
            key={ev.id}
            className={`animate-combat-pop whitespace-nowrap rounded-xs border px-2 py-0.5 font-display text-[0.5rem] sm:text-[0.62rem] shadow-md ${color}`}
          >
            {ev.kind === "crit"
              ? `💥 ${ev.text}`
              : ev.kind === "dmg"
                ? `⚔️ ${ev.text}`
                : ev.kind === "miss"
                  ? `💨 ${ev.text}`
                  : ev.text}
          </span>
        );
      })}
    </div>
  );
}

/** Animated sword-slash & spark impact effect when an attack hits or crits a unit. */
function HitBurstVfx({ crit, eventKey }: { crit: boolean; eventKey: string }) {
  return (
    <div
      key={eventKey}
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        className="animate-slash-burst h-24 w-24 sm:h-36 sm:w-36 md:h-44 md:w-44 overflow-visible"
      >
        {/* Radial impact flash */}
        <circle
          cx="60"
          cy="60"
          r={crit ? "44" : "34"}
          fill="none"
          stroke={crit ? "var(--gold)" : "var(--hp)"}
          strokeWidth={crit ? "4" : "3"}
          strokeDasharray="10 6"
          opacity="0.85"
        />
        {/* Primary diagonal slash */}
        <path
          d="M 14 102 L 106 18"
          stroke={crit ? "var(--gold)" : "var(--hp)"}
          strokeWidth={crit ? "8" : "6"}
          strokeLinecap="round"
        />
        <path
          d="M 18 98 L 102 22"
          stroke="#fff7d6"
          strokeWidth={crit ? "3.5" : "2.5"}
          strokeLinecap="round"
        />
        {/* Secondary cross slash on critical hit */}
        {crit && (
          <>
            <path
              d="M 16 20 L 104 100"
              stroke="var(--gold)"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="M 20 24 L 100 96" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
        {/* Impact sparks */}
        <polygon points="60,8 64,26 56,26" fill="var(--gold)" />
        <polygon points="60,112 64,94 56,94" fill="var(--gold)" />
        <polygon points="8,60 26,64 26,56" fill="var(--hp)" />
        <polygon points="112,60 94,64 94,56" fill="var(--hp)" />
      </svg>
    </div>
  );
}

/** Animated wind-whoosh & deflection arc when an attack misses / target dodges. */
function MissWhooshVfx({ eventKey }: { eventKey: string }) {
  return (
    <div
      key={eventKey}
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 120 120"
        className="animate-miss-whoosh h-20 w-20 sm:h-32 sm:w-32 md:h-36 md:w-36 overflow-visible"
      >
        <path
          d="M 24 88 Q 56 26 98 38"
          fill="none"
          stroke="var(--astral)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="12 6"
        />
        <path
          d="M 18 70 Q 52 16 92 26"
          fill="none"
          stroke="#e2d4ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
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
  const primaryEvent = events[0];
  const eventKey = events.map((e) => e.id).join("|");

  const bannerInfo = (() => {
    if (!primaryEvent) return null;
    const targetUnit =
      state.party.find((h) => h.id === primaryEvent.targetId) ??
      state.enemies.find((e) => e.id === primaryEvent.targetId);
    const targetLabel = targetUnit ? targetUnit.name : "";
    if (primaryEvent.kind === "crit") {
      return {
        style: "border-gold bg-ink/95 text-gold shadow-[0_0_20px_var(--gold)]",
        label:
          lang === "en"
            ? `💥 CRITICAL HIT! ${targetLabel} (${primaryEvent.text})`
            : `💥 КРИТИЧНЕ ВЛУЧАННЯ! ${targetLabel} (${primaryEvent.text})`,
      };
    }
    if (primaryEvent.kind === "dmg") {
      return {
        style: "border-hp bg-ink/95 text-hp shadow-[0_0_16px_var(--hp)]",
        label:
          lang === "en"
            ? `⚔️ HIT! ${targetLabel} (${primaryEvent.text} HP)`
            : `⚔️ ВЛУЧАННЯ! ${targetLabel} (${primaryEvent.text} HP)`,
      };
    }
    if (primaryEvent.kind === "miss") {
      return {
        style: "border-astral bg-ink/95 text-parchment shadow-[0_0_16px_var(--astral)]",
        label:
          lang === "en"
            ? `💨 MISS! ${targetLabel} dodges!`
            : `💨 ПРОМАХ! ${targetLabel} ухиляється!`,
      };
    }
    return null;
  })();

  return (
    <section
      className="game-scene relative overflow-hidden bg-ink select-none"
      aria-label={act.locationName}
    >
      <picture className="absolute inset-0 block h-full w-full">
        <source media="(max-width: 767px)" srcSet={locationMobileSrc(act.bgType)} />
        <img
          src={locationSrc(act.bgType)}
          alt=""
          width={1376}
          height={768}
          className="pixel h-full w-full object-cover object-center"
        />
      </picture>
      <div className="absolute inset-0 bg-fade-up opacity-60" />
      <Particles mood={sceneMood(act.bgType)} />

      <div className="relative z-10 flex items-start justify-between gap-2 px-3 pt-2 md:px-8 md:pt-4">
        <div className="min-w-0">
          <p className="font-display text-[0.45rem] sm:text-[0.55rem] text-gold">
            {lang === "en" ? "ACT" : "АКТ"} {ROMAN[act.actNumber]} / VIII
            {state.enemies.length ? ` • ${t("round", lang).toUpperCase()} ${state.round}` : ""}
          </p>
          <h2 className="mt-0.5 max-w-xl text-sm sm:text-lg md:text-2xl text-parchment leading-tight truncate">
            {act.locationName}
          </h2>
        </div>

        {roll && (
          <div
            key={`${roll.value}-${roll.total}-${state.log.length}`}
            className="flex items-center gap-2 rounded-xs border border-gold/60 bg-ink/90 px-2.5 py-1.5 backdrop-blur-xs"
          >
            <div className="dice-face animate-dice flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center font-display text-[0.6rem] sm:text-xs text-gold">
              {roll.value}
            </div>
            <div className="text-left leading-tight">
              <p className="font-display text-[0.42rem] text-muted-foreground">D20 {roll.label}</p>
              <p className="font-display text-[0.55rem] sm:text-xs text-parchment">
                {roll.value}
                {roll.bonus >= 0 ? `+${roll.bonus}` : roll.bonus} ={" "}
                <span className="text-gold">{roll.total}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Prominent Hit / Crit / Miss Callout Banner */}
      {bannerInfo && (
        <div
          key={`banner-${eventKey}`}
          className={`animate-banner-flash pointer-events-none absolute left-1/2 top-13 sm:top-16 z-30 whitespace-nowrap rounded-xs border-2 px-3 py-1 font-display text-[0.5rem] sm:text-xs ${bannerInfo.style}`}
        >
          {bannerInfo.label}
        </div>
      )}

      <div className="absolute bottom-2 left-0 z-10 flex w-[54%] items-end justify-evenly px-1 md:bottom-4 md:left-[2%] md:w-[50%] md:justify-center">
        {state.party.map((hero, i) => {
          const active = actor?.type === "hero" && actor.hero.id === hero.id;
          const unitEvents = events.filter((ev) => ev.targetId === hero.id);
          const isAttacker = events.some((ev) => ev.attackerId === hero.id);
          const tookCrit = unitEvents.some((ev) => ev.kind === "crit");
          const tookHit = unitEvents.some((ev) => ev.kind === "dmg" || ev.kind === "crit");
          const dodgedMiss = unitEvents.some((ev) => ev.kind === "miss") && !isAttacker;
          return (
            <div
              key={hero.id}
              className={`scene-unit relative flex flex-col items-center ${hero.hp <= 0 ? "opacity-40 grayscale" : ""} ${hero.status.hidden ? "opacity-50" : ""}`}
            >
              <FloatingEvents events={unitEvents} />
              {tookHit && <HitBurstVfx crit={tookCrit} eventKey={`h-hit-${eventKey}`} />}
              {dodgedMiss && <MissWhooshVfx eventKey={`h-miss-${eventKey}`} />}
              <img
                key={`hero-img-${hero.id}-${isAttacker || tookHit || dodgedMiss ? eventKey : "idle"}`}
                src={heroSprite(hero.classKey, (busy && active) || isAttacker ? "action" : "idle")}
                alt={hero.name}
                width={240}
                height={280}
                className={`pixel scene-hero object-contain ${active && !isAttacker && !tookHit && !dodgedMiss ? "animate-bob drop-shadow-[0_0_10px_var(--gold)] scale-105" : ""} ${isAttacker ? "animate-lunge-right drop-shadow-[0_0_14px_var(--gold)]" : ""} ${tookHit ? "animate-hit-recoil" : ""} ${dodgedMiss ? "animate-dodge-miss" : ""}`}
              />
              <div className="-mt-1 flex flex-col items-center gap-0.5">
                <span
                  className={`scene-name whitespace-nowrap font-display text-[0.4rem] sm:text-[0.5rem] md:text-[0.55rem] rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}
                >
                  P{i + 1}
                  {hero.ownerName ? ` · ${hero.ownerName}` : ""}
                  {active ? " ◀" : ""}
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
          const isAttacker = events.some((ev) => ev.attackerId === e.id);
          const tookCrit = unitEvents.some((ev) => ev.kind === "crit");
          const tookHit = unitEvents.some((ev) => ev.kind === "dmg" || ev.kind === "crit");
          const dodgedMiss = unitEvents.some((ev) => ev.kind === "miss");
          const enraged = e.hp > 0 && e.hp <= e.maxHp / 2;
          const ac = enemyAC(e);
          const aiTitle = [e.lastAiReason, e.lastAiBark ? `«${e.lastAiBark}»` : ""]
            .filter(Boolean)
            .join(" — ");
          return (
            <div
              key={e.id}
              title={aiTitle || undefined}
              className="scene-unit relative flex flex-col items-center"
            >
              <FloatingEvents events={unitEvents} />
              {tookHit && <HitBurstVfx crit={tookCrit} eventKey={`e-hit-${eventKey}`} />}
              {dodgedMiss && <MissWhooshVfx eventKey={`e-miss-${eventKey}`} />}
              <div
                className={`flex flex-col items-center ${e.hp <= 0 ? "pointer-events-none opacity-0 transition-opacity duration-700" : ""} ${e.status.stunned ? "grayscale" : ""}`}
              >
                <img
                  key={`enemy-img-${e.id}-${isAttacker || tookHit || dodgedMiss ? eventKey : "idle"}`}
                  src={e.sprite}
                  alt={e.name}
                  width={240}
                  height={280}
                  className={`pixel scene-enemy object-contain ${active && !isAttacker ? "drop-shadow-[0_0_12px_var(--hp)] scale-105" : ""} ${isAttacker ? "animate-lunge-left drop-shadow-[0_0_16px_var(--hp)]" : ""} ${tookHit ? "animate-hit-recoil" : ""} ${dodgedMiss ? "animate-dodge-miss" : ""}`}
                />
                <div className="-mt-1 flex flex-col items-center gap-0.5">
                  <span
                    className={`scene-name whitespace-nowrap text-[0.45rem] sm:text-[0.6rem] md:text-xs rounded-xs ${active ? "text-gold ring-1 ring-gold" : "text-parchment"}`}
                  >
                    {e.name}
                    {e.status.shield > 0 ? " 🛡" : ""}
                    {e.status.stunned > 0 ? " 💫" : ""}
                    {enraged ? " 💢" : ""}
                  </span>
                  <Bar hp={e.hp} max={e.maxHp} />
                  <span className="hidden sm:inline-block rounded-xs bg-ink/80 px-1 text-[0.55rem] text-muted-foreground">
                    ♥ {e.hp}/{e.maxHp} • AC {ac}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {npcs.map((n) => (
          <div key={n.sprite} className="scene-unit flex flex-col items-center">
            <img
              src={n.sprite}
              alt={n.name[lang]}
              width={240}
              height={280}
              className="pixel scene-enemy object-contain"
            />
            <span className="scene-name -mt-1 whitespace-nowrap text-[0.45rem] sm:text-[0.6rem] text-parchment md:text-xs rounded-xs">
              {n.name[lang]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
