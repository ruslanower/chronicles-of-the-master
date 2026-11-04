import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Users } from "lucide-react";
import keyArt from "@/assets/key-art.webp";
import { Button } from "@/components/ui/button";
import { createRoom } from "@/lib/rooms.functions";
import { campaignFor, t, type Lang } from "../i18n";
import { saveCreds } from "../roomCreds";
import { Particles } from "./Particles";

export function TitleScreen({ lang, onLang, onStart, onContinue }: { lang: Lang; onLang: (l: Lang) => void; onStart: () => void; onContinue?: (() => void) | undefined }) {
  const [online, setOnline] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = useServerFn(createRoom);
  const navigate = useNavigate();

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await create({ data: { name: name.trim(), lang } });
      if (!r.ok) throw new Error(r.error);
      saveCreds(r.code, { playerId: r.playerId, token: r.token, name: name.trim() });
      localStorage.setItem("chronicles-name", name.trim());
      await navigate({ to: "/room/$code", params: { code: r.code } });
    } catch { setError(lang === "en" ? "Couldn't create the room. Try again." : "Не вдалося створити кімнату. Спробуйте ще раз."); }
    finally { setBusy(false); }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <img src={keyArt} alt="" width={1920} height={1088} className="pixel absolute inset-0 h-full w-full animate-pan object-cover opacity-90" />
      <div className="absolute inset-0 bg-fade-up" />
      <Particles mood="rain" />
      <div className="scanlines absolute inset-0" />

      <div className="absolute right-4 top-4 z-20 flex gap-1" role="group" aria-label={t("language", lang)}>
        {(["uk", "en"] as const).map((l) => <Button key={l} variant="pixelGhost" data-active={lang === l} aria-pressed={lang === l} onClick={() => onLang(l)}>{l === "uk" ? "UA" : "EN"}</Button>)}
      </div>

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-end px-6 pb-12 text-center md:justify-center md:pb-0">
        <p className="mb-6 font-display text-[0.55rem] text-parchment/80 md:text-xs">{t("chapter", lang)}</p>
        <h1 className="title-glow text-2xl leading-relaxed md:text-5xl md:leading-[1.4]">{t("gameTitle", lang)}</h1>
        <h2 className="mt-3 font-display text-xs text-astral md:text-base" style={{ textShadow: "2px 2px 0 var(--ink)" }}>{t("gameSubtitle", lang)}</h2>
        <p className="mt-6 max-w-xl text-lg leading-snug text-parchment/90 md:text-xl">{campaignFor(lang).subtitle.split(".")[0]}.</p>

        {!online ? (
          <div className="mt-8 flex w-full max-w-sm flex-col gap-4">
            <Button variant="pixel" onClick={onStart}>{t("newAdventure", lang)}</Button>
            <Button variant="pixelGhost" onClick={() => { setOnline(true); setName(localStorage.getItem("chronicles-name") ?? ""); }}><Users className="h-4 w-4" />{t("online", lang)}</Button>
            {onContinue && <Button variant="pixelGhost" onClick={onContinue}>{t("continue", lang)}</Button>}
          </div>
        ) : (
          <div className="pixel-frame mt-8 w-full max-w-sm p-5 text-left">
            <label className="block text-sm text-muted-foreground" htmlFor="pname">{t("yourName", lang)}</label>
            <input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="mt-1 w-full rounded-sm border border-input bg-ink px-3 py-2 text-foreground outline-none focus:border-ring" />
            <Button variant="pixel" className="mt-4 w-full" disabled={!name.trim() || busy} onClick={onCreate}>{busy ? <LoaderCircle className="animate-spin" /> : null}{t("createRoom", lang)}</Button>
            <div className="my-4 h-px bg-border" />
            <label className="block text-sm text-muted-foreground" htmlFor="rcode">{t("joinRoom", lang)}</label>
            <div className="mt-1 flex gap-2">
              <input id="rcode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" className="w-full rounded-sm border border-input bg-ink px-3 py-2 font-display text-sm uppercase text-foreground outline-none focus:border-ring" />
              <Button variant="pixelGhost" disabled={code.trim().length !== 6} onClick={() => { if (name.trim()) localStorage.setItem("chronicles-name", name.trim()); void navigate({ to: "/room/$code", params: { code: code.trim() } }); }}>{t("join", lang)}</Button>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-hp">{error}</p>}
            <Button variant="ghost" className="mt-3" onClick={() => setOnline(false)}>{t("back", lang)}</Button>
          </div>
        )}

        <div className="mt-8 flex gap-6 font-display text-[0.5rem] text-muted-foreground md:text-[0.6rem]">
          <span>{t("acts8", lang)}</span><span>•</span><span>{t("heroes14", lang)}</span><span>•</span><span>{campaignFor(lang).duration}</span>
        </div>
        <p className="mt-5 animate-blink font-display text-[0.5rem] text-gold">{t("tagline", lang)}</p>
      </div>
    </main>
  );
}
