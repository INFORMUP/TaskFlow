import { apiFetch } from "./client";

export interface TaskProjectChip {
  id: string;
  key: string;
  name: string;
  owner: { id: string; displayName: string; actorType: string };
  color?: string | null;
}

export interface TaskLabel {
  id: string;
  name: string;
  color: string;
}

export interface SpawnedFromRef {
  id: string;
  displayId: string;
  title: string;
  flow: { slug: string };
}

export interface SpawnedTaskRef extends SpawnedFromRef {
  currentStatus: { slug: string; name: string };
}

export interface Task {
  id: string;
  displayId: string;
  title: string;
  description: string | null;
  priority: string;
  resolution: string | null;
  dueDate: string | null;
  flow: { id: string; slug: string; name: string; icon?: string | null };
  currentStatus: { id: string; slug: string; name: string; color?: string | null };
  creator: { id: string; displayName: string; actorType: string };
  assignee: { id: string; displayName: string; actorType: string } | null;
  projects: TaskProjectChip[];
  labels: TaskLabel[];
  spawnedFromTask?: SpawnedFromRef | null;
  spawnedTasks?: SpawnedTaskRef[];
  blockerCount?: number;
  openBlockerCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlockerRef {
  id: string;
  displayId: string;
  title: string;
  flow: { slug: string; name: string };
  currentStatus: { slug: string; name: string };
}

export interface TaskBlockersResponse {
  blockers: BlockerRef[];
  blocking: BlockerRef[];
}

export interface TaskListResponse {
  data: Task[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export function getTasks(
  params: Record<string, string | string[]> = {},
): Promise<TaskListResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.append(key, value);
    }
  }
  const query = search.toString();
  return apiFetch(`/api/v1/tasks${query ? `?${query}` : ""}`);
}

export function getTask(id: string): Promise<Task> {
  return apiFetch(`/api/v1/tasks/${id}`);
}

export function createTask(data: {
  flow: string;
  title: string;
  description?: string;
  priority: string;
  projectIds?: string[];
  assigneeUserId?: string | null;
  dueDate?: string | null;
  spawnedFromTaskId?: string | null;
}): Promise<Task> {
  return apiFetch("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function addTaskProject(id: string, projectId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${id}/projects`, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export function removeTaskProject(id: string, projectId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${id}/projects/${projectId}`, { method: "DELETE" });
}

export function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: string | null;
    assigneeUserId?: string | null;
  }
): Promise<Task> {
  return apiFetch(`/api/v1/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTask(id: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${id}`, { method: "DELETE" });
}

export function getTaskBlockers(id: string): Promise<TaskBlockersResponse> {
  return apiFetch(`/api/v1/tasks/${id}/blockers`);
}

export function addTaskBlocker(id: string, blockingTaskId: string): Promise<{ blocker: BlockerRef }> {
  return apiFetch(`/api/v1/tasks/${id}/blockers`, {
    method: "POST",
    body: JSON.stringify({ blockingTaskId }),
  });
}

export function removeTaskBlocker(id: string, blockingTaskId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${id}/blockers/${blockingTaskId}`, { method: "DELETE" });
}

export interface TaskGraphNode {
  id: string;
  displayId: string;
  title: string;
  flow: { slug: string; name: string };
  currentStatus: { slug: string; name: string; color?: string | null };
  isRoot: boolean;
}

export interface TaskGraphEdge {
  from: string;
  to: string;
  type: "spawn" | "blocker";
}

export interface TaskGraphResponse {
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  truncated?: boolean;
}

export function getTaskGraph(id: string): Promise<TaskGraphResponse> {
  return apiFetch(`/api/v1/tasks/${id}/graph`);
}
