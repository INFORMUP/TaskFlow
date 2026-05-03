import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
  TEST_AGENT_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedSampleTasks } from "../../../prisma/seeders/sample-tasks.js";
import { seedUuid } from "../../../prisma/seeders/common.js";

const prisma = new PrismaClient();

// IDs of the seeded personas — must match sample-tasks.ts
const USER_ID_MAX = "a4faad20-55aa-46e1-98c2-2bb8bb6647d8";
const USER_ID_PRIYA = seedUuid("user", "priya");
const USER_ID_SAM = seedUuid("user", "sam");
const USER_ID_ATLAS = seedUuid("user", "atlas");

async function resetSeededTaskData() {
  await prisma.taskTransition.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
}

describe("seeded sample task visibility", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
    await resetSeededTaskData();
    await seedSampleTasks(prisma);
  });

  afterAll(async () => {
    await resetSeededTaskData();
    await prisma.$disconnect();
  });

  describe("what each seeded persona sees (demo content delivery)", () => {
    it("Max (engineer) sees all 28 seeded tasks", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(USER_ID_MAX)}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(28);
    });

    it("Priya (product) sees all 28 seeded tasks", async () => {
      // Product has view:all on every flow — the 'comment only' restriction
      // on improvements is an action permission, not a view scope.
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(USER_ID_PRIYA)}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(28);
    });

    it("Sam (user team) sees exactly the 5 tasks they created", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(USER_ID_SAM)}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(5);
      // All visible tasks were created by Sam
      for (const task of body.data) {
        expect(task.creator.id).toBe(USER_ID_SAM);
      }
      // Sam should not see any improvements (view scope: none on improvement)
      expect(body.data.every((t: any) => t.flow.slug !== "improvement")).toBe(true);
    });

    it("Atlas (agent team) sees exactly the 4 tasks assigned to them", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(USER_ID_ATLAS)}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(4);
      // All visible tasks are assigned to Atlas
      for (const task of body.data) {
        expect(task.assignee?.id).toBe(USER_ID_ATLAS);
      }
    });
  });

  describe("what a freshly OAuth'd user on team X sees (view scope enforcement)", () => {
    it("fresh engineer-team user sees all 28 seeded tasks", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(TEST_ENGINEER_ID)}` },
      });
      expect(response.json().data).toHaveLength(28);
    });

    it("fresh product-team user sees all 28 seeded tasks", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(TEST_PRODUCT_ID)}` },
      });
      expect(response.json().data).toHaveLength(28);
    });

    it("fresh user-team user sees 0 seeded tasks (own_public scope)", async () => {
      // A fresh user who just picked 'user' in the team modal hasn't
      // created anything, so they correctly see nothing. To actually demo the
      // user experience, the viewer needs to create tasks themselves.
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(TEST_USER_ID)}` },
      });
      expect(response.json().data).toHaveLength(0);
    });

    it("fresh agent-team user sees 0 seeded tasks (nothing assigned to them)", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?limit=100",
        headers: { authorization: `Bearer ${mintTestToken(TEST_AGENT_ID)}` },
      });
      expect(response.json().data).toHaveLength(0);
    });
  });

  describe("seeded personas have the expected UserTeam rows", () => {
    it("creates exactly one UserTeam row per persona, all marked primary", async () => {
      const personas = [
        { id: USER_ID_MAX, slug: "engineer" },
        { id: USER_ID_PRIYA, slug: "product" },
        { id: USER_ID_SAM, slug: "user" },
        { id: USER_ID_ATLAS, slug: "agent" },
      ];

      for (const p of personas) {
        const rows = await prisma.userTeam.findMany({
          where: { userId: p.id },
          include: { team: true },
        });
        expect(rows, `${p.id} should have exactly one team row`).toHaveLength(1);
        expect(rows[0].team.slug).toBe(p.slug);
        expect(rows[0].isPrimary).toBe(true);
      }
    });
  });
});
