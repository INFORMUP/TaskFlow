import { apiFetch } from "./client";

export interface SearchTaskResult {
  id: string;
  displayId: string;
  title: string;
  snippet: string;
  flow: { slug: string; name: string };
  currentStatus: { slug: string; name: string };
  createdAt: string;
}

export interface SearchProjectResult {
  id: string;
  key: string;
  name: string;
  snippet: string;
  createdAt: string;
}

export interface SearchResults {
  tasks: SearchTaskResult[];
  projects: SearchProjectResult[];
}

export function globalSearch(
  q: string,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<SearchResults> {
  const params = new URLSearchParams({ q });
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  return apiFetch(`/api/v1/search?${params.toString()}`, { signal: options.signal });
}
