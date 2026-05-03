import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere } from "./permission.service.js";

export const MIN_QUERY_LENGTH = 2;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 25;
const HEADLINE_OPTS = "StartSel=<mark>,StopSel=</mark>,MaxWords=20,MinWords=5";
const DISPLAY_ID_RE = /^[A-Z]+-\d+$/;

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

// Tokenize and convert to a Postgres tsquery with prefix matching for type-ahead.
// Strips every non-alphanumeric character — the resulting tokens are safe to
// concatenate into a tsquery because they contain only [a-zA-Z0-9].
export function buildTsQuery(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

interface TaskFtsRow {
  id: string;
  display_id: string;
  title: string;
  snippet: string;
  rank: number;
  created_at: Date;
  flow_slug: string;
  flow_name: string;
  status_slug: string;
  status_name: string;
}

interface ProjectFtsRow {
  id: string;
  key: string;
  name: string;
  snippet: string;
  rank: number;
  created_at: Date;
}

export interface GlobalSearchInput {
  orgId: string;
  userId: string;
  teamSlugs: string[];
  flowIdBySlug: Map<string, string>;
  q: string;
  limit?: number;
}

export async function globalSearch(input: GlobalSearchInput): Promise<SearchResults> {
  const q = input.q.trim();
  if (q.length < MIN_QUERY_LENGTH) return { tasks: [], projects: [] };

  const tsq = buildTsQuery(q);
  if (!tsq) return { tasks: [], projects: [] };

  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const candidateMultiplier = 4;
  const candidateLimit = limit * candidateMultiplier;

  const taskRows = await prisma.$queryRaw<TaskFtsRow[]>`
    SELECT t.id,
           t.display_id,
           t.title,
           ts_headline(
             'english',
             coalesce(t.title, '') || ' ' || coalesce(t.description, ''),
             to_tsquery('english', ${tsq}),
             ${HEADLINE_OPTS}
           ) AS snippet,
           ts_rank(t.search_vector, to_tsquery('english', ${tsq})) AS rank,
           t.created_at,
           f.slug AS flow_slug,
           f.name AS flow_name,
           s.slug AS status_slug,
           s.name AS status_name
    FROM tasks t
    JOIN flows f ON f.id = t.flow_id
    JOIN flow_statuses s ON s.id = t.current_status_id
    WHERE f.org_id = ${input.orgId}::uuid
      AND t.is_deleted = false
      AND t.search_vector @@ to_tsquery('english', ${tsq})
    ORDER BY rank DESC, t.created_at DESC
    LIMIT ${candidateLimit}
  `;

  const projectRows = await prisma.$queryRaw<ProjectFtsRow[]>`
    SELECT p.id,
           p.key,
           p.name,
           ts_headline(
             'english',
             coalesce(p.name, '') || ' ' || coalesce(p.key, ''),
             to_tsquery('english', ${tsq}),
             ${HEADLINE_OPTS}
           ) AS snippet,
           ts_rank(p.search_vector, to_tsquery('english', ${tsq})) AS rank,
           p.created_at
    FROM projects p
    WHERE p.org_id = ${input.orgId}::uuid
      AND p.archived_at IS NULL
      AND p.search_vector @@ to_tsquery('english', ${tsq})
    ORDER BY rank DESC, p.created_at DESC
    LIMIT ${limit}
  `;

  // Permission-filter tasks through the same view-scope rule the list endpoint
  // uses. We fetch candidate IDs from FTS, then re-query with Prisma to apply
  // the team-scoped view filter.
  const candidateIds = taskRows.map((r) => r.id);
  let visibleTaskIds: Set<string> = new Set();
  if (candidateIds.length > 0) {
    const viewWhere = buildTaskViewWhere(input.teamSlugs, input.userId, input.flowIdBySlug);
    const visible = await prisma.task.findMany({
      where: { id: { in: candidateIds }, isDeleted: false, ...viewWhere },
      select: { id: true },
    });
    visibleTaskIds = new Set(visible.map((t) => t.id));
  }

  const tasks: SearchTaskResult[] = taskRows
    .filter((r) => visibleTaskIds.has(r.id))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      displayId: r.display_id,
      title: r.title,
      snippet: r.snippet,
      flow: { slug: r.flow_slug, name: r.flow_name },
      currentStatus: { slug: r.status_slug, name: r.status_name },
      createdAt: r.created_at.toISOString(),
    }));

  // If the query is exactly a display ID (e.g. "BUG-9"), the tsvector won't
  // match — `display_id` isn't in the indexed text. Look it up directly and
  // prepend so users can navigate to a task by its identifier.
  const upper = q.toUpperCase();
  if (DISPLAY_ID_RE.test(upper) && !tasks.some((t) => t.displayId === upper)) {
    const viewWhere = buildTaskViewWhere(input.teamSlugs, input.userId, input.flowIdBySlug);
    const exact = await prisma.task.findFirst({
      where: {
        displayId: upper,
        isDeleted: false,
        flow: { orgId: input.orgId },
        ...viewWhere,
      },
      include: {
        flow: { select: { slug: true, name: true } },
        currentStatus: { select: { slug: true, name: true } },
      },
    });
    if (exact) {
      tasks.unshift({
        id: exact.id,
        displayId: exact.displayId,
        title: exact.title,
        snippet: exact.title,
        flow: { slug: exact.flow.slug, name: exact.flow.name },
        currentStatus: { slug: exact.currentStatus.slug, name: exact.currentStatus.name },
        createdAt: exact.createdAt.toISOString(),
      });
      if (tasks.length > limit) tasks.length = limit;
    }
  }

  const projects: SearchProjectResult[] = projectRows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    snippet: r.snippet,
    createdAt: r.created_at.toISOString(),
  }));

  return { tasks, projects };
}
