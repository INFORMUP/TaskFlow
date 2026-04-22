import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { CommonErrorResponses, ErrorResponse, IdParams } from "./_schemas.js";

const FlowSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
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
        description: "Returns every flow defined in the system (engineering, operations, fundraising, etc.).",
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
      return {
        data: flows.map((f) => ({
          id: f.id,
          slug: f.slug,
          name: f.name,
          description: f.description,
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
