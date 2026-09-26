/**
 * Synthesised sound effects (nothing to download): glass clacks, gritty rolling on
 * soil, a thud when the striker lands, a tock when a goli leaves the ring.
 */
import { getAudio, isSoundOn } from '../net/audio';

let noise: AudioBuffer | null = null;
let grit: AudioBuffer | null = null;
let master: GainNode | null = null;
let roll: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

function ready(): AudioContext | null {
  const ctx = getAudio();
  if (!ctx || ctx.state !== 'running' || !isSoundOn()) return null;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (!grit) {
    // Rolling on soil: brownish noise with little crackles of grit.
    grit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = grit.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.035 * (Math.random() * 2 - 1)) / 1.035;
      const crackle = Math.random() < 0.0025 ? (Math.random() * 2 - 1) * 0.9 : 0;
      d[i] = last * 3.2 + crackle;
    }
  }
  return ctx;
}

function out(ctx: AudioContext, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return master!;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master!);
  return p;
}

/** Glass on glass. strength 0..1, pan -1 (left) .. 1 (right). */
export function clack(strength: number, pan = 0) {
  const ctx = ready();
  if (!ctx || strength < 0.02) return;
  const t = ctx.currentTime;
  const dest = out(ctx, pan);
  const vol = Math.min(1, 0.15 + strength) * 0.5;
  const base = 2300 + Math.random() * 1200;
  for (const [mult, amp, decay] of [
    [1, 1, 0.07],
    [2.76, 0.45, 0.04],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  }
  // The tick at the moment of contact.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * 0.6, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  src.connect(hp).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5, 0.02);
}

/** A marble landing on / leaving the soil. */
export function thud(strength: number, pan = 0) {
  const ctx = ready();
  if (!ctx) return;
  const t = ctx.currentTime;
  const dest = out(ctx, pan);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35 * Math.min(1, 0.3 + strength), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.2);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25 * Math.min(1, 0.3 + strength), t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(lp).connect(ng).connect(dest);
  src.start(t, Math.random() * 0.5, 0.15);
}

/** A goli rolling out over the ring line. */
export function tock(pan = 0) {
  const ctx = ready();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(620, t + 0.08);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(g).connect(out(ctx, pan));
  osc.start(t);
  osc.stop(t + 0.14);
}

/** Continuous gritty rolling; level 0..1 (0 fades it out). */
export function rolling(level: number) {
  const ctx = ready();
  if (!ctx) {
    stopRolling();
    return;
  }
  if (!roll && level > 0.01) {
    const src = ctx.createBufferSource();
    src.buffer = grit;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(master!);
    src.start();
    roll = { src, gain };
  }
  if (roll) roll.gain.gain.setTargetAtTime(Math.min(0.5, level * 0.5), ctx.currentTime, 0.05);
  if (roll && level <= 0.01) stopRolling();
}

function stopRolling() {
  if (!roll) return;
  const r = roll;
  roll = null;
  const ctx = getAudio();
  if (ctx) r.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
  setTimeout(() => r.src.stop(), 300);
}
