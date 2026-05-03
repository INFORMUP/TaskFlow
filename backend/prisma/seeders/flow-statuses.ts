import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

interface StatusDef {
  slug: string;
  name: string;
  description: string;
  color: string;
}

// Color families:
//   blue   #3b82f6 — discussion / planning
//   purple #8b5cf6 — approval gates
//   amber  #f59e0b — active work (prototype / implement / resolve)
//   teal   #14b8a6 — validation
//   green  #22c55e — review / committed
//   gray   #6b7280 — closed / terminal
const BUG_STATUSES: StatusDef[] = [
  { slug: "triage", name: "Triage", description: "Deduplicate, assess severity and reproducibility", color: "#3b82f6" },
  { slug: "investigate", name: "Investigate", description: "Identify root cause, confirm bug is genuine", color: "#3b82f6" },
  { slug: "approve", name: "Approve", description: "Engineer reviews investigation findings", color: "#8b5cf6" },
  { slug: "resolve", name: "Resolve", description: "Execute fix via red-green regression TDD", color: "#f59e0b" },
  { slug: "validate", name: "Validate", description: "Confirm bug no longer occurs, no regressions", color: "#14b8a6" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution", color: "#6b7280" },
];

const FEATURE_STATUSES: StatusDef[] = [
  { slug: "discuss", name: "Discuss", description: "Product discusses feature request and requirements", color: "#3b82f6" },
  { slug: "design", name: "Design", description: "Define specification, user stories, acceptance criteria", color: "#3b82f6" },
  { slug: "prototype", name: "Prototype", description: "Build working prototype for product review", color: "#f59e0b" },
  { slug: "implement", name: "Implement", description: "Build production implementation via TDD", color: "#f59e0b" },
  { slug: "validate", name: "Validate", description: "Confirm implementation meets acceptance criteria", color: "#14b8a6" },
  { slug: "review", name: "Review", description: "Product performs final review", color: "#22c55e" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution", color: "#6b7280" },
];

const IMPROVEMENT_STATUSES: StatusDef[] = [
  { slug: "propose", name: "Propose", description: "Propose improvement with rationale", color: "#3b82f6" },
  { slug: "approve", name: "Approve", description: "Engineer reviews and approves approach", color: "#8b5cf6" },
  { slug: "implement", name: "Implement", description: "Execute improvement via TDD", color: "#f59e0b" },
  { slug: "validate", name: "Validate", description: "Confirm improvement meets goals, no regressions", color: "#14b8a6" },
  { slug: "closed", name: "Closed", description: "Task resolved with resolution", color: "#6b7280" },
];

const GRANT_STATUSES: StatusDef[] = [
  { slug: "research", name: "Research", description: "Identify grant and fit", color: "#3b82f6" },
  { slug: "draft", name: "Draft", description: "Write application", color: "#f59e0b" },
  { slug: "submitted", name: "Submitted", description: "Application submitted, awaiting decision", color: "#14b8a6" },
  { slug: "awarded", name: "Awarded", description: "Grant awarded", color: "#22c55e" },
  { slug: "closed", name: "Closed", description: "Final outcome recorded", color: "#6b7280" },
];

const DONOR_STATUSES: StatusDef[] = [
  { slug: "identify", name: "Identify", description: "Prospect identified", color: "#3b82f6" },
  { slug: "contact", name: "Contact", description: "Initial outreach made", color: "#f59e0b" },
  { slug: "engaged", name: "Engaged", description: "Conversation ongoing", color: "#f59e0b" },
  { slug: "committed", name: "Committed", description: "Donor committed", color: "#22c55e" },
  { slug: "closed", name: "Closed", description: "Outreach concluded", color: "#6b7280" },
];

const EVENT_STATUSES: StatusDef[] = [
  { slug: "plan", name: "Plan", description: "Scope, venue, budget", color: "#3b82f6" },
  { slug: "promote", name: "Promote", description: "Invitations and marketing", color: "#f59e0b" },
  { slug: "host", name: "Host", description: "Running the event", color: "#14b8a6" },
  { slug: "recap", name: "Recap", description: "Thank-yous and debrief", color: "#22c55e" },
  { slug: "closed", name: "Closed", description: "Event wrapped up", color: "#6b7280" },
];

const FLOW_STATUSES: Record<string, StatusDef[]> = {
  bug: BUG_STATUSES,
  feature: FEATURE_STATUSES,
  improvement: IMPROVEMENT_STATUSES,
  "grant-application": GRANT_STATUSES,
  "donor-outreach": DONOR_STATUSES,
  event: EVENT_STATUSES,
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
          color: status.color,
        },
      });
      result.created++;
    }
  }

  return result;
}
