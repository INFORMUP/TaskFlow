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

async function createBugTask(app: any, token: string, title = "Test Bug") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: { authorization: `Bearer ${token}` },
    payload: { flow: "bug", title, priority: "medium" },
  });
  return res.json();
}

describe("transitions API", () => {
  let engineerToken: string;
  let productToken: string;
  let userToken: string;
  let agentToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
    userToken = mintTestToken(TEST_USER_ID);
    agentToken = mintTestToken(TEST_AGENT_ID);
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

  describe("POST /api/v1/tasks/:id/transitions", () => {
    it("creates a transition and updates task status", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "investigate", note: "Confirmed reproducible" },
      });
      expect(response.statusCode).toBe(201);

      // Verify task status updated
      const updatedTask = await prisma.task.findUnique({
        where: { id: task.id },
        include: { currentStatus: true },
      });
      expect(updatedTask!.currentStatus.slug).toBe("investigate");
    });

    it("rejects transition without note", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "investigate" },
      });
      expect(response.statusCode).toBe(422);
    });

    it("rejects transition with empty note", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "investigate", note: "  " },
      });
      expect(response.statusCode).toBe(422);
    });

    it("rejects invalid transition (triage -> resolve)", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "resolve", note: "Skip to resolve" },
      });
      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.error.code).toBe("TRANSITION_NOT_ALLOWED");
    });

    it("rejects transition without permission (user cannot transition bug)", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { toStatus: "investigate", note: "I want to help" },
      });
      expect(response.statusCode).toBe(403);
    });

    it("requires resolution when closing", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "closed", note: "Closing" },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("RESOLUTION_REQUIRED");
    });

    it("rejects invalid resolution for flow", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "closed", note: "Closing", resolution: "completed" },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("INVALID_RESOLUTION");
    });

    it("closes task with valid resolution", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "closed", note: "Not a bug", resolution: "invalid" },
      });
      expect(response.statusCode).toBe(201);

      const updatedTask = await prisma.task.findUnique({ where: { id: task.id } });
      expect(updatedTask!.resolution).toBe("invalid");
    });

    it("records actor_type correctly", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      // Engineer transitions
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "investigate", note: "Investigating" },
      });

      // Agent transitions
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${agentToken}` },
        payload: { toStatus: "approve", note: "Root cause found" },
      });

      const transitions = await prisma.taskTransition.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: "asc" },
      });

      // Initial + 2 transitions = 3
      expect(transitions).toHaveLength(3);
      expect(transitions[1].actorType).toBe("human");
      expect(transitions[2].actorType).toBe("agent");
    });
  });

  describe("GET /api/v1/tasks/:id/transitions", () => {
    it("returns ordered transition history", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus: "investigate", note: "Investigating" },
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2); // initial + investigate
      expect(body.data[0].fromStatus).toBeNull();
      expect(body.data[0].toStatus.slug).toBe("triage");
      expect(body.data[1].fromStatus.slug).toBe("triage");
      expect(body.data[1].toStatus.slug).toBe("investigate");
      expect(body.data[1].note).toBe("Investigating");
      expect(body.data[1].actor).toBeDefined();
    });
  });

  describe("POST /api/v1/tasks/:id/assign", () => {
    it("assigns a task", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/assign`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { assigneeId: TEST_AGENT_ID },
      });
      expect(response.statusCode).toBe(200);

      const updated = await prisma.task.findUnique({ where: { id: task.id } });
      expect(updated!.assigneeId).toBe(TEST_AGENT_ID);
    });

    it("rejects assign without permission", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/assign`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { assigneeId: TEST_ENGINEER_ID },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/v1/tasks/:id/assign", () => {
    it("unassigns a task", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      // Assign first
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/assign`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { assigneeId: TEST_AGENT_ID },
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/assign`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);

      const updated = await prisma.task.findUnique({ where: { id: task.id } });
      expect(updated!.assigneeId).toBeNull();
    });
  });
});
