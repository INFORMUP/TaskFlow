import { apiFetch } from "./client";

export interface Comment {
  id: string;
  body: string;
  author: { id: string; displayName: string; actorType: string };
  createdAt: string;
  updatedAt: string;
}

export function getComments(taskId: string): Promise<{ data: Comment[] }> {
  return apiFetch(`/api/v1/tasks/${taskId}/comments`);
}

export function createComment(
  taskId: string,
  body: string
): Promise<Comment> {
  return apiFetch(`/api/v1/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateComment(
  taskId: string,
  commentId: string,
  body: string
): Promise<Comment> {
  return apiFetch(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(taskId: string, commentId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/comments/${commentId}`, {
    method: "DELETE",
  });
}
