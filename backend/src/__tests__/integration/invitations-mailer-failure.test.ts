import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const { sendInviteEmailMock } = vi.hoisted(() => ({
  sendInviteEmailMock: vi.fn(),
}));

vi.mock("../../services/mailer.service.js", () => ({
  sendInviteEmail: sendInviteEmailMock,
}));

import { buildApp } from "../helpers/app.js";
import { mintTestToken, TEST_ENGINEER_ID } from "../helpers/auth.js";
import { seedTestUsers } from "../helpers/seed-test-users.js";

const prisma = new PrismaClient();

const ORG_ID = "c0000000-0000-4000-8000-0000000000c1";
const INVITEE_EMAIL = "mailer-failure-invitee@test.com";

async function clearFixtures() {
  await prisma.invitation.deleteMany({ where: { orgId: ORG_ID } });
  await prisma.orgMember.deleteMany({ where: { orgId: ORG_ID } });
  await prisma.organization.deleteMany({ where: { id: ORG_ID } });
}

describe("invitations API — mailer failures must not fail the request", () => {
  beforeAll(async () => {
    await seedTestUsers(prisma);
  });

  beforeEach(async () => {
    await clearFixtures();
    sendInviteEmailMock.mockReset();
    await prisma.organization.create({
      data: { id: ORG_ID, slug: "org-mailer-fail", name: "Mailer Fail Org" },
    });
    await prisma.orgMember.create({
      data: { orgId: ORG_ID, userId: TEST_ENGINEER_ID, role: "owner" },
    });
  });

  afterAll(async () => {
    await clearFixtures();
    await prisma.$disconnect();
  });

  it("POST /invitations returns 201 and persists the row when the mailer throws", async () => {
    sendInviteEmailMock.mockRejectedValue(new Error("smtp exploded"));
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
    expect(body.email).toBe(INVITEE_EMAIL);
    expect(body.token).toMatch(/^tfinv_/);

    const stored = await prisma.invitation.findUnique({ where: { id: body.id } });
    expect(stored).not.toBeNull();
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
  });

  it("POST /invitations/:inviteId/resend returns 200 when the mailer throws", async () => {
    sendInviteEmailMock.mockResolvedValueOnce(undefined);
    const app = await buildApp();
    const authHeader = { authorization: `Bearer ${mintTestToken(TEST_ENGINEER_ID, { orgId: ORG_ID })}` };

    const createRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${ORG_ID}/invitations`,
      headers: authHeader,
      payload: { email: INVITEE_EMAIL, role: "member" },
    });
    expect(createRes.statusCode).toBe(201);
    const inviteId = createRes.json().id;

    sendInviteEmailMock.mockRejectedValueOnce(new Error("smtp exploded on resend"));
    const resendRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${ORG_ID}/invitations/${inviteId}/resend`,
      headers: authHeader,
    });

    expect(resendRes.statusCode).toBe(200);
    expect(resendRes.json().token).toMatch(/^tfinv_/);
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(2);
  });
});
