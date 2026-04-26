import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedUuid } from "../../../prisma/seeders/common.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";
import { TEST_ENGINEER_ID } from "../helpers/auth.js";

const prisma = new PrismaClient();

const SECRET = "test-webhook-secret";

function sign(body: string): string {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

function prPayload(opts: {
  action: string;
  number: number;
  merged?: boolean;
  mergedAt?: string | null;
  owner?: string;
  name?: string;
}) {
  return {
    action: opts.action,
    pull_request: {
      number: opts.number,
      merged: opts.merged ?? false,
      merged_at: opts.mergedAt ?? null,
    },
    repository: {
      name: opts.name ?? "TaskFlow",
      owner: { login: opts.owner ?? "INFORMUP" },
    },
  };
}

describe("POST /api/v1/webhooks/github", () => {
  let repoId: string;
  let taskId: string;
  let prId: string;
  let originalSecret: string | undefined;

  beforeAll(async () => {
    originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    await seedTestUsers(prisma);
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
    const project = await prisma.project.create({
      data: {
        orgId: DEFAULT_ORG_ID,
        key: "WH",
        name: "Webhook Test",
        ownerUserId: TEST_ENGINEER_ID,
        teams: { create: [{ teamId: engineerTeamId }] },
      },
    });

    const flows = await prisma.flow.findMany({ select: { id: true } });
    for (const flow of flows) {
      await prisma.projectFlow.create({ data: { projectId: project.id, flowId: flow.id } });
    }

    const repo = await prisma.projectRepository.create({
      data: { projectId: project.id, provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" },
    });
    repoId = repo.id;

    const featureFlow = await prisma.flow.findFirstOrThrow({ where: { slug: "feature" } });
    const initialStatus = await prisma.flowStatus.findFirstOrThrow({
      where: { flowId: featureFlow.id },
      orderBy: { sortOrder: "asc" },
    });
    const task = await prisma.task.create({
      data: {
        displayId: "FEAT-wh-1",
        flowId: featureFlow.id,
        currentStatusId: initialStatus.id,
        title: "Webhook test task",
        priority: "medium",
        createdBy: TEST_ENGINEER_ID,
        projects: { create: [{ projectId: project.id }] },
      },
    });
    taskId = task.id;

    const pr = await prisma.taskPullRequest.create({
      data: {
        taskId,
        repositoryId: repoId,
        number: 42,
        state: "open",
        url: "https://github.com/INFORMUP/TaskFlow/pull/42",
      },
    });
    prId = pr.id;
  });

  afterAll(async () => {
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
    if (originalSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  it("flips state to merged on closed+merged=true and sets mergedAt", async () => {
    const app = await buildApp();
    const mergedAt = "2026-04-26T15:00:00.000Z";
    const body = JSON.stringify(
      prPayload({ action: "closed", number: 42, merged: true, mergedAt }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("merged");
    expect(row.mergedAt?.toISOString()).toBe(mergedAt);
  });

  it("flips state to closed on closed+merged=false and leaves mergedAt null", async () => {
    const app = await buildApp();
    const body = JSON.stringify(prPayload({ action: "closed", number: 42, merged: false }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("closed");
    expect(row.mergedAt).toBeNull();
  });

  it("flips state back to open on reopened and clears mergedAt", async () => {
    await prisma.taskPullRequest.update({
      where: { id: prId },
      data: { state: "merged", mergedAt: new Date("2026-04-26T15:00:00.000Z") },
    });
    const app = await buildApp();
    const body = JSON.stringify(prPayload({ action: "reopened", number: 42 }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("open");
    expect(row.mergedAt).toBeNull();
  });

  it("rejects requests with an invalid signature (401)", async () => {
    const app = await buildApp();
    const body = JSON.stringify(prPayload({ action: "closed", number: 42, merged: true }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_SIGNATURE");

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("open");
  });

  it("returns 200 ignored for events on unlinked PR numbers", async () => {
    const app = await buildApp();
    const body = JSON.stringify(prPayload({ action: "closed", number: 999, merged: true }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ignored).toBe(true);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("open");
  });

  it("returns 200 ignored for unsupported event types", async () => {
    const app = await buildApp();
    const body = JSON.stringify({ zen: "Anything added dilutes everything else." });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ignored).toBe(true);
  });

  it("returns 200 ignored for pull_request actions other than closed/reopened", async () => {
    const app = await buildApp();
    const body = JSON.stringify(prPayload({ action: "synchronize", number: 42 }));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ignored).toBe(true);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("open");
  });

  it("matches repository owner/name case-insensitively", async () => {
    const app = await buildApp();
    const body = JSON.stringify(
      prPayload({
        action: "closed",
        number: 42,
        merged: true,
        mergedAt: "2026-04-26T16:00:00.000Z",
        owner: "informup",
        name: "taskflow",
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sign(body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const row = await prisma.taskPullRequest.findUniqueOrThrow({ where: { id: prId } });
    expect(row.state).toBe("merged");
  });
});

describe("POST /api/v1/webhooks/github (no secret configured)", () => {
  let originalSecret: string | undefined;

  beforeAll(() => {
    originalSecret = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET;
    else process.env.GITHUB_WEBHOOK_SECRET = originalSecret;
  });

  it("returns 503 WEBHOOK_NOT_CONFIGURED", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      payload: "{}",
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("WEBHOOK_NOT_CONFIGURED");
  });
});
