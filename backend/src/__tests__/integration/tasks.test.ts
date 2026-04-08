import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
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

const prisma = new PrismaClient();

describe("tasks API", () => {
  let engineerToken: string;
  let productToken: string;
  let userToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/tasks", () => {
    it("creates a bug task and returns 201 with display_id", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          flow: "bug",
          title: "Login fails on Safari",
          description: "Blank screen after OAuth redirect",
          priority: "high",
        },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.displayId).toMatch(/^BUG-\d+$/);
      expect(body.title).toBe("Login fails on Safari");
      expect(body.priority).toBe("high");
      expect(body.currentStatus).toBeDefined();
      expect(body.currentStatus.slug).toBe("triage");
    });

    it("creates a feature task with FEAT prefix", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "feature", title: "Dark mode", priority: "medium" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().displayId).toMatch(/^FEAT-\d+$/);
      expect(response.json().currentStatus.slug).toBe("discuss");
    });

    it("creates an improvement task with IMP prefix", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "improvement", title: "Refactor auth", priority: "low" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().displayId).toMatch(/^IMP-\d+$/);
      expect(response.json().currentStatus.slug).toBe("propose");
    });

    it("increments display_id per flow", async () => {
      const app = await buildApp();
      const r1 = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Bug 1", priority: "low" },
      });
      const r2 = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Bug 2", priority: "low" },
      });
      const id1 = parseInt(r1.json().displayId.split("-")[1]);
      const id2 = parseInt(r2.json().displayId.split("-")[1]);
      expect(id2).toBe(id1 + 1);
    });

    it("returns 401 without auth", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        payload: { flow: "bug", title: "Test", priority: "low" },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when user tries to create improvement", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${userToken}` },
        payload: { flow: "improvement", title: "Test", priority: "low" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("returns 400 with missing title", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", priority: "low" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 422 with invalid flow", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "invalid", title: "Test", priority: "low" },
      });
      expect(response.statusCode).toBe(422);
    });

    it("creates initial transition record", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Test", priority: "low" },
      });
      const task = createRes.json();
      const transitions = await prisma.taskTransition.findMany({
        where: { taskId: task.id },
      });
      expect(transitions).toHaveLength(1);
      expect(transitions[0].fromStatusId).toBeNull();
      expect(transitions[0].note).toBe("Task created");
    });
  });

  describe("GET /api/v1/tasks", () => {
    it("returns paginated task list", async () => {
      const app = await buildApp();
      // Create some tasks first
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Bug 1", priority: "low" },
      });
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Bug 2", priority: "high" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toBeDefined();
    });

    it("filters by flow", async () => {
      const app = await buildApp();
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Bug", priority: "low" },
      });
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "feature", title: "Feature", priority: "low" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?flow=bug",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Bug");
    });

    it("filters by priority", async () => {
      const app = await buildApp();
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "High Bug", priority: "high" },
      });
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Low Bug", priority: "low" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?priority=high",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("High Bug");
    });

    it("excludes soft-deleted tasks", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "To Delete", priority: "low" },
      });
      const task = createRes.json();

      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.json().data).toHaveLength(0);
    });
  });

  describe("GET /api/v1/tasks/:id", () => {
    it("returns task detail", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Detail Test", description: "A bug", priority: "medium" },
      });
      const task = createRes.json();

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.title).toBe("Detail Test");
      expect(body.description).toBe("A bug");
      expect(body.flow).toBeDefined();
      expect(body.currentStatus).toBeDefined();
    });

    it("returns 404 for non-existent task", async () => {
      const app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/tasks/00000000-0000-0000-0000-000000000099",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/tasks/:id", () => {
    it("updates task title", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Original", priority: "low" },
      });
      const task = createRes.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { title: "Updated" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().title).toBe("Updated");
    });

    it("returns 403 when user tries to edit bug", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Test", priority: "low" },
      });
      const task = createRes.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { title: "Hacked" },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/v1/tasks/:id", () => {
    it("soft-deletes a task", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "To Delete", priority: "low" },
      });
      const task = createRes.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);

      // Verify soft-deleted
      const dbTask = await prisma.task.findUnique({ where: { id: task.id } });
      expect(dbTask!.isDeleted).toBe(true);
    });

    it("returns 403 when user tries to delete", async () => {
      const app = await buildApp();
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flow: "bug", title: "Test", priority: "low" },
      });
      const task = createRes.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
