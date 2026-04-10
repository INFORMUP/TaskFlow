import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";

function serializeUserWithTeams(user: {
  id: string;
  email: string | null;
  displayName: string;
  actorType: string;
  status: string;
  teams: { isPrimary: boolean; team: { id: string; slug: string; name: string } }[];
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    actorType: user.actorType,
    status: user.status,
    teams: user.teams.map((ut) => ({
      id: ut.team.id,
      slug: ut.team.slug,
      name: ut.team.name,
      isPrimary: ut.isPrimary,
    })),
  };
}

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/users/me", async (request) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.id },
      include: { teams: { include: { team: true } } },
    });
    return serializeUserWithTeams(user);
  });

  fastify.put("/api/v1/users/me/teams", async (request, reply) => {
    const body = request.body as {
      teams?: { slug?: string; isPrimary?: boolean }[];
    };

    if (!Array.isArray(body?.teams) || body.teams.length === 0) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "At least one team is required" },
      });
    }

    const primaryCount = body.teams.filter((t) => t.isPrimary === true).length;
    if (primaryCount !== 1) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Exactly one team must be marked as primary",
        },
      });
    }

    const slugs = body.teams.map((t) => t.slug).filter((s): s is string => !!s);
    if (slugs.length !== body.teams.length) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Each team entry must include a slug" },
      });
    }

    const teamRecords = await prisma.team.findMany({ where: { slug: { in: slugs } } });
    if (teamRecords.length !== slugs.length) {
      const found = new Set(teamRecords.map((t) => t.slug));
      const missing = slugs.filter((s) => !found.has(s));
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: `Unknown team slug(s): ${missing.join(", ")}`,
        },
      });
    }

    const slugToId = new Map(teamRecords.map((t) => [t.slug, t.id]));
    const userId = request.user.id;

    await prisma.$transaction([
      prisma.userTeam.deleteMany({ where: { userId } }),
      prisma.userTeam.createMany({
        data: body.teams.map((t) => ({
          userId,
          teamId: slugToId.get(t.slug!)!,
          isPrimary: t.isPrimary === true,
        })),
      }),
    ]);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { teams: { include: { team: true } } },
    });
    return serializeUserWithTeams(updated);
  });

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
