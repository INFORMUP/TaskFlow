import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";
import { DEFAULT_ORG_ID, ensureDefaultOrg } from "./organization.seeder.js";

const TEAMS = [
  { slug: "engineer", name: "Engineer", description: "Develops solutions alongside agents" },
  { slug: "product", name: "Product", description: "Designs and reviews features" },
  { slug: "user", name: "User", description: "Downstream users of product" },
  { slug: "agent", name: "Agent", description: "AI agents that participate in workflows" },
] as const;

export async function seedTeams(
  prisma: PrismaClient,
  orgId: string = DEFAULT_ORG_ID,
): Promise<SeederResult> {
  await ensureDefaultOrg(prisma, orgId);
  const result = makeResult("teams");

  for (const team of TEAMS) {
    const id = seedUuid("team", team.slug);
    const existing = await prisma.team.findUnique({ where: { id } });
    if (existing) {
      result.skipped++;
      continue;
    }
    await prisma.team.create({
      data: { id, orgId, slug: team.slug, name: team.name, description: team.description },
    });
    result.created++;
  }

  return result;
}
