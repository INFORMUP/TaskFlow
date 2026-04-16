import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  RateLimiter,
  TIER_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  rateLimitKey,
  resolveTier,
} from "../services/rate-limit.service.js";

export const limiter = new RateLimiter();

function isAuthenticated(request: FastifyRequest): boolean {
  return request.user !== null && typeof request.user === "object" && "id" in request.user;
}

export const rateLimitPlugin = fp(async function rateLimitPlugin(fastify: FastifyInstance) {
  // Buckets are in-memory and per-process; reset on app creation so each test's
  // buildApp() starts with a clean slate without coupling every test to the plugin.
  limiter.reset();

  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!isAuthenticated(request)) return;

    const tier = resolveTier({
      apiTokenId: request.user.apiTokenId,
      actorType: request.user.actorType,
      integrationToken: request.user.integrationToken,
    });
    const limit = TIER_LIMITS[tier];
    const key = rateLimitKey({ userId: request.user.id, apiTokenId: request.user.apiTokenId });
    const result = limiter.consume(key, limit);

    const resetSeconds = Math.ceil(result.resetMs / 1000);
    const resetEpoch = Math.ceil((Date.now() + result.resetMs) / 1000);

    reply.header("X-RateLimit-Limit", String(result.limit));
    reply.header("X-RateLimit-Remaining", String(result.remaining));
    reply.header("X-RateLimit-Reset", String(resetEpoch));

    if (!result.allowed) {
      reply.header("Retry-After", String(resetSeconds));
      return reply.status(429).send({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded for ${tier} tier (${limit} req/min). Retry in ${resetSeconds}s.`,
        },
      });
    }
  });
});

export function resetRateLimiter(): void {
  limiter.reset();
}

export { RATE_LIMIT_WINDOW_MS };
