import { prisma } from "../prisma-client.js";

export interface CreateProjectInput {
  key: string;
  name: string;
  ownerUserId: string;
  defaultAssigneeUserId?: string | null;
  defaultFlowId?: string | null;
  teamIds: string[];
}

export interface UpdateProjectInput {
  name?: string;
  ownerUserId?: string;
  defaultAssigneeUserId?: string | null;
  defaultFlowId?: string | null;
}

export class ProjectServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_-]{1,31}$/;

async function assertActiveUser(id: string, label: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status !== "active") {
    throw new ProjectServiceError("INVALID_USER", `${label} must be an active user`, 422);
  }
}

async function assertTeamsExist(ids: string[]) {
  if (ids.length === 0) {
    throw new ProjectServiceError("BAD_REQUEST", "At least one team is required", 400);
  }
  const found = await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) {
    throw new ProjectServiceError("INVALID_TEAM", "One or more teams do not exist", 422);
  }
}

const projectInclude = {
  owner: { select: { id: true, displayName: true, actorType: true } },
  defaultAssignee: { select: { id: true, displayName: true, actorType: true } },
  defaultFlow: { select: { id: true, slug: true, name: true } },
  teams: { include: { team: { select: { id: true, slug: true, name: true } } } },
} as const;

export function formatProject(project: any) {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    owner: project.owner,
    defaultAssignee: project.defaultAssignee,
    defaultFlow: project.defaultFlow,
    teams: project.teams.map((pt: any) => pt.team),
    createdAt: project.createdAt,
    archivedAt: project.archivedAt,
  };
}

export async function listProjects(opts: { includeArchived?: boolean; teamIds?: string[] } = {}) {
  const where: Record<string, unknown> = {};
  if (!opts.includeArchived) where.archivedAt = null;
  if (opts.teamIds && opts.teamIds.length > 0) {
    where.teams = { some: { teamId: { in: opts.teamIds } } };
  }
  const projects = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { createdAt: "asc" },
  });
  return projects.map(formatProject);
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  return project ? formatProject(project) : null;
}

export async function createProject(input: CreateProjectInput) {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ProjectServiceError("INVALID_KEY", "Project key must match ^[A-Z][A-Z0-9_-]{1,31}$", 400);
  }
  if (!input.name.trim()) {
    throw new ProjectServiceError("BAD_REQUEST", "Name is required", 400);
  }

  const existing = await prisma.project.findUnique({ where: { key: input.key } });
  if (existing) {
    throw new ProjectServiceError("KEY_TAKEN", `Project key ${input.key} already exists`, 409);
  }

  await assertActiveUser(input.ownerUserId, "Owner");
  if (input.defaultAssigneeUserId) {
    await assertActiveUser(input.defaultAssigneeUserId, "Default assignee");
  }
  await assertTeamsExist(input.teamIds);

  if (input.defaultFlowId) {
    const flow = await prisma.flow.findUnique({ where: { id: input.defaultFlowId } });
    if (!flow) throw new ProjectServiceError("INVALID_FLOW", "Default flow not found", 422);
  }

  const project = await prisma.project.create({
    data: {
      key: input.key,
      name: input.name.trim(),
      ownerUserId: input.ownerUserId,
      defaultAssigneeUserId: input.defaultAssigneeUserId ?? null,
      defaultFlowId: input.defaultFlowId ?? null,
      teams: { create: input.teamIds.map((teamId) => ({ teamId })) },
    },
    include: projectInclude,
  });

  return formatProject(project);
}

export async function updateProject(id: string, patch: UpdateProjectInput) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  if (patch.ownerUserId) await assertActiveUser(patch.ownerUserId, "Owner");
  if (patch.defaultAssigneeUserId) {
    await assertActiveUser(patch.defaultAssigneeUserId, "Default assignee");
  }
  if (patch.defaultFlowId) {
    const flow = await prisma.flow.findUnique({ where: { id: patch.defaultFlowId } });
    if (!flow) throw new ProjectServiceError("INVALID_FLOW", "Default flow not found", 422);
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.ownerUserId && { ownerUserId: patch.ownerUserId }),
      ...(patch.defaultAssigneeUserId !== undefined && { defaultAssigneeUserId: patch.defaultAssigneeUserId }),
      ...(patch.defaultFlowId !== undefined && { defaultFlowId: patch.defaultFlowId }),
    },
    include: projectInclude,
  });

  return formatProject(updated);
}

export async function archiveProject(id: string, archived: boolean) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    include: projectInclude,
  });
  return formatProject(updated);
}

export async function addProjectTeam(projectId: string, teamId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) throw new ProjectServiceError("INVALID_TEAM", "Team not found", 422);

  await prisma.projectTeam.upsert({
    where: { projectId_teamId: { projectId, teamId } },
    update: {},
    create: { projectId, teamId },
  });

  return getProject(projectId);
}

export async function removeProjectTeam(projectId: string, teamId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { teams: true },
  });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);
  if (project.teams.length <= 1) {
    throw new ProjectServiceError(
      "LAST_TEAM",
      "Cannot remove the last team from a project",
      400,
    );
  }
  await prisma.projectTeam.deleteMany({ where: { projectId, teamId } });
  return getProject(projectId);
}

export function isAdmin(teamSlugs: string[]): boolean {
  return teamSlugs.includes("engineer") || teamSlugs.includes("product");
}

export async function canManageProject(projectId: string, userId: string, teamSlugs: string[]): Promise<boolean> {
  if (isAdmin(teamSlugs)) return true;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  return !!project && project.ownerUserId === userId;
}

export async function resolveDefaultAssignee(projectIds: string[]): Promise<string | null> {
  if (projectIds.length === 0) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectIds[0] },
    select: { defaultAssigneeUserId: true },
  });
  return project?.defaultAssigneeUserId ?? null;
}

export async function resolveDefaultFlow(projectIds: string[]): Promise<string | null> {
  if (projectIds.length > 0) {
    const project = await prisma.project.findUnique({
      where: { id: projectIds[0] },
      select: { defaultFlowId: true },
    });
    if (project?.defaultFlowId) return project.defaultFlowId;
  }
  const setting = await prisma.appSetting.findUnique({ where: { id: "singleton" } });
  return setting?.defaultFlowId ?? null;
}
