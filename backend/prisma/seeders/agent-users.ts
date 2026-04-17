import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";
import { DEFAULT_ORG_ID, ensureDefaultOrg } from "./organization.seeder.js";

const AGENTS = [
  { slug: "triage-bot", displayName: "Triage Bot" },
  { slug: "investigator-bot", displayName: "Investigator Bot" },
] as const;

export async function seedAgentUsers(
  prisma: PrismaClient,
  orgId: string = DEFAULT_ORG_ID,
): Promise<SeederResult> {
  await ensureDefaultOrg(prisma, orgId);
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

    await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: id } },
      update: {},
      create: { orgId, userId: id, role: "member" },
    });
  }

  return result;
}
