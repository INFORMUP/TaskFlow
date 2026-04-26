import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("task ↔ commits and PRs (explicit linking)", () => {
  let engineerToken: string;
  let userToken: string;
  let projectAId: string;
  let projectBId: string;
  let repoAId: string;
  let repoBId: string;
  let taskAId: string;

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
    const a = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "CL",
        name: "Code Links A",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    const b = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "CL2",
        name: "Code Links B",
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

    const repoA = await prisma.projectRepository.create({
      data: { projectId: projectAId, provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" },
    });
    const repoB = await prisma.projectRepository.create({
      data: { projectId: projectBId, provider: "GITHUB", owner: "INFORMUP", name: "Other" },
    });
    repoAId = repoA.id;
    repoBId = repoB.id;

    // Task on project A
    const bugFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "bug" } });
    const initialStatus = await prisma.flowStatus.findFirstOrThrow({
      where: { flowId: bugFlow.id },
      orderBy: { sortOrder: "asc" },
    });
    const task = await prisma.task.create({
      data: {
        displayId: "BUG-test-1",
        flowId: bugFlow.id,
        currentStatusId: initialStatus.id,
        title: "Test task",
        priority: "medium",
        createdBy: TEST_ENGINEER_ID,
        projects: { create: [{ projectId: projectAId }] },
      },
    });
    taskAId = task.id;
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

  describe("commits", () => {
    it("POST attaches a commit, GET lists it, DELETE removes it", async () => {
      const app = await buildApp();

      const empty = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json().data).toHaveLength(0);

      const sha = "abcdef0123456789abcdef0123456789abcdef01";
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, sha, message: "fix: thing" },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.sha).toBe(sha);
      expect(body.repositoryId).toBe(repoAId);
      expect(body.url).toBe(`https://github.com/INFORMUP/TaskFlow/commit/${sha}`);

      const list = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(list.json().data).toHaveLength(1);

      const removed = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${taskAId}/commits/${body.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(removed.statusCode).toBe(204);

      const after = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(after.json().data).toHaveLength(0);
    });

    it("rejects a repo not attached to any of the task's projects (422 REPO_NOT_ON_TASK_PROJECT)", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoBId, sha: "1".repeat(40) },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("REPO_NOT_ON_TASK_PROJECT");
    });

    it("rejects duplicate (repository_id, sha) with 409 COMMIT_EXISTS", async () => {
      const app = await buildApp();
      const sha = "1".repeat(40);
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, sha },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, sha },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("COMMIT_EXISTS");
    });

    it("auto-resolves repositoryId when the task's projects have exactly one repo", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { sha: "3".repeat(40) },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().repositoryId).toBe(repoAId);
    });

    it("returns 400 REPO_REQUIRED when SHA-only and the task has multiple repos", async () => {
      // Add a second repo to project A
      await prisma.projectRepository.create({
        data: { projectId: projectAId, provider: "GITHUB", owner: "INFORMUP", name: "Second" },
      });
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { sha: "4".repeat(40) },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("REPO_REQUIRED");
    });

    it("rejects an invalid SHA shape with 400 INVALID_SHA", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/commits`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, sha: "not-a-sha" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_SHA");
    });

    it("forbids users without edit permission on the task's flow (403)", async () => {
      // user team has view (own_public) but no edit on bug flow.
      // Create a task owned by TEST_USER_ID so they can see it; expect 403 on link.
      const bugFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "bug" } });
      const initialStatus = await prisma.flowStatus.findFirstOrThrow({
        where: { flowId: bugFlow.id },
        orderBy: { sortOrder: "asc" },
      });
      const ownTask = await prisma.task.create({
        data: {
          displayId: "BUG-test-2",
          flowId: bugFlow.id,
          currentStatusId: initialStatus.id,
          title: "Owned by user",
          priority: "medium",
          createdBy: TEST_USER_ID,
          projects: { create: [{ projectId: projectAId }] },
        },
      });
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${ownTask.id}/commits`,
        headers: { authorization: `Bearer ${userToken}` },
        payload: { repositoryId: repoAId, sha: "2".repeat(40) },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("pull requests", () => {
    it("POST attaches a PR by number+repositoryId; GET lists; DELETE removes", async () => {
      const app = await buildApp();

      const created = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, number: 42, title: "Add thing", state: "open" },
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();
      expect(body.number).toBe(42);
      expect(body.state).toBe("open");
      expect(body.url).toBe("https://github.com/INFORMUP/TaskFlow/pull/42");

      const list = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(list.json().data).toHaveLength(1);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${taskAId}/pull-requests/${body.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(del.statusCode).toBe(204);
    });

    it("accepts a PR URL via `url` and parses repositoryId/number", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { url: "https://github.com/INFORMUP/TaskFlow/pull/99" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.number).toBe(99);
      expect(body.repositoryId).toBe(repoAId);
    });

    it("rejects duplicate (repository_id, number) with 409 PR_EXISTS", async () => {
      const app = await buildApp();
      const payload = { repositoryId: repoAId, number: 7, state: "open" };
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload,
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("PR_EXISTS");
    });

    it("rejects invalid PR state with 400 INVALID_STATE", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoAId, number: 1, state: "bogus" },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_STATE");
    });

    it("rejects a repo not on the task's projects with 422", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${taskAId}/pull-requests`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { repositoryId: repoBId, number: 1, state: "open" },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe("REPO_NOT_ON_TASK_PROJECT");
    });
  });
});
