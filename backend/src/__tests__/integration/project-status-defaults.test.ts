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

describe("project status defaults API", () => {
  let engineerToken: string;
  let userToken: string;
  let projectId: string;
  let bugInvestigateStatusId: string;
  let featureInitialStatusId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
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
    const bugFlow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const featureFlow = await prisma.flow.findFirst({ where: { slug: "feature" } });

    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "SDA",
        name: "Status Defaults A",
        ownerUserId: TEST_ENGINEER_ID,
        defaultFlowId: bugFlow!.id,
        teams: { create: [{ teamId: engineerTeamId }, { teamId: productTeamId }] },
      },
    });
    projectId = project.id;

    await prisma.projectFlow.create({ data: { projectId, flowId: bugFlow!.id } });

    const investigate = await prisma.flowStatus.findFirst({
      where: { flowId: bugFlow!.id, slug: "investigate" },
    });
    bugInvestigateStatusId = investigate!.id;

    const featureFirst = await prisma.flowStatus.findFirst({
      where: { flowId: featureFlow!.id, slug: "discuss" },
    });
    featureInitialStatusId = featureFirst!.id;
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

  it("PUT creates, PUT again updates, GET lists, DELETE removes", async () => {
    const app = await buildApp();

    const put1 = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/status-defaults/${bugInvestigateStatusId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { userId: TEST_ENGINEER_ID },
    });
    expect(put1.statusCode).toBe(200);
    expect(put1.json()).toEqual({ flowStatusId: bugInvestigateStatusId, userId: TEST_ENGINEER_ID });

    const list1 = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/status-defaults`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list1.statusCode).toBe(200);
    expect(list1.json().data).toEqual([
      { flowStatusId: bugInvestigateStatusId, userId: TEST_ENGINEER_ID },
    ]);

    const put2 = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/status-defaults/${bugInvestigateStatusId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { userId: TEST_PRODUCT_ID },
    });
    expect(put2.statusCode).toBe(200);
    expect(put2.json().userId).toBe(TEST_PRODUCT_ID);

    const list2 = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/status-defaults`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list2.json().data).toEqual([
      { flowStatusId: bugInvestigateStatusId, userId: TEST_PRODUCT_ID },
    ]);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/status-defaults/${bugInvestigateStatusId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(del.statusCode).toBe(204);

    const list3 = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/status-defaults`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list3.json().data).toEqual([]);
  });

  it("rejects flow-status that does not belong to a flow on the project with 422", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/status-defaults/${featureInitialStatusId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { userId: TEST_ENGINEER_ID },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_STATUS");
  });

  it("rejects a user who is not on any project team with 422", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/status-defaults/${bugInvestigateStatusId}`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { userId: TEST_USER_ID },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("INVALID_USER");
  });

  it("rejects non-editor with 403", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/status-defaults/${bugInvestigateStatusId}`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { userId: TEST_ENGINEER_ID },
    });
    expect(res.statusCode).toBe(403);
  });
});
