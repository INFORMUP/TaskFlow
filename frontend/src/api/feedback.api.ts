import { apiFetch } from "./client";

export type FeedbackType = "BUG" | "FEATURE" | "IMPROVEMENT";

export type TaskLinkStatus =
  | "pending"
  | "linked"
  | "skipped_no_config"
  | "skipped_no_project"
  | "skipped_no_flow"
  | "failed_create"
  | "failed_link";

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
  taskLinkStatus: TaskLinkStatus;
  taskLinkError: string | null;
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
  taskLinkStatus?: TaskLinkStatus;
  page?: number;
  limit?: number;
} = {}): Promise<FeedbackListResponse> {
  const qs = new URLSearchParams();
  if (params.archived !== undefined) qs.set("archived", String(params.archived));
  if (params.taskLinkStatus) qs.set("taskLinkStatus", params.taskLinkStatus);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch(`/api/v1/feedback${q ? `?${q}` : ""}`);
}

export function retryFeedbackLink(id: string): Promise<Feedback> {
  return apiFetch(`/api/v1/feedback/${id}/retry-link`, { method: "POST" });
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
