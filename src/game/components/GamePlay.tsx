import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Backpack, Send, Swords, MessageCircle, X, LoaderCircle, Crown, Target, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { masterTurn } from "@/lib/master.functions";
import { campaign, heroSprite, itemSrc, ROMAN } from "../data";
import { rollD20, type GameState } from "../rules";
import { advanceAct, resolveTurn, retryAct } from "../session";
import { GameScene } from "./GameScene";

export function GamePlay({ state, actReady, onUpdate, onExit }: { state: GameState; actReady: boolean; onUpdate: (state: GameState, ready: boolean) => void; onExit: () => void }) {
  const [mode, setMode] = useState<"say" | "action">("action");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dice, setDice] = useState<number | null>(null);
  const [panel, setPanel] = useState<"journal" | "inventory" | null>(null);
  const lock = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const askMaster = useServerFn(masterTurn);
  const hero = state.party[state.turn];
  const act = campaign.acts[state.actIndex];
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [state.log.length, busy]);
  if (!hero || !act) return null;
  const latest = state.log.filter((e) => e.kind === "master").at(-1);

  async function submit() {
    if (!hero || !act || !text.trim() || lock.current || actReady || state.status !== "playing") return;
    lock.current = true; setBusy(true); setError("");
    const value = text.trim();
    const roll = mode === "action" ? rollD20() : null;
    setDice(roll);
    try {
      const result = await askMaster({ data: {
        worldRules: campaign.worldRulesForAI,
        act: { title: act.title, locationName: act.locationName, objective: act.objective, entities: act.rightEntities.map((e) => `${e.name} (${e.role})`), isFinal: state.actIndex === campaign.acts.length - 1 },
        party: state.party.map((h) => ({ name: h.name, hp: h.hp, maxHp: h.maxHp, stats: h.stats, gear: h.inventory.map((i) => i.name), skills: h.skills.map((s) => s.name) })),
        activeHero: hero.name, mode, text: value, d20: roll,
        history: state.log.slice(-16).map((e) => `${e.who}: ${e.text}`),
      } });
      if (!result.ok) { setError(result.error); return; }
      const next = resolveTurn(state, mode, value, roll, result.reply);
      onUpdate(next, result.reply.actComplete && next.status === "playing");
      setText("");
    } catch { setError("Не вдалося почути Майстра. Ваш хід не втрачено — спробуйте ще раз."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className="min-h-dvh bg-background">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-8">
      <div className="flex items-center gap-4"><Button variant="ghost" size="icon" aria-label="До головного меню" title="До головного меню" onClick={onExit} disabled={busy}><ArrowLeft /></Button><div><p className="font-display text-[0.6rem] text-gold">ХРОНІКИ МАЙСТРА</p><p className="mt-1 text-sm text-muted-foreground">Корона Чорної Зірки</p></div></div>
      <div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">АКТ {ROMAN[state.actIndex + 1]} • ХІД {state.log.filter((e) => e.kind === "action" || e.kind === "say").length + 1}</span><Button variant="outline" size="icon" title="Літопис" aria-label="Літопис" onClick={() => setPanel("journal")}><BookOpen /></Button><Button variant="outline" size="icon" title="Інвентар" aria-label="Інвентар" onClick={() => setPanel("inventory")}><Backpack /></Button></div>
    </header>
    <div className="mx-auto max-w-[1600px]">
      <GameScene state={state} busy={busy} />
      <div className="grid border-t border-border lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-border bg-card/40 p-5 lg:border-b-0 lg:border-r">
          <h2 className="mb-4 font-display text-[0.6rem] text-muted-foreground">ВАШ ЗАГІН</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">{state.party.map((h, i) => <div key={h.id} className={`flex items-center gap-3 border-l-2 py-2 pl-3 ${i === state.turn ? "border-gold bg-gold/5" : "border-transparent"}`}>
            <img src={heroSprite(h.classKey, "front")} alt="" width={240} height={280} className="pixel h-16 w-12 object-contain" />
            <div className="min-w-0 flex-1"><p className={`text-sm leading-snug ${i === state.turn ? "text-gold" : "text-parchment"}`}>{h.name}</p><progress className="game-hp mt-2 w-full" value={h.hp} max={h.maxHp} aria-label={`Здоров’я ${h.name}`} /><p className="mt-1 text-xs text-muted-foreground">♥ {h.hp} / {h.maxHp}{i === state.turn ? " • Ваш хід" : h.hp <= 0 ? " • Без свідомості" : ""}</p></div>
          </div>)}</div>
        </aside>
        <section className="min-w-0 p-5 md:p-7" aria-label="Розповідь Майстра">
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-[0.65rem] text-gold">✦ МАЙСТЕР РОЗПОВІДАЄ</h2><span className="text-xs text-muted-foreground">{busy ? "Пише історію…" : "Королівство слухає"}</span></div>
          <div className="mt-3 flex items-start gap-2 border border-border bg-ink/60 p-3 text-sm text-muted-foreground"><Target className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><span><span className="text-gold">Мета акту:</span> {act.objective}</span></div>
          <div className="mt-3 flex gap-1" aria-label={`Акт ${state.actIndex + 1} з ${campaign.acts.length}`}>{campaign.acts.map((a, i) => <span key={a.actNumber} className={`h-1.5 flex-1 ${i < state.actIndex ? "bg-gold" : i === state.actIndex ? "bg-gold/50" : "bg-secondary"}`} />)}</div>
          <div className="mt-4 max-h-56 overflow-y-auto pr-3" aria-live="polite">
            <p className="story-copy text-lg leading-relaxed text-parchment md:text-xl">{latest?.text}</p>
            {state.log.filter((e) => e.kind === "roll").at(-1) && <p className="mt-3 text-sm text-gold">{state.log.filter((e) => e.kind === "roll").at(-1)?.text}</p>}
            {busy && <p className="mt-4 flex items-center gap-2 text-astral"><LoaderCircle className="h-4 w-4 animate-spin" />Майстер вплітає ваш вибір в історію…</p>}
            <div ref={end} />
          </div>
          {state.status !== "playing" ? <div className="mt-6 border-t border-gold-deep pt-6"><Crown className="mb-4 h-8 w-8 text-gold" /><h2 className="title-glow text-lg">{state.status === "victory" ? "Королівство вільне!" : "Згаслий ліхтар"}</h2><p className="mt-3 text-parchment">{state.status === "victory" ? "Корона впала. Та історія вашого загону житиме у літописі." : "Загін упав, але легенди народжуються з нової спроби."}</p><div className="mt-5 flex flex-wrap gap-3">{state.status === "defeat" && <Button variant="pixel" onClick={() => { setDice(null); onUpdate(retryAct(state), false); }}><RotateCcw />Спробувати акт знову</Button>}<Button variant="pixelGhost" onClick={onExit}>До головного меню</Button></div></div>
            : actReady ? <div className="mt-6 border-t border-gold-deep pt-5"><p className="mb-4 text-gold">✦ Мету акту виконано</p><Button variant="pixel" onClick={() => { setDice(null); onUpdate(advanceAct(state), false); }}>Продовжити • Акт {ROMAN[state.actIndex + 2]} →</Button></div>
            : <form className="mt-6 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <div className="flex items-center justify-between gap-3"><div className="flex gap-2"><Button type="button" variant="pixelGhost" data-active={mode === "action"} aria-pressed={mode === "action"} disabled={busy} onClick={() => setMode("action")}><Swords />Дія</Button><Button type="button" variant="pixelGhost" data-active={mode === "say"} aria-pressed={mode === "say"} disabled={busy} onClick={() => setMode("say")}><MessageCircle />Сказати</Button></div><div key={`${dice}-${busy}`} className={`dice-face flex h-14 w-14 shrink-0 items-center justify-center border-2 border-gold-deep font-display text-lg text-gold ${busy && dice !== null ? "animate-dice" : ""}`} aria-label={dice === null ? "D20" : `Кидок D20: ${dice}`}>{dice ?? <span className="text-[0.6rem]">D20</span>}</div></div>
              <label className="mt-5 block text-sm text-muted-foreground" htmlFor="hero-turn">{hero.name}</label>
              <div className="mt-2 flex items-end gap-3"><textarea id="hero-turn" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} enterKeyHint="send" maxLength={600} disabled={busy} rows={2} placeholder={mode === "action" ? "Я перевертаю стіл і прикриваю чорний хід…" : "Капітане, ви шукаєте не тих людей…"} className="story-copy min-h-20 w-full resize-y rounded-sm border border-input bg-ink p-3 text-base text-foreground outline-none focus:border-ring disabled:opacity-60" /><Button variant="pixel" type="submit" disabled={busy || !text.trim()} className="min-h-20 shrink-0 px-4" aria-label={mode === "action" ? "Кинути D20 і діяти" : "Сказати"} title={mode === "action" ? "Кинути D20 і діяти" : "Сказати"}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}</Button></div>
              <div className="mt-4 flex flex-wrap gap-2">{state.suggestions.map((s) => <Button key={s} variant="ghost" type="button" disabled={busy} className="h-auto max-w-full whitespace-normal border border-border px-3 py-2 hover:bg-secondary hover:text-parchment text-left text-xs leading-relaxed text-muted-foreground" onClick={() => { setMode("action"); setText(s.slice(0, 600)); }}>↗ {s}</Button>)}</div>
              {error && <p role="alert" className="mt-4 text-sm text-hp">{error}</p>}
            </form>}
        </section>
      </div>
    </div>
    {panel && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4" onClick={() => setPanel(null)}><section role="dialog" aria-modal="true" aria-label={panel === "journal" ? "Літопис" : "Інвентар"} className="pixel-frame max-h-[85dvh] w-full max-w-3xl overflow-y-auto p-5 md:p-8" onClick={(e) => e.stopPropagation()}><div className="mb-6 flex items-center justify-between"><h2 className="font-display text-xs text-gold">{panel === "journal" ? "ЛІТОПИС ПРИГОДИ" : "ІНВЕНТАР"}</h2><Button variant="ghost" size="icon" aria-label="Закрити" autoFocus onClick={() => setPanel(null)}><X /></Button></div>
      {panel === "journal" ? <div className="space-y-5">{state.log.map((entry) => <div key={entry.id} className="border-l-2 border-border pl-4"><p className={`mb-1 text-sm ${entry.kind === "master" ? "text-gold" : "text-muted-foreground"}`}>{entry.who}</p><p className="story-copy leading-relaxed text-parchment">{entry.text}</p></div>)}</div> : <div className="space-y-7">{state.party.map((h) => <div key={h.id}><h3 className="mb-3 text-lg text-gold">{h.name}</h3><div className="grid gap-2 sm:grid-cols-2">{h.inventory.map((item) => <Button key={item.id} variant="ghost" className="h-auto justify-start whitespace-normal border border-border p-3 text-left" disabled={busy || h.id !== hero.id || actReady || state.status !== "playing"} onClick={() => { setMode("action"); setText(`Використовую ${item.name}: `); setPanel(null); }}><img src={itemSrc(item.artKey)} alt="" width={160} height={160} className="pixel h-12 w-12 object-contain" /><span className="min-w-0"><span className="block text-sm text-parchment">{item.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.bonus}</span></span></Button>)}</div></div>)}</div>}
    </section></div>}
  </main>;
}