/**
 * Fixed-window, in-memory rate limiter.
 *
 * Limitation: state lives in one server instance. On serverless platforms
 * each instance counts separately, so the effective limit is higher under
 * load. It is a first line of defence; add a shared store (or an edge/WAF
 * rule) before high traffic. See docs/ai-guardian.md.
 */
export type RateLimitRule = { limit: number; windowMs: number };

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }[]>();

  constructor(
    private readonly rules: RateLimitRule[],
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records a hit for `key`; returns whether it is allowed and when to retry. */
  check(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = this.now();
    if (this.hits.size > this.maxKeys) this.hits.clear(); // bound memory under abuse
    const windows = this.hits.get(key) ?? this.rules.map((rule) => ({ count: 0, resetAt: now + rule.windowMs }));
    windows.forEach((window, index) => {
      if (now >= window.resetAt) {
        window.count = 0;
        window.resetAt = now + (this.rules[index]?.windowMs ?? 0);
      }
    });
    const blocked = windows.findIndex((window, index) => window.count >= (this.rules[index]?.limit ?? Infinity));
    if (blocked !== -1) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(((windows[blocked]?.resetAt ?? now) - now) / 1000)) };
    }
    windows.forEach((window) => (window.count += 1));
    this.hits.set(key, windows);
    return { allowed: true };
  }
}

/** Best-effort client address from proxy headers (Vercel sets x-real-ip / x-forwarded-for). */
export function clientAddress(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
