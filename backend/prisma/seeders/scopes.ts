import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

export const SCOPES = [
  { key: "tasks:read", description: "Read tasks the owning user can view" },
  { key: "tasks:write", description: "Create, edit, assign, and delete tasks" },
  { key: "transitions:write", description: "Transition tasks between statuses" },
  { key: "comments:write", description: "Post comments on tasks" },
] as const;

export type ScopeKey = (typeof SCOPES)[number]["key"];

export async function seedScopes(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("scopes");

  for (const scope of SCOPES) {
    const id = seedUuid("scope", scope.key);
    const existing = await prisma.scope.findUnique({ where: { id } });
    if (existing) {
      result.skipped++;
      continue;
    }
    await prisma.scope.create({
      data: { id, key: scope.key, description: scope.description },
    });
    result.created++;
  }

  return result;
}
