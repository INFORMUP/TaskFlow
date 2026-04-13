import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";

const prisma = new PrismaClient();

describe("projects API", () => {
  let engineerToken: string;
  let productToken: string;
  let userToken: string;
  let engineerTeamId: string;
  let productTeamId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
    userToken = mintTestToken(TEST_USER_ID);
    engineerTeamId = seedUuid("team", "engineer");
    productTeamId = seedUuid("team", "product");
  });

  beforeEach(async () => {
    await prisma.projectTeam.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.project.deleteMany();
  });

  afterAll(async () => {
    await prisma.projectTeam.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/projects", () => {
    it("creates a project as engineer (admin)", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "REP",
          name: "Reportal",
          ownerUserId: TEST_ENGINEER_ID,
          defaultAssigneeUserId: TEST_ENGINEER_ID,
          teamIds: [engineerTeamId, productTeamId],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.key).toBe("REP");
      expect(body.name).toBe("Reportal");
      expect(body.owner.id).toBe(TEST_ENGINEER_ID);
      expect(body.defaultAssignee.id).toBe(TEST_ENGINEER_ID);
      expect(body.teams).toHaveLength(2);
    });

    it("rejects non-admin users with 403", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          key: "REP",
          name: "Reportal",
          ownerUserId: TEST_USER_ID,
          teamIds: [engineerTeamId],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects invalid key format with 400", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "lowercase",
          name: "Bad",
          ownerUserId: TEST_ENGINEER_ID,
          teamIds: [engineerTeamId],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_KEY");
    });

    it("rejects duplicate key with 409", async () => {
      const app = await buildApp();
      const payload = {
        key: "WEB",
        name: "Website",
        ownerUserId: TEST_ENGINEER_ID,
        teamIds: [engineerTeamId],
      };
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload,
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload,
      });
      expect(res.statusCode).toBe(409);
    });

    it("rejects empty teamIds with 400", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "DASH",
          name: "Dashboard",
          ownerUserId: TEST_ENGINEER_ID,
          teamIds: [],
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/projects", () => {
    it("lists only active projects by default", async () => {
      const app = await buildApp();
      await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { key: "A1", name: "A1", ownerUserId: TEST_ENGINEER_ID, teamIds: [engineerTeamId] },
      });
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { key: "A2", name: "A2", ownerUserId: TEST_ENGINEER_ID, teamIds: [engineerTeamId] },
      });
      const id = createRes.json().id;
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${id}/archive`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const keys = res.json().data.map((p: any) => p.key);
      expect(keys).toEqual(["A1"]);

      const resAll = await app.inject({
        method: "GET",
        url: "/api/v1/projects?archived=true",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(resAll.json().data).toHaveLength(2);
    });
  });

  describe("PATCH /api/v1/projects/:id", () => {
    it("allows owner (non-admin) to edit own project", async () => {
      const app = await buildApp();
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "OWN",
          name: "Old",
          ownerUserId: TEST_USER_ID,
          teamIds: [engineerTeamId],
        },
      });
      const id = created.json().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${id}`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { name: "Renamed" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Renamed");
    });

    it("rejects non-owner non-admin with 403", async () => {
      const app = await buildApp();
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "XYZ",
          name: "X",
          ownerUserId: TEST_ENGINEER_ID,
          teamIds: [engineerTeamId],
        },
      });
      const id = created.json().id;
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${id}`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { name: "Nope" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("project team membership", () => {
    it("add and remove teams, guarding last team", async () => {
      const app = await buildApp();
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          key: "TM",
          name: "TeamMgmt",
          ownerUserId: TEST_ENGINEER_ID,
          teamIds: [engineerTeamId],
        },
      });
      const id = created.json().id;

      const add = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${id}/teams`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { teamId: productTeamId },
      });
      expect(add.statusCode).toBe(200);
      expect(add.json().teams).toHaveLength(2);

      const remove = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${id}/teams/${productTeamId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json().teams).toHaveLength(1);

      const removeLast = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${id}/teams/${engineerTeamId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(removeLast.statusCode).toBe(400);
      expect(removeLast.json().error.code).toBe("LAST_TEAM");
    });
  });
});
