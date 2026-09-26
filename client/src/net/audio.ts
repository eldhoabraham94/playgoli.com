/**
 * One shared AudioContext for voice and sound effects. Browsers only start audio
 * after a tap, so main.tsx calls unlockAudio() on every pointerdown.
 */
let ctx: AudioContext | null = null;

export function getAudio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = getAudio();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

/** Sound (effects + voices) on/off; persisted by the caller. */
let soundOn = true;
export const isSoundOn = () => soundOn;
export function setSoundOn(on: boolean) {
  soundOn = on;
}
