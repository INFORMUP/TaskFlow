import { apiFetch } from "./client";

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
  createdAt: string;
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
