import { apiFetch } from "@/api/client";

export interface ProjectUser {
  id: string;
  displayName: string;
  actorType: string;
}

export interface ProjectFlow {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectTeam {
  id: string;
  slug: string;
  name: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  owner: ProjectUser;
  defaultAssignee: ProjectUser | null;
  defaultFlow: ProjectFlow | null;
  teams: ProjectTeam[];
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateProjectPayload {
  key: string;
  name: string;
  ownerUserId: string;
  defaultAssigneeUserId?: string | null;
  defaultFlowId?: string | null;
  teamIds: string[];
}

export interface UpdateProjectPayload {
  name?: string;
  ownerUserId?: string;
  defaultAssigneeUserId?: string | null;
  defaultFlowId?: string | null;
}

export async function listProjects(opts: { archived?: boolean } = {}): Promise<Project[]> {
  const qs = opts.archived ? "?archived=true" : "";
  const res = await apiFetch<{ data: Project[] }>(`/api/v1/projects${qs}`);
  return res.data;
}

export function getProject(id: string): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}`);
}

export function createProject(payload: CreateProjectPayload): Promise<Project> {
  return apiFetch("/api/v1/projects", { method: "POST", body: JSON.stringify(payload) });
}

export function updateProject(id: string, payload: UpdateProjectPayload): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function archiveProject(id: string): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}/archive`, { method: "POST" });
}

export function unarchiveProject(id: string): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}/archive`, { method: "DELETE" });
}

export function addProjectTeam(id: string, teamId: string): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}/teams`, {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}

export function removeProjectTeam(id: string, teamId: string): Promise<Project> {
  return apiFetch(`/api/v1/projects/${id}/teams/${teamId}`, { method: "DELETE" });
}

export interface AttachedFlow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}

export async function listProjectFlows(projectId: string): Promise<AttachedFlow[]> {
  const res = await apiFetch<{ data: AttachedFlow[] }>(`/api/v1/projects/${projectId}/flows`);
  return res.data;
}

export async function attachProjectFlow(projectId: string, flowId: string): Promise<AttachedFlow[]> {
  const res = await apiFetch<{ data: AttachedFlow[] }>(`/api/v1/projects/${projectId}/flows`, {
    method: "POST",
    body: JSON.stringify({ flowId }),
  });
  return res.data;
}

export async function detachProjectFlow(projectId: string, flowId: string): Promise<AttachedFlow[]> {
  const res = await apiFetch<{ data: AttachedFlow[] }>(`/api/v1/projects/${projectId}/flows/${flowId}`, {
    method: "DELETE",
  });
  return res.data;
}

export interface StatusDefault {
  flowStatusId: string;
  userId: string;
}

export async function listStatusDefaults(projectId: string): Promise<StatusDefault[]> {
  const res = await apiFetch<{ data: StatusDefault[] }>(
    `/api/v1/projects/${projectId}/status-defaults`,
  );
  return res.data;
}

export async function setStatusDefault(
  projectId: string,
  flowStatusId: string,
  userId: string,
): Promise<StatusDefault> {
  return apiFetch(`/api/v1/projects/${projectId}/status-defaults/${flowStatusId}`, {
    method: "PUT",
    body: JSON.stringify({ userId }),
  });
}

export async function clearStatusDefault(
  projectId: string,
  flowStatusId: string,
): Promise<void> {
  await apiFetch(`/api/v1/projects/${projectId}/status-defaults/${flowStatusId}`, {
    method: "DELETE",
  });
}

export type RepoProvider = "GITHUB";

export interface ProjectRepository {
  id: string;
  projectId: string;
  provider: RepoProvider;
  owner: string;
  name: string;
  createdAt: string;
}

export async function listProjectRepositories(
  projectId: string,
): Promise<ProjectRepository[]> {
  const res = await apiFetch<{ data: ProjectRepository[] }>(
    `/api/v1/projects/${projectId}/repositories`,
  );
  return res.data;
}

export function addProjectRepository(
  projectId: string,
  payload: { provider: RepoProvider; owner: string; name: string },
): Promise<ProjectRepository> {
  return apiFetch(`/api/v1/projects/${projectId}/repositories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeProjectRepository(
  projectId: string,
  repositoryId: string,
): Promise<void> {
  await apiFetch(`/api/v1/projects/${projectId}/repositories/${repositoryId}`, {
    method: "DELETE",
  });
}
