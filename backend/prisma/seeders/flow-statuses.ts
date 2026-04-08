import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

interface StatusDef {
  slug: string;
  name: string;
  description: string;
}

const BUG_STATUSES: StatusDef[] = [
  { slug: "triage", name: "Triage", description: "Deduplicate, assess severity and reproducibility" },
  { slug: "investigate", name: "Investigate", description: "Identify root cause, confirm bug is genuine" },
  { slug: "approve", name: "Approve", description: "Engineer reviews investigation findings" },
  { slug: "resolve", name: "Resolve", description: "Execute fix via red-green regression TDD" },
  { slug: "validate", name: "Validate", description: "Confirm bug no longer occurs, no regressions" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution" },
];

const FEATURE_STATUSES: StatusDef[] = [
  { slug: "discuss", name: "Discuss", description: "Product discusses feature request and requirements" },
  { slug: "design", name: "Design", description: "Define specification, user stories, acceptance criteria" },
  { slug: "prototype", name: "Prototype", description: "Build working prototype for product review" },
  { slug: "implement", name: "Implement", description: "Build production implementation via TDD" },
  { slug: "validate", name: "Validate", description: "Confirm implementation meets acceptance criteria" },
  { slug: "review", name: "Review", description: "Product performs final review" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution" },
];

const IMPROVEMENT_STATUSES: StatusDef[] = [
  { slug: "propose", name: "Propose", description: "Propose improvement with rationale" },
  { slug: "approve", name: "Approve", description: "Engineer reviews and approves approach" },
  { slug: "implement", name: "Implement", description: "Execute improvement via TDD" },
  { slug: "validate", name: "Validate", description: "Confirm improvement meets goals, no regressions" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution" },
];

const FLOW_STATUSES: Record<string, StatusDef[]> = {
  bug: BUG_STATUSES,
  feature: FEATURE_STATUSES,
  improvement: IMPROVEMENT_STATUSES,
};

export async function seedFlowStatuses(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("flow_statuses");

  for (const [flowSlug, statuses] of Object.entries(FLOW_STATUSES)) {
    const flowId = seedUuid("flow", flowSlug);

    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const id = seedUuid("flow_status", `${flowSlug}:${status.slug}`);
      const existing = await prisma.flowStatus.findUnique({ where: { id } });
      if (existing) {
        result.skipped++;
        continue;
      }
      await prisma.flowStatus.create({
        data: {
          id,
          flowId,
          slug: status.slug,
          name: status.name,
          description: status.description,
          sortOrder: i + 1,
        },
      });
      result.created++;
    }
  }

  return result;
}
