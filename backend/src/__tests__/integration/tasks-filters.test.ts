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
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const productTeamId = seedUuid("team", "product");
    const eng = await prisma.project.create({
      data: {
        key: "FEN",
        name: "EngOwned",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    const prod = await prisma.project.create({
      data: {
        key: "FPR",
        name: "ProdOwned",
        ownerUserId: TEST_PRODUCT_ID,
        teams: { create: [{ teamId: productTeamId }] },
      },
    });
    projectEngId = eng.id;
    projectProdId = prod.id;
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  async function createTask(app: any, payload: any) {
    return app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { flow: "bug", priority: "low", ...payload },
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
});
