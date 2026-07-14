// Procedural Web Audio engine for the trust game.
//
// Nothing is loaded from disk — every sound is synthesized on the fly, so
// there are no assets and nothing external to fetch. Two layers:
//
//   1. An ambient pad: a soft sustained chord that plays under the campaign.
//      Its "tension" bends the chord from major (warm) toward minor and a
//      closed filter (uneasy) as betrayal accumulates, and relaxes back on
//      cooperation. This is the adaptive-music layer.
//   2. Short stings for round outcomes, coins, UI ticks, reveals.
//
// Autoplay policy: browsers block audio until a user gesture, so `arm()` is
// called from the first tap/click and nothing is audible before that. Honors
// preferences.soundEnabled (persisted) via setEnabled()/toggle().

import { getPreferences, setPreference } from './progress.js';

let ctx        = null;   // AudioContext (created lazily on first gesture)
let master     = null;   // master gain → destination
let ambientBus = null;   // ambient sub-mix gain (its own fade/level)
let ambient    = null;   // live ambient nodes, or null when stopped
let enabled    = true;   // mirrors preferences.soundEnabled
let armed      = false;  // has a gesture created the context yet
let tension    = 0;      // 0 = warm/major … 1 = tense/minor
let reduced    = false;  // honor prefers-reduced-motion for ambient movement

// A small consonant palette (roughly C major), in Hz.
const N = {
  C2: 65.41,  G2: 98.00,
  C3: 130.81, E3: 164.81, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00, C6: 1046.50,
};

function supported() {
  return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
}

// Create the graph the first time a gesture lets us. Safe to call repeatedly.
export function arm() {
  if (armed || !supported()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    ambientBus = ctx.createGain();
    ambientBus.gain.value = 0.0001;
    ambientBus.connect(master);
    armed = true;
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    enabled = getPreferences().soundEnabled !== false;
    if (enabled) startAmbient();
  } catch {
    ctx = null; armed = false;
  }
}

// Some browsers start the context suspended until a gesture resumes it.
function resumeIfNeeded() {
  if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch {} }
}

export function isEnabled() { return enabled; }

export function setEnabled(on) {
  enabled = !!on;
  setPreference('soundEnabled', enabled);
  if (!armed) { if (enabled) arm(); return; }
  resumeIfNeeded();
  if (enabled) { startAmbient(); fadeAmbient(0.09, 0.6); }
  else { fadeAmbient(0.0001, 0.4); }
}

export function toggle() { setEnabled(!enabled); return enabled; }

// ── Envelope helpers ─────────────────────────────────────────────────────────
function now() { return ctx.currentTime; }

// One synthesized note with a percussive attack/decay envelope.
function tone(freq, opts = {}) {
  if (!ctx || !enabled) return;
  const {
    type = 'sine', dur = 0.35, peak = 0.16,
    attack = 0.008, glideTo = null, detune = 0, delay = 0, dest = master,
  } = opts;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
}

// A staggered chord — each note delayed slightly so it reads as "strummed".
function chord(freqs, opts = {}) {
  const { stagger = 0.045, ...rest } = opts;
  freqs.forEach((f, i) => tone(f, { ...rest, delay: (rest.delay || 0) + i * stagger }));
}

// Filtered noise burst (used for the Grim "shatter" and soft whooshes).
function noise(opts = {}) {
  if (!ctx || !enabled) return;
  const { dur = 0.4, peak = 0.18, type = 'bandpass', freq = 1400, q = 0.9, sweepTo = null } = opts;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = type; filt.frequency.setValueAtTime(freq, now()); filt.Q.value = q;
  if (sweepTo) filt.frequency.exponentialRampToValueAtTime(sweepTo, now() + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(peak, now() + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
  src.stop(now() + dur + 0.02);
  src.onended = () => { try { src.disconnect(); filt.disconnect(); g.disconnect(); } catch {} };
}

// ── Event stings ─────────────────────────────────────────────────────────────
export function play(name) {
  if (!enabled || !armed || !ctx) return;   // stay silent until a real gesture arms audio
  resumeIfNeeded();
  switch (name) {
    case 'click':   tone(N.C5, { type: 'sine', dur: 0.05, peak: 0.04 }); break;
    case 'choose':  tone(N.G4, { type: 'triangle', dur: 0.08, peak: 0.06 }); break;
    case 'coin':    tone(N.C6, { type: 'triangle', dur: 0.12, peak: 0.07, glideTo: N.A5 }); break;

    // Mutual cooperation — warm major triad with a high sparkle.
    case 'share':
      chord([N.C4, N.E4, N.G4], { type: 'triangle', dur: 0.5, peak: 0.13 });
      tone(N.C5, { type: 'sine', dur: 0.6, peak: 0.06, delay: 0.14 });
      break;

    // You took while they shared — bright but a little sly (major sixth).
    case 'exploit':
      chord([N.C4, N.E4, N.A4], { type: 'triangle', dur: 0.34, peak: 0.11 });
      tone(N.C3, { type: 'sine', dur: 0.2, peak: 0.1 });
      break;

    // They took while you shared — a downward dissonant sting.
    case 'betrayed':
      tone(N.F4, { type: 'sawtooth', dur: 0.5, peak: 0.1, glideTo: N.E4 });
      tone(N.B3, { type: 'triangle', dur: 0.5, peak: 0.09, delay: 0.02 });
      tone(N.C3, { type: 'sine', dur: 0.4, peak: 0.12, glideTo: N.G2 });
      break;

    // Both took — a dull, flat low thud. Nobody wins.
    case 'mutualTake':
      tone(N.G2, { type: 'sine', dur: 0.3, peak: 0.13 });
      tone(N.C3, { type: 'sine', dur: 0.28, peak: 0.08, detune: -8 });
      break;

    // Grim trigger fires — the door slams.
    case 'shatter':
      noise({ dur: 0.55, peak: 0.22, type: 'bandpass', freq: 2600, sweepTo: 180, q: 0.7 });
      tone(N.C4, { type: 'sawtooth', dur: 0.7, peak: 0.14, glideTo: N.C2 });
      break;

    case 'streak':  // cooperation streak reward
      chord([N.C4, N.E4, N.G4, N.C5], { type: 'triangle', dur: 0.4, peak: 0.1, stagger: 0.07 });
      break;

    case 'reveal':  // chime for the unmasking
      chord([N.C5, N.E5, N.G5], { type: 'triangle', dur: 0.7, peak: 0.11, stagger: 0.11 });
      break;

    case 'whoosh':  // page/step transition
      noise({ dur: 0.28, peak: 0.06, type: 'lowpass', freq: 900, sweepTo: 300 });
      break;

    case 'correct': // you read the opponent right
      chord([N.E5, N.A5], { type: 'triangle', dur: 0.28, peak: 0.09, stagger: 0.06 });
      break;
    case 'wrong':
      tone(N.A3, { type: 'triangle', dur: 0.24, peak: 0.09, glideTo: N.F4 * 0.5 });
      break;
    default: break;
  }
}

// Signature motif per strategy — a short phrase played when you meet a
// character, so you start to "hear" who you're facing. Keyed by strategyId.
const MOTIFS = {
  allC:   { notes: [N.C4, N.E4, N.G4, N.C5], type: 'triangle' },  // open, warm
  allD:   { notes: [N.G2, N.G2, N.C3],       type: 'sawtooth' },  // blunt, low
  tft:    { notes: [N.C4, N.G4, N.C4],       type: 'triangle' },  // call & mirror
  grim:   { notes: [N.E4, N.C4, N.G2],       type: 'sawtooth' },  // descending, ominous
  tf2t:   { notes: [N.C4, N.D4, N.E4, N.G4], type: 'sine' },      // patient rise
  pavlov: { notes: [N.C4, N.E4, N.D4, N.F4], type: 'triangle' },  // pattern-y
};

export function playMotif(strategyId) {
  if (!enabled || !armed || !ctx) return;   // stay silent until a real gesture arms audio
  resumeIfNeeded();
  const m = MOTIFS[strategyId] || MOTIFS.tft;
  m.notes.forEach((f, i) => tone(f, { type: m.type, dur: 0.34, peak: 0.09, delay: i * 0.12 }));
}

// Convenience mapping from the engine's outcome labels to stings.
export function playOutcome(outcome) {
  switch (outcome) {
    case 'mutual-share': play('share'); break;
    case 'exploited':    play('betrayed'); break;   // human shared, bot took
    case 'exploiter':    play('exploit'); break;    // human took, bot shared
    case 'mutual-take':  play('mutualTake'); break;
    default: break;
  }
}

// ── Ambient pad ──────────────────────────────────────────────────────────────
function startAmbient() {
  if (!ctx || ambient) { if (ctx && enabled) fadeAmbient(0.09, 2); return; }
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 620;
  filter.Q.value = 0.5;
  filter.connect(ambientBus);

  // Open Cmaj voicing. voices[3] is the major third that bends toward minor.
  const voices = [N.C2, N.G3, N.C4, N.E4].map((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 5;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.26;
    o.connect(g); g.connect(filter);
    o.start();
    return { o, g, base: f };
  });

  let lfo = null;
  if (!reduced) {
    // Gentle filter drift so the pad breathes.
    lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 90;
    lfo.connect(lg); lg.connect(filter.frequency);
    lfo.start();
  }

  ambient = { voices, filter, lfo };
  fadeAmbient(0.09, 3);
  applyTension();
}

function fadeAmbient(target, seconds) {
  if (!ctx || !ambientBus) return;
  const g = ambientBus.gain;
  const t = now();
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.0001, g.value), t);
  g.exponentialRampToValueAtTime(Math.max(0.0001, target), t + seconds);
}

export function stopAmbient() { fadeAmbient(0.0001, 0.6); }

// tension 0 → warm major/open; tension 1 → minor/closed.
export function setTension(t) {
  tension = Math.max(0, Math.min(1, t));
  applyTension();
}
export function bumpTension(delta) { setTension(tension + delta); }

function applyTension() {
  if (!ambient || !ctx) return;
  const t = now();
  const lerp = (a, b) => a + (b - a) * tension;
  // Close the filter as tension rises.
  ambient.filter.frequency.cancelScheduledValues(t);
  ambient.filter.frequency.setTargetAtTime(lerp(680, 340), t, 0.8);
  // Bend the major third (E) down toward the minor third (Eb).
  const third = ambient.voices[3];
  if (third) third.o.detune.setTargetAtTime(lerp(0, -95), t, 0.9);
}
