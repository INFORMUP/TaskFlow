import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";
import type { OrgRole } from "../types/index.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const OrgRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("member"),
]);

const OrgMembershipSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    role: OrgRoleSchema,
  },
  { additionalProperties: true }
);

const OrgMemberRecord = Type.Object(
  {
    userId: Type.String({ format: "uuid" }),
    displayName: Type.String(),
    email: Type.Union([Type.String(), Type.Null()]),
    role: OrgRoleSchema,
  },
  { additionalProperties: true }
);

const OrgDetail = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    role: OrgRoleSchema,
    members: Type.Array(OrgMemberRecord),
  },
  { additionalProperties: true }
);

const CreateOrgBody = Type.Object({
  slug: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 120 }),
});

const AddMemberBody = Type.Object({
  email: Type.String({ format: "email" }),
  role: OrgRoleSchema,
});

const UpdateMemberBody = Type.Object({
  role: OrgRoleSchema,
});

const MemberParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  userId: Type.String({ format: "uuid" }),
});

async function loadCallerMembership(
  orgId: string,
  userId: string,
): Promise<{ role: OrgRole } | null> {
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!m) return null;
  return { role: m.role as OrgRole };
}

function sendNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: "NOT_FOUND", message: "Organization not found" },
  });
}

function sendForbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({
    error: { code: "FORBIDDEN", message },
  });
}

export async function organizationRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/organizations",
    {
      schema: {
        summary: "List the caller's organization memberships",
        tags: ["organizations"],
        response: {
          200: Type.Object(
            { data: Type.Array(OrgMembershipSummary) },
            { additionalProperties: true },
          ),
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request: FastifyRequest) => {
      const rows = await prisma.orgMember.findMany({
        where: { userId: request.user.id },
        include: { org: true },
        orderBy: { createdAt: "asc" },
      });
      return {
        data: rows.map((r) => ({
          id: r.org.id,
          slug: r.org.slug,
          name: r.org.name,
          role: r.role as OrgRole,
        })),
      };
    },
  );

  fastify.post<{ Body: Static<typeof CreateOrgBody> }>(
    "/api/v1/organizations",
    {
      schema: {
        summary: "Create an organization",
        description: "Caller becomes owner. Slug must be globally unique.",
        tags: ["organizations"],
        body: CreateOrgBody,
        response: {
          201: OrgMembershipSummary,
          409: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { slug, name } = request.body;
      try {
        const org = await prisma.organization.create({
          data: {
            slug: slug.trim(),
            name: name.trim(),
            members: { create: { userId: request.user.id, role: "owner" } },
          },
        });
        return reply.status(201).send({
          id: org.id,
          slug: org.slug,
          name: org.name,
          role: "owner",
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return reply.status(409).send({
            error: { code: "CONFLICT", message: "Organization slug already exists" },
          });
        }
        throw err;
      }
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/organizations/:id",
    {
      schema: {
        summary: "Get organization detail with members",
        tags: ["organizations"],
        params: IdParams,
        response: {
          200: OrgDetail,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const caller = await loadCallerMembership(id, request.user.id);
      if (!caller) return sendNotFound(reply);

      const org = await prisma.organization.findUnique({
        where: { id },
        include: {
          members: {
            include: { user: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!org) return sendNotFound(reply);

      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        role: caller.role,
        members: org.members.map((m) => ({
          userId: m.userId,
          displayName: m.user.displayName,
          email: m.user.email,
          role: m.role as OrgRole,
        })),
      };
    },
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof AddMemberBody> }>(
    "/api/v1/organizations/:id/members",
    {
      schema: {
        summary: "Add an existing user to an organization",
        description:
          "Requires caller to be owner or admin. The target user must already have an account — to onboard a new user, create an invitation instead. Promoting to `owner` is owner-only.",
        tags: ["organizations"],
        params: IdParams,
        body: AddMemberBody,
        response: {
          201: OrgMemberRecord,
          409: ErrorResponse,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { email, role } = request.body;

      const caller = await loadCallerMembership(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can add members");
      }
      if (role === "owner" && caller.role !== "owner") {
        return sendForbidden(reply, "Only owners can add another owner");
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.status !== "active") {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: "No active user with that email — create an invitation instead",
          },
        });
      }

      const existing = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: id, userId: user.id } },
      });
      if (existing) {
        return reply.status(409).send({
          error: { code: "CONFLICT", message: "User is already a member" },
        });
      }

      await prisma.orgMember.create({
        data: { orgId: id, userId: user.id, role },
      });

      return reply.status(201).send({
        userId: user.id,
        displayName: user.displayName,
        email: user.email,
        role,
      });
    },
  );

  fastify.patch<{
    Params: Static<typeof MemberParams>;
    Body: Static<typeof UpdateMemberBody>;
  }>(
    "/api/v1/organizations/:id/members/:userId",
    {
      schema: {
        summary: "Change a member's role",
        description:
          "Admins can manage `member`. Promoting to or demoting from `owner` requires the caller to be an owner.",
        tags: ["organizations"],
        params: MemberParams,
        body: UpdateMemberBody,
        response: {
          200: OrgMemberRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params;
      const { role: newRole } = request.body;

      const caller = await loadCallerMembership(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can change roles");
      }

      const target = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: id, userId } },
        include: { user: true },
      });
      if (!target) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Member not found" },
        });
      }

      const touchesOwner = target.role === "owner" || newRole === "owner";
      if (touchesOwner && caller.role !== "owner") {
        return sendForbidden(reply, "Only owners can promote to or demote from owner");
      }

      const updated = await prisma.orgMember.update({
        where: { orgId_userId: { orgId: id, userId } },
        data: { role: newRole },
        include: { user: true },
      });

      return reply.send({
        userId: updated.userId,
        displayName: updated.user.displayName,
        email: updated.user.email,
        role: updated.role as OrgRole,
      });
    },
  );

  fastify.delete<{ Params: Static<typeof MemberParams> }>(
    "/api/v1/organizations/:id/members/:userId",
    {
      schema: {
        summary: "Remove a member from an organization",
        description: "Removing another owner requires the caller to be an owner.",
        tags: ["organizations"],
        params: MemberParams,
        response: {
          204: Type.Null(),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, userId } = request.params;

      const caller = await loadCallerMembership(id, request.user.id);
      if (!caller) return sendNotFound(reply);
      if (caller.role !== "owner" && caller.role !== "admin") {
        return sendForbidden(reply, "Only owners or admins can remove members");
      }

      const target = await prisma.orgMember.findUnique({
        where: { orgId_userId: { orgId: id, userId } },
      });
      if (!target) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Member not found" },
        });
      }

      if (target.role === "owner" && caller.role !== "owner") {
        return sendForbidden(reply, "Only owners can remove another owner");
      }

      await prisma.orgMember.delete({
        where: { orgId_userId: { orgId: id, userId } },
      });

      return reply.status(204).send();
    },
  );
}
