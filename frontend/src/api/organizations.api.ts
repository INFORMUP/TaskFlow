import { apiFetch } from "./client";

export type OrgRole = "owner" | "admin" | "member";

export interface OrgMembership {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
}

export interface OrgMember {
  userId: string;
  displayName: string;
  email: string | null;
  role: OrgRole;
}

export interface OrgDetail extends OrgMembership {
  members: OrgMember[];
}

export function listOrganizations(): Promise<{ data: OrgMembership[] }> {
  return apiFetch("/api/v1/organizations");
}

export function createOrganization(body: {
  slug: string;
  name: string;
}): Promise<OrgMembership> {
  return apiFetch("/api/v1/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getOrganization(id: string): Promise<OrgDetail> {
  return apiFetch(`/api/v1/organizations/${id}`);
}

export function addMember(
  orgId: string,
  body: { email: string; role: OrgRole },
): Promise<OrgMember> {
  return apiFetch(`/api/v1/organizations/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgMember> {
  return apiFetch(`/api/v1/organizations/${orgId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(orgId: string, userId: string): Promise<void> {
  return apiFetch(`/api/v1/organizations/${orgId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function switchOrganization(orgId: string): Promise<string> {
  const res = await apiFetch<{ accessToken: string }>(
    "/api/v1/auth/switch-org",
    {
      method: "POST",
      body: JSON.stringify({ orgId }),
    },
  );
  localStorage.setItem("accessToken", res.accessToken);
  return res.accessToken;
}
