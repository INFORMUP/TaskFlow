import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/users", async (request, reply) => {
    const teamSlugs = request.user.teams.map((t) => t.slug);
    const hasAccess = teamSlugs.includes("engineer") || teamSlugs.includes("admin");

    if (!hasAccess) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only Engineer or Admin can list users" },
      });
    }

    const users = await prisma.user.findMany({
      where: { status: "active" },
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
  });
}
