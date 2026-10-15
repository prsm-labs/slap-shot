// Goal horn for goal alerts — synthesized with the Web Audio API (no recording, so no licensing and
// nothing to download). Shape of an arena horn: a low three-note chord of buzzy (sawtooth) tones,
// softened by a low-pass filter, a short pitch "scoop" up at the start like an air horn spinning up,
// a slow wobble while it holds, ~2.3s total. Kept quiet on purpose (MASTER gain).
//
// Browsers only allow sound after the user has touched the page once, so unlockHorn() runs on the
// first tap / click / key press. On iPhones that support it, the audio session is "ambient", so the
// horn stays silent when the ring/silent switch is on.

const MASTER = 0.16; // overall loudness 0-1
const CHORD = [146.8, 185.0, 220.0]; // D3, F#3, A3 — low and full, not shrill
const HOLD = 1.7; // seconds at full volume
const MIN_GAP_MS = 4000; // several goals in one update -> one horn

let ctx = null;
let lastPlayed = 0;

function audioContext() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    if (navigator.audioSession) navigator.audioSession.type = "ambient";
  } catch {
    // not supported — fine
  }
  ctx = new AC();
  return ctx;
}

export function unlockHorn() {
  const c = audioContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Call once (App start): unlock on the first user gesture, then stop listening.
export function installHornUnlock() {
  if (typeof window === "undefined") return;
  const events = ["pointerdown", "keydown", "touchend"];
  const once = () => {
    unlockHorn();
    events.forEach((e) => window.removeEventListener(e, once, true));
  };
  events.forEach((e) => window.addEventListener(e, once, true));
}

// force = play even inside the gap (the "Test" button).
export function playGoalHorn({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPlayed < MIN_GAP_MS) return false;
  const c = audioContext();
  if (!c) return false;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (c.state !== "running" && !force) return false; // page never touched yet — browser would block it
  lastPlayed = now;

  const t0 = c.currentTime + 0.02;
  const end = t0 + 0.12 + HOLD + 0.5;

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(MASTER, t0 + 0.12); // attack
  master.gain.setValueAtTime(MASTER, t0 + 0.12 + HOLD);
  master.gain.exponentialRampToValueAtTime(0.0001, end); // release

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700, t0);
  filter.frequency.linearRampToValueAtTime(1500, t0 + 0.25); // brightens as it "opens up"
  filter.Q.value = 0.8;
  filter.connect(master).connect(c.destination);

  // slow wobble shared by every note
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = 1.2; // Hz of wobble
  lfo.connect(lfoGain);
  lfo.start(t0);
  lfo.stop(end);

  CHORD.forEach((f, i) => {
    [-3, 3].forEach((cents) => {
      // two slightly detuned voices per note = thick horn
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.detune.value = cents + (i === 1 ? 2 : 0);
      o.frequency.setValueAtTime(f * 0.94, t0); // scoop up into pitch
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.18);
      lfoGain.connect(o.frequency);
      const g = c.createGain();
      g.gain.value = 1 / (CHORD.length * 2);
      o.connect(g).connect(filter);
      o.start(t0);
      o.stop(end);
    });
  });
  return true;
}
