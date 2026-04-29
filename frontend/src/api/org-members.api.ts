import { apiFetch } from "@/api/client";

export interface OrgMember {
  id: string;
  displayName: string;
  actorType: string;
}

export async function listOrgMembers(): Promise<OrgMember[]> {
  const res = await apiFetch<{ data: OrgMember[] }>("/api/v1/org-members");
  return res.data;
}
