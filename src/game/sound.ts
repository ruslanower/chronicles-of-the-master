const MUTE_KEY = "chronicles-sound-muted";
const SETTINGS_KEY = "chronicles-audio-settings-v1";

export type MusicMood = "title" | "combat" | "dungeon" | "castle" | "none";

export type AudioSettings = {
  muted: boolean;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
};

const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.5,
  sfxVolume: 0.85,
};

let cachedSettings: AudioSettings | null = null;
const listeners = new Set<(s: AudioSettings) => void>();

export function getAudioSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  if (cachedSettings) return cachedSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const legacyMute = localStorage.getItem(MUTE_KEY) === "1";
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      cachedSettings = {
        muted: typeof parsed.muted === "boolean" ? parsed.muted : legacyMute,
        musicEnabled: typeof parsed.musicEnabled === "boolean" ? parsed.musicEnabled : true,
        sfxEnabled: typeof parsed.sfxEnabled === "boolean" ? parsed.sfxEnabled : true,
        musicVolume:
          typeof parsed.musicVolume === "number"
            ? Math.max(0, Math.min(1, parsed.musicVolume))
            : DEFAULT_SETTINGS.musicVolume,
        sfxVolume:
          typeof parsed.sfxVolume === "number"
            ? Math.max(0, Math.min(1, parsed.sfxVolume))
            : DEFAULT_SETTINGS.sfxVolume,
      };
    } else {
      cachedSettings = { ...DEFAULT_SETTINGS, muted: legacyMute };
    }
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

export function updateAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const cur = getAudioSettings();
  const next: AudioSettings = {
    ...cur,
    ...patch,
    musicVolume:
      patch.musicVolume !== undefined
        ? Math.max(0, Math.min(1, patch.musicVolume))
        : cur.musicVolume,
    sfxVolume:
      patch.sfxVolume !== undefined ? Math.max(0, Math.min(1, patch.sfxVolume)) : cur.sfxVolume,
  };
  cachedSettings = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      localStorage.setItem(MUTE_KEY, next.muted ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }
  syncMusicState();
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isSoundMuted(): boolean {
  return getAudioSettings().muted;
}

export function setSoundMuted(muted: boolean): void {
  updateAudioSettings({ muted });
}

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

function getSfxCtx(): AudioContext | null {
  const s = getAudioSettings();
  if (s.muted || !s.sfxEnabled || s.sfxVolume <= 0.01) return null;
  return ensureCtx();
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const length = c.sampleRate * 1.5;
  const buf = c.createBuffer(1, length, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuf = buf;
  return buf;
}

function sfxGainScale(): number {
  const s = getAudioSettings();
  return s.muted || !s.sfxEnabled ? 0 : s.sfxVolume;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "triangle",
  gainPeak = 0.12,
  delay = 0,
  endFreq?: number,
) {
  const c = getSfxCtx();
  if (!c) return;
  const scale = sfxGainScale();
  if (scale <= 0) return;

  const now = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), now);
  if (endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  }
  const peak = Math.max(0.002, gainPeak * scale);
  gain.gain.setValueAtTime(0.0008, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Filtered noise burst for sword slashes, wind whooshes, dice impacts, and shield blocks. */
function noiseBurst(
  duration: number,
  startFreq: number,
  endFreq: number,
  q = 2.5,
  gainPeak = 0.14,
  delay = 0,
  filterType: BiquadFilterType = "bandpass",
) {
  const c = getSfxCtx();
  if (!c) return;
  const scale = sfxGainScale();
  if (scale <= 0) return;

  const now = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);

  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.Q.setValueAtTime(q, now);
  filter.frequency.setValueAtTime(Math.max(40, startFreq), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

  const gain = c.createGain();
  const peak = Math.max(0.002, gainPeak * scale);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.02, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start(now);
  src.stop(now + duration + 0.02);
}

export function playClickSound() {
  tone(560, 0.04, "triangle", 0.06, 0, 400);
}

export function playDiceSound() {
  // Multi-bounce wooden/bone D20 tumble + final settle chime
  const bounces = [
    { delay: 0.0, freq: 340 },
    { delay: 0.055, freq: 490 },
    { delay: 0.11, freq: 310 },
    { delay: 0.17, freq: 560 },
    { delay: 0.23, freq: 430 },
    { delay: 0.3, freq: 660 },
  ];
  bounces.forEach((b) => {
    tone(b.freq, 0.045, "triangle", 0.08, b.delay, b.freq * 0.78);
    noiseBurst(0.03, 1400, 700, 4, 0.06, b.delay);
  });
}

export function playAttackSound() {
  // Metallic sword slash whoosh + heavy impact thud
  noiseBurst(0.15, 2400, 520, 2.0, 0.22, 0, "bandpass");
  tone(320, 0.12, "sawtooth", 0.13, 0.02, 85);
  tone(135, 0.2, "triangle", 0.2, 0.07, 42);
}

export function playCritSound() {
  // Double cross-slash + thunderous impact + golden chord
  noiseBurst(0.14, 2800, 650, 2.2, 0.24, 0);
  noiseBurst(0.18, 2200, 480, 2.0, 0.26, 0.09);
  tone(150, 0.26, "sawtooth", 0.22, 0.05, 40);
  tone(440, 0.15, "triangle", 0.16, 0.08);
  tone(659.25, 0.18, "triangle", 0.16, 0.14);
  tone(880, 0.34, "triangle", 0.18, 0.2);
}

export function playMissSound() {
  // Airy dodge whoosh sweeping past
  noiseBurst(0.22, 950, 280, 3.2, 0.16, 0, "bandpass");
  tone(410, 0.15, "sine", 0.07, 0.02, 185);
}

export function playHealSound() {
  // Warm celestial harp arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((n, idx) => {
    tone(n, 0.24, "sine", 0.11, idx * 0.065);
    tone(n * 0.5, 0.22, "triangle", 0.06, idx * 0.065);
  });
}

export function playBuffSound() {
  // Runic shield / stealth aura resonance
  tone(220, 0.28, "sine", 0.12, 0, 330);
  tone(330, 0.32, "triangle", 0.1, 0.07, 440);
  noiseBurst(0.24, 600, 1200, 3, 0.07, 0.02);
}

export function playEnemyTurnSound() {
  // Subtle low war-drum tap when an enemy steps forward
  tone(110, 0.16, "triangle", 0.12, 0, 48);
  noiseBurst(0.08, 360, 120, 2.5, 0.08, 0, "lowpass");
}

export function playVictorySound() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((n, idx) => {
    tone(n, 0.32, "triangle", 0.14, idx * 0.11);
    tone(n * 0.5, 0.32, "sawtooth", 0.06, idx * 0.11);
  });
}

export function playDefeatSound() {
  const notes = [392, 349.23, 311.13, 261.63];
  notes.forEach((n, idx) => {
    tone(n, 0.34, "sawtooth", 0.1, idx * 0.15);
    tone(n * 0.5, 0.36, "triangle", 0.08, idx * 0.15);
  });
}

/* ============================================================================
 * 100% Royalty-Free Procedural Dark-Fantasy Background Music Engine
 * ============================================================================ */

type ThemeSpec = {
  stepMs: number;
  bass: number[];
  melody: number[];
  padChord: number[];
  melodyWave: OscillatorType;
  percussion?: boolean;
};

const THEMES: Record<Exclude<MusicMood, "none">, ThemeSpec> = {
  // D-minor mystical tavern / title lute arpeggio
  title: {
    stepMs: 420,
    bass: [73.42, 0, 73.42, 0, 65.41, 0, 58.27, 0, 55.0, 0, 65.41, 0, 73.42, 0, 73.42, 0],
    melody: [
      293.66, 349.23, 440.0, 587.33, 523.25, 440.0, 349.23, 329.63, 261.63, 329.63, 392.0, 523.25,
      440.0, 349.23, 329.63, 293.66,
    ],
    padChord: [146.83, 220.0, 293.66],
    melodyWave: "triangle",
  },
  // Driving tactical dark-fantasy combat pulse
  combat: {
    stepMs: 280,
    bass: [
      73.42, 73.42, 0, 73.42, 87.31, 0, 82.41, 0, 65.41, 65.41, 0, 65.41, 58.27, 0, 55.0, 65.41,
    ],
    melody: [
      293.66, 0, 349.23, 440.0, 0, 392.0, 349.23, 329.63, 293.66, 0, 440.0, 523.25, 0, 466.16,
      440.0, 349.23,
    ],
    padChord: [146.83, 174.61, 220.0],
    melodyWave: "sawtooth",
    percussion: true,
  },
  // Mysterious subterranean sewer / cavern echoes (D Phrygian)
  dungeon: {
    stepMs: 480,
    bass: [73.42, 0, 0, 77.78, 0, 0, 65.41, 0, 73.42, 0, 0, 55.0, 0, 0, 58.27, 0],
    melody: [
      293.66, 311.13, 0, 440.0, 349.23, 0, 311.13, 293.66, 0, 466.16, 440.0, 0, 349.23, 311.13,
      293.66, 0,
    ],
    padChord: [146.83, 155.56, 220.0],
    melodyWave: "sine",
  },
  // Royal courtyard / castle intrigue theme (A minor / Dorian)
  castle: {
    stepMs: 380,
    bass: [110.0, 0, 110.0, 0, 98.0, 0, 87.31, 0, 82.41, 0, 98.0, 0, 110.0, 0, 110.0, 0],
    melody: [
      440.0, 523.25, 659.25, 587.33, 523.25, 493.88, 440.0, 392.0, 349.23, 392.0, 440.0, 523.25,
      493.88, 440.0, 392.0, 440.0,
    ],
    padChord: [220.0, 261.63, 329.63],
    melodyWave: "triangle",
  },
};

let currentMood: MusicMood = "none";
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let unlockBound = false;

function playMusicNote(
  c: AudioContext,
  freq: number,
  durationSec: number,
  wave: OscillatorType,
  gainVal: number,
  cutoffHz = 1400,
) {
  if (freq <= 0 || gainVal <= 0.0005) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, now);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoffHz, now);

  gain.gain.setValueAtTime(0.0005, now);
  gain.gain.linearRampToValueAtTime(gainVal, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.03);
}

function playMusicDrum(c: AudioContext, heavy: boolean, vol: number) {
  if (vol <= 0.001) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(heavy ? 95 : 145, now);
  osc.frequency.exponentialRampToValueAtTime(34, now + (heavy ? 0.14 : 0.09));
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol * (heavy ? 0.09 : 0.045), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + (heavy ? 0.15 : 0.1));
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.17);
}

function tickMusic() {
  const s = getAudioSettings();
  if (s.muted || !s.musicEnabled || s.musicVolume <= 0.01 || currentMood === "none") return;
  const c = ensureCtx();
  if (!c || c.state !== "running") return;

  const theme = THEMES[currentMood];
  const idx = musicStep % theme.melody.length;
  const vol = s.musicVolume;
  const stepSec = theme.stepMs / 1000;

  // 1. Melody pluck
  const mFreq = theme.melody[idx] ?? 0;
  if (mFreq > 0) {
    playMusicNote(c, mFreq, stepSec * 1.4, theme.melodyWave, vol * 0.045, 1650);
  }

  // 2. Bass note
  const bFreq = theme.bass[idx] ?? 0;
  if (bFreq > 0) {
    playMusicNote(c, bFreq, stepSec * 1.7, "triangle", vol * 0.06, 600);
  }

  // 3. Warm ambient pad chord on beat 0 and beat 8
  if (idx % 8 === 0) {
    for (const pFreq of theme.padChord) {
      playMusicNote(c, pFreq, stepSec * 7.5, "sine", vol * 0.022, 850);
    }
  }

  // 4. Optional soft war-drum pulse in combat
  if (theme.percussion && idx % 2 === 0) {
    playMusicDrum(c, idx % 4 === 0, vol);
  }

  musicStep++;
}

function bindFirstInteractionUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    const s = getAudioSettings();
    if (!s.muted && (s.musicEnabled || s.sfxEnabled)) {
      ensureCtx();
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

function syncMusicState() {
  if (typeof window === "undefined") return;
  bindFirstInteractionUnlock();
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
  const s = getAudioSettings();
  if (s.muted || !s.musicEnabled || s.musicVolume <= 0.01 || currentMood === "none") {
    return;
  }
  const theme = THEMES[currentMood];
  musicTimer = setInterval(tickMusic, theme.stepMs);
}

export function setMusicMood(mood: MusicMood) {
  if (currentMood === mood && musicTimer) return;
  currentMood = mood;
  musicStep = 0;
  syncMusicState();
}
