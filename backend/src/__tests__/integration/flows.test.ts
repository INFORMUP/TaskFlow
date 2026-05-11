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

interface StatusBreakdown {
  status: {
    id: string;
    slug: string;
    name: string;
    color: string | null;
    sortOrder: number;
  };
  count: number;
}

interface FlowResp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stats: {
    openCount: number;
    assignedToMeCount: number;
    byStatus: StatusBreakdown[];
  };
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
      expect(f.stats.openCount).toBe(0);
      expect(f.stats.assignedToMeCount).toBe(0);
    }
  });

  it("returns byStatus with one entry per non-closed status when no tasks exist, all counts zero, in sortOrder", async () => {
    const flows = await getFlows(engineerToken);
    const feat = flows.find((f) => f.slug === "feature")!;
    expect(feat.stats.byStatus.length).toBeGreaterThan(0);
    // Verify ordering by sortOrder ascending
    for (let i = 1; i < feat.stats.byStatus.length; i++) {
      expect(feat.stats.byStatus[i].status.sortOrder).toBeGreaterThan(
        feat.stats.byStatus[i - 1].status.sortOrder
      );
    }
    // No closed entry
    expect(feat.stats.byStatus.some((b) => b.status.slug === "closed")).toBe(false);
    // All counts zero
    expect(feat.stats.byStatus.every((b) => b.count === 0)).toBe(true);
    // Shape: each entry exposes status id/slug/name/color/sortOrder
    for (const b of feat.stats.byStatus) {
      expect(typeof b.status.id).toBe("string");
      expect(typeof b.status.slug).toBe("string");
      expect(typeof b.status.name).toBe("string");
      expect(typeof b.status.sortOrder).toBe("number");
      // color is hex string or null
      expect(b.status.color === null || typeof b.status.color === "string").toBe(true);
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

  it("breaks open counts down by status (closed and deleted excluded; sums to openCount)", async () => {
    const featPrototype = await prisma.flowStatus.findFirst({
      where: { flowId: featureFlowId, slug: "prototype" },
    });
    const featImplement = await prisma.flowStatus.findFirst({
      where: { flowId: featureFlowId, slug: "implement" },
    });
    expect(featPrototype).toBeTruthy();
    expect(featImplement).toBeTruthy();

    // 2 in design, 1 in prototype, 3 in implement, 1 closed, 1 deleted-in-design
    await prisma.task.createMany({
      data: [
        { displayId: "FEAT-BD-1", flowId: featureFlowId, currentStatusId: featureOpenStatusId, title: "d1", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-2", flowId: featureFlowId, currentStatusId: featureOpenStatusId, title: "d2", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-3", flowId: featureFlowId, currentStatusId: featPrototype!.id, title: "p1", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-4", flowId: featureFlowId, currentStatusId: featImplement!.id, title: "i1", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-5", flowId: featureFlowId, currentStatusId: featImplement!.id, title: "i2", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-6", flowId: featureFlowId, currentStatusId: featImplement!.id, title: "i3", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-7", flowId: featureFlowId, currentStatusId: featureClosedStatusId, title: "closed-excl", createdBy: TEST_ENGINEER_ID },
        { displayId: "FEAT-BD-8", flowId: featureFlowId, currentStatusId: featureOpenStatusId, title: "deleted-excl", createdBy: TEST_ENGINEER_ID, isDeleted: true },
      ],
    });

    const flows = await getFlows(engineerToken);
    const feat = flows.find((f) => f.slug === "feature")!;

    expect(feat.stats.openCount).toBe(6);
    expect(feat.stats.byStatus.some((b) => b.status.slug === "closed")).toBe(false);

    const byKey = Object.fromEntries(
      feat.stats.byStatus.map((b) => [b.status.slug, b.count])
    );
    expect(byKey.design).toBe(2);
    expect(byKey.prototype).toBe(1);
    expect(byKey.implement).toBe(3);
    // Untouched statuses still appear with count 0
    expect(byKey.validate).toBe(0);

    // Sum invariant: sum(byStatus[*].count) === openCount
    const sum = feat.stats.byStatus.reduce((acc, b) => acc + b.count, 0);
    expect(sum).toBe(feat.stats.openCount);
  });
});
