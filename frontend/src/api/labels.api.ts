import { apiFetch } from "./client";

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export async function listLabels(): Promise<Label[]> {
  const res = await apiFetch<{ data: Label[] }>("/api/v1/labels");
  return res.data;
}

export function createLabel(name: string, color: string): Promise<Label> {
  return apiFetch<Label>("/api/v1/labels", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export function updateLabel(id: string, patch: { name?: string; color?: string }): Promise<Label> {
  return apiFetch<Label>(`/api/v1/labels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteLabel(id: string): Promise<void> {
  return apiFetch(`/api/v1/labels/${id}`, { method: "DELETE" });
}

export function attachLabelToTask(taskId: string, labelId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/labels`, {
    method: "POST",
    body: JSON.stringify({ labelId }),
  });
}

export function detachLabelFromTask(taskId: string, labelId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/labels/${labelId}`, { method: "DELETE" });
}
