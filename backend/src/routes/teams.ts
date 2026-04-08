import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";

export async function teamRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/teams", async () => {
    const teams = await prisma.team.findMany({
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
  });

  fastify.get("/api/v1/teams/:id/members", async (request, reply) => {
    const { id } = request.params as { id: string };

    const team = await prisma.team.findUnique({ where: { id } });
    if (!team) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Team not found" },
      });
    }

    const members = await prisma.userTeam.findMany({
      where: { teamId: id },
      include: {
        user: { select: { id: true, displayName: true, email: true, actorType: true, status: true } },
      },
    });

    return {
      data: members.map((m) => ({
        ...m.user,
        isPrimary: m.isPrimary,
      })),
    };
  });
}
