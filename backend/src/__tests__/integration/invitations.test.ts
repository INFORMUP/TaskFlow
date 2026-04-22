import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID, TEST_USER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";
import { hashToken } from "../../services/token.service.js";

const prisma = new PrismaClient();

const ORG_ID = "c0000000-0000-4000-8000-0000000000b1";
const INVITEE_EMAIL = "new-invitee@test.com";
const INVITEE_USER_ID = "c0000000-0000-4000-8000-0000000000b2";

async function clearFixtures() {
  await prisma.invitation.deleteMany({ where: { orgId: ORG_ID } });
  await prisma.orgMember.deleteMany({ where: { orgId: ORG_ID } });
  await prisma.organization.deleteMany({ where: { id: ORG_ID } });
  const invitee = await prisma.user.findUnique({ where: { email: INVITEE_EMAIL } });
  if (invitee) {
    await prisma.orgMember.deleteMany({ where: { userId: invitee.id } });
    await prisma.user.deleteMany({ where: { id: invitee.id } });
  }
  await prisma.user.deleteMany({ where: { id: INVITEE_USER_ID } });
}

describe("invitations API", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  beforeEach(async () => {
    await clearFixtures();
    await prisma.organization.create({
      data: { id: ORG_ID, slug: "org-invites", name: "Invites Org" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_ID, userId: TEST_ENGINEER_ID, role: "owner" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_ID, userId: TEST_USER_ID, role: "member" },
    });
  });

  afterAll(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  describe("POST /organizations/:id/invitations", () => {
    it("owner creates an invitation and gets a token back", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("pending");
      expect(body.email).toBe(INVITEE_EMAIL);
      expect(body.role).toBe("member");
      expect(body.token).toMatch(/^tfinv_/);
      expect(body.invitedById).toBe(TEST_ENGINEER_ID);

      const stored = await prisma.invitation.findUnique({ where: { id: body.id } });
      expect(stored!.tokenHash).toBe(hashToken(body.token));
    });

    it("rejects regular-member caller with 403", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects admin inviting an owner", async () => {
      await prisma.orgMember.update({
        where: { orgId_userId: { orgId: ORG_ID, userId: TEST_USER_ID } },
        data: { role: "admin" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_USER_ID, { orgId: ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "owner" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects duplicate pending invitation for same email", async () => {
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const first = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      expect(second.statusCode).toBe(409);
    });

    it("rejects inviting an email that is already a member", async () => {
      await prisma.user.create({
        data: {
          id: INVITEE_USER_ID,
          email: INVITEE_EMAIL,
          displayName: "Existing",
          actorType: "human",
          status: "active",
        },
      });
      await prisma.orgMember.create({
        data: { orgId: ORG_ID, userId: INVITEE_USER_ID, role: "member" },
      });
      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("GET /organizations/:id/invitations", () => {
    it("lists invitations with derived status (pending/expired/accepted)", async () => {
      const now = new Date();
      await prisma.invitation.createMany({
        data: [
          {
            orgId: ORG_ID,
            email: "pending@test.com",
            role: "member",
            tokenHash: "pending-hash",
            expiresAt: new Date(now.getTime() + 86400000),
          },
          {
            orgId: ORG_ID,
            email: "expired@test.com",
            role: "member",
            tokenHash: "expired-hash",
            createdAt: new Date(now.getTime() - 14 * 86400000),
            expiresAt: new Date(now.getTime() - 7 * 86400000),
          },
          {
            orgId: ORG_ID,
            email: "accepted@test.com",
            role: "member",
            tokenHash: null,
            expiresAt: new Date(now.getTime() + 86400000),
            acceptedAt: now,
            acceptedByUserId: TEST_USER_ID,
          },
        ],
      });

      const app = await buildApp();
      const token = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const byEmail = new Map(
        res.json().data.map((i: any) => [i.email, i.status]),
      );
      expect(byEmail.get("pending@test.com")).toBe("pending");
      expect(byEmail.get("expired@test.com")).toBe("expired");
      expect(byEmail.get("accepted@test.com")).toBe("accepted");
    });
  });

  describe("POST /organizations/:id/invitations/:inviteId/resend", () => {
    it("rotates the token and extends expiry", async () => {
      const app = await buildApp();
      const ownerToken = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      const oldBody = created.json();

      const resend = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations/${oldBody.id}/resend`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(resend.statusCode).toBe(200);
      const newBody = resend.json();
      expect(newBody.token).not.toBe(oldBody.token);
      expect(newBody.id).toBe(oldBody.id);

      const stored = await prisma.invitation.findUnique({ where: { id: oldBody.id } });
      expect(stored!.tokenHash).toBe(hashToken(newBody.token));
    });
  });

  describe("DELETE /organizations/:id/invitations/:inviteId", () => {
    it("revokes a pending invitation and invalidates the token", async () => {
      const app = await buildApp();
      const ownerToken = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      const { id, token: inviteToken } = created.json();

      const del = await app.inject({
        method: "DELETE",
        url: `/api/v1/organizations/${ORG_ID}/invitations/${id}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(del.statusCode).toBe(204);

      const stored = await prisma.invitation.findUnique({ where: { id } });
      expect(stored!.revokedAt).not.toBeNull();
      expect(stored!.tokenHash).toBeNull();

      // Accept should now fail: the token is no longer stored.
      await prisma.user.create({
        data: {
          id: INVITEE_USER_ID,
          email: INVITEE_EMAIL,
          displayName: "Invitee",
          actorType: "human",
          status: "active",
        },
      });
      const inviteeToken = mintTestToken(INVITEE_USER_ID, { orgId: ORG_ID });
      const accept = await app.inject({
        method: "POST",
        url: `/api/v1/invitations/accept`,
        headers: { authorization: `Bearer ${inviteeToken}` },
        payload: { token: inviteToken },
      });
      expect(accept.statusCode).toBe(404);
    });
  });

  describe("POST /invitations/accept", () => {
    async function makeInvitee(email: string) {
      return prisma.user.create({
        data: {
          id: INVITEE_USER_ID,
          email,
          displayName: "Invitee",
          actorType: "human",
          status: "active",
        },
      });
    }

    it("adds the caller to the org and marks the invitation accepted", async () => {
      await makeInvitee(INVITEE_EMAIL);
      const app = await buildApp();
      const ownerToken = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { email: INVITEE_EMAIL, role: "admin" },
      });
      const { token: inviteToken, id } = created.json();

      const inviteeToken = mintTestToken(INVITEE_USER_ID, { orgId: ORG_ID });
      const accept = await app.inject({
        method: "POST",
        url: `/api/v1/invitations/accept`,
        headers: { authorization: `Bearer ${inviteeToken}` },
        payload: { token: inviteToken },
      });
      expect(accept.statusCode).toBe(200);
      expect(accept.json().status).toBe("accepted");

      const member = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: ORG_ID, userId: INVITEE_USER_ID } },
      });
      expect(member!.role).toBe("admin");

      const stored = await prisma.invitation.findUnique({ where: { id } });
      expect(stored!.acceptedByUserId).toBe(INVITEE_USER_ID);
    });

    it("rejects when caller email differs from invitation email", async () => {
      await makeInvitee("someone-else@test.com");
      const app = await buildApp();
      const ownerToken = mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID });
      const created = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${ORG_ID}/invitations`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { email: INVITEE_EMAIL, role: "member" },
      });
      const { token: inviteToken } = created.json();

      const inviteeToken = mintTestToken(INVITEE_USER_ID, { orgId: ORG_ID });
      const accept = await app.inject({
        method: "POST",
        url: `/api/v1/invitations/accept`,
        headers: { authorization: `Bearer ${inviteeToken}` },
        payload: { token: inviteToken },
      });
      expect(accept.statusCode).toBe(403);
    });

    it("returns 410 for an expired invitation", async () => {
      await makeInvitee(INVITEE_EMAIL);
      const app = await buildApp();

      const plaintext = "tfinv_manual_expired_fixture";
      await prisma.invitation.create({
        data: {
          orgId: ORG_ID,
          email: INVITEE_EMAIL,
          role: "member",
          tokenHash: hashToken(plaintext),
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const inviteeToken = mintTestToken(INVITEE_USER_ID, { orgId: ORG_ID });
      const accept = await app.inject({
        method: "POST",
        url: `/api/v1/invitations/accept`,
        headers: { authorization: `Bearer ${inviteeToken}` },
        payload: { token: plaintext },
      });
      expect(accept.statusCode).toBe(410);
    });
  });
});
