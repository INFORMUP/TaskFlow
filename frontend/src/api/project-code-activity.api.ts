import { apiFetch } from "./client";

export interface ActivityRepoRef {
  id: string;
  provider: string;
  owner: string;
  name: string;
}

export interface ActivityTaskRef {
  id: string;
  displayId: string;
  title: string;
  flow: { id: string; slug: string; name: string };
}

export interface ProjectCommit {
  id: string;
  taskId: string;
  repositoryId: string;
  repository?: ActivityRepoRef;
  task?: ActivityTaskRef;
  sha: string;
  message: string | null;
  author: string | null;
  authoredAt: string | null;
  url: string;
  createdAt: string;
}

export interface ProjectPullRequest {
  id: string;
  taskId: string;
  repositoryId: string;
  repository?: ActivityRepoRef;
  task?: ActivityTaskRef;
  number: number;
  title: string | null;
  state: string;
  author: string | null;
  mergedAt: string | null;
  url: string;
  createdAt: string;
}

export interface ActivityPagination {
  cursor: string | null;
  hasMore: boolean;
}

export interface ActivityListResponse<T> {
  data: T[];
  pagination: ActivityPagination;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function listProjectCommits(
  projectId: string,
  params: { repositoryId?: string; limit?: number; cursor?: string } = {},
): Promise<ActivityListResponse<ProjectCommit>> {
  return apiFetch(
    `/api/v1/projects/${projectId}/commits${buildQuery(params)}`,
  );
}

export function listProjectPullRequests(
  projectId: string,
  params: { repositoryId?: string; state?: string; limit?: number; cursor?: string } = {},
): Promise<ActivityListResponse<ProjectPullRequest>> {
  return apiFetch(
    `/api/v1/projects/${projectId}/pull-requests${buildQuery(params)}`,
  );
}
