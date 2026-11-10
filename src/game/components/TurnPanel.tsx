import { useState } from "react";
import { Swords, PenLine, Backpack, LoaderCircle, Send, Sparkles, Heart, EyeOff, Shield, Zap, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ABILITIES, itemHeal, type Ability } from "../content";
import { itemSrc } from "../data";
import { STAT_LABELS, t, type Lang } from "../i18n";
import type { GameState, HeroState } from "../engine";
import type { HeroAction } from "../turn";

const ICON = { attack: Swords, aoe: Flame, stun: Zap, heal: Heart, hide: EyeOff, shield: Shield } as const;

function effect(a: Ability, hero: HeroState, lang: Lang) {
  const b = hero.stats[a.stat];
  const st = STAT_LABELS[lang][a.stat];
  const en = lang === "en";
  switch (a.kind) {
    case "attack": return en ? `Damage ${a.dice}+${b} (D20+${st} vs defence)` : `Шкода ${a.dice}+${b} (D20+${st} проти захисту)`;
    case "aoe": return en ? `${a.dice}+${b} to every enemy` : `${a.dice}+${b} кожному ворогу`;
    case "stun": return en ? `D20+${b} vs 12 — enemy skips a turn` : `D20+${b} проти 12 — ворог пропускає хід`;
    case "heal": return en ? `Heals ${a.dice}+${b} HP` : `Лікує ${a.dice}+${b} HP`;
    case "hide": return en ? "Invisible for 1 round" : "Невидимість на 1 раунд";
    default: return en ? "+3 defence to party, 1 round" : "+3 захисту загону, 1 раунд";
  }
}

export function TurnPanel({ state, hero, lang, busy, onAction }: { state: GameState; hero: HeroState; lang: Lang; busy: boolean; onAction: (a: HeroAction) => void }) {
  const [tab, setTab] = useState<"abilities" | "free" | "items">("abilities");
  const [pending, setPending] = useState<{ kind: "ability" | "item"; id: string; target: "enemy" | "ally" } | null>(null);
  const [text, setText] = useState("");
  const enemies = state.enemies.filter((e) => e.hp > 0);
  const allies = state.party.filter((h) => h.hp > 0);

  function pick(a: Ability) {
    if (a.kind === "attack" || a.kind === "stun") setPending({ kind: "ability", id: a.id, target: "enemy" });
    else if (a.kind === "heal" || a.kind === "hide") setPending({ kind: "ability", id: a.id, target: "ally" });
    else onAction({ type: "ability", abilityId: a.id });
  }
  function choose(targetId: string) {
    if (!pending) return;
    onAction(pending.kind === "ability" ? { type: "ability", abilityId: pending.id, targetId } : { type: "item", itemId: pending.id, targetId });
    setPending(null);
  }
  function submitFree() {
    if (!text.trim() || busy) return;
    onAction({ type: "free", text: text.trim() });
    setText("");
  }

  const tabs = [
    { id: "abilities" as const, icon: Swords, label: t("abilities", lang) },
    { id: "free" as const, icon: PenLine, label: t("freeAction", lang) },
    { id: "items" as const, icon: Backpack, label: t("items", lang) },
  ];

  return (
    <div className="pixel-frame pixel-frame-gold p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[0.6rem] text-gold">{t("yourTurn", lang).toUpperCase()} — {hero.name}</p>
        {busy && <span className="flex items-center gap-2 text-xs text-astral"><LoaderCircle className="h-4 w-4 animate-spin" />{t("masterThinking", lang)}</span>}
      </div>
      <div className="mt-3 md:mt-4 grid grid-cols-3 gap-1.5 md:gap-2" role="tablist">
        {tabs.map((x) => (
          <Button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            variant="pixelGhost"
            data-active={tab === x.id}
            className="px-1.5 sm:px-3 text-[0.6rem] sm:text-xs h-9 sm:h-10"
            onClick={() => {
              setTab(x.id);
              setPending(null);
            }}
          >
            <x.icon className="h-3.5 w-3.5 mr-1 shrink-0" />
            <span className="truncate">{x.label}</span>
          </Button>
        ))}
      </div>

      {pending ? (
        <div className="mt-3 md:mt-4">
          <p className="mb-2 text-xs md:text-sm text-gold font-display">{t("chooseTarget", lang)}</p>
          <div className="flex flex-wrap gap-2">
            {(pending.target === "enemy" ? enemies : allies).map((c) => (
              <Button
                key={c.id}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => choose(c.id)}
                className="h-10 text-xs md:text-sm px-3 border-border hover:border-gold"
              >
                {c.name} <span className="ml-1 text-[0.65rem] text-muted-foreground">♥ {c.hp}/{c.maxHp}</span>
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="h-10 text-xs px-3" onClick={() => setPending(null)}>
              {t("cancel", lang)}
            </Button>
          </div>
        </div>
      ) : tab === "abilities" ? (
        <div className="mt-3 md:mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(ABILITIES[hero.id] ?? []).map((a) => {
            const Icon = ICON[a.kind];
            const cd = hero.cooldowns[a.id] ?? 0;
            const needsEnemy = a.kind === "attack" || a.kind === "stun" || a.kind === "aoe";
            const disabled = busy || cd > 0 || (needsEnemy && !enemies.length);
            return (
              <Button
                key={a.id}
                variant="ghost"
                disabled={disabled}
                onClick={() => pick(a)}
                className="h-auto flex-col items-start gap-1 whitespace-normal border border-border bg-ink/50 p-2.5 sm:p-3 text-left hover:border-gold hover:bg-secondary"
              >
                <span className="flex items-center gap-1.5 text-xs sm:text-sm text-parchment font-medium">
                  <Icon className="h-4 w-4 text-gold shrink-0" />
                  {a.name[lang]}
                </span>
                <span className="text-[0.65rem] sm:text-xs text-gold">{effect(a, hero, lang)}</span>
                <span className="text-[0.65rem] sm:text-xs text-muted-foreground leading-tight">
                  {cd > 0 ? `${t("cooldown", lang)}: ${cd}` : needsEnemy && !enemies.length ? t("noTargets", lang) : a.desc[lang]}
                </span>
              </Button>
            );
          })}
        </div>
      ) : tab === "free" ? (
        <form className="mt-4" onSubmit={(e) => { e.preventDefault(); submitFree(); }}>
          <p className="text-xs text-muted-foreground">{t("freeHint", lang)}</p>
          <div className="mt-2 flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submitFree(); } }} enterKeyHint="send" maxLength={600} rows={2} disabled={busy} placeholder={t("freePlaceholder", lang)} className="story-copy min-h-16 w-full resize-y rounded-sm border border-input bg-ink p-3 text-base text-foreground outline-none focus:border-ring disabled:opacity-60" />
            <Button variant="pixel" type="submit" disabled={busy || !text.trim()} aria-label={t("doIt", lang)} className="min-h-16 shrink-0 px-4"><Send /></Button>
          </div>
          {state.suggestions.length > 0 && <div className="mt-3"><p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" />{t("ideas", lang)}</p><div className="flex flex-wrap gap-2">{state.suggestions.map((s) => <button key={s} type="button" disabled={busy} className="border border-border px-2 py-1 text-xs text-muted-foreground hover:border-gold hover:text-parchment" onClick={() => setText(s)}>{s}</button>)}</div></div>}
        </form>
      ) : (
        <div className="mt-3 md:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {hero.inventory.map((item) => {
            const heal = itemHeal(item.bonus);
            const used = hero.used.includes(item.id);
            return (
              <Button key={item.id} variant="ghost" disabled={busy || used} onClick={() => (heal != null ? setPending({ kind: "item", id: item.id, target: "ally" }) : (setTab("free"), setText(`${lang === "en" ? "I use" : "Використовую"} ${item.name}: `)))} className="h-auto justify-start gap-3 whitespace-normal border border-border bg-ink/50 p-2 text-left hover:border-gold hover:bg-secondary">
                <img src={itemSrc(item.artKey)} alt="" width={160} height={160} className="pixel h-10 w-10 object-contain" />
                <span className="min-w-0"><span className="block text-sm text-parchment">{item.name}</span><span className="block text-xs text-muted-foreground">{used ? "✓" : item.bonus}</span></span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
