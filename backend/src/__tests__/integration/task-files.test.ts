import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

function buildMultipartBody(
  filename: string,
  mimeType: string,
  data: Buffer
): { body: Buffer; boundary: string } {
  const boundary = "TestBoundary456";
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
    payload: { projectIds: [TEST_PROJECT_ID], flow: "bug", title: "File Attachment Test", priority: "medium" },
  });
  return res.json();
}

describe("task file attachments API", () => {
  let engineerToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedTestProjects(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    await prisma.file.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.file.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/tasks/:id/files", () => {
    it("uploads an HTML file and returns 201 with file metadata", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody(
        "report.html",
        "text/html",
        Buffer.from("<h1>Hello</h1>")
      );

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      const file = response.json();
      expect(file.id).toBeDefined();
      expect(file.filename).toBe("report.html");
      expect(file.mimeType).toBe("text/html");
      expect(file.size).toBeGreaterThan(0);
      expect(file.createdAt).toBeDefined();
    });

    it("uploads a PDF and returns 201", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("doc.pdf", "application/pdf", Buffer.from("fakepdf"));

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().mimeType).toBe("application/pdf");
    });

    it("returns 404 for a non-existent task", async () => {
      const app = await buildApp();
      const { body, boundary } = buildMultipartBody("test.txt", "text/plain", Buffer.from("hello"));
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${nonExistentId}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 4xx when no file is provided", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {},
      });

      // multipart plugin rejects non-multipart requests with 406 before the handler runs
      expect(response.statusCode).toBe(406);
    });
  });

  describe("DELETE /api/v1/tasks/:id/files/:fileId", () => {
    it("deletes an existing file attachment and returns 204", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("test.txt", "text/plain", Buffer.from("hello"));

      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const { id: fileId } = uploadRes.json();

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/files/${fileId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(deleteRes.statusCode).toBe(204);

      const fileInDb = await prisma.file.findUnique({ where: { id: fileId } });
      expect(fileInDb).toBeNull();
    });

    it("returns 404 when file attachment doesn't exist", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/files/${nonExistentId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/files/:fileId", () => {
    it("serves the file with attachment content-disposition", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const content = Buffer.from("<h1>Hello</h1>");
      const { body, boundary } = buildMultipartBody("page.html", "text/html", content);

      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const { id: fileId } = uploadRes.json();

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.headers["content-type"]).toContain("text/html");
      expect(getRes.headers["content-disposition"]).toContain("attachment");
      expect(getRes.headers["content-disposition"]).toContain("page.html");
      expect(getRes.rawPayload).toEqual(content);
    });

    it("serves a file whose name has a U+202F narrow no-break space without 500ing", async () => {
      // Regression: a non-ASCII byte in the filename is illegal in an HTTP
      // header and previously made the attachment Content-Disposition 500.
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const content = Buffer.from("<h1>Hi</h1>");
      const { body, boundary } = buildMultipartBody(
        "Screenshot 2026-06-04 at 12.45.42 PM.png",
        "text/html",
        content
      );

      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const { id: fileId } = uploadRes.json();

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/files/${fileId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const disposition = getRes.headers["content-disposition"] as string;
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).toContain("%E2%80%AF");
      expect(getRes.rawPayload).toEqual(content);
    });

    it("returns 404 for unknown file id", async () => {
      const app = await buildApp();
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await app.inject({
        method: "GET",
        url: `/api/v1/files/${nonExistentId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("task detail includes files array", () => {
    it("task GET response includes uploaded files metadata", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const { body, boundary } = buildMultipartBody("notes.txt", "text/plain", Buffer.from("some notes"));

      await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/files`,
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
      expect(Array.isArray(detail.files)).toBe(true);
      expect(detail.files).toHaveLength(1);
      expect(detail.files[0].filename).toBe("notes.txt");
      expect(detail.files[0].mimeType).toBe("text/plain");
      expect(detail.files[0].size).toBeGreaterThan(0);
    });
  });
});
