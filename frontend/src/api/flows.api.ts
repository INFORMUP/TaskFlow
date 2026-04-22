import { apiFetch } from "@/api/client";

export interface Flow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface FlowStatus {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export async function listFlows(): Promise<Flow[]> {
  const res = await apiFetch<{ data: Flow[] }>("/api/v1/flows");
  return res.data;
}

export async function listFlowStatuses(flowId: string): Promise<FlowStatus[]> {
  const res = await apiFetch<{ data: FlowStatus[] }>(`/api/v1/flows/${flowId}/statuses`);
  return res.data;
}
