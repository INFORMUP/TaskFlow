import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

const NEW_USER_ID = "00000000-0000-0000-0000-0000000000ff";
const NEW_USER_EMAIL = "no-team-user@test.com";

describe("users and teams API", () => {
  let engineerToken: string;
  let userToken: string;
  let noTeamToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);

    // Fresh user with NO team memberships for /me and /me/teams tests
    await prisma.userTeam.deleteMany({ where: { userId: NEW_USER_ID } });
    await prisma.orgMember.deleteMany({ where: { userId: NEW_USER_ID } });
    await prisma.user.deleteMany({ where: { id: NEW_USER_ID } });
    await prisma.user.create({
      data: {
        id: NEW_USER_ID,
        email: NEW_USER_EMAIL,
        displayName: "No Team User",
        actorType: "human",
        status: "active",
      },
    });
    await prisma.orgMember.create({
      data: { orgId: DEFAULT_ORG_ID, userId: NEW_USER_ID, role: "member" },
    });
    noTeamToken = mintTestToken(NEW_USER_ID);
  });

  afterAll(async () => {
    await prisma.userTeam.deleteMany({ where: { userId: NEW_USER_ID } });
    await prisma.orgMember.deleteMany({ where: { userId: NEW_USER_ID } });
    await prisma.user.deleteMany({ where: { id: NEW_USER_ID } });
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

  describe("GET /api/v1/users/me", () => {
    it("returns the current user with their teams", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/me",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(TEST_ENGINEER_ID);
      expect(body.email).toBe("engineer@test.com");
      expect(body.displayName).toBe("Test Engineer");
      expect(body.actorType).toBe("human");
      expect(body.status).toBe("active");
      expect(body.teams).toHaveLength(1);
      expect(body.teams[0].slug).toBe("engineer");
      expect(body.teams[0].name).toBe("Engineer");
      expect(body.teams[0].isPrimary).toBe(true);
      expect(body.teams[0].id).toBeDefined();
    });

    it("returns empty teams array for a user with no memberships", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/users/me",
        headers: { authorization: `Bearer ${noTeamToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(NEW_USER_ID);
      expect(body.teams).toEqual([]);
    });

    it("returns 401 without a token", async () => {
      const app = await buildApp();
      const response = await app.inject({ method: "GET", url: "/api/v1/users/me" });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("PUT /api/v1/users/me/teams", () => {
    it("sets the authenticated user's teams from scratch", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: {
          teams: [
            { slug: "product", isPrimary: true },
            { slug: "engineer", isPrimary: false },
          ],
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.teams).toHaveLength(2);
      const slugs = body.teams.map((t: any) => t.slug).sort();
      expect(slugs).toEqual(["engineer", "product"]);
      const primary = body.teams.find((t: any) => t.isPrimary);
      expect(primary.slug).toBe("product");
    });

    it("replaces prior memberships (does not append)", async () => {
      const app = await buildApp();
      await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: { teams: [{ slug: "user", isPrimary: true }] },
      });

      const rows = await prisma.userTeam.findMany({
        where: { userId: NEW_USER_ID },
        include: { team: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].team.slug).toBe("user");
      expect(rows[0].isPrimary).toBe(true);
    });

    it("returns 400 when teams list is empty", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: { teams: [] },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when no team is marked primary", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: { teams: [{ slug: "engineer", isPrimary: false }] },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when multiple teams are marked primary", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: {
          teams: [
            { slug: "engineer", isPrimary: true },
            { slug: "product", isPrimary: true },
          ],
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 400 when an unknown slug is provided", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        headers: { authorization: `Bearer ${noTeamToken}` },
        payload: { teams: [{ slug: "nonexistent-team", isPrimary: true }] },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 401 without a token", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/users/me/teams",
        payload: { teams: [{ slug: "engineer", isPrimary: true }] },
      });
      expect(response.statusCode).toBe(401);
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
