import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

describe("tasks: spawnedFrom provenance", () => {
  let token: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedTestProjects(prisma);
    token = mintTestToken(TEST_ENGINEER_ID);
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

  async function createTask(payload: Record<string, unknown>) {
    const app = await buildApp();
    return app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${token}` },
      payload: { projectIds: [TEST_PROJECT_ID], priority: "medium", ...payload },
    });
  }

  it("creates a task with spawnedFromTaskId and surfaces both directions on GET /tasks/:id", async () => {
    const parent = await createTask({ flow: "feature", title: "Parent" });
    expect(parent.statusCode).toBe(201);
    const parentId = parent.json().id;
    const parentDisplayId = parent.json().displayId;

    const child = await createTask({
      flow: "feature",
      title: "Spawned follow-up",
      spawnedFromTaskId: parentId,
    });
    expect(child.statusCode).toBe(201);
    const childId = child.json().id;
    const childDisplayId = child.json().displayId;

    const app = await buildApp();
    const childGet = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${childId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(childGet.statusCode).toBe(200);
    const childBody = childGet.json();
    expect(childBody.spawnedFromTask).toBeTruthy();
    expect(childBody.spawnedFromTask.id).toBe(parentId);
    expect(childBody.spawnedFromTask.displayId).toBe(parentDisplayId);
    expect(childBody.spawnedFromTask.title).toBe("Parent");
    expect(childBody.spawnedFromTask.flow.slug).toBe("feature");

    const parentGet = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${parentId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(parentGet.statusCode).toBe(200);
    const parentBody = parentGet.json();
    expect(Array.isArray(parentBody.spawnedTasks)).toBe(true);
    expect(parentBody.spawnedTasks).toHaveLength(1);
    expect(parentBody.spawnedTasks[0].id).toBe(childId);
    expect(parentBody.spawnedTasks[0].displayId).toBe(childDisplayId);
    expect(parentBody.spawnedTasks[0].currentStatus.slug).toBe("discuss");
  });

  it("returns null spawnedFromTask and empty spawnedTasks on a regular task", async () => {
    const standalone = await createTask({ flow: "feature", title: "Standalone" });
    expect(standalone.statusCode).toBe(201);
    const id = standalone.json().id;

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().spawnedFromTask).toBeNull();
    expect(res.json().spawnedTasks).toEqual([]);
  });

  it("rejects creation when spawnedFromTaskId references a non-existent task", async () => {
    const res = await createTask({
      flow: "feature",
      title: "Orphan",
      spawnedFromTaskId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("SPAWNED_FROM_NOT_FOUND");
  });
});
