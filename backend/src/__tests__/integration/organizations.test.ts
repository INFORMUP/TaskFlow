import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { DEFAULT_ORG_ID } from "../../constants/org.js";
import { config } from "../../config.js";

const prisma = new PrismaClient();

const ORG_X_ID = "c0000000-0000-4000-8000-000000000001";
const ORG_Y_ID = "c0000000-0000-4000-8000-000000000002";
const OUTSIDER_ID = "c0000000-0000-4000-8000-0000000000a1";
const NON_ENGINEER_EMAIL = "invitee-new@test.com";

async function clearOrg(orgId: string) {
  await prisma.orgMember.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

async function clearInvitee() {
  const u = await prisma.user.findUnique({ where: { email: NON_ENGINEER_EMAIL } });
  if (u) {
    await prisma.orgMember.deleteMany({ where: { userId: u.id } });
    await prisma.userTeam.deleteMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { id: u.id } });
  }
}

async function clearOutsider() {
  await prisma.orgMember.deleteMany({ where: { userId: OUTSIDER_ID } });
  await prisma.userTeam.deleteMany({ where: { userId: OUTSIDER_ID } });
  await prisma.user.deleteMany({ where: { id: OUTSIDER_ID } });
}

describe("organizations API", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  beforeEach(async () => {
    await clearOrg(ORG_X_ID);
    await clearOrg(ORG_Y_ID);
    await clearInvitee();
    await clearOutsider();

    await prisma.organization.create({
      data: { id: ORG_X_ID, slug: "org-x", name: "Org X" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_X_ID, userId: TEST_ENGINEER_ID, role: "owner" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_X_ID, userId: TEST_USER_ID, role: "member" },
    });

    await prisma.organization.create({
      data: { id: ORG_Y_ID, slug: "org-y", name: "Org Y" },
    });
    await prisma.user.create({
      data: {
        id: OUTSIDER_ID,
        email: "outsider@test.com",
        displayName: "Outsider",
        actorType: "human",
        status: "active",
      },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_Y_ID, userId: OUTSIDER_ID, role: "owner" },
    });
  });

  afterAll(async () => {
    await clearOrg(ORG_X_ID);
    await clearOrg(ORG_Y_ID);
    await clearInvitee();
    await clearOutsider();
    await prisma.$disconnect();
  });

  describe("GET /organizations", () => {
    it("lists the caller's memberships with role", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/organizations",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const orgs = body.data;
      const x = orgs.find((o: any) => o.id === ORG_X_ID);
      const def = orgs.find((o: any) => o.id === DEFAULT_ORG_ID);
      expect(x).toMatchObject({ id: ORG_X_ID, slug: "org-x", name: "Org X", role: "owner" });
      expect(def).toMatchObject({ id: DEFAULT_ORG_ID, role: "member" });
      expect(orgs.find((o: any) => o.id === ORG_Y_ID)).toBeUndefined();
    });
  });

  describe("POST /organizations", () => {
    const NEW_ORG_SLUG = "brand-new-co";

    beforeEach(async () => {
      await prisma.orgMember.deleteMany({ where: { org: { slug: NEW_ORG_SLUG } } });
      await prisma.organization.deleteMany({ where: { slug: NEW_ORG_SLUG } });
    });

    it("creates the org and makes the caller owner", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: DEFAULT_ORG_ID });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/organizations",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug: NEW_ORG_SLUG, name: "Brand New" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({ slug: NEW_ORG_SLUG, name: "Brand New", role: "owner" });

      const member = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: body.id, userId: TEST_USER_ID } },
      });
      expect(member).not.toBeNull();
      expect(member!.role).toBe("owner");

      const list = await app.inject({
        method: "GET",
        url: "/api/v1/organizations",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(list.json().data.some((o: any) => o.id === body.id)).toBe(true);
    });

    it("rejects duplicate slug", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/organizations",
        headers: { authorization: `Bearer ${token}` },
        payload: { slug: "org-x", name: "Dup" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /organizations/:id", () => {
    it("returns members and roles when caller is a member", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${ORG_X_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(ORG_X_ID);
      const roles = new Map(body.members.map((m: any) => [m.userId, m.role]));
      expect(roles.get(TEST_ENGINEER_ID)).toBe("owner");
      expect(roles.get(TEST_USER_ID)).toBe("member");
    });

    it("returns 404 for non-members", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${ORG_Y_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /organizations/:id/members", () => {
    it("owner can add an existing user", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_X_ID}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "outsider@test.com", role: "member" },
      });
      expect(res.statusCode).toBe(201);
      const member = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: ORG_X_ID, userId: OUTSIDER_ID } },
      });
      expect(member!.role).toBe("member");
    });

    it("rejects unknown-email adds with 404 (callers should invite instead)", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_X_ID}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: NON_ENGINEER_EMAIL, role: "member" },
      });
      expect(res.statusCode).toBe(404);
      const u = await prisma.user.findUnique({ where: { email: NON_ENGINEER_EMAIL } });
      expect(u).toBeNull();
    });

    it("rejects non-member caller with 404", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_Y_ID}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "outsider@test.com", role: "member" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("rejects regular-member caller with 403", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_X_ID}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "outsider@test.com", role: "member" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /organizations/:id/members/:userId", () => {
    it("owner can promote a member to admin", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${ORG_X_ID}/members/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: "admin" },
      });
      expect(res.statusCode).toBe(200);
      const m = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: ORG_X_ID, userId: TEST_USER_ID } },
      });
      expect(m!.role).toBe("admin");
    });

    it("admin cannot promote to owner", async () => {
      await prisma.orgMember.update({
        where: { orgId_userId: { orgId: ORG_X_ID, userId: TEST_USER_ID } },
        data: { role: "admin" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${ORG_X_ID}/members/${TEST_ENGINEER_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: "owner" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("member cannot change roles", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${ORG_X_ID}/members/${TEST_ENGINEER_ID}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: "member" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /organizations/:id/members/:userId", () => {
    it("owner can remove a member", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/organizations/${ORG_X_ID}/members/${TEST_USER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
      const m = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: ORG_X_ID, userId: TEST_USER_ID } },
      });
      expect(m).toBeNull();
    });

    it("admin cannot remove another owner", async () => {
      await prisma.orgMember.update({
        where: { orgId_userId: { orgId: ORG_X_ID, userId: TEST_USER_ID } },
        data: { role: "admin" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_X_ID });
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/organizations/${ORG_X_ID}/members/${TEST_ENGINEER_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /auth/switch-org", () => {
    it("issues a new access token scoped to the new org", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/switch-org",
        headers: { authorization: `Bearer ${token}` },
        payload: { orgId: ORG_X_ID },
      });
      expect(res.statusCode).toBe(200);
      const { accessToken } = res.json();
      const decoded = jwt.verify(accessToken, config.jwtSecret) as jwt.JwtPayload;
      expect(decoded.orgId).toBe(ORG_X_ID);
      expect(decoded.orgRole).toBe("owner");
      expect(decoded.sub).toBe(TEST_ENGINEER_ID);
    });

    it("subsequent reads with the new token target the new org", async () => {
      const app = await buildApp();
      const oldToken = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const switchRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/switch-org",
        headers: { authorization: `Bearer ${oldToken}` },
        payload: { orgId: ORG_X_ID },
      });
      const { accessToken } = switchRes.json();

      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${ORG_X_ID}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(detail.statusCode).toBe(200);
    });

    it("rejects switching to an org the user is not a member of", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: DEFAULT_ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/switch-org",
        headers: { authorization: `Bearer ${token}` },
        payload: { orgId: ORG_Y_ID },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
