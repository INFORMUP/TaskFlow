import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

export interface TaskFilters {
  projectId: string;
  projectOwnerUserId: string;
  status: string[];
  priority: string;
  assigneeUserId: string; // "" | "me" | <uuid>
  dueAfter: string;
  dueBefore: string;
  q: string;
  labelIds: string[];
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
  "labelIds",
  "view",
];

function asString(v: unknown): string {
  if (Array.isArray(v)) return (v[0] as string) ?? "";
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (typeof v === "string") return v ? v.split(",").filter(Boolean) : [];
  return [];
}

type QueryValue = string | string[] | undefined;

export function useTaskFilters() {
  const route = useRoute();
  const router = useRouter();

  const filters = computed<TaskFilters>(() => ({
    projectId: asString(route.query.projectId),
    projectOwnerUserId: asString(route.query.projectOwnerUserId),
    status: asStringArray(route.query.status),
    priority: asString(route.query.priority),
    assigneeUserId: asString(route.query.assigneeUserId),
    dueAfter: asString(route.query.dueAfter),
    dueBefore: asString(route.query.dueBefore),
    q: asString(route.query.q),
    labelIds: asStringArray(route.query.label),
    view: (asString(route.query.view) === "list" ? "list" : "board"),
  }));

  function setFilters(patch: Partial<TaskFilters>) {
    const next: Record<string, QueryValue> = { ...(route.query as Record<string, QueryValue>) };
    for (const key of FILTER_KEYS) {
      if (key in patch) {
        const v = patch[key];
        if (key === "labelIds") {
          const arr = (v as string[] | undefined) ?? [];
          next.label = arr.length > 0 ? arr : undefined;
        } else if (key === "status") {
          const arr = (v as string[] | undefined) ?? [];
          next.status = arr.length > 0 ? arr : undefined;
        } else {
          next[key] = v ? String(v) : undefined;
        }
      }
    }
    router.replace({ query: cleanQuery(next) });
  }

  function resetFilters() {
    const next: Record<string, QueryValue> = { ...(route.query as Record<string, QueryValue>) };
    for (const key of FILTER_KEYS) {
      if (key === "view") continue;
      if (key === "labelIds") {
        next.label = undefined;
      } else {
        next[key] = undefined;
      }
    }
    router.replace({ query: cleanQuery(next) });
  }

  return { filters, setFilters, resetFilters };
}

function cleanQuery(q: Record<string, QueryValue>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      const filtered = v.filter((x) => x !== "");
      if (filtered.length > 0) out[k] = filtered;
    } else if (v !== "") {
      out[k] = v;
    }
  }
  return out;
}

/** Convert filters into the query params the task list endpoint understands. */
export function toApiParams(
  f: TaskFilters,
  extras: Record<string, string> = {},
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = { ...extras };
  if (f.projectId) params.projectId = f.projectId;
  if (f.projectOwnerUserId) params.projectOwnerUserId = f.projectOwnerUserId;
  if (f.status.length > 0) params.status = f.status;
  if (f.priority) params.priority = f.priority;
  if (f.assigneeUserId) params.assigneeUserId = f.assigneeUserId;
  if (f.dueAfter) params.dueAfter = f.dueAfter;
  if (f.dueBefore) params.dueBefore = f.dueBefore;
  if (f.q) params.q = f.q;
  if (f.labelIds && f.labelIds.length > 0) params.label = f.labelIds.join(",");
  return params;
}
