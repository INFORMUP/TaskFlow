import { apiFetch } from "./client";

export interface ActivityTaskRef {
  id: string;
  displayId: string;
  title: string;
  flow: { id: string; slug: string; name: string };
}

export interface ActivityStatusRef {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

export type ActivityEventType = "task_created" | "status_transition" | "comment";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  task: ActivityTaskRef;
  fromStatus?: ActivityStatusRef | null;
  toStatus?: ActivityStatusRef;
  commentId?: string;
  bodyPreview?: string;
}

export interface ActivityUserRef {
  id: string;
  displayName: string;
  actorType: string;
}

export interface ActivityPagination {
  cursor: string | null;
  hasMore: boolean;
}

export interface UserActivityResponse {
  user: ActivityUserRef;
  data: ActivityEvent[];
  pagination: ActivityPagination;
}

export interface ListUserActivityParams {
  projectId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export function listUserActivity(
  userId: string,
  params: ListUserActivityParams = {},
): Promise<UserActivityResponse> {
  return apiFetch(`/api/v1/users/${userId}/activity${buildQuery(params)}`);
}
