import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("project code activity rollup", () => {
  let engineerToken: string;
  let userToken: string;
  let projectAId: string;
  let projectBId: string;
  let repoA1Id: string;
  let repoA2Id: string;
  let repoBId: string;
  let taskA1Id: string;
  let taskA2Id: string;
  let taskBId: string;
  let userOwnedTaskId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.taskCommit.deleteMany();
    await prisma.taskPullRequest.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectRepository.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const userTeamId = seedUuid("team", "user");
    const a = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PCA",
        name: "Project A",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }, { teamId: userTeamId }] },
      },
    });
    const b = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PCB",
        name: "Project B",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectAId = a.id;
    projectBId = b.id;

    const flows = await prisma.flow.findMany({ select: { id: true } });
    for (const projectId of [projectAId, projectBId]) {
      for (const flow of flows) {
        await prisma.projectFlow.create({ data: { projectId, flowId: flow.id } });
      }
    }

    repoA1Id = (await prisma.projectRepository.create({
      data: { projectId: projectAId, provider: "GITHUB", owner: "INFORMUP", name: "RepoOne" },
    })).id;
    repoA2Id = (await prisma.projectRepository.create({
      data: { projectId: projectAId, provider: "GITHUB", owner: "INFORMUP", name: "RepoTwo" },
    })).id;
    repoBId = (await prisma.projectRepository.create({
      data: { projectId: projectBId, provider: "GITHUB", owner: "INFORMUP", name: "RepoB" },
    })).id;

    const bugFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "bug" } });
    const featureFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "feature" } });
    const bugInitial = await prisma.flowStatus.findFirstOrThrow({
      where: { flowId: bugFlow.id },
      orderBy: { sortOrder: "asc" },
    });
    const featureInitial = await prisma.flowStatus.findFirstOrThrow({
      where: { flowId: featureFlow.id },
      orderBy: { sortOrder: "asc" },
    });

    taskA1Id = (await prisma.task.create({
      data: {
        displayId: "BUG-pca-1",
        flowId: bugFlow.id,
        currentStatusId: bugInitial.id,
        title: "Task A1",
        priority: "medium",
        createdBy: TEST_ENGINEER_ID,
        projects: { create: [{ projectId: projectAId }] },
      },
    })).id;
    taskA2Id = (await prisma.task.create({
      data: {
        displayId: "BUG-pca-2",
        flowId: bugFlow.id,
        currentStatusId: bugInitial.id,
        title: "Task A2",
        priority: "medium",
        createdBy: TEST_ENGINEER_ID,
        projects: { create: [{ projectId: projectAId }] },
      },
    })).id;
    taskBId = (await prisma.task.create({
      data: {
        displayId: "BUG-pcb-1",
        flowId: bugFlow.id,
        currentStatusId: bugInitial.id,
        title: "Task B (other project)",
        priority: "medium",
        createdBy: TEST_ENGINEER_ID,
        projects: { create: [{ projectId: projectBId }] },
      },
    })).id;
    // A feature task on project A created by TEST_USER_ID — visible to user
    // since feature flow gives user team scope=own_public.
    userOwnedTaskId = (await prisma.task.create({
      data: {
        displayId: "FEAT-pca-1",
        flowId: featureFlow.id,
        currentStatusId: featureInitial.id,
        title: "Feature owned by user",
        priority: "medium",
        createdBy: TEST_USER_ID,
        projects: { create: [{ projectId: projectAId }] },
      },
    })).id;
  });

  afterAll(async () => {
    await prisma.taskCommit.deleteMany();
    await prisma.taskPullRequest.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskProject.deleteMany();
    await prisma.task.deleteMany();
    await prisma.projectRepository.deleteMany();
    await prisma.projectFlow.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  describe("GET /api/v1/projects/:id/commits", () => {
    it("aggregates commits across all tasks in the project, newest first", async () => {
      const app = await buildApp();
      // Two commits on task A1 (different repos), one on task A2, one on task B (excluded).
      const c1 = await prisma.taskCommit.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, sha: "1".repeat(40),
                url: "https://github.com/INFORMUP/RepoOne/commit/" + "1".repeat(40),
                message: "first" },
      });
      const c2 = await prisma.taskCommit.create({
        data: { taskId: taskA1Id, repositoryId: repoA2Id, sha: "2".repeat(40),
                url: "https://github.com/INFORMUP/RepoTwo/commit/" + "2".repeat(40),
                message: "second" },
      });
      const c3 = await prisma.taskCommit.create({
        data: { taskId: taskA2Id, repositoryId: repoA1Id, sha: "3".repeat(40),
                url: "https://github.com/INFORMUP/RepoOne/commit/" + "3".repeat(40),
                message: "third" },
      });
      await prisma.taskCommit.create({
        data: { taskId: taskBId, repositoryId: repoBId, sha: "4".repeat(40),
                url: "https://github.com/INFORMUP/RepoB/commit/" + "4".repeat(40),
                message: "should not appear" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.map((r: any) => r.id)).toEqual([c3.id, c2.id, c1.id]);
      expect(body.data[0].task).toMatchObject({ id: taskA2Id, displayId: "BUG-pca-2" });
      expect(body.data[0].task.flow).toMatchObject({ slug: "bug" });
      expect(body.data[0].repository).toMatchObject({ owner: "INFORMUP", name: "RepoOne" });
      expect(body.pagination.hasMore).toBe(false);
    });

    it("filters by repositoryId", async () => {
      const app = await buildApp();
      await prisma.taskCommit.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, sha: "a".repeat(40),
                url: "https://github.com/INFORMUP/RepoOne/commit/" + "a".repeat(40) },
      });
      const c2 = await prisma.taskCommit.create({
        data: { taskId: taskA1Id, repositoryId: repoA2Id, sha: "b".repeat(40),
                url: "https://github.com/INFORMUP/RepoTwo/commit/" + "b".repeat(40) },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits?repositoryId=${repoA2Id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.map((r: any) => r.id)).toEqual([c2.id]);
    });

    it("returns 400 for a repositoryId not attached to this project", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits?repositoryId=${repoBId}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("REPO_NOT_ON_PROJECT");
    });

    it("paginates via cursor", async () => {
      const app = await buildApp();
      // Create 3 commits with controlled createdAt order.
      const shas = ["1", "2", "3"].map((c) => c.repeat(40));
      for (const sha of shas) {
        await prisma.taskCommit.create({
          data: { taskId: taskA1Id, repositoryId: repoA1Id, sha,
                  url: `https://github.com/INFORMUP/RepoOne/commit/${sha}` },
        });
      }
      const first = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits?limit=2`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const firstBody = first.json();
      expect(firstBody.data).toHaveLength(2);
      expect(firstBody.pagination.hasMore).toBe(true);
      expect(firstBody.pagination.cursor).toBeTruthy();

      const second = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits?limit=2&cursor=${encodeURIComponent(firstBody.pagination.cursor)}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const secondBody = second.json();
      expect(secondBody.data).toHaveLength(1);
      expect(secondBody.pagination.hasMore).toBe(false);
    });

    it("hides commits on tasks the requester can't view (permission filter)", async () => {
      const app = await buildApp();
      // Engineer-created bug task — user team has scope=none on bug flow, so user can't see it.
      await prisma.taskCommit.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, sha: "e".repeat(40),
                url: "https://github.com/INFORMUP/RepoOne/commit/" + "e".repeat(40),
                message: "engineer-only commit" },
      });
      // Commit on the user-owned feature task — user can see this one (own_public).
      await prisma.taskCommit.create({
        data: { taskId: userOwnedTaskId, repositoryId: repoA1Id, sha: "f".repeat(40),
                url: "https://github.com/INFORMUP/RepoOne/commit/" + "f".repeat(40),
                message: "user-visible commit" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/commits`,
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const messages = res.json().data.map((r: any) => r.message);
      expect(messages).toEqual(["user-visible commit"]);
    });

    it("returns 404 for an unknown project", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/00000000-0000-0000-0000-000000000999/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/projects/:id/pull-requests", () => {
    it("aggregates PRs across tasks, newest first", async () => {
      const app = await buildApp();
      const p1 = await prisma.taskPullRequest.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, number: 1, state: "open", title: "PR1",
                url: "https://github.com/INFORMUP/RepoOne/pull/1" },
      });
      const p2 = await prisma.taskPullRequest.create({
        data: { taskId: taskA2Id, repositoryId: repoA1Id, number: 2, state: "merged", title: "PR2",
                url: "https://github.com/INFORMUP/RepoOne/pull/2" },
      });
      await prisma.taskPullRequest.create({
        data: { taskId: taskBId, repositoryId: repoBId, number: 3, state: "open", title: "PR-other",
                url: "https://github.com/INFORMUP/RepoB/pull/3" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.map((r: any) => r.id)).toEqual([p2.id, p1.id]);
      expect(body.data[0].task).toMatchObject({ id: taskA2Id, displayId: "BUG-pca-2" });
    });

    it("filters by state", async () => {
      const app = await buildApp();
      await prisma.taskPullRequest.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, number: 10, state: "open",
                url: "https://github.com/INFORMUP/RepoOne/pull/10" },
      });
      await prisma.taskPullRequest.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, number: 11, state: "merged",
                url: "https://github.com/INFORMUP/RepoOne/pull/11" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/pull-requests?state=open`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].state).toBe("open");
    });

    it("excludes PRs on tasks the requester can't view", async () => {
      const app = await buildApp();
      await prisma.taskPullRequest.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, number: 20, state: "open", title: "engineer-only",
                url: "https://github.com/INFORMUP/RepoOne/pull/20" },
      });
      await prisma.taskPullRequest.create({
        data: { taskId: userOwnedTaskId, repositoryId: repoA1Id, number: 21, state: "open", title: "user-visible",
                url: "https://github.com/INFORMUP/RepoOne/pull/21" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/pull-requests`,
        headers: { authorization: `Bearer ${userToken}` },
      });
      expect(res.statusCode).toBe(200);
      const titles = res.json().data.map((r: any) => r.title);
      expect(titles).toEqual(["user-visible"]);
    });

    it("rejects an invalid state with 400", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/pull-requests?state=bogus`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("excludes commits/PRs on soft-deleted tasks", async () => {
      const app = await buildApp();
      await prisma.taskPullRequest.create({
        data: { taskId: taskA1Id, repositoryId: repoA1Id, number: 30, state: "open",
                url: "https://github.com/INFORMUP/RepoOne/pull/30" },
      });
      await prisma.task.update({ where: { id: taskA1Id }, data: { isDeleted: true } });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
    });
  });
});
