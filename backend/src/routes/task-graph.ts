import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere, enforceScope } from "../services/permission.service.js";
import { buildTaskGraph, TaskGraphError } from "../services/task-graph.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const PathParams = Type.Object({ id: Type.String({ format: "uuid" }) });

const GraphNode = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayId: Type.String(),
    title: Type.String(),
    flow: Type.Object(
      { slug: Type.String(), name: Type.String() },
      { additionalProperties: true },
    ),
    currentStatus: Type.Object(
      { slug: Type.String(), name: Type.String() },
      { additionalProperties: true },
    ),
    isRoot: Type.Boolean(),
  },
  { additionalProperties: true },
);

const GraphEdge = Type.Object({
  from: Type.String({ format: "uuid" }),
  to: Type.String({ format: "uuid" }),
  type: Type.Union([Type.Literal("spawn"), Type.Literal("blocker")]),
});

const GraphResponse = Type.Object(
  {
    nodes: Type.Array(GraphNode),
    edges: Type.Array(GraphEdge),
    truncated: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: true },
);

async function getViewWhere(orgId: string, teamSlugs: string[], userId: string) {
  const flows = await prisma.flow.findMany({ where: { orgId } });
  const flowIdBySlug = new Map(flows.map((f) => [f.slug, f.id]));
  return buildTaskViewWhere(teamSlugs, userId, flowIdBySlug);
}

export async function taskGraphRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/tasks/:id/graph",
    {
      schema: {
        summary: "Get the spawn-and-blocker graph rooted at a task",
        description:
          "Returns the transitive set of tasks reachable from the root via spawn relations (parent and descendants) and blocker dependencies (both directions). Requires tasks:read scope. Tasks invisible to the caller are omitted along with their incident edges. Capped at 500 nodes; if exceeded, returns `truncated: true`.",
        tags: ["tasks"],
        params: PathParams,
        response: { 200: GraphResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params as { id: string };
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = await getViewWhere(request.org.id, teamSlugs, request.user.id);

      try {
        return await buildTaskGraph({ rootTaskId: id, taskVisibilityWhere: viewWhere });
      } catch (err) {
        if (err instanceof TaskGraphError) {
          return reply
            .status(err.status)
            .send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );
}
