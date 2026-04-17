import { prisma } from "../prisma-client.js";
import { orgScopedWhere } from "./org-scope.js";

export interface CreateProjectInput {
  orgId: string;
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

async function assertTeamsExist(orgId: string, ids: string[]) {
  if (ids.length === 0) {
    throw new ProjectServiceError("BAD_REQUEST", "At least one team is required", 400);
  }
  const found = await prisma.team.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true },
  });
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

export async function listProjects(
  orgId: string,
  opts: { includeArchived?: boolean; teamIds?: string[] } = {},
) {
  const where: Record<string, unknown> = orgScopedWhere(orgId);
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

export async function getProject(orgId: string, id: string) {
  const project = await prisma.project.findFirst({
    where: { id, orgId },
    include: projectInclude,
  });
  return project ? formatProject(project) : null;
}

export async function createProject(input: CreateProjectInput) {
  if (!KEY_PATTERN.test(input.key)) {
    throw new ProjectServiceError("INVALID_KEY", "Project key must match ^[A-Z][A-Z0-9_-]{1,31}$", 400);
  }
  if (!input.name.trim()) {
    throw new ProjectServiceError("BAD_REQUEST", "Name is required", 400);
  }

  const existing = await prisma.project.findUnique({
    where: { orgId_key: { orgId: input.orgId, key: input.key } },
  });
  if (existing) {
    throw new ProjectServiceError("KEY_TAKEN", `Project key ${input.key} already exists`, 409);
  }

  await assertActiveUser(input.ownerUserId, "Owner");
  if (input.defaultAssigneeUserId) {
    await assertActiveUser(input.defaultAssigneeUserId, "Default assignee");
  }
  await assertTeamsExist(input.orgId, input.teamIds);

  if (input.defaultFlowId) {
    const flow = await prisma.flow.findFirst({
      where: { id: input.defaultFlowId, orgId: input.orgId },
    });
    if (!flow) throw new ProjectServiceError("INVALID_FLOW", "Default flow not found", 422);
  }

  const project = await prisma.project.create({
    data: {
      orgId: input.orgId,
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

export async function updateProject(orgId: string, id: string, patch: UpdateProjectInput) {
  const project = await prisma.project.findFirst({ where: { id, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  if (patch.ownerUserId) await assertActiveUser(patch.ownerUserId, "Owner");
  if (patch.defaultAssigneeUserId) {
    await assertActiveUser(patch.defaultAssigneeUserId, "Default assignee");
  }
  if (patch.defaultFlowId) {
    const flow = await prisma.flow.findFirst({ where: { id: patch.defaultFlowId, orgId } });
    if (!flow) throw new ProjectServiceError("INVALID_FLOW", "Default flow not found", 422);
    const attached = await prisma.projectFlow.findUnique({
      where: { projectId_flowId: { projectId: id, flowId: patch.defaultFlowId } },
    });
    if (!attached) {
      throw new ProjectServiceError(
        "FLOW_NOT_ATTACHED",
        "Default flow must first be attached to this project",
        422,
      );
    }
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

export async function archiveProject(orgId: string, id: string, archived: boolean) {
  const project = await prisma.project.findFirst({ where: { id, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    include: projectInclude,
  });
  return formatProject(updated);
}

export async function addProjectTeam(orgId: string, projectId: string, teamId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);
  const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
  if (!team) throw new ProjectServiceError("INVALID_TEAM", "Team not found", 422);

  await prisma.projectTeam.upsert({
    where: { projectId_teamId: { projectId, teamId } },
    update: {},
    create: { projectId, teamId },
  });

  return getProject(orgId, projectId);
}

export async function removeProjectTeam(orgId: string, projectId: string, teamId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId },
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
  return getProject(orgId, projectId);
}

export function isAdmin(teamSlugs: string[]): boolean {
  return teamSlugs.includes("engineer") || teamSlugs.includes("product");
}

export async function canManageProject(
  orgId: string,
  projectId: string,
  userId: string,
  teamSlugs: string[],
  orgRole?: string,
): Promise<boolean> {
  if (orgRole === "owner" || orgRole === "admin") return true;
  if (isAdmin(teamSlugs)) return true;
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  return !!project && project.ownerUserId === userId;
}

export async function resolveDefaultAssignee(orgId: string, projectIds: string[]): Promise<string | null> {
  if (projectIds.length === 0) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectIds[0], orgId },
    select: { defaultAssigneeUserId: true },
  });
  return project?.defaultAssigneeUserId ?? null;
}

export async function resolveDefaultFlow(orgId: string, projectIds: string[]): Promise<string | null> {
  if (projectIds.length > 0) {
    const project = await prisma.project.findFirst({
      where: { id: projectIds[0], orgId },
      select: { defaultFlowId: true },
    });
    if (project?.defaultFlowId) return project.defaultFlowId;
  }
  const setting = await prisma.appSetting.findUnique({ where: { orgId } });
  return setting?.defaultFlowId ?? null;
}

export async function listProjectFlows(orgId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const rows = await prisma.projectFlow.findMany({
    where: { projectId },
    include: { flow: { select: { id: true, slug: true, name: true, description: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...r.flow,
    isDefault: r.flowId === project.defaultFlowId,
  }));
}

export async function attachProjectFlow(orgId: string, projectId: string, flowId: string) {
  const [project, flow] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, orgId } }),
    prisma.flow.findFirst({ where: { id: flowId, orgId } }),
  ]);
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);
  if (!flow) throw new ProjectServiceError("INVALID_FLOW", "Flow not found", 422);

  await prisma.projectFlow.upsert({
    where: { projectId_flowId: { projectId, flowId } },
    update: {},
    create: { projectId, flowId },
  });

  return listProjectFlows(orgId, projectId);
}

export async function detachProjectFlow(orgId: string, projectId: string, flowId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const tasksUsingFlow = await prisma.task.findMany({
    where: {
      isDeleted: false,
      flowId,
      projects: { some: { projectId } },
    },
    select: { id: true, projects: { select: { projectId: true } } },
  });

  for (const task of tasksUsingFlow) {
    const otherProjectIds = task.projects.map((p) => p.projectId).filter((id) => id !== projectId);
    if (otherProjectIds.length === 0) {
      throw new ProjectServiceError(
        "FLOW_IN_USE",
        "Cannot detach a flow while tasks on this project still use it",
        400,
      );
    }
    const alternateOffer = await prisma.projectFlow.findFirst({
      where: { projectId: { in: otherProjectIds }, flowId },
      select: { projectId: true },
    });
    if (!alternateOffer) {
      throw new ProjectServiceError(
        "FLOW_IN_USE",
        "Cannot detach a flow while tasks on this project still use it and no other attached project offers it",
        400,
      );
    }
  }

  if (project.defaultFlowId === flowId) {
    await prisma.project.update({ where: { id: projectId }, data: { defaultFlowId: null } });
  }

  await prisma.projectFlow.deleteMany({ where: { projectId, flowId } });
  return listProjectFlows(orgId, projectId);
}
