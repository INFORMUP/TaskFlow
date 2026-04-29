import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere } from "./permission.service.js";

export class ProjectCodeActivityError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface ViewerContext {
  teamSlugs: string[];
  userId: string;
  flowIdBySlug: Map<string, string>;
}

export interface ListCommitsParams {
  repositoryId?: string;
  limit: number;
  cursor?: string;
}

export interface ListPullRequestsParams {
  repositoryId?: string;
  state?: string;
  limit: number;
  cursor?: string;
}

async function loadProjectOrThrow(orgId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) {
    throw new ProjectCodeActivityError("NOT_FOUND", "Project not found", 404);
  }
  return project;
}

async function validateRepositoryOnProject(projectId: string, repositoryId: string) {
  const repo = await prisma.projectRepository.findFirst({
    where: { id: repositoryId, projectId },
  });
  if (!repo) {
    throw new ProjectCodeActivityError(
      "REPO_NOT_ON_PROJECT",
      "Repository is not attached to this project",
      400,
    );
  }
}

function parseCursor(cursor: string | undefined): Date | undefined {
  if (!cursor) return undefined;
  const d = new Date(cursor);
  if (Number.isNaN(d.getTime())) {
    throw new ProjectCodeActivityError("INVALID_CURSOR", "cursor must be an ISO timestamp", 400);
  }
  return d;
}

const taskInclude = {
  select: {
    id: true,
    displayId: true,
    title: true,
    flow: { select: { id: true, slug: true, name: true } },
  },
} as const;

const repoInclude = { select: { id: true, provider: true, owner: true, name: true } } as const;

type CommitRow = Awaited<ReturnType<typeof prisma.taskCommit.findFirst>> & {
  repository: { id: string; provider: string; owner: string; name: string } | null;
  task: { id: string; displayId: string; title: string;
          flow: { id: string; slug: string; name: string } } | null;
};

type PrRow = Awaited<ReturnType<typeof prisma.taskPullRequest.findFirst>> & {
  repository: { id: string; provider: string; owner: string; name: string } | null;
  task: { id: string; displayId: string; title: string;
          flow: { id: string; slug: string; name: string } } | null;
};

function formatCommit(row: any) {
  return {
    id: row.id,
    taskId: row.taskId,
    repositoryId: row.repositoryId,
    repository: row.repository
      ? { id: row.repository.id, provider: row.repository.provider,
          owner: row.repository.owner, name: row.repository.name }
      : undefined,
    task: row.task
      ? { id: row.task.id, displayId: row.task.displayId, title: row.task.title,
          flow: { id: row.task.flow.id, slug: row.task.flow.slug, name: row.task.flow.name } }
      : undefined,
    sha: row.sha,
    message: row.message,
    author: row.author,
    authoredAt: row.authoredAt ? row.authoredAt.toISOString() : null,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatPullRequest(row: any) {
  return {
    id: row.id,
    taskId: row.taskId,
    repositoryId: row.repositoryId,
    repository: row.repository
      ? { id: row.repository.id, provider: row.repository.provider,
          owner: row.repository.owner, name: row.repository.name }
      : undefined,
    task: row.task
      ? { id: row.task.id, displayId: row.task.displayId, title: row.task.title,
          flow: { id: row.task.flow.id, slug: row.task.flow.slug, name: row.task.flow.name } }
      : undefined,
    number: row.number,
    title: row.title,
    state: row.state,
    author: row.author,
    mergedAt: row.mergedAt ? row.mergedAt.toISOString() : null,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProjectCommits(
  orgId: string,
  projectId: string,
  params: ListCommitsParams,
  viewer: ViewerContext,
) {
  await loadProjectOrThrow(orgId, projectId);
  if (params.repositoryId) {
    await validateRepositoryOnProject(projectId, params.repositoryId);
  }
  const cursorDate = parseCursor(params.cursor);
  const taskWhere = buildTaskViewWhere(viewer.teamSlugs, viewer.userId, viewer.flowIdBySlug);

  const where: Record<string, unknown> = {
    repository: { projectId, ...(params.repositoryId ? { id: params.repositoryId } : {}) },
    task: { isDeleted: false, ...taskWhere },
  };
  if (cursorDate) where.createdAt = { lt: cursorDate };

  const rows = await prisma.taskCommit.findMany({
    where,
    include: { repository: repoInclude, task: taskInclude },
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
  });
  const hasMore = rows.length > params.limit;
  const data = rows.slice(0, params.limit);
  const nextCursor = hasMore && data.length > 0
    ? data[data.length - 1].createdAt.toISOString()
    : null;
  return {
    data: data.map(formatCommit),
    pagination: { cursor: nextCursor, hasMore },
  };
}

export async function listProjectPullRequests(
  orgId: string,
  projectId: string,
  params: ListPullRequestsParams,
  viewer: ViewerContext,
) {
  await loadProjectOrThrow(orgId, projectId);
  if (params.repositoryId) {
    await validateRepositoryOnProject(projectId, params.repositoryId);
  }
  const cursorDate = parseCursor(params.cursor);
  const taskWhere = buildTaskViewWhere(viewer.teamSlugs, viewer.userId, viewer.flowIdBySlug);

  const where: Record<string, unknown> = {
    repository: { projectId, ...(params.repositoryId ? { id: params.repositoryId } : {}) },
    task: { isDeleted: false, ...taskWhere },
  };
  if (params.state) where.state = params.state;
  if (cursorDate) where.createdAt = { lt: cursorDate };

  const rows = await prisma.taskPullRequest.findMany({
    where,
    include: { repository: repoInclude, task: taskInclude },
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
  });
  const hasMore = rows.length > params.limit;
  const data = rows.slice(0, params.limit);
  const nextCursor = hasMore && data.length > 0
    ? data[data.length - 1].createdAt.toISOString()
    : null;
  return {
    data: data.map(formatPullRequest),
    pagination: { cursor: nextCursor, hasMore },
  };
}
