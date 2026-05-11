import { apiFetch, apiFetchBlob } from "./client";

export type FeedbackType = "BUG" | "FEATURE" | "IMPROVEMENT";

export interface Feedback {
  id: string;
  orgId: string;
  userId: string;
  type: FeedbackType;
  message: string;
  page: string | null;
  adminNotes: string | null;
  archivedAt: string | null;
  taskId: string | null;
  task: { flow: { slug: string } } | null;
  createdAt: string;
}

export interface FeedbackWithUser extends Feedback {
  user: { displayName: string; email: string | null };
}

export interface FeedbackListResponse {
  data: FeedbackWithUser[];
  total: number;
  page: number;
  limit: number;
}

export function submitFeedback(payload: {
  type: FeedbackType;
  message: string;
  page: string;
}): Promise<Feedback> {
  return apiFetch("/api/v1/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listFeedback(params: {
  archived?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<FeedbackListResponse> {
  const qs = new URLSearchParams();
  if (params.archived !== undefined) qs.set("archived", String(params.archived));
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch(`/api/v1/feedback${q ? `?${q}` : ""}`);
}

export function updateFeedbackNotes(
  id: string,
  adminNotes: string,
): Promise<Feedback> {
  return apiFetch(`/api/v1/feedback/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ adminNotes }),
  });
}

export function archiveFeedback(id: string, archived: boolean): Promise<Feedback> {
  return apiFetch(`/api/v1/feedback/${id}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
}

export function exportFeedbackCsv(): Promise<Blob> {
  return apiFetchBlob("/api/v1/feedback/export");
}

export function promoteFeedback(
  id: string,
  projectId: string,
  flowSlug?: string,
): Promise<Feedback> {
  return apiFetch(`/api/v1/feedback/${id}/promote`, {
    method: "POST",
    body: JSON.stringify(flowSlug ? { projectId, flowSlug } : { projectId }),
  });
}
