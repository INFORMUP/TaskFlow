import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

const USER_ID_MAX = "a4faad20-55aa-46e1-98c2-2bb8bb6647d8";
const USER_ID_PRIYA = seedUuid("user", "priya");

interface ProjectDef {
  key: string;
  name: string;
  ownerId: string;
  defaultAssigneeId: string;
  defaultFlowSlug: string;
  teamSlugs: string[];
}

const PROJECTS: ProjectDef[] = [
  { key: "REP", name: "Reportal", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "bug", teamSlugs: ["engineer", "product", "agent"] },
  { key: "WEB", name: "Website", ownerId: USER_ID_PRIYA, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "feature", teamSlugs: ["engineer", "product"] },
  { key: "DASH", name: "Dashboard", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "feature", teamSlugs: ["engineer", "product", "agent"] },
  { key: "TF", name: "TaskFlow", ownerId: USER_ID_MAX, defaultAssigneeId: USER_ID_MAX, defaultFlowSlug: "improvement", teamSlugs: ["engineer", "product", "agent"] },
  { key: "FUND", name: "Fundraising", ownerId: USER_ID_PRIYA, defaultAssigneeId: USER_ID_PRIYA, defaultFlowSlug: "feature", teamSlugs: ["product"] },
];

const TEAM_SLUGS = ["engineer", "product", "user", "agent"] as const;

export async function seedProjects(prisma: PrismaClient): Promise<SeederResult[]> {
  const namedResult = makeResult("projects");
  const unsortedResult = makeResult("unsorted_projects");
  const backfillResult = makeResult("task_project_backfill");
  const settingResult = makeResult("app_settings");

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
    if (existing) {
      namedResult.skipped++;
      continue;
    }
    const flow = await prisma.flow.findUnique({ where: { slug: def.defaultFlowSlug } });
    await prisma.project.create({
      data: {
        id,
        key: def.key,
        name: def.name,
        ownerUserId: def.ownerId,
        defaultAssigneeUserId: def.defaultAssigneeId,
        defaultFlowId: flow?.id ?? null,
        teams: {
          create: def.teamSlugs.map((slug) => ({ teamId: seedUuid("team", slug) })),
        },
      },
    });
    namedResult.created++;
  }

  // Per-team Unsorted projects
  for (const slug of TEAM_SLUGS) {
    const id = seedUuid("project", `unsorted-${slug}`);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (existing) {
      unsortedResult.skipped++;
      continue;
    }
    const teamId = seedUuid("team", slug);
    await prisma.project.create({
      data: {
        id,
        key: `UNSORTED-${slug.toUpperCase()}`,
        name: `Unsorted (${slug})`,
        ownerUserId: USER_ID_MAX,
        defaultAssigneeUserId: null,
        defaultFlowId: null,
        teams: { create: [{ teamId }] },
      },
    });
    unsortedResult.created++;
  }

  // AppSetting singleton (default flow = bug)
  const bugFlow = await prisma.flow.findUnique({ where: { slug: "bug" } });
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", defaultFlowId: bugFlow?.id ?? null },
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

  return [namedResult, unsortedResult, settingResult, backfillResult];
}
