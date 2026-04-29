import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import {
  mintTestToken,
  TEST_ENGINEER_ID,
  TEST_PRODUCT_ID,
  TEST_USER_ID,
} from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";

const prisma = new PrismaClient();

const INACTIVE_USER_ID = "00000000-0000-0000-0000-0000000000aa";
const INACTIVE_USER_EMAIL = "inactive-org-members-test@test.com";

describe("GET /api/v1/org-members", () => {
  let engineerToken: string;
  let productToken: string;
  let userToken: string;

  beforeAll(async () => {
    await seedTestUsers(prisma);
    engineerToken = mintTestToken(TEST_ENGINEER_ID);
    productToken = mintTestToken(TEST_PRODUCT_ID);
    userToken = mintTestToken(TEST_USER_ID);

    await prisma.orgMember.deleteMany({ where: { userId: INACTIVE_USER_ID } });
    await prisma.user.deleteMany({
      where: { OR: [{ id: INACTIVE_USER_ID }, { email: INACTIVE_USER_EMAIL }] },
    });
    await prisma.user.create({
      data: {
        id: INACTIVE_USER_ID,
        email: INACTIVE_USER_EMAIL,
        displayName: "Inactive User",
        actorType: "human",
        status: "inactive",
      },
    });
    await prisma.orgMember.create({
      data: { orgId: DEFAULT_ORG_ID, userId: INACTIVE_USER_ID, role: "member" },
    });
  });

  afterAll(async () => {
    await prisma.orgMember.deleteMany({ where: { userId: INACTIVE_USER_ID } });
    await prisma.user.deleteMany({ where: { id: INACTIVE_USER_ID } });
    await prisma.$disconnect();
  });

  it("returns active org members for a product-team user (non-engineer/admin)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
      headers: { authorization: `Bearer ${productToken}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    const ids = body.data.map((m: any) => m.id);
    expect(ids).toContain(TEST_ENGINEER_ID);
    expect(ids).toContain(TEST_PRODUCT_ID);
    expect(ids).toContain(TEST_USER_ID);
  });

  it("also returns 200 for a plain user-team member", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it("returns minimal fields only (id, displayName, actorType) — no email or teams", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    expect(response.statusCode).toBe(200);
    const member = response.json().data[0];
    expect(member).toHaveProperty("id");
    expect(member).toHaveProperty("displayName");
    expect(member).toHaveProperty("actorType");
    expect(member).not.toHaveProperty("email");
    expect(member).not.toHaveProperty("teams");
  });

  it("excludes inactive users", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const ids = response.json().data.map((m: any) => m.id);
    expect(ids).not.toContain(INACTIVE_USER_ID);
  });

  it("sorts by displayName ascending", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
      headers: { authorization: `Bearer ${engineerToken}` },
    });
    const names = response.json().data.map((m: any) => m.displayName);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("returns 401 without a token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/org-members",
    });
    expect(response.statusCode).toBe(401);
  });
});
