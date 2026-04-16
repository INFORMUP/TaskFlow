import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

interface TransitionDef {
  from: string;
  to: string;
}

// Bug: Triage → Investigate → Approve → Resolve → Validate → Closed
// Plus backward transitions and any-to-Closed
const BUG_TRANSITIONS: TransitionDef[] = [
  // Forward
  { from: "triage", to: "investigate" },
  { from: "investigate", to: "approve" },
  { from: "approve", to: "resolve" },
  { from: "resolve", to: "validate" },
  { from: "validate", to: "closed" },
  // Backward
  { from: "investigate", to: "triage" },
  { from: "approve", to: "investigate" },
  { from: "resolve", to: "investigate" },
  { from: "validate", to: "resolve" },
  { from: "closed", to: "validate" },
  // Any-to-Closed (those not already covered)
  { from: "triage", to: "closed" },
  { from: "investigate", to: "closed" },
  { from: "approve", to: "closed" },
  { from: "resolve", to: "closed" },
];

// Feature: Discuss → Design → Prototype → Implement → Validate → Review → Closed
const FEATURE_TRANSITIONS: TransitionDef[] = [
  // Forward
  { from: "discuss", to: "design" },
  { from: "design", to: "prototype" },
  { from: "prototype", to: "implement" },
  { from: "implement", to: "validate" },
  { from: "validate", to: "review" },
  { from: "review", to: "closed" },
  // Backward
  { from: "design", to: "discuss" },
  { from: "prototype", to: "design" },
  { from: "implement", to: "design" },
  { from: "validate", to: "implement" },
  { from: "review", to: "implement" },
  // Any-to-Closed
  { from: "discuss", to: "closed" },
  { from: "design", to: "closed" },
  { from: "prototype", to: "closed" },
  { from: "implement", to: "closed" },
  { from: "validate", to: "closed" },
];

// Improvement: Propose → Approve → Implement → Validate → Closed
const IMPROVEMENT_TRANSITIONS: TransitionDef[] = [
  // Forward
  { from: "propose", to: "approve" },
  { from: "approve", to: "implement" },
  { from: "implement", to: "validate" },
  { from: "validate", to: "closed" },
  // Backward
  { from: "implement", to: "approve" },
  { from: "validate", to: "implement" },
  // Any-to-Closed
  { from: "propose", to: "closed" },
  { from: "approve", to: "closed" },
  { from: "implement", to: "closed" },
];

// Grant: Research → Draft → Submitted → Awarded → Closed
const GRANT_TRANSITIONS: TransitionDef[] = [
  { from: "research", to: "draft" },
  { from: "draft", to: "submitted" },
  { from: "submitted", to: "awarded" },
  { from: "awarded", to: "closed" },
  { from: "draft", to: "research" },
  { from: "submitted", to: "draft" },
  // Any-to-Closed (rejection / withdrawal)
  { from: "research", to: "closed" },
  { from: "draft", to: "closed" },
  { from: "submitted", to: "closed" },
];

// Donor: Identify → Contact → Engaged → Committed → Closed
const DONOR_TRANSITIONS: TransitionDef[] = [
  { from: "identify", to: "contact" },
  { from: "contact", to: "engaged" },
  { from: "engaged", to: "committed" },
  { from: "committed", to: "closed" },
  { from: "engaged", to: "contact" },
  { from: "committed", to: "engaged" },
  // Any-to-Closed
  { from: "identify", to: "closed" },
  { from: "contact", to: "closed" },
  { from: "engaged", to: "closed" },
];

// Event: Plan → Promote → Host → Recap → Closed
const EVENT_TRANSITIONS: TransitionDef[] = [
  { from: "plan", to: "promote" },
  { from: "promote", to: "host" },
  { from: "host", to: "recap" },
  { from: "recap", to: "closed" },
  { from: "promote", to: "plan" },
  // Any-to-Closed
  { from: "plan", to: "closed" },
  { from: "promote", to: "closed" },
  { from: "host", to: "closed" },
];

const FLOW_TRANSITIONS: Record<string, TransitionDef[]> = {
  bug: BUG_TRANSITIONS,
  feature: FEATURE_TRANSITIONS,
  improvement: IMPROVEMENT_TRANSITIONS,
  "grant-application": GRANT_TRANSITIONS,
  "donor-outreach": DONOR_TRANSITIONS,
  event: EVENT_TRANSITIONS,
};

export async function seedFlowTransitions(prisma: PrismaClient): Promise<SeederResult> {
  const result = makeResult("flow_transitions");

  for (const [flowSlug, transitions] of Object.entries(FLOW_TRANSITIONS)) {
    const flowId = seedUuid("flow", flowSlug);

    for (const t of transitions) {
      const fromStatusId = seedUuid("flow_status", `${flowSlug}:${t.from}`);
      const toStatusId = seedUuid("flow_status", `${flowSlug}:${t.to}`);
      const id = seedUuid("flow_transition", `${flowSlug}:${t.from}:${t.to}`);

      const existing = await prisma.flowTransition.findUnique({ where: { id } });
      if (existing) {
        result.skipped++;
        continue;
      }
      await prisma.flowTransition.create({
        data: { id, flowId, fromStatusId, toStatusId },
      });
      result.created++;
    }
  }

  return result;
}
