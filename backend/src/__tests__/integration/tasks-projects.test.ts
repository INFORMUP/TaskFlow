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

describe("tasks ↔ projects", () => {
  let engineerToken: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const a = await prisma.project.create({
      data: {
        key: "TA",
        name: "Test A",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_PRODUCT_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    const b = await prisma.project.create({
      data: {
        key: "TB",
        name: "Test B",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectAId = a.id;
    projectBId = b.id;
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

  it("attaches projects and fills assignee from first project default", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "With projects",
        priority: "medium",
        projectIds: [projectAId, projectBId],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.projects).toHaveLength(2);
    expect(body.projects.map((p: any) => p.id).sort()).toEqual([projectAId, projectBId].sort());
    // First project's default assignee = TEST_PRODUCT_ID
    expect(body.assignee.id).toBe(TEST_PRODUCT_ID);
  });

  it("explicit assignee wins over project default", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Explicit assignee",
        priority: "low",
        projectIds: [projectAId],
        assigneeUserId: TEST_ENGINEER_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignee.id).toBe(TEST_ENGINEER_ID);
  });

  it("stores dueDate and returns it", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Due soon",
        priority: "low",
        projectIds: [projectAId],
        dueDate: "2026-05-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().dueDate).toMatch(/^2026-05-01/);
  });

  it("rejects non-existent project with 422", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Bad project",
        priority: "low",
        projectIds: ["00000000-0000-0000-0000-000000000abc"],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_PROJECT");
  });

  it("task ↔ project membership: add, remove, last-project guard", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Membership",
        priority: "low",
        projectIds: [projectAId],
      },
    });
    const taskId = create.json().id;

    const add = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/projects`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { projectId: projectBId },
    });
    expect(add.statusCode).toBe(204);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${taskId}/projects/${projectAId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(remove.statusCode).toBe(204);

    const removeLast = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${taskId}/projects/${projectBId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(removeLast.statusCode).toBe(400);
    expect(removeLast.json().error.code).toBe("LAST_PROJECT");
  });
});
