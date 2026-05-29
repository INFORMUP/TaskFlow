import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

describe("task hierarchy: re-parenting, altitude filters, milestone roll-up", () => {
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

  async function patchTask(id: string, payload: Record<string, unknown>) {
    const app = await buildApp();
    return app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  async function getTask(id: string) {
    const app = await buildApp();
    return app.inject({
      method: "GET",
      url: `/api/v1/tasks/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function transition(id: string, toStatus: string, resolution?: string) {
    const app = await buildApp();
    return app.inject({
      method: "POST",
      url: `/api/v1/tasks/${id}/transitions`,
      headers: { authorization: `Bearer ${token}` },
      payload: { toStatus, ...(resolution ? { resolution } : {}) },
    });
  }

  async function listTasks(query: string) {
    const app = await buildApp();
    return app.inject({
      method: "GET",
      url: `/api/v1/tasks?${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  describe("re-parenting via PATCH", () => {
    it("sets and clears a parent after creation", async () => {
      const parentId = (await createTask({ flow: "feature", title: "Parent" })).json().id;
      const childId = (await createTask({ flow: "feature", title: "Child" })).json().id;

      const set = await patchTask(childId, { spawnedFromTaskId: parentId });
      expect(set.statusCode).toBe(200);

      let childBody = (await getTask(childId)).json();
      expect(childBody.spawnedFromTask?.id).toBe(parentId);
      const parentBody = (await getTask(parentId)).json();
      expect(parentBody.spawnedTasks.map((c: any) => c.id)).toContain(childId);

      const clear = await patchTask(childId, { spawnedFromTaskId: null });
      expect(clear.statusCode).toBe(200);
      childBody = (await getTask(childId)).json();
      expect(childBody.spawnedFromTask).toBeNull();
    });

    it("rejects making a task its own parent", async () => {
      const id = (await createTask({ flow: "feature", title: "Self" })).json().id;
      const res = await patchTask(id, { spawnedFromTaskId: id });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("PARENT_CYCLE");
    });

    it("rejects a re-parent that would create a cycle", async () => {
      const a = (await createTask({ flow: "feature", title: "A" })).json().id;
      const b = (await createTask({ flow: "feature", title: "B" })).json().id;
      // B becomes a child of A.
      expect((await patchTask(b, { spawnedFromTaskId: a })).statusCode).toBe(200);
      // Now making A a child of B (its own descendant) must be rejected.
      const res = await patchTask(a, { spawnedFromTaskId: b });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("PARENT_CYCLE");
    });

    it("rejects a re-parent onto a non-existent parent", async () => {
      const id = (await createTask({ flow: "feature", title: "Orphan" })).json().id;
      const res = await patchTask(id, { spawnedFromTaskId: "00000000-0000-0000-0000-000000000000" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("SPAWNED_FROM_NOT_FOUND");
    });
  });

  describe("altitude filters on the list endpoint", () => {
    it("topLevel=true returns only tasks with no parent; spawnedFromTaskId returns only that parent's children", async () => {
      const t1 = (await createTask({ flow: "feature", title: "Top 1" })).json().id;
      const t2 = (await createTask({ flow: "feature", title: "Top 2" })).json().id;
      const child = (await createTask({ flow: "feature", title: "Child", spawnedFromTaskId: t1 })).json().id;

      const top = (await listTasks("topLevel=true")).json().data.map((t: any) => t.id);
      expect(top).toEqual(expect.arrayContaining([t1, t2]));
      expect(top).not.toContain(child);

      const children = (await listTasks(`spawnedFromTaskId=${t1}`)).json().data.map((t: any) => t.id);
      expect(children).toEqual([child]);
    });
  });

  describe("child-completion roll-up", () => {
    it("reports childCount/childDoneCount on detail and list responses", async () => {
      const parentId = (await createTask({ flow: "feature", title: "Has children" })).json().id;
      await createTask({ flow: "feature", title: "c1", spawnedFromTaskId: parentId });
      const c2 = (await createTask({ flow: "feature", title: "c2", spawnedFromTaskId: parentId })).json().id;

      let parent = (await getTask(parentId)).json();
      expect(parent.rollup).toEqual({ childCount: 2, childDoneCount: 0 });

      // Close one child (terminal status counts as done).
      expect((await transition(c2, "closed", "completed")).statusCode).toBe(201);

      parent = (await getTask(parentId)).json();
      expect(parent.rollup).toEqual({ childCount: 2, childDoneCount: 1 });

      // The list response carries the same roll-up.
      const listed = (await listTasks(`spawnedFromTaskId=${parentId}`)).json().data;
      expect(listed.every((t: any) => t.rollup)).toBe(true);
    });
  });

  describe("milestone computed status", () => {
    it("derives status from children and lets a manual close override it", async () => {
      const m = (await createTask({ flow: "milestone", title: "Q3 milestone" })).json();
      expect(m.flow.slug).toBe("milestone");
      expect(m.currentStatus.slug).toBe("open");

      // No children yet.
      let body = (await getTask(m.id)).json();
      expect(body.derivedStatus).toBe("not_started");

      const c1 = (await createTask({ flow: "feature", title: "m-c1", spawnedFromTaskId: m.id })).json().id;
      const c2 = (await createTask({ flow: "feature", title: "m-c2", spawnedFromTaskId: m.id })).json().id;

      body = (await getTask(m.id)).json();
      expect(body.derivedStatus).toBe("not_started"); // children exist, none done

      await transition(c1, "closed", "completed");
      body = (await getTask(m.id)).json();
      expect(body.derivedStatus).toBe("in_progress");

      await transition(c2, "closed", "completed");
      body = (await getTask(m.id)).json();
      expect(body.derivedStatus).toBe("complete");

      // Manual close override: reopen scenario — a milestone with an open child
      // that a human closes early still reads as complete.
      const m2 = (await createTask({ flow: "milestone", title: "Descoped" })).json().id;
      await createTask({ flow: "feature", title: "still-open", spawnedFromTaskId: m2 });
      let m2body = (await getTask(m2)).json();
      expect(m2body.derivedStatus).toBe("not_started");

      const closed = await transition(m2, "closed", "rejected");
      expect(closed.statusCode).toBe(201);
      m2body = (await getTask(m2)).json();
      expect(m2body.currentStatus.slug).toBe("closed");
      expect(m2body.currentStatus.isTerminal).toBe(true);
      expect(m2body.derivedStatus).toBe("complete");
    });
  });
});
