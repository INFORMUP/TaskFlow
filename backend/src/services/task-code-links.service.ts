import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";

export class CodeLinkServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// TODO(#32): tighten before webhook ingestion lands. The unique key is
// (repository_id, sha) and 7-char manual SHAs can collide with the 40-char
// SHAs the webhook will insert for the same commit. Either require 40 chars
// for manual input or split into shaShort/shaFull with uniqueness on shaFull.
const SHA_PATTERN = /^[a-f0-9]{7,40}$/i;

// GitHub-only for now; extend when other providers (GitLab, Bitbucket) land.
// Trailing-segment forms like /pull/42/files or /commit/<sha>#diff-… are
// accepted so users can paste from any tab of the PR/commit UI.
const PR_URL_PATTERN =
  /^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s]+)\/pull\/(\d+)(?:[\/?#].*)?$/i;

const COMMIT_URL_PATTERN =
  /^https?:\/\/github\.com\/([^\/\s]+)\/([^\/\s]+)\/commit\/([a-f0-9]{7,40})(?:[\/?#].*)?$/i;

function commitUrlFor(owner: string, name: string, sha: string) {
  return `https://github.com/${owner}/${name}/commit/${sha}`;
}

function parseOptionalDate(value: string | null | undefined, field: string): Date | null {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new CodeLinkServiceError("INVALID_DATE", `${field} is not a valid date-time`, 400);
  }
  return d;
}

function prUrlFor(owner: string, name: string, number: number) {
  return `https://github.com/${owner}/${name}/pull/${number}`;
}

async function resolveTaskRepository(orgId: string, taskId: string, repositoryId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, flow: { orgId } },
    include: { projects: { select: { projectId: true } } },
  });
  if (!task) throw new CodeLinkServiceError("NOT_FOUND", "Task not found", 404);

  const repo = await prisma.projectRepository.findFirst({
    where: {
      id: repositoryId,
      project: { orgId, id: { in: task.projects.map((p) => p.projectId) } },
    },
  });
  if (!repo) {
    throw new CodeLinkServiceError(
      "REPO_NOT_ON_TASK_PROJECT",
      "Repository must be attached to one of the task's projects",
      422,
    );
  }
  return { task, repo };
}

async function inferTaskRepository(orgId: string, taskId: string) {
  const repos = await prisma.projectRepository.findMany({
    where: { project: { orgId, tasks: { some: { taskId } } } },
  });
  if (repos.length === 0) {
    throw new CodeLinkServiceError(
      "NO_TASK_REPO",
      "Task's projects have no linked repositories — attach one first",
      422,
    );
  }
  if (repos.length > 1) {
    throw new CodeLinkServiceError(
      "REPO_REQUIRED",
      "Task has multiple repositories — specify repositoryId or a full URL",
      400,
    );
  }
  return repos[0];
}

export async function listTaskCommits(orgId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, flow: { orgId } },
  });
  if (!task) throw new CodeLinkServiceError("NOT_FOUND", "Task not found", 404);

  const rows = await prisma.taskCommit.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: { repository: true },
  });
  return rows.map(formatCommit);
}

export interface CreateCommitInput {
  repositoryId?: string;
  sha?: string;
  message?: string | null;
  author?: string | null;
  authoredAt?: string | null;
  url?: string | null;
}

export async function createTaskCommit(orgId: string, taskId: string, input: CreateCommitInput) {
  let { repositoryId, sha } = input;

  if ((!repositoryId || !sha) && input.url) {
    const m = input.url.trim().match(COMMIT_URL_PATTERN);
    if (!m) {
      throw new CodeLinkServiceError("INVALID_URL", "Could not parse commit URL", 400);
    }
    const [, owner, name, parsedSha] = m;
    sha = sha ?? parsedSha;
    if (!repositoryId) {
      const repo = await prisma.projectRepository.findFirst({
        where: {
          provider: "GITHUB",
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: name, mode: "insensitive" },
          project: { orgId, tasks: { some: { taskId } } },
        },
      });
      if (!repo) {
        throw new CodeLinkServiceError(
          "REPO_NOT_ON_TASK_PROJECT",
          "URL points to a repo not attached to this task's projects",
          422,
        );
      }
      repositoryId = repo.id;
    }
  }

  if (!sha || !SHA_PATTERN.test(sha)) {
    throw new CodeLinkServiceError("INVALID_SHA", "sha must be 7-40 hex characters", 400);
  }
  sha = sha.toLowerCase();
  const authoredAt = parseOptionalDate(input.authoredAt, "authoredAt");

  if (!repositoryId) {
    const inferred = await inferTaskRepository(orgId, taskId);
    repositoryId = inferred.id;
  }

  const { repo } = await resolveTaskRepository(orgId, taskId, repositoryId);
  // Always derive the canonical URL from trusted repo data — never store user-supplied url verbatim.
  const url = commitUrlFor(repo.owner, repo.name, sha);

  try {
    const created = await prisma.taskCommit.create({
      data: {
        taskId,
        repositoryId,
        sha,
        message: input.message ?? null,
        author: input.author ?? null,
        authoredAt,
        url,
      },
      include: { repository: true },
    });
    return formatCommit(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CodeLinkServiceError(
        "COMMIT_EXISTS",
        "A commit with that SHA is already linked for this repository",
        409,
      );
    }
    throw err;
  }
}

export async function deleteTaskCommit(orgId: string, taskId: string, commitId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, flow: { orgId } },
  });
  if (!task) throw new CodeLinkServiceError("NOT_FOUND", "Task not found", 404);

  const commit = await prisma.taskCommit.findFirst({ where: { id: commitId, taskId } });
  if (!commit) throw new CodeLinkServiceError("NOT_FOUND", "Commit link not found", 404);

  await prisma.taskCommit.delete({ where: { id: commitId } });
}

export async function listTaskPullRequests(orgId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, flow: { orgId } },
  });
  if (!task) throw new CodeLinkServiceError("NOT_FOUND", "Task not found", 404);

  const rows = await prisma.taskPullRequest.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
    include: { repository: true },
  });
  return rows.map(formatPullRequest);
}

export interface CreatePullRequestInput {
  repositoryId?: string;
  number?: number;
  title?: string | null;
  state?: string | null;
  author?: string | null;
  mergedAt?: string | null;
  url?: string | null;
}

export async function createTaskPullRequest(
  orgId: string,
  taskId: string,
  input: CreatePullRequestInput,
) {
  let { repositoryId, number: prNumber } = input;

  if ((!repositoryId || prNumber == null) && input.url) {
    const m = input.url.trim().match(PR_URL_PATTERN);
    if (!m) {
      throw new CodeLinkServiceError("INVALID_URL", "Could not parse PR URL", 400);
    }
    const [, owner, name, parsedNumber] = m;
    prNumber = prNumber ?? parseInt(parsedNumber, 10);
    if (!repositoryId) {
      const repo = await prisma.projectRepository.findFirst({
        where: {
          provider: "GITHUB",
          owner: { equals: owner, mode: "insensitive" },
          name: { equals: name, mode: "insensitive" },
          project: { orgId, tasks: { some: { taskId } } },
        },
      });
      if (!repo) {
        throw new CodeLinkServiceError(
          "REPO_NOT_ON_TASK_PROJECT",
          "URL points to a repo not attached to this task's projects",
          422,
        );
      }
      repositoryId = repo.id;
    }
  }

  if (prNumber == null || !Number.isInteger(prNumber) || prNumber < 1) {
    throw new CodeLinkServiceError("INVALID_NUMBER", "PR number must be a positive integer", 400);
  }

  // state is validated by the route schema enum; fall back to "open" if absent/null.
  const state = (input.state ?? "open").toLowerCase();
  const mergedAt = parseOptionalDate(input.mergedAt, "mergedAt");

  if (!repositoryId) {
    const inferred = await inferTaskRepository(orgId, taskId);
    repositoryId = inferred.id;
  }

  const { repo } = await resolveTaskRepository(orgId, taskId, repositoryId);
  // Always derive the canonical URL from trusted repo data — never store user-supplied url verbatim.
  const url = prUrlFor(repo.owner, repo.name, prNumber);

  try {
    const created = await prisma.taskPullRequest.create({
      data: {
        taskId,
        repositoryId,
        number: prNumber,
        title: input.title ?? null,
        state,
        author: input.author ?? null,
        mergedAt,
        url,
      },
      include: { repository: true },
    });
    return formatPullRequest(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CodeLinkServiceError(
        "PR_EXISTS",
        "A pull request with that number is already linked for this repository",
        409,
      );
    }
    throw err;
  }
}

export async function deleteTaskPullRequest(orgId: string, taskId: string, prId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, flow: { orgId } },
  });
  if (!task) throw new CodeLinkServiceError("NOT_FOUND", "Task not found", 404);

  const pr = await prisma.taskPullRequest.findFirst({ where: { id: prId, taskId } });
  if (!pr) throw new CodeLinkServiceError("NOT_FOUND", "PR link not found", 404);

  await prisma.taskPullRequest.delete({ where: { id: prId } });
}

type CommitRow = Prisma.TaskCommitGetPayload<{ include: { repository: true } }>;
type PullRequestRow = Prisma.TaskPullRequestGetPayload<{ include: { repository: true } }>;

function formatCommit(row: CommitRow) {
  return {
    id: row.id,
    taskId: row.taskId,
    repositoryId: row.repositoryId,
    repository: row.repository
      ? {
          id: row.repository.id,
          provider: row.repository.provider,
          owner: row.repository.owner,
          name: row.repository.name,
        }
      : undefined,
    sha: row.sha,
    message: row.message,
    author: row.author,
    authoredAt: row.authoredAt ? row.authoredAt.toISOString() : null,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

function formatPullRequest(row: PullRequestRow) {
  return {
    id: row.id,
    taskId: row.taskId,
    repositoryId: row.repositoryId,
    repository: row.repository
      ? {
          id: row.repository.id,
          provider: row.repository.provider,
          owner: row.repository.owner,
          name: row.repository.name,
        }
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
