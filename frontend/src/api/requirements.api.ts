import { apiFetch } from "./client";

export interface Attestation {
  id: string;
  actorId: string;
  actorType: string;
  verdict: string;
  evidence: string | null;
  createdAt: string;
}

export interface SignoffSlot {
  id: string;
  ordinal: number;
  label: string;
  requiredActorType: string | null;
  requiredUserId: string | null;
  attestations: Attestation[];
}

export interface QuorumResult {
  verified: boolean;
  signed: number;
  total: number;
  missing: string[];
  notDistinct: boolean;
}

export interface Requirement {
  id: string;
  parentId: string | null;
  number: string;
  ordinal: number;
  statement: string;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
  slots: SignoffSlot[];
  quorum: QuorumResult;
}

export function getRequirements(taskId: string): Promise<Requirement[]> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements`);
}

export function createRequirement(
  taskId: string,
  body: { statement: string; rationale?: string; parentId?: string | null; ordinal?: number }
): Promise<Requirement> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateRequirement(
  taskId: string,
  rid: string,
  body: { statement?: string; rationale?: string | null; ordinal?: number }
): Promise<Requirement> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements/${rid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteRequirement(taskId: string, rid: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements/${rid}`, {
    method: "DELETE",
  });
}

export function createSlot(
  taskId: string,
  rid: string,
  body: { label: string; ordinal?: number; requiredActorType?: string | null; requiredUserId?: string | null }
): Promise<SignoffSlot> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements/${rid}/slots`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteSlot(taskId: string, rid: string, sid: string): Promise<void> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements/${rid}/slots/${sid}`, {
    method: "DELETE",
  });
}

export function createAttestation(
  taskId: string,
  rid: string,
  sid: string,
  body: { verdict: "met" | "not_met"; evidence?: string }
): Promise<Attestation> {
  return apiFetch(`/api/v1/tasks/${taskId}/requirements/${rid}/slots/${sid}/attestations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
