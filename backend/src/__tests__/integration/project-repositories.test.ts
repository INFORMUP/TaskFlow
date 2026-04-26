import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

describe("project repositories", () => {
  let engineerToken: string;
  let userToken: string;
  let projectId: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    userToken = mintTestToken(TEST_USER_ID);
  });

  beforeEach(async () => {
    await prisma.projectRepository.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();

    const engineerTeamId = seedUuid("team", "engineer");
    const p = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PR",
        name: "ProjectRepos",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    projectId = p.id;
  });

  afterAll(async () => {
    await prisma.projectRepository.deleteMany();
    await prisma.projectTeam.deleteMany();
    await prisma.project.deleteMany();
    await prisma.$disconnect();
  });

  it("POST adds a repository, GET lists it, DELETE removes it", async () => {
    const app = await buildApp();

    const empty = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data).toHaveLength(0);

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload: { provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" },
    });
    expect(added.statusCode).toBe(201);
    const repo = added.json();
    expect(repo.provider).toBe("GITHUB");
    expect(repo.owner).toBe("INFORMUP");
    expect(repo.name).toBe("TaskFlow");
    expect(typeof repo.id).toBe("string");

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list.json().data).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/repositories/${repo.id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(removed.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(afterDelete.json().data).toHaveLength(0);
  });

  it("supports multiple repositories on the same project", async () => {
    const app = await buildApp();
    for (const name of ["TaskFlow", "Reportal"]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectId}/repositories`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { provider: "GITHUB", owner: "INFORMUP", name },
      });
      expect(res.statusCode).toBe(201);
    }
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(list.json().data).toHaveLength(2);
  });

  it("rejects duplicate (provider, owner, name) on same project with 409", async () => {
    const app = await buildApp();
    const payload = { provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("REPO_EXISTS");
  });

  it("allows the same repo to be attached to multiple projects", async () => {
    const app = await buildApp();
    const engineerTeamId = seedUuid("team", "engineer");
    const p2 = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PR2",
        name: "ProjectRepos2",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });

    const payload = { provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" };
    const r1 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload,
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${p2.id}/repositories`,
      headers: { authorization: `Bearer ${engineerToken}` },
      payload,
    });
    expect(r2.statusCode).toBe(201);
  });

  it("forbids non-owner non-admin from adding or removing", async () => {
    const app = await buildApp();
    const add = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/repositories`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" },
    });
    expect(add.statusCode).toBe(403);

    const added = await prisma.projectRepository.create({
      data: { projectId, provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" },
    });
    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/repositories/${added.id}`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(del.statusCode).toBe(403);
  });

  it("returns 404 when removing a repo that doesn't belong to the project", async () => {
    const app = await buildApp();
    const engineerTeamId = seedUuid("team", "engineer");
    const p2 = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "PR3",
        name: "ProjectRepos3",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });
    const foreign = await prisma.projectRepository.create({
      data: { projectId: p2.id, provider: "GITHUB", owner: "INFORMUP", name: "Other" },
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/repositories/${foreign.id}`,
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
