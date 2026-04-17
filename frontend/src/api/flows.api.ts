import { apiFetch } from "@/api/client";

export interface Flow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export async function listFlows(): Promise<Flow[]> {
  const res = await apiFetch<{ data: Flow[] }>("/api/v1/flows");
  return res.data;
}
