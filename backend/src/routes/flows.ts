import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { ErrorResponse } from "./_schemas.js";

const FlowSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
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
}
