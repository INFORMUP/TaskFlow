import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

interface FlowResp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stats: { openCount: number; assignedToMeCount: number };
}

describe("GET /api/v1/flows — stats per flow", () => {
  let engineerToken: string;
  let featureFlowId: string;
  let bugFlowId: string;
  let featureOpenStatusId: string;
  let featureClosedStatusId: string;
  let bugOpenStatusId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);

    const feat = await prisma.flow.findFirst({ where: { slug: "feature" } });
    const bug = await prisma.flow.findFirst({ where: { slug: "bug" } });
    featureFlowId = feat!.id;
    bugFlowId = bug!.id;

    const featOpen = await prisma.flowStatus.findFirst({
      where: { flowId: featureFlowId, slug: "design" },
    });
    const featClosed = await prisma.flowStatus.findFirst({
      where: { flowId: featureFlowId, slug: "closed" },
    });
    const bugOpen = await prisma.flowStatus.findFirst({
      where: { flowId: bugFlowId, slug: "triage" },
    });
    featureOpenStatusId = featOpen!.id;
    featureClosedStatusId = featClosed!.id;
    bugOpenStatusId = bugOpen!.id;
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.$disconnect();
  });

  async function getFlows(token: string): Promise<FlowResp[]> {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/flows",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return res.json().data;
  }

  it("returns 0/0 stats for every flow when no tasks exist", async () => {
    const flows = await getFlows(engineerToken);
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) {
      expect(f.stats).toEqual({ openCount: 0, assignedToMeCount: 0 });
    }
  });

  it("counts open (non-closed, non-deleted) tasks per flow and assigned-to-me subset", async () => {
    // feature flow: 3 open (1 assigned to engineer, 1 to product, 1 unassigned), 1 closed, 1 deleted
    await prisma.task.createMany({
      data: [
        {
          displayId: "FEAT-T-1",
          flowId: featureFlowId,
          currentStatusId: featureOpenStatusId,
          title: "open assigned to engineer",
          createdBy: TEST_ENGINEER_ID,
          assigneeId: TEST_ENGINEER_ID,
        },
        {
          displayId: "FEAT-T-2",
          flowId: featureFlowId,
          currentStatusId: featureOpenStatusId,
          title: "open assigned to product",
          createdBy: TEST_ENGINEER_ID,
          assigneeId: TEST_PRODUCT_ID,
        },
        {
          displayId: "FEAT-T-3",
          flowId: featureFlowId,
          currentStatusId: featureOpenStatusId,
          title: "open unassigned",
          createdBy: TEST_ENGINEER_ID,
        },
        {
          displayId: "FEAT-T-4",
          flowId: featureFlowId,
          currentStatusId: featureClosedStatusId,
          title: "closed should be excluded",
          createdBy: TEST_ENGINEER_ID,
          assigneeId: TEST_ENGINEER_ID,
        },
        {
          displayId: "FEAT-T-5",
          flowId: featureFlowId,
          currentStatusId: featureOpenStatusId,
          title: "deleted should be excluded",
          createdBy: TEST_ENGINEER_ID,
          assigneeId: TEST_ENGINEER_ID,
          isDeleted: true,
        },
        // bug flow: 1 open assigned to engineer
        {
          displayId: "BUG-T-1",
          flowId: bugFlowId,
          currentStatusId: bugOpenStatusId,
          title: "bug open assigned to engineer",
          createdBy: TEST_ENGINEER_ID,
          assigneeId: TEST_ENGINEER_ID,
        },
      ],
    });

    const flows = await getFlows(engineerToken);
    const feat = flows.find((f) => f.slug === "feature")!;
    const bug = flows.find((f) => f.slug === "bug")!;

    expect(feat.stats.openCount).toBe(3);
    expect(feat.stats.assignedToMeCount).toBe(1);
    expect(bug.stats.openCount).toBe(1);
    expect(bug.stats.assignedToMeCount).toBe(1);
  });
});
