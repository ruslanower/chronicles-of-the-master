import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "../i18n";

export type ChatMsg = { id: string | number; author: string; kind: "player" | "master"; toMaster?: boolean; text: string };

export function ChatPanel({ messages, lang, busy, onSend }: { messages: ChatMsg[]; lang: Lang; busy: boolean; onSend: (text: string, toMaster: boolean) => void }) {
  const [text, setText] = useState("");
  const [toMaster, setToMaster] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  function send() {
    if (!text.trim()) return;
    onSend(text.trim(), toMaster);
    setText("");
  }
  return (
    <section id="chat" className="flex min-h-0 flex-col border border-border bg-card/40" aria-label={t("chat", lang)}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-display text-[0.6rem] text-gold">{t("chat", lang).toUpperCase()}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("chatHint", lang)}</p>
      </div>
      <div className="h-64 space-y-3 overflow-y-auto p-4 lg:h-80" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={m.kind === "master" ? "border-l-2 border-gold pl-3" : ""}>
            <p className={`text-xs ${m.kind === "master" ? "text-gold" : "text-muted-foreground"}`}>{m.author}{m.toMaster ? ` → ${t("toMaster", lang)}` : ""}</p>
            <p className="story-copy text-sm leading-relaxed text-parchment">{m.text}</p>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-xs text-astral"><LoaderCircle className="h-3 w-3 animate-spin" />…</p>}
        <div ref={end} />
      </div>
      <form className="border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="mb-2 flex gap-2">
          <Button type="button" size="sm" variant="pixelGhost" data-active={toMaster} aria-pressed={toMaster} onClick={() => setToMaster(true)}>{t("toMaster", lang)}</Button>
          <Button type="button" size="sm" variant="pixelGhost" data-active={!toMaster} aria-pressed={!toMaster} onClick={() => setToMaster(false)}>{t("toParty", lang)}</Button>
        </div>
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder={t("chatPlaceholder", lang)} className="story-copy w-full rounded-sm border border-input bg-ink px-3 py-2 text-sm text-foreground outline-none focus:border-ring" />
          <Button type="submit" variant="outline" size="icon" aria-label={t("send", lang)} disabled={!text.trim()}><Send /></Button>
        </div>
      </form>
    </section>
  );
}
