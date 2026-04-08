import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

const FLOWS = [
  { slug: "bug", name: "Bug", description: "Defect resolution" },
  { slug: "feature", name: "Feature", description: "New functionality" },
  { slug: "improvement", name: "Improvement", description: "Tech debt, refactoring, optimization" },
] as const;

export async function seedFlows(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("flows");

  for (const flow of FLOWS) {
    const id = seedUuid("flow", flow.slug);
    const existing = await prisma.flow.findUnique({ where: { id } });
    if (existing) {
      result.skipped++;
      continue;
    }
    await prisma.flow.create({
      data: { id, slug: flow.slug, name: flow.name, description: flow.description },
    });
    result.created++;
  }

  return result;
}
