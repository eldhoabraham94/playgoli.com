type Clock = () => number;

/** Smooth per-socket message limit: `burst` messages at once, refilling at `perSec`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private burst: number,
    private perSec: number,
    private now: Clock = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  take(n = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSec);
    this.last = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** At most `max` hits per key within a sliding `windowMs`. */
export class WindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
    private now: Clock = Date.now,
  ) {}

  hit(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    const allowed = recent.length < this.max;
    if (allowed) recent.push(t);
    this.hits.set(key, recent);
    return allowed;
  }

  /** Drop keys with no recent hits (call periodically). */
  sweep(): void {
    const t = this.now();
    for (const [k, v] of this.hits) if (v.every((x) => t - x >= this.windowMs)) this.hits.delete(k);
  }
}
