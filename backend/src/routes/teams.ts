import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const TeamRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: true }
);

const TeamMember = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayName: Type.String(),
    email: Type.Union([Type.String(), Type.Null()]),
    actorType: Type.String(),
    status: Type.String(),
    isPrimary: Type.Boolean(),
  },
  { additionalProperties: true }
);

export async function teamRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/teams",
    {
      schema: {
        summary: "List teams",
        tags: ["teams"],
        response: {
          200: Type.Object(
            { data: Type.Array(TeamRecord) },
            { additionalProperties: true }
          ),
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request) => {
      const teams = await prisma.team.findMany({
        where: { orgId: request.org.id },
        orderBy: { name: "asc" },
      });
      return {
        data: teams.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
        })),
      };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/teams/:id/members",
    {
      schema: {
        summary: "List members of a team",
        tags: ["teams"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(TeamMember) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const team = await prisma.team.findFirst({ where: { id, orgId: request.org.id } });
      if (!team) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Team not found" },
        });
      }

      const members = await prisma.userTeam.findMany({
        where: { teamId: id },
        include: {
          user: {
            select: { id: true, displayName: true, email: true, actorType: true, status: true },
          },
        },
      });

      return {
        data: members.map((m) => ({
          ...m.user,
          isPrimary: m.isPrimary,
        })),
      };
    }
  );
}
