/**
 * Shooter-only voice. The shooter's phone records ~1 s self-contained clips
 * (MediaRecorder is stopped and restarted each clip, so every blob decodes on its
 * own) and sends them over the game socket; the server relays them to everyone
 * else, who decode and queue them back to back. One talker at a time, so a second
 * of latency is fine and there is no echo.
 */
import { VOICE_CLIP_MS, VOICE_MAX_BYTES, VOICE_MIMES, type VoiceMime, type VoiceMsg } from '@goli/shared';
import { getAudio, unlockAudio } from './audio';

const MIC: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
};
/** Clips quieter than this (peak, 0..1) are not sent: no data burnt on silence. */
const SILENCE = 0.04;

export function pickMime(): VoiceMime | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return VOICE_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Can this browser talk? (Mic access needs https or localhost.) */
export function voiceSupported(): boolean {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && pickMime() !== null;
}

/** Ask for mic permission once (from a tap), then let go of the mic straight away. */
export async function requestMicPermission(): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia(MIC);
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export class VoiceSender {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private clipTimer = 0;
  private peakTimer = 0;
  private peak = 0;
  private active = false;

  constructor(private send: (mime: VoiceMime, data: ArrayBuffer) => void) {}

  /** Open the mic and start sending clips. Resolves false if the mic isn't available. */
  async start(): Promise<boolean> {
    if (this.active) return true;
    const mime = pickMime();
    if (!mime) return false;
    this.active = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(MIC);
    } catch {
      this.active = false;
      return false;
    }
    if (!this.active) {
      this.release(); // stopped while we were waiting for the mic
      return false;
    }
    try {
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      src.connect(this.analyser);
      this.peakTimer = window.setInterval(() => (this.peak = Math.max(this.peak, this.level())), 80);
    } catch {
      // No meter / silence detection; clips are still sent.
      this.peak = 1;
    }
    this.recordClip(mime);
    return true;
  }

  private recordClip(mime: VoiceMime) {
    if (!this.active || !this.stream) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 24_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const loud = this.peak >= SILENCE || !this.analyser;
      this.peak = 0;
      const blob = new Blob(chunks, { type: mime });
      if (loud && blob.size > 0 && blob.size <= VOICE_MAX_BYTES) void blob.arrayBuffer().then((buf) => this.send(mime, buf));
    };
    rec.start();
    this.rec = rec;
    this.clipTimer = window.setTimeout(() => {
      rec.stop();
      this.recordClip(mime);
    }, VOICE_CLIP_MS);
  }

  /** Current input level 0..1 (for the "live" meter). */
  level(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let peak = 0;
    for (const v of this.samples) peak = Math.max(peak, Math.abs(v - 128));
    return peak / 128;
  }

  /** Send the last clip and close the mic (the phone's mic indicator goes off). */
  stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.clipTimer);
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.release();
  }

  private release() {
    clearInterval(this.peakTimer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }
}

export class VoicePlayer {
  private nextAt = 0;
  private muted = false;
  private queue: Promise<void> = Promise.resolve();
  private talkTimer = 0;
  private received = 0;
  private decoded = 0;
  onTalking: (id: string | null) => void = () => {};

  /** Browsers only allow sound after a tap: call from a user gesture (any pointerdown). */
  unlock() {
    unlockAudio();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  play(msg: VoiceMsg) {
    this.received++;
    this.stats();
    this.onTalking(msg.from);
    clearTimeout(this.talkTimer);
    this.talkTimer = window.setTimeout(() => this.onTalking(null), 1600);
    if (this.muted) return;
    this.unlock();
    const ctx = getAudio();
    if (!ctx) return;
    // Decode in arrival order, then schedule back to back.
    this.queue = this.queue.then(async () => {
      try {
        const buf = await ctx.decodeAudioData(msg.data.slice(0));
        this.decoded++;
        this.stats();
        const now = ctx.currentTime;
        // Fell far behind (tab was hidden)? Drop the backlog instead of lagging.
        if (this.nextAt - now > 3) this.nextAt = now;
        const at = Math.max(now + 0.05, this.nextAt);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(at);
        this.nextAt = at + buf.duration;
      } catch {
        // A clip this browser can't decode (e.g. an old iPhone and Opus): skip it.
      }
    });
  }

  /** For tests/debugging: `<body data-voice-rx="received/decoded">`. */
  private stats() {
    document.body.dataset.voiceRx = `${this.received}/${this.decoded}`;
  }

  close() {
    clearTimeout(this.talkTimer);
  }
}
