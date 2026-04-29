import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

describe("task blockers", () => {
  let token: string;
  let userToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedTestProjects(prisma);
    token = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.taskDependency.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.taskDependency.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  async function createTask(title: string, auth = token) {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${auth}` },
      payload: { flow: "feature", title, projectIds: [TEST_PROJECT_ID], priority: "medium" },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("creates and lists a blocker", async () => {
    const a = await createTask("Task A");
    const b = await createTask("Task B");

    const app = await buildApp();
    const post = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: b.id },
    });
    expect(post.statusCode).toBe(201);
    expect(post.json().blocker.id).toBe(b.id);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.blockers).toHaveLength(1);
    expect(body.blockers[0].id).toBe(b.id);
    expect(body.blockers[0].displayId).toBe(b.displayId);
    expect(body.blockers[0].title).toBe("Task B");
    expect(body.blockers[0].currentStatus.slug).toBe("discuss");
    expect(body.blocking).toEqual([]);

    const reverse = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${b.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reverse.json().blockers).toEqual([]);
    expect(reverse.json().blocking).toHaveLength(1);
    expect(reverse.json().blocking[0].id).toBe(a.id);
  });

  it("rejects duplicate blocker with 409", async () => {
    const a = await createTask("Task A");
    const b = await createTask("Task B");

    const app = await buildApp();
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: b.id },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: b.id },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("BLOCKER_ALREADY_EXISTS");
  });

  it("rejects self-blocker with 400 self_blocker_not_allowed", async () => {
    const a = await createTask("Task A");

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: a.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("SELF_BLOCKER_NOT_ALLOWED");
  });

  it("rejects direct two-task cycle with 409 cyclic_blocker", async () => {
    const a = await createTask("Task A");
    const b = await createTask("Task B");

    const app = await buildApp();
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: b.id },
    });
    expect(first.statusCode).toBe(201);

    const reverse = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${b.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: a.id },
    });
    expect(reverse.statusCode).toBe(409);
    expect(reverse.json().error.code).toBe("CYCLIC_BLOCKER");
  });

  it("returns 404 when blockingTaskId does not exist", async () => {
    const a = await createTask("Task A");

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("BLOCKING_TASK_NOT_FOUND");
  });

  it("removes a blocker", async () => {
    const a = await createTask("Task A");
    const b = await createTask("Task B");

    const app = await buildApp();
    const post = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: b.id },
    });
    expect(post.statusCode).toBe(201);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${a.id}/blockers/${b.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const delAgain = await app.inject({
      method: "DELETE",
      url: `/api/v1/tasks/${a.id}/blockers/${b.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delAgain.statusCode).toBe(404);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().blockers).toEqual([]);
  });

  it("returns blocker counts on GET /tasks/:id and excludes closed blockers from openBlockerCount", async () => {
    const a = await createTask("Task A");
    const b = await createTask("Task B");
    const c = await createTask("Task C");

    const app = await buildApp();
    for (const blockingId of [b.id, c.id]) {
      const r = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${a.id}/blockers`,
        headers: { authorization: `Bearer ${token}` },
        payload: { blockingTaskId: blockingId },
      });
      expect(r.statusCode).toBe(201);
    }

    let detail = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().blockerCount).toBe(2);
    expect(detail.json().openBlockerCount).toBe(2);

    // Move b to closed status to simulate a resolved blocker.
    const closedStatus = await prisma.flowStatus.findFirst({
      where: { flow: { slug: "feature" }, slug: "closed" },
    });
    expect(closedStatus).toBeTruthy();
    await prisma.task.update({
      where: { id: b.id },
      data: { currentStatusId: closedStatus!.id },
    });

    detail = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().blockerCount).toBe(2);
    expect(detail.json().openBlockerCount).toBe(1);
  });

  it("returns 404 when target task is invisible to the caller", async () => {
    const a = await createTask("Engineer-only task");

    // 'user' team has 'own_public' on feature flow — sees only their own tasks.
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}/blockers`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
