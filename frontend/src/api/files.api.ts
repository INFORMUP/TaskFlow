import { apiFetch, apiFetchBlob } from "./client";

export interface FileMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function uploadTaskFile(taskId: string, file: File): Promise<FileMeta> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/api/v1/tasks/${taskId}/files`, { method: "POST", body: form });
}

export function deleteTaskFile(taskId: string, fileId: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/files/${fileId}`, { method: "DELETE" });
}

export async function downloadTaskFile(fileId: string, filename: string): Promise<void> {
  const blob = await apiFetchBlob(`/api/v1/files/${fileId}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
