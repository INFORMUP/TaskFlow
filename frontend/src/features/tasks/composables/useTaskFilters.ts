import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

export interface TaskFilters {
  projectId: string;
  projectOwnerUserId: string;
  status: string;
  priority: string;
  assigneeUserId: string; // "" | "me" | <uuid>
  dueAfter: string;
  dueBefore: string;
  q: string;
  view: "board" | "list";
}

const FILTER_KEYS: (keyof TaskFilters)[] = [
  "projectId",
  "projectOwnerUserId",
  "status",
  "priority",
  "assigneeUserId",
  "dueAfter",
  "dueBefore",
  "q",
  "view",
];

function asString(v: unknown): string {
  if (Array.isArray(v)) return (v[0] as string) ?? "";
  return typeof v === "string" ? v : "";
}

export function useTaskFilters() {
  const route = useRoute();
  const router = useRouter();

  const filters = computed<TaskFilters>(() => ({
    projectId: asString(route.query.projectId),
    projectOwnerUserId: asString(route.query.projectOwnerUserId),
    status: asString(route.query.status),
    priority: asString(route.query.priority),
    assigneeUserId: asString(route.query.assigneeUserId),
    dueAfter: asString(route.query.dueAfter),
    dueBefore: asString(route.query.dueBefore),
    q: asString(route.query.q),
    view: (asString(route.query.view) === "list" ? "list" : "board"),
  }));

  function setFilters(patch: Partial<TaskFilters>) {
    const next: Record<string, string | undefined> = { ...route.query };
    for (const key of FILTER_KEYS) {
      if (key in patch) {
        const v = patch[key];
        next[key] = v ? String(v) : undefined;
      }
    }
    router.replace({ query: cleanQuery(next) });
  }

  function resetFilters() {
    const next: Record<string, string | undefined> = { ...route.query };
    for (const key of FILTER_KEYS) if (key !== "view") next[key] = undefined;
    router.replace({ query: cleanQuery(next) });
  }

  return { filters, setFilters, resetFilters };
}

function cleanQuery(q: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** Convert filters into the query params the task list endpoint understands. */
export function toApiParams(f: TaskFilters, extras: Record<string, string> = {}): Record<string, string> {
  const params: Record<string, string> = { ...extras };
  if (f.projectId) params.projectId = f.projectId;
  if (f.projectOwnerUserId) params.projectOwnerUserId = f.projectOwnerUserId;
  if (f.status) params.status = f.status;
  if (f.priority) params.priority = f.priority;
  if (f.assigneeUserId) params.assigneeUserId = f.assigneeUserId;
  if (f.dueAfter) params.dueAfter = f.dueAfter;
  if (f.dueBefore) params.dueBefore = f.dueBefore;
  if (f.q) params.q = f.q;
  return params;
}
