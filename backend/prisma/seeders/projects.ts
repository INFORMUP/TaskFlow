import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";
import { DEFAULT_ORG_ID, ensureDefaultOrg } from "./organization.seeder.js";

const USER_ID_MAX = "a4faad20-55aa-46e1-98c2-2bb8bb6647d8";
const USER_ID_PRIYA = seedUuid("user", "priya");

interface ProjectDef {
  key: string;
  name: string;
  ownerId: string;
  defaultAssigneeId: string;
  defaultFlowSlug: string;
  teamSlugs: string[];
  flowSlugs: string[];
  color: string;
}

const ENGINEERING_FLOWS = ["bug", "feature", "improvement"] as const;
const FUNDRAISING_FLOWS = ["grant-application", "donor-outreach", "event"] as const;

const PROJECTS: ProjectDef[] = [
  { key: "REP", name: "Reportal", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "bug", teamSlugs: ["engineer", "product", "agent"], flowSlugs: [...ENGINEERING_FLOWS], color: "#0ea5e9" },
  { key: "WEB", name: "Website", ownerId: USER_ID_PRIYA, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "feature", teamSlugs: ["engineer", "product"], flowSlugs: [...ENGINEERING_FLOWS], color: "#ec4899" },
  { key: "DASH", name: "Dashboard", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "feature", teamSlugs: ["engineer", "product", "agent"], flowSlugs: [...ENGINEERING_FLOWS], color: "#84cc16" },
  { key: "TF", name: "TaskFlow", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "improvement", teamSlugs: ["engineer", "product", "agent"], flowSlugs: [...ENGINEERING_FLOWS], color: "#a855f7" },
  { key: "FUND", name: "Fundraising", ownerId: USER_ID_PRIYA, defaultAssigneeId: USER_ID_PRIYA, defaultFlowSlug: "grant-application", teamSlugs: ["product"], flowSlugs: [...FUNDRAISING_FLOWS], color: "#f97316" },
];

const TEAM_SLUGS = ["engineer", "product", "user", "agent"] as const;

export async function seedProjects(
  prisma: PrismaClient,
  orgId: string = DEFAULT_ORG_ID,
): Promise<SeederResult[]> {
  await ensureDefaultOrg(prisma, orgId);
  const namedResult = makeResult("projects");
  const unsortedResult = makeResult("unsorted_projects");
  const backfillResult = makeResult("task_project_backfill");
  const settingResult = makeResult("app_settings");
  const projectFlowResult = makeResult("project_flows");

  // Ensure owners/assignees exist (personas seeder usually runs first via sample-tasks).
  const ensureUser = async (id: string) => {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Persona ${id} must be seeded before projects`);
    }
  };
  await ensureUser(USER_ID_MAX);
  await ensureUser(USER_ID_PRIYA);

  // Named projects
  for (const def of PROJECTS) {
    const id = seedUuid("project", def.key);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      const flow = await prisma.flow.findFirst({ where: { slug: def.defaultFlowSlug } });
      await prisma.project.create({
        data: {
          id,
          orgId,
          key: def.key,
          name: def.name,
          ownerUserId: def.ownerId,
          defaultAssigneeUserId: def.defaultAssigneeId,
          defaultFlowId: flow?.id ?? null,
          color: def.color,
          teams: {
            create: def.teamSlugs.map((slug) => ({ teamId: seedUuid("team", slug) })),
          },
        },
      });
      namedResult.created++;
    } else {
      namedResult.skipped++;
    }

    // Attach flows (idempotent)
    for (const flowSlug of def.flowSlugs) {
      const flow = await prisma.flow.findFirst({ where: { slug: flowSlug } });
      if (!flow) continue;
      const existingAttach = await prisma.projectFlow.findUnique({
        where: { projectId_flowId: { projectId: id, flowId: flow.id } },
      });
      if (existingAttach) {
        projectFlowResult.skipped++;
        continue;
      }
      await prisma.projectFlow.create({ data: { projectId: id, flowId: flow.id } });
      projectFlowResult.created++;
    }
  }

  // Per-team Unsorted projects — keep legacy tasks valid under the new union rule.
  for (const slug of TEAM_SLUGS) {
    const id = seedUuid("project", `unsorted-${slug}`);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      const teamId = seedUuid("team", slug);
      await prisma.project.create({
        data: {
          id,
          orgId,
          key: `UNSORTED-${slug.toUpperCase()}`,
          name: `Unsorted (${slug})`,
          ownerUserId: USER_ID_MAX,
          defaultAssigneeUserId: null,
          defaultFlowId: null,
          teams: { create: [{ teamId }] },
        },
      });
      unsortedResult.created++;
    } else {
      unsortedResult.skipped++;
    }

    // Attach every flow so any legacy task is reachable via its Unsorted project.
    const allFlows = await prisma.flow.findMany({ select: { id: true } });
    for (const flow of allFlows) {
      const existingAttach = await prisma.projectFlow.findUnique({
        where: { projectId_flowId: { projectId: id, flowId: flow.id } },
      });
      if (existingAttach) {
        projectFlowResult.skipped++;
        continue;
      }
      await prisma.projectFlow.create({ data: { projectId: id, flowId: flow.id } });
      projectFlowResult.created++;
    }
  }

  // AppSetting per-org (default flow = bug)
  const bugFlow = await prisma.flow.findFirst({ where: { slug: "bug" } });
  await prisma.appSetting.upsert({
    where: { orgId },
    update: {},
    create: { orgId, defaultFlowId: bugFlow?.id ?? null },
  });
  settingResult.created++;

  // Backfill: every task needs ≥1 project. Assign tasks to a named project if
  // their content matches, otherwise to Unsorted (engineer) as a safe default.
  const tasksWithoutProject = await prisma.task.findMany({
    where: { projects: { none: {} } },
    select: { id: true, title: true, description: true, flowId: true },
  });

  const repId = seedUuid("project", "REP");
  const tfId = seedUuid("project", "TF");
  const unsortedEngineerId = seedUuid("project", "unsorted-engineer");

  for (const task of tasksWithoutProject) {
    const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
    let projectId = unsortedEngineerId;
    if (/\breportal\b/.test(text)) projectId = repId;
    else if (/taskflow|permission|transition|task board|display id/i.test(text)) projectId = tfId;

    await prisma.taskProject.create({ data: { taskId: task.id, projectId } });
    backfillResult.created++;
  }

  return [namedResult, unsortedResult, projectFlowResult, settingResult, backfillResult];
}
