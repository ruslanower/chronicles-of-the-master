import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Crown, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinRoom, pickHero, roomChat, roomNextAct, roomRetry, roomTick, roomTurn, startRoom } from "@/lib/rooms.functions";
import type { RoomPlayer } from "@/lib/rooms.server";
import type { GameState } from "../engine";
import type { HeroAction } from "../turn";
import { campaignFor, t, type Lang } from "../i18n";
import { loadCreds, saveCreds, type RoomCreds } from "../roomCreds";
import { HeroPicker } from "./PartySelect";
import { GameView } from "./GameView";
import type { ChatMsg } from "./ChatPanel";

type Room = { code: string; lang: string; host_id: string; phase: string; players: RoomPlayer[]; state: GameState | null; version: number };

function errText(e: string, lang: Lang) {
  if (e === "not_found") return t("roomNotFound", lang);
  if (e === "full" || e === "started") return t("roomFull", lang);
  if (e === "need_hero") return t("needHero", lang);
  if (e === "taken") return t("taken", lang);
  if (e === "busy" || e === "not_your_turn") return "";
  return e.length > 12 ? e : t("masterError", lang);
}

export function OnlineRoom({ code }: { code: string }) {
  const [creds, setCreds] = useState<RoomCreds | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const fJoin = useServerFn(joinRoom), fPick = useServerFn(pickHero), fStart = useServerFn(startRoom);
  const fTurn = useServerFn(roomTurn), fTick = useServerFn(roomTick), fNext = useServerFn(roomNextAct), fRetry = useServerFn(roomRetry), fChat = useServerFn(roomChat);
  const lang: Lang = room?.lang === "en" ? "en" : "uk";

  useEffect(() => {
    setCreds(loadCreds(code));
    setName(localStorage.getItem("chronicles-name") ?? "");
    setReady(true);
  }, [code]);

  const loadRoom = useCallback(async () => {
    const { data } = await supabase.from("rooms").select("code, lang, host_id, phase, players, state, version").eq("code", code).maybeSingle();
    setRoom((data as unknown as Room) ?? null);
  }, [code]);
  const loadChat = useCallback(async () => {
    const { data } = await supabase.from("room_messages").select("id, author, kind, to_master, text").eq("room_code", code).order("id", { ascending: false }).limit(80);
    setChat((data ?? []).reverse().map((m) => ({ id: m.id, author: m.author, kind: m.kind === "master" ? "master" : "player", toMaster: m.to_master, text: m.text })));
  }, [code]);

  useEffect(() => {
    void loadRoom(); void loadChat();
    const ch = supabase
      .channel(`room-${code}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` }, () => void loadRoom())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_code=eq.${code}` }, () => void loadChat())
      .subscribe();
    const poll = setInterval(() => void loadRoom(), 8000); // safety net if realtime drops
    return () => { clearInterval(poll); void supabase.removeChannel(ch); };
  }, [code, loadRoom, loadChat]);

  const c = creds ? { code, playerId: creds.playerId, token: creds.token } : null;

  async function call(f: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError("");
    try { const r = await f(); if (!r.ok && r.error) setError(errText(r.error, lang)); await loadRoom(); }
    catch { setError(t("masterError", lang)); }
    finally { setBusy(false); }
  }

  async function onJoin() {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await fJoin({ data: { code, name: name.trim() } });
      if (!r.ok) { setError(errText(r.error, lang)); return; }
      localStorage.setItem("chronicles-name", name.trim());
      const cr = { playerId: r.playerId, token: r.token, name: name.trim() };
      saveCreds(code, cr); setCreds(cr); await loadRoom();
    } catch { setError(t("roomNotFound", lang)); }
    finally { setBusy(false); }
  }

  const ticking = useRef(false);
  const onTimeout = useCallback(() => {
    if (!c || ticking.current) return;
    ticking.current = true;
    void fTick({ data: c }).finally(() => { ticking.current = false; void loadRoom(); });
  }, [c?.playerId, fTick, loadRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || room === undefined) return <Center><LoaderCircle className="animate-spin text-gold" /></Center>;
  if (room === null) return <Center><h1 className="title-glow text-lg">{t("roomNotFound", "uk")}</h1><Link to="/" className="text-gold underline">← {t("mainMenu", "uk")}</Link></Center>;

  const me = creds ? room.players.find((p) => p.id === creds.playerId) : undefined;

  if (!me) {
    return (
      <Center>
        <p className="font-display text-xs text-gold">{t("roomCode", lang)}: {code}</p>
        <h1 className="title-glow text-lg">{t("lobby", lang)}</h1>
        {room.phase !== "lobby" || room.players.length >= 4 ? <p className="text-parchment">{t("roomFull", lang)}</p> : (
          <div className="pixel-frame w-full max-w-sm space-y-3 p-5 text-left">
            <label htmlFor="pname" className="block text-sm text-muted-foreground">{t("yourName", lang)}</label>
            <Input id="pname" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void onJoin()} />
            <Button variant="pixel" className="w-full" disabled={!name.trim() || busy} onClick={() => void onJoin()}>{busy && <LoaderCircle className="animate-spin" />}{t("join", lang)}</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <Link to="/" className="text-gold underline">← {t("mainMenu", lang)}</Link>
      </Center>
    );
  }

  if (room.phase === "lobby" || !room.state) {
    const heroes = campaignFor(lang).heroes;
    const taken = Object.fromEntries(room.players.filter((p) => p.heroId && p.id !== me.id).map((p) => [p.heroId!, p.name]));
    const isHost = room.host_id === me.id;
    const allPicked = room.players.every((p) => p.heroId);
    const link = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";
    return (
      <main className="min-h-dvh bg-night px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-display text-[0.6rem] text-gold">{t("lobby", lang).toUpperCase()}</p><h1 className="title-glow mt-2 text-lg">{t("roomCode", lang)}: {code}</h1></div>
            <Link to="/" className="text-sm text-gold underline">← {t("mainMenu", lang)}</Link>
          </header>
          <section className="pixel-frame flex flex-wrap items-center gap-3 p-4">
            <p className="text-sm text-parchment">{t("invite", lang)}</p>
            <Button variant="pixelGhost" size="sm" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy />{copied ? t("copied", lang) : t("copyLink", lang)}</Button>
          </section>
          <section className="pixel-frame p-4">
            <p className="font-display text-[0.55rem] text-gold">{t("players", lang)} ({room.players.length}/4)</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {room.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2 bg-ink p-2 text-sm text-parchment">
                  {p.host && <Crown className="size-4 text-gold" aria-label={t("host", lang)} />}
                  <span className="truncate">{p.name}{p.id === me.id ? ` (${t("you", lang)})` : ""}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{heroes.find((h) => h.id === p.heroId)?.name ?? t("noHeroPicked", lang)}</span>
                </li>
              ))}
            </ul>
          </section>
          <h2 className="text-parchment">{t("pickOneHero", lang)}</h2>
          <HeroPicker lang={lang} picked={me.heroId ? [me.heroId] : []} taken={taken}
            onToggle={(h) => c && void call(() => fPick({ data: { ...c, heroId: me.heroId === h.id ? null : h.id } }))} />
          <div className="sticky bottom-0 flex flex-wrap items-center gap-3 bg-night/95 py-3">
            {isHost
              ? <Button variant="pixel" disabled={!allPicked || busy} onClick={() => c && void call(() => fStart({ data: c }))}>{busy && <LoaderCircle className="animate-spin" />}{t("startGame", lang)}</Button>
              : <p className="text-sm text-muted-foreground">{t("waitHost", lang)}</p>}
            {isHost && !allPicked && <p className="text-sm text-muted-foreground">{t("needHero", lang)}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <GameView
      state={room.state} lang={lang} mine={me.heroId ? [me.heroId] : []} busy={busy} error={error} chat={chat} chatBusy={chatBusy} timed
      canAdvance={room.host_id === me.id}
      onAction={(_heroId, a: HeroAction) => c && void call(() => fTurn({ data: { ...c, action: a as never } }))}
      onChat={(text, toMaster) => {
        if (!c) return;
        setChatBusy(toMaster);
        void fChat({ data: { ...c, text, toMaster } }).catch(() => setError(t("masterError", lang))).finally(() => { setChatBusy(false); void loadChat(); });
      }}
      onNextAct={() => c && void call(() => fNext({ data: c }))}
      onRetry={() => c && void call(() => fRetry({ data: c }))}
      onExit={() => { window.location.href = "/"; }}
      onTimeout={onTimeout}
    />
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night p-6 text-center">{children}</main>;
}
