import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "../prisma-client.js";
import { hashToken } from "../services/token.service.js";
import { sendInviteEmail } from "../services/mailer.service.js";
import { config } from "../config.js";
import type { OrgRole } from "../types/index.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const INVITE_TOKEN_PREFIX = "tfinv_";
const INVITE_TTL_DAYS = 7;

const OrgRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("member"),
]);

const InviteStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("accepted"),
  Type.Literal("revoked"),
  Type.Literal("expired"),
]);

const InvitationRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    orgId: Type.String({ format: "uuid" }),
    email: Type.String(),
    role: OrgRoleSchema,
    status: InviteStatusSchema,
    invitedById: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    expiresAt: Type.String({ format: "date-time" }),
    acceptedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    acceptedByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    revokedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    revokedById: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  },
  { additionalProperties: true },
);

const InvitationRecordWithToken = Type.Composite(
  [InvitationRecord, Type.Object({ token: Type.String() })],
  { additionalProperties: true },
);

const CreateInvitationBody = Type.Object({
  email: Type.String({ format: "email" }),
  role: OrgRoleSchema,
});

const InviteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  inviteId: Type.String({ format: "uuid" }),
});

const AcceptBody = Type.Object({
  token: Type.String({ minLength: 1 }),
});

function deriveStatus(inv: {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}): "pending" | "accepted" | "revoked" | "expired" {
  if (inv.acceptedAt) return "accepted";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= Date.now()) return "expired";
  return "pending";
}

type InviteRow = Prisma.InvitationGetPayload<{}>;

function serialize(inv: InviteRow) {
  return {
    id: inv.id,
    orgId: inv.orgId,
    email: inv.email,
    role: inv.role as OrgRole,
    status: deriveStatus(inv),
    invitedById: inv.invitedById,
    createdAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
    acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
    acceptedByUserId: inv.acceptedByUserId,
    revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
    revokedById: inv.revokedById,
  };
}

function generateInviteToken(): { plaintext: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${INVITE_TOKEN_PREFIX}${secret}`;
  return { plaintext, hash: hashToken(plaintext) };
}

async function loadCaller(
  orgId: string,
  userId: string,
): Promise<{ role: OrgRole } | null> {
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  return m ? { role: m.role as OrgRole } : null;
}

function sendNotFound(reply: FastifyReply, message = "Organization not found") {
  return reply.status(404).send({ error: { code: "NOT_FOUND", message } });
}

function sendForbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({ error: { code: "FORBIDDEN", message } });
}

async function dispatchInviteEmail(
  inv: InviteRow,
  plaintextToken: string,
): Promise<void> {
  try {
    const [org, inviter] = await Promise.all([
      prisma.organization.findUnique({ where: { id: inv.orgId } }),
      inv.invitedById
        ? prisma.user.findUnique({ where: { id: inv.invitedById } })
        : Promise.resolve(null),
    ]);
    const acceptUrl = `${config.inviteAcceptBaseUrl}?token=${encodeURIComponent(plaintextToken)}`;
    await sendInviteEmail({
      to: inv.email,
      orgName: org?.name ?? "an organization",
      inviterName: inviter?.displayName ?? null,
      role: inv.role,
      acceptUrl,
      expiresAt: inv.expiresAt,
    });
  } catch (err) {
    console.error("[invitations] failed to dispatch invite email:", err);
  }
}

/**
 * Consume every pending invitation whose email matches this user's email and
 * create OrgMember rows as needed. Called both from the explicit accept
 * endpoint's fallback path and from Google login in auth.ts. Idempotent.
 */
export async function claimPendingInvitationsForUser(
  userId: string,
  email: string | null,
  now: Date = new Date(),
): Promise<number> {
  if (!email) return 0;
  const pending = await prisma.invitation.findMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (pending.length === 0) return 0;

  let claimed = 0;
  for (const inv of pending) {
    const won = await prisma.$transaction(async (tx) => {
      const result = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null },
        data: { acceptedAt: now, acceptedByUserId: userId },
      });
      if (result.count === 0) return false;
      await tx.orgMember.upsert({
        where: { orgId_userId: { orgId: inv.orgId, userId } },
        create: { orgId: inv.orgId, userId, role: inv.role },
        update: {},
      });
      return true;
    });
    if (won) claimed += 1;
  }
  return claimed;
}

export async function invitationRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Params: { id: string };
    Body: Static<typeof CreateInvitationBody>;
  }>(
    "/api/v1/organizations/:id/invitations",
    {
      schema: {
        summary: "Create an invitation to an organization",
        description:
          "Returns the invite token exactly once in `token`. Requires caller to be owner or admin. Inviting an `owner` is owner-only.",
        tags: ["organizations"],
        params: IdParams,
        body: CreateInvitationBody,
        response: {
          201: InvitationRecordWithToken,
          409: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { email, role } = request.body;

      const caller = await loadCaller(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can invite members");
      }
      if (role === "owner" && caller.role !== "owner") {
        return sendForbidden(reply, "Only owners can invite another owner");
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        const member = await prisma.orgMember.findUnique({
          where: {
            orgId_userId: { orgId: id, userId: existingUser.id },
          },
        });
        if (member) {
          return reply.status(409).send({
            error: { code: "CONFLICT", message: "User is already a member" },
          });
        }
      }

      const { plaintext, hash } = generateInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);

      try {
        const inv = await prisma.invitation.create({
          data: {
            orgId: id,
            email,
            role,
            tokenHash: hash,
            invitedById: request.user.id,
            expiresAt,
          },
        });
        await dispatchInviteEmail(inv, plaintext);
        return reply.status(201).send({ ...serialize(inv), token: plaintext });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return reply.status(409).send({
            error: {
              code: "CONFLICT",
              message: "A pending invitation already exists for that email",
            },
          });
        }
        throw err;
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/organizations/:id/invitations",
    {
      schema: {
        summary: "List invitations for an organization",
        tags: ["organizations"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(InvitationRecord) },
            { additionalProperties: true },
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const caller = await loadCaller(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can view invitations");
      }
      const rows = await prisma.invitation.findMany({
        where: { orgId: id },
        orderBy: { createdAt: "desc" },
      });
      return { data: rows.map(serialize) };
    },
  );

  fastify.post<{ Params: Static<typeof InviteParams> }>(
    "/api/v1/organizations/:id/invitations/:inviteId/resend",
    {
      schema: {
        summary: "Rotate an invitation's token and reset its expiry",
        description:
          "Returns a fresh token exactly once. Only pending invitations can be resent.",
        tags: ["organizations"],
        params: InviteParams,
        response: {
          200: InvitationRecordWithToken,
          409: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, inviteId } = request.params;
      const caller = await loadCaller(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can resend invitations");
      }

      const inv = await prisma.invitation.findFirst({
        where: { id: inviteId, orgId: id },
      });
      if (!inv) return sendNotFound(reply, "Invitation not found");
      if (inv.acceptedAt || inv.revokedAt) {
        return reply.status(409).send({
          error: {
            code: "CONFLICT",
            message: "Only pending invitations can be resent",
          },
        });
      }

      const { plaintext, hash } = generateInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);
      const updated = await prisma.invitation.update({
        where: { id: inviteId },
        data: { tokenHash: hash, expiresAt },
      });
      await dispatchInviteEmail(updated, plaintext);
      return reply.send({ ...serialize(updated), token: plaintext });
    },
  );

  fastify.delete<{ Params: Static<typeof InviteParams> }>(
    "/api/v1/organizations/:id/invitations/:inviteId",
    {
      schema: {
        summary: "Revoke an invitation",
        tags: ["organizations"],
        params: InviteParams,
        response: {
          204: Type.Null(),
          409: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, inviteId } = request.params;
      const caller = await loadCaller(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can revoke invitations");
      }

      const inv = await prisma.invitation.findFirst({
        where: { id: inviteId, orgId: id },
      });
      if (!inv) return sendNotFound(reply, "Invitation not found");
      if (inv.acceptedAt) {
        return reply.status(409).send({
          error: {
            code: "CONFLICT",
            message: "Accepted invitations cannot be revoked",
          },
        });
      }
      if (inv.revokedAt) {
        return reply.status(204).send();
      }

      await prisma.invitation.update({
        where: { id: inviteId },
        data: {
          revokedAt: new Date(),
          revokedById: request.user.id,
          tokenHash: null,
        },
      });
      return reply.status(204).send();
    },
  );

  fastify.post<{ Body: Static<typeof AcceptBody> }>(
    "/api/v1/invitations/accept",
    {
      schema: {
        summary: "Accept an invitation",
        description:
          "Authenticated. Consumes a pending invitation token and adds the caller to the organization. The token's email must match the caller's email.",
        tags: ["organizations"],
        body: AcceptBody,
        response: {
          200: InvitationRecord,
          410: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request: FastifyRequest<{ Body: Static<typeof AcceptBody> }>, reply) => {
      const { token } = request.body;
      const hash = hashToken(token);
      const inv = await prisma.invitation.findUnique({
        where: { tokenHash: hash },
      });
      if (!inv) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Invitation not found" },
        });
      }

      if (inv.revokedAt) {
        return reply.status(410).send({
          error: { code: "GONE", message: "Invitation has been revoked" },
        });
      }
      if (inv.acceptedAt) {
        return reply.status(410).send({
          error: { code: "GONE", message: "Invitation has already been accepted" },
        });
      }
      if (inv.expiresAt.getTime() <= Date.now()) {
        return reply.status(410).send({
          error: { code: "GONE", message: "Invitation has expired" },
        });
      }

      const caller = await prisma.user.findUnique({
        where: { id: request.user.id },
      });
      if (!caller || caller.email !== inv.email) {
        return sendForbidden(
          reply,
          "This invitation was issued to a different email address",
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const existing = await tx.orgMember.findUnique({
          where: { orgId_userId: { orgId: inv.orgId, userId: caller.id } },
        });
        if (!existing) {
          await tx.orgMember.create({
            data: { orgId: inv.orgId, userId: caller.id, role: inv.role },
          });
        }
        return tx.invitation.update({
          where: { id: inv.id },
          data: {
            acceptedAt: new Date(),
            acceptedByUserId: caller.id,
          },
        });
      });

      return reply.send(serialize(updated));
    },
  );
}
