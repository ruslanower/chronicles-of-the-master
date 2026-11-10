const MUTE_KEY = "chronicles-sound-muted";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (isSoundMuted()) return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function tone(freq: number, duration: number, type: OscillatorType = "triangle", gainPeak = 0.12, delay = 0, endFreq?: number) {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  }
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playClickSound() {
  tone(520, 0.045, "square", 0.05, 0, 380);
}

export function playDiceSound() {
  const steps = [320, 480, 290, 540, 410, 620];
  steps.forEach((f, idx) => {
    tone(f, 0.04, "triangle", 0.07, idx * 0.045, f * 0.85);
  });
}

export function playAttackSound() {
  tone(260, 0.14, "sawtooth", 0.12, 0, 90);
  tone(140, 0.18, "triangle", 0.15, 0.06, 55);
}

export function playCritSound() {
  tone(440, 0.12, "sawtooth", 0.14, 0, 180);
  tone(587.33, 0.16, "triangle", 0.14, 0.08);
  tone(880, 0.28, "triangle", 0.16, 0.16);
}

export function playMissSound() {
  tone(380, 0.12, "sine", 0.07, 0, 190);
}

export function playHealSound() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => {
    tone(n, 0.18, "sine", 0.1, idx * 0.07);
  });
}

export function playVictorySound() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((n, idx) => {
    tone(n, 0.25, "triangle", 0.12, idx * 0.11);
  });
}

export function playDefeatSound() {
  const notes = [392, 349.23, 311.13, 261.63];
  notes.forEach((n, idx) => {
    tone(n, 0.28, "sawtooth", 0.09, idx * 0.14);
  });
}
