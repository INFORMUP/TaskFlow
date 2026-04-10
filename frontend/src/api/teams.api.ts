import { apiFetch } from "@/api/client";

export interface Team {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export async function fetchTeams(): Promise<Team[]> {
  const res = await apiFetch<{ data: Team[] }>("/api/v1/teams");
  return res.data;
}
