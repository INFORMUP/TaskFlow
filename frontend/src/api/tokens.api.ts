import { apiFetch } from "./client";

export interface Scope {
  key: string;
  description: string;
}

export interface TokenSummary {
  id: string;
  name: string;
  integration: boolean;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedToken {
  id: string;
  name: string;
  token: string;
  integration: boolean;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}

export function listScopes(): Promise<{ data: Scope[] }> {
  return apiFetch("/api/v1/scopes");
}

export function listTokens(): Promise<{ data: TokenSummary[] }> {
  return apiFetch("/api/v1/auth/tokens");
}

export function createToken(data: {
  name: string;
  scopes: string[];
  expiresAt?: string;
  integration?: boolean;
}): Promise<CreatedToken> {
  return apiFetch("/api/v1/auth/tokens", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function revokeToken(id: string): Promise<void> {
  return apiFetch(`/api/v1/auth/tokens/${id}`, { method: "DELETE" });
}
