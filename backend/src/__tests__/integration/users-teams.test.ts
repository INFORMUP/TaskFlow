import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

describe("users and teams API", () => {
  let engineerToken: string;
  let userToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("GET /api/v1/users", () => {
    it("returns user list for engineer", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBeGreaterThanOrEqual(4);
      expect(body.data[0].displayName).toBeDefined();
      expect(body.data[0].teams).toBeDefined();
    });

    it("returns 403 for non-engineer", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users",
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("GET /api/v1/teams", () => {
    it("returns all teams", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBeGreaterThanOrEqual(4);
      expect(body.data.map((t: any) => t.slug)).toEqual(
        expect.arrayContaining(["engineer", "product", "user", "agent"])
      );
    });
  });

  describe("GET /api/v1/teams/:id/members", () => {
    it("returns team members", async () => {
      const app = await buildApp();
      // Get engineer team id
      const teamsRes = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const engineerTeam = teamsRes.json().data.find((t: any) => t.slug === "engineer");

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/teams/${engineerTeam.id}/members`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
