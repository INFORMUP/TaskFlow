import { Prisma, RepoProvider } from "@prisma/client";
import { prisma } from "../prisma-client.js";
import { orgScopedWhere } from "./org-scope.js";
import { assertHexColorOrNull, VisualCustomizationError } from "./visual-customization.js";

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
  color?: string | null;
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
    color: project.color ?? null,
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
  if (patch.color !== undefined) {
    try {
      assertHexColorOrNull(patch.color, "Project color");
    } catch (err) {
      if (err instanceof VisualCustomizationError) {
        throw new ProjectServiceError(err.code, err.message, err.status);
      }
      throw err;
    }
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
      ...(patch.color !== undefined && { color: patch.color }),
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

export async function listStatusDefaults(orgId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const rows = await prisma.projectStatusDefaultAssignee.findMany({
    where: { projectId },
    select: { flowStatusId: true, userId: true },
  });
  return rows;
}

async function projectFlowIds(projectId: string, defaultFlowId: string | null) {
  const attached = await prisma.projectFlow.findMany({
    where: { projectId },
    select: { flowId: true },
  });
  const ids = new Set(attached.map((row) => row.flowId));
  if (defaultFlowId) ids.add(defaultFlowId);
  return ids;
}

async function assertFlowStatusInProject(
  projectId: string,
  defaultFlowId: string | null,
  flowStatusId: string,
) {
  const status = await prisma.flowStatus.findUnique({
    where: { id: flowStatusId },
    select: { flowId: true },
  });
  if (!status) {
    throw new ProjectServiceError("INVALID_STATUS", "Flow status not found", 422);
  }
  const flowIds = await projectFlowIds(projectId, defaultFlowId);
  if (!flowIds.has(status.flowId)) {
    throw new ProjectServiceError(
      "INVALID_STATUS",
      "Flow status does not belong to any flow on this project",
      422,
    );
  }
}

async function assertUserOnProjectTeam(projectId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "active") {
    throw new ProjectServiceError("INVALID_USER", "Default assignee must be an active user", 422);
  }
  const membership = await prisma.projectTeam.findFirst({
    where: {
      projectId,
      team: { members: { some: { userId } } },
    },
    select: { teamId: true },
  });
  if (!membership) {
    throw new ProjectServiceError(
      "INVALID_USER",
      "Default assignee must be a member of a project team",
      422,
    );
  }
}

export async function setStatusDefault(
  orgId: string,
  projectId: string,
  flowStatusId: string,
  userId: string,
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  await assertFlowStatusInProject(projectId, project.defaultFlowId, flowStatusId);
  await assertUserOnProjectTeam(projectId, userId);

  await prisma.projectStatusDefaultAssignee.upsert({
    where: { projectId_flowStatusId: { projectId, flowStatusId } },
    update: { userId },
    create: { projectId, flowStatusId, userId },
  });

  return { flowStatusId, userId };
}

export async function clearStatusDefault(
  orgId: string,
  projectId: string,
  flowStatusId: string,
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  await prisma.projectStatusDefaultAssignee.deleteMany({
    where: { projectId, flowStatusId },
  });
}

function formatRepository(repo: {
  id: string;
  projectId: string;
  provider: RepoProvider;
  owner: string;
  name: string;
  createdAt: Date;
}) {
  return {
    id: repo.id,
    projectId: repo.projectId,
    provider: repo.provider,
    owner: repo.owner,
    name: repo.name,
    createdAt: repo.createdAt,
  };
}

export async function listProjectRepositories(orgId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const rows = await prisma.projectRepository.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(formatRepository);
}

export async function addProjectRepository(
  orgId: string,
  projectId: string,
  input: { provider: RepoProvider; owner: string; name: string },
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const owner = input.owner.trim();
  const name = input.name.trim();
  if (!owner || !name) {
    throw new ProjectServiceError("BAD_REQUEST", "Repository owner and name are required", 400);
  }

  try {
    const created = await prisma.projectRepository.create({
      data: { projectId, provider: input.provider, owner, name },
    });
    return formatRepository(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ProjectServiceError(
        "REPO_EXISTS",
        "A repository with the same provider, owner, and name is already attached to this project",
        409,
      );
    }
    throw err;
  }
}

export async function removeProjectRepository(
  orgId: string,
  projectId: string,
  repositoryId: string,
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) throw new ProjectServiceError("NOT_FOUND", "Project not found", 404);

  const repo = await prisma.projectRepository.findFirst({
    where: { id: repositoryId, projectId },
  });
  if (!repo) throw new ProjectServiceError("NOT_FOUND", "Repository not found", 404);

  await prisma.projectRepository.delete({ where: { id: repositoryId } });
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
