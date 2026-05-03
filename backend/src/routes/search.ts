import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { globalSearch } from "../services/search.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const SearchQuery = Type.Object({
  q: Type.String(),
  limit: Type.Optional(Type.String()),
});

const TaskResult = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayId: Type.String(),
    title: Type.String(),
    snippet: Type.String(),
    flow: Type.Object(
      { slug: Type.String(), name: Type.String() },
      { additionalProperties: true }
    ),
    currentStatus: Type.Object(
      { slug: Type.String(), name: Type.String() },
      { additionalProperties: true }
    ),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const ProjectResult = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    key: Type.String(),
    name: Type.String(),
    snippet: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const SearchResponse = Type.Object(
  { tasks: Type.Array(TaskResult), projects: Type.Array(ProjectResult) },
  { additionalProperties: true }
);

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: Static<typeof SearchQuery> }>(
    "/api/v1/search",
    {
      schema: {
        summary: "Global search",
        description:
          "Searches tasks and projects in the caller's org via Postgres full-text search. " +
          "Type-ahead friendly (prefix tokens). Tasks are filtered through the same " +
          "team-scoped view rules as `GET /api/v1/tasks`. Returns up to `limit` (default 10, max 25) " +
          "of each. Queries shorter than 2 characters return empty groups.",
        tags: ["search"],
        querystring: SearchQuery,
        response: { 200: SearchResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { q } = request.query;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;

      const teamSlugs = request.user.teams.map((t) => t.slug);
      const flows = await prisma.flow.findMany({
        where: { orgId: request.org.id },
        select: { id: true, slug: true },
      });
      const flowIdBySlug = new Map(flows.map((f) => [f.slug, f.id]));

      return globalSearch({
        orgId: request.org.id,
        userId: request.user.id,
        teamSlugs,
        flowIdBySlug,
        q,
        limit,
      });
    }
  );
}
