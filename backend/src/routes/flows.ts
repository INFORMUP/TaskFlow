import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";

export async function flowRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/flows", async () => {
    const flows = await prisma.flow.findMany({ orderBy: { slug: "asc" } });
    return {
      data: flows.map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description,
      })),
    };
  });
}
