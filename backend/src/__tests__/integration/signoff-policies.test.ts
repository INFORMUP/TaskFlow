import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { seedTestProjects, TEST_PROJECT_ID } from "../helpers/seed-test-projects.js";
import { seedScopes } from "../../../prisma/seeders/scopes.js";
import { generateToken } from "../../services/token.service.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

let app: Awaited<ReturnType<typeof buildApp>>;
let jwtToken: string;
let apiToken: string;

async function mintApiToken(userId: string, scopes: string[]): Promise<string> {
  const { plaintext, hash } = generateToken();
  const scopeRows = await prisma.scope.findMany({ where: { key: { in: scopes } } });
  await prisma.apiToken.create({
    data: {
      name: `test-${userId.slice(0, 8)}`,
      tokenHash: hash,
      userId,
      orgId: DEFAULT_ORG_ID,
      scopes: { create: scopeRows.map((s) => ({ scopeId: s.id })) },
    },
  });
  return plaintext;
}

async function createTask(token: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: { authorization: `Bearer ${token}` },
    payload: { projectIds: [TEST_PROJECT_ID], flow: "feature", title: "Policy test task", priority: "medium" },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function createPolicy(token: string, slug: string, name = slug) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/signoff-policies",
    headers: { authorization: `Bearer ${token}` },
    payload: { slug, name },
  });
  return res;
}

async function addPolicySlot(token: string, policyId: string, label: string) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/signoff-policies/${policyId}/slots`,
    headers: { authorization: `Bearer ${token}` },
    payload: { label },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

async function createRequirement(token: string, taskId: string, opts?: { slots?: unknown[] }) {
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/tasks/${taskId}/requirements`,
    headers: { authorization: `Bearer ${token}` },
    payload: { statement: "Req stmt", ...(opts ?? {}) },
  });
  return res;
}

beforeAll(async () => {
  app = await buildApp();
  await seedScopes(prisma);
  await seedTestUsers(prisma);
  await seedTestProjects(prisma);
  jwtToken = mintTestToken(TEST_ENGINEER_ID);
  apiToken = await mintApiToken(TEST_ENGINEER_ID, ["tasks:read", "tasks:write", "requirements:write", "attestations:write"]);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.signoffPolicySlot.deleteMany();
  await prisma.signoffPolicy.deleteMany();
  await prisma.appSetting.updateMany({ data: { defaultSignoffPolicyId: null } });
  await prisma.project.updateMany({ data: { defaultSignoffPolicyId: null } });
  await prisma.requirement.deleteMany();
});

describe("signoff-policies CRUD", () => {
  it("creates a policy and lists it", async () => {
    const createRes = await createPolicy(jwtToken, "standard", "Standard Policy");
    expect(createRes.statusCode).toBe(201);
    const policy = createRes.json();
    expect(policy.slug).toBe("standard");
    expect(policy.name).toBe("Standard Policy");
    expect(policy.slots).toEqual([]);

    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/signoff-policies",
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as any[];
    expect(list.some((p: any) => p.id === policy.id)).toBe(true);
  });

  it("gets a policy by id", async () => {
    const pol = (await createPolicy(jwtToken, "get-test")).json();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/signoff-policies/${pol.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(pol.id);
  });

  it("updates a policy name", async () => {
    const pol = (await createPolicy(jwtToken, "upd-test")).json();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/signoff-policies/${pol.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: "Updated Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Updated Name");
  });

  it("deletes a policy", async () => {
    const pol = (await createPolicy(jwtToken, "del-test")).json();
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/signoff-policies/${pol.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(delRes.statusCode).toBe(204);
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/signoff-policies/${pol.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("adds and removes slots on a policy", async () => {
    const pol = (await createPolicy(jwtToken, "slots-test")).json();
    const slot = await addPolicySlot(jwtToken, pol.id, "Reviewer");
    expect(slot.label).toBe("Reviewer");

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/signoff-policies/${pol.id}/slots/${slot.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(delRes.statusCode).toBe(204);
  });
});

describe("requirement creation with default policy resolution", () => {
  it("materializes org-level policy slots when no explicit slots provided", async () => {
    const pol = (await createPolicy(jwtToken, "org-default")).json();
    await addPolicySlot(jwtToken, pol.id, "Implementer");
    await addPolicySlot(jwtToken, pol.id, "Requester");

    // Set org-level default.
    const setRes = await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: pol.id },
    });
    expect(setRes.statusCode).toBe(204);

    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id);
    expect(reqRes.statusCode).toBe(201);
    const req = reqRes.json();
    expect(req.slots).toHaveLength(2);
    expect(req.slots.map((s: any) => s.label)).toEqual(["Implementer", "Requester"]);
  });

  it("task-level default overrides org-level default", async () => {
    const orgPol = (await createPolicy(jwtToken, "org-pol-override")).json();
    await addPolicySlot(jwtToken, orgPol.id, "OrgSlot");

    const taskPol = (await createPolicy(jwtToken, "task-pol-override")).json();
    await addPolicySlot(jwtToken, taskPol.id, "TaskSlot");

    // Set org default.
    await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: orgPol.id },
    });

    const task = await createTask(jwtToken);

    // Set task-level default (overrides org).
    const setTaskRes = await app.inject({
      method: "PUT",
      url: `/api/v1/signoff-policies/defaults/tasks/${task.id}`,
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: taskPol.id },
    });
    expect(setTaskRes.statusCode).toBe(204);

    const reqRes = await createRequirement(jwtToken, task.id);
    expect(reqRes.statusCode).toBe(201);
    const req = reqRes.json();
    expect(req.slots).toHaveLength(1);
    expect(req.slots[0].label).toBe("TaskSlot");
  });

  it("project-level default overrides org-level default", async () => {
    const orgPol = (await createPolicy(jwtToken, "org-pol-proj")).json();
    await addPolicySlot(jwtToken, orgPol.id, "OrgSlotProj");

    const projPol = (await createPolicy(jwtToken, "proj-pol")).json();
    await addPolicySlot(jwtToken, projPol.id, "ProjSlot");

    await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: orgPol.id },
    });

    const setProjRes = await app.inject({
      method: "PUT",
      url: `/api/v1/signoff-policies/defaults/projects/${TEST_PROJECT_ID}`,
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: projPol.id },
    });
    expect(setProjRes.statusCode).toBe(204);

    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id);
    expect(reqRes.statusCode).toBe(201);
    const req = reqRes.json();
    expect(req.slots).toHaveLength(1);
    expect(req.slots[0].label).toBe("ProjSlot");
  });

  it("creates zero-slot requirement when no effective policy exists", async () => {
    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id);
    expect(reqRes.statusCode).toBe(201);
    expect(reqRes.json().slots).toHaveLength(0);
  });

  it("explicit slots in body bypass the default policy", async () => {
    const pol = (await createPolicy(jwtToken, "bypass-default")).json();
    await addPolicySlot(jwtToken, pol.id, "ShouldBeIgnored");

    await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: pol.id },
    });

    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id, {
      slots: [{ label: "ExplicitSlot" }],
    });
    expect(reqRes.statusCode).toBe(201);
    const req = reqRes.json();
    expect(req.slots).toHaveLength(1);
    expect(req.slots[0].label).toBe("ExplicitSlot");
  });

  it("explicit empty slots array creates zero-slot requirement even with default policy", async () => {
    const pol = (await createPolicy(jwtToken, "empty-slots-bypass")).json();
    await addPolicySlot(jwtToken, pol.id, "ShouldBeIgnored2");

    await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: pol.id },
    });

    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id, { slots: [] });
    expect(reqRes.statusCode).toBe(201);
    expect(reqRes.json().slots).toHaveLength(0);
  });

  it("later policy slot edit does not affect already-materialized requirement slots", async () => {
    const pol = (await createPolicy(jwtToken, "immutable-test")).json();
    await addPolicySlot(jwtToken, pol.id, "OriginalSlot");

    await app.inject({
      method: "PUT",
      url: "/api/v1/signoff-policies/defaults/org",
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { policyId: pol.id },
    });

    const task = await createTask(jwtToken);
    const reqRes = await createRequirement(jwtToken, task.id);
    const req = reqRes.json();
    expect(req.slots).toHaveLength(1);
    expect(req.slots[0].label).toBe("OriginalSlot");

    // Now add a new slot to the policy.
    await addPolicySlot(jwtToken, pol.id, "NewSlot");

    // Re-fetch the requirement — should still have only the original slot.
    const getRes = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${task.id}/requirements`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    const reqs = getRes.json() as any[];
    const found = reqs.find((r: any) => r.id === req.id);
    expect(found.slots).toHaveLength(1);
    expect(found.slots[0].label).toBe("OriginalSlot");
  });
});
