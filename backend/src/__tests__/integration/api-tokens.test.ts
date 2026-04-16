import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedScopes } from "../../../prisma/seeders/scopes.js";
import { hashToken, TOKEN_PREFIX } from "../../services/token.service.js";

const prisma = new PrismaClient();

async function clearApiTokens() {
  await prisma.apiTokenScope.deleteMany({});
  await prisma.apiToken.deleteMany({});
}

describe("api tokens", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedScopes(prisma);
  });

  afterAll(async () => {
    await clearApiTokens();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearApiTokens();
  });

  describe("POST /api/v1/auth/tokens", () => {
    it("creates a token and returns plaintext exactly once", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "ci-runner", scopes: ["tasks:read", "tasks:write"] },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.token).toMatch(new RegExp(`^${TOKEN_PREFIX}`));
      expect(body.id).toBeDefined();
      expect(body.name).toBe("ci-runner");
      expect(body.scopes).toEqual(expect.arrayContaining(["tasks:read", "tasks:write"]));
    });

    it("stores only the hash, never the plaintext", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "t1", scopes: ["tasks:read"] },
      });
      const { token: plaintext, id } = response.json();
      const stored = await prisma.apiToken.findUnique({ where: { id } });
      expect(stored).not.toBeNull();
      expect(stored!.tokenHash).toBe(hashToken(plaintext));
      // The stored row has no column that could contain the plaintext.
      expect(JSON.stringify(stored)).not.toContain(plaintext);
    });

    it("rejects unknown scopes with 400", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "bad", scopes: ["tasks:read", "tasks:nuke"] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("UNKNOWN_SCOPE");
    });

    it("requires name and scopes", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const noName = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { scopes: ["tasks:read"] },
      });
      expect(noName.statusCode).toBe(400);

      const noScopes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "x", scopes: [] },
      });
      expect(noScopes.statusCode).toBe(400);
    });

    it("forbids creating a token using an API token (only JWT sessions allowed)", async () => {
      const app = await buildApp();
      // Create a token with JWT first
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const create = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "bootstrap", scopes: ["tasks:read"] },
      });
      const { token: plaintext } = create.json();

      // Now try to create another token using that API token
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${plaintext}` },
        payload: { name: "nope", scopes: ["tasks:read"] },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("API_TOKEN_FORBIDDEN");
    });
  });

  describe("GET /api/v1/auth/tokens", () => {
    it("lists the authenticated user's tokens without secrets", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "alpha", scopes: ["tasks:read"] },
      });
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "beta", scopes: ["tasks:read", "tasks:write"] },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      for (const t of body.data) {
        expect(t.token).toBeUndefined();
        expect(t.tokenHash).toBeUndefined();
        expect(t.name).toBeDefined();
        expect(Array.isArray(t.scopes)).toBe(true);
      }
    });

    it("does not leak tokens owned by other users", async () => {
      const app = await buildApp();
      const engineerJwt = mintTestToken(TEST_ENGINEER_ID);
      const userJwt = mintTestToken(TEST_USER_ID);
      await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${engineerJwt}` },
        payload: { name: "engineer-token", scopes: ["tasks:read"] },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${userJwt}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(0);
    });
  });

  describe("DELETE /api/v1/auth/tokens/:id", () => {
    it("revokes the token by setting revoked_at", async () => {
      const app = await buildApp();
      const jwt = mintTestToken(TEST_ENGINEER_ID);
      const create = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "to-revoke", scopes: ["tasks:read"] },
      });
      const { id } = create.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/tokens/${id}`,
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(response.statusCode).toBe(204);

      const stored = await prisma.apiToken.findUnique({ where: { id } });
      expect(stored!.revokedAt).not.toBeNull();
    });

    it("404s when the token is owned by another user", async () => {
      const app = await buildApp();
      const engineerJwt = mintTestToken(TEST_ENGINEER_ID);
      const userJwt = mintTestToken(TEST_USER_ID);
      const create = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${engineerJwt}` },
        payload: { name: "mine", scopes: ["tasks:read"] },
      });
      const { id } = create.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/tokens/${id}`,
        headers: { authorization: `Bearer ${userJwt}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("Bearer round-trip with API token", () => {
    async function mintApiToken(scopes: string[], userId = TEST_ENGINEER_ID) {
      const app = await buildApp();
      const jwt = mintTestToken(userId);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${jwt}` },
        payload: { name: "round-trip", scopes },
      });
      return { plaintext: res.json().token as string, id: res.json().id as string };
    }

    it("allows a scoped read request", async () => {
      const app = await buildApp();
      const { plaintext } = await mintApiToken(["tasks:read"]);
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
    });

    it("rejects a write attempt when only tasks:read is granted", async () => {
      const app = await buildApp();
      const { plaintext } = await mintApiToken(["tasks:read"]);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
        payload: {
          flow: "bug",
          title: "x",
          projectIds: ["00000000-0000-0000-0000-000000000000"],
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("INSUFFICIENT_SCOPE");
    });

    it("rejects a revoked token", async () => {
      const app = await buildApp();
      const { plaintext, id } = await mintApiToken(["tasks:read"]);
      await prisma.apiToken.update({
        where: { id },
        data: { revokedAt: new Date() },
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it("rejects an expired token", async () => {
      const app = await buildApp();
      const { plaintext, id } = await mintApiToken(["tasks:read"]);
      await prisma.apiToken.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it("intersects with team permissions: user team cannot write tasks even with tasks:write scope", async () => {
      // TEST_USER_ID is on the "user" team. "user" lacks create on "improvement".
      const app = await buildApp();
      const { plaintext } = await mintApiToken(["tasks:write"], TEST_USER_ID);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${plaintext}` },
        payload: {
          flow: "improvement",
          title: "x",
          projectIds: ["00000000-0000-0000-0000-000000000000"],
        },
      });
      // Scope check passes, but team permission rejects with FORBIDDEN.
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    });

    it("rejects unknown bearer token that looks like an API token", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${TOKEN_PREFIX}nonsensesecret123456789012` },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
