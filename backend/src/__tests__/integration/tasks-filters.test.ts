import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("tasks list filters", () => {
  let engineerToken: string;
  let productToken: string;
  let projectEngId: string;
  let projectProdId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const productTeamId = seedUuid("team", "product");
    const eng = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "FEN",
        name: "EngOwned",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    const prod = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "FPR",
        name: "ProdOwned",
        ownerUserId: TEST_PRODUCT_ID,
        teams: { create: [{ teamId: productTeamId }] },
      },
    });
    projectEngId = eng.id;
    projectProdId = prod.id;

    const flows = await prisma.flow.findMany({ select: { id: true } });
    for (const projectId of [projectEngId, projectProdId]) {
      for (const flow of flows) {
        await prisma.projectFlow.create({ data: { projectId, flowId: flow.id } });
      }
    }
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  async function createTask(app: any, payload: any) {
    return app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        priority: "low",
        projectIds: [projectEngId],
        ...payload,
      },
    });
  }

  it("filters by projectId", async () => {
    const app = await buildApp();
    await createTask(app, { title: "In Eng", projectIds: [projectEngId] });
    await createTask(app, { title: "In Prod", projectIds: [projectProdId] });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?projectId=${projectEngId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe("In Eng");
  });

  it("filters by projectOwnerUserId", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Eng-owned project task", projectIds: [projectEngId] });
    await createTask(app, { title: "Prod-owned project task", projectIds: [projectProdId] });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?projectOwnerUserId=${TEST_PRODUCT_ID}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe("Prod-owned project task");
  });

  it("filters by due date range", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Early", dueDate: "2026-04-15" });
    await createTask(app, { title: "Mid", dueDate: "2026-05-15" });
    await createTask(app, { title: "Late", dueDate: "2026-06-15" });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?dueAfter=2026-05-01&dueBefore=2026-05-31`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().data.map((t: any) => t.title);
    expect(titles).toEqual(["Mid"]);
  });

  it("assigneeUserId=me resolves to current user", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Mine", assigneeUserId: TEST_ENGINEER_ID });
    await createTask(app, { title: "Theirs", assigneeUserId: TEST_PRODUCT_ID });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks?assigneeUserId=me",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().data.map((t: any) => t.title);
    expect(titles).toEqual(["Mine"]);
  });

  describe("q free-text search", () => {
    it("matches case-insensitive substring in title", async () => {
      const app = await buildApp();
      await createTask(app, { title: "Login redirect bug" });
      await createTask(app, { title: "Header layout drift" });
      await createTask(app, { title: "Track LOGIN attempts" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?q=login",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title).sort();
      expect(titles).toEqual(["Login redirect bug", "Track LOGIN attempts"]);
    });

    it("matches substring in description", async () => {
      const app = await buildApp();
      await createTask(app, { title: "First", description: "Touches the Prisma client" });
      await createTask(app, { title: "Second", description: "Pure UI change" });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?q=prisma",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title);
      expect(titles).toEqual(["First"]);
    });

    it("combines q with other filters (AND semantics)", async () => {
      const app = await buildApp();
      await createTask(app, {
        title: "Login redirect bug",
        projectIds: [projectEngId],
      });
      await createTask(app, {
        title: "Login banner copy",
        projectIds: [projectProdId],
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks?q=login&projectId=${projectEngId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title);
      expect(titles).toEqual(["Login redirect bug"]);
    });
  });

  describe("status multi-select", () => {
    async function transitionTo(app: any, taskId: string, toStatus: string) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/transitions`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { toStatus },
      });
      expect(res.statusCode).toBe(201);
    }

    it("single status param keeps working (backward compatible)", async () => {
      const app = await buildApp();
      await createTask(app, { title: "Triaging" });
      const inv = await createTask(app, { title: "Investigating" });
      await transitionTo(app, inv.json().id, "investigate");

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=investigate",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title);
      expect(titles).toEqual(["Investigating"]);
    });

    it("repeated status params return tasks in any of the selected statuses", async () => {
      const app = await buildApp();
      await createTask(app, { title: "Triaging" });
      const inv = await createTask(app, { title: "Investigating" });
      await transitionTo(app, inv.json().id, "investigate");
      const other = await createTask(app, { title: "Approving" });
      await transitionTo(app, other.json().id, "investigate");
      await transitionTo(app, other.json().id, "approve");

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=triage&status=investigate",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title).sort();
      expect(titles).toEqual(["Investigating", "Triaging"]);
    });

    it("unknown status slug is ignored alongside known ones", async () => {
      const app = await buildApp();
      await createTask(app, { title: "Triaging" });
      const inv = await createTask(app, { title: "Investigating" });
      await transitionTo(app, inv.json().id, "investigate");

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tasks?status=triage&status=does-not-exist",
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title);
      expect(titles).toEqual(["Triaging"]);
    });

    it("AND-combines multi-status with another filter", async () => {
      const app = await buildApp();
      await createTask(app, { title: "Eng triage", projectIds: [projectEngId] });
      const e2 = await createTask(app, { title: "Eng investigate", projectIds: [projectEngId] });
      await transitionTo(app, e2.json().id, "investigate");
      await createTask(app, { title: "Prod triage", projectIds: [projectProdId] });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks?status=triage&status=investigate&projectId=${projectEngId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const titles = res.json().data.map((t: any) => t.title).sort();
      expect(titles).toEqual(["Eng investigate", "Eng triage"]);
    });
  });
});
