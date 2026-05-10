import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";
import { buildTaskViewWhere } from "../services/permission.service.js";
import {
  assertFlowIconOrNull,
  assertHexColorOrNull,
  FLOW_ICON_SET,
  VisualCustomizationError,
} from "../services/visual-customization.js";

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
    icon: Type.Union([Type.String(), Type.Null()]),
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
    color: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: true }
);

const UpdateFlowBody = Type.Object({
  icon: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const UpdateStatusBody = Type.Object({
  color: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

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
          icon: f.icon ?? null,
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
          color: s.color ?? null,
        })),
      };
    }
  );

  // Visual customization (IMP-17). Org owner/admin only — these are shared
  // visual identifiers for the whole org, not per-user preferences.
  function isOrgAdmin(role: string | undefined) {
    return role === "owner" || role === "admin";
  }

  fastify.patch<{ Params: { id: string }; Body: Static<typeof UpdateFlowBody> }>(
    "/api/v1/flows/:id",
    {
      schema: {
        summary: "Update a flow's visual customization (icon)",
        description: "Org owner/admin only. Icon must be a slug from the curated set.",
        tags: ["flows"],
        params: IdParams,
        body: UpdateFlowBody,
        response: {
          200: FlowSummary,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!isOrgAdmin(request.org.role)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only org owners or admins can edit flow visuals" },
        });
      }
      const { id } = request.params;
      const flow = await prisma.flow.findFirst({ where: { id, orgId: request.org.id } });
      if (!flow) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
      }
      try {
        if (request.body.icon !== undefined) assertFlowIconOrNull(request.body.icon);
      } catch (err) {
        if (err instanceof VisualCustomizationError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
      const updated = await prisma.flow.update({
        where: { id },
        data: { ...(request.body.icon !== undefined && { icon: request.body.icon }) },
      });
      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        icon: updated.icon ?? null,
        stats: { openCount: 0, assignedToMeCount: 0 },
      };
    }
  );

  fastify.patch<{
    Params: { id: string; statusId: string };
    Body: Static<typeof UpdateStatusBody>;
  }>(
    "/api/v1/flows/:id/statuses/:statusId",
    {
      schema: {
        summary: "Update a flow status's visual customization (color)",
        description: "Org owner/admin only. Color must be a 6-digit hex value.",
        tags: ["flows"],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          statusId: Type.String({ format: "uuid" }),
        }),
        body: UpdateStatusBody,
        response: {
          200: FlowStatusRecord,
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!isOrgAdmin(request.org.role)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only org owners or admins can edit status visuals" },
        });
      }
      const { id, statusId } = request.params;
      const status = await prisma.flowStatus.findFirst({
        where: { id: statusId, flowId: id, flow: { orgId: request.org.id } },
      });
      if (!status) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow status not found" } });
      }
      try {
        if (request.body.color !== undefined) assertHexColorOrNull(request.body.color, "Status color");
      } catch (err) {
        if (err instanceof VisualCustomizationError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
      const updated = await prisma.flowStatus.update({
        where: { id: statusId },
        data: { ...(request.body.color !== undefined && { color: request.body.color }) },
      });
      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        sortOrder: updated.sortOrder,
        color: updated.color ?? null,
      };
    }
  );

  // Expose the curated icon set so the frontend picker stays in sync.
  fastify.get(
    "/api/v1/flow-icons",
    {
      schema: {
        summary: "List available flow icons",
        tags: ["flows"],
        response: {
          200: Type.Object({ data: Type.Array(Type.String()) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async () => ({ data: [...FLOW_ICON_SET] })
  );
}
