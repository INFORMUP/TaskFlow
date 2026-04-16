export type RateLimitTier = "human" | "agent" | "integration";

export const TIER_LIMITS: Record<RateLimitTier, number> = {
  human: 100,
  agent: 300,
  integration: 60,
};

export const RATE_LIMIT_WINDOW_MS = 60_000;

export function resolveTier(session: {
  apiTokenId: string | null;
  actorType: string;
  integrationToken: boolean;
}): RateLimitTier {
  if (session.apiTokenId === null) return "human";
  if (session.integrationToken) return "integration";
  if (session.actorType === "agent") return "agent";
  return "integration";
}

export function rateLimitKey(session: {
  userId: string;
  apiTokenId: string | null;
}): string {
  return session.apiTokenId !== null
    ? `token:${session.apiTokenId}`
    : `user:${session.userId}`;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly clock: () => number;

  constructor(options?: { windowMs?: number; clock?: () => number }) {
    this.windowMs = options?.windowMs ?? RATE_LIMIT_WINDOW_MS;
    this.clock = options?.clock ?? Date.now;
  }

  consume(key: string, limit: number): RateLimitResult {
    const now = this.clock();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetMs: this.windowMs,
      };
    }

    const resetMs = this.windowMs - (now - bucket.windowStart);

    if (bucket.count >= limit) {
      return { allowed: false, limit, remaining: 0, resetMs };
    }

    bucket.count += 1;
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetMs,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
