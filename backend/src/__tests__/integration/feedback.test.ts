import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

const ORG_A_ID = "d0000000-0000-4000-8000-000000000001";
const ORG_B_ID = "d0000000-0000-4000-8000-000000000002";
const ORG_B_OWNER_ID = "d0000000-0000-4000-8000-0000000000b1";

async function clearFeedbackFixtures() {
  await prisma.feedback.deleteMany({
    where: { orgId: { in: [ORG_A_ID, ORG_B_ID] } },
  });
  await prisma.orgMember.deleteMany({
    where: { orgId: { in: [ORG_A_ID, ORG_B_ID] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A_ID, ORG_B_ID] } },
  });
  await prisma.user.deleteMany({ where: { id: ORG_B_OWNER_ID } });
}

describe("feedback API", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  beforeEach(async () => {
    await clearFeedbackFixtures();

    // Org A: engineer=owner, test user=member
    await prisma.organization.create({
      data: { id: ORG_A_ID, slug: "org-a-fb", name: "Org A FB" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_A_ID, userId: TEST_ENGINEER_ID, role: "owner" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_A_ID, userId: TEST_USER_ID, role: "member" },
    });

    // Org B: separate owner
    await prisma.organization.create({
      data: { id: ORG_B_ID, slug: "org-b-fb", name: "Org B FB" },
    });
    await prisma.user.create({
      data: {
        id: ORG_B_OWNER_ID,
        email: "fb-orgb-owner@test.com",
        displayName: "OrgB Owner",
        actorType: "human",
        status: "active",
      },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_B_ID, userId: ORG_B_OWNER_ID, role: "owner" },
    });
  });

  afterAll(async () => {
    await clearFeedbackFixtures();
    await prisma.$disconnect();
  });

  describe("POST /api/v1/feedback", () => {
    it("creates feedback for an authenticated member and returns 201", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "BUG", message: "something broke", page: "/tasks" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({
        type: "BUG",
        message: "something broke",
        page: "/tasks",
        orgId: ORG_A_ID,
        userId: TEST_USER_ID,
      });
      expect(body.id).toBeDefined();
      expect(body.archivedAt).toBeNull();
    });

    it("rejects an invalid type with 400", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "SPAM", message: "hello" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects a message exceeding 5000 chars with 400", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "BUG", message: "x".repeat(5001) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("accepts a message at the 5000-char boundary", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "BUG", message: "x".repeat(5000) },
      });
      expect(res.statusCode).toBe(201);
    });

    it("rejects an empty message (after trim) with 400", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "BUG", message: "   " },
      });
      expect(res.statusCode).toBe(400);
    });

    it("stamps orgId from request.org.id, ignoring any client-supplied value", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: "ENHANCEMENT",
          message: "nice to have",
          orgId: ORG_B_ID,
        } as unknown as Record<string, unknown>,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.orgId).toBe(ORG_A_ID);
    });
  });

  describe("GET /api/v1/feedback (admin list)", () => {
    it("returns 403 for a member", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns only feedback for the caller's org, newest first", async () => {
      await prisma.feedback.createMany({
        data: [
          {
            orgId: ORG_A_ID,
            userId: TEST_USER_ID,
            type: "BUG",
            message: "a1",
            createdAt: new Date("2026-04-01T00:00:00Z"),
          },
          {
            orgId: ORG_A_ID,
            userId: TEST_USER_ID,
            type: "ENHANCEMENT",
            message: "a2",
            createdAt: new Date("2026-04-10T00:00:00Z"),
          },
          {
            orgId: ORG_B_ID,
            userId: ORG_B_OWNER_ID,
            type: "BUG",
            message: "b1",
          },
        ],
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/feedback",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].message).toBe("a2");
      expect(body.data[1].message).toBe("a1");
      expect(body.data[0].user).toMatchObject({
        displayName: expect.any(String),
        email: expect.any(String),
      });
      expect(body.data.every((f: any) => f.orgId === ORG_A_ID)).toBe(true);
    });

    it("filters by archived=true", async () => {
      await prisma.feedback.createMany({
        data: [
          { orgId: ORG_A_ID, userId: TEST_USER_ID, type: "BUG", message: "active" },
          {
            orgId: ORG_A_ID,
            userId: TEST_USER_ID,
            type: "BUG",
            message: "old",
            archivedAt: new Date("2026-04-15T00:00:00Z"),
          },
        ],
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/feedback?archived=true",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].message).toBe("old");
    });
  });

  describe("PATCH /api/v1/feedback/:id (admin notes)", () => {
    it("updates admin notes for owner/admin", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_A_ID, userId: TEST_USER_ID, type: "BUG", message: "x" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { adminNotes: "triaged" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().adminNotes).toBe("triaged");
    });

    it("returns 403 for a member", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_A_ID, userId: TEST_USER_ID, type: "BUG", message: "x" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { adminNotes: "nope" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for feedback in another org", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_B_ID, userId: ORG_B_OWNER_ID, type: "BUG", message: "b" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { adminNotes: "n/a" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/v1/feedback/:id/archive", () => {
    it("archives and unarchives", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_A_ID, userId: TEST_USER_ID, type: "BUG", message: "x" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });

      const archived = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: true },
      });
      expect(archived.statusCode).toBe(200);
      expect(archived.json().archivedAt).not.toBeNull();

      const unarchived = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: false },
      });
      expect(unarchived.statusCode).toBe(200);
      expect(unarchived.json().archivedAt).toBeNull();
    });

    it("returns 403 for a member", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_A_ID, userId: TEST_USER_ID, type: "BUG", message: "x" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: true },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for feedback in another org", async () => {
      const fb = await prisma.feedback.create({
        data: { orgId: ORG_B_ID, userId: ORG_B_OWNER_ID, type: "BUG", message: "b" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/feedback/${fb.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
        payload: { archived: true },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/feedback/export", () => {
    it("returns 403 for a member", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/feedback/export",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns CSV with the expected headers and rows for the caller's org only", async () => {
      await prisma.feedback.createMany({
        data: [
          {
            orgId: ORG_A_ID,
            userId: TEST_USER_ID,
            type: "BUG",
            message: "bug in org A",
            page: "/p",
          },
          {
            orgId: ORG_A_ID,
            userId: TEST_USER_ID,
            type: "ENHANCEMENT",
            message: "idea A",
            archivedAt: new Date(),
          },
          {
            orgId: ORG_B_ID,
            userId: ORG_B_OWNER_ID,
            type: "BUG",
            message: "org B bug",
          },
        ],
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_A_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/feedback/export",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/csv/);
      expect(res.headers["content-disposition"]).toContain(
        'attachment; filename="feedback-export.csv"',
      );
      const lines = res.body.trim().split("\n");
      expect(lines[0]).toBe(
        "id,date,user,email,type,message,page,adminNotes,archivedAt",
      );
      // 2 org-A rows (active + archived), org-B excluded
      expect(lines).toHaveLength(3);
      expect(res.body).toContain("bug in org A");
      expect(res.body).toContain("idea A");
      expect(res.body).not.toContain("org B bug");
    });
  });
});
