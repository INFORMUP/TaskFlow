import { apiFetch, apiFetchBlob } from "./client";

export interface ImageMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function uploadTaskAttachment(taskId: string, file: File): Promise<ImageMeta> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/api/v1/tasks/${taskId}/attachments`, { method: "POST", body: form });
}

export function deleteTaskAttachment(taskId: string, imageId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/attachments/${imageId}`, { method: "DELETE" });
}

export function uploadCommentAttachment(taskId: string, commentId: string, file: File): Promise<ImageMeta> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/api/v1/tasks/${taskId}/comments/${commentId}/attachments`, { method: "POST", body: form });
}

export function deleteCommentAttachment(taskId: string, commentId: string, imageId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/comments/${commentId}/attachments/${imageId}`, { method: "DELETE" });
}

export async function getImageBlobUrl(imageId: string): Promise<string> {
  const blob = await apiFetchBlob(`/api/v1/images/${imageId}`);
  return URL.createObjectURL(blob);
}
