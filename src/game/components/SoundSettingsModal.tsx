import { useEffect, useState } from "react";
import { Music, Volume2, VolumeX, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Lang } from "../i18n";
import {
  getAudioSettings,
  playAttackSound,
  playClickSound,
  playCritSound,
  playDiceSound,
  playHealSound,
  playMissSound,
  subscribeAudioSettings,
  updateAudioSettings,
  type AudioSettings,
} from "../sound";

export function SoundSettingsModal({
  open,
  lang,
  onClose,
}: {
  open: boolean;
  lang: Lang;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<AudioSettings>(() => getAudioSettings());
  const en = lang === "en";

  useEffect(() => {
    setSettings(getAudioSettings());
    return subscribeAudioSettings(setSettings);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={en ? "Sound & Music Settings" : "Налаштування звуку та музики"}
        className="pixel-frame pixel-frame-gold w-full max-w-md space-y-5 p-5 md:p-6 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xs text-gold">
            {en ? "SOUND & MUSIC" : "ЗВУК ТА МУЗИКА"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {en ? "Close" : "Закрити"}
          </Button>
        </div>

        {/* Master Mute Toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xs border border-border bg-ink/70 p-3">
          <div className="flex items-center gap-2.5">
            {settings.muted ? (
              <VolumeX className="h-5 w-5 text-hp" />
            ) : (
              <Volume2 className="h-5 w-5 text-gold" />
            )}
            <div>
              <p className="text-sm font-medium text-parchment">
                {en ? "Master Audio" : "Загальний звук у грі"}
              </p>
              <p className="text-xs text-muted-foreground">
                {settings.muted
                  ? en
                    ? "All game audio is muted"
                    : "Усі звуки та музика вимкнені"
                  : en
                    ? "Audio is active (royalty-free synth)"
                    : "Увімкнено (авторський синтез без копірайту)"}
              </p>
            </div>
          </div>
          <Button
            variant={settings.muted ? "pixelGhost" : "pixel"}
            size="sm"
            onClick={() => {
              const nextMuted = !settings.muted;
              updateAudioSettings({ muted: nextMuted });
              if (!nextMuted) playClickSound();
            }}
          >
            {settings.muted ? (en ? "OFF" : "ВИМК") : en ? "ON" : "УВІМК"}
          </Button>
        </div>

        {/* Background Music Controls */}
        <div className="space-y-2.5 rounded-xs border border-border bg-ink/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-astral" />
              <span className="text-sm text-parchment">
                {en ? "Background Music" : "Фонова музика"}
              </span>
            </div>
            <Button
              variant="pixelGhost"
              size="sm"
              data-active={!settings.muted && settings.musicEnabled}
              onClick={() => {
                const next = !settings.musicEnabled;
                updateAudioSettings({
                  musicEnabled: next,
                  ...(next && settings.muted ? { muted: false } : {}),
                });
                playClickSound();
              }}
            >
              {settings.musicEnabled && !settings.muted
                ? en
                  ? "ON"
                  : "УВІМК"
                : en
                  ? "OFF"
                  : "ВИМК"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.musicVolume * 100)}
              aria-label={en ? "Music volume" : "Гучність музики"}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                updateAudioSettings({
                  musicVolume: v,
                  ...(v > 0 ? { musicEnabled: true, muted: false } : {}),
                });
              }}
              className="h-2 w-full cursor-pointer accent-gold"
            />
            <span className="w-11 text-right font-display text-[0.55rem] text-gold">
              {Math.round(settings.musicVolume * 100)}%
            </span>
          </div>
        </div>

        {/* Sound Effects (SFX) Controls */}
        <div className="space-y-2.5 rounded-xs border border-border bg-ink/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold" />
              <span className="text-sm text-parchment">
                {en ? "Sound Effects (SFX)" : "Звукові ефекти бою та кубиків"}
              </span>
            </div>
            <Button
              variant="pixelGhost"
              size="sm"
              data-active={!settings.muted && settings.sfxEnabled}
              onClick={() => {
                const next = !settings.sfxEnabled;
                updateAudioSettings({
                  sfxEnabled: next,
                  ...(next && settings.muted ? { muted: false } : {}),
                });
                if (next) playClickSound();
              }}
            >
              {settings.sfxEnabled && !settings.muted ? (en ? "ON" : "УВІМК") : en ? "OFF" : "ВИМК"}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              aria-label={en ? "SFX volume" : "Гучність ефектів"}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                updateAudioSettings({
                  sfxVolume: v,
                  ...(v > 0 ? { sfxEnabled: true, muted: false } : {}),
                });
              }}
              className="h-2 w-full cursor-pointer accent-gold"
            />
            <span className="w-11 text-right font-display text-[0.55rem] text-gold">
              {Math.round(settings.sfxVolume * 100)}%
            </span>
          </div>

          {/* Preview SFX buttons */}
          <div className="pt-2">
            <p className="mb-1.5 font-display text-[0.48rem] text-muted-foreground">
              {en ? "TEST EFFECTS:" : "ПЕРЕВІРИТИ ЕФЕКТИ:"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playDiceSound()}
              >
                🎲 D20
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playAttackSound()}
              >
                ⚔️ {en ? "Hit" : "Удар"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playCritSound()}
              >
                💥 {en ? "Crit" : "Крит"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playMissSound()}
              >
                💨 {en ? "Miss" : "Промах"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => playHealSound()}
              >
                💚 {en ? "Heal" : "Лікування"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
