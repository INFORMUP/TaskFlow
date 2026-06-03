import { apiFetch } from "./client";

export interface PolicySlot {
  id: string;
  policyId: string;
  ordinal: number;
  label: string;
  requiredActorType: string | null;
  requiredUserId: string | null;
}

export interface SignoffPolicy {
  id: string;
  orgId: string;
  projectId: string | null;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  slots: PolicySlot[];
}

export function listPolicies(projectId?: string): Promise<SignoffPolicy[]> {
  const qs = projectId ? `?projectId=${projectId}` : "";
  return apiFetch(`/api/v1/signoff-policies${qs}`);
}

export function createPolicy(body: {
  slug: string;
  name: string;
  description?: string;
  projectId?: string | null;
}): Promise<SignoffPolicy> {
  return apiFetch("/api/v1/signoff-policies", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deletePolicy(policyId: string): Promise<void> {
  return apiFetch(`/api/v1/signoff-policies/${policyId}`, { method: "DELETE" });
}

export function addPolicySlot(
  policyId: string,
  body: { label: string; requiredActorType?: string | null; requiredUserId?: string | null; ordinal?: number }
): Promise<PolicySlot> {
  return apiFetch(`/api/v1/signoff-policies/${policyId}/slots`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deletePolicySlot(policyId: string, slotId: string): Promise<void> {
  return apiFetch(`/api/v1/signoff-policies/${policyId}/slots/${slotId}`, { method: "DELETE" });
}

export function setTaskDefaultPolicy(taskId: string, policyId: string | null): Promise<void> {
  return apiFetch(`/api/v1/signoff-policies/defaults/tasks/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ policyId }),
  });
}

export function setProjectDefaultPolicy(projectId: string, policyId: string | null): Promise<void> {
  return apiFetch(`/api/v1/signoff-policies/defaults/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify({ policyId }),
  });
}

export function updatePolicy(
  policyId: string,
  body: { name?: string; description?: string }
): Promise<SignoffPolicy> {
  return apiFetch(`/api/v1/signoff-policies/${policyId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
