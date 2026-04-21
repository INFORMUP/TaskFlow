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

describe("per-status default assignee — entry rules", () => {
  let engineerToken: string;
  let projectId: string;
  let bugTriageStatusId: string;
  let bugInvestigateStatusId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);

    const bugFlow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const triage = await prisma.flowStatus.findFirst({
      where: { flowId: bugFlow!.id, slug: "triage" },
    });
    const investigate = await prisma.flowStatus.findFirst({
      where: { flowId: bugFlow!.id, slug: "investigate" },
    });
    bugTriageStatusId = triage!.id;
    bugInvestigateStatusId = investigate!.id;
  });

  beforeEach(async () => {
    await prisma.projectStatusDefaultAssignee.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const productTeamId = seedUuid("team", "product");
    const bug = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "SDE",
        name: "Status Default Entry",
        ownerUserId: TEST_ENGINEER_ID,
        defaultFlowId: bug!.id,
        defaultAssigneeUserId: TEST_ENGINEER_ID,
        teams: {
          create: [
            { teamId: engineerTeamId },
            { teamId: productTeamId },
          ],
        },
      },
    });
    projectId = project.id;
    await prisma.projectFlow.create({ data: { projectId, flowId: bug!.id } });
  });

  afterAll(async () => {
    await prisma.projectStatusDefaultAssignee.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  it("on create, per-status default wins over project default", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId,
        flowStatusId: bugTriageStatusId,
        userId: TEST_PRODUCT_ID,
      },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Per-status wins",
        priority: "medium",
        projectIds: [projectId],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignee.id).toBe(TEST_PRODUCT_ID);
  });

  it("on create, explicit assigneeUserId wins over per-status default", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId,
        flowStatusId: bugTriageStatusId,
        userId: TEST_PRODUCT_ID,
      },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Explicit wins",
        priority: "medium",
        projectIds: [projectId],
        assigneeUserId: TEST_ENGINEER_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().assignee.id).toBe(TEST_ENGINEER_ID);
  });

  it("on transition, unassigned task picks up per-status default for target status", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId,
        flowStatusId: bugInvestigateStatusId,
        userId: TEST_PRODUCT_ID,
      },
    });

    const app = await buildApp();
    // Create with explicit null assignee to avoid picking up project default
    // on initial status. (Project default is TEST_ENGINEER_ID.) We need a
    // task entering investigate from unassigned, so clear the assignee first.
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Transition default",
        priority: "medium",
        projectIds: [projectId],
      },
    });
    const taskId = create.json().id;
    await prisma.task.update({ where: { id: taskId }, data: { assigneeId: null } });

    const trans = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { toStatus: "investigate", note: "Moving" },
    });
    expect(trans.statusCode).toBe(201);

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    expect(updated!.assigneeId).toBe(TEST_PRODUCT_ID);
  });

  it("on transition, existing assignee is never overwritten", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId,
        flowStatusId: bugInvestigateStatusId,
        userId: TEST_PRODUCT_ID,
      },
    });

    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Preserve assignee",
        priority: "medium",
        projectIds: [projectId],
        assigneeUserId: TEST_ENGINEER_ID,
      },
    });
    const taskId = create.json().id;

    const trans = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { toStatus: "investigate", note: "Moving" },
    });
    expect(trans.statusCode).toBe(201);

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    expect(updated!.assigneeId).toBe(TEST_ENGINEER_ID);
  });

  it("on transition, explicit newAssigneeUserId wins over per-status default", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId,
        flowStatusId: bugInvestigateStatusId,
        userId: TEST_PRODUCT_ID,
      },
    });

    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        flow: "bug",
        title: "Explicit transition",
        priority: "medium",
        projectIds: [projectId],
      },
    });
    const taskId = create.json().id;
    await prisma.task.update({ where: { id: taskId }, data: { assigneeId: null } });

    const trans = await app.inject({
      method: "POST",
      url: `/api/v1/tasks/${taskId}/transitions`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: {
        toStatus: "investigate",
        note: "Moving",
        newAssigneeUserId: TEST_ENGINEER_ID,
      },
    });
    expect(trans.statusCode).toBe(201);

    const updated = await prisma.task.findUnique({ where: { id: taskId } });
    expect(updated!.assigneeId).toBe(TEST_ENGINEER_ID);
  });
});
