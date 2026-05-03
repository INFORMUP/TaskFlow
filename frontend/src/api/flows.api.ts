import { apiFetch } from "@/api/client";

export interface FlowStats {
  openCount: number;
  assignedToMeCount: number;
}

export interface Flow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  stats: FlowStats;
}

export interface FlowStatus {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  color: string | null;
}

export async function listFlows(): Promise<Flow[]> {
  const res = await apiFetch<{ data: Flow[] }>("/api/v1/flows");
  return res.data;
}

export async function listFlowStatuses(flowId: string): Promise<FlowStatus[]> {
  const res = await apiFetch<{ data: FlowStatus[] }>(`/api/v1/flows/${flowId}/statuses`);
  return res.data;
}

export async function listFlowIcons(): Promise<string[]> {
  const res = await apiFetch<{ data: string[] }>("/api/v1/flow-icons");
  return res.data;
}

export async function updateFlowIcon(flowId: string, icon: string | null): Promise<Flow> {
  return apiFetch<Flow>(`/api/v1/flows/${flowId}`, {
    method: "PATCH",
    body: JSON.stringify({ icon }),
  });
}

export async function updateFlowStatusColor(
  flowId: string,
  statusId: string,
  color: string | null,
): Promise<FlowStatus> {
  return apiFetch<FlowStatus>(`/api/v1/flows/${flowId}/statuses/${statusId}`, {
    method: "PATCH",
    body: JSON.stringify({ color }),
  });
}
