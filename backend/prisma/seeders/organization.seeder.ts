import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

export const DEFAULT_ORG_ID = seedUuid("organization", "default");

export async function ensureDefaultOrg(prisma: PrismaClient, orgId: string = DEFAULT_ORG_ID) {
  await prisma.organization.upsert({
    where: { id: orgId },
    update: {},
    create: { id: orgId, slug: orgId === DEFAULT_ORG_ID ? "default" : orgId, name: "Default" },
  });
}

export async function seedOrganizations(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("organizations");

  const existing = await prisma.organization.findUnique({ where: { id: DEFAULT_ORG_ID } });
  if (existing) {
    result.skipped++;
    return result;
  }

  await prisma.organization.create({
    data: { id: DEFAULT_ORG_ID, slug: "default", name: "Default" },
  });
  result.created++;
  return result;
}
