import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedScopes } from "../../../prisma/seeders/scopes.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";
import { hashToken, TOKEN_PREFIX, generateToken } from "../../services/token.service.js";

const prisma = new PrismaClient();

const ORG_B_ID = "b0000000-0000-4000-8000-000000000002";
const B_USER_ID = "b0000000-0000-4000-8000-0000000000a1";
const B_ENGINEER_TEAM_ID = "b0000000-0000-4000-8000-0000000000e1";
const B_FLOW_ID = "b0000000-0000-4000-8000-0000000000f1";
const B_STATUS_ID = "b0000000-0000-4000-8000-0000000000f2";
const B_PROJECT_ID = "b0000000-0000-4000-8000-0000000000b1";
const B_TASK_ID = "b0000000-0000-4000-8000-0000000000c1";
const B_COMMENT_ID = "b0000000-0000-4000-8000-0000000000d1";
const B_API_TOKEN_ID = "b0000000-0000-4000-8000-00000000aaa1";

async function clearOrgB() {
  await prisma.apiTokenScope.deleteMany({ where: { token: { orgId: ORG_B_ID } } });
  await prisma.apiToken.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.comment.deleteMany({ where: { task: { flow: { orgId: ORG_B_ID } } } });
  await prisma.taskProject.deleteMany({ where: { task: { flow: { orgId: ORG_B_ID } } } });
  await prisma.task.deleteMany({ where: { flow: { orgId: ORG_B_ID } } });
  await prisma.projectFlow.deleteMany({ where: { project: { orgId: ORG_B_ID } } });
  await prisma.projectTeam.deleteMany({ where: { project: { orgId: ORG_B_ID } } });
  await prisma.project.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.appSetting.deleteMany({ where: { orgId: ORG_B_ID } });
  await prisma.flowTransition.deleteMany({ where: { flow: { orgId: ORG_B_ID } } });
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
  await prisma.organization.create({
    data: { id: ORG_B_ID, slug: "org-b", name: "Org B" },
  });
  await prisma.user.create({
    data: {
      id: B_USER_ID,
      email: "b-engineer@test.com",
      displayName: "B Engineer",
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
    data: { id: B_FLOW_ID, orgId: ORG_B_ID, slug: "bug", name: "Bug B" },
  });
  await prisma.flowStatus.create({
    data: { id: B_STATUS_ID, flowId: B_FLOW_ID, slug: "triage", name: "Triage", sortOrder: 1 },
  });
  await prisma.project.create({
    data: {
      id: B_PROJECT_ID,
      orgId: ORG_B_ID,
      key: "BPROJ",
      name: "Project B",
      ownerUserId: B_USER_ID,
      teams: { create: [{ teamId: B_ENGINEER_TEAM_ID }] },
    },
  });
  await prisma.projectFlow.create({ data: { projectId: B_PROJECT_ID, flowId: B_FLOW_ID } });
  await prisma.task.create({
    data: {
      id: B_TASK_ID,
      displayId: "BUG-B1",
      flowId: B_FLOW_ID,
      currentStatusId: B_STATUS_ID,
      title: "Secret Org B task",
      createdBy: B_USER_ID,
      projects: { create: [{ projectId: B_PROJECT_ID }] },
    },
  });
  await prisma.comment.create({
    data: {
      id: B_COMMENT_ID,
      taskId: B_TASK_ID,
      authorId: B_USER_ID,
      body: "Secret Org B comment",
    },
  });
  await prisma.appSetting.create({
    data: { orgId: ORG_B_ID, defaultFlowId: B_FLOW_ID },
  });
  const { plaintext, hash } = generateToken();
  const scopes = await prisma.scope.findMany();
  await prisma.apiToken.create({
    data: {
      id: B_API_TOKEN_ID,
      orgId: ORG_B_ID,
      userId: B_USER_ID,
      tokenHash: hash,
      name: "org-b-token",
      scopes: { create: scopes.map((s) => ({ scopeId: s.id })) },
    },
  });
  return { bTokenPlaintext: plaintext };
}

describe("org isolation", () => {
  let aToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedScopes(prisma);
    aToken = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
  });

  afterAll(async () => {
    await clearOrgB();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await seedOrgB();
  });

  describe("leak prevention", () => {
    it("team: A cannot read B's team", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/teams",
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((t: any) => t.id);
      expect(ids).not.toContain(B_ENGINEER_TEAM_ID);

      const members = await app.inject({
        method: "GET",
        url: `/api/v1/teams/${B_ENGINEER_TEAM_ID}/members`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(members.statusCode).toBe(404);
    });

    it("project: A cannot read, update, or delete B's project", async () => {
      const app = await buildApp();

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/projects",
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().data.map((p: any) => p.id);
      expect(ids).not.toContain(B_PROJECT_ID);

      const get = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${B_PROJECT_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${B_PROJECT_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
        payload: { name: "pwned" },
      });
      expect([403, 404]).toContain(patch.statusCode);

      const archive = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${B_PROJECT_ID}/archive`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect([403, 404]).toContain(archive.statusCode);

      const stillThere = await prisma.project.findUnique({ where: { id: B_PROJECT_ID } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.name).toBe("Project B");
      expect(stillThere!.archivedAt).toBeNull();
    });

    it("flow: A cannot see B's flow", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/flows",
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(res.statusCode).toBe(200);
      const ids = res.json().data.map((f: any) => f.id);
      expect(ids).not.toContain(B_FLOW_ID);
    });

    it("task: A cannot read, update, or delete B's task", async () => {
      const app = await buildApp();

      const get = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${B_TASK_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(get.statusCode).toBe(404);

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${B_TASK_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
        payload: { title: "pwned" },
      });
      expect(patch.statusCode).toBe(404);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${B_TASK_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(del.statusCode).toBe(404);

      const stillThere = await prisma.task.findUnique({ where: { id: B_TASK_ID } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.title).toBe("Secret Org B task");
      expect(stillThere!.isDeleted).toBe(false);
    });

    it("comment: A cannot read, edit, or delete B's comment", async () => {
      const app = await buildApp();

      const list = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${B_TASK_ID}/comments`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(list.statusCode).toBe(404);

      const patch = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${B_TASK_ID}/comments/${B_COMMENT_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
        payload: { body: "pwned" },
      });
      expect(patch.statusCode).toBe(404);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${B_TASK_ID}/comments/${B_COMMENT_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(del.statusCode).toBe(404);

      const stillThere = await prisma.comment.findUnique({ where: { id: B_COMMENT_ID } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.body).toBe("Secret Org B comment");
      expect(stillThere!.isDeleted).toBe(false);
    });

    it("api token: A cannot list or revoke B's token", async () => {
      const app = await buildApp();

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/auth/tokens",
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().data.map((t: any) => t.id);
      expect(ids).not.toContain(B_API_TOKEN_ID);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/auth/tokens/${B_API_TOKEN_ID}`,
        headers: { authorization: `Bearer ${aToken}` },
      });
      expect(del.statusCode).toBe(404);

      const stillThere = await prisma.apiToken.findUnique({ where: { id: B_API_TOKEN_ID } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.revokedAt).toBeNull();
    });

    it("app setting: A's defaultFlow resolution never touches B's app setting", async () => {
      await prisma.appSetting.upsert({
        where: { orgId: DEFAULT_ORG_ID },
        update: { defaultFlowId: null },
        create: { orgId: DEFAULT_ORG_ID, defaultFlowId: null },
      });
      const bSetting = await prisma.appSetting.findUnique({ where: { orgId: ORG_B_ID } });
      expect(bSetting!.defaultFlowId).toBe(B_FLOW_ID);

      const { resolveDefaultFlow } = await import("../../services/project.service.js");
      const resolved = await resolveDefaultFlow(DEFAULT_ORG_ID, []);
      expect(resolved).toBeNull();
    });

    it("rejects tokens whose orgId claim is not a membership", async () => {
      const app = await buildApp();
      const forgedToken = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_B_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/flows",
        headers: { authorization: `Bearer ${forgedToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("uniqueness across orgs", () => {
    it("team: the same slug can exist in A and B", async () => {
      const aEngineer = await prisma.team.findFirst({
        where: { orgId: DEFAULT_ORG_ID, slug: "engineer" },
      });
      const bEngineer = await prisma.team.findFirst({
        where: { orgId: ORG_B_ID, slug: "engineer" },
      });
      expect(aEngineer).not.toBeNull();
      expect(bEngineer).not.toBeNull();
      expect(aEngineer!.id).not.toBe(bEngineer!.id);
    });

    it("team: duplicate slug within the same org fails", async () => {
      await expect(
        prisma.team.create({
          data: { orgId: ORG_B_ID, slug: "engineer", name: "Dup" },
        }),
      ).rejects.toThrow();
    });

    it("project: the same key can exist in A and B", async () => {
      await prisma.project.create({
        data: {
          orgId: DEFAULT_ORG_ID,
          key: "BPROJ",
          name: "A BPROJ",
          ownerUserId: TEST_ENGINEER_ID,
          teams: { create: [{ teamId: seedUuid("team", "engineer") }] },
        },
      });
      const both = await prisma.project.findMany({ where: { key: "BPROJ" } });
      expect(both.length).toBe(2);
      await prisma.projectTeam.deleteMany({ where: { project: { orgId: DEFAULT_ORG_ID, key: "BPROJ" } } });
      await prisma.project.deleteMany({ where: { orgId: DEFAULT_ORG_ID, key: "BPROJ" } });
    });

    it("project: duplicate key within the same org fails", async () => {
      await expect(
        prisma.project.create({
          data: {
            orgId: ORG_B_ID,
            key: "BPROJ",
            name: "Dup",
            ownerUserId: B_USER_ID,
            teams: { create: [{ teamId: B_ENGINEER_TEAM_ID }] },
          },
        }),
      ).rejects.toThrow();
    });
  });
});
