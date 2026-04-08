import { apiFetch } from "./client";

export interface Task {
  id: string;
  displayId: string;
  title: string;
  description: string | null;
  priority: string;
  resolution: string | null;
  flow: { id: string; slug: string; name: string };
  currentStatus: { id: string; slug: string; name: string };
  creator: { id: string; displayName: string; actorType: string };
  assignee: { id: string; displayName: string; actorType: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  data: Task[];
  pagination: { cursor: string | null; hasMore: boolean };
}

export function getTasks(params: Record<string, string> = {}): Promise<TaskListResponse> {
  const query = new URLSearchParams(params).toString();
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
}): Promise<Task> {
  return apiFetch("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTask(
  id: string,
  data: { title?: string; description?: string; priority?: string }
): Promise<Task> {
  return apiFetch(`/api/v1/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteTask(id: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${id}`, { method: "DELETE" });
}
