export class PermalinkThrottle {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      const retryAfter = Math.max(1, Math.ceil((this.windowMs - (now - recent[0]!)) / 1000));
      this.hits.set(key, recent);
      return { ok: false, retryAfter };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true };
  }
}
