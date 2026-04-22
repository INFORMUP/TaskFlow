import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolveDefaultAssignee } from "../../services/task.service.js";
import {
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("resolveDefaultAssignee", () => {
  let projectAId: string;
  let projectBId: string;
  let bugTriageStatusId: string;
  let bugInvestigateStatusId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);

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
    const userTeamId = seedUuid("team", "user");
    const a = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "RA",
        name: "Resolve A",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_ENGINEER_ID,
        teams: {
          create: [
            { teamId: engineerTeamId },
            { teamId: userTeamId },
          ],
        },
      },
    });
    const b = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "RB",
        name: "Resolve B",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_PRODUCT_ID,
        teams: {
          create: [
            { teamId: engineerTeamId },
            { teamId: productTeamId },
          ],
        },
      },
    });
    projectAId = a.id;
    projectBId = b.id;
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

  it("prefers per-status default over project default", async () => {
    await prisma.projectStatusDefaultAssignee.create({
      data: {
        projectId: projectAId,
        flowStatusId: bugTriageStatusId,
        userId: TEST_USER_ID,
      },
    });

    const userId = await resolveDefaultAssignee({
      projectId: projectAId,
      flowStatusId: bugTriageStatusId,
    });
    expect(userId).toBe(TEST_USER_ID);
  });

  it("falls back to project default when no per-status default exists", async () => {
    const userId = await resolveDefaultAssignee({
      projectId: projectAId,
      flowStatusId: bugTriageStatusId,
    });
    expect(userId).toBe(TEST_ENGINEER_ID);
  });

  it("returns null when project default assignee is not on any project team", async () => {
    const stale = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "RD",
        name: "Resolve D",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_PRODUCT_ID,
        teams: { create: [{ teamId: seedUuid("team", "engineer") }] },
      },
    });
    const userId = await resolveDefaultAssignee({
      projectId: stale.id,
      flowStatusId: bugTriageStatusId,
    });
    expect(userId).toBeNull();
  });

  it("returns null when project default assignee is inactive", async () => {
    const inactiveUserId = seedUuid("user", "inactive-default");
    await prisma.user.upsert({
      where: { id: inactiveUserId },
      update: { status: "inactive" },
      create: {
        id: inactiveUserId,
        email: "inactive@test.com",
        displayName: "Inactive",
        actorType: "human",
        status: "inactive",
      },
    });
    await prisma.userTeam.upsert({
      where: { userId_teamId: { userId: inactiveUserId, teamId: seedUuid("team", "engineer") } },
      update: {},
      create: { userId: inactiveUserId, teamId: seedUuid("team", "engineer"), isPrimary: true },
    });

    const proj = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "RE",
        name: "Resolve E",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: inactiveUserId,
        teams: { create: [{ teamId: seedUuid("team", "engineer") }] },
      },
    });
    const userId = await resolveDefaultAssignee({
      projectId: proj.id,
      flowStatusId: bugTriageStatusId,
    });
    expect(userId).toBeNull();
  });

  it("returns null when project has no defaults of any kind", async () => {
    const noDefault = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "RC",
        name: "Resolve C",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: seedUuid("team", "engineer") }] },
      },
    });
    const userId = await resolveDefaultAssignee({
      projectId: noDefault.id,
      flowStatusId: bugTriageStatusId,
    });
    expect(userId).toBeNull();
  });

  it("returns null when taskId has no project", async () => {
    const bugFlow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const task = await prisma.task.create({
      data: {
        displayId: "RES-1",
        flowId: bugFlow!.id,
        currentStatusId: bugTriageStatusId,
        title: "Orphan",
        createdBy: TEST_ENGINEER_ID,
      },
    });
    const userId = await resolveDefaultAssignee({
      taskId: task.id,
      flowStatusId: bugInvestigateStatusId,
    });
    expect(userId).toBeNull();
  });

  it("uses first-attached project (by TaskProject.createdAt) for a multi-project task", async () => {
    const bugFlow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const task = await prisma.task.create({
      data: {
        displayId: "RES-2",
        flowId: bugFlow!.id,
        currentStatusId: bugTriageStatusId,
        title: "Multi",
        createdBy: TEST_ENGINEER_ID,
      },
    });

    const earlyTime = new Date("2026-01-01T00:00:00Z");
    const laterTime = new Date("2026-01-02T00:00:00Z");
    await prisma.taskProject.create({
      data: { taskId: task.id, projectId: projectBId, createdAt: earlyTime },
    });
    await prisma.taskProject.create({
      data: { taskId: task.id, projectId: projectAId, createdAt: laterTime },
    });

    const userId = await resolveDefaultAssignee({
      taskId: task.id,
      flowStatusId: bugInvestigateStatusId,
    });
    // Project B was attached first — its default assignee should win.
    expect(userId).toBe(TEST_PRODUCT_ID);
  });
});
