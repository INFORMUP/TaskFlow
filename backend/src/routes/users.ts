import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse } from "./_schemas.js";

const UserTeamMembership = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    isPrimary: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true }
);

const UserRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    email: Type.Union([Type.String(), Type.Null()]),
    displayName: Type.String(),
    actorType: Type.String(),
    status: Type.String(),
    teams: Type.Array(UserTeamMembership),
  },
  { additionalProperties: true }
);

const UpdateMyTeamsBody = Type.Object({
  teams: Type.Array(
    Type.Object({
      slug: Type.String({ minLength: 1 }),
      isPrimary: Type.Optional(Type.Boolean()),
    }),
    { minItems: 1 }
  ),
});

function serializeUserWithTeams(user: {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  status: string;
  teams: { isPrimary: boolean; team: { id: string; slug: string; name: string } }[];
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    actorType: user.actorType,
    status: user.status,
    teams: user.teams.map((ut) => ({
      id: ut.team.id,
      slug: ut.team.slug,
      name: ut.team.name,
      isPrimary: ut.isPrimary,
    })),
  };
}

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/users/me",
    {
      schema: {
        summary: "Get the authenticated user",
        tags: ["users"],
        response: {
          200: UserRecord,
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: request.user.id },
        include: { teams: { include: { team: true } } },
      });
      return serializeUserWithTeams(user);
    }
  );

  fastify.put<{ Body: Static<typeof UpdateMyTeamsBody> }>(
    "/api/v1/users/me/teams",
    {
      schema: {
        summary: "Replace the authenticated user's team memberships",
        description:
          "Replaces the full set of team memberships. Exactly one entry must be marked `isPrimary: true`.",
        tags: ["users"],
        body: UpdateMyTeamsBody,
        response: {
          200: UserRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { teams } = request.body;

      const primaryCount = teams.filter((t) => t.isPrimary === true).length;
      if (primaryCount !== 1) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Exactly one team must be marked as primary",
          },
        });
      }

      const slugs = teams.map((t) => t.slug);
      const teamRecords = await prisma.team.findMany({
        where: { slug: { in: slugs }, orgId: request.org.id },
      });
      if (teamRecords.length !== slugs.length) {
        const found = new Set(teamRecords.map((t) => t.slug));
        const missing = slugs.filter((s) => !found.has(s));
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: `Unknown team slug(s): ${missing.join(", ")}`,
          },
        });
      }

      const slugToId = new Map(teamRecords.map((t) => [t.slug, t.id]));
      const userId = request.user.id;

      await prisma.$transaction([
        prisma.userTeam.deleteMany({ where: { userId } }),
        prisma.userTeam.createMany({
          data: teams.map((t) => ({
            userId,
            teamId: slugToId.get(t.slug)!,
            isPrimary: t.isPrimary === true,
          })),
        }),
      ]);

      const updated = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: { teams: { include: { team: true } } },
      });
      return serializeUserWithTeams(updated);
    }
  );

  fastify.get(
    "/api/v1/users",
    {
      schema: {
        summary: "List active users",
        description: "Engineer- and Admin-only. Returns active users with their team memberships (without `isPrimary`).",
        tags: ["users"],
        response: {
          200: Type.Object(
            { data: Type.Array(UserRecord) },
            { additionalProperties: true }
          ),
          401: ErrorResponse,
          403: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const hasAccess = teamSlugs.includes("engineer") || teamSlugs.includes("admin");

      if (!hasAccess) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only Engineer or Admin can list users" },
        });
      }

      const users = await prisma.user.findMany({
        where: {
          status: "active",
          orgMemberships: { some: { orgId: request.org.id } },
        },
        include: { teams: { include: { team: true } } },
        orderBy: { displayName: "asc" },
      });

      return {
        data: users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          actorType: u.actorType,
          status: u.status,
          teams: u.teams.map((ut) => ({ id: ut.team.id, slug: ut.team.slug, name: ut.team.name })),
        })),
      };
    }
  );
}
