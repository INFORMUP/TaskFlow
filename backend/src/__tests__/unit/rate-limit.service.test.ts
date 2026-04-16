import { describe, it, expect, beforeEach } from "vitest";
import {
  RateLimiter,
  resolveTier,
  TIER_LIMITS,
  rateLimitKey,
} from "../../services/rate-limit.service.js";

describe("resolveTier", () => {
  it("returns human for JWT sessions", () => {
    expect(resolveTier({ apiTokenId: null, actorType: "human", integrationToken: false })).toBe("human");
  });

  it("returns agent for API-token sessions on agent users", () => {
    expect(resolveTier({ apiTokenId: "t1", actorType: "agent", integrationToken: false })).toBe("agent");
  });

  it("returns integration for API-token sessions on human users", () => {
    expect(resolveTier({ apiTokenId: "t1", actorType: "human", integrationToken: false })).toBe("integration");
  });

  it("downgrades agent tokens flagged as integration to the integration tier", () => {
    expect(resolveTier({ apiTokenId: "t1", actorType: "agent", integrationToken: true })).toBe("integration");
  });
});

describe("TIER_LIMITS", () => {
  it("matches the documented tier ceilings", () => {
    expect(TIER_LIMITS.human).toBe(100);
    expect(TIER_LIMITS.agent).toBe(300);
    expect(TIER_LIMITS.integration).toBe(60);
  });
});

describe("rateLimitKey", () => {
  it("keys API-token requests by token id so different tokens get separate buckets", () => {
    expect(rateLimitKey({ userId: "u", apiTokenId: "tok-1" })).toBe("token:tok-1");
    expect(rateLimitKey({ userId: "u", apiTokenId: "tok-2" })).toBe("token:tok-2");
  });

  it("keys JWT requests by user id", () => {
    expect(rateLimitKey({ userId: "u", apiTokenId: null })).toBe("user:u");
  });
});

describe("RateLimiter", () => {
  let limiter: RateLimiter;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new RateLimiter({ windowMs: 60_000, clock: () => now });
  });

  it("allows requests under the limit and decrements remaining", () => {
    const a = limiter.consume("k", 3);
    expect(a.allowed).toBe(true);
    expect(a.limit).toBe(3);
    expect(a.remaining).toBe(2);
    expect(a.resetMs).toBe(60_000);

    const b = limiter.consume("k", 3);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(1);

    const c = limiter.consume("k", 3);
    expect(c.allowed).toBe(true);
    expect(c.remaining).toBe(0);
  });

  it("rejects over-limit requests with remaining=0 and a retry delay", () => {
    limiter.consume("k", 2);
    limiter.consume("k", 2);
    const blocked = limiter.consume("k", 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("resets the window after windowMs elapses", () => {
    limiter.consume("k", 1);
    const blocked = limiter.consume("k", 1);
    expect(blocked.allowed).toBe(false);

    now += 60_000;
    const renewed = limiter.consume("k", 1);
    expect(renewed.allowed).toBe(true);
    expect(renewed.remaining).toBe(0);
  });

  it("tracks different keys independently", () => {
    limiter.consume("a", 1);
    const blockedA = limiter.consume("a", 1);
    expect(blockedA.allowed).toBe(false);

    const firstB = limiter.consume("b", 1);
    expect(firstB.allowed).toBe(true);
  });

  it("exposes resetMs counting down within a window", () => {
    const first = limiter.consume("k", 5);
    expect(first.resetMs).toBe(60_000);

    now += 15_000;
    const second = limiter.consume("k", 5);
    expect(second.resetMs).toBe(45_000);
  });
});
