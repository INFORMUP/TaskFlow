import { apiFetch } from "./client";

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export async function listSavedViews(): Promise<SavedView[]> {
  const res = await apiFetch<{ data: SavedView[] }>("/api/v1/saved-views");
  return res.data;
}

export function createSavedView(name: string, filters: Record<string, string>): Promise<SavedView> {
  return apiFetch<SavedView>("/api/v1/saved-views", {
    method: "POST",
    body: JSON.stringify({ name, filters }),
  });
}

export function updateSavedView(
  id: string,
  patch: { name?: string; filters?: Record<string, string> },
): Promise<SavedView> {
  return apiFetch<SavedView>(`/api/v1/saved-views/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteSavedView(id: string): Promise<void> {
  return apiFetch(`/api/v1/saved-views/${id}`, { method: "DELETE" });
}
