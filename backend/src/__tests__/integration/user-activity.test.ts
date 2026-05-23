import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

const UNKNOWN_USER_ID = "00000000-0000-0000-0000-0000000009ff";

describe("GET /api/v1/users/:id/activity", () => {
  let engineerToken: string;
  let userToken: string;
  let projectAId: string;
  let projectBId: string;
  let featureFlowId: string;
  let discussId: string;
  let designId: string;
  // Two feature tasks: one created by the engineer, one created by the plain user.
  // A plain-user viewer can only see feature tasks they created (own_public scope).
  let engTaskId: string;
  let userTaskId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);

    const featureFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "feature" } });
    featureFlowId = featureFlow.id;
    discussId = (
      await prisma.flowStatus.findFirstOrThrow({ where: { flowId: featureFlowId, slug: "discuss" } })
    ).id;
    designId = (
      await prisma.flowStatus.findFirstOrThrow({ where: { flowId: featureFlowId, slug: "design" } })
    ).id;
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();

    const a = await prisma.project.create({
      data: { orgId: DEFAULT_ORG_ID, key: "UAA", name: "Activity Project A", ownerUserId: TEST_ENGINEER_ID },
    });
    const b = await prisma.project.create({
      data: { orgId: DEFAULT_ORG_ID, key: "UAB", name: "Activity Project B", ownerUserId: TEST_ENGINEER_ID },
    });
    projectAId = a.id;
    projectBId = b.id;

    engTaskId = (
      await prisma.task.create({
        data: {
          displayId: "FEAT-ua-eng",
          flowId: featureFlowId,
          currentStatusId: discussId,
          title: "Engineer feature task",
          priority: "medium",
          createdBy: TEST_ENGINEER_ID,
          projects: { create: [{ projectId: projectAId }] },
        },
      })
    ).id;
    userTaskId = (
      await prisma.task.create({
        data: {
          displayId: "FEAT-ua-user",
          flowId: featureFlowId,
          currentStatusId: discussId,
          title: "User feature task",
          priority: "medium",
          createdBy: TEST_USER_ID,
          projects: { create: [{ projectId: projectBId }] },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  it("merges task-created, status-transition, and comment events newest-first", async () => {
    const app = await buildApp();
    const t0 = new Date("2026-02-01T00:00:00Z").getTime();

    // task_created at t0+0 — re-stamp the engineer task's createdAt deterministically.
    await prisma.task.update({ where: { id: engTaskId }, data: { createdAt: new Date(t0) } });
    // status_transition at t0+1000
    await prisma.taskTransition.create({
      data: {
        taskId: engTaskId,
        fromStatusId: discussId,
        toStatusId: designId,
        actorId: TEST_ENGINEER_ID,
        actorType: "human",
        note: "",
        createdAt: new Date(t0 + 1000),
      },
    });
    // comment at t0+2000
    await prisma.comment.create({
      data: {
        taskId: engTaskId,
        authorId: TEST_ENGINEER_ID,
        body: "engineer comment body",
        createdAt: new Date(t0 + 2000),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ id: TEST_ENGINEER_ID, displayName: "Test Engineer" });
    expect(body.data.map((e: any) => e.type)).toEqual([
      "comment",
      "status_transition",
      "task_created",
    ]);
    expect(body.data[0]).toMatchObject({ commentId: expect.any(String), bodyPreview: "engineer comment body" });
    expect(body.data[0].task).toMatchObject({ id: engTaskId, displayId: "FEAT-ua-eng" });
    expect(body.data[1]).toMatchObject({
      fromStatus: { slug: "discuss" },
      toStatus: { slug: "design" },
    });
    expect(body.data[2].task).toMatchObject({ id: engTaskId });
    expect(body.pagination.hasMore).toBe(false);
  });

  it("excludes events on tasks the viewer cannot see", async () => {
    const app = await buildApp();
    // Engineer comments on their own task (hidden from a plain user) and on the user's task (visible).
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "hidden comment" },
    });
    await prisma.comment.create({
      data: { taskId: userTaskId, authorId: TEST_ENGINEER_ID, body: "visible comment" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const previews = res.json().data.map((e: any) => e.bodyPreview);
    expect(previews).toEqual(["visible comment"]);
  });

  it("filters by projectId", async () => {
    const app = await buildApp();
    // engTaskId is on project A, userTaskId on project B. Engineer comments on both.
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "on project A" },
    });
    await prisma.comment.create({
      data: { taskId: userTaskId, authorId: TEST_ENGINEER_ID, body: "on project B" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity?projectId=${projectAId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const previews = res.json().data.map((e: any) => e.bodyPreview);
    expect(previews).toEqual(["on project A"]);
  });

  it("filters by from/to date range (inclusive)", async () => {
    const app = await buildApp();
    const old = new Date("2026-01-01T00:00:00Z");
    const mid = new Date("2026-02-15T00:00:00Z");
    const recent = new Date("2026-03-01T00:00:00Z");
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "old", createdAt: old },
    });
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "mid", createdAt: mid },
    });
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "recent", createdAt: recent },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity?from=2026-02-01T00:00:00Z&to=2026-02-28T00:00:00Z`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const previews = res.json().data.map((e: any) => e.bodyPreview);
    expect(previews).toEqual(["mid"]);
  });

  it("paginates the merged feed via cursor", async () => {
    const app = await buildApp();
    const t0 = new Date("2026-02-01T00:00:00Z").getTime();
    for (let i = 0; i < 3; i++) {
      await prisma.comment.create({
        data: {
          taskId: engTaskId,
          authorId: TEST_ENGINEER_ID,
          body: `comment ${i}`,
          createdAt: new Date(t0 + i * 1000),
        },
      });
    }

    const first = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity?limit=2`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const firstBody = first.json();
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.pagination.hasMore).toBe(true);
    expect(firstBody.pagination.cursor).toBeTruthy();

    const second = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity?limit=2&cursor=${encodeURIComponent(firstBody.pagination.cursor)}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const secondBody = second.json();
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.pagination.hasMore).toBe(false);
  });

  it("returns 404 for a user that is not a member of the org", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${UNKNOWN_USER_ID}/activity`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("excludes events on soft-deleted tasks", async () => {
    const app = await buildApp();
    await prisma.comment.create({
      data: { taskId: engTaskId, authorId: TEST_ENGINEER_ID, body: "on deleted task" },
    });
    await prisma.task.update({ where: { id: engTaskId }, data: { isDeleted: true } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/users/${TEST_ENGINEER_ID}/activity`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
  });
});
