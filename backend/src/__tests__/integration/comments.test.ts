import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_PRODUCT_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

async function createBugTask(app: any, token: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: { authorization: `Bearer ${token}` },
    payload: { flow: "bug", title: "Comment Test", priority: "medium" },
  });
  return res.json();
}

describe("comments API", () => {
  let engineerToken: string;
  let productToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
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

  describe("POST /api/v1/tasks/:id/comments", () => {
    it("creates a comment and returns 201", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "This is a comment" },
      });
      expect(response.statusCode).toBe(201);
      const comment = response.json();
      expect(comment.body).toBe("This is a comment");
      expect(comment.author).toBeDefined();
    });

    it("rejects empty body", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "" },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/tasks/:id/comments", () => {
    it("returns ordered comments", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "First" },
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "Second" },
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].body).toBe("First");
      expect(body.data[1].body).toBe("Second");
    });

    it("excludes soft-deleted comments", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "To delete" },
      });
      const comment = createRes.json();

      await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.json().data).toHaveLength(0);
    });
  });

  describe("PATCH /api/v1/tasks/:id/comments/:commentId", () => {
    it("updates own comment", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "Original" },
      });
      const comment = createRes.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "Updated" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().body).toBe("Updated");
    });

    it("rejects editing another user's comment", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "Engineer's comment" },
      });
      const comment = createRes.json();

      const response = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${productToken}` },
        payload: { body: "Hijacked" },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/v1/tasks/:id/comments/:commentId", () => {
    it("soft-deletes own comment", async () => {
      const app = await buildApp();
      const task = await createBugTask(app, engineerToken);

      const createRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { body: "To delete" },
      });
      const comment = createRes.json();

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(response.statusCode).toBe(200);

      const dbComment = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(dbComment!.isDeleted).toBe(true);
    });
  });
});
