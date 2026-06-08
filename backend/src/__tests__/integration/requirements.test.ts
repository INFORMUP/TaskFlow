import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_AGENT_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";
import { seedScopes } from "../../../prisma/seeders/scopes.js";
import { generateToken } from "../../services/token.service.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";
import { seedUuid } from "../../../prisma/seeders/common.js";

const prisma = new PrismaClient();

async function createTask(app: any, token: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      projectIds: [TEST_PROJECT_ID],
      flow: "feature",
      title: "Requirements test task",
      priority: "medium",
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function createRequirement(app: any, token: string, taskId: string, statement = "Req A") {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/tasks/${taskId}/requirements`,
    headers: { authorization: `Bearer ${token}` },
    payload: { statement, ordinal: 1 },
  });
  return res;
}

async function addSlot(
  app: any,
  token: string,
  taskId: string,
  requirementId: string,
  opts: { label?: string; requiredActorType?: string | null; requiredUserId?: string | null } = {}
) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/tasks/${taskId}/requirements/${requirementId}/slots`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      label: opts.label ?? "Slot 1",
      // omit ordinal — let the server auto-increment
      requiredActorType: opts.requiredActorType ?? null,
      requiredUserId: opts.requiredUserId ?? null,
    },
  });
  return res;
}

async function attest(
  app: any,
  token: string,
  taskId: string,
  requirementId: string,
  slotId: string,
  verdict = "met"
) {
  return app.inject({
    method: "POST",
    url: `/api/v1/tasks/${taskId}/requirements/${requirementId}/slots/${slotId}/attestations`,
    headers: { authorization: `Bearer ${token}` },
    payload: { verdict },
  });
}

// Creates a real API token in the DB for the given userId with the given scopes.
// Returns the plaintext token string.
async function mintApiToken(
  userId: string,
  scopes: string[],
  opts: { integration?: boolean } = {}
): Promise<string> {
  const { plaintext, hash } = generateToken();
  const scopeRows = await prisma.scope.findMany({ where: { key: { in: scopes } } });
  const token = await prisma.apiToken.create({
    data: {
      name: `test-${userId.slice(0, 8)}`,
      tokenHash: hash,
      userId,
      orgId: DEFAULT_ORG_ID,
      integration: opts.integration ?? false,
      scopes: {
        create: scopeRows.map((s) => ({ scopeId: s.id })),
      },
    },
  });
  // Prevent "last used" staleness from affecting tests
  void token;
  return plaintext;
}

describe("requirements API", () => {
  let engineerToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    await seedTestProjects(prisma);
    await seedScopes(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
  });

  beforeEach(async () => {
    // Clean in FK order
    await prisma.attestation.deleteMany();
    await prisma.signoffSlot.deleteMany();
    await prisma.requirement.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.apiToken.deleteMany();
  });

  afterAll(async () => {
    await prisma.attestation.deleteMany();
    await prisma.signoffSlot.deleteMany();
    await prisma.requirement.deleteMany();
    await prisma.taskTransition.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.apiToken.deleteMany();
    await prisma.$disconnect();
  });

  // ── Requirement CRUD ────────────────────────────────────────────────────────

  describe("POST /api/v1/tasks/:id/requirements", () => {
    it("creates a requirement and returns 201", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);

      const res = await createRequirement(app, engineerToken, task.id, "System must log every access");
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.statement).toBe("System must log every access");
      expect(body.ordinal).toBe(1);
      expect(body.id).toBeDefined();
    });

    it("requires requirements:write scope for API tokens", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      // tasks:write scope only — no requirements:write
      const apiToken = await mintApiToken(TEST_ENGINEER_ID, ["tasks:read", "tasks:write"]);

      const res = await createRequirement(app, apiToken, task.id);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("INSUFFICIENT_SCOPE");
    });
  });

  describe("GET /api/v1/tasks/:id/requirements", () => {
    it("returns empty array when no requirements exist", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns requirements with slots, attestations, and quorum", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);

      const reqRes = await createRequirement(app, engineerToken, task.id, "Req with slot");
      const req = reqRes.json();

      const slotRes = await addSlot(app, engineerToken, task.id, req.id, { label: "Approver" });
      expect(slotRes.statusCode).toBe(201);
      const slot = slotRes.json();

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(getRes.statusCode).toBe(200);
      const reqs = getRes.json();
      expect(reqs).toHaveLength(1);
      const r = reqs[0];
      expect(r.statement).toBe("Req with slot");
      expect(r.slots).toHaveLength(1);
      expect(r.slots[0].id).toBe(slot.id);
      expect(r.slots[0].attestations).toEqual([]);
      expect(r.quorum).toMatchObject({ verified: false, signed: 0, total: 1, missing: ["Approver"] });
    });

    it("requires tasks:read scope", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const apiToken = await mintApiToken(TEST_ENGINEER_ID, ["tasks:write"]);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${apiToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /api/v1/tasks/:id/requirements/:rid", () => {
    it("updates statement and rationale", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { statement: "Updated statement", rationale: "Because reasons" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().statement).toBe("Updated statement");
      expect(res.json().rationale).toBe("Because reasons");
    });
  });

  describe("DELETE /api/v1/tasks/:id/requirements/:rid", () => {
    it("soft-deletes the requirement (204) and excludes it from GET", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(delRes.statusCode).toBe(204);

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(getRes.json()).toHaveLength(0);
    });
  });

  // ── Slot management ─────────────────────────────────────────────────────────

  describe("POST /api/v1/tasks/:id/requirements/:rid/slots", () => {
    it("adds a slot and returns 201", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();

      const res = await addSlot(app, engineerToken, task.id, req.id, {
        label: "Lead Engineer",
        requiredActorType: "human",
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().label).toBe("Lead Engineer");
      expect(res.json().requiredActorType).toBe("human");
    });
  });

  describe("DELETE /api/v1/tasks/:id/requirements/:rid/slots/:sid", () => {
    it("removes a slot (204)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (await addSlot(app, engineerToken, task.id, req.id)).json();

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}/slots/${slot.id}`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(delRes.statusCode).toBe(204);

      // Confirm slot is gone from GET
      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(getRes.json()[0].slots).toHaveLength(0);
    });
  });

  // ── Attestation + channel enforcement ───────────────────────────────────────

  describe("POST .../slots/:sid/attestations", () => {
    it("any-actor slot: JWT session can attest (200)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      // null requiredActorType = unrestricted
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, { label: "Open", requiredActorType: null })
      ).json();

      const res = await attest(app, engineerToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(201);
      expect(res.json().verdict).toBe("met");
    });

    it("human slot: JWT session can attest (200)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Human Approver",
          requiredActorType: "human",
        })
      ).json();

      const res = await attest(app, engineerToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(201);
    });

    it("human slot: API token is rejected (403 CHANNEL_MISMATCH)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Human Only",
          requiredActorType: "human",
        })
      ).json();

      const apiToken = await mintApiToken(TEST_ENGINEER_ID, [
        "tasks:read",
        "attestations:write",
      ]);
      const res = await attest(app, apiToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CHANNEL_MISMATCH");
    });

    it("agent slot: API token with agent actorType can attest (200)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Agent Sign-off",
          requiredActorType: "agent",
        })
      ).json();

      const agentApiToken = await mintApiToken(TEST_AGENT_ID, [
        "tasks:read",
        "attestations:write",
      ]);
      const res = await attest(app, agentApiToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(201);
    });

    it("agent slot: JWT human session is rejected (403 CHANNEL_MISMATCH)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Agent Only",
          requiredActorType: "agent",
        })
      ).json();

      const res = await attest(app, engineerToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CHANNEL_MISMATCH");
    });

    it("agent slot: API token without agent actorType is rejected (403 CHANNEL_MISMATCH)", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Agent Only",
          requiredActorType: "agent",
        })
      ).json();

      // Engineer user is actorType='human', not 'agent'
      const humanApiToken = await mintApiToken(TEST_ENGINEER_ID, ["tasks:read", "attestations:write"]);
      const res = await attest(app, humanApiToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("CHANNEL_MISMATCH");
    });

    it("requiredUserId: only the designated user can attest", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (
        await addSlot(app, engineerToken, task.id, req.id, {
          label: "Specific User",
          requiredActorType: null,
          requiredUserId: TEST_ENGINEER_ID,
        })
      ).json();

      // Wrong user
      const otherToken = mintTestToken("00000000-0000-0000-0000-000000000002"); // TEST_PRODUCT_ID
      const badRes = await attest(app, otherToken, task.id, req.id, slot.id, "met");
      expect(badRes.statusCode).toBe(403);
      expect(badRes.json().error.code).toBe("CHANNEL_MISMATCH");

      // Correct user
      const goodRes = await attest(app, engineerToken, task.id, req.id, slot.id, "met");
      expect(goodRes.statusCode).toBe(201);
    });

    it("attestations:write scope is required for API token", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (await addSlot(app, engineerToken, task.id, req.id)).json();

      const noScopeToken = await mintApiToken(TEST_ENGINEER_ID, ["tasks:read"]);
      const res = await attest(app, noScopeToken, task.id, req.id, slot.id, "met");
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("INSUFFICIENT_SCOPE");
    });

    it("evidenceImageId: attesting with a valid image ID stores the reference", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (await addSlot(app, engineerToken, task.id, req.id)).json();

      // Upload an image to the requirement via raw multipart
      const boundary = "----TestBoundary";
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="screenshot.png"',
        "Content-Type: image/png",
        "",
        "fake-png-data",
        `--${boundary}--`,
      ].join("\r\n");
      const uploadRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}/images`,
        headers: {
          authorization: `Bearer ${engineerToken}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const imageId = uploadRes.json().id;

      // Attest with evidenceImageId
      const attestRes = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}/slots/${slot.id}/attestations`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { verdict: "met", evidenceImageId: imageId },
      });
      expect(attestRes.statusCode).toBe(201);
      expect(attestRes.json().evidenceImageId).toBe(imageId);
    });

    it("evidenceImageId: unknown image ID returns 404", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();
      const slot = (await addSlot(app, engineerToken, task.id, req.id)).json();

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tasks/${task.id}/requirements/${req.id}/slots/${slot.id}/attestations`,
        headers: { authorization: `Bearer ${engineerToken}` },
        payload: { verdict: "met", evidenceImageId: "00000000-0000-0000-0000-000000000099" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("NOT_FOUND");
    });
  });

  // ── Quorum computation ───────────────────────────────────────────────────────

  describe("quorum state", () => {
    it("verified=true when all slots are filled", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();

      const slot1 = (await addSlot(app, engineerToken, task.id, req.id, { label: "Slot A" })).json();
      const slot2 = (await addSlot(app, engineerToken, task.id, req.id, { label: "Slot B" })).json();

      await attest(app, engineerToken, task.id, req.id, slot1.id, "met");

      let getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(getRes.json()[0].quorum.verified).toBe(false);
      expect(getRes.json()[0].quorum.signed).toBe(1);
      expect(getRes.json()[0].quorum.total).toBe(2);

      await attest(app, engineerToken, task.id, req.id, slot2.id, "met");

      getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      expect(getRes.json()[0].quorum.verified).toBe(true);
      expect(getRes.json()[0].quorum.signed).toBe(2);
    });

    it("notDistinct is surfaced but does not block verification", async () => {
      const app = await buildApp();
      const task = await createTask(app, engineerToken);
      const req = (await createRequirement(app, engineerToken, task.id)).json();

      // Two unrestricted slots — same user fills both (non-distinct)
      const slot1 = (
        await addSlot(app, engineerToken, task.id, req.id, { label: "A" })
      ).json();
      const slot2 = (
        await addSlot(app, engineerToken, task.id, req.id, { label: "B" })
      ).json();

      await attest(app, engineerToken, task.id, req.id, slot1.id, "met");
      await attest(app, engineerToken, task.id, req.id, slot2.id, "met");

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/tasks/${task.id}/requirements`,
        headers: { authorization: `Bearer ${engineerToken}` },
      });
      const q = getRes.json()[0].quorum;
      // Both slots filled → verified, even though same actor signed both
      expect(q.verified).toBe(true);
      expect(q.notDistinct).toBe(true);
    });
  });
});
