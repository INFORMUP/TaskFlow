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

const ORG_B_ID = "b0000000-0000-4000-8000-000000000010";
const B_USER_ID = "b0000000-0000-4000-8000-0000000000b1";
const B_ENGINEER_TEAM_ID = "b0000000-0000-4000-8000-0000000000b2";
const B_FLOW_ID = "b0000000-0000-4000-8000-0000000000b3";
const B_STATUS_ID = "b0000000-0000-4000-8000-0000000000b4";
const B_PROJECT_ID = "b0000000-0000-4000-8000-0000000000b5";

async function clearOrgB() {
  await prisma.taskProject.deleteMany({ where: { task: { flow: { orgId: ORG_B_ID } } } });
  await prisma.task.deleteMany({ where: { flow: { orgId: ORG_B_ID } } });
  await prisma.projectFlow.deleteMany({ where: { project: { orgId: ORG_B_ID } } });
  await prisma.projectTeam.deleteMany({ where: { project: { orgId: ORG_B_ID } } });
  await prisma.project.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.flowStatus.deleteMany({ where: { flow: { orgId: ORG_B_ID } } });
  await prisma.flow.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.userTeam.deleteMany({ where: { team: { orgId: ORG_B_ID } } });
  await prisma.team.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.orgMember.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.user.deleteMany({ where: { id: B_USER_ID } });
  await prisma.organization.deleteMany({ where: { id: ORG_B_ID } });
}

async function seedOrgB() {
  await clearOrgB();
  await prisma.organization.create({ data: { id: ORG_B_ID, slug: "org-b-search", name: "Org B" } });
  await prisma.user.create({
    data: {
      id: B_USER_ID,
      email: "b-search@test.com",
      displayName: "B User",
      actorType: "human",
      status: "active",
    },
  });
  await prisma.team.create({
    data: { id: B_ENGINEER_TEAM_ID, orgId: ORG_B_ID, slug: "engineer", name: "Engineer B" },
  });
  await prisma.userTeam.create({
    data: { userId: B_USER_ID, teamId: B_ENGINEER_TEAM_ID, isPrimary: true },
  });
  await prisma.orgMember.create({
    data: { orgId: ORG_B_ID, userId: B_USER_ID, role: "member" },
  });
  await prisma.flow.create({
    data: { id: B_FLOW_ID, orgId: ORG_B_ID, slug: "feature", name: "Feature B" },
  });
  await prisma.flowStatus.create({
    data: { id: B_STATUS_ID, flowId: B_FLOW_ID, slug: "discuss", name: "Discuss", sortOrder: 1 },
  });
  await prisma.project.create({
    data: {
      id: B_PROJECT_ID,
      orgId: ORG_B_ID,
      key: "BSEARCH",
      name: "Project B Searchable",
      ownerUserId: B_USER_ID,
    },
  });
  await prisma.task.create({
    data: {
      displayId: "FEAT-B-LOGIN",
      flowId: B_FLOW_ID,
      currentStatusId: B_STATUS_ID,
      title: "B login redirect issue",
      description: "Org B private task",
      createdBy: B_USER_ID,
      assigneeId: B_USER_ID,
    },
  });
}

describe("global search", () => {
  let engineerToken: string;
  let projectId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany({ where: { orgId: DEFAULT_ORG_ID } });

    const engineerTeamId = seedUuid("team", "engineer");
    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "SRCH",
        name: "Searchable",
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
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany({ where: { orgId: DEFAULT_ORG_ID } });
    await clearOrgB();
    await prisma.$disconnect();
  });

  async function createTask(
    app: any,
    payload: { title: string; description?: string; flow?: string }
  ) {
    return app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: payload.flow ?? "feature",
        priority: "low",
        projectIds: [projectId],
        title: payload.title,
        description: payload.description,
      },
    });
  }

  it("returns empty groups for queries shorter than 2 chars", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Login redirect bug" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=l",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tasks: [], projects: [] });
  });

  it("matches tasks by title with prefix tokens", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Login redirect bug" });
    await createTask(app, { title: "Header layout drift" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=log",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().tasks.map((t: any) => t.title);
    expect(titles).toEqual(["Login redirect bug"]);
  });

  it("matches tasks by description", async () => {
    const app = await buildApp();
    await createTask(app, { title: "Alpha", description: "Touches the Prisma client" });
    await createTask(app, { title: "Beta", description: "Pure UI tweak" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=prisma",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const titles = res.json().tasks.map((t: any) => t.title);
    expect(titles).toEqual(["Alpha"]);
  });

  it("matches projects by name and key", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=search",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const names = res.json().projects.map((p: any) => p.name);
    expect(names).toContain("Searchable");
  });

  it("returns snippet with <mark> highlighting on matched terms", async () => {
    const app = await buildApp();
    await createTask(app, {
      title: "Authentication failure",
      description: "Users cannot log in when their session token is expired",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=session",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const result = res.json().tasks[0];
    expect(result.snippet).toContain("<mark>");
    expect(result.snippet).toContain("</mark>");
    expect(result.snippet.toLowerCase()).toContain("session");
  });

  it("excludes soft-deleted tasks", async () => {
    const app = await buildApp();
    const create = await createTask(app, { title: "Deletion candidate" });
    const taskId = create.json().id;
    await prisma.task.update({ where: { id: taskId }, data: { isDeleted: true } });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=deletion",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.json().tasks).toHaveLength(0);
  });

  it("excludes archived projects", async () => {
    const app = await buildApp();
    await prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=searchable",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.json().projects).toHaveLength(0);
  });

  it("does not leak tasks or projects from another org", async () => {
    await seedOrgB();
    const app = await buildApp();
    await createTask(app, { title: "A login local" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=login",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const taskTitles = res.json().tasks.map((t: any) => t.title);
    expect(taskTitles).toContain("A login local");
    expect(taskTitles).not.toContain("B login redirect issue");

    const projectNames = res.json().projects.map((p: any) => p.name);
    expect(projectNames).not.toContain("Project B Searchable");
  });

  it("rejects unauthenticated requests", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/search?q=anything" });
    expect(res.statusCode).toBe(401);
  });

  it("matches a task by its display ID even when not in the indexed text", async () => {
    const app = await buildApp();
    const create = await createTask(app, { title: "Wholly unrelated subject" });
    const displayId = create.json().displayId;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=${displayId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().tasks.map((t: any) => t.displayId);
    expect(ids[0]).toBe(displayId);
  });

  it("display-id lookup is case-insensitive", async () => {
    const app = await buildApp();
    const create = await createTask(app, { title: "Anything" });
    const displayId: string = create.json().displayId;

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/search?q=${displayId.toLowerCase()}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const ids = res.json().tasks.map((t: any) => t.displayId);
    expect(ids).toContain(displayId);
  });

  it("respects limit param per group", async () => {
    const app = await buildApp();
    for (let i = 0; i < 5; i++) {
      await createTask(app, { title: `Login token rotation ${i}` });
    }

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/search?q=login&limit=2",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.json().tasks.length).toBeLessThanOrEqual(2);
  });
});
