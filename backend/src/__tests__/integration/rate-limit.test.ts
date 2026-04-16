import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_AGENT_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedScopes } from "../../../prisma/seeders/scopes.js";
import { TIER_LIMITS } from "../../services/rate-limit.service.js";

const prisma = new PrismaClient();

async function clearApiTokens() {
  await prisma.apiTokenScope.deleteMany({});
  await prisma.apiToken.deleteMany({});
}

async function mintApiToken(
  app: any,
  userId: string,
  opts?: { integration?: boolean; scopes?: string[] }
): Promise<string> {
  const jwt = mintTestToken(userId);
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/tokens",
    headers: { authorization: `Bearer ${jwt}` },
    payload: {
      name: `rl-${Math.random().toString(36).slice(2, 8)}`,
      scopes: opts?.scopes ?? ["tasks:read"],
      integration: opts?.integration ?? false,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().token as string;
}

describe("rate limiting", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedScopes(prisma);
  });

  beforeEach(async () => {
    await clearApiTokens();
  });

  afterAll(async () => {
    await clearApiTokens();
    await prisma.$disconnect();
  });

  describe("response headers", () => {
    it("sets X-RateLimit-Limit/Remaining/Reset on every authenticated response", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe(String(TIER_LIMITS.human));
      expect(Number(res.headers["x-ratelimit-remaining"])).toBe(TIER_LIMITS.human - 1);
      expect(Number(res.headers["x-ratelimit-reset"])).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("decrements remaining across consecutive requests from the same principal", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const first = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${jwt}` },
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(Number(first.headers["x-ratelimit-remaining"])).toBe(TIER_LIMITS.human - 1);
      expect(Number(second.headers["x-ratelimit-remaining"])).toBe(TIER_LIMITS.human - 2);
    });

    it("omits rate limit headers on unauthenticated (public) endpoints", async () => {
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
    });
  });

  describe("tier selection", () => {
    it("uses the human tier limit for JWT sessions", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(res.headers["x-ratelimit-limit"]).toBe(String(TIER_LIMITS.human));
    });

    it("uses the agent tier limit for API tokens owned by agent users", async () => {
      const app = await buildApp();
      const plaintext = await mintApiToken(app, TEST_AGENT_ID, { integration: false });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe(String(TIER_LIMITS.agent));
    });

    it("uses the integration tier limit for API tokens owned by human users", async () => {
      const app = await buildApp();
      const plaintext = await mintApiToken(app, TEST_ENGINEER_ID, { integration: false });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBe(String(TIER_LIMITS.integration));
    });

    it("uses the integration tier for agent tokens explicitly flagged as integration", async () => {
      const app = await buildApp();
      const plaintext = await mintApiToken(app, TEST_AGENT_ID, { integration: true });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.headers["x-ratelimit-limit"]).toBe(String(TIER_LIMITS.integration));
    });

    it("gives separate buckets to different API tokens owned by the same user", async () => {
      const app = await buildApp();
      const tokenA = await mintApiToken(app, TEST_ENGINEER_ID);
      const tokenB = await mintApiToken(app, TEST_ENGINEER_ID);

      const a1 = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${tokenA}` },
      });
      const b1 = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(Number(a1.headers["x-ratelimit-remaining"])).toBe(TIER_LIMITS.integration - 1);
      expect(Number(b1.headers["x-ratelimit-remaining"])).toBe(TIER_LIMITS.integration - 1);
    });
  });

  describe("429 behavior", () => {
    it("returns 429 with Retry-After once the integration limit is exhausted", async () => {
      const app = await buildApp();
      const plaintext = await mintApiToken(app, TEST_ENGINEER_ID, { integration: false });

      // Exhaust the 60-req/min integration bucket.
      for (let i = 0; i < TIER_LIMITS.integration; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/api/v1/tasks",
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(200);
      }

      const blocked = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
    });
  });
});

describe("agent user seeding", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seeds triage-bot and investigator-bot as agent actors on the Agent team", async () => {
    const { seedAgentUsers } = await import("../../../prisma/seeders/agent-users.js");
    const { seedUuid } = await import("../../../prisma/seeders/common.js");
    await seedAgentUsers(prisma);

    const agentTeamId = seedUuid("team", "agent");
    const triageId = seedUuid("user", "agent:triage-bot");
    const investigatorId = seedUuid("user", "agent:investigator-bot");

    const triage = await prisma.user.findUnique({ where: { id: triageId } });
    const investigator = await prisma.user.findUnique({ where: { id: investigatorId } });
    expect(triage?.actorType).toBe("agent");
    expect(investigator?.actorType).toBe("agent");
    expect(triage?.email).toBeNull();

    const triageMembership = await prisma.userTeam.findFirst({
      where: { userId: triageId, teamId: agentTeamId },
    });
    expect(triageMembership).not.toBeNull();
  });

  it("is idempotent (re-running skips all)", async () => {
    const { seedAgentUsers } = await import("../../../prisma/seeders/agent-users.js");
    const first = await seedAgentUsers(prisma);
    const second = await seedAgentUsers(prisma);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created + first.skipped);
  });

  it("lets a seeded agent be assigned to a task and attribute a transition", async () => {
    const { seedAgentUsers } = await import("../../../prisma/seeders/agent-users.js");
    const { seedUuid } = await import("../../../prisma/seeders/common.js");
    const { seedTestProjects, TEST_PROJECT_ID } = await import(
      "../helpers/seed-test-projects.js"
    );
    await seedAgentUsers(prisma);
    await seedTestProjects(prisma);

    const app = await buildApp();
    const engineerJwt = mintTestToken(TEST_ENGINEER_ID);
    const triageId = seedUuid("user", "agent:triage-bot");

    const taskRes = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerJwt}` },
      payload: {
        projectIds: [TEST_PROJECT_ID],
        flow: "bug",
        title: "agent-assignable",
      },
    });
    expect(taskRes.statusCode).toBe(201);
    const task = taskRes.json();

    // Assign to seeded triage-bot.
    const assignRes = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${task.id}/assign`,
      headers: { authorization: `Bearer ${engineerJwt}` },
      payload: { assigneeId: triageId },
    });
    expect(assignRes.statusCode).toBe(200);
    const assigned = await prisma.task.findUnique({ where: { id: task.id } });
    expect(assigned?.assigneeId).toBe(triageId);

    // Have the agent drive a transition via an API token on its account.
    const engineerTokenRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/tokens",
      headers: { authorization: `Bearer ${engineerJwt}` },
      payload: { name: "seed-agent", scopes: ["transitions:write", "tasks:read"] },
    });
    // An engineer-owned token can't act on behalf of the agent — we authenticate
    // directly as the triage-bot by minting a JWT (seeded user is active).
    const triageJwt = mintTestToken(triageId);
    const transitionRes = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${task.id}/transitions`,
      headers: { authorization: `Bearer ${triageJwt}` },
      payload: { toStatus: "investigate", note: "automated triage" },
    });
    expect(transitionRes.statusCode).toBe(201);

    const history = await prisma.taskTransition.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: "asc" },
    });
    const agentTransition = history.find((t) => t.actorId === triageId);
    expect(agentTransition).toBeDefined();
    expect(agentTransition?.actorType).toBe("agent");
    expect(engineerTokenRes.statusCode).toBe(201); // sanity check
  });
});
