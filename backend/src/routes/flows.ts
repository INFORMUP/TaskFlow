import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";
import { buildTaskViewWhere } from "../services/permission.service.js";

const FlowStats = Type.Object({
  openCount: Type.Integer({ minimum: 0 }),
  assignedToMeCount: Type.Integer({ minimum: 0 }),
});

const FlowSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    stats: FlowStats,
  },
  { additionalProperties: true }
);

const FlowStatusRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    sortOrder: Type.Number(),
  },
  { additionalProperties: true }
);

export async function flowRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/flows",
    {
      schema: {
        summary: "List flows",
        description: "Returns every flow defined in the system, with per-flow open task counts scoped to the requester.",
        tags: ["flows"],
        response: {
          200: Type.Object(
            { data: Type.Array(FlowSummary) },
            { additionalProperties: true }
          ),
          401: ErrorResponse,
          429: ErrorResponse,
          500: ErrorResponse,
        },
      },
    },
    async (request) => {
      const flows = await prisma.flow.findMany({
        where: { orgId: request.org.id },
        orderBy: { slug: "asc" },
      });

      const flowIdBySlug = new Map(flows.map((f) => [f.slug, f.id]));
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const userId = request.user.id;
      const viewWhere = buildTaskViewWhere(teamSlugs, userId, flowIdBySlug);

      const baseWhere = {
        flowId: { in: flows.map((f) => f.id) },
        isDeleted: false,
        currentStatus: { is: { slug: { not: "closed" } } },
        ...viewWhere,
      } as const;

      const [openGroups, mineGroups] = await Promise.all([
        prisma.task.groupBy({
          by: ["flowId"],
          where: baseWhere,
          _count: { _all: true },
        }),
        prisma.task.groupBy({
          by: ["flowId"],
          where: { ...baseWhere, assigneeId: userId },
          _count: { _all: true },
        }),
      ]);

      const openByFlow = new Map(openGroups.map((g) => [g.flowId, g._count._all]));
      const mineByFlow = new Map(mineGroups.map((g) => [g.flowId, g._count._all]));

      return {
        data: flows.map((f) => ({
          id: f.id,
          slug: f.slug,
          name: f.name,
          description: f.description,
          stats: {
            openCount: openByFlow.get(f.id) ?? 0,
            assignedToMeCount: mineByFlow.get(f.id) ?? 0,
          },
        })),
      };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/flows/:id/statuses",
    {
      schema: {
        summary: "List a flow's statuses in sort order",
        tags: ["flows"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(FlowStatusRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const flow = await prisma.flow.findFirst({
        where: { id, orgId: request.org.id },
      });
      if (!flow) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Flow not found" },
        });
      }
      const statuses = await prisma.flowStatus.findMany({
        where: { flowId: id },
        orderBy: { sortOrder: "asc" },
      });
      return {
        data: statuses.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          sortOrder: s.sortOrder,
        })),
      };
    }
  );
}
