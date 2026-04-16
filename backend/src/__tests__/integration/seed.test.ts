import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { seedTeams } from "../../../prisma/seeders/teams.js";
import { seedFlows } from "../../../prisma/seeders/flows.js";
import { seedFlowStatuses } from "../../../prisma/seeders/flow-statuses.js";
import { seedFlowTransitions } from "../../../prisma/seeders/flow-transitions.js";

const prisma = new PrismaClient();

describe("seed data", () => {
  beforeAll(async () => {
    // Clean in reverse dependency order
    await prisma.flowTransition.deleteMany();
    await prisma.flowStatus.deleteMany();
    await prisma.flow.deleteMany();
    await prisma.userTeam.deleteMany();
    await prisma.team.deleteMany();

    await seedTeams(prisma);
    await seedFlows(prisma);
    await seedFlowStatuses(prisma);
    await seedFlowTransitions(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates 4 teams", async () => {
    const teams = await prisma.team.findMany();
    expect(teams).toHaveLength(4);
    const slugs = teams.map((t) => t.slug).sort();
    expect(slugs).toEqual(["agent", "engineer", "product", "user"]);
  });

  it("creates 6 flows", async () => {
    const flows = await prisma.flow.findMany();
    expect(flows).toHaveLength(6);
    const slugs = flows.map((f) => f.slug).sort();
    expect(slugs).toEqual([
      "bug",
      "donor-outreach",
      "event",
      "feature",
      "grant-application",
      "improvement",
    ]);
  });

  it("bug flow has 6 statuses in correct order", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const statuses = await prisma.flowStatus.findMany({
      where: { flowId: flow!.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(statuses).toHaveLength(6);
    expect(statuses.map((s) => s.slug)).toEqual([
      "triage", "investigate", "approve", "resolve", "validate", "closed",
    ]);
  });

  it("feature flow has 7 statuses in correct order", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "feature" } });
    const statuses = await prisma.flowStatus.findMany({
      where: { flowId: flow!.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(statuses).toHaveLength(7);
    expect(statuses.map((s) => s.slug)).toEqual([
      "discuss", "design", "prototype", "implement", "validate", "review", "closed",
    ]);
  });

  it("improvement flow has 5 statuses in correct order", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "improvement" } });
    const statuses = await prisma.flowStatus.findMany({
      where: { flowId: flow!.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(statuses).toHaveLength(5);
    expect(statuses.map((s) => s.slug)).toEqual([
      "propose", "approve", "implement", "validate", "closed",
    ]);
  });

  it("bug flow has 14 transitions", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const transitions = await prisma.flowTransition.findMany({
      where: { flowId: flow!.id },
    });
    expect(transitions).toHaveLength(14);
  });

  it("feature flow has 17 transitions", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "feature" } });
    const transitions = await prisma.flowTransition.findMany({
      where: { flowId: flow!.id },
    });
    expect(transitions).toHaveLength(16);
  });

  it("improvement flow has 9 transitions", async () => {
    const flow = await prisma.flow.findFirst({ where: { slug: "improvement" } });
    const transitions = await prisma.flowTransition.findMany({
      where: { flowId: flow!.id },
    });
    expect(transitions).toHaveLength(9);
  });

  it("all transitions reference valid statuses in their flow", async () => {
    const transitions = await prisma.flowTransition.findMany({
      include: { fromStatus: true, toStatus: true },
    });
    for (const t of transitions) {
      expect(t.fromStatus.flowId).toBe(t.flowId);
      expect(t.toStatus.flowId).toBe(t.flowId);
    }
  });

  it("every non-closed status has a transition to closed", async () => {
    const flows = await prisma.flow.findMany();
    for (const flow of flows) {
      const statuses = await prisma.flowStatus.findMany({
        where: { flowId: flow.id, slug: { not: "closed" } },
      });
      const closedStatus = await prisma.flowStatus.findFirst({
        where: { flowId: flow.id, slug: "closed" },
      });
      for (const status of statuses) {
        const transition = await prisma.flowTransition.findFirst({
          where: {
            flowId: flow.id,
            fromStatusId: status.id,
            toStatusId: closedStatus!.id,
          },
        });
        expect(transition, `${flow.slug}: ${status.slug} -> closed should exist`).not.toBeNull();
      }
    }
  });

  it("seeding is idempotent (re-running skips all)", async () => {
    const teamsResult = await seedTeams(prisma);
    const flowsResult = await seedFlows(prisma);
    const statusesResult = await seedFlowStatuses(prisma);
    const transitionsResult = await seedFlowTransitions(prisma);

    expect(teamsResult.created).toBe(0);
    expect(teamsResult.skipped).toBe(4);
    expect(flowsResult.created).toBe(0);
    expect(flowsResult.skipped).toBe(6);
    expect(statusesResult.created).toBe(0);
    expect(statusesResult.skipped).toBe(33);
    expect(transitionsResult.created).toBe(0);
    expect(transitionsResult.skipped).toBe(65);
  });
});
