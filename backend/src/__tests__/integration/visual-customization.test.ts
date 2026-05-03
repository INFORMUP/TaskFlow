import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

// IMP-17: visual customization endpoints — project color, flow icon, status color.
// These are admin-only because they affect every viewer of the org.

const prisma = new PrismaClient();

describe("Visual customization (IMP-17)", () => {
  let memberToken: string;
  let adminToken: string;
  let projectId: string;
  let flowId: string;
  let statusId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    memberToken = mintTestToken(TEST_ENGINEER_ID, { orgRole: "member" });
    adminToken = mintTestToken(TEST_ENGINEER_ID, { orgRole: "admin" });

    const flow = await prisma.flow.findFirst({
      where: { orgId: DEFAULT_ORG_ID, slug: "improvement" },
    });
    flowId = flow!.id;

    const status = await prisma.flowStatus.findFirst({
      where: { flowId, slug: "implement" },
    });
    statusId = status!.id;

    // Other test files delete all projects in their teardown, so seed-time
    // projects can be gone by the time we run. Upsert our own.
    const project = await prisma.project.upsert({
      where: { orgId_key: { orgId: DEFAULT_ORG_ID, key: "VISTEST" } },
      update: { color: "#a855f7" },
      create: {
        orgId: DEFAULT_ORG_ID,
        key: "VISTEST",
        name: "Visual Test Project",
        ownerUserId: TEST_ENGINEER_ID,
        color: "#a855f7",
      },
    });
    projectId = project.id;
  });

  beforeEach(async () => {
    // Reset visual fields between tests so order doesn't matter.
    await prisma.project.update({ where: { id: projectId }, data: { color: "#a855f7" } });
    await prisma.flow.update({ where: { id: flowId }, data: { icon: "wrench" } });
    await prisma.flowStatus.update({ where: { id: statusId }, data: { color: "#f59e0b" } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("PATCH /api/v1/projects/:id (color)", () => {
    it("accepts a hex color from an org admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { color: "#112233" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().color).toBe("#112233");
    });

    it("rejects an invalid hex with 400", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { color: "not-a-color" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_COLOR");
    });

    it("clears color when null is sent", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { color: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().color).toBeNull();
    });
  });

  describe("PATCH /api/v1/flows/:id (icon)", () => {
    it("accepts an icon from the curated set when admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/flows/${flowId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { icon: "rocket" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().icon).toBe("rocket");
    });

    it("rejects an icon outside the curated set with 400", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/flows/${flowId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { icon: "made-up-icon" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_ICON");
    });

    it("rejects non-admin members with 403", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/flows/${flowId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { icon: "rocket" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /api/v1/flows/:id/statuses/:statusId (color)", () => {
    it("accepts a hex color when admin", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/flows/${flowId}/statuses/${statusId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { color: "#abcdef" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().color).toBe("#abcdef");
    });

    it("rejects non-admin members with 403", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/flows/${flowId}/statuses/${statusId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { color: "#abcdef" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/v1/flow-icons", () => {
    it("returns the curated icon set", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/flow-icons",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(Array.isArray(data)).toBe(true);
      expect(data).toContain("bug");
      expect(data).toContain("sparkles");
      expect(data).toContain("wrench");
    });
  });

  describe("GET responses include visual fields", () => {
    it("GET /api/v1/flows includes icon", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/flows",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const flows = res.json().data;
      const improvement = flows.find((f: any) => f.slug === "improvement");
      expect(improvement.icon).toBe("wrench");
    });

    it("GET /api/v1/flows/:id/statuses includes color", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/flows/${flowId}/statuses`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const statuses = res.json().data;
      const implement = statuses.find((s: any) => s.slug === "implement");
      expect(implement.color).toBe("#f59e0b");
    });

    it("GET /api/v1/projects includes color", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const projects = res.json().data;
      const target = projects.find((p: any) => p.key === "VISTEST");
      expect(target.color).toBe("#a855f7");
    });
  });
});
