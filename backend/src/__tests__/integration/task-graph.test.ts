import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";

const prisma = new PrismaClient();

describe("task graph", () => {
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

  async function createTask(
    title: string,
    opts: { auth?: string; spawnedFromTaskId?: string } = {},
  ) {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${opts.auth ?? token}` },
      payload: {
        flow: "feature",
        title,
        projectIds: [TEST_PROJECT_ID],
        priority: "medium",
        ...(opts.spawnedFromTaskId ? { spawnedFromTaskId: opts.spawnedFromTaskId } : {}),
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function addBlocker(blocked: string, blocking: string) {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${blocked}/blockers`,
      headers: { authorization: `Bearer ${token}` },
      payload: { blockingTaskId: blocking },
    });
    expect(res.statusCode).toBe(201);
  }

  it("returns the spawn tree both upward and downward from the root", async () => {
    const grandparent = await createTask("Grandparent");
    const parent = await createTask("Parent", { spawnedFromTaskId: grandparent.id });
    const child = await createTask("Child", { spawnedFromTaskId: parent.id });
    const sibling = await createTask("Sibling", { spawnedFromTaskId: parent.id });
    const grandchild = await createTask("Grandchild", { spawnedFromTaskId: child.id });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${parent.id}/graph`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const ids = body.nodes.map((n: any) => n.id).sort();
    expect(ids).toEqual(
      [grandparent.id, parent.id, child.id, sibling.id, grandchild.id].sort(),
    );

    const root = body.nodes.find((n: any) => n.id === parent.id);
    expect(root.isRoot).toBe(true);

    const spawnEdges = body.edges
      .filter((e: any) => e.type === "spawn")
      .map((e: any) => `${e.from}->${e.to}`)
      .sort();
    expect(spawnEdges).toEqual(
      [
        `${grandparent.id}->${parent.id}`,
        `${parent.id}->${child.id}`,
        `${parent.id}->${sibling.id}`,
        `${child.id}->${grandchild.id}`,
      ].sort(),
    );

    expect(body.edges.filter((e: any) => e.type === "blocker")).toEqual([]);

    for (const node of body.nodes) {
      expect(node.currentStatus).toHaveProperty("slug");
      expect(node.currentStatus).toHaveProperty("name");
      expect(node.currentStatus).toHaveProperty("color");
    }
  });

  it("returns transitive blockers in both directions", async () => {
    const a = await createTask("A");
    const b = await createTask("B");
    const c = await createTask("C");
    const d = await createTask("D");
    // A blocks B, A blocks C, B blocks D
    await addBlocker(b.id, a.id);
    await addBlocker(c.id, a.id);
    await addBlocker(d.id, b.id);

    const app = await buildApp();
    // Root at B: should reach A (upstream blocker), D (downstream blocked), and C (sibling via A).
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${b.id}/graph`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const ids = body.nodes.map((n: any) => n.id).sort();
    expect(ids).toEqual([a.id, b.id, c.id, d.id].sort());

    const blockerEdges = body.edges
      .filter((e: any) => e.type === "blocker")
      .map((e: any) => `${e.from}->${e.to}`)
      .sort();
    expect(blockerEdges).toEqual(
      [`${a.id}->${b.id}`, `${a.id}->${c.id}`, `${b.id}->${d.id}`].sort(),
    );
  });

  it("combines spawn and blocker edges in one response", async () => {
    const epic = await createTask("Epic");
    const childA = await createTask("ChildA", { spawnedFromTaskId: epic.id });
    const blocker = await createTask("Blocker");
    await addBlocker(childA.id, blocker.id);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${epic.id}/graph`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.nodes.map((n: any) => n.id).sort()).toEqual(
      [epic.id, childA.id, blocker.id].sort(),
    );
    const spawn = body.edges.find((e: any) => e.type === "spawn");
    const block = body.edges.find((e: any) => e.type === "blocker");
    expect(spawn).toEqual({ from: epic.id, to: childA.id, type: "spawn" });
    expect(block).toEqual({ from: blocker.id, to: childA.id, type: "blocker" });
  });

  it("does not loop on cyclic blocker chains", async () => {
    // Server prevents direct cycles on write; simulate a 3-cycle by inserting directly.
    const a = await createTask("A");
    const b = await createTask("B");
    const c = await createTask("C");
    await addBlocker(b.id, a.id); // A blocks B
    await addBlocker(c.id, b.id); // B blocks C
    // Force cycle: C blocks A (would normally be rejected if direct, allowed for transitive)
    await prisma.taskDependency.create({
      data: { blockingTaskId: c.id, blockedTaskId: a.id, createdBy: TEST_ENGINEER_ID },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}/graph`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodes.map((n: any) => n.id).sort()).toEqual(
      [a.id, b.id, c.id].sort(),
    );
    expect(body.edges.filter((e: any) => e.type === "blocker")).toHaveLength(3);
  });

  it("returns 404 when the task does not exist", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/00000000-0000-0000-0000-000000000000/graph`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when root task is invisible to the caller", async () => {
    const a = await createTask("Engineer-only task");
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${a.id}/graph`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("omits invisible neighbors from the graph rather than including them", async () => {
    // Engineer-visible root with a blocker created by the user; the user's task is
    // owned by them and visible to them, but the engineer can see both since
    // engineers have broad visibility. We test the inverse direction: root visible
    // to user, neighbor invisible.
    const ownTask = await createTask("User own", { auth: userToken });
    // Engineer creates a separate task and adds it as a blocker on user's task —
    // user can't see the engineer's task, so it should be omitted.
    const hidden = await createTask("Hidden", { auth: token });
    await addBlocker(ownTask.id, hidden.id);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${ownTask.id}/graph`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodes.map((n: any) => n.id)).toEqual([ownTask.id]);
    expect(body.edges).toEqual([]);
  });
});
