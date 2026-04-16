import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

const AGENTS = [
  { slug: "triage-bot", displayName: "Triage Bot" },
  { slug: "investigator-bot", displayName: "Investigator Bot" },
] as const;

export async function seedAgentUsers(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("agent users");
  const agentTeamId = seedUuid("team", "agent");

  for (const agent of AGENTS) {
    const id = seedUuid("user", `agent:${agent.slug}`);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (existing) {
      result.skipped++;
    } else {
      await prisma.user.create({
        data: {
          id,
          email: null,
          displayName: agent.displayName,
          actorType: "agent",
          status: "active",
        },
      });
      result.created++;
    }

    await prisma.userTeam.upsert({
      where: { userId_teamId: { userId: id, teamId: agentTeamId } },
      update: {},
      create: { userId: id, teamId: agentTeamId, isPrimary: true },
    });
  }

  return result;
}
