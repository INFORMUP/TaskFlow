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

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  invitedById: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
  revokedById: string | null;
}

export interface InvitationWithToken extends Invitation {
  token: string;
}

export function listInvitations(orgId: string): Promise<{ data: Invitation[] }> {
  return apiFetch(`/api/v1/organizations/${orgId}/invitations`);
}

export function createInvitation(
  orgId: string,
  body: { email: string; role: OrgRole },
): Promise<InvitationWithToken> {
  return apiFetch(`/api/v1/organizations/${orgId}/invitations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function resendInvitation(
  orgId: string,
  inviteId: string,
): Promise<InvitationWithToken> {
  return apiFetch(
    `/api/v1/organizations/${orgId}/invitations/${inviteId}/resend`,
    { method: "POST" },
  );
}

export function revokeInvitation(
  orgId: string,
  inviteId: string,
): Promise<void> {
  return apiFetch(`/api/v1/organizations/${orgId}/invitations/${inviteId}`, {
    method: "DELETE",
  });
}

export function acceptInvitation(token: string): Promise<Invitation> {
  return apiFetch(`/api/v1/invitations/accept`, {
    method: "POST",
    body: JSON.stringify({ token }),
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
