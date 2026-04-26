import { apiFetch } from "./client";

export interface RepoRef {
  id: string;
  provider: string;
  owner: string;
  name: string;
}

export interface TaskCommit {
  id: string;
  taskId: string;
  repositoryId: string;
  repository?: RepoRef;
  sha: string;
  message: string | null;
  author: string | null;
  authoredAt: string | null;
  url: string;
  createdAt: string;
}

export interface TaskPullRequest {
  id: string;
  taskId: string;
  repositoryId: string;
  repository?: RepoRef;
  number: number;
  title: string | null;
  state: string;
  author: string | null;
  mergedAt: string | null;
  url: string;
  createdAt: string;
}

export async function listTaskCommits(taskId: string): Promise<TaskCommit[]> {
  const res = await apiFetch<{ data: TaskCommit[] }>(`/api/v1/tasks/${taskId}/commits`);
  return res.data;
}

export function createTaskCommit(
  taskId: string,
  payload: { repositoryId?: string; sha?: string; url?: string },
): Promise<TaskCommit> {
  return apiFetch(`/api/v1/tasks/${taskId}/commits`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteTaskCommit(taskId: string, commitId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/commits/${commitId}`, { method: "DELETE" });
}

export async function listTaskPullRequests(taskId: string): Promise<TaskPullRequest[]> {
  const res = await apiFetch<{ data: TaskPullRequest[] }>(
    `/api/v1/tasks/${taskId}/pull-requests`,
  );
  return res.data;
}

export function createTaskPullRequest(
  taskId: string,
  payload: { repositoryId?: string; number?: number; state?: string; title?: string; url?: string },
): Promise<TaskPullRequest> {
  return apiFetch(`/api/v1/tasks/${taskId}/pull-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteTaskPullRequest(taskId: string, prId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/pull-requests/${prId}`, { method: "DELETE" });
}
