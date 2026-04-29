import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("labels CRUD", () => {
  let engineerToken: string;
  let productToken: string;
  let userToken: string;
  let projectId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.label.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "LBL",
        name: "LabelsProject",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectId = project.id;
    const flows = await prisma.flow.findMany({ select: { id: true } });
    for (const flow of flows) {
      await prisma.projectFlow.create({ data: { projectId, flowId: flow.id } });
    }
  });

  it("creates a label and lists it", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "frontend", color: "#3366ff" },
    });
    expect(create.statusCode).toBe(201);
    const label = create.json();
    expect(label.id).toBeDefined();
    expect(label.name).toBe("frontend");
    expect(label.color).toBe("#3366ff");

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
  });

  it("rejects duplicate label names case-insensitively with 409", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "Backend", color: "#aa0000" },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "BACKEND", color: "#00aa00" },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("DUPLICATE_NAME");
  });

  it("rejects invalid color with 400", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "bad", color: "not-a-color" },
    });
    // Either schema-level (400) or service-level (400) — both acceptable.
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 when caller lacks label-management permission", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${userToken}` },
      payload: { name: "user-tag", color: "#123456" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("updates a label and rejects rename collision", async () => {
    const app = await buildApp();
    const a = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "alpha", color: "#111111" },
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "beta", color: "#222222" },
    });
    const aId = a.json().id;
    const bId = b.json().id;

    const recolor = await app.inject({
      method: "PATCH",
      url: `/api/v1/labels/${aId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { color: "#999999" },
    });
    expect(recolor.statusCode).toBe(200);
    expect(recolor.json().color).toBe("#999999");

    const collide = await app.inject({
      method: "PATCH",
      url: `/api/v1/labels/${bId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "alpha" },
    });
    expect(collide.statusCode).toBe(409);
  });

  it("deletes a label and cascades task_labels", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name: "to-delete", color: "#abcdef" },
    });
    const labelId = create.json().id;

    const task = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { flow: "bug", title: "T", priority: "low", projectIds: [projectId] },
    });
    const taskId = task.json().id;
    const attach = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/labels`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { labelId },
    });
    expect(attach.statusCode).toBe(204);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/labels/${labelId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(del.statusCode).toBe(204);

    const remaining = await prisma.taskLabel.findMany({ where: { labelId } });
    expect(remaining).toHaveLength(0);
  });
});

describe("task label attach/detach + filter", () => {
  let engineerToken: string;
  let userToken: string;
  let projectId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.label.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "LB2",
        name: "LabelsProject2",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectId = project.id;
    const flows = await prisma.flow.findMany({ select: { id: true } });
    for (const flow of flows) {
      await prisma.projectFlow.create({ data: { projectId, flowId: flow.id } });
    }
  });

  afterAll(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.label.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  async function createLabel(app: any, name: string, color = "#112233") {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/labels",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { name, color },
    });
    return res.json().id as string;
  }

  async function createTask(app: any, title: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { flow: "bug", title, priority: "low", projectIds: [projectId] },
    });
    return res.json().id as string;
  }

  it("attach is idempotent and detach is idempotent", async () => {
    const app = await buildApp();
    const labelId = await createLabel(app, "x");
    const taskId = await createTask(app, "T1");

    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskId}/labels`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { labelId },
      });
      expect(r.statusCode).toBe(204);
    }
    const links = await prisma.taskLabel.findMany({ where: { taskId } });
    expect(links).toHaveLength(1);

    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${taskId}/labels/${labelId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(r.statusCode).toBe(204);
    }
    const after = await prisma.taskLabel.findMany({ where: { taskId } });
    expect(after).toHaveLength(0);
  });

  it("attach returns 403 or 404 when caller cannot edit the task's flow", async () => {
    const app = await buildApp();
    const labelId = await createLabel(app, "y");
    const taskId = await createTask(app, "T2");
    const r = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/labels`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { labelId },
    });
    // The user cannot see this task (view scope is own_public) and certainly
    // cannot edit it — 404 (visibility filter) or 403 (permission) are both
    // acceptable refusals; either signals the request was denied.
    expect([403, 404]).toContain(r.statusCode);
  });

  it("filters tasks by single label", async () => {
    const app = await buildApp();
    const a = await createLabel(app, "a");
    const b = await createLabel(app, "b");
    const t1 = await createTask(app, "Has A");
    const t2 = await createTask(app, "Has B");
    await app.inject({ method: "POST", url: `/api/v1/tasks/${t1}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: a } });
    await app.inject({ method: "POST", url: `/api/v1/tasks/${t2}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: b } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?label=${a}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().data.map((t: any) => t.title);
    expect(titles).toEqual(["Has A"]);
  });

  it("filters tasks by intersection of labels (AND)", async () => {
    const app = await buildApp();
    const a = await createLabel(app, "a");
    const b = await createLabel(app, "b");
    const both = await createTask(app, "Has Both");
    const onlyA = await createTask(app, "Only A");
    await app.inject({ method: "POST", url: `/api/v1/tasks/${both}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: a } });
    await app.inject({ method: "POST", url: `/api/v1/tasks/${both}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: b } });
    await app.inject({ method: "POST", url: `/api/v1/tasks/${onlyA}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: a } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?label=${a}&label=${b}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().data.map((t: any) => t.title);
    expect(titles).toEqual(["Has Both"]);
  });

  it("filter accepts comma-separated label list", async () => {
    const app = await buildApp();
    const a = await createLabel(app, "a");
    const b = await createLabel(app, "b");
    const both = await createTask(app, "Has Both");
    await app.inject({ method: "POST", url: `/api/v1/tasks/${both}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: a } });
    await app.inject({ method: "POST", url: `/api/v1/tasks/${both}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: b } });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/tasks?label=${a},${b}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().data.map((t: any) => t.title);
    expect(titles).toEqual(["Has Both"]);
  });

  it("includes labels in task list response", async () => {
    const app = await buildApp();
    const a = await createLabel(app, "shipit", "#00ff00");
    const taskId = await createTask(app, "tagged");
    await app.inject({ method: "POST", url: `/api/v1/tasks/${taskId}/labels`, headers: { authorization: `Bearer ${engineerToken}` }, payload: { labelId: a } });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const task = res.json().data.find((t: any) => t.id === taskId);
    expect(task.labels).toEqual([{ id: a, name: "shipit", color: "#00ff00" }]);
  });
});
