import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/health",
    {
      schema: {
        summary: "Liveness check",
        tags: ["health"],
        security: [],
        response: {
          200: Type.Object({ status: Type.Literal("ok") }),
        },
      },
    },
    async () => {
      return { status: "ok" as const };
    }
  );
}
