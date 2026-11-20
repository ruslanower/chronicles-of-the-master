import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "../i18n";

export type ChatMsg = {
  id: string | number;
  author: string;
  kind: "player" | "master";
  toMaster?: boolean;
  text: string;
};

export function ChatPanel({
  messages,
  lang,
  busy,
  onSend,
}: {
  messages: ChatMsg[];
  lang: Lang;
  busy: boolean;
  onSend: (text: string, toMaster: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [toMaster, setToMaster] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  function send() {
    if (!text.trim()) return;
    onSend(text.trim(), toMaster);
    setText("");
  }
  return (
    <section
      id="chat"
      className="flex min-h-0 flex-1 flex-col border border-border bg-card/40"
      aria-label={t("chat", lang)}
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <h2 className="font-display text-[0.55rem] text-gold">{t("chat", lang).toUpperCase()}</h2>
        <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{t("chatHint", lang)}</p>
      </div>
      <div
        className="h-56 space-y-2.5 overflow-y-auto p-3 lg:h-auto lg:min-h-0 lg:flex-1"
        aria-live="polite"
      >
        {messages.map((m) => (
          <div key={m.id} className={m.kind === "master" ? "border-l-2 border-gold pl-3" : ""}>
            <p className={`text-xs ${m.kind === "master" ? "text-gold" : "text-muted-foreground"}`}>
              {m.author}
              {m.toMaster ? ` → ${t("toMaster", lang)}` : ""}
            </p>
            <p className="story-copy text-sm leading-relaxed text-parchment">{m.text}</p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-astral">
            <LoaderCircle className="h-3 w-3 animate-spin" />…
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        className="shrink-0 border-t border-border p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="mb-1.5 flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="pixelGhost"
            data-active={toMaster}
            aria-pressed={toMaster}
            onClick={() => setToMaster(true)}
          >
            {t("toMaster", lang)}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="pixelGhost"
            data-active={!toMaster}
            aria-pressed={!toMaster}
            onClick={() => setToMaster(false)}
          >
            {t("toParty", lang)}
          </Button>
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            placeholder={t("chatPlaceholder", lang)}
            className="story-copy w-full rounded-sm border border-input bg-ink px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
          />
          <Button
            type="submit"
            variant="outline"
            size="icon"
            aria-label={t("send", lang)}
            disabled={!text.trim() || (toMaster && busy)}
          >
            <Send />
          </Button>
        </div>
      </form>
    </section>
  );
}
