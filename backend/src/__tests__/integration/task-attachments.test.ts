import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

function buildMultipartBody(filename: string, mimeType: string, data: Buffer): { body: Buffer; boundary: string } {
  const boundary = "TestBoundary123";
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ];
  return { body: Buffer.concat(parts), boundary };
}

async function createTask(app: any, token: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: { authorization: `Bearer ${token}` },
    payload: { projectIds: [TEST_PROJECT_ID], flow: "bug", title: "Attachment Test", priority: "medium" },
  });
  return res.json();
}

async function createComment(app: any, token: string, taskId: string) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/tasks/${taskId}/comments`,
    headers: { authorization: `Bearer ${token}` },
    payload: { body: "test comment" },
  });
  return res.json();
}

describe("task and comment attachments API", () => {
  let engineerToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedTestProjects(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    await prisma.image.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.image.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/tasks/:id/attachments", () => {
    it("uploads a PNG and returns 201 with image metadata", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("test.png", "image/png", Buffer.from("fakepngdata"));

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      const img = response.json();
      expect(img.id).toBeDefined();
      expect(img.filename).toBe("test.png");
      expect(img.mimeType).toBe("image/png");
      expect(img.size).toBeGreaterThan(0);
      expect(img.createdAt).toBeDefined();
    });

    it("rejects unsupported MIME type with 415", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("doc.pdf", "application/pdf", Buffer.from("fakepdf"));

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(415);
    });

    it("returns 404 for a non-existent task", async () => {
      const app = await buildApp();
      const { body, boundary } = buildMultipartBody("test.png", "image/png", Buffer.from("fakepng"));
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${nonExistentId}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/tasks/:id/attachments/:imageId", () => {
    it("deletes an existing attachment and returns 204", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("test.png", "image/png", Buffer.from("fakepng"));

      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const { id: imageId } = uploadRes.json();

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/attachments/${imageId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(deleteRes.statusCode).toBe(204);
    });

    it("returns 404 when attachment doesn't exist", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/attachments/${nonExistentId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/tasks/:id/comments/:commentId/attachments", () => {
    it("uploads a PNG to a comment and returns 201", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const comment = await createComment(app, engineerToken, task.id);
      const { body, boundary } = buildMultipartBody("shot.png", "image/png", Buffer.from("fakepng"));

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      const img = response.json();
      expect(img.filename).toBe("shot.png");
      expect(img.mimeType).toBe("image/png");
    });

    it("returns 404 when comment belongs to a different task", async () => {
      const app = await buildApp();
      const task1 = await createTask(app, engineerToken);
      const task2 = await createTask(app, engineerToken);
      const comment = await createComment(app, engineerToken, task1.id);
      const { body, boundary } = buildMultipartBody("test.png", "image/png", Buffer.from("fakepng"));

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task2.id}/comments/${comment.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/v1/tasks/:id/comments/:commentId/attachments/:imageId", () => {
    it("deletes a comment attachment and returns 204", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const comment = await createComment(app, engineerToken, task.id);
      const { body, boundary } = buildMultipartBody("shot.png", "image/png", Buffer.from("fakepng"));

      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const { id: imageId } = uploadRes.json();

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}/attachments/${imageId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(deleteRes.statusCode).toBe(204);
    });
  });

  describe("task detail and comment list include images", () => {
    it("task detail response includes task-level images array", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("test.png", "image/png", Buffer.from("fakepng"));

      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      const detailRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json();
      expect(Array.isArray(detail.images)).toBe(true);
      expect(detail.images).toHaveLength(1);
      expect(detail.images[0].filename).toBe("test.png");
    });

    it("comment list response includes per-comment images array", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const comment = await createComment(app, engineerToken, task.id);
      const { body, boundary } = buildMultipartBody("shot.png", "image/png", Buffer.from("fakepng"));

      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/comments/${comment.id}/attachments`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/comments`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(listRes.statusCode).toBe(200);
      const { data } = listRes.json();
      expect(data).toHaveLength(1);
      expect(Array.isArray(data[0].images)).toBe(true);
      expect(data[0].images).toHaveLength(1);
      expect(data[0].images[0].filename).toBe("shot.png");
    });
  });
});
