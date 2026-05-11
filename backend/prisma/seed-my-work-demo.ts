/**
 * One-off seed: 60 tasks assigned to Max for visualising the My Work page.
 *   - 20 "todo"        (currentStatus = initial status for the flow, resolution null)
 *   - 20 "in progress" (currentStatus != initial, resolution null)
 *   - 20 "done"        (resolution set, updatedAt within last 14 days)
 *
 * Tasks are distributed across the bug / feature / improvement flows, the
 * REP/WEB/DASH/TF projects (some in multiple), labels, priorities, and stages.
 *
 * Run with:  npx tsx prisma/seed-my-work-demo.ts
 *
 * Idempotent: re-running won't duplicate (uuidv5-derived task IDs).
 */
import { PrismaClient } from "@prisma/client";
import { v5 as uuidv5 } from "uuid";
import { seedUuid } from "./seeders/common.js";
import { DEFAULT_ORG_ID } from "../src/constants/org.js";

const SEED_NS = "taskflow:seed:my-work-demo";
const demoUuid = (key: string) => uuidv5(`${SEED_NS}:${key}`, uuidv5.URL);

const MAX_ID = "a4faad20-55aa-46e1-98c2-2bb8bb6647d8";

const FLOWS = ["bug", "feature", "improvement"] as const;
type FlowSlug = (typeof FLOWS)[number];

const FLOW_PREFIX: Record<FlowSlug, string> = {
  bug: "BUG",
  feature: "FEAT",
  improvement: "IMP",
};

// Non-initial, non-terminal statuses ("in progress" buckets) per flow.
const MID_STATUSES: Record<FlowSlug, string[]> = {
  bug: ["investigate", "approve", "resolve", "validate"],
  feature: ["design", "prototype", "implement", "validate", "review"],
  improvement: ["approve", "implement", "validate"],
};

const PROJECT_KEYS = ["REP", "WEB", "DASH", "TF"] as const;

const PRIORITIES = ["critical", "high", "medium", "low"] as const;
const RESOLUTIONS = ["fixed", "completed", "wont_fix", "duplicate", "deferred"] as const;

const LABEL_DEFS = [
  { name: "demo:frontend", color: "#3b82f6" },
  { name: "demo:backend", color: "#10b981" },
  { name: "demo:perf", color: "#f59e0b" },
  { name: "demo:ux", color: "#a855f7" },
  { name: "demo:flaky", color: "#ef4444" },
];

const prisma = new PrismaClient();

// Tiny seeded RNG so the same demo data appears every run.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const pickN = <T,>(arr: readonly T[], n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
};

async function main() {
  // Load flow + status maps.
  const flows = await prisma.flow.findMany({
    where: { slug: { in: [...FLOWS] } },
    include: { statuses: { orderBy: { sortOrder: "asc" } } },
  });
  if (flows.length !== FLOWS.length) {
    throw new Error(`Expected ${FLOWS.length} flows, got ${flows.length}`);
  }

  const flowBySlug = new Map<FlowSlug, (typeof flows)[number]>();
  for (const f of flows) flowBySlug.set(f.slug as FlowSlug, f);

  // Load projects.
  const projects = await prisma.project.findMany({
    where: { key: { in: [...PROJECT_KEYS] }, orgId: DEFAULT_ORG_ID },
  });
  const projectByKey = new Map(projects.map((p) => [p.key, p]));
  for (const key of PROJECT_KEYS) {
    if (!projectByKey.has(key)) throw new Error(`Missing project ${key}`);
  }

  // Ensure labels.
  const labels = [];
  for (const def of LABEL_DEFS) {
    const id = demoUuid(`label:${def.name}`);
    const label = await prisma.label.upsert({
      where: { orgId_name: { orgId: DEFAULT_ORG_ID, name: def.name } },
      update: { color: def.color },
      create: { id, orgId: DEFAULT_ORG_ID, name: def.name, color: def.color },
    });
    labels.push(label);
  }

  // Highest existing display-id per flow so we can append without collisions.
  const nextNum: Record<FlowSlug, number> = { bug: 1, feature: 1, improvement: 1 };
  for (const slug of FLOWS) {
    const prefix = FLOW_PREFIX[slug];
    const last = await prisma.task.findFirst({
      where: { displayId: { startsWith: `${prefix}-` } },
      orderBy: { createdAt: "desc" },
    });
    if (last) {
      const n = parseInt(last.displayId.split("-")[1], 10);
      if (!Number.isNaN(n)) nextNum[slug] = n + 1;
    }
  }

  type Plan = { bucket: "todo" | "in_progress" | "done"; flow: FlowSlug; statusSlug: string };
  const plans: Plan[] = [];

  // 20 todo, even-ish across flows.
  for (let i = 0; i < 20; i++) {
    const flow = FLOWS[i % FLOWS.length];
    const initial = flowBySlug.get(flow)!.statuses[0].slug;
    plans.push({ bucket: "todo", flow, statusSlug: initial });
  }
  // 20 in progress, cycling stages.
  for (let i = 0; i < 20; i++) {
    const flow = FLOWS[i % FLOWS.length];
    const stages = MID_STATUSES[flow];
    plans.push({ bucket: "in_progress", flow, statusSlug: stages[i % stages.length] });
  }
  // 20 done — use "closed" status to mirror reality.
  for (let i = 0; i < 20; i++) {
    const flow = FLOWS[i % FLOWS.length];
    plans.push({ bucket: "done", flow, statusSlug: "closed" });
  }

  let created = 0;
  let skipped = 0;
  const now = Date.now();

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const flow = flowBySlug.get(plan.flow)!;
    const status = flow.statuses.find((s) => s.slug === plan.statusSlug);
    if (!status) throw new Error(`No status ${plan.statusSlug} on flow ${plan.flow}`);

    const taskKey = `${plan.bucket}-${plan.flow}-${i}`;
    const id = demoUuid(`task:${taskKey}`);

    if (await prisma.task.findUnique({ where: { id } })) {
      skipped++;
      continue;
    }

    const num = nextNum[plan.flow]++;
    const displayId = `${FLOW_PREFIX[plan.flow]}-${num}`;

    const priority = pick(PRIORITIES);
    const projectsForTask = pickN(PROJECT_KEYS, 1 + (rand() < 0.35 ? 1 : 0));
    const labelsForTask = pickN(labels, 1 + Math.floor(rand() * 3)); // 1..3 labels
    const dueDate =
      plan.bucket !== "done" && rand() < 0.4
        ? new Date(now + Math.floor(rand() * 20 - 5) * 24 * 60 * 60 * 1000)
        : null;

    const resolution = plan.bucket === "done" ? pick(RESOLUTIONS) : null;

    // Spread "done" updates across the last 14 days; others fresh.
    const updatedAt =
      plan.bucket === "done"
        ? new Date(now - Math.floor(rand() * 13.5 * 24 * 60 * 60 * 1000))
        : new Date(now - Math.floor(rand() * 7 * 24 * 60 * 60 * 1000));
    const createdAt = new Date(updatedAt.getTime() - Math.floor(rand() * 30 * 24 * 60 * 60 * 1000));

    const titleBucket = plan.bucket === "in_progress" ? "In progress" : plan.bucket === "todo" ? "Todo" : "Done";
    const title = `[${titleBucket}] ${plan.flow} ${displayId} — ${plan.statusSlug} demo task`;

    await prisma.task.create({
      data: {
        id,
        displayId,
        flowId: flow.id,
        currentStatusId: status.id,
        title,
        description: `Demo task for the My Work page (${plan.bucket}, flow=${plan.flow}, status=${plan.statusSlug}).`,
        priority,
        resolution,
        createdBy: MAX_ID,
        assigneeId: MAX_ID,
        dueDate,
        createdAt,
        updatedAt,
        projects: {
          create: projectsForTask.map((key) => ({ projectId: projectByKey.get(key)!.id })),
        },
        labels: {
          create: labelsForTask.map((l) => ({ labelId: l.id })),
        },
      },
    });
    created++;
  }

  console.log(`Done: created ${created}, skipped (already existed) ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
