import { apiFetch } from "@/api/client";

export interface Transition {
  id: string;
  fromStatus: { id: string; slug: string; name: string } | null;
  toStatus: { id: string; slug: string; name: string };
  actor: { id: string; displayName: string; actorType: string };
  actorType: string;
  note: string;
  newAssignee: { id: string; displayName: string; actorType: string } | null;
  createdAt: string;
}

export function getTransitions(taskId: string): Promise<{ data: Transition[] }> {
  return apiFetch(`/api/v1/tasks/${taskId}/transitions`);
}

export function createTransition(
  taskId: string,
  data: { toStatus: string; note: string; resolution?: string; newAssigneeUserId?: string | null }
): Promise<{ success: boolean }> {
  return apiFetch(`/api/v1/tasks/${taskId}/transitions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
