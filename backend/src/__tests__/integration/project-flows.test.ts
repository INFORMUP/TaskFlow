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

describe("project ↔ flow attachments", () => {
  let engineerToken: string;
  let userToken: string;
  let projectId: string;
  let bugFlowId: string;
  let featureFlowId: string;
  let grantFlowId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);

    const bug = await prisma.flow.findFirst({ where: { slug: "bug" } });
    const feat = await prisma.flow.findFirst({ where: { slug: "feature" } });
    const grant = await prisma.flow.findFirst({ where: { slug: "grant-application" } });
    bugFlowId = bug!.id;
    featureFlowId = feat!.id;
    grantFlowId = grant!.id;
  });

  beforeEach(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const p = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PF",
        name: "ProjectFlows",
        ownerUserId: TEST_ENGINEER_ID,
        defaultAssigneeUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectId = p.id;
  });

  afterAll(async () => {
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  describe("attach/detach lifecycle", () => {
    it("POST attaches a flow, GET lists it, DELETE detaches", async () => {
      const app = await buildApp();

      const empty = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(empty.json().data).toHaveLength(0);

      const attach = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flowId: bugFlowId },
      });
      expect(attach.statusCode).toBe(200);
      expect(attach.json().data).toHaveLength(1);
      expect(attach.json().data[0].slug).toBe("bug");

      const detach = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/flows/${bugFlowId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(detach.statusCode).toBe(200);
      expect(detach.json().data).toHaveLength(0);
    });

    it("attach is idempotent", async () => {
      const app = await buildApp();
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/flows`,
          headers: { authorization: `Bearer ${engineerToken}` },
          payload: { flowId: bugFlowId },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().data).toHaveLength(1);
      }
    });

    it("forbids non-owner non-admin from attaching", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { flowId: bugFlowId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("default_flow_id validation", () => {
    it("PATCH rejects default_flow_id that isn't attached", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { defaultFlowId: bugFlowId },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("FLOW_NOT_ATTACHED");
    });

    it("PATCH accepts default_flow_id once attached", async () => {
      const app = await buildApp();
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flowId: bugFlowId },
      });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { defaultFlowId: bugFlowId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().defaultFlow.id).toBe(bugFlowId);
    });
  });

  describe("task-create union membership", () => {
    async function attach(app: any, flowId: string) {
      return app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flowId },
      });
    }

    it("rejects task create when flow isn't attached to any selected project", async () => {
      const app = await buildApp();
      await attach(app, featureFlowId);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          flow: "bug",
          title: "Out of scope",
          priority: "low",
          projectIds: [projectId],
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("FLOW_NOT_IN_PROJECTS");
    });

    it("accepts task create when flow is attached via the union of projects", async () => {
      const app = await buildApp();
      const engineerTeamId = seedUuid("team", "engineer");
      const p2 = await prisma.project.create({
        data: {
          orgId: DEFAULT_ORG_ID,
          key: "PF2",
          name: "Second",
          ownerUserId: TEST_ENGINEER_ID,
          teams: { create: [{ teamId: engineerTeamId }] },
        },
      });
      // Only p1 offers feature, only p2 offers bug — union offers both.
      await attach(app, featureFlowId);
      await prisma.projectFlow.create({ data: { projectId: p2.id, flowId: bugFlowId } });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          flow: "bug",
          title: "Union bug",
          priority: "low",
          projectIds: [projectId, p2.id],
          assigneeUserId: TEST_ENGINEER_ID,
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe("detach guard", () => {
    it("blocks detaching a flow in use by a task with no other offering project", async () => {
      const app = await buildApp();
      await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/flows`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { flowId: bugFlowId },
      });

      // Create a task that uses `bug` via this project.
      await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          flow: "bug",
          title: "Blocker",
          priority: "low",
          projectIds: [projectId],
          assigneeUserId: TEST_ENGINEER_ID,
        },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}/flows/${bugFlowId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("FLOW_IN_USE");
    });
  });

  describe("last-flow-reachability guard on task project removal", () => {
    it("blocks removing a project from a task when it leaves the flow unreachable", async () => {
      const app = await buildApp();
      const engineerTeamId = seedUuid("team", "engineer");
      const p2 = await prisma.project.create({
        data: {
          orgId: DEFAULT_ORG_ID,
          key: "PF3",
          name: "Second",
          ownerUserId: TEST_ENGINEER_ID,
          teams: { create: [{ teamId: engineerTeamId }] },
        },
      });
      // Project 1 offers bug; project 2 only offers grant-application.
      await prisma.projectFlow.createMany({
        data: [
          { projectId, flowId: bugFlowId },
          { projectId: p2.id, flowId: grantFlowId },
        ],
      });

      const created = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: {
          flow: "bug",
          title: "Reachability",
          priority: "low",
          projectIds: [projectId, p2.id],
          assigneeUserId: TEST_ENGINEER_ID,
        },
      });
      const taskId = created.json().id;

      // Removing projectId should be blocked — p2 doesn't offer bug.
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${taskId}/projects/${projectId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("FLOW_UNREACHABLE");
    });
  });
});
